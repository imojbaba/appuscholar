import { apLoadRefusal, retrNormDoi } from "@appuscholar/core";
import { keptAbstractPages } from "@/lib/analyse/intake";
import { placeHref } from "@/lib/frame/places";
import { papersOf, paperWho, type ListedShelf, type Paper } from "@/lib/papers/list";
import type { ApNotes, StoredEntry } from "@/lib/blobs/kinds";

/*
 * What the reader (wave B Task 27; components/reader) knows about a paper before it is open: which address names it, which tab is open, what text it has, and the words of the line under its
 * title. The reader's data is the Reading list's: `papersOf` joins the library, the reading list and the notes by the paper's id, so a paper is found by `pid` exactly as a row of the list is.
 */

type T = (key: string, vars?: Record<string, string | number>) => string;

/** The practice paper's address segment: `/p/<id>/lit/reading/sample`. It is not a kept paper; the reader loads v1's fictional paper (fromSample) and its notes stay under v1's id. */
export const PRACTICE_PID = "sample";
/** A pasted text's address segment: `/p/<id>/lit/reading/pasted`. The text is in this tab's memory only (as v1 keeps it) and its notes are under v1's `a...` id; it is not on the list. */
export const PASTED_PID = "pasted";

/** The reader's tabs, in the order they are drawn. The key is what `?tab=` holds. */
export const READER_TABS = ["take", "ask", "numbers", "walk", "card", "highlights"] as const;
export type ReaderTab = (typeof READER_TABS)[number];
/** The tab a paper opens on: the student's own take comes first. */
export const DEFAULT_READER_TAB: ReaderTab = "take";

/** The tab `?tab=` names; anything else (no value, a tab that does not exist) is the default. */
export function readerTabOf(raw: string | null | undefined): ReaderTab {
  return (READER_TABS as readonly string[]).includes(raw ?? "") ? (raw as ReaderTab) : DEFAULT_READER_TAB;
}

/** The address of the reader on a paper: `/p/<project>/lit/reading/<pid>`, with the open tab and page when they are given (the default tab and the first page are left out). */
export function readerHref(projectId: string, pid: string, o: { tab?: ReaderTab; page?: number } = {}): string {
  const q = new URLSearchParams();
  if (o.tab && o.tab !== DEFAULT_READER_TAB) q.set("tab", o.tab);
  if (o.page && o.page > 1) q.set("page", String(o.page));
  const qs = q.toString();
  return placeHref(projectId, "lit", "reading") + "/" + encodeURIComponent(pid) + (qs ? "?" + qs : "");
}

/** The page `?page=` names: a whole number from 1; anything else is the first page. */
export function readerPageOf(raw: string | null | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** The tab and the page the address names (`?tab=` and `?page=`): useSearchParams' value, or any object with a `get`. */
export function readerQueryOf(params: { get(name: string): string | null }): { tab: ReaderTab; page: number } {
  return { tab: readerTabOf(params.get("tab")), page: readerPageOf(params.get("page")) };
}

/** The kept paper with this id, as a row of the Reading list has it (its library entry, its reading-list entry with its text once read, its note); undefined when none is on the list. */
export function keptPaper(pid: string, lib: StoredEntry[], index: ListedShelf[], notes: ApNotes | null): Paper | undefined {
  return pid ? papersOf(lib, index, notes).find((p) => p.pid === pid) : undefined;
}

/**
 * Where a paper's text comes from. "pdf": the text of a PDF the student added; "epmc": open-access full text Europe PMC gave (Task 21b stores it as the paper's reading-list text and marks the
 * entry `src: "epmc"`); "abstract": only the abstract Keep stored, long enough to read; "none": nothing to read yet.
 */
export type TextKind = "pdf" | "epmc" | "abstract" | "none";

/** Whether the reading-list entry's text is Europe PMC's (Task 21b's loose field on the entry). */
export const fromEuropePmc = (s: ListedShelf | null): boolean => !!s && s.src === "epmc";

export function textKindOf(p: Paper): TextKind {
  if (p.shelf) return fromEuropePmc(p.shelf) ? "epmc" : "pdf";
  return apLoadRefusal(keptAbstractPages(p.entry), "abstract") ? "none" : "abstract";
}

/** The line under the title, without its page (canvas Read): "{authors}, {year}, {journal}." with what the paper does not have left out; empty when it has none of them. */
export function readerBy(p: Paper, t: T): string {
  const journal = (p.entry?.source ?? p.entry?.container ?? "").trim();
  const parts = [paperWho(p, t), (p.entry?.year ?? "").trim(), journal].filter(Boolean);
  return parts.length ? parts.join(", ") + "." : "";
}

/** The paper's own page on the web: its DOI's address, else the web address the entry has, else none (no PDF is stored to open). */
export function paperPageUrl(p: Paper): string {
  const doi = retrNormDoi(p.entry?.doi ?? p.shelf?.doi ?? "");
  if (doi) return "https://doi.org/" + doi.split("/").map(encodeURIComponent).join("/");
  const url = (p.entry?.url ?? "").trim();
  return /^https?:\/\//i.test(url) ? url : "";
}
