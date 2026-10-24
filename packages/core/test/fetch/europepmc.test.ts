import { describe, it, expect } from "vitest";
import { epmcFullText } from "../../src/fetch/europepmc";
import { RECORDINGS, replay } from "./replay";

/**
 * europepmc.ts (OJ's answer 2, ruling B2-R21): open-access full text from Europe PMC. The fetcher sends only the paper's DOI (a search that names the PMCID), then the
 * PMCID (fullTextXML), asks for the text only when the search result has a pmcid and says the paper is open access and in Europe PMC, and hands back the JATS XML as
 * a string (the web side reads it). Over the responses recorded live on 2026-10-24 (test/fetch/recorded, `capture.mjs --only epmc-...`). Ruling B2-R39 splits "no text" from
 * "a failed request": "none" is remembered by the caller, "failed" is tried again next session and carries the HTTP status when there was one. Error statuses are inline fakes.
 */

const REST = "https://www.ebi.ac.uk/europepmc/webservices/rest/";
const SEARCH = (doi: string) => REST + "search?query=DOI:" + doi + "&format=json&resultType=lite";
const FULL = (pmcid: string) => REST + pmcid + "/fullTextXML";
const WALK_DOI = "10.1038/s41598-019-49466-6";
const WAKEFIELD = "10.1016/s0140-6736(97)11096-0"; // a Europe PMC record with no PMC copy; its parentheses need a quoted query
const WAKEFIELD_SEARCH = REST + "search?query=DOI:%2210.1016/s0140-6736(97)11096-0%22&format=json&resultType=lite";
const NO_RECORD = "10.1037/0003-066x.55.1.68"; // Ryan and Deci 2000: Europe PMC has no record of it at all
const NOT_OA = "10.4022/jafib.1335"; // in Europe PMC with a PMCID (PMC5135192), but not open access

const json = (body: unknown, status = 200) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const answering = (...replies: Array<() => Response | Promise<Response>>) => {
  const urls: string[] = [];
  const inits: unknown[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    urls.push(String(input));
    inits.push(init);
    const next = replies[Math.min(urls.length - 1, replies.length - 1)]!;
    return next();
  }) as typeof fetch;
  return { f, urls, inits };
};
const HIT = { doi: WALK_DOI, pmcid: "PMC6746734", isOpenAccess: "Y", inEPMC: "Y", inPMC: "Y" };
const search = (...hits: object[]) => () => json({ hitCount: hits.length, resultList: { result: hits } });
const JATS = '<?xml version="1.0" encoding="UTF-8"?><article article-type="research-article"><front/><body><sec><title>Introduction</title><p>Text.</p></sec></body></article>';

describe("epmcFullText: an open-access paper", () => {
  it("sends the DOI to the search, then the PMCID it names to fullTextXML, and nothing else (the exact URLs)", async () => {
    const r = replay();
    const out = await epmcFullText(r.f, { doi: WALK_DOI });
    expect(r.unknown).toEqual([]);
    expect(r.requested).toEqual([
      "https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:10.1038/s41598-019-49466-6&format=json&resultType=lite",
      "https://www.ebi.ac.uk/europepmc/webservices/rest/PMC6746734/fullTextXML"
    ]);
    expect(out.result).toBe("ok");
    if (out.result !== "ok") return;
    expect(out.pmcid).toBe("PMC6746734");
    expect(out.xml).toBe(RECORDINGS.get(FULL("PMC6746734"))!.body);
    expect(out.xml.length).toBeGreaterThan(40000);
    expect(out.xml).toMatch(/<article[\s>]/);
    expect(out.xml).toContain("Open-label placebos reduce test anxiety");
  });
  it("the recorded search says what the rule reads: a pmcid, isOpenAccess Y and inEPMC Y", () => {
    const hit = (JSON.parse(RECORDINGS.get(SEARCH(WALK_DOI))!.body) as { resultList: { result: Array<Record<string, string>> } }).resultList.result[0]!;
    expect(hit).toMatchObject({ doi: WALK_DOI, pmcid: "PMC6746734", isOpenAccess: "Y", inEPMC: "Y" });
  });
  it("a PMCID alone goes straight to fullTextXML: one request, the PMCID only", async () => {
    const r = replay();
    const out = await epmcFullText(r.f, { pmcid: "PMC6746734" });
    expect(r.requested).toEqual([FULL("PMC6746734")]);
    expect(out).toMatchObject({ result: "ok", pmcid: "PMC6746734" });
  });
  it("a PMCID in any case is asked for in upper case; given with a DOI it is used and no search is sent", async () => {
    const r = replay();
    await epmcFullText(r.f, { doi: WALK_DOI, pmcid: "pmc6746734" });
    expect(r.requested).toEqual([FULL("PMC6746734")]);
  });
  it("a DOI with characters a query cannot hold is quoted and percent-encoded (the recorded search)", async () => {
    const r = replay();
    expect(await epmcFullText(r.f, { doi: WAKEFIELD })).toEqual({ result: "none" });
    expect(r.requested).toEqual([WAKEFIELD_SEARCH]);
    expect(r.unknown).toEqual([]);
  });
});

describe("epmcFullText: no full text is \"none\"", () => {
  it("a DOI Europe PMC has no record of: the search finds nothing, so no full text is asked for", async () => {
    const r = replay();
    expect(await epmcFullText(r.f, { doi: NO_RECORD })).toEqual({ result: "none" });
    expect(r.requested).toEqual([SEARCH(NO_RECORD)]);
    expect(r.unknown).toEqual([]);
  });
  it("a record with no pmcid (Wakefield 1998): no full text is asked for", async () => {
    const hit = (JSON.parse(RECORDINGS.get(WAKEFIELD_SEARCH)!.body) as { resultList: { result: Array<Record<string, string>> } }).resultList.result[0]!;
    expect(hit.pmcid).toBeUndefined();
    expect(hit.isOpenAccess).toBe("N");
  });
  it("a pmcid that is not open access is not asked for, though the paper is in Europe PMC", async () => {
    const r = replay();
    const hit = (JSON.parse(RECORDINGS.get(SEARCH(NOT_OA))!.body) as { resultList: { result: Array<Record<string, string>> } }).resultList.result[0]!;
    expect(hit).toMatchObject({ pmcid: "PMC5135192", isOpenAccess: "N", inEPMC: "Y" });
    expect(await epmcFullText(r.f, { doi: NOT_OA })).toEqual({ result: "none" });
    expect(r.requested).toEqual([SEARCH(NOT_OA)]);
  });
  it("open access but not in Europe PMC, a flag missing, or a pmcid that is not a PMC id: not asked for", async () => {
    for (const hit of [{ ...HIT, inEPMC: "N" }, { ...HIT, isOpenAccess: undefined }, { ...HIT, inEPMC: undefined }, { ...HIT, pmcid: undefined }, { ...HIT, pmcid: "../../x" }]) {
      const a = answering(search(hit));
      expect(await epmcFullText(a.f, { doi: WALK_DOI }), JSON.stringify(hit)).toEqual({ result: "none" });
      expect(a.urls).toEqual([SEARCH(WALK_DOI)]);
    }
  });
  it("a hit for another DOI is not this paper's: none", async () => {
    const a = answering(search({ ...HIT, doi: "10.1038/s41598-019-00000-0" }));
    expect(await epmcFullText(a.f, { doi: WALK_DOI })).toEqual({ result: "none" });
    expect(a.urls).toEqual([SEARCH(WALK_DOI)]);
  });
  it("the hit is found by its DOI in any case, and not only at the top of the list", async () => {
    const a = answering(search({ doi: "10.1038/other", pmcid: "PMC1", isOpenAccess: "Y", inEPMC: "Y" }, { ...HIT, doi: WALK_DOI.toUpperCase() }), () => new Response(JATS, { status: 200 }));
    expect(await epmcFullText(a.f, { doi: WALK_DOI })).toEqual({ result: "ok", pmcid: "PMC6746734", xml: JATS });
    expect(a.urls).toEqual([SEARCH(WALK_DOI), FULL("PMC6746734")]);
  });
  it("a 400 from the search is none: Europe PMC does not understand the DOI, and asking again would not help", async () => {
    const a = answering(() => json({}, 400));
    expect(await epmcFullText(a.f, { doi: WALK_DOI })).toEqual({ result: "none" });
    expect(a.urls).toEqual([SEARCH(WALK_DOI)]);
  });
  it("a 404 or a 410 from the full text is none: Europe PMC says it holds no such text", async () => {
    for (const status of [404, 410]) {
      const t = answering(search(HIT), () => new Response("not found", { status }));
      expect(await epmcFullText(t.f, { doi: WALK_DOI }), "text " + status).toEqual({ result: "none" });
      expect(t.urls).toEqual([SEARCH(WALK_DOI), FULL("PMC6746734")]);
      const p = answering(() => new Response("gone", { status }));
      expect(await epmcFullText(p.f, { pmcid: "PMC6746734" }), "pmcid " + status).toEqual({ result: "none" });
    }
  });
  it("a well-formed search with an empty result list is none (the recorded answer for a DOI Europe PMC has no record of)", async () => {
    const a = answering(() => json({ resultList: { result: [] } }));
    expect(await epmcFullText(a.f, { doi: WALK_DOI })).toEqual({ result: "none" });
    expect(JSON.parse(RECORDINGS.get(SEARCH(NO_RECORD))!.body).resultList.result).toEqual([]);
  });
});

describe("epmcFullText: a failed request is \"failed\", so the caller asks again next session (ruling B2-R39)", () => {
  it("the unknown PMCID's recorded 500 (JSON, not 404) is failed with its status: the web only asks a PMCID Europe PMC named, so a 500 is the server's bad minute", async () => {
    const r = replay();
    expect(RECORDINGS.get(FULL("PMC99999999"))!.status).toBe(500);
    expect(await epmcFullText(r.f, { pmcid: "PMC99999999" })).toEqual({ result: "failed", status: 500 });
    expect(r.requested).toEqual([FULL("PMC99999999")]);
    expect(r.unknown).toEqual([]);
  });
  it("a search that answers 408, 425, 429, any 5xx or any other status but 200 and 400 is failed, carrying the status", async () => {
    for (const status of [408, 425, 429, 500, 502, 503, 504, 599, 401, 403, 404, 410, 301]) {
      const s = answering(() => json({}, status));
      expect(await epmcFullText(s.f, { doi: WALK_DOI }), "search " + status).toEqual({ result: "failed", status });
      expect(s.urls).toEqual([SEARCH(WALK_DOI)]);
    }
  });
  it("a full text that answers 408, 425, 429, any 5xx or any other status but 200, 404 and 410 is failed, carrying the status (a DOI or a PMCID given)", async () => {
    for (const status of [408, 425, 429, 500, 502, 503, 504, 599, 401, 403, 400, 301]) {
      const t = answering(search(HIT), () => new Response("trouble", { status }));
      expect(await epmcFullText(t.f, { doi: WALK_DOI }), "text " + status).toEqual({ result: "failed", status });
      expect(t.urls).toEqual([SEARCH(WALK_DOI), FULL("PMC6746734")]);
      const p = answering(() => new Response("trouble", { status }));
      expect(await epmcFullText(p.f, { pmcid: "PMC6746734" }), "pmcid " + status).toEqual({ result: "failed", status });
    }
  });
  it("a 200 search that is JSON but has no result list array is failed, not none ({}, {resultList:{}}, a null or a text result); an empty array is none", async () => {
    for (const body of [{}, { resultList: {} }, { resultList: { result: null } }, { resultList: { result: "none" } }, { resultList: null }, []]) {
      const a = answering(() => json(body));
      expect(await epmcFullText(a.f, { doi: WALK_DOI }), JSON.stringify(body)).toEqual({ result: "failed" });
      expect(a.urls).toEqual([SEARCH(WALK_DOI)]);
    }
    expect(await epmcFullText(answering(() => json({ resultList: { result: [] } })).f, { doi: WALK_DOI })).toEqual({ result: "none" });
  });
  it("the search throws (offline, or CORS refuses): failed", async () => {
    const r = replay([SEARCH(WALK_DOI)]);
    expect(await epmcFullText(r.f, { doi: WALK_DOI })).toEqual({ result: "failed" });
    expect(r.requested).toEqual([SEARCH(WALK_DOI)]);
  });
  it("a thrown fetch carries no status", async () => {
    const out = await epmcFullText(replay([SEARCH(WALK_DOI)]).f, { doi: WALK_DOI });
    expect(out).toEqual({ result: "failed" });
    expect("status" in out).toBe(false);
  });
  it("the full text throws: failed", async () => {
    const r = replay([FULL("PMC6746734")]);
    expect(await epmcFullText(r.f, { doi: WALK_DOI })).toEqual({ result: "failed" });
    expect(r.requested).toEqual([SEARCH(WALK_DOI), FULL("PMC6746734")]);
    expect(await epmcFullText(replay([FULL("PMC6746734")]).f, { pmcid: "PMC6746734" })).toEqual({ result: "failed" });
  });
  it("a 200 that is not what Europe PMC sends (a sign-in page for the search, HTML for the text) is failed, so it is tried again", async () => {
    const html = () => new Response("<html><body>Sign in to the network</body></html>", { status: 200, headers: { "content-type": "text/html" } });
    expect(await epmcFullText(answering(html).f, { doi: WALK_DOI })).toEqual({ result: "failed" });
    expect(await epmcFullText(answering(search(HIT), html).f, { doi: WALK_DOI })).toEqual({ result: "failed" });
    expect(await epmcFullText(answering(html).f, { pmcid: "PMC6746734" })).toEqual({ result: "failed" });
  });
});

describe("epmcFullText: what counts as JATS", () => {
  const ART = '<article article-type="research-article"><front/><body><p>Text.</p></body></article>';
  const DOCTYPE = '<!DOCTYPE article PUBLIC "-//NLM//DTD JATS (Z39.96) Journal Archiving and Interchange DTD v1.2 20190208//EN" "JATS-archivearticle1.dtd">';
  it("takes an XML declaration, a DOCTYPE, comments and processing instructions before the article element, and white space too (a byte-order mark is dropped by Response.text before it gets here)", async () => {
    for (const xml of [
      '<?xml version="1.0" encoding="UTF-8"?>' + DOCTYPE + ART,
      '<?xml version="1.0"?>\n' + DOCTYPE + "\n" + ART,
      DOCTYPE + ART,
      "<!-- exported by a service -->" + ART,
      '<?xml version="1.0"?><!-- one --> <!-- two -->\n' + DOCTYPE + "<?processing instruction?>" + ART,
      '<?xml version="1.0"?><!DOCTYPE article [ <!ENTITY nbsp "&#160;"> ]>' + ART,
      "\n  " + ART
    ]) {
      expect(await epmcFullText(answering(search(HIT), () => new Response(xml, { status: 200 })).f, { doi: WALK_DOI }), xml.slice(0, 60)).toEqual({ result: "ok", pmcid: "PMC6746734", xml });
    }
  });
  it("is not fooled by a page that only has an article element somewhere in it: HTML, a sign-in page, an XML document with another root", async () => {
    for (const body of [
      "<html><body><article>Sign in to the network</article></body></html>",
      "<!DOCTYPE html><html><body><article>x</article></body></html>",
      "<!-- a comment --><root><article/></root>",
      "<!-- never closed <article>",
      "",
      "{}"
    ]) {
      expect(await epmcFullText(answering(search(HIT), () => new Response(body, { status: 200 })).f, { doi: WALK_DOI }), body.slice(0, 50)).toEqual({ result: "failed" });
    }
  });
});

describe("epmcFullText: it sends only a DOI or a PMCID", () => {
  it("something that is neither sends nothing and finds no text", async () => {
    for (const ref of [{}, { doi: "" }, { doi: "not a doi" }, { doi: "10.1000/has space" }, { doi: '10.1000/has"quote' }, { pmcid: "6746734" }, { pmcid: "PMC" }, { pmcid: "PMC12/../x" }, { doi: "Smith 2020, a title" }]) {
      const a = answering(() => json({}));
      expect(await epmcFullText(a.f, ref), JSON.stringify(ref)).toEqual({ result: "none" });
      expect(a.urls, JSON.stringify(ref)).toEqual([]);
    }
  });
  it("every URL it sends is on www.ebi.ac.uk under europepmc/webservices/rest, with no header, body or credentials, and the DOI or PMCID as the only variable part", async () => {
    const r = replay();
    const inits: unknown[] = [];
    const f = (async (input: RequestInfo | URL, init?: RequestInit) => { inits.push(init); return r.f(input); }) as typeof fetch;
    await epmcFullText(f, { doi: WALK_DOI });
    await epmcFullText(f, { doi: NO_RECORD });
    await epmcFullText(f, { pmcid: "PMC99999999" });
    expect(r.requested).toHaveLength(4);
    for (const u of r.requested) expect(u.startsWith(REST)).toBe(true);
    expect(r.requested.join(" ")).not.toMatch(/title|author|email|mailto|api_key/i);
    expect(inits).toEqual([undefined, undefined, undefined, undefined]);
  });
});
