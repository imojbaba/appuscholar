"use client";
import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { captureConfirmText, captureIsDuplicate, captureRecord, decodeCapture, type CitationEntry } from "@appuscholar/core";
import { toast } from "@/components/ui/toast";
import { ALREADY_IN_LIBRARY } from "./actions";
import { useLibrary } from "./useLibrary";

/*
 * The one-click capture (v1 "Zotero-lite", citSetupBookmarklet 13622-13636, citCheckCaptureHash 13637-13655, called at boot 13676-13677). The bookmarklet,
 * dragged to the bookmarks bar, reads the citation_* meta tags of the page it is clicked on and opens this app at `#capture=<base64 JSON>`; nothing goes to
 * a server (the hash never leaves the browser). On load the hash is taken off the address, decoded, and after a confirm saved to the library unless
 * the same title and author are already there (13651). The bookmarklet's source, the decode, the question, the entry and the duplicate rule are core's
 * (citcapture.ts); this module reads and strips the address, asks, saves and toasts. Held to v1 running by test/golden/citshare.
 * The sentences are literals of v1's script (no data-i18n key): English constants byte-equal to v1 (ruling R15).
 */

export const CAPTURE_PREFIX = "#capture=";
export const CAPTURE_UNREADABLE = "Could not read that captured citation";
/** 13653: `'Captured "'+d.title+'" into your citation library ✓'`. */
export const capturedToast = (title: string): string => 'Captured "' + title + '" into your citation library ✓';

/** 13638-13642: a `#capture=` hash is taken off the address (history.replaceState to the path and query); its text is returned. Any other hash is left alone. */
export function takeCaptureHash(loc: { hash: string; pathname: string; search: string }, replace: (url: string) => void): string | null {
  const h = loc.hash;
  if (h.indexOf(CAPTURE_PREFIX) !== 0) return null;
  replace(loc.pathname + loc.search);
  return h.slice(CAPTURE_PREFIX.length);
}

/** 13650-13653: the duplicate rule (same title and same author), then the entry appended as an update and the toast; nothing when a broken library is kept (R16). */
export function fileCapture(rec: CitationEntry, d: { lib: CitationEntry[]; update(fn: (prev: CitationEntry[]) => CitationEntry[]): boolean; toast(msg: string): void }): void {
  if (captureIsDuplicate(d.lib, rec)) { d.toast(ALREADY_IN_LIBRARY); return; }
  if (!d.update((prev) => [...prev, rec])) return;
  d.toast(capturedToast(rec.title ?? ""));
}

/** The hash is read once per page load, as v1's boot reads it once. */
let taken = false;
function takeOnce(): string | null {
  if (taken || typeof window === "undefined") return null;
  taken = true;
  return takeCaptureHash(window.location, (url) => window.history.replaceState(null, "", url));
}
/** Lets the next mount read the address again, as a new page load would (for tests). */
export function resetCaptureHash(): void { taken = false; }

/**
 * Mounted once in the workspace. On load it takes a `#capture=` hash off the address, decodes it and asks v1's question at once, as v1 does before it reads
 * the library; on OK the entry waits for the library (the project resolved and the vault open; a locked vault asks for the passphrase as the Citation
 * Manager does, ruling R5) and is then filed once, after which the library is released.
 */
export function CaptureHash() {
  const [rec, setRec] = useState<CitationEntry | null>(null);
  const filed = useCallback(() => setRec(null), []);
  useEffect(() => {
    const raw = takeOnce();
    if (raw === null) return;
    const d = decodeCapture(raw);
    if (!d) { toast(CAPTURE_UNREADABLE); return; }
    if (!d.title) return;
    if (!window.confirm(captureConfirmText(d))) return;
    // The address is outside React and read once, on mount; the entry exists only once the student has said yes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRec(captureRecord(d));
  }, []);
  // Once filed, CaptureFile goes: the library is no longer asked for (it would otherwise stay demanded for the session, R5's prompt on a later project switch).
  return rec ? createElement(CaptureFile, { rec, onDone: filed }) : null;
}

function CaptureFile({ rec, onDone }: { rec: CitationEntry; onDone(): void }) {
  const library = useLibrary();
  const done = useRef(false);
  const { lib, ready, loading, locked, update } = library;
  useEffect(() => {
    if (done.current || !ready || loading || locked) return;
    done.current = true;
    fileCapture(rec, { lib, update, toast });
    onDone();
  }, [rec, lib, ready, loading, locked, update, onDone]);
  return null;
}
