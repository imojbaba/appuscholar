# scipy's values for the Statistics Lab fixtures, for stats-scipy.test.ts (parity-port spec 5.9). Seeded from statsmath/scipy-reference.py and pvalue/scipy-reference.py.
# Run once, locally, and commit scipy-reference.json; run it again when a corpus gains cases (after golden:capture stats) or the scipy pin changes. From the repository root:
#   uv run --no-project --with scipy==1.17.1 --python 3.13 python -I packages/core/test/golden/stats/scipy-reference.py packages/core/test/golden/stats
# The argument is the directory holding the fixtures <test>.json (one for each corpus/<test>.json, read in sorted order, as stats/capture.ts does); scipy-reference.json is written beside
# them as { "scipy": <version>, "cases": [{ "test", "id", "ref": {...} | null, "why"? }] }, one entry for every fixture case, in the fixtures' order.
# Independent of v1's numbers: of each case only the inputs are read, the `csv` (re-parsed here with v1's rules, intake.ts) and the `form` (the column indexes v1's form held); of v1's output
# only whether it refused the case (a toast, or the safety net's apa null), which sets `ref` to null with `why`, so that no reference stands where the port has no values to compare.
# The groups come out in statsGroupBy's order (a plain object's key order: canonical array-index keys ascending, then the rest in first-seen order: register row F4), so the pairs and the sign
# of a difference are the ones v1 reports. A test with no entry in REFERENCE has `ref: null` ("no scipy reference for this test yet"); Tasks 5-9 add theirs.
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

NUMERIC = re.compile(r"^-?\d+(\.\d+)?$")
PARSE_FLOAT = re.compile(r"^[+-]?(Infinity|\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)")
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
    """statsParseText: lines on CRLF, CR or LF, blank ones dropped; tab when the first line holds one, else comma; rows of the wrong length dropped."""
    lines = [l for l in re.split(r"\r\n|\r|\n", text) if js_trim(l)]
    delim = "\t" if "\t" in lines[0] else ","
    headers = split_line(lines[0], delim)
    rows = [r for r in (split_line(l, delim) for l in lines[1:]) if len(r) == len(headers)]
    numeric = []
    for i in range(len(headers)):
        vals = [r[i] for r in rows if r[i] != ""]
        numeric.append(len(vals) > 0 and all(NUMERIC.match(v) for v in vals))
    return headers, rows, numeric


def parse_float(s):
    """JavaScript's parseFloat: the longest leading decimal literal after leading white space, NaN when there is none."""
    m = PARSE_FLOAT.match(s.lstrip(JS_WS))
    if not m:
        return math.nan
    t = m.group(0)
    return float(t.replace("Infinity", "inf"))


def is_array_index(k):
    return re.fullmatch(r"0|[1-9]\d*", k) is not None and int(k) < 2**32 - 1


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
    """The pair filter of ttestPaired, regression and pearson: both cells present, both finite."""
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


# The scipy counterpart of each runner: (rows, form) -> { values key: scipy's number }, under the runner's `values` keys.
REFERENCE = {
    "ttestInd": ttest_ind,          # ttest_ind(equal_var=False) -> t, p, df; equal_var=True -> tS, pS
    "ttestPaired": ttest_paired,    # ttest_rel -> t, p
    "anova1": anova1,               # f_oneway -> F, p
    "tukey": tukey,                 # tukey_hsd -> p_i_j for every pair i < j
    "regression": regression,       # linregress -> b1, b0, seB1, p, r2 = rvalue**2, F = (slope / stderr)**2
    "pearson": pearson,             # pearsonr -> r, p; confidence_interval() -> cl, ch (n > 3)
}


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
                headers, rows, numeric = parse_text(case["csv"])
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")  # scipy warns on a perfect fit or a tiny sample; the value is what is recorded
                    ref = {k: float(v) for k, v in REFERENCE[case["test"]](rows, case["form"]).items()}
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
