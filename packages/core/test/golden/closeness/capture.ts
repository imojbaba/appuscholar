import type { Engine } from "../harness/engines";
import { emitTables, writeFixture } from "../harness/fixture";
import type { V1 } from "../harness/v1";

/**
 * The closeness check (v1 index.html: CL_STOP 6830, clTok 6831-6841, CL_HOMO 6842, clExcludeRanges 6843-6851, clHtmlToText 6852-6854, clK 6855, clMin 6856, clCompare 6859-6899,
 * closeInit's document filter 6905, clGather 6919-6936, clRun's two guards 6938-6941, clReportText 6967-6972), run in jsdom exactly as the page runs them. Every input below is
 * written here (the texts a student pastes); every output is v1's own.
 * - `cases`: `{ id, studentText, sources, k, minRun, date, result, report }`: `result` is clCompare(studentText, sources, k, minRun); `report` is clReportText() after CL.res was set to
 *   that result (plus the `text` and `ms` that clRun adds, which the report ignores) with `new Date()` fixed to `date`.
 * - `sanitisers`: clK() and clMin() with `appu_close_k` / `appu_close_min` stored as each string (null = never stored).
 * - `gather`: clGather() for a set of ticked boxes (set up in #clSel in the order given), CL.shelf, CL.docs and #clPaste.
 * - `others`: the ids closeInit leaves in CL.docs for a stored document list and a current document id.
 * - `gate`: clRun()'s toast for a document of `words` words with a pasted passage (null when it went on to compare).
 * - `tables.json` (and, under --emit, src/data/closeness-tables.ts): CL_STOP as its words in the Set's order and CL_HOMO, read through eval.
 * Under jsdom v1's `clHtmlToText` sees no innerText and so reads textContent (what Chrome's innerText answers for a detached div, register F26).
 */

export type ClSource = { name: string; kind: string; text: string; pageStarts?: number[] };
export type ClRun = { src: number; also: number[]; from: number; to: number; words: number; mine: string; theirs: string; page: number; cs: number; ce: number };
export type ClResult = {
  counted: number; total: number; covered: number; pct: number; runs: ClRun[];
  per: Array<{ name: string; kind: string; words: number; runs: number }>; k: number; minRun: number; sources: Array<{ name: string; kind: string }>;
};
export type ClCaseSpec = { id: string; studentText: string; sources: ClSource[]; k: number; minRun: number; date: string };
export type ClCase = ClCaseSpec & { result: ClResult; report: string };
export type ClShelfPaper = { id: string; title?: string; file?: string; pages?: Array<string | null> };
export type ClDoc = { id: string; title?: string; body?: string };
export type ClGatherSpec = { id: string; shelf: ClShelfPaper[]; docs: ClDoc[]; ticked: string[]; pasted: string };
export type ClGatherCase = ClGatherSpec & { sources: ClSource[] };
export type ClOthersCase = { id: string; docs: ClDoc[]; current: string; ids: string[] };
export type ClGateCase = { words: number; sep: string; toast: string | null; compared: boolean };
export type ClFx = {
  cases: ClCase[]; sanitisers: Array<{ stored: string | null; k: number; min: number }>; gather: ClGatherCase[]; others: ClOthersCase[]; gate: ClGateCase[];
};

/** A deterministic word list: the same words for the same seed, no word repeated inside a run of the lengths used here. */
function gen(seed: number, n: number): string[] {
  const syl = ["ka", "to", "mi", "ra", "ne", "lo", "su", "pe", "di", "va", "ho", "bu", "fe", "gi", "za", "ko"];
  const out: string[] = [];
  let x = seed;
  const seen = new Set<string>();
  while (out.length < n) {
    x = (x * 1103515245 + 12345) % 2147483648;
    const w = syl[x % 16]! + syl[(x >> 4) % 16]! + syl[(x >> 8) % 16]! + syl[(x >> 12) % 16]!;
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out;
}
const join = (...parts: string[]) => parts.join(" ");

const P1 = "Attention in lectures tends to drift after about ten minutes, and students who take notes by hand recall the main ideas better than students who type verbatim transcripts.";
const P2 = "Working memory holds only a handful of items at once, so instruction that overloads it leaves learners unable to connect new facts with what they already know.";
const P3 = "Spaced practice distributes study sessions over several days rather than compressing them into one long evening, and it reliably improves long term retention.";
const P4 = "Retrieval practice strengthens memory because the effort of recalling an answer consolidates the trace more than rereading the same page ever could.";
const F1 = "This review looks at how people learn from lectures and what teachers can change.";
const F2 = "The studies were carried out in universities in several countries between 2005 and 2020.";
const F3 = "None of the findings here is final, and each rests on samples that are small.";
const SRC_A: ClSource = { name: "Paper A", kind: "Reading shelf", text: join(F1, P1, F2, P2, F3) };
const SRC_B: ClSource = { name: "Paper B", kind: "Reading shelf", text: join(F2, P3, F1, P4) };
const SRC_C: ClSource = { name: "Essay C", kind: "your document", text: join(F3, P2, P3) };

// A source of generated words and a student text that copies slices of it of these lengths, a changed word between each.
const WORDS = gen(7, 160);
const LENGTHS = [5, 6, 7, 8, 9, 10, 12, 15, 16, 20];
const GEN_SRC: ClSource = { name: "Generated paper", kind: "Reading shelf", text: WORDS.join(" ") };
const CHUNKS = (() => {
  const parts: string[] = [];
  let p = 0;
  LENGTHS.forEach((len, i) => {
    parts.push(WORDS.slice(p, p + len).join(" "), "changed" + i);
    p += len + 3;
  });
  return parts.join(" ");
})();

const STOPS_ONLY = "and then there was also the case that it could be so for all of them";
const CONTENT_3 = "the results of this study show that it was not so";
const CONTENT_4 = "the results of this study show that it was large";
const EXACT_8 = "Reading aloud slows the pace of silent thought and so raises recall";
const SEVEN = "Reading aloud slows the pace of silent thought";

const REFS_BODY = "Smith, J. (2019). Attention in lectures tends to drift after about ten minutes, and students who take notes by hand recall the main ideas better. Journal of Learning, 4(2), 11-19.";
const LONG_QUOTE = "x ".repeat(1600);

const DATE = "2026-03-05T09:30:00.000Z";
const mk = (id: string, studentText: string, sources: ClSource[], k = 6, minRun = 8, date = DATE): ClCaseSpec => ({ id, studentText, sources, k, minRun, date });

const SPECS: ClCaseSpec[] = [
  mk("exact-copy", P1, [SRC_A]),
  mk("copy-in-own-words", join("My own opening is that", P1, "which I find convincing, though I also read Paper A with doubts."), [SRC_A]),
  mk("chunks-k5-min8", CHUNKS, [GEN_SRC], 5, 8),
  mk("chunks-k6-min10", CHUNKS, [GEN_SRC], 6, 10),
  mk("chunks-k8-min15", CHUNKS, [GEN_SRC], 8, 15),
  mk("chunks-k8-min8", CHUNKS, [GEN_SRC], 8, 8),
  mk("chunks-k5-min15", CHUNKS, [GEN_SRC], 5, 15),
  mk("stopwords-rejected", join("I wrote that", STOPS_ONLY, "and nothing more."), [{ name: "Stop words", kind: "pasted", text: join("They wrote that", STOPS_ONLY, "in their note.") }]),
  mk("content-boundary", join("First,", CONTENT_3, "zzq. Then", CONTENT_4, "and so on."), [{ name: "Boundary", kind: "pasted", text: join("Then,", CONTENT_3, "yyq", CONTENT_4, "xxq.") }], 6, 8),
  mk("run-exact-minrun", join(EXACT_8, "qq1", SEVEN, "qq2"), [{ name: "Exact", kind: "pasted", text: join("Intro words.", EXACT_8, "tail.", SEVEN, "end.") }], 6, 8),
  mk("quotes-straight", join("As the authors say, \"", P1, "\" and then I carry on. I also wrote", P2), [SRC_A]),
  mk("quotes-curly", join("As the authors say, “", P1, "” and then I carry on. I also wrote", P2), [SRC_A]),
  mk("quotes-edges", join("An unclosed quote \"", P1, "\nThen a straight quote over a line break \"start of\n", P2, "end\" and a curly quote over a line break “start of\n", P3, "end” done."), [SRC_A, SRC_B]),
  mk("quote-over-3000", join("\"", LONG_QUOTE, P1, "\" outside:", P2), [SRC_A]),
  mk("refs-references", join("My text.", P2, "\nReferences\n", REFS_BODY), [SRC_A]),
  mk("refs-bibliography", join("My text.", P2, "\nBibliography \n", P1), [SRC_A]),
  mk("refs-works-cited", join("My text.", P2, "\n\tWORKS CITED\t\n", P1), [SRC_A]),
  mk("refs-reference-list", join("My text.", P2, "\nReference list\n", P1), [SRC_A]),
  mk("refs-last-heading-wins", join("Intro.\nReferences\n", P1, "\nmore of my own text and", P2, "\nBibliography\n", P3), [SRC_A, SRC_B]),
  mk("refs-heading-at-start", join("References\n", P1), [SRC_A]),
  mk("homoglyph-cyrillic", "Attеntion in lеctures tеnds to drift aftеr about tеn minutеs, and studеnts who takе nоtеs by hаnd rеcall thе main idеas bеttеr than studеnts who typе vеrbatim transcripts.", [SRC_A]),
  mk("homoglyph-greek", "Spaced practiceοο distributes study sessions οver several days rather than compressing them into one long evening, and it reliably imρroves long term retention.", [{ name: "Greek", kind: "pasted", text: "Spaced practiceoo distributes study sessions over several days rather than compressing them into one long evening, and it reliably improves long term retention." }]),
  mk("pure-cyrillic-not-mapped", "работа память внимание учёба знание память работа внимание учёба знание память работа", [{ name: "Cyrillic", kind: "pasted", text: "работа память внимание учёба знание память работа внимание учёба знание память работа" }]),
  mk("invisible-chars", "Attention in lec­tures tends to dr​ift af‌ter about ten min﻿utes, and students who take notes by hand recall the main ideas better.", [SRC_A]),
  mk("hyphen-wrap", join("The effect of psycho-\nlogical load on recall of the main ideas was large and it reliably improves."), [{ name: "PDF text", kind: "Reading shelf", text: "The effect of psychological load on recall of the main ideas was large and it reliably improves. Next page‐\nwords." }]),
  mk("hyphen-wrap-student", "Next page‐\nwords were copied here, and the effect of psychological‐\n load on recall of the main ideas was large and it reliably improves.", [{ name: "PDF text", kind: "Reading shelf", text: "The effect of psychological load on recall of the main ideas was large and it reliably improves. Next pagewords." }]),
  mk("apostrophes", "The children’s attention doesn’t last because they can’t hold the teacher’s main points once it’s been ten minutes of talk.", [{ name: "Apostrophes", kind: "pasted", text: "The children's attention doesn't last because they can't hold the teacher's main points once it's been ten minutes of talk." }]),
  mk("devanagari", "छात्रों की एकाग्रता व्याख्यान के लगभग दस मिनट बाद घटने लगती है और हाथ से नोट्स लिखने वाले छात्र बेहतर याद रखते हैं।", [{ name: "हिंदी लेख", kind: "Reading shelf", text: "प्रस्तावना। छात्रों की एकाग्रता व्याख्यान के लगभग दस मिनट बाद घटने लगती है और हाथ से नोट्स लिखने वाले छात्र बेहतर याद रखते हैं। उपसंहार।" }]),
  mk("also-cap-3", P1, [
    { name: "S1", kind: "Reading shelf", text: P1 }, { name: "S2", kind: "Reading shelf", text: join("x.", P1) }, { name: "S3", kind: "your document", text: join("y.", P1) },
    { name: "S4", kind: "your document", text: join("z.", P1) }, { name: "S5", kind: "pasted", text: P1 },
  ]),
  mk("also-two-sources", join(P2, "and", P3), [SRC_C, SRC_A, SRC_B]),
  (() => {
    const pages = ["Page one is an abstract that says little.", "Page two covers method and the sample used.", join("Page three says that", P3, "and goes on.")];
    let text = "";
    const pageStarts: number[] = [];
    pages.forEach((p) => { pageStarts.push(text.length); text += p + "\n"; });
    return mk("pagestarts", join("I would say that", P3), [{ name: "Paged paper", kind: "Reading shelf", text, pageStarts }]);
  })(),
  (() => {
    const pages = [join(P1, "tail one."), join(P2, "tail two.")];
    let text = "";
    const pageStarts: number[] = [];
    pages.forEach((p) => { pageStarts.push(text.length); text += p + "\n"; });
    return mk("pagestarts-two-runs", join(P2, "gap word zzzz", P1), [{ name: "Two pages", kind: "Reading shelf", text, pageStarts }, { name: "No pages", kind: "pasted", text: P1 }]);
  })(),
  mk("empty-student", "", [SRC_A]),
  mk("whitespace-student", " \n\t  ", [SRC_A]),
  mk("no-sources", P1, []),
  mk("student-shorter-than-k", "Attention in lectures", [SRC_A]),
  mk("source-empty-text", P1, [{ name: "Empty", kind: "pasted", text: "" }, SRC_A]),
  mk("run-boundary-changes-source", join(P1, P2), [{ name: "Only P1", kind: "Reading shelf", text: join(F1, P1) }, { name: "Only P2", kind: "Reading shelf", text: join(P2, F3) }]),
  mk("copied-twice", join(P2, "A short bridge of my own words here.", P2), [SRC_A]),
  mk("three-sources", join(P1, "Bridge one with my words.", P3, "Bridge two with my words.", P4), [SRC_A, SRC_B, SRC_C]),
  mk("case-punctuation-numbers", "ATTENTION IN LECTURES -- tends to drift; after about ten minutes: and students who take notes by hand recall the main ideas better. In 2005, 3 studies found 40 per cent more.", [{ name: "Numbers", kind: "pasted", text: join(P1, "In 2005, 3 studies found 40 per cent more.") }]),
  mk("nfkc-ligatures", "The ﬁnal ﬂow of attention in lectures tends to drift after about ten minutes and ＳＴＵＤＥＮＴＳ who take notes by hand.", [{ name: "Ligatures", kind: "pasted", text: "The final flow of attention in lectures tends to drift after about ten minutes and students who take notes by hand." }]),
  mk("second-date", P2, [SRC_A], 6, 8, "2024-12-31T23:59:59.000Z"),
];

const GATHER_SHELF: ClShelfPaper[] = [
  { id: "a", title: "Paper A", file: "a.pdf", pages: ["page one text", "page two\nwith a break", "", "page four"] },
  { id: "b", title: "", file: "b-file.pdf", pages: [null, "second page only"] },
  { id: "c", title: "", file: "", pages: [] },
  { id: "d", title: "No pages field" },
  { id: "e", title: "Hindi paper", pages: ["पहला पृष्ठ", "दूसरा पृष्ठ"] },
];
const GATHER_DOCS: ClDoc[] = [
  { id: "d1", title: "Draft one", body: "<p>First paragraph.</p><p>Second paragraph &amp; more.</p>" },
  { id: "d2", title: "", body: "<p>Hello <b>bold</b> and <i>italic</i><br>after break</p><ul><li>one</li><li>two</li></ul>" },
  { id: "d3", title: "Entities", body: "<p>Caf&#233; &lt;b&gt; &#39;quote&#39; &nbsp;gap &quot;q&quot;</p>" },
  { id: "d4", title: "No body" },
  { id: "d5", title: "Hindi doc", body: "<p>नमस्ते दुनिया</p>" },
];
const GATHER: ClGatherSpec[] = [
  { id: "nothing-ticked", shelf: GATHER_SHELF, docs: GATHER_DOCS, ticked: [], pasted: "" },
  { id: "shelf-all", shelf: GATHER_SHELF, docs: GATHER_DOCS, ticked: ["s:a", "s:b", "s:c", "s:d", "s:e"], pasted: "" },
  { id: "docs-all", shelf: GATHER_SHELF, docs: GATHER_DOCS, ticked: ["d:d1", "d:d2", "d:d3", "d:d4", "d:d5"], pasted: "" },
  { id: "mixed-and-pasted", shelf: GATHER_SHELF, docs: GATHER_DOCS, ticked: ["d:d1", "s:a", "d:d5", "s:e"], pasted: "  A pasted passage\nover two lines.  " },
  { id: "pasted-only", shelf: [], docs: [], ticked: [], pasted: "Only the pasted words" },
  { id: "pasted-whitespace", shelf: GATHER_SHELF, docs: GATHER_DOCS, ticked: ["s:a"], pasted: " \n\t " },
  { id: "unknown-ids", shelf: GATHER_SHELF, docs: GATHER_DOCS, ticked: ["s:zz", "d:zz", "x:1", "s:a"], pasted: "" },
];

const BODY_LONG = "<p>" + "word ".repeat(50) + "</p>";
const OTHERS: Array<{ id: string; docs: ClDoc[]; current: string }> = [
  { id: "mixed", docs: [{ id: "x1", title: "Long one", body: BODY_LONG }, { id: "x2", title: "Short", body: "<p>too short</p>" }, { id: "x3", title: "Current", body: BODY_LONG }, { id: "x4", title: "No body" }, { id: "x5", body: "<p>" + "w ".repeat(101) + "</p>" }], current: "x3" },
  { id: "body-exactly-200", docs: [{ id: "y1", body: "a".repeat(200) }, { id: "y2", body: "a".repeat(201) }], current: "" },
  { id: "none-stored", docs: [], current: "z" },
];
const GATE_WORDS = [0, 1, 29, 30, 31, 60];

export const closeness: Engine = {
  name: "closeness",
  async capture(v1, opts) {
    const w = v1.window as unknown as Record<string, unknown> & V1["window"];
    const ls = v1.window.localStorage;
    const plain = <T>(v: unknown): T => JSON.parse(JSON.stringify(v)) as T;
    const inRealm = <T>(v: unknown): T => v1.window.JSON.parse(JSON.stringify(v)) as T;
    const CL = v1.eval<{ res: unknown; shelf: unknown; docs: unknown }>("CL");
    const RealDate = w.Date as DateConstructor;
    const fixDate = (iso: string) => {
      class Fixed extends RealDate {
        constructor(...a: unknown[]) {
          if (a.length === 0) super(iso);
          else super(...(a as [string]));
        }
        static override now() { return new RealDate(iso).getTime(); }
      }
      w.Date = Fixed as unknown as DateConstructor;
    };
    const unfixDate = () => { w.Date = RealDate; };

    const cases: ClCase[] = [];
    for (const s of SPECS) {
      const result = plain<ClResult>(v1.call("clCompare", s.studentText, inRealm(s.sources), s.k, s.minRun));
      CL.res = inRealm({ ...result, text: s.studentText, ms: 3 });
      fixDate(s.date);
      let report: string;
      try { report = v1.call<string>("clReportText"); } finally { unfixDate(); }
      cases.push({ ...s, result, report });
    }
    CL.res = null;
    if (v1.call<string>("clReportText") !== "") throw new Error("closeness: clReportText() is not '' with no result");

    const sanitisers: ClFx["sanitisers"] = [];
    for (const stored of [null, "", "5", "6", "8", "10", "15", "7", "abc", "8.9", " 5", "5px", "0x8", "-8", "6e0", "08"]) {
      ls.clear();
      if (stored !== null) { ls.setItem("appu_close_k", stored); ls.setItem("appu_close_min", stored); }
      sanitisers.push({ stored, k: v1.call<number>("clK"), min: v1.call<number>("clMin") });
    }
    ls.clear();

    const sel = v1.document.getElementById("clSel")!;
    const paste = v1.document.getElementById("clPaste") as HTMLTextAreaElement;
    const gather: ClGatherCase[] = [];
    for (const g of GATHER) {
      CL.shelf = inRealm(g.shelf);
      CL.docs = inRealm(g.docs);
      sel.innerHTML = g.ticked.map((v) => `<input type="checkbox" value="${v}" checked>`).join("") + `<input type="checkbox" value="s:a">`;
      paste.value = g.pasted;
      gather.push({ ...g, sources: plain<ClSource[]>(v1.call("clGather")) });
    }
    sel.innerHTML = "";
    paste.value = "";

    const others: ClOthersCase[] = [];
    for (const o of OTHERS) {
      ls.clear();
      ls.setItem("appu_docs", JSON.stringify(o.docs));
      ls.setItem("appu_doc_current", o.current);
      CL.docs = inRealm([{ id: "stale" }]);
      await v1.call<Promise<void>>("closeInit");
      others.push({ ...o, ids: plain<ClDoc[]>(CL.docs).map((d) => d.id) });
    }
    ls.clear();

    // clRun reads the document (the editor), so the gate is v1's own: a pasted passage is there for it to go on to compare.
    const gate: ClGateCase[] = [];
    paste.value = "A passage pasted to compare with, of a few words only.";
    sel.innerHTML = "";
    for (const words of GATE_WORDS) {
      for (const sep of [" ", "\n\n"]) {
        v1.setEditorHtml("<p>" + Array.from({ length: words }, (_, i) => "w" + i).join(sep) + "</p>");
        CL.res = null;
        v1.toasts.length = 0;
        v1.call("clRun");
        gate.push({ words, sep, toast: v1.toasts[0] ?? null, compared: CL.res !== null });
        if (v1.toasts.length > 1) throw new Error("closeness: clRun toasted twice");
      }
    }
    paste.value = "";
    v1.setEditorHtml("");

    const tables = { CL_STOP_WORDS: plain<string[]>(Array.from(v1.eval<Set<string>>("CL_STOP"))), CL_HOMO: plain<Record<string, string>>(v1.eval("CL_HOMO")) };
    console.log(`closeness: ${cases.length} cases (${cases.map((c) => `${c.id}: ${c.result.runs.length} runs ${c.result.pct}%`).join(", ")}), ${sanitisers.length} sanitiser values, ${gather.length} gathers, ${others.length} others, ${gate.length} gates`);
    return [
      emitTables(v1, "closeness", "closeness-tables", tables, opts),
      writeFixture("closeness", "cases", { cases, sanitisers, gather, others, gate } satisfies ClFx, v1, opts.check),
    ];
  },
};
