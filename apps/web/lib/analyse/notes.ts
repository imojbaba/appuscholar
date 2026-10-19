"use client";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { apAcrossColToggle, apAcrossCols } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { useProjectBlob } from "@/lib/blobs/useProjectBlob";
import type { ApNote, ApNotes } from "@/lib/blobs/kinds";

/*
 * Analyse a paper's stored notes: v1's appu_ap_notes (apNotes, apNotesSave, apNoteGet, apNotePut 9892-9895) and appu_ap_cols (9939-9941), here the open project's `ap_notes` and `ap_cols`
 * blobs, sealed under the vault. AnalysePanel holds the one client of each and hands this store to the walk-through, the paper card and the cards side by side. Every write is an update of
 * the stored value (a write made before the blob is read lands on top of what is stored). A stored blob that does not open on this device is asked about before the first write replaces it
 * (ruling R16); the answer holds for that blob while the panel stays mounted, so typing does not ask at every key.
 */

/** apNotePut (9895) as an update of the stored notes: the paper's note (made with empty stages and card when there is none), copied, its title set, then `fn` applied to the copy. */
export function notePut(prev: ApNotes | null, doc: { id: string; title: string }, fn: (n: ApNote) => void): ApNotes {
  const all: ApNotes = { ...(prev ?? {}) };
  const cur = all[doc.id];
  const n: ApNote = { ...(cur ?? {}), stages: { ...(cur?.stages ?? {}) }, card: { ...(cur?.card ?? {}) }, title: doc.title };
  fn(n);
  all[doc.id] = n;
  return all;
}

export type ApNotesStore = {
  /** The stored notes (with the writes made here), {} while none is known. */
  all: ApNotes;
  /** v1's apNoteGet without its write: the paper's note, or undefined. */
  note(id: string): ApNote | undefined;
  /** apNotePut: false when no project is open or the student kept a broken blob. */
  put(doc: { id: string; title: string }, fn: (n: ApNote) => void): boolean;
  /** apAcrossDel's delete (9981). */
  remove(id: string): boolean;
  /** apAcrossCols over the stored list. */
  cols: string[];
  /** apAcrossColToggle, stored. */
  toggleCol(k: string, on: boolean): boolean;
};

/** The two blobs of the project the workspace has open (or the scratch project), as one store. */
export function useApNotes(projectId: string | null): ApNotesStore {
  const t = useT();
  const notes = useProjectBlob("ap_notes", projectId);
  const cols = useProjectBlob("ap_cols", projectId);
  /** R16: the student's answer for a broken blob, per blob, until the panel unmounts or the project changes. */
  const decided = useRef(new Map<string, boolean>());
  useEffect(() => { decided.current = new Map(); }, [projectId]);
  const mayWrite = useCallback((kind: "ap_notes" | "ap_cols", broken: boolean | undefined) => {
    if (!broken) return true;
    const had = decided.current.get(kind);
    if (had !== undefined) return had;
    const yes = window.confirm(t(kind === "ap_notes" ? "vault_ap_broken_confirm" : "vault_ap_cols_broken_confirm"));
    decided.current.set(kind, yes);
    return yes;
  }, [t]);
  const all = useMemo(() => notes.value ?? {}, [notes.value]);
  const { set: setNotes, broken: notesBroken } = notes;
  const { set: setCols, broken: colsBroken, value: colsValue } = cols;
  const put = useCallback((doc: { id: string; title: string }, fn: (n: ApNote) => void) => {
    if (!projectId || !mayWrite("ap_notes", notesBroken)) return false;
    setNotes((prev) => notePut(prev, doc, fn));
    return true;
  }, [projectId, mayWrite, notesBroken, setNotes]);
  const remove = useCallback((id: string) => {
    if (!projectId || !mayWrite("ap_notes", notesBroken)) return false;
    setNotes((prev) => { const next = { ...(prev ?? {}) }; delete next[id]; return next; });
    return true;
  }, [projectId, mayWrite, notesBroken, setNotes]);
  const toggleCol = useCallback((k: string, on: boolean) => {
    if (!projectId || !mayWrite("ap_cols", colsBroken)) return false;
    setCols((prev) => apAcrossColToggle(apAcrossCols(prev), k, on));
    return true;
  }, [projectId, mayWrite, colsBroken, setCols]);
  const colList = useMemo(() => apAcrossCols(colsValue), [colsValue]);
  const note = useCallback((id: string) => all[id], [all]);
  return { all, note, put, remove, cols: colList, toggleCol };
}
