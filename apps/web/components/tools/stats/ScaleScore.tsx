"use client";
import { useState } from "react";
import Link from "next/link";
import { Warning } from "@phosphor-icons/react";
import { sanitizeHtml, slGuessColumns, type ParsedData, type Scale } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { placeHref } from "@/lib/frame/places";
import { useLab } from "@/lib/tools/stats/lab";
import { scoreInLab, type ScaleOutcome } from "@/lib/tools/stats/scaleScore";
import { Button } from "@/components/ui/button";

/** What the student has chosen for the table and scale it was chosen for; a different table or scale starts again from core's guess. */
type Picks = { data: ParsedData; scaleId: string; idx: number[]; coding: number };
type Said = { scaleId: string; outcome: Exclude<ScaleOutcome, { kind: "nodata" }> };

/**
 * Scoring a scale in the student's data (v1 slScoreDlg 1263-1271, slScoreOpen 11470, slScoreRun 11487): each item gets a column (core's slGuessColumns picks them, the student can
 * change them), the coding is chosen, and "Compute scores and add them to my data" runs core's slScoreData over the table in the lab. A refusal or no-row sentence is core's, shown as text. A
 * scored table goes back into the lab's paste text and is parsed again, which scans it for personal details again (lib/tools/stats/scaleScore.ts); the sentence core made is sanitized
 * before it is drawn. With no table in the lab it says to parse data on the Data tab first and links there. Item wording is drawn from core's table and nothing here reaches the AI (Rule 10).
 */
export function ScaleScore({ projectId, scale: x }: { projectId: string; scale: Scale }) {
  const t = useT();
  const lab = useLab(projectId);
  const [picks, setPicks] = useState<Picks | null>(null);
  const [said, setSaid] = useState<Said | null>(null);
  const [working, setWorking] = useState(false);
  const dataHref = placeHref(projectId, "collect", "data");
  const data = lab.data;
  if (!data) {
    return (
      <div data-testid="scale-score" style={{ marginTop: 10 }}>
        <h4 style={{ margin: "0 0 6px" }}>{t("stats_sc_score_h", { name: x.short })}</h4>
        <p className="ap-box" data-testid="scale-nodata">
          {t("stats_sc_nodata")} <Link href={dataHref} data-testid="scale-to-data">{t("stats_sc_to_data")}</Link>
        </p>
      </div>
    );
  }
  const mine = picks && picks.data === data && picks.scaleId === x.id ? picks : null;
  const idx = mine?.idx ?? slGuessColumns(x, data.headers);
  const coding = mine?.coding ?? 0;
  const set = (next: Partial<Pick<Picks, "idx" | "coding">>) => setPicks({ data, scaleId: x.id, idx, coding, ...next });
  const mySaid = said && said.scaleId === x.id ? said.outcome : null;

  const run = async () => {
    setWorking(true);
    const o = await scoreInLab(projectId, x, idx, coding);
    setWorking(false);
    if (o.kind === "nodata") return;
    setSaid({ scaleId: x.id, outcome: o });
    // The new columns are added at the end, so the student's choices still point at the same columns of the table that was parsed again.
    if (o.kind === "scored" && o.data) setPicks({ data: o.data, scaleId: x.id, idx, coding });
  };
  const flagged = mySaid?.kind === "scored" && mySaid.data !== null && mySaid.data === data && (lab.scan?.found.length ?? 0) > 0;

  return (
    <div data-testid="scale-score" style={{ marginTop: 10 }}>
      <h4 style={{ margin: "0 0 6px" }}>{t("stats_sc_score_h", { name: x.short })}</h4>
      <p className="desc">{t("stats_sc_score_intro")}</p>
      {x.items.map((item, i) => (
        <label key={i} className="ap-row ap-wrap" style={{ margin: "4px 0", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ flex: 1, minWidth: 220 }}>
            {i + 1}. <span data-testid={"scale-map-item-" + i}>{item}</span>
            {(x.reverse as readonly number[]).includes(i + 1) && <> <i className="ap-small" data-testid={"scale-map-reverse-" + i}>{t("stats_sc_reverse")}</i></>}
          </span>
          <select className="input" style={{ width: "auto", minWidth: 140 }} data-testid={"scale-map-" + i} value={String(idx[i])}
            onChange={(e) => set({ idx: idx.map((v, k) => (k === i ? parseInt(e.target.value, 10) : v)) })}>
            <option value="-1">{t("stats_sc_choose")}</option>
            {data.headers.map((hd, k) => <option key={k} value={k}>{hd}</option>)}
          </select>
        </label>
      ))}
      <div className="field" style={{ marginTop: 8 }}>
        <label htmlFor="scale-coding">{t("stats_sc_coding")}</label>
        <select id="scale-coding" className="input" data-testid="scale-coding" value={String(coding)} onChange={(e) => set({ coding: parseInt(e.target.value, 10) || 0 })}>
          {x.codings.map((c, i) => <option key={i} value={i}>{c.label}</option>)}
        </select>
      </div>
      <div className="ap-row" style={{ marginTop: 8 }}>
        <Button variant="primary" size="sm" data-testid="scale-run" disabled={lab.busy || working} onClick={() => void run()}>{t("stats_sc_run")}</Button>
      </div>
      {mySaid && (
        mySaid.kind === "scored"
          ? <p className="ap-box" role="status" data-testid="scale-out" dangerouslySetInnerHTML={{ __html: sanitizeHtml(mySaid.html) }} />
          : <p className="ap-box" role="status" data-testid="scale-out">{mySaid.message}</p>
      )}
      {flagged && (
        <p className="ap-banner" data-testid="scale-pd-note">
          <Warning weight="fill" aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 4 }} />{t("stats_sc_pd_again")}{" "}
          <Link href={dataHref} data-testid="scale-pd-link">{t("stats_sc_pd_link")}</Link>
        </p>
      )}
    </div>
  );
}
