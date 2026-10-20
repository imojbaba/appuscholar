import { describe, it, expect } from "vitest";
import { bibliographyHtml } from "../src/citlib";
import { pmSearch, rsFetchPubmed } from "../src/fetch/pubmed";
import { rsEntryFromResult, rsEntryFromResultV2 } from "../src/research";
import { captureMatch, captureRecordV2, decodeCapture } from "../src/citcapture";
import { fx, replay } from "./fetch/replay";

/**
 * Walk fault W28: a reference built from a search result listed four authors and no volume, issue or pages, because the entry it was made from had none
 * (W2). Through the fixed search (rsFetchPubmed) and the fixed entry (rsEntryFromResultV2), the APA reference lists every author and the three fields.
 */

const SIX = [["Schaefer EM", "Schaefer"], ["Gonzalez CB", "Gonzalez"], ["Lee K", "Lee"], ["Park J", "Park"], ["Wu T", "Wu"], ["Okafor N", "Okafor"]] as const;
const SIX_SURNAMES = SIX.map((x) => x[1]);

/** PubMed's esearch and esummary for one paper with six authors (the shape of the recorded bodies), and no efetch abstract. */
const pmFetch = (async (input: RequestInfo | URL) => {
  const u = String(input);
  if (u.includes("/esearch.fcgi?")) return new Response(JSON.stringify({ esearchresult: { idlist: ["41000001"] } }));
  if (u.includes("/esummary.fcgi?")) return new Response(JSON.stringify({ result: { uids: ["41000001"], "41000001": {
    title: "Sleep timing and exam anxiety in first-year students", authors: SIX.map(([name]) => ({ name, authtype: "Author" })), pubdate: "2024 Mar 2",
    fulljournalname: "Scientific reports", source: "Sci Rep", volume: "9", issue: "1", pages: "13317" } } }));
  return new Response("", { status: 500 });
}) as typeof fetch;

describe("references from search results (W28)", () => {
  it("an APA reference from a PubMed result lists every author and its volume, issue and pages (W28)", async () => {
    const [pmPaperWith6Authors] = await rsFetchPubmed(pmFetch, "exam anxiety", 6);
    const html = bibliographyHtml([rsEntryFromResultV2(pmPaperWith6Authors!, "apa")], "apa");
    for (const s of SIX_SURNAMES) expect(html).toContain(s);
    expect(html).toContain("13317");
    expect(html).toContain("Scientific reports, 9</i>(1), 13317");
    expect(html).not.toContain("Author.");
    // v1's entry from the same paper: four authors and no volume or pages (the fault).
    const v1 = bibliographyHtml([rsEntryFromResult(pmPaperWith6Authors!, "apa")], "apa");
    expect(v1).not.toContain("Okafor");
    expect(v1).not.toContain("13317");
  });

  it("over the recorded PubMed search (pm-rct), each reference names every author and the volume and pages", async () => {
    const s = fx.searches.find((x) => x.name === "pm-rct")!;
    const out = await pmSearch(replay(s.in.throwFor).f, { q: s.in.topic, terms: s.in.terms, design: s.in.design, retmax: s.in.rank ? 15 : 6 });
    const papers = out.papers;
    expect(papers.length).toBe(6);
    for (const p of papers) {
      const html = bibliographyHtml([rsEntryFromResultV2(p, "apa")], "apa");
      for (const name of p.authorList ?? []) expect(html, p.pmid).toContain(name.split(/\s+/)[0]!);
      if (p.volume) expect(html, p.pmid).toContain(", " + p.volume + "</i>");
      if (p.pages) expect(html, p.pmid).toContain(p.pages.split("-")[0]!);
    }
  });
});

/** The reviewer's PubMed list (fix round 1): a plain name, a surname particle, a two-word surname and a collective name. */
const FOUR = ["Schaefer EM", "van der Berg JH", "Garcia Lopez M", "COVID-19 Study Group"];
const FOUR_TITLE = "Sleep timing and exam anxiety in first-year students";
const fourFetch = (async (input: RequestInfo | URL) => {
  const u = String(input);
  if (u.includes("/esearch.fcgi?")) return new Response(JSON.stringify({ esearchresult: { idlist: ["41000002"] } }));
  if (u.includes("/esummary.fcgi?")) return new Response(JSON.stringify({ result: { uids: ["41000002"], "41000002": {
    title: FOUR_TITLE, authors: FOUR.map((name, i) => ({ name, authtype: i === 3 ? "CollectiveName" : "Author" })), pubdate: "2024 Mar 2",
    fulljournalname: "Scientific reports", source: "Sci Rep", volume: "9", issue: "1", pages: "13317" } } }));
  return new Response("", { status: 500 });
}) as typeof fetch;

describe("one name rule for the capture and the search (fix round 1)", () => {
  it("a PubMed search result with a particle, a two-word surname and a collective name: the stored author and the APA reference are right", async () => {
    const [p] = await rsFetchPubmed(fourFetch, "exam anxiety", 6);
    const entry = rsEntryFromResultV2(p!, "apa");
    expect(entry.author).toBe("Schaefer, EM; van der Berg, JH; Garcia Lopez, M; COVID-19 Study Group");
    const html = bibliographyHtml([entry], "apa");
    expect(html).toContain("Schaefer, E. M., van der Berg, J. H., Garcia Lopez, M., &amp; COVID-19 Study Group. (2024).");
  });
  it("a capture and a search add of the same PubMed paper write the same author, so captureMatch sees a duplicate", async () => {
    const [p] = await rsFetchPubmed(fourFetch, "exam anxiety", 6);
    const fromSearch = rsEntryFromResultV2(p!, "apa");
    // What bookmarkletSourceV2 sends from the article's PubMed page (its citation_authors tag).
    const payload = { title: FOUR_TITLE, author: FOUR.join("; "), year: "2024", source: "Scientific reports", doi: "", url: "https://pubmed.ncbi.nlm.nih.gov/41000002/", volume: "9", issue: "1", pages: "13317" };
    const fromCapture = captureRecordV2(decodeCapture(encodeURIComponent(btoa(JSON.stringify(payload))))!);
    expect(fromCapture.author).toBe(fromSearch.author);
    expect(captureMatch([fromSearch], fromCapture)).toEqual({ kind: "dup" });
  });
});
