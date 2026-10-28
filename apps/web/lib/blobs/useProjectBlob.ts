"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";
import { isStaleKeys, isVaultLocked } from "@/lib/vault/errors";
import { announceBlob, onBlobAnnounced } from "@/lib/popout/channel";
import { blobWritable } from "@/lib/popout/mode";
import { useVault, type VaultAsker, type VaultValue, type WrappedDek } from "@/lib/vault/useVault";
import { applyOps, compactOps, heldBlobs, type HeldOp } from "./held";
import { BLOB_KINDS, blobId, parseBlob, type BlobKind, type BlobShape } from "./kinds";

/**
 * The kinds whose panel never asks (R16) before it sets over a blob that does not open: the idea intake, and the preferences (the Research
 * panel's rank, and the stage 3 to 6 tools' `*_prefs`, fix round 1 of Task G3), where a toggle should not ask, and wave D's `writing_samples` (a copy of the typed words that is rebuilt from the documents). A value set over an unreadable
 * one stays held and is never saved over it unasked. Every other kind, each tool's work among them, is guarded.
 */
const UNGUARDED: ReadonlySet<BlobKind> = new Set<BlobKind>(["idea_intake", "rs_prefs", "stats_prefs", "qual_prefs", "words_prefs", "close_prefs", "writing_samples"]);

/**
 * The kinds that hold names and are only ever stored sealed (R17; the api refuses them in plaintext, SEALED_ONLY_KINDS in apps/api/src/routes/blobWrite.ts). With the vault off a save of one
 * sends nothing and holds nothing: it is refused, and the state reports it as a failed save (`error`). Never keyVersion 0. Every other kind still saves in plaintext while the vault is off.
 */
export const SEALED_ONLY: ReadonlySet<BlobKind> = new Set<BlobKind>(["participants"]);

/** A set() is saved this long after the last one (three in a row are one PUT). */
export const BLOB_SAVE_DEBOUNCE_MS = 800;

/**
 * `locked`: the vault is locked and the student has not opened it. While the read is what is locked, `value` is null (never a default),
 * or what the panel set since, held; a held value is sent once the vault opens. `broken`: the stored blob does not open or is not of its
 * kind's shape, and the panel has set nothing over it (the panel says so; it never crashes). `error`: the last read or save failed; what
 * was set is kept and goes with the next set, flush or unlock. While a value is held over a blob that did not open at a save's re-read (a 409), `value` is
 * that held value (the panel shows the student's own text) and `broken` is true.
 */
export type ProjectBlobState<T> = {
  value: T | null; loading: boolean; locked: boolean; broken?: boolean; error?: boolean;
  /**
   * The server's version of the value `value` is based on (0 for a blob not there yet): from the last read or accepted save, so a value set here and not yet saved
   * carries the version it was set on. Undefined while the stored value is not known, and from an api without versions. A reader that keeps the latest of several
   * windows' values (lib/tools/participants/store.ts) takes the newest by this.
   */
  version?: number;
};
/** A new value, or an update of the current one (`prev` is null while there is no blob yet). */
export type BlobUpdate<T> = T | ((prev: T | null) => T);
export type ProjectBlob<T> = ProjectBlobState<T> & {
  /**
   * Shows the result at once and saves it BLOB_SAVE_DEBOUNCE_MS later (sealed under the blob's key unless the vault is off). Set while
   * the stored value is not known yet (loading, locked, a failed read), it is queued and replayed onto the value once it is read.
   * Panels holding a collection (citations, caches, ap_notes, shelf_index, ap_cols) must use the update form, so an entry added before
   * the read lands on top of the stored ones instead of replacing them.
   */
  set(next: BlobUpdate<T>): void;
  /** Reads the blob if it is not known yet, then sends a pending save now. True once nothing set here is left off the server; false always when read-only. */
  flush(): Promise<boolean>;
  /** set() sends nothing here: `opts.readOnly`, or the pop-out's guard (a pop-out writes only its own stage's kinds, v1 1964 and register row D-S2-43). */
  readOnly: boolean;
};
export type ProjectBlobOptions = {
  /** The value is read but set() is a no-op that holds nothing, and flush() resolves false. A pop-out makes every kind of another stage read-only on its own (blobWritable). */
  readOnly?: boolean;
};

/** What GET and PUT /projects/:id/blobs/:kind answer. `version` moves on with every save; an api from before blob versions has none. */
export type BlobWire = { kind: string; body: string; keyVersion: number; deks: WrappedDek[]; updatedAt: string; version?: number };
type BlobPut = { body: string; keyVersion: number; dek?: WrappedDek };
export type BlobVault = Pick<VaultValue, "known" | "ensureUnlocked" | "encryptBody" | "decryptBody">;
type ClientDeps<T> = {
  id: string;
  parse: (json: string) => T | null;
  /** Null when there is no blob yet (404). */
  get: () => Promise<BlobWire | null>;
  /** `ifMatch`: the version the value was based on (0 for a blob not there yet); the save lands only on that version, else 409 version-conflict. */
  put: (body: BlobPut, ifMatch?: number) => Promise<BlobWire>;
  vault: () => BlobVault;
  /** set() is a no-op that holds nothing and flush() resolves false (the pop-out's guard). */
  readOnly?: boolean;
  /**
   * No panel asks (R16) before it sets over a blob that does not open: idea_intake and the preference kinds (UNGUARDED). A value held over an unreadable blob then stays held, takes
   * further sets, and is never saved over the blob unasked. False or absent: the panel asks, and its next set is the go-ahead.
   */
  unguarded?: boolean;
  /** SEALED_ONLY: with the vault off a save is refused, not sent in plaintext and not held (`error` is set, as for a failed save). */
  sealedOnly?: boolean;
  /** Called after each save the server accepted (the pop-out sync's announce). */
  onSaved?: () => void;
  /** A save lost the race to another window BLOB_CONFLICT_ATTEMPTS times in a row: its value is held (the hook's toast). */
  onConflict?: () => void;
};

/** PUTs one save makes while another window keeps saving first; after the last conflict the value is held. */
export const BLOB_CONFLICT_ATTEMPTS = 3;
/** A SEALED_ONLY kind's save found the vault off: thrown by seal(), caught by save(), which sends and holds nothing. */
class PlaintextRefused extends Error { constructor() { super("sealed-only"); } }
const isVersionConflict = (e: unknown): boolean => e instanceof ApiError && e.status === 409 && e.code === "version-conflict";
/** Deep equality of two JSON values (key order aside). */
function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && sameJson((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

const toOp = <T,>(u: BlobUpdate<T>): HeldOp<T> => (typeof u === "function" ? { update: u as (prev: T | null) => T } : { value: u });

/**
 * One blob of one project, outside React. Reads and saves run one at a time, in order. The stored value is "known" once a read has
 * answered (a blob, broken or not, or none); until then every set is queued and replayed onto it, so nothing the panel never saw is
 * overwritten. `headless` (the registry's drain, with no panel) never asks for the passphrase and reports no state or unsent value.
 */
export function createBlobClient<T>(o: ClientDeps<T> & { delayMs: number; onState: (s: ProjectBlobState<T>) => void; headless?: boolean }) {
  /** A read has answered: `value` is the stored value with every later set applied. */
  let known = false;
  let value: T | null = null;
  /** Sets made while the stored value is not known, in order. */
  let ops: HeldOp<T>[] = [];
  /** Known, set here and not yet on the server. Newer values replace it. */
  let pending: { value: T } | null = null;
  /** The blob's keys as the server has them: from every read and every save. */
  let deks: WrappedDek[] = [];
  /** The server's version of the value `value` is based on: from every read (0 when there is no blob) and every save; undefined from an api without versions. */
  let version: number | undefined;
  /**
   * The sets made since that value was read or accepted, in order. A save that lost the race to another window re-reads and replays these
   * onto the newer value, so neither side's edits are lost.
   */
  let sinceBase: HeldOp<T>[] = [];
  let attempted = false;
  /** The last read could not open the blob: the vault is locked. */
  let lockedRead = false;
  /** A save is held because the vault stayed locked. */
  let heldByLock = false;
  let broken = false;
  /**
   * A save's re-read after a conflict found a blob that does not open: this window's value is held in `pending` and shown as `value` with `broken`
   * (a guarded panel asks first, R16), and nothing is sent until the panel sets over it; that set goes on from the held value. Kinds with no
   * guard (`unguarded`) keep the value held for good: later sets land on it, none is sent.
   */
  let brokenHeld = false;
  let error = false;
  /** The student cancelled an unlock this blob asked for after its first read: no prompt again until the vault opens (resume). */
  let declined = o.headless === true;
  /**
   * The next read is the panel's own set while the read is locked (the student typed or pressed something): it asks as the student does, so it may
   * ask once more after a cancel of the page's asks. Every other read, and a debounced save, asks as the page does (O18: not again after a cancel).
   */
  let byStudent = false;
  let firstRead = true;
  let active = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<unknown> = Promise.resolve();
  const self = {};

  /** A save taken from `pending` whose PUT has not answered yet (it is put back into `pending` if it fails). */
  let saving = false;
  const holds = () => pending !== null || ops.length > 0 || saving;
  const snapshot = (): ProjectBlobState<T> => ({
    value: known ? (brokenHeld && pending ? pending.value : value) : applyOps(ops, null),
    loading: !attempted,
    locked: (!known && lockedRead) || heldByLock,
    broken: known && broken && (value === null || brokenHeld),
    error,
    version: known ? version : undefined
  });
  const emit = () => {
    if (!active || o.headless) return;
    heldBlobs.markDirty(self, holds(), flush);
    o.onState(snapshot());
  };
  const clearTimer = () => { if (timer) clearTimeout(timer); timer = null; };

  /** Opens a blob as read: its value (null when broken), or "locked" when the vault stays locked. Asks for the passphrase unless declined. */
  async function openWire(w: BlobWire, by: VaultAsker = "auto"): Promise<{ value: T | null } | "locked"> {
    const doc = { id: o.id, deks: w.deks, bodyHtml: w.body, keyVersion: w.keyVersion };
    let text: string | null = null;
    try { text = await o.vault().decryptBody(doc); } catch (e) {
      if (!isVaultLocked(e)) return { value: null }; // VaultError("corrupt")
      // The vault shares one prompt between every caller waiting on it (the document, other panels); the page's own reads ask no more after a cancel.
      if (declined || !(await o.vault().ensureUnlocked(by).catch(() => false))) return "locked";
      try { text = await o.vault().decryptBody(doc); } catch (e2) { if (isVaultLocked(e2)) return "locked"; return { value: null }; }
    }
    return { value: o.parse(text) };
  }

  async function read(): Promise<void> {
    const by: VaultAsker = byStudent ? "student" : "auto";
    byStudent = false;
    let w: BlobWire | null;
    try { w = await o.get(); } catch { attempted = true; error = true; return; }
    if (w) deks = w.deks;
    const opened = w ? await openWire(w, by) : { value: null };
    attempted = true;
    // The first read asks once; a set while still locked may ask once more, and a cancel then holds without asking again.
    if (opened === "locked" && !firstRead) declined = true;
    firstRead = false;
    if (opened === "locked") { lockedRead = true; return; }
    lockedRead = false;
    error = false;
    const parsed = opened.value;
    broken = w !== null && parsed === null;
    known = true;
    value = parsed;
    version = w ? w.version : 0;
    // The sets queued while the value was unknown are the edits made here since this base.
    sinceBase = [...ops];
    if (ops.length) {
      value = applyOps(ops, value);
      ops = [];
      if (value !== null) pending = { value };
    }
  }

  /** The body to send, or null when the vault stays locked (the value is held). Never plaintext in place of ciphertext. */
  async function seal(json: string): Promise<BlobPut | null> {
    // A vault still "loading" is waited for, never taken for "off".
    if ((await o.vault().known()) === "off") {
      if (o.sealedOnly) throw new PlaintextRefused();
      return { body: json, keyVersion: 0 };
    }
    const sealNow = async () => {
      const s = await o.vault().encryptBody({ id: o.id, deks }, json);
      return { body: s.bodyHtml, keyVersion: s.keyVersion, ...(s.dek ? { dek: s.dek } : {}) };
    };
    try { return await sealNow(); } catch (e) { if (!isVaultLocked(e)) throw e; }
    if (!declined) {
      // Once per attempt; while the migration runs this waits for it without a prompt.
      try { if (await o.vault().ensureUnlocked("auto")) return await sealNow(); } catch (e) { if (!isVaultLocked(e)) throw e; }
    }
    declined = true;
    return null;
  }

  /** Keeps a value that could not be sent; a newer one set meanwhile wins. */
  const hold = (v: T) => { if (!pending) pending = { value: v }; };

  /**
   * The last PUT failed with no HTTP answer (offline, a dropped connection) or with a 5xx (a gateway timeout can come after the store took it):
   * the server may have stored it. A 409 or another 4xx is a refusal: nothing was stored.
   */
  let outcomeUnknown = false;
  const put = async (body: BlobPut): Promise<BlobWire> => {
    try { return await o.put(body, version); } catch (e) { if (!(e instanceof ApiError) || e.status >= 500) outcomeUnknown = true; throw e; }
  };

  /**
   * A save whose outcome is unknown carried the first `carried` sets of `sinceBase`: they become one update that leaves a value equal to the one
   * sent as it is (that save was stored; replaying an addition would add it twice) and replays them onto any other. The client's re-read after
   * a 409 and the held-blobs drain both replay through it.
   */
  function markUnsure(sent: string, carried: number) {
    const sentValue: unknown = JSON.parse(sent);
    const carriedOps = sinceBase.slice(0, carried);
    sinceBase = [{ update: (prev: T | null) => (sameJson(prev, sentValue) ? prev : applyOps(carriedOps, prev)) as T }, ...sinceBase.slice(carried)];
  }

  /** Seals and sends `json` on the current version: the answer, or null when the vault stays locked. A version-conflict is thrown. */
  async function sealAndPut(json: string): Promise<BlobWire | null> {
    let body = await seal(json);
    if (!body) return null;
    try { return await put(body); } catch (e) {
      if (!isStaleKeys(e)) throw e;
      // Re-read the blob's keys (and the vault: another tab may have set one up), seal again, and try once more.
      const fresh = await o.get();
      deks = fresh?.deks ?? [];
      await o.vault().known(true);
      body = await seal(json);
      if (!body) return null;
      return await put(body);
    }
  }

  async function save(): Promise<boolean> {
    if (!pending) return true;
    if (brokenHeld) return false;
    let v = pending.value;
    pending = null;
    saving = true;
    /** How many of `sinceBase` this save carries: the sets made while it is out come after them. */
    let carried = sinceBase.length;
    try {
      for (let conflicts = 0; ; ) {
        let w: BlobWire | null;
        const json = JSON.stringify(v);
        outcomeUnknown = false;
        try { w = await sealAndPut(json); } catch (e) {
          // Refused before anything was sent: not held (the names never leave in plaintext, nor wait for a later send); the state reports a failed save.
          if (e instanceof PlaintextRefused) { error = true; return false; }
          if (outcomeUnknown) { markUnsure(json, carried); throw e; }
          if (!isVersionConflict(e)) throw e;
          // Another window saved first. After the last attempt the value is held and goes with the next edit (or flush, unlock, mount).
          if (++conflicts >= BLOB_CONFLICT_ATTEMPTS) { hold(v); error = true; o.onConflict?.(); return false; }
          // Read the newer value (no prompt beyond the usual rules) and replay every edit made here since the base onto it.
          const fresh = await o.get();
          const opened = fresh ? await openWire(fresh) : { value: null };
          if (opened === "locked") { declined = true; hold(v); heldByLock = true; return false; }
          if (fresh && opened.value === null) {
            // The newer blob does not open here: replaying onto nothing would replace it unasked. Held until the panel sets over it (R16).
            deks = fresh.deks;
            version = fresh.version;
            broken = true;
            brokenHeld = true;
            value = null;
            hold(v);
            return false;
          }
          if (!fresh && (version ?? 0) > 0) {
            // Deleted elsewhere (a shelf paper removed in another window): a save names a version above 0 so it never re-creates the blob, and the
            // replay must not either. The edits are dropped and the value is what the server has, none, as a re-read after a delete shows it.
            deks = [];
            version = 0;
            value = null;
            pending = null;
            sinceBase = [];
            broken = false;
            error = false;
            return true;
          }
          deks = fresh?.deks ?? [];
          version = fresh ? fresh.version : 0;
          value = applyOps(sinceBase, opened.value);
          // The rebased value carries every set so far, a set made while this save was out included.
          pending = null;
          carried = sinceBase.length;
          if (value === null) return true;
          v = value;
          continue;
        }
        if (!w) { hold(v); heldByLock = true; return false; }
        deks = w.deks;
        version = w.version;
        sinceBase = sinceBase.slice(carried);
        heldByLock = false;
        broken = false;
        error = false;
        o.onSaved?.();
        return true;
      }
    } catch {
      hold(v);
      error = true;
      return false;
    } finally {
      saving = false;
    }
  }

  /** One turn: read when the stored value is not known (a retry after a failure or a lock), then send what is pending. */
  async function step(): Promise<boolean> {
    if (!known) await read();
    if (!known) { emit(); return ops.length === 0; }
    const ok = await save();
    emit();
    return ok && !holds();
  }
  function queue(run: () => Promise<boolean>): Promise<boolean> {
    const p = chain.then(run, run);
    chain = p.catch(() => false);
    return p;
  }
  function flush(): Promise<boolean> {
    clearTimer();
    if (o.readOnly) return Promise.resolve(false);
    return queue(step);
  }

  /**
   * What is still not on the server, as ops: the sets made since the last value read or saved, so whoever sends them later replays them onto
   * the value it reads then rather than saving this window's copy over another window's newer one. Nothing while a broken blob holds the value
   * (brokenHeld): the drain has no panel to ask, so it would replace the blob unasked.
   */
  const leftover = (): HeldOp<T>[] => (known ? (pending && !brokenHeld ? compactOps([...sinceBase]) : []) : [...ops]);

  /** For the registry: a client with no panel, sending `held` the way this one would. */
  const send = async (held: HeldOp[]): Promise<HeldOp[]> => {
    // No panel to tell: a value still conflicting stays held for the next drain or mount.
    const c = createBlobClient<T>({ ...o, delayMs: 0, onState: () => {}, headless: true, onConflict: undefined });
    c.adopt(held as HeldOp<T>[]);
    await c.flush();
    return c.leftover() as HeldOp[];
  };

  return {
    /** Takes ops held for this blob (from a panel that went away) before the first read; they replay onto the loaded value. */
    adopt(held: HeldOp<T>[]) { ops = compactOps([...held, ...ops]); },
    /** What the client knows now, as a panel's state would show it. A headless client reports no state of its own, so a caller that only reads asks here once `start()` has answered. */
    state: snapshot,
    leftover,
    /** The first read, after any last save of this blob from a panel that went away; what it held is adopted. */
    start(): Promise<boolean> {
      return queue(async () => {
        await heldBlobs.idle(o.id);
        const held = heldBlobs.take(o.id);
        if (held) ops = compactOps([...(held as HeldOp<T>[]), ...ops]);
        return step();
      });
    },
    flush,
    /** set() is a no-op here (the pop-out's guard, or `readOnly`). */
    readOnly: o.readOnly === true,
    set(next: BlobUpdate<T>) {
      if (o.readOnly) return;
      const op = toOp(next);
      if (known && brokenHeld && o.unguarded && pending) {
        // No panel asked the student (R16), so this edit is no go-ahead: it lands on the held value, which stays held and shown.
        pending = { value: "value" in op ? op.value : op.update(pending.value) };
        sinceBase.push(op);
        emit();
        clearTimer();
        return;
      }
      if (known) {
        // After a re-read found a broken blob, this set is the panel's go-ahead (R16): it goes on from the value this window held.
        const base = brokenHeld && pending ? pending.value : value;
        brokenHeld = false;
        value = "value" in op ? op.value : op.update(base);
        pending = { value };
        sinceBase.push(op);
      } else ops = compactOps([...ops, op]);
      emit();
      clearTimer();
      if (declined && (heldByLock || !known)) return; // held until the vault opens
      // The read is locked: ask now (one prompt, the student's: this set is theirs) rather than after the debounce.
      if (!known && lockedRead) { byStudent = true; void flush(); return; }
      timer = setTimeout(() => { timer = null; void flush(); }, o.delayMs);
    },
    /**
     * Another window saved this blob (v1's storage listener, 7614-7616): it is read again, without a passphrase prompt, when it is known and nothing
     * set here is waiting to go; a re-read that fails or is locked keeps what was shown.
     */
    refresh() {
      if (!active) return;
      void queue(async () => {
        if (!known || holds()) return !holds();
        const was = value, wasDeks = deks, wasDeclined = declined, wasBroken = broken;
        known = false;
        declined = true;
        await read();
        declined = wasDeclined;
        if (!known) {
          known = true; value = was; deks = wasDeks; broken = wasBroken; lockedRead = false; error = false;
          // A set made while the re-read was out went into ops (no timer while declined): it lands on what was shown and is sent.
          if (ops.length) { value = applyOps(ops, value); sinceBase = [...sinceBase, ...ops]; ops = []; if (value !== null) pending = { value }; }
        }
        // read() replays such a set onto the fresh value as pending; either way it is sent after the usual debounce.
        if (pending && !timer && active) timer = setTimeout(() => { timer = null; void flush(); }, o.delayMs);
        emit();
        return true;
      });
    },
    /** The vault opened (the header pill, another prompt): a read that was locked or failed is made again, and a held value is sent. */
    resume() {
      if (!active) return;
      declined = o.headless === true;
      if (!known || pending) void flush();
    },
    /**
     * The browser is back online: a read or save that failed (`error`: offline, a dropped connection, a gateway error) is made again now, so a value kept after
     * a failed save is sent without waiting for the next change. Nothing is made again that did not fail; the debounce, a lock held (no prompt) and a broken blob are as they were.
     */
    retry() {
      if (!active || o.headless || !error) return;
      void flush();
    },
    /**
     * Another project or kind, or unmount: what is pending, or a save still in flight, is seen through now, without a prompt (the panel
     * is gone), and tracked so a new mount of this blob waits for it. What still cannot go is kept in the held-blobs registry for this
     * blob id, and nothing here touches the panel's state any more.
     */
    dispose() {
      if (!active) return;
      active = false;
      heldBlobs.markDirty(self, false);
      clearTimer();
      declined = true;
      if (!holds()) return;
      const last = flush().then(() => { heldBlobs.put(o.id, leftover() as HeldOp[], send); });
      heldBlobs.track(o.id, last);
    }
  };
}

/** The blob route of a project's blob of `kind`. */
export const blobPath = (projectId: string, kind: BlobKind): string => `/projects/${projectId}/blobs/${encodeURIComponent(kind)}`;

/**
 * A client of one project's blob of `kind`, as useProjectBlob makes it (its routes, its parse, the debounce): the Reading shelf makes one per paper, outside a hook,
 * since the number of papers changes. The caller starts it and disposes of it.
 */
export function projectBlobClient<K extends BlobKind>(kind: K, projectId: string, vault: () => BlobVault, onState: (s: ProjectBlobState<BlobShape<K>>) => void, opts: ProjectBlobOptions & { headless?: boolean; onConflict?: () => void } = {}) {
  const path = blobPath(projectId, kind);
  const id = blobId(projectId, kind);
  return createBlobClient<BlobShape<K>>({
    id,
    // The pop-out's guard, here so every client (the hook's, the shelf's papers, a detached index write) has it.
    readOnly: (opts.readOnly ?? false) || !blobWritable(kind),
    // Idea and the preference kinds have no R16 ask; every other kind's panel asks before it sets over a blob that does not open.
    unguarded: UNGUARDED.has(kind),
    // R17: a kind that holds names is refused, not sent, while the vault is off.
    sealedOnly: SEALED_ONLY.has(kind),
    // The other windows read the blob again once it is saved here (v1's storage event, 7614).
    onSaved: syncedKind(kind) ? () => announceBlob(id) : undefined,
    parse: (json) => parseBlob(kind, json),
    get: async () => {
      try { return await apiFetch<BlobWire>(path); } catch (e) { if (e instanceof ApiError && e.status === 404) return null; throw e; }
    },
    // If-Match only with a version: an api from before blob versions answers none, and gets none.
    put: (body, ifMatch) => apiFetch<BlobWire>(path, { method: "PUT", body: JSON.stringify(body), ...(typeof ifMatch === "number" ? { headers: { "if-match": `"${ifMatch}"` } } : {}) }),
    vault,
    onConflict: opts.onConflict,
    delayMs: BLOB_SAVE_DEBOUNCE_MS,
    onState,
    headless: opts.headless
  });
}

/**
 * v1's storage listener reacts to appu_citations and appu_retraction_cache (7615), the two keys its pop-out writes. A place's window writes every
 * kind of its stage (register row D-S2-43), so every fixed kind is announced and re-read the same way, and a window does not save an old value over
 * the other's. A shelf paper is its own client in the shelf's store, which v1 kept in IndexedDB with no listener.
 */
const syncedKind = (kind: BlobKind): boolean => (BLOB_KINDS as readonly string[]).includes(kind);

type Tagged<T> = { key: string; s: ProjectBlobState<T> };

/**
 * A project's stage blob of `kind`, typed by its kind. `projectId` null (nothing to read: the caller passes the scratch project when no
 * project is open) reads nothing and set() is a no-op. Reads decrypt in the browser; a locked vault asks once (shared with every other
 * caller), and a cancelled ask leaves `locked: true` with no value. Saves are debounced, sealed under the blob's key unless the vault is
 * off (keyVersion 0), held while the vault stays locked and sent once it opens; a 409 vault-required or dek-exists re-reads the keys
 * and retries once. Set while the value is unknown, updates are replayed onto it once read (see `set`). A value still unsent when the
 * panel goes away is kept for this tab (held.ts) and sent at the next mount of the same blob, unlock, or return online.
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
  const t = useT();
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);

  const readOnly = (opts.readOnly ?? false) || !blobWritable(kind);
  useEffect(() => {
    if (projectId === null || key === null) return;
    const c = projectBlobClient(kind, projectId, () => vaultRef.current, (s) => setTagged({ key, s }), { readOnly, onConflict: () => toast(tRef.current("blob_conflict")) });
    client.current = c;
    void c.start();
    const stop = syncedKind(kind) ? onBlobAnnounced(blobId(projectId, kind), () => c.refresh()) : () => {};
    return () => { stop(); if (client.current === c) client.current = null; c.dispose(); };
  }, [kind, projectId, key, readOnly]);

  // Back online: held-blobs sends only what a panel that went away left behind; this panel's own failed read or save is tried again here (like the vault's own retry).
  useEffect(() => {
    const back = () => client.current?.retry();
    window.addEventListener("online", back);
    return () => window.removeEventListener("online", back);
  }, []);

  const open = vault.status === "unlocked" || vault.status === "migrating";
  useEffect(() => { if (open) client.current?.resume(); }, [open, key]);

  const set = useCallback((next: BlobUpdate<T>) => { if (!readOnly) client.current?.set(next); }, [readOnly]);
  const flush = useCallback(async () => (readOnly ? false : (await client.current?.flush()) ?? true), [readOnly]);

  const s: ProjectBlobState<T> = key === null
    ? { value: null, loading: false, locked: false }
    : tagged?.key === key ? tagged.s : { value: null, loading: true, locked: false };
  return { ...s, set, flush, readOnly };
}
