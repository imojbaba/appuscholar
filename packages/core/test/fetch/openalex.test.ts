import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { apRefCheck, oaConnected, oaRetractions, oaSearch, oaUrl, retrFetchBatch, rsOaBrief } from "../../src/fetch/openalex";
import { pmSearch } from "../../src/fetch/pubmed";
import { rsDedupe } from "../../src/research";
import type { RsPaper } from "../../src/research";
import { expectGolden } from "../golden/harness/compare";
import { RECORDINGS, fx, mode, replay, sha256, v1View } from "./replay";

/**
 * openalex.ts (v1 oaUrl 8030, oaHttpError 8032, rsFetchOpenAlex 8061, researchSearch's withFallback and catch 8297-8310, rsOaBrief 8492, rsConnected 8498,
 * retrFetchBatch 7571, citRetractionRefresh's batches 7579-7597, apRefCheck's batches 11241-11251) on the recorded OpenAlex bodies, against v1's parse of
 * the same bodies (test/golden/fetch/cases.json), and the URLs against the URLs v1 requested.
 */

const OA_SENTENCE = "the free daily OpenAlex budget is used up. Add a free OpenAlex key in Settings, or try again tomorrow"; // v1 oaHttpError 8032

describe("the recordings are the bodies the fixture was captured from", () => {
  it("one file per URL, each body's sha256 as captured", () => {
    // The v2 recordings have their own manifest: the golden fixture is v1's and is never edited.
    const v2 = (JSON.parse(readFileSync(new URL("./recorded/v2-manifest.json", import.meta.url), "utf8")) as { recorded: typeof fx.recorded }).recorded;
    expect([...RECORDINGS.values()].map((r) => r.file).sort()).toEqual([...fx.recorded, ...v2].map((r) => r.file).sort());
    for (const r of v2) {
      const rec = RECORDINGS.get(r.url)!;
      expect(rec.file).toBe(r.file);
      expect(rec.status).toBe(r.status);
      expect(sha256(rec.body)).toBe(r.sha256);
    }
    for (const r of fx.recorded) {
      const rec = RECORDINGS.get(r.url)!;
      expect(rec.file).toBe(r.file);
      expect(rec.status).toBe(r.status);
      expect(sha256(rec.body)).toBe(r.sha256);
    }
  });
  it("the one hand-written body is the 429, marked synthetic", () => {
    const synthetic = [...RECORDINGS.values()].filter((r) => r.synthetic);
    expect(synthetic.map((r) => r.status)).toEqual([429]);
    expect(Object.keys(JSON.parse(synthetic[0]!.body) as object)).toEqual(["error", "message"]);
  });
  it("no recording carries a key or a mailto", () => {
    for (const r of RECORDINGS.values()) expect(r.url).not.toMatch(/api_key=|mailto/i);
    expect(readFileSync(new URL("./recorded/capture.mjs", import.meta.url), "utf8")).not.toMatch(/api_key=[^'"]|mailto:/i);
  });
});

describe("oaUrl", () => {
  it("adds api_key only when a key is given, with ? or &", () => {
    expect(oaUrl("https://api.openalex.org/works?search=x")).toBe("https://api.openalex.org/works?search=x");
    expect(oaUrl("https://api.openalex.org/works?search=x", "")).toBe("https://api.openalex.org/works?search=x");
    expect(oaUrl("https://api.openalex.org/works?search=x", "a b&c")).toBe("https://api.openalex.org/works?search=x&api_key=a%20b%26c");
    expect(oaUrl("https://api.openalex.org/works", "k")).toBe("https://api.openalex.org/works?api_key=k");
  });
  it("a key reaches the search URL", async () => {
    const seen: string[] = [];
    await oaSearch((async (u: RequestInfo | URL) => { seen.push(String(u)); return new Response('{"results":[]}', { status: 200 }); }) as typeof fetch, { q: "x", key: "k1" });
    expect(seen[0]).toMatch(/&api_key=k1$/);
  });
});

const oaRuns = fx.searches.filter((s) => s.in.oa && !s.in.pm);
const bothRuns = fx.searches.filter((s) => s.in.oa && s.in.pm);
const oaIn = (s: (typeof fx.searches)[number]) => ({ q: s.in.topic, terms: s.in.terms, design: s.in.design, perPage: s.in.rank ? 25 : 8 });
const pmIn = (s: (typeof fx.searches)[number]) => ({ q: s.in.topic, terms: s.in.terms, design: s.in.design, retmax: s.in.rank ? 15 : 6 });

describe("oaSearch is v1's rsFetchOpenAlex inside researchSearch", () => {
  it("covers every kind of study, related terms, per-page 25, no results, a retracted paper, a paper with no abstract, a 429 and the fallback", () => {
    expect(oaRuns.map((s) => s.name)).toEqual(["oa-plain", "oa-terms", "oa-rct", "oa-sr", "oa-review", "oa-qual", "oa-survey", "oa-rank", "oa-zero", "oa-retracted", "oa-429", "oa-terms-fallback"]);
    const all = oaRuns.flatMap((s) => s.oa.filter(Boolean).flat()) as Array<RsPaper & { oaId: string }>;
    expect(all.some((p) => p.retracted)).toBe(true);
    expect(all.some((p) => !p.abstract)).toBe(true);
    expect(all.some((p) => !p.doi)).toBe(true);
    expect(all.some((p) => p.oaStatus)).toBe(true);
    expect(oaRuns.find((s) => s.name === "oa-review")!.requested[0]).toContain("&filter=type:review&");
    expect(oaRuns.find((s) => s.name === "oa-rank")!.requested[0]).toContain("&per-page=25&");
  });

  for (const s of oaRuns)
    it(`${s.name}: the papers, the URLs and the outcome are v1's`, async () => {
      const r = replay(s.in.throwFor);
      const out = await oaSearch(r.f, oaIn(s));
      expect(r.unknown).toEqual([]);
      expect(r.requested).toEqual(s.requested);
      const last = s.oa[s.oa.length - 1]!;
      expectGolden(v1View(out.papers), (last ?? []) as typeof out.papers, mode, "papers");
      expectGolden(v1View(rsDedupe(out.papers)), s.merged as RsPaper[], mode, "rsResultsOriginal");
      if (last === null) expect(out.error).toBeDefined();
      else expect(out.error).toBeUndefined();
      if (out.error === "429") expect(s.status).toContain(`could not reach: OpenAlex (${OA_SENTENCE})`);
      else if (out.error) expect(s.status).toContain(`OpenAlex (${out.error})`);
      expect(out.fellBack === true).toBe(s.status.includes("the related terms made the search fail"));
    });

  it("oaSearch's v1 view equals the golden, and authorList holds every author (W2)", async () => {
    let longest = 0;
    for (const s of oaRuns) {
      const r = replay(s.in.throwFor);
      const out = await oaSearch(r.f, oaIn(s));
      const last = s.oa[s.oa.length - 1];
      expectGolden(v1View(out.papers), (last ?? []) as typeof out.papers, mode, "papers");
      // The body of the request that gave these papers: every display name, in OpenAlex's order.
      const body = out.papers.length ? JSON.parse(RECORDINGS.get(r.requested[r.requested.length - 1]!)!.body) as { results: Array<{ authorships?: Array<{ author?: { display_name?: string } | null }> }> } : { results: [] };
      out.papers.forEach((p, i) => {
        const names = (body.results[i]!.authorships ?? []).map((a) => a.author?.display_name).filter(Boolean);
        expect(p.authorList, `${s.name} #${i}`).toEqual(names);
        longest = Math.max(longest, names.length);
        // The card's line stays v1's: four names, then et al.
        if (names.length > 4) expect(p.authors).toBe(names.slice(0, 4).join(", ") + ", et al.");
        expect(p).not.toHaveProperty("volume");
      });
    }
    expect(longest).toBeGreaterThan(4);
  });
  it("HTTP 429 yields error \"429\" and no papers", async () => {
    const s = oaRuns.find((x) => x.name === "oa-429")!;
    const out = await oaSearch(replay().f, oaIn(s));
    expect(out).toEqual({ papers: [], error: "429" });
  });
  it("a 429 on the related-terms query does not fall back (v1 tests the budget sentence)", async () => {
    let calls = 0;
    const out = await oaSearch((async () => { calls++; return new Response("{}", { status: 429 }); }) as typeof fetch, { q: "x", terms: ["y"] });
    expect(out).toEqual({ papers: [], error: "429" });
    expect(calls).toBe(1);
  });
  it("another HTTP error is \"HTTP <status>\"", async () => {
    const out = await oaSearch((async () => new Response("", { status: 503 })) as typeof fetch, { q: "x" });
    expect(out).toEqual({ papers: [], error: "HTTP 503" });
  });
  it("a fetch that throws yields its message and no papers, and the promise resolves", async () => {
    const out = await oaSearch((async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch, { q: "x" });
    expect(out).toEqual({ papers: [], error: "Failed to fetch" });
    const odd = await oaSearch((async () => { throw "no message"; }) as typeof fetch, { q: "x" });
    expect(odd).toEqual({ papers: [], error: "unknown error" });
  });
  it("with terms, a throw falls back to the topic alone; when that throws too, its error is kept with fellBack", async () => {
    const urls: string[] = [];
    const out = await oaSearch((async (u: RequestInfo | URL) => { urls.push(String(u)); throw new Error("down " + urls.length); }) as typeof fetch, { q: "x", terms: ["y"] });
    expect(out).toEqual({ papers: [], error: "down 2", fellBack: true });
    expect(urls.map((u) => decodeURIComponent(u.split("search=")[1]!.split("&")[0]!))).toEqual(['(x) OR "y"', "x"]);
  });
});

describe("both sources: one failing leaves the other's papers (Review Focus 2)", () => {
  for (const s of bothRuns)
    it(`${s.name}: the merged list and each source's outcome are v1's`, async () => {
      const r = replay(s.in.throwFor);
      const [oa, pm] = await Promise.all([oaSearch(r.f, oaIn(s)), pmSearch(r.f, pmIn(s))]);
      expect(r.unknown).toEqual([]);
      expect([...r.requested].sort()).toEqual([...s.requested].sort());
      expectGolden(v1View(rsDedupe([...oa.papers, ...pm.papers])), s.merged as RsPaper[], mode, "rsResultsOriginal");
      for (const [name, out, calls] of [["OpenAlex", oa, s.oa], ["PubMed", pm, s.pm]] as const) {
        if (calls[calls.length - 1] === null) {
          expect(out.papers).toEqual([]);
          expect(s.status).toContain(`could not reach: ${name} (${out.error === "429" ? OA_SENTENCE : out.error})`);
        } else {
          expect(out.error).toBeUndefined();
          expect(s.status).not.toContain(`${name} (`);
        }
      }
    });
});

describe("oaConnected is v1's rsConnected", () => {
  for (const [k, c] of fx.connected.entries())
    it(`#${k} ${c.in.citedByApiUrl ? "with" : "without"} a cited-by URL: the two lists and the URLs are v1's`, async () => {
      const r = replay();
      const out = await oaConnected(r.f, { referencedWorks: c.in.referencedWorks, citedByApiUrl: c.in.citedByApiUrl });
      expect(r.unknown).toEqual([]);
      expect(r.requested).toEqual(c.requested);
      const cards = (list: Array<{ title: string; authors: string; year: string }>) => list.map((x) => ({ title: x.title, meta: x.authors + (x.year ? " · " + x.year : "") }));
      expect(cards(out.cites)).toEqual(c.cites.cards);
      expect(cards(out.citedBy)).toEqual(c.citedBy.cards);
      expect(c.cites.heading).toBe(`📖 This paper cites (${out.cites.length})`);
      expect(c.citedBy.heading).toBe(`📥 Papers that cite this one (${out.citedBy.length})`);
    });
  it("a failing request is an empty list, never a throw; no works and no URL send nothing", async () => {
    const urls: string[] = [];
    const down = (async (u: RequestInfo | URL) => { urls.push(String(u)); throw new Error("down"); }) as typeof fetch;
    expect(await oaConnected(down, { referencedWorks: ["https://openalex.org/W1"], citedByApiUrl: "https://api.openalex.org/works?filter=cites:W2" })).toEqual({ cites: [], citedBy: [] });
    const bad = (async () => new Response("", { status: 500 })) as typeof fetch;
    expect(await oaConnected(bad, { referencedWorks: ["https://openalex.org/W1"], citedByApiUrl: "x?y" })).toEqual({ cites: [], citedBy: [] });
    expect(await oaConnected(down, { referencedWorks: [], citedByApiUrl: "" })).toEqual({ cites: [], citedBy: [] });
    expect(urls).toHaveLength(2);
  });
  it("the key goes on the referenced-works URL only, as v1's oaUrl", async () => {
    const urls: string[] = [];
    const f = (async (u: RequestInfo | URL) => { urls.push(String(u)); return new Response('{"results":[]}'); }) as typeof fetch;
    await oaConnected(f, { referencedWorks: ["https://openalex.org/W1"], citedByApiUrl: "https://api.openalex.org/works?filter=cites:W2", key: "k" });
    expect(urls).toEqual(["https://api.openalex.org/works?filter=openalex_id:W1&per-page=8&select=display_name,authorships,publication_year&api_key=k", "https://api.openalex.org/works?filter=cites:W2&per-page=8&select=display_name,authorships,publication_year"]);
  });
});

describe("oaConnected asks for the papers that cite this one by filter=cites (W3)", () => {
  const CITES = "https://api.openalex.org/works?filter=cites:W2487945683&per-page=8&select=display_name,authorships,publication_year";
  it("with no cited-by URL and an OpenAlex id, the second request is the filter=cites URL and its answer is the list", async () => {
    const r = replay();
    const out = await oaConnected(r.f, { referencedWorks: [], citedByApiUrl: "", oaId: "W2487945683" });
    expect(r.requested).toEqual([CITES]);
    expect(r.unknown).toEqual([]);
    const rec = JSON.parse(RECORDINGS.get(CITES)!.body) as { results: Parameters<typeof rsOaBrief>[0][] };
    expect(out.citedBy).toEqual(rec.results.map(rsOaBrief));
    expect(out.citedBy.length).toBeGreaterThan(0);
  });
  it("the key goes on the cites URL when given", async () => {
    const urls: string[] = [];
    const f = (async (u: RequestInfo | URL) => { urls.push(String(u)); return new Response('{"results":[]}'); }) as typeof fetch;
    await oaConnected(f, { referencedWorks: [], citedByApiUrl: "", oaId: "W2487945683", key: "k" });
    expect(urls).toEqual([CITES + "&api_key=k"]);
  });
  it("a cited-by URL still wins (v1's request), and no id and no URL sends nothing", async () => {
    const urls: string[] = [];
    const f = (async (u: RequestInfo | URL) => { urls.push(String(u)); return new Response('{"results":[]}'); }) as typeof fetch;
    await oaConnected(f, { referencedWorks: [], citedByApiUrl: "https://api.openalex.org/works?filter=cites:W9", oaId: "W2487945683", key: "k" });
    await oaConnected(f, { referencedWorks: [], citedByApiUrl: "" });
    expect(urls).toEqual(["https://api.openalex.org/works?filter=cites:W9&per-page=8&select=display_name,authorships,publication_year"]);
  });
  it("a failing cites request is an empty list, never a throw", async () => {
    const down = (async () => { throw new Error("down"); }) as typeof fetch;
    expect(await oaConnected(down, { referencedWorks: [], citedByApiUrl: "", oaId: "W1" })).toEqual({ cites: [], citedBy: [] });
  });
});

describe("retractions", () => {
  it("retrFetchBatch is v1's", async () => {
    const r = replay();
    expect(await retrFetchBatch(r.f, fx.retractions.dois)).toEqual(fx.retractions.batch.out);
    expect(r.requested).toEqual(fx.retractions.batch.requested);
  });
  it("oaRetractions over the library's DOIs gives v1's citRetractionRefresh cache: every valid, normalised DOI, flagged or not", async () => {
    const r = replay();
    const out = await oaRetractions(r.f, fx.retractions.refresh.library.map((d) => d.doi));
    expect(r.requested).toEqual(fx.retractions.refresh.requested);
    expect(out).toEqual(Object.fromEntries(Object.entries(fx.retractions.refresh.cache).map(([k, v]) => [k, v.r])));
    expect(Object.keys(out)).toEqual(Object.keys(fx.retractions.refresh.cache));
  });
  it("batches of 40, each URL v1's retrFetchBatch URL, onBatch after each", async () => {
    const dois = Array.from({ length: 85 }, (_, i) => `10.1000/x${i}`);
    const urls: string[] = [];
    const f = (async (u: RequestInfo | URL) => { urls.push(String(u)); return new Response(JSON.stringify({ results: [{ doi: "https://doi.org/10.1000/X3", is_retracted: true }] })); }) as typeof fetch;
    const batches: Array<Record<string, boolean>> = [];
    const out = await oaRetractions(f, dois, "k", (b) => batches.push(b));
    expect(urls).toHaveLength(3);
    expect(urls.map((u) => u.split("filter=doi:")[1]!.split("&")[0]!.split("|").length)).toEqual([40, 40, 5]);
    expect(urls[0]).toBe("https://api.openalex.org/works?filter=doi:" + dois.slice(0, 40).map((d) => encodeURIComponent("https://doi.org/" + d)).join("|") + "&per-page=50&select=doi,is_retracted&api_key=k");
    expect(batches.map((b) => Object.keys(b).length)).toEqual([40, 40, 5]);
    expect(Object.values(out).filter(Boolean)).toHaveLength(1);
    expect(out["10.1000/x3"]).toBe(true);
    expect(await oaRetractions(f, ["", "nope", "10.12/x"])).toEqual({});
    expect(urls).toHaveLength(3);
  });
  it("a failing batch rejects with v1's message (citRetractionRefresh toasts retr_failed)", async () => {
    await expect(oaRetractions((async () => new Response("", { status: 500 })) as typeof fetch, ["10.1000/x"])).rejects.toThrow("HTTP 500");
  });
  it("apRefCheck's batches are v1's: flagged titles, the DOIs OpenAlex knew, done and finished", async () => {
    const r = replay();
    const out = await apRefCheck(r.f, fx.refcheck.dois);
    expect(r.requested).toEqual(fx.refcheck.requested);
    expectGolden(out, fx.refcheck.refs as typeof out, mode, "AP.refs");
  });
  it("apRefCheck stops with the error and what was done (429 is \"429\")", async () => {
    let n = 0;
    const f = (async () => (++n === 1 ? new Response('{"results":[]}') : new Response("", { status: 429 }))) as typeof fetch;
    const dois = Array.from({ length: 50 }, (_, i) => `10.1000/x${i}`);
    expect(await apRefCheck(f, dois)).toEqual({ dois, flag: {}, seen: {}, done: 40, error: "429" });
  });
});
