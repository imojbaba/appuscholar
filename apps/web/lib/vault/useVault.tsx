"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { toast } from "@/components/ui/toast";
import { askPassphrase } from "@/components/workspace/dialogs/Passphrase";
import {
  decryptText, encryptText, generateDek, generateKeypair, generateRecoveryCode, generateVaultKey, unwrapKey, unwrapPrivateKey,
  unwrapWithPassphrase, unwrapWithRecovery, VaultError, wrapKey, wrapPrivateKey, wrapWithPassphrase, wrapWithRecovery
} from "./crypto";
import { forgetRemembered, hasRemembered, readRemembered, rememberVault } from "./remember";

/** A document's key, wrapped under the vault key, with the version that revisions name in `keyVersion`. */
export type WrappedDek = { v: number; wrapped: string };
export type VaultStatus = "loading" | "off" | "locked" | "unlocked" | "migrating";

export type VaultValue = {
  status: VaultStatus;
  complete: boolean;
  setup(pass: string, remember: boolean): Promise<{ recoveryCode: string }>;
  unlock(pass: string, remember: boolean): Promise<void>;
  unlockRemembered(): Promise<boolean>;
  recover(code: string, newPass: string): Promise<{ recoveryCode: string }>;
  changePassphrase(oldPass: string, newPass: string): Promise<void>;
  lock(): void;
  forgetThisComputer(): Promise<void>;
  /** Prompts via askPassphrase("vault-unlock") until correct or cancelled. */
  ensureUnlocked(): Promise<boolean>;
  encryptBody(doc: { id: string; deks: WrappedDek[] }, html: string): Promise<{ bodyHtml: string; keyVersion: number; dek?: WrappedDek }>;
  decryptBody(doc: { id: string; deks: WrappedDek[]; bodyHtml: string; keyVersion: number }): Promise<string>;
  migrating: { n: number; total: number } | null;
};

/** What GET /me/vault returns. */
type VaultRecord = { passWrapped: string; recoveryWrapped: string; publicKey: string; privateKeyWrapped: string; complete: boolean; updatedAt: string };

const Ctx = createContext<VaultValue | null>(null);

/** Thrown when a body must be encrypted or decrypted while the vault key is not in memory. Never a plaintext fallback. */
const lockedError = () => new Error("vault-locked");

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const t = useT();
  const userId = useSettings().me?.id ?? null;
  // State is tagged with the account it was read for, so another account starts at "loading" without a reset in the effect.
  const [state, setState] = useState<{ uid: string | null; status: VaultStatus; complete: boolean }>({ uid: null, status: "loading", complete: false });
  const [migrating] = useState<{ n: number; total: number } | null>(null);
  // Refs are the source of truth for the async methods, so a call made right after another sees its result.
  const statusRef = useRef<VaultStatus>("loading");
  const userRef = useRef<string | null>(null);
  const setStatus = useCallback((s: VaultStatus) => {
    statusRef.current = s;
    const uid = userRef.current;
    setState((p) => ({ uid, status: s, complete: p.uid === uid ? p.complete : false }));
  }, []);
  const setComplete = useCallback((c: boolean) => {
    const uid = userRef.current;
    setState((p) => ({ uid, status: p.uid === uid ? p.status : "loading", complete: c }));
  }, []);
  const status: VaultStatus = state.uid === userId ? state.status : "loading";
  const complete = state.uid === userId && state.complete;
  const record = useRef<VaultRecord | null>(null);
  /** The vault key. Held in this tab's memory only, never sent and never written anywhere in clear. */
  const vk = useRef<CryptoKey | null>(null);
  /** Unwrapped document keys, by `${docId}:${v}:${wrapped}`. Cleared on lock. */
  const dekCache = useRef(new Map<string, CryptoKey>());
  /** A document's first key, generated but not yet on the server: a retried first save must carry the same one. */
  const pendingDek = useRef(new Map<string, WrappedDek>());
  const unlocking = useRef<Promise<boolean> | null>(null);

  const forgetKeys = useCallback(() => { vk.current = null; dekCache.current.clear(); pendingDek.current.clear(); }, []);
  const opened = useCallback((key: CryptoKey) => { vk.current = key; if (statusRef.current !== "migrating") setStatus("unlocked"); }, [setStatus]);

  /** Keeps the remembered copy's passphrase wrap current after a change, when this computer remembers the vault. */
  const refreshRemembered = useCallback(async (passWrapped: string, key: CryptoKey) => {
    const uid = userRef.current;
    if (!uid) return;
    try { if (await hasRemembered(uid)) await rememberVault(uid, passWrapped, await crypto.subtle.exportKey("raw", key)); } catch { /* storage blocked: the session stays unlocked */ }
  }, []);
  const remember = useCallback(async (passWrapped: string, key: CryptoKey) => {
    const uid = userRef.current;
    if (!uid) return;
    try { await rememberVault(uid, passWrapped, await crypto.subtle.exportKey("raw", key)); } catch { /* storage blocked: unlocked for this tab only */ }
  }, []);

  const unlockRemembered = useCallback(async (): Promise<boolean> => {
    const uid = userRef.current;
    const rec = record.current;
    if (!uid || !rec) return false;
    if (vk.current) return true;
    let raw: ArrayBuffer | null;
    try { raw = await readRemembered(uid); } catch { return false; }
    if (!raw) return false;
    let key: CryptoKey;
    // The remembered key must open this account's current vault; a copy left from an erased or replaced vault is dropped.
    try {
      key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      await unwrapPrivateKey(rec.privateKeyWrapped, key);
    } catch {
      try { await forgetRemembered(uid); } catch { /* storage blocked */ }
      return false;
    }
    if (record.current !== rec || userRef.current !== uid) return false;
    opened(key);
    return true;
  }, [opened]);

  useEffect(() => {
    // A new account (or none): nothing of the previous one's vault stays in memory.
    userRef.current = userId;
    forgetKeys();
    record.current = null;
    statusRef.current = "loading";
    if (!userId) return;
    let live = true;
    apiFetch<VaultRecord>("/me/vault").then(
      (rec) => {
        if (!live) return;
        record.current = rec;
        setState({ uid: userId, status: "locked", complete: rec.complete });
        statusRef.current = "locked";
        void unlockRemembered();
      },
      (e: unknown) => { if (live && e instanceof ApiError && e.status === 404) setStatus("off"); /* otherwise: unknown, stay loading */ }
    );
    return () => { live = false; };
  }, [userId, forgetKeys, setStatus, unlockRemembered]);

  const setup = useCallback(async (pass: string, rememberIt: boolean) => {
    if (record.current) throw new Error("vault-exists");
    const key = await generateVaultKey();
    const recoveryCode = generateRecoveryCode();
    const kp = await generateKeypair();
    const body = {
      passWrapped: await wrapWithPassphrase(key, pass),
      recoveryWrapped: await wrapWithRecovery(key, recoveryCode),
      publicKey: kp.publicKeyB64,
      privateKeyWrapped: await wrapPrivateKey(kp.privateKey, key)
    };
    await apiFetch<void>("/me/vault", { method: "PUT", body: JSON.stringify(body) });
    record.current = { ...body, complete: false, updatedAt: new Date().toISOString() };
    setComplete(false);
    opened(key);
    if (rememberIt) await remember(body.passWrapped, key);
    return { recoveryCode };
  }, [opened, remember, setComplete]);

  const unlock = useCallback(async (pass: string, rememberIt: boolean) => {
    const rec = record.current;
    if (!rec) throw new Error("no-vault");
    const key = await unwrapWithPassphrase(rec.passWrapped, pass); // VaultError("wrong-passphrase") leaves everything as it was
    opened(key);
    if (rememberIt) await remember(rec.passWrapped, key);
  }, [opened, remember]);

  const recover = useCallback(async (code: string, newPass: string) => {
    const rec = record.current;
    if (!rec) throw new Error("no-vault");
    const key = await unwrapWithRecovery(rec.recoveryWrapped, code);
    const recoveryCode = generateRecoveryCode();
    const wraps = { passWrapped: await wrapWithPassphrase(key, newPass), recoveryWrapped: await wrapWithRecovery(key, recoveryCode) };
    await apiFetch("/me/vault/wraps", { method: "PATCH", body: JSON.stringify({ ...wraps, reason: "recovery-used" }) });
    record.current = { ...rec, ...wraps };
    opened(key);
    await refreshRemembered(wraps.passWrapped, key);
    return { recoveryCode };
  }, [opened, refreshRemembered]);

  const changePassphrase = useCallback(async (oldPass: string, newPass: string) => {
    const rec = record.current;
    if (!rec) throw new Error("no-vault");
    const key = await unwrapWithPassphrase(rec.passWrapped, oldPass);
    const passWrapped = await wrapWithPassphrase(key, newPass);
    await apiFetch("/me/vault/wraps", { method: "PATCH", body: JSON.stringify({ passWrapped, reason: "passphrase-changed" }) });
    record.current = { ...rec, passWrapped };
    opened(key);
    await refreshRemembered(passWrapped, key);
  }, [opened, refreshRemembered]);

  const lock = useCallback(() => {
    forgetKeys();
    if (record.current) setStatus("locked");
  }, [forgetKeys, setStatus]);

  const forgetThisComputer = useCallback(async () => {
    const uid = userRef.current;
    if (uid) await forgetRemembered(uid);
  }, []);

  const ensureUnlocked = useCallback((): Promise<boolean> => {
    if (vk.current) return Promise.resolve(true);
    if (!record.current) return Promise.resolve(false);
    // One prompt at a time: a second caller waits for the first instead of cancelling its dialog.
    unlocking.current ??= (async () => {
      try {
        if (await unlockRemembered()) return true;
        for (;;) {
          const pass = await askPassphrase({ kind: "vault-unlock" });
          if (pass === null) return false;
          try { await unlock(pass, false); return true; } catch (e) {
            if (!(e instanceof VaultError && e.code === "wrong-passphrase")) throw e;
            toast(t("vault_wrong"));
          }
        }
      } finally { unlocking.current = null; }
    })();
    return unlocking.current;
  }, [unlock, unlockRemembered, t]);

  const dekFor = useCallback(async (docId: string, dek: WrappedDek, key: CryptoKey): Promise<CryptoKey> => {
    const id = docId + ":" + dek.v + ":" + dek.wrapped;
    const hit = dekCache.current.get(id);
    if (hit) return hit;
    const k = await unwrapKey(dek.wrapped, key); // VaultError("corrupt") when it does not open under this vault key
    dekCache.current.set(id, k);
    return k;
  }, []);

  const encryptBody = useCallback(async (doc: { id: string; deks: WrappedDek[] }, html: string) => {
    const key = vk.current;
    if (!key) throw lockedError();
    if (doc.deks.length === 0) {
      let dek = pendingDek.current.get(doc.id);
      let dk: CryptoKey;
      if (dek) dk = await dekFor(doc.id, dek, key);
      else {
        dk = await generateDek();
        dek = { v: 1, wrapped: await wrapKey(dk, key) };
        pendingDek.current.set(doc.id, dek);
        dekCache.current.set(doc.id + ":1:" + dek.wrapped, dk);
      }
      return { bodyHtml: await encryptText(html, dk), keyVersion: 1, dek };
    }
    pendingDek.current.delete(doc.id);
    const top = doc.deks.reduce((a, b) => (b.v > a.v ? b : a));
    return { bodyHtml: await encryptText(html, await dekFor(doc.id, top, key)), keyVersion: top.v };
  }, [dekFor]);

  const decryptBody = useCallback(async (doc: { id: string; deks: WrappedDek[]; bodyHtml: string; keyVersion: number }) => {
    if (doc.keyVersion === 0) return doc.bodyHtml;
    const key = vk.current;
    if (!key) throw lockedError();
    const dek = doc.deks.find((d) => d.v === doc.keyVersion);
    if (!dek) throw new VaultError("corrupt");
    return decryptText(doc.bodyHtml, await dekFor(doc.id, dek, key)); // VaultError("corrupt") on any failure, never ""
  }, [dekFor]);

  const value = useMemo<VaultValue>(() => ({
    status, complete, setup, unlock, unlockRemembered, recover, changePassphrase, lock, forgetThisComputer, ensureUnlocked, encryptBody, decryptBody, migrating
  }), [status, complete, setup, unlock, unlockRemembered, recover, changePassphrase, lock, forgetThisComputer, ensureUnlocked, encryptBody, decryptBody, migrating]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVault(): VaultValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useVault must be used inside <VaultProvider>");
  return v;
}
