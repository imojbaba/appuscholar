"use client";
import { plainText, tHtml, useT } from "@/lib/i18n";
import { useSuggestion } from "@/lib/ai/suggestion";
import { Button } from "@/components/ui/button";

/**
 * The AI pane beside the document: the suggestion (or Draft first feedback, or the error), its accuracy note, and Accept / Copy / Dismiss. An AI
 * answer has the gold edge (`ai-answer`); one that a research helper gave says which helper and what text it read, and to check it (Task 32). An
 * answer that cannot be inserted (Challenge my argument) has Dismiss only, so nothing here suggests pasting it in.
 */
export function AiPane() {
  const t = useT();
  const { text, note, status, statusLabel, sug, source, answer, accept, copy, clear } = useSuggestion();
  const busy = status !== "idle";
  const placeholder = t("ai_pane_placeholder");
  // A request that gave its own sentence (a stage tool, "custom") shows it; the writing buttons and Draft first keep theirs.
  const statusText = statusLabel ?? (status === "polishing" ? "💜 Polishing…" : status === "expanding" ? "💜 Expanding…" : status === "reading" ? t("df_thinking") : "💜 Thinking…");
  const empty = !busy && (!text || text === placeholder);
  const gold = !busy && !empty && answer === true;
  const readOnly = !busy && !empty && !!source && !sug;
  return (
    <div className="panel" data-testid="ai-pane">
      <h3>{t("ai_pane_h3")}</h3>
      <p className="desc">{tHtml(t("ai_pane_desc"))}</p>
      {!busy && source && (
        <p className="ai-source" data-testid="ai-source"><b>{source.title}</b> <span>{source.scope}</span>{source.cut && <> <span className="ai-cut">{source.cut}</span></>}</p>
      )}
      <div className={"ai-out" + (empty ? " empty" : "") + (gold ? " ai-answer" : "")} role="region" aria-live="polite" aria-label={plainText(t("dock_ai_tab"))} aria-busy={busy} data-testid="ai-out">
        {busy ? <span className="thinking" role="status" data-testid="ai-status">{statusText}</span> : text ?? placeholder}
      </div>
      {!busy && source && <p className="ai-check" data-testid="ai-check">{t("help_check")}</p>}
      {/* v1 shows the check only for a result from Continue, Improve or Extend: not for Draft first feedback and not for an error. */}
      {!busy && note && (
        <p className={"ai-note" + (note.warn ? " flag" : "")} role="status" aria-live="polite" data-testid="ai-note">{note.msg}</p>
      )}
      <div className="ai-row">
        {!readOnly && <Button type="button" variant="primary" className="primary" data-testid="ai-accept" onClick={accept}>{t("accept_btn")}</Button>}
        {!readOnly && <Button type="button" variant="ghost" data-testid="ai-copy" onClick={copy}>{t("copy_btn")}</Button>}
        <Button type="button" variant="ghost" data-testid="ai-dismiss" onClick={() => clear()}>{t("dismiss_btn")}</Button>
      </div>
    </div>
  );
}
