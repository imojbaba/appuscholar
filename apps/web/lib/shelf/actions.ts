import {
  shBackupBundle, shBackupFileName, shColsAdd, shColsDel, shColsOf, shMatrixCsv, shNoteId, shPaperId, shQuoteFind, shRestoreParse, shTitleGuess, type ShRecord
} from "@appuscholar/core";
import type { ShelfCols, ShelfIndex, ShelfPaper } from "@/lib/blobs/kinds";
import { PdfReaderUnavailable, type extractPdfPages } from "./extract";

/** The copy (lib/i18n t). */
export type T = (key: string, vars?: Record<string, string | number>) => string;
export type ShelfEntry = ShelfIndex[number];
/** A paper as the dialog shows it: its index entry and, once its blob is read, its text, highlights and cells. */
export type ShelfItem = ShelfEntry & { paper: ShelfPaper | null };

/** What the shelf's orchestration touches, so it can be driven with fakes. The panels compute nothing; this composes v1's steps from core's functions and the sh2_* copy. */
export type ShelfOps = {
  t: T;
  /** The papers as the index holds them now. */
  entries(): ShelfEntry[];
  /** Whether the index may be written: asks first when the stored index does not open on this device (R16). Asked before a paper is stored, so no paper is left out of the index. */
  canWriteIndex(): boolean;
  /** An update of the shelf_index blob (the update form: an entry added before the read lands on the stored ones). False when the student kept a broken index (R16). */
  updateIndex(u: (prev: ShelfIndex | null) => ShelfIndex): boolean;
  /** Stores a new paper's blob now; throws an Error whose message is the student's sentence when it cannot. */
  createPaper(id: string, paper: ShelfPaper): Promise<void>;
  /** An update of a stored paper's blob (highlights, notes, cells; a restore replaces it). False when the student kept a broken paper (R16). */
  updatePaper(id: string, u: (prev: ShelfPaper) => ShelfPaper): boolean;
  /** Sends the paper's pending save now: true once it is on the server. */
  flushPaper(id: string): Promise<boolean>;
  /** Deletes the paper's blob; true when it is gone (or was never there). */
  deletePaper(id: string): Promise<boolean>;
  /** The paper's blob, once read. */
  paper(id: string): ShelfPaper | null;
  extract(f: File): ReturnType<typeof extractPdfPages>;
  setStatus(s: string): void;
  toast(msg: string): void;
  now(): Date;
};

const EMPTY_PAPER: ShelfPaper = { pages: [], notes: [], cells: {} };
const PAPER_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * "➕ Add PDFs" (shAddFiles 11580-11599): for each file in turn, "Reading <name>…", then one sentence: not a PDF, already on the shelf (same name and size), no readable text, added
 * with its page count (and "(first 200 of N)"), or the error's message ("could not be read" when it has none). A paper is stored (its own blob, then its index entry) only once its
 * text is read; the PDF itself never is. The sentences, joined by " | ", are the status line.
 */
export async function addFiles(files: File[], d: ShelfOps): Promise<void> {
  if (!files.length || !d.canWriteIndex()) return;
  const have: Array<{ file: string; size: number }> = d.entries().map((e) => ({ file: e.file, size: e.size }));
  const msgs: string[] = [];
  for (const f of files) {
    d.setStatus(d.t("sh2_reading", { name: f.name }));
    if (!/\.pdf$/i.test(f.name)) { msgs.push(f.name + d.t("sh2_not_a_pdf")); continue; }
    if (have.some((p) => p.file === f.name && p.size === f.size)) { msgs.push(f.name + d.t("sh2_already_on_the_shelf")); continue; }
    try {
      const r = await d.extract(f);
      if (r === "not-a-pdf") { msgs.push(f.name + d.t("sh2_not_a_pdf")); continue; }
      if (r === "no-text") { msgs.push(f.name + d.t("sh2_no_readable_text_it")); continue; }
      const now = d.now();
      const id = shPaperId(now.getTime());
      await d.createPaper(id, { pages: r.pages, notes: [], cells: {} });
      const entry: ShelfEntry = { id, title: shTitleGuess(r.pages, f.name.replace(/\.pdf$/i, "")), file: f.name, size: f.size, added: now.toISOString(), total: r.total, kept: r.pages.length };
      d.updateIndex((prev) => [...(prev ?? []), entry]);
      have.push(entry);
      const n = r.pages.length;
      // f.name+': added, '+n+' pages'+(r.total>n?' (first '+n+' of '+r.total+')':'') (11594)
      msgs.push(f.name + d.t("sh2_added_pages", { pagesCount: n }) + (r.total > n ? " " + d.t("sh2_first_of", { pagesCount: n, total: r.total }) : ""));
    } catch (e) {
      const m = e instanceof PdfReaderUnavailable ? d.t("sh2_the_pdf_reader_needs") : e instanceof Error && e.message ? e.message : d.t("sh2_could_not_be_read");
      msgs.push(f.name + ": " + m);
    }
  }
  d.setStatus(msgs.join(" | "));
}

/** The title box (shRename 11621): the trimmed title, or the file name when that leaves nothing. */
export function renamePaper(id: string, value: string, d: Pick<ShelfOps, "updateIndex">): void {
  d.updateIndex((prev) => (prev ?? []).map((e) => (e.id === id ? { ...e, title: String(value).trim() || e.file } : e)));
}

/** "Remove from shelf", pressed again (shAskDel 11622-11626): the paper's blob is deleted, then its index entry. False when the blob could not be deleted (the paper stays). */
export async function removePaper(id: string, d: Pick<ShelfOps, "deletePaper" | "updateIndex">): Promise<boolean> {
  if (!(await d.deletePaper(id))) return false;
  d.updateIndex((prev) => (prev ?? []).filter((e) => e.id !== id));
  return true;
}

/**
 * "Save selected passage as a highlight" (shSaveHL 11671-11683). `selection` is the selected text when the selection starts inside the page text, else "". The quote is stored as
 * the page has it (core's shQuoteFind), with the trimmed note, the page and the time. True once saved (v1 then draws the reader again, which empties the note box).
 */
export function saveHighlight(id: string, page: number, selection: string, note: string, d: Pick<ShelfOps, "paper" | "updatePaper" | "toast" | "t" | "now">): boolean {
  const p = d.paper(id);
  if (!p) return false;
  const quote = shQuoteFind(p.pages[page - 1] || "", selection);
  if (quote === "") { d.toast(d.t("sh2_select_some_text_on")); return false; }
  if (quote === null) { d.toast(d.t("sh2_that_selection_crosses_a")); return false; }
  const now = d.now();
  const n = { id: shNoteId(now.getTime()), page, quote, note: (note || "").trim(), at: now.toISOString() };
  if (!d.updatePaper(id, (prev) => ({ ...prev, notes: [...prev.notes, n] }))) return false;
  d.toast(d.t("sh2_highlight_saved"));
  return true;
}

/** A highlight's "Delete" (shDelHL 11684). */
export function deleteHighlight(id: string, noteId: string, d: Pick<ShelfOps, "updatePaper">): void {
  d.updatePaper(id, (prev) => ({ ...prev, notes: prev.notes.filter((x) => x.id !== noteId) }));
}

/** A matrix cell (shCell 11706): stored on the paper under the column's name. */
export function setCell(id: string, col: string, value: string, d: Pick<ShelfOps, "updatePaper">): void {
  d.updatePaper(id, (prev) => ({ ...prev, cells: { ...(prev.cells || {}), [col]: value } }));
}

/** "Add column" (shColAdd 11704): nothing is stored for an empty name; `set` is the shelf_cols blob's update. */
export function addColumn(name: string, defaults: readonly string[], set: (u: (prev: ShelfCols | null) => ShelfCols) => void): void {
  if (!(name || "").trim()) return;
  set((prev) => shColsAdd(shColsOf(prev, defaults), name));
}
/** A column's "×" (shColDel 11705). Removing the last one stores [] and the defaults come back, as in v1. */
export function deleteColumn(i: number, defaults: readonly string[], set: (u: (prev: ShelfCols | null) => ShelfCols) => void): void {
  set((prev) => shColsDel(shColsOf(prev, defaults), i));
}

/** "Download as CSV" (shMatrixCsv 11707): reading_matrix.csv, v1's byte-order mark, one row per paper. */
export function downloadMatrix(items: ShelfItem[], cols: string[], d: { t: T; download(name: string, file: Blob): void }): void {
  const text = shMatrixCsv(d.t("sh2_paper"), cols, items.map((x) => ({ title: x.title, cells: x.paper?.cells })));
  d.download("reading_matrix.csv", new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
}

/** A paper as v1 stores and backs it up (11592): the index entry's fields and the blob's, in v1's order. */
export const toRecord = (x: ShelfItem & { paper: ShelfPaper }): ShRecord =>
  ({ id: x.id, title: x.title, file: x.file, size: x.size, added: x.added, pages: x.paper.pages, total: x.total, notes: x.paper.notes, cells: x.paper.cells });

/**
 * "Back up the shelf" (shBackup 11708-11713): appuscholar-shelf-YYYY-MM-DD.json holding { app: "appuscholar-shelf", v: 1, exported, papers }, the papers whose text is read, in the
 * shelf's order; then v1's count in the status line.
 */
export function backupShelf(items: ShelfItem[], d: { t: T; now(): Date; download(name: string, file: Blob): void; setStatus(s: string): void }): void {
  const papers = items.filter((x): x is ShelfItem & { paper: ShelfPaper } => x.paper !== null).map(toRecord);
  const now = d.now();
  d.download(shBackupFileName(now), new Blob([JSON.stringify(shBackupBundle(papers, now))], { type: "application/json" }));
  d.setStatus(d.t("sh2_shelf_backed_up_papers", { papersCount: papers.length }));
}

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : v == null ? fallback : String(v));
const num = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/**
 * "Restore a shelf backup" (shRestore 11714-11725): core's shRestoreParse decides ("That file is not a shelf backup."); each paper it keeps is stored as v1's shPut stores it, by id
 * (the same id replaces the paper on the shelf, another is added), then v1's count. Beyond v1, since the blob store needs them: a field the index requires and the record lacks is
 * made from what is there (the title from the file name, the counts from the pages), an id outside [A-Za-z0-9_-]{1,64} gets a new one, and the pages and notes are made strings.
 */
export async function restoreShelf(text: string, d: ShelfOps): Promise<void> {
  const list = shRestoreParse(text);
  if (!list) { d.setStatus(d.t("sh2_that_file_is_not")); return; }
  if (!d.canWriteIndex()) return;
  // v1 stores each record by id, so of two with one id the later stays; both are counted (11720).
  const last = new Map(list.map((p) => [p.id, p]));
  const occurrences = (id: string) => list.filter((p) => p.id === id).length;
  const onShelf = new Set(d.entries().map((e) => e.id));
  let n = 0;
  for (const p of last.values()) {
    const pages = p.pages.map((x) => str(x));
    const notes = (p.notes as Array<Record<string, unknown> | null>).filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .map((x) => ({ ...x, id: str(x.id), page: num(x.page, 0), quote: str(x.quote), note: str(x.note), at: str(x.at) }));
    const cells = Object.fromEntries(Object.entries(p.cells as Record<string, unknown>).map(([k, v]) => [k, str(v)]));
    const paper: ShelfPaper = { pages, notes, cells };
    const id = PAPER_ID.test(p.id) ? p.id : shPaperId(d.now().getTime());
    const file = str(p.file);
    const entry: ShelfEntry = { id, title: str(p.title, file), file, size: num(p.size, 0), added: str(p.added, d.now().toISOString()), total: num(p.total, pages.length), kept: pages.length };
    try {
      if (onShelf.has(id)) { if (!d.updatePaper(id, () => paper)) continue; }
      else await d.createPaper(id, paper);
    } catch { continue; }
    onShelf.add(id);
    d.updateIndex((prev) => { const cur = prev ?? []; return cur.some((e) => e.id === id) ? cur.map((e) => (e.id === id ? entry : e)) : [...cur, entry]; });
    n += occurrences(p.id);
  }
  d.setStatus(d.t("sh2_restored_papers", { n }));
}

export { EMPTY_PAPER };

/** A chosen file's text (shRestore reads it with a FileReader, 11715). */
export function readFileText(file: Blob): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}
