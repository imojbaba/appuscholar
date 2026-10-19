import { readFileSync } from "node:fs";
import type { Engine } from "../harness/engines";
import { emitTables, encodeSpecial, writeFixture } from "../harness/fixture";

/**
 * Task 11's Analyse-a-paper helpers (v1 index.html: retrNormDoi and retrValidDoi 7564-7565, AP_SAMPLE 9837, AP_STAGES 9839-9852, AP_HEADS 9853, AP_STOP 9854, apSquash, apToks, apHeadName and apBuild
 * 9855-9881, apPick, apJson and apCheckQuote 9987-10017, apNumbers 10066-10105, AP_NAME 10435, apRefDois 11225-11235) on the hand-written papers in papers.json, `{ id, title, pages, src }`.
 * The papers are the one input a person writes, except `sample`, whose entry is `{ id, src, from: "AP_SAMPLE" }`: its pages are v1's AP_SAMPLE, read from v1 here and never pasted, and its title is
 * the first line of the first page, as v1's apSample (9932) loads it. Every output below is v1's own.
 *
 * v1 keeps the paper in its page state (`AP`, a const at 9838): apPick, apCheckQuote, apNumbers and apRefDois read `AP.doc`. The capture puts each paper there as v1 does,
 * `apLoad(title, pages, src, false)` (9882): apLoad refuses a text with fewer than 500 characters that are not white space (150 for src "abstract") with a toast, which the capture turns into an error;
 * otherwise it sets `AP.doc = apBuild(title, pages, src)` plus `sample = !!isSample` and `abstractOnly = (src === 'abstract')`, resets the rest of the page state, reads (never writes) the stored
 * notes `appu_ap_notes`, and draws the panel (apRender, which jsdom runs without error). Guards (each throws): AP.doc is null before the first paper; AP.doc after apLoad is v1's own apBuild(title, pages, src)
 * with `abstractOnly` added, key for key and in order (sample stays false); and apSample() loads the same object as the sample's record with only `sample` true, which ties the sample's title, pages
 * and src to apSample's.
 *
 * - `papers`: for each paper, `{ id, title, pages, src, doc, numbers, dois }`: the inputs, `doc` = AP.doc after apLoad (abstractOnly included), and apNumbers() and apRefDois() on it.
 * - `picks`: apPick(q, terms, budget) with the paper loaded, `{ id, q, terms, budget, out }`: the brief's ("what was the sample size", "", 9000) on every paper (apAsk's call); for each of the 12 stages,
 *   (name + " " + brief, terms, 10000) on the sample, apWalkShow's call, and the same at a budget of 2000, where the sample is long enough for the scoring branch; ("gap", "", 500) on no-headings; and
 *   the PICKS below.
 * - `quotes`: apCheckQuote(q) with the paper loaded, `{ id, q, out }`.
 * - `noDoc`: apNumbers() and apRefDois() before any paper is loaded (AP.doc null: their `if(!d)return[]`).
 * - `headNames`: apHeadName over 20 lines; `toks` and `squash`: apToks and apSquash over 6 strings; `json`: apJson over the brief's 5 replies and 3 more; `retr`: retrNormDoi and retrValidDoi called
 *   directly (apRefDois only hands retrNormDoi strings that start with "10.", so its prefix rule is reached here).
 * - `heads`: AP_HEADS's source and flags (a RegExp cannot be recorded, and the port writes it as code).
 * - `tables.json` (and, under --emit, src/data/analyse-tables.ts): AP_STAGES, AP_STOP (a Set in v1: its members in insertion order), AP_NAME and AP_SAMPLE as v1 holds them.
 */

/** A paper of papers.json: hand-written, or the built-in sample, whose title and pages are v1's. */
export type Paper = { id: string; src: string; title?: string; pages?: string[]; from?: "AP_SAMPLE" };
type Stage = { k: string; name: string; ask: string; brief: string; terms: string };
type Call = { id: string; q: string; terms: string; budget: number };

/** apAsk's call (Task 14: apPick(q, "", 9000)) with the brief's question, run on every paper. */
const ASK = { q: "what was the sample size", terms: "", budget: 9000 };

/**
 * The brief's ("gap", "", 500) on no-headings, then calls that reach what the brief's calls do not: a question whose words are spread over chunks of different sizes, so a chunk that does not fit is
 * skipped and a smaller one after it kept (statistics, pdf-wrapped-lines); a budget equal to the first chunk's length (pdf-three-pages's title line, 40 characters), kept although it fills the budget
 * exactly; caps-blank-page's 603 characters at budgets 402 (603 is not more than 402 x 1.5, so every chunk) and 401 (the scoring branch); and two questions on pdf-three-pages whose words each stand in
 * one chunk only ("lessons" in its last, a seven-letter word, worth 1.5; "random" and "small", worth 1), at budgets where the order of the scores decides what is kept: "lessons" against "random" weighs the
 * bonus for a word of more than six letters, "lessons small" (2.5) against the first chunk's 2 weighs that bonus of 2. The test checks the 40, the 603 and where the words stand.
 */
const PICKS: Call[] = [
  { id: "no-headings", q: "gap", terms: "", budget: 500 },
  { id: "statistics", q: "Which statistical tests were reported?", terms: "test analysis anova regression correlation", budget: 600 },
  { id: "pdf-wrapped-lines", q: "How was vocabulary measured and who took part?", terms: "vocabulary test words sample participants", budget: 1000 },
  { id: "pdf-three-pages", q: "", terms: "", budget: 40 },
  { id: "caps-blank-page", q: "", terms: "", budget: 402 },
  { id: "caps-blank-page", q: "", terms: "", budget: 401 },
  { id: "pdf-three-pages", q: "lessons random", terms: "", budget: 250 },
  { id: "pdf-three-pages", q: "lessons small", terms: "", budget: 160 },
];

/**
 * The brief's kinds (exact, exact across a chunk boundary, 14 characters, absent, changed punctuation) and the outcomes around them. pdf-three-pages's first page ends "...can help children remember"
 * and its second begins "the words a day later": a quote over that boundary is found through the whole text, then placed by its first 20 squashed characters, which "help children remember" fills
 * exactly and "elp children remember" overruns by one. "Twenty-four chil" squashes to 14 characters, "Twenty-four child" to 15. "Each child read twenty words aloud and then sang them" begins
 * with the paper's words and goes on with words it does not have. The Hindi quotes are typed for this corpus; the second changes a vowel sign.
 */
const QUOTES: Array<{ id: string; q: string }> = [
  { id: "pdf-three-pages", q: "Each child read twenty words aloud and twenty words silently, in a random order." },
  { id: "pdf-three-pages", q: "We tested whether reading aloud can help children remember the words a day later better than reading them silently." },
  { id: "pdf-three-pages", q: "help children remember the words a day later" },
  { id: "pdf-three-pages", q: "elp children remember the words a day later" },
  { id: "pdf-three-pages", q: "Twenty-four chil" },
  { id: "pdf-three-pages", q: "Twenty-four child" },
  { id: "pdf-three-pages", q: "Children forgot every word they had read aloud." },
  { id: "pdf-three-pages", q: "Each child read twenty words aloud and then sang them" },
  { id: "pdf-three-pages", q: "" },
  { id: "pasted-headings", q: "the tutored group’s anxiety fell more than the comparison group’s — t(40)=2.48; p=.017" },
  { id: "no-headings", q: "Two hundred students in Class 9 from four schools kept a diary" },
  { id: "refs-with-dois", q: "Hattie, J., & Timperley, H. (2007). The power of feedback." },
  { id: "hindi-paper", q: "इस अध्ययन में हमने पूछा कि क्या एक सप्ताह तक तय समय पर सोने की आदत" },
  { id: "hindi-paper", q: "क्या एक सप्ताह तक तय समय पर सोने की आदत परिक्षा की चिंता को कम करती है" },
];

/**
 * 20 lines for apHeadName: plain, padded and ALL-CAPS headings; the numberings it strips and three it does not; a trailing colon, full stop and carriage return; lines that are not headings; and a line of
 * a table of contents at 60 characters, the longest apHeadName reads (its dots are stripped after the length is checked), and at 61.
 */
const HEAD_LINES = [
  "Abstract", "  METHODS  ", "1. Introduction", "2.1 Participants", "2.2) Measures", "III. Results", "IV Discussion", "X. Conclusions",
  "iv. Discussion", "1.Introduction", "A. Method", "Results:", "Results\r", "THEORETICAL FRAMEWORK", "Acknowledgments.",
  "Results and Discussion", "", "संदर्भ", "Results " + ".".repeat(52), "Results " + ".".repeat(53),
];

/** 6 strings for apToks and apSquash: stop words and short words, punctuation and a Greek letter, Hindi (vowel signs are marks, not letters), precomposed and combining accents, empty, digits. */
const STRINGS = [
  "What was the sample size?",
  "Participants (N = 60) were recruited; Cronbach’s α = .86",
  "नींद और परीक्षा की चिंता को कम करना",
  "Café, naïve RÉSUMÉ and e\u0301tude",
  "",
  "These 2,000 students would also have been tested in 2019 and 2020!",
];

/** The brief's five replies, then a closed brace that is not JSON, two objects in one reply, and an object whose strings hold an upper-case fence (which v1 removes there too) and a brace. */
const JSONS = ['{"a":1}', '```json {"a":1} ```', "no json", "{bad", 'text {"x":[1,2]} tail', "{bad}", '{"a":1} and {"b":2}', '```json\n{"answer":"Write ```JSON fences","quotes":["a } b"]}\n```'];

/** retrNormDoi: the resolver prefixes it strips (any case, dx.), and two it keeps; retrValidDoi: a good DOI, then each way one fails, and a registrant longer than apRefDois's nine digits. */
const RETR: Record<"retrNormDoi" | "retrValidDoi", string[]> = {
  retrNormDoi: ["https://doi.org/10.1037/H0043158", "  HTTP://DX.DOI.ORG/10.1000/ABC  ", "doi:10.1000/xyz", "https://www.doi.org/10.1037/x", ""],
  retrValidDoi: ["10.1037/h0043158", "10.123/abc", "10.1234/", "10.1234/a b", "10.1234/a,b", "10.1234/a|b", "doi:10.1234/x", "10.12345678901/x"],
};

const same = (a: unknown, b: unknown) => JSON.stringify(encodeSpecial(a)) === JSON.stringify(encodeSpecial(b));

export const analyse: Engine = {
  name: "analyse",
  async capture(v1, opts) {
    const { check } = opts;
    const corpus = JSON.parse(readFileSync(new URL("./papers.json", import.meta.url), "utf8")) as Paper[];
    const ids = new Set<string>();
    for (const p of corpus) {
      if (ids.has(p.id)) throw new Error(`analyse: papers.json has the id ${p.id} twice`);
      ids.add(p.id);
      const ok = p.from === undefined ? typeof p.title === "string" && Array.isArray(p.pages) : p.from === "AP_SAMPLE" && p.title === undefined && p.pages === undefined;
      if (!ok) throw new Error(`analyse: ${p.id} must have a title and pages, or be from: "AP_SAMPLE" with neither`);
    }
    for (const c of [...PICKS, ...QUOTES]) if (!ids.has(c.id)) throw new Error(`analyse: a call names the paper ${c.id}, which papers.json does not have`);

    // v1's tables, as data (AP_SAMPLE and AP_STAGES are consts, reached through eval). The sample is loaded as apSample (9932) loads it.
    const sample = [...v1.eval<string[]>("AP_SAMPLE")];
    const stages = Array.from(v1.eval<Stage[]>("AP_STAGES"), (s) => ({ ...s }));
    const inputOf = (p: Paper) => (p.from === "AP_SAMPLE" ? { title: sample[0]!.split("\n")[0]!, pages: sample.slice(), src: p.src } : { title: p.title!, pages: p.pages!, src: p.src });

    if (v1.eval("AP.doc") !== null) throw new Error("analyse: v1 has a paper loaded before the capture loads one");
    const noDoc = { numbers: v1.call("apNumbers"), dois: v1.call("apRefDois") };

    let loaded = "";
    const load = (p: Paper) => {
      const { title, pages, src } = inputOf(p);
      const before = v1.toasts.length;
      if (v1.call("apLoad", title, pages.slice(), src, false) !== true) throw new Error(`analyse: v1's apLoad refused ${p.id}: ${v1.toasts.slice(before).join(" | ")}`);
      loaded = p.id;
      return v1.eval<Record<string, unknown>>("AP.doc");
    };
    const use = (id: string) => {
      if (loaded !== id) load(corpus.find((p) => p.id === id)!);
    };

    const papers = corpus.map((p) => {
      const { title, pages, src } = inputOf(p);
      const doc = load(p);
      const { abstractOnly, ...built } = doc;
      if (abstractOnly !== (src === "abstract") || built.sample !== false) throw new Error(`analyse: ${p.id}: apLoad set abstractOnly ${String(abstractOnly)} and sample ${String(built.sample)}`);
      if (!same(built, v1.call("apBuild", title, pages.slice(), src))) throw new Error(`analyse: ${p.id}: AP.doc is not v1's apBuild(title, pages, src) with abstractOnly added`);
      if (p.from === "AP_SAMPLE") {
        v1.call("apSample");
        const viaSample = v1.eval<Record<string, unknown>>("AP.doc");
        if (viaSample.sample !== true || !same({ ...viaSample, sample: false }, doc)) throw new Error("analyse: apSample() does not load the sample's record with sample true");
        load(p);
      }
      return { id: p.id, title, pages, src, doc, numbers: v1.call("apNumbers"), dois: v1.call("apRefDois") };
    });

    const calls: Call[] = [
      ...corpus.map((p) => ({ id: p.id, ...ASK })),
      ...stages.map((st) => ({ id: "sample", q: st.name + " " + st.brief, terms: st.terms, budget: 10000 })),
      ...stages.map((st) => ({ id: "sample", q: st.name + " " + st.brief, terms: st.terms, budget: 2000 })),
      ...PICKS,
    ];
    const picks = calls.map((c) => {
      use(c.id);
      return { ...c, out: v1.call("apPick", c.q, c.terms, c.budget) };
    });
    const quotes = QUOTES.map((c) => {
      use(c.id);
      return { ...c, out: v1.call("apCheckQuote", c.q) };
    });

    const headNames = HEAD_LINES.map((line) => ({ line, out: v1.call<string | null>("apHeadName", line) }));
    const toks = STRINGS.map((s) => ({ s, out: v1.call<string[]>("apToks", s) }));
    const squash = STRINGS.map((s) => ({ s, out: v1.call<string>("apSquash", s) }));
    const json = JSONS.map((s) => ({ s, out: v1.call("apJson", s) }));
    const retr = (Object.keys(RETR) as Array<keyof typeof RETR>).flatMap((fn) => RETR[fn].map((s) => ({ fn, s, out: v1.call<string | boolean>(fn, s) })));
    const heads = { source: v1.eval<string>("AP_HEADS.source"), flags: v1.eval<string>("AP_HEADS.flags") };

    // AP_STOP is a Set in v1 (a const, reached through eval): the table is its members in insertion order.
    const tables = { AP_STAGES: stages, AP_STOP: [...v1.eval<Set<string>>("AP_STOP")], AP_NAME: { ...v1.eval<Record<string, string>>("AP_NAME") }, AP_SAMPLE: sample };
    return [
      emitTables(v1, "analyse", "analyse-tables", tables, opts),
      writeFixture("analyse", "cases", { papers, picks, quotes, noDoc, headNames, toks, squash, json, retr, heads }, v1, check),
    ];
  },
};
