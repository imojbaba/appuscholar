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
    // A real key whose runner a later task ports: the task that ports ttestInd updates this line.
    expect(runStats(data, "ttestInd", { values: { dv: "0", iv: "0" }, ticked: {} })).toEqual({ ok: false, test: "ttestInd", reason: "toast", toast });
  });
  it("desc-one-left-out: one dropped entry gives the singular note (11994)", () => {
    const c = load("desc").cases.find((x) => x.id === "desc-one-left-out")!;
    const last = c.blocks[c.blocks.length - 1]!;
    expect(last.kind === "note" && last.html.startsWith("1 entry that is")).toBe(true);
    expect(run(c)).toMatchObject({ ok: true, skipped: 1 });
  });
});
