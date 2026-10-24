import { describe, it, expect } from "vitest";
import {
  AP_STAGES, apBuild, buildAskPrompt, buildGapFinderPromptV2, buildIdeaPromptV2, buildLitReviewPrompt, buildShelfSummaryPromptV2, buildWalkPrompt,
  contentLangInstruction, fieldLabel
} from "@appuscholar/core";
import type { Built } from "@appuscholar/core";
import { runSet, PROMPT_MAX_CHARS } from "../src/run";
import { SETS, SET_NAMES } from "../src/sets";
import type { AbstractPaper, AskInput, GapInput, IdeaInput, QualityItem, QualitySet, SetName, SummaryInput, WalkInput } from "../src/sets";

/* ---- helpers ------------------------------------------------------------------------------------------------------------------------------------ */

type Call = { prompt: string; o: { temperature?: number; maxTokens?: number } };
/** A fake `complete`: it records every call and answers with `reply(prompt, index of the call)`. */
function fake(reply: (prompt: string, n: number) => string | Promise<string>) {
  const calls: Call[] = [];
  const complete = async (prompt: string, o: { temperature?: number; maxTokens?: number }): Promise<string> => { calls.push({ prompt, o }); return reply(prompt, calls.length - 1); };
  return { calls, complete };
}
const only = (set: QualitySet, ...ids: string[]): QualitySet => ({ ...set, items: set.items.filter((i) => ids.includes(i.id)) });
const item = (set: QualitySet, id: string): QualityItem => set.items.find((i) => i.id === id)!;
/** The line of a markdown table that starts with the cell `first`, as its cells. */
function row(md: string, first: string): string[] {
  const line = md.split("\n").find((l) => l.startsWith("| " + first + " |"));
  if (!line) throw new Error("no table row for " + first);
  return line.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim());
}
const head = (md: string): string[] => (md.split("\n").find((l) => l.startsWith("| Item |")) ?? "").split("|").slice(1, -1).map((c) => c.trim());

/** What the web sends for an English-language student, item by item (apps/web/lib/ai/actions.ts, lib/analyse/ask.ts, lib/analyse/walk.ts), made with the builders directly. */
function webBuilt(name: SetName): Built[] {
  const out: Built[] = [];
  for (const it of SETS[name].items) {
    if (name === "idea") { const i = it.input as IdeaInput; out.push(buildIdeaPromptV2(fieldLabel(i.field), i.idea)); }
    if (name === "summary") { const i = it.input as SummaryInput; out.push(buildShelfSummaryPromptV2(fieldLabel(i.field), [i.paper.text!])); }
    if (name === "gap" || name === "litreview") {
      const i = it.input as GapInput;
      const papers = i.papers.map((p: AbstractPaper) => ({ ...p, abstract: p.abstract ?? undefined }));
      out.push((name === "gap" ? buildGapFinderPromptV2 : buildLitReviewPrompt)(fieldLabel(i.field), papers));
    }
    if (name === "ask") { const i = it.input as AskInput; const doc = apBuild(i.paper.title, [i.paper.text!], "pdf"); for (const q of i.questions) out.push(buildAskPrompt(fieldLabel(i.field), doc, q)); }
    if (name === "walk") { const i = it.input as WalkInput; out.push(buildWalkPrompt(fieldLabel(i.field), apBuild(i.paper.title, [i.paper.text!], "pdf"), AP_STAGES.find((s) => s.k === i.stage.k)!, i.stage.attempt)); }
  }
  return out;
}

/* ---- recorded replies, written by hand ------------------------------------------------------------------------------------------------------ */

// summary-sleep-gpa-female: 201 female students at Qassim University, PSQI, self-reported GPA; the authors name four limitations.
const SUMMARY_GOOD = [
  "Aim: To evaluate how sleep patterns and sleep quality relate to academic performance in female university students.",
  "Method: A cross-sectional questionnaire completed online by 201 female students at Qassim University, Saudi Arabia. Sleep quality was measured with the Pittsburgh Sleep Quality Index and academic performance with self-reported GPA.",
  "Key findings: Sleep quality was generally poor (mean PSQI 8.81). Worse sleep went with a lower GPA (p = 0.0047), but once other variables were adjusted for, the link was no longer significant (p = 0.138).",
  "Limitations: The design is cross-sectional, so it cannot show cause. GPA was self-reported and may be biased. Only female students from a single university took part. The authors did not assess chronotype."
].join("\n");
const SUMMARY_BAD = [
  "Aim: To study sleep and grades in students.",
  "Method: A survey of 412 students in Saudi Arabia.",
  "Key findings: Students who slept badly had lower marks (p < 0.001, r = 0.45).",
  "Limitations: Not reported."
].join("\n");

// ask-exercise-emotion-henan: 8,899 undergraduates in Henan Province, stratified cluster sampling; the paper says nothing about family income.
const QUOTE_HENAN = "A cross-sectional design was employed, with 8,899 undergraduates recruited from higher education institutions in Henan Province through stratified cluster sampling.";
const ASK_Q1_GOOD = JSON.stringify({ in_paper: true, answer: "The study had 8,899 undergraduates from Henan Province, China. They were recruited from higher education institutions through stratified cluster sampling.", quotes: [QUOTE_HENAN] });
const ASK_Q1_BAD = JSON.stringify({ in_paper: true, answer: "About 6,200 students took part. They were chosen by convenience from colleges around the province.", quotes: ["A cross-sectional design was used with 6,200 undergraduates chosen by convenience from colleges in Henan Province."] });
const ASK_Q2_GOOD = JSON.stringify({ in_paper: false, answer: "This paper does not say whether a student's family income changed how exercise adherence and emotion regulation were linked. It tests sleep quality and self-efficacy as the links.", quotes: [] });
const ASK_Q2_BAD = JSON.stringify({ in_paper: true, answer: "Yes. Students from families earning above 7,500 yuan a month showed a stronger link between exercise adherence and emotion regulation.", quotes: ["Family income moderated the link between exercise adherence and emotion regulation among students."] });

// walk-sleep-marks-saudi-sample: 130 male students, convenience sampling.
const QUOTE_SAUDI = "Male undergraduate students enrolled in the College of Applied Medical Sciences (560 students) were invited to participate via convenience sampling.";
const WALK_GOOD = JSON.stringify({
  reading: "You found the size of the sample and how the students were picked. The paper says 130 male undergraduates took part, and that they were invited by convenience sampling from a college of 560 students. You did not say that all of them studied health-related subjects.",
  quotes: [QUOTE_SAUDI], not_stated: [], watch_for: "Judge whether male students of one health college can stand for male students in general.",
  check_question: "Why does convenience sampling limit what the results say about other students?", check_answer: "The students were not chosen at random, so those who took part may differ from those who did not."
});
const WALK_BAD = JSON.stringify({
  reading: "The sample was 200 students chosen at random from several universities.",
  quotes: ["Two hundred students were chosen at random from the universities of the region."], not_stated: [], watch_for: "Nothing.", check_question: "What was the sample?", check_answer: "200 students."
});

const IDEA_GOOD = [
  "Topic clarity and researchability: High. One routine, one outcome and one group, so a reader can see what is being tested.",
  "Access to participants or data: Medium. About sixty volunteers from your own college is workable, but you need to say how you will recruit them.",
  "Time: Medium. One semester fits a one-week routine, but the exam dates decide when you can measure.",
  "Resources and equipment: High. A paper questionnaire needs no equipment.",
  "Ethical complexity: Medium. Volunteers and a short questionnaire are low risk, but the committee meets only once a month.",
  "Proceed with these modifications: book the committee date first and name the questionnaire."
].join("\n");
const IDEA_BAD = [
  "Area: High. The topic is clear.",
  "Area: Medium. Access is fine.",
  "Area: Medium. Time is enough.",
  "Area: High. Resources are fine.",
  "Area: Low. Ethics is simple.",
  "Proceed as planned."
].join("\n");

// gap-sleep-and-marks: Zhao 2026, Le et al. 2026, Yunusova et al. 2026, Al-Sowayan 2026.
const GAP_GOOD = [
  "Gap 1 (Population): Zhao (2026) and Al-Sowayan (2026) study university students and Le et al. (2026) high-school students in Vietnam, but none of them follows the same students from school into university. Research question: how does sleep quality change across that move?",
  "Gap 2 (Methodological): Yunusova et al. (2026) follow depressive symptoms over time, while Al-Sowayan (2026) relies on one self-reported GPA. Research question: do repeated objective grades give the same picture?",
  "Check each gap against the full papers before relying on it."
].join("\n\n");
const GAP_BAD = [
  "Gap 1 (Empirical): Paper 1 and Paper 2 both rely on self-report, while paper 3 follows students over time.",
  "Gap 2 (Population): Paper 4 studies only women, so men are missing."
].join("\n\n");

/* ---- the runner ----------------------------------------------------------------------------------------------------------------------------- */

describe("runSet", () => {
  it("runSet grades each recorded reply and writes the summary table", async () => {
    const set = only(SETS.summary, "summary-sleep-gpa-female");
    const { complete, calls } = fake((_p, n) => [SUMMARY_GOOD, SUMMARY_BAD, SUMMARY_GOOD][n]!);
    const report = await runSet(set, complete, { repeats: 3, provider: "groq", model: "openai/gpt-oss-120b", date: "2026-10-24" });
    expect(calls).toHaveLength(3);

    // The structured grades, reply by reply.
    const [r] = report.items;
    expect(r!.id).toBe("summary-sleep-gpa-female");
    expect(r!.replies.map((x) => x.grades.limitations?.hits.length)).toEqual([4, 0, 4]);
    expect(r!.replies.map((x) => x.grades.limitations?.notReported)).toEqual([false, true, false]);
    expect(r!.replies[0]!.grades.numbers?.foreign).toEqual([]);
    // accItems reads "0.45" as ".45"; "0.001" is in the paper.
    expect(r!.replies[1]!.grades.numbers?.foreign).toEqual(["412", ".45"]);
    expect(r!.label).toBe(true);
    expect(r!.replies.map((x) => x.text)).toEqual([SUMMARY_GOOD, SUMMARY_BAD, SUMMARY_GOOD]);

    // The header.
    const md = report.markdown;
    expect(md).toMatch(/^# Quality report: summary$/m);
    for (const line of ["- Set: summary", "- Builder: buildShelfSummaryPromptV2", "- Repeats: 3", "- Provider: groq", "- Model: openai/gpt-oss-120b", "- Date: 2026-10-24"]) expect(md).toContain(line);

    // The summary table: one row for the item, one column for each grade, the grades over the three repeats.
    expect(head(md)).toEqual(["Item", "Replies", "Limitations", "Not reported", "Numbers", "AI-use label"]);
    expect(row(md, "summary-sleep-gpa-female")).toEqual(["summary-sleep-gpa-female", "3/3", "found 4, 0, 4 of 4", "1/3 wrote not reported", "foreign numbers: 0, 2, 0", "right"]);

    // Then each reply in full, under its item, with its grades.
    const at = (s: string) => md.indexOf(s);
    expect(at("### summary-sleep-gpa-female")).toBeGreaterThan(at("| Item |"));
    expect(at("#### Reply 1 of 3")).toBeGreaterThan(at("### summary-sleep-gpa-female"));
    expect(at(SUMMARY_GOOD)).toBeGreaterThan(at("#### Reply 1 of 3"));
    expect(at("#### Reply 2 of 3")).toBeGreaterThan(at(SUMMARY_GOOD));
    expect(at(SUMMARY_BAD)).toBeGreaterThan(at("#### Reply 2 of 3"));
    expect(md).toContain("Limitations found: 4 of 4");
    expect(md).toContain("Wrote not reported under Limitations: yes");
    expect(md).toContain("Numbers not in the source: 412, .45");
    expect(md).toContain(item(set, "summary-sleep-gpa-female").good);
  });

  it("grades the ask set's replies: quotations, numbers, in_paper and the facts of the answer, one row for each question", async () => {
    const set = only(SETS.ask, "ask-exercise-emotion-henan");
    // Two questions, two repeats each: a good then a bad reply for each.
    const replies = [ASK_Q1_GOOD, ASK_Q1_BAD, ASK_Q2_GOOD, ASK_Q2_BAD];
    const { complete } = fake((_p, n) => replies[n]!);
    const report = await runSet(set, complete, { repeats: 2 });
    expect(report.items.map((i) => [i.id, i.part])).toEqual([["ask-exercise-emotion-henan", 1], ["ask-exercise-emotion-henan", 2]]);
    expect(report.items[0]!.question).toMatch(/^How many students took part/);

    const [q1, q2] = report.items;
    expect(q1!.replies.map((x) => x.grades.quotes)).toEqual([{ quotes: 1, found: 1 }, { quotes: 1, found: 0 }]);
    expect(q1!.replies.map((x) => x.grades.numbers?.foreign)).toEqual([[], ["6200"]]);
    expect(q1!.replies.map((x) => x.grades.inPaper)).toEqual([{ expected: true, got: true, ok: true }, { expected: true, got: true, ok: true }]);
    expect(q1!.replies.map((x) => x.grades.facts?.held)).toEqual([["8,899", "stratified cluster sampling"], []]);
    expect(q1!.label).toBeNull();

    expect(q2!.replies.map((x) => x.grades.inPaper?.ok)).toEqual([true, false]);
    expect(q2!.replies.map((x) => x.grades.quotes)).toEqual([{ quotes: 0, found: 0 }, { quotes: 1, found: 0 }]);
    expect(q2!.replies[0]!.grades.facts).toEqual({ expected: [], held: [], missing: [] });

    const md = report.markdown;
    expect(head(md)).toEqual(["Item", "Replies", "Quotations", "Numbers", "In paper", "Facts"]);
    expect(row(md, "ask-exercise-emotion-henan, question 1")).toEqual(["ask-exercise-emotion-henan, question 1", "2/2", "quotations found: 1/1, 0/1", "foreign numbers: 0, 1", "2/2 said in_paper true", "facts held: 2/2, 0/2"]);
    expect(row(md, "ask-exercise-emotion-henan, question 2")).toEqual(["ask-exercise-emotion-henan, question 2", "2/2", "quotations found: 0/0, 0/1", "foreign numbers: 0, 1", "1/2 said in_paper false", "no facts to check"]);
    expect(md).toContain("Did a student's family income change how exercise adherence and emotion regulation were linked?");
    expect(md).toContain("Facts held: 0 of 2 (missing: 8,899, stratified cluster sampling).");
  });

  it("grades the walk-through's replies: quotations, numbers and the facts of the reading", async () => {
    const set = only(SETS.walk, "walk-sleep-marks-saudi-sample");
    const { complete } = fake((_p, n) => [WALK_GOOD, WALK_BAD][n]!);
    const report = await runSet(set, complete, { repeats: 2 });
    const [r] = report.items;
    expect(r!.part).toBeUndefined();
    expect(r!.replies.map((x) => x.grades.quotes)).toEqual([{ quotes: 1, found: 1 }, { quotes: 1, found: 0 }]);
    // 130 is in the student's own words and in the paper; 560 is in the paper; 200 is in neither.
    expect(r!.replies.map((x) => x.grades.numbers?.foreign)).toEqual([[], ["200"]]);
    expect(r!.replies.map((x) => x.grades.facts?.held)).toEqual([["130", "convenience sampling"], []]);
    expect(row(report.markdown, "walk-sleep-marks-saudi-sample")).toEqual(["walk-sleep-marks-saudi-sample", "2/2", "quotations found: 1/1, 0/1", "foreign numbers: 0, 1", "facts held: 2/2, 0/2"]);
  });

  it("grades the idea check's areas and the AI-use label", async () => {
    const set = only(SETS.idea, "idea-walk-bedtime");
    const { complete } = fake((_p, n) => [IDEA_GOOD, IDEA_BAD, IDEA_GOOD][n]!);
    const report = await runSet(set, complete, { repeats: 3 });
    const [r] = report.items;
    expect(r!.replies.map((x) => x.grades.areas?.named.length)).toEqual([5, 0, 5]);
    expect(r!.replies[1]!.grades.areas?.missing).toHaveLength(5);
    expect(r!.label).toBe(true);
    expect(head(report.markdown)).toEqual(["Item", "Replies", "Areas", "AI-use label"]);
    expect(row(report.markdown, "idea-walk-bedtime")).toEqual(["idea-walk-bedtime", "3/3", "2/3 named all 5 areas", "right"]);
    expect(report.markdown).toContain("Areas named: 0 of 5 (missing: Topic clarity and researchability, Access to participants or data, Time, Resources and equipment, Ethical complexity)");
  });

  it("grades the gap finder and the literature review by the papers they name, and by their numbers", async () => {
    for (const name of ["gap", "litreview"] as const) {
      const set = only(SETS[name], name + "-sleep-and-marks");
      const { complete } = fake((_p, n) => [GAP_GOOD, GAP_BAD][n]!);
      const report = await runSet(set, complete, { repeats: 2 });
      const [r] = report.items;
      expect(r!.replies[0]!.grades.names).toMatchObject({ numbered: false, named: ["Zhao", "Le", "Yunusova", "Al-Sowayan"] });
      expect(r!.replies[1]!.grades.names).toMatchObject({ numbered: true, named: [] });
      expect(r!.replies.map((x) => x.grades.numbers?.foreign)).toEqual([[], []]);
      expect(r!.label).toBe(true);
      expect(head(report.markdown)).toEqual(["Item", "Replies", "Papers named", "Numbered", "Numbers", "AI-use label"]);
      expect(row(report.markdown, name + "-sleep-and-marks")).toEqual([name + "-sleep-and-marks", "2/2", "named 4, 0 of 4 (needs 3)", "1/2 named papers by number", "foreign numbers: 0, 0", "right"]);
    }
  });

  it("sends each set's prompt exactly as the web's builder makes it, with the builder's temperature and max tokens", async () => {
    expect(contentLangInstruction("en")).toBe(""); // the API adds nothing to an English student's prompt, so the prompt the web sends is the builder's prompt
    for (const name of SET_NAMES) {
      const want = webBuilt(name);
      const { complete, calls } = fake(() => "{}");
      await runSet(SETS[name], complete, { repeats: 1 });
      expect(calls.map((c) => c.prompt), name).toEqual(want.map((b) => b.prompt));
      expect(calls.map((c) => c.o), name).toEqual(want.map((b) => ({ temperature: b.temp, maxTokens: b.max })));
    }
  });

  it("gives the builder the field as the web does: trimmed, cut to 60 characters, psychology when empty", async () => {
    const idea = SETS.idea.items[0]!;
    const base = idea.input as IdeaInput;
    const withField = (id: string, field: string): QualityItem => ({ ...idea, id, input: { ...base, field } });
    const set: QualitySet = { ...SETS.idea, items: [withField("blank", "   "), withField("long", "  " + "x".repeat(80) + "  "), withField("plain", "education")] };
    const { complete, calls } = fake(() => "{}");
    await runSet(set, complete, { repeats: 1 });
    expect(calls.map((c) => /The student studies (.*?)\. The text below/.exec(c.prompt)?.[1])).toEqual(["psychology", "x".repeat(60), "education"]);
  });

  it("calls complete once for each item and repeat: the ask set once for each question, the walk set once for each stage", async () => {
    for (const name of SET_NAMES) {
      const jobs = webBuilt(name).length;
      const { complete, calls } = fake(() => "{}");
      const report = await runSet(SETS[name], complete, { repeats: 3 });
      expect(calls, name).toHaveLength(jobs * 3);
      expect(report.items, name).toHaveLength(jobs);
      expect(report.items.every((i) => i.replies.length === 3), name).toBe(true);
    }
    expect(webBuilt("ask")).toHaveLength(6);
    expect(webBuilt("walk")).toHaveLength(4);
  });

  it("repeats the same prompt for the repeats of an item, one item after the other", async () => {
    const { complete, calls } = fake(() => "{}");
    await runSet(SETS.idea, complete, { repeats: 3 });
    expect(calls.slice(0, 3).every((c) => c.prompt === calls[0]!.prompt)).toBe(true);
    expect(calls[3]!.prompt).not.toBe(calls[0]!.prompt);
  });

  it("every prompt of every set is under 60,000 characters", async () => {
    expect(PROMPT_MAX_CHARS).toBe(60_000);
    for (const name of SET_NAMES) {
      const { complete, calls } = fake(() => "{}");
      await runSet(SETS[name], complete, { repeats: 1 });
      expect(calls.length, name).toBeGreaterThan(0);
      for (const c of calls) expect(c.prompt.length, name).toBeLessThan(60_000);
    }
  });

  it("does not send a prompt the API would refuse for its length, and says so", async () => {
    const base = SETS.gap.items[0]!.input as GapInput;
    const long: AbstractPaper[] = Array.from({ length: 40 }, (_, i) => ({ ...base.papers[0]!, title: "Paper about sleep number " + i, abstract: "Sleep and marks. ".repeat(120) }));
    const set: QualitySet = { ...SETS.gap, items: [{ ...SETS.gap.items[0]!, id: "gap-too-long", input: { ...base, papers: long } }] };
    const { complete, calls } = fake(() => "x");
    const report = await runSet(set, complete, { repeats: 2 });
    expect(calls).toHaveLength(0);
    expect(report.items[0]!.promptChars).toBeGreaterThan(60_000);
    expect(report.items[0]!.replies.map((r) => r.error)).toEqual([expect.stringMatching(/not sent.*60,000/), expect.stringMatching(/not sent.*60,000/)]);
  });

  it("records a failed call and goes on with the next", async () => {
    const set = only(SETS.summary, "summary-sleep-gpa-female", "summary-health-anxiety-yemen");
    // The second call fails with an error that carries a detail the runner must not copy (a provider's answer can name a key).
    const secret = "gsk_SECRET_DETAIL_1234";
    const { complete, calls } = fake((_p, n) => {
      if (n === 1) throw Object.assign(new Error("rate-limit"), { code: "rate-limit", detail: `HTTP 429: key ${secret} is over its limit` });
      return n === 2 ? Promise.reject(new Error("network")) : SUMMARY_GOOD;
    });
    const report = await runSet(set, complete, { repeats: 2 });
    expect(calls).toHaveLength(4); // none skipped
    const [a, b] = report.items;
    expect(a!.replies[0]).toMatchObject({ text: SUMMARY_GOOD });
    expect(a!.replies[1]).toEqual({ error: "rate-limit", grades: {} });
    expect(b!.replies[0]).toEqual({ error: "network", grades: {} });
    expect(b!.replies[1]!.text).toBe(SUMMARY_GOOD);
    // The table keeps the failed reply's place, and the reply section says what happened.
    expect(row(report.markdown, "summary-sleep-gpa-female")[1]).toBe("1/2 (1 failed)");
    expect(row(report.markdown, "summary-sleep-gpa-female")[4]).toBe("foreign numbers: 0, -");
    expect(report.markdown).toContain("No reply (rate-limit). Nothing to grade.");
    expect(JSON.stringify(report)).not.toContain(secret);
  });

  it("makes no grade whose expectation the item does not give, and keeps the reply", async () => {
    const set = only(SETS.idea, "idea-walk-bedtime");
    const odd = { ...set, items: [{ ...set.items[0]!, expect: { ...set.items[0]!.expect, areas: "not a list", label: undefined } }] };
    const { complete } = fake(() => IDEA_GOOD);
    const report = await runSet(odd, complete, { repeats: 1 });
    expect(report.items[0]!.replies[0]!.text).toBe(IDEA_GOOD);
    expect(report.items[0]!.replies[0]!.grades).toEqual({});
    expect(report.items[0]!.label).toBeNull();
  });

  it("lists an item whose input cannot be built as not run, and runs the others", async () => {
    const good = SETS.walk.items[0]!;
    const noStage: QualityItem = { ...good, id: "walk-no-such-stage", input: { ...(good.input as WalkInput), stage: { k: "nope", attempt: "" } } };
    const noInput: QualityItem = { ...good, id: "walk-no-input", input: {} };
    const { complete, calls } = fake(() => WALK_GOOD);
    const report = await runSet({ ...SETS.walk, items: [noStage, noInput, good] }, complete, { repeats: 1 });
    expect(calls).toHaveLength(1);
    expect(report.items.map((i) => i.id)).toEqual([good.id]);
    expect(report.notRun.map((n) => n.id)).toEqual(["walk-no-such-stage", "walk-no-input"]);
    expect(report.notRun[0]!.reason).toMatch(/^the item could not be built: .*nope/);
  });

  it("lists an item whose paper is stored by DOI only as not run, with the reason, and does not call complete for it", async () => {
    const ok = SETS.summary.items[0]!;
    const base = (ok.input as SummaryInput);
    const doiOnly: QualityItem = { ...ok, id: "summary-doi-only", unresolved: true, input: { ...base, paper: { ...base.paper, text: null, doi: "10.1371/journal.pone.0000001" } } };
    const set: QualitySet = { ...SETS.summary, items: [ok, doiOnly] };
    const { complete, calls } = fake(() => SUMMARY_GOOD);
    const report = await runSet(set, complete, { repeats: 2 });
    expect(calls).toHaveLength(2);
    expect(report.items.map((i) => i.id)).toEqual([ok.id]);
    expect(report.notRun).toEqual([{ id: "summary-doi-only", reason: "the paper is stored by DOI only (10.1371/journal.pone.0000001) and the runner does not fetch papers yet" }]);
    expect(row(report.markdown, "summary-doi-only")[1]).toBe("not run");
    expect(report.markdown).toMatch(/## Not run\n\n- summary-doi-only: the paper is stored by DOI only \(10\.1371\/journal\.pone\.0000001\)/);
  });

  it("says when the web would ask about personal data before sending a prompt, and sends it as it is", async () => {
    const idea = SETS.idea.items[0]!;
    const base = idea.input as IdeaInput;
    const set: QualitySet = { ...SETS.idea, items: [{ ...idea, id: "idea-with-email", input: { ...base, idea: { ...base.idea, resources: "Ask me at student@example.com." } } }] };
    const { complete, calls } = fake(() => IDEA_GOOD);
    const report = await runSet(set, complete, { repeats: 1 });
    expect(report.items[0]!.personalData.total).toBeGreaterThan(0);
    expect(calls[0]!.prompt).toContain("student@example.com");
    expect(report.markdown).toMatch(/The web would ask about personal data before sending this prompt \(1 email address\); the runner sends it as it is\./);
  });

  it("reads the model when the report is made, so a run can learn it from the first reply", async () => {
    let model: string | undefined;
    const { complete } = fake(() => { model = "openai/gpt-oss-120b"; return IDEA_GOOD; });
    const report = await runSet(only(SETS.idea, "idea-walk-bedtime"), complete, { repeats: 1, provider: "groq", model: () => model });
    expect(report.markdown).toContain("- Model: openai/gpt-oss-120b");
    expect(report.header).toEqual({ provider: "groq", model: "openai/gpt-oss-120b" });
    // No provider, model or date given: the header does not have the lines.
    const bare = await runSet(only(SETS.idea, "idea-walk-bedtime"), complete, { repeats: 1 });
    expect(bare.markdown).not.toMatch(/- (Provider|Model|Date):/);
  });

  it("reports progress after each call, with the failures", async () => {
    const seen: Array<[string, number, number, boolean]> = [];
    const { complete } = fake((_p, n) => { if (n === 1) throw new Error("network"); return IDEA_GOOD; });
    await runSet(only(SETS.idea, "idea-walk-bedtime", "idea-vague-social-media"), complete, { repeats: 2, onCall: (c) => seen.push([c.id, c.repeat, c.of, c.ok]) });
    expect(seen).toEqual([["idea-walk-bedtime", 1, 2, true], ["idea-walk-bedtime", 2, 2, false], ["idea-vague-social-media", 1, 2, true], ["idea-vague-social-media", 2, 2, true]]);
  });

  it("turns away repeats that are not a whole number of at least 1", async () => {
    const { complete, calls } = fake(() => "{}");
    for (const repeats of [0, -1, 1.5, Number.NaN]) await expect(runSet(SETS.idea, complete, { repeats })).rejects.toThrow(/repeats/);
    expect(calls).toHaveLength(0);
  });

  describe("the report's own words", () => {
    it("has no em-dash and no emoji outside the replies", async () => {
      const parts: string[] = [];
      for (const [set, a, b] of [[only(SETS.summary, "summary-sleep-gpa-female"), SUMMARY_GOOD, SUMMARY_BAD], [only(SETS.ask, "ask-exercise-emotion-henan"), ASK_Q1_GOOD, ASK_Q2_BAD], [only(SETS.idea, "idea-walk-bedtime"), IDEA_GOOD, IDEA_BAD]] as const) {
        const { complete } = fake((_p, n) => (n % 2 ? b : a));
        const report = await runSet(set, complete, { repeats: 2, provider: "groq", model: "m", date: "2026-10-24" });
        parts.push(report.markdown);
      }
      for (const md of parts) {
        expect(md).not.toContain(String.fromCharCode(0x2014)); // U+2014, the em-dash
        expect(md).not.toMatch(/\p{Extended_Pictographic}/u);
      }
    });

    it("puts a reply that has code fences in a longer fence, so the reply cannot close it", async () => {
      const reply = "```json\n{\"a\": 1}\n```";
      const { complete } = fake(() => reply);
      const report = await runSet(only(SETS.idea, "idea-walk-bedtime"), complete, { repeats: 1 });
      expect(report.markdown).toContain("````text\n" + reply + "\n````");
    });

    it("keeps a pipe in a question out of the table's columns", async () => {
      const ask = SETS.ask.items[0]!;
      const base = ask.input as AskInput;
      const set: QualitySet = { ...SETS.ask, items: [{ ...ask, input: { ...base, questions: ["Is it a | b?", base.questions[1]!] }, expect: { inPaper: [true, false], facts: [[], []] } }] };
      const { complete } = fake(() => ASK_Q1_GOOD);
      const report = await runSet(set, complete, { repeats: 1 });
      expect(row(report.markdown, "ask-exercise-emotion-henan, question 1")).toHaveLength(6);
    });
  });
});
