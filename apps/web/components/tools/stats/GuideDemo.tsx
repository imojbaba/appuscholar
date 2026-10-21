"use client";
import { useT } from "@/lib/i18n";
import { backToMine, demoOf, runGuideDemo, setPrediction, useGuide } from "@/lib/tools/stats/guide";
import { Button } from "@/components/ui/button";
import type { TgResult } from "@appuscholar/core";
import { ResultChart } from "./ResultChart";

/**
 * The small demo of a built result (v1 tgDemoHTML 12440-12449, tgDemo 12458-12481, tgBackToMine 12453-12457): "Predict first.", then the test is run on a small
 * invented table and the prediction is compared to what it found. The table, the sentence and the picture are shown here, apart from the student's own data: the
 * paste box, the table, the test form and the result of the Data tab are not touched, nothing is registered or recorded, and nothing here can be inserted
 * into the document or sent to the AI (register row D-S2-71).
 */
export function GuideDemo({ projectId, r }: { projectId: string; r: TgResult }) {
  const t = useT();
  const g = useGuide(projectId);
  const dm = demoOf(r);
  if (!dm) return null;
  const lines = dm.csv.split("\n");
  const d = g.demo && g.demo.id === r.id ? g.demo : null;
  return (
    <div className="ap-box" data-testid="stats-guide-demo" style={{ marginTop: 12 }}>
      <p data-testid="stats-guide-demo-title" style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>{t("stats_guide_demo_title", { title: dm.title })}</p>
      <p style={{ fontSize: 13, margin: "4px 0" }}>
        {dm.note} <i>{t("stats_guide_demo_invented")}</i>{" "}
        <span data-testid="stats-guide-demo-shape">{t("stats_guide_demo_shape", { n: lines.length - 1, cols: lines[0]!.split(",").join(", ") })}</span>
      </p>
      <fieldset style={{ border: 0, padding: 0, margin: "6px 0 2px" }}>
        <legend style={{ fontSize: 13, padding: 0 }}><b>{t("stats_guide_predict_head")}</b> {t("stats_guide_predict_ask")}</legend>
        {(["yes", "no"] as const).map((v) => (
          <label key={v} className="ap-row" style={{ gap: 6, fontSize: 13, cursor: "pointer", margin: "2px 0" }}>
            <input type="radio" name={"statsGuidePred-" + r.id} value={v} data-testid={"stats-guide-pred-" + v} checked={g.pred === v} onChange={() => setPrediction(projectId, v)} />
            {t(v === "yes" ? "stats_guide_pred_yes" : "stats_guide_pred_no")}
          </label>
        ))}
      </fieldset>
      <div className="ap-row ap-wrap" style={{ marginTop: 8 }}>
        <Button variant="primary" size="sm" data-testid="stats-guide-demo-run" onClick={() => { runGuideDemo(projectId, r, t); }}>{t("stats_guide_demo_run")}</Button>
      </div>
      {g.needPred && <p className="ap-small" role="status" data-testid="stats-guide-demo-msg" style={{ margin: "6px 0 0" }}>{t("stats_guide_demo_need_pred")}</p>}
      {d && (
        <div data-testid="stats-guide-demo-out" style={{ marginTop: 8, fontSize: 13 }}>
          <div className="ap-box" style={{ margin: 0 }}>
            <p data-testid="stats-guide-demo-verdict" style={{ margin: 0, fontWeight: 700 }}>
              {t(d.guess === "yes" ? "stats_guide_you_clear" : "stats_guide_you_none")}{" "}
              {t(d.isScale ? "stats_guide_scale" : d.guess === "yes" === d.sig ? "stats_guide_agree" : d.sig ? "stats_guide_says_clear" : "stats_guide_says_none")}
            </p>
            <p data-testid="stats-guide-demo-sentence" style={{ margin: "4px 0 0" }}>{d.outcome.res.apa}</p>
            <p data-testid="stats-guide-demo-read" style={{ margin: "6px 0 0" }}><b>{t("stats_guide_read")}</b> {d.read}</p>
          </div>
          <div className="stats-res" data-testid="stats-guide-demo-results">
            <h4>{t("stats_guide_demo_results")}</h4>
            <div dangerouslySetInnerHTML={{ __html: d.outcome.html }} />
            {d.outcome.chart && <ResultChart spec={d.outcome.chart} />}
          </div>
          <p className="ap-small" data-testid="stats-guide-demo-apart">{t("stats_guide_demo_apart")}</p>
          <div className="ap-row" style={{ marginTop: 8 }}>
            <Button variant="ghost" size="sm" data-testid="stats-guide-demo-back" onClick={() => backToMine(projectId)}>{t("stats_guide_back_mine")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
