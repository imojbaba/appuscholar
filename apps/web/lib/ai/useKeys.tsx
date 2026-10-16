"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { ProviderId } from "@appuscholar/core";
import { ApiError, apiFetch } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { useVault } from "@/lib/vault/useVault";
import { askPassphrase } from "@/components/workspace/dialogs/Passphrase";
import { keyStore, lockKey, unlockKeyBlob, type KeyMode } from "./keys";

/* A key locked under the vault is stored as "v2." followed by the vault's iv.ct, so the blob keeps the three dot-separated
   base64url fields the credentials API accepts. A legacy blob (v1's salt.iv.ct, locked with a key passphrase) starts with a
   22-character salt, never with "v2", so the two cannot be confused. */
export const V2_PREFIX = "v2.";
export const isV2Blob = (blob: string): boolean => blob.startsWith(V2_PREFIX);

export type KeysValue = {
  /** Encrypted keys held on the server, by provider: "v2." + iv.ct under the vault key, or a legacy salt.iv.ct under a key passphrase. */
  blobs: Record<string, string>;
  /** False until the first read of /me/credentials has finished. */
  loaded: boolean;
  /** A key exists for the provider: usable now (this tab or this computer) or locked on the server. */
  hasKey(p: ProviderId): boolean;
  /** The key usable now, unlocking it when it is held on the server: a v2 blob opens with the vault key (after ensureUnlocked), a
   *  legacy blob asks for its key passphrase and, when the vault is open, is re-saved as v2 in place of the old one. Null when there
   *  is no key or the student cancels; throws when a legacy passphrase is wrong. */
  getUnlocked(p: ProviderId): Promise<string | null>;
  providersWithKeys(): ProviderId[];
  /** Stores a key in the chosen mode. "pass" without `pass` locks it under the vault key (opening the vault first if needed);
   *  with `pass` it is the legacy key-passphrase lock. Either way the plain key is also kept in this tab. Throws when the server could not be reached or the vault stayed locked. */
  save(p: ProviderId, key: string, mode: KeyMode, pass?: string): Promise<void>;
  forget(p: ProviderId): Promise<void>;
  reload(): Promise<void>;
};

const Ctx = createContext<KeysValue | null>(null);

type Wire = { provider: string; encryptedKey: string };

export function KeysProvider({ children }: { children: React.ReactNode }) {
  const { ensureUnlocked, wrapSecret, unwrapSecret } = useVault();
  const [blobs, setBlobs] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [version, bump] = useReducer((n: number) => n + 1, 0);
  // Keys remembered on this computer belong to the signed-in account; set it before consumers read, and re-render once it is known.
  const userId = useSettings().me?.id ?? null;
  keyStore.setUser(userId);
  useEffect(() => { bump(); }, [userId]);
  const blobsRef = useRef(blobs);
  const commit = useCallback((next: Record<string, string>) => { blobsRef.current = next; setBlobs(next); }, []);

  const reload = useCallback(async () => {
    try {
      const list = await apiFetch<Wire[]>("/me/credentials");
      commit(Object.fromEntries(list.map((c) => [c.provider, c.encryptedKey])));
    } catch { /* signed out or API down: keep what we have */ } finally { setLoaded(true); }
  }, [commit]);
  useEffect(() => {
    let live = true;
    apiFetch<Wire[]>("/me/credentials").then(
      (list) => { if (live) { commit(Object.fromEntries(list.map((c) => [c.provider, c.encryptedKey]))); setLoaded(true); } },
      () => { if (live) setLoaded(true); } // signed out or API down: no server keys
    );
    return () => { live = false; };
  }, [commit]);

  const dropBlob = useCallback(async (p: ProviderId) => {
    if (!blobsRef.current[p]) return;
    try { await apiFetch<void>(`/me/credentials/${p}`, { method: "DELETE" }); } catch (e) { if (!(e instanceof ApiError && e.status === 404)) throw e; }
    commit(Object.fromEntries(Object.entries(blobsRef.current).filter(([k]) => k !== p)));
  }, [commit]);

  const save = useCallback(async (p: ProviderId, key: string, mode: KeyMode, pass?: string) => {
    if (mode === "pass") {
      let blob: string;
      if (pass) blob = await lockKey(key, pass);
      else {
        if (!(await ensureUnlocked())) throw new Error("vault-locked");
        blob = V2_PREFIX + (await wrapSecret(key));
      }
      await apiFetch<void>(`/me/credentials/${p}`, { method: "PUT", body: JSON.stringify({ encryptedKey: blob }) });
      commit({ ...blobsRef.current, [p]: blob });
      keyStore.setSession(p, key); // usable in this tab now
    } else {
      // A new key replaces whatever was stored before, in any mode (v1 saveKey).
      await dropBlob(p);
      if (mode === "plain") keyStore.setPlain(p, key); else keyStore.setSession(p, key);
    }
    bump();
  }, [commit, dropBlob, ensureUnlocked, wrapSecret]);

  /** Lazy re-wrap: a legacy blob just opened with its key passphrase is replaced by one under the vault key, when the vault is open. */
  const rewrap = useCallback(async (p: ProviderId, old: string, plain: string) => {
    let next: string;
    try { next = V2_PREFIX + (await wrapSecret(plain)); } catch { return; } // no vault, or locked: it stays as it is until a later unlock
    if (blobsRef.current[p] !== old) return; // replaced meanwhile
    try { await apiFetch<void>(`/me/credentials/${p}`, { method: "PUT", body: JSON.stringify({ encryptedKey: next }) }); } catch { return; }
    if (blobsRef.current[p] === old) commit({ ...blobsRef.current, [p]: next });
  }, [commit, wrapSecret]);

  const getUnlocked = useCallback(async (p: ProviderId): Promise<string | null> => {
    const have = keyStore.getUnlocked(p);
    if (have) return have;
    const blob = blobsRef.current[p];
    if (!blob) return null;
    let plain: string;
    if (isV2Blob(blob)) {
      if (!(await ensureUnlocked())) return null;
      plain = await unwrapSecret(blob.slice(V2_PREFIX.length));
    } else {
      const pass = await askPassphrase({ kind: "unlock", provider: p });
      if (!pass) return null;
      plain = await unlockKeyBlob(blob, pass); // a wrong passphrase throws, and nothing changes
    }
    keyStore.setSession(p, plain);
    bump();
    if (!isV2Blob(blob)) await rewrap(p, blob, plain);
    return plain;
  }, [ensureUnlocked, unwrapSecret, rewrap]);

  const forget = useCallback(async (p: ProviderId) => {
    keyStore.clear(p);
    bump();
    await dropBlob(p);
    bump();
  }, [dropBlob]);

  const value = useMemo<KeysValue>(() => ({
    blobs, loaded,
    hasKey: (p) => keyStore.hasAny(p, blobs),
    getUnlocked,
    providersWithKeys: () => keyStore.providersWithKeys(blobs),
    save, forget, reload
    // `version` counts local key changes (the session map and localStorage are not React state), so consumers re-render after one.
  }), [blobs, loaded, getUnlocked, save, forget, reload, version]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useKeys(): KeysValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useKeys must be used inside <KeysProvider>");
  return v;
}
