import { describe, it, expect } from "vitest";
import { noLead, pCell, fmtP } from "../../src/statfmt";
import { readFixture } from "./harness/fixture";

/**
 * statfmt.ts (v1 11980-11982): every case in test/golden/statfmt/cases.json, which `golden:capture statfmt` records from v1, compared with toBe.
 * Nothing expected is typed here, only the count of cases each function has in the fixture.
 */

type Case = { fn: "noLead"; args: [string | number]; out: string } | { fn: "pCell" | "fmtP"; args: [number]; out: string };
const shown = (v: string | number) => (typeof v === "string" ? JSON.stringify(v) : String(v));

describe("statfmt.ts is v1's noLead, pCell and fmtP", () => {
  const fx = readFixture<{ cases: Case[] }>("statfmt", "cases");
  it("the fixture holds the 13 p values for each function, and noLead on the number and on its toFixed(3) string", () => {
    const counts: Record<string, number> = {};
    for (const c of fx.cases) counts[c.fn] = (counts[c.fn] ?? 0) + 1;
    expect(counts).toEqual({ noLead: 26, pCell: 13, fmtP: 13 });
  });
  for (const c of fx.cases) it(`${c.fn}(${shown(c.args[0])})`, () => {
    const got = c.fn === "noLead" ? noLead(c.args[0]) : c.fn === "pCell" ? pCell(c.args[0]) : fmtP(c.args[0]);
    expect(got).toBe(c.out);
  });
});
