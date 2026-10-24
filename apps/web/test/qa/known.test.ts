import path from "node:path";
import { describe, expect, it } from "vitest";
import { failsCase, findKnown, loadKnown, matchKnown, missingKnownIds, parseKnown, type KnownEntry } from "../../qa/support/known";
import type { CheckResult } from "../../qa/support/qa";

const known: KnownEntry[] = [
  { id: "Q1", title: "a small touch target", status: "known", match: { rule: "small-target" } },
  { id: "Q2", title: "words left in a passage", status: "known", match: { text: "were long and quiet" } },
  { id: "Q3", title: "no pattern: found by its id only", status: "known" },
  { id: "Q4", title: "both must fit", status: "awaiting", owner: "OJ", match: { rule: "console", text: "Failed to unlock" } },
  { id: "Q5", title: "an empty pattern matches nothing", status: "known", match: {} },
  { id: "Q6", title: "back after a fix", status: "fixed", match: { rule: "overlap" } }
];

describe("matchKnown", () => {
  it("matches by rule", () => {
    expect(matchKnown({ rule: "small-target" }, known)?.id).toBe("Q1");
    expect(matchKnown({ rule: "small-target", text: "a button 24 px wide" }, known)?.id).toBe("Q1");
  });

  it("matches by a substring of the text", () => {
    expect(matchKnown({ text: "the passage said: were long and quiet, then stopped" }, known)?.id).toBe("Q2");
    expect(matchKnown({ rule: "cut-off", text: "were long and quiet" }, known)?.id).toBe("Q2");
  });

  it("needs every part of a pattern with a rule and a text", () => {
    expect(matchKnown({ rule: "console", text: "Failed to unlock the vault" }, known)?.id).toBe("Q4");
    expect(matchKnown({ rule: "console", text: "something else" }, known)).toBeUndefined();
    expect(matchKnown({ rule: "cut-off", text: "Failed to unlock the vault" }, known)).toBeUndefined();
    expect(matchKnown({ text: "Failed to unlock the vault" }, known)).toBeUndefined();
  });

  it("matches a list of texts when the finding contains any one of them, and not a control that shares only a fragment", () => {
    const eyes: KnownEntry[] = [{ id: "E", title: "eyes", status: "known", match: { rule: "overlap", text: ["[pass-input-toggle]", "[recover-pass-toggle]"] } }];
    expect(matchKnown({ rule: "overlap", text: 'input [pass-input] over button "Show" [pass-input-toggle] they cross' }, eyes)?.id).toBe("E");
    expect(matchKnown({ rule: "overlap", text: 'input [recover-pass] over button "Show" [recover-pass-toggle] they cross' }, eyes)?.id).toBe("E");
    expect(matchKnown({ rule: "overlap", text: 'input [x] over button "Language" [lang-toggle] they cross' }, eyes)).toBeUndefined();
    expect(matchKnown({ rule: "small-target", text: "[pass-input-toggle]" }, eyes)).toBeUndefined();
  });

  it("returns undefined otherwise", () => {
    expect(matchKnown({}, known)).toBeUndefined();
    expect(matchKnown({ rule: "axe" }, known)).toBeUndefined();
    expect(matchKnown({ text: "WERE LONG AND QUIET" }, known)).toBeUndefined(); // the text is matched as written
    expect(matchKnown({ rule: "small-target" }, [])).toBeUndefined();
  });

  it("never matches an entry with no pattern, or an empty one", () => {
    expect(matchKnown({ rule: "anything", text: "Q3 no pattern: found by its id only" }, [known[2]!, known[4]!])).toBeUndefined();
  });

  it("still gives a fixed entry: a fault that came back must not be hidden", () => {
    expect(matchKnown({ rule: "overlap" }, known)?.status).toBe("fixed");
  });

  it("gives the first entry that fits", () => {
    const two: KnownEntry[] = [{ id: "A", title: "a", status: "known", match: { rule: "r" } }, { id: "B", title: "b", status: "known", match: { rule: "r" } }];
    expect(matchKnown({ rule: "r" }, two)?.id).toBe("A");
  });
});

describe("findKnown", () => {
  it("finds an entry by its id", () => {
    expect(findKnown("Q3", known)?.title).toContain("found by its id");
    expect(findKnown("Q99", known)).toBeUndefined();
  });
});

const failed = (o: Partial<CheckResult> = {}): CheckResult => ({ kind: "data", label: "a check", ok: false, fail: "unexpected", ...o });

describe("failsCase: which checks turn the case (and CI) red", () => {
  it("a failed check with no known id fails the case", () => {
    expect(failsCase(failed(), known)).toBe(true);
  });

  it("a failed check naming an id that is not in known.json fails the case (the id counts as none)", () => {
    expect(failsCase(failed({ known: "Q99" }), known)).toBe(true);
  });

  it("a failed check whose entry is fixed fails the case", () => {
    expect(failsCase(failed({ known: "Q6" }), known)).toBe(true);
  });

  it("a failed check whose entry is known, or awaiting a decision, does not", () => {
    expect(failsCase(failed({ known: "Q3" }), known)).toBe(false);
    expect(failsCase(failed({ known: "Q4" }), known)).toBe(false);
  });

  it("a check that passed, or that measured nothing, never does", () => {
    expect(failsCase({ kind: "data", label: "x", ok: true }, known)).toBe(false);
    expect(failsCase({ kind: "data", label: "x", ok: true, known: "Q6" }, known)).toBe(false);
    expect(failsCase({ kind: "visual", label: "x", ok: null, message: "nothing was on the page" }, known)).toBe(false);
  });
});

describe("missingKnownIds", () => {
  it("lists each id a check names that known.json lacks, once", () => {
    const checks: CheckResult[] = [failed({ known: "Q99" }), failed({ known: "Q3" }), { kind: "data", label: "x", ok: true, known: "Q99" }, failed({ known: "Z1" }), failed()];
    expect(missingKnownIds(checks, known)).toEqual(["Q99", "Z1"]);
  });
});

describe("known.json", () => {
  const shipped = loadKnown();
  const byId = (id: string) => shipped.find((e) => e.id === id);

  it("loads, with one entry per id", () => {
    expect(shipped.length).toBeGreaterThan(10);
    expect(new Set(shipped.map((e) => e.id)).size).toBe(shipped.length);
  });

  it("holds the faults fixed in #25 as fixed, and the open ones as known or awaiting a decision (spec section 9)", () => {
    for (const id of ["F2", "F3", "F4", "F5"]) expect(byId(id)?.status, id).toBe("fixed");
    for (const id of ["F1", "O1", "O2", "O3", "O6", "O7", "O12", "O15", "O18", "O21"]) expect(byId(id)?.status, id).toBe("known");
    for (const id of ["O4", "O5", "O11", "O14", "O20"]) expect(byId(id)?.status, id).toBe("awaiting");
  });

  it("has no entry for a budget row or O23 until a run shows it failing", () => {
    for (const id of ["O10", "O19", "O23", "O24"]) expect(byId(id), id).toBeUndefined();
  });

  it("names OJ as the owner of the decisions that are his", () => {
    for (const id of ["O4", "O5", "O14", "O20"]) expect(byId(id)?.owner, id).toBe("OJ");
  });
});

describe("parseKnown", () => {
  const ok = { id: "X1", title: "t", status: "known" };

  it("accepts a list of entries, a match text as one text or a list of texts", () => {
    expect(parseKnown([ok, { ...ok, id: "X2", status: "awaiting", owner: "Dr. Sharma", match: { rule: "r", text: "t" } }])).toHaveLength(2);
    expect(parseKnown([{ ...ok, match: { rule: "r", text: ["a", "b"] } }])[0]!.match).toEqual({ rule: "r", text: ["a", "b"] });
  });

  it.each([
    ["not a list", { id: "X1" }],
    ["an entry that is not an object", ["X1"]],
    ["no id", [{ title: "t", status: "known" }]],
    ["an empty title", [{ ...ok, title: "" }]],
    ["a status that does not exist", [{ ...ok, status: "open" }]],
    ["an owner that does not exist", [{ ...ok, owner: "Someone" }]],
    ["a match that is not an object", [{ ...ok, match: "text" }]],
    ["an empty match text", [{ ...ok, match: { text: "" } }]],
    ["a match rule that is not text", [{ ...ok, match: { rule: 4 } }]],
    ["an empty list of match texts", [{ ...ok, match: { text: [] } }]],
    ["a list of match texts with an empty one", [{ ...ok, match: { text: ["a", ""] } }]],
    ["a list of match texts with one that is not text", [{ ...ok, match: { text: ["a", 4] } }]],
    ["the same id twice", [ok, ok]]
  ])("refuses %s", (_what, data) => {
    expect(() => parseKnown(data)).toThrow(/known\.json/);
  });

  it("loadKnown refuses a file that is not there", () => {
    expect(() => loadKnown(path.join(__dirname, "no-such-known.json"))).toThrow();
  });
});
