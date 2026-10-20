import { describe, it, expect } from "vitest";
import { classifyAiUse } from "../src/aiuse";
import type { AiUseGroup } from "../src/aiuse";
import { buildWritingPrompt, buildDraftFirstPrompt, buildChatPrompt } from "../src/prompts";
import { buildIdeaPrompt, buildIdeaPromptV2 } from "../src/prompts-idea";
import { buildHelperPrompt, buildDevilPrompt, buildVivaPrompt } from "../src/prompts-helpers";
import { buildQuickReadPrompt, buildRankPrompt, buildSuggestTermsPrompt, buildLitReviewPrompt, buildGapFinderPrompt, buildGapFinderPromptV2 } from "../src/prompts-research";
import { buildAskPrompt, buildWalkPrompt, buildLessonAskPrompt } from "../src/prompts-analyse";
import { buildShelfSummaryPrompt } from "../src/shelf";
import { apBuild, AP_STAGES } from "../src/analyse";
import type { RsPaper } from "../src/research";

/**
 * A characterisation test: it pins the AI-use log label (the `k` and `g` that classifyAiUse gives the prompt) of every
 * build*Prompt builder, because those labels are what a student hands in. Rewording a prompt must not silently relabel it.
 * Four rows are fixed by the spec (idea, gap finder, literature review, shelf summary); every other row is the value
 * classifyAiUse returned on commit 6c38396, written down as it was. Later tasks append their builders to LABELS.
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
  // Today the stats helper is labelled as APA formatting (text), not as explaining output; pinned as it is.
  ["buildHelperPrompt stats", () => buildHelperPrompt("stats", "psychology", "some text").prompt, "formatting statistics output in APA style", "text"],
  ["buildDevilPrompt", () => buildDevilPrompt("some passage").prompt, "counter-arguments to my passage", "feedback"],
  ["buildVivaPrompt conf", () => buildVivaPrompt("conf", "some text").prompt, "practice viva questions", "feedback"],
  ["buildVivaPrompt viva", () => buildVivaPrompt("viva", "some text").prompt, "practice viva questions", "feedback"],
  ["buildQuickReadPrompt", () => buildQuickReadPrompt("psychology", "We studied 120 students.").prompt, "reading one abstract quickly", "explain"],
  ["buildRankPrompt", () => buildRankPrompt("psychology", "does sleep help recall?", [paper(1)]).prompt, "ranking search results", "explain"],
  ["buildSuggestTermsPrompt", () => buildSuggestTermsPrompt("psychology", "sleep and recall").prompt, "suggesting search terms", "explain"],
  // The ask and the walk-through match no rule today, so they log as "other help"; pinned as it is.
  ["buildAskPrompt", () => buildAskPrompt("psychology", doc, "What was the sample?").prompt, "other help", "other"],
  ["buildWalkPrompt", () => buildWalkPrompt("psychology", doc, stage, "my first try").prompt, "other help", "other"],
  // Only RAJ and Dr Shuddhi Grant match a rule; the other three teachers log as "other help".
  ["buildLessonAskPrompt raj", () => lesson("raj"), "asking a teaching character about the practice paper", "explain"],
  ["buildLessonAskPrompt meera", () => lesson("meera"), "asking a teaching character about the practice paper", "explain"],
  ["buildLessonAskPrompt appu", () => lesson("appu"), "other help", "other"],
  ["buildLessonAskPrompt dev", () => lesson("dev"), "other help", "other"],
  ["buildLessonAskPrompt tara", () => lesson("tara"), "other help", "other"]
];

describe("the AI-use label of every prompt builder", () => {
  it.each(LABELS)("%s keeps its AI-use label", (_name, build, k, g) => {
    expect(classifyAiUse(build())).toEqual({ k, g });
  });
});
