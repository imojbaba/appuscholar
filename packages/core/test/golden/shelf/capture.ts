import { readFileSync } from "node:fs";
import type { Engine } from "../harness/engines";
import { writeFixture } from "../harness/fixture";
import { FIELDS, promptRecorder, textOf } from "../harness/prompt-record";

type Paper = { id: string; title: string; pages: string[] };
type Item = { str: string; hasEOL?: boolean };
type Inputs = {
  papers: Paper[];
  queries: string[];
  sentences: string[];
  counts: Array<[string, string]>;
  snippets: Array<[string, string[], number]>;
  best: Array<[string, string[]]>;
  titles: Array<[string[], string]>;
  gate: string[];
  items: Item[][];
  quotes: Array<[string, string, string]>;
  marked: Array<[string, Array<{ page: number; quote: string }>]>;
  cols: Array<string | null>;
  colOps: Array<["add", string] | ["del", number]>;
  restore: string[];
};

/** What the extraction stand-in hands shExtractPdf for one file: its pages' items and its page count, or an error to throw. */
type PdfSpec = { pages?: Item[][]; numPages?: number; error?: string };
/** A file of shAddFiles' input: its name and size, and what pdf.js reads from it. */
type FileSpec = { name: string; size: number; pdf?: PdfSpec };

const plain = <T>(x: unknown): T => JSON.parse(JSON.stringify(x)) as T;
const line = (s: string): Item[] => s.split("\n").map((l, i, a) => ({ str: l, hasEOL: i < a.length - 1 }));
const pagesOf = (...texts: string[]): Item[][] => texts.map(line);

/** The files of shAddFiles' one batch: every per-file status sentence of 11583-11597 (not a PDF, already on the shelf, scanned, added, added with "first 200 of", and the two errors). */
const FILES: FileSpec[] = [
  { name: "notes.docx", size: 10 },
  { name: "dup.pdf", size: 100 },
  { name: "dup.pdf", size: 101, pdf: { pages: pagesOf("Duplicate name, another size\n" + "d".repeat(200)) } },
  { name: "scan.PDF", size: 20, pdf: { pages: pagesOf("x".repeat(99), "y".repeat(100)) } },
  { name: "edge.pdf", size: 30, pdf: { pages: pagesOf("e".repeat(200)) } },
  { name: "long.pdf", size: 40, pdf: { numPages: 205, pages: Array.from({ length: 205 }, (_, k) => line(`Page ${k + 1}: some text about sleep.`)) } },
  { name: "bad.pdf", size: 50, pdf: { error: "Invalid PDF structure." } },
  { name: "empty-error.pdf", size: 60, pdf: { error: "" } },
  { name: "Title Case.Pdf", size: 70, pdf: { pages: pagesOf("   \nA Study of Sleep in Students\n" + "t".repeat(190)) } },
  { name: "twice.pdf", size: 80, pdf: { pages: pagesOf("w".repeat(250)) } },
  { name: "twice.pdf", size: 80, pdf: { pages: pagesOf("w".repeat(250)) } },
];

/** shSummarise's text: emails, and the 12,000-character cut (12,000 joined is not cut, 12,001 is; an email replaced before the cut decides it, v1's order). */
const EMAIL = "first.last+tag@sub.example.co.uk"; // 32 characters; '[author email removed]' is 22
const SUMMARIES: Array<{ id: string; pages: string[]; mine: string }> = [
  { id: "emails", pages: ["Page one with a.author@uni.edu inside, and name@domain.c stays.", "Page two <x@y.org> and \"q@w.er\" and 'e@r.ty' and two@a.io,three@b.io; not an email @ here."], mine: "  My two lines about this paper\nsay that sleep helps memory in the students tested.  " },
  { id: "exactly-12000", pages: [textOf(5999, (i) => `Sentence ${i} of the first page.`), textOf(5999, (i) => `Sentence ${i} of the second page.`)], mine: "one two three four five six\nseven eight nine ten eleven twelve" },
  { id: "12001", pages: [textOf(6000, (i) => `Sentence ${i} of the first page.`), textOf(5999, (i) => `Sentence ${i} of the second page.`)], mine: "one two three four five six\nseven eight nine ten eleven twelve" },
  { id: "email-keeps-cut", pages: [EMAIL + " " + textOf(12010 - EMAIL.length - 1, (i) => `Filler ${i}.`)], mine: "one two three four five six\nseven eight nine ten eleven twelve" },
  { id: "email-avoids-cut", pages: [EMAIL + " " + textOf(12005 - EMAIL.length - 1, (i) => `Filler ${i}.`)], mine: "one two three four five six\nseven eight nine ten eleven twelve" },
];

/**
 * Task 11's Reading shelf (v1 index.html 11513-11725), run on hand-written inputs (inputs.json and the cases above):
 * - the engine functions called directly: shTerms, shCount, shSnippet, shBestSentence, shGuessTitle, shMineOk, shRank (both modes, limits 20 and 5, over inputs.json's four papers), shMarked, shCols;
 * - the entries driven as a student drives them, with the dialog open on its tab (SH.papers set, shRender): shSearchRun and shFindRun over every query and sentence (`search`, `find`: whether
 *   #shRes shows v1's AND-to-OR note, its sentence when nothing matched, and each card's HTML exactly as shResHTML returned it, recorded by wrapping shResHTML);
 *   shExtractPdf with pdfjsLib replaced by a stand-in that hands over the items of each case (`extract`); shAddFiles over one batch of FILES, with shAll, shPut and shRefresh replaced
 *   (IndexedDB is not in jsdom) and the shelf already holding dup.pdf of 100 bytes (`add`: the status line and the records stored, the id and the date checked against v1's shape and
 *   then left out); shSaveHL with window.getSelection replaced (`quotes`: the toast and the note stored); shSummarise through the prompt recorder for every field value
 *   (`summaries`: the callAI call, the note saved first and #shAi's text) and once with a reply that has white space at its ends (`trim`); shColAdd/shColDel in order from no stored
 *   columns (`colOps`: shCols() after each); shMatrixCsv with pdDownload replaced (`csv`); shBackup with URL.createObjectURL and the link's click replaced (`backup`); shRestore with a File
 *   per text (`restore`: the status line and the records stored).
 * Guards (each throws): the dialog's boxes exist; no jsdom error.
 */
export const shelf: Engine = {
  name: "shelf",
  async capture(v1, { check }) {
    const inputs = JSON.parse(readFileSync(new URL("./inputs.json", import.meta.url), "utf8")) as Inputs;
    const w = v1.window as unknown as Record<string, unknown>;
    const doc = v1.document;
    const errorsAtStart = v1.errors.length;
    const box = (id: string) => {
      const el = doc.getElementById(id);
      if (!el) throw new Error(`shelf: v1 has no #${id}`);
      return el;
    };
    const setPapers = (papers: unknown[]) => v1.eval("SH.papers=" + JSON.stringify(papers));
    const render = (tab: string) => { v1.eval(`SH.cur=null;SH.tab=${JSON.stringify(tab)}`); v1.call("shRender"); };

    const terms = [...inputs.queries, ...inputs.sentences].map((q) => ({ q, out: plain<string[]>(v1.call("shTerms", q)) }));
    const counts = inputs.counts.map(([text, term]) => ({ text, term, out: v1.call<number>("shCount", text, term) }));
    const snippets = inputs.snippets.map(([text, t, len]) => ({ text, terms: t, len, out: v1.call<string>("shSnippet", text, t, len) }));
    const best = inputs.best.map(([text, t]) => ({ text, terms: t, out: v1.call<string>("shBestSentence", text, t) }));
    const titles = inputs.titles.map(([pages, fallback]) => ({ pages, fallback, out: v1.call<string>("shGuessTitle", pages, fallback) }));
    const gate = inputs.gate.map((text) => ({ text, out: v1.call<boolean>("shMineOk", text) }));

    // shRank over the four papers, as shSearchRun (limit 20) and shFindRun (limit 5) call it.
    const papers = inputs.papers.map((p) => ({ ...p, notes: [], cells: {} }));
    setPapers(papers);
    const rank = [];
    for (const q of [...inputs.queries, ...inputs.sentences]) for (const mode of ["and", "or"]) for (const limit of [20, 5]) {
      const out = plain(v1.eval(`shRank(SH.papers,${JSON.stringify(q)},'${mode}',${limit}).map(x=>({id:x.p.id,page:x.page,text:x.text,score:x.score,hit:x.hit,terms:x.terms}))`));
      rank.push({ q, mode, limit, out });
    }

    // shSearchRun and shFindRun, with shResHTML wrapped so each card's HTML is recorded as v1 made it.
    const cards: Array<{ id: string; page: number; html: string }> = [];
    const resHTML = w.shResHTML as (r: { p: { id: string }; page: number }, extra?: string) => string;
    w.shResHTML = (r: { p: { id: string }; page: number }, extra?: string) => { const html = resHTML(r, extra); cards.push({ id: r.p.id, page: r.page, html }); return html; };
    const runBox = (entry: string, field: string, q: string) => {
      v1.setValue(field, q);
      cards.length = 0;
      v1.call(entry);
      const res = box("shRes");
      const got = cards.splice(0);
      return { q, note: res.innerHTML.includes("No page has every word, so these pages have some of them."), empty: got.length ? null : res.textContent, cards: got };
    };
    render("search");
    const search = inputs.queries.map((q) => runBox("shSearchRun", "shQ", q));
    render("find");
    const find = inputs.sentences.map((q) => runBox("shFindRun", "shSent", q));
    w.shResHTML = resHTML;

    // shExtractPdf with a stand-in pdfjsLib: the file's arrayBuffer() names the spec getDocument() opens next.
    let current: PdfSpec = {};
    w.pdfjsLib = {
      getDocument: () => ({
        promise: current.error !== undefined ? Promise.reject(new Error(current.error)) : Promise.resolve({
          numPages: current.numPages ?? current.pages!.length,
          getPage: async (k: number) => ({ getTextContent: async () => ({ items: current.pages![k - 1] ?? [] }) }),
        }),
      }),
    };
    const fileOf = (f: FileSpec) => ({ name: f.name, size: f.size, arrayBuffer: async () => { current = f.pdf ?? {}; return new ArrayBuffer(0); } });
    const extract = [];
    for (const items of inputs.items) extract.push({ items, out: plain(await v1.call<Promise<unknown>>("shExtractPdf", fileOf({ name: "x.pdf", size: 1, pdf: { pages: [items] } }))) });
    const many = { name: "many.pdf", size: 1, pdf: { numPages: 205, pages: Array.from({ length: 205 }, (_, k) => [{ str: `p${k + 1}`, hasEOL: false }]) } };
    const capped = plain<{ pages: string[]; total: number }>(await v1.call<Promise<unknown>>("shExtractPdf", fileOf(many)));
    extract.push({ items: "205 pages, one item p<k> each", out: { kept: capped.pages.length, last: capped.pages[capped.pages.length - 1], total: capped.total } });

    // shAddFiles over FILES, the shelf holding dup.pdf (100 bytes); IndexedDB replaced.
    const puts: unknown[] = [];
    w.shAll = async () => v1.eval('[{id:"p0",file:"dup.pdf",size:100,pages:[],notes:[],cells:{}}]');
    w.shPut = async (p: unknown) => { puts.push(plain(p)); };
    w.shRefresh = async () => {};
    render("papers");
    await v1.call<Promise<void>>("shAddFiles", { files: FILES.map(fileOf), value: "picked" });
    const records = (puts.splice(0) as Array<Record<string, unknown>>).map((r) => {
      const { id, added, ...rest } = r;
      return { idShape: /^p[0-9a-z]+$/.test(String(id)), addedIso: new Date(String(added)).toISOString() === added, ...rest };
    });
    const add = { files: FILES, status: v1.eval<string>("SH.status"), records };

    // shSaveHL with the selection replaced: anchored inside #shText.
    const quotes = [];
    for (const [pageText, selection, note] of inputs.quotes) {
      v1.eval("SH.cur=" + JSON.stringify({ id: "q", title: "Q", file: "q.pdf", pages: [pageText], notes: [], cells: {} }) + ";SH.page=1");
      v1.call("shRender");
      v1.setValue("shNote", note);
      const text = box("shText");
      w.getSelection = () => ({ toString: () => selection, anchorNode: text.firstChild ?? text });
      const toasts = v1.toasts.length;
      await v1.call<Promise<void>>("shSaveHL");
      const n = plain<Array<{ id: string; page: number; quote: string; note: string; at: string }>>(v1.eval("SH.cur.notes"));
      quotes.push({ pageText, selection, note, toasts: v1.toasts.slice(toasts), notes: n.map((x) => ({ idShape: /^n[0-9a-z]+$/.test(x.id), page: x.page, quote: x.quote, note: x.note })) });
    }
    puts.length = 0;

    const marked = inputs.marked.map(([text, notes]) => ({ text, notes, out: v1.call<string>("shMarked", { pages: [text], notes }, 1) }));

    // shSummarise through the prompt recorder: the note saved first, then the one callAI call, then #shAi.
    const rec = promptRecorder(v1, "shelf");
    const summaries: Array<Record<string, unknown>> = [];
    const runSummary = async (s: (typeof SUMMARIES)[number]) => {
      v1.eval("SH.cur=" + JSON.stringify({ id: "s", title: "S", file: "s.pdf", pages: s.pages, notes: [], cells: {} }) + ";SH.page=1");
      v1.call("shRender");
      v1.setValue("shMine", s.mine);
      const c = await rec.run("shSummarise", { id: s.id }, () => v1.call<Promise<void>>("shSummarise"));
      const notes = plain<Array<{ id: string; page: number; quote: string; note: string }>>(v1.eval("SH.cur.notes"));
      if (puts.length !== 1) throw new Error(`shelf: shSummarise stored ${puts.length} times before its call`);
      puts.length = 0;
      summaries.push({ ...c, pages: s.pages, mine: s.mine, notes: notes.map((n) => ({ idShape: /^n[0-9a-z]+$/.test(n.id), page: n.page, quote: n.quote, note: n.note })), out: box("shAi").textContent });
    };
    for (const field of FIELDS) { rec.setField(field); await runSummary(SUMMARIES[0]!); }
    rec.setField(null);
    for (const s of SUMMARIES.slice(1)) await runSummary(s);
    const reply = "  Aim: sleep.\nMethod: not reported.  \n";
    v1.stubCallAI(reply);
    v1.setValue("shMine", SUMMARIES[1]!.mine);
    await v1.call<Promise<void>>("shSummarise");
    const trim = { reply, out: box("shAi").textContent };
    puts.length = 0;

    // shCols, shColAdd and shColDel over localStorage's appu_shelf_cols.
    const ls = v1.window.localStorage;
    const cols = inputs.cols.map((stored) => {
      if (stored === null) ls.removeItem("appu_shelf_cols"); else ls.setItem("appu_shelf_cols", stored);
      return { stored, out: plain<string[]>(v1.call("shCols")) };
    });
    ls.removeItem("appu_shelf_cols");
    setPapers([]);
    render("matrix");
    const colOps = [];
    for (const op of inputs.colOps) {
      if (op[0] === "add") { box("shCol"); v1.setValue("shCol", op[1]); v1.call("shColAdd"); } else v1.call("shColDel", op[1]);
      colOps.push({ op, out: plain<string[]>(v1.call("shCols")), stored: ls.getItem("appu_shelf_cols") });
    }
    const downloads: Array<{ name: string; text: string }> = [];
    w.pdDownload = (name: string, text: string) => { downloads.push({ name, text }); };
    const matrixPapers = [
      { id: "m1", title: 'T, "quoted"', pages: [], notes: [], cells: { Sample: "n=20", Method: "line1\nline2", Gone: "x" } },
      { id: "m2", title: "U", pages: [], notes: [] },
    ];
    setPapers(matrixPapers);
    const csv = [];
    for (const stored of [null, '["Method","Extra"]']) {
      if (stored === null) ls.removeItem("appu_shelf_cols"); else ls.setItem("appu_shelf_cols", stored);
      v1.call("shMatrixCsv");
      csv.push({ stored, papers: matrixPapers, ...downloads.splice(0)[0]! });
    }
    ls.removeItem("appu_shelf_cols");

    // shBackup: the bundle and the file name.
    const backupPapers = [{ id: "b1", title: "B", file: "b.pdf", size: 3, added: "2026-01-01T00:00:00.000Z", pages: ["x"], total: 1, notes: [], cells: {} }];
    setPapers(backupPapers);
    render("papers");
    const blobs: Blob[] = [];
    const names: string[] = [];
    const urlApi = v1.window.URL as unknown as Record<string, unknown>;
    urlApi.createObjectURL = (b: Blob) => { blobs.push(b); return "blob:shelf"; };
    urlApi.revokeObjectURL = () => {};
    const anchor = v1.window.HTMLAnchorElement.prototype as unknown as { click(this: HTMLAnchorElement): void };
    const click = anchor.click;
    anchor.click = function () { names.push(this.download); };
    v1.call("shBackup");
    anchor.click = click;
    const blobText = await new Promise<string>((done, fail) => { const r = new v1.window.FileReader(); r.onload = () => done(String(r.result)); r.onerror = () => fail(r.error); r.readAsText(blobs[0]!); }); // jsdom's Blob has no text()
    const bundle = JSON.parse(blobText) as { exported: string } & Record<string, unknown>;
    const { exported, ...bundleRest } = bundle;
    // The date is the capture day's: recorded as YYYY-MM-DD so a later --check compares the same text.
    const backup = { name: names[0]!.replace(/\d{4}-\d{2}-\d{2}/, "YYYY-MM-DD"), nameDateIsExported: names[0] === "appuscholar-shelf-" + exported.slice(0, 10) + ".json", exportedIso: new Date(exported).toISOString() === exported, keys: Object.keys(bundle), bundle: bundleRest, type: blobs[0]!.type, status: v1.eval<string>("SH.status") };

    // shRestore with a File per text.
    const restore = [];
    for (const text of inputs.restore) {
      v1.eval("SH.status=''");
      const input = { files: [new v1.window.File([text], "b.json", { type: "application/json" })], value: "b.json" };
      v1.call("shRestore", input);
      for (let i = 0; i < 100 && !v1.eval<string>("SH.status"); i++) await new Promise((r) => setTimeout(r, 10));
      restore.push({ text, status: v1.eval<string>("SH.status"), stored: puts.splice(0), inputValue: input.value });
    }

    if (v1.errors.length !== errorsAtStart) throw new Error(`shelf: jsdom errors: ${v1.errors.slice(errorsAtStart).join(" | ")}`);
    v1.eval("SH.papers=[];SH.cur=null;SH.status=''");
    return [writeFixture("shelf", "cases", { papers: inputs.papers, terms, counts, snippets, best, titles, gate, rank, search, find, extract, add, quotes, marked, summaries, trim, cols, colOps, csv, backup, restore }, v1, check)];
  },
};
