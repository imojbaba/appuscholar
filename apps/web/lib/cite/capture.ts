import { captureMatch, captureRecordV2, captureYearV2, decodeCapture, type CaptureData, type CitationEntry } from "@appuscholar/core";
import type { StoredEntry } from "@/lib/blobs/kinds";
import { paperMatch } from "@/lib/papers/ids";
import { keepEntry, libraryRead, type KeepDeps } from "@/lib/papers/keep";
import type { Library } from "./useLibrary";
import { fillEmptyIn } from "./fillEmpty";

/*
 * The one-click capture (v1 "Zotero-lite", citSetupBookmarklet 13622-13636, citCheckCaptureHash 13637-13655, called at boot 13676-13677). The bookmark, dragged to the bookmarks
 * bar, reads the citation_* meta tags of the page it is clicked on and opens this app at `/add#capture=<base64 JSON>`; nothing goes to a server (the hash never leaves the browser).
 * The bookmarklet's source, the decode, the entry and the duplicate rule are core's (citcapture.ts); this module reads the address and files the paper. Held to v1 running by
 * test/golden/citshare.
 * Fix wave A (walk fault W1, register row D-S2-23): the bookmarklet reads PubMed's `citation_authors`, the volume, the issue and the pages, the entry is captureRecordV2, and a capture
 * whose title is in the library without an author fills that entry's empty fields in place of adding a second one.
 * Walk fault W30 (register row D-S2-37): a year that is not four digits (an old bookmark's "09/1") is dropped from the facts and the entry (captureYearV2).
 * Wave B Task 20 (register row D-S2-125, walk faults W5, W6, W13): the bookmark opens the adding screen (components/literature/AddingPaper.tsx), not the workspace. That screen shows
 * the paper before anything else and files it with Task 18's keepEntry, so a paper kept from the bookmark joins the library and the reading list as any Keep does; v1's confirm
 * question and its two toasts are gone with the workspace tab. The address is read, not rewritten: a reload shows the same paper, and keeping it twice says it is already kept.
 */

export const CAPTURE_PREFIX = "#capture=";

/** What the adding screen has in its address: nothing to add, a payload that cannot be read (or has no title), or the paper with the entry a Keep would store. */
export type CaptureRead = { kind: "none" } | { kind: "unreadable" } | { kind: "paper"; data: CaptureData; entry: CitationEntry };

/**
 * Reads the address's hash (`location.hash`). A hash that is not `#capture=...` is nothing to add. A payload that is not base64 JSON, or has no title, is unreadable (v1 alerted the
 * first, 13653, and returned quietly for the second, 13647). The year of the facts and of the entry is a four-digit year or nothing (W30). The hash is left in the address.
 */
export function readCapture(hash: string): CaptureRead {
  if (hash.indexOf(CAPTURE_PREFIX) !== 0) return { kind: "none" };
  const d = decodeCapture(hash.slice(CAPTURE_PREFIX.length));
  if (!d || !d.title) return { kind: "unreadable" };
  const data: CaptureData = { ...d, year: captureYearV2(d.year) };
  return { kind: "paper", data, entry: captureRecordV2(data) };
}

/** What the library gives a capture: Keep's reads and `update` (lib/papers/keep.ts), and `fillEmpty`. */
export type FileCaptureDeps = KeepDeps & Pick<Library, "fillEmpty">;
/** "kept": the paper was not in the project and is now (and on its reading list). "already": it was; `filled` says some of its empty fields were filled from the capture. */
export type CaptureFiled = { state: "kept" | "already"; filled: boolean };

/**
 * Files a captured paper through keepEntry (Task 18: the DOI decides when both have one, else the same long title and year; so "Smith JA" and "Smith, JA" captures of one paper are
 * one). Before keepEntry, wave A's rule still applies, as ruling B2-R15 says it must not regress (W1): v1's duplicate (the same title and the same author) and the same title with
 * no author on file count as the paper already kept, whatever its year (an entry the student gave another year by hand, or v1 saved as "09/1"). When the paper is already kept, its
 * empty fields are filled from the capture (the authors, volume, issue, pages, source), by useLibrary().fillEmpty, which writes nothing over a field that has text; `filled` is true
 * only when that changed something. Throws, before it changes anything, when the library has not been read (loading, locked, broken, a failed read) or will not take the paper.
 */
export function fileCapture(rec: CitationEntry, d: FileCaptureDeps): CaptureFiled {
  if (!libraryRead(d)) throw new Error("Keep needs a library that has been read.");
  const m = captureMatch(d.lib, rec);
  let inShown: (e: CitationEntry) => boolean;
  let inStored: (e: CitationEntry) => boolean;
  if (m.kind !== "new") {
    inShown = inStored = (e) => e.title === rec.title && (m.kind === "fill" ? !e.author : e.author === rec.author);
  } else {
    const r = keepEntry(rec, d);
    if (r.state === "kept") return { state: "kept", filled: false };
    // The copy shown may be from before the paper-id migration reached it (no pid yet); the stored one has the pid keepEntry answered.
    inShown = (e) => paperMatch(rec, e);
    inStored = (e) => (e as StoredEntry).pid === r.pid;
  }
  const filled = fillEmptyIn(d.lib, inShown, rec) !== d.lib && d.fillEmpty(inStored, rec);
  return { state: "already", filled };
}
