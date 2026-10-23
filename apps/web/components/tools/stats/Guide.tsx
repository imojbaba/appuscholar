"use client";
import { useEffect, useRef, useState } from "react";
import { Compass } from "@phosphor-icons/react";
import { STATS_TEST_OPTIONS, tgExtra, tgWhyItems, TG_Q, TG_WHY_TEXT, type StatsTestKey, type TgNextOut, type TgQuestionKey } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { answerQuestion, goBack, guideNext, otherOption, startAgain, toggleGuide, useGuide, chooseTest } from "@/lib/tools/stats/guide";
import { Button } from "@/components/ui/button";
import { GuideCheck } from "./GuideCheck";
import { GuideDemo } from "./GuideDemo";

/* The look of the check's table and of a demo's result tables (v1 .stats-table), in the page's tokens; Results.tsx carries the same rules for the student's own result. */
const TABLE_CSS = `
.stats-res table.stats-table { border-collapse: collapse; margin: 8px 0; font-size: 13px; max-width: 100%; display: block; overflow-x: auto; }
.stats-res .stats-table th, .stats-res .stats-table td { border: 1px solid var(--line); padding: 4px 10px; text-align: left; }
.stats-res .stats-table th { background: var(--soft); font-weight: 600; }
.stats-res h4 { margin: 14px 0 4px; font-size: 14px; }
.stats-res p.desc { margin: 6px 0; font-size: 13px; line-height: 19px; color: var(--muted); }
`;

type Result = Extract<TgNextOut, { res: unknown }>["res"];

/** The next question (v1 tgRender 12468-12471): its text and one button per option. */
function Question({ projectId, ask }: { projectId: string; ask: TgQuestionKey }) {
  const Q = TG_Q[ask];
  return (
    <div data-testid="stats-guide-question" data-ask={ask} role="group" aria-labelledby="statsGuideQ">
      <p id="statsGuideQ" tabIndex={-1} style={{ margin: "0 0 6px", fontSize: 13 }}>{Q.q}</p>
      {Q.o.map((o) => (
        <Button key={o[0]} variant="ghost" size="sm" data-testid="stats-guide-opt" data-value={o[0]} style={{ display: "block", width: "100%", textAlign: "left", margin: "4px 0", whiteSpace: "normal", height: "auto" }}
          onClick={() => answerQuestion(projectId, ask, o[0])}>{o[1]}</Button>
      ))}
    </div>
  );
}

/** v1 tgWhyHTML (12433-12439): the answers given and what each implies, why the test fits, and what it assumes and when it stops fitting. */
function Why({ projectId, r }: { projectId: string; r: Result }) {
  const { answers } = useGuide(projectId);
  const items = tgWhyItems(answers, r);
  const ex = tgExtra(r.id);
  return (
    <div data-testid="stats-guide-why" style={{ marginTop: 10, fontSize: 13 }}>
      <b>{TG_WHY_TEXT.head}</b>
      <ul style={{ margin: "4px 0 0 18px" }}>{items.map((i) => <li key={i.answer} data-testid="stats-guide-why-item"><b>{i.answer}.</b> {i.why}</li>)}</ul>
      <div style={{ marginTop: 6 }}>{r.why}</div>
      {ex && <div style={{ marginTop: 6 }}><b>{TG_WHY_TEXT.assume}</b>{ex.assume}</div>}
      {ex && <div style={{ marginTop: 4 }}><b>{TG_WHY_TEXT.watch}</b>{ex.watch}</div>}
    </div>
  );
}

/** The result (v1 tgRender 12472-12480): the best fit, its note, the other options, "Use this test" or v1's hand-over text, why, the demo and the check. */
function ResultCard({ projectId, r }: { projectId: string; r: Result }) {
  const t = useT();
  const [said, setSaid] = useState<"" | "need_data" | "chosen">("");
  const key = r.keys[0] as StatsTestKey | undefined;
  return (
    <div data-testid="stats-guide-result" data-result={r.id} data-built={String(r.built)}>
      <div className="ap-box" style={{ margin: 0 }}>
        <p id="statsGuideBest" tabIndex={-1} className="ap-small" style={{ margin: 0 }}>{t("stats_guide_best")}</p>
        <p data-testid="stats-guide-name" style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>{r.name}</p>
        <p data-testid="stats-guide-fit" style={{ margin: "4px 0 0", fontSize: 13 }}>{r.why}</p>
      </div>
      {r.note && <p data-testid="stats-guide-note" style={{ margin: "8px 0 0", fontSize: 13 }}>{r.note}</p>}
      {r.alt.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 13 }}>
          <b>{t("stats_guide_other")}</b>
          <ul data-testid="stats-guide-others" style={{ margin: "4px 0 0 18px" }}>{r.alt.map((x) => <li key={x[0]} data-testid="stats-guide-other">{otherOption(x)}</li>)}</ul>
        </div>
      )}
      {r.built && key ? (
        <div style={{ marginTop: 10 }}>
          <div className="ap-row ap-wrap">
            <Button variant="primary" size="sm" data-testid="stats-guide-use" onClick={() => {
              const r2 = chooseTest(projectId, key);
              setSaid(r2);
              // v1 scrolled to the test area (tgUse 12485); the chooser now holding the test takes the focus as well
              if (r2 === "chosen") { const el = document.getElementById("statsTest"); el?.scrollIntoView?.({ behavior: "smooth", block: "nearest" }); el?.focus({ preventScroll: true }); }
            }}>{t("stats_guide_use")}</Button>
          </div>
          {said && <p className={said === "chosen" ? "ap-ok" : "ap-small"} role="status" data-testid="stats-guide-use-msg" style={{ margin: "6px 0 0" }}>
            {said === "chosen" ? t("stats_guide_chosen", { name: STATS_TEST_OPTIONS[key] }) : t("stats_guide_need_data")}
          </p>}
        </div>
      ) : (
        <p className="ap-box" data-testid="stats-guide-unbuilt" style={{ fontSize: 13 }}>{t("stats_guide_unbuilt")}</p>
      )}
      <Why projectId={projectId} r={r} />
      <GuideDemo projectId={projectId} r={r} />
      <GuideCheck projectId={projectId} />
    </div>
  );
}

/**
 * "Which test fits my data?" (v1 tgPanel, opened by the Statistics Lab's "Which test fits my data?" button, 12441-12519): a few plain questions, then the best fit
 * with the reasons, the other options, a small practice demo and a check of the numbers. Closed until the student opens it. The routing and the wording of the questions
 * and results are core's (v1's); the labels around them are messages.
 */
export function Guide({ projectId }: { projectId: string }) {
  const t = useT();
  const g = useGuide(projectId);
  const next = g.open ? guideNext(g.answers) : null;
  const screen = next ? ("ask" in next ? "q:" + next.ask : "r:" + next.res.id) : "";
  // After an answer the new screen takes the keyboard focus, so a screen-reader or keyboard user is not left on a button that has gone.
  const seen = useRef(screen);
  useEffect(() => {
    if (screen && seen.current && seen.current !== screen) document.getElementById(screen.startsWith("q:") ? "statsGuideQ" : "statsGuideBest")?.focus();
    seen.current = screen;
  }, [screen]);
  return (
    <section className="stats-res" data-testid="stats-guide" style={{ marginTop: 18 }} aria-labelledby="statsGuideTitle">
      <style>{TABLE_CSS}</style>
      <h3 id="statsGuideTitle" style={{ display: "flex", alignItems: "center", gap: 6 }}><Compass aria-hidden="true" />{t("stats_guide_title")}</h3>
      <p className="desc">{t("stats_guide_intro")}</p>
      <Button variant="ghost" size="sm" data-testid="stats-guide-toggle" aria-expanded={g.open} aria-controls="statsGuidePanel" onClick={() => toggleGuide(projectId)}>
        {g.open ? t("stats_guide_close") : t("stats_guide_open")}
      </Button>
      {next && (
        <div id="statsGuidePanel" data-testid="stats-guide-panel" style={{ marginTop: 10 }}>
          {"ask" in next ? <Question projectId={projectId} ask={next.ask} /> : <ResultCard key={next.res.id} projectId={projectId} r={next.res} />}
          {Object.keys(g.answers).length > 0 && (
            <div className="ap-row ap-wrap" style={{ marginTop: 8 }}>
              <Button variant="ghost" size="sm" data-testid="stats-guide-back" onClick={() => goBack(projectId)}>{t("stats_guide_back")}</Button>
              <Button variant="ghost" size="sm" data-testid="stats-guide-again" onClick={() => startAgain(projectId)}>{t("stats_guide_again")}</Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
