import { crLookupDoi, rsEntryFromResultV2, type CitationEntry, type CitationStyle, type Formatted, type RsPaper } from "@appuscholar/core";
import { putIntext } from "@/lib/cite/actions";

/*
 * A search result into the Citation Library (v1 rsAddToLibrary 8471-8483, rsInsertCitation 8486-8491): the entry is core's rsEntryFromResult in the
 * library's style; a result whose title is already in the library is not added again (8475, the title only, for both buttons: Insert citation
 * saves through rsAddToLibrary too); an OpenAlex result's retraction flag seeds the library's retraction check for its DOI (8478).
 * Fix wave A (walk fault W2, register row D-S2-24): the entry is rsEntryFromResultV2 (every author, and PubMed's volume, issue and pages). OpenAlex's search sends
 * no volume, issue or pages, so after an OpenAlex paper with a DOI is added, Crossref is asked for that DOI (the DOI only, 4 s at most) and the saved entry's
 * empty fields are filled from its answer; a lookup that fails or is slow changes nothing and says nothing.
 */

/** How long "+ Citation library" waits for Crossref's volume, issue and pages before it gives up (quietly). */
export const CROSSREF_FILL_TIMEOUT_MS = 4000;

export type AddDeps = {
  lib: CitationEntry[];
  style: CitationStyle;
  /** useLibrary().update: an update, so an add made while the library is unread (a locked vault) lands on the stored entries. False when a broken library was kept. */
  update(fn: (prev: CitationEntry[]) => CitationEntry[]): boolean;
  /** retrCacheSet on the project's retraction cache. */
  seedRetraction(doi: string, flag: boolean): void;
  /** The stored library has been read (not loading, not locked): `lib` is what is stored, and an update is applied to it at once. */
  known: boolean;
  /** Reads the library (useLibrary().flush); true once it has been read and the update applied and sent. Used when `known` is false. */
  whenRead(): Promise<boolean>;
  toast(msg: string): void;
  t(key: string, vars?: Record<string, string | number>): string;
  /** The page's fetch, for the Crossref lookup (W2). */
  fetch: typeof fetch;
  /** useLibrary().fillEmpty: fills the empty fields of the first stored entry that matches. */
  fillEmpty(match: (e: CitationEntry) => boolean, fill: Partial<CitationEntry>): boolean;
};

/**
 * W2: an OpenAlex paper's entry saved with a DOI and an empty volume, issue or pages is filled from Crossref's record of that DOI (and its author, only when empty).
 * The request carries the DOI only and is aborted after CROSSREF_FILL_TIMEOUT_MS; any failure (offline, HTTP error, not in Crossref, the timeout) is swallowed.
 */
function fillFromCrossref(p: RsPaper, entry: CitationEntry, d: AddDeps): void {
  if (p.source !== "OpenAlex" || !entry.doi || (entry.volume && entry.issue && entry.pages)) return;
  const f: typeof fetch = (input, init) => d.fetch(input, { ...init, signal: AbortSignal.timeout(CROSSREF_FILL_TIMEOUT_MS) });
  void crLookupDoi(f, entry.doi).then((cr) => {
    if (!cr) return;
    d.fillEmpty((e) => e.title === entry.title, { volume: cr.volume ?? "", issue: cr.issue ?? "", pages: cr.pages ?? "", author: cr.author ?? "" });
  }, () => {});
}

/**
 * rsAddToLibrary(i, quiet): the entry saved (or the one already there) and the library with it; null when nothing could be saved.
 * The duplicate check runs on the stored library inside the update. When the panel's copy is unread (a locked vault), the toast and the
 * retraction seed wait until the library is read and say what happened there: "Already in your library" and no seed when the title was
 * stored already; nothing when the read is still declined (the update is held and re-checked at the next unlock).
 */
export function addResult(p: RsPaper, d: AddDeps, quiet = false): { entry: CitationEntry; lib: CitationEntry[] } | null {
  const entry = rsEntryFromResultV2(p, d.style);
  const dup = d.lib.find((e) => e.title === entry.title);
  if (dup) { if (!quiet) d.toast(d.t("rs2_already_in_your_library")); return { entry: dup, lib: d.lib }; }
  // Pure (the blob may apply it more than once, to a stand-in while unread): it records whether the stored library held the title.
  let stored = false;
  if (!d.update((prev) => { stored = prev.some((e) => e.title === entry.title); return stored ? prev : [...prev, entry]; })) return null;
  const done = () => {
    if (stored) { if (!quiet) d.toast(d.t("rs2_already_in_your_library")); return; }
    if (entry.doi && p.source === "OpenAlex") d.seedRetraction(entry.doi, !!p.retracted);
    if (!quiet) d.toast(p.retracted ? d.t("retr_added_warn") : d.t("rs2_added_to_citation_library_2"));
    fillFromCrossref(p, entry, d);
  };
  if (d.known) done(); else void d.whenRead().then((ok) => { if (ok) done(); }, () => {});
  return { entry, lib: [...d.lib, entry] };
}

/** rsInsertCitation: saved if new (quietly), then the in-text citation at the cursor (numbered styles take its number in the library), and v1's toast. */
export function insertResult(p: RsPaper, d: AddDeps & { insert(f: Formatted): void }): void {
  const r = addResult(p, d, true);
  if (!r) return;
  putIntext(r.entry, r.lib, d.style, d.insert);
  d.toast(p.retracted ? d.t("retr_added_warn") : d.t("rs_inserted"));
}

/** What the manual add touches: the library (as for addResult), the toasts and the copy, and `clear`, which empties the five boxes. */
export type ManualDeps = Pick<AddDeps, "lib" | "update" | "known" | "whenRead" | "toast" | "t"> & { clear(): void };

/**
 * "Add to citation library" of "➕ Add a paper you found elsewhere" (rsAddManual 8435-8454): a title is needed; the five boxes, trimmed, make v1's
 * record (type 'Journal article' and style 'apa', 8445); a record with the same title and the same author is already there (8448, title and
 * author, where the result cards check the title only); otherwise it is appended as an update, the boxes are emptied and v1's toast shown. While
 * the library is unread (a locked vault) the update checks the stored entries again, and the toast and the emptying wait for the read: "Already in
 * your library" (the boxes kept) when it was stored already, nothing while the read stays declined.
 */
export function addManual(f: { title: string; author: string; year: string; source: string; doi: string }, d: ManualDeps): void {
  const title = f.title.trim();
  if (!title) { d.toast(d.t("rs2_enter_a_title_first")); return; }
  const entry: CitationEntry = {
    author: f.author.trim(), year: f.year.trim(), title, source: f.source.trim(), volume: "", issue: "", pages: "", doi: f.doi.trim(),
    url: "", type: "Journal article", style: "apa"
  };
  const same = (e: CitationEntry) => e.title === entry.title && e.author === entry.author;
  if (d.lib.some(same)) { d.toast(d.t("rs2_already_in_your_library")); return; }
  // Pure, as in addResult: it records whether the stored library held the record.
  let stored = false;
  if (!d.update((prev) => { stored = prev.some(same); return stored ? prev : [...prev, entry]; })) return;
  const done = () => {
    if (stored) { d.toast(d.t("rs2_already_in_your_library")); return; }
    d.clear();
    d.toast(d.t("rs2_added_to_citation_library"));
  };
  if (d.known) done(); else void d.whenRead().then((ok) => { if (ok) done(); }, () => {});
}
