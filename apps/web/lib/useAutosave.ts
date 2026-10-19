"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { originCount, sanitizeHtml, wordCount, type OriginStats } from "@appuscholar/core";
import { apiFetch } from "./api";
import { isStaleKeys, isVaultLocked } from "./vault/errors";
import { useVault, type VaultValue, type WrappedDek } from "./vault/useVault";

/** "locked": the vault is locked and the student has not opened it, so the text is held in the editor and nothing is sent. */
export type SaveStatus = "saved" | "saving" | "error" | "dirty" | "locked";
type SaveResult = { seq: number; created: boolean };
/**
 * What PUT /documents/:id (and a document create) sends. Vault off: `{ bodyHtml, keyVersion: 0 }`, the server sanitises and counts.
 * With a vault: ciphertext under the document's key, the counts made in the browser, and the document's first key when it has none yet.
 */
export type SaveBody = { bodyHtml: string; keyVersion: number; wordCount?: number; originStats?: OriginStats; dek?: WrappedDek };

/** Backoff after a failed save: 2s, 4s, 8s, 16s, then every 30s until a save succeeds or the editor unmounts. */
export const RETRY_DELAYS_MS = [2000, 4000, 8000, 16000, 30000];

/** Leaving the page would lose work unless everything typed has been stored. */
export function shouldWarnOnUnload(status: SaveStatus): boolean {
  return status !== "saved";
}

const plaintext = async (html: string): Promise<SaveBody> => ({ bodyHtml: html, keyVersion: 0 });

export function createAutosaver(o: {
  initialHtml: string;
  save: (body: SaveBody) => Promise<SaveResult>;
  delayMs: number;
  onStatus?: (s: SaveStatus, seq?: number) => void;
  retryDelaysMs?: number[];
  /** Turns the editor's HTML into the body to send (default: plaintext, keyVersion 0). Throws Error("vault-locked") while the vault key is not in memory. */
  encrypt?: (html: string) => Promise<SaveBody>;
  /** Opens the vault, prompting the student: true once it is open, false when they cancelled. */
  ensureUnlocked?: () => Promise<boolean>;
  /** After a 409 vault-required or dek-exists: re-reads the document's keys and the vault before the one retry. */
  reload?: () => Promise<void>;
}) {
  const retryDelays = o.retryDelaysMs ?? RETRY_DELAYS_MS;
  const encrypt = o.encrypt ?? plaintext;
  let lastSaved = o.initialHtml;
  let pending: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryAttempt = 0;
  let active = true;
  let status: SaveStatus = "saved";
  let inflight: Promise<boolean> | null = null;
  /** The student cancelled the unlock: the text is held and no prompt comes back until the vault opens (resume). */
  let declined = false;
  const set = (s: SaveStatus, seq?: number) => { status = s; o.onStatus?.(s, seq); };
  const clearTimers = () => {
    if (timer) clearTimeout(timer);
    if (retryTimer) clearTimeout(retryTimer);
    timer = null;
    retryTimer = null;
  };
  function scheduleRetry() {
    if (!active) return;
    const delay = retryDelays[Math.min(retryAttempt, retryDelays.length - 1)] ?? 30000;
    retryAttempt++;
    retryTimer = setTimeout(() => { retryTimer = null; void flush(); }, delay);
  }
  /** Keeps text that could not be sent; newer text typed meanwhile wins. */
  const hold = (html: string) => { if (pending === null) pending = html; };

  /** The body to send, or null when the vault stays locked (status "locked", the text is held). Never plaintext in place of ciphertext. */
  async function seal(html: string): Promise<SaveBody | null> {
    // The api unreachable while the vault record is unknown: an answer slower than the first retry step reads as any other outage.
    const slow = setTimeout(() => set("error"), retryDelays[0] ?? 2000);
    try { return await encrypt(html); } catch (e) { if (!isVaultLocked(e)) throw e; } finally { clearTimeout(slow); }
    if (!declined && o.ensureUnlocked) {
      set("locked");
      // Once per attempt; the prompt may stay open as long as the student needs, that is not an outage.
      try { if (await o.ensureUnlocked()) return await encrypt(html); } catch (e) { if (!isVaultLocked(e)) throw e; }
    }
    declined = true;
    set("locked");
    return null;
  }

  async function attempt(html: string): Promise<boolean> {
    try {
      let body = await seal(html);
      if (!body) { hold(html); return false; }
      set("saving");
      let r: SaveResult;
      try { r = await o.save(body); } catch (e) {
        // Re-read the document's keys (and the vault), seal again, and try once more.
        if (!o.reload || !isStaleKeys(e)) throw e;
        await o.reload();
        body = await seal(html);
        if (!body) { hold(html); return false; }
        set("saving");
        r = await o.save(body);
      }
      lastSaved = html;
      retryAttempt = 0;
      // Typing during the request left newer text pending; its debounce timer is already running.
      set(pending !== null ? "dirty" : "saved", r.seq);
      return true;
    } catch {
      // Keep newer text typed during the failed request; only fall back to the failed body if nothing newer exists.
      hold(html);
      set("error");
      scheduleRetry();
      return false;
    }
  }

  /** Saves whatever is pending now. Resolves true when nothing is left unsaved, false when the save failed or the vault stayed locked. */
  async function flush(): Promise<boolean> {
    clearTimers();
    // Waiting on an unlock can take a while; a second flush queued behind the first must not report "saved" while it still runs.
    while (inflight) await inflight;
    const html = pending; pending = null;
    if (html === null || html === lastSaved) { set("saved"); return true; }
    const run = attempt(html);
    inflight = run;
    try { return await run; } finally { if (inflight === run) inflight = null; }
  }
  return {
    onChange(html: string) {
      if (html === lastSaved && pending === null) { set("saved"); return; }
      pending = html;
      if (declined) { set("locked"); return; }
      set(status === "locked" ? "locked" : "dirty");
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void flush(); }, o.delayMs);
    },
    flushNow: flush,
    /** The vault opened (the header pill, another prompt): text held after a cancelled unlock is saved now. */
    resume() {
      if (!declined) return;
      declined = false;
      if (pending !== null) void flush();
    },
    cancel() {
      clearTimers();
      pending = null;
    },
    /** Inactive savers never schedule retries (used on unmount); flushNow still works for a last attempt. */
    setActive(on: boolean) {
      active = on;
      if (!on && retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    },
    getStatus: () => status
  };
}

type SealVault = Pick<VaultValue, "known" | "encryptBody">;

/**
 * The body to store for a document's HTML. Vault off: the plaintext with keyVersion 0, as before the vault. Otherwise ciphertext under the
 * document's key (its first key travels along when it has none), with the counts the server can no longer make: the same sanitiser and the
 * same counting functions the server runs on plaintext. A vault that is still "loading" is waited for, never taken for "off".
 * Throws Error("vault-locked") while the vault is locked.
 */
export async function sealBody(vault: SealVault, doc: { id: string; deks: WrappedDek[] }, html: string): Promise<SaveBody> {
  if ((await vault.known()) === "off") return { bodyHtml: html, keyVersion: 0 };
  const clean = sanitizeHtml(html);
  const sealed = await vault.encryptBody(doc, clean);
  return { ...sealed, wordCount: wordCount(clean), originStats: originCount(clean) };
}

/**
 * The body fields of POST /projects/:id/documents for a new, empty document: `{ keyVersion: 0 }` with the vault off (the old request plus
 * keyVersion 0); with a vault, the vault is opened first and the empty body is encrypted under the document's first key. Null when the
 * student cancelled the unlock: nothing is to be created.
 */
export async function newDocumentBody(vault: SealVault & Pick<VaultValue, "ensureUnlocked">): Promise<{ keyVersion: number } & Partial<SaveBody> | null> {
  if ((await vault.known()) === "off") return { keyVersion: 0 };
  if (!(await vault.ensureUnlocked())) return null;
  // The document has no id yet: its first key is made under a placeholder and travels with the create request.
  return sealBody(vault, { id: "new:" + crypto.randomUUID(), deks: [] }, "");
}

/**
 * `deks`: the document's keys as loaded. `encrypt` replaces the vault sealing (tests); by default every save is sealed with `sealBody`,
 * a locked vault holds the text and asks for the passphrase once, and a 409 vault-required re-reads the document and retries once.
 */
export function useAutosave(docId: string, initialHtml: string, initialSeq: number, opts: { deks: WrappedDek[]; encrypt?: (html: string) => Promise<SaveBody> }) {
  const vault = useVault();
  // The saver outlives renders; it reads the newest vault and encrypt from here.
  const vaultRef = useRef(vault);
  useEffect(() => { vaultRef.current = vault; }, [vault]);
  const encryptRef = useRef(opts.encrypt);
  useEffect(() => { encryptRef.current = opts.encrypt; }, [opts.encrypt]);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [currentSeq, setSeq] = useState(initialSeq);
  const initialDeks = opts.deks;
  const saver = useMemo(() => {
    // This document's keys as the server has them: updated by every save and by the re-read after a 409.
    const doc = { id: docId, deks: initialDeks };
    // eslint-disable-next-line react-hooks/refs -- the refs are read only inside callbacks that run when a save does, never during render
    return createAutosaver({
      initialHtml,
      delayMs: 1500,
      encrypt: (html) => encryptRef.current ? encryptRef.current(html) : sealBody(vaultRef.current, doc, html),
      ensureUnlocked: () => vaultRef.current.ensureUnlocked(),
      reload: async () => {
        const fresh = await apiFetch<{ deks: WrappedDek[] }>(`/documents/${docId}`);
        doc.deks = fresh.deks;
        // This tab may still believe there is no vault: ask again, so the retry is sealed.
        await vaultRef.current.known(true);
      },
      save: async (body) => {
        const r = await apiFetch<{ document?: { deks?: WrappedDek[] }; revision: { seq: number }; created: boolean }>(`/documents/${docId}`, { method: "PUT", body: JSON.stringify(body) });
        if (r.document?.deks) doc.deks = r.document.deks;
        return { seq: r.revision.seq, created: r.created };
      },
      onStatus: (s, seq) => { setStatus(s); if (seq) setSeq(seq); }
    });
  }, [docId, initialHtml, initialDeks]);
  const open = vault.status === "unlocked" || vault.status === "migrating";
  useEffect(() => { if (open) saver.resume(); }, [open, saver]);
  useEffect(() => {
    saver.setActive(true);
    return () => { saver.setActive(false); void saver.flushNow(); };
  }, [saver]);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (shouldWarnOnUnload(saver.getStatus())) { e.preventDefault(); } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [saver]);
  return { status, currentSeq, onChange: saver.onChange, flushNow: saver.flushNow };
}
