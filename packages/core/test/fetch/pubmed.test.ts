import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { xmlAll, xmlParse, xmlText } from "../../src/fetch/xml";
import { pmSearch, pmidToDoi, rsPubmedAbstracts } from "../../src/fetch/pubmed";
import { rsDedupe } from "../../src/research";
import type { RsPaper } from "../../src/research";
import { expectGolden } from "../golden/harness/compare";
import { RECORDINGS, fx, mode, replay } from "./replay";

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
      expectGolden(out.papers, (s.pm[s.pm.length - 1] ?? []) as typeof out.papers, mode, "papers");
      expectGolden(rsDedupe(out.papers), s.merged as typeof out.papers, mode, "rsResultsOriginal");
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
