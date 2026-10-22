import { describe, expect, it, vi } from "vitest";
import { STYLE_MIN_WORDS, STYLE_SAMPLES_MAX, styleFeatures, stylePrompt, type StyleSample } from "@appuscholar/core";
import { STYLE_DOC_MIN_WORDS, STYLE_MAX_FILES, STYLE_MAX_FILE_BYTES, STYLE_MAX_PDF_PAGES } from "../lib/tools/style/limits";
import { readStyleFile } from "../lib/tools/style/read";
import { addSampleTo, learnFromDocument, learnFromFiles, pickOpenDocument, type LearnEnv, type LearnOutcome } from "../lib/tools/style/learn";
import { isPasteInput, runLiveCheck } from "../lib/tools/style/checks";
import { clearCurrentStyle, currentStylePrompt, currentStyleVocabNote, setCurrentStyle } from "../lib/tools/style/current";
import JSZip from "jszip";
import type { PdfDoc, ReadPdf } from "../lib/shelf/extract";

/*
 * My style's lib (Task D2): v1's limits named and held, the file readers, the two learn flows with their guards, the live check's guards, and the
 * module-level getter Continue, Improve and Extend read (ruling R3).
 */

/** A block of English of about `n` words, different for each `seed`, in sentences of ten to fourteen words. */
function prose(n: number, seed = 0): string {
  const words = ("method result student sleep memory reading evidence careful measure sample teacher classroom attention practice feedback pattern account " +
    "however because therefore although sometimes usually carefully important different between through without during another several general").split(" ");
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const w = words[(i * 7 + seed * 3 + (i >> 3)) % words.length]!;
    out.push(i % 12 === 0 ? w[0]!.toUpperCase() + w.slice(1) : w);
    if (i % 12 === 11) out[out.length - 1] += ".";
  }
  return out.join(" ") + ".";
}
const MARK = "zq-marker-9f3 hidden-sentence-about-tigers";

describe("v1's limits are named constants", () => {
  it("100 files, 25 MB each, 80 PDF pages, 80 words for the document", () => {
    expect(STYLE_MAX_FILES).toBe(100);
    expect(STYLE_MAX_FILE_BYTES).toBe(25 * 1024 * 1024);
    expect(STYLE_MAX_PDF_PAGES).toBe(80);
    expect(STYLE_DOC_MIN_WORDS).toBe(80);
    expect(STYLE_DOC_MIN_WORDS).toBe(STYLE_MIN_WORDS);
    expect(STYLE_SAMPLES_MAX).toBe(100);
  });
});

describe("readStyleFile (v1 readFileText 6985-7013)", () => {
  it("reads .txt, .md and any other kind as text, and refuses the old .doc", async () => {
    expect(await readStyleFile(new File(["plain words"], "a.txt"))).toBe("plain words");
    expect(await readStyleFile(new File(["# Heading"], "b.md"))).toBe("# Heading");
    expect(await readStyleFile(new File(["rtf-ish"], "c.rtf"))).toBe("rtf-ish");
    await expect(readStyleFile(new File(["x"], "old.doc"))).rejects.toThrow(/old\.doc/);
  });
  it("reads a .docx through mammoth's raw text, with the reader injectable", async () => {
    const readDocx = vi.fn(async () => "word text");
    expect(await readStyleFile(new File([new Uint8Array([1, 2, 3])], "Thesis.DOCX"), { readDocx })).toBe("word text");
    expect(readDocx).toHaveBeenCalledOnce();
  });
  it("reads a PDF's first 80 pages only, each page's items joined by a space, one line a page", async () => {
    const getPage = vi.fn(async (k: number) => ({ getTextContent: async () => ({ items: [{ str: `p${k}a` }, { str: `p${k}b` }, { notText: true }] }) }));
    const destroy = vi.fn();
    const readPdf: ReadPdf = async () => ({ numPages: 120, getPage, destroy } as unknown as PdfDoc);
    const text = await readStyleFile(new File([new Uint8Array([1])], "big.pdf"), { readPdf });
    expect(getPage).toHaveBeenCalledTimes(STYLE_MAX_PDF_PAGES);
    expect(text.startsWith("p1a p1b\np2a p2b\n")).toBe(true);
    expect(text.endsWith("p80a p80b\n")).toBe(true);
    expect(text).not.toContain("p81a");
    expect(destroy).toHaveBeenCalled();
  });
  it("a PDF with fewer pages is read to its end", async () => {
    const getPage = vi.fn(async () => ({ getTextContent: async () => ({ items: [{ str: "x" }] }) }));
    const readPdf: ReadPdf = async () => ({ numPages: 3, getPage } as unknown as PdfDoc);
    await readStyleFile(new File([new Uint8Array([1])], "s.pdf"), { readPdf });
    expect(getPage).toHaveBeenCalledTimes(3);
  });
});

/** A one-page PDF with `content` as its page's content stream, xref offsets counted (as shelfExtract.test.ts writes one). */
function pdfBytes(content: string): Uint8Array {
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((n) => String(n).padStart(10, "0") + " 00000 n \n").join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
async function docxBytes(paragraphs: string[]): Promise<Uint8Array> {
  const z = new JSZip();
  z.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  z.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  z.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`);
  return z.generateAsync({ type: "uint8array" });
}

describe("readStyleFile with the real readers", () => {
  it("pdf.js reads a text layer's lines into one line, joined by spaces", async () => {
    const lines = ["Sleep and memory in university students", "Results showed that sleep duration predicted recall."];
    const bytes = pdfBytes("BT /F1 12 Tf 72 720 Td " + lines.map((l, i) => (i ? "0 -16 Td " : "") + `(${l}) Tj`).join(" ") + " ET");
    const readPdf: ReadPdf = async (data) => (await (await import("pdfjs-dist/legacy/build/pdf.mjs")).getDocument({ data, verbosity: 0 }).promise) as unknown as PdfDoc;
    const text = await readStyleFile(new File([bytes as BlobPart], "paper.pdf"), { readPdf });
    expect(text.replace(/\s+/g, " ").trim()).toBe(lines.join(" "));
  });
  it("mammoth reads a .docx's paragraphs as raw text", async () => {
    const bytes = await docxBytes(["First paragraph of my own writing.", "Second paragraph, a little longer."]);
    const text = await readStyleFile(new File([bytes as BlobPart], "mine.docx"));
    expect(text).toContain("First paragraph of my own writing.");
    expect(text).toContain("Second paragraph, a little longer.");
  });
});

function sample(over: Partial<StyleSample> = {}): StyleSample {
  return { id: "s1", name: "a.txt", date: "2026-10-21", ...styleFeatures(prose(200)), ...over };
}

describe("addSampleTo (v1 styleAddSample + styleSamplesSet)", () => {
  it("adds a record of features only, and says refused for 79 words or a repeat, full at 100", () => {
    const r = addSampleTo([], "n.txt", prose(120), "id1", "2026-10-21");
    expect(r.status).toBe("added");
    expect(r.samples).toHaveLength(1);
    expect(Object.keys(r.samples[0]!).sort()).toEqual(["date", "fw", "id", "ls", "n", "name", "pu", "sc", "sm", "ssd", "vw", "wl"]);
    expect(addSampleTo([], "n.txt", prose(79), "id2", "2026-10-21")).toEqual({ status: "refused", samples: [] });
    expect(addSampleTo(r.samples, "n.txt", prose(120), "id3", "2026-10-21").status).toBe("refused");
    const full = Array.from({ length: 100 }, (_, i) => sample({ id: "s" + i, name: "f" + i }));
    const f = addSampleTo(full, "new.txt", prose(150), "idn", "2026-10-21");
    expect(f.status).toBe("full");
    expect(f.samples).toHaveLength(100);
    expect(f.samples.some((x) => x.id === "idn")).toBe(false);
  });
});

/** An env whose samples and calls are recorded, with every default a v1 student would have. */
function env(over: Partial<LearnEnv> = {}) {
  const calls: Array<{ prompt: string; temp: number; max: number }> = [];
  const log: { samples: StyleSample[]; profile: string[]; progress: unknown[] } = { samples: [], profile: [], progress: [] };
  let n = 0;
  const e: LearnEnv = {
    declared: true,
    addSample: (name, text) => {
      const r = addSampleTo(log.samples, name, text, "id" + ++n, "2026-10-21");
      log.samples = r.samples;
      return r;
    },
    saveProfile: (text) => { log.profile.push(text); },
    callAI: async (prompt, o) => { calls.push({ prompt, ...o }); return "- Plain tone.\n- Short sentences."; },
    readFile: async (f) => f.text(),
    alive: () => true,
    onProgress: (p) => { log.progress.push(p); },
    tick: async () => {},
    ...over
  };
  return { e, calls, log };
}
const kind = (o: LearnOutcome) => o.kind;

describe("learnFromDocument (v1 styleAnalyze 6977-6989)", () => {
  it("refuses fewer than 80 words, then an undeclared sample, with nothing added and no call", async () => {
    const a = env();
    expect(kind(await learnFromDocument(prose(60), a.e))).toBe("need-words");
    const b = env({ declared: false });
    expect(kind(await learnFromDocument(prose(120), b.e))).toBe("need-decl");
    expect(a.calls).toHaveLength(0);
    expect(b.calls).toHaveLength(0);
    expect(a.log.samples).toHaveLength(0);
    expect(b.log.samples).toHaveLength(0);
  });
  it("accepts exactly 80 words; adds 'Current document' as a sample; asks with v1's prompt, 0.3 and 600; saves the bullets and a measured line", async () => {
    const a = env();
    const text = prose(80);
    const out = await learnFromDocument("  " + text + "  ", a.e);
    expect(out).toMatchObject({ kind: "learned", files: 1 });
    expect(a.log.samples.map((x) => x.name)).toEqual(["Current document"]);
    expect(a.calls).toHaveLength(1);
    expect(a.calls[0]!.prompt.startsWith("Analyze the writing style of the text below.")).toBe(true);
    expect(a.calls[0]!.prompt.endsWith("\n\nTEXT:\n" + text.slice(0, 4000))).toBe(true);
    expect(a.calls[0]).toMatchObject({ temp: 0.3, max: 600 });
    expect(a.log.profile).toHaveLength(1);
    expect(a.log.profile[0]!.startsWith("- Plain tone.\n- Short sentences.\n- Measured from 1 sample (80 words):")).toBe(true);
  });
  it("keeps the sample when the AI fails, and says so (v1 adds the sample first)", async () => {
    const a = env({ callAI: async () => { throw new Error("The AI did not answer."); } });
    const out = await learnFromDocument(prose(100), a.e);
    expect(out).toEqual({ kind: "error", message: "The AI did not answer." });
    expect(a.log.samples).toHaveLength(1);
    expect(a.log.profile).toHaveLength(0);
  });
  it("stops quietly when the panel went away before the answer", async () => {
    let alive = true;
    const a = env({ alive: () => alive, callAI: async () => { alive = false; return "- x"; } });
    expect(kind(await learnFromDocument(prose(100), a.e))).toBe("stopped");
    expect(a.log.profile).toHaveLength(0);
  });
});

const files = (n: number, words = 100) => Array.from({ length: n }, (_, i) => new File([prose(words, i)], `f${i}.txt`));

describe("learnFromFiles (v1 styleAnalyzeFiles 7021-7051)", () => {
  it("does nothing for no files, and refuses an undeclared set before reading any", async () => {
    const a = env();
    expect(kind(await learnFromFiles([], a.e))).toBe("none");
    const read = vi.fn(async () => "x");
    const b = env({ declared: false, readFile: read });
    expect(kind(await learnFromFiles(files(2), b.e))).toBe("need-decl");
    expect(read).not.toHaveBeenCalled();
  });
  it("reads the first 100 files only, reporting 'Reading i of n: name' for each", async () => {
    const read = vi.fn(async () => prose(90));
    const a = env({ readFile: read });
    const out = await learnFromFiles(files(130, 90), a.e);
    expect(read).toHaveBeenCalledTimes(STYLE_MAX_FILES);
    expect(out).toMatchObject({ kind: "learned", files: 100 });
    const reading = a.log.progress.filter((p) => (p as { kind: string }).kind === "reading") as Array<{ i: number; n: number; name: string }>;
    expect(reading).toHaveLength(100);
    expect(reading[0]).toMatchObject({ i: 1, n: 100, name: "f0.txt" });
  });
  it("skips a file over 25 MB without reading it, and a file that cannot be read, and lists both", async () => {
    const big = new File(["x"], "huge.pdf");
    Object.defineProperty(big, "size", { value: STYLE_MAX_FILE_BYTES + 1 });
    const exactly = new File(["x"], "edge.txt");
    Object.defineProperty(exactly, "size", { value: STYLE_MAX_FILE_BYTES });
    const bad = new File(["x"], "broken.docx");
    const read = vi.fn(async (f: File) => { if (f.name === "broken.docx") throw new Error("bad zip"); return prose(100); });
    const a = env({ readFile: read });
    const out = await learnFromFiles([big, exactly, bad, ...files(1)], a.e);
    expect(out).toMatchObject({ kind: "learned", files: 2 });
    expect((out as Extract<LearnOutcome, { kind: "learned" }>).skipped).toEqual([{ name: "huge.pdf", why: "too-big" }, { name: "broken.docx", why: "unreadable" }]);
    expect(read.mock.calls.map((c) => c[0].name)).toEqual(["edge.txt", "broken.docx", "f0.txt"]);
  });
  it("with too little text it says nothing could be read, and sends nothing", async () => {
    const a = env({ readFile: async () => "just a few words here" });
    const out = await learnFromFiles(files(3), a.e);
    expect(out).toEqual({ kind: "nothing-read", skipped: [] });
    expect(a.calls).toHaveLength(0);
    expect(a.log.profile).toHaveLength(0);
  });
  it("sends v1's files prompt (0.3, 800) built from the files' text with white space made single", async () => {
    const a = env({ readFile: async () => "  " + prose(100).replace(/ /g, "  ") + "\n\n" });
    await learnFromFiles(files(2), a.e);
    expect(a.calls[0]!.prompt.startsWith("You are studying the writing style of ONE author")).toBe(true);
    expect(a.calls[0]!.prompt).toContain("\n\nSAMPLES:\n");
    expect(a.calls[0]).toMatchObject({ temp: 0.3, max: 800 });
    expect(a.calls[0]!.prompt).not.toMatch(/ {2}/);
  });
});

describe("the samples hold no text (rule: features only)", () => {
  it("neither learn path leaves the sample's words in any stored sample, the profile or a progress line", async () => {
    const secret = `${MARK} ${prose(100)}`;
    const a = env();
    await learnFromDocument(secret, a.e);
    const b = env({ readFile: async () => secret });
    await learnFromFiles(files(2), b.e);
    // The marker did reach the AI (so the check is not vacuous) and is in no stored value.
    expect(a.calls[0]!.prompt).toContain("zq-marker-9f3");
    expect(b.calls[0]!.prompt).toContain("zq-marker-9f3");
    for (const x of [a, b]) {
      const stored = JSON.stringify([x.log.samples, x.log.profile, x.log.progress]);
      expect(stored).not.toContain("zq-marker");
      expect(stored).not.toContain("tigers");
      // The long words are single words, at most 400, never a run of words.
      for (const s of x.log.samples) { expect(s.vw.length).toBeLessThanOrEqual(400); expect(s.vw.every((w) => !/\s/.test(w))).toBe(true); }
    }
  });
});

describe("the live check's guards (v1 styleLiveRun 6501-6516, styleLiveInput 6517-6520)", () => {
  const ref = [sample({ id: "a" }), sample({ id: "b", name: "b.txt" })];
  it("needs 60 words, then no paste, then a sample of 150 words, in that order", () => {
    expect(runLiveCheck(prose(59), false, ref).kind).toBe("few");
    expect(runLiveCheck(prose(60), true, ref).kind).toBe("pasted");
    expect(runLiveCheck(prose(60), false, [sample({ n: 149 })]).kind).toBe("no-samples");
    const r = runLiveCheck(prose(120), false, ref);
    expect(r.kind).toBe("result");
    if (r.kind === "result") { expect(r.result.total).toBe(4); expect(r.result.rows).toHaveLength(4); }
  });
  it("a pasted or dropped input is detected from its inputType", () => {
    expect(isPasteInput("insertFromPaste")).toBe(true);
    expect(isPasteInput("insertFromDrop")).toBe(true);
    expect(isPasteInput("insertFromYank")).toBe(true);
    expect(isPasteInput("insertText")).toBe(false);
    expect(isPasteInput(undefined)).toBe(false);
  });
});

describe("the module-level style getter (ruling R3)", () => {
  const level = { score: 5, k: "general", date: "2026-10-21" };
  it("has nothing until the layer sets it, carries the profile only when on, and clears for its project only", () => {
    clearCurrentStyle("p1");
    expect(currentStylePrompt()).toBeUndefined();
    setCurrentStyle({ projectId: "p1", profile: "- Warm tone.", on: false, level: null, samples: [] });
    expect(currentStylePrompt()).toBeUndefined();
    setCurrentStyle({ projectId: "p1", profile: "- Warm tone.", on: true, level, samples: [] });
    expect(currentStylePrompt()).toBe(stylePrompt("- Warm tone.", true, level));
    expect(currentStylePrompt()).toContain("STYLE NOTES");
    expect(currentStylePrompt()).toContain("VOCABULARY: ");
    clearCurrentStyle("other");
    expect(currentStylePrompt()).toBeDefined();
    clearCurrentStyle("p1");
    expect(currentStylePrompt()).toBeUndefined();
  });
  it("an empty profile gives no block, and the vocabulary note needs the style on and 150 known words", () => {
    setCurrentStyle({ projectId: "p1", profile: "", on: true, level: null, samples: [] });
    expect(currentStylePrompt()).toBeUndefined();
    const vw = Array.from({ length: 160 }, (_, i) => "knownword" + "abcdefghij"[i % 10] + "klmnopqrst"[(i >> 3) % 10] + "uvwxyzabcd"[(i >> 5) % 10]);
    const withWords = [sample({ vw })];
    setCurrentStyle({ projectId: "p1", profile: "x", on: true, level: null, samples: withWords });
    expect(currentStyleVocabNote("a plain text", "an extraordinarily sophisticated phrase")).toContain("Longer words that do not appear in your own writing: extraordinarily, sophisticated");
    setCurrentStyle({ projectId: "p1", profile: "x", on: false, level: null, samples: withWords });
    expect(currentStyleVocabNote("a plain text", "an extraordinarily sophisticated phrase")).toBe("");
    clearCurrentStyle("p1");
    expect(currentStyleVocabNote("a", "extraordinarily")).toBe("");
  });
});

describe("pickOpenDocument (a place's own window)", () => {
  const docs = [{ id: "a", text: "first" }, { id: "b", text: "second" }];
  it("picks the entry whose text is the mirror's, else the first, else nothing", () => {
    expect(pickOpenDocument(docs, "second")?.id).toBe("b");
    expect(pickOpenDocument(docs, "not there")?.id).toBe("a");
    expect(pickOpenDocument(docs, "")?.id).toBe("a");
    expect(pickOpenDocument([], "second")).toBeUndefined();
  });
});
