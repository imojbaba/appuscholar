"use client";
import { useState } from "react";
import { shFindPassages, type ShPassage } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import type { ShelfItem } from "@/lib/shelf/actions";
import { ResultCard } from "./ResultCard";
import { rankable } from "./Search";

/**
 * Find passages for a sentence (shFindRender 11639-11642, shFindRun 11643-11647): v1's word-matching caveat, the sentence (prefilled with the editor's selection, white space
 * collapsed: selText2 7627), "Find pages", then core's shFindPassages: at most 5 pages sharing at least 2 of its terms, each with "Closest sentence:".
 */
export function Passages({ items, prefill, onOpen }: { items: ShelfItem[]; prefill: string; onOpen(id: string, page: number): void }) {
  const t = useT();
  const [q, setQ] = useState(prefill);
  const [res, setRes] = useState<{ hits: ShPassage<{ id: string; title: string; pages: string[] }>[]; noTerms: boolean } | null>(null);
  return (
    <>
      <p className="sh-text sh-intro">{t("sh2_paste_or_write_a")}</p>
      <textarea className="input sh-wide" id="shSent" data-testid="sh-sent" rows={3} value={q} aria-label={t("sh2_find_passages_for_a")} onChange={(e) => setQ(e.target.value)} />
      <div className="sh-row"><Button variant="primary" className="flex-1" data-testid="sh-find-run" onClick={() => setRes(shFindPassages(rankable(items), q))}>{t("sh2_find_pages")}</Button></div>
      <div id="shRes" className="sh-res" data-testid="sh-res" role="status">
        {res && (res.hits.length
          ? res.hits.map((h) => <ResultCard key={h.p.id + ":" + h.page} title={h.p.title} page={h.page} snippet={h.snippet} closest onOpen={() => onOpen(h.p.id, h.page)} />)
          : <p className="sh-text">{res.noTerms ? t("sh2_write_a_sentence_first") : t("sh2_no_page_shares_enough")}</p>)}
      </div>
      {!items.length && <p className="sh-text">{t("sh2_the_shelf_is_empty_2")}</p>}
    </>
  );
}
