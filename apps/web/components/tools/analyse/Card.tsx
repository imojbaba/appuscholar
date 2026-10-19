"use client";
import { AP_STAGES } from "@appuscholar/core";
import { tHtml, useT } from "@/lib/i18n";
import { downloadCard, stageName } from "@/lib/analyse/cards";
import type { ApNotesStore } from "@/lib/analyse/notes";
import { useApState } from "@/lib/analyse/useApDoc";
import { Button } from "@/components/ui/button";

/** The card's four fields (11329-11330): v1's ids (apC_<field>), labels and rows. */
const FIELDS = [["strengths", "ap2_strengths", 3], ["weak", "ap2_weaknesses", 3], ["verdict", "ap2_your_verdict_in_one", 1], ["notes", "ap2_your_notes", 3]] as const;

/**
 * "🗂 Paper card" (apRender 11325-11331): v1's sentence, each stage with stored words or a reply (its name, "My words:" with the words or "(not written)", the reading muted), or "No stage
 * done yet…"; Strengths, Weaknesses, "Your verdict in one line" and "Your notes", each saved to the paper's note as it is typed (apCardField 10121); "⬇ Download the card (.txt)" saves
 * paper-card.txt (core's apCardText, with the reference check's line when it ran to the end).
 */
export function Card({ notes }: { notes: ApNotesStore }) {
  const t = useT();
  const s = useApState();
  const d = s.doc!;
  const n = notes.note(d.id);
  const stages = n?.stages ?? {};
  const c = n?.card ?? {};
  const done = AP_STAGES.filter((x) => stages[x.k]?.mine || stages[x.k]?.res);
  return (
    <div data-testid="ap-card">
      <div className="ap-box">{tHtml(t("ap2_paper_card_your_own"))}</div>
      {done.length ? done.map((x) => {
        const st = stages[x.k]!;
        return (
          <div className="ap-box" key={x.k}>
            <b>{stageName(t, x.k)}</b><br />{t("ap2_my_words_2")} {st.mine || t("ap2_not_written")}
            {st.res?.reading ? <><br /><span className="ap-small">{t("ap2_reading_3")} {st.res.reading}</span></> : null}
          </div>
        );
      }) : <div className="ap-box ap-small">{t("ap2_no_stage_done_yet")}</div>}
      {FIELDS.map(([f, label, rows]) => (
        <div className="field" key={f}>
          <label htmlFor={"apC_" + f}>{t(label)}</label>
          <textarea className="input" id={"apC_" + f} rows={rows} value={(c[f] as string | undefined) ?? ""} onChange={(e) => { const v = e.target.value; notes.put(d, (x) => { x.card[f] = v; }); }} />
        </div>
      ))}
      <div className="ap-row">
        <Button variant="gold" size="sm" id="apCardBtn" onClick={() => downloadCard(t, { title: d.title, note: n, refs: s.refs })}>{t("ap2_card_btn")}</Button>
      </div>
    </div>
  );
}
