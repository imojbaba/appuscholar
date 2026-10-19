import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
  it("NaN meets NaN; −0 and 0 differ, as do 0 and 1e-301, 0 and 5e-14, and a p of 7.5e-5 and 5e-14 more; strings and structure as in the tolerant mode", () => {
    passes(NaN, NaN, "exact");
    fails(-0, 0, "$", "exact");
    fails(1e-301, 0, "$", "exact");
    fails(5e-14, 0, "$", "exact");
    fails(7.518906336889675e-5 + 5e-14, 7.518906336889675e-5, "$", "exact");
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

describe("tolerant mode, anywhere else: computed numbers within a relative 1e-12 or an absolute 1e-13, everything else exact", () => {
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
  it("a complement probability may also differ by an absolute 1e-13: 5e-14 off a p of 7.5e-5 (6.7e-10 relative) passes, 5e-13 off fails", () => {
    const tail = 7.518906336889675e-5; // stkGamesHowell's p at 9264, 1 - stkPtukey, as the darwin arm64 fixture holds it
    passes(tail + 5e-14, tail);
    passes(tail - 5e-14, tail);
    passes(tail + 3.5e-15, tail); // what CI run 39261262089 on Node 22 x64 computed: 4.6e-11 relative
    fails(tail + 5e-13, tail);
    fails(tail - 5e-13, tail);
  });
  it("an exact zero (F5) meets a number within 1e-13 and nothing larger: 0 vs 5e-14 passes, 0 vs 5e-13 fails", () => {
    passes(0, 5e-14);
    passes(5e-14, 0);
    passes(1.1102230246251565e-16, 0); // 1 - betai one step below 1
    fails(0, 5e-13);
    fails(5e-13, 0);
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

// The golden-exact CI job (.github/workflows/ci.yml) runs this suite on a macOS arm64 runner with Node 26, the capture platform, with GOLDEN_EXPECT_MODE=exact. The headers of the
// committed fixtures are read here (every test/golden/<engine>/*.json whose top level names node, platform and arch), the mode this machine holds each in is printed, and when the
// variable is set the test fails unless every fixture is held in that mode, so a runner image change, a Node major bump or a fixture captured elsewhere does not quietly fall back
// to the 1e-12 tolerance.
const GOLDEN_DIR = fileURLToPath(new URL("./", import.meta.url));
function fixtureHeaders(): Array<{ file: string } & GoldenPlatform> {
  const out: Array<{ file: string } & GoldenPlatform> = [];
  for (const dir of readdirSync(GOLDEN_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory() || dir.name === "harness") continue;
    for (const name of readdirSync(resolve(GOLDEN_DIR, dir.name))) {
      if (!name.endsWith(".json")) continue;
      const top = JSON.parse(readFileSync(resolve(GOLDEN_DIR, dir.name, name), "utf8")) as Record<string, unknown>;
      if (typeof top.node === "string" && typeof top.platform === "string" && typeof top.arch === "string")
        out.push({ file: `${dir.name}/${name}`, node: top.node, platform: top.platform, arch: top.arch });
    }
  }
  return out;
}
const thisMachine = `${process.version} ${process.platform} ${process.arch}`;
describe("the mode this machine holds every committed fixture in is printed, and is GOLDEN_EXPECT_MODE's when that is set (the golden-exact CI job)", () => {
  it(`GOLDEN_EXPECT_MODE=${process.env.GOLDEN_EXPECT_MODE ?? "(unset)"}`, () => {
    const headers = fixtureHeaders();
    expect(headers.length, "no fixture header found under test/golden").toBeGreaterThan(0);
    const files = new Map<string, string[]>();
    for (const h of headers) {
      const key = `${goldenMode(h)} mode (captured on ${h.node} ${h.platform} ${h.arch})`;
      files.set(key, [...(files.get(key) ?? []), h.file]);
    }
    const summary = [...files].map(([key, names]) => `${names.length} fixture${names.length === 1 ? "" : "s"} in ${key}`).join("; ");
    console.log(`golden mode on this machine (${thisMachine}): ${summary}`);
    const want = process.env.GOLDEN_EXPECT_MODE;
    if (want === undefined || want === "") return;
    expect(["exact", "tolerant"], `GOLDEN_EXPECT_MODE is "${want}"; it must be exact or tolerant`).toContain(want);
    const wrong = headers.filter((h) => goldenMode(h) !== want).map((h) => `${h.file} (captured on ${h.node} ${h.platform} ${h.arch})`);
    expect(wrong, `GOLDEN_EXPECT_MODE=${want}, but this machine (${thisMachine}) does not hold these fixtures in ${want} mode`).toEqual([]);
  });
});
