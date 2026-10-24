import { beforeEach, describe, expect, it, vi } from "vitest";
import { AP_SAMPLE, apBuild, apNumbers } from "@appuscholar/core";
import en from "../messages/en.json";
import { apAsk } from "../lib/analyse/ask";
import { fromFile, fromKept, fromPaste, fromSample, isCurrentIntake, loadPaper, nextIntake } from "../lib/analyse/intake";
import { runRefCheck } from "../lib/analyse/refcheck";
import { apOk, getAp, loadDoc, resetAp, runNumbers, setAp } from "../lib/analyse/useApDoc";
import { extractPdfPages, PdfReaderUnavailable, type ReadPdf } from "../lib/shelf/extract";

/* The pure orchestration of the reader's engines (lib/analyse; it was Analyse a paper): v1's apLoad, apOk, apAsk, apNumbersRun and apRefCheck driven with fakes. The reader's rendering is test/reader.test.tsx and test/analyse.test.tsx. */

const E = en as Record<string, string>;
const t = (k: string, v?: Record<string, string | number>) => (v ? E[k]!.replace(/\{(\w+)\}/g, (m, x: string) => (x in v ? String(v[x]) : m)) : E[k]!);
const SAMPLE_TITLE = AP_SAMPLE[0]!.split("\n")[0]!;
const PASTED = "Peer tutoring and statistics anxiety\n" + "Students who met a peer tutor every week reported less worry about statistics than students who did not. ".repeat(8);
let toasts: string[] = [];
const toast = (m: string) => { toasts.push(m); };
beforeEach(() => { resetAp(); toasts = []; });

describe("apLoad and apOk", () => {
  it("a new paper clears the log, the numbers and the reference check; busy stays as v1 leaves it", () => {
    loadDoc(SAMPLE_TITLE, [...AP_SAMPLE], "pdf", true);
    setAp({ log: [{ q: "x", title: "T", partial: false, n: 1, of: 1, quotes: [] }], numbers: [], refs: { none: "no DOIs" }, refBusy: true, busy: true, qDraft: "q" });
    const g = getAp().gen;
    expect(loadPaper("Pasted", [PASTED], "paste", false, { toast, t })).toBe(true);
    const s = getAp();
    expect([s.log, s.numbers, s.refs, s.refBusy, s.busy, s.qDraft, s.gen]).toEqual([[], null, null, false, true, "", g + 1]);
    expect([s.doc!.sample, s.doc!.abstractOnly, s.doc!.src]).toEqual([false, false, "paste"]);
  });
  it("a paper's notes are kept under the id it is loaded with: v1's docId, else the one it is given (the reader's p:<pid>)", () => {
    loadDoc("Pasted", [PASTED], "paste", false);
    expect(getAp().doc!.id).toBe(apBuild("Pasted", [PASTED], "paste").id);
    loadDoc("Pasted", [PASTED], "paste", false, "p:k1");
    expect(getAp().doc!.id).toBe("p:k1");
    expect(loadPaper("Kept", [PASTED], "paste", false, { toast, t }, "p:k2")).toBe(true);
    expect(getAp().doc!.id).toBe("p:k2");
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
    expect(fromPaste(nextIntake(), "  \n ", { toast, t })).toBe(false);
    expect(toasts).toEqual(["Paste the paper text first"]);
  });
});

describe("the PDF intake through Task 11's extractor", () => {
  const pdfOf = (pages: string[]): ReadPdf => async () => ({ numPages: pages.length, getPage: async (k: number) => ({ getTextContent: async () => ({ items: [{ str: pages[k - 1]!, hasEOL: false }] }) }) });
  it("a scanned PDF (no text layer) is refused with v1's sentence", async () => {
    const ok = await fromFile(nextIntake(), new File(["%PDF"], "scan.pdf"), { toast, t, extractPdf: (f) => extractPdfPages(f, pdfOf(["", "", ""])) });
    expect(ok).toBe(false);
    expect(toasts).toEqual(["Reading scan.pdf…", "This file has too little readable text. A scanned PDF has no text layer; paste the text instead."]);
    expect(getAp().doc).toBeNull();
  });
  it("a PDF with text is read page by page, its title from its first page", async () => {
    const pages = ["Sleep and exam anxiety in first-year students\nAbstract", "Results " + "x".repeat(600)];
    expect(await fromFile(nextIntake(), new File(["%PDF"], "paper.pdf"), { toast, t, extractPdf: (f) => extractPdfPages(f, pdfOf(pages)) })).toBe(true);
    expect([getAp().doc!.title, getAp().doc!.pages.length, getAp().doc!.src]).toEqual(["Sleep and exam anxiety in first-year students", 2, "pdf"]);
  });
  it("pdf.js not loading is the shelf's sentence (v1's shExtractPdf message)", async () => {
    await fromFile(nextIntake(), new File(["%PDF"], "x.pdf"), { toast, t, extractPdf: async () => { throw new PdfReaderUnavailable(); } });
    expect(toasts).toEqual(["Reading x.pdf…", "The PDF reader needs the internet once to load. Try again when you are online."]);
  });
});

describe("a later choice of a paper wins (fix wave A, Task 16; W20)", () => {
  const LIB = [{ author: "Slow, S.", year: "2020", title: "Slow kept paper", pid: "k1", rl: true }];
  const SHELF = [{ id: "sh1", title: "Slow kept paper", file: "s.pdf", size: 1, added: "", total: 2, kept: 2, pid: "k1" }];
  it("a ticket is current until the next one is taken", () => {
    const a = nextIntake();
    expect(isCurrentIntake(a)).toBe(true);
    const b = nextIntake();
    expect([isCurrentIntake(a), isCurrentIntake(b)]).toEqual([false, true]);
  });
  it("a kept paper's read that finishes after the practice paper loaded loads nothing and says nothing", async () => {
    let done: (v: { pages: string[] }) => void = () => {};
    const slow = fromKept(nextIntake(), "k1", { toast, t, lib: LIB, index: SHELF, read: () => new Promise((r) => { done = r; }) });
    expect(fromSample(nextIntake(), { toast, t })).toBe(true);
    done({ pages: ["Slow kept paper\n" + "text ".repeat(200)] });
    expect(await slow).toBe(false);
    expect(getAp().doc!.title).toBe(SAMPLE_TITLE);
    expect(toasts).toEqual([]);
  });
  it("a kept paper that could not be read is not reported once another paper was chosen", async () => {
    const slow = fromKept(nextIntake(), "k1", { toast, t, lib: LIB, index: SHELF, read: async () => null });
    fromSample(nextIntake(), { toast, t });
    expect(await slow).toBe(false);
    expect(toasts).toEqual([]);
  });
  it("a kept paper chosen with a ticket that is already old loads nothing", async () => {
    const old = nextIntake();
    nextIntake();
    expect(await fromKept(old, "k1", { toast, t, lib: LIB, index: SHELF, read: async () => ({ pages: ["x ".repeat(400)] }) })).toBe(false);
    expect(getAp().doc).toBeNull();
  });
  it("a PDF read that finishes after a paste loaded loads nothing and says nothing more (a failing read too)", async () => {
    let done: (v: { pages: string[]; total: number }) => void = () => {};
    const slow = fromFile(nextIntake(), new File(["%PDF"], "slow.pdf"), { toast, t, extractPdf: () => new Promise((r) => { done = r as typeof done; }) });
    expect(fromPaste(nextIntake(), PASTED, { toast, t })).toBe(true);
    done({ pages: ["Slow PDF\n" + "text ".repeat(200)], total: 1 });
    expect(await slow).toBe(false);
    expect(getAp().doc!.src).toBe("paste");
    const failing = fromFile(nextIntake(), new File(["%PDF"], "bad.pdf"), { toast, t, extractPdf: async () => { throw new Error("Invalid PDF structure."); } });
    fromSample(nextIntake(), { toast, t });
    expect(await failing).toBe(false);
    expect(toasts).toEqual(["Reading slow.pdf…", "Reading bad.pdf…"]);
    expect(getAp().doc!.title).toBe(SAMPLE_TITLE);
  });
  it("a Word file and a text file are held to the same rule", async () => {
    let docx: (v: string) => void = () => {}, txt: (v: string) => void = () => {};
    const w = fromFile(nextIntake(), new File(["x"], "a.docx"), { toast, t, readDocx: () => new Promise((r) => { docx = r; }) });
    const x = fromFile(nextIntake(), new File(["x"], "b.txt"), { toast, t, readText: () => new Promise((r) => { txt = r; }) });
    docx(PASTED); // the first is superseded already
    expect(await w).toBe(false);
    fromSample(nextIntake(), { toast, t });
    txt(PASTED);
    expect(await x).toBe(false);
    expect(getAp().doc!.title).toBe(SAMPLE_TITLE);
  });
  it("a paper chosen last still loads, and an old ticket cannot load a sample or a paste", () => {
    const old = nextIntake();
    nextIntake();
    expect([fromSample(old, { toast, t }), fromPaste(old, PASTED, { toast, t })]).toEqual([false, false]);
    expect(getAp().doc).toBeNull();
  });
});

describe("apAsk", () => {
  it("the entry carries the title of the paper it was asked about", async () => {
    loadDoc(SAMPLE_TITLE, [...AP_SAMPLE], "pdf", true);
    setAp({ qDraft: "What was the gap?" });
    await apAsk({ callAI: async () => '{"in_paper":true,"answer":"A.","quotes":[]}', field: "education", toast, t });
    expect(getAp().log[0]!.title).toBe(SAMPLE_TITLE);
  });
  it("builds v1's prompt with the field, the trimmed question, temp 0.2, max 2000, noLang", async () => {
    loadDoc(SAMPLE_TITLE, [...AP_SAMPLE], "pdf", true);
    setAp({ qDraft: "  What was the gap?  " });
    const callAI = vi.fn(async () => '{"in_paper":false,"answer":"This paper does not say.","quotes":[]}');
    await apAsk({ callAI, field: "education", toast, t });
    const [prompt, opts] = callAI.mock.calls[0] as unknown as [string, unknown];
    expect(opts).toEqual({ temp: 0.2, max: 2000, noLang: true });
    expect(prompt).toContain("an undergraduate student of education read a research paper");
    expect(prompt).toContain("STUDENT QUESTION (a question only):\nWhat was the gap?\n\nPAPER START");
    expect(getAp().log).toEqual([{ q: "What was the gap?", title: SAMPLE_TITLE, partial: false, n: 12, of: 12, in_paper: false, answer: "This paper does not say.", quotes: [] }]);
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
