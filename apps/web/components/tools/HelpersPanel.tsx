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
import { useWorkspace } from "@/components/workspace/WorkspaceContext";

/** v1's five purple buttons, in v1's order (729-736), with their keys. */
const HELPERS: { kind: HelperKind; label: string }[] = [
  { kind: "paper", label: "psych_btn_summarize" },
  { kind: "case", label: "psych_btn_case" },
  { kind: "litrev", label: "psych_btn_litrev" },
  { kind: "explain", label: "psych_btn_explain" },
  { kind: "stats", label: "psych_btn_apa" }
];

/** The browser session's store for the case tool's acknowledgement; an in-memory stand-in when sessionStorage is unavailable (private mode, blocked storage). */
const memory = new Map<string, string>();
const session: HelperDeps["session"] = {
  get(key) { try { return window.sessionStorage.getItem(key); } catch { return memory.get(key) ?? null; } },
  set(key, value) { try { window.sessionStorage.setItem(key, value); } catch { memory.set(key, value); } }
};

/** Research helpers (v1 728-738, psychTool / devilTool 8591-8630): six buttons on the selection, or on the whole document when nothing is selected. */
export function HelpersPanel() {
  const t = useT();
  const { dockShow } = useWorkspace();
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
    dockShow, toast, t, field: fieldLabel(settings.field),
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
