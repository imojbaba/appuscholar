import type { Engine } from "../harness/engines";
import type { V1 } from "../harness/v1";
import { writeFixture } from "../harness/fixture";

/**
 * Task 1's grids for v1's statistics maths (index.html 8691-8752, 8834-8893, 8942-9005, 9044-9347), called directly on v1 and recorded as `{ fn, args, out }`, the shape
 * smoke/capture.ts and pvalue/capture.ts use. Every `out` is v1's; the arguments are inputs, typed here or read from v1 (the TG_DEMO datasets, the outputs of one v1 function that
 * another takes, such as the correlation matrix stkOmega reads).
 *
 * Four functions do not take or return plain data, so their records follow a convention that statsmath.test.ts repeats:
 * - `plRng` and `stkRng` return a generator: the record is its first five draws (DRAWS);
 * - `plNorm` takes a generator: its args are `[seed]`, and the record is the first three values of plNorm on `plRng(seed)`;
 * - `STK_GL` is a constant: one case with no args, whose record is the `{x, w}` object;
 * - `stkGL` takes a function: its first argument is a name in INTEGRANDS, the same arrow in the capture and the test.
 */
export const DRAWS = 5;
export const INTEGRANDS: Record<string, (z: number) => number> = {
  square: (z) => z * z,
  gauss: (z) => Math.exp(-z * z / 2),
};

type Case = { fn: string; args: unknown[]; out: unknown };
type TgDemo = { csv: string };

/** A TG_DEMO dataset read from v1 (content is copied, never retyped): its header and rows of cells, as strings. */
function demoTable(v1: V1, id: string): { head: string[]; rows: string[][] } {
  const dm = v1.eval<Record<string, TgDemo>>("TG_DEMO")[id];
  if (!dm) throw new Error(`statsmath: v1 has no TG_DEMO.${id}`);
  const lines = dm.csv.split("\n");
  return { head: lines[0]!.split(","), rows: lines.slice(1).map((l) => l.split(",")) };
}
/** A two-column demo (group, value) as v1's groups in the order their labels first appear. */
function demoGroups(v1: V1, id: string): number[][] {
  const by: Record<string, number[]> = {};
  for (const [g, v] of demoTable(v1, id).rows) (by[g!] ??= []).push(Number(v));
  return Object.values(by);
}

/**
 * The logistic sample of port-audit-evidence/05-rmanova-logistic-grouporder-probes.cjs, lines 31-33 (the brief calls it the 20-row sample; the script draws 60 rows, all kept here):
 * a seeded linear congruential generator, x1 in [-3, 3], x2 in [0, 4], y drawn from the logistic model 0.3 + 0.9 x1 - 0.5 x2.
 */
function logisticSample(): { x1: number[]; x2: number[]; y: number[] } {
  let s = 12345; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const x1: number[] = [], x2: number[] = [], y: number[] = [];
  for (let i = 0; i < 60; i++) {
    const a = Math.round((rnd() * 6 - 3) * 100) / 100, b = Math.round((rnd() * 4) * 100) / 100;
    const p = 1 / (1 + Math.exp(-(0.3 + 0.9 * a - 0.5 * b)));
    x1.push(a); x2.push(b); y.push(rnd() < p ? 1 : 0);
  }
  return { x1, x2, y };
}

/** A two-way design: one row per observation, `cells[i][j]` the scores of level i of A and level j of B, as `y`, `a`, `b` in row order. */
function design(cells: number[][][]): { y: number[]; a: number[]; b: number[]; la: number; lb: number; cellMap: Record<string, number[]> } {
  const y: number[] = [], a: number[] = [], b: number[] = [], cellMap: Record<string, number[]> = {};
  cells.forEach((row, i) => row.forEach((vals, j) => { cellMap[i + "|" + j] = [...vals]; for (const v of vals) { y.push(v); a.push(i); b.push(j); } }));
  return { y, a, b, la: cells.length, lb: cells[0]!.length, cellMap };
}

const power = (test: string, effect: number, extra: Record<string, number> = {}) => ({ test, effect, alpha: 0.05, tails: 2, ...extra });
const solveSpec = (test: string, extra: Record<string, number> = {}) => ({ test, alpha: 0.05, tails: 2, ...extra });

function calls(v1: V1): Array<[fn: string, tuples: unknown[][]]> {
  const desc = [[1, 2, 3, 4], [5], [2, 2, 2], [1.5, -2, 7.25, 0], [3, 1, 2]].map((a) => [a]);
  const shapiroSmoke = [[2.1, 3.4, 1.9, 5.6, 4.4, 3.8, 2.7, 9.1], [12, 14, 11, 13, 15, 12, 14, 13, 16, 18, 11, 12], [1, 2, 2, 3, 3, 3, 4, 4, 5, 9, 10, 20, 25, 3, 2]];
  const n50 = Array.from({ length: 50 }, (_, k) => ((k + 1) * (k + 1)) % 37);
  const arms = demoGroups(v1, "anova1"), kwGroups = demoGroups(v1, "kruskal");
  const sp = demoTable(v1, "spearman").rows, spX = sp.map((r) => Number(r[0])), spY = sp.map((r) => Number(r[1]));
  const al = demoTable(v1, "alpha"), q6 = al.head.indexOf("q6");
  const alphaX = al.rows.map((r) => r.map((c, j) => (j === q6 ? 1 + 5 - Number(c) : Number(c))));   // the demo's rev q6 with rrange 1-5
  const constCol = [[1, 2, 5], [2, 3, 5], [3, 1, 5], [4, 4, 5]];

  const ols1 = { cols: [[1, 1, 1, 1, 1], [1, 2, 3, 4, 5]], y: [2.1, 3.9, 6.2, 7.8, 10.1] };
  const p3 = { xs: [[1, 2, 3, 4, 5, 6, 7, 8], [2, 1, 4, 3, 6, 5, 8, 9], [0.5, 0.1, 0.9, 0.3, 0.2, 0.8, 0.6, 0.4]], y: [3.1, 2.9, 6.5, 5.8, 8.2, 8.9, 11.4, 12.6] };
  const dep = { xs: [[1, 2, 3, 4], [2, 4, 6, 8]], y: [1, 3, 2, 5] };
  const zero = { xs: [[0, 0, 0, 0]], y: [1, 3, 2, 5] };
  const one4 = [1, 1, 1, 1], one8 = [1, 1, 1, 1, 1, 1, 1, 1];

  const lg = logisticSample();
  const logit = v1.call<{ pr: number[] }>("stkLogit", [lg.x1, lg.x2], lg.y);
  const sepY = [0, 0, 1, 0, 1, 1, 0, 1, 1, 0];
  // quasi-separated: Newton converges to a full fit whose slope (about 1145) and SE (about 928) pass the 30 and 500 cut-offs (8974), so `sep` is true on the full object (F12)
  const quasiSep = [[[0.001, 0.002, 0.003, 0.004, 0.005, 0.006]], [0, 1, 0, 1, 1, 1]];

  const d22 = design([[[4, 5, 6], [7, 8, 6]], [[5, 6, 4], [9, 10, 11]]]);
  const d23 = design([[[3, 4, 5], [6, 7], [5, 6, 8, 7]], [[4, 2], [8, 9, 10], [3, 5, 4]]]);
  const d22one = design([[[4, 5, 6], [7, 8, 6]], [[5, 6, 4], [9]]]);
  const d22min = design([[[4], [7]], [[5], [9]]]);
  const a23 = v1.call<{ mse: number; dfe: number }>("stkAnova2", d23.y, d23.a, d23.b, d23.la, d23.lb);
  const allEqual = [[2, 2, 2], [2, 2], [2, 2, 2]];
  const kw = v1.call("stkKruskal", kwGroups);
  const R = v1.call("stkCorrMat", alphaX);
  const rc3 = [[3, 1, 0], [1, 4, 1], [0, 2, 5]];

  return [
    ["smean", desc], ["svar", desc], ["ssd", desc], ["smedian", desc],
    ["ranks", [[[3, 1, 2]], [[1, 1, 2]], [[2, 2, 2]], [[1.1, 1.0, 2.2, 2.1, 1.1]], [[5, 3, 5, 1, 3, 5]]]],
    ["stkNormCdf", [[-3], [-1], [0], [0.5], [1.96], [4]]],
    ["stkQnorm", [[0.001], [0.025], [0.5], [0.975], [0.999]]],
    ["stkPoly", [[[1, 2, 3], 2], [[0.5, -0.39978, 0.025054, -6.714e-4], 10]]],
    ["stkShapiro", [...shapiroSmoke, [1, 2, 4], [1, 2, 2, 9], [2, 4, 4, 5, 9], [1, 2, 3, 4, 5, 20], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 30],
      [12, 14, 11, 13, 15, 12, 14, 13, 16, 18, 11, 12], n50, [3, 3, 3, 3], [1, 2], [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 100]].map((x) => [x])],
    ["stkBrownForsythe", [[arms], [[[1, 2, 3], [1, 2, 3]]], [[[2, 2], [3, 3]]], [[[1, 3, 5, 2], [4, 6, 8], [2, 2, 3, 9, 7], [10, 12]]]]],
    ["stkRSS", [[ols1.cols, ols1.y], [[one8, ...p3.xs], p3.y], [dep.xs, dep.y], [[one4, ...zero.xs], zero.y]]],
    ["stkOLS", [[ols1.cols.slice(1), ols1.y], [p3.xs, p3.y], [dep.xs, dep.y], [zero.xs, zero.y]]],
    ["stkLogit", [[[lg.x1, lg.x2], lg.y], [[lg.x1], lg.y.map(() => 1)], [[sepY], sepY], [[lg.x1, lg.x1], lg.y], quasiSep]],
    ["stkAUC", [[logit.pr, lg.y]]],
    ["stkAnova2", [d22, d23, d22one, d22min].map((d) => [d.y, d.a, d.b, d.la, d.lb])],
    ["stkSimpleEffects", [[d23.cellMap, d23.la, d23.lb, a23.mse, a23.dfe]]],
    ["plRng", [[1], [42], [0], [-1], [2 ** 32]]],
    ["plNorm", [[7]]],
    ["plSim", [[0.5, 10, 5, 1], [0.2, 20, 3, 42], [1, 5, 2, 99]]],
    ["pwLogPois", [[0, 1], [3, 2.5], [10, 50]]],
    ["pwNcChiSf", [[3.84, 1, 0], [3.84, 1, 4], [11.07, 5, 10], [100, 10, 50], [0, 1, 4]]],
    ["pwNcFSf", [[4.0, 1, 10, 0], [4.0, 1, 10, 5], [2.5, 3, 60, 8], [0, 1, 10, 5]]],
    ["pwNctCdf", [[2.0, 10, 0], [2.0, 10, 1.5], [-1, 30, 2], [1.7, 100, 3], [1, 0, 1]]],
    ["pwChiCrit", [[0.05, 1], [0.01, 5], [0.05, 100]]],
    ["pwPowerT", [[2, 30, 0.05, 2], [2, 30, 0.05, 1]]],
    ["pwPowerF", [[0.0625, 3, 76, 0.05, 80]]],
    ["pwPower", [
      // the smoke five, then each test type at two n and the NaN exits; effects are PW_INFO's defaults (13459-13465)
      [power("ind", 0.5), 64], [power("paired", 0.4), 30], [power("one", 0.3), 100], [power("anova", 0.25, { k: 4 }), 40], [power("corr", 0.3), 85],
      [power("ind", 0.5), 1], [power("paired", 0.5), 1], [power("paired", 0.5), 30], [power("one", 0.5), 100],
      [power("anova", 0.25, { k: 4 }), 2], [power("regr", 0.15, { p: 3 }), 4], [power("regr", 0.15, { p: 3 }), 100],
      [power("chisq", 0.3, { df: 1 }), 100], [power("corr", 0.3), 3], [power("x", 0.5), 50],
      [{ ...power("corr", 0.3), tails: 1 }, 85], [power("anova", 0.25, { k: 4 }), 1],
    ]],
    ["pwSolveN", [
      [power("ind", 0.5), 0.8], [power("ind", 0.2), 0.9], [power("corr", 0.3), 0.8],
      [power("anova", 0.25, { k: 3 }), 0.8], [power("regr", 0.15, { p: 2 }), 0.8], [power("chisq", 0.3, { df: 2 }), 0.8], [power("ind", 0.01), 0.8],
    ]],
    ["pwSolveEffect", [[solveSpec("ind"), 64, 0.8], [solveSpec("corr"), 30, 0.8], [solveSpec("anova", { k: 3 }), 20, 0.8], [solveSpec("ind"), 2, 0.999]]],
    ["stkTCrit", [[10, 0.05], [1, 0.05], [1000, 0.01], [2.5, 0.05]]],
    ["stkFQuant", [[0.975, 14, 70], [0.025, 14, 70], [0.5, 1, 1]]],
    ["stkTieTerm", [[[1, 1, 2, 3, 3, 3]], [[1, 2, 3]]]],
    ["stkHolm", [[[0.01, 0.04, 0.03]], [[0.5, 0.5]], [[0.001]]]],
    ["stkKruskal", [[kwGroups], [allEqual]]],
    ["stkDunn", [[kwGroups, kw]]],
    ["stkSpearman", [[spX, spY], [[1, 2, 3], [3, 2, 1]], [[1, 2, 3, 4], [1, 2, 3, 4]]]],
    ["stkCorrMat", [[alphaX], [constCol]]],
    ["stkAlpha", [[alphaX]]],
    ["stkOmega", [[R]]],
    ["stkRng", [[12345], [1]]],
    ["stkOmegaBoot", [[alphaX, 400], [alphaX, 200], [alphaX, 20]]],
    ["STK_GL", [[]]],
    ["stkGL", [["square", 0, 1, 2], ["gauss", -8, 8, 4]]],
    ["stkPhi", [[0], [1.5], [-2]]],
    ["stkPtukey", [[3.5, 3, 10], [4.2, 4, 20], [2.0, 3, 30], [5.5, 5, 12], [3.0, 6, 60], [0, 3, 10], [8, 3, 4]]],
    ["stkQtukey", [[0.95, 3, 10], [0.95, 4, 20], [0.95, 6, 60], [0.95, 3, 5], [0.95, 2, 1000]]],
    ["stkWelchAnova", [[arms], [[[1, 2, 3], [4, 4, 4], [5, 7, 9]]]]],
    ["stkGamesHowell", [[arms], [[[1, 2, 3], [4, 4, 4], [5, 7, 9]]]]],
    ["stkLogChoose", [[10, 3], [52, 5], [5, 0]]],
    ["stkFisherRC", [[[[18, 12], [15, 15]]], [rc3], [[[3, 1], [2, 4], [0, 3], [5, 1]]], [[[3, 2, 0, 5], [1, 4, 3, 1]]], [rc3, 10]]],
    ["stkFisher2x2", [[18, 12, 15, 15], [0, 5, 5, 0], [5, 0, 0, 5], [0, 5, 0, 5], [3, 1, 1, 3]]],
    ["stkExactMW", [[5, 7, 6], [8, 8, 20], [12, 10, 40], [3, 3, 0], [3, 3, 9]]],
    ["stkExactSR", [[5, 0], [5, 7.5], [10, 20]]],
    ["stkBinomTwo", [[18, 60, 1 / 3], [0, 10, 0.5], [5, 10, 0.5]]],
  ];
}

/** What v1 returns for one case, by the conventions above. */
function record(v1: V1, fn: string, args: unknown[]): unknown {
  switch (fn) {
    case "plRng": case "stkRng": {
      const r = v1.call<() => number>(fn, ...args);
      return Array.from({ length: DRAWS }, () => r());
    }
    case "plNorm": {
      const r = v1.call<() => number>("plRng", ...args);
      return [v1.call("plNorm", r), v1.call("plNorm", r), v1.call("plNorm", r)];
    }
    case "STK_GL": return v1.eval("STK_GL");
    case "stkGL": {
      const f = INTEGRANDS[args[0] as string];
      if (!f) throw new Error(`statsmath: no integrand ${String(args[0])}`);
      return v1.call("stkGL", f, ...args.slice(1));
    }
    default: return v1.call(fn, ...args);
  }
}

export const statsmath: Engine = {
  name: "statsmath",
  async capture(v1, { check }) {
    // args are copied before the call, so a function that changed its input could not change the record.
    const cases: Case[] = calls(v1).flatMap(([fn, tuples]) => tuples.map((args) => {
      const copy = structuredClone(args);
      return { fn, args: copy, out: record(v1, fn, structuredClone(args)) };
    }));
    const counts: Record<string, number> = {};
    for (const c of cases) counts[c.fn] = (counts[c.fn] ?? 0) + 1;
    console.log(`statsmath: ${cases.length} cases, ${Object.keys(counts).length} functions: ${Object.entries(counts).map(([f, n]) => `${f} ${n}`).join(", ")}`);
    return [writeFixture("statsmath", "cases", { cases }, v1, check)];
  },
};
