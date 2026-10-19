"use client";
import { createElement, useEffect, useRef, useState } from "react";
import type { CitationEntry } from "@appuscholar/core";
import { toast } from "@/components/ui/toast";
import { ALREADY_IN_LIBRARY } from "./actions";
import { useLibrary } from "./useLibrary";

/*
 * The one-click capture (v1 "Zotero-lite", citSetupBookmarklet 13622-13636, citCheckCaptureHash 13637-13655, called at boot 13676-13677). The bookmarklet,
 * dragged to the bookmarks bar, reads the citation_* meta tags of the page it is clicked on and opens this app at `#capture=<base64 JSON>`; nothing goes to
 * a server (the hash never leaves the browser). On load the hash is taken off the address, decoded, and after a confirm saved to the library unless
 * the same title and author are already there (13651). Held to v1 running by test/golden/citshare (apps/web/test/capture.test.ts).
 * The sentences are literals of v1's script (no data-i18n key): English constants byte-equal to v1 (ruling R15).
 */

export const CAPTURE_PREFIX = "#capture=";
export const CAPTURE_UNREADABLE = "Could not read that captured citation";
/** 13653: `'Captured "'+d.title+'" into your citation library ✓'`. */
export const capturedToast = (title: string): string => 'Captured "' + title + '" into your citation library ✓';

/** citSetupBookmarklet's `parts` (13625-13632), verbatim: the bookmarklet's source for an app at `appUrl` (v1's `location.origin+location.pathname`). */
export function bookmarkletSource(appUrl: string): string {
  const parts = [
    "(function(){",
    "function m(n){var e=document.querySelector('meta[name=\"'+n+'\"]');return e?e.getAttribute('content'):''}",
    "var as=Array.prototype.slice.call(document.querySelectorAll('meta[name=\"citation_author\"]')).map(function(e){return e.getAttribute('content')}).join('; ');",
    "var d={title:m('citation_title')||document.title,author:as,year:(m('citation_publication_date')||m('citation_date')||m('citation_year')||'').slice(0,4),source:m('citation_journal_title')||m('citation_conference_title')||'',doi:m('citation_doi')||'',url:location.href};",
    "if(!d.title){alert('No citation info found on this page \\u2014 this works best on a journal article, PubMed, or arXiv page.');return}",
    "var p=btoa(unescape(encodeURIComponent(JSON.stringify(d))));",
    "window.open('"+appUrl+"#capture='+encodeURIComponent(p),'_blank');",
    "})();"
  ];
  return parts.join("");
}
/** 13635: the link's href. */
export const bookmarkletHref = (appUrl: string): string => "javascript:" + encodeURIComponent(bookmarkletSource(appUrl));

/** What the bookmarklet sends (13628), each value as v1 reads it: a string, "" when absent. */
export type CaptureData = { title: string; author: string; year: string; source: string; doi: string; url: string };

/**
 * 13644-13646: the hash's text after `#capture=`, decoded as v1 decodes it, `decodeURIComponent(escape(atob(decodeURIComponent(raw))))` then JSON.
 * Null when it cannot be read (v1's catch: "Could not read that captured citation"); a value with no title comes back with title "" (v1 returns quietly, 13647).
 * Every value is v1's `x||''` made a string: what a page's meta tags give is a string already.
 */
export function decodeCapture(raw: string): CaptureData | null {
  let d: unknown;
  try {
    const json = decodeURIComponent(escape(atob(decodeURIComponent(raw))));
    d = JSON.parse(json);
  } catch { return null; }
  const o = (d && typeof d === "object" ? d : {}) as Record<string, unknown>;
  const s = (k: string) => (o[k] ? String(o[k]) : "");
  return { title: s("title"), author: s("author"), year: s("year"), source: s("source"), doi: s("doi"), url: s("url") };
}

/** 13648: the confirm's question. */
export function captureConfirmText(d: CaptureData): string {
  return 'Add this to your citation library?\n\n"' + d.title + '"\n' + (d.author || "(no author found)") + (d.year ? " (" + d.year + ")" : "");
}

/** 13649: the entry v1 saves, a journal article in APA, the page's link only when there is no DOI. */
export function captureRecord(d: CaptureData): CitationEntry {
  return { author: d.author || "", year: d.year || "", title: d.title, source: d.source || "", volume: "", issue: "", pages: "", doi: d.doi || "", url: d.doi ? "" : (d.url || ""), type: "Journal article", style: "apa" };
}

/** 13638-13642: a `#capture=` hash is taken off the address (history.replaceState to the path and query); its text is returned. Any other hash is left alone. */
export function takeCaptureHash(loc: { hash: string; pathname: string; search: string }, replace: (url: string) => void): string | null {
  const h = loc.hash;
  if (h.indexOf(CAPTURE_PREFIX) !== 0) return null;
  replace(loc.pathname + loc.search);
  return h.slice(CAPTURE_PREFIX.length);
}

/** 13650-13653: the duplicate rule (same title and same author), then the entry appended as an update and the toast; nothing when a broken library is kept (R16). */
export function fileCapture(rec: CitationEntry, d: { lib: CitationEntry[]; update(fn: (prev: CitationEntry[]) => CitationEntry[]): boolean; toast(msg: string): void }): void {
  if (d.lib.some((e) => e.title === rec.title && e.author === rec.author)) { d.toast(ALREADY_IN_LIBRARY); return; }
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
 * Manager does, ruling R5) and is then filed once.
 */
export function CaptureHash() {
  const [rec, setRec] = useState<CitationEntry | null>(null);
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
  return rec ? createElement(CaptureFile, { rec }) : null;
}

function CaptureFile({ rec }: { rec: CitationEntry }) {
  const library = useLibrary();
  const done = useRef(false);
  const { lib, ready, loading, locked, update } = library;
  useEffect(() => {
    if (done.current || !ready || loading || locked) return;
    done.current = true;
    fileCapture(rec, { lib, update, toast });
  }, [rec, lib, ready, loading, locked, update]);
  return null;
}
