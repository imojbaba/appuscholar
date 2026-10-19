import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { escHTML } from "../../src/html";
import { statsParseText } from "../../src/intake";
import { STAT_TESTS, stkMRData } from "../../src/stats-core";
import type { StatsBlock, StatsCtx, StatsOk, StatsResult } from "../../src/stats-core";
import { stkLogit } from "../../src/statsmath";
import { runStats } from "../../src/stats";
import { fmtP } from "../../src/statfmt";
import type { CapturedRun } from "./stats/drive";
import { corpusFiles, readCorpus } from "./stats/capture";
import { asInnerHTML, blockAsText, decodeText, renderResultsText } from "./stats/render";
import { expectGolden, goldenMode } from "./harness/compare";
import { readFixture } from "./harness/fixture";
import { HEAVY_CASE_MS, SLOW_CASES, cellsOf, expectSameAsV1 } from "./stats/check";

/**
 * The Statistics Lab (stats-core.ts, stats.ts and the runner modules) against v1 running: for every `test/golden/stats/<test>.json` (`golden:capture stats`), each case's CSV goes through
 * statsParseText and runStats with the form v1's page held, and the result is held to what v1 showed. A toast is the same string; otherwise the sentence is the same string, the blocks are
 * the same kinds in the same order with the same decoded text (a table cell by cell), and the whole results text, rendered by stats/render.ts, is #statsResults's text.
 * Typed here are only the register's own claims, checked against the fixture: D-W2-4 (the doubled "left out" count) and F22 (a column named undefined), and the guards that a fixture holds
 * the cases its brief named and was captured from its corpus as it is on disk.
 */

const fixtures = corpusFiles().map((f) => f.replace(/\.json$/, ""));
const load = (file: string) => readFixture<{ cases: CapturedRun[] }>("stats", file);
const run = (c: CapturedRun) => runStats(statsParseText(c.csv)!, c.test, c.form);

const REQUIRED: Record<string, string[]> = {
  desc: ["desc-demo-score", "desc-one-value", "desc-text-in-numeric", "desc-hindi-column-name", "desc-column-named-undefined", "desc-negative-decimals"],
  ttest1: ["ttest1-demo", "ttest1-mu-empty", "ttest1-mu-text", "ttest1-all-same", "ttest1-one-value", "ttest1-text-in-numeric", "ttest1-n3", "ttest1-n2-assumptions-skip"],
  ttestInd: ["ttestInd-demo", "ttestInd-text-in-numeric", "ttestInd-integer-labels", "ttestInd-two-integer-labels", "ttestInd-group-named-NaN", "ttestInd-one-value-in-a-group",
    "ttestInd-no-spread-both", "ttestInd-no-spread-one", "ttestInd-unequal-n"],
  ttestPaired: ["ttestPaired-demo", "ttestPaired-text-in-numeric", "ttestPaired-same-diffs", "ttestPaired-missing-cells", "ttestPaired-n2"],
  anova1: ["anova1-demo", "anova1-text-in-numeric", "anova1-two-groups", "anova1-one-row-group", "anova1-no-spread", "anova1-six-groups", "anova1-hindi-labels"],
  tukey: ["tukey-demo-arms", "tukey-text-in-numeric", "tukey-integer-labels", "tukey-two-groups", "tukey-six-groups", "tukey-f5-exact-zero"],
  regression: ["regression-demo", "regression-text-in-numeric", "regression-exact-line", "regression-no-spread-x", "regression-n2", "regression-negative-slope"],
  pearson: ["pearson-demo", "pearson-text-in-numeric", "pearson-n3", "pearson-perfect", "pearson-negative", "pearson-no-spread"],
  mannwhitney: ["mannwhitney-demo", "mannwhitney-integer-labels", "mannwhitney-decimal-ties", "mannwhitney-ties", "mannwhitney-n50", "mannwhitney-all-same", "mannwhitney-three-groups"],
  wilcoxon: ["wilcoxon-demo", "wilcoxon-decimal-ties", "wilcoxon-zero-diffs", "wilcoxon-one-diff", "wilcoxon-n50"],
  kruskal: ["kruskal-demo", "kruskal-group-column-named-group", "kruskal-non-significant", "kruskal-small-group", "kruskal-all-same", "kruskal-two-groups"],
  spearman: ["spearman-demo", "spearman-tiny-p", "spearman-text-dropped-uncounted", "spearman-n4", "spearman-n9", "spearman-perfect-negative"],
  welchAnova: ["welchAnova-demo", "welchAnova-non-significant", "welchAnova-constant-group", "welchAnova-two-groups", "welchAnova-text-in-numeric", "welchAnova-hindi-labels", "welchAnova-f5-exact-zero"],
  chisq: ["chisq-demo", "chisq-integer-labels", "chisq-2x2-small-expected", "chisq-2x2-empty-cell", "chisq-3x3-sparse", "chisq-3x4-sparse-large-N", "chisq-one-value-column",
    "chisq-hindi-categories"],
  gof: ["gof-demo", "gof-expected-shares", "gof-expected-bad", "gof-expected-missing-category", "gof-two-categories-small", "gof-three-categories-small", "gof-one-category"],
  mcnemar: ["mcnemar-yes-no", "mcnemar-pos-given", "mcnemar-pos-unknown", "mcnemar-no-changers", "mcnemar-nd25", "mcnemar-three-answers", "mcnemar-same-column"],
  cochran: ["cochran-four-conditions", "cochran-non-significant", "cochran-two-columns", "cochran-all-same", "cochran-nine-columns"],
  friedman: ["friedman-four-conditions", "friedman-ties", "friedman-all-same", "friedman-n2", "friedman-two-columns", "friedman-missing-row"],
  anova2: ["anova2-2x2-balanced", "anova2-2x3-unbalanced", "anova2-integer-labels", "anova2-interaction-significant", "anova2-main-effect-3-levels", "anova2-same-factor-twice",
    "anova2-one-level", "anova2-seven-levels", "anova2-empty-cell", "anova2-dfe-zero", "anova2-no-spread", "anova2-text-in-numeric", "anova2-f5-tukey-floor"],
  mregress: ["mregress-two-numeric", "mregress-categorical-3-levels", "mregress-ref-given", "mregress-step2", "mregress-step2-no-step1", "mregress-one-predictor",
    "mregress-thirteen-columns", "mregress-few-rows", "mregress-collinear", "mregress-exact-fit", "mregress-vif-high", "mregress-small-level", "mregress-missing-rows",
    "mregress-dv-ticked-as-predictor", "mregress-step1-categorical-3-levels"],
  logistic: ["logistic-evidence-05", "logistic-yes-no-outcome", "logistic-pos-given", "logistic-categorical-predictor", "logistic-ref-given", "logistic-separation",
    "logistic-collinear", "logistic-few-events", "logistic-no-predictor", "logistic-epv-note", "logistic-three-answers", "logistic-missing-rows", "logistic-one-answer-in-rows-used",
    "logistic-separation-cutoffs", "logistic-copy-of-outcome"],
  rmanova: ["rmanova-three-conditions", "rmanova-four-conditions-gg", "rmanova-hf", "rmanova-non-significant", "rmanova-pair-no-spread", "rmanova-n-le-k", "rmanova-same-change",
    "rmanova-two-columns", "rmanova-missing-row", "rmanova-nine-columns"],
  alpha: ["alpha-demo", "alpha-no-reverse", "alpha-rev-not-found", "alpha-rev-no-range", "alpha-rev-bad-range", "alpha-two-items", "alpha-n4", "alpha-constant-item",
    "alpha-negative-item", "alpha-weak-item", "alpha-above-95", "alpha-n-under-30", "alpha-large-boot-200"],
  mixed: ["mixed-two-groups-two-times", "mixed-two-groups-three-times", "mixed-three-groups-unequal", "mixed-integer-labels", "mixed-interaction-significant", "mixed-one-group",
    "mixed-group-of-one", "mixed-seven-groups", "mixed-one-column", "mixed-group-column-ticked", "mixed-no-variation", "mixed-missing-row"],
  moderate: ["moderate-significant", "moderate-everywhere-significant", "moderate-nowhere-significant", "moderate-one-root", "moderate-n9", "moderate-same-columns",
    "moderate-no-spread-w", "moderate-w-copy-of-x", "moderate-exact-fit", "moderate-n-under-50", "moderate-missing-rows"],
  mediate: ["mediate-significant", "mediate-non-significant", "mediate-n19", "mediate-no-spread", "mediate-m-copy-of-x", "mediate-exact-path", "mediate-n-under-100",
    "mediate-same-n-different-data"],
};

const skippedSlow: string[] = [];
/** The one case whose step 1 v2 computes differently from v1 by an approved fix (register row D-W2-18): a 3-level categorical in step 1. */
const DW2_18_CASE = "mregress-step1-categorical-3-levels";
/** expectSameAsV1 for DW2_18_CASE: block 0 (the step table) must differ from v1's, the sentence must equal v1's up to its step sentence and differ in it, every other block equals v1's. */
function expectSameAsV1ExceptStep1(c: CapturedRun, r: StatsResult, mode: ReturnType<typeof goldenMode>): void {
  expect(c.toasts).toEqual([]);
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  const [head, step] = r.apa.split(" In step 1, "), [v1Head, v1Step] = c.apa!.split(" In step 1, ");
  expect(head).toBe(v1Head);
  expect(step).toBeDefined();
  expect(step).not.toBe(v1Step);
  expect(r.blocks.map((b) => b.kind)).toEqual(c.blocks.map((b) => b.kind));
  expect(cellsOf(r.blocks[0]!)).not.toEqual(cellsOf(c.blocks[0]!));
  r.blocks.forEach((b, i) => { if (i > 0) expectGolden(cellsOf(b), cellsOf(c.blocks[i]!), mode, `${c.id} block ${i} cells`); });
}

for (const file of fixtures) {
  describe(`stats: ${file}`, () => {
    const fx = load(file);
    const mode = goldenMode(fx);
    it("the fixture was captured from this corpus as it is on disk", () => {
      const given = (c: { id: string; csv: string; test: string; values?: unknown; ticked?: unknown }) => ({ id: c.id, csv: c.csv, test: c.test, values: c.values, ticked: c.ticked });
      expect(fx.cases.map(given)).toEqual(readCorpus(`${file}.json`).map(given));
      for (const id of REQUIRED[file] ?? []) expect(fx.cases.some((c) => c.id === id), id).toBe(true);
    });
    for (const c of fx.cases) {
      if (SLOW_CASES.includes(c.id)) { skippedSlow.push(c.id); continue; }
      // Register row D-W2-18 (approved): v2 fits step 1 on every design column of block 1, so this one case's step table, its step sentence and the results text differ from v1's
      // fixture by design; it is checked against v1 everywhere else, and against numpy in stats-scipy.test.ts, by the test "D-W2-18 (approved)" below
      if (c.id === DW2_18_CASE) { it(`${c.id} (D-W2-18: equal to v1 except step 1)`, () => expectSameAsV1ExceptStep1(c, run(c), mode)); continue; }
      it(c.id, () => expectSameAsV1(c, run(c), mode), HEAVY_CASE_MS[c.id]); // the two heavy ids (stats/check.ts) get 30 s, the rest vitest's default
    }
  });
}
describe("stats: the slow cases", () => {
  it("the loops above skip exactly the slow cases, which stats-slow.test.ts runs", () => expect(skippedSlow).toEqual([...SLOW_CASES]));
});

describe("stats/render.ts (the test-only renderer)", () => {
  it("decodeText strips real tags only, so fmtP's literal < before a </b> stays", () => {
    expect(decodeText("<b>Fisher-Freeman-Halton exact test: " + fmtP(0.0001) + ".</b> All 12 tables")).toBe("Fisher-Freeman-Halton exact test: p < .001. All 12 tables");
    expect(decodeText('<p class="desc">a &lt; b &amp;amp; <i>c</i>&nbsp;&#39;d&#39; &quot;e&quot;</p>')).toBe("a < b &amp; c\u00a0'd' \"e\"");
  });
  it("asInnerHTML is what jsdom's serialiser makes of v1's fragments in a cell, except a raw &, which it keeps (a port cell that lost escHTML)", () => {
    const td = new JSDOM("<!doctype html><table><tr><td></td></tr></table>").window.document.querySelector("td")!;
    const dom = (html: string) => { td.innerHTML = html; return td.innerHTML; };
    for (const html of [escHTML(`Tom's <score> & "more"`), "A&amp;B", "&lt;ctl&gt;", "&lt; .001", "< .001", "<b>p < .001</b> a > b", "a&nbsp;b &amp;lt;", "x<sub>2</sub>", "ω² = .12 — 1.00", ""])
      expect(asInnerHTML(html), JSON.stringify(html)).toBe(dom(html));
    expect([asInnerHTML(escHTML(`Tom's "x"`)), dom(escHTML(`Tom's "x"`))]).toEqual([`Tom's "x"`, `Tom's "x"`]);
    expect([asInnerHTML("A&B"), dom("A&B")]).toEqual(["A&B", "A&amp;B"]);
    // D-W2-6: the port's Tukey p cell is v1's raw `< .001`, which v1's DOM recorded as `&lt; .001`; Games-Howell's pCell `&lt; .001` is recorded as it is
    const tk = load("tukey").cases.find((x) => x.id === "tukey-demo-arms")!, tr = run(tk);
    const tkPort = tr.ok ? (tr.blocks[0] as { rows: string[][] }).rows.slice(1).map((x) => x[3]!) : [];
    expect(tkPort).toEqual(["< .001", "< .001", "< .001"]);
    expect(tkPort.map(asInnerHTML)).toEqual((tk.blocks[0] as { rows: string[][] }).rows.slice(1).map((x) => x[3]));
    const gh = load("welchAnova").cases.find((x) => x.id === "welchAnova-demo")!, gr = run(gh);
    const ghPort = gr.ok ? (gr.blocks[2] as { rows: string[][] }).rows.slice(1).map((x) => x[4]!) : [];
    expect(ghPort.filter((x) => x === "&lt; .001").length).toBeGreaterThan(0);
    expect(ghPort.map(asInnerHTML)).toEqual((gh.blocks[2] as { rows: string[][] }).rows.slice(1).map((x) => x[4]));
  });
});

describe("stats: the frame", () => {
  it("STAT_TESTS equals v1's table, in v1's key order", () => {
    const v1 = readFixture<{ tables: { STAT_TESTS: Record<string, unknown> } }>("stats", "tables").tables.STAT_TESTS;
    expect(STAT_TESTS).toEqual(v1);
    expect(Object.keys(STAT_TESTS)).toEqual(Object.keys(v1));
    expect(Object.keys(STAT_TESTS)).toHaveLength(26);
  });
  it("ttest1-text-in-numeric: the note says 4 entries, twice the two dropped (Review Focus 1, register D-W2-4)", () => {
    const c = load("ttest1").cases.find((x) => x.id === "ttest1-text-in-numeric")!;
    const last = c.blocks[c.blocks.length - 1]!;
    expect(last.kind === "note" && last.html.startsWith("4 entries")).toBe(true);
    const r = run(c);
    expect(r.ok && r.skipped).toBe(4);
    const d = load("desc").cases.find((x) => x.id === "desc-text-in-numeric")!;
    const dl = d.blocks[d.blocks.length - 1]!;
    expect(dl.kind === "note" && dl.html.startsWith("2 entries")).toBe(true); // desc has no assumption pass, so its count is not doubled
    expect(run(d)).toMatchObject({ ok: true, skipped: 2 });
  });
  it("desc-column-named-undefined is suppressed by the safety net (F22)", () => {
    const c = load("desc").cases.find((x) => x.id === "desc-column-named-undefined")!;
    expect(c.apa).toBeNull();
    expect(c.toasts).toEqual([]);
    expect(c.blocks).toHaveLength(1);
    expect(run(c)).toMatchObject({ ok: false, reason: "undefined" });
  });
  it("values are the numbers behind the table cells (register row F27: the charts' data)", () => {
    const fixed = (x: number) => x.toFixed(2);
    for (const c of load("desc").cases) {
      const r = run(c);
      if (!r.ok) continue;
      const v = r.values, row = (r.blocks[0] as { rows: string[][] }).rows[1]!;
      expect(row).toEqual([String(v.n), fixed(v.m!), fixed(v.s!), fixed(v.md!), fixed(v.min!), fixed(v.max!)]);
    }
    for (const c of load("ttest1").cases) {
      const r = run(c);
      if (!r.ok) continue;
      const v = r.values, row = (r.blocks[0] as { rows: string[][] }).rows[1]!;
      expect(row.slice(0, 6)).toEqual([fixed(v.m!), fixed(v.s!), String(v.n), String(v.mu), fixed(v.t!), String(v.df)]);
      expect(blockAsText(r.blocks[1]!)).toBe(`Mean difference ${fixed(v.m! - v.mu!)}, 95% CI [${fixed(v.dlo!)}, ${fixed(v.dhi!)}], Cohen's d = ${fixed(v.dEff!)}.`);
      expect(r.apa).toContain(v.p! < 0.001 ? "p < .001" : `p = ${v.p!.toFixed(3).replace(/^0\./, ".")}`);
    }
  });
  it("a key v1 does not know gets the catch toast (register row D-W2-3); every one of the 26 keys has its branch", () => {
    const data = statsParseText("score\n1\n2\n3")!;
    const toast = "Could not run that test — check the columns you picked match what the test needs";
    expect(runStats(data, "nope" as "desc", { values: { dv: "0" }, ticked: {} })).toEqual({ ok: false, test: "nope", reason: "toast", toast });
    // Since Task 9 all 26 keys dispatch, so no real key falls through to this toast: every key has a fixture whose cases ran (the loops above), and the three last ported refuse a
    // one-column form with their own first toast, not the catch toast.
    expect(Object.keys(STAT_TESTS).filter((k) => !fixtures.includes(k))).toEqual([]);
    expect(runStats(data, "moderate", { values: { dv: "0", x: "0", w: "0" }, ticked: {} })).toEqual({ ok: false, test: "moderate", reason: "toast", toast: "Choose three different columns for Y, X and W" });
    expect(runStats(data, "mediate", { values: { dv: "0", x: "0", m: "0" }, ticked: {} })).toEqual({ ok: false, test: "mediate", reason: "toast", toast: "Choose three different columns for X, M and Y" });
    expect(runStats(data, "mixed", { values: { grp: "" }, ticked: { items: [0] } })).toEqual({ ok: false, test: "mixed", reason: "toast", toast: "Tick at least 2 columns, one for each time point or condition." });
  });
  it("desc-one-left-out: one dropped entry gives the singular note (11994)", () => {
    const c = load("desc").cases.find((x) => x.id === "desc-one-left-out")!;
    const last = c.blocks[c.blocks.length - 1]!;
    expect(last.kind === "note" && last.html.startsWith("1 entry that is")).toBe(true);
    expect(run(c)).toMatchObject({ ok: true, skipped: 1 });
  });
});

describe("stats: tests on means (ttestInd, ttestPaired, anova1, tukey, regression, pearson)", () => {
  const find = (file: string, id: string) => load(file).cases.find((x) => x.id === id)!;
  const lastNote = (c: CapturedRun) => { const b = c.blocks[c.blocks.length - 1]!; return b.kind === "note" ? b.html : ""; };
  it("F4: integer-like group labels come out in object-key order", () => {
    const c = find("ttestInd", "ttestInd-two-integer-labels");
    expect((c.blocks[0] as { rows: string[][] }).rows.map((r) => r[0])).toEqual(["Group", "2", "10"]);
    const r = run(c);
    expect(r.ok && r.values.m1! < r.values.m2! && r.values.t! < 0).toBe(true);
    const t = find("tukey", "tukey-integer-labels");
    expect((t.blocks[0] as { rows: string[][] }).rows.slice(1).map((x) => x[0])).toEqual(["2 vs 3", "2 vs 10", "3 vs 10"]);
    expect(find("ttestInd", "ttestInd-integer-labels").toasts).toEqual(["This grouping variable needs exactly 2 groups — it has 4"]);
  });
  it("D-W2-4: the left-out count is doubled where the assumption pass calls statsGroupBy again, and not for the pair filters", () => {
    for (const [file, n] of [["ttestInd", 4], ["anova1", 4], ["tukey", 4], ["ttestPaired", 2], ["regression", 2], ["pearson", 2]] as const) {
      const c = find(file, `${file}-text-in-numeric`);
      expect(lastNote(c), file).toBe(`${n} entries that are not a number were left out.`);
      expect(run(c), file).toMatchObject({ ok: true, skipped: n });
    }
  });
  it("D-W2-6: the Tukey p cell is v1's raw < .001, the same text as the captured &lt; .001", () => {
    const c = find("tukey", "tukey-demo-arms");
    const r = run(c);
    const mine = r.ok ? (r.blocks[0] as { rows: string[][] }).rows : [];
    const v1 = (c.blocks[0] as { rows: string[][] }).rows;
    expect(mine.slice(1).map((x) => x[3])).toEqual(["< .001", "< .001", "< .001"]);
    expect(v1.slice(1).map((x) => x[3])).toEqual(["&lt; .001", "&lt; .001", "&lt; .001"]);
    expect(mine.slice(1).map((x) => decodeText(x[3]!))).toEqual(v1.slice(1).map((x) => decodeText(x[3]!)));
  });
  it("F5 at 12714 (Tukey HSD): with ten groups stkPtukey returns exactly 1, so every p (adjusted) is exactly 0, the cell < .001 and the sentence p < .001", () => {
    const c = find("tukey", "tukey-f5-exact-zero");
    const r = run(c);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ps = Object.entries(r.values).filter(([k]) => /^p_\d+_\d+$/.test(k));
    expect(ps).toHaveLength(45);
    for (const [k, p] of ps) expect(Object.is(p, 0), k).toBe(true);
    const v1 = (c.blocks[0] as { rows: string[][] }).rows.slice(1);
    expect(v1.map((x) => decodeText(x[3]!))).toEqual(Array(45).fill("< .001"));
    expect(c.apa!.match(/\(p < \.001\)/g)).toHaveLength(45);
    expect(r.apa).toBe(c.apa);
  }, HEAVY_CASE_MS["tukey-f5-exact-zero"]); // runs tukey-f5-exact-zero, one of the two heavy ids (stats/check.ts): 30 s, not the 5 s default
  it("ttestInd-group-named-NaN is suppressed by the safety net (F22); pearson-perfect is not, since t (Infinity) is in no cell", () => {
    expect(find("ttestInd", "ttestInd-group-named-NaN").apa).toBeNull();
    expect(run(find("ttestInd", "ttestInd-group-named-NaN"))).toMatchObject({ ok: false, reason: "undefined" });
    const p = find("pearson", "pearson-perfect");
    expect(p.apa).toContain("r(3) = 1.00");
    const r = run(p);
    expect(r.ok && r.values.t).toBe(Infinity);
  });
  it("a form with no grouping column: ttestInd and anova1 throw on ivName (the catch toast), tukey reads no name and counts no group", () => {
    const toast = "Could not run that test — check the columns you picked match what the test needs";
    expect(find("ttestInd", "ttestInd-no-categorical-column").toasts).toEqual([toast]);
    expect(find("anova1", "anova1-no-categorical-column").toasts).toEqual([toast]);
    expect(find("tukey", "tukey-no-categorical-column").toasts).toEqual(["Tukey HSD needs 3 or more groups"]);
  });
  // Register row F27, one test per case (as the alpha cases, commit 02f01a8), so each case has its own time budget (tukey-f5-exact-zero alone takes about a second, and has
  // HEAVY_CASE_MS's 30 s); a case the port refuses has nothing to check.
  const fixed = (x: number, k = 2) => x.toFixed(k);
  const row = (r: StatsResult, b = 0, i = 1) => (r.ok ? (r.blocks[b] as { rows: string[][] }).rows[i]! : []);
  const F27: Record<string, (r: StatsOk, v: StatsOk["values"]) => void> = {
    ttestInd: (r, v) => {
      expect(row(r, 0, 1).slice(1)).toEqual([String(v.n1), fixed(v.m1!), fixed(Math.sqrt(v.v1!))]);
      expect(row(r, 0, 2).slice(1)).toEqual([String(v.n2), fixed(v.m2!), fixed(Math.sqrt(v.v2!))]);
      expect(r.apa).toContain(`t(${fixed(v.df!)}) = ${fixed(v.t!)}`); },
    ttestPaired: (r, v) => {
      expect(row(r).slice(0, 5)).toEqual([String(v.n), fixed(v.md!), fixed(v.sdv!), fixed(v.t!), String(v.df)]); },
    anova1: (r, v) => {
      expect(blockAsText(r.blocks[1]!)).toContain(`F(${v.dfb}, ${v.dfw}) = ${fixed(v.F!)}`); expect(v.N! - v.k!).toBe(v.dfw); },
    tukey: (r, v) => {
      const rows = (r.blocks[0] as { rows: string[][] }).rows.slice(1);
      expect(rows).toHaveLength(v.kk! * (v.kk! - 1) / 2);
      let n = 0; for (let i = 0; i < v.kk!; i++) for (let j = i + 1; j < v.kk!; j++) { expect(rows[n++]!.slice(1, 3)).toEqual([fixed(v[`diff_${i}_${j}`]!), fixed(v[`q_${i}_${j}`]!)]); } },
    regression: (r, v) => {
      expect(row(r).slice(0, 6)).toEqual([String(v.n), fixed(v.b0!, 3), fixed(v.b1!, 3), fixed(v.seB1!, 3), fixed(v.t!), String(v.df)]); expect(row(r)[7]).toBe(fixed(v.r2!, 3)); },
    pearson: (r, v) => {
      expect(row(r)[0]).toBe(String(v.n)); expect(row(r)[2]).toBe(String(v.df)); expect("cl" in v).toBe(v.n! > 3); },
  };
  for (const [file, check] of Object.entries(F27)) for (const c of load(file).cases) {
    it(`values are the numbers behind the table cells (register row F27): ${c.id}`, () => { const r = run(c); if (!r.ok) return; check(r, r.values); }, HEAVY_CASE_MS[c.id]);
  }
});

describe("stats: rank tests and Welch ANOVA (mannwhitney, wilcoxon, kruskal, spearman, welchAnova)", () => {
  const find = (file: string, id: string) => load(file).cases.find((x) => x.id === id)!;
  const rowsOf = (c: CapturedRun, b = 0) => (c.blocks[b] as { rows: string[][] }).rows;
  const lastNote = (c: CapturedRun) => { const b = c.blocks[c.blocks.length - 1]!; return b.kind === "note" ? b.html : ""; };
  it("F1: the Spearman p cell is noLead(p.toFixed(3)), .000 for a tiny p, while the sentence says p < .001", () => {
    const c = find("spearman", "spearman-tiny-p");
    expect(rowsOf(c)[1]![4]).toBe(".000");
    expect(c.apa).toContain("p < .001");
    const r = run(c);
    expect(r.ok && r.values.p! < 0.0005 && r.values.p! > 0).toBe(true);
  });
  it("F2: the Kruskal-Wallis sentence appends ' groups' to the column name", () => {
    expect(find("kruskal", "kruskal-group-column-named-group").apa).toContain("across the group groups,");
    expect(find("kruskal", "kruskal-non-significant").apa).toContain("across the arm groups,");
  });
  it("F15: ties are exact floating-point equality, so decimal differences that are 0.1 on paper may or may not tie", () => {
    expect(1.1 - 1.0).not.toBe(3.3 - 3.2);
    expect(1.1 - 1.0).toBe(2.2 - 2.1);
    expect(run(find("wilcoxon", "wilcoxon-decimal-ties"))).toMatchObject({ ok: true, values: { exact: 1 } });
    expect(run(find("wilcoxon", "wilcoxon-decimal-ties-same-double"))).toMatchObject({ ok: true, values: { exact: 0 } });
    expect(find("wilcoxon", "wilcoxon-decimal-ties").apa).toContain("(exact)");
    expect(find("wilcoxon", "wilcoxon-decimal-ties-same-double").apa).toContain("normal approximation");
    expect(run(find("mannwhitney", "mannwhitney-decimal-ties"))).toMatchObject({ ok: true, values: { exact: 1 } });
  });
  it("Mann-Whitney and Wilcoxon take the normal approximation at 50, the exact p below it", () => {
    expect(run(find("mannwhitney", "mannwhitney-n50"))).toMatchObject({ ok: true, values: { n1: 50, exact: 0 } });
    expect(run(find("wilcoxon", "wilcoxon-n50"))).toMatchObject({ ok: true, values: { n: 50, exact: 0 } });
    expect(run(find("wilcoxon", "wilcoxon-n49"))).toMatchObject({ ok: true, values: { n: 49, exact: 1 } });
    expect(run(find("wilcoxon", "wilcoxon-zero-diffs"))).toMatchObject({ ok: true, values: { n: 7, exact: 0 } });
  });
  it("F4: integer-like labels come out in object-key order, and the Mann-Whitney note names the first key", () => {
    const c = find("mannwhitney", "mannwhitney-integer-labels");
    expect(rowsOf(c).slice(1).map((r) => r[0])).toEqual(["2", "10"]);
    expect(lastNote(c)).toContain("(positive: 2 tends to score higher)");
    const r = run(c);
    expect(r.ok && r.values.rrb! < 0).toBe(true);
  });
  it("F18 and D-W2-4: Spearman counts nothing it drops; Welch ANOVA's count is doubled by its assumption pass; the others count once", () => {
    const sp = find("spearman", "spearman-text-dropped-uncounted");
    expect(sp.resultsText).not.toContain("left out");
    expect(run(sp)).toMatchObject({ ok: true, skipped: 0 });
    for (const [file, id, n] of [["welchAnova", "welchAnova-text-in-numeric", 4], ["mannwhitney", "mannwhitney-text-in-numeric", 2], ["wilcoxon", "wilcoxon-text-in-numeric", 2], ["kruskal", "kruskal-text-in-numeric", 2]] as const) {
      const c = find(file, id);
      expect(lastNote(c), id).toBe(`${n} entries that are not a number were left out.`);
      expect(run(c), id).toMatchObject({ ok: true, skipped: n });
    }
  });
  it("F5 at 9264 (Games-Howell): with each pair's df between 1 and 2 stkPtukey returns exactly 1, so every gh_p is exactly 0, the cell < .001 and the sentence p < .001", () => {
    const c = find("welchAnova", "welchAnova-f5-exact-zero");
    const r = run(c);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const k of ["gh_p_0_1", "gh_p_0_2", "gh_p_1_2"]) expect(Object.is(r.values[k], 0), k).toBe(true);
    expect(rowsOf(c, 2).slice(1).map((x) => [x[3], decodeText(x[4]!)])).toEqual([["1.2", "< .001"], ["1.5", "< .001"], ["1.7", "< .001"]]);
    expect(c.apa!.split("Games-Howell comparisons: ")[1]!.match(/, p < \.001\)/g)).toHaveLength(3);
    expect(r.apa).toBe(c.apa);
  }, HEAVY_CASE_MS["welchAnova-f5-exact-zero"]); // runs welchAnova-f5-exact-zero, one of the two heavy ids (stats/check.ts): 30 s, not the 5 s default
  it("kruskal-all-same: v1 runs the test with H = 0 (D-W2-16), its 'All values are identical' toast is not reached", () => {
    const c = find("kruskal", "kruskal-all-same");
    expect(c.toasts).toEqual([]);
    expect(run(c)).toMatchObject({ ok: true, values: { H: 0, p: 1 } });
  });
  // One test per case (as the alpha cases, commit 02f01a8), so each case has its own time budget (welchAnova-f5-exact-zero alone takes about two seconds, and has HEAVY_CASE_MS's 30 s).
  for (const file of ["kruskal", "welchAnova"]) for (const c of load(file).cases) {
    it(`the post-hoc values exist only when the post-hoc table is shown: ${c.id}`, () => {
      const r = run(c);
      if (!r.ok) return;
      const tables = r.blocks.filter((b) => b.kind === "table").length;
      const post = Object.keys(r.values).filter((k) => /^(padj|gh_p)_\d+_\d+$/.test(k)).length;
      const k = (r.blocks[0] as { rows: string[][] }).rows.length - 1;
      expect(post, c.id).toBe(r.values.p! < 0.05 ? k * (k - 1) / 2 : 0);
      expect(tables, c.id).toBe((r.values.p! < 0.05 ? 2 : 1) + (file === "welchAnova" ? 1 : 0));
    }, HEAVY_CASE_MS[c.id]);
  }
  // Register row F27, one test per case (as the alpha cases, commit 02f01a8), so each case has its own time budget (HEAVY_CASE_MS's 30 s for welchAnova-f5-exact-zero); a case the
  // port refuses has nothing to check.
  const fixed = (x: number, k = 2) => x.toFixed(k);
  const nl = (s: string) => s.replace(/^(-?)0\./, "$1.");
  const F27: Record<string, (c: CapturedRun, r: StatsOk, v: StatsOk["values"]) => void> = {
    mannwhitney: (c, r, v) => {
      expect(blockAsText(r.blocks[1]!).startsWith(`U = ${fixed(v.U!, 1)}${v.exact ? "" : `, z = ${fixed(v.z!)}`}, `), c.id).toBe(true);
      expect(blockAsText(r.blocks[1]!)).toContain(`rank-biserial r = ${nl(fixed(v.rrb!))}`); expect(v.U).toBe(Math.min(v.U1!, v.U2!)); },
    wilcoxon: (c, r, v) => {
      expect((r.blocks[0] as { rows: string[][] }).rows[1]!.slice(0, 3), c.id).toEqual([String(v.n), fixed(v.W!, 1), v.exact ? "—" : fixed(v.z!)]); expect(v.W).toBe(Math.min(v.wPlus!, v.wMinus!)); },
    kruskal: (c, r, v) => {
      expect(blockAsText(r.blocks[1]!).startsWith(`H(${v.df}) = ${fixed(v.H!)}, `), c.id).toBe(true); },
    spearman: (c, r, v) => {
      expect((r.blocks[0] as { rows: string[][] }).rows[1], c.id).toEqual([String(v.n), nl(fixed(v.rho!)), `[${nl(fixed(v.lo!))}, ${nl(fixed(v.hi!))}]`, String(v.df), nl(fixed(v.p!, 3))]); },
    welchAnova: (c, r, v) => {
      expect(blockAsText(r.blocks[1]!).startsWith(`Welch F(${v.df1}, ${fixed(v.df2!)}) = ${fixed(v.F!)}, `), c.id).toBe(true);
      expect(blockAsText(r.blocks[1]!)).toContain(`ω² = ${nl(fixed(v.omega2!))} `);
      if (v.p! < 0.05) { const rows = (r.blocks[2] as { rows: string[][] }).rows.slice(1); const k = (r.blocks[0] as { rows: string[][] }).rows.length - 1;
        let n = 0; for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) { expect(rows[n++]!.slice(1, 3), c.id).toEqual([fixed(v[`gh_diff_${i}_${j}`]!), `[${fixed(v[`gh_lo_${i}_${j}`]!)}, ${fixed(v[`gh_hi_${i}_${j}`]!)}]`]); } } },
  };
  for (const [file, check] of Object.entries(F27)) for (const c of load(file).cases) {
    it(`values are the numbers behind the table cells (register row F27): ${c.id}`, () => { const r = run(c); if (!r.ok) return; check(c, r, r.values); }, HEAVY_CASE_MS[c.id]);
  }
});

describe("stats: tests on counts (chisq, gof, mcnemar, cochran, friedman)", () => {
  const find = (file: string, id: string) => load(file).cases.find((x) => x.id === id)!;
  const rowsOf = (c: CapturedRun, b = 0) => (c.blocks[b] as { rows: string[][] }).rows;
  const notes = (c: CapturedRun) => c.blocks.filter((b) => b.kind === "note").map((b) => (b as { html: string }).html);
  const lastNote = (c: CapturedRun) => { const b = c.blocks[c.blocks.length - 1]!; return b.kind === "note" ? b.html : ""; };
  it("chisq keeps the Set's data order for its row and column keys (F4's other branch): 10, 2, 3 stay 10, 2, 3", () => {
    const c = find("chisq", "chisq-integer-labels");
    expect(rowsOf(c).map((r) => r[0])).toEqual(["", "10", "2", "3"]);
    expect(rowsOf(c)[0]).toEqual(["", "yes", "no"]);
  });
  it("F8: the Fisher sentence reports stkFisher2x2's sample odds ratio a*d/(b*c)", () => {
    const c = find("chisq", "chisq-2x2-small-expected");
    expect(c.apa).toBe("A Fisher's exact test showed no significant association between group and outcome, p = .070, odds ratio = 9.33 (N = 20).");
    const r = run(c);
    expect(r.ok && r.values.fisherOr).toBe((8 * 7) / (2 * 3));
  });
  it("chisq-2x2-empty-cell: 'undefined (an empty cell)' passes the safety net, so the result is shown", () => {
    const c = find("chisq", "chisq-2x2-empty-cell");
    expect(c.apa).toContain("odds ratio = undefined (an empty cell) (N = 14)");
    expect(c.toasts).toEqual([]);
    const r = run(c);
    expect(r.ok && r.values.fisherOr).toBe(Infinity);
  });
  it("D-W2-7: the Fisher-Freeman-Halton note groups the table count with toLocaleString('en-US'); N > 200 skips the test", () => {
    const c = find("chisq", "chisq-3x3-sparse");
    expect(notes(c).some((h) => h.includes("All 4,017 tables with the same row and column totals were enumerated"))).toBe(true);
    expect(run(c)).toMatchObject({ ok: true, values: { N: 36, ffhTables: 4017 } });
    const big = find("chisq", "chisq-3x4-sparse-large-N");
    expect(lastNote(big)).toMatch(/^There are too many possible tables to enumerate here/);
    const r = run(big);
    expect(r.ok && r.values.N! > 200 && !("ffhP" in r.values)).toBe(true);
  });
  it("gof: the exact binomial sentence with two categories, the note only with three", () => {
    expect(find("gof", "gof-two-categories-small").apa).toMatch(/^An exact binomial test showed that the proportion of right in hand \(7 of 9\)/);
    const three = find("gof", "gof-three-categories-small");
    expect(three.apa).toMatch(/^A chi-square goodness-of-fit test/);
    expect(lastNote(three)).toMatch(/^An expected count is below 5 \(4\.00\)/);
    expect(run(three)).toMatchObject({ ok: true, values: { k: 3, minE: 4 } });
  });
  it("mcnemar: the exact branch under 25 changers, the χ² branch at 25 or more; the curly quotes in stkBinData's toast", () => {
    expect(run(find("mcnemar", "mcnemar-yes-no"))).toMatchObject({ ok: true, values: { nd: 15, useEx: 1, b: 3, c: 12 } });
    expect(run(find("mcnemar", "mcnemar-pos-given"))).toMatchObject({ ok: true, values: { nd: 15, useEx: 1, b: 12, c: 3 } });
    expect(run(find("mcnemar", "mcnemar-nd25"))).toMatchObject({ ok: true, values: { nd: 30, useEx: 0 } });
    expect(rowsOf(find("mcnemar", "mcnemar-nd25"), 1)[0]![4]).toBe("χ²(1)");
    expect(find("mcnemar", "mcnemar-pos-unknown").toasts).toEqual(["“maybe” is not one of the two answers (yes, no)."]);
  });
  it("the left-out count: B.skipped in mcnemar and cochran, the friedman row filter inline", () => {
    for (const [file, id, n] of [["mcnemar", "mcnemar-missing-answer", 2], ["cochran", "cochran-missing-answer", 1], ["friedman", "friedman-missing-row", 1]] as const) {
      const c = find(file, id);
      expect(lastNote(c), id).toBe(n === 1 ? "1 entry that is not a number was left out." : `${n} entries that are not a number were left out.`);
      expect(run(c), id).toMatchObject({ ok: true, skipped: n });
    }
  });
  it("the pairwise values exist only when the pairwise table is shown", () => {
    for (const [file, pk] of [["cochran", "pQ"], ["friedman", "pF"]] as const) for (const c of load(file).cases) {
      const r = run(c);
      if (!r.ok) continue;
      const k = r.values.k!, pairs = Object.keys(r.values).filter((x) => /^pair_p_\d+_\d+$/.test(x)).length;
      expect(pairs, c.id).toBe(r.values[pk]! < 0.05 ? k * (k - 1) / 2 : 0);
    }
  });
  it("values are the numbers behind the table cells (register row F27)", () => {
    const fixed = (x: number, k = 2) => x.toFixed(k);
    const nl = (s: string) => s.replace(/^(-?)0\./, "$1.");
    for (const c of load("chisq").cases) { const r = run(c); if (!r.ok) continue; const v = r.values;
      expect(blockAsText(r.blocks[1]!), c.id).toBe(`χ²(${v.df}, N = ${v.N}) = ${fixed(v.chi2!)}, ${fmtP(v.p!)}, Cramér's V = ${fixed(v.v!)}`); }
    for (const c of load("gof").cases) { const r = run(c); if (!r.ok) continue; const v = r.values;
      expect(blockAsText(r.blocks[1]!).startsWith(`χ²(${v.df}, N = ${v.N}) = ${fixed(v.chi2!)}, ${fmtP(v.p!)}, Cohen's w = ${nl(fixed(v.w!))}.`), c.id).toBe(true); }
    for (const c of load("mcnemar").cases) { const r = run(c); if (!r.ok) continue; const v = r.values;
      expect((r.blocks[1] as { rows: string[][] }).rows[1]!.slice(0, 3), c.id).toEqual([String(v.n), String(v.b), String(v.c)]);
      expect((r.blocks[0] as { rows: string[][] }).rows.slice(1).map((x) => x.slice(1)), c.id).toEqual([[String(v.a), String(v.b)], [String(v.c), String(v.dd)]]); }
    for (const c of load("cochran").cases) { const r = run(c); if (!r.ok) continue; const v = r.values;
      expect((r.blocks[1] as { rows: string[][] }).rows[1]!.slice(0, 3), c.id).toEqual([String(v.n), fixed(v.Q!), String(v.df)]); }
    for (const c of load("friedman").cases) { const r = run(c); if (!r.ok) continue; const v = r.values;
      expect((r.blocks[1] as { rows: string[][] }).rows[1]!, c.id).toEqual([String(v.n), fixed(v.chi!), String(v.df), v.pF! < 0.001 ? "&lt; .001" : nl(fixed(v.pF!, 3)), nl(fixed(v.W!, 3))]); }
  });
});

describe("stats: two-way ANOVA and multiple regression (anova2, mregress)", () => {
  const find = (file: string, id: string) => load(file).cases.find((x) => x.id === id)!;
  const notes = (c: CapturedRun) => c.blocks.filter((b) => b.kind === "note").map((b) => (b as { html: string }).html);
  const tables = (c: CapturedRun) => c.blocks.filter((b) => b.kind === "table").map((b) => (b as { rows: string[][] }).rows);
  const fixed = (x: number, k = 2) => x.toFixed(k);
  const nl = (s: string) => s.replace(/^(-?)0\./, "$1.");
  const pc = (p: number) => (p < 0.001 ? "&lt; .001" : nl(p.toFixed(3)));
  it("every note of the runner's own is v1's innerHTML, tags included (the <code>anova()</code> of the Type III note, the <b> titles of the follow-up tables)", () => {
    // up to the assumption checks: stkAssumpBlock's Brown-Forsythe note holds fmtP's literal '<', which v1's DOM reads back as &lt; (stats/render.ts decodes both)
    const own = (bs: StatsBlock[]) => { const h = bs.findIndex((b) => b.kind === "heading"); return (h < 0 ? bs : bs.slice(0, h)).filter((b) => b.kind === "note").map((b) => (b as { html: string }).html); };
    for (const file of ["anova2", "mregress"]) for (const c of load(file).cases) {
      const r = run(c);
      if (!r.ok) continue;
      expect(own(r.blocks), c.id).toEqual(own(c.blocks));
    }
    expect(notes(find("anova2", "anova2-2x3-unbalanced"))[0]).toContain("R's <code>anova()</code> uses Type I and will differ.");
  });
  it("anova2 keeps stkAnova2Cells's first-seen level order: 10, then 2", () => {
    const c = find("anova2", "anova2-integer-labels");
    expect(tables(c)[0]!.slice(1).map((r) => r[0])).toEqual(["10", "10", "2", "2"]);
    expect(run(c)).toMatchObject({ ok: true, values: { la: 2, lb: 2, N: 20 } });
  });
  it("anova2 counts stkAnova2Cells's skipped entries once (12864; the assumption pass adds nothing)", () => {
    const c = find("anova2", "anova2-text-in-numeric");
    expect(notes(c)[notes(c).length - 1]).toBe("2 entries that are not a number were left out.");
    expect(run(c)).toMatchObject({ ok: true, skipped: 2 });
  });
  it("a significant interaction: the simple-effects tables and the Bonferroni table within levels; no Tukey", () => {
    const c = find("anova2", "anova2-interaction-significant");
    const n = notes(c);
    expect(n).toContain("<b>Effect of dose at each level of therapy</b>");
    expect(n).toContain("<b>Effect of therapy at each level of dose</b>");
    expect(n).toContain("<b>Pairwise comparisons of dose within each level of therapy (Bonferroni)</b>");
    expect(tables(c).some((t) => t[0]![5] === "p, Bonferroni (×6)")).toBe(true);
    expect(n.some((h) => h.includes("(Tukey)"))).toBe(false);
    const r = run(c);
    expect(r.ok && r.values.p_AB! < 0.05).toBe(true);
    expect(r.ok && ["se_A_0_F", "se_A_1_F", "se_B_0_F", "se_B_1_F", "se_B_2_F", "se_B_2_p"].every((k) => k in r.values)).toBe(true);
    const both = find("anova2", "anova2-3x3-interaction");
    expect(notes(both).filter((h) => h.endsWith("(Bonferroni)</b>"))).toEqual(["<b>Pairwise comparisons of therapy within each level of dose (Bonferroni)</b>", "<b>Pairwise comparisons of dose within each level of therapy (Bonferroni)</b>"]);
  });
  it("a significant 3-level main effect without the interaction: Tukey on the estimated marginal means, Tukey-Kramer only when unbalanced", () => {
    const c = find("anova2", "anova2-main-effect-3-levels");
    expect(notes(c)).toContain("<b>Pairwise comparisons of therapy (Tukey)</b>");
    expect(notes(c).some((h) => h.includes("Tukey-Kramer"))).toBe(false);
    expect(c.apa).toContain("For therapy, Tukey comparisons of estimated marginal means gave: ");
    const r = run(c);
    expect(r.ok && r.values.p_AB! >= 0.05 && r.values.balanced).toBe(1);
    expect(r.ok && Object.keys(r.values).some((k) => k.startsWith("se_"))).toBe(false);
    const u = find("anova2", "anova2-2x3-unbalanced");
    expect(notes(u).some((h) => h.includes("and the Tukey-Kramer adjustment for unequal cell sizes"))).toBe(true);
    expect(run(u)).toMatchObject({ ok: true, values: { balanced: 0 } });
  });
  it("F5 at 12908 (two-way ANOVA, Tukey on the marginal means): the Source table's p_A is F5's exact 0, but with at most 6 levels and a whole-number error df stkPtukey stays below 1, so the Tukey p is about 1e-11, never exactly 0, and prints < .001", () => {
    const c = find("anova2", "anova2-f5-tukey-floor");
    const r = run(c);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.is(r.values.p_A, 0)).toBe(true);
    const ps = ["tukey_p_0_1", "tukey_p_0_2", "tukey_p_1_2"].map((k) => r.values[k]!);
    for (const p of ps) { expect(p).toBeGreaterThan(0); expect(p).toBeLessThan(1e-10); }
    expect(Object.keys(r.values).filter((k) => k.startsWith("tukey"))).toEqual(["tukey_p_0_1", "tukey_p_0_2", "tukey_p_1_2"]);
    const t = tables(c)[2]!;
    expect(t[0]).toEqual(["Pair", "Mean diff", "q", "p (Tukey)"]);
    expect(t.slice(1).map((x) => x[3])).toEqual(["&lt; .001", "&lt; .001", "&lt; .001"]);
    expect(c.apa).toContain("For therapy, Tukey comparisons of estimated marginal means gave: CBT vs Mindful (p < .001); CBT vs Waitlist (p < .001); Mindful vs Waitlist (p < .001).");
    expect(r.apa).toBe(c.apa);
  });
  it("anova2 values are the numbers behind the Source table", () => {
    for (const c of load("anova2").cases) {
      const r = run(c);
      if (!r.ok) continue;
      const v = r.values, t = r.blocks[1] as { rows: string[][] };
      expect(t.rows.slice(1, 4).map((x) => x.slice(4)), c.id).toEqual(["A", "B", "AB"].map((e) => [fixed(v["F_" + e]!), pc(v["p_" + e]!), nl(fixed(v["eta_" + e]!, 3))]));
      expect(t.rows[4], c.id).toEqual(["Error", fixed(v.sse!), String(v.dfe), fixed(v.mse!), "", "", ""]);
    }
  });
  it("mregress: the reference level is the largest group (ties to the first seen) or the one named", () => {
    expect(notes(find("mregress", "mregress-categorical-3-levels"))[1]).toContain("Reference levels: group = Online (the largest group).");
    expect(notes(find("mregress", "mregress-ref-given"))[1]).toContain("Reference levels: group = Control (your choice).");
    expect(notes(find("mregress", "mregress-step2-categorical"))[2]).toContain("Reference levels: group = Online (the largest group).");
    expect(notes(find("mregress", "mregress-small-level"))[1]).toContain(" At least one level of a categorical predictor has fewer than 5 rows");
  });
  it("mregress reports dropped rows in its note, not through the left-out counter", () => {
    const c = find("mregress", "mregress-missing-rows");
    expect(notes(c)[1]).toContain(" 3 rows were left out because a value was missing.");
    expect(notes(c).some((h) => h.includes("not a number"))).toBe(false);
    expect(run(c)).toMatchObject({ ok: true, skipped: 0, values: { n: 22 } });
    expect(notes(find("mregress", "mregress-one-missing-row"))[1]).toContain(" 1 row was left out because a value was missing.");
  });
  it("mregress: the outcome ticked as a predictor is filtered out; the VIF notes at 10 and at 5", () => {
    const c = find("mregress", "mregress-dv-ticked-as-predictor");
    expect(c.form.ticked.preds).toContain(parseInt(c.form.values.dv!, 10));
    expect(run(c)).toMatchObject({ ok: true, values: { k: 2 } });
    expect(notes(find("mregress", "mregress-vif-high"))[1]).toContain(" A VIF of 10 or more means");
    expect(notes(find("mregress", "mregress-vif-moderate"))[1]).toContain(" A VIF above 5 means");
  });
  it("D-W2-18 (approved): v2 enters a 3-level categorical in step 1 with both its dummies; the fixture keeps v1's split, step 1 on the first dummy only", () => {
    const c = find("mregress", "mregress-step1-categorical-3-levels");
    expect(tables(c)[0]!.slice(1).map((r) => r[1])).toEqual(["group: Control (vs Online)", "+ group: Group (vs Online), age"]);
    const r = run(c);
    expect(r).toMatchObject({ ok: true, values: { k: 3, k1: 2 } });
    const rows = r.ok ? (r.blocks[0] as { rows: string[][] }).rows : [];
    expect(rows.slice(1).map((x) => x[1])).toEqual(["group: Control (vs Online), group: Group (vs Online)", "+ age"]);
    expect(rows.slice(1).map((x) => x.slice(2))).not.toEqual(tables(c)[0]!.slice(1).map((x) => x.slice(2)));
    expect(r.ok && r.apa).toContain(" In step 1, group: Control (vs Online), group: Group (vs Online) accounted for ");
  });
  it("mregress: the step values exist only with the step table; values are the numbers behind the cells", () => {
    for (const c of load("mregress").cases) {
      const r = run(c);
      if (!r.ok) continue;
      const v = r.values, k = v.k!, step = "k1" in v, off = step ? 1 : 0;
      expect(r.blocks[0]!.kind === "table" && (r.blocks[0] as { rows: string[][] }).rows[0]![0] === "Step", c.id).toBe(step);
      expect((r.blocks[1 + off + off] as { rows: string[][] }).rows[1], c.id).toEqual([nl(fixed(v.r2!, 3)), nl(fixed(v.adj!, 3)), fixed(v.F!), `${k}, ${v.dfe}`, pc(v.pF!)]);
      const coef = (r.blocks[2 + off + off] as { rows: string[][] }).rows;
      for (let j = 0; j <= k; j++) {
        const row = coef[j + 1]!, beta = v["beta_" + j];
        expect([row[1], row[2], row[3], row[4], row[5], row[7]], `${c.id} ${j}`).toEqual([fixed(v["b_" + j]!, 3), fixed(v["se_" + j]!, 3), beta === undefined ? "" : nl(fixed(beta, 3)), fixed(v["t_" + j]!), pc(v["p_" + j]!), j === 0 ? "" : fixed(v["vif_" + j]!)]);
      }
      if (step) expect((r.blocks[0] as { rows: string[][] }).rows[2]!.slice(2), c.id).toEqual([nl(fixed(v.r2!, 3)), nl(fixed(v.adj!, 3)), nl(fixed(v.dR!, 3)), fixed(v.Fc!), `${k - v.k1!}, ${v.dfe}`, pc(v.pc!)]);
    }
  });
});

describe("stats: logistic regression, repeated-measures ANOVA and alpha (logistic, rmanova, alpha)", () => {
  const find = (file: string, id: string) => load(file).cases.find((x) => x.id === id)!;
  const notes = (c: CapturedRun) => c.blocks.filter((b) => b.kind === "note").map((b) => (b as { html: string }).html);
  const tables = (c: CapturedRun) => c.blocks.filter((b) => b.kind === "table").map((b) => (b as { rows: string[][] }).rows);
  const items = (c: CapturedRun) => c.blocks.filter((b) => b.kind === "list").flatMap((b) => (b as { items: string[] }).items);
  const fixed = (x: number, k = 2) => x.toFixed(k);
  const nl = (s: string) => s.replace(/^(-?)0\./, "$1.");
  const pc = (p: number) => (p < 0.001 ? "&lt; .001" : nl(p.toFixed(3)));
  const ctxOf = (c: CapturedRun): StatsCtx => ({ data: statsParseText(c.csv)!, form: c.form, skipped: 0 });
  it("F12: the three logistic refusals reach v1's three tests on stkLogit's three objects", () => {
    const fit = (id: string) => { const m = stkMRData(ctxOf(find("logistic", id)), true); return stkLogit(m.xs, m.y) as Record<string, unknown>; };
    const sepToast = "The model could not be fitted. A predictor (or a combination of them) separates the two outcomes perfectly, or almost perfectly, so the estimates run off to infinity. This usually means too many predictors for the number of events. Remove a predictor, or merge small categories.";
    for (const id of ["logistic-separation", "logistic-copy-of-outcome"]) {
      expect(fit(id), id).toEqual({ sep: true }); // the early object: o.sep&&!o.beta
      expect(find("logistic", id).toasts, id).toEqual([sepToast]);
    }
    const late = fit("logistic-separation-cutoffs");
    expect(late.conv && late.sep && Array.isArray(late.beta)).toBe(true); // converged, separated by the |b| > 30 and SE > 500 cut-offs: the third test, o.sep
    expect(find("logistic", "logistic-separation-cutoffs").toasts).toEqual([sepToast]);
    expect(fit("logistic-collinear")).toEqual({ singular: true }); // no sep and no beta: the second test
    expect(find("logistic", "logistic-collinear").toasts[0]).toMatch(/^Two or more predictors carry the same information/);
  });
  it("logistic: the outcome select offers binary columns only, so a three-answer outcome leaves it empty and v1's catch toast follows", () => {
    const c = find("logistic", "logistic-three-answers");
    expect(c.form.values.dv).toBe("");
    expect(c.toasts).toEqual(["Could not run that test — check the columns you picked match what the test needs"]);
    expect(find("logistic", "logistic-one-answer-in-rows-used").toasts).toEqual(["The outcome has only one answer among the rows used, so there is nothing to predict."]);
  });
  it("logistic: the event is the named answer, else yes, else the later answer; dropped rows go to the note, not the counter; the epv note", () => {
    expect(notes(find("logistic", "logistic-yes-no-outcome"))[0]).toContain(" = <b>yes</b> (the event) rather than no,");
    expect(notes(find("logistic", "logistic-pos-given"))[0]).toContain(" = <b>Fail</b> (the event) rather than Pass,");
    const c = find("logistic", "logistic-missing-rows");
    expect(notes(c)[2]).toContain(" 3 rows were left out because a value was missing.");
    expect(run(c)).toMatchObject({ ok: true, skipped: 0, values: { n: 57 } });
    expect(notes(find("logistic", "logistic-epv-note"))[2]).toContain(" Only 13 cases in the rarer outcome for 3 predictor columns (4.3 per predictor).");
    expect(notes(find("logistic", "logistic-ref-given"))[2]).toContain("Reference levels: group = Control.");
    expect(notes(find("logistic", "logistic-one-missing-row"))[2]).toContain(" 1 row was left out because a value was missing.");
    expect(notes(find("logistic", "logistic-vif-moderate"))[2]).toContain(" A VIF above 5 means some predictors overlap noticeably");
    expect(notes(find("logistic", "logistic-vif-high"))[2]).toContain(" A VIF of 10 or more means");
    expect(notes(find("logistic", "logistic-categorical-predictor"))[2]).toContain("Reference levels: group = Online (the largest group).");
  });
  it("logistic values are the numbers behind the cells", () => {
    for (const c of load("logistic").cases) {
      const r = run(c);
      if (!r.ok) continue;
      const v = r.values, k = v.k!, t = r.blocks.filter((b) => b.kind === "table").map((b) => (b as { rows: string[][] }).rows);
      expect(t[0]![1], c.id).toEqual([fixed(v.lr!), String(k), pc(v.pLR!), nl(fixed(v.mcf!, 3)), nl(fixed(v.cs!, 3)), nl(fixed(v.nag!, 3)), nl(fixed(v.auc!, 3))]);
      for (let j = 0; j <= k; j++) {
        const row = t[1]![j + 1]!;
        expect(row.slice(1), `${c.id} ${j}`).toEqual([fixed(v["b_" + j]!, 3), fixed(v["se_" + j]!, 3), fixed(v["z_" + j]!), pc(v["p_" + j]!),
          j === 0 ? "" : fixed(v["or_" + j]!, 3), j === 0 ? "" : `[${fixed(v["lo_" + j]!, 3)}, ${fixed(v["hi_" + j]!, 3)}]`]);
      }
      expect(t[2]!.slice(1).map((x) => x.slice(1)), c.id).toEqual([[String(v.tn), String(v.fp)], [String(v.fn), String(v.tp)]]);
      expect(v.tp! + v.tn! + v.fp! + v.fn!, c.id).toBe(v.n);
    }
  });
  it("rmanova: the corrected rows are Greenhouse-Geisser when gg < .75, else Huynh-Feldt; Mauchly's test where it can be calculated", () => {
    const seen = new Set<string>();
    for (const c of load("rmanova").cases) {
      const r = run(c);
      if (!r.ok) continue;
      const v = r.values, name = v.gg! < 0.75 ? "Greenhouse-Geisser" : "Huynh-Feldt";
      seen.add(name);
      expect(tables(c)[1]![2]![0], c.id).toBe(`Conditions (${name})`);
      expect(v.eps, c.id).toBe(v.gg! < 0.75 ? v.gg : v.hf);
      expect(notes(c)[0]!.includes("Mauchly's test could not be calculated"), c.id).toBe(!(v.W! > 0));
    }
    expect([...seen].sort()).toEqual(["Greenhouse-Geisser", "Huynh-Feldt"]);
    expect(notes(find("rmanova", "rmanova-pair-no-spread"))[0]).toContain("Mauchly's test could not be calculated for these data.");
  });
  it("rmanova: a pair without spread gets the '—' row and no values; the pairwise table only after a significant test; a skipped row is counted", () => {
    const c = find("rmanova", "rmanova-pair-no-spread");
    expect(tables(c)[2]![1]).toEqual(["s1 − s2", "-3.00", "—", "11", "—", "—"]);
    const r = run(c);
    expect(r.ok && "pair_t_0_1" in r.values).toBe(false);
    expect(r.ok && "pair_t_0_2" in r.values).toBe(true);
    expect(tables(find("rmanova", "rmanova-non-significant"))).toHaveLength(2);
    const ns = run(find("rmanova", "rmanova-non-significant"));
    expect(ns.ok && Object.keys(ns.values).some((k) => k.startsWith("pair_"))).toBe(false); // recorded only when the table is shown, as friedman and cochran
    expect(notes(find("rmanova", "rmanova-non-significant"))[2]).toMatch(/^The overall test is not significant/);
    expect(run(find("rmanova", "rmanova-missing-row"))).toMatchObject({ ok: true, skipped: 1, values: { n: 11 } });
  });
  it("rmanova values are the numbers behind the Source table", () => {
    for (const c of load("rmanova").cases) {
      const r = run(c);
      if (!r.ok) continue;
      const v = r.values, t = tables(c)[1]!;
      expect(t[1], c.id).toEqual(["Conditions (sphericity assumed)", fixed(v.ssc!), String(v.d1), fixed(v.ssc! / v.d1!), fixed(v.F!), pc(v.pU!)]);
      expect(t[2]!.slice(1), c.id).toEqual([fixed(v.ssc!), fixed(v.eps! * v.d1!), fixed(v.ssc! / (v.eps! * v.d1!)), fixed(v.F!), pc(v.pC!)]);
      expect(t[4]!.slice(1, 3), c.id).toEqual([fixed(v.sse!), String(v.d2)]);
    }
  });
  it("F13 (proposed): alpha-large-boot-200 has n·k above 40,000, so 200 resamples run while the note says 400", () => {
    const c = find("alpha", "alpha-large-boot-200");
    const t = tables(c)[0]![1]!;
    expect(Number(t[0]) * Number(t[1])).toBeGreaterThan(40000);
    expect(notes(c)[0]).toContain("its interval is a bootstrap of 400 resamples.");
    // stkOmegaBoot(X, 200) on this sample prints [.82, .84]; stkOmegaBoot(X, 400) prints [.82, .85] (the corpus builder chose the seed for that difference)
    expect(t[5]).toBe("[.82, .84]");
    const d = tables(find("alpha", "alpha-demo"))[0]![1]!;
    expect(Number(d[0]) * Number(d[1])).toBeLessThanOrEqual(40000);
    expect(notes(find("alpha", "alpha-demo"))[0]).toContain("its interval is a bootstrap of 400 resamples.");
  });
  it("alpha: the reversed label, omega not computed, the loading cell clamped to 1, dropped rows in the list and not in the counter", () => {
    expect(tables(find("alpha", "alpha-demo"))[1]!.slice(1).map((r) => r[0])).toEqual(["q1", "q2", "q3", "q4", "q5", "q6 (reversed)"]);
    const o = find("alpha", "alpha-omega-not-computed");
    expect(tables(o)[0]![1]!.slice(4, 6)).toEqual(["–", "–"]);
    expect(items(o)).toContain("Omega could not be computed for these items.");
    const ro = run(o);
    expect(ro.ok && ["omega", "ociLo", "ociHi", "load_0"].some((k) => k in ro.values)).toBe(false);
    const l = find("alpha", "alpha-loading-ceiling"), rl = run(l);
    expect(rl.ok && rl.values.load_2! > 1).toBe(true);
    expect(tables(l)[1]![3]![5]).toBe("1.00");
    expect(items(l)).toContain("i3 has a loading at the ceiling of 1.00. The item is almost a copy of the scale, or the sample is too small for a stable estimate. Treat omega as approximate.");
    expect(tables(find("alpha", "alpha-rev-range-en-dash"))[1]![6]![0]).toBe("q6 (reversed)");
    const one = run(find("alpha", "alpha-exactly-1"));
    expect(one).toMatchObject({ ok: true, values: { alpha: 1, aciLo: 1, aciHi: 1 } }); // alpha is not below 1: v1's [1,1], no stkFQuant
    const m = find("alpha", "alpha-missing-rows");
    expect(items(m)).toContain("2 row(s) with a missing answer were left out.");
    expect(run(m)).toMatchObject({ ok: true, skipped: 0, values: { n: 34 } });
  });
  // One test per alpha case that v1 ran (each runs its own omega bootstrap of 400 resamples, so each gets its own time budget); the slow ids run in stats-slow.test.ts.
  for (const c of load("alpha").cases.filter((x) => x.apa !== null && !SLOW_CASES.includes(x.id))) {
    it(`alpha values are the numbers behind the cells: ${c.id}`, () => {
      const fq = (x: number) => nl(fixed(x));
      const r = run(c);
      expect(r.ok, c.id).toBe(true);
      if (!r.ok) return;
      const v = r.values, t = tables(c);
      expect(t[0]![1]!.slice(0, 4).concat(t[0]![1]![6]!), c.id).toEqual([String(v.n), String(v.k), fq(v.alpha!), `[${fq(v.aciLo!)}, ${fq(v.aciHi!)}]`, fq(v.meanR!)]);
      for (let j = 0; j < v.k!; j++) expect([t[1]![j + 1]![3], t[1]![j + 1]![4]], `${c.id} ${j}`).toEqual([fq(v["rit_" + j]!), fq(v["ad_" + j]!)]);
      if ("omega" in v) expect(t[0]![1]![4], c.id).toBe(fq(v.omega!));
      if ("ociLo" in v) expect(t[0]![1]![5], c.id).toBe(`[${fq(v.ociLo!)}, ${fq(v.ociHi!)}]`);
    });
  }
});

describe("stats: mixed ANOVA, moderation and mediation (mixed, moderate, mediate)", () => {
  const find = (file: string, id: string) => load(file).cases.find((x) => x.id === id)!;
  const notes = (c: CapturedRun) => c.blocks.filter((b) => b.kind === "note").map((b) => (b as { html: string }).html);
  const tables = (c: CapturedRun) => c.blocks.filter((b) => b.kind === "table").map((b) => (b as { rows: string[][] }).rows);
  const fixed = (x: number, k = 2) => x.toFixed(k);
  const nl = (s: string) => s.replace(/^(-?)0\./, "$1.");
  const pc = (p: number) => (p < 0.001 ? "&lt; .001" : nl(p.toFixed(3)));
  const catchToast = "Could not run that test — check the columns you picked match what the test needs";
  it("mixed-integer-labels: the groups 10 and 2 stay in data order, 10 before 2 (gl.indexOf, 13341), and the row x is counted as skipped", () => {
    const c = find("mixed", "mixed-integer-labels");
    expect(c.csv.indexOf("\n10,")).toBeLessThan(c.csv.indexOf("\n2,"));
    expect(tables(c)[0]!.slice(1).map((r) => r[0])).toEqual(["10", "10", "10", "2", "2", "2"]);
    expect(run(c)).toMatchObject({ ok: true, skipped: 1, values: { G: 2, n: 16 } });
  });
  it("mixed with two conditions: no corrected rows and no sphericity figures, epsV 1, the 'With two conditions' note", () => {
    const c = find("mixed", "mixed-two-groups-two-times");
    expect(tables(c)[1]!.map((r) => r[0])).toEqual(["Source", "<b>Between people</b>", "group", "People within groups (error)", "<b>Within people</b>",
      "Conditions (sphericity assumed)", "group × conditions (sphericity assumed)", "Error (assumed)"]);
    expect(notes(c)[0]).toBe("With two conditions there is only one difference between them, so sphericity cannot be violated and no correction is needed.");
    expect(run(c)).toMatchObject({ ok: true, values: { k: 2, epsV: 1, gg: 1, hf: 1, W: 1, chi: 0, pM: 1 } });
    expect(c.apa).not.toContain("Degrees of freedom for the within-people effects");
  });
  it("mixed with three conditions: the corrected rows are Greenhouse-Geisser when gg < .75, else Huynh-Feldt, with df printed whole when they are (dd's 1e-9)", () => {
    const seen = new Set<string>();
    for (const c of load("mixed").cases) {
      const r = run(c);
      if (!r.ok || r.values.k === 2) continue;
      const v = r.values, name = v.gg! < 0.75 ? "Greenhouse-Geisser" : "Huynh-Feldt";
      seen.add(name);
      expect(tables(c)[1]![6]![0], c.id).toBe(`Conditions (${name})`);
      expect(v.epsV, c.id).toBe(v.gg! < 0.75 ? v.gg : v.hf);
    }
    expect([...seen].sort()).toEqual(["Greenhouse-Geisser", "Huynh-Feldt"]);
    expect(find("mixed", "mixed-three-groups-unequal").apa).toContain("main effect of condition, F(2, 54) = "); // Huynh-Feldt epsilon is 1: whole df
    expect(find("mixed", "mixed-interaction-significant").apa).toContain("main effect of condition, F(1.79, 39.35) = ");
  });
  it("mixed: the unequal-sizes note only for unequal groups; the interaction note's two arms; the toasts, one naming the group", () => {
    expect(notes(find("mixed", "mixed-three-groups-unequal"))[1]).toMatch(/^The groups have unequal sizes \(8, 10, 12\)\./);
    expect(notes(find("mixed", "mixed-two-groups-three-times")).some((h) => h.startsWith("The groups have unequal sizes"))).toBe(false);
    expect(notes(find("mixed", "mixed-interaction-significant")).at(-1)).toMatch(/^<b>The interaction is significant<\/b>/);
    expect(notes(find("mixed", "mixed-two-groups-three-times")).at(-1)).toMatch(/^The interaction is not significant/);
    expect(find("mixed", "mixed-group-of-one").toasts).toEqual(['Every group needs at least 2 people with a score in every ticked column. Group "C" has fewer.']);
    expect(run(find("mixed", "mixed-missing-row"))).toMatchObject({ ok: true, skipped: 1, values: { n: 17 } });
  });
  it("mixed-group-column-ticked: a grouping column coded 1/2 is numeric, so the student can tick it but the grouping select (categorical columns only) is empty: v1's catch toast", () => {
    const c = find("mixed", "mixed-group-column-ticked");
    expect(c.form.values.grp).toBe("");
    expect(c.form.ticked.items).toEqual([0, 1, 2]);
    expect(c.toasts).toEqual([catchToast]);
  });
  it("mixed values are the numbers behind the Source table", () => {
    for (const c of load("mixed").cases) {
      const r = run(c);
      if (!r.ok) continue;
      const v = r.values, t = tables(c)[1]!, k2 = v.k! > 2;
      expect(t[2]!.slice(1), c.id).toEqual([fixed(v.SSg!), String(v.G! - 1), fixed(v.SSg! / (v.G! - 1)), fixed(v.Fg!), pc(v.pg!), nl(fixed(v.peg!, 3))]);
      expect(t[3]!.slice(1, 3), c.id).toEqual([fixed(v.SSs!), String(v.n! - v.G!)]);
      expect(t[5]!.slice(1), c.id).toEqual([fixed(v.SSt!), String(v.k! - 1), fixed(v.SSt! / (v.k! - 1)), fixed(v.Ft!), pc(v.pt!), nl(fixed(v.pet!, 3))]);
      expect(t[k2 ? 7 : 6]!.slice(4, 6), c.id).toEqual([fixed(v.Fi!), pc(v.pi!)]);
      if (k2) expect([t[6]![5], t[8]![5]], c.id).toEqual([pc(v.ptc!), pc(v.pic!)]);
      expect(t[k2 ? 9 : 7]!.slice(1, 2), c.id).toEqual([fixed(v.E!)]);
    }
  });
  it("moderate: the Johnson-Neyman sentence's three arms, with the number of points inside the range", () => {
    const jn = (id: string) => notes(find("moderate", id))[2]!;
    const roots = (id: string) => { const r = run(find("moderate", id)); return r.ok ? r.values.roots : -1; };
    expect(jn("moderate-significant")).toMatch(/is significant where support is at or below \d+\.\d\d and from \d+\.\d\d upward, and not significant elsewhere/);
    expect(roots("moderate-significant")).toBe(2);
    expect(jn("moderate-one-root")).toMatch(/is significant where support is from \d+\.\d\d upward, and not significant elsewhere/);
    expect(roots("moderate-one-root")).toBe(1);
    expect(jn("moderate-everywhere-significant")).toMatch(/is significant at every value of support in your data/);
    expect(roots("moderate-everywhere-significant")).toBe(0);
    expect(jn("moderate-nowhere-significant")).toMatch(/is not significant at any value of support in your data/);
    expect(roots("moderate-nowhere-significant")).toBe(0);
  });
  it("moderate: the n < 50 note, and dropped rows in the note and in the left-out counter (13030)", () => {
    expect(notes(find("moderate", "moderate-n-under-50"))[2]).toContain(" With fewer than 50 people the test of an interaction has very little power");
    expect(notes(find("moderate", "moderate-significant"))[2]).not.toContain("fewer than 50");
    const c = find("moderate", "moderate-missing-rows");
    expect(notes(c)[2]).toContain(" 3 rows were left out because a value was missing.");
    expect(notes(c).at(-1)).toBe("3 entries that are not a number were left out.");
    expect(run(c)).toMatchObject({ ok: true, skipped: 3, values: { n: 57 } });
  });
  it("moderate values are the numbers behind the cells", () => {
    for (const c of load("moderate").cases) {
      const r = run(c);
      if (!r.ok) continue;
      const v = r.values, t = tables(c);
      expect(t[0]![1], c.id).toEqual([nl(fixed(v.r2!, 3)), fixed(v.F!), `3, ${v.n! - 4}`, pc(v.pF!), nl(fixed(v.dr2!, 3)), fixed(v.Fc!), `1, ${v.n! - 4}`, pc(v.pFc!)]);
      for (let j = 0; j < 4; j++) expect(t[1]![j + 1]!.slice(1, 5), `${c.id} ${j}`).toEqual([fixed(v["b_" + j]!, 3), fixed(v["se_" + j]!, 3), fixed(v["t_" + j]!), pc(v["p_" + j]!)]);
      ["lo", "mid", "hi"].forEach((q, i) => expect(t[2]![i + 1]!.slice(1, 3).concat(t[2]![i + 1]![4]!), `${c.id} ${q}`).toEqual([fixed(v[`sl_${q}_b`]!, 3), fixed(v[`sl_${q}_se`]!, 3), pc(v[`sl_${q}_p`]!)]));
    }
  });
  it("F14: mediate-same-n-different-data and its -2 have the same n, so the same seed and the same resamples: with Y doubled every bootstrap figure is exactly twice the first's, a different interval", () => {
    const a = run(find("mediate", "mediate-same-n-different-data")), b = run(find("mediate", "mediate-same-n-different-data-2"));
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.values.n).toBe(60);
    expect(b.values.n).toBe(a.values.n);
    expect([b.values.lo, b.values.hi]).not.toEqual([a.values.lo, a.values.hi]);
    for (const k of ["ab", "lo", "hi", "bse"]) expect(b.values[k], k).toBe(2 * a.values[k]!);
  });
  it("mediate: the n < 100 note, the resamples left out, the dropped rows in the note and the counter (13078)", () => {
    expect(notes(find("mediate", "mediate-n-under-100"))[1]).toContain(" With fewer than 100 people the bootstrap interval is unstable");
    expect(notes(find("mediate", "mediate-significant"))[1]).not.toContain("fewer than 100");
    const l = find("mediate", "mediate-resamples-left-out"), rl = run(l);
    expect(rl.ok && rl.values.okCount! < 5000).toBe(true);
    expect(notes(l)[1]).toContain(` ${5000 - (rl.ok ? rl.values.okCount! : 0)} of the 5000 resamples could not be calculated and were left out.`);
    expect(notes(find("mediate", "mediate-significant"))[1]).toContain("a percentile bootstrap from 5,000 resamples with a fixed seed");
    const m = find("mediate", "mediate-missing-rows");
    expect(notes(m)[1]).toContain(" 2 rows were left out because a value was missing.");
    expect(run(m)).toMatchObject({ ok: true, skipped: 2, values: { n: 38 } });
  });
  it("mediate values are the numbers behind the cells", () => {
    for (const c of load("mediate").cases) {
      const r = run(c);
      if (!r.ok) continue;
      const v = r.values, t = tables(c);
      ["a", "b", "cp", "c"].forEach((p, i) => expect([t[0]![i + 1]![1], t[0]![i + 1]![4]], `${c.id} ${p}`).toEqual([fixed(v[p + "_b"]!, 3), pc(v[p + "_p"]!)]));
      expect(t[1]![1], c.id).toEqual([fixed(v.ab!, 3), fixed(v.bse!, 3), `[${fixed(v.lo!, 3)}, ${fixed(v.hi!, 3)}]`, fixed(v.abStd!, 3), nl(fixed(v.r2m!, 3)), nl(fixed(v.r2y!, 3))]);
      expect(v.ab, c.id).toBe(v.a_b! * v.b_b!);
    }
  });
});

/**
 * The Wave 2 gate (parity-port spec §6, plan Task 16): every one of the 26 STAT_TESTS keys has a fixture with a result v1 showed; the 13 TG_DEMO runs of Wave 0's stats-demos capture
 * (test/golden/stats-demos/demos.json, TG_DEMO's `anova1` being the welchAnova key) are the Wave 2 `<test>-demo` cases, sentence and whole results text (both captures collapse
 * #statsResults.textContent with `.replace(/\s+/g, " ")`, untrimmed), and the port reproduces them; and scipy-reference.json has a value for every case v1 ran of every test scipy has.
 */
describe("stats: the Wave 2 gate", () => {
  type Demo = { id: string; test: string; csv: string; apa: string | null; resultsText: string };
  type Ref = { scipy: string; cases: { test: string; id: string; ref: Record<string, number> | null; why?: string }[] };
  const shown = (c: CapturedRun) => c.apa !== null && c.toasts.length === 0;
  /** The TG_DEMO id whose Wave 2 case is not `<id>-demo`: TG_DEMO's anova1 runs the welchAnova key. */
  const DEMO_CASE: Record<string, string> = { anova1: "welchAnova-demo" };
  /** The tests scipy (or numpy beside it) has a counterpart for: stats/scipy-reference.py's REFERENCE, stats-scipy.test.ts's KEYS. */
  const SCIPY_TESTS = ["ttest1", "ttestInd", "ttestPaired", "anova1", "tukey", "regression", "pearson", "mannwhitney", "wilcoxon", "kruskal", "spearman", "welchAnova", "chisq", "gof",
    "mcnemar", "friedman", "mregress", "logistic", "rmanova", "alpha", "moderate", "mediate"];
  /** The tests with no counterpart at all, every case ref null with this reason (scipy-reference.py's NO_COUNTERPART): held to v1 only, "matches v1". */
  const NO_COUNTERPART: Record<string, string> = { cochran: "no scipy counterpart: Cochran's Q matches v1", anova2: "matches v1 (Type III, no R here)", mixed: "matches v1 (F10)" };
  /** The one test allowed no reference at all: desc's mean, SD, median, minimum and maximum. */
  const NO_REFERENCE_YET = { test: "desc", why: "no scipy reference for this test yet" };
  /** The one case of a scipy test that v1 ran and scipy has no finite value for (register row D-W2-16). */
  const NO_FINITE = { id: "kruskal-all-same", why: "scipy returns no finite value for H, p" };

  it("gate: every one of the 26 STAT_TESTS keys has a fixture file, and each fixture holds at least one case v1 showed a result for", () => {
    expect([...fixtures].sort()).toEqual(Object.keys(STAT_TESTS).sort());
    expect(fixtures).toHaveLength(26);
    for (const test of Object.keys(STAT_TESTS)) {
      expect(existsSync(new URL(`./stats/${test}.json`, import.meta.url)), test).toBe(true);
      const cs = load(test).cases;
      expect(cs.every((c) => c.test === test), test).toBe(true);
      expect(cs.filter(shown).length, test).toBeGreaterThanOrEqual(1);
    }
  });
  it("gate: the 13 TG_DEMO runs of Wave 0's stats-demos capture equal the Wave 2 <test>-demo cases (anova1 -> welchAnova-demo) on csv, sentence and results text, and the port reproduces both", () => {
    const w0 = readFixture<{ demos: Demo[] }>("stats-demos", "demos").demos;
    expect(w0).toHaveLength(13);
    expect(w0.map((d) => d.id)).toEqual(["ttest1", "ttestInd", "mannwhitney", "ttestPaired", "wilcoxon", "anova1", "kruskal", "pearson", "spearman", "regression", "chisq", "gof", "alpha"]);
    for (const d of w0) {
      const id = DEMO_CASE[d.id] ?? `${d.id}-demo`;
      expect(id, d.id).toBe(`${d.test}-demo`);
      const c = load(d.test).cases.find((x) => x.id === id);
      expect(c, id).toBeDefined();
      if (!c) continue;
      expect(c.test, id).toBe(d.test);
      expect(c.csv, id).toBe(d.csv);
      expect(c.apa, id).toBe(d.apa);
      expect(c.resultsText, id).toBe(d.resultsText);
      const r = run(c);
      expect(r.ok, id).toBe(true);
      if (r.ok) expect(r.apa, id).toBe(d.apa);
      expect(renderResultsText(r), id).toBe(d.resultsText);
    }
  });
  it("gate: scipy-reference.json covers every case of every test scipy has (22 tests); only desc has no reference, and anova2, cochran and mixed are \"matches v1\"", () => {
    const ref = JSON.parse(readFileSync(new URL("./stats/scipy-reference.json", import.meta.url), "utf8")) as Ref;
    const keys = Object.keys(STAT_TESTS);
    expect([...SCIPY_TESTS, ...Object.keys(NO_COUNTERPART), NO_REFERENCE_YET.test].sort()).toEqual([...keys].sort());
    expect(new Set(ref.cases.filter((c) => c.ref !== null).map((c) => c.test))).toEqual(new Set(SCIPY_TESTS));
    const all = fixtures.flatMap((f) => load(f).cases);
    expect(ref.cases).toHaveLength(all.length);
    const byId = new Map(all.map((c) => [c.id, c]));
    for (const rc of ref.cases) {
      const c = byId.get(rc.id)!;
      expect(c, rc.id).toBeDefined();
      if (rc.test === NO_REFERENCE_YET.test) { expect([rc.ref, rc.why], rc.id).toEqual([null, NO_REFERENCE_YET.why]); continue; }
      expect(rc.why === NO_REFERENCE_YET.why, `${rc.id}: only ${NO_REFERENCE_YET.test} may lack a reference`).toBe(false);
      if (rc.test in NO_COUNTERPART) { expect([rc.ref, rc.why], rc.id).toEqual([null, NO_COUNTERPART[rc.test]]); continue; }
      expect(SCIPY_TESTS, rc.id).toContain(rc.test);
      if (rc.id === NO_FINITE.id) { expect([shown(c), rc.ref, rc.why], rc.id).toEqual([true, null, NO_FINITE.why]); continue; }
      if (shown(c)) { expect(rc.ref, `${rc.id}: v1 showed a result, so scipy's value is required (why: ${rc.why})`).not.toBeNull(); continue; }
      expect(rc.ref, rc.id).toBeNull();
      expect(rc.why, rc.id).toBe(c.toasts.length > 0 ? "v1 refused the case with a toast" : "v1's safety net suppressed the result");
    }
  });
});
