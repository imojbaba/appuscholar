import { expect } from "vitest";
import { statsParseText } from "../../../src/intake";
import { runStats } from "../../../src/stats";
import type { StatsBlock, StatsResult } from "../../../src/stats-core";
import type { CapturedRun } from "./drive";
import { blockAsText, decodeText, renderResultsText } from "./render";
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

export const runCase = (c: CapturedRun): StatsResult => runStats(statsParseText(c.csv)!, c.test, c.form);
export const blocksOf = (r: StatsResult): StatsBlock[] => (r.ok ? r.blocks : r.reason === "undefined" ? r.blocks : []);
/** A block as its decoded cells, so a table is compared cell by cell and not only as joined text. */
export const cellsOf = (b: StatsBlock): unknown => (b.kind === "table" ? b.rows.map((r) => r.map(decodeText)) : b.kind === "list" ? b.items.map(decodeText) : blockAsText(b));

/** The port's result `r` for fixture case `c` is what v1 showed: the same toast, or the same sentence, blocks (kinds, decoded text, cells) and results text. */
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
    const ok = c.test === "tukey" && key.startsWith("p_") ? closeTukeyP(got, w) : f5a ? closeF5a(got, w) : c.test === "logistic" && OPT_KEY.test(key) ? closeOpt(got, w) : close(got, w);
    expect(ok, `${c.id} ${key}: port ${raw}, scipy ${want}`).toBe(true);
    if ((c.test === "tukey" || f5a) && !close(got, w)) expect(want, `${c.id} ${key}: only a p below .001 may take the absolute bound`).toBeLessThan(0.001);
  }
}
