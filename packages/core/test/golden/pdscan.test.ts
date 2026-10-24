import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { statsParseText } from "../../src/intake";
import type { ParsedData } from "../../src/intake";
import { PD_DEFAULT, PD_HDR, PD_LABEL, pdScan, pdTestVal, pdTransform } from "../../src/pdscan";
import type { PdKind } from "../../src/pdscan";
import { VALUES } from "./pdscan/capture";
import { expectGolden, goldenMode } from "./harness/compare";
import { readFixture } from "./harness/fixture";

/**
 * pdscan.ts (v1 9411-9460: PD_HDR, PD_LABEL, PD_DEFAULT, pdTestVal, pdScan; 9464-9486: pdTransform) against v1 running. Every expected value is read from
 * test/golden/pdscan/cases.json (`golden:capture pdscan`), which holds, for each table of the hand-written pdscan/corpus.json, v1's statsParseText of it, v1's pdScan of that and, when the
 * entry has choices, v1's pdTransform; v1's pdTestVal over the grid of pdscan/capture.ts (VALUES); and v1's PD_LABEL, PD_DEFAULT and PD_HDR (each regex as its source and flags).
 * What is typed here is what the brief spells out: the ids the corpus must hold, its minimum size and the grid's minimum of 12 values per kind.
 */

type Choices = Record<number, "keep" | "remove" | "code">;
type Case = { id: string; text: string; choices?: Choices; data: ParsedData; scan: ReturnType<typeof pdScan>; transform?: ReturnType<typeof pdTransform> };
type Value = { kind: PdKind; v: string; out: boolean };
type Tables = { PD_HDR: Array<{ kind: PdKind; source: string; flags: string }>; PD_LABEL: Record<PdKind, string>; PD_DEFAULT: Record<PdKind, string> };

const fx = readFixture<{ cases: Case[]; values: Value[]; tables: Tables }>("pdscan", "cases");
const mode = goldenMode(fx);
const corpus = JSON.parse(readFileSync(new URL("./pdscan/corpus.json", import.meta.url), "utf8")) as Array<{ id: string; text: string; choices?: Choices }>;

const REQUIRED = [
  "email-values", "phone-values-91", "phone-values-spaced", "aadhaar-values", "pan-values", "dob-dmy", "dob-ymd", "dob-out-of-range-years", "name-values-uniq", "name-values-low-uniq",
  "heading-name", "heading-naam-devanagari", "heading-name-excluded-word", "heading-name-low-uniq-skipped", "heading-roll", "heading-address", "heading-govid", "heading-dob",
  "heading-email-spaced", "free-text-long", "free-text-one-long", "numeric-first-value-not-free-text", "values-beat-heading", "mixed-table", "transform-code-first",
  "transform-remove-only", "transform-keep-all",
];
const TEST_VALS = ["+91 98765-43210", "ABCDE1234F", "12/31/2001", "2001-13-01", "Asha Verma", "asha", "A. B. Sharma"];

describe("pdscan.ts is v1's pdScan and pdTransform", () => {
  it("the corpus holds the brief's ids, 20 tables or more, and the fixture was captured from exactly this corpus", () => {
    for (const id of REQUIRED) expect(corpus.some((e) => e.id === id), id).toBe(true);
    expect(corpus.length).toBeGreaterThanOrEqual(20);
    expect(fx.cases.map((c) => (c.choices === undefined ? { id: c.id, text: c.text } : { id: c.id, text: c.text, choices: c.choices }))).toEqual(corpus);
    for (const id of ["transform-code-first", "transform-remove-only", "transform-keep-all"]) expect(fx.cases.find((c) => c.id === id)!.transform, id).toBeDefined();
  });
  for (const c of fx.cases) it(c.id, () => {
    const data = statsParseText(c.text);
    expectGolden(data, c.data, mode, `${c.id} data`);
    expectGolden(pdScan(data!), c.scan, mode, `${c.id} scan`);
    if (c.choices !== undefined) expectGolden(pdTransform(data!, c.choices), c.transform!, mode, `${c.id} transform`);
  });
  it("the pdTestVal grid has 12 values or more for every kind of PD_HDR, and the brief's values", () => {
    for (const { kind } of fx.tables.PD_HDR) expect(fx.values.filter((v) => v.kind === kind).length, kind).toBeGreaterThanOrEqual(12);
    for (const v of TEST_VALS) expect(fx.values.some((x) => x.v === v), v).toBe(true);
    expect(fx.values.map(({ kind, v }) => ({ kind, v }))).toEqual(fx.tables.PD_HDR.flatMap(({ kind }) => VALUES[kind]!.map((v) => ({ kind, v }))));
  });
  for (const c of fx.values) it(`pdTestVal(${c.kind}, ${JSON.stringify(c.v)})`, () => expect(pdTestVal(c.kind, c.v)).toBe(c.out));
  it("PD_HDR has v1's kinds in v1's order, each regex with v1's source and flags", () => {
    expect(PD_HDR.map(([kind, re]) => ({ kind, source: re.source, flags: re.flags }))).toEqual(fx.tables.PD_HDR);
  });
  it("PD_LABEL and PD_DEFAULT equal v1's", () => {
    expect(PD_LABEL).toEqual(fx.tables.PD_LABEL);
    expect(PD_DEFAULT).toEqual(fx.tables.PD_DEFAULT);
  });
});
