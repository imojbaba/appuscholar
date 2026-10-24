import { classifyAiUse } from "./aiuse";
import type { AiUseGroup } from "./aiuse";

/*
 * classifyAiUseV2: classifyAiUse (v1's aiuClassify, index.html:5405-5445, ported in aiuse.ts and never edited) with four rules in front of v1's, so that four kinds of
 * request which v1 logged as "other help", or under another kind's label, get a label of their own in the AI-use statement a student hands in. OJ said yes on
 * 2026-10-21 (wave B plan, decision 7); register D-S2-136 asks Dr. Sharma about the words. The route (apps/api/src/routes/ai.ts) logs this function; entries already stored keep the
 * label they were stored with, and nothing rewrites the log.
 *
 * Each new rule is matched on the fixed opening words of the builder that writes the prompt, anchored at the start, up to the point where the field of study, the
 * lesson's teacher or the student's own text comes in (the field is up to 60 characters, so v1's rules, which allow a gap of 40, are not used as a model):
 *   buildAskPrompt (prompts-analyse.ts)        "You are a careful teacher helping an undergraduate student of ..."      "asking questions about a paper", explain
 *   buildWalkPrompt (prompts-analyse.ts)       "You are a patient teacher walking an undergraduate student of ..."      "working through a paper section by section", feedback
 *   buildHelperPrompt("stats") (prompts-helpers.ts)  "You are an APA 7th edition formatting expert. Convert the statistical output after the word Text:"   "explaining statistics", explain
 *   buildLessonAskPrompt (prompts-analyse.ts)  "You are <teacher>, an AI teaching character: a dry, kind professor of ..."   "a guided lesson on a paper", explain
 * No other builder's prompt starts with any of these words (the test pins every builder the app uses), so every other prompt falls through to classifyAiUse and keeps
 * v1's label, including the "You are Appu, the help assistant" prompt that v1 does not log. The lesson rule takes precedence over v1's rule 21, so a lesson question
 * to Professor RAJ or Dr Shuddhi Grant is no longer "asking a teaching character about the practice paper": the lesson has one label whoever the teacher is.
 */
const AIU_RULES_V2: Array<[RegExp, string, AiUseGroup]> = [
  [/^You are a careful teacher helping an undergraduate student of /, "asking questions about a paper", "explain"],
  [/^You are a patient teacher walking an undergraduate student of /, "working through a paper section by section", "feedback"],
  [/^You are an APA 7th edition formatting expert\. Convert the statistical output after the word Text:/, "explaining statistics", "explain"],
  [/^You are [^,\n]{1,40}, an AI teaching character: a dry, kind professor of /, "a guided lesson on a paper", "explain"]
];

/** Kind of help a prompt represents, or null for the Appu help assistant (not logged): the four rules above, then v1's. */
export function classifyAiUseV2(prompt: string): { k: string; g: AiUseGroup } | null {
  const head = String(prompt || "").slice(0, 400);
  for (const [re, k, g] of AIU_RULES_V2) if (re.test(head)) return { k, g };
  return classifyAiUse(prompt);
}
