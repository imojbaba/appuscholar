import { describe, it, expect } from "vitest";
import { PW_INFO, POWER_FOOTER_NOTE, pwArt, pwNum, powerCompute, simulatorParse, simulatorCompute, simulatorHtml } from "../../src/power";
import type { PowerInput } from "../../src/power";
import type { StatsBlock } from "../../src/stats-core";
import type { PowerCase, PowerFooter, SimCase } from "./power/capture";
import { blockAsText, decodeText } from "./stats/render";
import { expectGolden, goldenMode } from "./harness/compare";
import { readFixture } from "./harness/fixture";

/**
 * The power calculator and the power simulator (power.ts) against v1's page (`golden:capture power`, power/capture.ts): every expected string and number is what v1 showed or computed.
 * A calculator case is the raw field strings; its blocks are held to #pwOut's by text and by cell (stats/render.ts's blockAsText and decodeText, as the stats tests hold #statsResults) and
 * also as HTML, its sentence and its error by toBe, its values (v1's own pwSolveN, pwPower and pwSolveEffect returns, and the integers v1 printed) by expectGolden. A simulator case is
 * parsed by simulatorParse (plRun 9009) and run by simulatorCompute; its svg, banner and warning by toBe, simulatorHtml by toBe against the whole string v1 assigned to #plOut, its paragraphs by toEqual, window._plLast by expectGolden (register row D-W1-16:
 * the seeded draws go through Math.log, Math.cos and Math.sqrt).
 */

type Fx = { cases: PowerCase[]; footer: PowerFooter; sim: SimCase[] };
const fx = readFixture<Fx>("power", "cases");
const mode = goldenMode(fx);
const tables = readFixture<{ tables: { PW_INFO: unknown } }>("power", "tables");

const cells = (b: StatsBlock): unknown => (b.kind === "table" ? b.rows.map((r) => r.map(decodeText)) : b.kind === "list" ? b.items.map(decodeText) : blockAsText(b));

describe("power: tables and helpers", () => {
  it("PW_INFO is v1's, emitted", () => {
    expect(PW_INFO as unknown).toEqual(tables.tables.PW_INFO);
  });
  it("POWER_FOOTER_NOTE is the static footer v1 writes under every result (13527-13529)", () => {
    expect([POWER_FOOTER_NOTE.methods, POWER_FOOTER_NOTE.caveat]).toEqual(fx.footer.notes);
    expect(POWER_FOOTER_NOTE.copy).toBe(fx.footer.button);
  });
  it("pwArt: 'a' before one and u, 'an' before another vowel, 'a' otherwise (13479)", () => {
    expect(["one-way ANOVA", "One", "u-test", "independent-samples t-test", "Anova", "paired-samples t-test", "correlation"].map(pwArt)).toEqual(["a", "a", "a", "an", "an", "a", "a"]);
  });
  it("pwNum: parseFloat after one comma becomes a point and the ends are trimmed (13480)", () => {
    expect(pwNum("0,05")).toBe(0.05);
    expect(pwNum(" 0.25 ")).toBe(0.25);
    expect(pwNum("1,5,3")).toBe(1.5);
    expect(pwNum("abc")).toBeNaN();
    expect(pwNum("")).toBeNaN();
  });
});

describe("power: the calculator against v1's page", () => {
  it("the fixture covers 7 tests x 3 modes with results, and every error string of pwRun", () => {
    const seen = new Set(fx.cases.filter((c) => c.error === null).map((c) => `${c.input.test}/${c.input.mode}`));
    expect(seen.size).toBe(21);
    expect(new Set(fx.cases.map((c) => c.error).filter((e) => e !== null))).toEqual(new Set([
      "Alpha must be between 0 and .5 (usually .05).", "Dropout must be below 90%.", "Give 3 to 20 groups. For two groups use the independent-samples t-test.",
      "Give 1 to 50 predictors.", "Give the degrees of freedom, 1 to 100.", "The effect size must be above zero.", "r must be below 1.",
      "Power must be between .50 and .9999 (usually .80).", "That effect is so small that the sample would exceed 200,000. Check the effect size.",
      "Give the sample size (3 or more).", "That sample is too small for this test and design.", "No effect in the usual range reaches that power with this sample.",
    ]));
  });
  for (const c of fx.cases) {
    it(c.id, () => {
      const r = powerCompute(c.input as PowerInput);
      if (c.error !== null) {
        expect(r).toEqual({ ok: false, error: c.error });
        return;
      }
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.blocks.map((b) => b.kind)).toEqual(c.blocks.map((b) => b.kind));
      r.blocks.forEach((b, i) => {
        expectGolden(blockAsText(b), blockAsText(c.blocks[i]!), mode, `${c.id} block ${i}`);
        expectGolden(cells(b), cells(c.blocks[i]!), mode, `${c.id} block ${i} cells`);
      });
      expect(r.blocks).toEqual(c.blocks);
      expect(r.sentence).toBe(c.sentence);
      expectGolden(r.values, c.values, mode, `${c.id} values`);
    });
  }
});

describe("power: v1 behaviour on the register", () => {
  it("D-W2-20: the mode n note reads For a before every test name", () => {
    const r = powerCompute({ test: "ind", mode: "n", alpha: "0.05", tails: "2", drop: "0", effect: "0.5", n: "30", power: "0.80", k: "3", p: "3", df: "1" });
    expect(r.ok && r.blocks[1]).toEqual({ kind: "note", html: "For a independent-samples t-test (two-tailed, α = .05, d = 0.50) the power at this size is .80." });
    expect(r.ok && r.sentence.startsWith("An a priori power analysis for an independent-samples t-test")).toBe(true);
  });
  it("D-W2-21: significant studies that all went the wrong way print an average of NaN", () => {
    const c = fx.sim.find((x) => x.id === "d0.1-n5-k100-seed5-few-sig")!;
    const r = simulatorCompute(0.1, 5, 100, 5);
    expect(r.ok && r.sig.length).toBe(2);
    expect(r.ok && r.pos.length).toBe(0);
    expect(r.ok && r.texts[2]).toBe("Among the studies that did reach p &lt; .05, the average observed d was <b>NaN</b>. The truth is 0.1. With this much power the successful studies sit close to the truth.");
    expect(c.texts[2]).toBe(r.ok ? r.texts[2] : "");
    expect(c.last!.meanSig).toBeNaN();
  });
});

describe("power: the simulator against v1's page", () => {
  it("the fixture has both warnings, a seed of 0 that runs as seed 1, a run where no study reaches p < .05 and one where at least one does", () => {
    expect(new Set(fx.sim.map((c) => c.warn).filter((w) => w !== null))).toEqual(new Set(["Choose a true effect size d between 0.1 and 2.", "Choose between 5 and 2000 people per group."]));
    expect(fx.sim.find((c) => c.input.seed === "0")?.last?.seed).toBe(1);
    expect(fx.sim.some((c) => c.last?.sig === 0)).toBe(true);
    expect(fx.sim.some((c) => (c.last?.sig ?? 0) > 0)).toBe(true);
  });
  for (const c of fx.sim) {
    it(c.id, () => {
      const p = simulatorParse(c.input);
      const r = simulatorCompute(p.d, p.n, p.k, p.seed);
      if (c.warn !== null) {
        expect(r).toEqual({ ok: false, warn: c.warn });
        expect(simulatorHtml(r)).toBe(c.html);
        return;
      }
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.banner).toBe(c.banner);
      expect(r.svg).toBe(c.svg);
      expect(r.texts).toEqual(c.texts);
      expectGolden(r.last, c.last!, mode, `${c.id} last`);
      expect(simulatorHtml(r)).toBe(c.html);
      expect(r.sig.length).toBe(c.last!.sig);
      expect(r.rate).toBe(Math.round(100 * r.sig.length / p.k));
      expect(r.bins.reduce((s, b) => s + b.s + b.u, 0)).toBe(p.k);
      expect(r.bins.reduce((s, b) => s + b.s, 0)).toBe(r.sig.length);
    });
  }
});
