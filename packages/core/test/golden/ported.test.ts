import { describe, it, expect } from "vitest";
import { accItems, accCheck } from "../../src/accuracy";
import type { AccItems, AccKind } from "../../src/accuracy";
import { scanText, maskText } from "../../src/pd";
import { classifyAiUse } from "../../src/aiuse";
import { provHash, originCount, originShare } from "../../src/origin";
import type { OriginStats } from "../../src/origin";
import { PROVIDERS, PROV_ORDER } from "../../src/providers";
import type { ProviderInfo } from "../../src/providers";
import { readFixture } from "./harness/fixture";

/**
 * The five modules ported by hand in earlier phases, checked against v1's own outputs for the first time (spec §5.8).
 * Every module output below is compared with a value read from test/golden/<module>/cases.json, which `golden:capture` records from v1 running.
 * What is typed in this file is of two kinds. Register pins, which state the register's own claims and check them against the fixture: D-W0-1 (v1's claude model
 * string and its lack of fallbacks, and v2's model and fallback, which are the deviation itself) and D-W0-2 (the two ids that carry v1's browser-call warning, and the warning's shape).
 * Guards that a fixture holds the inputs it exists for: counts, kinds, ids, the shapes with a > inside a quoted attribute, the null v1 returns for the Appu line,
 * and the drop-only pair's branch (`warn` false with `missing` not empty).
 * A mismatch is a bug in the module or a row in docs/superpowers/specs/parity-deviations.md, never an edit to a fixture.
 */

describe("accuracy.ts equals v1's accItems and accCheck", () => {
  const acc = readFixture<{ items: Array<{ id: string; s: string; out: AccItems }>; checks: Array<{ id: string; orig: string; res: string; kind: AccKind; out: ReturnType<typeof accCheck> }> }>("accuracy", "cases");
  it("the fixture holds at least the 12 strings, and the seven pairs in every kind", () => {
    expect(acc.items.length).toBeGreaterThanOrEqual(12);
    expect(new Set(acc.checks.map((c) => c.kind))).toEqual(new Set(["continue", "improve", "expand"]));
    expect(acc.checks.length).toBeGreaterThanOrEqual(21); // the five pairs of accuracy.test.ts, the nine-added pair and the drop-only pair, each in three kinds
  });
  it("the drop-only pair reaches the branch where continue says unchanged although items are missing (v1 2543-2545)", () => {
    const out = acc.checks.find((c) => c.id === "dropped-only/continue")?.out;
    expect(out?.warn).toBe(false);
    expect(out?.missing.length).toBeGreaterThan(0);
    expect(out?.added).toEqual([]);
  });
  for (const c of acc.items) it(`accItems ${c.id}`, () => expect(accItems(c.s)).toEqual(c.out));
  for (const c of acc.checks) it(`accCheck ${c.id}`, () => expect(accCheck(c.orig, c.res, c.kind)).toEqual(c.out));
});

describe("pd.ts equals v1's pdScanText and pdMask", () => {
  type Scan = { counts: Record<string, number>; total: number; sig: string };
  const pd = readFixture<{ cases: Array<{ id: string; text: string; scan: Scan; mask: string }> }>("pd", "cases");
  it("the fixture holds at least the seven strings", () => expect(pd.cases.length).toBeGreaterThanOrEqual(7));
  for (const c of pd.cases) {
    it(`scanText ${c.id}`, () => {
      const got = scanText(c.text);
      expect(got).toEqual(c.scan);
      expect(Object.keys(got.counts)).toEqual(Object.keys(c.scan.counts)); // the dialog lists the kinds in this order
    });
    it(`maskText ${c.id}`, () => expect(maskText(c.text)).toBe(c.mask));
  }
});

describe("aiuse.ts equals v1's aiuClassify", () => {
  const ai = readFixture<{ cases: Array<{ id: string; prompt: string; out: { k: string; g: string } | null }> }>("aiuse", "cases");
  it("the fixture holds the three literals, whatever else the prompts capture added", () => {
    expect(ai.cases.slice(0, 3).map((c) => c.id)).toEqual(["literal-appu-help", "literal-fallback", "literal-continue"]);
    expect(ai.cases[0]?.out).toBeNull(); // v1 does not log the Appu help assistant
  });
  for (const c of ai.cases) it(`classifyAiUse ${c.id}`, () => expect(classifyAiUse(c.prompt)).toEqual(c.out));
});

describe("origin.ts equals v1's provHash, provCountDoc and computeOriginality", () => {
  type Share = { total: number; ai: number; studentPct: number | null; source?: true };
  const og = readFixture<{ hashes: Array<{ s: string; out: string }>; docs: Array<{ id: string; html: string; count: OriginStats; share: Share }> }>("origin", "cases");
  it("the fixture holds the eight strings, the five documents and the three shapes with a > inside a quoted attribute", () => {
    expect(og.hashes.length).toBeGreaterThanOrEqual(8);
    expect(og.docs.length).toBeGreaterThanOrEqual(8);
    const html = (id: string) => og.docs.find((d) => d.id === id)?.html ?? "";
    expect(html("link-title-gt")).toContain('title="x > (Rao, 2019)"');
    expect(html("img-alt-gt")).toContain('alt="p > .05"');
    expect(html("ai-ins-title-gt")).toMatch(/data-h="[^"]+" title="a > b"/);
  });
  og.hashes.forEach((c, i) => it(`provHash #${i} ${JSON.stringify(c.s).slice(0, 30)}`, () => expect(provHash(c.s)).toBe(c.out)));
  for (const d of og.docs) {
    it(`originCount ${d.id}`, () => expect(originCount(d.html)).toEqual(d.count));
    it(`originShare ${d.id}`, () => expect(originShare(d.html)).toEqual(d.share));
  }
  it("every recorded document is a non-source one: originShare has no source branch (D-W0-4)", () => {
    for (const d of og.docs) {
      expect(d.share).not.toHaveProperty("source");
      expect(d.share.studentPct).not.toBeNull();
    }
  });
});

describe("providers.ts equals v1's PROVIDERS and PROV_ORDER", () => {
  type V1Provider = { name: string; short: string; steps: string; model: string; fallbacks?: string[] };
  const pv = readFixture<{ PROVIDERS: Record<string, V1Provider>; PROV_ORDER: string[] }>("providers", "cases");
  const mine = PROVIDERS as Record<string, ProviderInfo | undefined>;
  /** v1's steps end in ` <br><span …>⚠ …</span>` on DeepSeek and OpenAI only; v2 drops it because its calls go through the api (D-W0-2). */
  const WARNING = / ?<br><span[^>]*>⚠[^<]*<\/span>$/;

  it("PROV_ORDER equals v1's and the same providers are defined", () => {
    expect(PROV_ORDER).toEqual(pv.PROV_ORDER);
    expect(Object.keys(PROVIDERS).sort()).toEqual(Object.keys(pv.PROVIDERS).sort());
  });
  it("v1 carries the browser-call warning on deepseek and openai only (D-W0-2)", () => {
    expect(pv.PROV_ORDER.filter((id) => WARNING.test(pv.PROVIDERS[id]?.steps ?? ""))).toEqual(["deepseek", "openai"]);
  });
  for (const id of pv.PROV_ORDER) {
    const v = pv.PROVIDERS[id];
    const p = mine[id];
    it(`${id}: name and short`, () => {
      expect(p).toBeDefined();
      expect(p?.name).toBe(v?.name);
      expect(p?.short).toBe(v?.short);
    });
    it(`${id}: model and fallbacks${id === "claude" ? " (D-W0-1)" : ""}`, () => {
      if (id === "claude") {
        expect(v?.model).toBe("claude-haiku-4-5-20251001"); // v1's value, as the register row records it
        expect(v?.fallbacks).toBeUndefined();
        expect(p?.model).toBe("claude-haiku-5-5");
        expect(p?.fallbacks).toEqual(["claude-haiku-4-5"]);
      } else {
        expect(p?.model).toBe(v?.model);
        expect(p?.fallbacks).toEqual(v?.fallbacks);
      }
    });
    it(`${id}: steps, warning removed, equal stepsHtml (D-W0-2)`, () => {
      expect(p?.stepsHtml).toBe(v?.steps.replace(WARNING, ""));
    });
    // v1 keeps the key prefix and the page where keys are made only inside its steps text; the v2 fields must say what that text says.
    it(`${id}: keyPrefix and keysUrl are the ones v1's steps give`, () => {
      expect(v?.steps).toContain(`(starts with ${p?.keyPrefix})`);
      expect(v?.steps).toContain(`href="${p?.keysUrl}"`);
    });
  }
});
