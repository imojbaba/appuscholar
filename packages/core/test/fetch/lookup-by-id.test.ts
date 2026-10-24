import { describe, it, expect } from "vitest";
import { oaWorkByRef, oaWorkToEntry, rsFetchOpenAlex } from "../../src/fetch/openalex";
import type { OaWork } from "../../src/fetch/openalex";
import { pmPaperById, pmcidToIds, pmidToDoi, rsFetchPubmed } from "../../src/fetch/pubmed";
import { crLookupDoi, crLookupDoiV2 } from "../../src/fetch/crossref";
import { RECORDINGS, replay } from "./replay";

/**
 * The by-id lookups behind "Paste a link, DOI or PubMed number" (Task 19): oaWorkByRef and oaWorkToEntry (openalex.ts), pmPaperById and pmcidToIds (pubmed.ts) and
 * crLookupDoiV2 (crossref.ts), over the recorded responses. The ports they sit beside (rsFetchOpenAlex, rsFetchPubmed, pmidToDoi, crLookupDoi) are held to v1 by
 * their own golden tests and are not changed.
 */

const WALK_DOI = "10.1038/s41598-019-49466-6";
// rsFetchOpenAlex's select (v1 8061), then `biblio` (ruling B2-R17): no search select has biblio, so the volume, the issue and the pages come from here.
const SEARCH_SELECT = "id,display_name,authorships,publication_year,primary_location,abstract_inverted_index,cited_by_count,doi,referenced_works,cited_by_api_url,open_access,is_retracted";
const WORK_SELECT = SEARCH_SELECT + ",biblio";
const OA = (ref: string) => "https://api.openalex.org/works/" + ref + "?select=" + WORK_SELECT;
const ESUMMARY = (pmid: string) => "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=" + pmid;

describe("oaWorkByRef", () => {
  it("asks /works/<ref> with rsFetchOpenAlex's select plus biblio, and nothing else (the exact select)", async () => {
    const r = replay();
    const w = await oaWorkByRef(r.f, "doi:" + WALK_DOI);
    expect(r.unknown).toEqual([]);
    expect(r.requested).toEqual([
      "https://api.openalex.org/works/doi:10.1038/s41598-019-49466-6?select=id,display_name,authorships,publication_year,primary_location,abstract_inverted_index,cited_by_count,doi,referenced_works,cited_by_api_url,open_access,is_retracted,biblio"
    ]);
    expect(w).not.toBeNull();
    expect(w!.display_name).toMatch(/^Open-label placebos reduce test anxiety/);
    expect(w!.authorships).toHaveLength(6);
    expect(w!.biblio).toEqual({ volume: "9", issue: "1", first_page: "13317", last_page: "13317" });
  });
  it("its select is rsFetchOpenAlex's, with biblio added at the end", async () => {
    const urls: string[] = [];
    await rsFetchOpenAlex((async (u: RequestInfo | URL) => { urls.push(String(u)); return new Response('{"results":[]}'); }) as typeof fetch, "x");
    expect(urls[0]!.split("&select=")[1]).toBe(SEARCH_SELECT);
    const seen: string[] = [];
    await oaWorkByRef((async (u: RequestInfo | URL) => { seen.push(String(u)); return new Response("", { status: 404 }); }) as typeof fetch, "W1");
    expect(seen[0]!.split("?select=")[1]).toBe(SEARCH_SELECT + ",biblio");
  });
  it("every reference form it is handed reaches OpenAlex as written (the DOI, PMC and OpenAlex forms)", async () => {
    for (const ref of ["doi:10.48550/arxiv.2101.00001", "pmcid:PMC6746734", "W2972990769"]) {
      const r = replay();
      const w = await oaWorkByRef(r.f, ref);
      expect(r.requested).toEqual([OA(ref)]);
      expect(r.unknown).toEqual([]);
      if (ref.startsWith("pmcid:")) expect(w).toBeNull(); // OpenAlex holds no PMC numbers (has_pmcid:true counts 0 works on 2026-10-24)
      else expect(w).not.toBeNull();
    }
  });
  it("a DOI with characters a path cannot hold is percent-encoded, the colon and slashes kept", async () => {
    const seen: string[] = [];
    await oaWorkByRef((async (u: RequestInfo | URL) => { seen.push(String(u)); return new Response("", { status: 404 }); }) as typeof fetch, "doi:10.1002/(sici)1097-4679(199801)54:1<1::aid-jclp1>3.0.co;2-x#a?b");
    expect(seen[0]!.split("?select=")[0]).toBe("https://api.openalex.org/works/doi:10.1002/(sici)1097-4679(199801)54%3A1%3C1%3A%3Aaid-jclp1%3E3.0.co%3B2-x%23a%3Fb");
  });
  it("a 404 is null; another HTTP error rejects (\"429\" for the spent budget); a throw rejects", async () => {
    const answer = (status: number) => (async () => new Response("", { status })) as typeof fetch;
    expect(await oaWorkByRef(answer(404), "W1")).toBeNull();
    await expect(oaWorkByRef(answer(500), "W1")).rejects.toThrow("HTTP 500");
    await expect(oaWorkByRef(answer(429), "W1")).rejects.toThrow("429");
    await expect(oaWorkByRef((async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch, "W1")).rejects.toThrow("Failed to fetch");
  });
  it("the key is added as api_key, as for every OpenAlex request", async () => {
    const seen: string[] = [];
    await oaWorkByRef((async (u: RequestInfo | URL) => { seen.push(String(u)); return new Response("", { status: 404 }); }) as typeof fetch, "W1", " k 1 ");
    expect(seen[0]).toBe(OA("W1") + "&api_key=k%201");
  });
});

describe("oaWorkToEntry keeps every author, the volume, the issue, the pages and the DOI", () => {
  it("the walk paper: six authors by wave A's name rule, volume 9, issue 1, pages 13317", async () => {
    const w = (await oaWorkByRef(replay().f, "doi:" + WALK_DOI))!;
    expect(oaWorkToEntry(w)).toEqual({
      title: "Open-label placebos reduce test anxiety and improve self-management skills: A randomized-controlled trial",
      author: "Schaefer, Michael; Denke, Claudia; Harke, Rebecca; Olk, Nina; Erkovan, Merve; Enge, Sören",
      year: "2019", source: "Scientific Reports", volume: "9", issue: "1", pages: "13317", doi: WALK_DOI, url: "", type: "Journal article"
    });
  });
  it("more than four authors are all kept (the card line's four and \"et al.\" are not the entry's)", async () => {
    const w = (await oaWorkByRef(replay().f, "doi:10.48550/arxiv.2101.00001"))!;
    const many: OaWork = { ...w, authorships: ["Ann Lee", "Bo Chen", "Cy Park", "Di Ross", "Ed Stone", "Flo Tran"].map((n) => ({ author: { display_name: n } })) };
    expect(oaWorkToEntry(many).author).toBe("Lee, Ann; Chen, Bo; Park, Cy; Ross, Di; Stone, Ed; Tran, Flo");
  });
  it("pages: a range from the first and last page, one number when they are the same, the first page alone, none", () => {
    const base: OaWork = { id: "https://openalex.org/W1", display_name: "T", publication_year: 1998, doi: "https://doi.org/10.1000/x" };
    const pagesOf = (biblio: OaWork["biblio"]) => oaWorkToEntry({ ...base, biblio }).pages;
    expect(pagesOf({ volume: "351", issue: "9103", first_page: "637", last_page: "641" })).toBe("637-641");
    expect(pagesOf({ first_page: "13317", last_page: "13317" })).toBe("13317");
    expect(pagesOf({ first_page: "e0123" })).toBe("e0123");
    expect(pagesOf({ first_page: null, last_page: null })).toBe("");
    expect(pagesOf(null)).toBe("");
    expect(pagesOf(undefined)).toBe("");
    expect(oaWorkToEntry({ ...base, biblio: { volume: "351", issue: "9103" } })).toMatchObject({ volume: "351", issue: "9103", pages: "" });
  });
  it("the DOI is bare; a work with no DOI keeps its OpenAlex address as the URL; no venue is a website; no authors is an empty author", () => {
    const e = oaWorkToEntry({ id: "https://openalex.org/W42", display_name: "A web page", publication_year: null, doi: null, authorships: [], primary_location: null });
    expect(e).toEqual({ title: "A web page", author: "", year: "", source: "", volume: "", issue: "", pages: "", doi: "", url: "https://openalex.org/W42", type: "Website" });
  });
  it("it sets no citation style: the page's own style choice stays the caller's", () => {
    expect("style" in oaWorkToEntry({ id: "https://openalex.org/W1", display_name: "T" })).toBe(false);
  });
});

type EsItem = { uid: string; title: string; authors: Array<{ name: string }>; pubdate: string; fulljournalname: string; source: string; volume: string; issue: string; pages: string; articleids: Array<{ idtype: string; value: string }> };
const esBody = (pmid: string) => JSON.parse(RECORDINGS.get(ESUMMARY(pmid))!.body) as { result: Record<string, EsItem> };

describe("pmPaperById", () => {
  it("asks esummary for the one id, the same URL pmidToDoi asks, so the same recordings answer", async () => {
    const r = replay();
    const p = await pmPaperById(r.f, "14907713");
    const r2 = replay();
    await pmidToDoi(r2.f, "14907713");
    expect(r.requested).toEqual([ESUMMARY("14907713")]);
    expect(r.requested).toEqual(r2.requested);
    expect(r.unknown).toEqual([]);
    const it = esBody("14907713").result["14907713"]!;
    expect(p).toEqual({
      source: "PubMed", ssId: null, title: it.title, authors: "LOWRY OH, ROSEBROUGH NJ, FARR AL, RANDALL RJ", year: "1951", venue: it.fulljournalname,
      abstract: "", pmid: "14907713", citationCount: 0, doi: "", url: "https://pubmed.ncbi.nlm.nih.gov/14907713/",
      authorList: ["LOWRY OH", "ROSEBROUGH NJ", "FARR AL", "RANDALL RJ"], volume: "193", issue: "1", pages: "265-275"
    });
  });
  it("maps an esummary item as rsFetchPubmed maps it (every field of the recorded search's six papers, the abstract and the DOI aside)", async () => {
    const search = replay();
    const papers = await rsFetchPubmed(search.f, '(exam[tiab] AND anxiety[tiab]) AND "Randomized Controlled Trial"[pt]', 6);
    expect(papers.length).toBe(6);
    const esummary = JSON.parse(RECORDINGS.get(search.requested[1]!)!.body) as { result: Record<string, unknown> };
    for (const p of papers) {
      // The recorded search holds six ids in one esummary; serve one id's item as the one-id answer.
      const one = JSON.stringify({ result: { uids: [p.pmid], [p.pmid]: esummary.result[p.pmid] } });
      const got = await pmPaperById((async () => new Response(one)) as typeof fetch, p.pmid);
      const { abstract: _a, doi: _d, ...rest } = p;
      expect(got, p.pmid).toMatchObject(rest);
      expect(got!.abstract).toBe("");
    }
  });
  it("PubMed's DOI, in lower case, is on the paper (the port leaves it empty, v1's choice)", async () => {
    const body = JSON.stringify({ result: { uids: ["1"], "1": { uid: "1", title: "T", articleids: [{ idtype: "pubmed", value: "1" }, { idtype: "doi", value: "10.1000/ABC" }] } } });
    expect((await pmPaperById((async () => new Response(body)) as typeof fetch, "1"))!.doi).toBe("10.1000/abc");
  });
  it("an id PubMed does not know (esummary answers 200 with an error item) is null", async () => {
    const r = replay();
    expect(await pmPaperById(r.f, "99999999")).toBeNull();
    expect(r.unknown).toEqual([]);
    expect(await pmPaperById((async () => new Response('{"result":{"uids":[]}}')) as typeof fetch, "1")).toBeNull();
  });
  it("an HTTP error rejects as the port's esummary does", async () => {
    await expect(pmPaperById((async () => new Response("", { status: 500 })) as typeof fetch, "1")).rejects.toThrow("HTTP 500");
  });
});

describe("pmcidToIds", () => {
  it("asks E-utilities esummary on db=pmc for the number part of the PMC id and gives the PMID and the DOI, the DOI in lower case", async () => {
    const r = replay();
    expect(await pmcidToIds(r.f, "PMC6746734")).toEqual({ pmid: "31527670", doi: WALK_DOI });
    expect(r.requested).toEqual(["https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pmc&retmode=json&id=6746734"]);
    expect(r.unknown).toEqual([]);
  });
  it("an article without a DOI or a PMID gives null for it; an unknown PMC id (an error item) gives null", async () => {
    const one = '{"result":{"uids":["5"],"5":{"uid":"5","articleids":[{"idtype":"pmcid","value":"PMC5"}]}}}';
    expect(await pmcidToIds((async () => new Response(one)) as typeof fetch, "PMC5")).toEqual({ pmid: null, doi: null });
    expect(await pmcidToIds(replay().f, "PMC99999999")).toBeNull();
  });
  it("an HTTP error rejects", async () => {
    await expect(pmcidToIds((async () => new Response("", { status: 503 })) as typeof fetch, "PMC1")).rejects.toThrow("HTTP 503");
  });
});

describe("crLookupDoiV2 is crLookupDoi, with Crossref's article number as the pages when it lists no page", () => {
  it("the walk paper: Crossref gives article-number 13317 and no page", async () => {
    const v1 = await crLookupDoi(replay().f, WALK_DOI);
    const v2 = await crLookupDoiV2(replay().f, WALK_DOI);
    expect(v1).toMatchObject({ volume: "9", issue: "1", pages: "" });
    expect(v2).toEqual({ ...v1, pages: "13317" });
    expect(v2!.author).toBe("Schaefer, Michael; Denke, Claudia; Harke, Rebecca; Olk, Nina; Erkovan, Merve; Enge, Sören");
  });
  it("over every recorded Crossref work it differs from crLookupDoi only in pages, and only where Crossref lists no page", async () => {
    const urls = [...RECORDINGS.values()].filter((x) => x.url.startsWith("https://api.crossref.org/works/") && x.status === 200);
    expect(urls.length).toBeGreaterThanOrEqual(10);
    let withNumber = 0;
    for (const rec of urls) {
      const doi = decodeURIComponent(rec.url.slice("https://api.crossref.org/works/".length));
      const msg = (JSON.parse(rec.body) as { message: { page?: string; "article-number"?: string } }).message;
      const v1 = (await crLookupDoi(replay().f, doi))!;
      const v2 = (await crLookupDoiV2(replay().f, doi))!;
      if (!msg.page && msg["article-number"]) { withNumber++; expect(v2).toEqual({ ...v1, pages: String(msg["article-number"]) }); }
      else expect(v2, doi).toEqual(v1);
    }
    expect(withNumber).toBeGreaterThanOrEqual(1);
  });
  it("a page range wins over an article number; neither gives empty pages; a 404 is null; another HTTP error rejects", async () => {
    const work = (extra: object) => (async () => new Response(JSON.stringify({ message: { title: ["T"], ...extra } }))) as typeof fetch;
    expect((await crLookupDoiV2(work({ page: "1-9", "article-number": "5" }), "10.1/x"))!.pages).toBe("1-9");
    expect((await crLookupDoiV2(work({}), "10.1/x"))!.pages).toBe("");
    expect(await crLookupDoiV2(replay().f, "10.9999/appuscholar-no-such-doi-2026")).toBeNull();
    await expect(crLookupDoiV2((async () => new Response("", { status: 500 })) as typeof fetch, "10.1/x")).rejects.toThrow("HTTP 500");
  });
});
