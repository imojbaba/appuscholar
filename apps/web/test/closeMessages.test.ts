import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../messages/tools/close.en.json";
import hi from "../messages/tools/close.hi.json";

/* The Closeness tab's own copy (Task E2, rule 8): it says "close to", never "copied", and a zero result is never called safe, clean, original or ok. */
const E = en as Record<string, string>;
const H = hi as Record<string, string>;
const keys = (d: Record<string, string>) => Object.keys(d).filter((k) => !k.startsWith("$"));

describe("close.en.json", () => {
  it("has the panel's keys, each starting close_", () => {
    expect(keys(E).length).toBeGreaterThan(25);
    for (const k of keys(E)) expect(k.startsWith("close_"), k).toBe(true);
  });
  it("never says copied, copy or copies, and never calls a result safe, clean, original or ok (v1's 'not a clean bill' is the one negated use)", () => {
    for (const [k, v] of Object.entries(E)) {
      expect(v, k).not.toMatch(/\bcop(y|ied|ies|ying)\b/i);
      expect(v, k).not.toMatch(/\bsafe\b|\boriginal\b|\bok\b|\bokay\b/i);
      const clean = v.match(/\bclean\b/gi) ?? [];
      expect(clean.length === 0 || /not a clean bill/.test(v), k).toBe(true);
    }
  });
  it("uses 'close to' for what the check shows and 'reused in new words' for the limit", () => {
    expect(E.close_passage_head).toMatch(/close to/);
    expect(E.close_cannot_body).toMatch(/ideas? reused in new words/);
    expect(E.close_limits).toMatch(/ideas reused in new words/);
  });
  it("keeps v1's sentences for the 30-word and no-source guards and for a result of nothing", () => {
    expect(E.close_need_words).toBe("Write at least about 30 words first");
    expect(E.close_doc_locked).toBe("Your document is locked. Unlock your vault with the pill at the top, then check again.");
    expect(E.close_need_source).toBe("Tick a source, or paste a passage to compare with");
    expect(E.close_none).toBe("No passage of {minRun} words or more matched. That is only about the sources you chose.");
    expect(E.close_limits).toMatch(/A low number is not a clean bill\./);
  });
  it("has no emoji and no em-dash", () => {
    for (const [k, v] of Object.entries(E)) {
      expect(v, k).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(v, k).not.toContain("—");
    }
  });
});

describe("close.hi.json", () => {
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
    const src = readFileSync(join(__dirname, "../components/tools/close/index.ts"), "utf8");
    expect(src).toContain("export const built = true;");
    expect(src).toContain('export { Panel } from "./Panel";');
  });
});
