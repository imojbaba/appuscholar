"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { useVault, type VaultValue, type WrappedDek } from "@/lib/vault/useVault";
import { blobId, parseBlob, type BlobKind, type BlobShape } from "./kinds";

/** A set() is saved this long after the last one (three in a row are one PUT). */
export const BLOB_SAVE_DEBOUNCE_MS = 800;

/**
 * `locked`: the vault is locked and the student has not opened it. While the read is what is locked, `value` is null (never a default);
 * a value set while locked is shown here and held until the vault opens. `broken`: the stored blob does not open or is not of its kind's
 * shape (the panel says so; it never crashes). `error`: the last save failed; the value is kept and goes with the next save or flush.
 */
export type ProjectBlobState<T> = { value: T | null; loading: boolean; locked: boolean; broken?: boolean; error?: boolean };
export type ProjectBlob<T> = ProjectBlobState<T> & {
  /** Shows `next` at once and saves it BLOB_SAVE_DEBOUNCE_MS later (sealed under the blob's key unless the vault is off). */
  set(next: T): void;
  /** Sends a pending save now (before switching documents or unmounting). */
  flush(): Promise<void>;
};
export type ProjectBlobOptions = {
  /** The value is read but set() sends nothing (the pop-out writes only citations and retraction_cache; Task 14 decides which). */
  readOnly?: boolean;
};

/** What GET and PUT /projects/:id/blobs/:kind answer. */
type BlobWire = { kind: string; body: string; keyVersion: number; deks: WrappedDek[]; updatedAt: string };
type BlobPut = { body: string; keyVersion: number; dek?: WrappedDek };
type BlobVault = Pick<VaultValue, "known" | "ensureUnlocked" | "encryptBody" | "decryptBody">;

const isVaultLocked = (e: unknown) => e instanceof Error && e.message === "vault-locked";
/** The blob's keys or the vault changed under this tab (useAutosave's isStaleKeys): re-read them and seal once more. */
const isStaleKeys = (e: unknown) => e instanceof ApiError && e.status === 409 && (e.code === "vault-required" || e.code === "dek-exists");

/**
 * One blob of one project, outside React: its read, its value and the debounced, sealed save. The hook makes one per (kind, projectId).
 * `get` answers null when there is no blob yet (404).
 */
export function createBlobClient<T>(o: {
  id: string;
  parse: (json: string) => T | null;
  get: () => Promise<BlobWire | null>;
  put: (body: BlobPut) => Promise<BlobWire>;
  vault: () => BlobVault;
  delayMs: number;
  onState: (s: ProjectBlobState<T>) => void;
}) {
  let state: ProjectBlobState<T> = { value: null, loading: true, locked: false };
  /** The blob's keys as the server has them: from every read and every save. */
  let deks: WrappedDek[] = [];
  /** A value set here and not yet saved. Newer values replace it. */
  let pending: { value: T } | null = null;
  /** Once a value is set here, reads never replace it with the server's (a read racing the save would show the older value). */
  let local = false;
  /** The read could not open the blob (locked, cancelled): there is no value until the vault opens. */
  let lockedRead = false;
  /** The student cancelled the unlock a save asked for: values are held without asking again until the vault opens (resume). */
  let declined = false;
  let active = true;
  let readSeq = 0;
  let reading: Promise<void> | null = null;
  let inflight: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const emit = (patch: Partial<ProjectBlobState<T>>) => {
    state = { ...state, ...patch };
    if (active) o.onState(state);
  };
  const clearTimer = () => { if (timer) clearTimeout(timer); timer = null; };

  async function read(): Promise<void> {
    const mine = ++readSeq;
    const current = () => active && mine === readSeq;
    let w: BlobWire | null;
    try { w = await o.get(); } catch {
      if (current()) emit({ loading: false, error: true });
      return;
    }
    if (w) deks = w.deks;
    if (!current()) return;
    if (!w) { lockedRead = false; emit({ loading: false, locked: false, broken: false, ...(local ? {} : { value: null }) }); return; }
    const doc = { id: o.id, deks: w.deks, bodyHtml: w.body, keyVersion: w.keyVersion };
    let text: string | null = null;
    let locked = false;
    try { text = await o.vault().decryptBody(doc); } catch (e) {
      if (!isVaultLocked(e)) text = null; // VaultError("corrupt"): broken
      else if (!current()) return;
      // The first read of a locked blob asks once; the vault shares one prompt between every caller waiting on it.
      else if (await o.vault().ensureUnlocked().catch(() => false)) {
        try { text = await o.vault().decryptBody(doc); } catch (e2) { locked = isVaultLocked(e2); }
      } else locked = true;
    }
    if (!current()) return;
    lockedRead = locked;
    const value = text === null ? null : o.parse(text);
    emit({ loading: false, locked: locked || (declined && pending !== null), broken: !locked && value === null, ...(local ? {} : { value }) });
  }
  function load(): Promise<void> {
    const run = read();
    reading = run;
    void run.finally(() => { if (reading === run) reading = null; });
    return run;
  }

  /** The body to send, or null when the vault stays locked (the value is held). Never plaintext in place of ciphertext. */
  async function seal(json: string): Promise<BlobPut | null> {
    const v = o.vault();
    // A vault still "loading" is waited for, never taken for "off".
    if ((await v.known()) === "off") return { body: json, keyVersion: 0 };
    const sealNow = async () => {
      const s = await o.vault().encryptBody({ id: o.id, deks }, json);
      return { body: s.bodyHtml, keyVersion: s.keyVersion, ...(s.dek ? { dek: s.dek } : {}) };
    };
    try { return await sealNow(); } catch (e) { if (!isVaultLocked(e)) throw e; }
    if (!declined) {
      // Once per attempt; while the migration runs this waits for it without a prompt.
      try { if (await o.vault().ensureUnlocked()) return await sealNow(); } catch (e) { if (!isVaultLocked(e)) throw e; }
    }
    declined = true;
    return null;
  }

  /** Keeps a value that could not be sent; a newer one set meanwhile wins. */
  const hold = (value: T) => { if (!pending) pending = { value }; };

  async function save(): Promise<void> {
    // The keys come with the read: a save waits for it.
    while (reading) await reading;
    if (!pending) return;
    const { value } = pending;
    pending = null;
    const json = JSON.stringify(value);
    try {
      let body = await seal(json);
      if (!body) { hold(value); emit({ locked: true }); return; }
      let w: BlobWire;
      try { w = await o.put(body); } catch (e) {
        if (!isStaleKeys(e)) throw e;
        // Re-read the blob's keys (and the vault: another tab may have set one up), seal again, and try once more.
        const fresh = await o.get();
        deks = fresh?.deks ?? [];
        await o.vault().known(true);
        body = await seal(json);
        if (!body) { hold(value); emit({ locked: true }); return; }
        w = await o.put(body);
      }
      deks = w.deks;
      lockedRead = false;
      emit({ error: false, broken: false, locked: false });
    } catch {
      hold(value);
      emit({ error: true });
    }
  }

  async function flush(): Promise<void> {
    clearTimer();
    // Waiting on an unlock can take a while; a second flush queued behind the first sends what is left after it.
    while (inflight) await inflight;
    if (!pending) return;
    const run = save();
    inflight = run;
    try { await run; } finally { if (inflight === run) inflight = null; }
  }

  return {
    load,
    flush,
    set(next: T) {
      pending = { value: next };
      local = true;
      emit({ value: next, broken: false });
      clearTimer();
      if (declined) return; // held until the vault opens
      // Locked: ask now (one prompt) rather than after the debounce.
      if (state.locked) { void flush(); return; }
      timer = setTimeout(() => { timer = null; void flush(); }, o.delayMs);
    },
    /** The vault opened (the header pill, another prompt): a read that was locked is made again, and a held value is sent. */
    resume() {
      if (!active) return;
      const wasDeclined = declined;
      declined = false;
      if (lockedRead) void load();
      if (pending && (wasDeclined || state.locked)) void flush();
    },
    /** Another project or kind, or unmount: the pending save is sent first, then nothing here touches the state any more. */
    dispose() {
      void flush();
      active = false;
      readSeq++;
    }
  };
}

type Tagged<T> = { key: string; s: ProjectBlobState<T> };

/**
 * A project's stage blob of `kind`, typed by its kind. `projectId` null (nothing to read: the caller passes the scratch project when no
 * project is open) reads nothing and set() is a no-op. Reads decrypt in the browser; a locked vault asks once (shared with every other
 * caller), and a cancelled ask leaves `locked: true` with no value. Saves are debounced, sealed under the blob's key unless the vault is
 * off (keyVersion 0), held while the vault stays locked and sent once it opens; a 409 vault-required or dek-exists re-reads the keys
 * and retries once.
 */
export function useProjectBlob<K extends BlobKind>(kind: K, projectId: string | null, opts: ProjectBlobOptions = {}): ProjectBlob<BlobShape<K>> {
  type T = BlobShape<K>;
  const vault = useVault();
  // The client outlives renders; it reads the newest vault from here.
  const vaultRef = useRef(vault);
  useEffect(() => { vaultRef.current = vault; }, [vault]);
  const key = projectId === null ? null : `${projectId}\u0000${kind}`;
  // State is tagged with the blob it was read for, so another project starts at "loading" without a reset in the effect.
  const [tagged, setTagged] = useState<Tagged<T> | null>(null);
  const client = useRef<ReturnType<typeof createBlobClient<T>> | null>(null);

  useEffect(() => {
    if (projectId === null || key === null) return;
    const path = `/projects/${projectId}/blobs/${encodeURIComponent(kind)}`;
    const c = createBlobClient<T>({
      id: blobId(projectId, kind),
      parse: (json) => parseBlob(kind, json),
      get: async () => {
        try { return await apiFetch<BlobWire>(path); } catch (e) { if (e instanceof ApiError && e.status === 404) return null; throw e; }
      },
      put: (body) => apiFetch<BlobWire>(path, { method: "PUT", body: JSON.stringify(body) }),
      vault: () => vaultRef.current,
      delayMs: BLOB_SAVE_DEBOUNCE_MS,
      onState: (s) => setTagged({ key, s })
    });
    client.current = c;
    void c.load();
    return () => { if (client.current === c) client.current = null; c.dispose(); };
  }, [kind, projectId, key]);

  const open = vault.status === "unlocked" || vault.status === "migrating";
  useEffect(() => { if (open) client.current?.resume(); }, [open, key]);

  const readOnly = opts.readOnly ?? false;
  const set = useCallback((next: T) => { if (!readOnly) client.current?.set(next); }, [readOnly]);
  const flush = useCallback(async () => { await client.current?.flush(); }, []);

  const s: ProjectBlobState<T> = key === null
    ? { value: null, loading: false, locked: false }
    : tagged?.key === key ? tagged.s : { value: null, loading: true, locked: false };
  return { ...s, set, flush };
}
