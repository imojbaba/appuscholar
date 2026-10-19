# scipy's values for the Statistics Lab fixtures, for stats-scipy.test.ts (parity-port spec 5.9). Seeded from statsmath/scipy-reference.py and pvalue/scipy-reference.py.
# Run once, locally, and commit scipy-reference.json; run it again when a corpus gains cases (after golden:capture stats) or the scipy pin changes. From the repository root:
#   uv run --no-project --with scipy==1.17.1 --python 3.13 python -I packages/core/test/golden/stats/scipy-reference.py packages/core/test/golden/stats
# The argument is the directory holding the fixtures <test>.json (one for each corpus/<test>.json, read in sorted order, as stats/capture.ts does); scipy-reference.json is written beside
# them as { "scipy": <version>, "cases": [{ "test", "id", "ref": {...} | null, "why"? }] }, one entry for every fixture case, in the fixtures' order.
# Independent of v1's numbers: of each case only the inputs are read, the `csv` (re-parsed here with v1's rules, intake.ts) and the `form` (the column indexes v1's form held); of v1's output
# only whether it refused the case (a toast, or the safety net's apa null), which sets `ref` to null with `why`, so that no reference stands where the port has no values to compare.
# The groups come out in statsGroupBy's order (a plain object's key order: canonical array-index keys ascending, then the rest in first-seen order: register row F4), so the pairs and the sign
# of a difference are the ones v1 reports. A test with no entry in REFERENCE or NO_COUNTERPART would have `ref: null` ("no scipy reference for this test yet"); after Task 9 every test has one or the other.
# JSON cannot hold NaN or an infinity: a case where scipy returns one is written with ref null and the reason.
import json
import math
import os
import re
import sys
import warnings

import numpy as np
import scipy
from scipy import stats

# ASCII digits only: Python's \d and float() also accept other scripts' digits (Arabic-Indic, Devanagari), JavaScript's \d and parseFloat do not, so a label like "1٢" must stay text here too
PARSE_FLOAT = re.compile(r"^[+-]?(Infinity|[0-9]+\.?[0-9]*(?:[eE][+-]?[0-9]+)?|\.[0-9]+(?:[eE][+-]?[0-9]+)?)")
JS_WS = " \t\n\r\x0b\x0c                 　﻿"
# v1's gof part pattern /^(.+?)\s*[:=]\s*(\d+(?:\.\d+)?)$/ with JavaScript's \s (JS_WS), \d (ASCII digits) and $ (the end of the string, \Z)
GOF_PART = re.compile(r"^(.+?)[" + re.escape(JS_WS) + r"]*[:=][" + re.escape(JS_WS) + r"]*([0-9]+(?:\.[0-9]+)?)\Z")


def js_trim(s):
    return s.strip(JS_WS)


def split_line(line, delim):
    """statsSplitLine: split on delim outside double quotes; a doubled quote inside quotes is one quote; every cell trimmed."""
    out, cur, in_q, i = [], "", False, 0
    while i < len(line):
        c = line[i]
        if c == '"':
            if in_q and i + 1 < len(line) and line[i + 1] == '"':
                cur += '"'
                i += 1
            else:
                in_q = not in_q
        elif c == delim and not in_q:
            out.append(cur)
            cur = ""
        else:
            cur += c
        i += 1
    out.append(cur)
    return [js_trim(s) for s in out]


def parse_text(text):
    """statsParseText: lines on CRLF, CR or LF, blank ones dropped; tab when the first line holds one, else comma; rows of the wrong length dropped.
    The columns' numeric/categorical typing is not needed: the fixture's form already names the columns v1's selects offered."""
    lines = [l for l in re.split(r"\r\n|\r|\n", text) if js_trim(l)]
    delim = "\t" if "\t" in lines[0] else ","
    headers = split_line(lines[0], delim)
    rows = [r for r in (split_line(l, delim) for l in lines[1:]) if len(r) == len(headers)]
    return headers, rows


def parse_float(s):
    """JavaScript's parseFloat: the longest leading decimal literal after leading white space, NaN when there is none."""
    m = PARSE_FLOAT.match(s.lstrip(JS_WS))
    if not m:
        return math.nan
    t = m.group(0)
    return float(t.replace("Infinity", "inf"))


def is_array_index(k):
    return re.fullmatch(r"0|[1-9][0-9]*", k) is not None and int(k) < 2**32 - 1


def group_by(rows, dv, iv):
    """statsGroupBy: rows with a label and a value, the value finite; groups in a plain object's key order."""
    groups = {}
    for r in rows:
        g, v = r[iv], r[dv]
        if g == "" or v == "":
            continue
        x = parse_float(v)
        if not math.isfinite(x):
            continue
        groups.setdefault(g, []).append(x)
    keys = sorted((k for k in groups if is_array_index(k)), key=int) + [k for k in groups if not is_array_index(k)]
    return keys, [groups[k] for k in keys]


def pairs(rows, a, b):
    """The pair filter of ttestPaired, regression, pearson, wilcoxon and spearman: both cells present, both finite."""
    out = []
    for r in rows:
        if r[a] == "" or r[b] == "":
            continue
        x, y = parse_float(r[a]), parse_float(r[b])
        if math.isfinite(x) and math.isfinite(y):
            out.append((x, y))
    return [p[0] for p in out], [p[1] for p in out]


def col(form, field):
    return int(form["values"][field])


def col_vals(rows, idx):
    """statsColVals(idx, true): the column's cells that are not empty, through parseFloat, the finite ones."""
    return [x for x in (parse_float(r[idx]) for r in rows if r[idx] != "") if math.isfinite(x)]


def ttest1(rows, form):
    vals = col_vals(rows, col(form, "dv"))
    mu = parse_float(form["values"].get("mu", ""))
    mu = 0.0 if math.isnan(mu) or mu == 0 else mu  # v1's parseFloat(gv('mu'))||0
    r = stats.ttest_1samp(vals, mu)
    return {"t": r.statistic, "p": r.pvalue}


def ttest_ind(rows, form):
    keys, groups = group_by(rows, col(form, "dv"), col(form, "iv"))
    welch = stats.ttest_ind(groups[0], groups[1], equal_var=False)
    student = stats.ttest_ind(groups[0], groups[1], equal_var=True)
    return {"t": welch.statistic, "p": welch.pvalue, "df": welch.df, "tS": student.statistic, "pS": student.pvalue}


def ttest_paired(rows, form):
    xs, ys = pairs(rows, col(form, "v1"), col(form, "v2"))
    r = stats.ttest_rel(xs, ys)
    return {"t": r.statistic, "p": r.pvalue}


def anova1(rows, form):
    keys, groups = group_by(rows, col(form, "dv"), col(form, "iv"))
    r = stats.f_oneway(*groups)
    return {"F": r.statistic, "p": r.pvalue}


def tukey(rows, form):
    keys, groups = group_by(rows, col(form, "dv"), col(form, "iv"))
    r = stats.tukey_hsd(*groups)
    out = {}
    for i in range(len(groups)):
        for j in range(i + 1, len(groups)):
            out["p_%d_%d" % (i, j)] = r.pvalue[i][j]
    return out


def regression(rows, form):
    xs, ys = pairs(rows, col(form, "iv"), col(form, "dv"))
    r = stats.linregress(xs, ys)
    t = r.slope / r.stderr
    return {"b1": r.slope, "b0": r.intercept, "seB1": r.stderr, "p": r.pvalue, "r2": r.rvalue**2, "F": t**2}


def pearson(rows, form):
    xs, ys = pairs(rows, col(form, "v1"), col(form, "v2"))
    r = stats.pearsonr(xs, ys)
    out = {"r": r.statistic, "p": r.pvalue}
    if len(xs) > 3:  # v1 prints the Fisher z interval only when n > 3
        ci = r.confidence_interval(confidence_level=0.95)
        out["cl"], out["ch"] = ci.low, ci.high
    return out


def mannwhitney(rows, form):
    """mannwhitneyu with v1's choice of method: exact when no two scores are equal (exact floating-point equality, F15) and both groups are under 50, else the normal
    approximation with continuity (and scipy's tie correction). scipy's statistic is U1 of the first group; v1 reports the smaller U, so U = min(U1, n1*n2 - U1)."""
    keys, groups = group_by(rows, col(form, "dv"), col(form, "iv"))
    g1, g2 = groups[0], groups[1]
    combined = g1 + g2
    exact_ok = len(set(combined)) == len(combined) and len(g1) < 50 and len(g2) < 50
    r = stats.mannwhitneyu(g1, g2, use_continuity=True, alternative="two-sided", method="exact" if exact_ok else "asymptotic")
    u1 = float(r.statistic)
    return {"U": min(u1, len(g1) * len(g2) - u1), "p": r.pvalue}


def wilcoxon(rows, form):
    """wilcoxon on the pairs v1 keeps, zeros dropped (zero_method="wilcox"); exact when the absolute differences hold no tie (exact floating-point equality, F15), no pair is
    equal and fewer than 50 remain, else the normal approximation with continuity (correction=True). The two-sided statistic is min(W+, W-), v1's W."""
    xs, ys = pairs(rows, col(form, "v1"), col(form, "v2"))
    diffs = [x - y for x, y in zip(xs, ys)]
    nz = [d for d in diffs if d != 0]
    absd = [abs(d) for d in nz]
    exact_ok = len(set(absd)) == len(absd) and len(nz) == len(diffs) and len(nz) < 50
    r = stats.wilcoxon(xs, ys, zero_method="wilcox", correction=True, alternative="two-sided", method="exact" if exact_ok else "approx")
    return {"W": r.statistic, "p": r.pvalue}


def kruskal(rows, form):
    keys, groups = group_by(rows, col(form, "dv"), col(form, "iv"))
    r = stats.kruskal(*groups)
    return {"H": r.statistic, "p": r.pvalue}


def spearman(rows, form):
    """spearmanr on the pairs v1 keeps (the same filter as pearson's, though v1 does not count what it drops: F18); p from the t approximation, scipy's default (F7)."""
    xs, ys = pairs(rows, col(form, "v1"), col(form, "v2"))
    r = stats.spearmanr(xs, ys)
    return {"rho": r.statistic, "p": r.pvalue}


def welch_anova(rows, form):
    """f_oneway(equal_var=False), Welch's ANOVA (scipy 1.17.1 has the parameter; an older scipy without it raises TypeError, recorded as ref null)."""
    keys, groups = group_by(rows, col(form, "dv"), col(form, "iv"))
    try:
        r = stats.f_oneway(*groups, equal_var=False)
    except TypeError:
        raise NoReference("no Welch ANOVA in scipy")
    return {"F": r.statistic, "p": r.pvalue}


def first_seen(values):
    """`[...new Set(values)]`: the distinct values in the order they first appear (data order, not object-key order: F4's other branch)."""
    out = []
    for v in values:
        if v not in out:
            out.append(v)
    return out


def chisq(rows, form):
    """chi2_contingency on v1's table: rows and columns in Set (first-seen) order, rows with both cells present. correction=False -> chi2, p; on a 2x2 correction=True -> chiY, pY
    (scipy moves each count 0.5 towards its expectation, at most to it: v1's Math.max(0,Math.abs(o-e)-0.5)). Where v1 reports Fisher (a 2x2 whose smallest expected count is below 5),
    fisher_exact -> fisherP, and fisherOr is the sample odds ratio a*d/(b*c) computed here (F8: not the conditional maximum-likelihood estimate), left out when b*c is 0 (v1 prints
    'undefined (an empty cell)'). The Fisher-Freeman-Halton p (ffhP, ffhTables) has no scipy counterpart: matches v1."""
    i1, i2 = col(form, "v1"), col(form, "v2")
    rows2 = [r for r in rows if r[i1] != "" and r[i2] != ""]
    rk, ck = first_seen([r[i1] for r in rows2]), first_seen([r[i2] for r in rows2])
    table = [[0] * len(ck) for _ in rk]
    for r in rows2:
        table[rk.index(r[i1])][ck.index(r[i2])] += 1
    res = stats.chi2_contingency(table, correction=False)
    out = {"chi2": res.statistic, "p": res.pvalue}
    if len(rk) == 2 and len(ck) == 2:
        y = stats.chi2_contingency(table, correction=True)
        out["chiY"], out["pY"] = y.statistic, y.pvalue
        if float(np.min(res.expected_freq)) < 5:
            (a, b), (c, d) = table
            out["fisherP"] = stats.fisher_exact(table).pvalue
            if b * c != 0:
                out["fisherOr"] = a * d / (b * c)
    return out


def gof(rows, form):
    """chisquare(obs, exp) -> chi2, p, with the categories in first-seen order and the expected shares parsed as v1 does (`A:50, B:30`, case-insensitive names, normalised to sum 1);
    with two categories and an expected count below 5, binomtest(obs[0], N, share[0]) -> binomP (v1's exact binomial sentence)."""
    i1 = col(form, "v1")
    vals = [r[i1] for r in rows if r[i1] != ""]
    cats = first_seen(vals)
    k, n = len(cats), len(vals)
    obs = [vals.count(c) for c in cats]
    share = [1 / k] * k
    txt = js_trim(form["values"].get("exp", ""))
    if txt:
        shares = {}
        for part in txt.split(","):
            m = GOF_PART.match(js_trim(part))
            shares[js_trim(m.group(1)).lower()] = float(m.group(2))
        tot = sum(shares[c.lower()] for c in cats)
        share = [shares[c.lower()] / tot for c in cats]
    exp = [x * n for x in share]
    r = stats.chisquare(obs, exp)
    out = {"chi2": r.statistic, "p": r.pvalue}
    if min(exp) < 5 and k == 2:
        out["binomP"] = stats.binomtest(obs[0], n, share[0]).pvalue
    return out


def bin_data(rows, idxs, pos_txt):
    """stkBinData: the answers in first-seen order over the rows and then the chosen columns; the positive answer is the one named (case-insensitive), else 1/yes/true/y/present/agree,
    else the later of the two by v1's sort (numeric when both parse, else by code unit); rows with an answer in every column become 0/1 rows."""
    lv = []
    for r in rows:
        for i in idxs:
            if r[i] != "" and js_trim(r[i]) not in lv:
                lv.append(js_trim(r[i]))
    want = js_trim(pos_txt).lower()
    pos = None
    if want:
        for k in lv:
            if k.lower() == want:
                pos = k
    else:
        for k in lv:
            if k.lower() in ("1", "yes", "true", "y", "present", "agree"):
                pos = k
        if pos is None:
            a, b = lv
            x, y = parse_float(a), parse_float(b)
            # sort() is stable, so two that compare equal keep their order and the second is taken; strings compare by UTF-16 code unit (big-endian bytes)
            pos = (a if x - y > 0 else b) if math.isfinite(x) and math.isfinite(y) else (b if a.encode("utf-16-be") < b.encode("utf-16-be") else a)
    return [[1 if js_trim(r[i]) == pos else 0 for i in idxs] for r in rows if all(r[i] != "" for i in idxs)]


def mcnemar(rows, form):
    """binomtest(b, nd, 0.5) -> pEx (the exact McNemar p); chi = (|b - c| - 1)^2 / nd computed here from the 2x2 counts (the continuity-corrected McNemar statistic: an independent
    arithmetic, labelled "formula", as scipy has no McNemar test) and pChi = chi2.sf(chi, 1)."""
    m = bin_data(rows, [col(form, "v1"), col(form, "v2")], form["values"].get("pos", ""))
    b = sum(1 for r in m if r[0] and not r[1])
    c = sum(1 for r in m if not r[0] and r[1])
    nd = b + c
    chi = (abs(b - c) - 1) ** 2 / nd
    return {"pEx": stats.binomtest(b, nd, 0.5).pvalue, "chi": chi, "pChi": stats.chi2.sf(chi, 1)}


def friedman(rows, form):
    """friedmanchisquare on the ticked columns (in column order), the rows with a finite score in every one; scipy corrects for ties within a person as v1 does -> chi, pF.
    Kendall's W and the pairwise mean-rank z tests have no scipy counterpart: matches v1."""
    idxs = form["ticked"]["items"]
    x = []
    for r in rows:
        row = [math.nan if r[i] == "" else parse_float(r[i]) for i in idxs]
        if all(math.isfinite(v) for v in row):
            x.append(row)
    res = stats.friedmanchisquare(*[[row[j] for row in x] for j in range(len(idxs))])
    return {"chi": res.statistic, "pF": res.pvalue}


def mr_design(rows, form, bin=False):
    """stkMRData rebuilt from the inputs: the ticked columns without the outcome (preds, then cats without preds, then preds2 and cats2 without the ones taken), the rows with an outcome
    and every numeric predictor present and finite and every categorical predictor present, then the design in v1's order addNum(preds), addCat(cats), addNum(preds2), addCat(cats2).
    A categorical predictor's levels are in first-seen order over the rows kept; its reference level is the one `ref` names (`name=level`, parts split on , or ;, names and levels
    case-insensitive, the last level that matches), else the largest group, ties to the first seen; one 0/1 column for every other level, in level order.
    The step 1 count is v1's step1n, the number of ticked step 1 columns (len(idxs1) + len(cidx1)), not the number of design columns they add: copied by design, so a case
    with a 3-level categorical in step 1 agrees with v1's numbers, and register row D-W2-18 (proposed) is what reports that count to OJ.
    With `bin` (logistic, stkMRData(true)) the outcome only has to be present, and y is 1 for the event and 0 otherwise: the event is the answer `pos` names (case-insensitive,
    the last match), else the last of the outcome's answers (first-seen order over the rows kept) that is 1, yes, true, y, present or agree (case-insensitive), else the second of
    the two answers sorted by number when both parse, else by text."""
    dv = col(form, "dv")
    ticked = form["ticked"]

    def tick(cls, skip):
        return [i for i in ticked.get(cls, []) if i != dv and i not in skip]

    idxs1 = tick("preds", [])
    cidx1 = tick("cats", idxs1)
    taken = idxs1 + cidx1
    idxs2 = tick("preds2", taken)
    cidx2 = tick("cats2", taken + idxs2)
    idxs, cidxs = idxs1 + idxs2, cidx1 + cidx2
    spec = {}
    for part in re.split(r"[,;]", form["values"].get("ref", "")):
        q = part.split("=")
        if len(q) == 2:
            spec[js_trim(q[0]).lower()] = js_trim(q[1])
    kept = [r for r in rows
            if r[dv] != "" and (bin or math.isfinite(parse_float(r[dv])))
            and all(r[i] != "" and math.isfinite(parse_float(r[i])) for i in idxs)
            and all(r[i] != "" for i in cidxs)]
    y = [parse_float(r[dv]) for r in kept]
    if bin:
        lv = first_seen([js_trim(r[dv]) for r in kept])
        want = js_trim(form["values"].get("pos", "")).lower()
        pos = None
        if want:
            for v in lv:
                if v.lower() == want:
                    pos = v
        else:
            for v in lv:
                if v.lower() in ("1", "yes", "true", "y", "present", "agree"):
                    pos = v
            if pos is None:
                a, b = lv  # the comparator's sort of two answers, stable when it returns 0; pos is the second
                x, z = parse_float(a), parse_float(b)
                if math.isfinite(x) and math.isfinite(z):
                    pos = a if x > z else b
                else:
                    pos = a if a > b else b
        y = [1.0 if js_trim(r[dv]) == pos else 0.0 for r in kept]
    xs, dummy = [], []
    names = [h or "Col%d" % (i + 1) for i, h in enumerate(form["headers"])]  # d.cols[i].name: statsParseText names a blank header 'Col'+(i+1)

    def add_num(lst):
        for i in lst:
            xs.append([parse_float(r[i]) for r in kept])
            dummy.append(False)

    def add_cat(lst):
        for i in lst:
            lv = first_seen([r[i] for r in kept])
            cnt = {g: sum(1 for r in kept if r[i] == g) for g in lv}
            want = spec.get(names[i].lower())
            ref = None
            if want is not None:
                for g in lv:
                    if g.lower() == want.lower():
                        ref = g
            if ref is None:
                ref = lv[0]
                for g in lv:
                    if cnt[g] > cnt[ref]:
                        ref = g
            for g in lv:
                if g != ref:
                    xs.append([1.0 if r[i] == g else 0.0 for r in kept])
                    dummy.append(True)

    add_num(idxs1)
    add_cat(cidx1)
    add_num(idxs2)
    add_cat(cidx2)
    return np.array(y), [np.array(x) for x in xs], dummy, len(idxs1) + len(cidx1), len(idxs2) + len(cidx2) > 0


def ols(xs, y):
    """numpy's least squares on the design with an intercept: (coefficients, X, residual sum of squares, total sum of squares)."""
    X = np.column_stack([np.ones(len(y))] + xs)
    b = np.linalg.lstsq(X, y, rcond=None)[0]
    res = y - X @ b
    return b, X, float(res @ res), float(((y - y.mean()) ** 2).sum())


def mregress(rows, form):
    """An independent numpy computation of v1's multiple regression: lstsq on the design stkMRData builds (rebuilt by mr_design) -> b_j (j 0 the intercept, j >= 1 the j-th
    predictor in m.labels order), se_j = sqrt(mse * (X'X)^-1_jj), t_j, p_j = 2 t.sf(|t_j|, dfe), r2, adj, F, pF = f.sf; vif_j = 1/(1 - R2_j) from regressing predictor j on the
    others (with an intercept); beta_j = b_j sd(x_j)/sd(y) for the predictors that are not 0/1 dummies; with a step 2, the step 1 model on its first k1 columns -> k1, r21, adj1, F1,
    p1 and the F change dR, Fc, pc."""
    y, xs, dummy, k1, step2 = mr_design(rows, form)
    n, k = len(y), len(xs)
    dfe = n - k - 1
    b, X, sse, sst = ols(xs, y)
    mse = sse / dfe
    inv = np.linalg.inv(X.T @ X)
    r2 = 1 - sse / sst
    adj = 1 - (1 - r2) * (n - 1) / dfe
    F = (r2 / k) / ((1 - r2) / dfe)
    out = {"n": n, "k": k, "dfe": dfe, "r2": r2, "adj": adj, "F": F, "pF": stats.f.sf(F, k, dfe)}
    sdy = float(np.std(y, ddof=1))
    for j in range(k + 1):
        se = math.sqrt(mse * inv[j][j])
        t = b[j] / se
        out["b_%d" % j], out["se_%d" % j], out["t_%d" % j], out["p_%d" % j] = b[j], se, t, 2 * stats.t.sf(abs(t), dfe)
        if j > 0:
            others = [x for i, x in enumerate(xs) if i != j - 1]
            _, _, sse_j, sst_j = ols(others, xs[j - 1])
            if sse_j > 0:  # v1's VIF is Infinity where stkOLS(others, x) is null; the reference has no number for that key (the safety net then refuses the case in v1 anyway)
                out["vif_%d" % j] = 1 / (1 - (1 - sse_j / sst_j))
            if not dummy[j - 1]:
                out["beta_%d" % j] = b[j] * float(np.std(xs[j - 1], ddof=1)) / sdy
    if step2:
        _, _, sse1, sst1 = ols(xs[:k1], y)
        dfe1 = n - k1 - 1
        r21 = 1 - sse1 / sst1
        F1 = (r21 / k1) / ((1 - r21) / dfe1)
        dk, dR = k - k1, r2 - r21
        Fc = (dR / dk) / ((1 - r2) / dfe)
        out.update(k1=k1, r21=r21, adj1=1 - (1 - r21) * (n - 1) / dfe1, F1=F1, p1=stats.f.sf(F1, k1, dfe1), dR=dR, Fc=Fc, pc=stats.f.sf(Fc, dk, dfe))
    return out


def logistic(rows, form):
    """An independent numpy/scipy computation of v1's logistic regression on the design stkMRData(true) builds (rebuilt by mr_design with bin): the coefficients b_j minimise the
    negative log-likelihood by scipy.optimize.minimize (Newton-CG with the analytic gradient and Hessian, xtol 1e-14: the brief named BFGS with tol 1e-10, but BFGS stops on
    a gradient norm and leaves the coefficients accurate only to about the square root of that, which against v1's Newton fit to 1e-11 would use most of the 1e-5 tolerance; with the
    exact Hessian Newton-CG converges quadratically, to about 1e-7 of v1 on these fixtures), se_j = sqrt of the diagonal of the inverse of the analytic
    Hessian X'WX at the optimum; z_j, p_j = 2 norm.sf(|z_j|), or_j, lo_j, hi_j = exp(b_j -/+ norm.ppf(.975) se_j) for j >= 1; the log-likelihood of the intercept-only model in closed
    form, lr, pLR = chi2.sf(lr, k), Cox-Snell (cs), Nagelkerke (nag), McFadden (mcf); auc = the Mann-Whitney U of the fitted probabilities (events against non-events) over n1 n0
    (mannwhitneyu's statistic); the classification at p >= .5: tp, tn, fp, fn, acc, sens, spec (left out when not finite); vif_j as for mregress (1 for a single predictor)."""
    from scipy import optimize
    y, xs, dummy, _, _ = mr_design(rows, form, bin=True)
    n, k = len(y), len(xs)
    X = np.column_stack([np.ones(n)] + xs)

    def nll(b):
        z = X @ b
        return float(np.sum(np.logaddexp(0, z) - y * z))

    def grad(b):
        return X.T @ (1 / (1 + np.exp(-(X @ b))) - y)

    def hess(b):
        p = 1 / (1 + np.exp(-(X @ b)))
        return X.T @ (X * (p * (1 - p))[:, None])

    res = optimize.minimize(nll, np.zeros(k + 1), jac=grad, hess=hess, method="Newton-CG", options={"xtol": 1e-14, "maxiter": 1000})
    b = res.x
    se = np.sqrt(np.diag(np.linalg.inv(hess(b))))
    pr = 1 / (1 + np.exp(-(X @ b)))
    ll = -nll(b)
    ev = float(y.sum())
    ne = n - ev
    ll0 = ev * math.log(ev / n) + ne * math.log(ne / n)
    lr = 2 * (ll - ll0)
    cs = 1 - math.exp((2 / n) * (ll0 - ll))
    out = {"n": n, "k": k, "ev": ev, "ne": ne, "lr": lr, "pLR": stats.chi2.sf(lr, k), "cs": cs, "nag": cs / (1 - math.exp((2 / n) * ll0)), "mcf": 1 - ll / ll0}
    out["auc"] = stats.mannwhitneyu(pr[y == 1], pr[y == 0]).statistic / (ev * ne)
    pd = pr >= 0.5
    tp, tn = int(np.sum(pd & (y == 1))), int(np.sum(~pd & (y == 0)))
    fp, fn = int(np.sum(pd & (y == 0))), int(np.sum(~pd & (y == 1)))
    out.update(tp=tp, tn=tn, fp=fp, fn=fn, acc=(tp + tn) / n)
    if tp + fn:
        out["sens"] = tp / (tp + fn)
    if tn + fp:
        out["spec"] = tn / (tn + fp)
    zc = stats.norm.ppf(0.975)
    for j in range(k + 1):
        z = b[j] / se[j]
        out["b_%d" % j], out["se_%d" % j], out["z_%d" % j], out["p_%d" % j] = b[j], se[j], z, 2 * stats.norm.sf(abs(z))
        if j > 0:
            out["or_%d" % j], out["lo_%d" % j], out["hi_%d" % j] = math.exp(b[j]), math.exp(b[j] - zc * se[j]), math.exp(b[j] + zc * se[j])
            if k == 1:
                out["vif_%d" % j] = 1.0
            else:
                others = [x for i, x in enumerate(xs) if i != j - 1]
                _, _, sse_j, sst_j = ols(others, xs[j - 1])
                out["vif_%d" % j] = 1 / (1 - (1 - sse_j / sst_j))
    return out


def rm_scores(rows, form):
    """The rows of rmanova and alpha with a number in every ticked column ('' is no number), as an n x k array in the ticked order."""
    idxs = form["ticked"]["items"]
    X = [[parse_float(r[i]) if r[i] != "" else math.nan for i in idxs] for r in rows]
    return np.array([x for x in X if all(math.isfinite(v) for v in x)])


def rmanova(rows, form):
    """An independent numpy computation of v1's repeated-measures ANOVA: ssc, sss and sst about the grand mean, sse as the residual sum of squares of the additive two-way fit
    (y_ij - row mean - column mean + grand mean), F, pU = f.sf(F, k-1, (n-1)(k-1)); the sphericity statistics on A = C S C' with S = np.cov of the scores and C scipy.linalg.helmert's
    orthonormal contrasts (a different basis from v1's: epsilon and W do not depend on it): gg = tr(A)^2 / ((k-1) tr(A^2)), Huynh-Feldt's hf = min(1, (n(k-1)gg - 2) / ((k-1)(n-1-(k-1)gg))),
    Mauchly's W = det(A) / (tr(A)/(k-1))^(k-1) by np.linalg.det, chi = -(n-1-f) ln W with f = (2p^2+p+2)/(6p), p = k-1, pM = chi2.sf(chi, k(k-1)/2-1); eps (gg below .75, else hf),
    pC = f.sf(F, eps(k-1), eps(n-1)(k-1)), pe2, ge2; when pC is below .05 (v1 then shows the pairwise table) for each pair i < j whose differences have spread, ttest_rel -> pair_t_i_j, pair_p_i_j. Where A is singular (its condition
    number above 1e12: a pair of conditions differing by a constant), W, chi and pM are left out (v1 reports Mauchly's test as not calculable there, chi 0 and p 1), and so is a pair
    whose differences have no spread beyond rounding (an SD below 1e-9 of the mean difference)."""
    from scipy.linalg import helmert
    Y = rm_scores(rows, form)
    n, k = Y.shape
    gm = Y.mean()
    cm, sm = Y.mean(axis=0), Y.mean(axis=1)
    ssc, sss, sst = n * float(((cm - gm) ** 2).sum()), k * float(((sm - gm) ** 2).sum()), float(((Y - gm) ** 2).sum())
    sse = float(((Y - sm[:, None] - cm[None, :] + gm) ** 2).sum())
    d1, d2 = k - 1, (n - 1) * (k - 1)
    F = (ssc / d1) / (sse / d2)
    C = helmert(k)
    A = C @ np.cov(Y.T) @ C.T
    trA = float(np.trace(A))
    gg = trA * trA / ((k - 1) * float(np.trace(A @ A)))
    hf = min(1.0, (n * (k - 1) * gg - 2) / ((k - 1) * (n - 1 - (k - 1) * gg)))
    eps = gg if gg < 0.75 else hf
    out = {"n": n, "k": k, "ssc": ssc, "sss": sss, "sst": sst, "sse": sse, "F": F, "d1": d1, "d2": d2, "pU": stats.f.sf(F, d1, d2), "gg": gg, "hf": hf,
           "dfM": k * (k - 1) / 2 - 1, "eps": eps, "pC": stats.f.sf(F, eps * d1, eps * d2), "pe2": ssc / (ssc + sse), "ge2": ssc / (ssc + sss + sse)}
    if np.linalg.cond(A) < 1e12:
        p = k - 1
        W = float(np.linalg.det(A)) / (trA / p) ** p
        chi = -(n - 1 - (2 * p * p + p + 2) / (6 * p)) * math.log(W)
        out.update(W=W, chi=chi, pM=stats.chi2.sf(chi, out["dfM"]))
    for i in range(k if out["pC"] < 0.05 else 0):  # v1 shows the pairwise table, and the runner records its values, only after a significant corrected test
        for j in range(i + 1, k):
            dd = Y[:, i] - Y[:, j]
            if np.std(dd, ddof=1) > 1e-9 * abs(dd.mean()):
                t = stats.ttest_rel(Y[:, i], Y[:, j])
                out["pair_t_%d_%d" % (i, j)], out["pair_p_%d_%d" % (i, j)] = t.statistic, t.pvalue
    return out


# v1's rrange pattern /^\s*(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*$/ with JavaScript's \s (JS_WS), \d (ASCII digits) and $ (the end of the string)
RRANGE = re.compile(r"^[" + re.escape(JS_WS) + r"]*([0-9]+(?:\.[0-9]+)?)[" + re.escape(JS_WS) + r"]*(?:-|–|to)[" + re.escape(JS_WS) + r"]*([0-9]+(?:\.[0-9]+)?)[" + re.escape(JS_WS) + r"]*\Z")


def alpha(rows, form):
    """An independent numpy/scipy computation of v1's reliability table (omega and its bootstrap have no counterpart here: matches v1): the rows with a number in every ticked
    item (alpha's filter is parseFloat alone, so an empty cell drops the row too), the items `rev` names reversed as lo + hi - x with lo and hi from `rrange`; Cronbach's alpha =
    k/(k-1) (1 - sum of the item variances / the variance of the total), np.var with ddof 1; its interval 1 - (1 - alpha) f.ppf(.975 and .025, n-1, (n-1)(k-1)); meanR the mean of
    np.corrcoef's off-diagonal; for each item rit_j = np.corrcoef(item, the total of the others) and ad_j the same alpha without the item."""
    idxs = form["ticked"]["items"]
    X = np.array([x for x in ([parse_float(r[i]) for i in idxs] for r in rows) if all(math.isfinite(v) for v in x)])
    names = [(h or "Col%d" % (i + 1)) for i, h in enumerate(form["headers"])]
    rev_txt = js_trim(form["values"].get("rev", ""))
    if rev_txt:
        want = [w for w in (js_trim(x).lower() for x in rev_txt.split(",")) if w]
        m = RRANGE.match(form["values"].get("rrange", ""))
        lo, hi = float(m.group(1)), float(m.group(2))
        for j, i in enumerate(idxs):
            if names[i].lower() in want:
                X[:, j] = lo + hi - X[:, j]
    n, k = X.shape

    def cronbach(M):
        q = M.shape[1]
        return q / (q - 1) * (1 - float(np.var(M, axis=0, ddof=1).sum()) / float(np.var(M.sum(axis=1), ddof=1)))

    a = cronbach(X)
    d1, d2 = n - 1, (n - 1) * (k - 1)
    out = {"n": n, "k": k, "alpha": a, "aciLo": 1 - (1 - a) * stats.f.ppf(0.975, d1, d2), "aciHi": 1 - (1 - a) * stats.f.ppf(0.025, d1, d2)}
    R = np.corrcoef(X.T)
    out["meanR"] = float(R[np.triu_indices(k, 1)].mean())
    for j in range(k):
        rest = X.sum(axis=1) - X[:, j]
        out["rit_%d" % j] = float(np.corrcoef(X[:, j], rest)[0, 1])
        out["ad_%d" % j] = cronbach(np.delete(X, j, axis=1))
    return out


def three_cols(rows, i1, i2, i3):
    """The row filter of moderate and mediate: the three cells present and all three finite through parseFloat, in data order."""
    out = []
    for r in rows:
        if r[i1] == "" or r[i2] == "" or r[i3] == "":
            continue
        a, b, c = parse_float(r[i1]), parse_float(r[i2]), parse_float(r[i3])
        if math.isfinite(a) and math.isfinite(b) and math.isfinite(c):
            out.append((a, b, c))
    return np.array(out)


def ols_fit(cols, y):
    """numpy's least squares on [1, cols...]: (coefficients, the covariance matrix mse (X'X)^-1, sse, sst, the residual df)."""
    X = np.column_stack([np.ones(len(y))] + list(cols))
    beta = np.linalg.lstsq(X, y, rcond=None)[0]
    sse = float(((y - X @ beta) ** 2).sum())
    sst = float(((y - y.mean()) ** 2).sum())
    dfe = len(y) - X.shape[1]
    return beta, (sse / dfe) * np.linalg.inv(X.T @ X), sse, sst, dfe


def moderate(rows, form):
    """An independent numpy computation of v1's moderation model: the rows with all three values, X and W centred on their means, lstsq of Y on [1, Xc, Wc, Xc*Wc] -> b_j, se_j
    (the square root of the diagonal of mse (X'X)^-1), t_j, p_j (2 t.sf on n-4 df) for j in v1's order (the intercept, X, W, the product), r2, F = (r2/3)/((1-r2)/(n-4)), dr2 the rise in
    R² over [1, Xc, Wc], Fc = (sse0 - sse)/mse; the simple slopes of X at W centred at -1 SD, 0 and +1 SD (np.std ddof 1): sl_*_b = b1 + b3 w, sl_*_se from the covariance
    matrix, sl_*_p (2 t.sf). pF and pFc (pFromF's 1 - betai, register row F5a, below 1e-10 on these fixtures) and the Johnson-Neyman region (roots) are held to v1 only."""
    D = three_cols(rows, col(form, "x"), col(form, "w"), col(form, "dv"))
    x, w, y = D[:, 0], D[:, 1], D[:, 2]
    n = len(y)
    xc, wc = x - x.mean(), w - w.mean()
    beta, V, sse, sst, dfe = ols_fit([xc, wc, xc * wc], y)
    _, _, sse0, _, _ = ols_fit([xc, wc], y)
    r2 = 1 - sse / sst
    out = {"n": n, "r2": r2, "F": (r2 / 3) / ((1 - r2) / dfe), "dr2": (sse0 - sse) / sst, "Fc": (sse0 - sse) / (sse / dfe)}
    for j in range(4):
        se = math.sqrt(V[j, j])
        out["b_%d" % j], out["se_%d" % j], out["t_%d" % j], out["p_%d" % j] = beta[j], se, beta[j] / se, 2 * stats.t.sf(abs(beta[j] / se), dfe)
    sdw = float(np.std(w, ddof=1))
    for name, lev in (("lo", -sdw), ("mid", 0.0), ("hi", sdw)):
        b = beta[1] + beta[3] * lev
        se = math.sqrt(V[1, 1] + 2 * lev * V[1, 3] + lev * lev * V[3, 3])
        out["sl_%s_b" % name], out["sl_%s_se" % name], out["sl_%s_p" % name] = b, se, 2 * stats.t.sf(abs(b / se), dfe)
    return out


def mediate(rows, form):
    """An independent numpy computation of v1's mediation paths: the rows with all three values; lstsq of M on [1, X] (a), of Y on [1, X, M] (b the M coefficient, cp the X
    coefficient) and of Y on [1, X] (c) -> a_b, b_b, cp_b, c_b and their p (2 t.sf on n-2, n-3, n-3 and n-2 df), r2m, r2y. The indirect effect and its seeded percentile bootstrap
    (ab, lo, hi, bse, abStd, okCount) are held to v1 only: matches v1 (seeded bootstrap, F14)."""
    D = three_cols(rows, col(form, "x"), col(form, "m"), col(form, "dv"))
    x, m, y = D[:, 0], D[:, 1], D[:, 2]
    out = {"n": len(y)}
    for name, cols, dv, j in (("a", [x], m, 1), ("b", [x, m], y, 2), ("cp", [x, m], y, 1), ("c", [x], y, 1)):
        beta, V, sse, sst, dfe = ols_fit(cols, dv)
        out[name + "_b"], out[name + "_p"] = beta[j], 2 * stats.t.sf(abs(beta[j] / math.sqrt(V[j, j])), dfe)
        if name == "a":
            out["r2m"] = 1 - sse / sst
        if name == "b":
            out["r2y"] = 1 - sse / sst
    return out


class NoReference(Exception):
    """A test this scipy has no counterpart for: the case is written with ref null and the message as why."""


# The scipy counterpart of each runner: (rows, form) -> { values key: scipy's number }, under the runner's `values` keys. `form` is the fixture's form with the parsed
# `headers` added (mregress names a categorical predictor's reference level by its column name).
REFERENCE = {
    "ttest1": ttest1,               # ttest_1samp(vals, mu) -> t, p
    "ttestInd": ttest_ind,          # ttest_ind(equal_var=False) -> t, p, df; equal_var=True -> tS, pS
    "ttestPaired": ttest_paired,    # ttest_rel -> t, p
    "anova1": anova1,               # f_oneway -> F, p
    "tukey": tukey,                 # tukey_hsd -> p_i_j for every pair i < j
    "regression": regression,       # linregress -> b1, b0, seB1, p, r2 = rvalue**2, F = (slope / stderr)**2
    "pearson": pearson,             # pearsonr -> r, p; confidence_interval() -> cl, ch (n > 3)
    "mannwhitney": mannwhitney,     # mannwhitneyu(method exact or asymptotic by v1's exactOK, use_continuity=True) -> U = min(U1, n1*n2 - U1), p
    "wilcoxon": wilcoxon,           # wilcoxon(method exact or approx by v1's exactOK, correction=True, zero_method="wilcox") -> W = min(W+, W-), p
    "kruskal": kruskal,             # kruskal -> H, p
    "spearman": spearman,           # spearmanr -> rho, p (the interval, lo and hi, is v1's own: no scipy counterpart)
    "welchAnova": welch_anova,      # f_oneway(equal_var=False) -> F, p (Games-Howell, gh_*: no scipy counterpart)
    "chisq": chisq,                 # chi2_contingency(correction=False) -> chi2, p; 2x2: correction=True -> chiY, pY; Fisher: fisher_exact -> fisherP, a*d/(b*c) -> fisherOr (F8)
    "gof": gof,                     # chisquare(obs, exp) -> chi2, p; two categories with an expected count below 5: binomtest(obs[0], N, share[0]) -> binomP
    "mcnemar": mcnemar,             # binomtest(b, nd, 0.5) -> pEx; chi = (|b - c| - 1)^2 / nd ("formula"), chi2.sf(chi, 1) -> pChi
    "friedman": friedman,           # friedmanchisquare -> chi, pF
    "mregress": mregress,           # an independent numpy computation: lstsq -> b_j, se_j, t_j, p_j (t.sf), r2, adj, F, pF (f.sf), vif_j, beta_j; step 2: k1, r21, adj1, F1, p1, dR, Fc, pc
    "logistic": logistic,           # an independent numpy computation: minimize (Newton-CG) -> b_j, se_j (inverse Hessian), z_j, p_j, or_j, lo_j, hi_j; lr, pLR (chi2.sf), cs, nag, mcf, auc (mannwhitneyu), the classification, vif_j
    "rmanova": rmanova,             # an independent numpy computation: the sums of squares, F, pU (f.sf), gg, hf, W, chi, pM (chi2.sf) on Helmert contrasts, eps, pC, pe2, ge2; ttest_rel -> pair_t_i_j, pair_p_i_j
    "alpha": alpha,                 # alpha from the variance formula, its interval from f.ppf, meanR, rit_j, ad_j (omega and its bootstrap interval: matches v1)
    "moderate": moderate,           # an independent numpy computation: lstsq on the centred design -> b_j, se_j, t_j, p_j (t.sf), r2, F, dr2, Fc, the simple slopes sl_*_b, sl_*_se, sl_*_p (Johnson-Neyman, pF, pFc: matches v1)
    "mediate": mediate,             # an independent numpy computation: lstsq for the a, b, c' and c paths -> a_b, a_p, b_b, b_p, cp_b, cp_p, c_b, c_p (t.sf), r2m, r2y (the bootstrap: matches v1, F14)
}
# Tests with no scipy counterpart at all: every case is written with ref null and this reason, and the port's values are held to v1 only, by the golden fixtures ("matches v1").
NO_COUNTERPART = {
    "cochran": "no scipy counterpart: Cochran's Q matches v1",
    "anova2": "matches v1 (Type III, no R here)",
    "mixed": "matches v1 (F10)",
}
# No scipy counterpart, so these values are held to v1 only ("matches v1"): Games-Howell (welchAnova gh_*), Dunn with Holm (kruskal padj_i_j), the Spearman interval (lo, hi), omega2 and eps2,
# the Fisher-Freeman-Halton test (chisq ffhP, ffhTables), Cramer's V (v), Cohen's w, Kendall's W, the Cochran and Friedman pairwise p (pair_p_i_j), all of Cochran's Q, and all of the two-way ANOVA (Type III sums of squares,
# simple effects, the marginal-means Tukey and the within-level Bonferroni tests: anova2 matches v1), McDonald's omega with its loadings and bootstrap interval (alpha's omega, load_j, ociLo, ociHi),
# all of the mixed ANOVA (mixed matches v1, register row F10), moderation's pF, pFc and Johnson-Neyman region (roots), and mediation's indirect effect with its seeded bootstrap (ab, lo, hi,
# bse, abStd, okCount: register row F14).


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: scipy-reference.py <directory holding the stats fixtures>")
    directory = sys.argv[1]
    tests = sorted(f[:-5] for f in os.listdir(os.path.join(directory, "corpus")) if f.endswith(".json"))
    out = []
    for test in tests:
        with open(os.path.join(directory, test + ".json"), encoding="utf-8") as f:
            cases = json.load(f)["cases"]
        for case in cases:
            entry = {"test": case["test"], "id": case["id"]}
            if case["test"] in NO_COUNTERPART:
                entry.update(ref=None, why=NO_COUNTERPART[case["test"]])
            elif case["test"] not in REFERENCE:
                entry.update(ref=None, why="no scipy reference for this test yet")
            elif case["toasts"]:
                entry.update(ref=None, why="v1 refused the case with a toast")
            elif case["apa"] is None:
                entry.update(ref=None, why="v1's safety net suppressed the result")
            else:
                headers, rows = parse_text(case["csv"])
                form = dict(case["form"], headers=headers)
                try:
                    with warnings.catch_warnings():
                        warnings.simplefilter("ignore")  # scipy warns on a perfect fit or a tiny sample; the value is what is recorded
                        ref = {k: float(v) for k, v in REFERENCE[case["test"]](rows, form).items()}
                except NoReference as e:
                    entry.update(ref=None, why=str(e))
                    out.append(entry)
                    continue
                bad = sorted(k for k, v in ref.items() if not math.isfinite(v))
                if bad:
                    entry.update(ref=None, why="scipy returns no finite value for " + ", ".join(bad))
                else:
                    entry["ref"] = ref
            out.append(entry)
    path = os.path.join(directory, "scipy-reference.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"scipy": scipy.__version__, "cases": out}, f, indent=1, ensure_ascii=False)
        f.write("\n")
    per = {}
    for c in out:
        n = per.setdefault(c["test"], [0, 0])
        n[0 if c["ref"] is not None else 1] += 1
    print("scipy %s, numpy %s: %d cases written to %s" % (scipy.__version__, np.__version__, len(out), path))
    for t, (a, b) in per.items():
        print("  %s: %d with a reference, %d null" % (t, a, b))


main()
