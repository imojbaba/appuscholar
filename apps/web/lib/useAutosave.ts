"use client";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "./api";

export type SaveStatus = "saved" | "saving" | "error" | "dirty";
type SaveResult = { seq: number; created: boolean };

/** Backoff after a failed save: 2s, 4s, 8s, 16s, then every 30s until a save succeeds or the editor unmounts. */
export const RETRY_DELAYS_MS = [2000, 4000, 8000, 16000, 30000];

/** Leaving the page would lose work unless everything typed has been stored. */
export function shouldWarnOnUnload(status: SaveStatus): boolean {
  return status !== "saved";
}

export function createAutosaver(o: { initialHtml: string; save: (html: string) => Promise<SaveResult>; delayMs: number; onStatus?: (s: SaveStatus, seq?: number) => void; retryDelaysMs?: number[] }) {
  const retryDelays = o.retryDelaysMs ?? RETRY_DELAYS_MS;
  let lastSaved = o.initialHtml;
  let pending: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryAttempt = 0;
  let active = true;
  let status: SaveStatus = "saved";
  let inflight: Promise<SaveResult> | null = null;
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

  /** Saves whatever is pending now. Resolves true when nothing is left unsaved, false when the save failed. */
  async function flush(): Promise<boolean> {
    clearTimers();
    if (inflight) await inflight.catch(() => undefined);
    const html = pending; pending = null;
    if (html === null || html === lastSaved) { set("saved"); return true; }
    set("saving");
    try {
      inflight = o.save(html);
      const r = await inflight;
      lastSaved = html;
      retryAttempt = 0;
      // Typing during the request left newer text pending; its debounce timer is already running.
      set(pending !== null ? "dirty" : "saved", r.seq);
      return true;
    } catch {
      // Keep newer text typed during the failed request; only fall back to the failed body if nothing newer exists.
      if (pending === null) pending = html;
      set("error");
      scheduleRetry();
      return false;
    } finally {
      inflight = null;
    }
  }
  return {
    onChange(html: string) {
      if (html === lastSaved && pending === null) { set("saved"); return; }
      pending = html;
      set("dirty");
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void flush(); }, o.delayMs);
    },
    flushNow: flush,
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

export function useAutosave(docId: string, initialHtml: string, initialSeq: number) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [currentSeq, setSeq] = useState(initialSeq);
  const saver = useMemo(() => createAutosaver({
    initialHtml,
    delayMs: 1500,
    save: async (html) => {
      const r = await apiFetch<{ revision: { seq: number }; created: boolean }>(`/documents/${docId}`, { method: "PUT", body: JSON.stringify({ bodyHtml: html }) });
      return { seq: r.revision.seq, created: r.created };
    },
    onStatus: (s, seq) => { setStatus(s); if (seq) setSeq(seq); }
  }), [docId, initialHtml]);
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
