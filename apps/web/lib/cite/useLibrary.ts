"use client";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { citKey, type CitationEntry, type CitationStyle } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { useProjectBlob } from "@/lib/blobs/useProjectBlob";
import { useWorkspace } from "@/components/workspace/WorkspaceContext";
import type { AddResult } from "./actions";

/*
 * The citation style: v1 keeps it only in the #citStyle select (no localStorage key), so it starts on APA 7th at every page load and is shared by
 * everything that reads #citStyle (the panel, Research's "+ Citation library" and "Insert citation", 8466, 7497). Here it is held in memory for the
 * tab's life, the same for every panel.
 */
let style: CitationStyle = "apa";
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const read = () => style;
function writeStyle(next: CitationStyle): void { style = next; for (const l of listeners) l(); }
/** Puts the style back to APA 7th, as a reload does (for tests). */
export function resetCiteStyle(): void { writeStyle("apa"); }

export type Library = {
  /** The stored library (`[]` while it loads, is locked or cannot be opened). */
  lib: CitationEntry[];
  loading: boolean;
  /** The vault is locked and the library unread; an add still goes to the blob, which asks for the passphrase once and saves after the unlock. */
  locked: boolean;
  /** The stored library cannot be opened on this device; the first write over it asks first (ruling R16). */
  broken: boolean;
  /** No project id yet (before /me answers): nothing can be saved. */
  ready: boolean;
  /**
   * citAdd 7507: needs author and title; a source already in the library (by citKey: surname, year and lowercase title) is not added again; otherwise
   * it is appended, as an update, so an add made before the library is read lands on top of the stored entries (and is dropped there if the stored
   * library already holds it). The toast is the caller's (citeAdd).
   */
  add(entry: CitationEntry): AddResult;
  /** citDel 7509: removes the entry at that index. */
  remove(index: number): void;
  /** Any other change of the whole library (Task 8: import, the classics), as an update; false when a broken library is kept. */
  update(fn: (prev: CitationEntry[]) => CitationEntry[]): boolean;
  /** Sends what is pending now; true once nothing is left off the server. */
  flush(): Promise<boolean>;
  style: CitationStyle;
  setStyle(style: CitationStyle): void;
};

/** The Citation Library: the open project's `citations` blob (the scratch project's in scratch space), sealed under the vault, and the style. */
export function useLibrary(): Library {
  const t = useT();
  const { project } = useWorkspace();
  const { me } = useSettings();
  const projectId = project?.id ?? me?.scratchProjectId ?? null;
  const blob = useProjectBlob("citations", projectId);
  const current = useSyncExternalStore(subscribe, read, read);
  const { value, loading, locked, set, flush } = blob;
  const broken = !!blob.broken;
  const ready = projectId !== null;
  const lib = useMemo(() => value ?? [], [value]);

  /** R16: a library that does not open is replaced only once the student says so. */
  const mayWrite = useCallback(() => !broken || window.confirm(t("vault_cite_broken_confirm")), [broken, t]);
  const update = useCallback((fn: (prev: CitationEntry[]) => CitationEntry[]) => {
    if (!ready || !mayWrite()) return false;
    set((prev) => fn(prev ?? []));
    return true;
  }, [ready, mayWrite, set]);
  const add = useCallback((entry: CitationEntry): AddResult => {
    if (!entry.author || !entry.title) return "need-author-title";
    if (!ready) return "not-ready";
    const k = citKey(entry);
    const has = (l: CitationEntry[]) => l.some((e) => citKey(e) === k);
    if (has(lib)) return "duplicate";
    return update((prev) => (has(prev) ? prev : [...prev, entry])) ? "added" : "declined";
  }, [ready, lib, update]);
  const remove = useCallback((index: number) => { update((prev) => prev.filter((_, i) => i !== index)); }, [update]);

  return { lib, loading, locked, broken, ready, add, remove, update, flush, style: current, setStyle: writeStyle };
}
