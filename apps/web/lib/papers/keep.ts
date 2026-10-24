import { crLookupDoiV2, rsEntryFromResultV2, type CitationEntry, type CitationStyle, type PasteResult, type RsPaper } from "@appuscholar/core";
import type { StoredEntry } from "@/lib/blobs/kinds";
import type { Library } from "@/lib/cite/useLibrary";
import { newPid, paperMatch } from "./ids";

/*
 * Keep (wave B Task 18, register row D-S2-123): the one door through which a paper joins the project's library and its reading list. The paste box (Task 19, D-S2-124) and the
 * bookmark (Task 20) keep through keepEntry too, and the paste box's Undo takes a paper it just kept out again (undoKeep). A kept paper is a library entry with a `pid` (lib/papers/ids) and `rl: true`; whether it is kept already is decided
 * by paperMatch (the DOI when both have one, else the same long title and year), never by position or by title alone.
 */

export type KeepResult = { state: "kept" | "already"; pid: string };

/** The longest abstract a kept paper stores. */
export const ABSTRACT_MAX = 4000;
/** How long Keep waits for Crossref's volume, issue and pages before it gives up (quietly). */
export const CROSSREF_FILL_TIMEOUT_MS = 4000;

/** What Keep reads of the library: the entries and the way to change them, and whether they have been read (useLibrary's Library has all of it). */
export type KeepDeps = Pick<Library, "lib" | "update" | "ready" | "loading" | "locked" | "broken" | "error">;

/**
 * The stored library is known: there is a project, and it is not loading, locked or broken. A failed save or read does not unknow it (the blob client sets `error` for a
 * save that failed too, and then still holds the library and the keep for a retry), so what the library holds can still be shown: a paper in it is Kept.
 */
export function libraryKnown(l: Pick<Library, "ready" | "loading" | "locked" | "broken">): boolean {
  return l.ready && !l.loading && !l.locked && !l.broken;
}

/**
 * The stored library has been read: it is known (libraryKnown) and the last read or save did not fail. Keep decides "kept" or "already" against nothing else:
 * an unread library reads as empty, so a keep decided on it would add a duplicate (the trap Task 17's review found in linkShelf).
 */
export function libraryRead(l: Pick<Library, "ready" | "loading" | "locked" | "broken" | "error">): boolean {
  return libraryKnown(l) && !l.error;
}

/**
 * Keeps `e`: "already" with the pid of the library entry that is the same paper (nothing added; a stored entry that has no pid yet is given one), else the entry is added
 * with a new pid and `rl: true`. The library must have been read (libraryRead; useKeep waits for it), or this throws before it changes anything, since an update made
 * on an unread library is queued and lands on whatever is stored later. The check against the stored entries is made again inside the update, so a paper another
 * window kept since `lib` was read is not added twice.
 */
export function keepEntry(e: CitationEntry, d: KeepDeps): KeepResult {
  if (!libraryRead(d)) throw new Error("Keep needs a library that has been read.");
  const shown = d.lib.find((l) => paperMatch(e, l));
  if (shown?.pid) return { state: "already", pid: shown.pid };
  const mine = newPid();
  const seen: { stored?: StoredEntry } = {};
  const took = d.update((prev) => {
    seen.stored = prev.find((l) => paperMatch(e, l));
    if (!seen.stored) return [...prev, { ...e, pid: mine, rl: true }];
    const at = seen.stored;
    return at.pid ? prev : prev.map((l) => (l === at ? { ...l, pid: mine } : l));
  });
  if (!took) throw new Error("The library did not take the paper.");
  const had = seen.stored ?? shown;
  return had ? { state: "already", pid: had.pid ?? mine } : { state: "kept", pid: mine };
}

/**
 * A search result as the entry Keep stores (rsEntryFromResultV2, wave A W2: every author, and PubMed's volume, issue and pages), with the abstract (up to 4,000 characters)
 * and OpenAlex's open-access link when the result has them. A paper with a DOI has no URL: rsEntryFromResult writes `url` only when there is no DOI (wave A LATER T8).
 */
export function resultEntry(p: RsPaper, style: CitationStyle): StoredEntry {
  const e: StoredEntry = rsEntryFromResultV2(p, style);
  const abstract = (p.abstract ?? "").trim() ? p.abstract!.slice(0, ABSTRACT_MAX) : "";
  return { ...e, ...(abstract ? { abstract } : {}), ...(p.oaUrl ? { oa: p.oaUrl } : {}) };
}

/** What keeping a result needs besides the library: its citation style, the page's fetch (for Crossref), `fillEmpty`, and the retraction cache's seed. */
export type KeepResultDeps = KeepDeps & Pick<Library, "style" | "fillEmpty"> & {
  fetch: typeof fetch;
  /** retrCacheSet on the project's retraction cache. */
  seedRetraction(doi: string, flag: boolean): void;
};

/**
 * W2: an OpenAlex paper kept with a DOI and an empty volume, issue or pages is filled from Crossref's record of that DOI (crLookupDoiV2, so Crossref's article number is the
 * pages when it lists no page range, as a pasted paper has it; Task 19), and its author, only when empty, onto the entry with this pid. The request carries the DOI only and is aborted after CROSSREF_FILL_TIMEOUT_MS; any failure (offline, HTTP error, not in Crossref, the timeout) is swallowed.
 */
function fillFromCrossref(p: RsPaper, entry: CitationEntry, pid: string, d: Pick<KeepResultDeps, "fetch" | "fillEmpty">): void {
  if (p.source !== "OpenAlex" || !entry.doi || (entry.volume && entry.issue && entry.pages)) return;
  const f: typeof fetch = (input, init) => d.fetch(input, { ...init, signal: AbortSignal.timeout(CROSSREF_FILL_TIMEOUT_MS) });
  void crLookupDoiV2(f, entry.doi).then((cr) => {
    if (!cr) return;
    d.fillEmpty((e) => (e as StoredEntry).pid === pid, { volume: cr.volume ?? "", issue: cr.issue ?? "", pages: cr.pages ?? "", author: cr.author ?? "" });
  }, () => {});
}

/**
 * Keeps a search result (keepEntry of resultEntry). A paper kept now has its retraction flag put in the retraction cache (an OpenAlex paper with a DOI) and, if
 * OpenAlex sent no volume, issue or pages, Crossref asked for them. A paper already kept is left as it is.
 */
export function keepResult(p: RsPaper, d: KeepResultDeps): KeepResult {
  const entry = resultEntry(p, d.style);
  const r = keepEntry(entry, d);
  if (r.state === "kept") {
    if (entry.doi && p.source === "OpenAlex") d.seedRetraction(entry.doi, !!p.retracted);
    fillFromCrossref(p, entry, r.pid, d);
  }
  return r;
}

/**
 * A pasted paper (pasteLookup's "ok") as the entry Keep stores: the entry as looked up, with the abstract (up to 4,000 characters, as resultEntry cuts it) and the open-access link
 * when the lookup brought them. Only OpenAlex brings either. It sets no citation style, as core's lookup does not: the page's own choice stays the library's.
 */
export function pastedEntry(r: Extract<PasteResult, { result: "ok" }>): StoredEntry {
  const abstract = (r.abstract ?? "").trim() ? r.abstract!.slice(0, ABSTRACT_MAX) : "";
  return { ...r.entry, ...(abstract ? { abstract } : {}), ...(r.oa ? { oa: r.oa } : {}) };
}

/** What a kept paper is made of for Undo: the citation's fields, the reading-list mark, the abstract and the link. Anything else on an entry is the app's own bookkeeping. */
const KEPT_FIELDS: ReadonlyArray<keyof StoredEntry> = [
  "author", "year", "title", "source", "volume", "issue", "pages", "doi", "url", "month", "day", "accessed", "container", "editors", "number", "degree", "type", "style", "lang",
  "rl", "abstract", "oa"
];
/** Whether two entries are the same kept paper in every field the student sees or edits (an empty field and an absent one are the same). */
const sameKept = (a: StoredEntry, b: StoredEntry): boolean => KEPT_FIELDS.every((k) => (a[k] ?? "") === (b[k] ?? ""));

/**
 * Undo of a keep (the paste box's "Kept: {title}" line): takes the entry `added`, as keepEntry stored it with its pid, out of the library, but only while the library still holds
 * exactly that entry (sameKept). "changed": the entry is there and is not as it was kept (the student edited it, or another window did), so it stays. "gone": no entry has that
 * pid any more, so there is nothing to remove. A field the app adds to an entry later in the background does not count as a change. The copy shown is checked first, so a
 * "changed" or "gone" writes nothing; the stored entries are checked again inside the update. Like keepEntry it needs a library that has been read, or it throws.
 */
export function undoKeep(added: StoredEntry, d: KeepDeps): "removed" | "changed" | "gone" {
  if (!libraryRead(d)) throw new Error("Undo needs a library that has been read.");
  const shown = d.lib.find((l) => l.pid === added.pid);
  if (!shown) return "gone";
  if (!sameKept(shown, added)) return "changed";
  const seen: { state?: "removed" | "changed" | "gone" } = {};
  const took = d.update((prev) => {
    const at = prev.find((l) => l.pid === added.pid);
    if (!at) { seen.state = "gone"; return prev; }
    if (!sameKept(at, added)) { seen.state = "changed"; return prev; }
    seen.state = "removed";
    return prev.filter((l) => l !== at);
  });
  if (!took) throw new Error("The library did not take the change.");
  return seen.state ?? "removed";
}
