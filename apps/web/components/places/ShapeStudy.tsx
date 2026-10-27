"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { coachSection } from "@/lib/ai/actions";
import { useCallAI } from "@/lib/ai/useCallAI";
import { useProjectBlob } from "@/lib/blobs/useProjectBlob";
import type { IdeaIntake } from "@/lib/blobs/kinds";
import { putAiInDocument } from "@/lib/editor/insert";
import { homeHref } from "@/lib/frame/places";
import { EMPTY_PLAN, SECTIONS, answerOf, coachPlan, feasibilityFields, isAnswered, startStep, unsureOf, type SectionKey } from "@/lib/frame/shapeStudy";
import { useStudyField } from "@/lib/frame/studyField";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useProject } from "@/components/frame/ProjectContext";
import { PanelLoading } from "@/components/tools/PanelLoading";
import { IdeaReadPanel, useConnectedProvider, useIdeaCheck } from "./IdeaPlace";

const SUMMARY = SECTIONS.length;

/**
 * Shape your study, the Idea place (start-a-study spec, OJ 2026-10-27): six short parts, one per screen, each with a question to reflect on, things to
 * think about, an example, the student's answer and "Not sure yet". Back, Skip for now, Next and Finish later on every part; nothing is required. The
 * answers are the project's idea_intake, saved as typed. "Help me think" (optional AI) coaches the part on screen and never grades; its latest reply is
 * kept with the part. The last screen, Your study so far, lists the six with Edit, and offers Dr. Sharma's feasibility check as an optional outside
 * opinion (v1's prompt, unchanged).
 */
export function ShapeStudy() {
  const t = useT();
  const { projectId } = useProject();
  const { value, loading, locked, broken, set } = useProjectBlob("idea_intake", projectId);
  const waiting = loading || projectId === null;
  // Null until the student moves or types: until then the plan as stored decides where Shape your study opens (startStep).
  const [chosen, setChosen] = useState<number | null>(null);
  const step = chosen ?? startStep(value);
  const headRef = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  useEffect(() => { if (moved.current) headRef.current?.focus(); }, [step]);
  const goTo = (n: number) => { moved.current = true; setChosen(n); };

  // An update, not a replace: typed before the stored plan lands, it is applied on top of it (its read and coach replies included).
  const update = (fn: (prev: IdeaIntake) => IdeaIntake) => {
    if (chosen === null) setChosen(step);
    set((prev) => fn(prev ?? EMPTY_PLAN));
  };

  return (
    <div className="shape" data-testid="panel-idea">
      {locked && <p className="note" role="status" data-testid="idea-locked">{t("vault_idea_locked")}</p>}
      {broken && value !== null && <p className="note" role="status" data-testid="idea-broken">{t("vault_idea_broken")}</p>}
      {waiting && !locked ? <PanelLoading /> : !locked && (step < SUMMARY
        ? <Part index={step} intake={value} update={update} goTo={goTo} headRef={headRef} projectId={projectId!} />
        : <Summary intake={value} update={update} goTo={goTo} headRef={headRef} projectId={projectId!} />)}
    </div>
  );
}

type PartProps = {
  intake: IdeaIntake | null; update(fn: (prev: IdeaIntake) => IdeaIntake): void; goTo(n: number): void;
  headRef: React.Ref<HTMLHeadingElement>; projectId: string;
};

/** One part of the plan on its own screen. */
function Part({ index, intake, update, goTo, headRef, projectId }: PartProps & { index: number }) {
  const t = useT();
  const sec = SECTIONS[index]!;
  const key: SectionKey = sec.key;
  const answer = answerOf(intake, key);
  const unsure = unsureOf(intake).includes(key);
  const last = index === SECTIONS.length - 1;
  const write = (v: string) => update((prev) => ({ ...prev, [sec.field]: v }));
  const toggleUnsure = (on: boolean) => update((prev) => {
    const rest = unsureOf(prev).filter((k) => k !== key);
    return { ...prev, unsure: on ? [...rest, key] : rest };
  });
  return (
    <section className="shape-part" data-testid="shape-part" data-part={key} aria-labelledby="shapePartH">
      <header className="shape-head">
        <p className="shape-kicker">{t("shape_h")}</p>
        <Progress index={index} intake={intake} goTo={goTo} />
      </header>
      {index === 0 && <p className="shape-lead" data-testid="shape-lead">{t("shape_lead")}</p>}
      <h2 id="shapePartH" ref={headRef} tabIndex={-1} data-testid="shape-title">{t(`shape_${key}_title`)}</h2>
      <p className="shape-q" data-testid="shape-question">{t(`shape_${key}_q`)}</p>
      <div className="shape-guide">
        <h3>{t("shape_think_h")}</h3>
        <ul>{[1, 2, 3].map((n) => <li key={n}>{t(`shape_${key}_think${n}`)}</li>)}</ul>
        <p className="shape-example" data-testid="shape-example"><strong>{t("shape_example_h")}:</strong> {t(`shape_${key}_example`)}</p>
      </div>
      <div className="field">
        <label htmlFor="shapeAnswer">{t("shape_answer_label")}</label>
        <textarea className="input" id="shapeAnswer" rows={4} value={answer} onChange={(e) => write(e.target.value)} data-testid="shape-answer" />
        <label className="shape-unsure">
          <input type="checkbox" checked={unsure} onChange={(e) => toggleUnsure(e.target.checked)} data-testid="shape-unsure" />
          <span>{t("shape_not_sure")}</span>
        </label>
      </div>
      <Coach sectionKey={key} intake={intake} update={update} />
      <nav className="shape-nav" aria-label={t("shape_h")}>
        {index > 0 && <Button type="button" variant="ghost" onClick={() => goTo(index - 1)} data-testid="shape-back">{t("shape_back")}</Button>}
        {!isAnswered(intake, key) && <Button type="button" variant="ghost" onClick={() => goTo(index + 1)} data-testid="shape-skip">{t("shape_skip")}</Button>}
        <Button type="button" variant="primary" onClick={() => goTo(index + 1)} data-testid="shape-next">{t(last ? "shape_to_summary" : "shape_next")}</Button>
        <Link className="shape-later" href={homeHref(projectId)} data-testid="shape-later">{t("shape_later")}</Link>
      </nav>
    </section>
  );
}

/** "Part 2 of 6" and a dot per part (answered ones filled), each a way to that part. */
function Progress({ index, intake, goTo }: { index: number; intake: IdeaIntake | null; goTo(n: number): void }) {
  const t = useT();
  return (
    <div className="shape-progress">
      <p className="m-0" data-testid="shape-progress">{t("shape_progress", { n: index + 1, total: SECTIONS.length })}</p>
      <ol className="shape-dots">
        {SECTIONS.map((s, i) => (
          <li key={s.key}>
            <button type="button" className="shape-dot" data-done={isAnswered(intake, s.key) || undefined} aria-current={i === index ? "step" : undefined}
              aria-label={t(`shape_${s.key}_title`)} onClick={() => goTo(i)} data-testid={"shape-dot-" + s.key} />
          </li>
        ))}
      </ol>
    </div>
  );
}

/** "Help me think": the optional AI coach on the part on screen, its latest reply kept with the part and shown as the AI's. */
function Coach({ sectionKey, intake, update }: { sectionKey: SectionKey; intake: IdeaIntake | null; update: PartProps["update"] }) {
  const t = useT();
  const callAI = useCallAI();
  const connected = useConnectedProvider();
  const field = useStudyField();
  const [busy, setBusy] = useState(false);
  const reply = intake?.coach?.[sectionKey];
  const help = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // With no key Connect AI opens first; once a key is connected the coach runs with no second press.
      const provider = await connected();
      if (!provider) return;
      const text = await coachSection({ callAI: (prompt, opts) => callAI(prompt, { ...opts, provider }), toast, field, section: sectionKey, plan: coachPlan(intake) });
      if (text) update((prev) => ({ ...prev, coach: { ...(prev.coach ?? {}), [sectionKey]: { text, at: new Date().toISOString() } } }));
    } finally { setBusy(false); }
  };
  return (
    <div className="shape-coach">
      <div className="shape-coach-row">
        <Button type="button" variant="ghost" disabled={busy} aria-busy={busy || undefined} onClick={() => { void help(); }} data-testid="shape-help">{t(busy ? "shape_helping" : "shape_help_btn")}</Button>
        <p className="shape-note">{t("shape_help_note")}</p>
      </div>
      {reply && (
        <section className="ai-read" aria-label={t("shape_help_label")} data-testid="shape-coach">
          <p className="ai-read-label">{t("shape_help_label")}</p>
          <p className="shape-coach-text">{reply.text}</p>
        </section>
      )}
    </div>
  );
}

/** Your study so far: the six parts with Edit, Go to my study, and the optional feasibility check with its read. */
function Summary({ intake, update, goTo, headRef, projectId }: PartProps) {
  const t = useT();
  const { requestInsert } = useProject();
  const { busy, check } = useIdeaCheck();
  const unsure = unsureOf(intake);
  const doable = async () => {
    const read = await check(feasibilityFields(intake));
    if (read) update((prev) => ({ ...prev, read }));
  };
  const insert = async () => {
    if (!intake?.read) return;
    // A closed document opens beside the place first (a locked one asks once); when it does not open, requestInsert has said why.
    if (await putAiInDocument(requestInsert, intake.read.text)) toast(t("idea_inserted"));
  };
  return (
    <section className="shape-summary" data-testid="shape-summary" aria-labelledby="shapeSumH">
      <p className="shape-kicker">{t("shape_h")}</p>
      <h2 id="shapeSumH" ref={headRef} tabIndex={-1}>{t("shape_summary_h")}</h2>
      <p className="shape-lead">{t("shape_summary_lead")}</p>
      <dl className="shape-list">
        {SECTIONS.map((s, i) => {
          const a = answerOf(intake, s.key).trim();
          const title = t(`shape_${s.key}_title`);
          return (
            <div key={s.key} className="shape-item" data-testid="shape-item" data-part={s.key}>
              <dt>{title}</dt>
              <dd data-state={a ? "answered" : unsure.includes(s.key) ? "unsure" : "empty"} data-testid="shape-item-answer">
                {a || (unsure.includes(s.key) ? t("shape_not_sure") : t("shape_unanswered"))}
              </dd>
              <dd className="shape-item-act">
                <Button type="button" variant="ghost" size="sm" aria-label={t("shape_edit_label", { part: title })} onClick={() => goTo(i)} data-testid={"shape-edit-" + s.key}>{t("shape_edit")}</Button>
              </dd>
            </div>
          );
        })}
      </dl>
      <div className="shape-acts">
        <Button asChild variant="primary"><Link href={homeHref(projectId)} data-testid="shape-go-study">{t("shape_go_study")}</Link></Button>
        <Button type="button" variant="ghost" disabled={busy} aria-busy={busy || undefined} onClick={() => { void doable(); }} data-testid="idea-check">{t(busy ? "idea_checking" : "shape_doable_btn")}</Button>
      </div>
      <p className="shape-note" data-testid="shape-doable-note">{t("shape_doable_note")}</p>
      {intake?.read && (
        <IdeaReadPanel read={intake.read}>
          <div className="ai-read-acts">
            <Button variant="ghost" data-testid="idea-insert" onClick={() => void insert()}>{t("idea_insert_btn")}</Button>
          </div>
        </IdeaReadPanel>
      )}
    </section>
  );
}
