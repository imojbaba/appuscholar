import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { xmlAll, xmlParse, xmlText } from "../../src/fetch/xml";
import { pmFullPages, pmSearch, pmSearchV2, pmidToDoi, rsFetchPubmed, rsPubmedAbstracts } from "../../src/fetch/pubmed";
import { pmTopicBlock, rsBuildQuery, rsBuildQueryV2, rsDedupe } from "../../src/research";
import type { RsPaper } from "../../src/research";
import { expectGolden } from "../golden/harness/compare";
import { RECORDINGS, fx, mode, replay, v1View } from "./replay";

/**
 * pubmed.ts (v1 rsPubmedAbstracts 8088, rsFetchPubmed 8103, researchSearch's withFallback and catch 8297-8310, citPmidToDoi 7920) on the recorded
 * E-utilities bodies (esearch, esummary, efetch XML), against v1's parse of the same bodies, and the URLs against the URLs v1 requested.
 */

const pmRuns = fx.searches.filter((s) => s.in.pm && !s.in.oa);

describe("pmSearch is v1's rsFetchPubmed inside researchSearch", () => {
  it("covers every kind of study, related terms, no hits, results with no abstract, and efetch unreachable", () => {
    expect(pmRuns.map((s) => s.name)).toEqual(["pm-rct", "pm-terms", "pm-sr", "pm-review", "pm-qual", "pm-survey", "pm-plain", "pm-zero", "pm-noabstract", "pm-plain2", "pm-efetch-unreachable"]);
    const papers = (run: string) => (pmRuns.find((s) => s.name === run)!.pm[0] ?? []) as RsPaper[];
    expect(papers("pm-zero")).toEqual([]);
    expect(papers("pm-noabstract").every((p) => p.abstract === "")).toBe(true);
    expect(papers("pm-efetch-unreachable").every((p) => p.abstract === "")).toBe(true);
    expect(papers("pm-plain2").some((p) => p.abstract)).toBe(true);
    expect(pmRuns.flatMap((s) => (s.pm[0] ?? []) as RsPaper[]).some((p) => /^[A-Z][A-Za-z ]+: /.test(p.abstract ?? ""))).toBe(true); // a labelled AbstractText
  });

  for (const s of pmRuns)
    it(`${s.name}: the papers (with abstracts from the XML), the URLs and the outcome are v1's`, async () => {
      const r = replay(s.in.throwFor);
      const out = await pmSearch(r.f, { q: s.in.topic, terms: s.in.terms, design: s.in.design, retmax: s.in.rank ? 15 : 6 });
      expect(r.unknown).toEqual([]);
      expect(r.requested).toEqual(s.requested);
      expectGolden(v1View(out.papers), (s.pm[s.pm.length - 1] ?? []) as typeof out.papers, mode, "papers");
      expectGolden(v1View(rsDedupe(out.papers)), s.merged as typeof out.papers, mode, "rsResultsOriginal");
      expect(out.error).toBeUndefined();
    });

  it("an esearch or esummary HTTP error is \"HTTP <status>\"; a throw its message; the promise resolves", async () => {
    expect(await pmSearch((async () => new Response("", { status: 500 })) as typeof fetch, { q: "x" })).toEqual({ papers: [], error: "HTTP 500" });
    let n = 0;
    const esummaryDown = (async () => (++n === 1 ? new Response('{"esearchresult":{"idlist":["1"]}}') : new Response("", { status: 502 }))) as typeof fetch;
    expect(await pmSearch(esummaryDown, { q: "x" })).toEqual({ papers: [], error: "HTTP 502" });
    expect(await pmSearch((async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch, { q: "x" })).toEqual({ papers: [], error: "Failed to fetch" });
  });
  it("with terms, a failure falls back to the topic alone ([tiab] terms dropped)", async () => {
    const urls: string[] = [];
    const f = (async (u: RequestInfo | URL) => { urls.push(String(u)); if (urls.length === 1) throw new Error("bad query"); return new Response('{"esearchresult":{"idlist":[]}}'); }) as typeof fetch;
    expect(await pmSearch(f, { q: "x", terms: ["y"] })).toEqual({ papers: [], fellBack: true });
    expect(urls.map((u) => decodeURIComponent(u.split("term=")[1]!))).toEqual(['(x) OR "y"[tiab]', "x"]);
  });
  it("an efetch failure (HTTP, a throw, or XML that does not parse) only means no abstracts", async () => {
    for (const efetch of [() => new Response("", { status: 500 }), () => { throw new Error("down"); }, () => new Response("<PubmedArticleSet><PubmedArticle>")])
      expect(await rsPubmedAbstracts((async () => efetch()) as typeof fetch, ["1"])).toEqual({});
  });
});

type EsItem = { authors?: Array<{ name?: string }>; volume?: string; issue?: string; pages?: string };
describe("rsFetchPubmed keeps what v1 dropped (W2)", () => {
  it("rsFetchPubmed keeps every author, the volume, the issue and the full page range (W2)", async () => {
    const s = pmRuns.find((x) => x.name === "pm-rct")!;
    const r = replay(s.in.throwFor);
    // researchSearch's PubMed query for the case (rsBuildQuery), as pmSearch builds it, through rsFetchPubmed.
    const papers = await rsFetchPubmed(r.f, rsBuildQuery(s.in.topic, "pm", s.in.terms, s.in.design), s.in.rank ? 15 : 6);
    expect(r.unknown).toEqual([]);
    const esummary = JSON.parse([...RECORDINGS.values()].find((x) => x.url === r.requested[1])!.body) as { result: Record<string, EsItem> };
    expect(r.requested[1]).toContain("/esummary.fcgi?");
    expect(papers.length).toBe(6);
    for (const p of papers) {
      const it = esummary.result[p.pmid]!;
      expect(p.authorList, p.pmid).toEqual((it.authors ?? []).map((a) => a.name));
      expect(p.volume, p.pmid).toBe(it.volume ?? "");
      expect(p.issue, p.pmid).toBe(it.issue ?? "");
      expect(p.pages, p.pmid).toBe(pmFullPages(it.pages ?? ""));
      if ((it.authors ?? []).length > 4) expect(p.authors).toMatch(/, et al\.$/);
    }
    // Paper 42847411 has 15 authors: v1 kept four.
    expect(papers.find((p) => p.pmid === "42847411")!.authorList).toHaveLength(15);
    expect(papers.find((p) => p.pmid === "42870746")).toMatchObject({ volume: "42", issue: "5", pages: "e70228" });
  });
  it("a short range in a recorded esummary is written out in full (pm-noabstract: 949-50, 1327-8)", async () => {
    const s = pmRuns.find((x) => x.name === "pm-noabstract")!;
    const out = await pmSearch(replay(s.in.throwFor).f, { q: s.in.topic, terms: s.in.terms, design: s.in.design, retmax: s.in.rank ? 15 : 6 });
    expect(out.papers.map((p) => p.pages)).toEqual(["c7452", "1327-1328; discussion 1328", "949-950"]);
  });
  it("pmFullPages expands PubMed's short ranges", () => {
    expect(pmFullPages("123-30")).toBe("123-130");
    expect(pmFullPages("1171-9")).toBe("1171-1179");
    expect(pmFullPages("e0123")).toBe("e0123");
    expect(pmFullPages("13317")).toBe("13317");
    expect(pmFullPages("563-573")).toBe("563-573");
    expect(pmFullPages("1-10")).toBe("1-10");
    expect(pmFullPages("")).toBe("");
    // A range the short reading would turn backwards is left as it is.
    expect(pmFullPages("199-5")).toBe("199-5");
  });
});

describe("pmidToDoi is v1's citPmidToDoi", () => {
  for (const c of fx.pmids)
    it(`PMID ${c.pmid}`, async () => {
      const r = replay();
      expect(await pmidToDoi(r.f, c.pmid)).toBe(c.out === "" ? null : c.out);
      expect(r.requested).toEqual(c.requested);
    });
  it("an HTTP error rejects with \"HTTP <status>\" (citLookup then says it found no DOI)", async () => {
    await expect(pmidToDoi((async () => new Response("", { status: 500 })) as typeof fetch, "1")).rejects.toThrow("HTTP 500");
  });
});

describe("the XML reader reads every recorded efetch body as jsdom's DOMParser does (v1's 8093-8098 selectors)", () => {
  const efetches = [...RECORDINGS.values()].filter((r) => r.url.includes("/efetch.fcgi?"));
  it("there are efetch bodies, with labelled and unlabelled AbstractText and an OtherAbstract", () => {
    expect(efetches.length).toBeGreaterThanOrEqual(9);
    expect(efetches.some((r) => r.body.includes("<AbstractText Label="))).toBe(true);
    expect(efetches.some((r) => r.body.includes("<AbstractText>"))).toBe(true);
    expect(efetches.some((r) => r.body.includes("<OtherAbstract"))).toBe(true); // its AbstractText is not under Abstract
  });
  for (const rec of efetches)
    it(rec.file, () => {
      const dom = new new JSDOM("").window.DOMParser().parseFromString(rec.body, "text/xml");
      const want = Array.from(dom.querySelectorAll("PubmedArticle")).map((a) => ({
        pmid: a.querySelector("MedlineCitation > PMID")?.textContent ?? null,
        parts: Array.from(a.querySelectorAll("Abstract > AbstractText")).map((t) => [t.getAttribute("Label"), t.textContent]),
      }));
      const doc = xmlParse(rec.body);
      const got = xmlAll(doc, (e) => e.name === "PubmedArticle").map((a) => ({
        pmid: (() => { const p = xmlAll(a, (e) => e.name === "PMID" && e.parent?.name === "MedlineCitation")[0]; return p ? xmlText(p) : null; })(),
        parts: xmlAll(a, (e) => e.name === "AbstractText" && e.parent?.name === "Abstract").map((t) => [t.attrs["Label"] ?? null, xmlText(t)]),
      }));
      expect(got).toEqual(want);
      expect(want.length).toBeGreaterThan(0);
    });
});

describe("pmSearchV2 differs from v1's pmSearch only in the tagged topic (W12)", () => {
  for (const s of pmRuns)
    it(`${s.name}: the tagged query first, then (when it finds nothing) v1's query once`, async () => {
      const terms: string[] = [];
      const f = (async (u: RequestInfo | URL) => { terms.push(decodeURIComponent(String(u).split("term=")[1]!)); return new Response('{"esearchresult":{"idlist":[]}}'); }) as typeof fetch;
      const o = { q: s.in.topic, terms: s.in.terms, design: s.in.design, retmax: s.in.rank ? 15 : 6 };
      const out = await pmSearchV2(f, o);
      expect(out).toEqual({ papers: [] });
      const v1 = rsBuildQuery(s.in.topic, "pm", s.in.terms, s.in.design);
      if (pmTopicBlock(s.in.topic) === null) expect(terms).toEqual([v1]); // a typed or long topic: v1's request, asked once
      else {
        expect(terms).toEqual([rsBuildQueryV2(s.in.topic, "pm", s.in.terms, s.in.design), v1]);
        expect(terms[0]).toContain("[tiab]");
      }
    });
});
