import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { bookmarkletHrefV2, bookmarkletHrefV3, bookmarkletSourceV2, bookmarkletSourceV3, decodeCapture } from "../src/citcapture";

/**
 * The bookmark as an extra (wave B Task 20, register row D-S2-125, walk faults W5, W6 and W13): the bookmark now opens the focused adding screen, `/add`, not the
 * workspace at `/`. bookmarkletSourceV3 is bookmarkletSourceV2 with exactly one thing different: the address the page opens, `origin + "/add#capture="` where V2's is
 * `appUrl + "#capture="`. Everything it reads from the page and sends (V2's authors, year, volume, issue and pages) and the alert on a page with no citation tags are
 * V2's. V1's and V2's functions and their tests (golden/citcapture.test.ts, citcapture-v2.test.ts) are unchanged.
 */

const O = "http://localhost";
const OPENED_V2 = "window.open('" + O + "/#capture='";
const OPENED_V3 = "window.open('" + O + "/add#capture='";

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

/** Runs a bookmarklet source on a jsdom page with these meta tags, as citcapture-v2.test.ts does; the address it opened and the alerts it showed. */
function runOn(source: string, meta: Array<[string, string]>, title = "Page"): { opened: string | null; alerts: string[] } {
  const metas = meta.map(([n, c]) => `<meta name="${n}" content="${c.replace(/"/g, "&quot;")}">`).join("");
  const dom = new JSDOM(`<!doctype html><html><head><title>${title}</title>${metas}</head><body></body></html>`, { url: "https://pubmed.ncbi.nlm.nih.gov/41234567/", runScripts: "outside-only" });
  const w = dom.window as unknown as Record<string, unknown> & { eval(src: string): unknown };
  const opened: string[] = [], alerts: string[] = [];
  w.open = (u: unknown) => { opened.push(String(u)); return null; };
  w.alert = (m: unknown) => { alerts.push(String(m)); };
  w.eval(source);
  dom.window.close();
  return { opened: opened[0] ?? null, alerts };
}

describe("bookmarkletSourceV3 (W5, W6, W13)", () => {
  it("V3 differs from V2 only in the target path: origin + /add#capture= where V2 has appUrl + #capture=", () => {
    const v2 = bookmarkletSourceV2(O + "/");
    const v3 = bookmarkletSourceV3(O);
    expect(v2).toContain(OPENED_V2);
    expect(v3).toContain(OPENED_V3);
    expect(v3).not.toBe(v2);
    // Swap the one address back and the two sources are the same text.
    expect(v3.replace(OPENED_V3, OPENED_V2)).toBe(v2);
    // And the other way: V2 with that one address replaced is V3, character for character.
    expect(v2.replace(OPENED_V2, OPENED_V3)).toBe(v3);
    // The address is the only place the origin appears.
    expect(v3.split(O).length - 1).toBe(1);
  });

  it("a trailing slash on the origin makes no difference", () => {
    expect(bookmarkletSourceV3(O + "/")).toBe(bookmarkletSourceV3(O));
    expect(bookmarkletSourceV3(O + "//")).toBe(bookmarkletSourceV3(O));
  });

  it("run on a PubMed page it opens /add with V2's payload, byte for byte", () => {
    const v2 = runOn(bookmarkletSourceV2(O + "/"), PUBMED);
    const v3 = runOn(bookmarkletSourceV3(O), PUBMED);
    expect(v2.opened).not.toBeNull();
    expect(v3.opened).not.toBeNull();
    expect(v3.opened!.startsWith(O + "/add#capture=")).toBe(true);
    expect(v2.opened!.startsWith(O + "/#capture=")).toBe(true);
    const payload = (u: string, prefix: string) => u.slice(prefix.length);
    expect(payload(v3.opened!, O + "/add#capture=")).toBe(payload(v2.opened!, O + "/#capture="));
    expect(decodeCapture(payload(v3.opened!, O + "/add#capture="))).toMatchObject({ author: "Schaefer EM; Gonzalez CB; Lee K; Park J; Wu T", year: "2024", volume: "9", issue: "1", pages: "13317", source: "Scientific reports" });
  });

  it("a page with no title still alerts V2's sentence and opens nothing", () => {
    const r = runOn(bookmarkletSourceV3(O), [], "");
    expect(r.alerts).toEqual(["No citation info found on this page \u2014 this works best on a journal article, PubMed, or arXiv page."]);
    expect(r.opened).toBeNull();
  });

  it("bookmarkletHrefV3 is the link's href as bookmarkletHrefV2 builds V2's: javascript: and the encoded source", () => {
    expect(bookmarkletHrefV3(O)).toBe("javascript:" + encodeURIComponent(bookmarkletSourceV3(O)));
    expect(bookmarkletHrefV3(O)).not.toBe(bookmarkletHrefV2(O + "/"));
  });
});
