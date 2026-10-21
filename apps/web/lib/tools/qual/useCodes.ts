"use client";
import { useCallback, useMemo } from "react";
import { qualDeleteCascade, qualNextColor, type QualCode } from "@appuscholar/core";
import { useProjectBlob } from "@/lib/blobs/useProjectBlob";
import { codeListDamaged } from "./codeList";

/**
 * The project's codes (v1 appu_qual_codes, qualCodesGet / qualCodesSet 6187-6188; kind `qual_codes`), with v1's three edits: add (qualAddCode 6190-6196),
 * rename (qualRenameCode 6197-6202) and delete with its sub-codes (qualDeleteCode 6235-6244). The panel asks for the name, and for the go-ahead to delete, inline.
 *
 * - Every change is made on the stored list as it is when the change lands (the update form of set()), so one made before the read finished goes on top of the stored codes.
 * - Names are trimmed, and an empty one changes nothing (v1's `if(!name)return`).
 * - A list that cannot be walked (`damaged`: a code is its own parent, or the parents loop, or the stored value is not a list) is never handed to core's
 *   qualDescendantIds or qualDeleteCascade, which recurse with no guard; add, rename and remove then do nothing to it.
 * - `onDeleted(removedIds)` is called after a delete with the id of the code and of each sub-code removed. C2 fills it: it takes the tag spans of those ids out of every document.
 */
export type UseCodesOptions = { onDeleted?: (removedIds: string[]) => void };

/** v1's id: 'q'+Date.now().toString(36)+Math.random().toString(36).slice(2,6). */
const newId = () => "q" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function useCodes(projectId: string | null, opts: UseCodesOptions = {}) {
  const blob = useProjectBlob("qual_codes", projectId);
  const raw: unknown = blob.value;
  const isList = raw === null || Array.isArray(raw);
  const codes = useMemo<QualCode[]>(() => (Array.isArray(raw) ? (raw as QualCode[]) : []), [raw]);
  const damaged = !isList || codeListDamaged(codes);
  const { set } = blob;
  const { onDeleted } = opts;

  /** The code added (its colour is the next one for the codes stored now: v1 qualNextColor 6189), or null when nothing was added. */
  const add = useCallback((name: string, parentId: string | null): QualCode | null => {
    const n = name.trim();
    if (!n || damaged) return null;
    const id = newId();
    // The id is made once: a replay of this update onto a newer list keeps it.
    const make = (count: number): QualCode => ({ id, name: n, parentId, color: qualNextColor(count) });
    set((prev) => (prev !== null && (!Array.isArray(prev) || codeListDamaged(prev)) ? prev : [...(prev ?? []), make((prev ?? []).length)]));
    return make(codes.length);
  }, [codes.length, damaged, set]);

  const rename = useCallback((id: string, name: string): boolean => {
    const n = name.trim();
    if (!n || damaged || !codes.some((c) => c.id === id)) return false;
    set((prev) => (prev === null || !Array.isArray(prev) ? prev ?? [] : prev.map((c) => (c.id === id ? { ...c, name: n } : c))));
    return true;
  }, [codes, damaged, set]);

  /** The ids removed (the code and its sub-codes), or null when there is no such code or the list is damaged. */
  const remove = useCallback((id: string): string[] | null => {
    if (damaged) return null;
    const cascade = qualDeleteCascade(codes, id);
    if (!cascade) return null;
    set((prev) => {
      if (prev === null || !Array.isArray(prev) || codeListDamaged(prev)) return prev ?? [];
      return qualDeleteCascade(prev, id)?.codes ?? prev;
    });
    onDeleted?.(cascade.removed);
    return cascade.removed;
  }, [codes, damaged, onDeleted, set]);

  /** v1's question for deleting a code (with the sub-code count), or null when there is no such code or the list is damaged. */
  const confirmFor = useCallback((id: string): string | null => (damaged ? null : qualDeleteCascade(codes, id)?.confirm ?? null), [codes, damaged]);

  return { codes, damaged, loading: blob.loading && !blob.locked, locked: blob.locked, broken: !!blob.broken, add, rename, remove, confirmFor };
}
