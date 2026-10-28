import type { StageKey } from "@/lib/tools";
import type { HomeFacts } from "./homeFacts";

/** The home's suggested next step: an i18n key, its numbers, and the place its button opens. */
export type NextStep = { key: string; vars?: Record<string, number>; to: { stage: StageKey; tab?: string } };

/**
 * The first rule that matches, in the plan's order (Task 7): the question, find, read, compare, write. The feasibility check is never a step: it is an
 * optional outside opinion the student asks for (start-a-study spec, OJ 2026-10-27).
 */
export function suggestNext(f: HomeFacts): NextStep {
  if (f.question.trim() === "") return { key: "next_question", to: { stage: "idea" } };
  if (f.kept === 0) return { key: "next_find", to: { stage: "lit", tab: "find" } };
  const want = Math.min(3, f.kept);
  if (f.read < want) return { key: "next_read", vars: { n: want - f.read }, to: { stage: "lit", tab: "reading" } };
  if (f.kept >= 2 && f.cards < 2) return { key: "next_compare", to: { stage: "lit", tab: "compare" } };
  return { key: "next_write", to: { stage: "writing" } };
}
