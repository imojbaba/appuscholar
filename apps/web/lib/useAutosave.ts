"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { originCount, sanitizeHtml, wordCount, type OriginStats } from "@appuscholar/core";
import { apiFetch } from "./api";
import { isStaleKeys, isVaultLocked } from "./vault/errors";
import { useVault, type VaultValue, type WrappedDek } from "./vault/useVault";
import { sealTitle, type TitleFields } from "./vault/titles";
import { toast } from "@/components/ui/toast";
import { useT } from "./i18n";

/**
 * "locked": the vault is locked and the student has not opened it, so the text is held in the editor and nothing is sent.
 * "too-large": the api refused the body as over its size limit (HTTP 413). Sending it again cannot help, so nothing is retried until the text changes.
 */
export type SaveStatus = "saved" | "saving" | "error" | "dirty" | "locked" | "too-large";
type SaveResult = { seq: number; created: boolean };
/**
 * What PUT /documents/:id (and a document create) sends. Vault off: `{ bodyHtml, keyVersion: 0 }`, the server sanitises and counts.
 * With a vault: ciphertext under the document's key, the counts made in the browser, and the document's first key when it has none yet.
 */
export type SaveBody = { bodyHtml: string; keyVersion: number; wordCount?: number; originStats?: OriginStats; dek?: WrappedDek };

/** Backoff after a failed save: 2s, 4s, 8s, 16s, then every 30s until a save succeeds or the editor unmounts. */
export const RETRY_DELAYS_MS = [2000, 4000, 8000, 16000, 30000];

/**
 * Document text that could not be saved before its editor went away (the browser's Back out of a project, a project switch), kept for this tab
 * by document id until that document opens again: its editor then shows the text and saves it with the normal retries. Memory only, as the
 * held blob values (lib/blobs/held.ts): the text is plaintext and never written to storage; while anything is held, leaving the page asks.
 */
const heldText = new Map<string, string>();
/** Last saves of editors that went away, still in flight: leaving the page meanwhile asks too. */
const lastSaves = new Set<Promise<unknown>>();
let listening = false;
function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("beforeunload", (e) => { if (heldDocs.size > 0) e.preventDefault(); });
}
export const heldDocs = {
  /** Held texts plus last saves still running. */
  get size() { return heldText.size + lastSaves.size; },
  has: (docId: string) => heldText.has(docId),
  html: (docId: string): string | undefined => heldText.get(docId),
  /** Keeps the text for a document, replacing what was held for it. */
  put(docId: string, html: string) { heldText.set(docId, html); listen(); },
  /** A document's text reached the server from a mounted editor: what was held for it is older. */
  drop(docId: string) { heldText.delete(docId); },
  /** Removes and answers the text held for a document (its editor mounting adopts it). */
  take(docId: string): string | null {
    const html = heldText.get(docId);
    if (html === undefined) return null;
    heldText.delete(docId);
    return html;
  },
  /** Counts `p` as a last save in flight until it settles. */
  track(p: Promise<unknown>) {
    lastSaves.add(p);
    listen();
    void p.finally(() => { lastSaves.delete(p); });
  },
  /** Tests only. */
  clear() { heldText.clear(); lastSaves.clear(); }
};

/** Leaving the page would lose work unless everything typed has been stored, here and in any document held after its editor went away. */
export function shouldWarnOnUnload(status: SaveStatus): boolean {
  return status !== "saved" || heldDocs.size > 0;
}

const plaintext = async (html: string): Promise<SaveBody> => ({ bodyHtml: html, keyVersion: 0 });

/** The api answered 413 `too-large` (apiFetch's ApiError carries the HTTP status). Read off the status, so a 413 from a proxy in front of the api counts too. */
const isTooLarge = (e: unknown): boolean => typeof e === "object" && e !== null && (e as { status?: unknown }).status === 413;

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
  /** The text of the save in flight, until it settles. */
  let sending: string | null = null;
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
    } catch (e) {
      // Keep newer text typed during the failed request; only fall back to the failed body if nothing newer exists.
      hold(html);
      // The same body is refused every time: no retry timer. The next change (onChange) sends the edited text, a smaller one if a picture went.
      if (isTooLarge(e)) { set("too-large"); return false; }
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
    sending = html;
    try { return await run; } finally { if (inflight === run) { inflight = null; sending = null; } }
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
    getStatus: () => status,
    /** The newest text not yet on the server (typed, held after a failure, or in flight), or null when everything is saved. */
    unsaved: (): string | null => pending ?? sending
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
 * student cancelled the unlock: nothing is to be created. With `title`, the title fields come too: sealed under the same first key (a
 * document's title and body share its deks), or as typed with the vault off.
 */
export async function newDocumentBody(vault: SealVault & Pick<VaultValue, "ensureUnlocked">, title?: string): Promise<{ keyVersion: number } & Partial<SaveBody> & Partial<TitleFields> | null> {
  if ((await vault.known()) === "off") return { keyVersion: 0, ...(title !== undefined ? { title, titleKeyVersion: 0 } : {}) };
  if (!(await vault.ensureUnlocked())) return null;
  // The document has no id yet: its first key is made under a placeholder and travels with the create request.
  const id = "new:" + crypto.randomUUID();
  const body = await sealBody(vault, { id, deks: [] }, "");
  if (title === undefined) return body;
  // The body's dek is the document's only one: the title is sealed under it, and the dek travels once (with the body).
  const sealed = await sealTitle(vault, id, body.dek ? [body.dek] : [], title);
  return { ...body, title: sealed.title, titleKeyVersion: sealed.titleKeyVersion };
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
  const t = useT();
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [currentSeq, setSeq] = useState(initialSeq);
  // Text held after this document's editor last went away unsaved: the editor opens with it, and the mount below saves it.
  const [restored] = useState(() => heldDocs.html(docId) ?? null);
  /** Set while restored text is being saved: its first successful save says so. */
  const announce = useRef(false);
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
      onStatus: (s, seq) => {
        setStatus(s);
        if (seq) setSeq(seq);
        if (s !== "saved" || !seq) return;
        heldDocs.drop(docId);
        if (announce.current) { announce.current = false; toast(tRef.current("doc_held_saved")); }
      }
    });
  }, [docId, initialHtml, initialDeks]);
  const open = vault.status === "unlocked" || vault.status === "migrating";
  useEffect(() => { if (open) saver.resume(); }, [open, saver]);
  useEffect(() => {
    saver.setActive(true);
    const held = heldDocs.take(docId);
    // Saved as typed text is: after the debounce, with the normal retries.
    if (held !== null) { announce.current = true; saver.onChange(held); }
    return () => {
      saver.setActive(false);
      // One last try with no retries. Text it could not save is held in memory, and saved when this document opens again in this tab.
      const left = saver.unsaved();
      const last = saver.flushNow().then((ok) => { const html = saver.unsaved() ?? left; if (!ok && html !== null) heldDocs.put(docId, html); });
      if (left !== null) heldDocs.track(last);
    };
  }, [saver, docId]);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (shouldWarnOnUnload(saver.getStatus())) { e.preventDefault(); } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [saver]);
  return { status, currentSeq, onChange: saver.onChange, flushNow: saver.flushNow, restored };
}
