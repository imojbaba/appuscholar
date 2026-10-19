import { describe, it, expect } from "vitest";
import { chartParseLines, vennNum, vennSvg } from "../../src/quickchart";
import type { ParseCase, VennCase } from "./quickchart/capture";
import { readFixture } from "./harness/fixture";

/**
 * The Quick chart dialog (quickchart.ts) against v1 (`golden:capture quickchart`, quickchart/capture.ts): chartParseLines' rows by toEqual against v1's own call on #chartData, the Venn
 * SVG by toBe against the `<svg…</svg>` vennGenerate put into _chartMakerPendingHTML.
 */

const fx = readFixture<{ parse: ParseCase[]; venn: VennCase[] }>("quickchart", "cases");

describe("quickchart: chartParseLines against v1", () => {
  for (const c of fx.parse) it(c.id, () => { expect(chartParseLines(c.text)).toEqual(c.rows); });
});

describe("quickchart: the Venn diagram against v1", () => {
  it("covers 2-set and 3-set diagrams", () => {
    expect(fx.venn.filter((v) => v.svg.includes('viewBox="0 0 420 260"')).length).toBeGreaterThan(0);
    expect(fx.venn.filter((v) => v.svg.includes('viewBox="0 0 420 320"')).length).toBeGreaterThan(0);
  });
  for (const c of fx.venn) it(c.id, () => { expect(vennSvg(c.input)).toBe(c.svg); });
  it("vennNum: parseFloat, and 0 for NaN or a negative (4899)", () => {
    expect(["18", "-3", "abc", "", "1.5", "2.50", "1e2", " 7 ", "7abc", "-0", ".25"].map(vennNum)).toEqual([18, 0, 0, 0, 1.5, 2.5, 100, 7, 7, -0, 0.25]);
  });
});
