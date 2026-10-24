"use client";
import { useRef, useState } from "react";
import { shMarkedParts, shMineOk, type ShNote } from "@appuscholar/core";
import { tHtml, useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import type { ShelfItem } from "@/lib/shelf/actions";
import { Parts } from "./Parts";

/**
 * The reader (shReaderRender 11657-11666): "← Back", the title, ‹ "page N of M" ›, the page's text with its highlights marked (core's shMarkedParts), v1's caveat about extracted
 * text, the note box and "Save selected passage as a highlight", the highlights by page with "Go to page" and "Delete", then "Summary, after you think first": v1's sentence, the
 * student's own lines, "Summarise with AI" (disabled until core's shMineOk passes, with that sentence under it as its reason: DESIGN-SYSTEM §8) and the summary box.
 */
export function Reader({ item, page, onBack, onPage, onSaveHighlight, onDeleteHighlight, onSummarise }: {
  item: ShelfItem & { paper: NonNullable<ShelfItem["paper"]> };
  page: number;
  onBack(): void;
  onPage(page: number): void;
  /** The selected text (or "" when the selection is not in the page text) and the note: true once saved. */
  onSaveHighlight(selection: string, note: string): boolean;
  onDeleteHighlight(noteId: string): void;
  onSummarise(mine: string, setOut: (s: string) => void): Promise<void>;
}) {
  const t = useT();
  const p = item.paper;
  const n = p.pages.length;
  const textRef = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState("");
  const [mine, setMine] = useState("");
  const [out, setOut] = useState("");
  // shPage / shGo (11667-11668): within 1..n; a page number that does not parse is 1.
  const go = (v: number) => onPage(Math.min(n, Math.max(1, v || 1)));
  const save = () => {
    const sel = window.getSelection();
    const inside = !!sel && !!sel.anchorNode && !!textRef.current && textRef.current.contains(sel.anchorNode);
    if (onSaveHighlight(inside ? String(sel!.toString()) : "", note)) setNote("");
  };
  const hl: ShNote[] = p.notes.filter((x) => x.quote).sort((a, c) => a.page - c.page);
  const ok = shMineOk(mine);
  return (
    <>
      <div className="sh-row sh-wrap sh-center">
        <Button variant="ghost" size="sm" data-testid="sh-back" onClick={onBack}>{t("sh2_back")}</Button>
        <b className="sh-grow" data-testid="sh-reader-title">{item.title}</b>
        <Button variant="ghost" size="sm" data-testid="sh-prev" aria-label="‹" onClick={() => go(page - 1)}>‹</Button>
        <span className="sh-small">{t("sh2_page_2")}{" "}
          <input className="input sh-pg" type="number" id="shPg" data-testid="sh-pg" min={1} max={n} defaultValue={page} key={page} aria-label={t("sh2_page_2")}
            onBlur={(e) => { if (Number(e.target.value) !== page) go(parseInt(e.target.value, 10)); }}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />{" "}{t("sh2_of", { n })}
        </span>
        <Button variant="ghost" size="sm" data-testid="sh-next" aria-label="›" onClick={() => go(page + 1)}>›</Button>
      </div>
      {item.src === "epmc" && <p className="sh-small sh-muted" data-testid="sh-src">{t("rl_text_epmc")}</p>}
      <div id="shText" className="sh-page" data-testid="sh-text" ref={textRef}><Parts parts={shMarkedParts(p.pages[page - 1] || "", p.notes, page)} /></div>
      <p className="sh-small sh-muted">{t("sh2_this_is_the_text")}</p>
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
          <Button variant="ghost" size="sm" data-testid="sh-hl-go" onClick={() => go(x.page)}>{t("sh2_go_to_page")}</Button>{" "}
          <Button variant="ghost" size="sm" data-testid="sh-hl-del" onClick={() => onDeleteHighlight(x.id)}>{t("sh2_delete")}</Button>
        </div>
      )) : <p className="sh-small">{t("sh2_none_yet")}</p>}
      <h3 className="sh-h3">{t("sh2_summary_after_you_think")}</h3>
      <p className="sh-small">{t("sh2_in_your_own_words")}</p>
      <textarea className="input sh-wide" id="shMine" data-testid="sh-mine" rows={3} value={mine} aria-label={t("sh2_summary_after_you_think")} onChange={(e) => setMine(e.target.value)} />
      <div className="sh-row">
        <Button variant={ok ? "primary" : "ghost"} id="shAiBtn" data-testid="sh-ai" disabled={!ok} aria-describedby={ok ? undefined : "shAiWhy"}
          onClick={() => { void onSummarise(mine, setOut); }}>{t("sh2_ai_btn")}</Button>
      </div>
      {!ok && <p className="sh-small sh-muted" id="shAiWhy" data-testid="sh-ai-why">{t("sh2_in_your_own_words")}</p>}
      <div id="shAi" className="sh-ai" data-testid="sh-ai-out" aria-live="polite">{out}</div>
    </>
  );
}
