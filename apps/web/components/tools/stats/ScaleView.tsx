"use client";
import { useState } from "react";
import { Copy, DownloadSimple, ListChecks } from "@phosphor-icons/react";
import { slCodebookCsv, slText, type Scale } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { downloadBlob } from "@/lib/export/download";
import { Button } from "@/components/ui/button";

/**
 * One scale (v1 slPick 11433-11445): its name, stem, response options, the numbered items with reverse marks, the scoring note and the licence record, then
 * "Copy the questionnaire text" (core's slText with its credit line), "Download the item list (CSV)" (core's slCodebookCsv as `{ID}_items.csv`) and the button
 * that opens the scoring area. Rule 10: every word of the scale is drawn straight from core's table, as text, and nothing here sends it anywhere but the clipboard and a file.
 */
export function ScaleView({ scale: x, scoring, onScore }: { scale: Scale; scoring: boolean; onScore: () => void }) {
  const t = useT();
  const [copy, setCopy] = useState<{ of: string; v: "ok" | "failed" } | null>(null);
  const shown = copy && copy.of === x.id ? copy.v : "";
  const lc = x.licence;
  const doCopy = () => {
    let w: Promise<void> | undefined;
    try { w = navigator.clipboard?.writeText(slText(x, true)); } catch { w = undefined; }
    if (!w) { setCopy({ of: x.id, v: "failed" }); return; }
    w.then(() => setCopy({ of: x.id, v: "ok" }), () => setCopy({ of: x.id, v: "failed" }));
  };
  const doCsv = () => {
    const f = slCodebookCsv(x);
    downloadBlob(f.name, new Blob(["\uFEFF" + f.csv], { type: "text/csv;charset=utf-8" }));
  };
  return (
    <div className="ap-box" data-testid="scale-view" style={{ marginTop: 10 }}>
      <h4 data-testid="scale-name" style={{ margin: "0 0 6px" }}>{`${x.name} (${x.short})`}</h4>
      <p data-testid="scale-stem" style={{ margin: "0 0 6px" }}>{x.stem}</p>
      <p className="ap-small" data-testid="scale-options" style={{ margin: "0 0 6px" }}>{t("stats_sc_options", { list: x.labels.join(" | ") })}</p>
      <ol style={{ lineHeight: 1.6, margin: "0 0 8px 18px" }}>
        {x.items.map((item, i) => (
          <li key={i}>
            <span data-testid="scale-item">{item}</span>
            {(x.reverse as readonly number[]).includes(i + 1) && <> <span className="ap-small" data-testid={"scale-reverse-" + i}>{t("stats_sc_reverse")}</span></>}
          </li>
        ))}
      </ol>
      <p data-testid="scale-scoring"><b>{t("stats_sc_scoring_lead")}</b> {x.scoring}</p>
      <div className="ap-small" data-testid="scale-licence" style={{ margin: "8px 0", padding: 8, background: "var(--soft)", border: "1px solid var(--line)", borderRadius: 8 }}>
        <b>{t("stats_sc_lic_lead")}</b>{" "}
        {t("stats_sc_lic_line", { status: lc.status, use: t(lc.commercial ? "stats_sc_use_yes" : "stats_sc_use_no"), date: lc.checked })}
        <br />{lc.note}
        <br />{t("stats_sc_credit", { credit: lc.attribution })}
        <br />{t("stats_sc_source")} <a href={lc.source} target="_blank" rel="noopener noreferrer" data-testid="scale-source">{lc.source}</a>
        <br /><i>{lc.verified}</i>
      </div>
      <div className="ap-row ap-wrap">
        <Button variant="primary" size="sm" data-testid="scale-copy" onClick={doCopy}><Copy aria-hidden="true" />{t("stats_sc_copy")}</Button>
        <Button variant="ghost" size="sm" data-testid="scale-csv" onClick={doCsv}><DownloadSimple aria-hidden="true" />{t("stats_sc_csv")}</Button>
        <Button variant="ghost" size="sm" data-testid="scale-score-open" aria-expanded={scoring} onClick={onScore}><ListChecks aria-hidden="true" />{t("stats_sc_score")}</Button>
      </div>
      {shown && <p className={shown === "ok" ? "ap-ok" : "ap-small"} role="status" data-testid="scale-copy-status">{shown === "ok" ? t("stats_sc_copied") : t("stats_res_copy_failed")}</p>}
    </div>
  );
}
