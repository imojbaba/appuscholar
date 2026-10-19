# scipy's values at the points of cases.json, for pvalue.test.ts (parity-port spec 5.9). Independent of v1: only the arguments of cases.json are read, never v1's outputs.
# Run once, locally, and commit scipy-reference.json; run it again when cases.json gains points or the scipy pin changes. From the repository root:
#   uv run --no-project --with scipy==1.17.1 --python 3.13 python -I packages/core/test/golden/pvalue/scipy-reference.py packages/core/test/golden/pvalue
# Adapted from port-audit-evidence/03-compare-with-scipy.py, which printed v1's values beside scipy's; this one only records scipy's.
# The argument is the directory holding cases.json; scipy-reference.json is written beside it as { "scipy": <version>, "cases": [{ "fn", "args", "ref" }] }.
# JSON cannot hold NaN or an infinity: a ref that scipy returns as one is written as null.
import json
import math
import os
import sys

import scipy
from scipy import special, stats

# The scipy value for each v1 function; the lambda takes that function's arguments, in v1's order.
REFERENCE = {
    "pFromT": lambda t, df: 2 * stats.t.sf(abs(t), df),  # two-tailed
    "pFromF": lambda f, df1, df2: stats.f.sf(f, df1, df2),  # one-tailed
    "pFromChi": lambda x, df: stats.chi2.sf(x, df),
    "pFromZ": lambda z: 2 * stats.norm.sf(abs(z)),  # two-tailed
    "normalCDF": lambda z: stats.norm.cdf(z),
    "erf": lambda x: special.erf(x),
    "gammaln": lambda x: special.gammaln(x),
    "betai": lambda a, b, x: special.betainc(a, b, x),
    "gammaq": lambda a, x: special.gammaincc(a, x),
}

SPECIAL = {"NaN": math.nan, "Infinity": math.inf, "-Infinity": -math.inf, "-0": -0.0}


def decode(v):
    """cases.json stores the numbers JSON cannot hold as {"$n": "NaN"} and so on; the grid has none, but the file format allows them."""
    if isinstance(v, list):
        return [decode(x) for x in v]
    if isinstance(v, dict) and set(v) == {"$n"}:
        return SPECIAL[v["$n"]]
    return v


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: scipy-reference.py <directory holding cases.json>")
    directory = sys.argv[1]
    with open(os.path.join(directory, "cases.json"), encoding="utf-8") as f:
        cases = json.load(f)["cases"]
    out = []
    for case in cases:
        ref = float(REFERENCE[case["fn"]](*decode(case["args"])))
        out.append({"fn": case["fn"], "args": case["args"], "ref": ref if math.isfinite(ref) else None})
    path = os.path.join(directory, "scipy-reference.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"scipy": scipy.__version__, "cases": out}, f, indent=1)
        f.write("\n")
    print("scipy %s: %d cases written to %s (%d null)" % (scipy.__version__, len(out), path, sum(1 for c in out if c["ref"] is None)))


main()
