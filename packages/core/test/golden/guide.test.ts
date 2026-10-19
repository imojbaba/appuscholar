import { describe, it, expect } from "vitest";
import { statsParseText } from "../../src/intake";
import { STAT_TESTS } from "../../src/stats-core";
import type { StatsBlock, StatsCtx, StatsTestKey } from "../../src/stats-core";
import {
  TG_Q, TG_RES, TG_IMP, TG_EXTRA, TG_DEMO, GEN_DESIGNS, STATS_TEST_OPTIONS, TG_CHECK_TEXT, TG_CHECK_FALLBACK,
  tgNext, tgRes, tgWhyItems, tgExtra, tgSkew, tgQuant, tgOutliers, tgCheck, tgCheckNumbers, tgCheckCounts, genVerdict,
} from "../../src/guide";
import type { TgAnswers, TgCheckOut, TgResKey } from "../../src/guide";
import type { CheckCase, CheckDataset, GenCase, NumbersCase, PathNode, WhyCase } from "./guide/capture";
import { blockAsText } from "./stats/render";
import { expectGolden, goldenMode } from "./harness/compare";
import { readFixture } from "./harness/fixture";

/**
 * The which-test guide, "Check my numbers" and the practice gate (guide.ts) against v1 running (`golden:capture guide`, guide/capture.ts): every expected value is v1's. The tests here
 * assert coverage (every answer path has a result, every check dataset every combination of its four selects, every GEN_DESIGNS × #statsTest pair) and equality.
 * tgCheck's notes are rebuilt from the port's fields with TG_CHECK_TEXT, as a panel would, and held to the notes v1 put into #tgCheckOut; genReveal's paragraphs and buttons from
 * genVerdict, with `labelOf` the text of #statsTest's option (STATS_TEST_OPTIONS), which is what genReveal reads.
 */

type Fx = { paths: PathNode[]; leaves: number; results: Array<{ key: string; out: unknown }>; why: WhyCase[]; numbers: NumbersCase[]; datasets: CheckDataset[]; checks: CheckCase[]; gen: GenCase[]; labelDiffers: string[] };
const fx = readFixture<Fx>("guide", "cases");
const mode = goldenMode(fx);
const tables = readFixture<{ tables: Record<string, unknown> }>("guide", "tables");

describe("which-test guide: tgNext and tgRes", () => {
  it("tgNext: every answer path of the fixture gives v1's ask or result", () => {
    for (const p of fx.paths) expectGolden(tgNext(p.answers as TgAnswers) as unknown, p.out, mode, JSON.stringify(p.answers));
  });

  it("the fixture's paths are the whole tree: breadth-first from {} over TG_Q's options, every leaf a result, fewer than 60 leaves", () => {
    const seen: TgAnswers[] = [], queue: TgAnswers[] = [{}];
    while (queue.length > 0) {
      const a = queue.shift()!, n = tgNext(a);
      seen.push(a);
      if ("ask" in n) for (const [v] of TG_Q[n.ask].o) queue.push({ ...a, [n.ask]: v });
    }
    expect(seen).toEqual(fx.paths.map((p) => p.answers));
    const leaves = fx.paths.filter((p) => p.out.ask === undefined);
    expect(leaves.every((p) => p.out.res !== undefined)).toBe(true);
    expect(leaves.length).toBe(fx.leaves);
    expect(leaves.length).toBeLessThan(60);
  });

  it("the paths cover every TG_RES key except mixed, which tgNext never reaches (F20)", () => {
    const reached = new Set(fx.paths.filter((p) => p.out.res).map((p) => String(p.out.res!.id)));
    expect([...reached].sort()).toEqual(Object.keys(TG_RES).filter((k) => k !== "mixed").sort());
    // F20 (proposed): rmanova, friedman and twoway read "not built" though the lab runs rmanova, friedman and anova2/mixed; wilcox1 has no runner.
    for (const k of ["rmanova", "friedman", "twoway", "wilcox1"] as const) expect(tgRes(k, {})).toMatchObject({ id: k, built: false, keys: [] });
    expect(tgRes("mixed", {})).toMatchObject({ id: "mixed", built: true, keys: ["mixed"] });
  });

  it("tgRes for every TG_RES key equals v1's", () => {
    expect(fx.results.map((r) => r.key)).toEqual(Object.keys(TG_RES));
    for (const r of fx.results) expectGolden(tgRes(r.key as TgResKey, {}) as unknown, r.out, mode, r.key);
  });

  it("tgWhyItems and tgExtra give tgWhyHTML's items and text for every result node", () => {
    expect(fx.why.length).toBe(fx.leaves);
    for (const w of fx.why) {
      const r = tgRes(w.id as TgResKey, {});
      const items = tgWhyItems(w.answers as TgAnswers, r);
      expect(items.map((x) => x.answer + ". " + x.why), w.id).toEqual(w.items);
      const ex = tgExtra(r.id);
      expect("Why this fits" + items.map((x) => x.answer + ". " + x.why).join("") + r.why + (ex ? "What it assumes. " + ex.assume + "When it stops fitting. " + ex.watch : "")).toBe(w.text);
    }
    expect(fx.why.some((w) => tgExtra(w.id) === undefined)).toBe(true);
  });
});

describe("check my numbers: tgSkew, tgQuant, tgOutliers", () => {
  it("equal v1's on the eight lists", () => {
    expect(fx.numbers.length).toBe(8);
    for (const c of fx.numbers) {
      expectGolden(tgSkew(c.list), c.skew, mode, `${c.id} skew`);
      expectGolden(tgOutliers(c.list), c.outliers, mode, `${c.id} outliers`);
      for (const { q, v } of c.quant) expectGolden(tgQuant(c.sorted, q), v, mode, `${c.id} q${q}`);
    }
  });

  it("F16 (noted): tgSkew is the adjusted Fisher-Pearson skew n/((n-1)(n-2)) Σ((x-m)/s)³ with the sample SD, n²/((n-1)(n-2)) times the histogram's Σ((x-m)/s)³/n (3858, Task 12)", () => {
    const c = fx.numbers.find((x) => x.id === "right-skewed")!, a = c.list, n = a.length, m = a.reduce((t, v) => t + v, 0) / n;
    const s = Math.sqrt(a.reduce((t, v) => t + (v - m) ** 2, 0) / (n - 1)), z3 = a.reduce((t, v) => t + ((v - m) / s) ** 3, 0);
    expect(Math.abs(c.skew - (n / ((n - 1) * (n - 2))) * z3)).toBeLessThan(1e-12);
    expect(Math.abs(c.skew - z3 / n)).toBeGreaterThan(0.5); // 1.74 here, 1.20 by the histogram's form
  });
});

/** #tgCheckOut as v1 builds it (12534-12561), from the port's fields and TG_CHECK_TEXT. */
function rebuild(out: TgCheckOut): StatsBlock[] {
  const blocks: StatsBlock[] = [];
  if (out.numbers) {
    const n = out.numbers;
    blocks.push({ kind: "table", rows: [["Group", "n", "Skew", "Outliers"], ...n.rows.map((r) => [r.group, String(r.n), r.skew, String(r.outliers)])] });
    blocks.push({ kind: "note", html: (n.rank ? TG_CHECK_TEXT.rank : TG_CHECK_TEXT.means) + TG_CHECK_TEXT.thumb });
    if (n.tiny) blocks.push({ kind: "note", html: TG_CHECK_TEXT.tiny });
  }
  if (out.counts) {
    const c = out.counts;
    blocks.push({ kind: "note", html: "Table of " + c.r + " by " + c.c + ", N = " + c.N + ". Smallest expected count: " + c.minE + ". " + c.low + " of " + c.cells + " cells are below 5. " + (c.ok ? TG_CHECK_TEXT.fine : TG_CHECK_TEXT.low) });
  }
  return blocks;
}
/** A block's text as textContent reads it; the rebuilt blocks are text, the captured ones HTML (a cell's escHTML), so only the captured side is decoded. */
const textOf = (b: StatsBlock, html: boolean): string => (html ? blockAsText(b) : b.kind === "table" ? b.rows.map((r) => r.join("")).join("") : b.kind === "note" ? b.html : "");

describe("check my numbers: tgCheck", () => {
  const ctxOf = (csv: string): StatsCtx => ({ data: statsParseText(csv)!, form: { values: {}, ticked: {} }, skipped: 0 });
  const csvOf = new Map(fx.datasets.map((d) => [d.id, d.csv]));

  it("the fixture covers the 13 TG_DEMO CSVs and six edge sets, each with every combination of its four selects", () => {
    expect(fx.datasets.slice(0, 13)).toEqual(Object.entries(TG_DEMO).map(([id, dm]) => ({ id: "demo-" + id, csv: dm.csv })));
    expect(fx.datasets.length).toBe(19);
    for (const ds of fx.datasets) {
      const cols = statsParseText(ds.csv)!.cols, num = ["", ...cols.filter((c) => c.type === "numeric").map((c) => String(c.index))], cat = ["", ...cols.filter((c) => c.type === "categorical").map((c) => String(c.index))];
      const want = num.flatMap((a) => cat.flatMap((b) => cat.flatMap((c) => cat.map((d) => JSON.stringify({ num: a, grp: b, c1: c, c2: d })))));
      expect(fx.checks.filter((c) => c.dataset === ds.id).map((c) => JSON.stringify(c.sel)), ds.id).toEqual(want);
    }
  });

  it("numbers and counts blocks equal v1's for each case", () => {
    for (const c of fx.checks) {
      const out = tgCheck(ctxOf(csvOf.get(c.dataset)!), c.sel);
      if (c.fallback !== null) {
        expect(out, c.id).toEqual({ numbers: null, counts: null });
        expect(TG_CHECK_FALLBACK).toBe(c.fallback);
        continue;
      }
      const mine = rebuild(out);
      expect(mine.map((b) => b.kind), c.id).toEqual(c.blocks.map((b) => b.kind));
      mine.forEach((b, i) => {
        expectGolden(textOf(b, false), blockAsText(c.blocks[i]!), mode, `${c.id} block ${i}`);
        if (b.kind === "table") expectGolden(b.rows, (c.blocks[i] as { rows: string[][] }).rows.map((r) => r.map((x) => blockAsText({ kind: "note", html: x }))), mode, `${c.id} cells`);
      });
      expect(mine.map((b) => textOf(b, false)).join(""), c.id).toBe(c.text);
    }
  });

  it("the cases reach every branch: rank and means, a group under 5, a skew of –, low counts and fine counts, a smallest expected count of –, the fallback", () => {
    const outs = fx.checks.map((c) => tgCheck(ctxOf(csvOf.get(c.dataset)!), c.sel));
    expect(outs.some((o) => o.numbers?.rank === true) && outs.some((o) => o.numbers?.rank === false)).toBe(true);
    expect(outs.some((o) => o.numbers?.tiny === true)).toBe(true);
    expect(outs.some((o) => o.numbers?.rows.some((r) => r.skew === "–"))).toBe(true);
    expect(outs.some((o) => o.numbers?.rows.length === 0)).toBe(true);
    expect(outs.some((o) => o.counts?.ok === true) && outs.some((o) => o.counts?.ok === false)).toBe(true);
    expect(outs.some((o) => o.counts?.minE === "–")).toBe(true);
    expect(fx.checks.some((c) => c.fallback !== null)).toBe(true);
  });

  it("tgCheckNumbers and tgCheckCounts are tgCheck's two halves", () => {
    const ctx = ctxOf(csvOf.get("small-skewed-groups")!);
    expect(tgCheckNumbers(ctx, 1, 0)).toEqual(tgCheck(ctxOf(csvOf.get("small-skewed-groups")!), { num: "1", grp: "0", c1: "", c2: "" }).numbers);
    expect(tgCheckCounts(ctx.data, 0, 2)).toEqual(tgCheck(ctxOf(csvOf.get("small-skewed-groups")!), { num: "", grp: "", c1: "0", c2: "2" }).counts);
  });
});

describe("practice gate: genVerdict", () => {
  const labelOf = (k: string) => STATS_TEST_OPTIONS[k as StatsTestKey];

  it("genVerdict: 260 combinations equal v1's head, why and switch target", () => {
    expect(fx.gen.length).toBe(260);
    expect(fx.gen.map((g) => g.design + "/" + g.test)).toEqual(Object.keys(GEN_DESIGNS).flatMap((d) => Object.keys(STATS_TEST_OPTIONS).map((t) => d + "/" + t)));
    for (const g of fx.gen) {
      const v = genVerdict(g.design, g.test, labelOf);
      expect([v.head, v.why], `${g.design} ${g.test}`).toEqual(g.ps);
      expect([...(v.switchTo ? ["Switch to " + v.switchTo.label] : []), "Run " + labelOf(g.test)]).toEqual(g.buttons);
      expect(v.cls === "warn").toBe(v.switchTo !== undefined);
      if (v.switchTo) expect(v.switchTo.key).toBe(GEN_DESIGNS[g.design as keyof typeof GEN_DESIGNS].ok[0]);
    }
    expect(new Set(fx.gen.map((g) => genVerdict(g.design, g.test, labelOf).head.startsWith("Your choice") ? 0 : genVerdict(g.design, g.test, labelOf).cls === "good" ? 1 : 2)).size).toBe(3);
  });

  it("STATS_TEST_OPTIONS, the text genReveal reads, differs from STAT_TESTS's label for the keys the capture recorded", () => {
    expect(Object.keys(STATS_TEST_OPTIONS).sort()).toEqual(Object.keys(STAT_TESTS).sort());
    expect((Object.keys(STAT_TESTS) as StatsTestKey[]).filter((k) => STATS_TEST_OPTIONS[k] !== STAT_TESTS[k].label)).toEqual(fx.labelDiffers);
  });
});

describe("generated guide tables equal v1's", () => {
  const mine: Record<string, unknown> = { TG_Q, TG_RES, TG_IMP, TG_EXTRA, TG_DEMO, GEN_DESIGNS, STATS_TEST_OPTIONS };
  for (const [name, value] of Object.entries(mine)) it(name, () => expect(JSON.stringify(value)).toBe(JSON.stringify(tables.tables[name])));
  it("the fixture holds these seven tables and no other", () => expect(Object.keys(tables.tables).sort()).toEqual(Object.keys(mine).sort()));
});
