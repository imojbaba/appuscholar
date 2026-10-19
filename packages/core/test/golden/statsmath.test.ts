import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import * as statsmath from "../../src/statsmath";
import {
  smean, svar, ssd, smedian, ranks, stkNormCdf, stkQnorm, stkPoly, stkShapiro, stkBrownForsythe, stkRSS, stkAnova2, stkOLS, stkLogit, stkAUC, stkSimpleEffects,
  plRng, plNorm, plSim, pwLogPois, pwNcChiSf, pwNcFSf, pwNctCdf, pwChiCrit, pwPowerT, pwPowerF, pwPower, pwSolveN, pwSolveEffect,
  stkTCrit, stkFQuant, stkTieTerm, stkHolm, stkKruskal, stkDunn, stkSpearman, stkCorrMat, stkOmega, stkAlpha, stkRng, stkOmegaBoot,
  STK_GL, stkGL, stkPhi, stkPtukey, stkQtukey, stkWelchAnova, stkGamesHowell, stkLogChoose, stkFisherRC, stkFisher2x2, stkExactMW, stkExactSR, stkBinomTwo,
} from "../../src/statsmath";
import { DRAWS, INTEGRANDS } from "./statsmath/capture";
import { expectGolden, goldenMode } from "./harness/compare";
import { decodeSpecial, readFixture } from "./harness/fixture";

/**
 * statsmath.ts (v1 8691-8752, 8834-8893, 8942-9005, 9044-9347) against v1 running, case by case with expectGolden in the fixture's mode (harness/compare.ts, register row D-W1-16), and
 * against scipy where scipy has the statistic (spec 5.9).
 * Every expected value is read from a file: test/golden/statsmath/cases.json (`golden:capture statsmath`, from v1) and statsmath/scipy-reference.json (written by scipy-reference.py from
 * the fixture's arguments, never by hand), produced from the repository root with
 *   uv run --no-project --with scipy==1.17.1 --python 3.13 python -I packages/core/test/golden/statsmath/scipy-reference.py packages/core/test/golden/statsmath
 * What is typed here: the pin of scipy's version, the tolerances, the count of cases each function has in the fixture, the record conventions of statsmath/capture.ts (a generator is
 * recorded as its first DRAWS draws, plNorm as three values on plRng(seed), STK_GL as the constant, stkGL's integrand by name) and V1_HAS_A_VALUE below.
 */

type Case = { fn: string; args: unknown[] };
type Fn = (...args: never[]) => unknown;
const draws = (r: () => number) => Array.from({ length: DRAWS }, () => r());

/** Each export of statsmath.ts by its name, called as the capture called v1's function of that name. */
const fns: Record<string, Fn> = {
  smean, svar, ssd, smedian, ranks, stkNormCdf, stkQnorm, stkPoly, stkShapiro, stkBrownForsythe, stkRSS, stkAnova2, stkOLS, stkLogit, stkAUC, stkSimpleEffects,
  plRng: (seed: number) => draws(plRng(seed)),
  plNorm: (seed: number) => { const r = plRng(seed); return [plNorm(r), plNorm(r), plNorm(r)]; },
  plSim, pwLogPois, pwNcChiSf, pwNcFSf, pwNctCdf, pwChiCrit, pwPowerT, pwPowerF, pwPower, pwSolveN, pwSolveEffect,
  stkTCrit, stkFQuant, stkTieTerm, stkHolm, stkKruskal, stkDunn, stkSpearman, stkCorrMat, stkOmega, stkAlpha,
  stkRng: (seed: number) => draws(stkRng(seed)),
  stkOmegaBoot,
  STK_GL: () => STK_GL,
  stkGL: (name: string, a: number, b: number, segs: number) => stkGL(INTEGRANDS[name]!, a, b, segs),
  stkPhi, stkPtukey, stkQtukey, stkWelchAnova, stkGamesHowell, stkLogChoose, stkFisherRC, stkFisher2x2, stkExactMW, stkExactSR, stkBinomTwo,
};
const run = (c: Case): unknown => (fns[c.fn] as (...args: unknown[]) => unknown)(...structuredClone(c.args));
const at = (c: Case) => `${c.fn}(${JSON.stringify(c.args).slice(0, 80)})`;

const fx = readFixture<{ cases: Array<Case & { out: unknown }> }>("statsmath", "cases");
const mode = goldenMode(fx);
type Ref = number | null | Record<string, number | null>;
const ref = decodeSpecial(JSON.parse(readFileSync(new URL("./statsmath/scipy-reference.json", import.meta.url), "utf8"))) as { scipy: string; cases: Array<Case & { ref: Ref }> };

describe("statsmath.ts is v1's statistics maths (8691-9347)", () => {
  it("the fixture covers every exported function, and fns names every export", () => {
    expect(new Set(fx.cases.map((c) => c.fn))).toEqual(new Set(Object.keys(fns)));
    expect(new Set(Object.keys(statsmath))).toEqual(new Set(Object.keys(fns)));
  });
  it("the fixture holds Task 1's grids (207 cases over 54 functions)", () => {
    const counts: Record<string, number> = {};
    for (const c of fx.cases) counts[c.fn] = (counts[c.fn] ?? 0) + 1;
    expect(counts).toEqual({
      smean: 5, svar: 5, ssd: 5, smedian: 5, ranks: 5, stkNormCdf: 6, stkQnorm: 5, stkPoly: 2, stkShapiro: 13, stkBrownForsythe: 4, stkRSS: 4, stkOLS: 4, stkLogit: 5, stkAUC: 1,
      stkAnova2: 4, stkSimpleEffects: 1, plRng: 5, plNorm: 1, plSim: 3, pwLogPois: 3, pwNcChiSf: 5, pwNcFSf: 4, pwNctCdf: 5, pwChiCrit: 3, pwPowerT: 2, pwPowerF: 1, pwPower: 17,
      pwSolveN: 7, pwSolveEffect: 4, stkTCrit: 4, stkFQuant: 3, stkTieTerm: 2, stkHolm: 3, stkKruskal: 2, stkDunn: 1, stkSpearman: 3, stkCorrMat: 2, stkAlpha: 1, stkOmega: 1,
      stkRng: 2, stkOmegaBoot: 3, STK_GL: 1, stkGL: 2, stkPhi: 3, stkPtukey: 7, stkQtukey: 5, stkWelchAnova: 2, stkGamesHowell: 2, stkLogChoose: 3, stkFisherRC: 5,
      stkFisher2x2: 5, stkExactMW: 5, stkExactSR: 3, stkBinomTwo: 3,
    });
  });
  for (const c of fx.cases) it(at(c), () => expectGolden(run(c), c.out, mode, at(c)));
});

/**
 * The cases where scipy has no value (it returns NaN) and v1 has one; nothing is compared there. Each names why and its register row.
 * - every score tied: v1's Kruskal-Wallis skips the tie correction when C = 1 − T/(N³ − N) is 0 (`if(C>0)H/=C`, 9150) and reports H = 0, p = 1; scipy divides by C = 0 and returns NaN (register row D-W2-16).
 */
const V1_HAS_A_VALUE = new Set(["stkKruskal([[[2,2,2],[2,2],[2,2,2]]])"]);

describe("statsmath.ts agrees with scipy where scipy has the statistic (spec §5.9)", () => {
  it("names scipy 1.17.1", () => expect(ref.scipy).toBe("1.17.1"));
  it("the reference file has an entry for every fixture case of the scipy-checked functions, in the fixture's order", () => {
    const checked = new Set(ref.cases.map((c) => c.fn));
    expect(checked.size).toBe(16);
    expect(ref.cases.map(({ fn, args }) => ({ fn, args }))).toEqual(fx.cases.filter((c) => checked.has(c.fn)).map(({ fn, args }) => ({ fn, args })));
  });
  for (const c of ref.cases) it(`${at(c)} vs scipy`, () => {
    const got = run(c);
    const near = (field: string, v: unknown, r: number | null) => {
      const label = `${at(c)}${field ? "." + field : ""}`;
      expect(typeof v, label).toBe("number");
      const x = v as number;
      if (r === null) {                                                                                   // scipy returned NaN or an infinity, which JSON cannot hold
        if (V1_HAS_A_VALUE.has(at(c))) expect(Number.isFinite(x), label).toBe(true);
        else expect(Number.isFinite(x), label).toBe(false);
        return;
      }
      if (c.fn === "stkShapiro" && field === "p" && x === 1e-99) { expect(r, label).toBeLessThan(1e-12); return; }   // v1's floor for y ≥ γ (n ≤ 11)
      if (r === 0) { expect(Math.abs(x), label).toBeLessThan(1e-9); return; }
      // Shapiro p: v1 is Royston's AS R94 and so is scipy's swilk, but the two are not bit-identical (spec tolerance 1e-4 relative)
      const tol = c.fn === "stkShapiro" && field === "p" ? 1e-4 : 1e-6;
      expect(Math.abs(x - r) / Math.abs(r), label).toBeLessThan(tol);
    };
    if (c.ref === null) { expect(got === null || (typeof got === "number" && !Number.isFinite(got)), `${at(c)}: scipy has no value, v1 gave ${JSON.stringify(got)}`).toBe(true); return; }
    if (typeof c.ref === "number") { near("", got, c.ref); return; }
    const fields = Object.entries(c.ref);
    if (got === null) { expect(fields.every(([, r]) => r === null), `${at(c)}: v1 gave null where scipy has ${JSON.stringify(c.ref)}`).toBe(true); return; }
    for (const [k, r] of fields) near(k, (got as Record<string, unknown>)[k], r);
  });
});
