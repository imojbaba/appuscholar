import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { classifyAiUse } from "../../src/aiuse";
import { fieldLabel } from "../../src/prompts";
import { buildIdeaPrompt } from "../../src/prompts-idea";
import { DEVIL_MIN_WORDS, HELPER_MIN_CHARS, HELPER_TEMPS, VIVA_MIN_WORDS, buildDevilPrompt, buildHelperPrompt, buildVivaPrompt } from "../../src/prompts-helpers";
import type { HelperKind } from "../../src/prompts-helpers";
import { QUICK_READ_MIN_CHARS, buildGapFinderPrompt, buildLitReviewPrompt, buildQuickReadPrompt, buildRankPrompt, buildSuggestTermsPrompt } from "../../src/prompts-research";
import type { RsPaper } from "../../src/research";
import type { Inputs } from "./research/capture";
import { readFixture } from "./harness/fixture";

/**
 * The prompts of Idea & Feasibility, the Psychology Tools helpers (five kinds, the devil's advocate, the viva question) and Research (quick read, ranking, related terms, literature review,
 * gap finder), against what v1 handed to callAI. Every expected value is read from test/golden/prompts-idea, prompts-helpers and prompts-research /cases.json (`golden:capture`), which
 * drive v1's own entry points with callAI replaced by a recorder: `prompt` and `opts` are what v1 passed, `inputs` what the entry read (the box and editor text with their spaces, the
 * papers), `field` the raw appu_field (null when unset), `label` v1's fieldName() and `aiu` v1's aiuClassify(prompt). The builders take the field already cleaned, so the test gives them
 * fieldLabel(field). What is typed here is what the brief says the inputs are (sizes, counts, which entries are sent with noLang) and guards that the fixtures hold the inputs they exist for.
 */

type Aiu = { k: string; g: string } | null;
type Opts = { temp: number; max: number; noLang?: true };
type Base = { field: string | null; label: string; prompt: string; opts: Opts; aiu: Aiu };

type IdeaCase = Base & { entry: "ideaAssess"; inputs: { topic: string; resources?: string; timeframe?: string; constraints?: string } };
type HelperCase = Base & (
  | { entry: "psychTool"; inputs: { kind: HelperKind; text: string } }
  | { entry: "devilTool"; inputs: { text: string } }
  | { entry: "vivaAsk"; inputs: { aud: "conf" | "viva"; text: string } }
);
type Item = { title: string; abstract?: string };
type Ticked = { ids: number[]; papers: RsPaper[] };
type ResearchCase = Base & (
  | { entry: "rsQuick"; inputs: { abstract: string } }
  | { entry: "rsRank"; inputs: { question: string; items: Item[] } }
  | { entry: "rsSuggestTerms"; inputs: { topic: string } }
  | { entry: "researchLitReview"; inputs: Ticked }
  | { entry: "researchGapFinder"; inputs: Ticked }
);
type Guard = { refused: number; accepted: number; toast: string };

const idea = readFixture<{ cases: IdeaCase[] }>("prompts-idea", "cases");
const helpers = readFixture<{ cases: HelperCase[]; guards: { psychTool: Guard; devilTool: Guard; vivaAsk: Guard } }>("prompts-helpers", "cases");
const research = readFixture<{ cases: ResearchCase[]; guards: { rsQuick: Guard } }>("prompts-research", "cases");
const inputs = JSON.parse(readFileSync(new URL("./research/inputs.json", import.meta.url), "utf8")) as Inputs;

const builtResearch = (c: ResearchCase) => {
  const field = fieldLabel(c.field);
  switch (c.entry) {
    case "rsQuick": return buildQuickReadPrompt(field, c.inputs.abstract);
    case "rsRank": return buildRankPrompt(field, c.inputs.question, c.inputs.items);
    case "rsSuggestTerms": return buildSuggestTermsPrompt(field, c.inputs.topic);
    case "researchLitReview": return buildLitReviewPrompt(field, c.inputs.papers);
    case "researchGapFinder": return buildGapFinderPrompt(field, c.inputs.papers);
  }
};
/** What tells one case of an entry from the next in a test title: the size of the text, the number of items or papers. */
const detail = (c: ResearchCase) => {
  switch (c.entry) {
    case "rsQuick": return `${c.inputs.abstract.trim().length} characters`;
    case "rsRank": return `${c.inputs.items.length} items`;
    case "rsSuggestTerms": return `${c.inputs.topic.trim().length} characters`;
    case "researchLitReview":
    case "researchGapFinder": return `${c.inputs.papers.length} papers`;
  }
};
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

describe("Wave 1 prompts equal v1's, character for character", () => {
  for (const c of idea.cases) it(`idea ${c.field} ${c.inputs.topic.slice(0, 12)}`, () => expect(buildIdeaPrompt(fieldLabel(c.field), c.inputs)).toEqual({ prompt: c.prompt, ...c.opts }));
  for (const c of helpers.cases) it([c.entry, c.field, "kind" in c.inputs ? c.inputs.kind : "aud" in c.inputs ? c.inputs.aud : "", c.inputs.text.trim().length].filter((x) => x !== "").join(" "), () => {
    const b = c.entry === "devilTool" ? buildDevilPrompt(c.inputs.text) : c.entry === "vivaAsk" ? buildVivaPrompt(c.inputs.aud, c.inputs.text) : buildHelperPrompt(c.inputs.kind, fieldLabel(c.field), c.inputs.text);
    expect(b).toEqual({ prompt: c.prompt, ...c.opts });
  });
  for (const c of research.cases) it(`${c.entry} ${c.field} ${detail(c)}`, () => expect(builtResearch(c)).toEqual({ prompt: c.prompt, ...c.opts }));
  it("fieldLabel is v1's fieldName: trimmed, 60 characters, default psychology", () => {
    expect(fieldLabel("  education ")).toBe("education");
    expect(fieldLabel("x".repeat(70))).toBe("x".repeat(60));
    expect(fieldLabel("")).toBe("psychology");
    expect(fieldLabel(undefined)).toBe("psychology");
  });
  it("classifyAiUse labels every Wave 1 prompt as v1 does", () => {
    for (const c of [...idea.cases, ...helpers.cases, ...research.cases]) expect(classifyAiUse(c.prompt)).toEqual(c.aiu);
  });
});

describe("Wave 1 prompt fixtures hold the inputs they exist for", () => {
  const all: Base[] = [...idea.cases, ...helpers.cases, ...research.cases];
  const fieldsOf = (cases: Base[]) => [...new Set(cases.map((c) => c.field))];

  it("each fixture ran under the three values of appu_field, and fieldLabel gives v1's fieldName() for each", () => {
    for (const cases of [idea.cases, helpers.cases, research.cases]) {
      const fields = fieldsOf(cases);
      expect(fields).toHaveLength(3);
      expect(fields[0]).toBeNull(); // never set: v1 says psychology
      expect(fields[1]).toBe("education");
      expect(typeof fields[2] === "string" && fields[2].length).toBe(70);
      expect(fields).toEqual(fieldsOf(idea.cases));
    }
    for (const c of all) expect(fieldLabel(c.field), String(c.field)).toBe(c.label);
    for (const c of all) if (c.field === null) expect(c.label).toBe("psychology"); // v1's default when appu_field is not set
    // the 70-character field is cut at a space (index 59): v1 trims first and cuts second, so the label keeps that space
    const long = all.find((c) => c.field !== null && c.field.length === 70)!;
    expect(long.label).toHaveLength(60);
    expect(long.label.endsWith(" ")).toBe(true);
    expect(fieldLabel(long.field)).toBe(long.field!.slice(0, 60));
  });

  it("the case counts: 3 inputs, 5 kinds on 2 texts and 2 texts on the two other tools (viva for both audiences), 5 prompts of Research, each under 3 fields", () => {
    expect(idea.cases).toHaveLength(3 * 3);
    expect(helpers.cases).toHaveLength(3 * (5 * 2 + 2 + 2 * 2));
    expect(research.cases).toHaveLength(3 * (2 + 2 + 1 + 2 + 2));
  });

  it("Idea: all four boxes, the topic alone (the three defaults), and a topic of 2,500 characters whose three companions are cut", () => {
    const [all4, only, long] = idea.cases.slice(0, 3) as [IdeaCase, IdeaCase, IdeaCase];
    expect(Object.keys(all4.inputs)).toEqual(["topic", "resources", "timeframe", "constraints"]);
    expect(Object.keys(only.inputs)).toEqual(["topic"]);
    expect(only.prompt.endsWith("\nWhat they have access to: (not described)\nTimeframe: (not given)\nOther constraints: (none given)")).toBe(true);
    expect(long.inputs.topic).toHaveLength(2500);
    expect(long.inputs.resources!.length).toBeGreaterThan(1000);
    expect(long.inputs.constraints!.length).toBeGreaterThan(1000);
    expect(long.inputs.timeframe!.length).toBeGreaterThan(1000); // v1 cuts the other three and not the timeframe
    expect(long.prompt).toContain("\nTimeframe: " + long.inputs.timeframe + "\n");
    expect(long.prompt).toContain("Working idea: " + long.inputs.topic.slice(0, 2000) + "\n");
    expect(long.prompt).not.toContain(long.inputs.topic.slice(0, 2001));
    // the entries trim what they read: the first case's boxes have spaces at their ends, the prompt does not
    expect(all4.inputs.topic).not.toBe(all4.inputs.topic.trim());
    expect(all4.prompt).toContain("Working idea: " + all4.inputs.topic.trim() + "\nWhat they have access to: " + all4.inputs.resources!.trim() + "\nTimeframe: " + all4.inputs.timeframe!.trim());
    expect(buildIdeaPrompt("psychology", { topic: "t", resources: "   " }).prompt.endsWith("What they have access to: (not described)\nTimeframe: (not given)\nOther constraints: (none given)")).toBe(true);
  });

  it("Psychology Tools: five kinds on 300 and 13,000 characters (the cut at 12,000), the devil and the viva on 30 words and 7,000 characters (the cut at 6,000), both audiences", () => {
    const kinds = new Set<string>(), sizes = new Set<number>();
    for (const c of helpers.cases) {
      const text = c.inputs.text.trim();
      if (c.entry === "psychTool") {
        kinds.add(c.inputs.kind);
        sizes.add(text.length);
        expect(c.prompt.endsWith("\n\nText:\n" + text.slice(0, 12000)), `${c.inputs.kind} ${text.length}`).toBe(true);
      } else {
        sizes.add(words(text) === 30 ? 30 : text.length);
        expect(c.prompt.endsWith("\n\nPASSAGE:\n" + text.slice(0, 6000)), `${c.entry} ${text.length}`).toBe(true);
      }
    }
    expect(kinds).toEqual(new Set(["paper", "case", "litrev", "explain", "stats"]));
    expect(sizes).toEqual(new Set([300, 13000, 30, 7000]));
    expect(new Set(helpers.cases.flatMap((c) => (c.entry === "vivaAsk" ? [c.inputs.aud] : [])))).toEqual(new Set(["conf", "viva"]));
    expect(helpers.cases.some((c) => c.inputs.text !== c.inputs.text.trim())).toBe(true); // the entries trim the selection; the fixture holds it with its spaces
    for (const kind of Object.keys(HELPER_TEMPS) as HelperKind[])
      for (const c of helpers.cases) if (c.entry === "psychTool" && c.inputs.kind === kind) expect(c.opts, kind).toEqual({ temp: HELPER_TEMPS[kind], max: 2500 });
  });

  it("Research: a 4,000-character abstract (cut at 3,500), related terms for a 400-character topic (cut at 300), a 500-character question (cut at 400) over items with and without an abstract, 2 and 5 papers of research/inputs.json", () => {
    const of = <E extends ResearchCase["entry"]>(entry: E) => research.cases.filter((c): c is Extract<ResearchCase, { entry: E }> => c.entry === entry);
    const quick = of("rsQuick");
    expect(new Set(quick.map((c) => c.inputs.abstract.trim().length)).has(4000)).toBe(true);
    for (const c of quick) expect(c.prompt.endsWith("\nABSTRACT START\n" + c.inputs.abstract.trim().slice(0, 3500) + "\nABSTRACT END"), String(c.inputs.abstract.length)).toBe(true);
    expect(quick.some((c) => c.inputs.abstract !== c.inputs.abstract.trim())).toBe(true);
    const terms = of("rsSuggestTerms");
    expect(terms.some((c) => c.inputs.topic.trim().length === 400)).toBe(true);
    expect(terms.some((c) => c.inputs.topic !== c.inputs.topic.trim())).toBe(true);
    for (const c of terms) expect(c.prompt.endsWith("\n\nTOPIC:\n" + c.inputs.topic.trim().slice(0, 300))).toBe(true);
    for (const c of of("rsRank")) {
      expect(c.inputs.question.trim()).toHaveLength(500);
      expect(c.prompt).toContain("\n\nQUESTION:\n" + c.inputs.question.trim().slice(0, 400) + "\n\nPAPERS:\n[1] TITLE: ");
      expect(c.inputs.items.length).toBeLessThanOrEqual(12); // rsRank sends 12 at a time; the capture throws on a second call
      expect(c.inputs.items.some((x) => (x.abstract ?? "").trim() === "")).toBe(true);
      expect(c.inputs.items.some((x) => (x.abstract ?? "").trim() !== "")).toBe(true);
      expect(c.inputs.items.some((x) => x.title.length > 250) && c.inputs.items.some((x) => (x.abstract ?? "").trim().length > 900)).toBe(true);
    }
    expect(new Set(of("researchLitReview").map((c) => c.inputs.papers.length))).toEqual(new Set([2, 5]));
    expect(new Set(of("researchGapFinder").map((c) => c.inputs.papers.length))).toEqual(new Set([2, 5]));
    for (const c of [...of("researchLitReview"), ...of("researchGapFinder")]) {
      expect(c.inputs.papers, c.inputs.ids.join()).toEqual(c.inputs.ids.map((i) => inputs.papers[i]));
      expect(c.prompt.includes(`Below are ${c.inputs.papers.length} real papers`)).toBe(true);
    }
  });

  it("noLang is on exactly the three prompts v1 sends with it (quick read, ranking, related terms)", () => {
    for (const c of research.cases) expect("noLang" in c.opts, c.entry).toBe(["rsQuick", "rsRank", "rsSuggestTerms"].includes(c.entry));
    for (const c of research.cases) if ("noLang" in c.opts) expect(c.opts.noLang).toBe(true);
    for (const c of [...idea.cases, ...helpers.cases]) expect("noLang" in c.opts).toBe(false);
  });

  it("D-W1-4: the guard constants are the sizes at which v1 starts to send (the capture tries every size)", () => {
    expect(HELPER_MIN_CHARS).toBe(helpers.guards.psychTool.accepted);
    expect(HELPER_MIN_CHARS - 1).toBe(helpers.guards.psychTool.refused);
    expect(DEVIL_MIN_WORDS).toBe(helpers.guards.devilTool.accepted);
    expect(DEVIL_MIN_WORDS - 1).toBe(helpers.guards.devilTool.refused);
    expect(VIVA_MIN_WORDS).toBe(helpers.guards.vivaAsk.accepted);
    expect(VIVA_MIN_WORDS - 1).toBe(helpers.guards.vivaAsk.refused);
    expect(QUICK_READ_MIN_CHARS).toBe(research.guards.rsQuick.accepted);
    expect(QUICK_READ_MIN_CHARS - 1).toBe(research.guards.rsQuick.refused);
    for (const g of [helpers.guards.psychTool, helpers.guards.devilTool, helpers.guards.vivaAsk, research.guards.rsQuick]) expect(g.toast).not.toBe(""); // v1 tells the student, which is the panel's to do
  });
});
