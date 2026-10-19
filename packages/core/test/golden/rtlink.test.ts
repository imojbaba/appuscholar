import { describe, it, expect } from "vitest";
import { rtHash, rtRunRecord, rtSetRecord, rtFirstP, rtSig, rtFlip, rtScanTags } from "../../src/rtlink";
import type { RtSet } from "../../src/rtlink";
import { statsParseText } from "../../src/intake";
import type { RtFirstPCase, RtFlipCase, RtHashCase, RtScan, RtStep } from "./rtlink/capture";
import { expectGolden, goldenMode } from "./harness/compare";
import { readFixture } from "./harness/fixture";

/**
 * Results-to-data linking (rtlink.ts) against v1's page (`golden:capture rtlink`, rtlink/capture.ts): every expected value is what v1 returned, recorded or stored. rtHash, rtFirstP,
 * rtSig and the flip rule are direct calls; rtRunRecord is held to window._statsRun (what rtCapture recorded after a Statistics Lab run), rtSetRecord to localStorage.appu_statsets after
 * each step (the steps chained in order from no sets, with the step's `now`, the number v1's Date.now returned during that parse), and rtScanTags to rtScan's status, why and when per tag,
 * with v1's `stat-stale` class on exactly the stale tags. Everything here is strings, booleans and integers, compared by toEqual; firstP's v through expectGolden (a parseFloat, exact
 * in both modes).
 */

type Fx = { hash: RtHashCase[]; firstP: RtFirstPCase[]; flip: RtFlipCase[]; steps: RtStep[]; scans: RtScan[] };
const fx = readFixture<Fx>("rtlink", "cases");
const mode = goldenMode(fx);

describe("rtlink: rtHash (9372-9377)", () => {
  it("covers the 13 demo datasets, the intake corpus and the hand-built tables", () => {
    expect(fx.hash.filter((h) => h.source === "demo")).toHaveLength(13);
    expect(fx.hash.filter((h) => h.source === "intake").length).toBeGreaterThan(30);
    expect(fx.hash.filter((h) => h.source === "table")).toHaveLength(4);
  });
  for (const h of fx.hash) {
    it(h.id, () => {
      const data = h.text !== undefined ? statsParseText(h.text) : h.data;
      expect(data).not.toBeNull();
      expect(rtHash(data!)).toBe(h.hash);
    });
  }
  it("a cell holding a separator makes the same string, and the same hash, as a table with more cells (v1's, kept)", () => {
    const one = fx.hash.find((h) => h.id === "table-separator-in-cell-one")!, two = fx.hash.find((h) => h.id === "table-separator-in-cell-two")!;
    expect(one.hash).toBe(two.hash);
  });
});

describe("rtlink: rtFirstP and rtSig (12270-12271)", () => {
  for (const c of fx.firstP) {
    it(JSON.stringify(c.s ?? null) + (c.s === undefined ? " (undefined)" : ""), () => {
      expectGolden(rtFirstP(c.s), c.firstP, mode, "firstP");
      expect(rtSig(c.s)).toBe(c.sig);
    });
  }
});

describe("rtlink: rtFlip (12325's rule)", () => {
  for (const c of fx.flip) {
    it(`${c.old} → ${c.neu}`, () => {
      expect(rtFlip(c.old, c.neu)).toBe(c.flip);
    });
  }
});

describe("rtlink: rtRunRecord (rtCapture 12260-12269) and rtSetRecord (rtRegister 9382-9388), run by run", () => {
  it("covers a select field, an extra, one multi list, two multi lists, binary fields and a skipped parse", () => {
    expect(new Set(fx.steps.map((s) => s.test))).toEqual(new Set(["ttest1", "alpha", "mregress", "mcnemar"]));
    expect(fx.steps.some((s) => s.skip && s.run.hash === null)).toBe(true);
  });
  fx.steps.forEach((s, k) => {
    it(s.id, () => {
      const data = statsParseText(s.csv)!;
      const hash = s.skip ? null : rtHash(data);
      expect(hash).toBe(s.statsHash);
      expect(s.statsDsName).not.toBeNull();
      expect(rtRunRecord(data, s.test, s.form, s.statsDsName!, hash)).toEqual(s.run);
      // the sets after this step: the steps before it chained from none (as v1's page saw them), then this one
      let sets: Record<string, RtSet> = {};
      for (const p of fx.steps.slice(0, k)) if (!p.skip) sets = rtSetRecord(statsParseText(p.csv)!, p.statsDsName!, sets, p.now!);
      if (k > 0) expect(sets).toEqual(fx.steps[k - 1]!.sets);
      if (!s.skip) {
        const before = JSON.stringify(sets);
        const next = rtSetRecord(data, s.statsDsName!, sets, s.now!);
        expect(JSON.stringify(sets)).toBe(before); // pure: the sets passed in are not changed
        sets = next;
      }
      expect(sets).toEqual(s.sets);
    });
  });
});

describe("rtlink: rtScanTags (rtScan 12272-12286)", () => {
  it("the first scan has a current, a stale, a no-set and a no-record tag", () => {
    expect(fx.scans[0]!.out.map((o) => [o.status, o.why])).toEqual([["cur", ""], ["stale", "rt_why_stale"], ["unk", "rt_why_noset"], ["unk", "rt_why_norec"]]);
  });
  for (const sc of fx.scans) {
    it(sc.id, () => {
      const got = rtScanTags(sc.tags.map((id) => ({ id })), sc.runs, sc.sets);
      expect(got).toEqual(sc.out.map((o) => (o.when === undefined ? { id: o.id, status: o.status, why: o.why } : { id: o.id, status: o.status, why: o.why, when: o.when })));
      expect(sc.out.map((o) => o.stale)).toEqual(got.map((g) => g.status === "stale"));
      for (const g of got) expect("when" in g).toBe(g.status === "stale");
    });
  }
});
