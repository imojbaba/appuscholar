import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import type { CapturedRun } from "./stats/drive";
import { corpusFiles } from "./stats/capture";
import { readFixture } from "./harness/fixture";
import { SLOW_CASES, expectSameAsScipy, runCase } from "./stats/check";
import type { RefCase } from "./stats/check";

/**
 * The Statistics Lab runners against scipy (parity-port spec 5.9): for every case of stats/scipy-reference.json (written by stats/scipy-reference.py from each fixture case's csv and form,
 * never by hand; from the repository root:
 *   uv run --no-project --with scipy==1.17.1 --python 3.13 python -I packages/core/test/golden/stats/scipy-reference.py packages/core/test/golden/stats
 * ) the port runs the fixture case and each `values[key]` is held to `ref[key]`: within 1e-6 relative, or 1e-9 absolute where scipy's value is 0. `t` (and `tS`) is compared by absolute
 * value, since the group order sets its sign; logistic's coefficients and what follows from them alone within 1e-5 (closeOpt, the optimiser); Tukey's p_i_j may instead be within 1e-9 absolute (closeTukeyP, register row D-W2-17), and mregress's pF, p1 and pc within 2^-53 absolute (closeF5a, register row F5a). A case with `ref: null` is one v1 refused (a toast, or the safety net), which the port refuses too, a test with no scipy reference yet, or one where scipy has no finite value and v1 has (D-W2-16), which the port runs. The tolerances and the per-case check are in stats/check.ts, shared with stats-slow.test.ts, which runs the ids in SLOW_CASES that the loop below skips.
 * Typed here: the scipy pin, the tolerances, and for each test the keys its reference holds (KEYS), so that a reference that loses a statistic is noticed.
 */

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
 * k1, r21, adj1, F1, p1, dR, Fc, pc when a step 2 ran; logistic is an independent numpy computation, scipy.optimize.minimize of the negative log-likelihood on the design stkMRData(true)
 * builds: n, k, ev, ne, lr, pLR, cs, nag, mcf, auc, acc, tp, tn, fp, fn, sens, spec, and for each coefficient j b_j, se_j, z_j, p_j, with or_j, lo_j, hi_j and vif_j for j >= 1;
 * rmanova is an independent numpy computation: n, k, ssc, sss, sst, sse, F, d1, d2, pU, gg, hf, dfM, eps, pC, pe2, ge2, W, chi and pM where the contrast covariance is not singular, and
 * pair_t_i_j, pair_p_i_j (ttest_rel) for each pair whose differences have spread; alpha: n, k, alpha, aciLo, aciHi (f.ppf), meanR, rit_j, ad_j; moderate is an independent numpy computation, lstsq on the centred design [1, Xc, Wc, Xc*Wc]: n, r2, F, dr2, Fc, and for
 * each coefficient j in v1's order (the intercept, X, W, the product) b_j, se_j, t_j, p_j, and the simple slopes at W's mean - 1 SD, the mean and + 1 SD, sl_q_b, sl_q_se, sl_q_p for q lo, mid,
 * hi; mediate is an independent numpy computation, lstsq for the four paths: n, a_b, a_p, b_b, b_p, cp_b, cp_p, c_b, c_p, r2m, r2y). The values with no scipy counterpart are held to v1 only, by the golden fixtures ("matches v1"): Games-Howell (welchAnova gh_*), Dunn with Holm (kruskal
 * padj_i_j), the Spearman interval (lo, hi), ω² (omega2, F9), ε² (eps2), the Fisher-Freeman-Halton test (chisq ffhP, ffhTables), Cramér's V, Cohen's w, Kendall's W, the Cochran
 * and Friedman pairwise p (pair_p_i_j), Cochran's Q (every cochran case is ref null, "no scipy counterpart") and the two-way ANOVA (every anova2 case is ref null,
 * "matches v1 (Type III, no R here)", register row F11), McDonald's omega with its loadings and bootstrap interval (alpha's omega, load_j, ociLo, ociHi), the mixed ANOVA (every mixed case is ref null, "matches v1 (F10)"), moderation's pF and
 * pFc (pFromF's 1 - betai, register row F5a) and its Johnson-Neyman points (roots), and mediation's indirect effect with its seeded percentile bootstrap (ab, lo, hi, bse, abStd, okCount:
 * "matches v1 (seeded bootstrap, F14)").
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
  logistic: (r) => {
    const k = r.k!, keys = ["n", "k", "ev", "ne", "lr", "pLR", "cs", "nag", "mcf", "auc", "acc", "tp", "tn", "fp", "fn", "sens", "spec"];
    for (let j = 0; j <= k; j++) keys.push(`b_${j}`, `se_${j}`, `z_${j}`, `p_${j}`, ...(j > 0 ? [`or_${j}`, `lo_${j}`, `hi_${j}`, `vif_${j}`] : []));
    return sameKeys(r, keys);
  },
  rmanova: (r) => {
    const k = r.k!, keys = ["n", "k", "ssc", "sss", "sst", "sse", "F", "d1", "d2", "pU", "gg", "hf", "dfM", "eps", "pC", "pe2", "ge2", ...("W" in r ? ["W", "chi", "pM"] : [])];
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) if (`pair_t_${i}_${j}` in r) keys.push(`pair_t_${i}_${j}`, `pair_p_${i}_${j}`);
    return sameKeys(r, keys);
  },
  alpha: (r) => {
    const k = r.k!, keys = ["n", "k", "alpha", "aciLo", "aciHi", "meanR"];
    for (let j = 0; j < k; j++) keys.push(`rit_${j}`, `ad_${j}`);
    return sameKeys(r, keys);
  },
  moderate: (r) => {
    const keys = ["n", "r2", "F", "dr2", "Fc"];
    for (let j = 0; j < 4; j++) keys.push(`b_${j}`, `se_${j}`, `t_${j}`, `p_${j}`);
    for (const q of ["lo", "mid", "hi"]) keys.push(`sl_${q}_b`, `sl_${q}_se`, `sl_${q}_p`);
    return sameKeys(r, keys);
  },
  mediate: (r) => sameKeys(r, ["n", "a_b", "a_p", "b_b", "b_p", "cp_b", "cp_p", "c_b", "c_p", "r2m", "r2y"]),
};
function sameKeys(r: Record<string, number>, keys: string[]): boolean {return Object.keys(r).sort().join() === keys.slice().sort().join()}

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
  const skipped: string[] = [];
  for (const c of ref.cases) {
    if (SLOW_CASES.includes(c.id)) { skipped.push(c.id); continue; }
    it(`${c.id} vs scipy`, () => {
      const fx = cases.get(c.id)!;
      expectSameAsScipy(c, runCase(fx), c.test in KEYS);
    });
  }
  it("the loop above skips exactly the slow cases, which stats-slow.test.ts runs", () => expect(skipped).toEqual([...SLOW_CASES]));
  it("D-W2-18 (approved): mregress-step1-categorical-3-levels's step table is an OLS of exactly block 1's two design columns, against numpy", () => {
    // the reference fits step 1 on the design columns preds and cats add (k1 = 2: both dummies of the 3-level group), independently of the port's step1n
    const rc = ref.cases.find((x) => x.id === "mregress-step1-categorical-3-levels")!;
    const w = rc.ref!, n = w.n!, k = w.k!, k1 = w.k1!;
    expect([k1, k]).toEqual([2, 3]);
    const r = runCase(cases.get(rc.id)!);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const key of ["k1", "r21", "adj1", "F1", "p1", "dR", "Fc", "pc"]) expect(Math.abs(r.values[key]! - w[key]!) <= Math.max(1e-6 * Math.abs(w[key]!), key === "pc" || key === "p1" ? 2 ** -53 : 0), `${key}: port ${r.values[key]}, numpy ${w[key]}`).toBe(true);
    const nl = (x: number) => x.toFixed(3).replace(/^(-?)0\./, "$1.");
    const rows = (r.blocks[0] as { rows: string[][] }).rows;
    expect([rows[1]![2], rows[1]![3], rows[1]![5], rows[1]![6]]).toEqual([nl(w.r21!), nl(w.adj1!), w.F1!.toFixed(2), `${k1}, ${n - k1 - 1}`]);
    expect([rows[2]![4], rows[2]![5], rows[2]![6]]).toEqual([nl(w.dR!), w.Fc!.toFixed(2), `${k - k1}, ${n - k - 1}`]);
  });
});
