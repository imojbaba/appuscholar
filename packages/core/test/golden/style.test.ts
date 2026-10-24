import { describe, it, expect } from "vitest";
import { classifyAiUse } from "../../src/aiuse";
import {
  STY_FW, STY_VOCAB, STY_BANDS, STY_PASSAGES, STYLE_MIN_WORDS, STYLE_LIVE_MIN_WORDS, STYLE_PROFILE_MAX, STYLE_SAMPLES_MAX,
  styleFeatures, styleAddSample, styleSamplesKeep, styleOutliers, styleMeasured, styleCompose, styleVocabNote, styleLiveCompare, styleLivePassage, styleLiveNext,
  styleVocabOrder, styleVocabScore, styleLevelRule, stylePrompt, styleProfileSave, styleVoiceOffNote, styleSampleCorpus, styleWordCount, styleLiveWordCount,
  buildStyleAnalyzePrompt, buildStyleFilesPrompt, buildStyleTryPrompt,
} from "../../src/style";
import type { StyleLevel, StyleSample } from "../../src/style";
import type { StyleFx } from "./style/capture";
import { readFixture } from "./harness/fixture";

/**
 * My writing style (style.ts) against v1's page (`golden:capture style`, style/capture.ts): the tables against tables.json; styleFeatures for the twelve golden samples (and the texts the sets are
 * made of) against v1's; styleOutliers, styleMeasured, styleCompose, styleLiveCompare and styleVocabNote per set of samples; styleAddSample's record and refusals; the vocabulary check's order and
 * score; the live passage; the word counts at which v1 goes on; styleSave, styleTryNoteSave and stylePrompt; and the three prompts v1 hands to callAI (styleAnalyze, styleAnalyzeFiles,
 * styleTry), whose aiuClassify labels are held to classifyAiUse. The expected values are all v1's (cases.json); what is typed here is only which function answers which field.
 */

const fx = readFixture<StyleFx>("style", "cases");
const tables = readFixture<{ tables: { STY_FW: string[]; STY_VOCAB: unknown[]; STY_BANDS: unknown[]; STY_PASSAGES: string[] } }>("style", "tables").tables;
const byId = new Map(fx.features.map((x) => [x.id, x]));
const samplesOf = (s: StyleFx["sets"][number]): StyleSample[] => s.samples.map((x) => ({ id: x.id, name: x.id, date: "2026-01-01", ...byId.get(x.of)!.f }));

describe("style: tables (6375-6397)", () => {
  it("STY_FW, STY_VOCAB, STY_BANDS and STY_PASSAGES are v1's", () => {
    expect(STY_FW as unknown).toEqual(tables.STY_FW);
    expect(STY_VOCAB as unknown).toEqual(tables.STY_VOCAB);
    expect(STY_BANDS as unknown).toEqual(tables.STY_BANDS);
    expect(STY_PASSAGES as unknown).toEqual(tables.STY_PASSAGES);
  });
});

describe("style: styleFeatures (6399-6415)", () => {
  it("features of 12 golden samples match v1", () => {
    const golden = fx.features.filter((x) => /^g\d\d$/.test(x.id));
    expect(golden).toHaveLength(12);
    for (const g of golden) expect(styleFeatures(g.text), g.id + ": " + g.note).toEqual(g.f);
  });
  it("features of the texts the sets are made of match v1", () => {
    for (const x of fx.features) expect(styleFeatures(x.text), x.id).toEqual(x.f);
  });
  it("a text with no letters has v1's n of 0, and the long-word list is cut at 400", () => {
    expect(byId.get("g05")!.f.n).toBe(0);
    expect(byId.get("g12")!.f.vw).toHaveLength(400);
  });
});

for (const s of fx.sets) {
  describe(`style: set ${s.id} (${s.note})`, () => {
    const samples = samplesOf(s);
    it("styleOutliers (6441-6453)", () => {
      expect(styleOutliers(samples)).toEqual(s.outliers);
    });
    it("styleMeasured (6454-6460)", () => {
      expect(styleMeasured(samples)).toBe(s.measured);
    });
    it("styleCompose (6461-6464)", () => {
      for (const c of s.compose) expect(styleCompose(c.bullets, samples)).toBe(c.out);
    });
    it("styleLiveCompare, the live does-it-sound-like-me check (6488-6495)", () => {
      for (const c of s.compare) expect(styleLiveCompare(byId.get(c.id)!.text, samples), c.id).toEqual(c.out);
    });
    it("styleVocabNote (6470-6477)", () => {
      for (const n of s.vocabNote) expect(styleVocabNote(n.orig, n.res, samples, n.on)).toBe(n.out);
    });
  });
}

describe("style: the sets reach every outcome", () => {
  it("at least one set flags a file, one with four long samples flags none, and every verdict is seen", () => {
    expect(fx.sets.some((s) => Object.keys(s.outliers).length > 0)).toBe(true);
    expect(fx.sets.some((s) => samplesOf(s).filter((x) => x.n >= 300).length >= 4 && Object.keys(s.outliers).length === 0)).toBe(true);
    const verdicts = new Set(fx.sets.flatMap((s) => s.compare.map((c) => (c.out as { verdict?: string }).verdict)));
    expect([...verdicts].sort()).toEqual(["consistent", "differs", "partly", undefined]);
  });
});

describe("style: styleAddSample and the hundred-sample cut (6417, 6426-6432)", () => {
  for (const c of fx.addSample) {
    it(c.id, () => {
      let stored: StyleSample[] = c.id === "at-100" ? Array.from({ length: 100 }, (_, i) => ({ ...byId.get("a0")!.f, id: `old${i}`, name: `Old ${i}`, date: "2026-01-01" })) : [];
      c.steps.forEach((st, i) => {
        const rec = styleAddSample(stored, st.name, st.text, "sabc", "2026-10-21");
        const want = c.results[i]!;
        if (want.rec === null) {
          expect(rec).toBeNull();
          return;
        }
        expect(rec).not.toBeNull();
        const { id, date, ...rest } = rec!;
        expect(id).toBe("sabc");
        expect(date).toBe("2026-10-21");
        expect(rest).toEqual(want.rec);
        expect(want.idOk && want.dateOk).toBe(true);
        stored = styleSamplesKeep([...stored, rec!]);
      });
      expect(stored.length).toBe(c.after);
      if (c.id === "at-100") expect(stored.every((x) => x.id.startsWith("old"))).toBe(true);
    });
  }
  it("STYLE_SAMPLES_MAX is 100", () => {
    expect(STYLE_SAMPLES_MAX).toBe(100);
  });
});

describe("style: the vocabulary check (6519-6535)", () => {
  it("styleVocabOrder lists the answers of each question in the order v1 shows them", () => {
    expect(fx.vocab.order.map((_, i) => styleVocabOrder(i))).toEqual(fx.vocab.order);
  });
  for (const c of fx.vocab.cases) {
    it(`styleVocabScore: ${c.id}`, () => {
      const r = styleVocabScore(c.answers);
      expect(r.score).toBe(c.stored.score);
      expect(r.k).toBe(c.stored.k);
      expect(r.label).toBe(STY_BANDS.find((b) => b.k === r.k)!.label);
    });
  }
});

describe("style: the practice passage (6496-6499)", () => {
  it("styleLivePassage and styleLiveNext for every stored livePassage v1 was given", () => {
    for (const p of fx.passages) {
      const stored = p.stored;
      expect(styleLivePassage(stored === null ? undefined : stored), JSON.stringify(stored)).toBe(p.at);
      // v1 stores the result through JSON, which writes -0 as 0 (a stored -4 gives -0 here, as in v1): the fixture holds what was stored
      expect(styleLiveNext(stored === null ? undefined : stored) + 0, JSON.stringify(stored)).toBe(p.next);
    }
  });
});

describe("style: the word counts at which v1 goes on", () => {
  const words = (n: number) => Array.from({ length: n }, () => "alpha").join(" ");
  it("styleAnalyze needs STYLE_MIN_WORDS (6979)", () => {
    expect(STYLE_MIN_WORDS).toBe(fx.guards.analyse.accepted);
    expect(styleWordCount(words(fx.guards.analyse.refused))).toBeLessThan(STYLE_MIN_WORDS);
    expect(styleWordCount(words(fx.guards.analyse.accepted))).toBeGreaterThanOrEqual(STYLE_MIN_WORDS);
  });
  it("styleAddSample needs STYLE_MIN_WORDS words by features (6427)", () => {
    expect(STYLE_MIN_WORDS).toBe(fx.guards.addSample.accepted);
    expect(styleFeatures(words(fx.guards.addSample.refused)).n).toBeLessThan(STYLE_MIN_WORDS);
    expect(styleFeatures(words(fx.guards.addSample.accepted)).n).toBeGreaterThanOrEqual(STYLE_MIN_WORDS);
  });
  it("styleLiveRun needs STYLE_LIVE_MIN_WORDS letters-runs (6503)", () => {
    expect(STYLE_LIVE_MIN_WORDS).toBe(fx.guards.live.accepted);
    expect(styleLiveWordCount(words(fx.guards.live.refused))).toBeLessThan(STYLE_LIVE_MIN_WORDS);
    expect(styleLiveWordCount(words(fx.guards.live.accepted))).toBeGreaterThanOrEqual(STYLE_LIVE_MIN_WORDS);
  });
});

describe("style: the profile (6367, 6551-6555, 6975-6976, 6483-6486, 7014-7019)", () => {
  it("styleProfileSave is what styleSave stores", () => {
    for (const c of fx.profile.save) expect(styleProfileSave(c.typed)).toBe(c.stored);
    expect(STYLE_PROFILE_MAX).toBe(1500);
  });
  it("styleVoiceOffNote is what styleTryNoteSave stores, and null where it stores nothing", () => {
    expect(fx.profile.note.some((c) => c.stored !== c.profile)).toBe(true);
    for (const c of fx.profile.note) {
      const out = styleVoiceOffNote(c.profile, c.typed);
      expect(out === null ? c.profile : out, JSON.stringify(c.typed)).toBe(c.stored);
    }
  });
  it("stylePrompt, on and off, with and without a level and a profile", () => {
    for (const c of fx.profile.prompt) expect(stylePrompt(c.profile ?? "", c.on === "1", c.level as StyleLevel | null), JSON.stringify(c)).toBe(c.out);
  });
  it("styleLevelRule for every band and an unknown one", () => {
    for (const c of fx.profile.level) expect(styleLevelRule(c.level as StyleLevel | null)).toBe(c.out);
  });
  it("styleSampleCorpus keeps a text of 15,000 characters whole and cuts a longer one to eight segments", () => {
    for (const c of fx.corpus) expect(styleSampleCorpus(c.text, 15000), String(c.chars)).toBe(c.out);
  });
});

describe("style: the prompts v1 hands to callAI (6977-6989, 7021-7051, 6536-6545)", () => {
  const rows = (entry: string) => fx.prompts.filter((p) => p.entry === entry);
  type Opts = { temp: number; max: number };
  const check = (built: { prompt: string; temp: number; max: number }, c: { prompt: string; opts: Record<string, unknown> }) => {
    expect(built.prompt).toBe(c.prompt);
    expect({ temp: built.temp, max: built.max }).toEqual(c.opts as Opts);
  };
  it("buildStyleAnalyzePrompt (temp 0.3, 600 tokens)", () => {
    expect(rows("styleAnalyze")).toHaveLength(4);
    for (const c of rows("styleAnalyze")) check(buildStyleAnalyzePrompt(c.inputs.text as string), c);
  });
  it("buildStyleFilesPrompt (temp 0.3, 800 tokens): the files read, white space made single", () => {
    expect(rows("styleAnalyzeFiles")).toHaveLength(4);
    for (const c of rows("styleAnalyzeFiles")) {
      const files = c.inputs.files as Array<{ name: string; text: string }>;
      const texts = files.filter((f) => !f.name.endsWith(".doc")).map((f) => f.text.replace(/\s+/g, " ").trim()).filter(Boolean);
      check(buildStyleFilesPrompt(texts), c);
    }
  });
  it("buildStyleTryPrompt (temp 0.5, 700 tokens): on, off, each level, each passage", () => {
    expect(rows("styleTry")).toHaveLength(6);
    for (const c of rows("styleTry")) {
      const i = c.inputs as { profile: string; on: string; level: StyleLevel | null; livePassage?: number };
      check(buildStyleTryPrompt(i.profile, i.on === "1", i.level, STY_PASSAGES[styleLivePassage(i.livePassage)]!), c);
    }
  });
  it("each prompt's opening is the one the AI-use log reads, and classifyAiUse gives the label v1 gives", () => {
    for (const c of fx.prompts) expect(classifyAiUse(c.prompt), c.entry).toEqual(c.aiu);
    const labels = new Set(fx.prompts.map((c) => `${c.entry}: ${c.aiu?.k} / ${c.aiu?.g}`));
    expect([...labels].sort()).toEqual([
      "styleAnalyze: describing my writing style / explain",
      "styleAnalyzeFiles: describing my writing style / explain",
      "styleTry: trying my style on a practice passage / explain",
    ]);
  });
});
