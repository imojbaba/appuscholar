"use client";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { apAcrossColToggle, apAcrossCols } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { useProjectBlob } from "@/lib/blobs/useProjectBlob";
import { blobId, type ApNote, type ApNotes } from "@/lib/blobs/kinds";

/*
 * Analyse a paper's stored notes: v1's appu_ap_notes (apNotes, apNotesSave, apNoteGet, apNotePut 9892-9895) and appu_ap_cols (9939-9941), here the open project's `ap_notes` and `ap_cols`
 * blobs, sealed under the vault. AnalysePanel holds the one client of each and hands this store to the walk-through, the paper card and the cards side by side. Every write is an update of
 * the stored value (a write made before the blob is read lands on top of what is stored). A stored blob that does not open on this device is asked about before the first write replaces it
 * (ruling R16); a "yes" holds for that blob, whichever panel asked (below), and a "no" while the panel stays mounted, so typing does not ask at every key.
 */

/**
 * Where a note lives. An old note ('a' + the squashed title + the characters read) that the paper-id migration moved to `p:<pid>` says so in `movedTo` and stays as it was
 * (Task 17); until B3 gives Analyse a paper the paper's id, it reads and writes the note it moved to, which is the one Compare reads (ruling B2-R10). A move that points at a note
 * that is gone leads to that key all the same, so the old copy is never brought back to life beside it.
 */
function noteKeyOf(all: ApNotes, id: string): string {
  let key = id;
  // A few hops at most: a move is one hop, and a loop of moves must not hang the panel.
  for (let hop = 0; hop < 4; hop++) {
    const to = all[key]?.movedTo;
    if (to === undefined) break;
    key = to;
  }
  return key;
}

/** The note a paper's id leads to (following `movedTo`), or undefined. */
export function noteAt(all: ApNotes, id: string): ApNote | undefined {
  return all[noteKeyOf(all, id)];
}

/** apNotePut (9895) as an update of the stored notes: the paper's note (followed to where it moved; made with empty stages and card when there is none), copied, its title set, then `fn` applied to the copy. */
export function notePut(prev: ApNotes | null, doc: { id: string; title: string }, fn: (n: ApNote) => void): ApNotes {
  const all: ApNotes = { ...(prev ?? {}) };
  const key = noteKeyOf(all, doc.id);
  const cur = all[key];
  const n: ApNote = { ...(cur ?? {}), stages: { ...(cur?.stages ?? {}) }, card: { ...(cur?.card ?? {}) }, title: doc.title };
  fn(n);
  all[key] = n;
  return all;
}

/** New V2 copy (register row D-S2-17; ruling R15: an English constant, modelled on the shelf's COLS_POPOUT): a pop-out of another stage than Literature does not store ap_notes (v1 refuses appu_ap_notes in its pop-out, 1964; D-S2-43). */
export const NOTES_POPOUT = "Notes can be saved only in the writing window.";

export type ApNotesStore = {
  /** The stored notes (with the writes made here), {} while none is known. */
  all: ApNotes;
  /**
   * The stored notes are not known yet: being read, locked (the student has not opened the vault), or the read failed. Nothing is shown as empty and nothing can be written meanwhile, so
   * words typed into a box that only looks empty never replace stored ones (Task 12's rule: unread is not empty).
   */
  unread: boolean;
  /**
   * W8 (register row D-S2-34): the notes or the column choice are being read and opened (not locked, which says so itself). The cards side by side show the loading sign meanwhile;
   * the walk-through and the card keep their read-only boxes.
   */
  loading: boolean;
  /** Unread because the vault is locked (the panels say so: vault_ap_locked). */
  locked: boolean;
  /** The stored notes do not open on this device (the panels say so: vault_ap_broken; the first write asks first, R16). */
  broken: boolean;
  /** The notes are read but never stored here: a pop-out (ap_notes is read-only there, v1 1964). The boxes are read-only and the panels say so (NOTES_POPOUT). */
  readOnly: boolean;
  /** v1's apNoteGet without its write: the paper's note (the one it moved to, when the migration moved it), or undefined. */
  note(id: string): ApNote | undefined;
  /** apNotePut: false when no project is open, the student kept a broken blob, or this is a pop-out (ap_notes is read-only there, v1 1964). */
  put(doc: { id: string; title: string }, fn: (n: ApNote) => void): boolean;
  /** apAcrossDel's delete (9981). */
  remove(id: string): boolean;
  /** apAcrossCols over the stored list. */
  cols: string[];
  /** apAcrossColToggle, stored. */
  toggleCol(k: string, on: boolean): boolean;
};

/**
 * A blob whose stored value is not known yet: still loading, or its read was locked or failed with nothing read (useProjectBlob's `locked` and `error` also describe a save held or failed
 * after a read, when the value is known; then the value is shown). With no project open nothing is read and nothing can be written (put refuses), so it counts as read.
 */
const unread = (b: { value: unknown; loading: boolean; locked: boolean; error?: boolean }): boolean => b.loading || ((b.locked || !!b.error) && b.value === null);

/**
 * R16, per blob (wave B Task 21; wave A's residual): the student's "yes" to replacing a blob that does not open, by the blob's id. Two panels of one project (Analyse a paper and
 * Compare, both on `ap_notes`) must not ask the same question twice, so the answer is not a panel's. A "no" is kept by the panel that was told it (it stops the asking at every key) and
 * is asked again by the next one. An answer is forgotten once the blob opens again (a write over it went through), so a blob that breaks later is asked about later.
 */
const replaceBroken = new Set<string>();
/** Forgets every "yes" (tests; a reload does the same). */
export function resetBrokenAnswers(): void { replaceBroken.clear(); }

/** The two blobs of the project the workspace has open (or the scratch project), as one store. */
export function useApNotes(projectId: string | null): ApNotesStore {
  const t = useT();
  const notes = useProjectBlob("ap_notes", projectId);
  const cols = useProjectBlob("ap_cols", projectId);
  /** R16: this panel's "no" for a broken blob, until it unmounts or the project changes. A "yes" is kept per blob (replaceBroken). */
  const refused = useRef(new Set<string>());
  useEffect(() => { refused.current = new Set(); }, [projectId]);
  const mayWrite = useCallback((kind: "ap_notes" | "ap_cols", broken: boolean | undefined) => {
    const id = blobId(projectId ?? "", kind);
    if (!broken) { replaceBroken.delete(id); return true; }
    if (replaceBroken.has(id)) return true;
    if (refused.current.has(kind)) return false;
    if (window.confirm(t(kind === "ap_notes" ? "vault_ap_broken_confirm" : "vault_ap_cols_broken_confirm"))) { replaceBroken.add(id); return true; }
    refused.current.add(kind);
    return false;
  }, [t, projectId]);
  const all = useMemo(() => notes.value ?? {}, [notes.value]);
  const { set: setNotes, broken: notesBroken, readOnly: notesReadOnly } = notes;
  const { set: setCols, broken: colsBroken, value: colsValue, readOnly: colsReadOnly } = cols;
  const notesUnread = unread(notes);
  const colsUnread = unread(cols);
  const put = useCallback((doc: { id: string; title: string }, fn: (n: ApNote) => void) => {
    if (!projectId || notesUnread || notesReadOnly || !mayWrite("ap_notes", notesBroken)) return false;
    setNotes((prev) => notePut(prev, doc, fn));
    return true;
  }, [projectId, notesUnread, notesReadOnly, mayWrite, notesBroken, setNotes]);
  const remove = useCallback((id: string) => {
    if (!projectId || notesUnread || notesReadOnly || !mayWrite("ap_notes", notesBroken)) return false;
    setNotes((prev) => { const next = { ...(prev ?? {}) }; delete next[id]; return next; });
    return true;
  }, [projectId, notesUnread, notesReadOnly, mayWrite, notesBroken, setNotes]);
  const toggleCol = useCallback((k: string, on: boolean) => {
    if (!projectId || colsUnread || colsReadOnly || !mayWrite("ap_cols", colsBroken)) return false;
    setCols((prev) => apAcrossColToggle(apAcrossCols(prev), k, on));
    return true;
  }, [projectId, colsUnread, colsReadOnly, mayWrite, colsBroken, setCols]);
  const colList = useMemo(() => apAcrossCols(colsValue), [colsValue]);
  const note = useCallback((id: string) => noteAt(all, id), [all]);
  return { all, unread: notesUnread, loading: (notes.loading && !notes.locked) || (cols.loading && !cols.locked), locked: notesUnread && notes.locked, broken: !!notesBroken, readOnly: notesReadOnly, note, put, remove, cols: colList, toggleCol };
}
