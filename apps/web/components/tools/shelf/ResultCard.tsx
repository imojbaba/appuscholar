"use client";
import type { SnippetPart } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Parts } from "./Parts";

/**
 * One page that matched (shResHTML 11630-11632): the paper's title and "· page N", the snippet (or, for Find passages, "Closest sentence:" and its snippet), and "Open this page".
 */
export function ResultCard({ title, page, snippet, closest, onOpen }: { title: string; page: number; snippet: SnippetPart[]; closest?: boolean; onOpen(): void }) {
  const t = useT();
  return (
    <div className="sh-card" data-testid="sh-result">
      <div className="sh-card-head">{title} <span className="sh-muted">{t("sh2_page", { page })}</span></div>
      <div className="sh-snippet" data-testid="sh-snippet">{closest && <><i>{t("sh2_closest_sentence")}</i>{" "}</>}<Parts parts={snippet} /></div>
      <Button variant="ghost" size="sm" data-testid="sh-open-page" onClick={onOpen}>{t("sh2_open_this_page")}</Button>
    </div>
  );
}
