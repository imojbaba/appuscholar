import {
  smean, smedian, ssd, statsColVals, statsGroupBy, stkAnova2Cells, stkBinData, stkMRData, stkOLS, stkTCrit,
  type ParsedData, type StatsCtx, type StatsForm, type StatsTestKey
} from "@appuscholar/core";

/**
 * The chart under a result (v1 statsChart* 11884-11979 and the call at the end of each branch of statsRunNow), as data. v1 drew these with Chart.js from a CDN; they
 * are drawn as SVG elements now (ledger R3, register row D-S2-66), by components/tools/stats/ResultChart.tsx, from this spec. Nothing here is markup: a column name
 * or group label stays a string in the spec and reaches the page as a text node, so a label that looks like HTML shows as text (the sanitizer for HTML forbids svg, so
 * this is the safe way to draw one). Bars start at zero (rule 14, R2): v1's bar charts did not (`beginAtZero:false`), the drawing does.
 * What each test charts is v1's: a histogram for the single-variable tests and the regression residuals; the group means with one SD for the t-tests and ANOVAs; the
 * medians for the rank tests; a scatter (with the fitted line for Pearson and regression); the counts for the chi-squares; the proportions or mean ranks by condition for
 * the repeated yes/no and rank tests; the interaction plot, the simple slopes and the mediation paths. Cronbach's alpha and logistic regression draw none, as in v1.
 * The inputs are the table, the form and core's `values`; the numbers are recomputed from the table by the same core functions the runners use (the runners return the
 * raw numbers behind their cells, not the groups they were computed from).
 */

/** The student-facing words of a chart (messages `stats_chart_*`): the title and axis texts. */
export type Words = (key: string, vars?: Record<string, string | number>) => string;
export type ErrBar = { plus: number; minus: number } | null;
export type ChartSpec =
  | { kind: "bars"; title: string; yLabel: string; labels: string[]; values: number[]; errs: ErrBar[] }
  | { kind: "hist"; title: string; yLabel: string; start: number; width: number; bins: number[] }
  | { kind: "scatter"; title: string; xLabel: string; yLabel: string; points: Array<{ x: number; y: number }>; fit: Array<{ x: number; y: number }> | null }
  | { kind: "grouped"; title: string; yLabel: string; rowLabels: string[]; colLabels: string[]; table: number[][] }
  | { kind: "lines"; title: string; xLabel: string; yLabel: string; xLabels: string[]; series: Array<{ label: string; ys: number[] }> }
  | { kind: "slopes"; title: string; xLabel: string; yLabel: string; xmin: number; xmax: number; lines: Array<{ label: string; b0: number; b1: number }> };

const num = (s: string | undefined): number => parseInt(s ?? "", 10);
const finite = (v: number): boolean => Number.isFinite(v);
/** v1's `{plus:m+s,minus:m-s}`; a group of one has no SD, so no bar. */
const sdBar = (g: number[]): ErrBar => { const m = smean(g), s = ssd(g); return finite(s) ? { plus: m + s, minus: m - s } : null; };

/** v1 statsChartHistogram (11934-11946): 5 to 10 bins by the square root of n, labelled by their edges. */
function hist(values: number[], title: string, yLabel: string): ChartSpec | null {
  if (!values.length) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const nb = Math.max(5, Math.min(10, Math.round(Math.sqrt(values.length))));
  const width = (max - min) / nb || 1;
  const bins = new Array<number>(nb).fill(0);
  for (const v of values) { let i = Math.floor((v - min) / width); if (i >= nb) i = nb - 1; if (i < 0) i = 0; bins[i]!++; }
  return { kind: "hist", title, yLabel, start: min, width, bins };
}
function bars(title: string, yLabel: string, labels: string[], values: number[], errs: ErrBar[] | null): ChartSpec {
  return { kind: "bars", title, yLabel, labels, values, errs: errs ?? labels.map(() => null) };
}
/** The complete numeric pairs of two columns (the filter every pair test uses). */
function pairsOf(d: ParsedData, i1: number, i2: number): Array<[number, number]> {
  return d.rows.filter((r) => r[i1] !== undefined && r[i1] !== "" && r[i2] !== undefined && r[i2] !== "").map((r) => [parseFloat(r[i1]!), parseFloat(r[i2]!)] as [number, number]).filter((p) => finite(p[0]) && finite(p[1]));
}
/** Rows with a score in every ticked column (rmanova, friedman, mixed): the scores, and the group of each when `grpIdx` is given. */
function wide(d: ParsedData, idxs: number[], grpIdx: number | null): { X: number[][]; gl: string[]; gi: number[] } {
  const X: number[][] = [], gl: string[] = [], gi: number[] = [];
  for (const r of d.rows) {
    const row = idxs.map((i) => (r[i] === "" || r[i] === undefined ? NaN : parseFloat(r[i]!)));
    if (!row.every(finite)) continue;
    if (grpIdx === null) { X.push(row); continue; }
    const lab = String(r[grpIdx] === undefined ? "" : r[grpIdx]).trim();
    if (lab === "") continue;
    let q = gl.indexOf(lab);
    if (q < 0) { gl.push(lab); q = gl.length - 1; }
    gi.push(q); X.push(row);
  }
  return { X, gl, gi };
}

/**
 * The spec of a result's chart, or null when v1 drew none (alpha, logistic), when the table cannot give one, or on any failure (a chart never stops a result showing).
 * `values` is the result's raw numbers (core's StatsOk.values).
 */
export function resultChart(data: ParsedData, test: StatsTestKey, form: StatsForm, values: Record<string, number>, w: Words): ChartSpec | null {
  try { return build(data, test, form, values, w); } catch { return null; }
}

function build(d: ParsedData, test: StatsTestKey, form: StatsForm, values: Record<string, number>, w: Words): ChartSpec | null {
  const ctx: StatsCtx = { data: d, form, skipped: 0 };
  const v = (id: string): string => form.values[id] ?? "";
  const nameAt = (i: number): string => d.cols[i]!.name;
  const count = w("stats_chart_count");
  switch (test) {
    case "desc": {
      const i = num(v("dv"));
      return hist(statsColVals(ctx, i, true), w("stats_chart_dist", { name: nameAt(i) }), count);
    }
    case "ttest1": {
      const i = num(v("dv"));
      return hist(statsColVals(ctx, i, true), w("stats_chart_dist_mu", { name: nameAt(i), mu: String(parseFloat(v("mu")) || 0) }), count);
    }
    case "ttestInd": case "anova1": case "welchAnova": {
      const dvI = num(v("dv")), ivI = num(v("iv")), g = statsGroupBy(ctx, dvI, ivI), keys = Object.keys(g);
      return bars(w("stats_chart_by_sd", { dv: nameAt(dvI), iv: nameAt(ivI) }), nameAt(dvI), keys, keys.map((k) => smean(g[k]!)), keys.map((k) => sdBar(g[k]!)));
    }
    case "tukey": {
      const dvI = num(v("dv")), ivI = num(v("iv")), g = statsGroupBy(ctx, dvI, ivI), keys = Object.keys(g);
      return bars(w("stats_chart_means_sd"), "", keys, keys.map((k) => smean(g[k]!)), keys.map((k) => sdBar(g[k]!)));
    }
    case "ttestPaired": {
      const i1 = num(v("v1")), i2 = num(v("v2")), p = pairsOf(d, i1, i2), a = p.map((x) => x[0]), b = p.map((x) => x[1]);
      return bars(w("stats_chart_pair_sd", { a: nameAt(i1), b: nameAt(i2) }), "", [nameAt(i1), nameAt(i2)], [smean(a), smean(b)], [sdBar(a), sdBar(b)]);
    }
    case "regression": case "pearson": {
      // regression: x is the "iv" field, y the "dv" field (v1 12728); pearson: x is v1, y is v2
      const xI = num(v(test === "regression" ? "iv" : "v1")), yI = num(v(test === "regression" ? "dv" : "v2")), p = pairsOf(d, xI, yI);
      const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]), mx = smean(xs), my = smean(ys);
      let sxy = 0, sxx = 0;
      for (let i = 0; i < p.length; i++) { sxy += (xs[i]! - mx) * (ys[i]! - my); sxx += (xs[i]! - mx) * (xs[i]! - mx); }
      const b1 = sxy / sxx, b0 = my - b1 * mx, lo = Math.min(...xs), hi = Math.max(...xs);
      return { kind: "scatter", title: w("stats_chart_scatter", { x: nameAt(xI), y: nameAt(yI) }), xLabel: nameAt(xI), yLabel: nameAt(yI), points: p.map((q) => ({ x: q[0], y: q[1] })), fit: [{ x: lo, y: b0 + b1 * lo }, { x: hi, y: b0 + b1 * hi }] };
    }
    case "spearman": {
      const i1 = num(v("v1")), i2 = num(v("v2")), p = pairsOf(d, i1, i2);
      return { kind: "scatter", title: w("stats_chart_scatter", { x: nameAt(i1), y: nameAt(i2) }), xLabel: nameAt(i1), yLabel: nameAt(i2), points: p.map((q) => ({ x: q[0], y: q[1] })), fit: null };
    }
    case "mannwhitney": {
      const dvI = num(v("dv")), ivI = num(v("iv")), g = statsGroupBy(ctx, dvI, ivI), keys = Object.keys(g).slice(0, 2);
      return bars(w("stats_chart_med_by", { dv: nameAt(dvI) }), nameAt(dvI), keys, keys.map((k) => smedian(g[k]!)), null);
    }
    case "kruskal": {
      const dvI = num(v("dv")), ivI = num(v("iv")), g = statsGroupBy(ctx, dvI, ivI), keys = Object.keys(g);
      return bars(w("stats_chart_med_kw", { dv: nameAt(dvI), iv: nameAt(ivI) }), nameAt(dvI), keys, keys.map((k) => smedian(g[k]!)), null);
    }
    case "wilcoxon": {
      const i1 = num(v("v1")), i2 = num(v("v2")), p = pairsOf(d, i1, i2);
      return bars(w("stats_chart_med_pair", { a: nameAt(i1), b: nameAt(i2) }), "", [nameAt(i1), nameAt(i2)], [smedian(p.map((x) => x[0])), smedian(p.map((x) => x[1]))], null);
    }
    case "chisq": {
      const i1 = num(v("v1")), i2 = num(v("v2")), rows = d.rows.filter((r) => r[i1] !== undefined && r[i1] !== "" && r[i2] !== undefined && r[i2] !== "");
      const rowKeys = [...new Set(rows.map((r) => r[i1]!))], colKeys = [...new Set(rows.map((r) => r[i2]!))];
      const table = rowKeys.map(() => colKeys.map(() => 0));
      for (const r of rows) table[rowKeys.indexOf(r[i1]!)]![colKeys.indexOf(r[i2]!)]!++;
      return { kind: "grouped", title: w("stats_chart_chisq", { a: nameAt(i1), b: nameAt(i2) }), yLabel: count, rowLabels: rowKeys, colLabels: colKeys, table };
    }
    case "gof": {
      const i = num(v("v1")), vals = d.rows.map((r) => r[i]).filter((x): x is string => x !== undefined && x !== ""), cats = [...new Set(vals)];
      return bars(w("stats_chart_obs", { name: nameAt(i) }), count, cats, cats.map((c) => vals.filter((x) => x === c).length), null);
    }
    case "mcnemar": {
      const i1 = num(v("v1")), i2 = num(v("v2")), B = stkBinData(d, [i1, i2], v("pos"));
      if ("err" in B) return null;
      const n = B.M.length;
      return bars(w("stats_chart_prop_one", { pos: B.pos }), w("stats_chart_prop"), [nameAt(i1), nameAt(i2)], [0, 1].map((j) => B.M.reduce((s, r) => s + r[j]!, 0) / n), null);
    }
    case "cochran": {
      const idxs = form.ticked.items ?? [], B = stkBinData(d, idxs, v("pos"));
      if ("err" in B) return null;
      const n = B.M.length;
      return bars(w("stats_chart_prop_cond", { pos: B.pos }), w("stats_chart_prop"), idxs.map(nameAt), idxs.map((_, j) => B.M.reduce((s, r) => s + r[j]!, 0) / n), null);
    }
    case "friedman": {
      // v1 13262-13279: the mean of each person's within-person average ranks, per condition
      const idxs = form.ticked.items ?? [], { X } = wide(d, idxs, null), k = idxs.length, RS = new Array<number>(k).fill(0);
      for (const r of X) {
        const ord = r.map((_, j) => j).sort((a, b) => r[a]! - r[b]!);
        let i = 0;
        while (i < k) { let j = i; while (j + 1 < k && r[ord[j + 1]!] === r[ord[i]!]) j++; const avg = (i + j) / 2 + 1; for (let q = i; q <= j; q++) RS[ord[q]!]! += avg; i = j + 1; }
      }
      return bars(w("stats_chart_mean_rank"), w("stats_chart_mean_rank_y"), idxs.map(nameAt), RS.map((s) => s / X.length), null);
    }
    case "rmanova": {
      const idxs = form.ticked.items ?? [], { X } = wide(d, idxs, null);
      const cols = idxs.map((_, j) => X.map((r) => r[j]!));
      return bars(w("stats_chart_cond_sd"), "", idxs.map(nameAt), cols.map(smean), cols.map(sdBar));
    }
    case "mixed": {
      const gI = num(v("grp")), idxs = (form.ticked.items ?? []).filter((i) => i !== gI), { X, gl, gi } = wide(d, idxs, gI);
      const series = gl.map((label, q) => ({ label, ys: idxs.map((_, j) => smean(X.filter((_r, i) => gi[i] === q).map((r) => r[j]!))) }));
      return { kind: "lines", title: w("stats_chart_interaction", { dv: w("stats_chart_score"), a: w("stats_chart_cond"), b: nameAt(gI) }), xLabel: w("stats_chart_cond"), yLabel: w("stats_chart_score"), xLabels: idxs.map(nameAt), series };
    }
    case "anova2": {
      const c = stkAnova2Cells(ctx);
      const series = c.bL.map((label, j) => ({ label, ys: c.aL.map((_, i) => smean(c.cellMap[i + "|" + j]!)) }));
      return { kind: "lines", title: w("stats_chart_interaction", { dv: nameAt(c.dvI), a: nameAt(c.aI), b: nameAt(c.bI) }), xLabel: nameAt(c.aI), yLabel: nameAt(c.dvI), xLabels: c.aL.map(String), series };
    }
    case "mregress": {
      const m = stkMRData(ctx), o = stkOLS(m.xs, m.y);
      return o ? hist(o.resid, w("stats_chart_resid"), count) : null;
    }
    case "moderate": {
      const yI = num(v("dv")), xI = num(v("x")), wI = num(v("w")), X0: number[] = [], W0: number[] = [];
      for (const r of d.rows) {
        const a = parseFloat(r[xI]!), b = parseFloat(r[wI]!), c = parseFloat(r[yI]!);
        if ([r[xI], r[wI], r[yI]].some((q) => q === "" || q === undefined) || ![a, b, c].every(finite)) continue;
        X0.push(a); W0.push(b);
      }
      const mx = smean(X0), mw = smean(W0), sdw = ssd(W0), wN = nameAt(wI);
      // centred model: y = b0 + b1 xc + b2 wc + b3 xc wc, so at W = mean + lev the slope is b1 + b3 lev (sl_*_b) and, in the raw x, the intercept is b0 + b2 lev - slope mx
      const lines = ([["lo", -sdw, "stats_chart_low"], ["mid", 0, "stats_chart_avg"], ["hi", sdw, "stats_chart_high"]] as const).map(([q, lev, key]) => {
        const b1 = values["sl_" + q + "_b"]!;
        return { label: w("stats_chart_slope_label", { level: w(key), w: wN, v: (mw + lev).toFixed(1) }), b0: values.b_0! + values.b_2! * lev - b1 * mx, b1 };
      });
      return { kind: "slopes", title: w("stats_chart_slopes", { y: nameAt(yI), x: nameAt(xI), w: wN }), xLabel: nameAt(xI), yLabel: nameAt(yI), xmin: Math.min(...X0), xmax: Math.max(...X0), lines };
    }
    case "mediate": {
      const xI = num(v("x")), mI = num(v("m")), yI = num(v("dv")), X: number[] = [], M: number[] = [], Y: number[] = [];
      for (const r of d.rows) {
        const a = parseFloat(r[xI]!), b = parseFloat(r[mI]!), c = parseFloat(r[yI]!);
        if ([r[xI], r[mI], r[yI]].some((q) => q === "" || q === undefined) || ![a, b, c].every(finite)) continue;
        X.push(a); M.push(b); Y.push(c);
      }
      const n = Y.length, oa = stkOLS([X], M), ob = stkOLS([X, M], Y), oc = stkOLS([X], Y);
      if (!oa || !ob || !oc) return null;
      const ci = (b: number, inv: number, sse: number, df: number): { plus: number; minus: number } => { const se = Math.sqrt((inv * sse) / df), tc = stkTCrit(df, 0.05); return { plus: b + tc * se, minus: b - tc * se }; };
      const A = ci(oa.beta[1]!, oa.inv[1]![1]!, oa.sse, n - 2), Bp = ci(ob.beta[2]!, ob.inv[2]![2]!, ob.sse, n - 3), Cp = ci(ob.beta[1]!, ob.inv[1]![1]!, ob.sse, n - 3), Ct = ci(oc.beta[1]!, oc.inv[1]![1]!, oc.sse, n - 2);
      const labels = ["stats_chart_path_a", "stats_chart_path_b", "stats_chart_path_cp", "stats_chart_path_c", "stats_chart_path_ab"].map((k) => w(k));
      return bars(w("stats_chart_paths"), "", labels, [values.a_b!, values.b_b!, values.cp_b!, values.c_b!, values.ab!], [A, Bp, Cp, Ct, { plus: values.hi!, minus: values.lo! }]);
    }
    case "logistic": case "alpha":
      return null; // v1 draws none
  }
}
