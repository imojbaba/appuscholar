"use client";
import { useState } from "react";
import { CheckCircle, Warning, XCircle } from "@phosphor-icons/react";
import { useT } from "@/lib/i18n";
import { useDocAccess } from "@/lib/editor/docAccess";
import { useSuggestion } from "@/lib/ai/suggestion";
import { useProject } from "@/components/frame/ProjectContext";
import { numbersView, type NumbersView } from "@/lib/tools/stats/checkNumbers";
import { selectNth } from "@/lib/tools/stats/checkGo";
import { Button } from "@/components/ui/button";

const TONE = { ok: "var(--ok-ink)", warn: "var(--flag-ink)", error: "var(--danger-ink)" } as const;
const LABEL = { ok: "nc_ok", warn: "nc_warn", error: "nc_err" } as const;
const ICON = { ok: CheckCircle, warn: Warning, error: XCircle } as const;

/**
 * The numbers check (v1 ncDlg and ncOpen 12351-12367, ncJump 12368): reads the open document, finds each statistic written in the APA order and says whether the p
 * written is the one the statistic and df give. A card is a prompt to look again, not a verdict: a statistic that is not found, or that is consistent, is not shown as
 * checked or fine, and the note under the cards says a consistent result does not show the right test was used. No AI, nothing leaves the browser.
 */
export function NumbersCheck() {
  const t = useT();
  const access = useDocAccess();
  const { editor } = useSuggestion();
  const { docOpen, openDocument } = useProject();
  const [view, setView] = useState<NumbersView | null>(null);
  const [said, setSaid] = useState<"" | "gone" | "nowhere">("");

  const scan = () => { setSaid(""); setView(numbersView(access.text())); };
  const go = (i: number) => {
    const c = view?.cards[i];
    if (!c) return;
    if (!editor || editor.isDestroyed) { setSaid("nowhere"); return; }
    if (!docOpen) openDocument();
    setSaid(selectNth(editor, c.raw, c.nth) ? "" : "gone");
  };
  const sum = view?.summary;
  return (
    <section data-testid="check-nc" aria-labelledby="checkNcTitle" style={{ marginTop: 6 }}>
      <h3 id="checkNcTitle">{t("stats_check_nc_title")}</h3>
      <p className="desc">{t("nc_desc")}</p>
      <div className="ap-row ap-wrap">
        <Button variant="primary" size="sm" data-testid="check-nc-run" onClick={scan}>{t(view ? "nc_rescan" : "stats_check_nc_run")}</Button>
      </div>
      {view && (
        <div data-testid="check-nc-result">
          <p role="status" data-testid="check-nc-sum" style={{ fontWeight: 700 }}>
            {sum && sum.n ? t("nc_sum", { n: sum.n, ok: sum.ok, w: sum.warn, e: sum.err }) : t("nc_none")}
          </p>
          {view.cards.map((c, i) => {
            const Icon = ICON[c.status];
            return (
              <div key={i} className="ap-box" data-testid="check-nc-card" data-status={c.status} style={{ borderLeft: "4px solid " + TONE[c.status] }}>
                <div><b style={{ color: TONE[c.status] }}><Icon aria-hidden="true" weight="fill" style={{ verticalAlign: "-2px" }} /> <span data-testid="check-nc-label">{t(LABEL[c.status])}</span></b> <code data-testid="check-nc-raw">{c.raw}</code></div>
                {c.detail && (
                  <div data-testid="check-nc-detail" style={{ marginTop: 3 }}>
                    {t("nc_rep")}: <span data-testid="check-nc-wrote">{c.wrote}</span>. {t("nc_calc")}: <span data-testid="check-nc-calc">{c.recomputed}</span>.
                    {c.note && <> <span data-testid="check-nc-note">{t(c.note)}</span></>}
                  </div>
                )}
                <div className="ap-row"><Button variant="ghost" size="sm" data-testid="check-nc-go" onClick={() => go(i)}>{t("nc_go")}</Button></div>
              </div>
            );
          })}
          {said && <p className="ap-small" role="status" data-testid="check-nc-said">{t(said === "gone" ? "stats_check_text_gone" : "stats_check_text_nowhere")}</p>}
          <p className="desc" data-testid="check-nc-footnote">{t("nc_note")}</p>
        </div>
      )}
    </section>
  );
}
