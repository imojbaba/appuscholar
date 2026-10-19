import { rsEntryFromResult, type CitationEntry, type CitationStyle, type Formatted, type RsPaper } from "@appuscholar/core";
import { putIntext } from "@/lib/cite/actions";

/*
 * A search result into the Citation Library (v1 rsAddToLibrary 8471-8483, rsInsertCitation 8486-8491): the entry is core's rsEntryFromResult in the
 * library's style; a result whose title is already in the library is not added again (8475, the title only, for both buttons: Insert citation
 * saves through rsAddToLibrary too); an OpenAlex result's retraction flag seeds the library's retraction check for its DOI (8478).
 */

export type AddDeps = {
  lib: CitationEntry[];
  style: CitationStyle;
  /** useLibrary().update: an update, so an add made while the library is unread (a locked vault) lands on the stored entries. False when a broken library was kept. */
  update(fn: (prev: CitationEntry[]) => CitationEntry[]): boolean;
  /** retrCacheSet on the project's retraction cache. */
  seedRetraction(doi: string, flag: boolean): void;
  toast(msg: string): void;
  t(key: string, vars?: Record<string, string | number>): string;
};

/** rsAddToLibrary(i, quiet): the entry saved (or the one already there) and the library with it; null when nothing could be saved. */
export function addResult(p: RsPaper, d: AddDeps, quiet = false): { entry: CitationEntry; lib: CitationEntry[] } | null {
  const entry = rsEntryFromResult(p, d.style);
  const dup = d.lib.find((e) => e.title === entry.title);
  if (dup) { if (!quiet) d.toast(d.t("rs2_already_in_your_library")); return { entry: dup, lib: d.lib }; }
  // Checked again on the stored library: added before it was read, a title already there is still not added twice.
  if (!d.update((prev) => (prev.some((e) => e.title === entry.title) ? prev : [...prev, entry]))) return null;
  if (entry.doi && p.source === "OpenAlex") d.seedRetraction(entry.doi, !!p.retracted);
  if (!quiet) d.toast(p.retracted ? d.t("retr_added_warn") : d.t("rs2_added_to_citation_library_2"));
  return { entry, lib: [...d.lib, entry] };
}

/** rsInsertCitation: saved if new (quietly), then the in-text citation at the cursor (numbered styles take its number in the library), and v1's toast. */
export function insertResult(p: RsPaper, d: AddDeps & { insert(f: Formatted): void }): void {
  const r = addResult(p, d, true);
  if (!r) return;
  putIntext(r.entry, r.lib, d.style, d.insert);
  d.toast(p.retracted ? d.t("retr_added_warn") : d.t("rs_inserted"));
}
