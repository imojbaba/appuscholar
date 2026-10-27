"use client";
import { useT } from "@/lib/i18n";
import type { HomeFacts } from "@/lib/frame/homeFacts";
import { SECTIONS } from "@/lib/frame/shapeStudy";

/** The five parts after the question, as the home lists them. */
const FACTS = ["who", "how", "time", "have", "ethics"] as const;

/** The card's way to Shape your study: Start with nothing answered, Continue with some, Edit once all six are. */
function shapeLabel(answered: number): string {
  return answered === 0 ? "shape_home_start" : answered < SECTIONS.length ? "shape_home_continue" : "home_q_edit";
}

/**
 * The home's study card (start-a-study spec): Shape your study's progress ("3 of 6 parts answered") with Start, Continue or Edit (to the Idea place),
 * the question, the other five parts and the field, and the feasibility read only when the student asked for one.
 */
export function QuestionCard({ facts, onEdit }: { facts: HomeFacts; onEdit(): void }) {
  const t = useT();
  const fact = (v: string) => v.trim() || t("home_q_unset");
  return (
    <section className="home-card home-q" data-testid="home-question">
      <div className="home-card-head">
        <h2>{t("shape_h")}</h2>
        <button type="button" className="home-link" onClick={onEdit} data-testid="home-q-edit">{t(shapeLabel(facts.answered))}</button>
      </div>
      <p className="home-q-count" data-testid="home-shape-count">{t("shape_home_card", { n: facts.answered })}</p>
      <p className="home-q-text" data-testid="home-q-text">{facts.question.trim() || t("place_question_none")}</p>
      <dl className="home-q-facts">
        {FACTS.map((k) => <div key={k} className="contents"><dt>{t(`shape_${k}_title`)}</dt><dd data-testid={"home-q-" + k}>{fact(facts[k])}</dd></div>)}
        <dt>{t("home_q_field")}</dt><dd>{fact(facts.field)}</dd>
      </dl>
      {facts.checked && (
        <div className={facts.verdict === null ? "home-q-verdict home-q-read" : "home-q-verdict"} data-testid="home-q-verdict">
          {facts.verdict !== null ? t("home_verdict", { verdict: facts.verdict }) : facts.readText}
        </div>
      )}
    </section>
  );
}

/**
 * The study card on a phone (canvas Phone): Shape your study closed by default; open, the progress, the question, who, time and what you have as one
 * line, and Start, Continue or Edit (to the Idea place).
 */
export function QuestionFold({ facts, onEdit }: { facts: HomeFacts; onEdit(): void }) {
  const t = useT();
  // "About 60 first-years. One semester." Each fact a sentence, its own stop kept.
  const line = [facts.who, facts.time, facts.have].map((v) => v.trim()).filter(Boolean).map((v) => (/[.!?।]$/.test(v) ? v : v + ".")).join(" ");
  return (
    <details className="home-card home-qfold" data-testid="home-q-fold">
      <summary>{t("shape_h")}</summary>
      <p className="home-q-count" data-testid="home-shape-count">{t("shape_home_card", { n: facts.answered })}</p>
      <p className="home-q-text" data-testid="home-q-text">{facts.question.trim() || t("place_question_none")}</p>
      {line && <p className="home-qfold-facts" data-testid="home-q-line">{line}</p>}
      <button type="button" className="home-link" onClick={onEdit} data-testid="home-q-edit">{t(shapeLabel(facts.answered))}</button>
    </details>
  );
}
