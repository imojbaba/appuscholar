import { expect } from "vitest";
import { statsParseText } from "../../../src/intake";
import { runStats } from "../../../src/stats";
import type { StatsBlock, StatsResult } from "../../../src/stats-core";
import type { CapturedRun } from "./drive";
import { asInnerHTML, blockAsText, decodeText, renderResultsText } from "./render";
import { expectGolden } from "../harness/compare";
import type { GoldenMode } from "../harness/compare";

/**
 * The per-case checks of stats.test.ts (against v1's fixture) and stats-scipy.test.ts (against scipy-reference.json), shared with stats-slow.test.ts, which runs the cases in SLOW_CASES
 * in a test file of their own: the two generic loops skip exactly those ids and say so in a test, so a slow case is never silently dropped from both.
 */

/**
 * Cases the generic loops skip. alpha-large-boot-200 (1,001 people x 40 items, n·k above 40,000: stkOmegaBoot's 200 resamples, register row F13) costs k·n² per resample in v1's
 * stkCorrMat: about 15 s in a fresh worker, but several times longer once the small alpha cases have run in the same module instance (141 s measured in vitest, V8's optimised code
 * for stkCorrMat and stkOmega degrading on the large sample), so it runs alone, in stats-slow.test.ts, with SLOW_CASE_MS.
 */
export const SLOW_CASES: readonly string[] = ["alpha-large-boot-200"];
export const SLOW_CASE_MS = 300_000;
/**
 * Cases the generic loops run, each in its own test, with an explicit time budget above vitest's 5 s default: welchAnova-f5-exact-zero (about 1.8 s on an arm64 Mac, stkPtukey's
 * Games-Howell p at df between 1 and 2) and tukey-f5-exact-zero (about 1.2 s, stkPtukey for 45 pairs of ten groups); CI's 2-vCPU x64 runner is 2-3 times slower, with test files in
 * parallel workers. Used by id in stats.test.ts's fixture loop and its per-case values loops, and in stats-scipy.test.ts's scipy loop.
 */
export const HEAVY_CASE_MS: Readonly<Record<string, number>> = { "welchAnova-f5-exact-zero": 30_000, "tukey-f5-exact-zero": 30_000 };

export const runCase = (c: CapturedRun): StatsResult => runStats(statsParseText(c.csv)!, c.test, c.form);
export const blocksOf = (r: StatsResult): StatsBlock[] => (r.ok ? r.blocks : r.reason === "undefined" ? r.blocks : []);
/** A block as its decoded cells, so a table is compared cell by cell and not only as joined text. */
export const cellsOf = (b: StatsBlock): unknown => (b.kind === "table" ? b.rows.map((r) => r.map(decodeText)) : b.kind === "list" ? b.items.map(decodeText) : blockAsText(b));

/**
 * The port's result `r` for fixture case `c` is what v1 showed: the same toast, or the same sentence, blocks (kinds, decoded text, cells) and results text. A table's cells and a
 * list's items are also compared raw: the port's cell as the DOM would serialise it (asInnerHTML) is v1's recorded innerHTML, so a label that lost escHTML is caught even where
 * its decoded text is the same.
 */
export function expectSameAsV1(c: CapturedRun, r: StatsResult, mode: GoldenMode): void {
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
    const v1 = c.blocks[i]!;
    if (b.kind === "table" && v1.kind === "table") expectGolden(b.rows.map((row) => row.map(asInnerHTML)), v1.rows, mode, `${c.id} block ${i} raw cells`);
    if (b.kind === "list" && v1.kind === "list") expectGolden(b.items.map(asInnerHTML), v1.items, mode, `${c.id} block ${i} raw items`);
  });
  expect(renderResultsText(r)).toBe(c.resultsText);
}

export type RefCase = { test: string; id: string; ref: Record<string, number> | null; why?: string };

export const REL = 1e-6, ABS_AT_ZERO = 1e-9;
export function close(got: number, want: number): boolean {return want === 0 ? Math.abs(got) <= ABS_AT_ZERO : Math.abs(got - want) <= REL * Math.abs(want)}
/**
 * The one exception (register row D-W2-17): Tukey's p_i_j is v1's `Math.max(0,1-stkPtukey(q,kk,dfw))` (12711), a difference from 1, so its error is stkPtukey's absolute error (at most 5e-11 on these fixtures) and
 * its relative error grows without bound as p goes to 0 (4% at p = 2.7e-10 in tukey-demo-arms). It is held to 1e-6 relative or 1e-9 absolute, whichever is looser; every p that loose
 * bound admits is below .001, where the cell prints `< .001` and the sentence `p < .001` whatever the digits.
 */
function closeTukeyP(got: number, want: number): boolean {return Math.abs(got - want) <= Math.max(REL * Math.abs(want), ABS_AT_ZERO)}
/**
 * Register row F5 at Tukey's 12714 (`Math.max(0,1-stkPtukey(q,kk,dfw))`): once stkPtukey returns exactly 1 the port's p_i_j is exactly 0 where scipy's studentized_range.sf gives a tiny
 * positive number (1.67e-15 in tukey-f5-exact-zero), as pvalue.test.ts's F5 branch for pFromF. A reference below 1e-16 must meet an exact 0, and a reference below 1e-12 meets either the
 * port's exact 0 or the ordinary Tukey tolerance; either way the p is below .001, where the cell prints `< .001` and the sentence `p < .001`.
 */
const F5_TUKEY_UNDERFLOW = 1e-16, F5_TUKEY_TINY = 1e-12;
function isF5TukeyZero(got: number, want: number): boolean {return want < F5_TUKEY_UNDERFLOW || (Object.is(got, 0) && want < F5_TUKEY_TINY)}
/**
 * pFromF's `1 - betai` (register row F5a): betai near 1 is a whole number of steps of 2^-53, so a right tail below about 1e-10 is off by up to half a step, a relative error above 1e-6.
 * mregress's pF, p1 and pc are pFromF's; they are held to 1e-6 relative or one step (2^-53) absolute, whichever is looser, F5a's own bound in pvalue.test.ts, and only a p below .001
 * may take the absolute bound (the cell prints `< .001`, the sentence `p < .001`).
 */
const F5A_STEP = 2 ** -53;
const F5A_KEYS: Record<string, string[]> = { mregress: ["pF", "p1", "pc"] };
/**
 * logistic's coefficients against an optimiser (the brief's tolerance for an iterative fit): b_j, se_j and what v1 computes from them alone (z_j, p_j, or_j, lo_j, hi_j) are held to
 * 1e-5 relative, every other logistic key to the global 1e-6.
 */
const OPT_REL = 1e-5;
const OPT_KEY = /^(b|se|z|p|or|lo|hi)_\d+$/;
function closeOpt(got: number, want: number): boolean {return want === 0 ? Math.abs(got) <= ABS_AT_ZERO : Math.abs(got - want) <= OPT_REL * Math.abs(want)}
function closeF5a(got: number, want: number): boolean {return Math.abs(got - want) <= Math.max(REL * Math.abs(want), F5A_STEP)}


/** The port's result `r` for reference case `c` holds every `ref[key]` within the tolerances above; a null reference is a case the port refuses, or one it runs where scipy has no finite value. `hasKeys`: the test has a scipy counterpart (stats-scipy.test.ts's KEYS). */
export function expectSameAsScipy(c: RefCase, r: StatsResult, hasKeys: boolean): void {
  if (c.ref === null) {
    expect(c.why, c.id).toBeTruthy();
    // scipy has no finite value where v1 has one (kruskal-all-same: scipy divides by the zero tie correction, v1 skips it, register row D-W2-16): the port runs, as v1 did
    if (c.why!.startsWith("scipy returns no finite value")) expect(r.ok, `${c.id}: ${c.why}`).toBe(true);
    else if (hasKeys) expect(r.ok, `${c.id}: ${c.why}`).toBe(false);
    return;
  }
  expect(r.ok, c.id).toBe(true);
  if (!r.ok) return;
  for (const [key, want] of Object.entries(c.ref)) {
    const raw = r.values[key];
    expect(typeof raw, `${c.id} values.${key}`).toBe("number");
    const got = key === "t" || key === "tS" ? Math.abs(raw!) : raw!;
    const w = key === "t" || key === "tS" ? Math.abs(want) : want;
    const f5a = F5A_KEYS[c.test]?.includes(key) ?? false;
    if (c.test === "tukey" && key.startsWith("p_") && isF5TukeyZero(got, w)) {
      expect(Object.is(got, 0), `${c.id} ${key}: F5, port ${raw} where scipy has ${want}, v1's exact 0`).toBe(true);
      expect(want, `${c.id} ${key}: F5's reference is scipy's tiny positive tail`).toBeGreaterThanOrEqual(0);
      continue;
    }
    const ok = c.test === "tukey" && key.startsWith("p_") ? closeTukeyP(got, w) : f5a ? closeF5a(got, w) : c.test === "logistic" && OPT_KEY.test(key) ? closeOpt(got, w) : close(got, w);
    expect(ok, `${c.id} ${key}: port ${raw}, scipy ${want}`).toBe(true);
    if ((c.test === "tukey" || f5a) && !close(got, w)) expect(want, `${c.id} ${key}: only a p below .001 may take the absolute bound`).toBeLessThan(0.001);
  }
}
