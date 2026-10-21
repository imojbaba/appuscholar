"use client";
import { useState } from "react";
import { Copy, Lightbulb, Plus } from "@phosphor-icons/react";
import { useT } from "@/lib/i18n";
import { useLab } from "@/lib/tools/stats/lab";
import type { RunActions } from "@/lib/tools/stats/useRunActions";
import { Button } from "@/components/ui/button";
import { ResultChart } from "./ResultChart";

/* The look of v1's result tables (.stats-table), in the page's tokens; the markup itself is core's, sanitized. */
const TABLE_CSS = `
.stats-res table.stats-table { border-collapse: collapse; margin: 8px 0; font-size: 13px; max-width: 100%; display: block; overflow-x: auto; }
.stats-res .stats-table th, .stats-res .stats-table td { border: 1px solid var(--line); padding: 4px 10px; text-align: left; }
.stats-res .stats-table th { background: var(--soft); font-weight: 600; }
.stats-res h4 { margin: 14px 0 4px; font-size: 14px; }
.stats-res p.desc { margin: 6px 0; font-size: 13px; line-height: 19px; color: var(--muted); }
`;

/**
 * The result (v1 statsResultsShow 11985-12005): a refusal as its sentence, or the blocks core built (already sanitized), the APA sentence in a box, "Insert into
 * document" and "Explain in plain language", the explanation under the AI-output label, and the chart. A result with an undefined number shows v1's note only:
 * nothing to insert, no chart, no explanation. The HTML comes from lab.lastRun.outcome, which lib/tools/stats/run.ts ran through sanitizeHtml.
 */
export function Results({ projectId, run }: { projectId: string; run: RunActions }) {
  const t = useT();
  const lr = useLab(projectId).lastRun;
  const [copied, setCopied] = useState<"" | "ok" | "failed">("");
  if (!lr) return null;
  const o = lr.outcome;
  if (o.kind === "toast") return <p className="ap-banner" role="alert" data-testid="stats-run-message" style={{ marginTop: 12 }}>{o.text}</p>;
  if (o.kind === "undefined") {
    return (
      <div className="stats-res" data-testid="stats-results" style={{ marginTop: 14 }}>
        <style>{TABLE_CSS}</style>
        <h3 style={{ marginTop: 0 }}>{t("stats_res_title")}</h3>
        <div data-testid="stats-results-html" dangerouslySetInnerHTML={{ __html: o.html }} />
      </div>
    );
  }
  const ex = lr.explain;
  return (
    <div className="stats-res" data-testid="stats-results" style={{ marginTop: 14 }}>
      <style>{TABLE_CSS}</style>
      <h3 style={{ marginTop: 0 }}>{t("stats_res_title")}</h3>
      <div data-testid="stats-results-html" dangerouslySetInnerHTML={{ __html: o.html }} />
      <div className="ap-box" data-testid="stats-sentence" style={{ fontSize: 14 }}>{o.res.apa}</div>
      <div className="ap-row ap-wrap">
        <Button variant="primary" size="sm" data-testid="stats-insert" onClick={() => void run.insert()}><Plus aria-hidden="true" />{t("stats_res_insert")}</Button>
        <Button variant="ghost" size="sm" data-testid="stats-copy" onClick={() => {
          // v1 statsCopy (12009): the sentence to the clipboard; the news is a quiet line, not a toast (only "Saved" and "Inserted" are toasts)
          const w = navigator.clipboard?.writeText(o.res.apa);
          if (!w) { setCopied("failed"); return; }
          w.then(() => setCopied("ok"), () => setCopied("failed"));
        }}><Copy aria-hidden="true" />{t("stats_res_copy")}</Button>
        <Button variant="ghost" size="sm" data-testid="stats-explain" disabled={ex.status === "busy"} onClick={() => void run.explain()}><Lightbulb aria-hidden="true" />{t("stats_res_explain")}</Button>
      </div>
      {copied && <p className={copied === "ok" ? "ap-ok" : "ap-small"} role="status" data-testid="stats-copy-status">{t(copied === "ok" ? "stats_res_copied" : "stats_res_copy_failed")}</p>}
      {ex.status === "busy" && <p className="ap-small" role="status" data-testid="stats-explain-busy">{t("stats_res_thinking")}</p>}
      {ex.status === "cancelled" && <p className="ap-small" role="status" data-testid="stats-explain-cancelled">{ex.message}</p>}
      {ex.status === "failed" && <p className="ap-banner" role="alert" data-testid="stats-explain-failed">{ex.message}</p>}
      {ex.status === "done" && (
        <section className="ai-read" data-testid="stats-explain-out" aria-label={t("stats_res_explain_label")} style={{ marginTop: 10 }}>
          <p className="ai-read-label">{t("stats_res_explain_label")}</p>
          <p className="idea-read-raw">{ex.text}</p>
        </section>
      )}
      {o.chart && <ResultChart spec={o.chart} />}
    </div>
  );
}
