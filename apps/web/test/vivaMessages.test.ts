import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import base from "../messages/en.json";
import en from "../messages/tools/viva.en.json";
import hi from "../messages/tools/viva.hi.json";

/* The Viva tab's own copy (Task E4): new keys all start viva_ and none repeats a v1 key (a repeat throws at load); no emoji, no em-dash; the module is on in the form the registry reads. */
const E = en as Record<string, string>;
const H = hi as Record<string, string>;
const B = base as Record<string, string>;
const keys = (d: Record<string, string>) => Object.keys(d).filter((k) => !k.startsWith("$"));

describe("viva.en.json", () => {
  it("has the panel's new keys, each starting viva_ and none already in en.json", () => {
    expect(keys(E).length).toBeGreaterThan(5);
    for (const k of keys(E)) { expect(k.startsWith("viva_"), k).toBe(true); expect(B[k], k).toBeUndefined(); }
  });
  it("has no emoji and no em-dash", () => {
    for (const [k, v] of Object.entries(E)) { expect(v, k).not.toMatch(/\p{Extended_Pictographic}/u); expect(v, k).not.toContain("—"); }
  });
  it("says the question is practice, never added to the document, and that nothing in the answer box is AI", () => {
    expect(E.viva_label).toMatch(/practice/);
    expect(E.viva_label).toMatch(/never added to your document/);
    expect(E.viva_intro).toMatch(/no AI help in the answer box/);
  });
  it("the v1 keys the panel reuses are all in en.json, without emoji", () => {
    for (const k of ["viva_aud", "viva_aud_conf", "viva_aud_viva", "viva_get", "viva_another", "viva_ph", "viva_save", "viva_empty", "viva_need", "viva_count"]) {
      expect(B[k], k).toBeTruthy();
      expect(B[k], k).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});

describe("viva.hi.json", () => {
  it("carries the DRAFT marker and exactly the English file's keys", () => {
    expect(H.$draft).toMatch(/^DRAFT: Hindi for Dr\. Sharma's review, reviewed by: /);
    expect(keys(H).sort()).toEqual(keys(E).sort());
  });
  it("keeps every {placeholder} its English text has", () => {
    for (const k of keys(E)) expect((H[k]!.match(/\{\w+\}/g) ?? []).sort(), k).toEqual((E[k]!.match(/\{\w+\}/g) ?? []).sort());
  });
});

describe("the module", () => {
  it("is turned on in the exact form the registry reads", () => {
    const src = readFileSync(join(__dirname, "../components/tools/viva/index.ts"), "utf8");
    expect(src).toContain("export const built = true;");
    expect(src).toContain('export { Panel } from "./Panel";');
  });
});
