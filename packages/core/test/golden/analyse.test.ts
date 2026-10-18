import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { AP_HEADS, AP_NAME, AP_SAMPLE, AP_STAGES, AP_STOP, apBuild, apCheckQuote, apHeadName, apJson, apNumbers, apPick, apRefDois, apSquash, apToks, retrNormDoi, retrValidDoi } from "../../src/analyse";
import type { ApDoc, ApNumber } from "../../src/analyse";
import * as TABLES from "../../src/data/analyse-tables";
import type { Paper } from "./analyse/capture";
import { readFixture } from "./harness/fixture";

/**
 * analyse.ts (v1's Analyse-a-paper helpers: retrNormDoi and retrValidDoi 7564-7565, AP_HEADS 9853, apSquash, apToks, apHeadName and apBuild 9855-9881, apPick, apJson and apCheckQuote 9987-10017, apNumbers
 * 10066-10105, apRefDois 11225-11235) against v1 running. Every expected value is read from test/golden/analyse/cases.json (`golden:capture analyse`), captured from the hand-written analyse/papers.json
 * and v1's own sample paper; tables.json holds AP_STAGES, AP_STOP, AP_NAME and AP_SAMPLE, which src/data/analyse-tables.ts is generated from.
 * v1's apPick, apCheckQuote, apNumbers and apRefDois read the loaded paper (`AP.doc`); here they are given the paper v1 had loaded when it was called, the record's `doc`.
 * `doc` is AP.doc as apLoad (9886) leaves it: apBuild's object with `abstractOnly` added (src === "abstract"), a field of the page code, which core does not port; apBuild is held to the rest.
 * What is typed here is what the brief and the controller's rulings spell out (the paper ids and what each holds, the sample's two statistics, the twelve stages), the boundaries the corpus is built
 * on (checked against the fixture), and guards that the corpus reaches each branch.
 */

type LoadedDoc = ApDoc & { abstractOnly: boolean };
type PaperCase = { id: string; title: string; pages: string[]; src: string; doc: LoadedDoc; numbers: ApNumber[]; dois: string[] };
type Fx = {
  papers: PaperCase[];
  picks: Array<{ id: string; q: string; terms: string; budget: number; out: ReturnType<typeof apPick> }>;
  quotes: Array<{ id: string; q: string; out: ReturnType<typeof apCheckQuote> }>;
  noDoc: { numbers: ApNumber[]; dois: string[] };
  headNames: Array<{ line: string; out: string | null }>;
  toks: Array<{ s: string; out: string[] }>;
  squash: Array<{ s: string; out: string }>;
  json: Array<{ s: string; out: unknown }>;
  retr: Array<{ fn: "retrNormDoi" | "retrValidDoi"; s: string; out: string | boolean }>;
  heads: { source: string; flags: string };
};

const corpus = JSON.parse(readFileSync(new URL("./analyse/papers.json", import.meta.url), "utf8")) as Paper[];
const fx = readFixture<Fx>("analyse", "cases");
const paperOf = (id: string) => fx.papers.find((p) => p.id === id)!;
const docOf = (id: string) => paperOf(id).doc;
const inputOf = (id: string) => corpus.find((p) => p.id === id)!;
const RETR = { retrNormDoi, retrValidDoi };

/** The brief's seven papers, then the additions (ruling 3): ALL-CAPS headings with a page of white space, wrapped PDF lines, a one-page PDF, src "abstract", statistics in many forms. */
const IDS = ["sample", "pasted-headings", "numbered-headings", "pdf-three-pages", "no-headings", "refs-with-dois", "hindi-paper", "caps-blank-page", "pdf-wrapped-lines", "pdf-one-page", "abstract-only", "statistics"];
const DEVANAGARI = /[\u0900-\u097f]/;

describe("analyse.ts is v1's Analyse-a-paper engine", () => {
  it("the corpus is the brief's papers and the additions, and the fixture was captured from exactly this corpus, the sample from v1's AP_SAMPLE", () => {
    expect(corpus.map((p) => p.id)).toEqual(IDS);
    expect(fx.papers.map((p) => p.id)).toEqual(IDS);
    for (const p of corpus) {
      const r = paperOf(p.id);
      expect(r.src, p.id).toBe(p.src);
      if (p.from === "AP_SAMPLE") {
        // apSample (9932): the first line of the first page, every page, src "pdf".
        expect(r.title).toBe(AP_SAMPLE[0]!.split("\n")[0]);
        expect(r.pages).toEqual([...AP_SAMPLE]);
        expect(r.src).toBe("pdf");
      } else {
        expect(r.title, p.id).toBe(p.title);
        expect(r.pages, p.id).toEqual(p.pages);
      }
    }
  });
  it("each paper holds what the brief says it holds", () => {
    const text = (id: string) => inputOf(id).pages!.join("\n");
    const lines = (id: string) => text(id).split("\n");
    expect(lines("pasted-headings")).toEqual(expect.arrayContaining(["Abstract", "Method", "Results", "References"]));
    expect(inputOf("pasted-headings").pages).toHaveLength(1);
    expect(lines("numbered-headings")).toEqual(expect.arrayContaining(["1. Introduction", "2.1 Participants", "III. Results"]));
    expect(inputOf("pdf-three-pages").pages).toHaveLength(3);
    expect(inputOf("pdf-three-pages").src).toBe("pdf");
    const para = inputOf("no-headings").pages!;
    expect(para).toHaveLength(1);
    expect(para[0]).toHaveLength(2000);
    expect(para[0]).not.toContain("\n");
    for (const s of ["https://doi.org/10.1037/h0043158.", "doi:10.1000/XYZ)", "10.1/abc"]) expect(text("refs-with-dois")).toContain(s);
    expect(text("refs-with-dois").split("10.1037/h0043158").length - 1).toBeGreaterThan(1); // a duplicate
    expect(text("refs-with-dois")).toContain("HTTPS://DOI.ORG/"); // a doi.org URL in upper case (ruling 3)
    expect(DEVANAGARI.test(text("hindi-paper"))).toBe(true);
    expect(lines("hindi-paper")).toContain("References");
    expect(text("statistics")).toContain("p = .000"); // ruling 3
  });

  for (const p of fx.papers) it(`apBuild ${p.id}`, () => {
    // AP.doc is apBuild's object plus abstractOnly (apLoad 9886); sample is apBuild's false, which apLoad(..., false) keeps.
    const { abstractOnly, ...built } = p.doc;
    expect(abstractOnly).toBe(p.src === "abstract");
    expect(apBuild(p.title, p.pages, p.src)).toEqual(built);
    expect(JSON.stringify(apBuild(p.title, p.pages, p.src))).toBe(JSON.stringify(built)); // and v1's key order
  });
  for (const c of fx.picks) it(`apPick ${c.id} ${c.q.slice(0, 20)} (budget ${c.budget})`, () => expect(apPick(docOf(c.id), c.q, c.terms, c.budget)).toEqual(c.out));
  for (const c of fx.quotes) it(`apCheckQuote ${c.q.slice(0, 20)}`, () => expect(apCheckQuote(docOf(c.id), c.q)).toEqual(c.out));
  for (const p of fx.papers) it(`apNumbers ${p.id}`, () => expect(apNumbers(docOf(p.id))).toEqual(p.numbers));
  for (const p of fx.papers) it(`apRefDois ${p.id}`, () => expect(apRefDois(docOf(p.id))).toEqual(p.dois));
  it("the sample paper's two statistics are judged ok (t(58) = 2.36, p = .022; r(58) = .31, p = .016)", () => expect(apNumbers(apBuild(AP_SAMPLE[0]!.split("\n")[0]!, [...AP_SAMPLE], "pdf")).map((x) => x.ok)).toEqual([true, true]));
  it("AP_HEADS source and flags equal v1's", () => {
    expect(AP_HEADS.source).toBe(fx.heads.source);
    expect(AP_HEADS.flags).toBe(fx.heads.flags);
  });

  it("the picks are the brief's calls: the sample-size question on every paper, the twelve stages as apWalkShow asks them, and the gap question on no-headings", () => {
    const ask = fx.picks.filter((c) => c.q === "what was the sample size");
    expect(ask.map((c) => [c.id, c.terms, c.budget])).toEqual(IDS.map((id) => [id, "", 9000]));
    for (const budget of [10000, 2000]) expect(fx.picks.filter((c) => c.id === "sample" && c.budget === budget).map((c) => [c.q, c.terms])).toEqual(AP_STAGES.map((st) => [st.name + " " + st.brief, st.terms]));
    expect(fx.picks.some((c) => c.id === "no-headings" && c.q === "gap" && c.terms === "" && c.budget === 500)).toBe(true);
  });
  it("the boundaries the extra picks are built on hold: a budget equal to the first chunk, a total equal to budget x 1.5, and words that stand in one chunk each", () => {
    expect(docOf("pdf-three-pages").chunks[0]!.text).toHaveLength(40);
    expect(docOf("caps-blank-page").chars).toBe(402 * 1.5);
    const at = (id: string, budget: number) => fx.picks.find((c) => c.id === id && c.budget === budget && c.q === "")!.out;
    expect(at("pdf-three-pages", 40).n).toBe(1);
    expect(at("caps-blank-page", 402).partial).toBe(false);
    expect(at("caps-blank-page", 401).partial).toBe(true);
    const where = (w: string) => docOf("pdf-three-pages").chunks.flatMap((c, i) => (c.text.toLowerCase().includes(w) ? [i] : []));
    expect([where("lessons"), where("small"), where("random")]).toEqual([[5], [5], [3]]);
  });
  it("the corpus reaches each branch of apBuild, apPick, apCheckQuote, apNumbers and apRefDois", () => {
    const docs = fx.papers.map((p) => p.doc);
    const chunks = docs.flatMap((d) => d.chunks);
    expect(docs.some((d) => d.paged) && docs.some((d) => !d.paged)).toBe(true);
    expect(docs.some((d) => d.refsCut) && docs.some((d) => !d.refsCut)).toBe(true);
    expect(chunks.some((c) => c.sec === "") && chunks.some((c) => c.sec === "Bibliography" && c.ref)).toBe(true);
    expect(chunks.some((c) => c.text.length === 2)).toBe(true); // a chunk of two characters is kept (caps-blank-page's running "12")
    expect(inputOf("caps-blank-page").pages!.some((pg) => pg.trim() === "")).toBe(true); // a page of white space only
    expect(docOf("caps-blank-page").sections.map((s) => s.name)).toEqual(["Abstract", "Introduction", "Methods", "Results", "Bibliography"]); // ALL-CAPS headings
    expect(inputOf("caps-blank-page").pages![2]).toBe("3");
    expect(inputOf("pdf-one-page").pages).toHaveLength(1);
    expect(docOf("pdf-one-page").paged).toBe(true); // a PDF of one page is paged by its src alone
    expect(docOf("caps-blank-page").chunks.some((c) => c.page === 2 || c.page === 3)).toBe(false); // nothing from the blank page, and a one-character page is dropped
    // a chunk cut inside a section, its buffer at 700 characters or more (the text and a space), on each of the four line ends v1 cuts at: the next chunk has the same page and section
    const cuts = docs.flatMap((d) => d.chunks.filter((c, i) => {
      const next = d.chunks[i + 1];
      return next !== undefined && c.text.length >= 699 && next.page === c.page && next.sec === c.sec;
    }));
    for (const end of [".", "?", ")", "!"]) expect(cuts.some((c) => c.text.endsWith(end)), end).toBe(true);
    // and at exactly 700: pdf-one-page's Method holds lines of 599 and 99 characters (with the space after each, a buffer of 700) and is cut there; its Results holds 599 and 98 (699) and is not
    const one = inputOf("pdf-one-page").pages![0]!.split("\n");
    const [m1, m2, m3] = one.slice(one.indexOf("Method") + 1);
    const [r1, r2, r3] = one.slice(one.indexOf("Results") + 1);
    expect([m1!.length, m2!.length, r1!.length, r2!.length]).toEqual([599, 99, 599, 98]);
    expect(docOf("pdf-one-page").chunks.filter((c) => c.sec === "Method").map((c) => c.text)).toEqual([m1 + " " + m2, m3]);
    expect(docOf("pdf-one-page").chunks.filter((c) => c.sec === "Results").map((c) => c.text)).toEqual([r1 + " " + r2 + " " + r3]);
    // and a line past 700 that ends in a danda, which v1 does not cut at: the next line stays in the same chunk
    const hindiLines = inputOf("hindi-paper").pages![0]!.split("\n");
    const danda = hindiLines.findIndex((l, i) => l.endsWith("\u0964") && hindiLines.slice(0, i + 1).join(" ").length >= 700);
    expect(danda).toBeGreaterThan(0);
    expect(docOf("hindi-paper").chunks[0]!.text.endsWith(hindiLines[danda + 1]!)).toBe(true);
    expect(fx.picks.some((c) => c.out.partial) && fx.picks.some((c) => !c.out.partial)).toBe(true);
    expect(fx.picks.some((c) => c.out.partial && c.out.n === 0)).toBe(true);
    expect(fx.picks.some((c) => c.out.partial && c.out.n > 0 && c.out.n < c.out.of)).toBe(true);
    const outcomes = fx.quotes.map((c) => c.out.ok ? (c.out.page ? "page" : c.out.sec ? "section" : "text") : c.out.why);
    expect([...new Set(outcomes)].sort()).toEqual(["not found", "page", "section", "text", "too short to check"]);
    const numbers = fx.papers.flatMap((p) => p.numbers);
    expect(numbers.some((x) => x.ok) && numbers.some((x) => !x.ok)).toBe(true);
    expect([...new Set(numbers.map((x) => x.rep.op))].sort()).toEqual(["<", "=", ">"]);
    expect(numbers.some((x) => x.label.startsWith("chi2"))).toBe(true);
    // a statistic written twice is listed once (de-duplication by label)
    const stats = paperOf("statistics");
    expect(inputOf("statistics").pages![0]!.split("t(58) = 2.36, p = .022").length - 1).toBe(2);
    expect(stats.numbers.filter((x) => x.label === "t(58) = 2.36, p = .022")).toHaveLength(1);
    expect(paperOf("refs-with-dois").dois).toContain("10.1037/h0043158");
    expect(docOf("refs-with-dois").chunks.filter((c) => c.ref).map((c) => c.sec)).toEqual(["References", "References", "Bibliography"]); // three pieces of list, joined by apRefDois
    expect(fx.noDoc).toEqual({ numbers: [], dois: [] });
  });
});

describe("the helpers called by themselves", () => {
  for (const c of fx.headNames) it(`apHeadName(${JSON.stringify(c.line)})`, () => expect(apHeadName(c.line)).toBe(c.out));
  for (const c of fx.toks) it(`apToks(${JSON.stringify(c.s)})`, () => expect(apToks(c.s)).toEqual(c.out));
  for (const c of fx.squash) it(`apSquash(${JSON.stringify(c.s)})`, () => expect(apSquash(c.s)).toBe(c.out));
  for (const c of fx.json) it(`apJson(${JSON.stringify(c.s)})`, () => expect(apJson(c.s)).toEqual(c.out));
  for (const c of fx.retr) it(`${c.fn}(${JSON.stringify(c.s)})`, () => expect(RETR[c.fn](c.s)).toBe(c.out));
  it("the brief's counts: 20 heading lines, 6 strings, the brief's five replies first", () => {
    expect(fx.headNames).toHaveLength(20);
    expect(fx.toks).toHaveLength(6);
    expect(fx.squash.map((c) => c.s)).toEqual(fx.toks.map((c) => c.s));
    expect(fx.json.slice(0, 5).map((c) => c.s)).toEqual(['{"a":1}', '```json {"a":1} ```', "no json", "{bad", 'text {"x":[1,2]} tail']);
  });
  it("with no paper loaded v1 returns no numbers and no DOIs; the port keeps the guard", () => {
    expect(apNumbers(null as unknown as ApDoc)).toEqual(fx.noDoc.numbers);
    expect(apRefDois(null as unknown as ApDoc)).toEqual(fx.noDoc.dois);
  });
});

describe("generated analyse tables equal v1's", () => {
  const t = readFixture<{ tables: Record<string, unknown> }>("analyse", "tables");
  for (const [name, value] of Object.entries({ AP_STAGES, AP_STOP: [...AP_STOP], AP_NAME, AP_SAMPLE })) it(name, () => expect(JSON.stringify(value)).toBe(JSON.stringify(t.tables[name])));
  it("the fixture holds these four tables and no other, and analyse.ts exports the generated ones", () => {
    expect(Object.keys(t.tables)).toEqual(["AP_STAGES", "AP_STOP", "AP_NAME", "AP_SAMPLE"]);
    expect(AP_STAGES).toBe(TABLES.AP_STAGES);
    expect(AP_NAME).toBe(TABLES.AP_NAME);
    expect(AP_SAMPLE).toBe(TABLES.AP_SAMPLE);
    expect([...AP_STOP]).toEqual([...TABLES.AP_STOP]);
  });
  it("twelve stages, three sample pages", () => {
    expect(AP_STAGES).toHaveLength(12);
    expect(AP_SAMPLE).toHaveLength(3);
  });
});
