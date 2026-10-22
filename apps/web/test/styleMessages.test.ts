import { describe, expect, it } from "vitest";
import { STY_BANDS, STY_PASSAGES, STY_VOCAB, styleLiveCompare, styleFeatures, styleVocabScore } from "@appuscholar/core";
import styleEn from "../messages/tools/style.en.json";
import styleHi from "../messages/tools/style.hi.json";
import en from "../messages/en.json";
import { facts } from "../components/tools/style";
import * as styleModule from "../components/tools/style";

const E = styleEn as Record<string, string>;
const H = styleHi as Record<string, string>;

describe("My style's copy", () => {
  it("shows the engine's English strings through keys, equal to them: passages, ten words, bands, live-check rows", () => {
    STY_PASSAGES.forEach((p, i) => expect(E["sty2_passage_" + i]).toBe(p));
    // Shown with a capital first letter (sentence case; and a value equal to a lower-case token elsewhere in the code is refused by i18n-coverage.test.ts).
    const cap = (x: string) => x[0]!.toUpperCase() + x.slice(1);
    STY_VOCAB.forEach((q, i) => {
      expect(E["sty2_vw" + i]).toBe(cap(q.w));
      q.o.forEach((o, j) => expect(E[`sty2_vo${i}_${j}`]).toBe(cap(o)));
    });
    STY_BANDS.forEach((b) => expect(E["sty2_band_" + b.k]).toBe(cap(b.label)));
    const samples = [0, 1].map((i) => ({ id: "s" + i, name: "n" + i, date: "d", ...styleFeatures("The student wrote a careful account of the lesson. ".repeat(40)) }));
    const r = styleLiveCompare("The student wrote a careful account of the lesson. ".repeat(10), samples);
    if (!r.ok) throw new Error("no rows");
    const keys: Record<string, string> = { "average sentence length": "sty2_row_sentence", "average word length": "sty2_row_word", "share of long words": "sty2_row_long", "commas per 1,000 words": "sty2_row_commas" };
    for (const row of r.rows) expect(E[keys[row.name]!]!.toLowerCase()).toBe(row.name);
  });
  it("uses v1's keys where they exist and adds its own only in the tool file; Hindi is a draft with no key English lacks", () => {
    for (const k of ["style_learn_btn", "style_learn_files_btn", "style_profile_label", "style_profile_placeholder", "style_save_btn", "style_use_label"]) {
      expect((en as Record<string, string>)[k], k).toBeTruthy();
      expect(k in E, k).toBe(false);
    }
    for (const k of Object.keys(E)) expect(k in (en as Record<string, string>), k).toBe(false);
    expect(H.$draft).toMatch(/^DRAFT: Hindi for Dr\. Sharma's review, reviewed by: /);
    expect(Object.keys(H).filter((k) => !k.startsWith("$") && !(k in E))).toEqual([]);
  });
  it("has no em-dash and no emoji, and every placeholder in Hindi is one English has", () => {
    for (const [k, v] of Object.entries(E)) {
      expect(v, k).not.toMatch(/—/);
      expect(v, k).not.toMatch(/\p{Extended_Pictographic}/u);
    }
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const [k, v] of Object.entries(H)) if (!k.startsWith("$")) expect(vars(v), k).toBe(vars(E[k]!));
  });
  it("the ten-word score is the number of right answers and the band follows v1's ranges", () => {
    for (let k = 0; k <= 10; k++) {
      const answers = STY_VOCAB.map((q, i) => (i < k ? q.a : -1));
      const r = styleVocabScore(answers);
      expect(r.score).toBe(k);
      expect(r.k).toBe(k <= 3 ? "basic" : k <= 6 ? "general" : k <= 8 ? "advanced" : "high");
    }
  });
});

describe("the module", () => {
  it("is built and exports a Panel and a DocumentLayer", () => {
    expect(styleModule.built).toBe(true);
    expect(typeof styleModule.Panel).toBe("function");
    expect(typeof styleModule.DocumentLayer).toBe("function");
  });
  it("facts: nothing to say until a sample is learned; counts them after; every key it names is in the tool's file", () => {
    expect(facts({})).toEqual({ started: false });
    expect(facts({ style_profile: { value: { profile: "- Warm.", on: true }, updatedAt: "x" } })).toEqual({ started: true });
    const one = facts({ style_samples: { value: [{}], updatedAt: "x" } });
    expect(one).toEqual({ detail: "sty2_fact_one", started: true });
    const many = facts({ style_samples: { value: [{}, {}, {}], updatedAt: "x" } });
    expect(many).toEqual({ detail: "sty2_fact_n", vars: { n: 3 }, started: true });
    expect(E[one.detail!]).toBeTruthy();
    expect(E[many.detail!]).toContain("{n}");
    expect(facts({ style_samples: { value: "not a list", updatedAt: "x" } })).toEqual({ started: false });
  });
});
