import { daysAway } from "./gap";

/*
 * What the welcome-back recap can say, from what v2 keeps in the account (v1 retStats counted an activity log kept in the browser; v2 has none).
 * Counted: new documents (their `createdAt`), AI help logged (GET /ai/log?from=), test results inserted (the times in the `stats_runs` record).
 * Not countable, so never shown, not even as zero: sources added and passages coded (nothing in v2 stores when either happened).
 * Document text is read only through `lastDoc`, and only when the vault is open; locked, it is never asked for.
 */

export type RecapDoc = { createdAt: string; updatedAt: string };

/** The readers the facts are made from; the dialog's host builds them from the open project. */
export type RecapApi = {
  /** The last visit in ms, and now. */
  since: number;
  now: number;
  /** The student turned the AI log off: then it holds nothing to count. */
  aiLogOff: boolean;
  /** The vault is off or unlocked. Locked, no document text is read. */
  vaultOpen: boolean;
  /** `name` is null while the title is locked or cannot be opened. */
  project: { name: string | null; stage: string } | null;
  openDoc: { title: string | null; words: number } | null;
  documents: RecapDoc[];
  /** GET /ai/log?from=<day>: the rows of that day and after. */
  aiRows(fromDay: string): Promise<unknown[]>;
  /** The times (ms) of the stored test results, or null when that record cannot be read (locked, broken, failed). */
  testTimes(): Promise<number[] | null>;
  /** The first words of the last-edited document and when it was edited. Called only with the vault open. */
  lastDoc(): Promise<{ at: number; text: string } | null>;
  /** The newest first answer saved on this device. */
  answer: { t: number; text: string } | null;
};

export type RecapCounts = { docs?: number; ai?: number; tests?: number };
export type RecapFacts = {
  days: number;
  project: { name: string | null; stage: string } | null;
  doc: { title: string | null; words: number } | null;
  /** A key is present only when that count was read; its value may be zero (the dialog shows only counts above zero). */
  counts: RecapCounts;
  /** Every count was read and all are zero: only then may the dialog say nothing was found to count. */
  nothingCounted: boolean;
  wrote: { at: number; text: string } | null;
  answer: { t: number; text: string } | null;
};

const z2 = (n: number) => String(n).padStart(2, "0");
/** The local calendar day after `ms`, as the log writes its days (YYYY-MM-DD): only requests on later days are surely after the last visit. */
export function dayAfter(ms: number): string {
  const d = new Date(ms);
  const n = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return `${n.getFullYear()}-${z2(n.getMonth() + 1)}-${z2(n.getDate())}`;
}

/** The first `n` words of some document HTML as plain text, "…" after a cut. Read through the DOM parser, which runs no script. */
export function firstWords(html: string, n: number): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, template").forEach((el) => el.remove());
  const words = (doc.body.textContent ?? "").split(/\s+/).filter(Boolean);
  return words.slice(0, n).join(" ") + (words.length > n ? "…" : "");
}

export async function recapFacts(api: RecapApi): Promise<RecapFacts> {
  const counts: RecapCounts = {};
  counts.docs = api.documents.filter((d) => Date.parse(d.createdAt) > api.since).length;
  if (!api.aiLogOff) {
    try { counts.ai = (await api.aiRows(dayAfter(api.since))).length; } catch { /* not readable: left out */ }
  }
  try {
    const times = await api.testTimes();
    if (times) counts.tests = times.filter((t) => t > api.since).length;
  } catch { /* not readable: left out */ }

  let wrote: RecapFacts["wrote"] = null;
  if (api.vaultOpen) {
    try { wrote = await api.lastDoc(); } catch { /* the document did not open: no line */ }
    if (wrote && !wrote.text) wrote = null;
  }

  const all = counts.docs !== undefined && counts.ai !== undefined && counts.tests !== undefined;
  return {
    days: daysAway(api.since, api.now),
    project: api.project,
    doc: api.openDoc,
    counts,
    nothingCounted: all && !counts.docs && !counts.ai && !counts.tests,
    wrote,
    answer: api.answer
  };
}
