import { describe, it, expect } from "vitest";
import { expectGolden } from "./harness/compare";
import { decodeSpecial } from "./harness/fixture";

/** The golden comparer (harness/compare.ts, register row D-W1-16) on values typed here: what it lets through, and what it stops, with the JSON path it names. */
const passes = (actual: unknown, expected: unknown) => expect(() => expectGolden(actual, expected)).not.toThrow();
const fails = (actual: unknown, expected: unknown, path = "$") => expect(() => expectGolden(actual, expected)).toThrow(`${path} `);
const p = 0.043804214450706896; // t(21) = 2.15's pHi as the fixture holds it

describe("expectGolden: computed numbers within a relative 1e-12, everything else exact", () => {
  it("a relative difference of 1e-13 passes, one of 1e-11 fails", () => {
    passes(p * (1 + 1e-13), p);
    passes(p * (1 - 1e-13), p);
    fails(p * (1 + 1e-11), p);
    fails(p * (1 - 1e-11), p);
  });
  it("the numbers CI on Node 22 x64 computed for the darwin arm64 fixtures pass (3, 5, 3 and 14 ULP)", () => {
    passes(0.043804214450706876, p);
    passes(0.004630139782909709, 0.004630139782909705);
    passes(0.0469030554839327, 0.04690305548393272);
    passes(0.0000035044982100522786, 0.0000035044982100522727);
  });
  it("an integer off by one fails, however large; a number that is not an integer on both sides is held to the tolerance", () => {
    fails(4, 3);
    fails(2 ** 52 + 1, 2 ** 52); // a relative 2.2e-16, but both are integers
    passes(1 - 2 ** -53, 1);
  });
  it("a string off by one character fails, and booleans, null and undefined are exact", () => {
    fails("t(21) = 2.15, p = .048", "t(21) = 2.15, p = .043");
    fails("nc_c_round", "nc_c_typo");
    fails(true, false);
    fails(null, 0);
    fails(undefined, null);
    fails("0.5", 0.5);
  });
  it("NaN vs NaN passes; NaN, ±Infinity and −0 are compared by Object.is", () => {
    passes(NaN, NaN);
    passes(Infinity, Infinity);
    passes(-0, -0);
    fails(NaN, 0);
    fails(-0, 0);
    fails(0, -0);
    fails(Infinity, Number.MAX_VALUE);
    fails(-Infinity, Infinity);
  });
  it("0 vs 1e-301 passes, 0 vs 1e-299 fails: the absolute floor is 1e-300", () => {
    passes(0, 1e-301);
    passes(1e-301, 0);
    fails(0, 1e-299);
    fails(1e-299, 0);
  });
  it("a missing key fails, and so does an extra one; a key whose value is undefined counts as absent, as it does in a fixture", () => {
    fails({ status: "ok" }, { status: "ok", note: "" });
    fails({ status: "ok", note: "", pcalc: 0.5 }, { status: "ok", note: "" });
    passes({ status: "ok", note: "", pcalc: undefined }, { status: "ok", note: "" });
  });
  it("arrays must have the same length; the rules reach every level and the failure names the path", () => {
    fails([1, 2], [1, 2, 3]);
    passes({ judged: [{ status: "ok", pHi: p * (1 + 1e-13) }] }, { judged: [{ status: "ok", pHi: p }] });
    fails({ judged: [{ status: "ok", pHi: p * (1 + 1e-11) }] }, { judged: [{ status: "ok", pHi: p }] }, "$.judged[0].pHi");
    fails({ judged: [{ status: "warn", pHi: p }] }, { judged: [{ status: "ok", pHi: p }] }, "$.judged[0].status");
  });
  it("a fixture's special numbers, decoded, meet the port's; an object that is not plain fails", () => {
    passes([NaN, -0, Infinity, -Infinity], decodeSpecial([{ $n: "NaN" }, { $n: "-0" }, { $n: "Infinity" }, { $n: "-Infinity" }]));
    class Judged { status = "ok"; }
    fails(new Judged(), { status: "ok" });
  });
  it("the message names the case, the path and the reason", () => {
    expect(() => expectGolden({ pHi: p * (1 + 1e-11) }, { pHi: p }, "t-round-edge[0]")).toThrow(/^t-round-edge\[0\]: \$\.pHi differs by 1\.0e-11 relative, more than 1e-12$/);
    expect(() => expectGolden([3], [4], "counts")).toThrow(/^counts: \$\[0\] differs \(two integers are compared exactly\)$/);
    expect(() => expectGolden<unknown>({ a: 1 }, { b: 1 })).toThrow(/^\$ lacks the fixture's b; has a, which the fixture lacks$/);
  });
});
