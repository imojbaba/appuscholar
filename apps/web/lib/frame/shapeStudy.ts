import type { CoachPlan, CoachSection } from "@appuscholar/core";
import type { IdeaIntake } from "@/lib/blobs/kinds";

/**
 * Shape your study (start-a-study spec, OJ 2026-10-27): the six parts of a study plan, asked one at a time in the Idea place, and where each answer lives in
 * the project's idea_intake. The four boxes v1's Idea & Feasibility panel had keep their keys (topic, resources, timeframe, constraints), so a plan saved
 * before is read as the question, what you have, time and ethics; who and how are new.
 */
export const SECTIONS = [
  { key: "question", field: "topic" },
  { key: "who", field: "who" },
  { key: "how", field: "how" },
  { key: "time", field: "timeframe" },
  { key: "have", field: "resources" },
  { key: "ethics", field: "constraints" }
] as const satisfies ReadonlyArray<{ key: CoachSection; field: string }>;
export type SectionKey = (typeof SECTIONS)[number]["key"];
export type SectionField = (typeof SECTIONS)[number]["field"];

export const EMPTY_PLAN: IdeaIntake = { topic: "", resources: "", timeframe: "", constraints: "" };

/** The student's words for one part ("" when none). */
export function answerOf(intake: IdeaIntake | null, key: SectionKey): string {
  const field = SECTIONS.find((s) => s.key === key)!.field;
  const v = (intake as Record<string, unknown> | null)?.[field];
  return typeof v === "string" ? v : "";
}

export function unsureOf(intake: IdeaIntake | null): SectionKey[] {
  const u = intake?.unsure;
  return Array.isArray(u) ? (u.filter((k) => SECTIONS.some((s) => s.key === k)) as SectionKey[]) : [];
}

/** A part counts as answered when it has words, or when the student marked it "Not sure yet" (the gap is then a known one). */
export function isAnswered(intake: IdeaIntake | null, key: SectionKey): boolean {
  return answerOf(intake, key).trim() !== "" || unsureOf(intake).includes(key);
}

export function answeredCount(intake: IdeaIntake | null): number {
  return SECTIONS.filter((s) => isAnswered(intake, s.key)).length;
}

/** Where Shape your study opens: at the first part with nothing in it when the plan is empty, else at the summary (index SECTIONS.length). */
export function startStep(intake: IdeaIntake | null): number {
  return answeredCount(intake) === 0 ? 0 : SECTIONS.length;
}

/** The plan as the coach prompt takes it. */
export function coachPlan(intake: IdeaIntake | null): CoachPlan {
  const answers: CoachPlan["answers"] = {};
  for (const s of SECTIONS) answers[s.key] = answerOf(intake, s.key);
  return { answers, unsure: unsureOf(intake) };
}

/**
 * The four fields Dr. Sharma's feasibility check takes (v1's prompt, unchanged): the question, with who would take part and how the evidence would be
 * collected under it, since v1 had no box for either; what the student has; time; ethics as the other constraints.
 */
export function feasibilityFields(intake: IdeaIntake | null): { topic: string; resources: string; timeframe: string; constraints: string } {
  const who = answerOf(intake, "who").trim(), how = answerOf(intake, "how").trim();
  const topic = [answerOf(intake, "question").trim(), who && "Who would take part: " + who, how && "How the evidence would be collected: " + how].filter(Boolean).join("\n");
  return { topic, resources: answerOf(intake, "have"), timeframe: answerOf(intake, "time"), constraints: answerOf(intake, "ethics") };
}
