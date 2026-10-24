"use client";
import { useT } from "@/lib/i18n";
import type { HomeFacts } from "@/lib/frame/homeFacts";

/** The home's question card (canvas Main): "Your question" with Edit (to the Idea place), the four facts and the feasibility verdict (the read as it came when it has none). */
export function QuestionCard({ facts, onEdit }: { facts: HomeFacts; onEdit(): void }) {
  const t = useT();
  const fact = (v: string) => v.trim() || t("home_q_unset");
  return (
    <section className="home-card home-q" data-testid="home-question">
      <div className="home-card-head">
        <h2>{t("home_q_h")}</h2>
        <button type="button" className="home-link" onClick={onEdit} data-testid="home-q-edit">{t("home_q_edit")}</button>
      </div>
      <p className="home-q-text" data-testid="home-q-text">{facts.question.trim() || t("place_question_none")}</p>
      <dl className="home-q-facts">
        <dt>{t("home_q_people")}</dt><dd>{fact(facts.people)}</dd>
        <dt>{t("home_q_time")}</dt><dd>{fact(facts.time)}</dd>
        <dt>{t("home_q_limits")}</dt><dd>{fact(facts.limits)}</dd>
        <dt>{t("home_q_field")}</dt><dd>{fact(facts.field)}</dd>
      </dl>
      <div className={facts.verdict === null && facts.checked ? "home-q-verdict home-q-read" : "home-q-verdict"} data-testid="home-q-verdict">
        {facts.verdict !== null ? t("home_verdict", { verdict: facts.verdict }) : facts.checked ? facts.readText : t("home_verdict_none")}
      </div>
    </section>
  );
}

/**
 * The question on a phone (canvas Phone): "Your question" closed by default; open, the question, the people, time and limits as one line, and
 * Edit (to the Idea place).
 */
export function QuestionFold({ facts, onEdit }: { facts: HomeFacts; onEdit(): void }) {
  const t = useT();
  // "About 60 first-years. One semester." Each fact a sentence, its own stop kept.
  const line = [facts.people, facts.time, facts.limits].map((v) => v.trim()).filter(Boolean).map((v) => (/[.!?।]$/.test(v) ? v : v + ".")).join(" ");
  return (
    <details className="home-card home-qfold" data-testid="home-q-fold">
      <summary>{t("home_q_h")}</summary>
      <p className="home-q-text" data-testid="home-q-text">{facts.question.trim() || t("place_question_none")}</p>
      {line && <p className="home-qfold-facts" data-testid="home-q-line">{line}</p>}
      <button type="button" className="home-link" onClick={onEdit} data-testid="home-q-edit">{t("home_q_edit")}</button>
    </details>
  );
}
