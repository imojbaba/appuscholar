"use client";
import { useState } from "react";
import { shRankPages, type ShSearchHit } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import type { ShelfItem } from "@/lib/shelf/actions";
import { ResultCard } from "./ResultCard";

type Paper = { id: string; title: string; pages: string[] };
/** The papers whose text is read, as core ranks them. */
export const rankable = (items: ShelfItem[]): Paper[] => items.flatMap((x) => (x.paper ? [{ id: x.id, title: x.title, pages: x.paper.pages }] : []));

/**
 * Search (shSearchRender 11627-11629, shSearchRun 11633-11638): the words, "Search" or Enter, then core's shRankPages: the pages with every word, else (more than one word) the pages
 * with some, under v1's note; "Type a word or two." or "No page on the shelf matches." when nothing came back. "The shelf is empty." under it while the shelf is.
 */
export function Search({ items, onOpen }: { items: ShelfItem[]; onOpen(id: string, page: number): void }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ hits: ShSearchHit<Paper>[]; or: boolean; noTerms: boolean } | null>(null);
  const run = () => setRes(shRankPages(rankable(items), q));
  return (
    <>
      <div className="sh-row">
        <input className="input sh-grow" type="text" id="shQ" data-testid="sh-q" value={q} placeholder={t("sh2_q_placeholder")} aria-label={t("sh2_search")}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") run(); }} />
        <Button variant="primary" data-testid="sh-search-run" onClick={run}>{t("sh2_search")}</Button>
      </div>
      <div id="shRes" className="sh-res" data-testid="sh-res" role="status">
        {res && (res.hits.length ? (
          <>
            {res.or && <p className="sh-small sh-muted" data-testid="sh-or-note">{t("sh2_no_page_has_every")}</p>}
            {res.hits.map((h) => <ResultCard key={h.p.id + ":" + h.page} title={h.p.title} page={h.page} snippet={h.snippet} onOpen={() => onOpen(h.p.id, h.page)} />)}
          </>
        ) : <p className="sh-text">{res.noTerms ? t("sh2_type_a_word_or") : t("sh2_no_page_on_the")}</p>)}
      </div>
      {!items.length && <p className="sh-text">{t("sh2_the_shelf_is_empty_2")}</p>}
    </>
  );
}
