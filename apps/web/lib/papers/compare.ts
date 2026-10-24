import { AP_COLS, apAcrossCols, citNames, pdCsv, SHELF_DEFAULT_COLS, type RsPaper } from "@appuscholar/core";
import type { ApNote, StoredEntry } from "@/lib/blobs/kinds";
import { paperShort, type Paper } from "./list";

/*
 * Compare's table (wave B Task 22; register row D-S2-128): one row per kept paper, its columns the matrix columns (`shelf_cols`, v1's three when none are stored) and then the paper
 * card's fields the student chose (`ap_cols`). The cells are the paper's note, `notes[p:<pid>]`: `cells[column]` for a matrix column, `card[field]` for a card field, so the table, the
 * paper card in Analyse a paper and the export all read one place, by the paper's id (lib/papers/ids). This module is the model and nothing else: the screen is
 * components/literature/CompareTab, the export's file is built here too (compareCsv), so what goes out is the table that is on screen.
 */

type T = (key: string, vars?: Record<string, string | number>) => string;

/** The paper card's fields Compare can show, in the order of its columns. `notes` is the card's "My notes" box, a key `ap_cols` did not have in v1. */
export const CARD_FIELDS = ["strengths", "weak", "verdict", "notes"] as const;
export type CardField = (typeof CARD_FIELDS)[number];
const isCardField = (k: string): k is CardField => (CARD_FIELDS as readonly string[]).includes(k);
const isString = (v: unknown): v is string => typeof v === "string";
const same = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/** The list `ap_cols` reads as when nothing is stored (core's apAcrossCols): the old cards table's default columns. */
const DEFAULT_AP_COLS: readonly string[] = apAcrossCols(null);

/**
 * Which card fields the table shows (ruling B2-R25): the keys of `ap_cols` that are card fields, in the card's order. `ap_cols` keeps core's AP_COLS keys (and "notes"), so a list
 * that is empty, or is core's default list (what a student who only ever opened the old cards table has), has chosen nothing and shows all four.
 */
export function cardColsOf(stored: unknown): CardField[] {
  const list = Array.isArray(stored) ? stored.filter(isString) : [];
  if (list.length === 0 || same(list, DEFAULT_AP_COLS)) return [...CARD_FIELDS];
  return CARD_FIELDS.filter((k) => list.includes(k));
}

/**
 * The `ap_cols` list after a card field is ticked or unticked in Choose columns. The stage columns the list already holds stay as they are (the export's paper-cards.csv still reads
 * them: apAcrossCols drops "notes"), the card fields chosen follow in AP_COLS order with "notes" last. A result that would read wrongly is not stored as it is: [] and core's default
 * list both mean "all four", so a list that has no card field left holds "design" in their place, and one that would be the default list loses its first key.
 */
export function toggleCardCol(stored: unknown, k: CardField, on: boolean): string[] {
  const shown = new Set<string>(cardColsOf(stored));
  if (on) shown.add(k); else shown.delete(k);
  const list = Array.isArray(stored) ? stored.filter(isString) : [];
  const keys = new Set([...(list.length ? list : DEFAULT_AP_COLS).filter((x) => !isCardField(x)), ...shown]);
  const next = [...AP_COLS.map(([x]) => x).filter((x) => keys.has(x)), ...(keys.has("notes") ? ["notes"] : [])];
  if (next.length === 0) return ["design"];
  return same(next, DEFAULT_AP_COLS) ? next.slice(1) : next;
}

/** v1's three default matrix columns (SHELF_DEFAULT_COLS) are the cells' keys and the CSV's headings in every language; the table shows them through these keys. */
const MATRIX_LABEL: Record<string, string> = Object.fromEntries(SHELF_DEFAULT_COLS.map((c, i) => [c, ["sh2_sample", "sh2_method", "sh2_key_finding"][i]!]));
/** The card fields' column names: v1's "Strengths" and "My verdict", and the canvas's "Weak points" and "Notes". */
const CARD_LABEL: Record<CardField, string> = { strengths: "ap2_strengths", weak: "cmp_col_weak", verdict: "ap2_my_verdict", notes: "cmp_col_notes" };

/** A matrix column's name as the table shows it: v1's defaults through the copy, a column the student named as they typed it. */
export const matrixLabel = (t: T, col: string): string => (MATRIX_LABEL[col] ? t(MATRIX_LABEL[col]!) : col);
/** A card field's column name. */
export const cardLabel = (t: T, k: CardField): string => t(CARD_LABEL[k]);

/** `kind` "cell": `cells[key]` of the note; "card": `card[key]`. `id` is unique within the table (a matrix column may be named like a card field). */
export type CompareColumn = { id: string; kind: "cell" | "card"; key: string; label: string };
/**
 * One paper of the table. `key` is the pid (or a place in the list for a paper that has none yet); `values` are the cells in the columns' order; `writable` is false for a paper with no pid
 * yet, which has no note to write to (the paper-id migration gives every paper one). `paper` is the Reading list's paper, for the entry (its abstract) and the shelf entry.
 */
export type CompareRow = { key: string; pid: string; paper: Paper; short: string; title: string; values: string[]; writable: boolean };
export type CompareTable = { columns: CompareColumn[]; rows: CompareRow[] };

/** What a paper's note holds in a column: `cells[key]` for a matrix column, `card[key]` for a card field; "" when it holds nothing there (or a value that is not text). */
export function cellOf(note: ApNote | null, c: Pick<CompareColumn, "kind" | "key">): string {
  const v = c.kind === "cell" ? note?.cells?.[c.key] : note?.card?.[c.key];
  return typeof v === "string" ? v : "";
}

/** A paper's full title: the library entry's, else its reading-list entry's, else "Untitled paper". */
export const paperTitle = (p: Paper, t: T): string => (p.entry?.title ?? p.shelf?.title ?? "").trim() || t("rl_untitled");

/**
 * The table of `papers` (papersOf: every paper of the Reading list in its order, ruling B2-R24, so a first cell can be typed for any of them). A second reading-list entry with the pid of
 * a paper already listed (two PDFs of one paper) shares its note, so it is not a row of its own. A cell the note does not have is "".
 */
export function compareTable(papers: Paper[], matrixCols: readonly string[], cardCols: readonly CardField[], t: T): CompareTable {
  const columns: CompareColumn[] = [
    ...matrixCols.map((c) => ({ id: "cell:" + c, kind: "cell" as const, key: c, label: matrixLabel(t, c) })),
    ...cardCols.map((k) => ({ id: "card:" + k, kind: "card" as const, key: k, label: cardLabel(t, k) }))
  ];
  const seen = new Set<string>();
  const rows: CompareRow[] = [];
  papers.forEach((p, i) => {
    if (p.pid) { if (seen.has(p.pid)) return; seen.add(p.pid); }
    rows.push({ key: p.pid || "i" + i, pid: p.pid, paper: p, short: paperShort(p, t), title: paperTitle(p, t), values: columns.map((c) => cellOf(p.note, c)), writable: !!p.pid });
  });
  return { columns, rows };
}

/**
 * The export's compare/table.csv (ruling B2-R27): the table on screen, v1's way (the matrix columns under the names they are stored by, which are v1's headings; the card fields under
 * the copy's), for the papers that have words in a column shown (ruling B2-R24: the screen lists every paper so a first cell can be typed, the file only the ones that have one).
 * Null when none has: a part with nothing in it writes no file.
 */
export function compareCsv(table: CompareTable, paperHead: string): string | null {
  const rows = table.rows.filter((r) => r.values.some((v) => v.trim() !== ""));
  if (!rows.length) return null;
  return pdCsv([paperHead, ...table.columns.map((c) => (c.kind === "cell" ? c.key : c.label))], rows.map((r) => [r.title, ...r.values]));
}

/**
 * The paper the literature review and gap prompts read, from a kept paper's library entry: `authors` is a search result's card line (every name as "First Last", four and "et al.",
 * or v1's "Unknown authors"), `authorList` every name, the abstract the entry stored (up to 4,000 characters), the DOI, and `retracted` when the project's retraction check flagged it
 * (rsCorpusText then tells the AI so). The entry holds no `source` of a search result's kind ("OpenAlex", "PubMed"), so it is "" and the journal is the `venue`.
 */
export function rsPaperFromEntry(e: StoredEntry, retracted = false): RsPaper {
  const names = citNames(e.author).map((n) => (n.org || !n.first ? n.last : n.first + " " + n.last));
  const abstract = (e.abstract ?? "").trim();
  return {
    title: e.title || "Untitled",
    authors: names.length > 4 ? names.slice(0, 4).join(", ") + ", et al." : names.join(", ") || "Unknown authors",
    authorList: names,
    year: e.year ?? "",
    venue: e.source || e.container || "",
    doi: e.doi ?? "",
    url: e.url,
    source: "",
    ...(abstract ? { abstract: e.abstract } : {}),
    ...(retracted ? { retracted: true } : {})
  };
}
