"use client";
import { useState } from "react";
import { DotsThree } from "@phosphor-icons/react";
import { useT } from "@/lib/i18n";
import type { HomeFacts } from "@/lib/frame/homeFacts";
import type { StageState } from "@/lib/frame/stages";
import { STAGE_ORDER, type StageKey } from "@/lib/tools";

/** The stages that have a place of their own in this build; the others say "Not built yet" in words. */
const BUILT: ReadonlySet<StageKey> = new Set<StageKey>(["idea", "lit", "writing"]);
/** The chip's colours (canvas Main's four): ready green, in progress and reopened purple, started early amber, not started grey. */
const CHIP: Record<StageState, string> = { ready: "ready", "in-progress": "active", reopened: "active", "started-early": "early", "not-started": "none" };
const ACTION: Record<StageState, string> = { ready: "home_act_reopen", "in-progress": "home_act_continue", "started-early": "home_act_continue", reopened: "home_act_continue", "not-started": "home_act_open" };

/**
 * "Where this project stands" (canvas Main): each stage's name, its tools, what it holds, its state as a chip (the word always shown) and the way
 * in (Continue, Open or Reopen), with a More menu that marks the stage ready or takes the mark back (no confirm: it is undone the same way).
 */
export function StageRows({ states, facts, onOpen, onMark }: {
  states: Record<StageKey, StageState>;
  facts: HomeFacts;
  onOpen(stage: StageKey): void;
  onMark(stage: StageKey, ready: boolean): void;
}) {
  const t = useT();
  const detail = (s: StageKey): string => {
    if (!BUILT.has(s)) return t("detail_not_built");
    if (s === "idea") {
      if (facts.question.trim() === "") return t("detail_idea_none");
      return facts.verdict === null ? t("detail_idea_unread") : t("detail_idea", { verdict: facts.verdict });
    }
    if (s === "lit") return t("detail_lit", { kept: facts.kept, read: facts.read, highlights: facts.highlights, cards: facts.cards });
    return t("detail_writing", { words: facts.draftWords });
  };
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
            <div><span className={"home-chip " + CHIP[states[s]]} data-testid={"home-state-" + s}>{t("state_" + states[s].replace("-", "_"))}</span></div>
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
