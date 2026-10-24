import { describe, it, expect } from "vitest";
import { aiuDate, aiuJoin, aiuInRange, aiuBuild } from "../../src/aiustatement";
import type { AiuEntry } from "../../src/aiustatement";
import { PROVIDERS } from "../../src/providers";
import type { AiuCase } from "./aiustatement/capture";
import { readFixture } from "./harness/fixture";

/**
 * The AI-use statement builder (aiustatement.ts) against v1's page (`golden:capture aiustatement`, aiustatement/capture.ts): aiuDate and aiuJoin are direct calls; aiuInRange is held to
 * the list v1's aiuInRange returned for #aiuFrom and #aiuTo; aiuBuild gets that list, the ticked rows, the raw #aiuOther, #aiuFmt, the five checkboxes and the style profile's three
 * values, and Wave 0's PROVIDERS for the provider names, and is held by toBe to #aiuOut.value, or to the toast when v1 refused. The log's kinds and groups are v1's own (AIU_RULES).
 */

type Fx = { log: AiuEntry[]; date: Array<{ in: string; out: string }>; join: Array<{ in: string[]; out: string }>; range: Array<{ from: string; to: string; list: AiuEntry[] }>; cases: AiuCase[] };
const fx = readFixture<Fx>("aiustatement", "cases");

/** Every sentence arm of aiuBuild 5492-5536 (the capture names the ones each case reaches). */
const ARMS = [
  "refuse-one", "refuse-many", "none-used", "none-used-journal", "head-course", "head-thesis", "head-journal", "first", "first-journal", "when-on", "when-between", "pair-no-model",
  "pair-unknown-provider", "group-text", "group-feedback", "group-explain", "group-other", "other-outside", "other-only", "other-trailing-stripped", "ticks-4", "ticks-5",
  "ticks-journal-4", "ticks-journal-5", "style-samples", "style-one-sample", "say-which-passages", "thesis-count", "thesis-count-one", "close", "close-journal",
];

describe("aiustatement: aiuDate and aiuJoin (5462-5463)", () => {
  for (const c of fx.date) it(`aiuDate ${JSON.stringify(c.in)}`, () => expect(aiuDate(c.in)).toBe(c.out));
  it("aiuDate of undefined is '' (String(d||''))", () => expect(aiuDate(undefined)).toBe(""));
  for (const c of fx.join) it(`aiuJoin of ${c.in.length}`, () => expect(aiuJoin(c.in)).toBe(c.out));
});

describe("aiustatement: aiuInRange (5464-5467)", () => {
  for (const r of fx.range) it(`${JSON.stringify(r.from)} to ${JSON.stringify(r.to)}`, () => expect(aiuInRange(fx.log, r.from, r.to)).toEqual(r.list));
});

describe("aiustatement: aiuBuild (5492-5537)", () => {
  it("the cases reach every sentence arm", () => {
    const seen = new Set(fx.cases.flatMap((c) => c.arms));
    expect([...seen].sort()).toEqual([...ARMS].sort());
    expect(fx.cases).toHaveLength(158);
  });
  for (const c of fx.cases) {
    it(c.id, () => {
      const list = aiuInRange(fx.log, c.input.from, c.input.to);
      expect(list).toEqual(c.list);
      const keep: Record<string, 1> = {};
      for (const k of c.keep) keep[k] = 1;
      const r = aiuBuild({ list, keep, other: c.input.other, fmt: c.input.fmt, ticks: c.input.ticks, style: c.input.style, providers: PROVIDERS });
      if (c.out === null) expect(r).toEqual({ refuse: c.toast });
      else {
        if (!("text" in r)) throw new Error(`refused: ${r.refuse}`);
        expect(r.text).toBe(c.out);
      }
    });
  }
});
