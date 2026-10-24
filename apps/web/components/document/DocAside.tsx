"use client";
import { plainText, useT } from "@/lib/i18n";
import { useSuggestion, type SuggestionValue } from "@/lib/ai/suggestion";
import { AiPane } from "@/components/tools/AiPane";

/** The AI pane has something to show: a request running, a suggestion, feedback or a message. Empty, or back to its placeholder after Accept, it hides. */
export function aiPaneHasContent(s: Pick<SuggestionValue, "status" | "text">, placeholder: string): boolean {
  return s.status !== "idle" || (s.text !== null && s.text !== placeholder);
}

/**
 * The AI pane beside the text it acts on (Task 11): what Continue, Improve and Extend, Draft first and the helpers answer, with Accept, Copy and
 * Dismiss, and Tab in the editor. It is part of the document card, so it goes wherever the document goes, in every place; v1 and the dock put it
 * in a tab of their own. It shows only while it has something to show.
 */
export function DocAside() {
  const t = useT();
  const s = useSuggestion();
  if (!aiPaneHasContent(s, t("ai_pane_placeholder"))) return null;
  return <aside className="doc-aside" aria-label={plainText(t("dock_ai_tab"))} data-testid="doc-aside"><AiPane /></aside>;
}
