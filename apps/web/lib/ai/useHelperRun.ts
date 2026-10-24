"use client";
import { useCallback } from "react";
import type { Editor } from "@tiptap/react";
import { docInnerText, fieldLabel } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { heldEditorSelection } from "@/lib/editor/heldSelection";
import { toast } from "@/components/ui/toast";
import { runDevil, runHelper, type HelperDeps } from "./actions";
import type { HelperId } from "./helperMenu";
import { useSuggestion } from "./suggestion";
import { useCallAI } from "./useCallAI";

/** The case tool's acknowledgement, kept in memory for the life of the tab as v1's sessionKeys (1958): a reload asks the APA 4.07 question again. */
const memory = new Map<string, string>();
const session: HelperDeps["session"] = {
  get: (key) => memory.get(key) ?? null,
  set: (key, value) => void memory.set(key, value)
};
/** Forgets the acknowledgement, as a reload does (for tests). */
export function resetHelperSession(): void { memory.clear(); }

/**
 * Runs one of the research helpers, or Challenge my argument, on the document's text with the workspace's AI and suggestion pane (the help menu's
 * action; the Research helpers panel used to). The text is read when the helper starts: the selection the document holds (kept across the menu taking
 * focus, of any length), else the whole document. The answer goes to the pane beside the document and the place does not change (W25).
 */
export function useHelperRun(editor: Editor): (id: HelperId) => Promise<void> {
  const t = useT();
  const { settings } = useSettings();
  const suggestion = useSuggestion();
  const callAI = useCallAI();
  const field = fieldLabel(settings.field);
  return useCallback((id) => {
    const held = heldEditorSelection(editor);
    const deps: HelperDeps = {
      callAI,
      hasSelection: () => !!held,
      selectionText: () => held?.text ?? "",
      docText: () => (editor.isDestroyed ? "" : docInnerText(editor.getHTML())),
      setThinking: suggestion.setThinking, isCurrent: suggestion.isCurrent, set: suggestion.set, setFeedback: suggestion.setFeedback, clear: suggestion.clear,
      toast, t, field,
      confirm: (msg) => window.confirm(msg),
      session
    };
    return id === "devil" ? runDevil(deps) : runHelper(id, deps);
  }, [callAI, editor, suggestion.setThinking, suggestion.isCurrent, suggestion.set, suggestion.setFeedback, suggestion.clear, t, field]);
}
