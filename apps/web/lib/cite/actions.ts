import { citFmt, citIsNumbered, citLookup, citNumFor, type CitationEntry, type CitationStyle, type Formatted } from "@appuscholar/core";

/*
 * The Citation Manager's buttons (v1 citPutIntext 7494-7504, citInsert 7505, citAdd 7507, citUseLib 7867, citLookup 7931-7961), as pure orchestration:
 * the panel hands in the library, the style, the editor's insert and the toast. Formatting, numbering, identity and lookup routing are core's.
 * The sentences below are literals of v1's script (no data-i18n key), so they stay English constants, byte-equal to v1, as v1 shows them in both
 * languages (ruling R15); the keyed ones go through `t`.
 */
export const ADD_AUTHOR_TITLE = "Add author and title first";
export const CITATION_INSERTED = "Citation inserted ✓";
export const SAVED_TO_LIBRARY = "Saved to library ✓";
/** v1's duplicate toast ("Already in your library", 8448, 8476, 13651) is the keyed `rs2_already_in_your_library`, read through `t` by Research and the capture. */
export const FORM_CLEARED = "Form cleared";
/** A library card's button (7864): "Insert " and the in-text form, or "¹ (n)" for AMA's superscript. */
export const insertLabel = (f: Formatted): string => "Insert " + (f.sup ? "¹ (" + f.num + ")" : f.intext);
/** A card's ✕ (7860). */
export const REMOVE_TITLE = "Remove";

export type CiteDeps = {
  lib: CitationEntry[];
  style: CitationStyle;
  /**
   * Puts the formatted citation at the cursor (insertCitation on the open document's editor, through the shell's requestInsert, which opens a
   * closed document first). False when nothing went in: the document did not open, and requestInsert has said so.
   */
  insert(f: Formatted): Promise<boolean>;
  toast(msg: string): void;
  t(key: string): string;
};

/** citPutIntext 7494-7504: numbered styles take the source's library number (a guess, lib.length + 1, when it is not saved); true when it was a guess. */
export function putIntext(d: CitationEntry, lib: CitationEntry[], style: CitationStyle, insert: (f: Formatted) => void): boolean {
  let n = 0, warn = false;
  if (citIsNumbered(style)) { const r = citNumFor(lib, d); n = r.n; warn = !r.saved; }
  insert(citFmt(d, n, style));
  return warn;
}

/** putIntext through an insert that answers later: the number warning, and whether the citation went in. */
async function putIntextAsync(d: CitationEntry, deps: CiteDeps): Promise<{ warn: boolean; inserted: boolean }> {
  let inserted: Promise<boolean> = Promise.resolve(false);
  const warn = putIntext(d, deps.lib, deps.style, (f) => { inserted = deps.insert(f); });
  return { warn, inserted: await inserted };
}

/** citInsert 7505-7506: needs author and title; inserts, then warns when the number is a guess. Nothing is claimed when the document did not open. */
export async function citeInsert(d: CitationEntry, deps: CiteDeps): Promise<void> {
  if (!d.author || !d.title) { deps.toast(ADD_AUTHOR_TITLE); return; }
  const r = await putIntextAsync(d, deps);
  if (r.inserted) deps.toast(r.warn ? deps.t("cite_num_unsaved") : CITATION_INSERTED);
}

/** citUseLib 7867: a library card's Insert. */
export async function citeUseLib(i: number, deps: CiteDeps): Promise<void> {
  const d = deps.lib[i];
  if (!d) return;
  if ((await putIntextAsync(d, deps)).inserted) deps.toast(CITATION_INSERTED);
}

/** What useLibrary's add answers: saved, missing author or title, no project yet, or a broken library the student chose to keep. */
export type AddResult = "added" | "need-author-title" | "not-ready" | "declined";

/** citAdd 7507-7508: the toast for each outcome of the library's add ("not-ready" and "declined" show nothing). */
export function citeAdd(d: CitationEntry, add: (d: CitationEntry) => AddResult, toast: (msg: string) => void): AddResult {
  const r = add(d);
  if (r === "need-author-title") toast(ADD_AUTHOR_TITLE);
  else if (r === "added") toast(SAVED_TO_LIBRARY);
  return r;
}

/**
 * citLookup 7931-7961 through core's citLookup: the busy toast as the first request goes out (v1 shows it after the empty check, right before its
 * first fetch), the form filled on success, and the toast cite_lookup_<result>. Only DOIs, PubMed IDs and titles leave the browser.
 */
export async function citeLookup(d: { fetch: typeof fetch; form: { doi: string; url: string; title: string }; fill(entry: CitationEntry): void; toast(msg: string): void; t(key: string): string }): Promise<void> {
  let busy = false;
  const f = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (!busy) { busy = true; d.toast(d.t("cite_lookup_busy")); }
    return d.fetch(input, init);
  }) as typeof fetch;
  const r = await citLookup(f, d.form);
  if (r.result === "ok" && r.entry) d.fill(r.entry);
  d.toast(d.t("cite_lookup_" + r.result));
}
