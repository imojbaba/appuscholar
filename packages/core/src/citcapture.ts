/* The one-click capture's page code (v1 "Zotero-lite", 13616-13655) that computes something: citSetupBookmarklet's source (13622-13636), citCheckCaptureHash's decode (13644-13646),
   its question (13648), the entry it saves (13649) and its duplicate rule (13651). The page's own parts stay in apps/web/lib/cite/capture.ts: reading and stripping the address
   (13638-13642), the confirm, the save and the toasts. Held to v1 running by test/golden/citshare (citcapture.test.ts). What differs from v1's text:
   - bookmarkletSource(appUrl) is the `parts` array (13625-13632) copied by script, joined as 13634 joins it; v1's appUrl is `location.origin+location.pathname` (13623), the caller's;
   - decodeCapture(raw) is the try block's decode with the JSON parse: null where v1's catch shows "Could not read that captured citation"; a value with no title has title "" (v1 returns
     quietly, 13647); every value is v1's `x||''` made a string (what a page's meta tags give is a string already);
   - captureIsDuplicate(lib, rec) is 13651's `l.some(...)`, with the library a parameter. */
import type { CitationEntry } from "./citation";

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
    // v1 13645, verbatim: escape is how v1 turns the UTF-8 bytes back into text.
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

/** 13651: the same title and the same author are already in the library. */
export function captureIsDuplicate(lib: CitationEntry[], rec: CitationEntry): boolean { return lib.some((e) => e.title === rec.title && e.author === rec.author); }
