import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { DEVANAGARI_STRING, RANGES, decodeEscapes } from "./citation/capture";
import { readFixture } from "./harness/fixture";

/**
 * Content copied, never retyped (spec §5.4; rulings R5, R8, R9): every Devanagari string literal in packages/core/src (data/ included) must be one of v1's, byte for byte, and every Devanagari
 * string in the v1 line ranges core has ported must be in core. citation/devanagari.json holds v1's strings, read from the ranges listed in citation/capture.ts (RANGES), which each task that
 * ports a range extends. Both sides are read with the same pattern and compared as values, with JavaScript escapes decoded (R9); none of today's strings holds an escape.
 */

const fx = readFixture<{ ranges: Array<[number, number]>; strings: string[] }>("citation", "devanagari");
const root = new URL("../../src/", import.meta.url);
const srcFiles = readdirSync(root, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".ts")).map((f) => readFileSync(new URL(f, root), "utf8"));
const coreStrings = srcFiles.flatMap((f) => [...f.matchAll(DEVANAGARI_STRING)].map((m) => decodeEscapes(m[1]!)));

describe("Devanagari strings in core are v1's", () => {
  it("the fixture was captured over the ranges citation/capture.ts lists, and holds strings", () => {
    expect(fx.ranges).toEqual(RANGES);
    expect(fx.strings.length).toBeGreaterThan(0);
  });
  it("every Devanagari literal in v1's ported ranges is in core byte-for-byte", () => {
    for (const s of fx.strings) expect(srcFiles.some((f) => f.includes(s)) || coreStrings.includes(s), s).toBe(true);
  });
  it("core has no Devanagari literal that v1's ported ranges do not have (nothing retyped)", () => {
    for (const c of coreStrings) expect(fx.strings.some((s) => s === c || s.includes(c)), c).toBe(true);
  });
});
