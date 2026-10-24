/* The one-click capture's page code (v1 "Zotero-lite", 13616-13655) that computes something: citSetupBookmarklet's source (13622-13636), citCheckCaptureHash's decode (13644-13646),
   its question (13648), the entry it saves (13649) and its duplicate rule (13651). The page's own parts stay in apps/web/lib/cite/capture.ts: reading and stripping the address
   (13638-13642), the confirm, the save and the toasts. Held to v1 running by test/golden/citshare (citcapture.test.ts). What differs from v1's text:
   - bookmarkletSource(appUrl) is the `parts` array (13625-13632) copied by script, joined as 13634 joins it; v1's appUrl is `location.origin+location.pathname` (13623), the caller's;
   - decodeCapture(raw) is the try block's decode with the JSON parse: null where v1's catch shows "Could not read that captured citation"; a value with no title has title "" (v1 returns
     quietly, 13647); every value is v1's `x||''` made a string (what a page's meta tags give is a string already);
   - captureIsDuplicate(lib, rec) is 13651's `l.some(...)`, with the library a parameter;
   - decodeCapture also keeps `volume`, `issue` and `pages` when the payload has them (only bookmarkletSourceV2's does; a v1 payload decodes as before).
   Wave A (walk fault W1, register row D-S2-23) adds siblings, below, and leaves v1's functions as they are: bookmarkletSourceV2 / bookmarkletHrefV2, capNameToCit,
   captureRecordV2 and captureMatch. Held to their stated differences by test/citcapture-v2.test.ts.
   Wave B (Task 20, register row D-S2-125) adds bookmarkletSourceV3 / bookmarkletHrefV3 beside V2: V2's source with the one address it opens changed to the adding screen,
   `origin + "/add#capture="`. Held to that one difference by test/citcapture-v3.test.ts. */
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
export type CaptureData = { title: string; author: string; year: string; source: string; doi: string; url: string; volume?: string; issue?: string; pages?: string };

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
  const out: CaptureData = { title: s("title"), author: s("author"), year: s("year"), source: s("source"), doi: s("doi"), url: s("url") };
  // Wave A (W1): bookmarkletSourceV2 also sends these three; a v1 bookmarklet's payload has none of them and decodes exactly as before.
  for (const k of ["volume", "issue", "pages"] as const) if (Object.prototype.hasOwnProperty.call(o, k)) out[k] = s(k);
  return out;
}

/** 13648: the confirm's question. */
export function captureConfirmText(d: CaptureData): string {
  return 'Add this to your citation library?\n\n"' + d.title + '"\n' + (d.author || "(no author found)") + (d.year ? " (" + d.year + ")" : "");
}

/** W30: a bookmark dragged before the fix still sends the first four characters of the date ("09/1" for "09/16/2019"); a year that is not four digits is dropped, so the reference shows "n.d." and the Crossref check can surface the year. */
export function captureYearV2(year: string | undefined): string { return year && /^\d{4}$/.test(year) ? year : ""; }

/** 13649: the entry v1 saves, a journal article in APA, the page's link only when there is no DOI. */
export function captureRecord(d: CaptureData): CitationEntry {
  return { author: d.author || "", year: d.year || "", title: d.title, source: d.source || "", volume: "", issue: "", pages: "", doi: d.doi || "", url: d.doi ? "" : (d.url || ""), type: "Journal article", style: "apa" };
}

/** 13651: the same title and the same author are already in the library. */
export function captureIsDuplicate(lib: CitationEntry[], rec: CitationEntry): boolean { return lib.some((e) => e.title === rec.title && e.author === rec.author); }

/* ---- Wave A (W1, register row D-S2-23): the capture keeps every author, the volume, the issue and the pages. ---- */

/** v1's author part (13627), kept as it is: every `citation_author` tag, joined "; ". */
const V1_AUTHOR_PART = "var as=Array.prototype.slice.call(document.querySelectorAll('meta[name=\"citation_author\"]')).map(function(e){return e.getAttribute('content')}).join('; ');";
/** v1's `d` part (13628). */
const V1_D_PART = "var d={title:m('citation_title')||document.title,author:as,year:(m('citation_publication_date')||m('citation_date')||m('citation_year')||'').slice(0,4),source:m('citation_journal_title')||m('citation_conference_title')||'',doi:m('citation_doi')||'',url:location.href};";
/** The author part that replaces it: v1's, then, when the page has no `citation_author` (PubMed writes one `citation_authors` tag, "Schaefer EM; Gonzalez CB; …"),
 * that tag split on ";" with each name trimmed and empty ones dropped. A page with both tags is read once: `citation_author` wins. */
const V2_AUTHOR_PART = V1_AUTHOR_PART + "if(!as)as=(m('citation_authors')||'').split(/;\\s*/).map(function(x){return x.trim()}).filter(function(x){return x}).join('; ');";
/** v1's year expression: the first four characters of the first date tag, so "09/16/2019" gave "09/1" (walk fault W30). */
const V1_YEAR_EXPR = "(m('citation_publication_date')||m('citation_date')||m('citation_year')||'').slice(0,4)";
/** Its replacement (ES5, inside the bookmarklet): the first 4-digit year (1500-2099) found in citation_publication_date, then citation_date, then citation_year; "" when none has one. */
const V2_YEAR_EXPR = "(function(){var v=[m('citation_publication_date'),m('citation_date'),m('citation_year')];for(var i=0;i<v.length;i++){var r=/\\b(1[5-9]|20)\\d{2}\\b/.exec(v[i]||'');if(r)return r[0]}return ''})()";
/** The `d` part that replaces it: v1's six fields with the year read as above (W30), then the volume, the issue and the pages (the first page, or first-last when a different last page is given). */
const V2_D_PART = "var fp=m('citation_firstpage')||'',lp=m('citation_lastpage')||'';" + V1_D_PART.replace(V1_YEAR_EXPR, () => V2_YEAR_EXPR).replace("url:location.href};", "url:location.href,volume:m('citation_volume')||'',issue:m('citation_issue')||'',pages:fp&&lp&&lp!==fp?fp+'-'+lp:fp};");

/** bookmarkletSource with two parts replaced: the authors (V2_AUTHOR_PART) and the payload (V2_D_PART). Everything else, the alert and the opened address included, is v1's. */
export function bookmarkletSourceV2(appUrl: string): string {
  const v1 = bookmarkletSource(appUrl);
  if (v1.indexOf(V1_AUTHOR_PART) < 0 || v1.indexOf(V1_D_PART) < 0) throw new Error("bookmarkletSourceV2: v1's parts moved");
  return v1.replace(V1_AUTHOR_PART, () => V2_AUTHOR_PART).replace(V1_D_PART, () => V2_D_PART);
}
/** The link's href for bookmarkletSourceV2, as 13635 builds v1's. */
export const bookmarkletHrefV2 = (appUrl: string): string => "javascript:" + encodeURIComponent(bookmarkletSourceV2(appUrl));

/**
 * bookmarkletSourceV2 with the one address it opens changed (wave B Task 20, walk faults W5, W6, W13): `origin + "/add#capture="`, the focused adding screen, where V2 opened
 * `appUrl + "#capture="`, the workspace. What the bookmark reads from the page, what it sends and the alert on a page with no title are V2's. A trailing slash on `origin` is dropped.
 */
export function bookmarkletSourceV3(origin: string): string {
  const base = origin.replace(/\/+$/, "");
  const v2 = bookmarkletSourceV2(base + "/");
  const v2Opens = "window.open('" + base + "/#capture='";
  if (v2.indexOf(v2Opens) < 0) throw new Error("bookmarkletSourceV3: V2's opened address moved");
  return v2.replace(v2Opens, () => "window.open('" + base + "/add#capture='");
}
/** The link's href for bookmarkletSourceV3, as 13635 builds v1's. */
export const bookmarkletHrefV3 = (origin: string): string => "javascript:" + encodeURIComponent(bookmarkletSourceV3(origin));

/** One captured name as the library writes it: a name with a comma unchanged; PubMed's "Surname Initials" (the last word one to four capitals) as "Surname, Initials",
 * rsAuthorsToCit's rule for the same shape; anything else unchanged. */
export function capNameToCit(n: string): string {
  if (n.indexOf(",") >= 0) return n;
  const parts = n.trim().split(/\s+/);
  const last = parts[parts.length - 1]!;
  if (parts.length >= 2 && /^[A-Z]{1,4}$/.test(last)) return parts.slice(0, -1).join(" ") + ", " + last;
  return n;
}

/** captureRecord (13649) with each author name through capNameToCit and the page's volume, issue and pages. For a v1 payload it is captureRecord's entry. */
export function captureRecordV2(d: CaptureData): CitationEntry {
  const rec = captureRecord({ ...d, year: captureYearV2(d.year) });
  return { ...rec, author: (rec.author || "").split(/;\s*/).map(capNameToCit).join("; "), volume: d.volume || "", issue: d.issue || "", pages: d.pages || "" };
}

/** What a capture does to the library: `dup` when the same title and author are there (v1's rule, 13651); `fill` when an entry with the same title has no author and
 * the capture has one (its index; the caller fills that entry's empty fields); otherwise `new`. */
export function captureMatch(lib: CitationEntry[], rec: CitationEntry): { kind: "dup" } | { kind: "fill"; index: number } | { kind: "new" } {
  if (captureIsDuplicate(lib, rec)) return { kind: "dup" };
  if (rec.author) {
    const index = lib.findIndex((e) => e.title === rec.title && !e.author);
    if (index >= 0) return { kind: "fill", index };
  }
  return { kind: "new" };
}
