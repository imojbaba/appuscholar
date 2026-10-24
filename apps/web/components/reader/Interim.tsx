"use client";
import { useState } from "react";
import type { ShNote } from "@appuscholar/core";
import { tHtml, useT } from "@/lib/i18n";
import { deleteHighlight, saveHighlight, type ShelfItem, type ShelfOps } from "@/lib/shelf/actions";
import { Button } from "@/components/ui/button";

/** What the highlights body writes through: the paper's blob client, the toast and the clock. */
export type PaperOps = Pick<ShelfOps, "paper" | "updatePaper" | "flushPaper" | "toast" | "t" | "now">;
/** A reading-list paper whose text has been read, as the reader holds it. */
export type ReadItem = ShelfItem & { paper: NonNullable<ShelfItem["paper"]> };

/*
 * The body of the Highlights tab until Task 29 replaces it (wave B Task 27): today's note box with "Save selected passage as a highlight", and the highlights by page. It reads and writes the
 * paper's own blob, so nothing the shelf's reader could do is lost meanwhile. (The other tab of the shelf's reader, "Summary, after you think first", is Your take first now: YourTake.tsx, Task 28.)
 */

/**
 * shSaveHL's box and the highlights by page (11657-11666): the note box and "Save selected passage as a highlight" (the selection must start inside the paper's text, `textRef`), then each
 * highlight with "Go to page" and "Delete". `onPage` shows the page in the text beside it.
 */
export function HighlightsInterim({ item, page, ops, textRef, onPage }: { item: ReadItem; page: number; ops: PaperOps; textRef: React.RefObject<HTMLElement | null>; onPage(n: number): void }) {
  const t = useT();
  const [note, setNote] = useState("");
  const hl: ShNote[] = item.paper.notes.filter((x) => x.quote).sort((a, c) => a.page - c.page);
  const save = () => {
    const sel = window.getSelection();
    const inside = !!sel && !!sel.anchorNode && !!textRef.current && textRef.current.contains(sel.anchorNode);
    if (saveHighlight(item.id, page, inside ? String(sel!.toString()) : "", note, ops)) setNote("");
  };
  return (
    <div data-testid="reader-highlights">
      <textarea className="input sh-wide" id="shNote" data-testid="sh-note" rows={2} value={note} placeholder={t("sh2_note_placeholder")} aria-label={t("sh2_note_placeholder")} onChange={(e) => setNote(e.target.value)} />
      <div className="sh-row">
        {/* A press keeps the page's selection (the button takes no focus on mousedown). */}
        <Button variant="primary" className="flex-1" data-testid="sh-save-hl" onMouseDown={(e) => e.preventDefault()} onClick={save}>{t("sh2_save_selected_passage_as")}</Button>
      </div>
      <h3 className="sh-h3">{t("sh2_highlights")}</h3>
      {hl.length ? hl.map((x) => (
        <div className="sh-hl" data-testid="sh-hl" key={x.id}>
          {tHtml(t("sh2_p", { page: x.page }))}{x.quote.slice(0, 300)}{"”"}
          {x.note && <><br /><i>{x.note}</i></>}
          <br />
          <Button variant="ghost" size="sm" data-testid="sh-hl-go" onClick={() => onPage(x.page)}>{t("sh2_go_to_page")}</Button>{" "}
          <Button variant="ghost" size="sm" data-testid="sh-hl-del" onClick={() => deleteHighlight(item.id, x.id, ops)}>{t("sh2_delete")}</Button>
        </div>
      )) : <p className="sh-small">{t("sh2_none_yet")}</p>}
    </div>
  );
}
