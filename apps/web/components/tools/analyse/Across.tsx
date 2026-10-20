"use client";
import { AP_COLS } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { acrossData, colLabel, downloadAcross } from "@/lib/analyse/cards";
import type { ApNotesStore } from "@/lib/analyse/notes";
import { getAp, setAp, useApState } from "@/lib/analyse/useApDoc";
import { Button } from "@/components/ui/button";
import { PanelLoading } from "../PanelLoading";
import { NotesState } from "./Walk";

/**
 * apAcrossRender (9965-9976): the column boxes (AP_COLS, ticked for the stored columns; a toggle stores the new list, apAcrossColToggle) and "Also show the AI readings…" (the tab's memory,
 * ruling R28); then "No paper card yet…", or the table (core's apAcrossData: one row per paper with a title and any card or stage text) with "×" on each row, "⬇ Download as CSV"
 * (paper_cards.csv, core's apAcrossCsv) and v1's note. "×" asks v1's question (apAcrossDel 9978-9984) and deletes the paper's note; for the paper loaded now, its replies and words of
 * this visit go too, and the card fields typed for it in this tab. While the stored notes are being read the loading sign is drawn (W8); while they are not known for another reason only the locked line is drawn; a broken store
 * shows its line in place of "No paper card yet…".
 */
function AcrossBody({ notes }: { notes: ApNotesStore }) {
  const t = useT();
  const s = useApState();
  // W8: being read and opened, the loading sign (never "No paper card yet…").
  if (notes.loading) return <PanelLoading />;
  // Not read yet: the locked line (or nothing when the read failed), never "No paper card yet…".
  if (notes.unread) return <NotesState notes={notes} />;
  const d = acrossData(t, notes.all, notes.cols, s.acrossAi);
  const sel = (
    <>
      <div className="ap-row ap-wrap ap-cols">
        {AP_COLS.map(([k]) => (
          <label key={k} className="ap-check">
            <input type="checkbox" data-apcol={k} checked={notes.cols.includes(k)} onChange={(e) => notes.toggleCol(k, e.target.checked)} />{colLabel(t, k)}
          </label>
        ))}
      </div>
      <label className="ap-check ap-cols"><input type="checkbox" id="apAcrossAi" checked={s.acrossAi} onChange={(e) => setAp({ acrossAi: e.target.checked })} />{t("ap2_also_show_the_ai")}</label>
    </>
  );
  if (!d.body.length) return <>{notes.broken ? <NotesState notes={notes} /> : <p className="ap-small">{t("ap2_no_paper_card_yet")}</p>}{sel}</>;
  const del = (i: number) => {
    const id = d.ids[i];
    if (!id) return;
    if (!window.confirm(t("ap2_remove_the_saved_card") + d.body[i]![0] + t("ap2_your_words_for_this"))) return;
    if (!notes.remove(id)) return;
    if (getAp().doc?.id === id) setAp({ res: {}, tryDraft: {} });
    setAp((x) => { const cardDraft = { ...x.cardDraft }; delete cardDraft[id]; return { cardDraft }; });
  };
  return (
    <>
      {sel}
      <div className="ap-table">
        <table>
          <thead><tr>{d.head.map((x, i) => <th key={i}>{x}</th>)}<th /></tr></thead>
          <tbody>
            {d.body.map((r, i) => (
              <tr key={d.ids[i]}>
                {r.map((c, j) => <td key={j} className={j === 0 ? "ap-paper" : undefined}>{c}</td>)}
                <td><Button variant="ghost" size="xs" title={t("ap2_remove_this_card_title")} onClick={() => del(i)}>×</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ap-row ap-gap">
        <Button variant="gold" size="sm" id="apAcrossCsv" onClick={() => downloadAcross(d)}>{t("ap2_across_csv")}</Button>
      </div>
      <p className="ap-small">{t("ap2_cells_are_your_words")}</p>
    </>
  );
}

/** "📊 My paper cards side by side" (#apAcrossBox, v1 753): a <details> drawn when it opens (v1's ontoggle), its open state kept in this tab's memory. */
export function Across({ notes }: { notes: ApNotesStore }) {
  const t = useT();
  const { acrossOpen } = useApState();
  return (
    <details id="apAcrossBox" className="ap-across" data-testid="ap-across" open={acrossOpen} onToggle={(e) => { const open = e.currentTarget.open; if (open !== getAp().acrossOpen) setAp({ acrossOpen: open }); }}>
      <summary>{t("ap2_my_paper_cards_side")}</summary>
      <div id="apAcross">{acrossOpen && <AcrossBody notes={notes} />}</div>
    </details>
  );
}
