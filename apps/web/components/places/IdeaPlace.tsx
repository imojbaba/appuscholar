"use client";
import { useRef, useState } from "react";
import { fieldLabel, type ProviderId } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { checkIdea } from "@/lib/ai/actions";
import { isProvider } from "@/lib/ai/keys";
import { useCallAI } from "@/lib/ai/useCallAI";
import { useKeys } from "@/lib/ai/useKeys";
import { putAiInDocument } from "@/lib/editor/insert";
import { useProjectBlob } from "@/lib/blobs/useProjectBlob";
import type { IdeaIntake } from "@/lib/blobs/kinds";
import { parseIdeaRead } from "@/lib/frame/ideaRead";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useProject } from "@/components/frame/ProjectContext";
import { PanelLoading } from "@/components/tools/PanelLoading";
import { FieldPicker } from "@/components/frame/FieldPicker";

export type IdeaFields = Pick<IdeaIntake, "topic" | "resources" | "timeframe" | "constraints">;
export type IdeaReadValue = NonNullable<IdeaIntake["read"]>;
export const EMPTY_INTAKE: IdeaFields = { topic: "", resources: "", timeframe: "", constraints: "" };

/**
 * "Get feedback on my idea": v1's Assess feasibility (ideaAssess 8568-8580, buildIdeaPromptV2 unchanged) as a read with its time, or null when nothing was read.
 * With no key for the chosen provider Connect AI opens (first-run build spec, OJ 2026-10-27, step 4); once a key is connected the feedback runs on the idea as it was
 * typed, with no second press. `onSaveWithout` (first run): Connect AI offers "Save my idea without feedback", which runs it. An empty idea gets v1's toast first.
 */
export function useIdeaCheck(onSaveWithout?: () => void): { busy: boolean; check(intake: IdeaFields, onSending?: () => void): Promise<IdeaReadValue | null> } {
  const { settings } = useSettings();
  const { openConnect } = useProject();
  const { hasKey } = useKeys();
  const callAI = useCallAI();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  /** `onSending`: called just before the idea goes to the AI (never when Connect AI ended without a key, or the idea is empty). */
  const check = async (intake: IdeaFields, onSending?: () => void): Promise<IdeaReadValue | null> => {
    if (running.current) return null;
    let provider: ProviderId = isProvider(settings.provider) ? settings.provider : "gemini";
    if (intake.topic.trim() && !hasKey(provider)) {
      running.current = true;
      const end = await openConnect({ provider, offerSave: !!onSaveWithout }).finally(() => { running.current = false; });
      if (end.result === "save") onSaveWithout?.();
      if (end.result !== "connected") return null;
      // The key was saved a moment ago: this request goes to the company it was saved for, whatever the settings have caught up with.
      provider = end.provider;
    }
    running.current = true;
    setBusy(true);
    try {
      const call: typeof callAI = (prompt, opts) => { onSending?.(); return callAI(prompt, { ...opts, provider }); };
      const text = await checkIdea({ callAI: call, toast, field: fieldLabel(settings.field), intake });
      return text === null ? null : { text, at: new Date().toISOString() };
    } finally { running.current = false; setBusy(false); }
  };
  return { busy, check };
}

/**
 * The idea's four fields (v1's idea_intake keys, so the prompt is unchanged): the idea, the field of study under it, the three questions in a section that opens
 * ("Add details for better feedback (optional)", open when one already holds something), and the feedback button. `opening`: the saved intake is still being
 * read, so the loading sign stands in for the boxes (W8). `level` is the heading's level (first run's page title is h1).
 */
export function IdeaForm({ intake, onEdit, waiting, opening, busy, onCheck, topicRef, level = 2 }: {
  intake: IdeaFields; onEdit(key: keyof IdeaFields, value: string): void; waiting: boolean; opening: boolean; busy: boolean; onCheck(): void;
  topicRef?: React.Ref<HTMLTextAreaElement>; level?: 1 | 2;
}) {
  const t = useT();
  const H = level === 1 ? "h1" : "h2";
  const edit = (key: keyof IdeaFields) => (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => onEdit(key, e.target.value);
  const hasDetails = !!(intake.resources.trim() || intake.timeframe.trim() || intake.constraints.trim());
  return (
    <div className="idea-form">
      <div>
        <H className="idea-h">{t("idea_h")}</H>
        <p className="idea-hint" data-testid="idea-hint">{t("idea_hint")}</p>
      </div>
      {opening ? <PanelLoading /> : (
        <>
          <div className="field idea-topic">
            <label htmlFor="ideaTopic">{t("idea_topic_lbl")}</label>
            <textarea className="input" id="ideaTopic" ref={topicRef} rows={3} value={intake.topic} disabled={waiting} onChange={edit("topic")} />
            <FieldPicker variant="inline" />
          </div>
          <details className="idea-sharpen" open={hasDetails || undefined} data-testid="idea-details">
            <summary data-testid="idea-details-toggle">{t("idea_sharpen_h")}</summary>
            <div className="idea-sharpen-body">
              <div className="field">
                <label htmlFor="ideaRes">{t("idea_resources_lbl")}</label>
                <input className="input" id="ideaRes" value={intake.resources} disabled={waiting} onChange={edit("resources")} />
              </div>
              <div className="field">
                <label htmlFor="ideaTime">{t("idea_timeframe_lbl")}</label>
                <input className="input" id="ideaTime" value={intake.timeframe} disabled={waiting} onChange={edit("timeframe")} />
              </div>
              <div className="field">
                <label htmlFor="ideaCons">{t("idea_constraints_lbl")}</label>
                <input className="input" id="ideaCons" value={intake.constraints} disabled={waiting} onChange={edit("constraints")} />
              </div>
            </div>
          </details>
        </>
      )}
      <div className="idea-check">
        <Button variant="primary" data-testid="idea-check" disabled={waiting || busy} onClick={onCheck}>{busy ? t("idea_checking") : t("idea_check_btn")}</Button>
        <span className="idea-note" data-testid="idea-check-note">{t("idea_check_note")}</span>
      </div>
    </div>
  );
}

/**
 * The read, gold-edged and labelled as AI (Global Constraints, AI output): each rated area with the engine's own rating word, then the verdict; a read with
 * fewer than 3 rated lines is shown as it came. A line whose area is the prompt's placeholder word "Area" has no name (R15). `children`: what follows the read (the actions).
 */
export function IdeaReadPanel({ read, children }: { read: IdeaReadValue; children?: React.ReactNode }) {
  const t = useT();
  const parsed = parseIdeaRead(read.text);
  return (
    <section className="ai-read" data-testid="idea-read" aria-label={t("idea_read_label")}>
      <p className="ai-read-label">{t("idea_read_label")}</p>
      {parsed ? (
        <>
          <ul className="idea-read-lines">
            {parsed.lines.map((l, i) => (
              <li key={i} data-testid="idea-read-line">
                <span>
                  {l.area !== null && <><strong data-testid="idea-read-area">{l.area}</strong><br /></>}
                  <span data-testid="idea-read-why">{l.why}</span>
                </span>
                <span className={"idea-rating " + l.rating.toLowerCase()} data-testid="idea-read-rating">{l.rating}</span>
              </li>
            ))}
          </ul>
          {parsed.verdict && <p className="idea-read-verdict" data-testid="idea-read-verdict">{parsed.verdict}</p>}
        </>
      ) : <p className="idea-read-raw" data-testid="idea-read-raw">{read.text}</p>}
      {children}
    </section>
  );
}

/**
 * The Idea place (`/p/<id>/idea`): v1's Idea & Feasibility panel (708-724, ideaLoad / ideaSave / ideaAssess 8559-8580) as first run's form on the
 * project's idea_intake blob, saved as typed. The read is kept with the idea (`read`), so it is there next time; "Put in my document" inserts it as AI
 * text, as v1's Tab did from the suggestion pane, and "Check again" replaces it.
 */
export function IdeaPlace() {
  const t = useT();
  const { projectId, requestInsert } = useProject();
  const { busy, check } = useIdeaCheck();
  const { value, loading, locked, broken, set } = useProjectBlob("idea_intake", projectId);
  const intake = value ?? EMPTY_INTAKE;
  // Until the stored intake is known there is nothing to show or to edit (and no project id at all before /me answers).
  const waiting = loading || projectId === null;
  // W8: while the saved intake is read and opened the four boxes give way to the loading sign (a locked vault says so in its own sentence).
  const opening = waiting && !locked;
  // An update, not a replace: typed before the read lands, it is applied on top of the stored intake (its read included).
  const edit = (key: keyof IdeaFields, v: string) => set((prev) => ({ ...(prev ?? EMPTY_INTAKE), [key]: v }));
  const run = async () => {
    const read = await check(intake);
    if (read) set((prev) => ({ ...(prev ?? intake), read }));
  };
  const insert = async () => {
    if (!value?.read) return;
    // A closed document opens beside the place first (a locked one asks once); when it does not open, requestInsert has said why.
    if (await putAiInDocument(requestInsert, value.read.text)) toast(t("idea_inserted"));
  };
  return (
    <div className="idea-place" data-testid="panel-idea">
      <div className="idea-main">
        {locked && <p className="note" role="status" data-testid="idea-locked">{t("vault_idea_locked")}</p>}
        {broken && value !== null && <p className="note" role="status" data-testid="idea-broken">{t("vault_idea_broken")}</p>}
        <IdeaForm intake={intake} onEdit={edit} waiting={waiting} opening={opening} busy={busy} onCheck={() => void run()} />
      </div>
      {value?.read && (
        <aside className="idea-aside">
          <IdeaReadPanel read={value.read}>
            <div className="ai-read-acts">
              <Button variant="primary" data-testid="idea-insert" onClick={() => void insert()}>{t("idea_insert_btn")}</Button>
              <Button variant="ghost" data-testid="idea-again" disabled={busy} onClick={() => void run()}>{t("idea_again_btn")}</Button>
            </div>
          </IdeaReadPanel>
        </aside>
      )}
    </div>
  );
}
