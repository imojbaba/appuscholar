import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { rsFoldIndex, rsParseTerms, rsSortResults } from "../../src/research";
import type { RsPaper } from "../../src/research";
import { readFixture } from "./harness/fixture";

/**
 * research.ts's Task 9 additions against v1 running: rsParseTerms (the related terms rsSuggestTerms, 8251-8263, keeps of the AI's reply, 8257-8258), rsSortResults (the four orders of rsApplySort,
 * 8356-8362) and rsFoldIndex (rsRenderResults' fold, 8402-8403). Every expected value is read from test/golden/rspanel/cases.json (`golden:capture rspanel`), captured by driving rsSuggestTerms with
 * each reply and rsApplySort over research/inputs.json's papers. Typed here: only guards that the inputs reach each branch.
 */
type TermRun = { id: string; topic: string; reply: string; out: string[]; allTicked: boolean; none: boolean };
type SortRun = { ids: number[]; mode: string; order: number[]; fold: number };
const fx = readFixture<{ terms: TermRun[]; sorts: SortRun[] }>("rspanel", "cases");
const { papers } = JSON.parse(readFileSync(new URL("./research/inputs.json", import.meta.url), "utf8")) as { papers: RsPaper[] };

describe("rsParseTerms is v1's related-terms parse", () => {
  it("the fixture reaches each branch: terms kept, cut to 8, duplicates by case, the topic dropped, no terms", () => {
    expect(fx.terms.some((r) => r.out.length === 8)).toBe(true);
    expect(fx.terms.some((r) => r.none && r.out.length === 0)).toBe(true);
    expect(fx.terms.find((r) => r.id === "case-duplicates")!.out).toEqual(["Teacher Burnout", "emotional exhaustion"]);
    expect(fx.terms.every((r) => r.allTicked)).toBe(true);
  });

  it("equals v1's RS_TERMS.terms for every reply (v1 trims the topic first, 8252)", () => {
    for (const r of fx.terms) expect(rsParseTerms(r.reply, r.topic.trim()), r.id).toEqual(r.out);
  });
});

describe("rsSortResults and rsFoldIndex are v1's orders and fold", () => {
  it("the fixture reaches each branch: every mode, a reordering, a fold, a fit list with no fold", () => {
    for (const m of ["relevance", "citations", "year", "fit"]) expect(fx.sorts.some((s) => s.mode === m && s.order.some((k, i) => k !== i))).toBe(m !== "relevance");
    expect(fx.sorts.some((s) => s.fold > 0)).toBe(true);
    expect(fx.sorts.some((s) => s.mode === "fit" && s.fold === -1)).toBe(true);
  });

  it("equals v1's rsResults order and the rendered fold for every list and mode", () => {
    for (const s of fx.sorts) {
      const list = s.ids.map((i) => papers[i]!);
      const sorted = rsSortResults(list, s.mode);
      expect(sorted.map((p) => list.indexOf(p)), `${s.ids} ${s.mode}`).toEqual(s.order);
      const f = rsFoldIndex(sorted, s.mode);
      expect(f > 0 ? f : -1, `${s.ids} ${s.mode} fold`).toBe(s.fold);
    }
  });

  it("does not reorder the list it is given", () => {
    const list = papers.slice();
    rsSortResults(list, "citations");
    expect(list).toEqual(papers);
  });
});
