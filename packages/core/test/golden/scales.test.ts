import { describe, it, expect } from "vitest";
import { SCALES, SL_PENDING, slById, slVarNames, slText, slCodebookRows, slCodebookCsv, slScore, slBand, slGuessColumns, slScoreData } from "../../src/scales";
import type { Scale } from "../../src/scales";
import { statsParseText } from "../../src/intake";
import type { ScalesFx } from "./scales/capture";
import { expectGolden, goldenMode } from "./harness/compare";
import { readFixture } from "./harness/fixture";

/**
 * The scale library (scales.ts) against v1's page (`golden:capture scales`, scales/capture.ts): SCALES and SL_PENDING byte-equal to v1's (JSON.stringify against tables.json); slVarNames,
 * slText, the codebook's file name and CSV, slScore and slBand against v1's direct calls; slGuessColumns against the selects slScoreOpen marked; slScoreData against slScoreRun on v1's
 * page: `message` is #slScoreOut's innerHTML, `csv` what v1 put back into #statsPaste, `headers` and `rows` that CSV's table, `alpha` what v1's stkAlpha returned (expectGolden), `mean`
 * and `sd` v1's own line 11507 over the valid totals.
 */

const fx = readFixture<ScalesFx>("scales", "cases");
const tables = readFixture<{ tables: { SCALES: unknown; SL_PENDING: string } }>("scales", "tables").tables;
const mode = goldenMode(fx);
const sc = (id: string): Scale => { const x = slById(id); if (!x) throw new Error(`no scale ${id}`); return x; };

describe("scales: tables (11394-11419)", () => {
  it("SCALES is v1's, byte for byte", () => {
    expect(JSON.stringify(SCALES)).toBe(JSON.stringify(tables.SCALES));
  });
  it("every item string is v1's", () => {
    const want = tables.SCALES as Array<{ id: string; items: string[] }>;
    expect(SCALES.map((x) => x.id)).toEqual(want.map((x) => x.id));
    SCALES.forEach((x, i) => { x.items.forEach((t, j) => expect(t).toBe(want[i]!.items[j])); expect(x.items).toHaveLength(want[i]!.items.length); });
  });
  it("SL_PENDING is v1's", () => {
    expect(SL_PENDING).toBe(tables.SL_PENDING);
  });
  it("slById finds RSES and SWLS and nothing else", () => {
    expect(slById("RSES")?.short).toBe("RSES");
    expect(slById("SWLS")?.short).toBe("SWLS");
    expect(slById("PHQ9")).toBeUndefined();
  });
});

describe("scales: slVarNames, slText, the codebook (11426-11432, 11450-11455)", () => {
  for (const x of SCALES) {
    it(x.id, () => {
      expect(slVarNames(x)).toEqual(fx.varNames[x.id]);
      const t = fx.text[x.id]!;
      expect(slText(x)).toBe(t.plain);
      expect(slText(x, true)).toBe(t.credit);
      expect(slText(x, false)).toBe(t.none);
      const cb = fx.codebook[x.id]!;
      expect(slCodebookCsv(x)).toEqual({ name: cb.name, csv: cb.text });
      expect(slCodebookRows(x)).toHaveLength(x.items.length);
    });
  }
});

describe("scales: slScore (11456-11468)", () => {
  it("covers both scales, both RSES codings and eight matrices each", () => {
    expect(fx.score).toHaveLength(24);
  });
  for (const c of fx.score) {
    it(c.id, () => {
      const x = sc(c.scale);
      expect(slScore(x, c.mat, x.codings[c.coding]!)).toEqual(c.out);
    });
  }
});

describe("scales: slBand (11469)", () => {
  for (const c of fx.band) {
    it(`${c.scale} ${String(c.t)}`, () => {
      expect(slBand(sc(c.scale), c.t)).toBe(c.band);
    });
  }
});

describe("scales: slGuessColumns and slScoreData against slScoreOpen and slScoreRun (11470-11512)", () => {
  it("covers both scales, the three guesses, both refusals, the no-row messages and the alpha guard", () => {
    expect(new Set(fx.runs.map((r) => r.scale))).toEqual(new Set(["RSES", "SWLS"]));
    expect(fx.runs.filter((r) => r.paste === r.csv)).toHaveLength(5);
    expect(fx.runs.some((r) => r.alpha === null && r.paste !== r.csv)).toBe(true);
  });
  for (const r of fx.runs) {
    it(r.id, () => {
      const x = sc(r.scale);
      const data = statsParseText(r.csv);
      expect(data).not.toBeNull();
      expect({ headers: data!.headers, rows: data!.rows }).toEqual(r.data);
      expect(slGuessColumns(x, data!.headers)).toEqual(r.guess);
      const out = slScoreData(x, data!, r.idx, x.codings[r.coding]!);
      expect(out.message).toBe(r.html);
      if (r.paste === r.csv) {
        expect(out.ok).toBe(false);
        expect(r.html).toBe(r.text); // v1 wrote textContent: the same string as its innerHTML
        return;
      }
      if (!out.ok) throw new Error("slScoreData refused a run v1 scored");
      expect(out.csv).toBe(r.paste);
      const back = statsParseText(r.paste)!;
      expect(out.headers).toEqual(back.headers);
      expect(out.rows).toEqual(back.rows);
      expect(out.cT).toBe(r.html.match(/^Added <b>([^<]+)<\/b>/)![1]);
      expect(out.valid.length).toBe(Number(r.html.match(/Scored (\d+) of/)![1]));
      expectGolden(out.alpha, r.alpha, mode, "alpha");
      expectGolden(out.mean, r.mean!, mode, "mean");
      expectGolden(out.sd, r.sd!, mode, "sd");
    });
  }
});
