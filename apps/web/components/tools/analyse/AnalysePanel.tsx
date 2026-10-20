"use client";
import { useEffect, useRef } from "react";
import { apPreview } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { fromPending } from "@/lib/analyse/intake";
import { useApNotes } from "@/lib/analyse/notes";
import { setAp, useApState, type ApLoaded, type ApMode } from "@/lib/analyse/useApDoc";
import { AP_LECTURES_LATER, AP_LESSON_LATER } from "@/lib/analyse/later";
import { useSettings } from "@/lib/settings";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useWorkspace } from "@/components/workspace/WorkspaceContext";
import { Across } from "./Across";
import { Ask } from "./Ask";
import { Card } from "./Card";
import { Intake } from "./Intake";
import { RefCheck } from "./RefCheck";
import { Walk } from "./Walk";

/** apRender's head (11278-11283): the title, the pages and characters read, the abstract-only warning, the sections found, and "Check what Appuscholer read" with the two-column warning. */
function Head({ d }: { d: ApLoaded }) {
  const t = useT();
  const meta = (d.paged ? t("ap2_n_pages", { n: d.pages.length }) + " " : "") + d.chars.toLocaleString() + " " + t("ap2_characters_read")
    + (d.refsCut ? t("ap2_the_reference_list_is") : "") + (d.sample ? t("ap2_this_is_a_fictional") : "");
  const sections = d.sections.length ? d.sections.map((s) => s.name + (s.page ? " " + t("ap2_p", { page: s.page }) : "")).join(" · ") : t("ap2_none_the_text_has");
  return (
    <div className="ap-box" data-testid="ap-head">
      <b>{d.title}</b><br />
      <span className="ap-small">{meta}</span>
      {d.abstractOnly && <div className="ap-warn ap-gap" data-testid="ap-abstract-only">{t("ap2_abstract_only_shallow_an")}</div>}
      <div className="ap-sections">{t("ap2_sections_found")} {sections}</div>
      <details className="ap-read">
        <summary>{t("ap2_check_what_appuscholer_read")}</summary>
        <pre data-testid="ap-preview">{apPreview(d)}</pre>
        <div className="ap-tiny">{t("ap2_papers_with_two_columns")}</div>
      </details>
    </div>
  );
}

/** The mode tabs (11284): Ask, the walk-through (disabled for an abstract, "(full paper needed)"), the paper card, and the lesson for the practice paper only (apSet('mode', k), 10113). */
function Tabs({ d, mode }: { d: ApLoaded; mode: ApMode }) {
  const t = useT();
  // The lesson and the lectures are Phase 5 (register D-S2-15).
  const open = (k: ApMode) => { if (k === "lesson") toast(AP_LESSON_LATER); else setAp({ mode: k }); };
  const tab = (k: ApMode, l: string) => (d.abstractOnly && k === "walk")
    ? <Button key={k} variant="ghost" size="sm" data-testid={"ap-tab-" + k} disabled title={t("ap2_the_walk_through_needs_title")}>{t("ap2_full_paper_needed", { l })}</Button>
    : <Button key={k} variant={mode === k ? "primary" : "ghost"} size="sm" data-testid={"ap-tab-" + k} onClick={() => open(k)}>{l}</Button>;
  return (
    <div className="ap-row ap-wrap ap-tabs" data-testid="ap-tabs">
      {tab("ask", t("ap2_ask_questions"))}{tab("walk", t("ap2_walk_me_through_it"))}{tab("card", t("ap2_paper_card_2"))}{d.sample && tab("lesson", t("ap2_lesson_on_this_paper"))}
    </div>
  );
}

/**
 * Analyse a paper (v1 741-760 and apRender 11272-11334), in v1's order: the heading and its sentence, "📚 All lectures" (Phase 5), the intake, then #apMain for the loaded paper (the head, the
 * tabs, the reference check unless it is an abstract, "Reading the paper and writing the answer…" while a request runs, and the tab's content: Ask, the walk-through, the paper card), then
 * "📊 My paper cards side by side". The walk-through, the card and the cards side by side share one store of the project's ap_notes and ap_cols blobs (lib/analyse/notes.ts).
 * The paper lives in this tab's memory (lib/analyse/useApDoc.ts). Research's "📄 Analyse this paper" leaves its abstract in the workspace (pendingAnalyse): it is loaded here abstract-only, then
 * cleared (ruling R7).
 */
export function AnalysePanel() {
  const t = useT();
  const s = useApState();
  const { project, pendingAnalyse, setPendingAnalyse } = useWorkspace();
  const { me } = useSettings();
  const notes = useApNotes(project?.id ?? me?.scratchProjectId ?? null);
  // The kept abstract is loaded once: a second run of the effect for the same value (React's StrictMode, or a language change before the clear lands) does nothing.
  const consumed = useRef<typeof pendingAnalyse>(null);
  useEffect(() => {
    if (!pendingAnalyse || consumed.current === pendingAnalyse) return;
    consumed.current = pendingAnalyse;
    setPendingAnalyse(null);
    fromPending(pendingAnalyse, { toast, t });
  }, [pendingAnalyse, setPendingAnalyse, t]);
  const d = s.doc;
  return (
    <div className="panel" data-testid="panel-analyse">
      <h3>{t("ap2_analyse_a_paper")}</h3>
      <p className="desc">{t("ap2_give_appuscholer_a_research")}</p>
      <div className="ap-row ap-wrap ap-lect">
        <Button variant="primary" size="sm" id="libOpenBtn" data-testid="ap-lectures" onClick={() => toast(AP_LECTURES_LATER)}>{t("ap2_lib_open_btn")}</Button>
        <span className="desc ap-lect-desc">{t("ap2_short_talks_on_reading")}</span>
      </div>
      <Intake />
      <div id="apMain" data-testid="ap-main">
        {d && (
          <>
            <Head d={d} />
            <Tabs d={d} mode={s.mode} />
            {!d.abstractOnly && <RefCheck />}
            {s.busy && <div className="ap-box" data-testid="ap-busy">{t("ap2_reading_the_paper_and")}</div>}
            {s.mode === "ask" && <Ask />}
            {/* apRender (11277): an abstract never shows the walk-through. */}
            {s.mode === "walk" && !d.abstractOnly && <Walk notes={notes} />}
            {s.mode === "card" && <Card notes={notes} />}
          </>
        )}
      </div>
      <Across notes={notes} />
    </div>
  );
}
