import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { docTextContent } from "../../src/doctext";
import { ncFind, ncFmtP, ncJudge, ncPOf, numbersCheck, numbersCheckHtml, numbersSummary } from "../../src/numbers";
import type { NcFind, NcJudge, NcNote } from "../../src/numbers";
import { readFixture } from "./harness/fixture";

/**
 * numbers.ts (v1 12195-12257, the Numbers check) against v1 running. Every expected value is read from test/golden/numbers/cases.json (`golden:capture numbers`), which holds, for each entry of the
 * hand-written sentences.json, v1's ncFind and ncJudge results and the counts that ncOpen (12351-12367) showed in the dialog, plus ncPOf called by itself and ncFmtP's outputs.
 * What is typed here is what the brief and the register spell out: the F5 and split-paragraph literals, the anchor ids, the corpus minimums, the kinds of the ncPOf grid and the rule that warn counts every item that is not ok.
 */

type Case = { id: string; text?: string; html?: string; textContent?: string; find: NcFind[]; judged: NcJudge[] };
type Shown = { id: string; shown: string; n: number; ok: number; warn: number; err: number };
type Pof = { f: Pick<NcFind, "kind" | "df1" | "df2">; x: number; out?: number };
type Item = ReturnType<typeof numbersCheck>[number];

const fx = readFixture<{ cases: Case[]; pof: Pof[]; fmt: Array<{ p: number; out: string }>; summary: Shown[] }>("numbers", "cases");
const corpus = JSON.parse(readFileSync(new URL("./numbers/sentences.json", import.meta.url), "utf8")) as Array<{ id: string; text?: string; html?: string }>;
const byId = (id: string) => fx.cases.find((c) => c.id === id)!;
const itemsOf = (c: Case): Item[] => (c.html !== undefined ? numbersCheckHtml(c.html) : numbersCheck(c.text!));
/** An item without its judgement. (`({ j, ...f }) => f` would trip no-unused-vars, which does not ignore rest siblings.) */
const foundOf = (item: Item): NcFind => {
  const f: Partial<Item> = { ...item };
  delete f.j;
  return f as NcFind;
};

const ANCHORS = ["t-ok", "t-round-edge", "t-onetail", "t-typo", "t-unicode-minus", "t-fractional-df", "t-zero-df", "F-ok", "F-huge-F5", "F-p-zero", "F-p-over-one", "chi-spellings", "H-ok", "r-ok", "r-leq", "z-ok", "z-geq", "two-in-one", "none", "split-paragraphs-html"];
const KINDS = ["F", "H", "chi", "r", "t", "z"];
const NOTES = ["nc_c_form", "nc_c_df", "nc_c_zero", "nc_c_onetail", "nc_c_round", "nc_c_typo"];

describe("numbers.ts is v1's Numbers check", () => {
  it("the corpus has the brief's anchors, 80 entries or more, and the fixture was captured from exactly this corpus", () => {
    for (const id of ANCHORS) expect(corpus.some((e) => e.id === id), id).toBe(true);
    expect(corpus.length).toBeGreaterThanOrEqual(80);
    expect(fx.cases.map((c) => (c.html !== undefined ? { id: c.id, html: c.html } : { id: c.id, text: c.text }))).toEqual(corpus);
  });
  for (const c of fx.cases) it(c.id, () => {
    const items = itemsOf(c);
    expect(items.map(foundOf)).toEqual(c.find);
    expect(items.map((i) => i.j)).toEqual(c.judged);
    // The pieces by themselves, on the text v1 read: a sentence as it stands, a body as the editor's textContent.
    if (c.html !== undefined) expect(docTextContent(c.html)).toBe(c.textContent);
    const found = ncFind(c.html !== undefined ? c.textContent! : c.text!);
    expect(found).toEqual(c.find);
    expect(found.map((f) => ncJudge(f))).toEqual(c.judged);
  });
  it("the corpus reaches every note id, every status and every kind, and at least six entries for each kind", () => {
    const notes = new Set(fx.cases.flatMap((c) => c.judged.map((j) => j.note)));
    for (const n of NOTES) expect(notes.has(n as NcNote), n).toBe(true);
    expect([...new Set(fx.cases.flatMap((c) => c.judged.map((j) => j.status)))].sort()).toEqual(["error", "ok", "warn"]);
    const kinds = new Set(fx.cases.flatMap((c) => c.find.map((f) => f.kind)));
    expect([...kinds].sort()).toEqual(KINDS);
    for (const k of KINDS) expect(fx.cases.filter((c) => c.find.some((f) => f.kind === k)).length, k).toBeGreaterThanOrEqual(6);
  });
  it("ncPOf gives the judged pcalc at the absolute statistic for every item the corpus judges", () => {
    for (const c of fx.cases) c.find.forEach((f, i) => {
      const pcalc = c.judged[i]!.pcalc;
      if (pcalc !== undefined && !Number.isNaN(pcalc)) expect(ncPOf(f, Math.abs(f.stat)), `${c.id}[${i}]`).toBe(pcalc);
    });
  });
  // ncPOf by itself: the signs ncJudge never passes, r's clip, and a kind the switch does not know, which is undefined in v1 (the record has no out).
  for (const c of fx.pof) it(`ncPOf(${c.f.kind}, ${c.x})`, () => expect(ncPOf(c.f, c.x)).toBe(c.out));
  it("the ncPOf grid has every kind, a negative statistic for each, and a kind that gives undefined", () => {
    expect([...new Set(fx.pof.map((c) => c.f.kind))].sort()).toEqual(["F", "H", "chi", "r", "t", "x", "z"]);
    for (const k of KINDS) expect(fx.pof.some((c) => c.f.kind === k && c.x < 0), k).toBe(true);
    expect(fx.pof.filter((c) => c.out === undefined).map((c) => c.f.kind)).toEqual(["x"]);
  });
  it("F(3, 50) = 200, p < .001 is ok with pcalc exactly 0 (F5)", () => {
    const [i] = numbersCheck("F(3, 50) = 200, p < .001");
    expect(i!.j).toEqual({ status: "ok", note: "", pcalc: 0, pLo: 0, pHi: 0 });
  });
  it("a statistic split across paragraphs is read from textContent, glued (v1 ncOpen)", () => {
    const items = numbersCheckHtml("<p>t(58) = 2.36, p</p><p>= .022</p>");
    expect(items).toHaveLength(1); expect(items[0]!.raw).toBe("t(58) = 2.36, p= .022");
  });
  it("register row D-W1-1: with no separator between blocks, a statistic that opens a paragraph is lost after a paragraph that ends in a letter or digit", () => {
    expect(byId("html-glued-boundary").find).toHaveLength(0);
    expect(byId("html-paragraph-starts-statistic").find).toHaveLength(1);
  });
  for (const c of fx.fmt) it(`ncFmtP(${c.p})`, () => expect(ncFmtP(c.p)).toBe(c.out));
  it("ncFmtP is recorded for the brief's values", () => {
    expect(fx.fmt.map((c) => c.p)).toEqual(expect.arrayContaining([NaN, Infinity, 0, 0.0004, 0.001, 0.05, 0.5, 1]));
  });
});

describe("numbersSummary counts as ncOpen does", () => {
  // The brief expected { n: 2, ok: 1, warn: 1, err: 1 } for "t(30) = 2.04, p = .250 and t(58) = 2.36, p = .022". The line ncOpen shows for it (two-stats-typo-ok) says 0 change the conclusion:
  // t(30) = 2.04 recomputes to p = .0502, so .250 and .0502 are both above .05 and that item is a warning, not an error. two-stats-error-ok and three-stats-mixed have items that are errors.
  it("the fixture has the line ncOpen showed for every case", () => expect(fx.summary.map((s) => s.id)).toEqual(fx.cases.map((c) => c.id)));
  for (const s of fx.summary) it(`${s.id}: ${s.n} found, ${s.ok} ok, ${s.warn} not ok, ${s.err} error`, () => {
    expect(numbersSummary(itemsOf(byId(s.id)))).toEqual({ n: s.n, ok: s.ok, warn: s.warn, err: s.err });
  });
  it("warn is every item that is not ok, errors included, and the corpus has a text with an error beside a warning that is not one", () => {
    for (const s of fx.summary) expect(s.warn, s.id).toBe(s.n - s.ok);
    expect(fx.summary.some((s) => s.err > 0 && s.warn > s.err)).toBe(true);
  });
});
