"use client";
import { AP_STAGES, apCheckQuote, fieldLabel, type ApWalkRes } from "@appuscholar/core";
import { tHtml, useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { useCallAI } from "@/lib/ai/useCallAI";
import { stageAsk, stageName } from "@/lib/analyse/cards";
import type { ApNotesStore } from "@/lib/analyse/notes";
import { apWalkShow, walkDraft } from "@/lib/analyse/walk";
import { setAp, useApState, type ApLoaded } from "@/lib/analyse/useApDoc";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { Quotes } from "./Ask";

/** A stage's reply, from this visit (AP.res, core's ApWalkRes) or stored (the ap_notes blob's shape, every field optional). */
type Res = Partial<Omit<ApWalkRes, "quotes">> & { quotes?: Array<{ q: string }> };

/**
 * The reply's boxes (11307-11318): the raw reply under v1's warning; or "What the paper says" with the reading, the quotations (checked again against the paper loaded now: apCheckQuote),
 * "The paper does not report:", "Judge this yourself:" and the partial-read note; then "Check yourself." with the student's answer box (AP.chkDraft, never stored) and "Show a suggested
 * answer", which shows the answer only once pressed (apReveal 10122).
 */
function Reply({ d, k, r }: { d: ApLoaded; k: string; r: Res }) {
  const t = useT();
  const s = useApState();
  if (r.raw !== undefined) return <div className="ap-box" data-testid="ap-walk-raw"><span className="ap-warn">{t("ap2_the_reply_could_not")}</span><br />{r.raw}</div>;
  const quotes = (r.quotes ?? []).map((c) => apCheckQuote(d, c.q));
  const notStated = r.not_stated ?? [];
  return (
    <>
      <div className="ap-box" data-testid="ap-walk-reply">
        {tHtml(t("ap2_what_the_paper_says"))}<br />{r.reading}<Quotes list={quotes} />
        {notStated.length > 0 && <div className="ap-gap">{tHtml(t("ap2_the_paper_does_not_2"))}<ul className="ap-flags">{notStated.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
        {r.watch && <div className="ap-gap">{tHtml(t("ap2_judge_this_yourself"))} {r.watch}</div>}
        {r.partial && <div className="ap-tiny ap-caveat">{t("ap2_the_paper_is_long_2", { n: r.n ?? 0, of: r.of ?? 0 })}</div>}
      </div>
      {r.cq && (
        <div className="ap-box" data-testid="ap-walk-check">
          {tHtml(t("ap2_check_yourself"))} {r.cq}
          <div className="field">
            <textarea className="input" id="apChk" rows={2} placeholder={t("ap2_chk_placeholder")} value={s.chkDraft[k] ?? ""} onChange={(e) => { const v = e.target.value; setAp((x) => ({ chkDraft: { ...x.chkDraft, [k]: v } })); }} />
          </div>
          {s.shown[k]
            ? <div className="ap-ok" data-testid="ap-suggested">{tHtml(t("ap2_suggested_answer"))} {r.ca}</div>
            : <Button variant="ghost" size="sm" id="apRevealBtn" onClick={() => setAp((x) => ({ shown: { ...x.shown, [k]: true } }))}>{t("ap2_reveal_btn")}</Button>}
        </div>
      )}
    </>
  );
}

/**
 * "🧭 Walk me through it" (apRender 11300-11320): the twelve stage buttons (✓ on a stage whose reply is stored), "Stage N of 12: name", "Try first." with the stage's question and the box
 * (saved to the paper's note as it is typed, apDraft 10118), "Show what the paper says" ("Read it again" once there is a reply; disabled while a request runs), the reply, and the previous and
 * next stage buttons (disabled at the ends; apSetStage 10114 keeps the stage inside 1 to 12).
 */
export function Walk({ notes }: { notes: ApNotesStore }) {
  const t = useT();
  const s = useApState();
  const { settings } = useSettings();
  const callAI = useCallAI();
  const d = s.doc!;
  const note = notes.note(d.id);
  const stored = note?.stages ?? {};
  const st = AP_STAGES[s.stage]!;
  const r: Res | undefined = s.res[st.k] ?? stored[st.k]?.res;
  const go = (i: number) => setAp({ stage: Math.max(0, Math.min(AP_STAGES.length - 1, i)) });
  const type = (v: string) => {
    setAp((x) => ({ tryDraft: { ...x.tryDraft, [st.k]: v } }));
    notes.put(d, (n) => { n.stages[st.k] = { ...(n.stages[st.k] ?? {}), mine: v }; });
  };
  const show = () => { void apWalkShow({ callAI, field: fieldLabel(settings.field), toast, t, mine: (k) => walkDraft(s, note, k), put: notes.put }); };
  return (
    <div data-testid="ap-walk">
      <div className="ap-row ap-wrap ap-stages" data-testid="ap-stages">
        {AP_STAGES.map((x, i) => (
          <Button key={x.k} variant={i === s.stage ? "primary" : "ghost"} size="xs" data-on={i === s.stage} title={stageName(t, x.k)} onClick={() => go(i)}>
            {i + 1}{stored[x.k]?.res || s.res[x.k] ? " ✓" : ""}
          </Button>
        ))}
      </div>
      <h4 className="ap-stage-h">{t("ap2_stage")} {s.stage + 1} {t("ap2_of", { apStagesCount: AP_STAGES.length })} {stageName(t, st.k)}</h4>
      <div className="ap-box">{tHtml(t("ap2_try_first"))} {stageAsk(t, st.k)}</div>
      <div className="field">
        <textarea className="input" id="apTry" rows={3} placeholder={t("ap2_try_placeholder")} value={walkDraft(s, note, st.k)} onChange={(e) => type(e.target.value)} />
      </div>
      <div className="ap-row">
        <Button variant="primary" size="sm" id="apShowBtn" disabled={s.busy} onClick={show}>{r ? t("ap2_read_it_again") : t("ap2_show_what_the_paper")}</Button>
      </div>
      {r && <Reply d={d} k={st.k} r={r} />}
      <div className="ap-row ap-gap">
        <Button variant="ghost" size="sm" data-testid="ap-prev" disabled={s.stage === 0} onClick={() => go(s.stage - 1)}>{t("ap2_previous_stage")}</Button>
        <Button variant="ghost" size="sm" id="apNextBtn" disabled={s.stage === AP_STAGES.length - 1} onClick={() => go(s.stage + 1)}>{t("ap2_next_stage")}</Button>
      </div>
    </div>
  );
}
