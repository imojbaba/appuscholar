import { STAGE_ORDER, type StageKey } from "@/lib/tools";
import type { StageState } from "./stages";

type T = (key: string, vars?: Record<string, string | number>) => string;

/** The spoken order of the groups; not-started stages are left out. */
const GROUPS: Array<[StageState, string]> = [["ready", "state_sum_ready"], ["in-progress", "state_sum_in_progress"], ["started-early", "state_sum_started_early"], ["reopened", "state_sum_reopened"]];

/** "a", "a and b", "a, b and c". */
const list = (names: string[], t: T): string => names.length < 2 ? names.join("") : t("state_sum_and", { a: names.slice(0, -1).join(", "), b: names[names.length - 1]! });

/** A project row's aria-label: "Idea ready; literature and writing in progress; design started early", or "Nothing started yet". */
export function stateSummary(s: Record<StageKey, StageState>, t: T): string {
  const parts = GROUPS.flatMap(([state, key]) => {
    const names = STAGE_ORDER.filter((k) => s[k] === state).map((k) => t("state_sum_" + k));
    return names.length ? [t(key, { stages: list(names, t) })] : [];
  });
  if (!parts.length) return t("state_sum_none");
  const out = parts.join("; ");
  return out.charAt(0).toLocaleUpperCase() + out.slice(1);
}
