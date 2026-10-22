import { browserReadPdf, type ReadPdf } from "@/lib/shelf/extract";
import { STYLE_MAX_PDF_PAGES } from "./limits";

/*
 * v1's readFileText (index.html:6985-7013): the text of a file chosen for "Learn from my files". A PDF is read to its first 80 pages, each page's
 * items joined by a space and ending in a line break; a Word .docx through mammoth's raw text; the old .doc is refused; any other kind is read as
 * text. mammoth and pdf.js are loaded when the first file of their kind is read (dynamic import), never with the page. The text is returned to the
 * caller and goes nowhere else: the sample keeps its features only.
 */

export type StyleReaders = {
  /** pdf.js; a test passes its Node build. */
  readPdf?: ReadPdf;
  /** mammoth's extractRawText value; a test passes a fake. */
  readDocx?: (buffer: ArrayBuffer) => Promise<string>;
};

function readBuffer(file: Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsArrayBuffer(file);
  });
}
function readText(file: Blob): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsText(file);
  });
}

async function browserReadDocx(buffer: ArrayBuffer): Promise<string> {
  const mammoth = (await import("mammoth/mammoth.browser")).default;
  const out = await mammoth.extractRawText({ arrayBuffer: buffer });
  return out.value || "";
}

export async function readStyleFile(f: File, readers: StyleReaders = {}): Promise<string> {
  const name = (f.name || "").toLowerCase();
  if (name.endsWith(".pdf")) {
    const pdf = await (readers.readPdf ?? browserReadPdf)(new Uint8Array(await readBuffer(f)));
    try {
      let out = "";
      const n = Math.min(pdf.numPages, STYLE_MAX_PDF_PAGES);
      for (let p = 1; p <= n; p++) {
        const tc = await (await pdf.getPage(p)).getTextContent();
        // Marked-content items carry no text; v1 joined their empty string too, and white space is made single before anything is measured.
        out += tc.items.filter((it): it is { str: string } => typeof it === "object" && it !== null && typeof (it as { str?: unknown }).str === "string").map((it) => it.str).join(" ") + "\n";
      }
      return out;
    } finally {
      try { await pdf.destroy?.(); } catch { /* the text is read */ }
    }
  }
  if (name.endsWith(".docx")) return (readers.readDocx ?? browserReadDocx)(await readBuffer(f));
  if (name.endsWith(".doc")) throw new Error(`Old .doc "${f.name}": save it as .docx in Word first`);
  return readText(f);
}
