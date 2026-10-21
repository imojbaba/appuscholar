"use client";
import { useCallback, useEffect, useRef } from "react";
import type { DesignKey } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { useProjectBlob, type BlobUpdate, type ProjectBlob } from "@/lib/blobs/useProjectBlob";
import type { DesignShapes } from "@/lib/blobs/kinds/design";

/*
 * Design and ethics' state (session A): one sealed blob per v1 sub-tool, `design_<key>` for the six DesignKeys (v1 `appu_design_<key>`, designGet and
 * designSet 5873-5874). Every page of the place reads and writes through useDesign(key), so the stage-2 rules are kept in one place: a blob still being
 * read or locked is not written over, and a blob that does not open is not replaced unasked (R16, the guarded kinds). Nothing here is participant data (R1).
 */

/** The blob kind of a design key. */
export type DesignKind<K extends DesignKey> = `design_${K}`;
/** What a key's blob holds. */
export type DesignValue<K extends DesignKey> = DesignShapes[DesignKind<K>];

export type Design<K extends DesignKey> = Omit<ProjectBlob<DesignValue<K>>, "set"> & {
  /** The stored value is not known yet (still opening, or locked or failed with nothing read): nothing may be written. */
  unread: boolean;
  /**
   * Sets the blob (saved after the debounce). False, and nothing set, when the value is not read yet, the window may not write, there is no project, or the
   * blob does not open and the student declined to replace it (asked once with window.confirm, R16; a Yes is remembered until the project changes).
   */
  save(next: BlobUpdate<DesignValue<K>>): boolean;
};

/** A blob whose stored value is not known yet (the same rule the paper cards use). */
export const unread = (b: { value: unknown; loading: boolean; locked: boolean; error?: boolean }): boolean => b.loading || ((b.locked || !!b.error) && b.value === null);

/** A design blob's `done` flag, as designDashboard reads it (truthy). */
export const isDone = (value: unknown): boolean => !!(value as { done?: unknown } | null | undefined)?.done;

/** `projectId` is "" when no project is open (the place passes it so): nothing is read then. */
export function useDesign<K extends DesignKey>(key: K, projectId: string): Design<K> {
  const t = useT();
  const id = projectId === "" ? null : projectId;
  const blob = useProjectBlob(("design_" + key) as DesignKind<K>, id) as unknown as ProjectBlob<DesignValue<K>>;
  const { set, broken, readOnly } = blob;
  const waiting = unread(blob);
  const agreed = useRef(false);
  useEffect(() => { agreed.current = false; }, [projectId]);
  const save = useCallback((next: BlobUpdate<DesignValue<K>>): boolean => {
    if (id === null || waiting || readOnly) return false;
    if (broken && !agreed.current) {
      if (!window.confirm(t("design_broken_confirm"))) return false;
      agreed.current = true;
    }
    set(next);
    return true;
  }, [id, waiting, readOnly, broken, set, t]);
  return { value: blob.value, loading: blob.loading, locked: blob.locked, broken: blob.broken, error: blob.error, readOnly, flush: blob.flush, unread: waiting, save };
}

/** What the six blobs say together: each one's done flag, and whether any is still opening, locked or unreadable (the Overview's notes). */
export type DesignStatus = { done: Partial<Record<DesignKey, boolean>>; loading: boolean; locked: boolean; broken: boolean; error: boolean };

/** Reads the six blobs once, for useDesignStatus and useDesignDone. */
function useSix(projectId: string): DesignStatus {
  const id = projectId === "" ? null : projectId;
  const b = {
    reg: useProjectBlob("design_reg", id), proto: useProjectBlob("design_proto", id), ec: useProjectBlob("design_ec", id),
    ctri: useProjectBlob("design_ctri", id), pi: useProjectBlob("design_pi", id), budget: useProjectBlob("design_budget", id)
  };
  const all = Object.values(b);
  const done: Partial<Record<DesignKey, boolean>> = {};
  for (const k of Object.keys(b) as DesignKey[]) done[k] = isDone(b[k].value);
  return {
    done,
    loading: all.some((x) => x.loading && !x.locked),
    locked: all.some((x) => x.locked && x.value === null),
    broken: all.some((x) => !!x.broken),
    error: all.some((x) => !!x.error && x.value === null)
  };
}

/** The six done flags for designDashboard (`Partial<Record<DesignKey, boolean>>`, a key with no blob is simply not done). */
export function useDesignDone(projectId: string): Partial<Record<DesignKey, boolean>> {
  return useSix(projectId).done;
}

/** The done flags and the state of the six reads together. */
export function useDesignStatus(projectId: string): DesignStatus {
  return useSix(projectId);
}
