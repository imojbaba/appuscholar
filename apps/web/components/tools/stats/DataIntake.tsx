"use client";
import { useRef } from "react";
import { CheckCircle, UploadSimple } from "@phosphor-icons/react";
import { useT } from "@/lib/i18n";
import { clearLab, setText, useLab, type LabState } from "@/lib/tools/stats/lab";
import type { LabActions } from "@/lib/tools/stats/useLabActions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** How many left-out lines are named before "and N more". */
const LINES_SHOWN = 10;

const STATUS_KEY = { none: "", empty: "stats_data_empty", parsed: "stats_data_parsed", split: "stats_data_split_done", read_failed: "stats_data_read_failed", adding: "stats_data_adding" } as const;

/** The quiet line (v1 toasted "Data parsed" and the empty message; toasts are "Saved" and "Inserted" only, register row D-S2-62). */
function Status({ lab }: { lab: LabState }) {
  const t = useT();
  // Apply waiting for the participant list to save holds the page too (busy); it says what it is doing, not that the data is being read.
  const key = lab.status.kind === "adding" ? STATUS_KEY.adding : lab.busy ? "stats_data_busy" : STATUS_KEY[lab.status.kind];
  const good = !lab.busy && (lab.status.kind === "parsed" || lab.status.kind === "split");
  return (
    <p className={good ? "ap-ok" : "ap-small"} role="status" aria-live="polite" data-testid="stats-status" hidden={!key}>
      {good && <CheckCircle weight="fill" aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 4 }} />}
      {key ? t(key) : ""}
    </p>
  );
}

/**
 * The Data tab's intake (v1 statsDlg 1529-1550, statsParse 9389): the dataset name (60 characters; remembered), the paste box, "Parse data" and
 * "Upload .csv" (.csv, .tsv, .txt), then what was found: the columns as chips, the rows left out (new: register row D-S2-60) and, for a table that
 * came out as one column of semicolons, the offer to split it (D-S2-61). The rows themselves are in the lab (lib/tools/stats/lab.ts), in memory.
 */
export function DataIntake({ projectId, actions }: { projectId: string; actions: LabActions }) {
  const t = useT();
  const lab = useLab(projectId);
  const file = useRef<HTMLInputElement>(null);
  const d = lab.data;
  const shown = lab.skipped.lines.slice(0, LINES_SHOWN).join(", ");
  const lines = lab.skipped.count > LINES_SHOWN ? t("stats_data_skipped_more", { lines: shown, more: lab.skipped.count - LINES_SHOWN }) : shown;
  return (
    <>
      <div className="field">
        <label htmlFor="statsDsName">{t("stats_data_name_label")}</label>
        <input className="input" id="statsDsName" data-testid="stats-name" type="text" maxLength={60} placeholder={t("stats_data_name_ph")}
          value={lab.name} onChange={(e) => actions.rename(e.target.value)} />
        <span className="ap-small">{t("stats_data_name_help")}</span>
      </div>
      <div className="field">
        <label htmlFor="statsPaste">{t("stats_data_paste_label")}</label>
        <textarea className="input" id="statsPaste" data-testid="stats-paste" rows={6} placeholder={t("stats_data_paste_ph")}
          value={lab.text} onChange={(e) => setText(projectId, e.target.value)} />
      </div>
      <div className="ap-row ap-wrap">
        <Button variant="primary" size="sm" data-testid="stats-parse" disabled={lab.busy} onClick={() => void actions.parseNow()}>{t("stats_data_parse")}</Button>
        <Button variant="ghost" size="sm" data-testid="stats-upload" disabled={lab.busy} onClick={() => file.current?.click()}><UploadSimple aria-hidden="true" />{t("stats_data_upload")}</Button>
        {(lab.text || d) && <Button variant="ghost" size="sm" data-testid="stats-clear" disabled={lab.busy} onClick={() => clearLab(projectId)}>{t("stats_data_clear")}</Button>}
        {/* The same file can be chosen again: the field is emptied once its file is taken (v1 9411). */}
        <input ref={file} type="file" accept=".csv,.tsv,.txt" hidden data-testid="stats-file" aria-label={t("stats_data_upload")}
          onChange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ""; if (f) actions.upload(f); }} />
      </div>
      <Status lab={lab} />
      {d && (
        <div data-testid="stats-chips">
          <p className="desc" data-testid="stats-rows" style={{ marginBottom: 4 }}>{t("stats_data_rows_found", { n: d.rows.length })}</p>
          <div className="ap-row ap-wrap">
            {d.cols.map((c) => (
              <Badge key={c.index} variant={c.type === "numeric" ? "ok" : "chip"} data-testid="stats-chip">
                {t(c.type === "numeric" ? "stats_data_chip_numeric" : "stats_data_chip_categorical", { name: c.name, n: c.n })}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {d && lab.skipped.count > 0 && (
        <p className="ap-box" data-testid="stats-skipped">{t("stats_data_skipped", { n: lab.skipped.count, lines })}</p>
      )}
      {d && lab.semicolons && (
        <div className="ap-box" data-testid="stats-semicolon">
          <p style={{ margin: "0 0 6px" }}>{t("stats_data_semicolon")}</p>
          <Button variant="ghost" size="sm" data-testid="stats-semicolon-btn" disabled={lab.busy} onClick={() => void actions.split()}>{t("stats_data_semicolon_btn")}</Button>
        </div>
      )}
    </>
  );
}
