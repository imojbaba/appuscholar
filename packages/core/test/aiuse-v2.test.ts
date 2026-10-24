import { describe, it, expect } from "vitest";
import { classifyAiUse } from "../src/aiuse";
import type { AiUseGroup } from "../src/aiuse";
import { classifyAiUseV2 } from "../src/aiuse-v2";
import { aiuBuildV2 } from "../src/aiustatementV2";
import type { AiuEntry } from "../src/aiustatement";
import { PROVIDERS } from "../src/providers";
import { buildWritingPrompt } from "../src/prompts";
import { buildHelperPrompt } from "../src/prompts-helpers";
import { buildAskPrompt, buildWalkPrompt, buildLessonAskPrompt } from "../src/prompts-analyse";
import { apBuild, AP_STAGES } from "../src/analyse";
import { readFixture } from "./golden/harness/fixture";

/**
 * Task Q3 (OJ's yes, decision 7, register D-S2-136): classifyAiUseV2 is classifyAiUse (v1's port, never edited) with three rules in front of v1's, so three
 * kinds of request that v1 logged as "other help", or under another kind's label, get a label of their own. Each rule is matched on the fixed opening words of
 * its builder, quoted below and checked against the real builder's prompt, so a reworded prompt breaks the test and not the log. Every other prompt keeps
 * v1's label: the builders' rows are pinned in aiuse-labels.test.ts, and the 59 prompts of v1's own AIU_RULES capture are compared here.
 * The statistics helper ("Format results in APA") has no rule of its own (ruling B3-R3): it writes text for the student, so v1's label stays.
 */
const doc = apBuild("Practice paper", ["Abstract\nWe studied 120 students.\n\nMethod\nSurvey of students in Delhi.\n\nResults\nSleep predicted recall."], "pdf");
const stage = AP_STAGES[0]!;
const step = { k: "procedure", title: "Consent", said: "Participants consented.", flaw: "No consent form is shown." };
const lesson = (teacher: "appu" | "raj" | "meera" | "dev" | "tara", field = "psychology"): string => buildLessonAskPrompt({ teacher, field, lang: "en", step, doc, question: "why does this matter?" }).prompt;
const label = (k: string, g: AiUseGroup) => ({ k, g });

/** The fixed opening words of each builder's prompt, as the builder writes them before anything the student or the field adds. STATS_OPENING has no rule: it is pinned to show v1's rule 6 still files it. */
const ASK_OPENING = "You are a careful teacher helping an undergraduate student of ";
const WALK_OPENING = "You are a patient teacher walking an undergraduate student of ";
const STATS_OPENING = "You are an APA 7th edition formatting expert. Convert the statistical output after the word Text:";
const LESSON_OPENING = ", an AI teaching character: a dry, kind professor of ";

describe("classifyAiUseV2: the three new labels", () => {
  it("a question about a paper (buildAskPrompt) is 'asking questions about a paper', explain", () => {
    const p = buildAskPrompt("psychology", doc, "What was the sample?").prompt;
    expect(p.startsWith(ASK_OPENING)).toBe(true);
    expect(classifyAiUseV2(p)).toEqual(label("asking questions about a paper", "explain"));
    // v1's port is not edited: it still logs this prompt as "other help".
    expect(classifyAiUse(p)).toEqual(label("other help", "other"));
  });

  it("a walk-through stage (buildWalkPrompt) is 'working through a paper section by section', feedback", () => {
    const p = buildWalkPrompt("psychology", doc, stage, "my first try").prompt;
    expect(p.startsWith(WALK_OPENING)).toBe(true);
    expect(classifyAiUseV2(p)).toEqual(label("working through a paper section by section", "feedback"));
    expect(classifyAiUse(p)).toEqual(label("other help", "other"));
  });

  it("the statistics helper (buildHelperPrompt 'stats', the \"Format results in APA\" button) keeps v1's label: it writes text for the student (ruling B3-R3)", () => {
    const p = buildHelperPrompt("stats", "psychology", "t(58) = 2.36, p = .022").prompt;
    expect(p.startsWith(STATS_OPENING)).toBe(true);
    expect(classifyAiUseV2(p)).toEqual(label("formatting statistics output in APA style", "text"));
    expect(classifyAiUseV2(p)).toEqual(classifyAiUse(p));
  });

  it("a question in the guided lesson (buildLessonAskPrompt) is 'a guided lesson on a paper', explain, for each of the five teachers", () => {
    for (const teacher of ["appu", "raj", "meera", "dev", "tara"] as const) {
      const p = lesson(teacher);
      expect(p.startsWith("You are "), teacher).toBe(true);
      expect(p, teacher).toContain(LESSON_OPENING);
      expect(classifyAiUseV2(p), teacher).toEqual(label("a guided lesson on a paper", "explain"));
    }
    // v1: Professor RAJ and Dr Shuddhi Grant matched a rule of their own, the other three were "other help".
    expect(classifyAiUse(lesson("raj"))).toEqual(label("asking a teaching character about the practice paper", "explain"));
    expect(classifyAiUse(lesson("meera"))).toEqual(label("asking a teaching character about the practice paper", "explain"));
    expect(classifyAiUse(lesson("tara"))).toEqual(label("other help", "other"));
  });

  it("the field the student chose does not matter, even the longest custom one (60 characters)", () => {
    const field = "x".repeat(60);
    expect(classifyAiUseV2(buildAskPrompt(field, doc, "What was the sample?").prompt)?.k).toBe("asking questions about a paper");
    expect(classifyAiUseV2(buildWalkPrompt(field, doc, stage, "").prompt)?.k).toBe("working through a paper section by section");
    expect(classifyAiUseV2(lesson("dev", field))?.k).toBe("a guided lesson on a paper");
  });

  it("the lesson in Hindi and a step other than consent are the same kind of request", () => {
    const hi = buildLessonAskPrompt({ teacher: "tara", field: "psychology", lang: "hi", step: { ...step, k: "design" }, doc, question: "यह क्यों ज़रूरी है?" }).prompt;
    expect(classifyAiUseV2(hi)).toEqual(label("a guided lesson on a paper", "explain"));
  });
});

describe("classifyAiUseV2: nothing else is caught", () => {
  it("each rule needs its words at the start of the prompt: after other words the prompt keeps whatever label v1 gives it", () => {
    for (const words of [ASK_OPENING, WALK_OPENING, STATS_OPENING, "You are Appu" + LESSON_OPENING]) {
      const p = "Note. " + words + "x";
      expect(classifyAiUseV2(p)).toEqual(classifyAiUse(p));
    }
    // v1's rule 6 finds "APA 7th edition formatting expert" anywhere in the first 400 characters; the new rules find nothing.
    expect(classifyAiUseV2("Note. " + STATS_OPENING)).toEqual(label("formatting statistics output in APA style", "text"));
    expect(classifyAiUseV2("Note. " + ASK_OPENING + "x")).toEqual(label("other help", "other"));
  });

  it("the Appu help assistant is still not logged", () => {
    expect(classifyAiUseV2("You are Appu, the help assistant ...")).toBeNull();
  });

  it("prompts that read like the new ones but are not them keep v1's label", () => {
    // The Reading shelf's summary says "helping a student of ... read a paper" (v1 rule 14); the ask says "helping an undergraduate student".
    expect(classifyAiUseV2("You are helping a student of psychology read a paper.")).toEqual(label("summarising a paper", "explain"));
    // The statistics tutor of "Explain in plain language" (web, lib/tools/stats/explain.ts) is not the APA helper.
    expect(classifyAiUseV2("You are a statistics tutor for students of psychology. A student ran this analysis.")).toEqual(label("explaining statistics output in plain words", "explain"));
    // The teaching character without the lesson's own words after it is v1's rule 21.
    expect(classifyAiUseV2("You are Professor RAJ, an AI teaching character.")).toEqual(label("asking a teaching character about the practice paper", "explain"));
    expect(classifyAiUseV2("You are a careful teacher.")).toEqual(label("other help", "other"));
    expect(classifyAiUseV2("You are a patient teacher.")).toEqual(label("other help", "other"));
    expect(classifyAiUseV2("You are an APA 7th edition formatting expert.")).toEqual(label("formatting statistics output in APA style", "text"));
    expect(classifyAiUseV2(buildWritingPrompt("improve", "some text").prompt)).toEqual(label("grammar and polish", "text"));
  });

  it("an empty or missing prompt is 'other help', as in v1", () => {
    expect(classifyAiUseV2("")).toEqual(label("other help", "other"));
    expect(classifyAiUseV2(undefined as unknown as string)).toEqual(label("other help", "other"));
  });

  it("v1's own capture: every one of the 59 prompts (the three literals, a probe for each of the 26 rules, the gap and 400-character edges) keeps the label v1 gave it", () => {
    const fx = readFixture<{ cases: Array<{ id: string; prompt: string; out: { k: string; g: string } | null }> }>("aiuse", "cases");
    expect(fx.cases.length).toBeGreaterThanOrEqual(59);
    for (const c of fx.cases) expect(classifyAiUseV2(c.prompt), c.id).toEqual(c.out);
  });
});

describe("the AI-use statement carries the three new labels, and the APA formatter stays with the text the AI wrote", () => {
  const day = (n: number) => `2026-10-${String(n).padStart(2, "0")}`;
  const requests: Array<[string, string]> = [
    [day(1), buildAskPrompt("psychology", doc, "What was the sample?").prompt],
    [day(2), buildAskPrompt("psychology", doc, "How was anxiety measured?").prompt],
    [day(3), buildHelperPrompt("stats", "psychology", "t(58) = 2.36, p = .022").prompt],
    [day(4), lesson("raj")],
    [day(5), buildWalkPrompt("psychology", doc, stage, "my first try").prompt],
    [day(6), buildWritingPrompt("improve", "some text").prompt]
  ];
  const list: AiuEntry[] = requests.map(([d, prompt]) => {
    const kind = classifyAiUseV2(prompt)!;
    return { d, p: "groq", m: "openai/gpt-oss-120b", k: kind.k, g: kind.g };
  });
  const keep = Object.fromEntries(list.map((x) => [x.k, 1 as const]));
  const TICKS = { own: true, reword: true, cite: false, facts: false, noData: false };
  const statement = (fmt: string, ticks = TICKS): string => (aiuBuildV2({ list, keep, other: "", fmt, ticks, style: { on: false, decl: "", samples: 0 }, providers: PROVIDERS }) as { text: string }).text;

  it("the logged entries are what the classifier said", () => {
    expect(list.map((x) => x.k)).toEqual([
      "asking questions about a paper", "asking questions about a paper", "formatting statistics output in APA style", "a guided lesson on a paper",
      "working through a paper section by section", "grammar and polish"
    ]);
  });

  it("each label is in the sentence of its group, with its count, in a course statement", () => {
    const s = statement("course");
    expect(s).toContain("The AI explained or summarised material for me: asking questions about a paper (2 requests) and a guided lesson on a paper (1 request).");
    expect(s).toContain("The AI commented on my work or ideas without writing them: working through a paper section by section (1 request).");
    // The APA formatter's request sits with the text the AI wrote, next to the polish, not with the explanations.
    expect(s).toContain("The AI produced or reworded text for me in these ways: formatting statistics output in APA style (1 request) and grammar and polish (1 request).");
    expect(s).not.toContain("explaining statistics");
    expect(s).not.toContain("other help");
    expect(s).not.toContain("The AI helped in other ways");
  });

  it("the APA formatter's request carries the produced-text reminder when the student did not tick that they reworded it, and not when they did", () => {
    const reminder = "[Say which passages still contain AI wording, since you did not tick that you rewrote it.]";
    expect(statement("course", { ...TICKS, reword: false })).toContain(reminder);
    expect(statement("course")).not.toContain(reminder);
    // Without the APA formatter and the polish there is no produced text, so no reminder: the explanations and the walk-through never ask for one.
    const onlyNew = list.filter((x) => x.g !== "text");
    const s = (aiuBuildV2({ list: onlyNew, keep, other: "", fmt: "course", ticks: { ...TICKS, reword: false }, style: { on: false, decl: "", samples: 0 }, providers: PROVIDERS }) as { text: string }).text;
    expect(s).not.toContain(reminder);
  });

  it("the same in a thesis statement and a journal declaration", () => {
    expect(statement("thesis")).toContain("formatting statistics output in APA style (1 request) and grammar and polish (1 request).");
    const j = statement("journal");
    expect(j).toContain("The AI explained or summarised material for the author: asking questions about a paper (2 requests) and a guided lesson on a paper (1 request).");
    expect(j).toContain("The AI commented on the author's work or ideas without writing them: working through a paper section by section (1 request).");
    expect(j).toContain("The AI produced or reworded text for the author in these ways: formatting statistics output in APA style (1 request) and grammar and polish (1 request).");
  });

  it("the statement is English whatever language the screen is in: no other text is built from a label, so there is no table of labels to add Hindi to", () => {
    // aiuBuild writes every sentence in English (v1 as well) and prints a label as logged; nothing maps a label to other words.
    for (const x of list) expect(statement("course")).toContain(x.k);
    expect(/[ऀ-ॿ]/.test(statement("course"))).toBe(false);
  });
});
