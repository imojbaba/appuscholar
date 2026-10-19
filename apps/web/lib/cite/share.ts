import {
  bibliographyHtml, citIsNumbered, exportLibrary, LIBRARY_FILE_NAME, LIBRARY_IMPORT_MAX_BYTES, mergeLibrary, PSYCH_STARTERS, type CitationEntry, type CitationStyle
} from "@appuscholar/core";

/*
 * The library block's buttons after the cards (v1 940-946) as pure orchestration: Insert reference list (citInsertBib 7871-7881), Load classic psychology
 * sources (psychLoadStarters 7983-7987), Export library (citExport 7991-7998) and Import library (citImport 7999-8023). The list, the file and the merge are
 * core's (bibliographyHtml, exportLibrary, mergeLibrary, PSYCH_STARTERS); the panel hands in the library, its update, the editor's insert and the toast.
 * The sentences below are literals of v1's script (no data-i18n key), English constants byte-equal to v1 (ruling R15); cite_bib_fmt(_num) go through `t`.
 */
export const LIBRARY_EMPTY = "Library is empty — add a source first";
export const LIBRARY_EXPORTED = "Library exported ✓ — share the file with your class";
export const IMPORT_TOO_LARGE = "That file is too large to be a citation library";
export const IMPORT_NOT_A_LIBRARY = "Could not read that file — it must be a library JSON exported from Appuscholar";
export const IMPORT_READ_FAILED = "Could not read that file";
export const STARTERS_ALREADY = "Starter library already loaded ✓";
/** 8018: `added+' sources merged into your library ✓'`. */
export const importedToast = (added: number): string => added + " sources merged into your library ✓";
/** 7987: `added+' classic psychology sources added ✓'`. */
export const startersToast = (added: number): string => added + " classic psychology sources added ✓";

/** citInsertBib: nothing for an empty library; otherwise core's block in one insertion, then the numbered or author-date toast. */
export function citeInsertBib(d: { lib: CitationEntry[]; style: CitationStyle; insert(html: string): void; toast(msg: string): void; t(key: string): string }): void {
  if (!d.lib.length) { d.toast(LIBRARY_EMPTY); return; }
  d.insert(bibliographyHtml(d.lib, d.style));
  d.toast(citIsNumbered(d.style) ? d.t("cite_bib_fmt_num") : d.t("cite_bib_fmt"));
}

/** citExport: nothing for an empty library; otherwise exportLibrary's text as psychology-class-library.json. */
export function citeExport(d: { lib: CitationEntry[]; download(name: string, blob: Blob): void; toast(msg: string): void }): void {
  if (!d.lib.length) { d.toast(LIBRARY_EMPTY); return; }
  d.download(LIBRARY_FILE_NAME, new Blob([exportLibrary(d.lib)], { type: "application/json" }));
  d.toast(LIBRARY_EXPORTED);
}

/** psychLoadStarters 7983-7986: each classic source not already held (same title and same author, 7985) is appended as a copy. */
export function loadClassics(lib: CitationEntry[]): { lib: CitationEntry[]; added: number } {
  const l = lib.slice();
  let added = 0;
  PSYCH_STARTERS.forEach((s) => { if (!l.some((e) => e.title === s.title && e.author === s.author)) { l.push(Object.assign({}, s)); added++; } });
  return { lib: l, added };
}

/** What the library hands these buttons: the entries as read, and its update (false when the student keeps a library that does not open, ruling R16). */
type LibraryWrite = { lib: CitationEntry[]; update(fn: (prev: CitationEntry[]) => CitationEntry[]): boolean; toast(msg: string): void };

/**
 * The classics button: v1 saves the library and toasts whatever was added (7987). The library is written as an update (ruling R12), so the sources land on
 * the stored entries; the count in the toast is the one for the library as read.
 */
export function citeLoadClassics(d: LibraryWrite): void {
  const { added } = loadClassics(d.lib);
  if (!d.update((prev) => loadClassics(prev).lib)) return;
  d.toast(added ? startersToast(added) : STARTERS_ALREADY);
}

/** v1 reads the chosen file with a FileReader (8002-8022). */
export function readFileText(file: Blob): Promise<string> {
  return new Promise((done, fail) => {
    const r = new FileReader();
    r.onload = () => done(String(r.result));
    r.onerror = () => fail(r.error ?? new Error("read"));
    r.readAsText(file);
  });
}

/**
 * citImport: no file, nothing; a file over LIBRARY_IMPORT_MAX_BYTES is refused before it is read (8001, register row D-W1-2); a read error, a file that is
 * not JSON or whose root is not a list each have v1's toast; otherwise core's mergeLibrary adds the entries v1 adds (12 fields, 2,000 at most, the
 * title-and-author duplicate rule), written as an update, and v1's count. The caller empties the file input afterwards (8001, 8019, 8021).
 */
export async function citeImport(file: File | null | undefined, d: LibraryWrite & { read?(file: File): Promise<string> }): Promise<void> {
  if (!file) return;
  if (file.size > LIBRARY_IMPORT_MAX_BYTES) { d.toast(IMPORT_TOO_LARGE); return; }
  let text: string;
  try { text = await (d.read ?? readFileText)(file); } catch { d.toast(IMPORT_READ_FAILED); return; }
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { d.toast(IMPORT_NOT_A_LIBRARY); return; }
  const r = mergeLibrary(d.lib, parsed);
  if (!r.ok) { d.toast(IMPORT_NOT_A_LIBRARY); return; }
  if (!d.update((prev) => { const m = mergeLibrary(prev, parsed); return m.ok ? m.lib : prev; })) return;
  d.toast(importedToast(r.added));
}
