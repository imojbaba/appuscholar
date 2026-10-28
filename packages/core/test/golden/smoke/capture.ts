import type { Engine } from "../harness/engines";
import { writeFixture } from "../harness/fixture";

const power = (test: string, effect: number) => ({ test, effect, alpha: 0.05, tails: 2 });

/**
 * Argument tuples per function, called directly on v1. The p-value, Shapiro-Wilk, Tukey, exact Mann-Whitney and power lists are
 * port-audit-evidence/02's; pdScanText takes the three strings of core/test/pd.test.ts; the pFromZ, gammaln, betai, gammaq and erf
 * tuples reach each branch (pFromZ(0), betai's x ≤ 0 and x ≥ 1 exits and both continued-fraction sides, gammaq's series and fraction).
 */
const CALLS: Array<[fn: string, tuples: unknown[][]]> = [
  ["pFromT", [[0.5, 3], [2.15, 21], [5, 10], [10, 30], [20, 100], [40, 200]]],
  ["pFromF", [[1, 2, 10], [4, 3, 20], [30, 2, 40], [200, 3, 50], [900, 4, 100]]],
  ["pFromChi", [[3.84, 1], [20, 5], [80, 3], [200, 10]]],
  ["pFromZ", [[0], [1.96], [-2.5], [3.29], [6]]],
  ["normalCDF", [[0.5], [1], [2], [3], [4], [5]]],
  ["gammaln", [[0.5], [1], [2.5], [10], [100]]],
  ["betai", [[2, 3, 0], [2, 3, 1], [2, 3, 0.2], [2, 3, 0.8], [0.5, 0.5, 0.5], [10.5, 0.5, 0.9]]],
  ["gammaq", [[3, 0], [0.5, 0.2], [1, 1], [2, 5], [5, 10]]],
  ["erf", [[0], [0.5], [-1], [2], [-3]]],
  ["stkShapiro", [[[2.1, 3.4, 1.9, 5.6, 4.4, 3.8, 2.7, 9.1]], [[12, 14, 11, 13, 15, 12, 14, 13, 16, 18, 11, 12]], [[1, 2, 2, 3, 3, 3, 4, 4, 5, 9, 10, 20, 25, 3, 2]]]],
  ["stkPtukey", [[3.5, 3, 10], [4.2, 4, 20], [2.0, 3, 30], [5.5, 5, 12], [3.0, 6, 60]]],
  ["stkQtukey", [[0.95, 3, 10], [0.95, 4, 20], [0.95, 6, 60], [0.95, 3, 5]]],
  ["stkExactMW", [[5, 7, 6], [8, 8, 20], [12, 10, 40]]],
  ["pwPower", [[power("ind", 0.5), 64], [power("paired", 0.4), 30], [power("one", 0.3), 100], [{ ...power("anova", 0.25), k: 4 }, 40], [power("corr", 0.3), 85]]],
  ["pwSolveN", [[power("ind", 0.5), 0.8], [power("ind", 0.2), 0.9], [power("corr", 0.3), 0.8]]],
  ["accItems", [
    ["Smith (2020) found that 45% of 1,200 students slept under 6.5 hours, and Jones and Lee (2019) reported \"a marked decline in attention\" (p = .03)."],
    ["As Sharma et al. (2018a) noted, the effect was “small but reliable” (d = 0.24, N = 312), in line with O’Brien, 2015."],
    ["Scores fell from 28.4 to −3.5 points (Kumar & Rao, 2021; Das, 2017), and one participant said \"I could not sleep at all\" twice."],
  ]],
  ["pdScanText", [
    ["Write to asha@uni.ac.in or call +91 98765 43210, roll 9876543210. Aadhaar 1234 5678 9012, PAN ABCDE1234F."],
    ["n = 120, M = 3.45, SD = 0.9, year 2024, 12345"],
    ["Mail asha@uni.ac.in, phone 9876543210, PAN ABCDE1234F."],
  ]],
  ["provHash", [["a b c"], ["abc"], [""]]],
  ["aiuClassify", [["Continue this writing"], ["You are Appu, the help assistant"], ["Something new"]]],
  ["ccNorm", [["Müller"], ["O’Brien"], ["van der Berg"]]],
];

export const smoke: Engine = {
  name: "smoke",
  async capture(v1, { check }) {
    // args are copied before the call, so a function that changed its input could not change the record.
    const cases = CALLS.flatMap(([fn, tuples]) => tuples.map((args) => ({ fn, args: structuredClone(args), out: v1.call(fn, ...args) })));
    return [writeFixture("smoke", "cases", { cases }, v1, check)];
  },
};
