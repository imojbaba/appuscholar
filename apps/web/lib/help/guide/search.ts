import { sanitizeHtml } from "@appuscholar/core";
import type { GuideSection } from "./types";

/**
 * The Guide's search, print document and counter (Task C2). v1 is the spec (build 2026.10.24a): `guideStrip`, `guideFilter` and `guidePrint`.
 * Pure functions, so the dialog and the tests share them.
 */

/** v1 `guideStrip`: a section's HTML as plain lower-case text (tags become spaces, &amp; becomes &, white space collapses). */
export function guideStrip(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").toLowerCase();
}

/** The query's words: lower-cased, split on white space. */
export function guideWords(query: string): string[] {
  return query.toLowerCase().trim().split(/\s+/).filter(Boolean);
}

/**
 * v1 `guideFilter`: every query word must appear (as a substring, no stemming: only Appu's retrieval stems) in the title, keywords and stripped
 * body together. An empty query lists every section, closed; one to three matches come back open.
 */
export function searchGuide(query: string, sections: GuideSection[]): { id: string; open: boolean }[] {
  const words = guideWords(query);
  const hits = !words.length ? sections : sections.filter((s) => {
    const hay = (s.title + " " + s.keywords + " " + guideStrip(s.html)).toLowerCase();
    return words.every((w) => hay.indexOf(w) >= 0);
  });
  const open = words.length > 0 && hits.length <= 3;
  return hits.map((s) => ({ id: s.id, open }));
}

/** The counter line as a message key and its values: `n` is the number of query words, `h` the matches, `total` all the sections. */
export function guideCount(n: number, h: number, total: number): { key: string; vars: Record<string, number> } {
  return n ? { key: "wc_guide_count_match", vars: { h, total } } : { key: "wc_guide_count_all", vars: { total } };
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * v1 `guidePrint`'s page: every section (not only the matches) under its title, after the page's title and the line "Printed from the app. Build
 * {build}." (both passed in through t()). The titles are escaped and each body goes through sanitizeHtml, so the new window gets no script and no
 * handler; the opener calls print() itself. The page sets its own light colours, so it prints the same whatever theme the app is in.
 */
export function buildGuidePrintDocument(sections: GuideSection[], title: string, printedLine: string): string {
  const body = sections.map((s) => "<h2>" + escapeText(s.title) + "</h2>" + sanitizeHtml(s.html)).join("");
  return (
    '<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light"><title>' + escapeText(title) + "</title><style>" +
    "body{font:14px/1.6 Georgia,serif;max-width:720px;margin:24px auto;padding:0 16px;color:#111;background:#fff}h1{font-size:24px}" +
    "h2{font-size:17px;margin:22px 0 4px;border-bottom:1px solid #bbb}pre{background:#f4f4f4;padding:8px}dt{font-weight:bold;margin-top:6px}small{color:#555}" +
    "</style></head><body><h1>" + escapeText(title) + "</h1><small>" + escapeText(printedLine) + "</small>" + body + "</body></html>"
  );
}
