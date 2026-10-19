import type { Engine } from "../harness/engines";
import { writeFixture } from "../harness/fixture";

/**
 * Task 6's p values for the three p formatters (v1 11980-11982): both sides of the .001 cut (0.0004, 0.0005, 0.001, 0.0015), the .05 pair, the toFixed(3) rounding at the top
 * (0.9996 and 1.0004 both print 1.000), a p of 1, a negative p (below the cut, so it prints as "< .001") and NaN (neither comparison holds, so the formatters print "NaN").
 */
const P = [0, 0.0004, 0.0005, 0.001, 0.0015, 0.0499, 0.05, 0.5, 0.9996, 1, 1.0004, -0.2, NaN];

/**
 * noLead is recorded on the number itself and, as v1's callers pass it (`noLead(p.toFixed(3))`, 11981-11982), on the string toFixed(3) gives; pCell and fmtP on the number.
 * Each record is `{ fn, args, out }`, as in pvalue/cases.json; NaN is stored in the fixture's `{"$n": "NaN"}` form.
 */
export const statfmt: Engine = {
  name: "statfmt",
  async capture(v1, { check }) {
    const record = (fn: string, arg: number | string) => ({ fn, args: [arg], out: v1.call<string>(fn, arg) });
    const cases = [
      ...P.map((p) => record("noLead", p)),
      ...P.map((p) => record("noLead", p.toFixed(3))),
      ...P.map((p) => record("pCell", p)),
      ...P.map((p) => record("fmtP", p)),
    ];
    return [writeFixture("statfmt", "cases", { cases }, v1, check)];
  },
};
