import { SH_MAX_PAGES, SH_MIN_CHARS, shChars, shPageText, type ShTextItem } from "@appuscholar/core";

/** What the shelf needs of a pdf.js document. */
export type PdfDoc = {
  numPages: number;
  getPage(k: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>;
  destroy?(): Promise<void> | void;
};
/** Opens a PDF's bytes. The browser's is pdf.js with its module worker (as lib/import/parse.ts loads it); tests pass pdf.js's Node build. */
export type ReadPdf = (data: Uint8Array) => Promise<PdfDoc>;

/** pdf.js could not be loaded (v1 11565: the CDN script had not loaded; here, the chunk did not arrive). The shelf says v1's sentence for it. */
export class PdfReaderUnavailable extends Error {
  constructor() { super("pdf-reader-unavailable"); }
}

/** pdf.js in the browser, its worker served from the package as the importer serves it. */
export const browserReadPdf: ReadPdf = async (data) => {
  let pdfjs: typeof import("pdfjs-dist");
  try { pdfjs = await import("pdfjs-dist"); } catch { throw new PdfReaderUnavailable(); }
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  return (await pdfjs.getDocument({ data }).promise) as unknown as PdfDoc;
};

async function readBuffer(file: Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(file);
  });
}

const textItems = (items: unknown[]): ShTextItem[] => items.filter((it): it is ShTextItem => typeof it === "object" && it !== null && "str" in it);

/**
 * v1's shExtractPdf (11564-11575) and the two refusals of shAddFiles around it (11585, 11590-11591): "not-a-pdf" for a name that does not end in .pdf (any case), "no-text" when
 * the pages kept hold fewer than 200 characters (a scanned PDF: nothing is added), else the first 200 pages' text, each page joined by core's shPageText, and the page count.
 * pdf.js errors are thrown as they are (v1 shows their message), PdfReaderUnavailable when pdf.js does not load.
 */
export async function extractPdfPages(file: File, readPdf: ReadPdf = browserReadPdf): Promise<{ pages: string[]; total: number } | "not-a-pdf" | "no-text"> {
  if (!/\.pdf$/i.test(file.name)) return "not-a-pdf";
  const pdf = await readPdf(new Uint8Array(await readBuffer(file)));
  try {
    const n = Math.min(pdf.numPages, SH_MAX_PAGES), pages: string[] = [];
    for (let k = 1; k <= n; k++) {
      const tc = await (await pdf.getPage(k)).getTextContent();
      pages.push(shPageText(textItems(tc.items)));
    }
    if (shChars(pages) < SH_MIN_CHARS) return "no-text";
    return { pages, total: pdf.numPages };
  } finally {
    try { await pdf.destroy?.(); } catch { /* the text is read */ }
  }
}
