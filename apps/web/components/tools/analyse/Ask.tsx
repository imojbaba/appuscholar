"use client";
import { useRef } from "react";
import { fieldLabel } from "@appuscholar/core";
import { tHtml, useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { useCallAI } from "@/lib/ai/useCallAI";
import { apAsk } from "@/lib/analyse/ask";
import { setAp, useApState, type ApAskItem, type ApQuote } from "@/lib/analyse/useApDoc";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/** The five chips (11288), in v1's order. */
const CHIPS = ["ap2_what_was_the_research", "ap2_why_did_the_authors", "ap2_who_were_the_participants", "ap2_which_statistical_test_was", "ap2_what_are_the_limitations"] as const;

/** apQuotesHTML (10018-10026): the banner when any quotation could not be matched, then each quotation with where it was found (apCheckQuote's page, else section, else "in the text"). */
export function Quotes({ list }: { list: ApQuote[] }) {
  const t = useT();
  if (!list.length) return null;
  const bad = list.filter((c) => !c.ok).length;
  const where = (c: ApQuote) => (c.page ? t("ap2_page_n", { page: c.page }) : c.sec ? t("ap2_section_sec", { sec: c.sec }) : t("ap2_in_the_text"));
  return (
    <>
      {bad > 0 && <div className="ap-banner" data-testid="ap-banner">{t("ap2_of_the_quotations_below", { bad })}</div>}
      {list.map((c, i) => c.ok ? (
        <blockquote key={i} className="ap-q" data-testid="ap-quote">“{c.q}”<br /><span className="ap-ok">{t("ap2_found_in_the_paper")} {where(c)}{c.sec && c.page ? " (" + c.sec + ")" : ""}</span></blockquote>
      ) : (
        <blockquote key={i} className="ap-q ap-bad" data-testid="ap-quote">“{c.q}”<br /><span className="ap-warn">{t("ap2_could_not_be_matched")}</span></blockquote>
      ))}
    </>
  );
}

/** One entry of the log (11298-11304): the question, then the raw reply under v1's warning, or the answer (with "The paper does not seem to answer this." first when in_paper is false) and its quotations; the partial-read note. */
function Answer({ it }: { it: ApAskItem }) {
  const t = useT();
  return (
    <>
    <p className="ap-small ap-about" data-testid="ap-about">{t("ap_about", { title: it.title })}</p>
    <div className="ap-box" data-testid="ap-answer">
      {tHtml(t("ap2_you_asked"))} {it.q}<br />
      {it.raw !== undefined ? (
        <><span className="ap-warn">{t("ap2_the_answer_could_not")}</span><br />{it.raw}</>
      ) : (
        <>{!it.in_paper && <><span className="ap-warn">{t("ap2_the_paper_does_not")}</span><br /></>}{it.answer}<Quotes list={it.quotes} /></>
      )}
      {it.partial && <div className="ap-small ap-gap">{t("ap2_the_paper_is_long", { n: it.n, of: it.of })}</div>}
    </div>
    </>
  );
}

/** The Ask tab (11287-11305): the question box, the chips, "Ask", and the log, newest first. v1's "🔢 Check the paper's numbers" and its box are the reader's Check numbers tab now (wave B Task 27). */
export function Ask() {
  const t = useT();
  const s = useApState();
  const { settings } = useSettings();
  const callAI = useCallAI();
  const box = useRef<HTMLTextAreaElement>(null);
  const ask = () => { void apAsk({ callAI, field: fieldLabel(settings.field), toast, t }); };
  return (
    <div data-testid="ap-ask">
      <div className="field">
        <label htmlFor="apQ">{t("ap2_your_question_about_this")}</label>
        <textarea ref={box} className="input" id="apQ" data-testid="ap-q" rows={2} placeholder={t("ap2_q_placeholder")} value={s.qDraft} onChange={(e) => setAp({ qDraft: e.target.value })} />
      </div>
      <div className="ap-row ap-wrap">
        {/* apChip (10121): the chip's words become the question, and the box takes the focus. */}
        {CHIPS.map((k) => <Button key={k} variant="ghost" size="xs" data-testid="ap-chip" onClick={() => { setAp({ qDraft: t(k) }); box.current?.focus(); }}>{t(k)}</Button>)}
      </div>
      <div className="ap-row">
        <Button variant="primary" size="sm" id="apAskBtn" data-testid="ap-ask-btn" disabled={s.busy} onClick={ask}>{t("ap2_ask")}</Button>
      </div>
      {s.log.slice().reverse().map((it, i) => <Answer key={s.log.length - i} it={it} />)}
    </div>
  );
}
