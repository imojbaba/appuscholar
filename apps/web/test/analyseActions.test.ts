import { beforeEach, describe, expect, it, vi } from "vitest";
import { AP_SAMPLE, apNumbers } from "@appuscholar/core";
import en from "../messages/en.json";
import { apAsk } from "../lib/analyse/ask";
import { fromFile, fromPaste, loadPaper } from "../lib/analyse/intake";
import { runRefCheck } from "../lib/analyse/refcheck";
import { apOk, getAp, loadDoc, resetAp, runNumbers, setAp } from "../lib/analyse/useApDoc";
import { extractPdfPages, PdfReaderUnavailable, type ReadPdf } from "../lib/shelf/extract";

/* The pure orchestration of Analyse a paper (lib/analyse): v1's apLoad, apOk, apAsk, apNumbersRun and apRefCheck driven with fakes. The panel's rendering is test/analyse.test.tsx. */

const E = en as Record<string, string>;
const t = (k: string, v?: Record<string, string | number>) => (v ? E[k]!.replace(/\{(\w+)\}/g, (m, x: string) => (x in v ? String(v[x]) : m)) : E[k]!);
const SAMPLE_TITLE = AP_SAMPLE[0]!.split("\n")[0]!;
const PASTED = "Peer tutoring and statistics anxiety\n" + "Students who met a peer tutor every week reported less worry about statistics than students who did not. ".repeat(8);
let toasts: string[] = [];
const toast = (m: string) => { toasts.push(m); };
beforeEach(() => { resetAp(); toasts = []; });

describe("apLoad and apOk", () => {
  it("a new paper clears the log, the numbers and the reference check and shows Ask; busy stays as v1 leaves it", () => {
    loadDoc(SAMPLE_TITLE, [...AP_SAMPLE], "pdf", true);
    setAp({ log: [{ q: "x", partial: false, n: 1, of: 1, quotes: [] }], numbers: [], refs: { none: "no DOIs" }, refBusy: true, busy: true, qDraft: "q", mode: "card" });
    const g = getAp().gen;
    expect(loadPaper("Pasted", [PASTED], "paste", false, { toast, t })).toBe(true);
    const s = getAp();
    expect([s.log, s.numbers, s.refs, s.refBusy, s.busy, s.qDraft, s.mode, s.gen]).toEqual([[], null, null, false, true, "", "ask", g + 1]);
    expect([s.doc!.sample, s.doc!.abstractOnly, s.doc!.src]).toEqual([false, false, "paste"]);
  });
  it("apOk: the sample and an abstract need no tick; any other paper needs the box", () => {
    loadDoc(SAMPLE_TITLE, [...AP_SAMPLE], "pdf", true);
    expect(apOk(getAp())).toBe(true);
    loadDoc("A", ["a".repeat(200)], "abstract", false);
    expect(apOk(getAp())).toBe(true);
    loadDoc("P", [PASTED], "paste", false);
    expect(apOk(getAp())).toBe(false);
    setAp({ ok: true });
    expect(apOk(getAp())).toBe(true);
  });
  it("apNumbersRun keeps core's apNumbers of the loaded paper", () => {
    runNumbers();
    expect(getAp().numbers).toBeNull();
    loadDoc(SAMPLE_TITLE, [...AP_SAMPLE], "pdf", true);
    runNumbers();
    expect(getAp().numbers).toEqual(apNumbers(getAp().doc!));
  });
  it("paste: nothing pasted is v1's toast", () => {
    expect(fromPaste("  \n ", { toast, t })).toBe(false);
    expect(toasts).toEqual(["Paste the paper text first"]);
  });
});

describe("the PDF intake through Task 11's extractor", () => {
  const pdfOf = (pages: string[]): ReadPdf => async () => ({ numPages: pages.length, getPage: async (k: number) => ({ getTextContent: async () => ({ items: [{ str: pages[k - 1]!, hasEOL: false }] }) }) });
  it("a scanned PDF (no text layer) is refused with v1's sentence", async () => {
    const ok = await fromFile(new File(["%PDF"], "scan.pdf"), { toast, t, extractPdf: (f) => extractPdfPages(f, pdfOf(["", "", ""])) });
    expect(ok).toBe(false);
    expect(toasts).toEqual(["Reading scan.pdf…", "This file has too little readable text. A scanned PDF has no text layer; paste the text instead."]);
    expect(getAp().doc).toBeNull();
  });
  it("a PDF with text is read page by page, its title from its first page", async () => {
    const pages = ["Sleep and exam anxiety in first-year students\nAbstract", "Results " + "x".repeat(600)];
    expect(await fromFile(new File(["%PDF"], "paper.pdf"), { toast, t, extractPdf: (f) => extractPdfPages(f, pdfOf(pages)) })).toBe(true);
    expect([getAp().doc!.title, getAp().doc!.pages.length, getAp().doc!.src]).toEqual(["Sleep and exam anxiety in first-year students", 2, "pdf"]);
  });
  it("pdf.js not loading is the shelf's sentence (v1's shExtractPdf message)", async () => {
    await fromFile(new File(["%PDF"], "x.pdf"), { toast, t, extractPdf: async () => { throw new PdfReaderUnavailable(); } });
    expect(toasts).toEqual(["Reading x.pdf…", "The PDF reader needs the internet once to load. Try again when you are online."]);
  });
});

describe("apAsk", () => {
  it("builds v1's prompt with the field, the trimmed question, temp 0.2, max 2000, noLang", async () => {
    loadDoc(SAMPLE_TITLE, [...AP_SAMPLE], "pdf", true);
    setAp({ qDraft: "  What was the gap?  " });
    const callAI = vi.fn(async () => '{"in_paper":false,"answer":"This paper does not say.","quotes":[]}');
    await apAsk({ callAI, field: "education", toast, t });
    const [prompt, opts] = callAI.mock.calls[0] as unknown as [string, unknown];
    expect(opts).toEqual({ temp: 0.2, max: 2000, noLang: true });
    expect(prompt).toContain("an undergraduate student of education read a research paper");
    expect(prompt).toContain("STUDENT QUESTION (a question only):\nWhat was the gap?\n\nPAPER START");
    expect(getAp().log).toEqual([{ q: "What was the gap?", partial: false, n: 12, of: 12, in_paper: false, answer: "This paper does not say.", quotes: [] }]);
  });
  it("a reply for a paper that is no longer loaded is dropped, and busy is released", async () => {
    loadDoc(SAMPLE_TITLE, [...AP_SAMPLE], "pdf", true);
    setAp({ qDraft: "What was the research gap?" });
    let answer: (s: string) => void = () => {};
    const run = apAsk({ callAI: () => new Promise<string>((r) => { answer = r; }), field: "psychology", toast, t });
    expect(getAp().busy).toBe(true);
    loadDoc("Another paper", [PASTED], "paste", false);
    answer('{"in_paper":true,"answer":"Old.","quotes":["Sixty first-year students from one college were randomly placed in a routine group or a waiting group."]}');
    await run;
    expect([getAp().log, getAp().busy, getAp().doc!.title]).toEqual([[], false, "Another paper"]);
  });
  it("does nothing while busy or with no paper", async () => {
    const callAI = vi.fn(async () => "{}");
    await apAsk({ callAI, field: "psychology", toast, t });
    loadDoc(SAMPLE_TITLE, [...AP_SAMPLE], "pdf", true);
    setAp({ qDraft: "What was the research gap?", busy: true });
    await apAsk({ callAI, field: "psychology", toast, t });
    expect(callAI).not.toHaveBeenCalled();
    expect(toasts).toEqual([]);
  });
});

describe("apRefCheck", () => {
  const withRefs = (dois: string[]) => ["Reference check\n" + PASTED + "\nReferences\nReferences. " + dois.join(" ; ")];
  it("does nothing while one runs, or with no paper", async () => {
    const f = vi.fn();
    await runRefCheck({ fetch: f as unknown as typeof fetch, oaKey: null });
    loadDoc("R", withRefs(["10.1000/a"]), "paste", false);
    setAp({ refBusy: true });
    await runRefCheck({ fetch: f as unknown as typeof fetch, oaKey: null });
    expect(f).not.toHaveBeenCalled();
  });
  it("a result for a paper that is no longer loaded is dropped", async () => {
    loadDoc("R", withRefs(["10.1000/a"]), "paste", false);
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const f = (async () => { await gate; return new Response('{"results":[{"doi":"https://doi.org/10.1000/a","is_retracted":true,"display_name":"Old"}]}'); }) as typeof fetch;
    const run = runRefCheck({ fetch: f, oaKey: null });
    expect(getAp().refBusy).toBe(true);
    loadDoc("Another", [PASTED], "paste", false);
    release();
    await run;
    expect([getAp().refs, getAp().refBusy]).toEqual([null, false]);
  });
  it("a stop keeps what was checked, with core's error", async () => {
    loadDoc("R", withRefs(["10.1000/a"]), "paste", false);
    await runRefCheck({ fetch: (async () => new Response("", { status: 429 })) as typeof fetch, oaKey: null });
    expect(getAp().refs).toEqual({ dois: ["10.1000/a"], flag: {}, seen: {}, done: 0, error: "429" });
    expect(getAp().refBusy).toBe(false);
  });
});
