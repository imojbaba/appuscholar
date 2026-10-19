import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { statsParseText } from "../../src/intake";
import { runStats } from "../../src/stats";
import type { CapturedRun } from "./stats/drive";
import { corpusFiles } from "./stats/capture";
import { readFixture } from "./harness/fixture";

/**
 * The Statistics Lab runners against scipy (parity-port spec 5.9): for every case of stats/scipy-reference.json (written by stats/scipy-reference.py from each fixture case's csv and form,
 * never by hand; from the repository root:
 *   uv run --no-project --with scipy==1.17.1 --python 3.13 python -I packages/core/test/golden/stats/scipy-reference.py packages/core/test/golden/stats
 * ) the port runs the fixture case and each `values[key]` is held to `ref[key]`: within 1e-6 relative, or 1e-9 absolute where scipy's value is 0. `t` (and `tS`) is compared by absolute
 * value, since the group order sets its sign; Tukey's p_i_j may instead be within 1e-9 absolute (closeTukeyP, register row D-W2-17), and mregress's pF, p1 and pc within 2^-53 absolute (closeF5a, register row F5a). A case with `ref: null` is one v1 refused (a toast, or the safety net), which the port refuses too, a test with no scipy reference yet, or one where scipy has no finite value and v1 has (D-W2-16), which the port runs.
 * Typed here: the scipy pin, the tolerances, and for each test the keys its reference holds (KEYS), so that a reference that loses a statistic is noticed.
 */

type RefCase = { test: string; id: string; ref: Record<string, number> | null; why?: string };
const ref = JSON.parse(readFileSync(new URL("./stats/scipy-reference.json", import.meta.url), "utf8")) as { scipy: string; cases: RefCase[] };
const fixtures = corpusFiles().map((f) => f.replace(/\.json$/, ""));
const cases = new Map<string, CapturedRun>();
for (const f of fixtures) for (const c of readFixture<{ cases: CapturedRun[] }>("stats", f).cases) cases.set(c.id, c);

/**
 * The keys scipy gives for each test (pearson's cl and ch only when n > 3; tukey's p_i_j for every pair; mannwhitney's U is min(U1, n1*n2 - U1) and wilcoxon's W is min(W+, W-), the
 * statistic v1 prints; chisq's chiY and pY on a 2x2 only, fisherP where v1 reports Fisher, and fisherOr there unless b*c is 0, the sample odds ratio a*d/(b*c) that the script
 * computes (F8); gof's binomP with two categories and an expected count below 5; mcnemar's chi is the continuity-corrected formula computed in the script, "matches v1 (formula)",
 * with pChi from chi2.sf; mregress is an independent numpy computation, lstsq on the design stkMRData builds, rebuilt by the script from the inputs: n, k, dfe, r2, adj, F, pF, and for
 * each coefficient j (0 the intercept, j >= 1 the j-th predictor in m.labels order) b_j, se_j, t_j, p_j, and vif_j for every predictor, beta_j for the ones that are not 0/1 columns, and
 * k1, r21, adj1, F1, p1, dR, Fc, pc when a step 2 ran). The values with no scipy counterpart are held to v1 only, by the golden fixtures ("matches v1"): Games-Howell (welchAnova gh_*), Dunn with Holm (kruskal
 * padj_i_j), the Spearman interval (lo, hi), ω² (omega2, F9), ε² (eps2), the Fisher-Freeman-Halton test (chisq ffhP, ffhTables), Cramér's V, Cohen's w, Kendall's W, the Cochran
 * and Friedman pairwise p (pair_p_i_j), Cochran's Q (every cochran case is ref null, "no scipy counterpart") and the two-way ANOVA (every anova2 case is ref null,
 * "matches v1 (Type III, no R here)", register row F11).
 */
const KEYS: Record<string, (r: Record<string, number>) => boolean> = {
  ttest1: (r) => sameKeys(r, ["t", "p"]),
  ttestInd: (r) => sameKeys(r, ["t", "p", "df", "tS", "pS"]),
  ttestPaired: (r) => sameKeys(r, ["t", "p"]),
  anova1: (r) => sameKeys(r, ["F", "p"]),
  tukey: (r) => Object.keys(r).length >= 3 && Object.keys(r).every((k) => /^p_\d+_\d+$/.test(k)),
  regression: (r) => sameKeys(r, ["b1", "b0", "seB1", "p", "r2", "F"]),
  pearson: (r) => sameKeys(r, ["r", "p"]) || sameKeys(r, ["r", "p", "cl", "ch"]),
  mannwhitney: (r) => sameKeys(r, ["U", "p"]),
  wilcoxon: (r) => sameKeys(r, ["W", "p"]),
  kruskal: (r) => sameKeys(r, ["H", "p"]),
  spearman: (r) => sameKeys(r, ["rho", "p"]),
  welchAnova: (r) => sameKeys(r, ["F", "p"]),
  chisq: (r) => [["chi2", "p"], ["chi2", "p", "chiY", "pY"], ["chi2", "p", "chiY", "pY", "fisherP"], ["chi2", "p", "chiY", "pY", "fisherP", "fisherOr"]].some((k) => sameKeys(r, k)),
  gof: (r) => sameKeys(r, ["chi2", "p"]) || sameKeys(r, ["chi2", "p", "binomP"]),
  mcnemar: (r) => sameKeys(r, ["pEx", "chi", "pChi"]),
  friedman: (r) => sameKeys(r, ["chi", "pF"]),
  mregress: (r) => {
    const k = r.k!, keys = ["n", "k", "dfe", "r2", "adj", "F", "pF"];
    for (let j = 0; j <= k; j++) keys.push(`b_${j}`, `se_${j}`, `t_${j}`, `p_${j}`, ...(j > 0 ? [`vif_${j}`] : []));
    if ("k1" in r) keys.push("k1", "r21", "adj1", "F1", "p1", "dR", "Fc", "pc");
    const betas = Object.keys(r).filter((x) => /^beta_\d+$/.test(x));
    return betas.every((x) => { const j = Number(x.slice(5)); return j >= 1 && j <= k; }) && sameKeys(Object.fromEntries(Object.entries(r).filter(([x]) => !betas.includes(x))), keys);
  },
};
function sameKeys(r: Record<string, number>, keys: string[]): boolean {return Object.keys(r).sort().join() === keys.slice().sort().join()}

const REL = 1e-6, ABS_AT_ZERO = 1e-9;
function close(got: number, want: number): boolean {return want === 0 ? Math.abs(got) <= ABS_AT_ZERO : Math.abs(got - want) <= REL * Math.abs(want)}
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
function closeF5a(got: number, want: number): boolean {return Math.abs(got - want) <= Math.max(REL * Math.abs(want), F5A_STEP)}

describe("stats runners agree with scipy (spec §5.9)", () => {
  it("names scipy 1.17.1", () => expect(ref.scipy).toBe("1.17.1"));
  it("the reference has an entry for every fixture case, in the fixtures' order", () => {
    expect(ref.cases.map((c) => c.id)).toEqual([...cases.keys()]);
    for (const c of ref.cases) expect(c.test, c.id).toBe(cases.get(c.id)!.test);
  });
  it("every test with a scipy counterpart has references, under the keys it names", () => {
    for (const test of Object.keys(KEYS)) {
      const withRef = ref.cases.filter((c) => c.test === test && c.ref !== null);
      expect(withRef.length, test).toBeGreaterThanOrEqual(4);
      for (const c of withRef) expect(KEYS[test]!(c.ref!), `${c.id}: ${Object.keys(c.ref!).join(", ")}`).toBe(true);
    }
    for (const c of ref.cases) if (!(c.test in KEYS)) expect(c.ref, c.id).toBeNull();
  });
  for (const c of ref.cases) {
    it(`${c.id} vs scipy`, () => {
      const fx = cases.get(c.id)!;
      const r = runStats(statsParseText(fx.csv)!, fx.test, fx.form);
      if (c.ref === null) {
        expect(c.why, c.id).toBeTruthy();
        // scipy has no finite value where v1 has one (kruskal-all-same: scipy divides by the zero tie correction, v1 skips it, register row D-W2-16): the port runs, as v1 did
        if (c.why!.startsWith("scipy returns no finite value")) expect(r.ok, `${c.id}: ${c.why}`).toBe(true);
        else if (c.test in KEYS) expect(r.ok, `${c.id}: ${c.why}`).toBe(false);
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
        const ok = c.test === "tukey" && key.startsWith("p_") ? closeTukeyP(got, w) : f5a ? closeF5a(got, w) : close(got, w);
        expect(ok, `${c.id} ${key}: port ${raw}, scipy ${want}`).toBe(true);
        if ((c.test === "tukey" || f5a) && !close(got, w)) expect(want, `${c.id} ${key}: only a p below .001 may take the absolute bound`).toBeLessThan(0.001);
      }
    });
  }
});
