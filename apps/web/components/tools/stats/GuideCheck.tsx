"use client";
import { useState } from "react";
import { tgCheck, tgCountsText, TG_CHECK_FALLBACK, TG_CHECK_TEXT, type ParsedData, type TgCheckOut, type TgCheckSel } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { useLab } from "@/lib/tools/stats/lab";
import { Button } from "@/components/ui/button";

const NONE: TgCheckSel = { num: "", grp: "", c1: "", c2: "" };

/** Where nothing was flagged, core's sentence ("Nothing here points away...", "Chi-square is fine...") could read as a clearance; this says what the check did not look at (rule 8: no flag is not "safe"). */
function NotProof() {
  const t = useT();
  return <p className="ap-small" data-testid="stats-guide-check-not-proof" style={{ margin: "0 0 6px" }}>{t("stats_guide_check_not_proof")}</p>;
}

/** What v1 wrote into #tgCheckOut (12534-12561) from core's tgCheck: the group table with its two paragraphs, the counts paragraph, or the fallback sentence. Labels are text nodes. */
function CheckOut({ out }: { out: TgCheckOut }) {
  const n = out.numbers, c = out.counts;
  if (!n && !c) return <>{TG_CHECK_FALLBACK}</>;
  return (
    <>
      {n && (
        <>
          <table className="stats-table">
            <tbody>
              <tr>{TG_CHECK_TEXT.head.map((x) => <th key={x}>{x}</th>)}</tr>
              {n.rows.map((r) => <tr key={r.group}><td>{r.group}</td><td>{r.n}</td><td>{r.skew}</td><td>{r.outliers}</td></tr>)}
            </tbody>
          </table>
          <p style={{ margin: "6px 0" }}>{n.rank ? TG_CHECK_TEXT.rank : TG_CHECK_TEXT.means}{TG_CHECK_TEXT.thumb}</p>
          {!n.rank && <NotProof />}
          {n.tiny && <p style={{ margin: "6px 0" }}>{TG_CHECK_TEXT.tiny}</p>}
        </>
      )}
      {c && <p style={{ margin: "6px 0" }}>{tgCountsText(c)}</p>}
      {c && c.ok && <NotProof />}
    </>
  );
}

/**
 * "Check my numbers" (v1 tgCheckHTML 12520-12530, tgCheck 12534-12561): group sizes, skew and outliers for a score column, and the expected counts for two category
 * columns, from core's tgCheck over the lab's table. Information only: nothing here blocks a test or chooses one. The answer belongs to the table it was made for.
 */
export function GuideCheck({ projectId }: { projectId: string }) {
  const t = useT();
  const d = useLab(projectId).data;
  const [picked, setPicked] = useState<{ of: ParsedData; sel: TgCheckSel } | null>(null);
  const [shown, setShown] = useState<{ of: ParsedData; out: TgCheckOut } | null>(null);
  if (!d) return <p className="ap-small" data-testid="stats-guide-check" style={{ marginTop: 10 }}>{t("stats_guide_check_need")}</p>;
  // the picks belong to the table they were made on (a new table has other columns)
  const sel = picked && picked.of === d ? picked.sel : NONE;
  const setSel = (next: TgCheckSel) => setPicked({ of: d, sel: next });
  const num = d.cols.filter((c) => c.type === "numeric"), cat = d.cols.filter((c) => c.type === "categorical");
  const field = (id: keyof TgCheckSel, label: string, cols: typeof num) => (
    <div className="field" style={{ flex: "1 1 180px" }}>
      <label htmlFor={"statsGuideCheck-" + id}>{label}</label>
      <select className="input" id={"statsGuideCheck-" + id} data-testid={"stats-guide-check-" + id} value={sel[id]} onChange={(e) => setSel({ ...sel, [id]: e.target.value })}>
        <option value="">{t("stats_guide_check_none")}</option>
        {cols.map((c) => <option key={c.index} value={String(c.index)}>{c.name}</option>)}
      </select>
    </div>
  );
  return (
    <div data-testid="stats-guide-check" style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
      <b style={{ fontSize: 13 }}>{t("stats_guide_check_title")}</b>
      <p className="ap-small" style={{ margin: "2px 0 6px" }}>{t("stats_guide_check_help")}</p>
      <div className="ap-row ap-wrap" style={{ alignItems: "flex-start" }}>
        {field("num", t("stats_guide_check_num"), num)}
        {field("grp", t("stats_guide_check_grp"), cat)}
        {field("c1", t("stats_guide_check_c1"), cat)}
        {field("c2", t("stats_guide_check_c2"), cat)}
      </div>
      <Button variant="ghost" size="sm" data-testid="stats-guide-check-btn" onClick={() => setShown({ of: d, out: tgCheck({ data: d, form: { values: {}, ticked: {} }, skipped: 0 }, sel) })}>{t("stats_guide_check_btn")}</Button>
      {shown && shown.of === d && <div className="stats-res" data-testid="stats-guide-check-out" role="status" style={{ marginTop: 8, fontSize: 13 }}><CheckOut out={shown.out} /></div>}
    </div>
  );
}
