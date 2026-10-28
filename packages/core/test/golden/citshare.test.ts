import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PSYCH_STARTERS } from "../../src/data/classic-sources";
import * as core from "../../src/index";
import { readFixture } from "./harness/fixture";

/**
 * The classic psychology sources (v1 PSYCH_STARTERS 7976-7982), generated into src/data/classic-sources.ts from v1 running (`golden:capture citshare --emit`), never typed.
 * The rest of test/golden/citshare (the starters' toasts, the quote insert, the bookmarklet and the capture) is the Citation Manager's page code, ported in apps/web/lib/cite
 * and held to these fixtures by apps/web/test/{citeImportExport,citeQuote,capture,citeBib}.test.ts.
 */
type Tables = { tables: { PSYCH_STARTERS: unknown[] } };
const t = readFixture<Tables>("citshare", "tables");
const cases = readFixture<{ sha256: string; starters: Array<{ id: string; toast: string }> }>("citshare", "cases");

describe("the classic psychology sources are v1's", () => {
  it("equal v1's PSYCH_STARTERS, entry for entry and key for key", () => {
    expect(JSON.stringify(PSYCH_STARTERS)).toBe(JSON.stringify(t.tables.PSYCH_STARTERS));
    expect(Object.keys(t.tables)).toEqual(["PSYCH_STARTERS"]);
    expect(PSYCH_STARTERS).toHaveLength(5);
  });
  it("hash to the sha256 the capture took of v1's array", () => {
    expect(createHash("sha256").update(JSON.stringify(PSYCH_STARTERS)).digest("hex")).toBe(cases.sha256);
  });
  it("are the generated file, unedited, and index.ts exports them", () => {
    const src = readFileSync(new URL("../../src/data/classic-sources.ts", import.meta.url), "utf8");
    expect(src.startsWith("// Generated from v1 index.html build")).toBe(true);
    expect(src).toContain(`export const PSYCH_STARTERS = ${JSON.stringify(t.tables.PSYCH_STARTERS, null, 2)} as const;`);
    expect(core.PSYCH_STARTERS).toBe(PSYCH_STARTERS);
  });
  it("the fixture reaches both of psychLoadStarters' toasts", () => {
    expect(cases.starters.map((s) => s.toast)).toContain("5 classic psychology sources added ✓");
    expect(cases.starters.some((s) => s.toast !== "5 classic psychology sources added ✓")).toBe(true);
  });
});
