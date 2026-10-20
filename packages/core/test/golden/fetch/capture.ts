import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import type { Engine } from "../harness/engines";
import { writeFixture } from "../harness/fixture";
import type { V1 } from "../harness/v1";

/**
 * Task 4's network fetchers, v1's own fetch-and-parse code run over the recorded responses (test/fetch/recorded/*.json, written live once by
 * test/fetch/recorded/capture.mjs). v1's `window.fetch` is replaced by a replayer that serves each recorded body by its URL, so v1's REAL code runs:
 * rsFetchOpenAlex 8061, rsPubmedAbstracts 8088 and rsFetchPubmed 8103 inside researchSearch 8283, rsConnected 8498 (with rsOaBrief 8492), retrFetchBatch 7571
 * and citRetractionRefresh 7579, apRefCheck 11236, rcCheckOne 7750 inside rcRun 7772, citPmidToDoi 7920 and citLookup 7931.
 *
 * The replayer: the URL v1 hands fetch is matched to a recording's `url` exactly, character for character (the normalisation is the identity: v1 and the
 * recorder both build URLs with encodeURIComponent, so there is nothing to normalise, and a URL that differs by one character is a mismatch to catch).
 * A URL with no recording is answered by a throw and noted; the capture then fails, naming it (a throw inside v1 would otherwise be swallowed into a
 * status line). A run may name URLs that throw `TypeError("Failed to fetch")` on purpose (a source that cannot be reached). Each answer is
 * `{ ok, status, headers.get, json(), text() }`; json() parses in v1's realm. Every URL v1 requested is kept, in order, beside each run's outputs.
 *
 * Runs and what each records (`in` the inputs, `requested` the URLs, then the outputs):
 * - `searches`: researchSearch with #rsTopic, #rsSrcOA/#rsSrcPubmed, #rsDesign and #rsRank set, and RS_TERMS holding the ticked related terms (as
 *   rsTermsRender leaves it, 8264). rsFetchOpenAlex and rsFetchPubmed are wrapped (top-level declarations, so researchSearch's calls reach the wrapper)
 *   to keep what each returned: `oa` and `pm`, one entry per call, `null` for a call that threw (the error is in `#rsStatus`). `merged` is rsResultsOriginal,
 *   `status` the text of #rsStatus. callAI is stubbed with "" (only the ranking run calls it, and every batch then fails to parse, so no paper is changed).
 * - `connected`: rsConnected(i) on the "plain" OpenAlex run's first result with referenced works, once as OpenAlex answers today (no cited_by_api_url, so
 *   v1 sends one request) and once with the paper's citedByApiUrl set to OpenAlex's cites filter. The two lists are read from #rsConnected as v1 renders
 *   them: each heading, and each card's title (`b`) and meta line (`.meta`, the authors then ` · year` when there is a year).
 * - `retractions`: retrFetchBatch(dois) directly; and citRetractionRefresh(true) over a library whose DOIs, normalised, are those same DOIs plus forms
 *   it drops or merges (a doi.org link, upper case, a duplicate, a non-DOI, none), reading `appu_retraction_cache` with each entry's time `t` removed.
 * - `refcheck`: apRefCheck() on a paper (AP.doc) whose reference chunk lists the same DOIs, reading AP.refs (apRender, which draws the whole paper, is set aside).
 * - `rc`: rcRun(true) over a library (DOI lookups that match, differ, 404 and cannot reach Crossref, and two title-only entries), reading `appu_refcheck`
 *   per entry with `t` removed.
 * - `lookups`: citLookup() with the form cleared, #citType on "Journal article" and #citURL holding each input (one with Crossref unreachable), reading
 *   citReadForm() and the toast (and the dictionary key it is).
 * - `pmids`: citPmidToDoi(pmid).
 * - `recorded`: each recording's file name, URL and the sha256 of its body, so the tests can check they replay the bodies this fixture was captured from.
 */

export type Recording = { url: string; status: number; headers: { "content-type": string | null }; body: string; synthetic?: boolean; note?: string };
const RECORDED_DIR = new URL("../../fetch/recorded/", import.meta.url);

/** Every recording, by URL (a URL recorded twice is an error). */
export function loadRecordings(): Map<string, Recording & { file: string }> {
  const out = new Map<string, Recording & { file: string }>();
  for (const file of readdirSync(RECORDED_DIR).filter((f) => f.endsWith(".json")).sort()) {
    const rec = JSON.parse(readFileSync(new URL(file, RECORDED_DIR), "utf8")) as Recording;
    if (out.has(rec.url)) throw new Error(`fetch: ${file} and ${out.get(rec.url)!.file} record the same URL`);
    out.set(rec.url, { ...rec, file });
  }
  return out;
}

export type SearchIn = { topic: string; oa: boolean; pm: boolean; design: string; rank: boolean; terms: string[]; throwFor?: string[] };
/** The researchSearch runs: each OpenAlex search alone, each PubMed search alone, then both sources together. */
export const SEARCH_RUNS: Array<{ name: string } & SearchIn> = [
  ...[
    ["plain", "growth mindset academic achievement", "any", false, []],
    ["terms", "exam anxiety", "any", false, ["test anxiety", "evaluation anxiety"]],
    ["rct", "mindfulness depression", "rct", false, []],
    ["sr", "screen time adolescents sleep", "sr", false, []],
    ["review", "working memory training", "review", false, []],
    ["qual", "teacher burnout", "qual", false, []],
    ["survey", "social media loneliness", "survey", false, []],
    ["rank", "self-efficacy", "any", true, []],
    ["zero", "qwxzjv flurble nonexistentterm", "any", false, []],
    ["retracted", "Ileal-lymphoid-nodular hyperplasia pervasive developmental disorder", "any", false, []],
    ["429", "caffeine sleep quality", "any", false, []],
  ].map(([name, topic, design, rank, terms]) => ({ name: `oa-${name as string}`, topic: topic as string, oa: true, pm: false, design: design as string, rank: rank as boolean, terms: terms as string[] })),
  ...[
    ["rct", "mindfulness depression", "rct", []],
    ["terms", "exam anxiety", "any", ["test anxiety", "evaluation anxiety"]],
    ["sr", "screen time adolescents sleep", "sr", []],
    ["review", "working memory training", "review", []],
    ["qual", "teacher burnout", "qual", []],
    ["survey", "social media loneliness", "survey", []],
    ["plain", "caffeine sleep quality", "any", []],
    ["zero", "qwxzjv flurble nonexistentterm", "any", []],
    ["noabstract", "Comment[pt] Wakefield MMR", "any", []],
    ["plain2", "loneliness older adults intervention", "any", []],
  ].map(([name, topic, design, terms]) => ({ name: `pm-${name as string}`, topic: topic as string, oa: false, pm: true, design: design as string, rank: false, terms: terms as string[] })),
  { name: "both-merge", topic: "mindfulness depression", oa: true, pm: true, design: "rct", rank: false, terms: [] },
  { name: "both-terms", topic: "exam anxiety", oa: true, pm: true, design: "any", rank: false, terms: ["test anxiety", "evaluation anxiety"] },
  { name: "both-oa429", topic: "caffeine sleep quality", oa: true, pm: true, design: "any", rank: false, terms: [] },
  { name: "both-zero", topic: "qwxzjv flurble nonexistentterm", oa: true, pm: true, design: "any", rank: false, terms: [] },
  // PubMed unreachable: its esearch throws, as a browser's fetch does when the network is down.
  { name: "both-pm-unreachable", topic: "growth mindset academic achievement", oa: true, pm: true, design: "any", rank: false, terms: [], throwFor: ["https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=6&term=growth%20mindset%20academic%20achievement"] },
  // The related-terms query fails, so withFallback (8297-8303) searches the topic alone.
  { name: "oa-terms-fallback", topic: "exam anxiety", oa: true, pm: false, design: "any", rank: false, terms: ["test anxiety", "evaluation anxiety"], throwFor: ["https://api.openalex.org/works?search=(exam%20anxiety)%20OR%20%22test%20anxiety%22%20OR%20%22evaluation%20anxiety%22&per-page=8&select=id,display_name,authorships,publication_year,primary_location,abstract_inverted_index,cited_by_count,doi,referenced_works,cited_by_api_url,open_access,is_retracted"] },
  // efetch unreachable: the papers come back with no abstracts (rsPubmedAbstracts 8088-8102).
  { name: "pm-efetch-unreachable", topic: "loneliness older adults intervention", oa: false, pm: true, design: "any", rank: false, terms: [], throwFor: ["efetch:plain2"] },
];

export const RETRACTION_DOIS = [
  "10.1016/s0140-6736(97)11096-0", "10.1016/s0140-6736(10)60175-4", "10.1016/s0140-6736(05)77837-5", "10.1016/s0140-6736(02)08948-1",
  "10.1177/0020720920983537", "10.1155/2022/7259595", "10.1002/jcop.22684", "10.3390/ijerph21080990",
  "10.1037/0003-066x.55.1.68", "10.4324/9780203771587", "10.1145/3290605.3300233", "10.9999/appuscholar-no-such-doi-2026",
];
/** The library citRetractionRefresh reads: its DOIs normalise (retrNormDoi) to RETRACTION_DOIS in that order, with a duplicate, a non-DOI and no DOI among them. */
const retractionLibrary = () => RETRACTION_DOIS.flatMap((d, i) => {
  const e = (doi: string, n: string) => ({ author: `Author${i}${n}, A.`, year: "2020", title: `Paper ${i}${n}`, doi });
  if (i === 0) return [e("https://doi.org/10.1016/S0140-6736(97)11096-0", ""), e(d, "b"), e("not a doi", "c"), e("", "d")];
  if (i === 1) return [e("http://dx.doi.org/" + d.toUpperCase(), "")];
  return [e(" " + d + " ", "")];
});

/** rcRun's library: DOI lookups that match, differ (title, year, first author) and 404, an organisation author, and two entries with no DOI (title search). */
export const RC_LIBRARY = [
  { author: "Ryan, Richard M.; Deci, Edward L.", year: "2000", title: "Self-determination theory and the facilitation of intrinsic motivation, social development, and well-being", doi: "10.1037/0003-066X.55.1.68", type: "Journal article" },
  { author: "Smith, Jane", year: "1990", title: "Something else entirely", doi: "https://doi.org/10.1145/3290605.3300233", type: "Journal article" },
  { author: "Doe, John", year: "2020", title: "A paper that is not there", doi: "10.9999/appuscholar-no-such-doi-2026", type: "Journal article" },
  { author: "Wakefield, A. J.", year: "1998", title: "Ileal-lymphoid-nodular hyperplasia, non-specific colitis, and pervasive developmental disorder in children", doi: "10.1016/s0140-6736(97)11096-0", type: "Journal article" },
  { author: "American Psychological Association", year: "1988", title: "Statistical power analysis for the behavioral sciences", doi: "10.4324/9780203771587", type: "Book" },
  // The same paper with no DOI (and a year one off, which rcCompare allows, so its citKey differs from the first entry's).
  { author: "Ryan, Richard M.; Deci, Edward L.", year: "2001", title: "Self-determination theory and the facilitation of intrinsic motivation, social development, and well-being", doi: "", type: "Journal article" },
  { author: "Nobody, Ann", year: "2021", title: "Lunar rhythms in the emotional life of houseplants", doi: "", type: "Journal article" },
  // Crossref unreachable for this one (RC_THROW): rcCheckOne's catch, {s:'err'}.
  { author: "Stanchfield, James E.", year: "1979", title: "The effect of estradiol-17ß and insulin on protein synthesis in primary monocultures of amphibian hepatocytes.", doi: "10.1349/ddlp.2889", type: "Thesis" },
];
const RC_THROW = ["https://api.crossref.org/works/10.1349%2Fddlp.2889"];

/** What a student pastes into #citURL: DOIs (bare, upper case, doi: and doi.org forms), PMIDs (with and without a DOI, as a link), a link with no DOI, and titles. */
export const LOOKUP_INPUTS: Array<string | { input: string; throwFor: string[] }> = [
  "10.1037/0003-066X.55.1.68",
  "https://doi.org/10.1093/oso/9780199974467.003.0001",
  "doi:10.9999/appuscholar-no-such-doi-2026",
  "10.4324/9780203771587",
  "https://dl.acm.org/doi/10.1145/3290605.3300233.",
  "10.1349/ddlp.2889",
  "10.15760/etd.6294",
  "10.1093/med:psych/9780195388558.001.0001",
  "10.1007/springerreference_69775",
  "Wakefield AJ et al. Lancet 1998;351:637-41. doi:10.1016/S0140-6736(97)11096-0)",
  "PMID: 9500320",
  "https://pubmed.ncbi.nlm.nih.gov/9500320/",
  "14907713",
  "https://example.com/some/page",
  "Self-determination theory and the facilitation of intrinsic motivation",
  "Protein measurement with the Folin phenol reagent",
  // Crossref unreachable: cite_lookup_fail.
  { input: "10.4324/9780203771587", throwFor: ["https://api.crossref.org/works/10.4324%2F9780203771587"] },
];
export const PMIDS = ["9500320", "14907713"];
/** The form fields citLookup fills (7948-7960), read back through citReadForm's names. */
export const LOOKUP_FIELDS = ["title", "author", "year", "month", "day", "container", "source", "editors", "volume", "issue", "pages", "doi", "url", "type"] as const;
const FORM_IDS = ["citAuthor", "citYear", "citTitle", "citSource", "citVol", "citIssue", "citPages", "citDOI", "citURL", "citMonth", "citDay", "citAccessed", "citContainer", "citEditors", "citNumber", "citDegree"];
const LOOKUP_KEYS = ["cite_lookup_ok", "cite_lookup_nf", "cite_lookup_nopmid", "cite_lookup_fail", "cite_lookup_empty"];

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const withoutT = (o: Record<string, Record<string, unknown>>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).filter(([key]) => key !== "t"))]));

type Replayer = { requested: string[]; unknown: string[]; throwFor: Set<string> };

function installReplayer(v1: V1, recs: Map<string, Recording>): Replayer {
  const state: Replayer = { requested: [], unknown: [], throwFor: new Set() };
  const w = v1.window as unknown as Record<string, unknown> & { JSON: JSON; TypeError: TypeErrorConstructor; Error: ErrorConstructor };
  w.fetch = async (input: unknown) => {
    const url = String(input);
    state.requested.push(url);
    if (state.throwFor.has(url)) throw new w.TypeError("Failed to fetch");
    const rec = recs.get(url);
    if (!rec) {
      state.unknown.push(url);
      throw new w.Error("fetch capture: no recording for " + url);
    }
    return {
      ok: rec.status >= 200 && rec.status < 300,
      status: rec.status,
      headers: { get: (n: string) => (n.toLowerCase() === "content-type" ? rec.headers["content-type"] : null) },
      json: async () => w.JSON.parse(rec.body),
      text: async () => rec.body,
    };
  };
  return state;
}

function field(v1: V1, id: string): HTMLInputElement {
  const el = v1.document.getElementById(id) as HTMLInputElement | null;
  if (!el) throw new Error(`fetch: v1 has no #${id}`);
  return el;
}

export const fetchEngine: Engine = {
  name: "fetch",
  async capture(v1, { check }) {
    const recs = loadRecordings();
    const rp = installReplayer(v1, recs);
    const w = v1.window as unknown as Record<string, unknown>;
    const run = async <T>(label: string, throwFor: string[], fn: () => Promise<T>): Promise<{ requested: string[]; out: T }> => {
      rp.requested = [];
      rp.unknown = [];
      rp.throwFor = new Set(throwFor);
      const errorsBefore = v1.errors.length;
      const out = await fn();
      if (rp.unknown.length) throw new Error(`fetch: ${label}: v1 requested URLs with no recording:\n${rp.unknown.join("\n")}`);
      for (const u of throwFor) if (!rp.requested.includes(u)) throw new Error(`fetch: ${label}: v1 never requested ${u}, which the run makes throw`);
      if (v1.errors.length !== errorsBefore) throw new Error(`fetch: ${label}: jsdom errors: ${v1.errors.slice(errorsBefore).join(" | ")}`);
      return { requested: [...rp.requested], out };
    };
    const efetchOf = (name: string) => {
      const esearch = [...recs.values()].find((r) => r.file.startsWith(`pm-efetch-${name}-`));
      if (!esearch) throw new Error(`fetch: no efetch recording for ${name}`);
      return esearch.url;
    };

    // ---- researchSearch ----
    const parsed: { oa: unknown[]; pm: unknown[] } = { oa: [], pm: [] };
    const origOA = w.rsFetchOpenAlex as (...a: unknown[]) => Promise<unknown>, origPM = w.rsFetchPubmed as (...a: unknown[]) => Promise<unknown>;
    w.rsFetchOpenAlex = async (...a: unknown[]) => { try { const r = await origOA(...a); parsed.oa.push(clone(r)); return r; } catch (e) { parsed.oa.push(null); throw e; } };
    w.rsFetchPubmed = async (...a: unknown[]) => { try { const r = await origPM(...a); parsed.pm.push(clone(r)); return r; } catch (e) { parsed.pm.push(null); throw e; } };
    const ai = v1.stubCallAI("");
    const searches = [];
    for (const s of SEARCH_RUNS) {
      const throwFor = (s.throwFor ?? []).map((u) => (u.startsWith("efetch:") ? efetchOf(u.slice(7)) : u));
      v1.setValue("rsTopic", s.topic);
      field(v1, "rsSrcOA").checked = s.oa;
      field(v1, "rsSrcPubmed").checked = s.pm;
      field(v1, "rsRank").checked = s.rank;
      v1.setValue("rsDesign", s.design);
      if (field(v1, "rsDesign").value !== s.design) throw new Error(`fetch: #rsDesign did not take ${s.design}`);
      v1.eval(`RS_TERMS.base=${JSON.stringify(s.terms.length ? s.topic : "")};RS_TERMS.terms=${JSON.stringify(s.terms)};RS_TERMS.picked={};RS_TERMS.terms.forEach((t,i)=>{RS_TERMS.picked[i]=true})`);
      v1.eval("rsResultsOriginal=[]");
      parsed.oa = [];
      parsed.pm = [];
      const toastsBefore = v1.toasts.length, aiBefore = ai.length;
      const { requested } = await run(s.name, throwFor, () => v1.call<Promise<void>>("researchSearch"));
      if (!s.rank && ai.length !== aiBefore) throw new Error(`fetch: ${s.name}: researchSearch called the AI with ranking off`);
      if (v1.toasts.length !== toastsBefore) throw new Error(`fetch: ${s.name}: researchSearch showed a toast: ${v1.toasts.slice(toastsBefore).join(" | ")}`);
      const status = v1.document.getElementById("rsStatus")?.textContent ?? "";
      searches.push({ name: s.name, in: { ...s, throwFor }, requested, oa: clone(parsed.oa), pm: clone(parsed.pm), merged: clone(v1.eval<unknown[]>("rsResultsOriginal")), status });
    }

    // ---- rsConnected, on the "plain" run's results ----
    {
      const s = SEARCH_RUNS.find((x) => x.name === "oa-plain")!;
      v1.setValue("rsTopic", s.topic);
      field(v1, "rsSrcOA").checked = true;
      field(v1, "rsSrcPubmed").checked = false;
      field(v1, "rsRank").checked = false;
      v1.setValue("rsDesign", "any");
      v1.eval("RS_TERMS.base='';RS_TERMS.terms=[];RS_TERMS.picked={}");
      await run("connected search", [], () => v1.call<Promise<void>>("researchSearch"));
    }
    const i = v1.eval<number>("rsResults.findIndex(p=>p.referencedWorks&&p.referencedWorks.length)");
    if (i < 0) throw new Error("fetch: no result of the plain search has referenced works");
    const readConnected = () => {
      const box = v1.document.getElementById("rsConnected")!;
      return Array.from(box.querySelectorAll("h4")).map((h) => {
        const next = h.nextElementSibling;
        const cards = next && next.classList.contains("connected-list") ? Array.from(next.querySelectorAll(".paper-card")) : [];
        return { heading: h.textContent ?? "", cards: cards.map((c) => ({ title: c.querySelector("b")?.textContent ?? "", meta: c.querySelector(".meta")?.textContent ?? "" })) };
      });
    };
    const connected = [];
    for (const withCitedBy of [false, true]) {
      const oaId = v1.eval<string>(`rsResults[${i}].oaId`);
      v1.eval(`rsResults[${i}].citedByApiUrl=${JSON.stringify(withCitedBy ? "https://api.openalex.org/works?filter=cites:" + oaId : "")}`);
      const paper = clone(v1.eval<{ referencedWorks: string[]; citedByApiUrl: string; oaId: string; title: string }>(`rsResults[${i}]`));
      const { requested } = await run("connected", [], () => v1.call<Promise<void>>("rsConnected", i));
      const lists = readConnected();
      if (lists.length !== 2) throw new Error(`fetch: rsConnected rendered ${lists.length} lists`);
      connected.push({ in: { oaId: paper.oaId, title: paper.title, referencedWorks: paper.referencedWorks, citedByApiUrl: paper.citedByApiUrl }, requested, cites: lists[0]!, citedBy: lists[1]! });
    }

    // ---- retractions ----
    const batch = await run("retrFetchBatch", [], () => v1.call<Promise<Record<string, boolean>>>("retrFetchBatch", RETRACTION_DOIS));
    const library = retractionLibrary();
    v1.eval(`LS.set('appu_citations',${JSON.stringify(JSON.stringify(library))});LS.rm('appu_retraction_cache')`);
    const refresh = await run("citRetractionRefresh", [], () => v1.call<Promise<void>>("citRetractionRefresh", true));
    const cache = withoutT(JSON.parse(v1.eval<string>("LS.get('appu_retraction_cache')")) as Record<string, Record<string, unknown>>);
    const retractions = { dois: RETRACTION_DOIS, batch: { requested: batch.requested, out: clone(batch.out) }, refresh: { library, requested: refresh.requested, cache } };

    // ---- apRefCheck ----
    v1.eval(`AP.doc={title:'Reference check',chunks:[{ref:true,text:${JSON.stringify("References. " + RETRACTION_DOIS.join(" ; "))}}],refsCut:true};AP.refs=null;AP.refBusy=false`);
    if (JSON.stringify(v1.call("apRefDois")) !== JSON.stringify(RETRACTION_DOIS)) throw new Error("fetch: apRefDois does not read RETRACTION_DOIS back");
    // apRender (11272) draws the whole paper, which this minimal AP.doc is not; it is set aside while apRefCheck runs (it only reads AP.refs).
    const apRender = w.apRender;
    w.apRender = () => {};
    const ap = await run("apRefCheck", [], () => v1.call<Promise<void>>("apRefCheck"));
    w.apRender = apRender;
    const refcheck = { dois: RETRACTION_DOIS, requested: ap.requested, refs: clone(v1.eval<Record<string, unknown>>("AP.refs")) };

    // ---- rcRun ----
    v1.eval(`LS.set('appu_citations',${JSON.stringify(JSON.stringify(RC_LIBRARY))});LS.rm('appu_refcheck')`);
    const rcr = await run("rcRun", RC_THROW, () => v1.call<Promise<void>>("rcRun", true));
    const rcCache = withoutT(JSON.parse(v1.eval<string>("LS.get('appu_refcheck')")) as Record<string, Record<string, unknown>>);
    const rc = { throwFor: RC_THROW, requested: rcr.requested, entries: RC_LIBRARY.map((d) => ({ entry: d, key: v1.call<string>("citKey", d), out: rcCache[v1.call<string>("citKey", d)] ?? null })) };
    if (rc.entries.some((e) => e.out === null)) throw new Error("fetch: rcRun left an entry unchecked");

    // ---- citLookup ----
    const keyText = Object.fromEntries(LOOKUP_KEYS.map((k) => [k, v1.call<string>("t", k)]));
    const lookups = [];
    for (const item of LOOKUP_INPUTS) {
      const { input, throwFor } = typeof item === "string" ? { input: item, throwFor: [] } : item;
      for (const id of FORM_IDS) v1.setValue(id, "");
      v1.setValue("citType", "Journal article");
      v1.setValue("citURL", input);
      const toastsBefore = v1.toasts.length;
      const { requested } = await run(`citLookup ${input}`, throwFor, () => v1.call<Promise<void>>("citLookup"));
      const toast = v1.toasts.slice(toastsBefore).filter((x) => x !== v1.call<string>("t", "cite_lookup_busy")).pop() ?? "";
      const toastKey = LOOKUP_KEYS.find((k) => keyText[k] === toast);
      if (!toastKey) throw new Error(`fetch: citLookup ${input} toasted ${JSON.stringify(toast)}, none of ${LOOKUP_KEYS.join(", ")}`);
      const form = clone(v1.call<Record<string, string>>("citReadForm"));
      lookups.push({ input, throwFor, requested, toast, toastKey, form });
    }

    // ---- citPmidToDoi ----
    const pmids = [];
    for (const pmid of PMIDS) {
      const r = await run(`citPmidToDoi ${pmid}`, [], () => v1.call<Promise<string>>("citPmidToDoi", pmid));
      pmids.push({ pmid, requested: r.requested, out: r.out });
    }

    // Every recording is used by some run.
    const used = new Set([...searches, ...connected, ...lookups, ...pmids].flatMap((x) => x.requested).concat(batch.requested, refresh.requested, ap.requested, rcr.requested));
    const unused = [...recs.values()].filter((r) => !used.has(r.url)).map((r) => r.file);
    if (unused.length) throw new Error(`fetch: recordings no run requested: ${unused.join(", ")}`);
    const recorded = [...recs.values()].map((r) => ({ file: r.file, url: r.url, status: r.status, sha256: sha(r.body) }));

    return [writeFixture("fetch", "cases", { recorded, searches, connected, retractions, refcheck, rc, lookups, pmids }, v1, check)];
  },
};
