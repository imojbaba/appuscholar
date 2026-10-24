"use client";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { fullText } from "@/lib/papers/fullText";
import type { Paper } from "@/lib/papers/list";

/**
 * The quiet line under a Reading list row while that paper's open-access full text is on its way (wave B Task 21b, register row D-S2-127), for ReadingList's `textState`. Using it also tells
 * the full-text queue that the list is shown, which is the moment it asks Europe PMC for the older papers' text (once per paper per session; a paper kept now was asked for at Keep). The
 * line follows the queue: it is there from the moment the list is shown until the paper has its text, Europe PMC has none (remembered), or the queue has stopped (the paper's "Get the
 * free PDF" is then shown, with its line, as before). A paper that has text on the list shows nothing.
 */
export function useFullTextLine(): (p: Paper) => ReactNode {
  const t = useT();
  useSyncExternalStore(fullText.subscribe, fullText.version, fullText.version);
  useEffect(() => { fullText.viewed(); }, []);
  /** The row's line: only for a paper with no text yet whose text is coming. */
  function line(p: Paper): ReactNode {
    return !p.shelf && fullText.pending(p.entry) ? <p className="rl-text-wait" data-testid="rl-text-wait">{t("rl_text_getting")}</p> : null;
  }
  return line;
}
