import { describe, it, expect } from "vitest";
import { classifyAiUse } from "../../src/aiuse";
import { AP_NAME, AP_STAGES, apPick } from "../../src/analyse";
import type { ApDoc, ApStage } from "../../src/analyse";
import { fieldLabel } from "../../src/prompts";
import { AP_RULES, LESSON_QUESTION_MAX_CHARS, buildAskPrompt, buildLessonAskPrompt, buildWalkPrompt } from "../../src/prompts-analyse";
import { readFixture } from "./harness/fixture";

/**
 * The prompts of Analyse a paper (a question about the loaded paper, one stage of the walk-through, a question inside the guided lesson), against what v1 handed to callAI. Every expected value is
 * read from test/golden/prompts-analyse/cases.json (`golden:capture prompts-analyse`), which drives v1's own apAsk, apWalkShow and apLesAsk with callAI replaced by a recorder: `prompt` and `opts` are what
 * v1 passed, `doc` is AP.doc as v1 held it (apBuild's object plus the `abstractOnly` that apLoad adds, which the builders are handed as it is), `field` is v1's fieldName() and `stored` the raw appu_field
 * (null when unset), `pick` is `{ partial, n, of }` of the apPick call the entry made, re-run by the capture, and `aiu` is v1's aiuClassify(prompt). What is typed here is what the brief and the rulings say
 * the inputs are (the cuts, the options, the stage and teacher tables) and guards that the fixture holds the inputs it exists for.
 */

type Aiu = { k: string; g: string } | null;
type Pick = { partial: boolean; n: number; of: number };
type LoadedDoc = ApDoc & { abstractOnly?: boolean };
type Base = { field: string; stored: string | null; doc: LoadedDoc; prompt: string; opts: { temp: number; max: number; noLang: true }; aiu: Aiu };
type AskCase = Base & { entry: "apAsk"; question: string; pick: Pick };
type WalkCase = Base & { entry: "apWalkShow"; stage: ApStage; attempt: string; pick: Pick };
type Step = { k: string; title: string; said: string; flaw: string };
type LessonCase = Base & { entry: "apLesAsk"; lang: "en" | "hi"; step: Step; teacher: string; question: string };
type Fx = { asks: AskCase[]; walks: WalkCase[]; lessons: LessonCase[]; guards: { apLesAsk: { sends: number; refuses: number; message: string; inputMaxLength: number } } };

const fx = readFixture<Fx>("prompts-analyse", "cases");
const all: Base[] = [...fx.asks, ...fx.walks, ...fx.lessons];
const sampleWalks = fx.walks.filter((c) => c.doc.src === "pdf");
const stored = (cases: Base[]) => [...new Set(cases.map((c) => c.stored))];
const paperOf = (doc: ApDoc) => doc.chunks.filter((c) => !c.ref).map((c) => c.text).join("\n\n");
const nothing = (s: string) => s.trim() === "";

describe("Analyse a paper prompts equal v1's, character for character", () => {
  for (const c of fx.asks) it(`apAsk ${c.stored} ${c.doc.src} ${c.question.trim().slice(0, 20)} ${c.question.length}`, () => {
    const b = buildAskPrompt(c.field, c.doc, c.question);
    expect(b).toMatchObject({ prompt: c.prompt, temp: 0.2, max: 2000, noLang: true });
    const { pick, ...built } = b;
    expect(built).toEqual({ prompt: c.prompt, temp: 0.2, max: 2000, noLang: true });
    expect(built).toEqual({ prompt: c.prompt, ...c.opts });
    expect(pick).toEqual(c.pick);
  });
  for (const c of fx.walks) it(`apWalkShow ${c.stage.k} ${nothing(c.attempt) ? "no attempt" : "with attempt"} ${c.stored} ${c.doc.src} ${c.attempt.length}`, () => {
    const b = buildWalkPrompt(c.field, c.doc, c.stage, c.attempt);
    expect(b).toMatchObject({ prompt: c.prompt, temp: 0.2, max: 2000, noLang: true });
    const { pick, ...built } = b;
    expect(built).toEqual({ prompt: c.prompt, temp: 0.2, max: 2000, noLang: true });
    expect(built).toEqual({ prompt: c.prompt, ...c.opts });
    expect(pick).toEqual(c.pick);
  });
  for (const c of fx.lessons) it(`apLesAsk ${c.step.k} ${c.lang} ${c.stored} ${c.doc.src} ${c.question.length}`, () => {
    const b = buildLessonAskPrompt({ teacher: c.teacher, field: c.field, lang: c.lang, step: c.step, doc: c.doc, question: c.question });
    expect(b).toEqual({ prompt: c.prompt, temp: 0.4, max: 350, noLang: true });
    expect(b).toEqual({ prompt: c.prompt, ...c.opts });
  });
  it("the Hindi lesson prompt carries v1's Devanagari-script clause verbatim", () => expect(fx.lessons.find((c) => c.lang === "hi")!.prompt).toContain("(write in Hindi in Devanagari script, keeping technical terms such as p-value, t-test, sample and consent in English letters)"));
  it("the walk prompt is built over apPick(stage.name + ' ' + stage.brief, stage.terms, 10000)", () => {
    const c = fx.walks[0]!;
    const b = buildWalkPrompt(c.field, c.doc, c.stage, c.attempt);
    const pk = apPick(c.doc, c.stage.name + " " + c.stage.brief, c.stage.terms, 10000);
    expect(b.pick).toEqual({ partial: pk.partial, n: pk.n, of: pk.of });
    expect(b.pick).toEqual(c.pick);
    expect(b.prompt).toContain("PAPER START\n" + pk.text + "\nPAPER END");
  });
  it("every walk is built over apPick(stage.name + ' ' + stage.brief, stage.terms, 10000), and every ask over apPick(question, '', 9000) with the question as trimmed", () => {
    for (const c of fx.walks) {
      const pk = apPick(c.doc, c.stage.name + " " + c.stage.brief, c.stage.terms, 10000);
      expect(c.pick, c.stage.k).toEqual({ partial: pk.partial, n: pk.n, of: pk.of });
      expect(c.prompt.endsWith("PAPER START\n" + pk.text + "\nPAPER END"), c.stage.k).toBe(true);
    }
    for (const c of fx.asks) {
      const pk = apPick(c.doc, c.question.trim(), "", 9000);
      expect(c.pick, c.question.slice(0, 20)).toEqual({ partial: pk.partial, n: pk.n, of: pk.of });
      expect(c.prompt.endsWith("\n\nPAPER START\n" + pk.text + "\nPAPER END"), c.question.slice(0, 20)).toBe(true);
    }
  });
  it("classifyAiUse labels every prompt as v1's aiuClassify did", () => {
    for (const c of all) expect(classifyAiUse(c.prompt)).toEqual(c.aiu);
  });
});

describe("Analyse a paper fixtures hold the inputs they exist for", () => {
  it("the case counts: 7 asks, 28 walks (12 stages with an empty and a 900-character attempt on the practice paper, two more attempts, two stages on the pasted paper), 17 lessons", () => {
    expect(fx.asks).toHaveLength(7);
    expect(fx.walks).toHaveLength(12 * 2 + 2 + 2);
    expect(fx.lessons).toHaveLength(2 * 2 * 3 + 2 + 2 + 1);
    expect(sampleWalks).toHaveLength(12 * 2 + 2);
  });

  it("each of the three templates ran under appu_field unset, 'education' and a custom field of 70 characters, and fieldLabel gives v1's fieldName() for each", () => {
    for (const cases of [fx.asks, fx.walks, fx.lessons]) {
      const values = stored(cases);
      expect(values).toHaveLength(3);
      expect(values).toContain(null); // never set: v1 says psychology
      expect(values).toContain("education");
      expect(values.some((v) => typeof v === "string" && v.length === 70)).toBe(true);
    }
    for (const c of all) expect(fieldLabel(c.stored), String(c.stored)).toBe(c.field);
    for (const c of all) if (c.stored === null) expect(c.field).toBe("psychology");
    // the 70-character field is cut at a space (index 59): v1 trims first and cuts second, so the label keeps that trailing space, and the prompt carries it as it is
    const long = all.find((c) => c.stored !== null && c.stored.length === 70)!;
    expect(long.field).toHaveLength(60);
    expect(long.field.endsWith(" ")).toBe(true);
    for (const c of fx.asks) expect(c.prompt.startsWith("You are a careful teacher helping an undergraduate student of " + c.field + " read a research paper. The student has asked a question about it.\n" + AP_RULES + "\n"), c.field).toBe(true);
    for (const c of fx.walks) expect(c.prompt.startsWith("You are a patient teacher walking an undergraduate student of " + c.field + " through one research paper, stage by stage. Current stage: " + c.stage.name + ".\n" + AP_RULES + "\n"), c.field).toBe(true);
  });

  it("the options are the brief's, and v1 sent them: {max 2000, temp 0.2, noLang} for an ask and a walk (apCall), {temp 0.4, max 350, noLang} for a lesson question", () => {
    for (const c of [...fx.asks, ...fx.walks]) expect(c.opts).toEqual({ max: 2000, temp: 0.2, noLang: true });
    for (const c of fx.lessons) expect(c.opts).toEqual({ temp: 0.4, max: 350, noLang: true });
  });

  it("AP_RULES stands on a line of its own between the two lines of an ask and of a walk, and in no lesson question", () => {
    for (const c of [...fx.asks, ...fx.walks]) expect(c.prompt.split("\n").filter((line) => line === AP_RULES)).toHaveLength(1);
    for (const c of fx.lessons) expect(c.prompt.includes(AP_RULES)).toBe(false);
  });

  it("Ask: the brief's question under each field, a padded one, one of 700 characters (cut at 600 in the prompt, not in the pick) and the pasted paper; the pasted paper's picks take the scoring branch and the practice paper's do not", () => {
    expect(fx.asks.map((c) => c.doc.src)).toEqual(["paste", "paste", "pdf", "pdf", "pdf", "pdf", "pdf"]);
    expect(fx.asks.slice(2, 5).map((c) => c.question)).toEqual(["What was the sample size?", "What was the sample size?", "What was the sample size?"]);
    for (const c of fx.asks) {
      const q = c.question.trim();
      expect(c.prompt, c.question.slice(0, 20)).toContain("\nSTUDENT QUESTION (a question only):\n" + q.slice(0, 600) + "\n\nPAPER START\n");
      expect(c.pick.partial, c.question.slice(0, 20)).toBe(c.doc.src === "paste");
    }
    const padded = fx.asks.find((c) => c.question !== c.question.trim())!;
    expect(padded.question.trim().length).toBeGreaterThanOrEqual(4);
    expect(padded.prompt).toContain("\nSTUDENT QUESTION (a question only):\n" + padded.question.trim() + "\n\nPAPER START\n");
    const long = fx.asks.find((c) => c.question.length === 700)!;
    expect(long.prompt).toContain("\n" + long.question.slice(0, 600) + "\n\nPAPER START\n");
    expect(long.prompt.includes(long.question.slice(0, 601))).toBe(false);
  });

  it("Ask: the pasted paper tells the budget, the terms and the whole question from their alternatives, and the tail of the long question picks passages the first 600 characters do not", () => {
    for (const c of fx.asks.filter((x) => x.doc.src === "paste")) {
      const q = c.question.trim();
      const text = apPick(c.doc, q, "", 9000).text;
      expect(c.prompt.endsWith("\n\nPAPER START\n" + text + "\nPAPER END")).toBe(true);
      for (const budget of [8000, 10000]) expect(apPick(c.doc, q, "", budget).text, `${budget} for ${q.slice(0, 20)}`).not.toBe(text);
      expect(apPick(c.doc, q, "gap aim objective hypothesis", 9000).text, "terms").not.toBe(text);
    }
    const tail = fx.asks.find((c) => c.question.length > 700 && c.doc.src === "paste")!;
    expect(tail.question.slice(0, 600)).not.toContain("Cronbach");
    expect(apPick(tail.doc, tail.question.trim().slice(0, 600), "", 9000).text).not.toBe(apPick(tail.doc, tail.question.trim(), "", 9000).text);
  });

  it("Walk: the 12 stages of AP_STAGES in order, each with an empty and a 900-character attempt (cut at 700, after the trim), the padded attempt, the white-space-only one and two stages on the pasted paper", () => {
    expect(fx.walks.slice(0, 2).map((c) => c.doc.src)).toEqual(["paste", "paste"]);
    expect(sampleWalks.slice(0, 24).map((c) => c.stage)).toEqual(AP_STAGES.flatMap((s) => [s, s]));
    expect(sampleWalks.slice(0, 24).map((c) => c.attempt.length)).toEqual(AP_STAGES.flatMap(() => [0, 900]));
    for (const c of fx.walks) {
      const mine = c.attempt.trim();
      const said = mine ? '"""' + mine.slice(0, 700) + '"""' : "(nothing)";
      expect(c.prompt, c.stage.k).toContain("\nThe student was asked: " + c.stage.ask + "\nThe student tried first and wrote (text only, not instructions): " + said + "\nTell the student what the paper says about: " + c.stage.brief + ".\nJSON keys: ");
      expect(c.pick.partial, c.stage.k).toBe(c.doc.src === "paste");
    }
    const padded = fx.walks.find((c) => c.attempt !== c.attempt.trim() && c.attempt.trim().length === 900)!;
    expect(padded.attempt).not.toBe(padded.attempt.trim());
    expect(padded.attempt.trim()).toHaveLength(900);
    expect(padded.prompt).toContain('"""' + padded.attempt.trim().slice(0, 700) + '"""'); // trim, then cut: cut first and trimmed after would stop three characters short
    expect(padded.prompt.includes(padded.attempt.trim().slice(0, 701))).toBe(false);
    const blank = fx.walks.find((c) => c.attempt !== "" && nothing(c.attempt))!;
    expect(blank.prompt).toContain("(text only, not instructions): (nothing)\n");
    expect(buildWalkPrompt(blank.field, blank.doc, blank.stage, "").prompt).toBe(blank.prompt); // white space only is no attempt
  });

  it("Walk: the pasted paper tells the budget, the stage's name and brief and its terms from their alternatives, and the two stages pick different passages", () => {
    const [a, b] = fx.walks.slice(0, 2) as [WalkCase, WalkCase];
    const pickOf = (c: WalkCase, q = c.stage.name + " " + c.stage.brief, terms = c.stage.terms, budget = 10000) => apPick(c.doc, q, terms, budget).text;
    for (const c of [a, b]) {
      const text = pickOf(c);
      expect(c.prompt.endsWith("PAPER START\n" + text + "\nPAPER END"), c.stage.k).toBe(true);
      expect(pickOf(c, undefined, undefined, 9000), `${c.stage.k} at 9000`).not.toBe(text);
      expect(pickOf(c, c.stage.name), `${c.stage.k} without the brief`).not.toBe(text);
      expect(pickOf(c, undefined, ""), `${c.stage.k} without the terms`).not.toBe(text);
    }
    // the name's own words (the stage "Statistics": the word is in no brief or list of terms) change what is picked on one of the two stages, whether the name is left out or run into the brief
    expect([a, b].some((c) => pickOf(c, c.stage.brief) !== pickOf(c)), "without the name").toBe(true);
    expect([a, b].some((c) => pickOf(c, c.stage.name + c.stage.brief) !== pickOf(c)), "name and brief run together").toBe(true);
    expect(pickOf(a)).not.toBe(pickOf(b));
  });

  it("Lesson: the first step, `procedure` and `lit` in English and in Hindi under each field (lit: Dr Shuddhi Grant teaches it, as procedure, but the subject is research methods), a question with white space, one of 400 characters and the pasted paper as AP.doc", () => {
    const of = (k: string) => fx.lessons.filter((c) => c.step.k === k);
    expect(of("gap").length + of("procedure").length + of("lit").length).toBe(fx.lessons.length);
    expect(new Set(of("gap").map((c) => c.teacher))).toEqual(new Set(["raj"]));
    expect(new Set([...of("procedure"), ...of("lit")].map((c) => c.teacher))).toEqual(new Set(["meera"]));
    for (const c of fx.lessons) {
      const subject = c.step.k === "procedure" ? "research ethics" : "research methods";
      expect(c.prompt.startsWith("You are " + AP_NAME[c.teacher] + ", an AI teaching character: a dry, kind professor of " + subject + " who speaks to an undergraduate student of " + c.field + ". Answer the student's question in two to four plain sentences in simple, everyday words"), `${c.step.k} ${c.lang}`).toBe(true);
      expect(c.prompt.includes("(write in Hindi in Devanagari script"), `${c.step.k} ${c.lang}`).toBe(c.lang === "hi");
      expect(c.prompt).toContain("\n\nLESSON NOTES FOR THIS STEP\n" + c.step.title + ". What the paper says: " + c.step.said + " The weakness planted here: " + c.step.flaw + "\n\nPRACTICE PAPER (fictional, written for teaching)\n");
      const q = c.question.replace(/\s+/g, " ").trim();
      expect(c.prompt.endsWith("\n\nSTUDENT QUESTION START\n" + q + "\nSTUDENT QUESTION END"), `${c.step.k} ${c.lang}`).toBe(true);
      expect(c.prompt).toContain("\n\nPRACTICE PAPER (fictional, written for teaching)\n" + paperOf(c.doc).slice(0, 6500) + "\n\nSTUDENT QUESTION START\n");
    }
    for (const lang of ["en", "hi"] as const) for (const k of ["gap", "procedure"]) expect(stored(fx.lessons.filter((c) => c.lang === lang && c.step.k === k && c.doc.src === "pdf" && c.question === "Why does the coin toss matter?"))).toHaveLength(3);
    const spaced = fx.lessons.find((c) => c.question !== c.question.replace(/\s+/g, " ").trim())!;
    expect(spaced.question).toMatch(/ {2}|\t/);
    expect(spaced.question.trim()).not.toBe(spaced.question); // and it has white space at its ends
    expect(spaced.prompt.endsWith("\n\nSTUDENT QUESTION START\nWhy does the coin toss matter for this step?\nSTUDENT QUESTION END")).toBe(true);
    expect(fx.lessons.some((c) => c.question.length === 400 && c.prompt.endsWith("\n\nSTUDENT QUESTION START\n" + c.question + "\nSTUDENT QUESTION END"))).toBe(true);
  });

  it("Lesson: the practice paper (about 5,300 characters) never reaches the cut at 6,500, so one lesson is asked with the pasted paper, whose text the prompt cuts there", () => {
    const small = fx.lessons.filter((c) => c.doc.src === "pdf");
    for (const c of small) expect(paperOf(c.doc).length).toBeLessThan(6500);
    const big = fx.lessons.filter((c) => c.doc.src === "paste");
    expect(big).toHaveLength(1);
    expect(paperOf(big[0]!.doc).length).toBeGreaterThan(6500);
    expect(big[0]!.prompt.includes(paperOf(big[0]!.doc).slice(0, 6501))).toBe(false);
    expect(big[0]!.prompt).toContain(paperOf(big[0]!.doc).slice(0, 6500) + "\n\nSTUDENT QUESTION START\n");
    expect(fx.lessons.at(-1)).toBe(big[0]);
  });

  it("the guard constant is the largest question apLesAsk sends and the box's own maxlength (the capture tries every size); the builder does not cut, so a question of 400 characters is in the prompt whole", () => {
    const g = fx.guards.apLesAsk;
    expect(LESSON_QUESTION_MAX_CHARS).toBe(g.sends);
    expect(LESSON_QUESTION_MAX_CHARS + 1).toBe(g.refuses);
    expect(LESSON_QUESTION_MAX_CHARS).toBe(g.inputMaxLength);
    expect(g.message).toContain(String(LESSON_QUESTION_MAX_CHARS)); // v1 tells the student, which is the panel's to do
    const c = fx.lessons.find((x) => x.question.length === LESSON_QUESTION_MAX_CHARS)!;
    expect(c.prompt).toContain("\nSTUDENT QUESTION START\n" + c.question + "\nSTUDENT QUESTION END");
    const longer = buildLessonAskPrompt({ teacher: c.teacher, field: c.field, lang: c.lang, step: c.step, doc: c.doc, question: "x".repeat(LESSON_QUESTION_MAX_CHARS + 1) });
    expect(longer.prompt).toContain("\nSTUDENT QUESTION START\n" + "x".repeat(LESSON_QUESTION_MAX_CHARS + 1) + "\nSTUDENT QUESTION END");
  });
});
