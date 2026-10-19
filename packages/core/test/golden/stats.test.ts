import { describe, it, expect } from "vitest";
import { statsParseText } from "../../src/intake";
import { STAT_TESTS } from "../../src/stats-core";
import type { StatsBlock, StatsResult } from "../../src/stats-core";
import { runStats } from "../../src/stats";
import { fmtP } from "../../src/statfmt";
import type { CapturedRun } from "./stats/drive";
import { corpusFiles, readCorpus } from "./stats/capture";
import { blockAsText, decodeText, renderResultsText } from "./stats/render";
import { expectGolden, goldenMode } from "./harness/compare";
import { readFixture } from "./harness/fixture";

/**
 * The Statistics Lab (stats-core.ts, stats.ts and the runner modules) against v1 running: for every `test/golden/stats/<test>.json` (`golden:capture stats`), each case's CSV goes through
 * statsParseText and runStats with the form v1's page held, and the result is held to what v1 showed. A toast is the same string; otherwise the sentence is the same string, the blocks are
 * the same kinds in the same order with the same decoded text (a table cell by cell), and the whole results text, rendered by stats/render.ts, is #statsResults's text.
 * Typed here are only the register's own claims, checked against the fixture: D-W2-4 (the doubled "left out" count) and F22 (a column named undefined), and the guards that a fixture holds
 * the cases its brief named and was captured from its corpus as it is on disk.
 */

const fixtures = corpusFiles().map((f) => f.replace(/\.json$/, ""));
const load = (file: string) => readFixture<{ cases: CapturedRun[] }>("stats", file);
const blocksOf = (r: StatsResult): StatsBlock[] => (r.ok ? r.blocks : r.reason === "undefined" ? r.blocks : []);
/** A block as its decoded cells, so a table is compared cell by cell and not only as joined text. */
const cellsOf = (b: StatsBlock): unknown => (b.kind === "table" ? b.rows.map((r) => r.map(decodeText)) : b.kind === "list" ? b.items.map(decodeText) : blockAsText(b));
const run = (c: CapturedRun) => runStats(statsParseText(c.csv)!, c.test, c.form);

const REQUIRED: Record<string, string[]> = {
  desc: ["desc-demo-score", "desc-one-value", "desc-text-in-numeric", "desc-hindi-column-name", "desc-column-named-undefined", "desc-negative-decimals"],
  ttest1: ["ttest1-demo", "ttest1-mu-empty", "ttest1-mu-text", "ttest1-all-same", "ttest1-one-value", "ttest1-text-in-numeric", "ttest1-n3", "ttest1-n2-assumptions-skip"],
  ttestInd: ["ttestInd-demo", "ttestInd-text-in-numeric", "ttestInd-integer-labels", "ttestInd-two-integer-labels", "ttestInd-group-named-NaN", "ttestInd-one-value-in-a-group",
    "ttestInd-no-spread-both", "ttestInd-no-spread-one", "ttestInd-unequal-n"],
  ttestPaired: ["ttestPaired-demo", "ttestPaired-text-in-numeric", "ttestPaired-same-diffs", "ttestPaired-missing-cells", "ttestPaired-n2"],
  anova1: ["anova1-demo", "anova1-text-in-numeric", "anova1-two-groups", "anova1-one-row-group", "anova1-no-spread", "anova1-six-groups", "anova1-hindi-labels"],
  tukey: ["tukey-demo-arms", "tukey-text-in-numeric", "tukey-integer-labels", "tukey-two-groups", "tukey-six-groups"],
  regression: ["regression-demo", "regression-text-in-numeric", "regression-exact-line", "regression-no-spread-x", "regression-n2", "regression-negative-slope"],
  pearson: ["pearson-demo", "pearson-text-in-numeric", "pearson-n3", "pearson-perfect", "pearson-negative", "pearson-no-spread"],
};

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
      it(c.id, () => {
        const r = run(c);
        if (c.apa === null && c.toasts.length > 0) {
          expect(r).toMatchObject({ ok: false, test: c.test, reason: "toast", toast: c.toasts[0] });
          expect(c.toasts).toHaveLength(1);
          return;
        }
        expect(c.toasts).toEqual([]);
        if (c.apa === null) expect(r).toMatchObject({ ok: false, reason: "undefined" });
        else {
          expect(r.ok).toBe(true);
          if (r.ok) expect(r.apa).toBe(c.apa);
          expect(r.test).toBe(c.test);
        }
        const blocks = blocksOf(r);
        expect(blocks.map((b) => b.kind)).toEqual(c.blocks.map((b) => b.kind));
        blocks.forEach((b, i) => {
          expectGolden(blockAsText(b), blockAsText(c.blocks[i]!), mode, `${c.id} block ${i}`);
          expectGolden(cellsOf(b), cellsOf(c.blocks[i]!), mode, `${c.id} block ${i} cells`);
        });
        expect(renderResultsText(r)).toBe(c.resultsText);
      });
    }
  });
}

describe("stats/render.ts (the test-only renderer)", () => {
  it("decodeText strips real tags only, so fmtP's literal < before a </b> stays", () => {
    expect(decodeText("<b>Fisher-Freeman-Halton exact test: " + fmtP(0.0001) + ".</b> All 12 tables")).toBe("Fisher-Freeman-Halton exact test: p < .001. All 12 tables");
    expect(decodeText('<p class="desc">a &lt; b &amp;amp; <i>c</i>&nbsp;&#39;d&#39; &quot;e&quot;</p>')).toBe("a < b &amp; c\u00a0'd' \"e\"");
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
  it("a key no runner handles yet, or no key v1 knows, gets the catch toast (register row D-W2-3)", () => {
    const data = statsParseText("score\n1\n2\n3")!;
    const toast = "Could not run that test — check the columns you picked match what the test needs";
    expect(runStats(data, "nope" as "desc", { values: { dv: "0" }, ticked: {} })).toEqual({ ok: false, test: "nope", reason: "toast", toast });
    // A real key whose runner a later task ports: the task that ports mannwhitney updates this line.
    expect(runStats(data, "mannwhitney", { values: { dv: "0", iv: "0" }, ticked: {} })).toEqual({ ok: false, test: "mannwhitney", reason: "toast", toast });
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
  it("values are the numbers behind the table cells (register row F27)", () => {
    const fixed = (x: number, k = 2) => x.toFixed(k);
    const row = (r: StatsResult, b = 0, i = 1) => (r.ok ? (r.blocks[b] as { rows: string[][] }).rows[i]! : []);
    for (const c of load("ttestInd").cases) { const r = run(c); if (!r.ok) continue; const v = r.values;
      expect(row(r, 0, 1).slice(1)).toEqual([String(v.n1), fixed(v.m1!), fixed(Math.sqrt(v.v1!))]);
      expect(row(r, 0, 2).slice(1)).toEqual([String(v.n2), fixed(v.m2!), fixed(Math.sqrt(v.v2!))]);
      expect(r.apa).toContain(`t(${fixed(v.df!)}) = ${fixed(v.t!)}`); }
    for (const c of load("ttestPaired").cases) { const r = run(c); if (!r.ok) continue; const v = r.values;
      expect(row(r).slice(0, 5)).toEqual([String(v.n), fixed(v.md!), fixed(v.sdv!), fixed(v.t!), String(v.df)]); }
    for (const c of load("anova1").cases) { const r = run(c); if (!r.ok) continue; const v = r.values;
      expect(blockAsText(r.blocks[1]!)).toContain(`F(${v.dfb}, ${v.dfw}) = ${fixed(v.F!)}`); expect(v.N! - v.k!).toBe(v.dfw); }
    for (const c of load("tukey").cases) { const r = run(c); if (!r.ok) continue; const v = r.values;
      const rows = (r.blocks[0] as { rows: string[][] }).rows.slice(1);
      expect(rows).toHaveLength(v.kk! * (v.kk! - 1) / 2);
      let n = 0; for (let i = 0; i < v.kk!; i++) for (let j = i + 1; j < v.kk!; j++) { expect(rows[n++]!.slice(1, 3)).toEqual([fixed(v[`diff_${i}_${j}`]!), fixed(v[`q_${i}_${j}`]!)]); } }
    for (const c of load("regression").cases) { const r = run(c); if (!r.ok) continue; const v = r.values;
      expect(row(r).slice(0, 6)).toEqual([String(v.n), fixed(v.b0!, 3), fixed(v.b1!, 3), fixed(v.seB1!, 3), fixed(v.t!), String(v.df)]); expect(row(r)[7]).toBe(fixed(v.r2!, 3)); }
    for (const c of load("pearson").cases) { const r = run(c); if (!r.ok) continue; const v = r.values;
      expect(row(r)[0]).toBe(String(v.n)); expect(row(r)[2]).toBe(String(v.df)); expect("cl" in v).toBe(v.n! > 3); }
  });
});
