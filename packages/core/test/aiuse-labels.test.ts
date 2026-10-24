import { describe, it, expect } from "vitest";
import { classifyAiUse } from "../src/aiuse";
import type { AiUseGroup } from "../src/aiuse";
import { classifyAiUseV2 } from "../src/aiuse-v2";
import { buildWritingPrompt, buildDraftFirstPrompt, buildChatPrompt } from "../src/prompts";
import { buildIdeaPrompt, buildIdeaPromptV2 } from "../src/prompts-idea";
import { buildHelperPrompt, buildDevilPrompt, buildVivaPrompt } from "../src/prompts-helpers";
import { buildQuickReadPrompt, buildRankPrompt, buildSuggestTermsPrompt, buildLitReviewPrompt, buildGapFinderPrompt, buildGapFinderPromptV2 } from "../src/prompts-research";
import { buildAskPrompt, buildWalkPrompt, buildLessonAskPrompt } from "../src/prompts-analyse";
import { buildShelfSummaryPrompt, buildShelfSummaryPromptV2 } from "../src/shelf";
import { apBuild, AP_STAGES } from "../src/analyse";
import { buildStyleAnalyzePrompt, buildStyleFilesPrompt, buildStyleTryPrompt, STY_PASSAGES } from "../src/style";
import { buildGrammarPrompt, buildDictPrompt } from "../src/words";
import type { RsPaper } from "../src/research";

/**
 * A characterisation test: it pins the AI-use log label (the `k` and `g` that the route logs for the prompt) of every
 * build*Prompt builder, because those labels are what a student hands in. Rewording a prompt must not silently relabel it.
 * Four rows are fixed by the spec (idea, gap finder, literature review, shelf summary); every other row is the value
 * classifyAiUse returned on commit 6c38396, written down as it was. Later tasks append their builders to LABELS.
 * Task Q3 (OJ's yes, decision 7; register D-S2-136) changed eight rows on purpose: the route now logs classifyAiUseV2, whose four
 * new rules label the ask, the walk-through, the statistics helper and the lesson question (all five teachers). Each changed row
 * says so below, and V1_LABEL_OF_CHANGED holds the label v1's classifyAiUse (the port, never edited) still gives it.
 */
const paper = (n: number): RsPaper => ({ title: "Sleep and memory in students " + n, authors: "A. Rao", year: 2021, venue: "J. Psych", doi: "10.1/x" + n, source: "crossref", abstract: "We studied 120 students and found that sleep length predicted recall scores." });
const doc = apBuild("Practice paper", ["Abstract\nWe studied 120 students.\n\nMethod\nSurvey of students in Delhi.\n\nResults\nSleep predicted recall."], "pdf");
const stage = AP_STAGES[0]!;
const step = { k: "procedure", title: "Consent", said: "Participants consented.", flaw: "No consent form is shown." };

const lesson = (teacher: "appu" | "raj" | "meera" | "dev" | "tara"): string => buildLessonAskPrompt({ teacher, field: "psychology", lang: "en", step, doc, question: "why does this matter?" }).prompt;

export const LABELS: Array<[name: string, build: () => string, k: string, g: AiUseGroup]> = [
  // Fixed by the spec.
  ["buildIdeaPrompt", () => buildIdeaPrompt("psychology", { topic: "sleep and recall in college students" }).prompt, "checking whether my project idea is realistic", "feedback"],
  ["buildIdeaPromptV2", () => buildIdeaPromptV2("psychology", { topic: "sleep and recall in college students" }).prompt, "checking whether my project idea is realistic", "feedback"],
  ["buildGapFinderPrompt", () => buildGapFinderPrompt("psychology", [paper(1), paper(2)]).prompt, "looking for research gaps in selected abstracts", "feedback"],
  ["buildGapFinderPromptV2", () => buildGapFinderPromptV2("psychology", [paper(1), paper(2)]).prompt, "looking for research gaps in selected abstracts", "feedback"],
  ["buildLitReviewPrompt", () => buildLitReviewPrompt("psychology", [paper(1), paper(2)]).prompt, "drafting a literature review paragraph from selected abstracts", "text"],
  ["buildShelfSummaryPrompt", () => buildShelfSummaryPrompt("psychology", "Some paper text. We studied 120 students.").prompt, "summarising a paper", "explain"],
  ["buildShelfSummaryPromptV2", () => buildShelfSummaryPromptV2("psychology", ["Abstract\nSome paper text. We studied 120 students."]).prompt, "summarising a paper", "explain"],
  // Recorded from classifyAiUse as it stands today.
  ["buildWritingPrompt continue", () => buildWritingPrompt("continue", "some text").prompt, "continuing my draft", "text"],
  ["buildWritingPrompt improve", () => buildWritingPrompt("improve", "some text").prompt, "grammar and polish", "text"],
  ["buildWritingPrompt expand", () => buildWritingPrompt("expand", "some text").prompt, "expanding my text", "text"],
  ["buildDraftFirstPrompt tail", () => buildDraftFirstPrompt("tail", "some text").prompt, "feedback on my draft", "feedback"],
  ["buildDraftFirstPrompt improve", () => buildDraftFirstPrompt("improve", "some text").prompt, "feedback on my draft", "feedback"],
  ["buildDraftFirstPrompt expand", () => buildDraftFirstPrompt("expand", "some text").prompt, "feedback on my draft", "feedback"],
  ["buildChatPrompt", () => buildChatPrompt("psychology", "what is a sample?").prompt, "answering a writing question", "explain"],
  ["buildHelperPrompt paper", () => buildHelperPrompt("paper", "psychology", "some text").prompt, "summarising a paper", "explain"],
  ["buildHelperPrompt case", () => buildHelperPrompt("case", "psychology", "some text").prompt, "analysing a case description", "explain"],
  ["buildHelperPrompt litrev", () => buildHelperPrompt("litrev", "psychology", "some text").prompt, "advice on building a literature review", "feedback"],
  ["buildHelperPrompt explain", () => buildHelperPrompt("explain", "psychology", "some text").prompt, "explaining a concept", "explain"],
  // Q3 changed this row: v1 labels the stats helper as APA formatting (text); the route now logs "explaining statistics" (explain).
  ["buildHelperPrompt stats", () => buildHelperPrompt("stats", "psychology", "some text").prompt, "explaining statistics", "explain"],
  ["buildDevilPrompt", () => buildDevilPrompt("some passage").prompt, "counter-arguments to my passage", "feedback"],
  ["buildVivaPrompt conf", () => buildVivaPrompt("conf", "some text").prompt, "practice viva questions", "feedback"],
  ["buildVivaPrompt viva", () => buildVivaPrompt("viva", "some text").prompt, "practice viva questions", "feedback"],
  ["buildQuickReadPrompt", () => buildQuickReadPrompt("psychology", "We studied 120 students.").prompt, "reading one abstract quickly", "explain"],
  ["buildRankPrompt", () => buildRankPrompt("psychology", "does sleep help recall?", [paper(1)]).prompt, "ranking search results", "explain"],
  ["buildSuggestTermsPrompt", () => buildSuggestTermsPrompt("psychology", "sleep and recall").prompt, "suggesting search terms", "explain"],
  // Q3 changed these two rows: the ask and the walk-through match no rule of v1's, so v1 logs them as "other help"; the route now gives each a label.
  ["buildAskPrompt", () => buildAskPrompt("psychology", doc, "What was the sample?").prompt, "asking questions about a paper", "explain"],
  ["buildWalkPrompt", () => buildWalkPrompt("psychology", doc, stage, "my first try").prompt, "working through a paper section by section", "feedback"],
  // Q3 changed these five rows: in v1 only RAJ and Dr Shuddhi Grant match a rule (their own label) and the other three teachers log as "other help"; the route now logs one label for a lesson question, whoever the teacher is.
  ["buildLessonAskPrompt raj", () => lesson("raj"), "a guided lesson on a paper", "explain"],
  ["buildLessonAskPrompt meera", () => lesson("meera"), "a guided lesson on a paper", "explain"],
  ["buildLessonAskPrompt appu", () => lesson("appu"), "a guided lesson on a paper", "explain"],
  ["buildLessonAskPrompt dev", () => lesson("dev"), "a guided lesson on a paper", "explain"],
  ["buildLessonAskPrompt tara", () => lesson("tara"), "a guided lesson on a paper", "explain"],
  // My style (session D, Task D1): all three of its openings match the rules that were already there, so no rule was added; the files one opens "You are studying the writing style".
  ["buildStyleAnalyzePrompt", () => buildStyleAnalyzePrompt("some text").prompt, "describing my writing style", "explain"],
  ["buildStyleFilesPrompt", () => buildStyleFilesPrompt(["some text", "more text"]).prompt, "describing my writing style", "explain"],
  ["buildStyleTryPrompt on", () => buildStyleTryPrompt("- Warm tone.", true, null, STY_PASSAGES[0]).prompt, "trying my style on a practice passage", "explain"],
  ["buildStyleTryPrompt off", () => buildStyleTryPrompt("- Warm tone.", false, null, STY_PASSAGES[1]).prompt, "trying my style on a practice passage", "explain"],
  // Words and grammar (session D, Task D3): both openings match rules that were already there ("You are a careful English grammar and usage checker", "bilingual English and Hindi dictionary helper"), so no rule was added.
  ["buildGrammarPrompt uk", () => buildGrammarPrompt("psychology", "uk", "Some text to check.").prompt, "checking grammar and wording", "text"],
  ["buildGrammarPrompt us", () => buildGrammarPrompt("education", "us", "Some text to check.").prompt, "checking grammar and wording", "text"],
  ["buildGrammarPrompt off", () => buildGrammarPrompt("psychology", "off", "Some text to check.").prompt, "checking grammar and wording", "text"],
  ["buildDictPrompt", () => buildDictPrompt("psychology", "study").prompt, "looking up a word", "explain"]
];

/** The eight rows Q3 changed on purpose, with the label v1's classifyAiUse gives the same prompt (the port is not edited, so this stays true). */
const V1_LABEL_OF_CHANGED: Record<string, { k: string; g: AiUseGroup }> = {
  "buildHelperPrompt stats": { k: "formatting statistics output in APA style", g: "text" },
  buildAskPrompt: { k: "other help", g: "other" },
  buildWalkPrompt: { k: "other help", g: "other" },
  "buildLessonAskPrompt raj": { k: "asking a teaching character about the practice paper", g: "explain" },
  "buildLessonAskPrompt meera": { k: "asking a teaching character about the practice paper", g: "explain" },
  "buildLessonAskPrompt appu": { k: "other help", g: "other" },
  "buildLessonAskPrompt dev": { k: "other help", g: "other" },
  "buildLessonAskPrompt tara": { k: "other help", g: "other" }
};

describe("the AI-use label of every prompt builder", () => {
  it.each(LABELS)("%s keeps its AI-use label", (_name, build, k, g) => {
    expect(classifyAiUseV2(build())).toEqual({ k, g });
  });
});

describe("classifyAiUseV2 against v1's classifyAiUse (Task Q3)", () => {
  it.each(LABELS)("%s: v1's label, unless Q3 changed it on purpose", (name, build, k, g) => {
    expect(classifyAiUse(build())).toEqual(V1_LABEL_OF_CHANGED[name] ?? { k, g });
  });

  it("exactly the eight rows named in V1_LABEL_OF_CHANGED differ from v1, and every other builder keeps v1's label", () => {
    const differ = LABELS.filter(([, build]) => JSON.stringify(classifyAiUseV2(build())) !== JSON.stringify(classifyAiUse(build()))).map(([name]) => name);
    expect(differ.sort()).toEqual(Object.keys(V1_LABEL_OF_CHANGED).sort());
  });
});
