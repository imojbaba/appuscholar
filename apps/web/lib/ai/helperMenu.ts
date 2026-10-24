import type { HelperKind } from "@appuscholar/core";

/** One entry of the help menu: the five research helpers and the devil's advocate, as the menu and the label on the answer name them. */
export type HelperId = HelperKind | "devil";

/**
 * The entries of "Help with this text", in v1's order (the Research helpers panel, 729-736). `name` and `what` are dictionary keys: the name is what
 * the student presses, and again the label on the answer; `what` is one plain line saying what the helper does, so the name need not carry it.
 * "Explain the statistics" runs v1's "Explain concept simply" prompt and "Format results in APA" keeps v1's own name for the APA prompt (register D-S2-135).
 */
export const HELPER_MENU: ReadonlyArray<{ id: HelperId; name: string; what: string }> = [
  { id: "paper", name: "help_paper", what: "help_paper_what" },
  { id: "case", name: "help_case", what: "help_case_what" },
  { id: "litrev", name: "help_litrev", what: "help_litrev_what" },
  { id: "explain", name: "help_explain", what: "help_explain_what" },
  { id: "stats", name: "help_stats", what: "help_stats_what" },
  { id: "devil", name: "help_devil", what: "help_devil_what" }
];

/** The line under the menu's title, and the second line of the label on an answer: how much text the helper reads. */
export function scopeLine(t: (key: string, vars?: Record<string, string | number>) => string, scope: { whole: boolean; chars: number }): string {
  return scope.whole ? t("help_scope_whole") : t("help_scope_selection", { chars: scope.chars.toLocaleString("en-IN") });
}
