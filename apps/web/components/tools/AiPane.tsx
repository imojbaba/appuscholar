"use client";
import { plainText, tHtml, useT } from "@/lib/i18n";
import { useSuggestion } from "@/lib/ai/suggestion";
import { Button } from "@/components/ui/button";

/** The AI tab of the dock: the suggestion (or Draft first feedback, or the error), its accuracy note, and Accept / Copy / Dismiss. */
export function AiPane() {
  const t = useT();
  const { text, note, status, accept, copy, clear } = useSuggestion();
  const busy = status !== "idle";
  const placeholder = t("ai_pane_placeholder");
  const statusText = status === "thinking" ? "💜 Thinking…" : status === "polishing" ? "💜 Polishing…" : status === "expanding" ? "💜 Expanding…" : t("df_thinking");
  const empty = !busy && (!text || text === placeholder);
  return (
    <div className="panel" data-testid="ai-pane">
      <h3>{t("ai_pane_h3")}</h3>
      <p className="desc">{tHtml(t("ai_pane_desc"))}</p>
      <div className={"ai-out" + (empty ? " empty" : "")} role="region" aria-label={plainText(t("dock_ai_tab"))} aria-busy={busy} data-testid="ai-out">
        {busy ? <span className="thinking" role="status" data-testid="ai-status">{statusText}</span> : text ?? placeholder}
      </div>
      {/* v1 shows the check only for a result from Continue, Improve or Extend: not for Draft first feedback and not for an error. */}
      {!busy && note && (
        <p className={"ai-note" + (note.warn ? " flag" : "")} role="status" data-testid="ai-note">{note.msg}</p>
      )}
      <div className="ai-row">
        <Button type="button" variant="primary" className="primary" data-testid="ai-accept" onClick={accept}>{t("accept_btn")}</Button>
        <Button type="button" variant="ghost" data-testid="ai-copy" onClick={copy}>{t("copy_btn")}</Button>
        <Button type="button" variant="ghost" data-testid="ai-dismiss" onClick={() => clear()}>{t("dismiss_btn")}</Button>
      </div>
    </div>
  );
}
