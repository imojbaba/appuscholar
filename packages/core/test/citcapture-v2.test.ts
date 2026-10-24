import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import type { CitationEntry } from "../src/citation";
import {
  bookmarkletHref, bookmarkletHrefV2, bookmarkletSource, bookmarkletSourceV2, capNameToCit, captureMatch, captureRecord, captureRecordV2, captureYearV2, decodeCapture,
} from "../src/citcapture";
import type { CaptureData } from "../src/citcapture";
import { readFixture } from "./golden/harness/fixture";

/**
 * The one-click capture, fixed (walk fault W1, register row D-S2-23): PubMed publishes its authors in one `citation_authors` tag ("Schaefer EM; Gonzalez CB; …")
 * where journals write one `citation_author` per name, and v1's bookmarklet reads only the second, so a PubMed capture had no author; and it never read the
 * volume, the issue or the pages. bookmarkletSourceV2 is v1's source with exactly two parts replaced (stated below), captureRecordV2 writes PubMed's
 * "Surname Initials" as "Surname, Initials" and keeps the three new fields, and captureMatch fills an authorless entry that the same title recaptures.
 * v1's own functions and their golden test (golden/citcapture.test.ts) are unchanged.
 */

const U = "http://localhost/";
// v1's author part (13627) and the part that replaces it: every citation_author as before; when there is none, PubMed's citation_authors split on ";".
const V1_AUTHOR_PART = String.raw`var as=Array.prototype.slice.call(document.querySelectorAll('meta[name="citation_author"]')).map(function(e){return e.getAttribute('content')}).join('; ');`;
const V2_AUTHOR_PART = V1_AUTHOR_PART + String.raw`if(!as)as=(m('citation_authors')||'').split(/;\s*/).map(function(x){return x.trim()}).filter(function(x){return x}).join('; ');`;
// v1's `d` part (13628) and the part that replaces it: the same six fields, then the volume, the issue and the pages (first page, or first-last when a different last page is given).
const V1_D_PART = String.raw`var d={title:m('citation_title')||document.title,author:as,year:(m('citation_publication_date')||m('citation_date')||m('citation_year')||'').slice(0,4),source:m('citation_journal_title')||m('citation_conference_title')||'',doi:m('citation_doi')||'',url:location.href};`;
const V2_D_PART = String.raw`var fp=m('citation_firstpage')||'',lp=m('citation_lastpage')||'';var d={title:m('citation_title')||document.title,author:as,year:(function(){var v=[m('citation_publication_date'),m('citation_date'),m('citation_year')];for(var i=0;i<v.length;i++){var r=/\b(1[5-9]|20)\d{2}\b/.exec(v[i]||'');if(r)return r[0]}return ''})(),source:m('citation_journal_title')||m('citation_conference_title')||'',doi:m('citation_doi')||'',url:location.href,volume:m('citation_volume')||'',issue:m('citation_issue')||'',pages:fp&&lp&&lp!==fp?fp+'-'+lp:fp};`;

/** Runs a bookmarklet source on a jsdom page with these meta tags, as the golden harness runs v1's (test/golden/citshare/capture.ts); the hash's text it opened the app with. */
function runOn(source: string, meta: Array<[string, string]>, url = "https://pubmed.ncbi.nlm.nih.gov/41234567/"): { raw: string | null; alerts: string[] } {
  const metas = meta.map(([n, c]) => `<meta name="${n}" content="${c.replace(/"/g, "&quot;")}">`).join("");
  const dom = new JSDOM(`<!doctype html><html><head><title>Page</title>${metas}</head><body></body></html>`, { url, runScripts: "outside-only" });
  const w = dom.window as unknown as Record<string, unknown> & { eval(src: string): unknown };
  const opened: string[] = [], alerts: string[] = [];
  w.open = (u: unknown) => { opened.push(String(u)); return null; };
  w.alert = (m: unknown) => { alerts.push(String(m)); };
  w.eval(source);
  dom.window.close();
  const o = opened[0];
  return { raw: o ? decodeURIComponent(o.slice((U + "#capture=").length)) : null, alerts };
}
const enc = (raw: string) => encodeURIComponent(raw);

const PUBMED: Array<[string, string]> = [
  ["citation_title", "Sleep timing and exam anxiety in first-year students"],
  ["citation_authors", "Schaefer EM; Gonzalez CB; Lee K; Park J; Wu T"],
  ["citation_publication_date", "2024/03/02"],
  ["citation_journal_title", "Scientific reports"],
  ["citation_volume", "9"],
  ["citation_issue", "1"],
  ["citation_firstpage", "13317"],
  ["citation_doi", "10.1038/s41598-024-00001-x"],
];

describe("bookmarkletSourceV2 (W1)", () => {
  it("bookmarkletSourceV2 is v1's source with the author part and the d part replaced (W1)", () => {
    expect(bookmarkletSource(U)).toContain(V1_AUTHOR_PART);
    expect(bookmarkletSource(U)).toContain(V1_D_PART);
    expect(bookmarkletSourceV2(U)).toBe(bookmarkletSource(U).replace(V1_AUTHOR_PART, V2_AUTHOR_PART).replace(V1_D_PART, V2_D_PART));
    expect(bookmarkletHrefV2(U)).toBe("javascript:" + encodeURIComponent(bookmarkletSourceV2(U)));
    expect(bookmarkletHrefV2(U)).not.toBe(bookmarkletHref(U));
  });

  it("run on a PubMed page, the bookmarklet sends every author, the volume, the issue and the pages", () => {
    const { raw } = runOn(bookmarkletSourceV2(U), PUBMED);
    expect(raw).not.toBeNull();
    expect(decodeCapture(enc(raw!))).toMatchObject({ author: "Schaefer EM; Gonzalez CB; Lee K; Park J; Wu T", volume: "9", issue: "1", pages: "13317", year: "2024", source: "Scientific reports" });
    // v1's bookmarklet on the same page: no author, no volume, issue or pages (the fault).
    const v1 = decodeCapture(enc(runOn(bookmarkletSource(U), PUBMED).raw!))!;
    expect(v1.author).toBe("");
    expect(v1).not.toHaveProperty("volume");
  });

  it("W30: the year is the first 4-digit year of citation_publication_date, citation_date or citation_year, whatever the date format", () => {
    const yearOf = (meta: Array<[string, string]>) => decodeCapture(enc(runOn(bookmarkletSourceV2(U), [["citation_title", "T"], ...meta]).raw!))!.year;
    expect(yearOf([["citation_date", "09/16/2019"]])).toBe("2019");
    expect(yearOf([["citation_publication_date", "2011 Nov"]])).toBe("2011");
    expect(yearOf([["citation_year", "2014"]])).toBe("2014");
    expect(yearOf([])).toBe("");
    // The first of the three tags that yields a year wins; a tag without one is passed over; a number that is not a year is not taken.
    expect(yearOf([["citation_publication_date", "Nov"], ["citation_date", "09/16/2019"], ["citation_year", "2014"]])).toBe("2019");
    expect(yearOf([["citation_publication_date", "2011 Nov"], ["citation_date", "09/16/2019"]])).toBe("2011");
    expect(yearOf([["citation_date", "09/16/99"], ["citation_year", "2014"]])).toBe("2014");
  });

  it("a page with both citation_author and citation_authors is read once (Review Focus 1)", () => {
    const names = ["Schaefer, Eva M.", "Gonzalez, Carlos B.", "Lee, Kim"];
    const { raw } = runOn(bookmarkletSourceV2(U), [["citation_title", "T"], ...names.map((n): [string, string] => ["citation_author", n]), ["citation_authors", "Schaefer EM; Gonzalez CB; Lee K"]]);
    const author = decodeCapture(enc(raw!))!.author;
    expect(author).toBe(names.join("; "));
    const list = author.split("; ");
    expect(new Set(list).size).toBe(list.length);
    for (const s of ["Schaefer", "Gonzalez", "Lee"]) expect(author.split(s).length - 1).toBe(1);
  });

  it("citation_authors with a trailing ';' or no spaces gives no empty name; a last page gives first-last; no page tags give no pages", () => {
    const one = decodeCapture(enc(runOn(bookmarkletSourceV2(U), [["citation_title", "T"], ["citation_authors", "Lee K;Park J;"], ["citation_firstpage", "123"], ["citation_lastpage", "130"]]).raw!))!;
    expect(one.author).toBe("Lee K; Park J");
    expect(one.pages).toBe("123-130");
    const two = decodeCapture(enc(runOn(bookmarkletSourceV2(U), [["citation_title", "T"], ["citation_firstpage", "5"], ["citation_lastpage", "5"]]).raw!))!;
    expect(two.pages).toBe("5");
    const none = decodeCapture(enc(runOn(bookmarkletSourceV2(U), [["citation_title", "T"]]).raw!))!;
    expect(none).toMatchObject({ author: "", volume: "", issue: "", pages: "" });
  });

  it("a page with no title still alerts v1's sentence and opens nothing", () => {
    const dom = runOnNoTitle(bookmarkletSourceV2(U));
    expect(dom.alerts).toEqual(["No citation info found on this page — this works best on a journal article, PubMed, or arXiv page."]);
    expect(dom.raw).toBeNull();
  });
});

function runOnNoTitle(source: string): { raw: string | null; alerts: string[] } {
  const dom = new JSDOM(`<!doctype html><html><head></head><body></body></html>`, { url: "https://example.org/", runScripts: "outside-only" });
  const w = dom.window as unknown as Record<string, unknown> & { eval(src: string): unknown };
  const opened: string[] = [], alerts: string[] = [];
  w.open = (u: unknown) => { opened.push(String(u)); return null; };
  w.alert = (m: unknown) => { alerts.push(String(m)); };
  w.eval(source);
  dom.window.close();
  return { raw: opened[0] ?? null, alerts };
}

type Fx = { captures: Array<{ id: string; hash: string }> };
const fx = readFixture<Fx>("citshare", "cases");
const raw = (hash: string) => hash.slice("#capture=".length);

describe("decodeCapture keeps the three new fields only when the payload has them", () => {
  it("a v1 payload decodes exactly as before: six keys", () => {
    for (const c of fx.captures) expect(Object.keys(decodeCapture(raw(c.hash))!), c.id).toEqual(["title", "author", "year", "source", "doi", "url"]);
  });
  it("a v2 payload keeps volume, issue and pages as strings", () => {
    const p = btoa(JSON.stringify({ title: "T", author: "Lee K", volume: 9, issue: "1", pages: "" }));
    expect(decodeCapture(encodeURIComponent(p))).toEqual({ title: "T", author: "Lee K", year: "", source: "", doi: "", url: "", volume: "9", issue: "1", pages: "" });
  });
});

describe("capNameToCit and captureRecordV2", () => {
  it("capNameToCit: a name with a comma unchanged; Surname Initials becomes Surname, Initials; anything else unchanged", () => {
    expect(capNameToCit("Schaefer EM")).toBe("Schaefer, EM");
    expect(capNameToCit("van der Berg JH")).toBe("van der Berg, JH");
    expect(capNameToCit("Miller, George A.")).toBe("Miller, George A.");
    expect(capNameToCit("WHO")).toBe("WHO");
    expect(capNameToCit("George Miller")).toBe("George Miller");
    expect(capNameToCit("Smith ABCDE")).toBe("Smith ABCDE");
    expect(capNameToCit("")).toBe("");
  });
  const pm: CaptureData = { title: "Sleep timing", author: "Schaefer EM; Gonzalez CB; Lee K; Park J; Wu T", year: "2024", source: "Scientific reports", doi: "10.1038/x", url: "https://pubmed.ncbi.nlm.nih.gov/1/", volume: "9", issue: "1", pages: "13317" };
  it("captureRecordV2 writes PubMed names as Surname, Initials and is v1's record for a v1 payload", () => {
    expect(captureRecordV2(pm).author).toBe("Schaefer, EM; Gonzalez, CB; Lee, K; Park, J; Wu, T");
    expect(captureRecordV2(pm)).toEqual({ ...captureRecord(pm), author: "Schaefer, EM; Gonzalez, CB; Lee, K; Park, J; Wu, T", volume: "9", issue: "1", pages: "13317" });
    for (const c of fx.captures) {
      const v1Payload = decodeCapture(raw(c.hash))!;
      expect(captureRecordV2(v1Payload), c.id).toEqual(captureRecord(v1Payload));
    }
  });
});

describe("captureRecordV2 and a bookmark dragged before W30", () => {
  const old: CaptureData = { title: "T", author: "Lee K", year: "09/1", source: "", doi: "", url: "https://pubmed.ncbi.nlm.nih.gov/1/" };
  it("a year that is not 4 digits is stored as empty, a 4-digit year is kept", () => {
    expect(captureRecordV2({ ...old, year: "09/1" }).year).toBe("");
    expect(captureRecordV2({ ...old, year: "" }).year).toBe("");
    expect(captureRecordV2({ ...old, year: "2019" }).year).toBe("2019");
    expect(captureYearV2("20")).toBe("");
    expect(captureYearV2("2019")).toBe("2019");
  });
});

describe("captureMatch", () => {
  const rec: CitationEntry = { title: "T", author: "Lee, K" };
  it("captureMatch: same title and author is dup; an empty stored author is fill; else new", () => {
    expect(captureMatch([{ title: "X" }, { title: "T", author: "Lee, K" }], rec)).toEqual({ kind: "dup" });
    expect(captureMatch([{ title: "X" }, { title: "T", author: "" }], rec)).toEqual({ kind: "fill", index: 1 });
    expect(captureMatch([{ title: "T" }], rec)).toEqual({ kind: "fill", index: 0 });
    expect(captureMatch([{ title: "T", author: "Park, J" }], rec)).toEqual({ kind: "new" });
    expect(captureMatch([], rec)).toEqual({ kind: "new" });
    // An authorless recapture of an authorless entry is v1's duplicate, not a fill.
    expect(captureMatch([{ title: "T", author: "" }], { title: "T", author: "" })).toEqual({ kind: "dup" });
    // A dup anywhere wins over a fill.
    expect(captureMatch([{ title: "T", author: "" }, { title: "T", author: "Lee, K" }], rec)).toEqual({ kind: "dup" });
  });
});
