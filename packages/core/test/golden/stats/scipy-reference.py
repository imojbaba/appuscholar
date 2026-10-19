# scipy's values for the Statistics Lab fixtures, for stats-scipy.test.ts (parity-port spec 5.9). Seeded from statsmath/scipy-reference.py and pvalue/scipy-reference.py.
# Run once, locally, and commit scipy-reference.json; run it again when a corpus gains cases (after golden:capture stats) or the scipy pin changes. From the repository root:
#   uv run --no-project --with scipy==1.17.1 --python 3.13 python -I packages/core/test/golden/stats/scipy-reference.py packages/core/test/golden/stats
# The argument is the directory holding the fixtures <test>.json (one for each corpus/<test>.json, read in sorted order, as stats/capture.ts does); scipy-reference.json is written beside
# them as { "scipy": <version>, "cases": [{ "test", "id", "ref": {...} | null, "why"? }] }, one entry for every fixture case, in the fixtures' order.
# Independent of v1's numbers: of each case only the inputs are read, the `csv` (re-parsed here with v1's rules, intake.ts) and the `form` (the column indexes v1's form held); of v1's output
# only whether it refused the case (a toast, or the safety net's apa null), which sets `ref` to null with `why`, so that no reference stands where the port has no values to compare.
# The groups come out in statsGroupBy's order (a plain object's key order: canonical array-index keys ascending, then the rest in first-seen order: register row F4), so the pairs and the sign
# of a difference are the ones v1 reports. A test with no entry in REFERENCE has `ref: null` ("no scipy reference for this test yet"); Tasks 6-9 add theirs.
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


class NoReference(Exception):
    """A test this scipy has no counterpart for: the case is written with ref null and the message as why."""


# The scipy counterpart of each runner: (rows, form) -> { values key: scipy's number }, under the runner's `values` keys.
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
}
# No scipy counterpart, so these values are held to v1 only ("matches v1"): Games-Howell (welchAnova gh_*), Dunn with Holm (kruskal padj_i_j), the Spearman interval (lo, hi), omega2 and eps2.


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
            if case["test"] not in REFERENCE:
                entry.update(ref=None, why="no scipy reference for this test yet")
            elif case["toasts"]:
                entry.update(ref=None, why="v1 refused the case with a toast")
            elif case["apa"] is None:
                entry.update(ref=None, why="v1's safety net suppressed the result")
            else:
                headers, rows = parse_text(case["csv"])
                try:
                    with warnings.catch_warnings():
                        warnings.simplefilter("ignore")  # scipy warns on a perfect fit or a tiny sample; the value is what is recorded
                        ref = {k: float(v) for k, v in REFERENCE[case["test"]](rows, case["form"]).items()}
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
