# scipy's values at the points of cases.json, for statsmath.test.ts (parity-port spec 5.9). Independent of v1: only the arguments of cases.json are read, never v1's outputs.
# Run once, locally, and commit scipy-reference.json; run it again when cases.json gains points or the scipy pin changes. From the repository root:
#   uv run --no-project --with scipy==1.17.1 --python 3.13 python -I packages/core/test/golden/statsmath/scipy-reference.py packages/core/test/golden/statsmath
# Seeded from pvalue/scipy-reference.py. The argument is the directory holding cases.json; scipy-reference.json is written beside it as
# { "scipy": <version>, "cases": [{ "fn", "args", "ref" }] }, one entry for each case whose fn has a scipy counterpart below, in the order of cases.json.
# `ref` is a number, or an object of numbers under v1's field names (W and p for stkShapiro, F and p for stkBrownForsythe, ...).
# JSON cannot hold NaN or an infinity: a value that scipy returns as one is written as null, and a case that scipy refuses (raises) has ref null.
import json
import math
import os
import sys
import warnings

import scipy
from scipy import stats


def obj(**fields):
    return fields


# The scipy value for each v1 function; the lambda takes that function's arguments, in v1's order.
REFERENCE = {
    "stkNormCdf": lambda z: stats.norm.cdf(z),
    "stkQnorm": lambda p: stats.norm.ppf(p),
    # scipy warns "Input data has range zero" and returns W = 1, p = 1 for a constant sample: no statistic exists there, so that case is recorded as null (see main)
    "stkShapiro": lambda x: (lambda r: obj(W=r.statistic, p=r.pvalue))(stats.shapiro(x)),
    "stkBrownForsythe": lambda groups: (lambda r: obj(F=r.statistic, p=r.pvalue))(stats.levene(*groups, center="median")),
    "pwNcChiSf": lambda x, df, lam: stats.ncx2.sf(x, df, lam),
    # with noncentrality 0 the noncentral F is the central F; scipy 1.17.1's ncf.sf(4, 1, 10, 0) returns -0.9266, so that point takes f.sf
    "pwNcFSf": lambda f, d1, d2, lam: stats.ncf.sf(f, d1, d2, lam) if lam > 0 else stats.f.sf(f, d1, d2),
    "pwNctCdf": lambda t, df, delta: stats.nct.cdf(t, df, delta),
    "pwChiCrit": lambda alpha, df: stats.chi2.isf(alpha, df),
    "stkTCrit": lambda df, alpha: stats.t.isf(alpha / 2, df),  # two-tailed critical value
    "stkFQuant": lambda q, d1, d2: stats.f.ppf(q, d1, d2),
    "stkPtukey": lambda q, k, v: stats.studentized_range.cdf(q, k, v),
    "stkQtukey": lambda pr, k, v: stats.studentized_range.ppf(pr, k, v),
    # p two-sided; `or` the sample odds ratio a*d/(b*c), which is scipy's statistic for a 2x2 table
    "stkFisher2x2": lambda a, b, c, d: (lambda r: obj(p=r.pvalue, **{"or": r.statistic}))(stats.fisher_exact([[a, b], [c, d]], alternative="two-sided")),
    "stkBinomTwo": lambda x, n, pi: stats.binomtest(x, n, pi).pvalue,
    "stkKruskal": lambda groups: (lambda r: obj(H=r.statistic, p=r.pvalue))(stats.kruskal(*groups)),
    "stkSpearman": lambda xs, ys: (lambda r: obj(rho=r.statistic, p=r.pvalue))(stats.spearmanr(xs, ys)),
}

SPECIAL = {"NaN": math.nan, "Infinity": math.inf, "-Infinity": -math.inf, "-0": -0.0}


def decode(v):
    """cases.json stores the numbers JSON cannot hold as {"$n": "NaN"} and so on."""
    if isinstance(v, list):
        return [decode(x) for x in v]
    if isinstance(v, dict):
        if set(v) == {"$n"}:
            return SPECIAL[v["$n"]]
        return {k: decode(x) for k, x in v.items()}
    return v


def finite(v):
    v = float(v)
    return v if math.isfinite(v) else None


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: scipy-reference.py <directory holding cases.json>")
    directory = sys.argv[1]
    with open(os.path.join(directory, "cases.json"), encoding="utf-8") as f:
        cases = json.load(f)["cases"]
    out = []
    for case in cases:
        if case["fn"] not in REFERENCE:
            continue
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")  # scipy warns on a constant input or a tiny sample; the value (or its absence) is what is recorded
            try:
                value = REFERENCE[case["fn"]](*decode(case["args"]))
            except ValueError:
                value = None
        if case["fn"] == "stkShapiro" and any("range zero" in str(w.message) for w in caught):
            value = None
        if isinstance(value, dict):
            ref = {k: finite(x) for k, x in value.items()}
        else:
            ref = None if value is None else finite(value)
        out.append({"fn": case["fn"], "args": case["args"], "ref": ref})
    path = os.path.join(directory, "scipy-reference.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"scipy": scipy.__version__, "cases": out}, f, indent=1)
        f.write("\n")
    print("scipy %s: %d cases written to %s (%d null)" % (scipy.__version__, len(out), path, sum(1 for c in out if c["ref"] is None)))


main()
