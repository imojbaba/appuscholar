import { describe, it, expect } from "vitest";
import { QUAL_PALETTE, qualNextColor, qualDescendantIds, qualDeleteCascade, qualPassageText, qualBuildMarkdown } from "../../src/qual";
import type { QualCode, QualPassage } from "../../src/qual";
import type { QualFx } from "./qual/capture";
import { readFixture } from "./harness/fixture";

/**
 * The qualitative-coding model (qual.ts) against v1's page (`golden:capture qual`, qual/capture.ts): QUAL_PALETTE against tables.json; qualNextColor against qualNextColor() with 0..12
 * codes stored; qualDescendantIds against v1's per code; qualDeleteCascade's confirm text against what qualDeleteCode handed `confirm` (null where v1 never asked) and its codes against
 * appu_qual_codes after v1 deleted with `confirm` returning true; qualPassageText over every tagged span's textContent against qualFindPassages' texts; qualBuildMarkdown, with
 * `passagesOf` built from v1's qualFindPassages per code, against qualBuildMarkdown() by toBe.
 */

const fx = readFixture<QualFx>("qual", "cases");
const tables = readFixture<{ tables: { QUAL_PALETTE: string[] } }>("qual", "tables").tables;

describe("qual: QUAL_PALETTE and qualNextColor (6186, 6189)", () => {
  it("QUAL_PALETTE is v1's", () => {
    expect(QUAL_PALETTE as unknown).toEqual(tables.QUAL_PALETTE);
  });
  for (const c of fx.nextColor) {
    it(`${c.count} codes`, () => {
      expect(qualNextColor(c.count)).toBe(c.color);
    });
  }
});

for (const c of fx.cases) {
  const codes = c.codes as QualCode[];
  describe(`qual: ${c.id}`, () => {
    it("qualDescendantIds (6205-6209)", () => {
      for (const [id, want] of Object.entries(c.descendants)) expect(qualDescendantIds(id, codes)).toEqual(want);
    });
    it("qualDeleteCascade (6235-6244)", () => {
      for (const d of c.deletes) {
        const out = qualDeleteCascade(codes, d.id);
        if (d.confirm === null) {
          expect(out).toBeNull();
          continue;
        }
        expect(out).not.toBeNull();
        expect(out!.confirm).toBe(d.confirm);
        expect(out!.codes).toEqual(d.after);
        expect(out!.removed).toEqual(c.descendants[d.id]);
      }
    });
    it("qualPassageText (6294-6295)", () => {
      for (const [id, raws] of Object.entries(c.raws)) {
        const texts = raws.map((r) => qualPassageText(r.raw)).filter((t): t is string => t !== null);
        expect(texts).toEqual(c.passages[id]!.map((p) => p.text));
      }
      expect(qualPassageText("")).toBeNull();
      expect(qualPassageText(" \n\t ")).toBeNull();
    });
    it("qualBuildMarkdown (6311-6325)", () => {
      const passagesOf = (id: string): QualPassage[] => c.passages[id] ?? [];
      expect(qualBuildMarkdown(codes, passagesOf)).toBe(c.markdown);
    });
  });
}
