import { describe, it, expect } from "vitest";
import { escAttr, escHTML } from "../../src/html";
import { readFixture } from "./harness/fixture";

/**
 * html.ts (v1 2606 escHTML, 8033 escAttr) against v1 running: every expected value is read from test/golden/html/cases.json (`golden:capture html`), `{ fn, args, out }` per call,
 * where `args: []` is a call with no argument (s is undefined). What is typed here is the brief's input list, to check the fixture holds it.
 */

const fx = readFixture<{ cases: Array<{ fn: string; args: unknown[]; out: string }> }>("html", "cases");
const FNS: Record<string, (s?: unknown) => string> = { escHTML, escAttr };

describe("html.ts is v1's escHTML and escAttr", () => {
  for (const c of fx.cases) it(`${c.fn}(${JSON.stringify(c.args).slice(1, -1)})`, () => expect(Reflect.apply(FNS[c.fn]!, undefined, c.args)).toBe(c.out));
  it("both functions are recorded for the brief's inputs: markup with both quotes, null, undefined, 0 and a Devanagari string", () => {
    expect([...new Set(fx.cases.map((c) => c.fn))].sort()).toEqual(Object.keys(FNS).sort());
    for (const fn of Object.keys(FNS)) {
      const args = fx.cases.filter((c) => c.fn === fn).map((c) => c.args);
      expect(args).toEqual(expect.arrayContaining([[`<a href="x">&'"`], [null], [], [0]]));
      expect(args.some((a) => typeof a[0] === "string" && /[ऀ-ॿ]/.test(a[0])), `${fn}: a Devanagari string`).toBe(true);
    }
  });
});
