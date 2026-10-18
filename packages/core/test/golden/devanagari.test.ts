import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { DEVANAGARI_RUN, DEVANAGARI_STRING, RANGES, decodeEscapes } from "./citation/capture";
import { readFixture } from "./harness/fixture";

/**
 * Content copied, never retyped (spec §5.4; rulings R5, R8, R9): every Devanagari string literal in packages/core/src (data/ included) must be one of v1's, byte for byte, and every Devanagari
 * string in the v1 line ranges core has ported must be in core. citation/devanagari.json holds v1's strings, read from the ranges listed in citation/capture.ts (RANGES), which each task that
 * ports a range extends. Both sides are read with the same pattern and compared as values, with JavaScript escapes decoded (R9); none of today's strings holds an escape.
 * The third assertion is for what a quoted-string pattern cannot see (ruling T8-T9): the same two-way check on every maximal run of Devanagari code points anywhere, a regex literal (the cross-check's
 * heading pattern, v1 12109) or a comment included, so a retyped word cannot hide outside a string.
 */

const fx = readFixture<{ ranges: Array<[number, number]>; strings: string[]; runs: string[] }>("citation", "devanagari");
const root = new URL("../../src/", import.meta.url);
const srcFiles = readdirSync(root, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".ts")).map((f) => readFileSync(new URL(f, root), "utf8"));
const coreStrings = srcFiles.flatMap((f) => [...f.matchAll(DEVANAGARI_STRING)].map((m) => decodeEscapes(m[1]!)));
const coreRuns = srcFiles.flatMap((f) => f.match(DEVANAGARI_RUN) ?? []);

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
  it("every maximal run of Devanagari code points anywhere in core, regex literals and comments included, is one of v1's runs, and every run of v1's ported ranges is in core", () => {
    expect(fx.runs.length).toBeGreaterThan(0);
    for (const r of coreRuns) expect(fx.runs.includes(r), `core has the run ${r}, which v1's ported ranges do not`).toBe(true);
    for (const r of fx.runs) expect(coreRuns.includes(r), `v1's run ${r} is not in core`).toBe(true);
  });
});
