"use client";
import { useRef, useState } from "react";
import { buildGapFinderPromptV2, buildLitReviewPrompt, fieldLabel, type RsPaper } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { gapFinder, litReview, type GeneratorDeps } from "@/lib/ai/actions";
import { useCallAI } from "@/lib/ai/useCallAI";
import { putAiInDocument } from "@/lib/editor/insert";
import { setCompareAi, useCompareAi } from "@/lib/papers/compareAi";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useProject } from "@/components/frame/ProjectContext";

/** One kept paper in the list: its short name, and the paper the AI would read when the library entry has an abstract (null: "No abstract stored", it cannot be ticked). */
export type Candidate = { key: string; label: string; paper: RsPaper | null };

/** The most characters one request may carry (apps/api/src/routes/ai.ts: the prompt's limit); a request over it is not sent. */
const PROMPT_LIMIT = 60_000;

/** The sentences v1's generators wrote with an emoji (they stay as they are for the tools that still use them); this screen says them in its own words. */
const OWN_WORDS: Readonly<Record<string, string>> = { rs2_reading_abstracts_and_drafting: "cmp_drafting", rs2_looking_for_what_these: "cmp_looking" };

/** What the aside says under the buttons: a request waiting, a hint, or a failure. */
type Line = { kind: "wait" | "hint" | "error"; text: string };

/**
 * "Write from these papers" (canvas Compare; wave B Task 22, W25): the kept papers as ticks (ones with no abstract stored are listed and cannot be ticked), "Draft a paragraph"
 * (core's buildLitReviewPrompt, through lib/ai/actions litReview) and "Find the gap" (buildGapFinderPromptV2, gapFinder), both over the ticked papers' abstracts only and at least two of
 * them; their prompts, budgets and AI-use labels are v1's and wave A's. The answer stays here, beside the table, not in the document's suggestion pane (W25): gold-edged, with a label
 * that says it is the AI's and what to check, and "Put in my document" (as AI text, through the shell's requestInsert, so a closed or locked document opens first) and "Dismiss". It is
 * kept in this tab's memory for the project (lib/papers/compareAi), so it stays when the student goes to another tab and back. A request over the API's size limit is not sent.
 */
export function WriteFromPapers({ projectId, candidates }: { projectId: string | null; candidates: Candidate[] }) {
  const t = useT();
  const { settings } = useSettings();
  const callAI = useCallAI();
  const { requestInsert } = useProject();
  const result = useCompareAi(projectId);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [line, setLine] = useState<Line | null>(null);
  // The newest request's number: an older one that answers late writes nothing, and Dismiss ends the one in flight.
  const gen = useRef(0);
  const inserting = useRef(false);
  const field = fieldLabel(settings.field);
  const waiting = line?.kind === "wait";

  const run = (kind: "draft" | "gap") => {
    if (waiting) return;
    const picked = candidates.filter((c) => c.paper && ticked.has(c.key)).map((c) => c.paper!);
    if (picked.length < 2) { setLine({ kind: "hint", text: t("cmp_tick_two") }); return; }
    const build = kind === "draft" ? buildLitReviewPrompt : buildGapFinderPromptV2;
    if (build(field, picked).prompt.length > PROMPT_LIMIT) { setLine({ kind: "hint", text: t("cmp_too_much") }); return; }
    const deps: GeneratorDeps = {
      callAI, field,
      t: (k, v) => t(OWN_WORDS[k] ?? k, v),
      // The answer is in the aside, so nothing is toasted: the waiting line, the answer and a failure's sentence are all here.
      toast: () => {},
      setThinking: (_status, _range, label) => { setLine({ kind: "wait", text: label ?? "" }); return ++gen.current; },
      isCurrent: (token) => token === gen.current,
      set: (text, _note, token) => {
        if (token !== gen.current) return;
        if (projectId) setCompareAi(projectId, { kind, n: picked.length, text });
        // The answer is not a live region itself, so this line (a status) says it has arrived.
        setLine({ kind: "hint", text: t("cmp_ready") });
      },
      clear: (msg) => setLine(msg ? { kind: "error", text: msg } : null)
    };
    void (kind === "draft" ? litReview : gapFinder)(picked, deps);
  };

  const dismiss = () => {
    gen.current++;
    setLine(null);
    if (projectId) setCompareAi(projectId, null);
  };

  const insert = async () => {
    if (!result || inserting.current) return;
    inserting.current = true;
    try {
      // A closed document opens beside the place first (a locked one asks once); when it does not open, requestInsert has said why.
      if (await putAiInDocument(requestInsert, result.text)) toast(t("idea_inserted"));
    } finally { inserting.current = false; }
  };

  const tick = (key: string, on: boolean) => setTicked((prev) => { const next = new Set(prev); if (on) next.add(key); else next.delete(key); return next; });

  return (
    <>
      <section className="cmp-card" aria-labelledby="cmp-write-h" data-testid="cmp-write">
        <h2 id="cmp-write-h">{t("cmp_write_h")}</h2>
        <p className="cmp-note">{t("cmp_write_note")}</p>
        <ul className="cmp-ticks" aria-label={t("cmp_ticks_aria")}>
          {candidates.map((c) => {
            const why = `cmp-why-${c.key}`;
            return (
              <li key={c.key}>
                <label className="cmp-tick">
                  <input type="checkbox" data-testid="cmp-tick" checked={!!c.paper && ticked.has(c.key)} disabled={!c.paper} aria-describedby={c.paper ? undefined : why}
                    onChange={(e) => tick(c.key, e.target.checked)} />
                  <span>{c.label}</span>
                </label>
                {!c.paper && <span className="cmp-no-abstract" id={why} data-testid="cmp-no-abstract">{t("cmp_no_abstract")}</span>}
              </li>
            );
          })}
        </ul>
        <div className="cmp-acts">
          {/* aria-disabled, not disabled: the button the student pressed keeps its focus while the request runs. */}
          <Button variant="primary" className="cmp-btn" aria-disabled={waiting || undefined} data-testid="cmp-draft" onClick={() => run("draft")}>{t("cmp_draft")}</Button>
          <Button variant="ghost" className="cmp-btn" aria-disabled={waiting || undefined} data-testid="cmp-gap" onClick={() => run("gap")}>{t("cmp_gap")}</Button>
        </div>
        {line && line.kind !== "error" && <p className="cmp-note" role="status" data-testid="cmp-write-status">{line.text}</p>}
        {line?.kind === "error" && <p className="cmp-error" role="alert" data-testid="cmp-write-error">{line.text}</p>}
      </section>
      {result && (
        <section className="ai-read cmp-ai" aria-label={t("cmp_ai_aria")} data-testid="cmp-ai">
          <p className="ai-read-label" data-testid="cmp-ai-label">{result.kind === "gap" ? t("cmp_ai_gap") : t("cmp_ai_draft", { n: result.n })}</p>
          <p className="cmp-ai-text" data-testid="cmp-ai-text">{result.text}</p>
          <div className="ai-read-acts">
            <Button variant="primary" className="cmp-btn" data-testid="cmp-put" onClick={() => void insert()}>{t("idea_insert_btn")}</Button>
            <Button variant="ghost" className="cmp-btn" data-testid="cmp-dismiss" onClick={dismiss}>{t("dismiss_btn")}</Button>
          </div>
        </section>
      )}
    </>
  );
}
