"use client";
import type { HelperKind } from "@appuscholar/core";
import { docInnerText, fieldLabel } from "@appuscholar/core";
import { plain, tHtml, useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { hasSelection, selectionText } from "@/lib/editor/insert";
import { runDevil, runHelper, type HelperDeps } from "@/lib/ai/actions";
import { useSuggestion } from "@/lib/ai/suggestion";
import { useCallAI } from "@/lib/ai/useCallAI";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/** v1's five purple buttons, in v1's order (729-736), with their keys. */
const HELPERS: { kind: HelperKind; label: string }[] = [
  { kind: "paper", label: "psych_btn_summarize" },
  { kind: "case", label: "psych_btn_case" },
  { kind: "litrev", label: "psych_btn_litrev" },
  { kind: "explain", label: "psych_btn_explain" },
  { kind: "stats", label: "psych_btn_apa" }
];

/** The case tool's acknowledgement, kept in memory for the life of the tab as v1's sessionKeys (1958): a reload asks the APA 4.07 question again. */
const memory = new Map<string, string>();
const session: HelperDeps["session"] = {
  get: (key) => memory.get(key) ?? null,
  set: (key, value) => void memory.set(key, value)
};
/** Forgets the acknowledgement, as a reload does (for tests). */
export function resetHelperSession(): void { memory.clear(); }

/** Research helpers (v1 728-738, psychTool / devilTool 8591-8630): six buttons on the selection, or on the whole document when nothing is selected. */
export function HelpersPanel() {
  const t = useT();
  const { settings } = useSettings();
  const suggestion = useSuggestion();
  const callAI = useCallAI();
  const { editor } = suggestion;
  const deps = (): HelperDeps => ({
    callAI,
    hasSelection: () => !!editor && !editor.isDestroyed && hasSelection(editor),
    selectionText: () => (editor && !editor.isDestroyed ? selectionText(editor) : ""),
    docText: () => (editor && !editor.isDestroyed ? docInnerText(editor.getHTML()) : ""),
    setThinking: suggestion.setThinking, isCurrent: suggestion.isCurrent, set: suggestion.set, setFeedback: suggestion.setFeedback, clear: suggestion.clear,
    toast, t, field: fieldLabel(settings.field),
    confirm: (msg) => window.confirm(msg),
    session
  });
  return (
    <div className="panel" data-testid="panel-psych">
      <h3>{plain(t("tab_psych"))}</h3>
      <p className="desc">{t("psych_panel_desc")}</p>
      <div className="stack">
        {HELPERS.map(({ kind, label }) => (
          <Button key={kind} variant="primary" className="w-full" data-testid={"helper-" + kind} onClick={() => void runHelper(kind, deps())}>{t(label)}</Button>
        ))}
        <Button variant="ghost" className="w-full" data-testid="helper-devil" title={t("devil_btn_title")} onClick={() => void runDevil(deps())}>{t("devil_btn")}</Button>
      </div>
      <p className="note" data-testid="helpers-note">{tHtml(t("psych_panel_note"))}</p>
    </div>
  );
}
