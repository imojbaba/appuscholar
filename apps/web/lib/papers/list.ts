import { citKind, citNames } from "@appuscholar/core";
import type { ApNote, ApNotes, ShelfIndex, ShelfPaper, StoredEntry } from "@/lib/blobs/kinds";
import { noteKey } from "./ids";

/*
 * The Reading list's one list of kept papers (wave B Task 21a; register row D-S2-126). A kept paper is a library entry that is on the reading list, with the PDF text the student added
 * for it (a reading-list entry with the same `pid`) and the note kept for it (`p:<pid>`, lib/papers/ids). Some papers have only a PDF: the student added it and it matched no kept paper.
 * The home's "Papers kept" and the Reading list tab's count are this list's length (ruling B2-R23).
 */

type T = (key: string, vars?: Record<string, string | number>) => string;

/** A reading-list entry and, once its blob has been read, its text, highlights and cells (lib/shelf/actions' ShelfItem is one; the bare index entry is too). */
export type ListedShelf = ShelfIndex[number] & { paper?: ShelfPaper | null };

/**
 * One kept paper. `pid` is the id the library entry, the reading-list entry and the note share; it is "" while neither has been through the paper-id migration (which gives every
 * entry one: a locked, broken or busy run leaves some without), and then the paper has no note. `entry` is null for a paper only the reading list has; `shelf` is null for a paper
 * with no PDF.
 */
export type Paper = { pid: string; entry: StoredEntry | null; shelf: ListedShelf | null; note: ApNote | null };

/**
 * The kept papers: the library's entries that are on the reading list (`rl` is not false), in library order, each with the reading-list entry of its pid and its note; then the
 * reading-list entries no listed paper took, by date added (v1's order). An entry with `rl` false is listed only once a PDF is attached to it, since adding the PDF puts it on the
 * list. A second reading-list entry with the pid of a paper already listed (two PDFs of one paper) is a row of its own, so nothing is hidden. `notes` null (not read) gives no notes.
 */
export function papersOf(lib: StoredEntry[], index: ListedShelf[], notes: ApNotes | null): Paper[] {
  const byPid = new Map<string, ListedShelf>();
  for (const s of index) if (s.pid && !byPid.has(s.pid)) byPid.set(s.pid, s);
  const noteOf = (pid: string): ApNote | null => (pid && notes ? notes[noteKey(pid)] ?? null : null);
  const taken = new Set<ListedShelf>();
  const out: Paper[] = [];
  for (const entry of lib) {
    const pid = entry.pid ?? "";
    const shelf = pid ? byPid.get(pid) ?? null : null;
    if (entry.rl === false && !shelf) continue;
    if (shelf) taken.add(shelf);
    out.push({ pid, entry, shelf, note: noteOf(pid) });
  }
  const rest = index.filter((s) => !taken.has(s)).sort((a, b) => (a.added < b.added ? -1 : a.added > b.added ? 1 : 0));
  for (const shelf of rest) out.push({ pid: shelf.pid ?? "", entry: null, shelf, note: noteOf(shelf.pid ?? "") });
  return out;
}

const WORDS = 4;

/**
 * A row's first line (canvas Read): "{Surname}, {year}: {the first four words of the title, in lower case}"; with two authors "{A} and {B}, {year}: ...", with three or more
 * "{A} et al., {year}: ...". What the paper does not have is left out; a paper with no author and no year is its title, and one with no title is "Untitled paper".
 */
export function paperShort(p: Paper, t: T): string {
  const title = (p.entry?.title ?? p.shelf?.title ?? "").trim();
  const last = citNames(p.entry?.author).map((n) => n.last).filter(Boolean);
  const who = last.length === 0 ? "" : last.length === 1 ? last[0]! : last.length === 2 ? t("rl_names_two", { a: last[0]!, b: last[1]! }) : t("rl_names_many", { a: last[0]! });
  const head = [who, (p.entry?.year ?? "").trim()].filter(Boolean).join(", ");
  if (!head) return title || t("rl_untitled");
  const words = title.split(/\s+/).filter(Boolean).slice(0, WORDS).join(" ").toLowerCase().replace(/[,;:.]+$/, "");
  return words ? head + ": " + words : head;
}

/** Whether the student has written their own take on the paper: the take of Read (Task 28), or the words of a stage of Analyse a paper. */
const hasTake = (n: ApNote | null): boolean =>
  !!n && ((n.take ?? "").trim() !== "" || Object.values(n.stages).some((s) => (s.mine ?? "").trim() !== ""));

/** The highlights a paper has: the passages the student saved, not the lines kept before an AI summary (they have no quote). */
export const highlightCount = (p: Paper): number => p.shelf?.paper?.notes.filter((x) => x.quote).length ?? 0;

/**
 * A row's second line (canvas Read), its parts joined with ". ": "Reading. {n} highlights" when the paper has highlights ("Reading" when only the student's take), else "Not read yet"
 * (a book is reference only and is never "not read yet"); "No PDF" when the reading list holds no text for it and it is not a book, "Book. Reference only" when its type is Book;
 * "Authors missing" when the entry has no author. A paper only the reading list has has no entry, so no author to miss.
 */
export function paperStatus(p: Paper, t: T): string {
  const book = !!p.entry && citKind(p.entry.type) === "book";
  const n = highlightCount(p);
  const parts: string[] = [];
  if (n > 0) parts.push(t(n === 1 ? "rl_status_reading_1" : "rl_status_reading_n", { n }));
  else if (hasTake(p.note)) parts.push(t("rl_status_reading"));
  else if (!book) parts.push(t("rl_status_unread"));
  if (book) parts.push(t("rl_status_book"));
  else if (!p.shelf) parts.push(t("rl_status_nopdf"));
  if (p.entry && !(p.entry.author ?? "").trim()) parts.push(t("rl_status_noauthors"));
  return parts.join(". ");
}
