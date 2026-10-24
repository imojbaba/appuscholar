"use client";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { recapOff, saveAnswers, setRecapOff, stampActive } from "@/lib/help/recap/gap";
import type { RecapFacts } from "@/lib/help/recap/facts";

const QUESTIONS = [["a1", "ret_q1"], ["a2", "ret_q2"], ["a3", "ret_q3"]] as const;

/**
 * The welcome-back recap (v1 returnDlg 1124-1136 and retRender 3555-3578): the days away, the project and stage, the open document and what the
 * account can count since the last visit, then three questions the student answers in their own words. The answers are saved on this device only
 * (`appu_recap_answers`) and are never read or graded. The switch that turns the recap off sits in this dialog's footer (v1 kept it in Settings).
 */
export function RecapDialog({ facts, now, onClose }: { facts: RecapFacts; now: number; onClose: () => void }) {
  const t = useT();
  const [answers, setAnswers] = useState({ a1: "", a2: "", a3: "" });
  const [on, setOn] = useState(() => !recapOff());
  const locked = t("title_locked");
  const c = facts.counts;
  const bits = [
    c.docs ? t("ret_docs", { n: c.docs }) : "",
    c.ai ? t("wc_recap_ai", { n: c.ai }) : "",
    c.tests ? t("wc_recap_tests", { n: c.tests }) : ""
  ].filter(Boolean);
  const day = (ms: number) => new Date(ms).toLocaleDateString();

  const finish = (save: boolean) => {
    stampActive(now);
    if (save && saveAnswers(answers, now)) toast(t("wc_recap_saved"));
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) finish(false); }}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto" data-testid="recap-dialog"
        // Opened by itself, so focus rests on the dialog and not on a question: a student still typing in the document does not fill an answer.
        onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement | null)?.focus(); }}>
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-purple-800">{t("wc_recap_h")}</DialogTitle>
          <DialogDescription className="sr-only">{t("wc_recap_intro")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-1 text-sm" data-testid="recap-facts">
          <p className="m-0 font-bold">{t("ret_away", { n: facts.days })}</p>
          {facts.project && <p className="m-0 text-muted-foreground">{t("ret_project", { p: facts.project.name ?? locked, s: t("stage_" + facts.project.stage) })}</p>}
          {facts.doc && <p className="m-0 text-muted-foreground">{t("ret_doc", { d: facts.doc.title ?? locked, w: facts.doc.words })}</p>}
          {bits.length > 0 && <p className="m-0 text-muted-foreground">{t("ret_did")} {bits.join(", ")}.</p>}
          {bits.length === 0 && facts.nothingCounted && <p className="m-0 text-muted-foreground">{t("wc_recap_nothing")}</p>}
          {facts.wrote && (
            <p className="m-0 mt-2 border-l-[3px] border-line pl-2 text-muted-foreground" data-testid="recap-wrote">
              {t("ret_last", { d: day(facts.wrote.at) })}<br /><i>{facts.wrote.text}</i>
            </p>
          )}
          {facts.answer && (
            <p className="m-0 mt-2 border-l-[3px] border-line pl-2 text-muted-foreground" data-testid="recap-prev">
              {t("wc_recap_prev", { d: day(facts.answer.t) })}<br /><i>{facts.answer.text}</i>
            </p>
          )}
        </div>

        <p className="m-0 text-sm text-muted-foreground">{t("wc_recap_intro")}</p>
        {QUESTIONS.map(([k, key], i) => (
          <div key={k} className="grid gap-1">
            <label htmlFor={"recap-q" + (i + 1)} className="text-sm font-medium">{t(key)}</label>
            <textarea id={"recap-q" + (i + 1)} className="input" rows={2} data-testid={"recap-q" + (i + 1)} value={answers[k]}
              onChange={(e) => setAnswers((a) => ({ ...a, [k]: e.target.value }))} />
          </div>
        ))}

        <div className="flex gap-2">
          <Button variant="primary" className="flex-1" data-testid="recap-save" onClick={() => finish(true)}>{t("ret_save")}</Button>
          <Button variant="ghost" className="flex-1" data-testid="recap-skip" onClick={() => finish(false)}>{t("ret_skip")}</Button>
        </div>
        <DialogFooter className="sm:justify-start">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" data-testid="recap-off" checked={on} onChange={(e) => { setOn(e.target.checked); setRecapOff(!e.target.checked); }} />
            <span>{t("recap_toggle")}</span>
          </label>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
