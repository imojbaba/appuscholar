import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import type { CitationEntry } from "../../src/citation";
import { citCaretEntry, citMissingNumbers } from "../../src/citlib";
import type { PlainDoc } from "../../src/citlib";
import { readFixture } from "./harness/fixture";

/**
 * citlib.ts's Task 8a additions (v1's citMissingNumbers 7810-7817 and citCaretEntry's matching loop 7686-7693) against v1 running. Every expected value is read from
 * test/golden/citchecks/cases.json (`golden:capture citchecks`), captured from citlib/inputs.json's library and documents and citchecks/inputs.json's editor blocks.
 * Typed here: only guards that the inputs reach each branch (a document with missing numbers, a caret on a citation and off one, a later entry matched, a block other than the citing one).
 */

type Fx = {
  lib: CitationEntry[];
  plain: PlainDoc[];
  missing: Array<{ cur: string; libLen: number; out: number[] }>;
  caret: Array<{ block: string; text: string; s: number; e: number; out: number }>;
};
const fx = readFixture<Fx>("citchecks", "cases");
const base = JSON.parse(readFileSync(new URL("./citlib/inputs.json", import.meta.url), "utf8")) as { lib: CitationEntry[] };

describe("citlib.ts's caret match and missing numbers are v1's", () => {
  it("the fixture holds citlib's library and reaches each branch", () => {
    expect(fx.lib).toEqual(base.lib);
    expect(fx.missing.some((m) => m.out.length > 0)).toBe(true);
    expect(fx.missing.some((m) => m.cur === "" && m.out.length === 0)).toBe(true);
    expect(fx.caret.some((c) => c.out === -1)).toBe(true);
    expect(fx.caret.some((c) => c.out > 0)).toBe(true);
    expect(fx.caret.some((c) => c.block === "other-block")).toBe(true);
    expect(fx.caret.some((c) => c.s !== c.e)).toBe(true);
  });

  it("citMissingNumbers equals v1 for every open document and library length", () => {
    for (const m of fx.missing) expect(citMissingNumbers(fx.plain, m.cur, m.libLen), `${m.cur} ${m.libLen}`).toEqual(m.out);
  });

  it("citCaretEntry equals v1 for every caret position and selection", () => {
    for (const c of fx.caret) expect(citCaretEntry(fx.lib, c.text, c.s, c.e), `${c.block} ${c.s}-${c.e}`).toBe(c.out);
  });
});
