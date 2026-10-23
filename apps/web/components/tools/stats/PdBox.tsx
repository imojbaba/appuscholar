"use client";
import { Warning } from "@phosphor-icons/react";
import { PD_DEFAULT, type PdChoice } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { setChoice, useLab, type PdResult } from "@/lib/tools/stats/lab";
import type { LabActions } from "@/lib/tools/stats/useLabActions";
import { Button } from "@/components/ui/button";

/** v1's sentence after Apply (pdApply 9498-9504), from the counts: "Done." with the columns removed, the columns coded and the key file. */
function resultText(t: ReturnType<typeof useT>, r: PdResult): string {
  if ("unchanged" in r) return t("stats_pd_unchanged");
  return [t("stats_pd_done"), r.removed ? t("stats_pd_removed", { n: r.removed }) : "", r.coded ? t("stats_pd_coded", { n: r.coded }) : "", r.keyed ? t("stats_pd_keyed") : ""].filter(Boolean).join(" ");
}

/**
 * The personal-data box (v1 pdRender 9487-9506), drawn under the columns once a table is parsed. core's pdScan reads headings and the shape of the
 * values; this box shows what it flagged with Remove / Replace with a code / Keep (starting at PD_DEFAULT), or says what was checked (never that the
 * data is safe: rule 8), and always says what the scan cannot see and lists the long-text columns. "Apply" rewrites the paste box (the lab), parses
 * again and, when a column was coded, downloads the key file.
 */
export function PdBox({ projectId, actions }: { projectId: string; actions: LabActions }) {
  const t = useT();
  const lab = useLab(projectId);
  if (!lab.data || !lab.scan) return null;
  const { found, freeText } = lab.scan;
  return (
    <div data-testid="pd-box" style={{ marginTop: 14 }}>
      {lab.pdResult && <p className="ap-box" role="status" data-testid="pd-result">{resultText(t, lab.pdResult)}</p>}
      {found.length === 0 ? (
        <p className="ap-box" data-testid="pd-none">{t("stats_pd_none")}</p>
      ) : (
        <div className="ap-banner" data-testid="pd-found">
          <b><Warning weight="fill" aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 4 }} />{t("stats_pd_title")}</b>
          <p style={{ margin: "6px 0 8px" }}>{t("stats_pd_intro")}</p>
          {found.map((f) => (
            <div key={f.index} className="ap-row ap-wrap" style={{ justifyContent: "space-between" }}>
              <span style={{ flex: 1, minWidth: 180 }}><b>{f.name}</b> {t("stats_pd_label_" + f.kind)}</span>
              <select className="input" style={{ width: "auto", minWidth: 150 }} data-testid={"pd-sel-" + f.index} aria-label={t("stats_pd_select_aria", { name: f.name })}
                value={lab.choices[f.index] ?? PD_DEFAULT[f.kind]} onChange={(e) => setChoice(projectId, f.index, e.target.value as PdChoice)}>
                <option value="remove">{t("stats_pd_remove")}</option>
                <option value="code">{t("stats_pd_code")}</option>
                <option value="keep">{t("stats_pd_keep")}</option>
              </select>
            </div>
          ))}
          <div className="ap-row" style={{ marginTop: 10 }}>
            <Button variant="primary" size="sm" data-testid="pd-apply" disabled={lab.busy} onClick={() => void actions.apply()}>{t("stats_pd_apply")}</Button>
          </div>
          <p className="ap-small" style={{ margin: "8px 0 0" }}>{t("stats_pd_pseudo")}</p>
        </div>
      )}
      <p className="ap-small" data-testid="pd-scope" style={{ margin: "6px 0 0" }}>
        {t("stats_pd_scope")}{freeText.length ? " " + t("stats_pd_long", { cols: freeText.join(", ") }) : ""}
      </p>
    </div>
  );
}
