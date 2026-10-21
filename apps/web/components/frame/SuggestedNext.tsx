"use client";
import { useT } from "@/lib/i18n";
import type { HomeFacts } from "@/lib/frame/homeFacts";
import type { NextStep } from "@/lib/frame/suggest";

/** The button under each suggestion: the place it opens, in the student's words. */
const BUTTON: Record<string, string> = {
  next_question: "next_btn_question",
  next_feasibility: "next_btn_question",
  next_find: "next_btn_find",
  next_read: "next_btn_reading",
  next_compare: "next_btn_compare",
  next_write: "next_btn_writing"
};

/** "Suggested next" (canvas Main): suggestNext's sentence, what is kept and read so far, and a button to the place it names. */
export function SuggestedNext({ next, facts, onOpen }: { next: NextStep; facts: HomeFacts; onOpen(): void }) {
  const t = useT();
  return (
    <section className="home-next" data-testid="home-next">
      <div className="home-next-text">
        <h2>{t("home_next_h")}</h2>
        <p className="home-next-say" data-testid="home-next-say">{t(next.key, next.vars)}</p>
        <p className="home-next-sub">{t("next_sub", { kept: facts.kept, read: facts.read })}</p>
      </div>
      <button type="button" className="home-next-btn" onClick={onOpen} data-testid="home-next-btn">{t(BUTTON[next.key] ?? "next_btn_writing")}</button>
    </section>
  );
}
