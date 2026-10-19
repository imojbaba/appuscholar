import { describe, it, expect } from "vitest";
import { expectGolden, expectSvgGolden, goldenMode } from "./harness/compare";
import type { GoldenMode, GoldenPlatform } from "./harness/compare";
import { decodeSpecial, readFixture } from "./harness/fixture";

/** The golden comparer (harness/compare.ts, register row D-W1-16) on values typed here: what each mode lets through and what it stops, with the JSON path it names. */
const passes = (actual: unknown, expected: unknown, mode: GoldenMode = "tolerant") => expect(() => expectGolden(actual, expected, mode)).not.toThrow();
const fails = (actual: unknown, expected: unknown, path = "$", mode: GoldenMode = "tolerant") => expect(() => expectGolden(actual, expected, mode)).toThrow(`${path} `);
const p = 0.043804214450706896; // t(21) = 2.15's pHi as the fixture holds it
/** The next double above a positive x, through its bits: one ULP up. */
const ulpUp = (x: number): number => {
  const f = new Float64Array([x]);
  const bits = new BigUint64Array(f.buffer);
  bits[0] = bits[0]! + 1n;
  return f[0]!;
};

describe("goldenMode: exact where the fixture was captured (Node major version, platform, architecture), tolerant anywhere else", () => {
  const mac: GoldenPlatform = { node: "v26.9.0", platform: "darwin", arch: "arm64" };
  it("the same Node major version, platform and architecture is exact, whatever the minor and patch release", () => {
    expect(goldenMode(mac, mac)).toBe("exact");
    expect(goldenMode(mac, { ...mac, node: "v26.11.2" })).toBe("exact");
  });
  it("another Node major version, platform or architecture is tolerant", () => {
    expect(goldenMode(mac, { ...mac, node: "v22.20.0" })).toBe("tolerant");
    expect(goldenMode(mac, { ...mac, node: "v2.9.0" })).toBe("tolerant");
    expect(goldenMode(mac, { ...mac, platform: "linux" })).toBe("tolerant");
    expect(goldenMode(mac, { ...mac, arch: "x64" })).toBe("tolerant");
    expect(goldenMode(mac, { node: "v22.20.0", platform: "linux", arch: "x64" })).toBe("tolerant");
  });
  it("by default it compares the header with this process", () => {
    expect(goldenMode({ node: process.version, platform: process.platform, arch: process.arch })).toBe("exact");
    expect(goldenMode({ node: "v0.0.0", platform: process.platform, arch: process.arch })).toBe("tolerant");
  });
  it("a header without node, platform or arch is refused", () => {
    expect(() => goldenMode({ node: "v26.9.0", platform: "darwin" } as GoldenPlatform)).toThrow("the fixture header has no arch");
  });
});

describe("exact mode, on the capturing platform: every number by Object.is", () => {
  it("a value one ULP away is rejected, and so is each pair CI computed", () => {
    expect(ulpUp(p) - p).toBe(2 ** -57); // one ULP of a number between 2^-5 and 2^-4
    passes(p, p, "exact");
    fails(ulpUp(p), p, "$", "exact");
    fails(0.043804214450706876, p, "$", "exact");
    fails(0.004630139782909709, 0.004630139782909705, "$", "exact");
    fails(0.0469030554839327, 0.04690305548393272, "$", "exact");
    fails(0.0000035044982100522786, 0.0000035044982100522727, "$", "exact");
  });
  it("NaN meets NaN; −0 and 0 differ, as do 0 and 1e-301; strings and structure as in the tolerant mode", () => {
    passes(NaN, NaN, "exact");
    fails(-0, 0, "$", "exact");
    fails(1e-301, 0, "$", "exact");
    passes({ judged: [{ status: "ok", note: "", pHi: p }] }, { judged: [{ status: "ok", note: "", pHi: p }] }, "exact");
    fails({ judged: [{ status: "ok", note: "", pHi: ulpUp(p) }] }, { judged: [{ status: "ok", note: "", pHi: p }] }, "$.judged[0].pHi", "exact");
    fails({ judged: [{ status: "warn", note: "", pHi: p }] }, { judged: [{ status: "ok", note: "", pHi: p }] }, "$.judged[0].status", "exact");
    fails({ status: "ok" }, { status: "ok", note: "" }, "$", "exact");
  });
  it("an integer off by one and a string off by one character are rejected", () => {
    fails(4, 3, "$", "exact");
    fails("t(21) = 2.15, p = .048", "t(21) = 2.15, p = .043", "$", "exact");
  });
  it("the message names the mode's rule", () => {
    expect(() => expectGolden([ulpUp(p)], [p], "exact", "t-round-edge")).toThrow(/^t-round-edge: \$\[0\] differs \(exact on the capturing platform: Object\.is\)$/);
  });
});

describe("tolerant mode, anywhere else: computed numbers within a relative 1e-12, everything else exact", () => {
  it("a value one ULP away is accepted; a relative difference of 1e-13 passes, one of 1e-11 fails", () => {
    passes(ulpUp(p), p);
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
  it("0 vs 1e-301 passes, 0 vs 1e-299 fails: the absolute floor is 1e-300, so an exact zero (F5) stays exact", () => {
    passes(0, 1e-301);
    passes(1e-301, 0);
    fails(0, 1e-299);
    fails(1e-299, 0);
    fails(1.1102230246251565e-16, 0); // 1 - betai one step below 1
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
    expect(() => expectGolden({ pHi: p * (1 + 1e-11) }, { pHi: p }, "tolerant", "t-round-edge[0]")).toThrow(/^t-round-edge\[0\]: \$\.pHi differs by 1\.0e-11 relative, more than 1e-12$/);
    expect(() => expectGolden([3], [4], "tolerant", "counts")).toThrow(/^counts: \$\[0\] differs \(two integers are compared exactly\)$/);
    expect(() => expectGolden<unknown>({ a: 1 }, { b: 1 }, "tolerant")).toThrow(/^\$ lacks the fixture's b; has a, which the fixture lacks$/);
  });
});

// The branch this machine takes for the committed fixtures, named in the title; either branch asserts with the mode goldenMode chose.
const fx = readFixture<{ cases: Array<{ fn: string; args: number[]; out: number }> }>("pvalue", "cases");
const here = goldenMode(fx);
const value = fx.cases.find((c) => !Number.isInteger(c.out) && c.out > 0)!.out;
describe(`this machine (${process.version} ${process.platform} ${process.arch}) holds the committed fixtures (captured on ${fx.node} ${fx.platform} ${fx.arch}) in ${here} mode`, () => {
  if (here === "exact") it("exact branch: a fixture value one ULP away is rejected", () => fails(ulpUp(value), value, "$", here));
  else it("tolerant branch: a fixture value one ULP away is accepted, one 1e-11 away rejected", () => {
    passes(ulpUp(value), value, here);
    fails(value * (1 + 1e-11), value, "$", here);
  });
});

// Both branches on every machine, whichever this one takes above: a header from another platform (every field differs from this process) and this process's own header.
const elsewhere: GoldenPlatform = {
  node: process.version.split(".")[0] === "v22" ? "v26.0.0" : "v22.0.0",
  platform: process.platform === "linux" ? "darwin" : "linux",
  arch: process.arch === "x64" ? "arm64" : "x64",
};
describe("both branches on every machine, from forced headers, on the same fixture value", () => {
  it(`a header from elsewhere (${elsewhere.node} ${elsewhere.platform} ${elsewhere.arch}) gives the tolerant branch: one ULP away is accepted, 1e-11 away rejected`, () => {
    const mode = goldenMode(elsewhere);
    expect(mode).toBe("tolerant");
    passes(ulpUp(value), value, mode);
    fails(value * (1 + 1e-11), value, "$", mode);
  });
  it(`this process's own header (${process.version} ${process.platform} ${process.arch}) gives the exact branch: one ULP away is rejected`, () => {
    const mode = goldenMode({ node: process.version, platform: process.platform, arch: process.arch });
    expect(mode).toBe("exact");
    fails(ulpUp(value), value, "$", mode);
    passes(value, value, mode);
  });
});

describe("expectSvgGolden: an SVG string exact where the fixture was captured, number-tolerant at 1e-12 elsewhere (D-W1-16, register row D-W2-23)", () => {
  // its numbers, as SVG_NUMBER splits them: 0, 0, 640, 420, the 1 of x1, x, the 1 of y1, y, the 2, 78 and 6 of the colour, 1.5, -12.5, 1e-7, 8
  const svg = (y: number, x = 64) => `<svg viewBox="0 0 640 420"><line x1="${x}" y1="${y}" stroke="#2a78d6" stroke-width="1.5"/><text x="-12.5" y="1e-7">n = 8</text></svg>`;
  const y = 313.3333333333333;
  it("exact mode passes the same string and rejects a one-ULP change of a raw coordinate", () => {
    expect(() => expectSvgGolden(svg(y), svg(y), "exact")).not.toThrow();
    expect(() => expectSvgGolden(svg(ulpUp(y)), svg(y), "exact")).toThrow();
  });
  it("tolerant mode accepts a 1e-13 relative change and a one-ULP change of a raw coordinate", () => {
    expect(() => expectSvgGolden(svg(y * (1 + 1e-13)), svg(y), "tolerant")).not.toThrow();
    expect(() => expectSvgGolden(svg(ulpUp(y)), svg(y), "tolerant")).not.toThrow();
  });
  it("tolerant mode rejects a 1e-9 relative change, an integer that moved, a skeleton change and a missing number", () => {
    expect(() => expectSvgGolden(svg(y * (1 + 1e-9)), svg(y), "tolerant", "chart")).toThrow("chart: number 7 differs by");
    expect(() => expectSvgGolden(svg(y, 65), svg(y), "tolerant")).toThrow("number 5 differs (two integers are compared exactly)");
    expect(() => expectSvgGolden(svg(y).replace("stroke-width", "stroke-wide"), svg(y), "tolerant")).toThrow("the text around the numbers differs");
    expect(() => expectSvgGolden(svg(y).replace(' y="1e-7"', ""), svg(y), "tolerant")).toThrow("the text around the numbers differs");
    expect(() => expectSvgGolden(svg(y) + "7", svg(y) + "", "tolerant")).toThrow();
  });
});
