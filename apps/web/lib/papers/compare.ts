import { AP_COLS, apAcrossCell, apAcrossCols, citNames, pdCsv, SHELF_DEFAULT_COLS, type RsPaper } from "@appuscholar/core";
import { colLabel } from "@/lib/analyse/cards";
import type { ApNote, StoredEntry } from "@/lib/blobs/kinds";
import { paperShort, type Paper } from "./list";

/*
 * Compare's table (wave B Task 22; register row D-S2-128): one row per kept paper, its columns the matrix columns (`shelf_cols`, v1's three when none are stored), then the student's
 * own walk-through answers (the stage keys of `ap_cols`, as the old cards table chose them: ruling B2-R40), then the paper card's fields the student chose (`ap_cols`). The cells are
 * the paper's note, `notes[p:<pid>]`: `cells[column]` for a matrix column, `card[field]` for a card field, and `stages[stage].mine` for a walk-through answer (written in Analyse a paper,
 * read-only here), so the table, the paper card in Analyse a paper and the export all read one place, by the paper's id (lib/papers/ids). This module is the model and nothing else: the
 * screen is components/literature/CompareTab, the export's file is built here too (compareCsv), so what goes out is the table that is on screen.
 */

type T = (key: string, vars?: Record<string, string | number>) => string;

/** The paper card's fields Compare can show, in the order of its columns. `notes` is the card's "My notes" box, a key `ap_cols` did not have in v1. */
export const CARD_FIELDS = ["strengths", "weak", "verdict", "notes"] as const;
export type CardField = (typeof CARD_FIELDS)[number];
const isString = (v: unknown): v is string => typeof v === "string";
const same = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/** The list `ap_cols` reads as when nothing is stored (core's apAcrossCols): the old cards table's default columns. */
const DEFAULT_AP_COLS: readonly string[] = apAcrossCols(null);
/** AP_COLS' keys that are the paper card's own fields; the others are the walk-through's stages. */
const CARD_AP_KEYS: readonly string[] = ["strengths", "weak", "verdict"];
/** The walk-through's stage keys, the old cards table's columns that are not card fields, in AP_COLS order: design, sample, measures, stats, results, limits. */
export const STAGE_FIELDS: readonly string[] = AP_COLS.map(([k]) => k).filter((k) => !CARD_AP_KEYS.includes(k));
const isStageField = (k: string): boolean => STAGE_FIELDS.includes(k);
/** A key's place in `ap_cols`: AP_COLS' order, "notes" after them; a key outside both has none. */
const rank = (k: string): number => (k === "notes" ? AP_COLS.length : AP_COLS.findIndex(([x]) => x === k));

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
 * Which walk-through stages the table shows (ruling B2-R40): the stage keys of `ap_cols` as the old cards table chose them, which is core's apAcrossCols (the stored keys in the stored order,
 * keys outside AP_COLS dropped, the default list when none is stored) without the card fields. So four by default: design, sample, measures and stats.
 */
export const stageColsOf = (stored: unknown): string[] => apAcrossCols(stored).filter(isStageField);

/**
 * The `ap_cols` list after one key is ticked or unticked in Choose columns, or null when the list could not say what was chosen. A list that is empty, or is core's default list, reads as
 * "nothing chosen" (four stages, all four card fields), so it is first written out as it reads; then only that one key is put in its place or taken out, and every other key stays as
 * the student left it, a stage column as much as a card field (the paper-cards.csv in the export reads the same list: apAcrossCols). Two results cannot be told from "nothing chosen"
 * when read back, so they are not stored: no key at all (that is `[]`), and the four default stages with My verdict alone (that is core's default list, which shows all four card fields).
 */
function toggleKey(stored: unknown, key: string, on: boolean): string[] | null {
  const list = Array.isArray(stored) ? stored.filter(isString) : [];
  const chosen = list.length === 0 || same(list, DEFAULT_AP_COLS) ? [...stageColsOf(list), ...cardColsOf(list)].sort((x, y) => rank(x) - rank(y)) : list;
  let next: string[];
  if (!on) next = chosen.filter((x) => x !== key);
  else if (chosen.includes(key)) next = chosen;
  else {
    // In its place among the keys that have one; a key the list holds that is outside AP_COLS does not move it.
    const at = chosen.findIndex((x) => rank(x) > rank(key));
    next = at < 0 ? [...chosen, key] : [...chosen.slice(0, at), key, ...chosen.slice(at)];
  }
  return next.length === 0 || same(next, DEFAULT_AP_COLS) ? null : next;
}
/** `ap_cols` after a card field is ticked or unticked (see toggleKey): the stage keys stay exactly as the student chose them. */
export const toggleCardCol = (stored: unknown, k: CardField, on: boolean): string[] | null => toggleKey(stored, k, on);
/** `ap_cols` after a walk-through stage is ticked or unticked (see toggleKey): the card fields stay exactly as they are. */
export const toggleStageCol = (stored: unknown, k: string, on: boolean): string[] | null => (isStageField(k) ? toggleKey(stored, k, on) : null);

/** v1's three default matrix columns (SHELF_DEFAULT_COLS) are the cells' keys and the CSV's headings in every language; the table shows them through these keys. */
const MATRIX_LABEL: Record<string, string> = Object.fromEntries(SHELF_DEFAULT_COLS.map((c, i) => [c, ["sh2_sample", "sh2_method", "sh2_key_finding"][i]!]));
/** The card fields' column names: v1's "Strengths" and "My verdict", and the canvas's "Weak points" and "Notes". */
const CARD_LABEL: Record<CardField, string> = { strengths: "ap2_strengths", weak: "cmp_col_weak", verdict: "ap2_my_verdict", notes: "cmp_col_notes" };

/** A matrix column's name as the table shows it: v1's defaults through the copy, a column the student named as they typed it. */
export const matrixLabel = (t: T, col: string): string => (MATRIX_LABEL[col] ? t(MATRIX_LABEL[col]!) : col);
/** A card field's column name. */
export const cardLabel = (t: T, k: CardField): string => t(CARD_LABEL[k]);

/**
 * `kind` "cell": `cells[key]` of the note; "card": `card[key]`; "stage": the student's own walk-through answer, `stages[key].mine` (read-only here). `id` is unique within the table (a
 * matrix column may be named like a card field or a stage). `label` is the heading; `aria` is what a cell is labelled with after the paper's name (W19): the heading, and for a
 * walk-through column "(from your walk-through)", since the stage "Sample" and the matrix's own "Sample" are two columns a screen reader must tell apart. `note` is the line under a
 * walk-through column's heading.
 */
export type CompareColumn = { id: string; kind: "cell" | "card" | "stage"; key: string; label: string; aria: string; note?: string };
/**
 * One paper of the table. `key` is the pid (or a place in the list for a paper that has none yet); `values` are the cells in the columns' order; `writable` is false for a paper with no pid
 * yet, which has no note to write to (the paper-id migration gives every paper one). `paper` is the Reading list's paper, for the entry (its abstract) and the shelf entry.
 */
export type CompareRow = { key: string; pid: string; paper: Paper; short: string; title: string; values: string[]; writable: boolean };
export type CompareTable = { columns: CompareColumn[]; rows: CompareRow[] };

/**
 * What a paper's note holds in a column: `cells[key]` for a matrix column, `card[key]` for a card field, the stage's own words (core's apAcrossCell, as the old cards table read
 * them) for a walk-through column; "" when it holds nothing there (or a value that is not text).
 */
export function cellOf(note: ApNote | null, c: Pick<CompareColumn, "kind" | "key">): string {
  if (c.kind === "stage") return note ? apAcrossCell(note, c.key, false) : "";
  const v = c.kind === "cell" ? note?.cells?.[c.key] : note?.card?.[c.key];
  return typeof v === "string" ? v : "";
}

/** A paper's full title: the library entry's, else its reading-list entry's, else "Untitled paper". */
export const paperTitle = (p: Paper, t: T): string => (p.entry?.title ?? p.shelf?.title ?? "").trim() || t("rl_untitled");

/**
 * The table of `papers` (papersOf: every paper of the Reading list in its order, ruling B2-R24, so a first cell can be typed for any of them): the matrix columns, then the
 * walk-through `stageCols` (ruling B2-R40), then the card fields. A second reading-list entry with the pid of a paper already listed (two PDFs of one paper) shares its note, so it is not a
 * row of its own. A cell the note does not have is "".
 * `legacyCells`: the cells a paper still has on its reading-list copy (the shelf paper's `cells`, which Compare no longer writes). Where a paper's note has no `cells` key at all (ruling
 * B2-R7: the paper-id migration has not taken them yet) a matrix column shows them; a note that has `cells`, even none, is the paper's word. Only the export asks (the screen reads notes).
 */
export function compareTable(
  papers: Paper[], matrixCols: readonly string[], stageCols: readonly string[], cardCols: readonly CardField[], t: T, legacyCells?: (p: Paper) => Record<string, unknown> | undefined
): CompareTable {
  const columns: CompareColumn[] = [
    ...matrixCols.map((c) => ({ id: "cell:" + c, kind: "cell" as const, key: c, label: matrixLabel(t, c), aria: matrixLabel(t, c) })),
    ...stageCols.map((k) => ({ id: "stage:" + k, kind: "stage" as const, key: k, label: colLabel(t, k), aria: t("cmp_stage_aria", { name: colLabel(t, k) }), note: t("cmp_stage_note") })),
    ...cardCols.map((k) => ({ id: "card:" + k, kind: "card" as const, key: k, label: cardLabel(t, k), aria: cardLabel(t, k) }))
  ];
  const seen = new Set<string>();
  const rows: CompareRow[] = [];
  papers.forEach((p, i) => {
    if (p.pid) { if (seen.has(p.pid)) return; seen.add(p.pid); }
    const old = p.note?.cells === undefined ? legacyCells?.(p) : undefined;
    const values = columns.map((c) => {
      const v = c.kind === "cell" && old ? old[c.key] : undefined;
      return typeof v === "string" ? v : cellOf(p.note, c);
    });
    rows.push({ key: p.pid || "i" + i, pid: p.pid, paper: p, short: paperShort(p, t), title: paperTitle(p, t), values, writable: !!p.pid });
  });
  return { columns, rows };
}

/**
 * The export's compare/table.csv (ruling B2-R27): the table on screen, v1's way (the matrix columns under the names they are stored by, which are v1's headings; the card fields under
 * the copy's), for the papers that have words in a column shown (ruling B2-R24: the screen lists every paper so a first cell can be typed, the file only the ones that have one).
 * The walk-through columns are on screen only: the answers go out in compare/paper-cards.csv, which has always carried them, so they are neither columns of this file nor a reason for a row.
 * Null when no paper has a word: a part with nothing in it writes no file.
 */
export function compareCsv(table: CompareTable, paperHead: string): string | null {
  const shown = table.columns.map((c, i) => [c, i] as const).filter(([c]) => c.kind !== "stage");
  const rows = table.rows.filter((r) => shown.some(([, i]) => r.values[i]!.trim() !== ""));
  if (!rows.length) return null;
  return pdCsv([paperHead, ...shown.map(([c]) => (c.kind === "cell" ? c.key : c.label))], rows.map((r) => [r.title, ...shown.map(([, i]) => r.values[i]!)]));
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
