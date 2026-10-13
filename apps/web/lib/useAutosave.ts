"use client";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "./api";

export type SaveStatus = "saved" | "saving" | "error" | "dirty";
type SaveResult = { seq: number; created: boolean };

export function createAutosaver(o: { initialHtml: string; save: (html: string) => Promise<SaveResult>; delayMs: number; onStatus?: (s: SaveStatus, seq?: number) => void }) {
  let lastSaved = o.initialHtml;
  let pending: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let status: SaveStatus = "saved";
  let inflight: Promise<SaveResult> | null = null;
  const set = (s: SaveStatus, seq?: number) => { status = s; o.onStatus?.(s, seq); };

  async function flush() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (inflight) await inflight.catch(() => undefined);
    const html = pending; pending = null;
    if (html === null || html === lastSaved) { set("saved"); return; }
    set("saving");
    try {
      inflight = o.save(html);
      const r = await inflight;
      lastSaved = html;
      set("saved", r.seq);
    } catch {
      pending = html;
      set("error");
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
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
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
  useEffect(() => () => { void saver.flushNow(); }, [saver]);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (saver.getStatus() === "dirty" || saver.getStatus() === "saving") { e.preventDefault(); } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [saver]);
  return { status, currentSeq, onChange: saver.onChange, flushNow: saver.flushNow };
}
