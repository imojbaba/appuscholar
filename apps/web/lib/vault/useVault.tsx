"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { toast } from "@/components/ui/toast";
import { askVaultUnlock } from "@/components/workspace/dialogs/Passphrase";
import {
  decryptText, encryptText, generateDek, generateKeypair, generateRecoveryCode, generateVaultKey, sealVaultCheck, unwrapKey,
  unwrapWithPassphrase, unwrapWithRecovery, VaultError, verifyVaultKey, wrapKey, wrapPrivateKey, wrapWithPassphrase, wrapWithRecovery
} from "./crypto";
import { migrateToVault } from "./migrate";
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
  /**
   * Prompts via askVaultUnlock until correct or cancelled (its "Remember on this computer" box is honoured). While the one-off migration
   * runs it resolves once the migration has finished, so a write held by encryptBody goes out after it and never races its rewrites or a
   * document's first key.
   */
  ensureUnlocked(): Promise<boolean>;
  /** The vault exists but is not complete and no migration runs: finish it now (unlocking first when locked). */
  resumeMigration(): Promise<void>;
  /**
   * The status once this account's vault record has been read ("off" when there is none); stays pending while the api is unreachable,
   * so "loading" is never mistaken for "off". `recheck` asks the server again when this tab has seen no vault: another tab may have set one up.
   */
  known(recheck?: boolean): Promise<VaultStatus>;
  /** Throws Error("vault-locked") while locked, and while the one-off migration runs (a write is held until it is done; see ensureUnlocked). */
  encryptBody(doc: { id: string; deks: WrappedDek[] }, html: string): Promise<{ bodyHtml: string; keyVersion: number; dek?: WrappedDek }>;
  decryptBody(doc: { id: string; deks: WrappedDek[]; bodyHtml: string; keyVersion: number }): Promise<string>;
  /** Documents done of all documents while the one-off migration runs (status "migrating"), else null. */
  migrating: { n: number; total: number } | null;
  /** Encrypts a short secret (an AI key) under the vault key: iv.ct. Throws "vault-locked" while locked; the vault key itself never leaves. */
  wrapSecret(text: string): Promise<string>;
  /** Opens a wrapSecret blob. Throws "vault-locked" while locked, VaultError("corrupt") when it does not open under this vault key. */
  unwrapSecret(blob: string): Promise<string>;
};

/** What GET /me/vault returns (and PUT /me/vault, PATCH /me/vault/wraps). The sharing keypair is null where the browser had no X25519. */
type VaultRecord = { passWrapped: string; recoveryWrapped: string; checkWrapped: string; publicKey: string | null; privateKeyWrapped: string | null; complete: boolean; updatedAt: string };

const Ctx = createContext<VaultValue | null>(null);

/** Thrown when a body must be encrypted or decrypted while the vault key is not in memory. Never a plaintext fallback. */
const lockedError = () => new Error("vault-locked");
/** Thrown when another account signed in while a vault operation was under way: its result is dropped, never applied to the new account. */
const changedError = () => new Error("vault-changed");
/** GET /me/vault retries after a network or server failure: 1 s, 2 s, 4 s … up to 30 s, and at once when the browser comes back online. */
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 30_000;
/** PATCH /me/vault/wraps refused because the record changed since this tab read it (another tab or device). */
const isStale = (e: unknown) => e instanceof ApiError && e.status === 409 && e.code === "stale";
/** A wrong passphrase or recovery code, as the unwrap reports it. */
const isWrongSecret = (e: unknown) => e instanceof VaultError && (e.code === "wrong-passphrase" || e.code === "wrong-code");

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const t = useT();
  const me = useSettings().me;
  const userId = me?.id ?? null;
  // The migration's toast and scratch project are read when it ends or starts, not on render: a language change must not re-create the methods.
  const tRef = useRef(t);
  const scratchRef = useRef<string | null>(null);
  const scratchId = me?.scratchProjectId ?? null;
  useEffect(() => { tRef.current = t; scratchRef.current = scratchId; }, [t, scratchId]);
  // State is tagged with the account it was read for, so another account starts at "loading" without a reset in the effect.
  const [state, setState] = useState<{ uid: string | null; status: VaultStatus; complete: boolean }>({ uid: null, status: "loading", complete: false });
  const [migrating, setMigrating] = useState<{ n: number; total: number } | null>(null);
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
  /** Settles when this account's GET /me/vault has answered (record or 404), or when the account changes. */
  const loading = useRef<Promise<void> | null>(null);
  /** Bumped on every account change; an operation started under an older epoch must not touch the session. */
  const epoch = useRef(0);
  /** The one-off migration while it runs. Writes wait for it (encryptBody refuses, ensureUnlocked resolves after it). */
  const migration = useRef<Promise<void> | null>(null);
  /** The migration has run (or is running) in this session for this account; a failed run is tried again at the next unlock, when the
   *  browser comes back online, or from the pill. */
  const migrated = useRef(false);
  /** The sharing keypair has been tried in this session (a vault set up where X25519 was missing gets one later, once). */
  const keypairTried = useRef(false);

  const forgetKeys = useCallback(() => { vk.current = null; dekCache.current.clear(); pendingDek.current.clear(); }, []);

  const dekFor = useCallback(async (docId: string, dek: WrappedDek, key: CryptoKey): Promise<CryptoKey> => {
    const id = docId + ":" + dek.v + ":" + dek.wrapped;
    const hit = dekCache.current.get(id);
    if (hit) return hit;
    const k = await unwrapKey(dek.wrapped, key); // VaultError("corrupt") when it does not open under this vault key
    dekCache.current.set(id, k);
    return k;
  }, []);

  /** encryptBody without the migration's hold: the migration itself seals with this. */
  const seal = useCallback(async (doc: { id: string; deks: WrappedDek[] }, html: string) => {
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

  /**
   * The one-off migration of plaintext revisions, once per session after the first unlock while the vault is not complete. Every
   * document of every project and the scratch space, soft-deleted ones included, is read and rewritten in place, then the vault completes.
   */
  const startMigration = useCallback(() => {
    const rec = record.current;
    if (!rec || rec.complete || migrated.current || migration.current) return;
    migrated.current = true;
    const mine = epoch.current;
    const live = () => { if (epoch.current !== mine) throw changedError(); };
    const call = <T,>(path: string, init?: RequestInit): Promise<T> => { live(); return apiFetch<T>(path, init); };
    setMigrating(null); // nothing left from a run under another account: the count arrives with the first listing
    let counted = false;
    setStatus("migrating");
    let run!: Promise<void>;
    run = (async () => {
      let done = false;
      let failed = false;
      try {
        await migrateToVault({
          listAll: async () => {
            const ids = (await call<{ id: string }[]>("/projects")).map((p) => p.id);
            const scratch = scratchRef.current;
            if (scratch && !ids.includes(scratch)) ids.push(scratch);
            const docs = (await Promise.all(ids.map((id) => call<{ id: string; deks: WrappedDek[] }[]>(`/projects/${id}/documents?includeDeleted=1`)))).flat();
            live();
            // The checking passes (and a dek-exists re-read) list again; the progress stays the first pass's.
            if (!counted) { counted = true; setMigrating({ n: 0, total: docs.length }); }
            return docs;
          },
          listRevisions: (id) => call(`/documents/${id}/revisions?includeDeleted=1`),
          getRevision: (id, seq) => call(`/documents/${id}/revisions/${seq}?includeDeleted=1`),
          addDek: async (id, dek) => { await call(`/documents/${id}/deks`, { method: "POST", body: JSON.stringify(dek) }); },
          rewrite: async (id, seq, body) => { await call(`/documents/${id}/revisions/${seq}/rewrite`, { method: "PUT", body: JSON.stringify(body) }); },
          complete: () => call<void>("/me/vault/complete", { method: "POST" }),
          encrypt: async (doc, html) => { live(); return seal(doc, html); },
          onProgress: (n, total) => { if (epoch.current === mine) setMigrating({ n, total }); }
        });
        done = true;
      } catch (e) {
        if (epoch.current !== mine) return;
        if (e instanceof ApiError && e.status === 409 && e.code === "migration-closed") {
          // Another tab completed the migration: stop here and take the vault record as it is now.
          try {
            const fresh = await apiFetch<VaultRecord>("/me/vault");
            if (epoch.current === mine) { record.current = fresh; setComplete(fresh.complete); }
          } catch { /* the record stays as it was; the next load reads it */ }
        } else {
          // Interrupted (offline, locked meanwhile): what is still plaintext is picked up by the next run (unlock, back online, the pill).
          migrated.current = false;
          failed = true;
        }
      } finally {
        if (migration.current === run) migration.current = null;
        if (epoch.current === mine) {
          setMigrating(null);
          if (done && record.current) { record.current = { ...record.current, complete: true }; setComplete(true); }
          if (statusRef.current === "migrating") setStatus(vk.current ? "unlocked" : "locked");
          if (done) toast(tRef.current("vault_migrated"));
          if (failed) toast(tRef.current("vault_migrate_fail"));
        }
      }
    })();
    migration.current = run;
  }, [seal, setComplete, setStatus]);

  /** Takes a vault record the server answered, keeping a completion this tab already knows of. */
  const adopt = useCallback((rec: VaultRecord) => {
    record.current = { ...rec, complete: rec.complete || (record.current?.complete ?? false) };
    setComplete(record.current.complete);
  }, [setComplete]);

  /** Reads the vault record again. Null when it is unchanged (same updatedAt) or cannot be read now; throws "vault-changed" after an account switch. */
  const reread = useCallback(async (mine: number): Promise<VaultRecord | null> => {
    const before = record.current;
    let fresh: VaultRecord;
    try { fresh = await apiFetch<VaultRecord>("/me/vault"); } catch { if (epoch.current !== mine) throw changedError(); return null; }
    if (epoch.current !== mine) throw changedError();
    if (before && fresh.updatedAt === before.updatedAt) return null;
    adopt(fresh);
    return record.current;
  }, [adopt]);

  /**
   * Opens the vault key with `open` against the record this tab holds, and checks it against the record's check blob. A wrong passphrase or
   * code may only mean the record is stale (changed in another tab or on another device): then the record is read once more and, if it
   * changed, the secret is tried against the new one before "wrong" is reported.
   */
  const openRecord = useCallback(async (mine: number, open: (rec: VaultRecord) => Promise<CryptoKey>): Promise<{ key: CryptoKey; rec: VaultRecord }> => {
    const rec = record.current;
    if (!rec) throw new Error("no-vault");
    const attempt = async (r: VaultRecord) => { const key = await open(r); await verifyVaultKey(r.checkWrapped, key); return { key, rec: r }; };
    try { return await attempt(rec); } catch (e) {
      if (!isWrongSecret(e)) throw e;
      const fresh = await reread(mine);
      if (!fresh) throw e;
      return attempt(fresh);
    }
  }, [reread]);

  /** A vault set up where X25519 was missing gets its sharing keypair the first time a session opens it where X25519 is there. */
  const addKeypair = useCallback(async (key: CryptoKey) => {
    const rec = record.current;
    if (!rec || rec.publicKey !== null || keypairTried.current) return;
    keypairTried.current = true;
    const mine = epoch.current;
    try {
      const kp = await generateKeypair(); // VaultError("no-crypto") here: still none, the vault works without it
      const body = { publicKey: kp.publicKeyB64, privateKeyWrapped: await wrapPrivateKey(kp.privateKey, key), reason: "keypair-added", expectUpdatedAt: rec.updatedAt };
      if (epoch.current !== mine) return;
      const saved = await apiFetch<VaultRecord>("/me/vault/wraps", { method: "PATCH", body: JSON.stringify(body) });
      if (epoch.current === mine) adopt(saved);
    } catch { /* no X25519, offline, or the record changed meanwhile: the next session tries again */ }
  }, [adopt]);

  const opened = useCallback((key: CryptoKey) => {
    vk.current = key;
    if (statusRef.current !== "migrating") setStatus("unlocked");
    startMigration();
    void addKeypair(key);
  }, [setStatus, startMigration, addKeypair]);

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
    const mine = epoch.current;
    await loading.current;
    if (epoch.current !== mine) return false;
    const uid = userRef.current;
    const rec = record.current;
    if (!uid || !rec) return false;
    if (vk.current) return true;
    let raw: ArrayBuffer | null;
    try { raw = await readRemembered(uid); } catch { return false; }
    if (!raw) return false;
    let key: CryptoKey;
    // The remembered key must open this account's current vault (its check blob); a copy left from an erased or replaced vault is dropped.
    try {
      key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      await verifyVaultKey(rec.checkWrapped, key);
    } catch {
      try { await forgetRemembered(uid); } catch { /* storage blocked */ }
      return false;
    }
    if (epoch.current !== mine) return false;
    opened(key);
    return true;
  }, [opened]);

  useEffect(() => {
    // A new account (or none): nothing of the previous one's vault stays in memory.
    userRef.current = userId;
    epoch.current++;
    forgetKeys();
    record.current = null;
    statusRef.current = "loading";
    unlocking.current = null;
    migration.current = null;
    migrated.current = false;
    keypairTried.current = false;
    if (!userId) { loading.current = null; return; }
    let live = true;
    let inflight = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settle!: () => void;
    loading.current = new Promise<void>((r) => { settle = r; });
    const load = () => {
      if (!live || inflight) return;
      clearTimeout(timer);
      inflight = true;
      apiFetch<VaultRecord>("/me/vault").then(
        (rec) => {
          inflight = false;
          if (!live) return;
          record.current = rec;
          setState({ uid: userId, status: "locked", complete: rec.complete });
          statusRef.current = "locked";
          settle();
          void unlockRemembered();
        },
        (e: unknown) => {
          inflight = false;
          if (!live) return;
          if (e instanceof ApiError && e.status === 404) { setStatus("off"); settle(); return; }
          // Network or server failure: the vault's state is unknown, so stay "loading" (never "off") and try again.
          timer = setTimeout(load, Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** attempt++));
        }
      );
    };
    window.addEventListener("online", load);
    load();
    return () => { live = false; clearTimeout(timer); window.removeEventListener("online", load); settle(); };
  }, [userId, forgetKeys, setStatus, unlockRemembered]);

  const setup = useCallback(async (pass: string, rememberIt: boolean) => {
    const mine = epoch.current;
    if (record.current) throw new Error("vault-exists");
    const key = await generateVaultKey();
    const recoveryCode = generateRecoveryCode();
    // The sharing keypair needs X25519; a browser without it sets the vault up without one (a later unlock adds it where it can).
    let kp: { publicKeyB64: string; privateKey: CryptoKey } | null = null;
    try { kp = await generateKeypair(); } catch (e) { if (!(e instanceof VaultError && e.code === "no-crypto")) throw e; }
    if (!kp) keypairTried.current = true; // not again in this session
    const body = {
      passWrapped: await wrapWithPassphrase(key, pass),
      recoveryWrapped: await wrapWithRecovery(key, recoveryCode),
      checkWrapped: await sealVaultCheck(key),
      publicKey: kp ? kp.publicKeyB64 : null,
      privateKeyWrapped: kp ? await wrapPrivateKey(kp.privateKey, key) : null
    };
    if (epoch.current !== mine) throw changedError();
    let saved: VaultRecord;
    try {
      saved = await apiFetch<VaultRecord>("/me/vault", { method: "PUT", body: JSON.stringify(body) });
    } catch (e) {
      // 409: the vault was set up meanwhile (another tab or device). Read it, so this tab shows it locked instead of "off".
      if (e instanceof ApiError && e.status === 409 && epoch.current === mine) {
        try {
          const rec = await apiFetch<VaultRecord>("/me/vault");
          if (epoch.current === mine && !vk.current) { record.current = rec; setStatus("locked"); setComplete(rec.complete); }
        } catch { /* stays as it was; the next load reads it */ }
      }
      throw e;
    }
    if (epoch.current !== mine) return { recoveryCode };
    record.current = saved;
    setComplete(saved.complete);
    opened(key);
    if (rememberIt) await remember(body.passWrapped, key);
    return { recoveryCode };
  }, [opened, remember, setComplete, setStatus]);

  const unlock = useCallback(async (pass: string, rememberIt: boolean) => {
    const mine = epoch.current;
    // VaultError("wrong-passphrase") (after one re-read of the record) leaves everything as it was.
    const { key, rec } = await openRecord(mine, (r) => unwrapWithPassphrase(r.passWrapped, pass));
    if (epoch.current !== mine) throw changedError();
    opened(key);
    if (rememberIt) await remember(rec.passWrapped, key);
  }, [opened, openRecord, remember]);

  /**
   * Sends new wraps with the record they replace as precondition. Answered 409 stale (changed elsewhere meanwhile), the record is read again
   * and `again` re-derives the wraps against it, once; a second refusal, or a wrong secret against the new record, is thrown to the caller.
   */
  const patchWraps = useCallback(async (
    mine: number, rec: VaultRecord, wraps: Record<string, string>, reason: string,
    again: (fresh: VaultRecord) => Promise<{ rec: VaultRecord; wraps: Record<string, string> }>
  ): Promise<VaultRecord> => {
    const send = (r: VaultRecord, w: Record<string, string>) => {
      if (epoch.current !== mine) throw changedError();
      return apiFetch<VaultRecord>("/me/vault/wraps", { method: "PATCH", body: JSON.stringify({ ...w, reason, expectUpdatedAt: r.updatedAt }) });
    };
    try { return await send(rec, wraps); } catch (e) {
      if (!isStale(e)) throw e;
      const fresh = await apiFetch<VaultRecord>("/me/vault");
      if (epoch.current !== mine) throw changedError();
      adopt(fresh);
      const next = await again(record.current!);
      return send(next.rec, next.wraps);
    }
  }, [adopt]);

  const recover = useCallback(async (code: string, newPass: string) => {
    const mine = epoch.current;
    const recoveryCode = generateRecoveryCode();
    const derive = async (key: CryptoKey) => ({ passWrapped: await wrapWithPassphrase(key, newPass), recoveryWrapped: await wrapWithRecovery(key, recoveryCode) });
    let { key, rec } = await openRecord(mine, (r) => unwrapWithRecovery(r.recoveryWrapped, code));
    let wraps = await derive(key);
    if (epoch.current !== mine) throw changedError();
    // A code made void meanwhile (a recovery or change on another device) fails here, against the record as it is now.
    const saved = await patchWraps(mine, rec, wraps, "recovery-used", async (fresh) => {
      key = await unwrapWithRecovery(fresh.recoveryWrapped, code);
      await verifyVaultKey(fresh.checkWrapped, key);
      rec = fresh;
      wraps = await derive(key);
      return { rec, wraps };
    });
    if (epoch.current !== mine) return { recoveryCode };
    adopt(saved);
    opened(key);
    await refreshRemembered(wraps.passWrapped, key);
    return { recoveryCode };
  }, [adopt, opened, openRecord, patchWraps, refreshRemembered]);

  const changePassphrase = useCallback(async (oldPass: string, newPass: string) => {
    const mine = epoch.current;
    let { key, rec } = await openRecord(mine, (r) => unwrapWithPassphrase(r.passWrapped, oldPass));
    let passWrapped = await wrapWithPassphrase(key, newPass);
    if (epoch.current !== mine) throw changedError();
    const saved = await patchWraps(mine, rec, { passWrapped }, "passphrase-changed", async (fresh) => {
      key = await unwrapWithPassphrase(fresh.passWrapped, oldPass);
      await verifyVaultKey(fresh.checkWrapped, key);
      rec = fresh;
      passWrapped = await wrapWithPassphrase(key, newPass);
      return { rec, wraps: { passWrapped } };
    });
    if (epoch.current !== mine) return;
    adopt(saved);
    opened(key);
    await refreshRemembered(passWrapped, key);
  }, [adopt, opened, openRecord, patchWraps, refreshRemembered]);

  const lock = useCallback(() => {
    forgetKeys();
    if (record.current) setStatus("locked");
  }, [forgetKeys, setStatus]);

  const forgetThisComputer = useCallback(async () => {
    const uid = userRef.current;
    if (uid) await forgetRemembered(uid);
  }, []);

  const openNow = useCallback((): Promise<boolean> => {
    if (vk.current) return Promise.resolve(true);
    // One prompt at a time: a second caller waits for the first instead of cancelling its dialog.
    if (unlocking.current) return unlocking.current;
    const mine = epoch.current;
    let run!: Promise<boolean>;
    run = (async () => {
      try {
        // While GET /me/vault is in flight the answer is not "no vault" yet: wait for it (it retries until it gets one).
        await loading.current;
        if (epoch.current !== mine) return false;
        if (vk.current) return true;
        if (!record.current) return false;
        if (await unlockRemembered()) return true;
        // After a wrong passphrase the next ask shows the verdict inside the window (O9): the toast alone goes unseen behind the modal.
        let verdict: string | undefined;
        for (;;) {
          const answer = await askVaultUnlock(verdict ? { verdict } : {});
          if (answer === null || epoch.current !== mine) return false;
          try { await unlock(answer.pass, answer.remember); return true; } catch (e) {
            if (epoch.current !== mine) return false;
            if (!(e instanceof VaultError && e.code === "wrong-passphrase")) throw e;
            verdict = t("vault_wrong");
            toast(verdict);
          }
        }
      } finally { if (unlocking.current === run) unlocking.current = null; }
    })();
    unlocking.current = run;
    return run;
  }, [unlock, unlockRemembered, t]);

  const ensureUnlocked = useCallback(async (): Promise<boolean> => {
    for (;;) {
      // A write waits for the migration (one started by this very unlock too); the migration's run never rejects.
      const m = migration.current;
      if (m) { await m; continue; }
      if (!(await openNow())) return false;
      if (!migration.current) return true;
    }
  }, [openNow]);

  const resumeMigration = useCallback(async () => {
    const rec = record.current;
    if (!rec || rec.complete || migration.current) return;
    if (!vk.current) { await ensureUnlocked(); return; } // unlocking starts it
    startMigration();
  }, [ensureUnlocked, startMigration]);

  // Back online: an unfinished migration (a run that failed while offline) carries on by itself.
  useEffect(() => {
    const retry = () => { if (vk.current && record.current && !record.current.complete) startMigration(); };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [startMigration]);

  const known = useCallback(async (recheck = false): Promise<VaultStatus> => {
    const mine = epoch.current;
    await loading.current;
    if (recheck && epoch.current === mine && statusRef.current === "off") {
      try {
        const rec = await apiFetch<VaultRecord>("/me/vault");
        if (epoch.current === mine && !record.current) {
          record.current = rec;
          statusRef.current = "locked";
          setState({ uid: userRef.current, status: "locked", complete: rec.complete });
          void unlockRemembered();
        }
      } catch { /* 404: still none; a failure leaves it as it was */ }
    }
    return statusRef.current;
  }, [unlockRemembered]);

  const encryptBody = useCallback(async (doc: { id: string; deks: WrappedDek[] }, html: string) => {
    // Held while the migration runs, the way a locked vault holds it: the editor keeps the text and ensureUnlocked releases it afterwards.
    if (migration.current) throw lockedError();
    return seal(doc, html);
  }, [seal]);

  const decryptBody = useCallback(async (doc: { id: string; deks: WrappedDek[]; bodyHtml: string; keyVersion: number }) => {
    if (doc.keyVersion === 0) return doc.bodyHtml;
    const key = vk.current;
    if (!key) throw lockedError();
    const dek = doc.deks.find((d) => d.v === doc.keyVersion);
    if (!dek) throw new VaultError("corrupt");
    return decryptText(doc.bodyHtml, await dekFor(doc.id, dek, key)); // VaultError("corrupt") on any failure, never ""
  }, [dekFor]);

  const wrapSecret = useCallback(async (text: string) => {
    const key = vk.current;
    if (!key) throw lockedError();
    return encryptText(text, key);
  }, []);
  const unwrapSecret = useCallback(async (blob: string) => {
    const key = vk.current;
    if (!key) throw lockedError();
    return decryptText(blob, key);
  }, []);

  const value = useMemo<VaultValue>(() => ({
    status, complete, setup, unlock, unlockRemembered, recover, changePassphrase, lock, forgetThisComputer, ensureUnlocked, resumeMigration, known, encryptBody,
    decryptBody, migrating, wrapSecret, unwrapSecret
  }), [status, complete, setup, unlock, unlockRemembered, recover, changePassphrase, lock, forgetThisComputer, ensureUnlocked, resumeMigration, known, encryptBody,
    decryptBody, migrating, wrapSecret, unwrapSecret]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVault(): VaultValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useVault must be used inside <VaultProvider>");
  return v;
}
