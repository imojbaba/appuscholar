import type { Engine } from "../harness/engines";
import { writeFixture } from "../harness/fixture";

/** One argument per tuple, so a list of single values reads like a grid. */
const each = (xs: number[]): number[][] => xs.map((x) => [x]);
/** Every x followed by every tuple of `rest`, x outermost: the grid is read row by row, as the plan writes it. */
const cross = (xs: number[], rest: number[][]): number[][] => xs.flatMap((x) => rest.map((r) => [x, ...r]));

/**
 * Task 6's grids for the distribution core (v1 8633-8690), called directly on v1 and recorded as `{ fn, args, out }`, the shape smoke/capture.ts uses.
 * Between them the points take pFromF's `f <= 0` exit (f = 0), pFromZ's `z === 0` exit, betai's `x <= 0` and `x >= 1` exits (the (5, 5, 0) and (5, 5, 1) points; pFromT(0, df) sends x = 1),
 * both sides of betai's `x < (a+1)/(a+b+2)` split, gammaq's series and fraction sides (`x < a+1`, with x = 0 reaching _gser's own `x <= 0` exit) and erf's negative side.
 * pFromF at F = 200 and 900 includes the points where `1 - betai(...)` is exactly 0 (register row F5). The scipy block of pvalue.test.ts reads the same points
 * from scipy-reference.json, which pvalue/scipy-reference.py writes from this fixture's cases.
 */
const CALLS: Array<[fn: string, tuples: number[][]]> = [
  ["pFromT", cross([0, 0.5, 1, 2.15, 5, 10, 20, 40], each([1, 2, 3, 10, 21, 30, 100, 200, 1000, 2.5]))],
  ["pFromF", cross([0, 1, 4, 30, 200, 900], [[1, 10], [2, 10], [3, 20], [2, 40], [3, 50], [4, 100], [1.5, 7.3]])],
  ["pFromChi", cross([0, 3.84, 20, 80, 200], each([1, 3, 5, 10]))],
  ["pFromZ", each([0, 0.5, 1.96, 3, 6, -2])],
  ["normalCDF", each([-3, -1, 0, 0.5, 1, 2, 3, 4, 5])],
  ["erf", each([-2, -0.5, 0, 0.3, 1, 3])],
  ["gammaln", each([0.5, 1, 2.5, 10, 100, 1e-3])],
  ["betai", [[0.5, 0.5, 0.5], [2, 3, 0.1], [10, 0.5, 0.999], [5, 5, 0], [5, 5, 1], [1.5, 21, 0.02]]],
  ["gammaq", [[0.5, 0], [0.5, 1.92], [2.5, 10], [5, 0.5], [50, 80]]],
];

export const pvalue: Engine = {
  name: "pvalue",
  async capture(v1, { check }) {
    const cases = CALLS.flatMap(([fn, tuples]) =>
      tuples.map((args) => {
        const out = v1.call<number>(fn, ...args);
        if (typeof out !== "number") throw new Error(`pvalue: v1 ${fn}(${args.join(", ")}) returned ${typeof out}, not a number`);
        return { fn, args: [...args], out };
      }),
    );
    return [writeFixture("pvalue", "cases", { cases }, v1, check)];
  },
};
