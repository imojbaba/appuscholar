"use client";
import { useCallback } from "react";
import type { Editor } from "@tiptap/react";
import type { WritingKind } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { hasSelection, selectionRange, selectionText, tailText } from "@/lib/editor/insert";
import { toast } from "@/components/ui/toast";
import { useProject } from "@/components/frame/ProjectContext";
import { runWritingAction, type ActionDeps } from "./actions";
import { useSuggestion } from "./suggestion";
import { useCallAI } from "./useCallAI";

/** Runs Continue / Improve / Extend on `editor` with the workspace's AI, suggestion pane and Draft first setting: the action row and the selection bubble share it. */
export function useWritingRun(editor: Editor): (kind: WritingKind) => Promise<void> {
  const t = useT();
  const { settings } = useSettings();
  const { dockShow } = useProject();
  const suggestion = useSuggestion();
  const callAI = useCallAI();
  const draftFirst = settings.draftFirst === true;
  return useCallback((kind) => {
    const deps: ActionDeps = {
      callAI, hasSelection: () => hasSelection(editor), selectionText: () => selectionText(editor), selectionRange: () => selectionRange(editor), tailText: () => tailText(editor),
      setThinking: suggestion.setThinking, isCurrent: suggestion.isCurrent, set: suggestion.set, setFeedback: suggestion.setFeedback, clear: suggestion.clear,
      dockShow, toast, t, draftFirst
    };
    return runWritingAction(kind, deps);
  }, [callAI, editor, suggestion.setThinking, suggestion.isCurrent, suggestion.set, suggestion.setFeedback, suggestion.clear, dockShow, t, draftFirst]);
}
