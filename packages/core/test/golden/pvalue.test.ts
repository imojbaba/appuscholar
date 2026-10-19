import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { gammaln, betai, gammaq, erf, normalCDF, pFromT, pFromF, pFromChi, pFromZ } from "../../src/pvalue";
import { expectGolden } from "./harness/compare";
import { decodeSpecial, readFixture } from "./harness/fixture";

/**
 * pvalue.ts (v1 8633-8690) against v1 running, point by point with expectGolden (harness/compare.ts: within a relative 1e-12, since V8's Math.exp and Math.log land a few ULP apart on arm64
 * and x64, register row D-W1-16; whole numbers exactly, so an F5 point's 0 still has to be 0), and against scipy where scipy has the statistic (spec 5.9).
 * Every expected value is read from a file: test/golden/pvalue/cases.json (`golden:capture pvalue`, from v1) and pvalue/scipy-reference.json (written by scipy-reference.py, never by hand).
 * The scipy file was produced from the repository root with
 *   uv run --no-project --with scipy==1.17.1 --python 3.13 python -I packages/core/test/golden/pvalue/scipy-reference.py packages/core/test/golden/pvalue
 * What is typed here: the pin of scipy's version, the tolerances, the count of points each function has in the fixture, and OWN_TOLERANCE below, the points that need a tolerance of their own.
 */

type Point = { fn: string; args: number[] };
const fns: Record<string, (...a: number[]) => number> = { gammaln, betai, gammaq, erf, normalCDF, pFromT, pFromF, pFromChi, pFromZ };
const at = (c: Point) => `${c.fn}(${c.args.join(", ")})`;

const fx = readFixture<{ cases: Array<Point & { out: number }> }>("pvalue", "cases");
const ref = decodeSpecial(JSON.parse(readFileSync(new URL("./pvalue/scipy-reference.json", import.meta.url), "utf8"))) as { scipy: string; cases: Array<Point & { ref: number | null }> };

/**
 * The points the global tolerances reject, each with the absolute tolerance that its row in docs/superpowers/specs/parity-deviations.md names in their place.
 * F5a: pFromF is `1 - betai(...)`, and betai near 1 sits on a grid of 2^-53, so a tail between 1e-16 and 1e-10 is off by up to half a step, which is a large share of a tiny tail.
 * F6a: erf is Abramowitz-Stegun 7.1.26, whose error reaches 1.5e-7; the absolute 1e-7 of F6 is the figure for normalCDF, which halves erf's error.
 */
const OWN_TOLERANCE: Record<string, number> = {
  "pFromF(30, 3, 50)": 2 ** -53,
  "pFromF(30, 4, 100)": 2 ** -53,
  "pFromF(200, 3, 20)": 2 ** -53,
  "pFromF(900, 1, 10)": 2 ** -53,
  "pFromF(900, 2, 10)": 2 ** -53,
  "erf(-2)": 1.5e-7,
  "erf(-0.5)": 1.5e-7,
  "erf(1)": 1.5e-7,
};

describe("pvalue.ts is v1's distribution code", () => {
  it("the fixture holds the Task 6 grids: 80 + 42 + 20 + 6 + 9 + 6 + 6 + 6 + 5 points", () => {
    const counts: Record<string, number> = {};
    for (const c of fx.cases) counts[c.fn] = (counts[c.fn] ?? 0) + 1;
    expect(counts).toEqual({ pFromT: 80, pFromF: 42, pFromChi: 20, pFromZ: 6, normalCDF: 9, erf: 6, gammaln: 6, betai: 6, gammaq: 5 });
  });
  for (const c of fx.cases) it(at(c), () => expectGolden(fns[c.fn]!(...c.args), c.out, at(c)));
});

describe("pvalue.ts agrees with scipy where scipy has the statistic (spec §5.9)", () => {
  it("reference file names its scipy", () => expect(ref.scipy).toBe("1.17.1"));
  it("the reference file has scipy's value at every point of the fixture, in the same order", () => {
    expect(ref.cases.map(({ fn, args }) => ({ fn, args }))).toEqual(fx.cases.map(({ fn, args }) => ({ fn, args })));
  });
  for (const c of ref.cases) it(`${at(c)} vs scipy`, () => {
    const got = fns[c.fn]!(...c.args);
    if (c.ref === null) { expect(Number.isFinite(got)).toBe(false); return; }           // scipy returned NaN or an infinity, which JSON cannot hold
    if (c.fn === "pFromF" && c.ref < 1e-16) { expect(got).toBe(0); return; }           // F5: 1 − I underflows to exactly 0
    const own = OWN_TOLERANCE[at(c)];
    if (own !== undefined) { expect(Math.abs(got - c.ref)).toBeLessThan(own); return; }   // F5a, F6a: this point's own tolerance, named in its register row
    if (c.fn === "normalCDF" || c.fn === "erf") { expect(Math.abs(got - c.ref)).toBeLessThan(1e-7); return; }   // F6: Abramowitz–Stegun 7.1.26
    expect(Math.abs(got - c.ref) / Math.max(Math.abs(c.ref), 1e-300)).toBeLessThan(1e-6);
  });
});
