import { describe, expect, it, vi } from "vitest";
import { extractPdfPages, PdfReaderUnavailable, type PdfDoc, type ReadPdf } from "../lib/shelf/extract";

/*
 * The Reading shelf's extraction (v1 shExtractPdf 11564-11575 and shAddFiles' refusals 11585, 11590-11591) with pdf.js itself: pdf.js's Node build reads two PDFs written here byte by
 * byte, one with a text layer and one drawn with no text object (a "scanned" page), through the injectable reader. The browser's reader (pdf.js with its module worker, as
 * lib/import/parse.ts loads it) is the e2e's to cover (Task 16).
 */

/** A one-page PDF with `content` as its page's content stream, xref offsets counted. */
function pdfBytes(content: string): Uint8Array {
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((n) => String(n).padStart(10, "0") + " 00000 n \n").join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
const LINES = [
  "Sleep and memory in university students",
  "Abstract. Sleeping well improves memory consolidation in adolescents and young adults.",
  "We tested one hundred and twenty students across two schools over one term.",
  "Results showed that sleep duration predicted recall the next morning."
];
const TEXT_PDF = pdfBytes("BT /F1 12 Tf 72 720 Td " + LINES.map((l, i) => (i ? "0 -16 Td " : "") + `(${l}) Tj`).join(" ") + " ET");
const SCANNED_PDF = pdfBytes("0.5 g 72 72 468 648 re f");
const file = (bytes: Uint8Array | string, name: string) => new File([bytes as BlobPart], name);

/** pdf.js's Node build (the legacy build, as pdf.js asks for in Node), quiet. */
const nodeReadPdf: ReadPdf = async (data) => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return (await pdfjs.getDocument({ data, verbosity: 0 }).promise) as unknown as PdfDoc;
};

describe("extractPdfPages with pdf.js", () => {
  it("reads a PDF's text layer: its lines joined as shExtractPdf joins them, and its page count", async () => {
    const r = await extractPdfPages(file(TEXT_PDF, "paper.pdf"), nodeReadPdf);
    expect(r).toEqual({ pages: [LINES.join("\n")], total: 1 });
  });
  it("a PDF with no text object is 'no-text' (fewer than 200 characters: it looks scanned), and nothing is logged as an error", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await extractPdfPages(file(SCANNED_PDF, "scan.PDF"), nodeReadPdf)).toBe("no-text");
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });
  it("a name that does not end in .pdf is 'not-a-pdf', unread", async () => {
    const readPdf = vi.fn(nodeReadPdf);
    expect(await extractPdfPages(file(TEXT_PDF, "paper.docx"), readPdf)).toBe("not-a-pdf");
    expect(readPdf).not.toHaveBeenCalled();
  });
  it("bytes that are not a PDF throw pdf.js's error (v1 shows its message)", async () => {
    await expect(extractPdfPages(file("not a pdf at all", "broken.pdf"), nodeReadPdf)).rejects.toThrow(/./);
  });
});

describe("extractPdfPages' rules, with a stand-in document", () => {
  const doc = (n: number, pageText: (k: number) => unknown[], destroy = vi.fn()): PdfDoc & { getPage: ReturnType<typeof vi.fn>; destroy: typeof destroy } => ({
    numPages: n,
    getPage: vi.fn(async (k: number) => ({ getTextContent: async () => ({ items: pageText(k) }) })),
    destroy
  });
  it("keeps the first 200 pages of a longer PDF and reports its page count; the document is released", async () => {
    const d = doc(205, (k) => [{ str: `Page ${k} has some words on it`, hasEOL: false }]);
    const r = await extractPdfPages(file("x", "long.pdf"), async () => d);
    expect(r).toMatchObject({ total: 205 });
    expect((r as { pages: string[] }).pages).toHaveLength(200);
    expect((r as { pages: string[] }).pages[199]).toBe("Page 200 has some words on it");
    expect(d.getPage).toHaveBeenCalledTimes(200);
    expect(d.destroy).toHaveBeenCalledTimes(1);
  });
  it("199 characters is 'no-text', 200 is read; marked-content items (no str) are skipped", async () => {
    expect(await extractPdfPages(file("x", "a.pdf"), async () => doc(1, () => [{ str: "x".repeat(199) }]))).toBe("no-text");
    expect(await extractPdfPages(file("x", "a.pdf"), async () => doc(1, () => [{ type: "beginMarkedContent" }, { str: "x".repeat(200) }, { type: "endMarkedContent" }]))).toEqual({ pages: ["x".repeat(200)], total: 1 });
  });
  it("a reader that cannot load says so as PdfReaderUnavailable", async () => {
    await expect(extractPdfPages(file("x", "a.pdf"), async () => { throw new PdfReaderUnavailable(); })).rejects.toBeInstanceOf(PdfReaderUnavailable);
  });
});
