import { describe, expect, it } from "vitest";
import wordsEn from "../messages/tools/words.en.json";
import wordsHi from "../messages/tools/words.hi.json";
import en from "../messages/en.json";
import { built, facts } from "../components/tools/words";

const E = wordsEn as Record<string, string>;
const H = wordsHi as Record<string, string>;
const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

describe("Words and grammar's copy", () => {
  it("adds its keys only in the tool file; Hindi is a draft with no key English lacks and the same placeholders", () => {
    for (const k of Object.keys(E)) expect(k in (en as Record<string, string>), k).toBe(false);
    expect(H.$draft).toMatch(/^DRAFT: Hindi for Dr\. Sharma's review, reviewed by: /);
    for (const [k, v] of Object.entries(H)) {
      if (k.startsWith("$")) continue;
      expect(k in E, k).toBe(true);
      expect(placeholders(v), k).toEqual(placeholders(E[k]!));
    }
  });
  it("has no em-dash and no emoji, and says Saved only as the toast", () => {
    for (const [k, v] of Object.entries(E)) {
      expect(v, k).not.toMatch(/—/);
      expect(v, k).not.toMatch(/\p{Extended_Pictographic}/u);
    }
    for (const [k, v] of Object.entries(H)) { expect(v, k).not.toMatch(/—/); expect(v, k).not.toMatch(/\p{Extended_Pictographic}/u); }
    expect(E.wd2_saved).toBe("Saved");
  });
  it("keeps v1's sentences word for word where v1 had them", () => {
    expect(E.wd2_notfound).toBe("No entry for “{w}”. Check the spelling, or try the base form of the word (for example “study” for “studies”).");
    expect(E.wd2_offline).toBe("The dictionary needs the internet. Words you looked up before still work offline.");
    expect(E.wd2_ai_label).toBe("Written by the AI. It can be wrong; check it against the dictionary entry above.");
    expect(E.wd2_ai_unsure).toBe("The AI was not sure of this word. Use the dictionary entry above.");
    expect(E.wd2_dict_footer).toBe("Meanings: Wiktionary (CC BY-SA 4.0), through dictionaryapi.dev. The word you look up is sent to that service.");
    expect(E.wd2_applied).toBe("Applied. Ctrl+Z undoes it.");
    expect(E.wd2_apply_gone).toBe("Could not find those words in your document any more. Edit by hand.");
    expect(E.wd2_gram_desc).toBe("Checks the text you have selected, or the whole document if nothing is selected. The rules are free and instant. The AI check sends the text to your AI provider and reads the first 9,000 characters.");
    expect(E.wd2_nothing_ai).toBe("Nothing found by the rules or the AI. That does not mean the text is perfect.");
  });
  it("is turned on, and its home line counts the word bank", () => {
    expect(built).toBe(true);
    expect(facts({})).toEqual({ started: false });
    expect(facts({ words_bank: { value: [], updatedAt: "" } })).toEqual({ started: false });
    expect(facts({ words_bank: { value: [{ w: "a" }], updatedAt: "" } })).toEqual({ detail: "wd2_fact_one", started: true });
    expect(facts({ words_bank: { value: [{ w: "a" }, { w: "b" }], updatedAt: "" } })).toEqual({ detail: "wd2_fact_n", vars: { n: 2 }, started: true });
  });
});
