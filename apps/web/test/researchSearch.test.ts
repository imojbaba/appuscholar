import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as core from "@appuscholar/core";
import { tFormat } from "../lib/i18n";
import en from "../messages/en.json";
import hi from "../messages/hi.json";

// The two fetchers are core's, wrapped so the test sees what runSearch hands them.
vi.mock("@appuscholar/core", async (orig) => {
  const m = await orig<typeof import("@appuscholar/core")>();
  return { ...m, oaSearch: vi.fn(m.oaSearch), pmSearch: vi.fn(m.pmSearch) };
});

import { pickedTerms, rankPapers, suggestTerms } from "../lib/ai/actions";
import { runSearch, sortedResults, type SearchDeps, type SearchInput } from "../lib/research/useSearch";
import { rankNote, statusLine } from "../lib/research/status";
import { addResult, insertResult, type AddDeps } from "../lib/research/library";

/*
 * runSearch (v1 researchSearch 8283-8330) as pure orchestration: the refusals, the fetchers' inputs, the merge and the de-duplication over the
 * responses Task 4 recorded live (packages/core/test/fetch/recorded), and the status line, byte-equal to v1's #rsStatus for the same runs
 * (packages/core/test/golden/fetch/cases.json, captured by running v1 over the same recordings). Also the rank batches, the related terms and the
 * result-to-library rules (rsAddToLibrary 8471-8483, rsInsertCitation 8486-8491).
 */

const E = en as Record<string, string>;
const t = (key: string, vars?: Record<string, string | number>) => tFormat(E, hi as Record<string, string>, key, "en", vars);

const CORE_TEST = join(__dirname, "../../../packages/core/test");
type Rec = { url: string; status: number; headers: Record<string, string | null>; body: string };
const RECS = new Map<string, Rec>(readdirSync(join(CORE_TEST, "fetch/recorded")).filter((f) => f.endsWith(".json")).map((f) => {
  const r = JSON.parse(readFileSync(join(CORE_TEST, "fetch/recorded", f), "utf8")) as Rec;
  return [r.url, r];
}));
type Case = { name: string; in: { topic: string; oa: boolean; pm: boolean; design: string; rank: boolean; terms: string[]; throwFor: string[] }; requested: string[]; merged: Array<Record<string, unknown>>; status: string };
const FX = JSON.parse(readFileSync(join(CORE_TEST, "golden/fetch/cases.json"), "utf8")) as { searches: Case[] };

let requested: string[] = [];
function replay(throwFor: string[] = []): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    requested.push(url);
    if (throwFor.includes(url)) throw new TypeError("Failed to fetch");
    const r = RECS.get(url);
    if (!r) throw new Error("no recording for " + url);
    return new Response(r.body, { status: r.status, headers: r.headers["content-type"] ? { "content-type": r.headers["content-type"] } : {} });
  }) as typeof fetch;
}
const DESIGN_LABEL: Record<string, string> = { any: "rs2_any", rct: "rs2_randomised_trial", sr: "rs2_systematic_review_or_meta", review: "rs2_review_article_openalex_type", qual: "rs2_qualitative_study_words_in", survey: "rs2_survey_or_questionnaire_study" };
const input = (c: Case["in"]): SearchInput => ({ topic: c.topic, oa: c.oa, pm: c.pm, design: c.design, designLabel: t(DESIGN_LABEL[c.design]!), rank: c.rank, terms: c.terms });

function deps(over: Partial<SearchDeps> = {}) {
  const log = { toasts: [] as string[], statuses: [] as string[], begun: 0, persisted: [] as boolean[], ai: [] as Array<{ prompt: string; opts: unknown }> };
  const d: SearchDeps = {
    fetch: replay(), oaKey: null, field: "psychology", t,
    callAI: async (prompt, opts) => { log.ai.push({ prompt, opts }); return ""; },
    toast: (m) => { log.toasts.push(m); },
    setStatus: (s) => { log.statuses.push(s); },
    begin: () => { log.begun++; },
    persistRank: (r) => { log.persisted.push(r); },
    ...over
  };
  return { d, log };
}
const oa = vi.mocked(core.oaSearch), pm = vi.mocked(core.pmSearch);
beforeEach(() => { requested = []; oa.mockClear(); pm.mockClear(); });

describe("researchSearch's refusals (8284-8290)", () => {
  const base: SearchInput = { topic: "exam anxiety", oa: true, pm: true, design: "any", designLabel: "Any", rank: false, terms: [] };
  it("an empty topic toasts 'Type a topic or question first' and searches nothing", async () => {
    const { d, log } = deps();
    expect(await runSearch({ ...base, topic: "   " }, d)).toBeNull();
    expect(log.toasts).toEqual(["Type a topic or question first"]);
    expect(log.statuses).toEqual([]);
    expect(oa).not.toHaveBeenCalled();
  });
  it("over 600 characters writes v1's status sentence; 600 is allowed", async () => {
    const { d, log } = deps();
    expect(await runSearch({ ...base, topic: "a".repeat(601) }, d)).toBeNull();
    expect(log.statuses).toEqual(["That search is too long (over 600 characters). Write the topic as a sentence or two."]);
    const two = deps({ fetch: (async () => new Response("{}", { status: 500 })) as typeof fetch });
    expect(await runSearch({ ...base, topic: "a".repeat(600), pm: false }, two.d)).not.toBeNull();
  });
  it("symbols alone write v1's status sentence", async () => {
    const { d, log } = deps();
    expect(await runSearch({ ...base, topic: "?!* --- ##" }, d)).toBeNull();
    expect(log.statuses).toEqual(["Use some words or numbers in the search. Symbols alone find nothing."]);
  });
  it("no source ticked toasts 'Pick at least one source'", async () => {
    const { d, log } = deps();
    expect(await runSearch({ ...base, oa: false, pm: false }, d)).toBeNull();
    expect(log.toasts).toEqual(["Pick at least one source"]);
    expect(log.persisted).toEqual([]);
  });
});

describe("researchSearch over the recorded responses equals v1", () => {
  for (const c of FX.searches) {
    it(`${c.name}: the fetchers' inputs, the merged papers and #rsStatus byte-equal to v1`, async () => {
      const { d, log } = deps({ fetch: replay(c.in.throwFor) });
      const out = await runSearch(input(c.in), d);
      expect(out).not.toBeNull();
      expect(log.statuses[0]).toBe("🔎 Searching…");
      expect(log.begun).toBe(1);
      expect(log.persisted).toEqual([c.in.rank]);
      // the brief's arguments: the topic, the ticked terms, the kind of study; 25 / 15 papers when ranking, else 8 / 6
      if (c.in.oa) expect(oa).toHaveBeenCalledWith(expect.any(Function), { q: c.in.topic.trim(), terms: c.in.terms, design: c.in.design, perPage: c.in.rank ? 25 : 8, key: undefined });
      else expect(oa).not.toHaveBeenCalled();
      if (c.in.pm) expect(pm).toHaveBeenCalledWith(expect.any(Function), { q: c.in.topic.trim(), terms: c.in.terms, design: c.in.design, retmax: c.in.rank ? 15 : 6 });
      else expect(pm).not.toHaveBeenCalled();
      expect([...requested].sort()).toEqual([...c.requested].sort());
      expect(JSON.parse(JSON.stringify(out!.papers))).toEqual(c.merged);
      expect(out!.status).toBe(c.status);
      if (c.in.rank) expect(log.statuses[1]).toBe(`🔎 ${c.merged.length} papers found. Reading titles and abstracts to rank them…`);
    });
  }

  it("the fixture holds both-sources, OpenAlex-only, PubMed-only, 429 and unreachable runs", () => {
    const names = FX.searches.map((c) => c.name);
    for (const n of ["both-merge", "oa-plain", "pm-plain", "oa-429", "both-oa429", "both-pm-unreachable", "oa-terms-fallback", "oa-rank"]) expect(names).toContain(n);
  });

  it("one source failing keeps the other's papers and names it (Review Focus 2)", async () => {
    const c = FX.searches.find((x) => x.name === "both-oa429")!;
    const { d } = deps();
    const out = await runSearch(input(c.in), d);
    expect(out!.papers.length).toBe(6);
    expect(out!.papers.every((p) => p.source === "PubMed")).toBe(true);
    expect(out!.status).toBe("6 papers found — could not reach: OpenAlex (the free daily OpenAlex budget is used up. Add a free OpenAlex key in Settings, or try again tomorrow)");
  });

  it("an OpenAlex key reaches the search URL", async () => {
    const urls: string[] = [];
    const { d } = deps({ oaKey: "oa-test-key", fetch: (async (u: RequestInfo | URL) => { urls.push(String(u)); return new Response('{"results":[]}', { status: 200 }); }) as typeof fetch });
    await runSearch({ topic: "sleep", oa: true, pm: false, design: "any", designLabel: "Any", rank: false, terms: [] }, d);
    expect(oa).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ key: "oa-test-key" }));
    expect(urls[0]).toContain("&api_key=oa-test-key");
  });
});

describe("the status line's fragments (8318-8329)", () => {
  const base = { count: 3, termsCount: 0, fellBack: false, design: "any", designLabel: "Any", rankNote: "", failed: [] as string[] };
  it("one paper, one term: singular forms", () => {
    expect(statusLine(t, { ...base, count: 1, termsCount: 1 })).toBe("1 paper found (searched your words plus 1 related term)");
  });
  it("the kind of study label is cut at ' ('", () => {
    expect(statusLine(t, { ...base, design: "review", designLabel: t("rs2_review_article_openalex_type") })).toBe("3 papers found · kind of study: Review article");
  });
  it("no papers with a failed source names it instead of the broader-search hint", () => {
    expect(statusLine(t, { ...base, count: 0, failed: ["PubMed (HTTP 500)"] })).toBe("No papers found — could not reach: PubMed (HTTP 500)");
  });
  it("the rank disclosure: scored, words with toLocaleString(), one failed batch", () => {
    const note = rankNote(t, { scored: 11, words: 12345, failed: 1 }, 23);
    expect(note).toBe(" · ranked by fit to your question (11 of 23 scored, about " + (12345).toLocaleString() + " words sent to your AI); 1 batch could not be scored");
    expect(rankNote(t, { scored: 2, words: 10, failed: 0 }, 2)).toBe(" · ranked by fit to your question (2 of 2 scored, about 10 words sent to your AI)");
  });
});

describe("Rank by fit (rsRank 8220-8234)", () => {
  const papers = Array.from({ length: 25 }, (_, i) => ({ title: "Paper " + i, authors: "A B", year: "2020", venue: "", doi: "", source: "OpenAlex", abstract: i % 5 ? "Some abstract " + i : "" }));
  const reply = (n: number, score: (k: number) => number) => JSON.stringify({ scores: Array.from({ length: n }, (_, k) => ({ id: k + 1, score: score(k), reason: k === 0 ? "" : "Reason " + k })) });

  it("sends batches of 12 with core's prompt and v1's options, and scores the papers", async () => {
    const calls: Array<{ prompt: string; opts: unknown }> = [];
    const out = await rankPapers(papers, " exam anxiety ", {
      field: "psychology", t,
      callAI: async (prompt, opts) => { calls.push({ prompt, opts }); const n = calls.length === 3 ? 1 : 12; return reply(n, (k) => k % 4); }
    });
    expect(calls).toHaveLength(3);
    expect(calls.map((c) => c.opts)).toEqual(Array(3).fill({ temp: 0.1, max: 1500, noLang: true }));
    expect(calls[0]!.prompt).toBe(core.buildRankPrompt("psychology", "exam anxiety", papers.slice(0, 12)).prompt);
    expect(calls[2]!.prompt).toBe(core.buildRankPrompt("psychology", "exam anxiety", papers.slice(24)).prompt);
    expect(out.scored).toBe(25);
    expect(out.failed).toBe(0);
    expect(out.words).toBe(calls.reduce((n, c) => n + c.prompt.split(/\s+/).length, 0));
    expect(out.papers[0]!.rel).toEqual({ score: 0, reason: "no reason given", titleOnly: true });
    expect(out.papers[1]!.rel).toEqual({ score: 1, reason: "Reason 1", titleOnly: false });
    expect(papers[0]).not.toHaveProperty("rel");
  });

  it("a batch whose call fails or gives no score counts as failed; a key error on the first batch stops the ranking", async () => {
    let n = 0;
    const out = await rankPapers(papers, "q", { field: "psychology", t, callAI: async () => { n++; if (n === 1) throw new Error("HTTP 500"); return n === 2 ? "not json" : reply(1, () => 3); } });
    expect(out.failed).toBe(2);
    expect(out.scored).toBe(1);
    await expect(rankPapers(papers, "q", { field: "psychology", t, callAI: async () => { throw new Error("Your API key was rejected."); } })).rejects.toThrow("Your API key was rejected.");
  });

  it("a superseded ranking sends no further batch", async () => {
    let current = true, n = 0;
    const out = await rankPapers(papers, "q", { field: "psychology", t, isCurrent: () => current, callAI: async () => { n++; current = false; return reply(12, () => 2); } });
    expect(n).toBe(1);
    expect(out.scored).toBe(12);
  });

  it("a superseded search writes nothing after the newer one began and returns null", async () => {
    const c = FX.searches.find((x) => x.name === "oa-rank")!;
    let current = true;
    const { d, log } = deps({ isCurrent: () => current, callAI: async () => { current = false; return reply(12, () => 3); } });
    expect(await runSearch(input(c.in), d)).toBeNull();
    expect(log.statuses).toEqual(["🔎 Searching…", "🔎 22 papers found. Reading titles and abstracts to rank them…"]);
    expect(log.ai).toHaveLength(0);
  });

  it("a ranked search sets the sort to fit and writes the disclosure; a thrown ranking says it failed (callAI's sentence, register D-S2-12)", async () => {
    const c = FX.searches.find((x) => x.name === "oa-rank")!;
    let k = 0;
    const scored = deps({ callAI: async () => reply(12, () => (k++ % 2 ? 3 : 1)) });
    const out = await runSearch(input(c.in), scored.d);
    expect(out!.sort).toBe("fit");
    expect(out!.status).toMatch(/^22 papers found · ranked by fit to your question \(22 of 22 scored, about [\d,]+ words sent to your AI\)$/);
    const thrown = deps({ callAI: async () => { throw new Error("Add your API key first — click ⚙ at the top right."); } });
    const out2 = await runSearch(input(c.in), thrown.d);
    expect(out2!.sort).toBe("relevance");
    expect(out2!.status).toBe("22 papers found · ranking failed (Add your API key first — click ⚙ at the top right.), shown in the order returned");
  });
});

describe("the sort orders (rsApplySort 8356-8362, core's rsSortResults)", () => {
  const P = (title: string, year: string, citationCount: number, score?: number) => ({ title, authors: "", year, venue: "", doi: "", source: "OpenAlex", citationCount, ...(score === undefined ? {} : { rel: { score, reason: "" } }) });
  const list = [P("a", "2019", 5, 1), P("b", "2023", 0, 3), P("c", "", 50), P("d", "2021", 9, 0), P("e", "2023", 2, 2)];
  it("relevance keeps the order returned; most cited; newest first; fit 3, 2, unscored, 1, 0", () => {
    expect(sortedResults(list, "relevance").map((p) => p.title)).toEqual(["a", "b", "c", "d", "e"]);
    expect(sortedResults(list, "citations").map((p) => p.title)).toEqual(["c", "d", "a", "e", "b"]);
    expect(sortedResults(list, "year").map((p) => p.title)).toEqual(["b", "e", "d", "a", "c"]);
    expect(sortedResults(list, "fit").map((p) => p.title)).toEqual(["b", "e", "c", "a", "d"]);
  });
});

describe("Suggest related terms (rsSuggestTerms 8251-8263)", () => {
  function run(reply: string | Error, topic = "exam anxiety") {
    const log = { toasts: [] as string[], boxes: [] as string[], terms: null as unknown, ai: [] as Array<{ prompt: string; opts: unknown }> };
    const p = suggestTerms(topic, {
      field: "psychology", t, toast: (m) => { log.toasts.push(m); }, setBox: (b) => { log.boxes.push(b); }, setTerms: (x) => { log.terms = x; },
      callAI: async (prompt, opts) => { log.ai.push({ prompt, opts }); if (reply instanceof Error) throw reply; return reply; }
    });
    return p.then(() => log);
  }
  it("fewer than 3 characters toasts 'Type a topic first'", async () => {
    const log = await run("{}", " ab ");
    expect(log.toasts).toEqual(["Type a topic first"]);
    expect(log.ai).toEqual([]);
  });
  it("core's prompt and options; the terms come back ticked", async () => {
    const log = await run('{"terms":["test anxiety","Exam Anxiety","evaluation anxiety"]}', "  exam anxiety ");
    const built = core.buildSuggestTermsPrompt("psychology", "exam anxiety");
    expect(log.ai).toEqual([{ prompt: built.prompt, opts: { temp: 0.3, max: 500, noLang: true } }]);
    expect(log.boxes).toEqual(["thinking", "list"]);
    expect(log.terms).toEqual({ base: "exam anxiety", terms: ["test anxiety", "evaluation anxiety"], picked: [true, true] });
  });
  it("no useful term shows v1's note and keeps the old terms; a failure empties the box and toasts", async () => {
    const none = await run('{"terms":[]}');
    expect(none.boxes).toEqual(["thinking", "none"]);
    expect(none.terms).toBeNull();
    const failed = await run(new Error("Free limit reached for now."));
    expect(failed.boxes).toEqual(["thinking", "idle"]);
    expect(failed.toasts).toEqual(["Free limit reached for now."]);
  });
  it("rsPickedTerms: the ticked terms, only for the topic they were suggested for", () => {
    const s = { base: "exam anxiety", terms: ["a b", "c d", "e f"], picked: [true, false, true] };
    expect(pickedTerms(s, "exam anxiety")).toEqual(["a b", "e f"]);
    expect(pickedTerms(s, "exam anxiety and sleep")).toEqual([]);
  });
});

describe("a result into the library (rsAddToLibrary 8471-8483, rsInsertCitation 8486-8491)", () => {
  const oaPaper = { source: "OpenAlex", title: "Growth mindset and grades", authors: "Carol S. Dweck, David Yeager, et al.", year: "2019", venue: "Nature", doi: "10.1038/S41586-019-1466-Y", url: "https://doi.org/10.1038/s41586-019-1466-y", retracted: false, citationCount: 3 };
  function make(lib: core.CitationEntry[] = [], updateOk = true) {
    const log = { toasts: [] as string[], seeds: [] as Array<[string, boolean]>, next: null as core.CitationEntry[] | null, inserted: [] as core.Formatted[] };
    const d: AddDeps & { insert(f: core.Formatted): void } = {
      lib, style: "apa", t, known: true, whenRead: async () => true,
      update: (fn) => { if (!updateOk) return false; log.next = fn(lib); return true; },
      seedRetraction: (doi, flag) => { log.seeds.push([doi, flag]); },
      toast: (m) => { log.toasts.push(m); },
      insert: (f) => { log.inserted.push(f); }
    };
    return { d, log };
  }
  it("+ Citation library: core's entry appended, the retraction cache seeded, v1's toast", () => {
    const { d, log } = make();
    const r = addResult(oaPaper, d);
    expect(r!.entry).toEqual(core.rsEntryFromResult(oaPaper, "apa"));
    expect(log.next).toEqual([core.rsEntryFromResult(oaPaper, "apa")]);
    expect(log.seeds).toEqual([["10.1038/S41586-019-1466-Y", false]]);
    expect(log.toasts).toEqual(["Added to citation library ✓ — check author formatting before you submit"]);
  });
  it("a retracted result toasts retr_added_warn; a PubMed result seeds nothing", () => {
    const a = make();
    addResult({ ...oaPaper, retracted: true }, a.d);
    expect(a.log.toasts).toEqual([E.retr_added_warn]);
    expect(a.log.seeds).toEqual([["10.1038/S41586-019-1466-Y", true]]);
    const b = make();
    addResult({ ...oaPaper, source: "PubMed", doi: "" }, b.d);
    expect(b.log.seeds).toEqual([]);
  });
  it("the same title already in the library: 'Already in your library', nothing added (8475, the title only)", () => {
    const { d, log } = make([{ author: "Someone, Else", title: "Growth mindset and grades", year: "2001" }]);
    addResult(oaPaper, d);
    expect(log.toasts).toEqual(["Already in your library"]);
    expect(log.next).toBeNull();
    expect(log.seeds).toEqual([]);
  });
  it("added while the library is unread, a title the stored library holds is not added twice: once read, 'Already in your library', no seed", async () => {
    const stored = [{ author: "X, Y", title: "Growth mindset and grades" }];
    const log = { next: null as core.CitationEntry[] | null, toasts: [] as string[], seeds: 0 };
    let read!: (ok: boolean) => void;
    const whenRead = () => new Promise<boolean>((r) => { read = r; });
    // the blob applies the update to a stand-in while unread, then to the stored library once it is read
    let apply!: () => void;
    addResult(oaPaper, { lib: [], style: "apa", t, known: false, whenRead, toast: (m) => { log.toasts.push(m); }, seedRetraction: () => { log.seeds++; },
      update: (fn) => { fn([]); apply = () => { log.next = fn(stored); }; return true; } });
    expect(log.toasts).toEqual([]);
    apply();
    read(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(log.next).toEqual(stored);
    expect(log.toasts).toEqual(["Already in your library"]);
    expect(log.seeds).toBe(0);
  });
  it("added while unread and new: once read, the seed and v1's toast; a read still declined says nothing", async () => {
    const log = { toasts: [] as string[], seeds: 0 };
    const base = { lib: [], style: "apa" as const, t, known: false, toast: (m: string) => { log.toasts.push(m); }, seedRetraction: () => { log.seeds++; }, update: (fn: (p: core.CitationEntry[]) => core.CitationEntry[]) => { fn([]); return true; } };
    addResult(oaPaper, { ...base, whenRead: async () => true });
    await new Promise((r) => setTimeout(r, 0));
    expect(log.toasts).toEqual(["Added to citation library ✓ — check author formatting before you submit"]);
    expect(log.seeds).toBe(1);
    addResult(oaPaper, { ...base, whenRead: async () => false });
    await new Promise((r) => setTimeout(r, 0));
    expect(log.toasts).toHaveLength(1);
    expect(log.seeds).toBe(1);
  });
  it("Insert citation saves quietly, then inserts with the library's number and toasts rs_inserted", () => {
    const { d, log } = make([{ author: "A, B", title: "Other", year: "2000" }]);
    d.style = "vancouver";
    insertResult(oaPaper, d);
    expect(log.next).toHaveLength(2);
    expect(log.inserted).toEqual([core.citFmt(core.rsEntryFromResult(oaPaper, "vancouver"), 2, "vancouver")]);
    expect(log.toasts).toEqual([E.rs_inserted]);
  });
  it("Insert citation of a saved title inserts the saved entry, adds nothing", () => {
    const saved = { author: "Dweck, C.", title: "Growth mindset and grades", year: "2019" };
    const { d, log } = make([saved]);
    insertResult({ ...oaPaper, retracted: true }, d);
    expect(log.next).toBeNull();
    expect(log.inserted).toEqual([core.citFmt(saved, 0, "apa")]);
    expect(log.toasts).toEqual([E.retr_added_warn]);
  });
});
