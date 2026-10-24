import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { statsParseText, statsSplitLine } from "../../src/intake";
import type { ParsedData } from "../../src/intake";
import { SPLIT_IDS } from "./intake/capture";
import { expectGolden, goldenMode } from "./harness/compare";
import { readFixture } from "./harness/fixture";

/**
 * intake.ts (v1 9348-9371, statsSplitLine and statsParseText) against v1 running. Every expected value is read from test/golden/intake/cases.json (`golden:capture intake`), which holds,
 * for each entry of the hand-written intake/corpus.json, v1's statsParseText(text), and v1's statsSplitLine over the lines of the entries in SPLIT_IDS with a comma and a tab.
 * What is typed here is what the brief spells out: the ids the corpus must hold (the parser shapes of register rows F17, F3 and D-W2-2) and its minimum size.
 */

type Case = { id: string; text: string; out: ParsedData | null };
type Split = { line: string; delim: string; out: string[] };

const fx = readFixture<{ cases: Case[]; split: Split[] }>("intake", "cases");
const mode = goldenMode(fx);
const corpus = JSON.parse(readFileSync(new URL("./intake/corpus.json", import.meta.url), "utf8")) as Array<{ id: string; text: string }>;

const REQUIRED = [
  "tab-delimited", "comma", "semicolon-one-column", "crlf", "lone-cr", "blank-lines-skipped", "quoted-comma", "doubled-quote", "unterminated-quote", "trailing-spaces-trimmed",
  "wrong-field-count-rows-dropped", "blank-header-col3", "numeric-dot5", "numeric-exponent", "numeric-plus", "decimal-comma", "unicode-minus", "space-in-number", "negative-and-decimals",
  "empty-cells-not-counted", "all-empty-column-categorical", "hindi-header-and-values", "header-only", "empty-text", "whitespace-only", "ones-and-twos-numeric", "tab-wins-over-comma",
];

describe("intake.ts is v1's statsSplitLine and statsParseText", () => {
  it("the corpus holds the brief's ids, 30 entries or more, and the fixture was captured from exactly this corpus", () => {
    for (const id of REQUIRED) expect(corpus.some((e) => e.id === id), id).toBe(true);
    expect(corpus.length).toBeGreaterThanOrEqual(30);
    expect(fx.cases.map((c) => ({ id: c.id, text: c.text }))).toEqual(corpus);
  });
  it("the corpus holds the Review Focus 5 shapes", () => {
    for (const id of ["semicolon-one-column", "wrong-field-count-rows-dropped", "numeric-dot5", "numeric-exponent", "numeric-plus", "decimal-comma", "unicode-minus", "space-in-number", "quoted-comma", "crlf", "lone-cr", "blank-header-col3", "ones-and-twos-numeric"])
      expect(fx.cases.some((c) => c.id === id), id).toBe(true);
  });
  for (const c of fx.cases) it(c.id, () => expectGolden(statsParseText(c.text), c.out, mode, c.id));
  it("the split cases are every line of the brief's three entries, with a comma and a tab", () => {
    const lines = SPLIT_IDS.flatMap((id) => corpus.find((e) => e.id === id)!.text.split(/\r\n|\r|\n/));
    expect(fx.split.map((s) => [s.line, s.delim])).toEqual(lines.flatMap((l) => [[l, ","], [l, "\t"]]));
  });
  for (const c of fx.split) it(`statsSplitLine(${JSON.stringify(c.line)}, ${JSON.stringify(c.delim)})`, () => expect(statsSplitLine(c.line, c.delim)).toEqual(c.out));
});
