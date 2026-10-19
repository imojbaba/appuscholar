import { expect } from "vitest";
import { isPlainObject } from "./fixture";
import type { FixtureHeader } from "./fixture";

/**
 * How a golden test holds a port's output to its fixture (register row D-W1-16). A number computed through Math.exp or Math.log is engine-exact only on the engine that computed it: V8 on
 * arm64 (whose libm is FMA-contracted) and V8 on x64 land a few ULP apart for some arguments (CI run 39172854113 on Node 22 x64 missed the fixtures captured on darwin arm64 by 3 to 14 ULP,
 * at most 1.7e-15 relative). So the comparison has two modes, which goldenMode reads off the fixture's header:
 * - "exact" where the fixture was captured (the header's Node major version, platform and architecture are this process's): every number by Object.is, as it was before D-W1-16;
 * - "tolerant" anywhere else (CI on Node 22 linux x64): two numbers that are not both integers agree when |a − e| ≤ max(1e-12 × max(|a|, |e|), 1e-300). The tolerance admits the engines'
 *   drift and cannot see a port change smaller than 1e-12 relative (a reordered exponent sum in betai moved 57 of 117 pFromT points by up to 1.4e-13, which it accepts), so exactness is
 *   the capturing platform's guard and CI guards the other engines within 1e-12. The absolute floor lets a zero meet a number of at most 1e-300 and nothing larger, so an exact zero (F5)
 *   stays exact.
 * In both modes, recursively through the fixture's objects and arrays:
 * - two integers (Number.isInteger on both sides) must be equal, as must strings, booleans, null and undefined (a status or a note is a string);
 * - NaN, ±Infinity and −0 are compared by Object.is (a fixture writes them as {"$n": …} and readFixture decodes them);
 * - objects must be plain and have the same keys (a key whose value is undefined counts as absent, since encodeSpecial drops it from a fixture), arrays the same length.
 */
const RELATIVE = 1e-12;
const FLOOR = 1e-300;

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
  return off <= Math.max(RELATIVE * scale, FLOOR) ? null : `differs by ${(off / scale).toPrecision(2)} relative, more than ${RELATIVE}`;
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
