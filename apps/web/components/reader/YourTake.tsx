"use client";
import { useState } from "react";
import Link from "next/link";
import { fieldLabel } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { useCallAI } from "@/lib/ai/useCallAI";
import type { ApNotesStore } from "@/lib/analyse/notes";
import { apOk, setAp, useApState, type ApLoaded } from "@/lib/analyse/useApDoc";
import { placeHref } from "@/lib/frame/places";
import { makeSummary, needsTick, summaryOf, takeOf, takeReady, type Summary } from "@/lib/reader/take";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useProject } from "@/components/frame/ProjectContext";
import { NotesState } from "@/components/tools/analyse/Walk";

/** What the last press of "Show the AI summary" came to in this tab, and for which paper (the pasted text is one reader whose paper can change). */
type Run = { id: string; kind: "working" } | { id: string; kind: "done"; summary: Summary } | { id: string; kind: "failed"; message: string };

/**
 * The reader's first tab (wave B Task 28, register row D-S2-132; canvas Read): "In two lines, what does this paper say?", then the AI summary. The student's own lines come first: the
 * summary opens at twelve words (takeReady), with "Done. The AI summary is unlocked." and "Show the AI summary". Both are kept in the paper's note (`take`, `summary`) and are there on
 * return; the summary is a gold-edged block whose label says what it is (the passages that matter most, not "the whole paper") and what to check (compare it with the two lines), with
 * "Next: add this paper to your comparison" under it. The lines are saved as they are typed, through the notes client; while the stored notes are not known (being read, locked) the box is
 * read-only and empty and nothing can be asked, so words typed into a box that only looks empty never replace the stored ones, and a locked or broken store says so under it. In a pop-out
 * (ap_notes read-only) the box is read-only and the summary is shown but not kept. The lines show what was typed in this tab first (takeDraft), so words a refused write did not store stay
 * in the box. The summary works on what the reader has loaded: the PDF's text, Europe PMC's, or the abstract of a paper that has no more.
 */
export function YourTake({ doc, notes }: { doc: ApLoaded; notes: ApNotesStore }) {
  const t = useT();
  const s = useApState();
  const { settings } = useSettings();
  const callAI = useCallAI();
  const { projectId } = useProject();
  const [run, setRun] = useState<Run | null>(null);
  const note = notes.note(doc.id);
  const take = notes.unread ? "" : (s.takeDraft[doc.id] ?? takeOf(note));
  const ready = takeReady(take);
  const mine = run && run.id === doc.id ? run : null;
  const working = mine?.kind === "working";
  const summary: Summary | null = mine?.kind === "done" ? mine.summary : notes.unread ? null : summaryOf(note);

  const type = (v: string) => {
    if (notes.unread || notes.readOnly) return; // the stored words are not known yet (nothing typed may replace them), or a pop-out, where nothing typed is stored
    setAp((x) => ({ takeDraft: { ...x.takeDraft, [doc.id]: v } }));
    notes.put(doc, (n) => { n.take = v; });
  };
  const ask = () => {
    if (!ready || working || notes.unread) return;
    if (needsTick(doc) && !apOk(s)) { toast(t("ap2_tick_the_box_about")); return; }
    const id = doc.id;
    setRun({ id, kind: "working" });
    void makeSummary({ callAI, field: fieldLabel(settings.field), t, doc, put: notes.put })
      .then((r) => setRun(r.ok ? { id, kind: "done", summary: r.summary } : { id, kind: "failed", message: r.message }));
  };

  return (
    <div className="rd-take" data-testid="reader-take">
      <div className="field">
        <label htmlFor="rdTake">{t("take_label")}</label>
        <textarea className="input" id="rdTake" data-testid="take-box" rows={3} readOnly={notes.unread || notes.readOnly} value={take} aria-describedby="rdTakeState" onChange={(e) => type(e.target.value)} />
        <span className="rd-take-state" id="rdTakeState" data-testid="take-state" data-ready={ready} role="status">{ready ? t("take_ready") : t("take_hint")}</span>
      </div>
      <NotesState notes={notes} />
      <Button variant="primary" className="rd-take-btn" data-testid="take-show" disabled={!ready || working || notes.unread} aria-describedby="rdTakeState" onClick={ask}>
        {summary ? t("take_again") : t("take_show")}
      </Button>
      {working && <p className="rd-quiet" role="status" data-testid="take-working">{t("take_working")}</p>}
      {mine?.kind === "failed" && <p className="rd-note" role="status" data-testid="take-failed">{mine.message}</p>}
      {summary && (
        <section className="ai-read" aria-labelledby="rdTakeAi" data-testid="take-summary">
          <p className="ai-read-label" id="rdTakeAi" data-testid="take-ai-label">{t("take_ai_label")}</p>
          <div className="rd-take-text" data-testid="take-ai-text">{summary.text}</div>
          {summary.partial && <p className="rd-take-note" data-testid="take-ai-partial">{t("take_ai_partial")}</p>}
          <p className="rd-take-note">{t("take_ai_check")}</p>
        </section>
      )}
      {summary && <Link className="rd-take-next" href={placeHref(projectId ?? "", "lit", "compare")} data-testid="take-next">{t("take_next")}</Link>}
    </div>
  );
}
