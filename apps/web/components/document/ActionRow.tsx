"use client";
import type { Editor } from "@tiptap/react";
import { tHtml, useT } from "@/lib/i18n";
import { plural } from "@/lib/format";
import { useSettings } from "@/lib/settings";
import { runWritingAction, type ActionDeps } from "@/lib/ai/actions";
import { useSuggestion } from "@/lib/ai/suggestion";
import { useCallAI } from "@/lib/ai/useCallAI";
import { hasSelection, selectionText, tailText } from "@/lib/editor/insert";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { TemplatePicker } from "@/components/workspace/dialogs/TemplatePicker";
import { useWorkspace } from "@/components/workspace/WorkspaceContext";

/** The writing actions under the document (mockup 02): Continue / Improve / Extend, Template, AI text, Viva question, Draft first, and the live word count. */
export function ActionRow({ editor, highlightAi, onHighlightAi }: { editor: Editor; highlightAi: boolean; onHighlightAi(on: boolean): void }) {
  const t = useT();
  const { settings, update } = useSettings();
  const { currentDoc, wordCount, dockShow } = useWorkspace();
  const suggestion = useSuggestion();
  const callAI = useCallAI();
  const draftFirst = settings.draftFirst === true;

  const run = (kind: "continue" | "improve" | "expand") => {
    const deps: ActionDeps = {
      callAI, hasSelection: () => hasSelection(editor), selectionText: () => selectionText(editor), tailText: () => tailText(editor),
      setThinking: suggestion.setThinking, set: suggestion.set, setFeedback: suggestion.setFeedback, clear: suggestion.clear,
      dockShow, toast, t, draftFirst
    };
    return runWritingAction(kind, deps);
  };
  // The buttons must not take focus from the document: the selection Improve and Extend work on stays visible.
  const keep = (e: React.MouseEvent) => e.preventDefault();
  const words = wordCount ?? currentDoc?.wordCount ?? 0;

  return (
    <div className="actions" role="toolbar" aria-label="Writing actions" data-testid="action-row">
      <Button type="button" variant="primary" size="sm" title={t("continue_btn_title")} data-testid="act-continue" onMouseDown={keep} onClick={() => void run("continue")}>{tHtml(t("continue_btn"))}</Button>
      <Button type="button" variant="ghost" size="sm" title={t("improve_btn_title")} data-testid="act-improve" onMouseDown={keep} onClick={() => void run("improve")}>{t("improve_btn")}</Button>
      <Button type="button" variant="ghost" size="sm" title={t("extend_btn_title")} data-testid="act-extend" onMouseDown={keep} onClick={() => void run("expand")}>{t("extend_btn")}</Button>
      <TemplatePicker editor={editor} />
      <Button type="button" variant={highlightAi ? "toggle" : "ghost"} size="sm" aria-pressed={highlightAi} title={t("aitext_btn_title")} data-testid="act-ai-text" onMouseDown={keep}
        onClick={() => { onHighlightAi(!highlightAi); toast(highlightAi ? "Highlight off" : "AI-inserted text highlighted in the document"); }}>{t("aitext_btn")}</Button>
      <Button type="button" variant="ghost" size="sm" title={t("viva_btn_title")} data-testid="act-viva" onClick={() => toast("Viva question arrives in a later phase.")}>{t("viva_btn")}</Button>
      <Button type="button" variant={draftFirst ? "toggle" : "ghost"} size="sm" aria-pressed={draftFirst} title={t("df_btn_title")} data-testid="act-draft-first"
        onClick={() => { void update({ draftFirst: !draftFirst }); toast(draftFirst ? t("df_off") : t("df_on")); }}>{t("df_btn")}</Button>
      <span className="spacer" />
      <span className="count" data-testid="word-count">{plural(words, "word", "words")}</span>
      {/* The "NN% yours" origin badge (data-testid="origin-badge") joins here in Task 16. */}
    </div>
  );
}
