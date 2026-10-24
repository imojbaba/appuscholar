import {
  retrNormDoi, shBackupBundle, shBackupFileName, shColsAdd, shColsDel, shColsOf, shMatrixCsv, shNoteId, shPaperId, shQuoteFind, shRestoreParse, shTitleGuess, type CitationEntry, type ShRecord
} from "@appuscholar/core";
import type { ShelfCols, ShelfIndex, ShelfPaper, StoredEntry } from "@/lib/blobs/kinds";
import { linkShelf } from "@/lib/papers/ids";
import type { KeepResult } from "@/lib/papers/keep";
import { PdfReaderUnavailable, type extractPdfPages } from "./extract";

/** The copy (lib/i18n t). */
export type T = (key: string, vars?: Record<string, string | number>) => string;
export type ShelfEntry = ShelfIndex[number];
/** A paper as the Reading list holds it: its index entry and, once its blob is read, its text, highlights and cells. */
export type ShelfItem = ShelfEntry & { paper: ShelfPaper | null };

/** What the shelf's orchestration touches, so it can be driven with fakes. The panels compute nothing; this composes v1's steps from core's functions and the sh2_* copy. */
export type ShelfOps = {
  t: T;
  /**
   * The project's library as it is read now, for the pid a new reading-list paper takes from the library entry it is (linkShelf, Task 17). Null (or absent) unless the library has
   * been read: still loading, locked, broken or a failed read all give null, since `[]` would be taken for an empty library and every paper without a pid would be given a new
   * one that the library's entry for it never shares. With null nothing is linked and no pid is made; the paper-id migration, which runs again, links it. Called when the index
   * entry is written, so it is the library as it is then.
   */
  library?(): StoredEntry[] | null;
  /** False once the list that started a batch has been left (or another project is open): Add PDFs and a restore stop before storing another paper. */
  alive(): boolean;
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
  /**
   * Fix wave A (W15, register row D-S2-28): the title (and the DOI printed on page 1, if any) a NEW paper takes: core's resolveShelfTitle over the library and Crossref, v1's first-line guess
   * as the fallback. Only addFiles asks; a stored paper keeps its title (its Analyse notes are keyed by it), and a restore keeps each record's own.
   */
  resolveTitle(pages: string[], fileStem: string): Promise<{ title: string; doi?: string }>;
  setStatus(s: string): void;
  toast(msg: string): void;
  now(): Date;
};

const EMPTY_PAPER: ShelfPaper = { pages: [], notes: [], cells: {} };
const PAPER_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * v1's "➕ Add PDFs", the port the Reading list no longer uses: it adds PDFs through `addOwnPdf` below (three at a time, titles from the paper's metadata, a DOI attached to a kept paper). This stays
 * with its v1 golden cases (packages/core/test/golden/shelf) until the reader of B3 replaces the shelf's code.
 * "➕ Add PDFs" (shAddFiles 11580-11599): for each file in turn, "Reading <name>…", then one sentence: not a PDF, already on the shelf (same name and size), no readable text, added
 * with its page count (and "(first 200 of N)"), or the error's message ("could not be read" when it has none). A paper is stored (its own blob, then its index entry) only once its
 * text is read; the PDF itself never is. The sentences, joined by " | ", are the status line.
 */
export async function addFiles(files: File[], d: ShelfOps): Promise<void> {
  if (!files.length || !d.canWriteIndex()) return;
  const have: Array<{ file: string; size: number }> = d.entries().map((e) => ({ file: e.file, size: e.size }));
  const msgs: string[] = [];
  for (const f of files) {
    if (!d.alive()) return;
    d.setStatus(d.t("sh2_reading", { name: f.name }));
    if (!/\.pdf$/i.test(f.name)) { msgs.push(f.name + d.t("sh2_not_a_pdf")); continue; }
    if (have.some((p) => p.file === f.name && p.size === f.size)) { msgs.push(f.name + d.t("sh2_already_on_the_shelf")); continue; }
    try {
      const r = await d.extract(f);
      if (r === "not-a-pdf") { msgs.push(f.name + d.t("sh2_not_a_pdf")); continue; }
      if (r === "no-text") { msgs.push(f.name + d.t("sh2_no_readable_text_it")); continue; }
      // W15: the title from the DOI or the library (Crossref, 4 s at most); any failure is v1's first-line guess, so the add is never blocked.
      const stem = f.name.replace(/\.pdf$/i, "");
      const named = await d.resolveTitle(r.pages, stem).catch(() => ({ title: shTitleGuess(r.pages, stem) } as { title: string; doi?: string }));
      // Closed while the PDF was read (or its title looked up): nothing more is stored.
      if (!d.alive()) return;
      const now = d.now();
      const id = shPaperId(now.getTime());
      // Once its text is stored the entry is always added, the list open or not (updateIndex writes it through a client of its own after a close).
      await d.createPaper(id, { pages: r.pages, notes: [], cells: {} });
      const entry: ShelfEntry = { id, title: named.title, ...(named.doi ? { doi: named.doi } : {}), file: f.name, size: f.size, added: now.toISOString(), total: r.total, kept: r.pages.length };
      // The pid comes with the entry (Task 17): the library entry's when it is the same paper (the DOI printed on page 1, then the title), else a new one. With the library not
      // read, no pid is made for this paper or any other: the migration's next run links them all against the library.
      d.updateIndex((prev) => linkWith([...(prev ?? []), entry], d.library?.() ?? null));
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

/** What Add your own PDF needs besides the reading list's operations (Task 21a). */
export type OwnPdfOps = ShelfOps & {
  /** Crossref's record of a DOI (the DOI only is sent, 4 s at most), or null; the answer for a DOI is asked once and used again for it. */
  lookupDoi(doi: string): Promise<CitationEntry | null>;
  /** Keeps a paper (lib/papers/keep's keepEntry, once the library is read): its pid and whether it was new, or null when the library cannot be read now (nothing was kept). */
  keep(entry: CitationEntry): Promise<KeepResult | null>;
};

/** PDFs whose titles are looked up at the same time (wave A LATER T15: 4 s each, one after the other, made ten PDFs wait forty seconds). */
export const OWN_PDF_PARALLEL = 3;

/**
 * "Add your own PDF" (wave B Task 21a, register row D-S2-126; replaces addFiles in the Reading list). Each file is read and its title looked up, three at a time (the DOI printed on
 * page 1 asked of the library, then of Crossref: core's resolveShelfTitle, so a title comes from the paper's metadata, W15), and then the papers are stored one after the other, in the
 * order the files were chosen. A DOI that is a kept paper's attaches the PDF to that paper; a DOI not kept yet keeps the paper from Crossref's record and attaches the PDF to it;
 * a PDF with no DOI the page proves is its own is a paper only the reading list has (unless its title is a kept paper's, which linkShelf finds). A kept paper that has a PDF already
 * says so and the second one is not stored. The PDF itself is never stored, only its text. The sentences, one per file in the order chosen, are the status line.
 */
export async function addOwnPdf(files: File[], d: OwnPdfOps): Promise<void> {
  if (!files.length || !d.canWriteIndex()) return;
  const have: Array<{ file: string; size: number }> = d.entries().map((e) => ({ file: e.file, size: e.size }));
  const pids = new Set(d.entries().flatMap((e) => (e.pid ? [e.pid] : [])));
  const msgs: string[] = [];
  const todo: Array<{ f: File; i: number }> = [];
  files.forEach((f, i) => {
    if (!/\.pdf$/i.test(f.name)) msgs[i] = d.t("rl_add_not_pdf", { name: f.name });
    else if (have.some((p) => p.file === f.name && p.size === f.size)) msgs[i] = d.t("rl_add_same", { name: f.name });
    else { have.push({ file: f.name, size: f.size }); todo.push({ f, i }); }
  });
  if (todo.length) d.setStatus(todo.length === 1 ? d.t("rl_add_reading", { name: todo[0]!.f.name }) : d.t("rl_add_reading_n", { n: todo.length }));

  // The reading and the title lookups, a few at a time.
  type Read = { f: File; pages: string[]; total: number; named: { title: string; doi?: string } };
  const read: Array<Read | undefined> = [];
  let next = 0;
  const worker = async () => {
    for (;;) {
      if (!d.alive()) return;
      const job = todo[next++];
      if (!job) return;
      const { f, i } = job;
      try {
        const r = await d.extract(f);
        if (r === "not-a-pdf") { msgs[i] = d.t("rl_add_not_pdf", { name: f.name }); continue; }
        if (r === "no-text") { msgs[i] = d.t("rl_add_no_text", { name: f.name }); continue; }
        const stem = f.name.replace(/\.pdf$/i, "");
        const named = await d.resolveTitle(r.pages, stem).catch(() => ({ title: shTitleGuess(r.pages, stem) } as { title: string; doi?: string }));
        read[i] = { f, pages: r.pages, total: r.total, named };
      } catch (e) {
        msgs[i] = f.name + ": " + (e instanceof PdfReaderUnavailable ? d.t("sh2_the_pdf_reader_needs") : e instanceof Error && e.message ? e.message : d.t("rl_add_unreadable"));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(OWN_PDF_PARALLEL, todo.length) }, worker));

  // The storing, one paper at a time: its text first, then its place in the index.
  for (let i = 0; i < read.length; i++) {
    const r = read[i];
    if (!r) continue;
    if (!d.alive()) return;
    const name = r.f.name;
    let title = r.named.title;
    let pid: string | undefined;
    let how: "attached" | "kept" | "plain" = "plain";
    const doi = r.named.doi;
    if (doi) {
      const mine = (d.library?.() ?? []).find((e) => e.pid && retrNormDoi(e.doi ?? "") === retrNormDoi(doi));
      if (mine) { pid = mine.pid; title = (mine.title ?? "").trim() || title; how = "attached"; }
      else {
        const cr = await d.lookupDoi(doi).catch(() => null);
        const kept = cr ? await d.keep({ ...cr, doi: cr.doi || doi }).catch(() => null) : null;
        if (cr && kept) { pid = kept.pid; title = (cr.title ?? "").trim() || title; how = kept.state === "kept" ? "kept" : "attached"; }
      }
    }
    if (pid && pids.has(pid)) { msgs[i] = d.t("rl_add_dup", { name, title }); continue; }
    try {
      const now = d.now();
      const id = shPaperId(now.getTime());
      // Once its text is stored the entry is always added, the list open or not (updateIndex writes it through a client of its own after a close).
      await d.createPaper(id, { pages: r.pages, notes: [], cells: {} });
      const n = r.pages.length;
      const entry: ShelfEntry = { id, title, ...(doi ? { doi } : {}), ...(pid ? { pid } : {}), file: name, size: r.f.size, added: now.toISOString(), total: r.total, kept: n };
      d.updateIndex((prev) => linkWith([...(prev ?? []), entry], d.library?.() ?? null));
      if (pid) pids.add(pid);
      msgs[i] = d.t(how === "attached" ? "rl_add_attached" : how === "kept" ? "rl_add_kept" : "rl_add_plain", { name, title }) + (r.total > n ? " " + d.t("rl_add_cut", { pagesCount: n, total: r.total }) : "");
    } catch (e) {
      msgs[i] = name + ": " + (e instanceof Error && e.message ? e.message : d.t("rl_add_unreadable"));
    }
  }
  d.setStatus(msgs.filter(Boolean).join(" "));
}

/** linkShelf over `lib`, or the index as it is when the library has not been read (null). */
const linkWith = (index: ShelfIndex, lib: StoredEntry[] | null): ShelfIndex => (lib === null ? index : linkShelf(index, lib));

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

/**
 * A paper as v1 stores and backs it up (11592): the index entry's fields and the blob's, in v1's order. From wave B the backup also carries the paper's `doi` (the DOI that named
 * it, wave A LATER T15) and its `pid` (Task 17), where it has them: v1's restore ignores both, and this build's restore keeps a replaced paper's own and takes a record's pid only when
 * the project's library has it (ruling B2-R12).
 */
export const toRecord = (x: ShelfItem & { paper: ShelfPaper }): ShRecord & { doi?: string; pid?: string } =>
  ({ id: x.id, title: x.title, file: x.file, size: x.size, added: x.added, pages: x.paper.pages, total: x.total, notes: x.paper.notes, cells: x.paper.cells,
    ...(x.doi ? { doi: x.doi } : {}), ...(x.pid ? { pid: x.pid } : {}) });

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

/**
 * "Add to my references" (More on a paper only the reading list has): the paper joins the library as an entry with its title, its DOI if it has one and its pid, on the reading list, so
 * Citations lists it and Compare and the notes keep the paper they had. It has no author yet, which its status says ("Authors missing"). Nothing is added twice. False when the library took
 * nothing (a broken one the student kept).
 */
export function addToReferences(shelf: ShelfEntry, d: { update(fn: (prev: StoredEntry[]) => StoredEntry[]): boolean }): boolean {
  const pid = shelf.pid;
  if (!pid) return false;
  return d.update((prev) => (prev.some((e) => e.pid === pid) ? prev : [...prev, { title: shelf.title, ...(shelf.doi ? { doi: shelf.doi } : {}), pid, rl: true }]));
}

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : v == null ? fallback : String(v));
const num = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/**
 * "Restore a shelf backup" (shRestore 11714-11725): core's shRestoreParse decides ("That file is not a shelf backup."); each paper it keeps is stored as v1's shPut stores it, by id
 * (the same id replaces the paper on the shelf, another is added), then v1's count. Beyond v1, since the blob store needs them: a field the index requires and the record lacks is
 * made from what is there (the title from the file name, the counts from the pages), an id outside [A-Za-z0-9_-]{1,64} gets a new one, and the pages and notes are made strings.
 * Task 17 (ruling B2-R12): a paper that replaces one keeps that entry's `pid` and `doi`; a new one takes its record's pid only when a library entry of this project has it,
 * else linkShelf finds the library entry it is, or makes a pid.
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
    if (!d.alive()) return;
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
    const library = (): StoredEntry[] | null => d.library?.() ?? null;
    const recordPid = typeof p.pid === "string" && (library() ?? []).some((e) => e.pid === p.pid) ? p.pid : undefined;
    d.updateIndex((prev) => {
      const cur = prev ?? [];
      const old = cur.find((e) => e.id === id);
      const next: ShelfEntry = old
        ? { ...entry, ...(old.pid ? { pid: old.pid } : recordPid ? { pid: recordPid } : {}), ...(old.doi ? { doi: old.doi } : {}) }
        : { ...entry, ...(recordPid ? { pid: recordPid } : {}) };
      return linkWith(old ? cur.map((e) => (e.id === id ? next : e)) : [...cur, next], library());
    });
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
