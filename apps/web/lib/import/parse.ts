import { sanitizeHtml } from "@appuscholar/core";

export type ParsedImport = { title: string; html: string; isPdf: boolean; droppedImages: number };

/** A refusal whose message is meant for the student (shown as a toast as it is). */
export class ImportError extends Error {}

/** A picture whose data address is longer than this is removed on import (the server holds a document in 2 MB). */
export const MAX_IMAGE_DATA_CHARS = 30_000;
/** A document whose cleaned HTML is larger than this is refused; the server stops at 2 MB. */
export const MAX_IMPORT_BYTES = 1_800_000;
export const TOO_LARGE_MESSAGE = "This file is too large to import. Split it or remove pictures first.";
export const DOC_MESSAGE = "Save As .docx in Word first";
export const IMPORT_EXTENSIONS = ["docx", "doc", "pdf", "txt", "md", "html", "htm"] as const;
export const IMPORT_ACCEPT = ".docx,.pdf,.txt,.md,.html,.htm";

export function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}
/** True for the file kinds an import can read (and the legacy .doc, which is refused with advice). */
export function isImportable(file: File): boolean {
  return (IMPORT_EXTENSIONS as readonly string[]).includes(extensionOf(file.name));
}

function esc(s: string): string { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

/** Paragraphs on blank lines; text is escaped. A single line break stays a line break (`<br>`) or, for text laid out by a PDF, becomes a space. */
function textToHtml(text: string, lineBreak: "br" | "space"): string {
  return text.replace(/\r\n?/g, "\n").split(/\n[ \t]*\n+/)
    .map((p) => p.split("\n").map((l) => l.trim()).filter(Boolean).map(esc).join(lineBreak === "br" ? "<br>" : " "))
    .filter(Boolean).map((p) => `<p>${p}</p>`).join("");
}

function readBuffer(file: Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(file);
  });
}
function readText(file: Blob): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

async function pdfToHtml(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const task = pdfjs.getDocument({ data: new Uint8Array(await readBuffer(file)) });
  const pdf = await task.promise;
  try {
    const pages: string[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      let text = "";
      let lastY: number | null = null;
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const y = item.transform[5] as number;
        // A gap of more than one and a half lines between two lines of text is a paragraph break.
        if (lastY !== null && item.str && Math.abs(lastY - y) > (item.height || 10) * 1.6) text += "\n\n";
        text += item.str;
        if (item.str) lastY = y;
        if (item.hasEOL) text += "\n";
      }
      pages.push(text);
    }
    return textToHtml(pages.join("\n\n"), "space");
  } finally {
    await task.destroy();
  }
}

/** Removes pictures that are too big to keep, in place of each a one-line note. Returns the cleaned HTML and how many were removed. */
function dropHugePictures(html: string): { html: string; dropped: number } {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  let dropped = 0;
  for (const img of Array.from(doc.body.querySelectorAll("img"))) {
    if ((img.getAttribute("src") ?? "").length <= MAX_IMAGE_DATA_CHARS) continue;
    dropped++;
    const note = doc.createElement("p");
    note.textContent = "[picture removed on import: too large]";
    const host = img.parentElement;
    if (host && host.tagName === "P") {
      // A paragraph that held only the picture is replaced; otherwise the note follows the paragraph.
      img.remove();
      if (host.textContent?.trim() === "" && host.children.length === 0) host.replaceWith(note); else host.after(note);
    } else img.replaceWith(note);
  }
  return { html: doc.body.innerHTML, dropped };
}

/** Reads a file into editor HTML. The title is the file name without its extension. */
export async function parseImportFile(file: File): Promise<ParsedImport> {
  const ext = extensionOf(file.name);
  const title = file.name.replace(/\.[^.]*$/, "") || "Untitled";
  if (ext === "doc") throw new ImportError(DOC_MESSAGE);
  let raw: string;
  if (ext === "docx") {
    const mammoth = (await import("mammoth/mammoth.browser")).default;
    raw = (await mammoth.convertToHtml({ arrayBuffer: await readBuffer(file) }, { styleMap: ["p[style-name='Title'] => h1:fresh"] })).value;
  } else if (ext === "pdf") raw = await pdfToHtml(file);
  else if (ext === "txt" || ext === "md") raw = textToHtml(await readText(file), "br");
  else if (ext === "html" || ext === "htm") raw = await readText(file);
  else throw new ImportError(`Cannot import "${file.name}": use a .docx, .pdf, .txt, .md or .html file.`);
  const { html, dropped } = dropHugePictures(sanitizeHtml(raw));
  if (new TextEncoder().encode(html).length > MAX_IMPORT_BYTES) throw new ImportError(TOO_LARGE_MESSAGE);
  return { title, html, isPdf: ext === "pdf", droppedImages: dropped };
}
