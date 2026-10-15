import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { needsTerms, TERMS_DATE, TERMS_SINCE, TERMS_VERSION } from "@/lib/terms";
import { tFormat } from "@/lib/i18n";
import { OVERRIDES, applyOverrides } from "../scripts/i18n-overrides.mjs";
import en from "../messages/en.json";
import v1Snapshot from "./fixtures/v1-i18n-snapshot.json";
import hi from "../messages/hi.json";

const me = (termsAcceptedAt: string | null) => ({ termsAcceptedAt });

describe("needsTerms (the first-use gate)", () => {
  it("asks a user who never accepted", () => {
    expect(needsTerms(me(null), TERMS_SINCE)).toBe(true);
  });
  it("asks again when the acceptance is older than the current terms", () => {
    expect(needsTerms(me("2026-10-14T23:59:59Z"), TERMS_SINCE)).toBe(true);
    expect(needsTerms(me("2026-10-08T10:00:00.000Z"), TERMS_SINCE)).toBe(true);
  });
  it("does not ask when the acceptance is at or after the current terms", () => {
    expect(needsTerms(me(TERMS_SINCE), TERMS_SINCE)).toBe(false);
    expect(needsTerms(me("2026-10-16T08:30:00.000Z"), TERMS_SINCE)).toBe(false);
  });
  it("does not gate before /me has loaded", () => {
    expect(needsTerms(null, TERMS_SINCE)).toBe(false);
  });
  it("treats an unreadable date as not accepted", () => {
    expect(needsTerms(me("not a date"), TERMS_SINCE)).toBe(true);
  });
  it("does not loop for an acceptance made on a clock one day behind TERMS_DATE", () => {
    const dayBefore = new Date(Date.parse(TERMS_DATE + " UTC") - 24 * 3600 * 1000).toISOString();
    expect(needsTerms(me(dayBefore), TERMS_SINCE)).toBe(false);
  });
  it("prints the version line from the constants", () => {
    expect(TERMS_VERSION).toBe(2);
    expect(tFormat(en, hi, "terms_ver", "en", { version: TERMS_VERSION, date: TERMS_DATE })).toBe("Version 2, 16 October 2026.");
  });
});

describe("v2 terms wording overrides", () => {
  const KEYS = ["faq_a_key", "faq_a_lost", "terms_d1", "terms_d2", "terms_d3", "terms_d4", "terms_ver", "welcome_intro"];
  it("overrides exactly the eight keys, leaving every other key alone", () => {
    expect(Object.keys(OVERRIDES).sort()).toEqual(KEYS);
    expect(Object.keys(v1Snapshot).sort()).toEqual(KEYS);
    const v1 = { ...en, ...v1Snapshot } as Record<string, string>;
    const out = applyOverrides(v1);
    const changed = Object.keys(out).filter((k) => out[k] !== v1[k]).sort();
    expect(changed).toEqual(KEYS);
    expect(Object.keys(out)).toEqual(Object.keys(v1));
  });
  it("turns the snapshot of the original v1 values into the committed en.json values", () => {
    const out = applyOverrides({ ...en, ...v1Snapshot } as Record<string, string>);
    for (const k of KEYS) expect(out[k]).toBe((en as Record<string, string>)[k]);
    expect(out).toEqual(en);
  });
  it("refuses to override a key the extraction does not have", () => {
    expect(() => applyOverrides({ terms_d1: "x" })).toThrow();
  });
  it("is what en.json holds, with the version line from lib/terms", () => {
    for (const k of KEYS) expect((en as Record<string, string>)[k]).toBe(OVERRIDES[k as keyof typeof OVERRIDES]);
    expect(en.terms_ver).toBe("Version {version}, {date}.");
  });
  const SET = process.env.V1_INDEX_HTML;
  const V1 = SET ?? "/Users/poojadudani/Documents/Claude cowork/Scholarly/appuscholer/index.html";
  it.skipIf(!SET && !existsSync(V1))("re-running the extraction against v1 reproduces the committed dictionaries", () => {
    if (!existsSync(V1)) throw new Error(`V1_INDEX_HTML is set but the file is missing: ${V1}`);
    const out = mkdtempSync(join(tmpdir(), "i18n-"));
    execFileSync("node", [join(__dirname, "../scripts/extract-v1-i18n.mjs"), V1, out], { stdio: "pipe" });
    expect(JSON.parse(readFileSync(join(out, "en.json"), "utf8"))).toEqual(en);
    expect(JSON.parse(readFileSync(join(out, "hi.json"), "utf8"))).toEqual(hi);
  });
});
