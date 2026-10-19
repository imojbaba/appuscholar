"use client";
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { CitationEntry, CitationStyle } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { useProjectBlob } from "@/lib/blobs/useProjectBlob";
import { useVault } from "@/lib/vault/useVault";
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
  /** The project the library (and its check caches) belong to: the open project, else the scratch project; null before /me answers. */
  projectId: string | null;
  /**
   * citAdd 7507-7508: needs author and title, then appends, as an update, so an add made before the library is read lands on top of the stored
   * entries. Like v1's citAdd it does not look for a duplicate (refusing one by citKey is register row D-S2-9's proposal, awaiting Dr. Sharma);
   * Research and the bookmarklet, which do refuse one in v1 with their own rules (8448, 8476, 13651), check before calling update.
   * The toast is the caller's (citeAdd).
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

/**
 * One library for the whole workspace: the Citation Manager, the caret chip under the document and (later) Research read the same blob through
 * the same client, so an entry saved in one is seen by the others at once. Without the provider (a panel rendered on its own) the hook holds
 * its own.
 *
 * The provider waits for the workspace's loaded project (never the scratch project while the active one is still loading). It never asks for
 * the passphrase on its own: it reads only while the vault is off or open, so the document's unlock comes first and a cancelled one is not
 * asked again for the chip. A panel that writes to the library (the Citation Manager) asks for it (`useLibrary()`, not passive): the library
 * is then read even while the vault is locked, and the blob asks for the passphrase as Task 7's panel did (ruling R5).
 */
type SharedLibrary = { library: Library; demand(): () => void };
const Shared = createContext<SharedLibrary | null>(null);
export function CiteLibraryProvider({ children }: { children: ReactNode }) {
  const { projectId } = useWorkspace();
  const { status } = useVault();
  const [demands, setDemands] = useState(0);
  const open = status === "off" || status === "unlocked" || status === "migrating";
  const library = useOwnLibrary(open || demands > 0 ? projectId : null);
  const demand = useCallback(() => { setDemands((n) => n + 1); return () => setDemands((n) => n - 1); }, []);
  const value = useMemo(() => ({ library, demand }), [library, demand]);
  return createElement(Shared.Provider, { value }, children);
}

/**
 * The Citation Library: the open project's `citations` blob (the scratch project's in scratch space), sealed under the vault, and the style.
 * `passive`: only reads what the workspace's library holds (the caret chip), without asking for it to be read while the vault is locked.
 */
export function useLibrary(opts: { passive?: boolean } = {}): Library {
  const shared = useContext(Shared);
  const { project } = useWorkspace();
  const { me } = useSettings();
  // Inside the provider the hook's own blob is never opened (no project id).
  const own = useOwnLibrary(shared !== null ? null : project?.id ?? me?.scratchProjectId ?? null);
  const passive = opts.passive === true;
  useEffect(() => { if (shared && !passive) return shared.demand(); }, [shared, passive]);
  return shared?.library ?? own;
}

function useOwnLibrary(projectId: string | null): Library {
  const t = useT();
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
    return update((prev) => [...prev, entry]) ? "added" : "declined";
  }, [ready, update]);
  const remove = useCallback((index: number) => { update((prev) => prev.filter((_, i) => i !== index)); }, [update]);

  return { lib, loading, locked, broken, ready, projectId, add, remove, update, flush, style: current, setStyle: writeStyle };
}
