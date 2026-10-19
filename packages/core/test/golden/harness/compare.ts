import { expect } from "vitest";
import { isPlainObject } from "./fixture";
import type { FixtureHeader } from "./fixture";

/**
 * How a golden test holds a port's output to its fixture (register row D-W1-16). A number computed through Math.exp or Math.log is engine-exact only on the engine that computed it: V8 on
 * arm64 (whose libm is FMA-contracted) and V8 on x64 land a few ULP apart for some arguments (CI run 39172854113 on Node 22 x64 missed the fixtures captured on darwin arm64 by 3 to 14 ULP,
 * at most 1.7e-15 relative). So the comparison has two modes, which goldenMode reads off the fixture's header:
 * - "exact" where the fixture was captured (the header's Node major version, platform and architecture are this process's): every number by Object.is, as it was before D-W1-16;
 * - "tolerant" anywhere else (CI on Node 22 linux x64): two numbers that are not both integers agree when |a − e| ≤ max(1e-12 × max(|a|, |e|), 1e-13). The relative 1e-12 admits the
 *   engines' drift and cannot see a port change smaller than 1e-12 relative (a reordered exponent sum in betai moved 57 of 117 pFromT points by up to 1.4e-13, which it accepts), so
 *   exactness is the capturing platform's guard and CI guards the other engines within 1e-12. The absolute 1e-13 is for complement probabilities: a p computed as 1 − CDF (1 − betai,
 *   register F5a; 1 − stkPtukey at 9264 and 12714, D-W2-17) carries the CDF's absolute drift, and a CDF near 1 that drifts by tens of ULP of 1 leaves a small tail with a large relative
 *   error (CI run 39261262089 on Node 22 x64: stkGamesHowell's p of 7.5e-5 missed the darwin arm64 fixture by 3.5e-15, 4.6e-11 relative). It replaces a 1e-300 floor that let an exact
 *   zero meet only a number of at most 1e-300; off the capture platform an exact zero (F5) now meets anything within 1e-13, the same cancellation, and exact mode still holds it exactly.
 * In both modes, recursively through the fixture's objects and arrays:
 * - two integers (Number.isInteger on both sides) must be equal, as must strings, booleans, null and undefined (a status or a note is a string);
 * - NaN, ±Infinity and −0 are compared by Object.is (a fixture writes them as {"$n": …} and readFixture decodes them);
 * - objects must be plain and have the same keys (a key whose value is undefined counts as absent, since encodeSpecial drops it from a fixture), arrays the same length.
 */
const RELATIVE = 1e-12;
const ABSOLUTE = 1e-13;

export type GoldenMode = "exact" | "tolerant";
export type GoldenPlatform = Pick<FixtureHeader, "node" | "platform" | "arch">;
export type GoldenDiff = { path: string; actual: unknown; expected: unknown; why: string };

const THIS_PROCESS: GoldenPlatform = { node: process.version, platform: process.platform, arch: process.arch };
const major = (version: string) => version.split(".")[0];

/** "exact" when `here` (this process unless given) is where the fixture was captured: the header's Node major version ("v26" of "v26.9.0"), platform and architecture; "tolerant" otherwise. */
export function goldenMode(header: GoldenPlatform, here: GoldenPlatform = THIS_PROCESS): GoldenMode {
  for (const k of ["node", "platform", "arch"] as const)
    if (typeof header[k] !== "string" || header[k] === "") throw new Error(`goldenMode: the fixture header has no ${k}; re-capture the fixture (golden:capture)`);
  return major(header.node) === major(here.node) && header.platform === here.platform && header.arch === here.arch ? "exact" : "tolerant";
}

function numberWhy(a: number, e: number, mode: GoldenMode): string | null {
  if (mode === "exact") return Object.is(a, e) ? null : "differs (exact on the capturing platform: Object.is)";
  if (!Number.isFinite(a) || !Number.isFinite(e) || Object.is(a, -0) || Object.is(e, -0)) return Object.is(a, e) ? null : "differs (NaN, ±Infinity and −0 are compared by Object.is)";
  if (Number.isInteger(a) && Number.isInteger(e)) return a === e ? null : "differs (two integers are compared exactly)";
  const off = Math.abs(a - e), scale = Math.max(Math.abs(a), Math.abs(e));
  return off <= Math.max(RELATIVE * scale, ABSOLUTE) ? null : `differs by ${(off / scale).toPrecision(2)} relative, more than ${RELATIVE}`;
}

const definedKeys = (o: Record<string, unknown>) => Object.keys(o).filter((k) => o[k] !== undefined);

/** The first place where `actual` breaks the rules above against `expected`, with its JSON path from `$`; null when it keeps them all. */
export function goldenDiff(actual: unknown, expected: unknown, mode: GoldenMode, path = "$"): GoldenDiff | null {
  const at = (why: string): GoldenDiff => ({ path, actual, expected, why });
  if (typeof actual === "number" && typeof expected === "number") {
    const why = numberWhy(actual, expected, mode);
    return why === null ? null : at(why);
  }
  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) return at(`has ${actual.length} items, the fixture ${expected.length}`);
    for (let i = 0; i < expected.length; i++) {
      const d = goldenDiff(actual[i], expected[i], mode, `${path}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  if (isPlainObject(actual) && isPlainObject(expected)) {
    const have = definedKeys(actual), want = definedKeys(expected);
    const missing = want.filter((k) => !have.includes(k)), extra = have.filter((k) => !want.includes(k));
    if (missing.length > 0 || extra.length > 0)
      return at([missing.length > 0 ? `lacks the fixture's ${missing.join(", ")}` : "", extra.length > 0 ? `has ${extra.join(", ")}, which the fixture lacks` : ""].filter(Boolean).join("; "));
    for (const k of want) {
      const d = goldenDiff(actual[k], expected[k], mode, `${path}.${k}`);
      if (d) return d;
    }
    return null;
  }
  if (Object.is(actual, expected)) return null;
  return at(typeof actual === "object" && actual !== null && !Array.isArray(actual) && !isPlainObject(actual) ? "is not a plain object" : "differs");
}

/**
 * Asserts that `actual`, a port's output, keeps the rules above against `expected`, its fixture value, in `mode` (goldenMode of that fixture). On a break it fails with `label`, the path and
 * the reason, and vitest prints the two values at that path and their diff.
 */
export function expectGolden<T>(actual: T, expected: NoInfer<T>, mode: GoldenMode, label?: string): void {
  const d = goldenDiff(actual, expected, mode);
  if (d !== null) expect.fail(d.actual, d.expected, `${label === undefined ? "" : `${label}: `}${d.path} ${d.why}`);
}

/** A number as an SVG or HTML string prints one: an optional minus, digits with an optional fraction (or a bare fraction), an optional exponent. */
const SVG_NUMBER = /-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/g;

/**
 * Asserts that `actual`, an SVG (or HTML) string a port built by concatenating raw doubles, equals `expected`, the string v1 built, under D-W1-16 (register row D-W2-23):
 * - "exact": the two strings are equal (toBe), as on the platform that captured the fixture;
 * - "tolerant": both strings are split on SVG_NUMBER; the text between the numbers (the skeleton) must be identical, the two must print as many numbers, and each pair is held to
 *   goldenDiff's number rule (two integers exactly, otherwise within 1e-12 relative or 1e-13 absolute; NaN, ±Infinity and −0 by Object.is). Digits inside a hex colour or a
 *   name are numbers to the split too, and both sides split them the same way, so they are compared as equal integers.
 * On a break it fails with `label`, the index of the number or the skeleton piece, and the two values.
 */
export function expectSvgGolden(actual: string, expected: string, mode: GoldenMode, label?: string): void {
  const at = label === undefined ? "" : `${label}: `;
  if (mode === "exact") {
    expect(actual, label).toBe(expected);
    return;
  }
  const nums = (s: string) => (s.match(SVG_NUMBER) ?? []).map(Number);
  const skeleton = (s: string) => s.split(SVG_NUMBER);
  const sa = skeleton(actual), se = skeleton(expected);
  for (let i = 0; i < Math.max(sa.length, se.length); i++)
    if (sa[i] !== se[i]) expect.fail(sa[i], se[i], `${at}the text around the numbers differs at piece ${i}: ${JSON.stringify(sa[i])} against ${JSON.stringify(se[i])}`);
  const na = nums(actual), ne = nums(expected);
  if (na.length !== ne.length) expect.fail(na.length, ne.length, `${at}prints ${na.length} numbers, the fixture ${ne.length}`);
  for (let i = 0; i < ne.length; i++) {
    const d = goldenDiff(na[i], ne[i], mode, `number ${i}`);
    if (d !== null) expect.fail(d.actual, d.expected, `${at}${d.path} ${d.why}`);
  }
}
