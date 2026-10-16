import { describe, it, expect } from "vitest";
import { accCheck } from "../src/accuracy";

describe("accuracy check (v1 accCheck)", () => {
  const orig = "Sleep loss predicted delay (Steel, 2007), r = .32 in 120 students, and “a reduced capacity to begin”.";
  it("reports unchanged when improve keeps every number, citation and quote", () => {
    const r = accCheck(orig, "Loss of sleep predicted delay (Steel, 2007), r = .32 among 120 students, and “a reduced capacity to begin”.", "improve");
    expect(r.warn).toBe(false);
    expect(r.msg).toBe("Checked: every number, citation and quoted phrase in your text is unchanged.");
  });
  it("names dropped and added items for improve", () => {
    const r = accCheck(orig, "Sleep loss predicted delay (Steel, 2010) in 95 students.", "improve");
    expect(r.warn).toBe(true);
    expect(r.missing).toEqual(expect.arrayContaining(["Steel 2007", ".32", "120", "“a reduced capacity to begin”"]));
    expect(r.added).toEqual(expect.arrayContaining(["Steel 2010", "95"]));
    expect(r.msg).toMatch(/^Dropped from your text: .* New in the result and not in your text, so unverified: .* Check each one against your sources before you accept, or delete it\.$/);
  });
  it("for continue only additions count, with the v1 sentence", () => {
    const r = accCheck("", "About 25% of diarists drop out (Rao et al., 2019).", "continue");
    expect(r.added).toEqual(["25%", "Rao et al. 2019"]);
    expect(r.msg).toBe("Not from your text, so unverified: 25%, Rao et al. 2019. Check each one against your sources before you accept, or delete it.");
  });
  it("continue with nothing added says none was added", () => {
    expect(accCheck("", "Plain prose without figures.", "continue").msg).toBe("Checked: every number, citation and quoted phrase in your text is unchanged and none was added.");
  });
  it("lists at most eight items then 'and N more'", () => {
    const r = accCheck("", "1 2 3 4 5 6 7 8 9 10", "continue");
    expect(r.msg).toContain("and 2 more");
  });
});
