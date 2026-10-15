"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { ProviderId } from "@appuscholar/core";
import { ApiError, apiFetch } from "@/lib/api";
import { keyStore, lockKey, type KeyMode } from "./keys";

export type KeysValue = {
  /** Encrypted keys held on the server, by provider (salt.iv.ciphertext). */
  blobs: Record<string, string>;
  /** False until the first read of /me/credentials has finished. */
  loaded: boolean;
  /** A key exists for the provider: usable now (this tab or this computer) or locked on the server. */
  hasKey(p: ProviderId): boolean;
  getUnlocked(p: ProviderId): string | null;
  providersWithKeys(): ProviderId[];
  /** Stores a key in the chosen mode. "pass" needs the passphrase and also keeps the plain key in this tab. Throws when the server could not be reached. */
  save(p: ProviderId, key: string, mode: KeyMode, pass?: string): Promise<void>;
  forget(p: ProviderId): Promise<void>;
  reload(): Promise<void>;
};

const Ctx = createContext<KeysValue | null>(null);

type Wire = { provider: string; encryptedKey: string };

export function KeysProvider({ children }: { children: React.ReactNode }) {
  const [blobs, setBlobs] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [version, bump] = useReducer((n: number) => n + 1, 0);
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
      if (!pass) throw new Error("passphrase needed");
      const blob = await lockKey(key, pass);
      await apiFetch<void>(`/me/credentials/${p}`, { method: "PUT", body: JSON.stringify({ encryptedKey: blob }) });
      commit({ ...blobsRef.current, [p]: blob });
      keyStore.setSession(p, key); // usable in this tab now
    } else {
      // A new key replaces whatever was stored before, in any mode (v1 saveKey).
      await dropBlob(p);
      if (mode === "plain") keyStore.setPlain(p, key); else keyStore.setSession(p, key);
    }
    bump();
  }, [commit, dropBlob]);

  const forget = useCallback(async (p: ProviderId) => {
    keyStore.clear(p);
    bump();
    await dropBlob(p);
    bump();
  }, [dropBlob]);

  const value = useMemo<KeysValue>(() => ({
    blobs, loaded,
    hasKey: (p) => keyStore.hasAny(p, blobs),
    getUnlocked: (p) => keyStore.getUnlocked(p),
    providersWithKeys: () => keyStore.providersWithKeys(blobs),
    save, forget, reload
    // `version` counts local key changes (the session map and localStorage are not React state), so consumers re-render after one.
  }), [blobs, loaded, save, forget, reload, version]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useKeys(): KeysValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useKeys must be used inside <KeysProvider>");
  return v;
}
