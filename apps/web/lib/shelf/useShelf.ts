"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { heldBlobs } from "@/lib/blobs/held";
import { blobId, parseBlob, shelfPaperKind, type ShelfCols, type ShelfIndex, type ShelfPaper } from "@/lib/blobs/kinds";
import { blobWritable } from "@/lib/popout/mode";
import { blobPath, projectBlobClient, useProjectBlob, type BlobVault, type BlobWire, type ProjectBlob, type ProjectBlobState } from "@/lib/blobs/useProjectBlob";
import { useT } from "@/lib/i18n";
import { isStaleKeys, isVaultLocked } from "@/lib/vault/errors";
import { useVault } from "@/lib/vault/useVault";
import { useProject } from "@/components/frame/ProjectContext";
import { toast } from "@/components/ui/toast";
import { EMPTY_PAPER, type ShelfEntry, type ShelfItem, type ShelfOps } from "./actions";

export type PaperState = ProjectBlobState<ShelfPaper>;
type PaperClient = ReturnType<typeof projectBlobClient<`shelf_paper:${string}`>>;

/** A body sealed as useProjectBlob seals one (plaintext JSON while the vault is off), for a blob that has no key yet. Throws "vault-locked" while the vault is locked. */
async function sealNew(vault: BlobVault, id: string, json: string): Promise<{ body: string; keyVersion: number; dek?: unknown }> {
  if ((await vault.known()) === "off") return { body: json, keyVersion: 0 };
  const s = await vault.encryptBody({ id, deks: [] }, json);
  return { body: s.bodyHtml, keyVersion: s.keyVersion, ...(s.dek ? { dek: s.dek } : {}) };
}

/**
 * A new paper's blob, stored now (not debounced: the paper joins the index only once its text is on the server). A locked vault asks once; a vault set up in another tab meanwhile
 * (409 vault-required) is read again and the body sealed once more. Throws an Error whose message is the student's sentence.
 */
export async function putNewPaper(projectId: string, paperId: string, paper: ShelfPaper, vault: BlobVault, t: (k: string) => string): Promise<void> {
  const kind = shelfPaperKind(paperId);
  // The guard (lib/popout/mode.ts): a shelf paper is writable in the writing window and in a Literature window (D-S2-43), refused in another stage's.
  if (!blobWritable(kind)) throw new Error(t("sh2_could_not_be_read"));
  const id = blobId(projectId, kind), json = JSON.stringify(paper), path = blobPath(projectId, kind);
  const seal = async () => {
    try { return await sealNew(vault, id, json); } catch (e) {
      if (!isVaultLocked(e)) throw e;
      if (!(await vault.ensureUnlocked().catch(() => false))) throw new Error(t("vault_save_locked"));
      return sealNew(vault, id, json);
    }
  };
  try {
    try { await apiFetch<BlobWire>(path, { method: "PUT", body: JSON.stringify(await seal()) }); } catch (e) {
      if (!isStaleKeys(e)) throw e;
      await vault.known(true);
      await apiFetch<BlobWire>(path, { method: "PUT", body: JSON.stringify(await seal()) });
    }
  } catch (e) {
    if (e instanceof Error && e.message === t("vault_save_locked")) throw e;
    throw new Error(t("sh2_could_not_be_read"));
  }
}

/** DELETE /projects/:id/blobs/shelf_paper:<id>: true when the blob is gone (404 counts: there was none). */
async function deletePaperBlob(projectId: string, paperId: string): Promise<boolean> {
  if (!blobWritable(shelfPaperKind(paperId))) return false;
  try { await apiFetch(blobPath(projectId, shelfPaperKind(paperId)), { method: "DELETE" }); return true; } catch (e) { return e instanceof ApiError && e.status === 404; }
}

/** One read of a paper's blob (decrypted in the browser; a locked vault asks once). Null when there is none, it does not open, or it is not a paper. */
export async function readPaperOnce(projectId: string, paperId: string, vault: BlobVault): Promise<ShelfPaper | null> {
  const kind = shelfPaperKind(paperId);
  let w: BlobWire;
  try { w = await apiFetch<BlobWire>(blobPath(projectId, kind)); } catch { return null; }
  const doc = { id: blobId(projectId, kind), deks: w.deks, bodyHtml: w.body, keyVersion: w.keyVersion };
  let text: string;
  try { text = await vault.decryptBody(doc); } catch (e) {
    if (!isVaultLocked(e) || !(await vault.ensureUnlocked().catch(() => false))) return null;
    try { text = await vault.decryptBody(doc); } catch { return null; }
  }
  return parseBlob(kind, text);
}

/**
 * An update of a project's shelf_index made after the Reading list that started it went away (left, or another project opened): a headless client of its own (no passphrase
 * prompt: the list is gone) reads the index (after any last save of the list's client, and any held value), applies the update, sends it, and is disposed of; what it
 * cannot send is held and sent later, as any blob value is (held.ts). The run is tracked under the blob's id, so a list opened meanwhile waits for it before its first read.
 */
export function writeIndexDetached(projectId: string, u: (prev: ShelfIndex | null) => ShelfIndex, vault: () => BlobVault): void {
  const id = blobId(projectId, "shelf_index");
  const c = projectBlobClient("shelf_index", projectId, vault, () => {}, { headless: true });
  c.set(u);
  // Not c.start(): it waits for idle(id), which now includes this run. What is held for the blob is adopted ahead of the update, as start() does.
  void heldBlobs.after(id, async () => {
    const held = heldBlobs.take(id);
    if (held) c.adopt(held as Parameters<typeof c.adopt>[0]);
    await c.flush();
  }).finally(() => c.dispose());
}

/** The shelf of the project the workspace has loaded (the scratch project's in scratch space). */
function useShelfProject(): string | null {
  return useProject().projectId;
}

/**
 * The Reading shelf for another tool (Task 12's "Choose a paper from your Reading shelf"): the index as stored, read only, and `loadPaper(id)`, one read of that paper's text, highlights
 * and cells. `index` is null while it is not read yet (`loading`), locked (`locked`), stored but not openable on this device (`broken`), when its first read failed (`error`), and when it
 * was read and the project has no index blob (all four false). A re-read that fails (another window announced a save) keeps the last index shown, with `error` false.
 */
export function useShelf(): { projectId: string | null; index: ShelfIndex | null; loading: boolean; locked: boolean; broken: boolean; error: boolean; loadPaper(id: string): Promise<ShelfPaper | null> } {
  const projectId = useShelfProject();
  const index = useProjectBlob("shelf_index", projectId, { readOnly: true });
  const vault = useVault();
  const vaultRef = useRef(vault);
  useEffect(() => { vaultRef.current = vault; }, [vault]);
  const loadPaper = useCallback(async (id: string) => (projectId ? readPaperOnce(projectId, id, vaultRef.current) : null), [projectId]);
  return { projectId, index: index.value, loading: index.loading, locked: index.locked, broken: !!index.broken, error: !!index.error, loadPaper };
}

/** New V2 copy (register row D-S2-17; ruling R15: an English constant): a pop-out of another stage than Literature does not store the matrix's columns (D-S2-43). */
export const COLS_POPOUT = "Columns can be changed only in the writing window.";

/** What the Reading list holds: the index, the matrix columns, each paper's blob as it is read, and the store operations of actions.ts. */
export type ShelfStore = {
  projectId: string | null;
  index: ProjectBlob<ShelfIndex>;
  cols: ProjectBlob<ShelfCols>;
  papers: ReadonlyMap<string, PaperState>;
  /** The index's papers in v1's order (by date added, 11600) with their blobs. */
  items: ShelfItem[];
  ops: Omit<ShelfOps, "t" | "extract" | "resolveTitle" | "library" | "setStatus" | "toast" | "now">;
  /** An update of shelf_cols, R16-guarded; false when nothing is stored (kept, or read-only in a pop-out, where it says so). */
  setCols(u: (prev: ShelfCols | null) => ShelfCols): boolean;
};

/**
 * The Reading list's store: `shelf_index` and `shelf_cols` through useProjectBlob, and one blob client per paper of the index (created as the index lists it, so every paper is read when
 * the list opens, as v1's shAll reads every record), disposed of when the paper leaves the index, the project changes or the list is left. A write over a blob that does not open
 * on this device asks first, once per blob (R16).
 */
export function useShelfStore(): ShelfStore {
  const t = useT();
  const projectId = useShelfProject();
  const vault = useVault();
  const vaultRef = useRef(vault);
  useEffect(() => { vaultRef.current = vault; }, [vault]);
  const index = useProjectBlob("shelf_index", projectId);
  const cols = useProjectBlob("shelf_cols", projectId);
  const [papers, setPapers] = useState<{ projectId: string | null; map: ReadonlyMap<string, PaperState> }>({ projectId: null, map: new Map() });
  const clients = useRef(new Map<string, PaperClient>());
  const confirmed = useRef(new Set<string>());
  const current = useRef({ index, papers: papers.map });
  useEffect(() => { current.current = { index, papers: papers.projectId === projectId ? papers.map : new Map() }; });

  /** Whether this store is still mounted, and for which project: a batch (Add PDFs, a restore) started before a close or a project switch must not write through it. */
  const live = useRef({ mounted: true, projectId });
  useEffect(() => { live.current.projectId = projectId; });
  useEffect(() => {
    const l = live.current;
    l.mounted = true;
    return () => { l.mounted = false; };
  }, []);

  // A project's clients go with it.
  useEffect(() => {
    const mine = clients.current;
    confirmed.current = new Set();
    return () => { for (const c of mine.values()) c.dispose(); mine.clear(); };
  }, [projectId]);

  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);

  /**
   * The paper's client, made and started when there is none. Its save that loses the race to another window three times, and its edit that finds the paper deleted in another window,
   * each say so once (wave A LATER T5, wave B Task 21), as the hook's clients do; the client says nothing once it is disposed of (the list is closed or the paper is gone).
   */
  const ensureClient = useCallback((id: string) => {
    if (!projectId || clients.current.has(id)) return;
    const c = projectBlobClient(shelfPaperKind(id), projectId, () => vaultRef.current, (s) =>
      setPapers((prev) => { const map = new Map(prev.projectId === projectId ? prev.map : []); map.set(id, s); return { projectId, map }; }),
      { onConflict: () => toast(tRef.current("blob_conflict")), onDeleted: () => toast(tRef.current("blob_deleted_elsewhere")) });
    clients.current.set(id, c);
    void c.start();
  }, [projectId]);
  const ids = (index.value ?? []).map((e) => e.id).join("\n");
  useEffect(() => {
    if (!projectId) return;
    const want = new Set(ids ? ids.split("\n") : []);
    for (const [id, c] of clients.current) if (!want.has(id)) { c.dispose(); clients.current.delete(id); }
    for (const id of want) ensureClient(id);
  }, [projectId, ids, ensureClient]);

  const open = vault.status === "unlocked" || vault.status === "migrating";
  useEffect(() => { if (open) for (const c of clients.current.values()) c.resume(); }, [open]);

  /** R16: the first write over a blob that does not open on this device asks; the answer holds for that blob while the list is open. */
  const mayWrite = useCallback((key: string, broken: boolean | undefined) => {
    if (!broken || confirmed.current.has(key)) return true;
    if (!window.confirm(t("rl_broken_confirm"))) return false;
    confirmed.current.add(key);
    return true;
  }, [t]);

  const ops = useMemo<ShelfStore["ops"]>(() => {
    const here = () => live.current.mounted && live.current.projectId === projectId;
    return {
    alive: here,
    entries: () => current.current.index.value ?? [],
    canWriteIndex: () => mayWrite("index", current.current.index.broken),
    updateIndex: (u) => {
      // A refused write never reports success (a pop-out's guard, lib/popout/mode.ts).
      if (!projectId || !blobWritable("shelf_index")) return false;
      // Closed (or another project) while a paper was being stored: its entry goes through a client of its own, so no stored paper is left out of its index.
      if (!here()) { writeIndexDetached(projectId, u, () => vaultRef.current); return true; }
      if (current.current.index.readOnly || !mayWrite("index", current.current.index.broken)) return false;
      current.current.index.set(u);
      return true;
    },
    createPaper: async (id, paper) => {
      if (!projectId) throw new Error(t("sh2_could_not_be_read"));
      await putNewPaper(projectId, id, paper, vaultRef.current, t);
    },
    updatePaper: (id, u) => {
      const c = clients.current.get(id);
      if (!c || c.readOnly || !mayWrite("paper:" + id, current.current.papers.get(id)?.broken)) return false;
      c.set((prev) => u(prev ?? EMPTY_PAPER));
      return true;
    },
    flushPaper: async (id) => (await clients.current.get(id)?.flush()) ?? false,
    deletePaper: async (id) => {
      if (!projectId) return false;
      const bid = blobId(projectId, shelfPaperKind(id));
      // A save still pending for the paper goes first, so it cannot land after the delete and bring the blob back.
      clients.current.get(id)?.dispose();
      clients.current.delete(id);
      await heldBlobs.idle(bid);
      const gone = await deletePaperBlob(projectId, id);
      // Nothing held for the removed paper is sent later.
      heldBlobs.take(bid);
      if (!gone) { ensureClient(id); return false; }
      setPapers((prev) => { const map = new Map(prev.map); map.delete(id); return { projectId: prev.projectId, map }; });
      return true;
    },
    paper: (id) => current.current.papers.get(id)?.value ?? null
    };
  }, [projectId, mayWrite, t, ensureClient]);

  const setCols = useCallback((u: (prev: ShelfCols | null) => ShelfCols) => {
    // v1's pop-out refuses appu_shelf_cols silently (LS.set, 1967); here the student is told (register row D-S2-17).
    if (cols.readOnly) { toast(COLS_POPOUT); return false; }
    if (!mayWrite("cols", cols.broken)) return false;
    cols.set(u);
    return true;
  }, [cols, mayWrite]);

  const map = useMemo(() => (papers.projectId === projectId ? papers.map : new Map<string, PaperState>()), [papers, projectId]);
  const items = useMemo(() => [...(index.value ?? [])].sort((a: ShelfEntry, b: ShelfEntry) => (a.added < b.added ? -1 : 1))
    .map((e) => ({ ...e, paper: map.get(e.id)?.value ?? null })), [index.value, map]);
  return { projectId, index, cols, papers: map, items, ops, setCols };
}
