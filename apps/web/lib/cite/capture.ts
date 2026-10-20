"use client";
import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { captureConfirmText, captureMatch, captureRecordV2, decodeCapture, type CitationEntry } from "@appuscholar/core";
import { toast } from "@/components/ui/toast";
import { useT } from "@/lib/i18n";
import { useLibrary } from "./useLibrary";

/*
 * The one-click capture (v1 "Zotero-lite", citSetupBookmarklet 13622-13636, citCheckCaptureHash 13637-13655, called at boot 13676-13677). The bookmarklet,
 * dragged to the bookmarks bar, reads the citation_* meta tags of the page it is clicked on and opens this app at `#capture=<base64 JSON>`; nothing goes to
 * a server (the hash never leaves the browser). On load the hash is taken off the address, decoded, and after a confirm saved to the library unless
 * the same title and author are already there (13651). The bookmarklet's source, the decode, the question, the entry and the duplicate rule are core's
 * (citcapture.ts); this module reads and strips the address, asks, saves and toasts. Held to v1 running by test/golden/citshare.
 * The unreadable and captured sentences are literals of v1's script (no data-i18n key): English constants byte-equal to v1 (ruling R15); the duplicate toast is the keyed `rs2_already_in_your_library`, through `t`.
 * Fix wave A (walk fault W1, register row D-S2-23): the bookmarklet is bookmarkletSourceV2 (PubMed's `citation_authors`, the volume, the issue and the pages), the entry
 * is captureRecordV2 (PubMed's "Surname Initials" as "Surname, Initials"), and a capture whose title is in the library without an author fills that entry's empty
 * fields (captureMatch's `fill`, useLibrary().fillEmpty) in place of adding a second one, with the V2 toast `cap_filled`.
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

export type FileCaptureDeps = {
  lib: CitationEntry[];
  update(fn: (prev: CitationEntry[]) => CitationEntry[]): boolean;
  /** useLibrary().fillEmpty: fills the empty fields of the first stored entry that matches. */
  fillEmpty(match: (e: CitationEntry) => boolean, fill: Partial<CitationEntry>): boolean;
  toast(msg: string): void;
  t(key: string, vars?: Record<string, string | number>): string;
};
/**
 * 13650-13653: the duplicate rule (same title and same author), then the entry appended as an update and the toast; nothing when a broken library is kept (R16).
 * Wave A (W1): an entry with the same title and no author (v1's capture of a PubMed page) is filled with what this capture has, and `cap_filled` is toasted.
 */
export function fileCapture(rec: CitationEntry, d: FileCaptureDeps): void {
  const m = captureMatch(d.lib, rec);
  if (m.kind === "dup") { d.toast(d.t("rs2_already_in_your_library")); return; }
  if (m.kind === "fill") {
    if (!d.fillEmpty((e) => e.title === rec.title && !e.author, rec)) return;
    d.toast(d.t("cap_filled", { title: rec.title ?? "" }));
    return;
  }
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
    setRec(captureRecordV2(d));
  }, []);
  // Once filed, CaptureFile goes: the library is no longer asked for (it would otherwise stay demanded for the session, R5's prompt on a later project switch).
  return rec ? createElement(CaptureFile, { rec, onDone: filed }) : null;
}

function CaptureFile({ rec, onDone }: { rec: CitationEntry; onDone(): void }) {
  const library = useLibrary();
  const t = useT();
  const done = useRef(false);
  const { lib, ready, loading, locked, update, fillEmpty, flush } = library;
  useEffect(() => {
    if (done.current || !ready || loading || locked) return;
    done.current = true;
    fileCapture(rec, { lib, update, fillEmpty, toast, t });
    // Sent now, not after the save delay: the toast has said ✓, so a tab closed straight after it must not lose the entry (nothing pending sends nothing).
    void flush();
    onDone();
  }, [rec, lib, ready, loading, locked, update, fillEmpty, flush, onDone, t]);
  return null;
}
