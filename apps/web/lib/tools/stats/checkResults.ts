import { rtFlip, rtScanTags, type RtSavedRun, type RtScanItem, type RtSet, type RtStatus, type RtWhy } from "@appuscholar/core";
import type { StatsRuns, StatsSets } from "@/lib/blobs/kinds/stats";
import type { ProjectDocument } from "@/lib/editor/docAccess";

/*
 * Results linked to their data (v1 rtScan 12272-12286, rtOpen 12287-12305): every result a student inserted from the Data tab is a `stat-tag` span carrying a
 * run id. The scan lists the spans of every document of the project (ledger ruling R5: the scope is the project; v1 looked at the open document only), and core's
 * rtScanTags tells each one Current, Out of date or Cannot check by comparing its run's data fingerprint with the one stored for that data set's name.
 */

/** One tagged result in one document. */
export type ResultItem = {
  /** The run id the span carries (`data-run`). */
  id: string;
  docId: string;
  docTitle: string;
  /** Which of the document's spans with this run id this one is (a pasted copy carries the same id). */
  nth: number;
  /** Which time these same words appear among the project's items of this document before this one (for "Go to this text"). */
  at: number;
  /** The span's text as it stands in the document. */
  text: string;
  status: RtStatus;
  why: RtWhy;
  when?: number;
};

const SPAN = "span.stat-tag[data-run]";
const body = (html: string): HTMLElement => new DOMParser().parseFromString("<body>" + html + "</body>", "text/html").body;

/** The tagged spans of one document's HTML, in order, with the text each holds. */
export function tagsIn(html: string): Array<{ id: string; text: string }> {
  return [...body(html).querySelectorAll(SPAN)].map((el) => ({ id: el.getAttribute("data-run") ?? "", text: el.textContent ?? "" })).filter((s) => s.id !== "");
}

/** Every tagged result of the given documents with its status, documents in the order given and results in the order written (v1 rtScan, for the project). */
export function scanProject(docs: ProjectDocument[], runs: StatsRuns, sets: StatsSets): ResultItem[] {
  const out: ResultItem[] = [];
  for (const d of docs) {
    const tags = tagsIn(d.html);
    const scanned: RtScanItem[] = rtScanTags(tags.map((x) => ({ id: x.id })), runs as unknown as Record<string, RtSavedRun>, sets as Record<string, RtSet>);
    const perId = new Map<string, number>();
    const perText = new Map<string, number>();
    tags.forEach((tag, i) => {
      const nth = perId.get(tag.id) ?? 0;
      perId.set(tag.id, nth + 1);
      const at = perText.get(tag.text) ?? 0;
      perText.set(tag.text, at + 1);
      const s = scanned[i]!;
      out.push({ id: tag.id, docId: d.id, docTitle: d.title, nth, at, text: tag.text, status: s.status, why: s.why, ...(s.when !== undefined ? { when: s.when } : {}) });
    });
  }
  return out;
}

/** v1 rtOpen's counts (12288): tagged, current, out of date, and the rest. */
export function resultCounts(items: ReadonlyArray<{ status: RtStatus }>): { n: number; c: number; s: number; u: number } {
  const c = items.filter((i) => i.status === "cur").length, s = items.filter((i) => i.status === "stale").length;
  return { n: items.length, c, s, u: items.length - c - s };
}

/** The text of the `nth` span carrying run id `id` in a document's HTML, or null when it is not there. */
export function tagText(html: string, id: string, nth: number): string | null {
  const span = [...body(html).querySelectorAll(SPAN)].filter((el) => el.getAttribute("data-run") === id)[nth];
  return span ? span.textContent ?? "" : null;
}

/**
 * The document's HTML with the `nth` span carrying run id `id` holding `text` instead (v1 `it.el.textContent=neu`, 12326): the span, its run id and everything
 * else in the document are left as they are. Null when that span is not there any more.
 */
export function withTagText(html: string, id: string, nth: number, text: string): string | null {
  const root = body(html);
  const span = [...root.querySelectorAll(SPAN)].filter((el) => el.getAttribute("data-run") === id)[nth];
  if (!span) return null;
  span.textContent = text;
  return root.innerHTML;
}

/** Whether the conclusion at .05 differs between the sentence that was inserted and the new one (v1 rtRerunOne 12325, core's rtFlip). */
export const flipped = (oldSentence: string, newSentence: string): boolean => rtFlip(oldSentence, newSentence);
