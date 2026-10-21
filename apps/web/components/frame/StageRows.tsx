"use client";
import { useState } from "react";
import { DotsThree } from "@phosphor-icons/react";
import { useT } from "@/lib/i18n";
import type { HomeFacts } from "@/lib/frame/homeFacts";
import type { StageState } from "@/lib/frame/stages";
import { STAGE_ORDER, type StageKey } from "@/lib/tools";
import { TOOL_TABS, toolModule, type ToolFacts } from "@/lib/tools/registry";

/**
 * Whether a stage has a place of its own in this build: Idea, Literature and Writing, and each stage 3 to 6 place one of whose tool modules is
 * built (the registry, ruling R5). The others say "Not built yet" in words. Asked while drawing, never while the modules load.
 */
const built = (s: StageKey): boolean => s === "idea" || s === "lit" || s === "writing" || TOOL_TABS.some((x) => x.stage === s && toolModule(x.tool).built);
/** The chip's colours (canvas Main's four): ready green, in progress and reopened purple, started early amber, not started grey. */
const CHIP: Record<StageState, string> = { ready: "ready", "in-progress": "active", reopened: "active", "started-early": "early", "not-started": "none" };
const ACTION: Record<StageState, string> = { ready: "home_act_reopen", "in-progress": "home_act_continue", "started-early": "home_act_continue", reopened: "home_act_continue", "not-started": "home_act_open" };

/**
 * "Where this project stands" (canvas Main): each stage's name, its tools, what it holds, its state as a chip (the word always shown) and the way
 * in (Continue, Open or Reopen), with a More menu that marks the stage ready or takes the mark back (no confirm: it is undone the same way).
 * `compact` is the phone's (canvas Phone): each row the name, what it holds and the chip, the whole row opening the stage, with the More menu beside it.
 * `toolFacts` is what a built stage 3 to 6 place's modules say of it (Task G3), read by the home for those stages only.
 */
export function StageRows({ states, facts, toolFacts = {}, onOpen, onMark, compact = false }: {
  states: Record<StageKey, StageState>;
  facts: HomeFacts;
  toolFacts?: Partial<Record<StageKey, ToolFacts[]>>;
  onOpen(stage: StageKey): void;
  onMark(stage: StageKey, ready: boolean): void;
  compact?: boolean;
}) {
  const t = useT();
  const detail = (s: StageKey): string => {
    if (!built(s)) return t("detail_not_built");
    if (s === "idea") {
      if (facts.question.trim() === "") return t("detail_idea_none");
      // The line ends with its own full stop; a verdict that already ends with one would read "..".
      if (facts.verdict !== null) return t("detail_idea", { verdict: facts.verdict.replace(/[.!?।]+\s*$/, "") });
      return facts.checked ? t("detail_idea_checked") : t("detail_idea_unread");
    }
    if (s === "lit") return t("detail_lit", { kept: facts.kept, read: facts.read, highlights: facts.highlights, cards: facts.cards });
    // The modules' lines, in the registry's order (Task G3). None (no module says anything yet, or the read is not back) adds nothing: the row
    // says nothing it does not know.
    const lines = (toolFacts[s] ?? []).flatMap((f) => (f.detail ? [t(f.detail, f.vars)] : [])).join(" ");
    // Writing: the draft's words first, then its tools' lines (My style, Words) after " · ".
    if (s === "writing") return [t("detail_writing", { words: facts.draftWords }), lines].filter(Boolean).join(" · ");
    // A built stage 3 to 6 place: its modules' lines only.
    return lines;
  };
  const chip = (s: StageKey) => <span className={"home-chip " + CHIP[states[s]]} data-testid={"home-state-" + s}>{t("state_" + states[s].replace("-", "_"))}</span>;
  if (compact) return (
    <section className="home-card home-stages compact" aria-labelledby="home-stages-h" data-testid="home-stages">
      <h2 id="home-stages-h" className="home-stages-h">{t("home_stages_h")}</h2>
      <ul>
        {STAGE_ORDER.map((s) => (
          <li key={s} className="home-stage-c" data-testid={"home-stage-" + s}>
            <button type="button" className="home-stage-row" onClick={() => onOpen(s)} data-testid={"home-open-" + s}>
              <span className="home-stage-text">
                <span className="name">{t("stage_name_" + s)}</span>
                <span className="home-stage-detail" data-testid={"home-detail-" + s}>{detail(s)}</span>
              </span>
              {chip(s)}
            </button>
            <MoreMenu stage={s} ready={states[s] === "ready"} onMark={onMark} />
          </li>
        ))}
      </ul>
    </section>
  );
  return (
    <section className="home-card home-stages" aria-labelledby="home-stages-h" data-testid="home-stages">
      <div className="home-stages-head">
        <h2 id="home-stages-h">{t("home_stages_h")}</h2>
        <p>{t("home_stages_sub")}</p>
      </div>
      <ul>
        {STAGE_ORDER.map((s) => (
          <li key={s} className="home-stage" data-testid={"home-stage-" + s}>
            <div className="home-stage-name">
              <div className="name">{t("stage_name_" + s)}</div>
              <div className="tools">{t("home_tools_" + s)}</div>
            </div>
            <div className="home-stage-detail" data-testid={"home-detail-" + s}>{detail(s)}</div>
            <div>{chip(s)}</div>
            <div className="home-stage-acts">
              <button type="button" className="home-stage-open" onClick={() => onOpen(s)} data-testid={"home-open-" + s}>{t(ACTION[states[s]])}</button>
              <MoreMenu stage={s} ready={states[s] === "ready"} onMark={onMark} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One item: "Not ready yet" while the stage is ready, otherwise "Mark ready" (a reopened stage is marked again, stamped now). */
function MoreMenu({ stage, ready, onMark }: { stage: StageKey; ready: boolean; onMark(stage: StageKey, ready: boolean): void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="home-more" onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>
      <button type="button" className="home-more-btn" aria-haspopup="menu" aria-expanded={open} aria-label={t("home_more", { stage: t("stage_name_" + stage) })}
        onClick={() => setOpen((o) => !o)} data-testid={"home-more-" + stage}>
        <DotsThree size={20} weight="bold" aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="home-more-menu">
          <button type="button" role="menuitem" data-testid={"home-mark-" + stage} onClick={() => { setOpen(false); onMark(stage, !ready); }}>
            {t(ready ? "home_mark_unready" : "home_mark_ready")}
          </button>
        </div>
      )}
    </div>
  );
}
