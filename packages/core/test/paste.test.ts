import { describe, it, expect } from "vitest";
import { parsePasted, pasteLookup } from "../src/paste";
import type { PastedRef } from "../src/paste";
import { RECORDINGS, replay } from "./fetch/replay";

/**
 * paste.ts (Task 19, "Paste a link, DOI or PubMed number"): what a student pastes, read as a DOI, a PubMed number, a PMC number, an arXiv id or an OpenAlex id,
 * and the lookup of each into a citation entry. The lookups run over recorded responses (test/fetch/recorded: Crossref, OpenAlex, PubMed E-utilities), so a
 * request is matched by its exact URL and a URL with no recording fails the test through `unknown`.
 */

const WALK_DOI = "10.1038/s41598-019-49466-6"; // Schaefer et al. 2019, Scientific Reports: the walk sheet's paper
const SCHAEFER_AUTHORS = "Schaefer, Michael; Denke, Claudia; Harke, Rebecca; Olk, Nina; Erkovan, Merve; Enge, Sören";
const SCHAEFER_TITLE = "Open-label placebos reduce test anxiety and improve self-management skills: A randomized-controlled trial";

const CR = (doi: string) => "https://api.crossref.org/works/" + encodeURIComponent(doi);
const ESUMMARY = (pmid: string) => "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=" + pmid;
const OA_SELECT = "id,display_name,authorships,publication_year,primary_location,abstract_inverted_index,cited_by_count,doi,referenced_works,cited_by_api_url,open_access,is_retracted,biblio";
const OA = (ref: string) => "https://api.openalex.org/works/" + ref + "?select=" + OA_SELECT;
const PMC_ESUMMARY = (num: string) => "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pmc&retmode=json&id=" + num;

describe("parsePasted", () => {
  it.each([
    ["10.1038/s41598-019-49466-6", { k: "doi", v: "10.1038/s41598-019-49466-6" }],
    ["https://doi.org/10.1038/s41598-019-49466-6", { k: "doi", v: "10.1038/s41598-019-49466-6" }],
    ["https://pubmed.ncbi.nlm.nih.gov/31527720/", { k: "pmid", v: "31527720" }],
    ["31527720", { k: "pmid", v: "31527720" }],
    ["pmc6746720", { k: "pmcid", v: "PMC6746720" }],
    ["https://arxiv.org/abs/2101.00001v2", { k: "arxiv", v: "2101.00001" }],
    ["https://openalex.org/W2487945683", { k: "openalex", v: "W2487945683" }],
    ["https://www.sciencedirect.com/science/article/pii/S0000", { k: "link" }],
    ["exam anxiety and sleep", { k: "text", v: "exam anxiety and sleep" }]
  ] satisfies Array<[string, PastedRef]>)("parsePasted(%s)", (s, want) => expect(parsePasted(s)).toEqual(want));

  it("blank is empty", () => {
    expect(parsePasted("")).toEqual({ k: "empty" });
    expect(parsePasted("  \n\t ")).toEqual({ k: "empty" });
  });
  it("a DOI is read from a publisher link that carries one, from a pasted reference, and is lower-cased without its closing punctuation", () => {
    expect(parsePasted("https://dl.acm.org/doi/10.1145/3290605.3300233")).toEqual({ k: "doi", v: "10.1145/3290605.3300233" });
    expect(parsePasted("Wakefield AJ et al. Lancet 1998;351:637-41. doi:10.1016/S0140-6736(97)11096-0).")).toEqual({ k: "doi", v: "10.1016/s0140-6736(97)11096-0" });
    expect(parsePasted("  DOI 10.1037/0003-066X.55.1.68.  ")).toEqual({ k: "doi", v: "10.1037/0003-066x.55.1.68" });
  });
  it("from a link the DOI stops at a query or a fragment and loses a closing slash; a DOI that is not in a link keeps them", () => {
    expect(parsePasted("https://onlinelibrary.wiley.com/doi/10.1111/jcpp.12345?af=R")).toEqual({ k: "doi", v: "10.1111/jcpp.12345" });
    expect(parsePasted("https://link.springer.com/article/10.1007/s11199-020-01142-2#citeas")).toEqual({ k: "doi", v: "10.1007/s11199-020-01142-2" });
    expect(parsePasted("https://doi.org/10.1038/s41598-019-49466-6/")).toEqual({ k: "doi", v: "10.1038/s41598-019-49466-6" });
    expect(parsePasted("doi:10.1002/(sici)1097-4679(199801)54:1#x")).toEqual({ k: "doi", v: "10.1002/(sici)1097-4679(199801)54:1#x" });
  });
  it("an arXiv DOI is a DOI (first match wins); an arXiv id is read from abs and pdf links, 'arXiv:' and a bare id, the version dropped", () => {
    expect(parsePasted("https://doi.org/10.48550/arXiv.2101.00001")).toEqual({ k: "doi", v: "10.48550/arxiv.2101.00001" });
    expect(parsePasted("https://arxiv.org/pdf/2101.00001v3")).toEqual({ k: "arxiv", v: "2101.00001" });
    expect(parsePasted("arXiv:2101.00001")).toEqual({ k: "arxiv", v: "2101.00001" });
    expect(parsePasted("arXiv: 2101.00001v2")).toEqual({ k: "arxiv", v: "2101.00001" });
    expect(parsePasted("2101.00001")).toEqual({ k: "arxiv", v: "2101.00001" });
    expect(parsePasted(" 2101.12345v10 ")).toEqual({ k: "arxiv", v: "2101.12345" });
  });
  it("a PMC number is upper-cased wherever it sits, in a link too", () => {
    expect(parsePasted("PMC6746734")).toEqual({ k: "pmcid", v: "PMC6746734" });
    expect(parsePasted("https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6746734/")).toEqual({ k: "pmcid", v: "PMC6746734" });
    expect(parsePasted("https://pmc.ncbi.nlm.nih.gov/articles/pmc6746734/")).toEqual({ k: "pmcid", v: "PMC6746734" });
  });
  it("a PMC number is a whole token: letters or more digits around it make it something else", () => {
    expect(parsePasted("PMC12345678901")).toEqual({ k: "text", v: "PMC12345678901" });
    expect(parsePasted("XPMC6746734")).toEqual({ k: "text", v: "XPMC6746734" });
    expect(parsePasted("PMC123")).toEqual({ k: "text", v: "PMC123" });
  });
  it("a PubMed number is read from PMID:, both PubMed link forms and a bare 6 to 9 digit number", () => {
    expect(parsePasted("PMID: 9500320")).toEqual({ k: "pmid", v: "9500320" });
    expect(parsePasted("PMID 31527720")).toEqual({ k: "pmid", v: "31527720" });
    expect(parsePasted("https://www.ncbi.nlm.nih.gov/pubmed/9500320")).toEqual({ k: "pmid", v: "9500320" });
    expect(parsePasted(" 14907713 ")).toEqual({ k: "pmid", v: "14907713" });
    expect(parsePasted("12345")).toEqual({ k: "text", v: "12345" }); // too short to be a bare PubMed number
  });
  it("an OpenAlex id is read from its link or bare", () => {
    expect(parsePasted("W2972990769")).toEqual({ k: "openalex", v: "W2972990769" });
    expect(parsePasted("https://openalex.org/works/W2972990769")).toEqual({ k: "openalex", v: "W2972990769" });
    expect(parsePasted("https://api.openalex.org/works/W2972990769")).toEqual({ k: "openalex", v: "W2972990769" });
  });
  it("any other link is a link; anything else is the text, trimmed", () => {
    expect(parsePasted("http://example.com/some/page")).toEqual({ k: "link" });
    expect(parsePasted("  https://example.com/a?b=1  ")).toEqual({ k: "link" });
    expect(parsePasted("  Self-determination theory and intrinsic motivation  ")).toEqual({ k: "text", v: "Self-determination theory and intrinsic motivation" });
  });
});

describe("pasteLookup: nothing to look up", () => {
  it("a link, a title and nothing send no request and give the matching result", async () => {
    const r = replay();
    expect(await pasteLookup(r.f, { k: "link" })).toEqual({ result: "link" });
    expect(await pasteLookup(r.f, { k: "text", v: "exam anxiety and sleep" })).toEqual({ result: "text" });
    expect(await pasteLookup(r.f, { k: "empty" })).toEqual({ result: "empty" });
    expect(r.requested).toEqual([]);
  });
});

describe("pasteLookup: a DOI", () => {
  it("a DOI keeps every author, the volume and the pages", async () => {
    const r = replay();
    const out = await pasteLookup(r.f, { k: "doi", v: WALK_DOI });
    expect(r.unknown).toEqual([]);
    expect(r.requested).toEqual([CR(WALK_DOI)]);
    expect(out).toEqual({
      result: "ok",
      entry: {
        title: SCHAEFER_TITLE, author: SCHAEFER_AUTHORS, year: "2019", month: "9", day: "16",
        source: "Scientific Reports", container: "", editors: "", volume: "9", issue: "1", pages: "13317", doi: WALK_DOI, url: "", type: "Journal article"
      }
    });
    // Crossref lists the 13317 as the article number, not as a page range: the recorded body holds no `page`.
    const msg = (JSON.parse(RECORDINGS.get(CR(WALK_DOI))!.body) as { message: Record<string, unknown> }).message;
    expect(msg.page).toBeUndefined();
    expect(msg["article-number"]).toBe("13317");
    expect((msg.author as unknown[]).length).toBe(6);
  });
  it("a DOI Crossref does not hold is found through OpenAlex (an arXiv DOI), with its abstract and its free copy", async () => {
    const r = replay();
    const out = await pasteLookup(r.f, { k: "doi", v: "10.48550/arxiv.2101.00001" });
    expect(r.unknown).toEqual([]);
    expect(r.requested).toEqual([CR("10.48550/arxiv.2101.00001"), OA("doi:10.48550/arxiv.2101.00001")]);
    expect(out.result).toBe("ok");
    if (out.result !== "ok") return;
    expect(out.entry).toMatchObject({ title: "Etat de l'art sur l'application des bandits multi-bras", author: "Bouneffouf, Djallel", year: "2021", doi: "10.48550/arxiv.2101.00001", volume: "", issue: "", pages: "" });
    expect(out.oa).toBe("https://arxiv.org/pdf/2101.00001");
    expect(out.abstract).toMatch(/^The Multi-armed bandit/);
  });
  it("a DOI neither Crossref nor OpenAlex holds is not found", async () => {
    const r = replay();
    expect(await pasteLookup(r.f, { k: "doi", v: "10.9999/appuscholar-no-such-doi-2026" })).toEqual({ result: "nf" });
    expect(r.unknown).toEqual([]);
    expect(r.requested).toEqual([CR("10.9999/appuscholar-no-such-doi-2026"), OA("doi:10.9999/appuscholar-no-such-doi-2026")]);
  });
});

describe("pasteLookup: a PubMed number", () => {
  it("a PubMed number with a DOI is Crossref's entry for that DOI", async () => {
    const r = replay();
    const out = await pasteLookup(r.f, { k: "pmid", v: "9500320" });
    expect(r.unknown).toEqual([]);
    expect(r.requested).toEqual([ESUMMARY("9500320"), CR("10.1016/s0140-6736(97)11096-0")]);
    expect(out.result).toBe("ok");
    if (out.result !== "ok") return;
    expect(out.entry).toMatchObject({ doi: "10.1016/s0140-6736(97)11096-0", year: "1998", source: "The Lancet", volume: "351", issue: "9103", pages: "637-641" });
    expect(out.entry.author).toMatch(/^Wakefield, AJ; Murch, SH; Anthony, A/);
  });
  it("a PubMed number with no DOI still keeps the paper from PubMed", async () => {
    const r = replay();
    const out = await pasteLookup(r.f, { k: "pmid", v: "14907713" });
    expect(r.unknown).toEqual([]);
    expect(r.requested).toEqual([ESUMMARY("14907713"), ESUMMARY("14907713")]); // pmidToDoi finds no DOI, then pmPaperById reads the paper
    const item = (JSON.parse(RECORDINGS.get(ESUMMARY("14907713"))!.body) as { result: Record<string, { title: string; authors: Array<{ name: string }>; pubdate: string; fulljournalname: string; volume: string; issue: string; pages: string }> }).result["14907713"]!;
    expect(out.result).toBe("ok");
    if (out.result !== "ok") return;
    expect(out.entry).toMatchObject({
      title: item.title, year: item.pubdate.slice(0, 4), source: item.fulljournalname, volume: item.volume, issue: item.issue,
      doi: "", url: "https://pubmed.ncbi.nlm.nih.gov/14907713/", type: "Journal article"
    });
    expect(out.entry.title).toBeTruthy();
    // Every author PubMed lists, none cut to four and "et al.".
    expect((out.entry.author ?? "").split("; ")).toHaveLength(item.authors.length);
    expect(out.entry.author).not.toMatch(/et al/);
    expect(out.entry.style).toBeUndefined();
  });
  it("a PubMed number whose DOI Crossref does not hold keeps the paper from PubMed, with PubMed's DOI", async () => {
    const nosuch = "10.9999/appuscholar-no-such-doi-2026"; // the recorded Crossref 404
    const body = JSON.stringify({ result: { uids: ["7"], "7": { uid: "7", title: "A paper Crossref lacks.", authors: [{ name: "Doe J" }], pubdate: "2001 May", fulljournalname: "Some Journal", volume: "3", issue: "2", pages: "10-9", articleids: [{ idtype: "pubmed", value: "7" }, { idtype: "doi", value: nosuch.toUpperCase() }] } } });
    const rec = replay();
    const f = (async (u: RequestInfo | URL) => (String(u) === ESUMMARY("7") ? new Response(body) : rec.f(u))) as typeof fetch;
    const out = await pasteLookup(f, { k: "pmid", v: "7" });
    expect(rec.requested).toEqual([CR(nosuch)]);
    expect(out).toEqual({ result: "ok", entry: { title: "A paper Crossref lacks.", author: "Doe, J", year: "2001", source: "Some Journal", volume: "3", issue: "2", pages: "10-19", doi: nosuch, url: "", type: "Journal article" } });
  });
  it("a PubMed number PubMed does not know is not found", async () => {
    const r = replay();
    expect(await pasteLookup(r.f, { k: "pmid", v: "99999999" })).toEqual({ result: "nf" });
    expect(r.unknown).toEqual([]);
    expect(r.requested).toEqual([ESUMMARY("99999999"), ESUMMARY("99999999")]);
  });
});

describe("pasteLookup: a PMC number", () => {
  it("OpenAlex holds no PMC numbers, so PubMed Central names the paper's DOI and Crossref gives the entry", async () => {
    const r = replay();
    const out = await pasteLookup(r.f, { k: "pmcid", v: "PMC6746734" });
    expect(r.unknown).toEqual([]);
    expect(r.requested).toEqual([OA("pmcid:PMC6746734"), PMC_ESUMMARY("6746734"), CR(WALK_DOI)]);
    const viaDoi = await pasteLookup(replay().f, { k: "doi", v: WALK_DOI });
    expect(out).toEqual(viaDoi);
  });
  it("OpenAlex's answer is used when it does hold the paper under its PMC number (the recorded work served for the pmcid request)", async () => {
    const work = JSON.parse(RECORDINGS.get(OA("doi:" + WALK_DOI))!.body) as object;
    const urls: string[] = [];
    const f = (async (u: RequestInfo | URL) => { urls.push(String(u)); return new Response(JSON.stringify(work), { status: 200 }); }) as typeof fetch;
    const out = await pasteLookup(f, { k: "pmcid", v: "PMC6746734" });
    expect(urls).toEqual([OA("pmcid:PMC6746734")]);
    expect(out.result).toBe("ok");
  });
  it("a PMC number PubMed Central does not know is not found", async () => {
    const urls: string[] = [];
    const f = (async (u: RequestInfo | URL) => {
      urls.push(String(u));
      return String(u).includes("api.openalex.org") ? new Response("<!doctype html><title>404 Not Found</title>", { status: 404 })
        : new Response('{"result":{"uids":["99999999"],"99999999":{"uid":"99999999","error":"cannot get document summary"}}}', { status: 200 });
    }) as typeof fetch;
    expect(await pasteLookup(f, { k: "pmcid", v: "PMC99999999" })).toEqual({ result: "nf" });
    expect(urls).toEqual([OA("pmcid:PMC99999999"), PMC_ESUMMARY("99999999")]);
  });
  // PubMed Central's esummary for a number, written here (the one recording, paste-pmc-esummary, is the walk paper's); OpenAlex's 404 for `pmcid:` is the recorded answer.
  const pmcItem = (num: string, ids: Array<[string, string]>) => `{"result":{"uids":["${num}"],"${num}":{"uid":"${num}","articleids":[${ids.map(([t, v]) => `{"idtype":"${t}","value":"${v}"}`).join(",")}]}}}`;
  const viaPmc = (body: string) => {
    const rec = replay();
    const f = (async (u: RequestInfo | URL) => (String(u).includes("api.openalex.org/works/pmcid:") ? new Response("", { status: 404 }) : String(u).includes("db=pmc") ? new Response(body) : rec.f(u))) as typeof fetch;
    return { f, rec };
  };
  it("a PMC paper that lists a PMID and no DOI is kept from PubMed by that PMID", async () => {
    const t = viaPmc(pmcItem("1234567", [["pmid", "14907713"], ["pmcid", "PMC1234567"]]));
    const out = await pasteLookup(t.f, { k: "pmcid", v: "PMC1234567" });
    expect(t.rec.unknown).toEqual([]);
    expect(t.rec.requested).toEqual([ESUMMARY("14907713")]);
    expect(out.result).toBe("ok");
    if (out.result === "ok") expect(out.entry).toMatchObject({ url: "https://pubmed.ncbi.nlm.nih.gov/14907713/", year: "1951", doi: "", type: "Journal article" });
  });
  it("a PMC paper whose DOI neither Crossref nor OpenAlex holds falls back to its PMID, and a DOI with no PMID is not found", async () => {
    const nosuch = "10.9999/appuscholar-no-such-doi-2026"; // Crossref 404 and OpenAlex 404 are recorded
    const both = viaPmc(pmcItem("1234567", [["pmid", "14907713"], ["doi", nosuch]]));
    const out = await pasteLookup(both.f, { k: "pmcid", v: "PMC1234567" });
    expect(both.rec.requested).toEqual([CR(nosuch), OA("doi:" + nosuch), ESUMMARY("14907713")]);
    expect(out.result).toBe("ok");
    const doiOnly = viaPmc(pmcItem("1234567", [["doi", nosuch]]));
    expect(await pasteLookup(doiOnly.f, { k: "pmcid", v: "PMC1234567" })).toEqual({ result: "nf" });
    expect(doiOnly.rec.requested).toEqual([CR(nosuch), OA("doi:" + nosuch)]);
    const neither = viaPmc(pmcItem("1234567", [["pmcid", "PMC1234567"]]));
    expect(await pasteLookup(neither.f, { k: "pmcid", v: "PMC1234567" })).toEqual({ result: "nf" });
    expect(neither.rec.requested).toEqual([]);
  });
});

describe("pasteLookup: an arXiv id and an OpenAlex id", () => {
  it("an arXiv id is found through OpenAlex", async () => {
    const r = replay();
    const out = await pasteLookup(r.f, { k: "arxiv", v: "2101.00001" });
    expect(r.unknown).toEqual([]);
    expect(r.requested).toEqual([OA("doi:10.48550/arxiv.2101.00001")]);
    expect(out.result).toBe("ok");
    if (out.result !== "ok") return;
    expect(out.entry.title).toBe("Etat de l'art sur l'application des bandits multi-bras");
    expect(out.entry.doi).toBe("10.48550/arxiv.2101.00001");
    expect(out.oa).toBe("https://arxiv.org/pdf/2101.00001");
  });
  it("an arXiv id OpenAlex does not hold is not found", async () => {
    const f = (async () => new Response("", { status: 404 })) as typeof fetch;
    expect(await pasteLookup(f, { k: "arxiv", v: "2101.00001" })).toEqual({ result: "nf" });
  });
  it("an OpenAlex id keeps every author, the volume, the issue and the pages, and brings its abstract and free copy", async () => {
    const r = replay();
    const out = await pasteLookup(r.f, { k: "openalex", v: "W2972990769" });
    expect(r.unknown).toEqual([]);
    expect(r.requested).toEqual([OA("W2972990769")]);
    expect(out.result).toBe("ok");
    if (out.result !== "ok") return;
    expect(out.entry).toEqual({
      title: SCHAEFER_TITLE, author: SCHAEFER_AUTHORS, year: "2019", source: "Scientific Reports",
      volume: "9", issue: "1", pages: "13317", doi: WALK_DOI, url: "", type: "Journal article"
    });
    expect(out.abstract).toMatch(/^Test anxiety is /);
    expect(out.oa).toBe("https://www.nature.com/articles/s41598-019-49466-6.pdf");
  });
  it("a closed paper has no `oa` and a paper with no abstract has none", async () => {
    const closed = JSON.stringify({ id: "https://openalex.org/W1", display_name: "A closed paper", authorships: [], publication_year: 2001, open_access: { is_oa: false, oa_status: "closed", oa_url: null }, abstract_inverted_index: null });
    const out = await pasteLookup((async () => new Response(closed)) as typeof fetch, { k: "openalex", v: "W1000" });
    expect(out.result).toBe("ok");
    if (out.result === "ok") { expect(out.oa).toBeUndefined(); expect(out.abstract).toBeUndefined(); }
  });
  it("the OpenAlex key reaches the request", async () => {
    const urls: string[] = [];
    await pasteLookup((async (u: RequestInfo | URL) => { urls.push(String(u)); return new Response("", { status: 404 }); }) as typeof fetch, { k: "openalex", v: "W2972990769" }, "k1");
    expect(urls).toEqual([OA("W2972990769") + "&api_key=k1"]);
  });
});

describe("pasteLookup: when a source cannot be reached", () => {
  const down = (status: number) => (async () => new Response("", { status })) as typeof fetch;
  const thrown = (async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch;
  it("a thrown fetch and an HTTP error are \"fail\", for every kind of id", async () => {
    const refs: PastedRef[] = [{ k: "doi", v: WALK_DOI }, { k: "pmid", v: "9500320" }, { k: "pmcid", v: "PMC6746734" }, { k: "arxiv", v: "2101.00001" }, { k: "openalex", v: "W2972990769" }];
    for (const ref of refs) {
      expect(await pasteLookup(thrown, ref), ref.k).toEqual({ result: "fail" });
      expect(await pasteLookup(down(500), ref), ref.k).toEqual({ result: "fail" });
      expect(await pasteLookup(down(429), ref), ref.k).toEqual({ result: "fail" });
    }
  });
  it("Crossref unreachable is a fail even for a DOI OpenAlex could answer", async () => {
    const r = replay([CR(WALK_DOI)]);
    expect(await pasteLookup(r.f, { k: "doi", v: WALK_DOI })).toEqual({ result: "fail" });
    expect(r.requested).toEqual([CR(WALK_DOI)]);
  });
});

describe("pasteLookup: only OpenAlex, PubMed E-utilities and Crossref are asked", () => {
  it("every request of every kind of paste goes to one of the three hosts", async () => {
    const r = replay();
    const refs: PastedRef[] = [
      { k: "doi", v: WALK_DOI }, { k: "doi", v: "10.48550/arxiv.2101.00001" }, { k: "doi", v: "10.9999/appuscholar-no-such-doi-2026" },
      { k: "pmid", v: "9500320" }, { k: "pmid", v: "14907713" }, { k: "pmid", v: "99999999" }, { k: "pmcid", v: "PMC6746734" },
      { k: "arxiv", v: "2101.00001" }, { k: "openalex", v: "W2972990769" }
    ];
    for (const ref of refs) await pasteLookup(r.f, ref);
    expect(r.unknown).toEqual([]);
    expect(r.requested.length).toBeGreaterThan(refs.length);
    const hosts = new Set(r.requested.map((u) => new URL(u).origin));
    expect([...hosts].sort()).toEqual(["https://api.crossref.org", "https://api.openalex.org", "https://eutils.ncbi.nlm.nih.gov"]);
  });
});
