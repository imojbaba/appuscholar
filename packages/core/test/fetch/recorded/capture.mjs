// Records the live responses the fetcher tests replay: node packages/core/test/fetch/recorded/capture.mjs
//
// One JSON file per request, { url, status, headers: { "content-type" }, body } (body as text, as the server sent it; PubMed's efetch XML too),
// written next to this script. Every *.json here is deleted first, so the directory holds exactly this corpus. Run it once; the files are committed and
// never edited by hand (a mismatch with v1 is a port bug or a register row). No API key and no mailto are sent. Between live calls the script waits
// 250 ms (OpenAlex, Crossref) or 400 ms (NCBI E-utilities, whose keyless limit is 3 requests a second).
//
// `--only a,b` records just the named cases and deletes nothing. It refuses to overwrite a file that exists, and it refuses before it fetches, so a mistaken name costs
// the live API no request (ruling B2-R19): node capture.mjs --only pm-v2-terms,pm-v2-rct.
// The v2 recordings (pm-*-v2-*, paste-*, epmc-*) are also listed in v2-manifest.json (file, url, status, sha256 of the body), which save() writes or updates for each of them: the golden
// fixture (test/golden/fetch/cases.json) is v1's and is never edited, so test/fetch/openalex.test.ts checks these files against the manifest instead.
// Case names: oa-<name> (OA_SEARCHES), pm-<name> (PM_SEARCHES and PM_V2_SEARCHES), oa-connected, oa-retractions, cr-doi, cr-title3, cr-title1, pm-pmid, and the cases of
// LOOKUP_CASES, which are not v1's: paste-* (Task 19, the by-id lookups of "paste a link, DOI or PubMed number") and epmc-* (Task 21, Europe PMC's open-access full text).
//
// The URLs are built here as v1 builds them (index.html build 2026.10.13a): rsFetchOpenAlex 8061, rsFetchPubmed 8103 and rsPubmedAbstracts 8088,
// rsConnected 8498, retrFetchBatch 7571, apRefCheck 11245, rcCheckOne 7750, citPmidToDoi 7920 and citLookup 7944, with rsBuildQuery 8273 and
// RS_DESIGN 8237 (read from src/data/research-tables.ts, which the golden harness generates from v1). The golden capture (test/golden/fetch/capture.ts)
// replays these files to v1 itself and throws on any URL that is not here, so a URL this script builds differently from v1 is caught there.

import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

// ---- The corpus ------------------------------------------------------------------------------------------------------------------------------------

/** OpenAlex searches, as researchSearch issues them with only OpenAlex ticked: the topic, the ticked related terms, the kind of study, and "Rank by fit" (per-page 25, else 8). */
export const OA_SEARCHES = [
  { name: "plain", topic: "growth mindset academic achievement", terms: [], design: "any", rank: false },
  { name: "terms", topic: "exam anxiety", terms: ["test anxiety", "evaluation anxiety"], design: "any", rank: false },
  { name: "terms-fallback", topic: "exam anxiety", terms: [], design: "any", rank: false }, // what withFallback (8301) searches when the terms query fails
  { name: "rct", topic: "mindfulness depression", terms: [], design: "rct", rank: false },
  { name: "sr", topic: "screen time adolescents sleep", terms: [], design: "sr", rank: false },
  { name: "review", topic: "working memory training", terms: [], design: "review", rank: false }, // filter=type:review
  { name: "qual", topic: "teacher burnout", terms: [], design: "qual", rank: false },
  { name: "survey", topic: "social media loneliness", terms: [], design: "survey", rank: false },
  { name: "rank", topic: "self-efficacy", terms: [], design: "any", rank: true }, // per-page=25
  { name: "zero", topic: "qwxzjv flurble nonexistentterm", terms: [], design: "any", rank: false },
  { name: "retracted", topic: "Ileal-lymphoid-nodular hyperplasia pervasive developmental disorder", terms: [], design: "any", rank: false }, // a retracted paper, papers with no abstract and no DOI
];
/** The OpenAlex search answered by the synthetic 429 below (never sent live). Its PubMed search is recorded, so a both-sources run shows one source failing. */
export const OA_429 = { name: "429", topic: "caffeine sleep quality", terms: [], design: "any", rank: false };
/** PubMed searches (esearch, then esummary and efetch when there are ids), as researchSearch issues them with only PubMed ticked (retmax 15 when ranking, else 6). */
export const PM_SEARCHES = [
  { name: "rct", topic: "mindfulness depression", terms: [], design: "rct", rank: false },
  { name: "terms", topic: "exam anxiety", terms: ["test anxiety", "evaluation anxiety"], design: "any", rank: false },
  { name: "sr", topic: "screen time adolescents sleep", terms: [], design: "sr", rank: false },
  { name: "review", topic: "working memory training", terms: [], design: "review", rank: false },
  { name: "qual", topic: "teacher burnout", terms: [], design: "qual", rank: false },
  { name: "survey", topic: "social media loneliness", terms: [], design: "survey", rank: false },
  { name: "plain", topic: "caffeine sleep quality", terms: [], design: "any", rank: false },
  { name: "zero", topic: "qwxzjv flurble nonexistentterm", terms: [], design: "any", rank: false }, // esearch only
  { name: "noabstract", topic: "Comment[pt] Wakefield MMR", terms: [], design: "any", rank: false }, // efetch carries no AbstractText
  { name: "plain2", topic: "loneliness older adults intervention", terms: [], design: "any", rank: false },
];
/**
 * PubMed searches of the v2 literature search (rsBuildQueryV2, Fix wave A Task 10), recorded with the exact esearch term it builds (retmax 6). Not v1 queries, so the
 * golden capture does not replay them; only `--only` records them, and the full run does too so the corpus stays reproducible.
 */
export const PM_V2_SEARCHES = [
  { name: "v2-terms", term: '(exam[tiab] AND anxiety[tiab]) OR "test anxiety"[tiab] OR "evaluation anxiety"[tiab]', rank: false },
  { name: "v2-rct", term: '(exam[tiab] AND anxiety[tiab]) AND "Randomized Controlled Trial"[pt]', rank: false },
];
/**
 * Connected papers (rsConnected 8498) of the first result of this OpenAlex search that has referenced works. OpenAlex no longer returns
 * `cited_by_api_url` (checked 2026-10-19: absent from /works/{id} and from `select=`), so v1's citedByApiUrl is "" and its second request is never sent
 * live. To keep that path recorded, the cited-by request is made with the URL OpenAlex used to return there, `https://api.openalex.org/works?filter=cites:<id>`,
 * and the golden capture hands v1 the paper with that URL set.
 */
export const CONNECTED_FROM = "plain";
export const citedByUrlOf = (oaId) => "https://api.openalex.org/works?filter=cites:" + oaId;
/** One retraction batch (retrFetchBatch 7571; and apRefCheck's own select, 11245): normalised DOIs, retracted and not, and one OpenAlex does not hold. */
export const RETRACTION_DOIS = [
  "10.1016/s0140-6736(97)11096-0", "10.1016/s0140-6736(10)60175-4", "10.1016/s0140-6736(05)77837-5", "10.1016/s0140-6736(02)08948-1",
  "10.1177/0020720920983537", "10.1155/2022/7259595", "10.1002/jcop.22684", "10.3390/ijerph21080990",
  "10.1037/0003-066x.55.1.68", "10.4324/9780203771587", "10.1145/3290605.3300233", "10.9999/appuscholar-no-such-doi-2026",
];
/** Crossref DOI lookups (rcCheckOne 7754, citLookup 7944): one per Crossref type citLookup maps, and one that 404s. Lower case, as both callers send them. */
export const CR_DOIS = [
  "10.1037/0003-066x.55.1.68", // journal-article
  "10.1093/oso/9780199974467.003.0001", // book-chapter
  "10.9999/appuscholar-no-such-doi-2026", // 404
  "10.4324/9780203771587", // book
  "10.1145/3290605.3300233", // proceedings-article
  "10.1349/ddlp.2889", // dissertation
  "10.15760/etd.6294", // report
  "10.1093/med:psych/9780195388558.001.0001", // edited-book
  "10.1007/springerreference_69775", // reference-entry
  "10.1016/s0140-6736(97)11096-0", // journal-article, retracted; also the DOI PubMed gives for PMID 9500320
];
/** Crossref title searches with 3 rows (rcCheckOne 7761-7762): the saved title and author of a library entry with no DOI. */
export const CR_TITLE_SEARCHES = [
  { title: "Self-determination theory and the facilitation of intrinsic motivation, social development, and well-being", author: "Ryan, Richard M.; Deci, Edward L." },
  { title: "Lunar rhythms in the emotional life of houseplants", author: "Nobody, Ann" },
];
/** Crossref title searches with 1 row (citLookup 7944, the title-only path). */
export const CR_FIRST_SEARCHES = ["Self-determination theory and the facilitation of intrinsic motivation", "Protein measurement with the Folin phenol reagent"];
/** PMID → DOI through esummary (citPmidToDoi 7920): one with a DOI, one without. */
export const PMIDS = ["9500320", "14907713"];
/** Hand-written, never served by OpenAlex: the shape of an OpenAlex error body with HTTP 429. */
const SYNTHETIC_429_BODY = JSON.stringify({ error: "Rate limit exceeded", message: "Synthetic body written by hand for the 429 test: the daily budget for keyless use is spent." });

// ---- v1's URL building (copied from the v1 lines named at the top) ---------------------------------------------------------------------------------

const DIR = fileURLToPath(new URL(".", import.meta.url));
const tablesSource = readFileSync(new URL("../../../src/data/research-tables.ts", import.meta.url), "utf8");
const RS_DESIGN = JSON.parse(tablesSource.slice(tablesSource.indexOf("export const RS_DESIGN = ") + "export const RS_DESIGN = ".length, tablesSource.lastIndexOf(" as const;")));

function rsBuildQuery(q, kind, terms, design) {
  const d = RS_DESIGN[design] || {};
  let core = q;
  if (terms.length) core = kind === "oa" ? "(" + q + ") OR " + terms.map((t) => '"' + t + '"').join(" OR ") : "(" + q + ") OR " + terms.map((t) => '"' + t + '"[tiab]').join(" OR ");
  const cl = kind === "oa" ? d.oa : d.pm;
  if (cl) core = "(" + core + ") AND " + cl;
  return core;
}
const OA_SELECT = "&select=id,display_name,authorships,publication_year,primary_location,abstract_inverted_index,cited_by_count,doi,referenced_works,cited_by_api_url,open_access,is_retracted";
const oaSearchUrl = (s) => {
  const dd = RS_DESIGN[s.design] || {};
  const filter = dd.oaFilter || "";
  return "https://api.openalex.org/works?search=" + encodeURIComponent(rsBuildQuery(s.topic, "oa", s.terms, s.design)) + (filter ? "&filter=" + filter : "") + "&per-page=" + (s.rank ? 25 : 8) + OA_SELECT;
};
const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/";
const esearchUrl = (s) => EUTILS + "esearch.fcgi?db=pubmed&retmode=json&retmax=" + (s.rank ? 15 : 6) + "&term=" + encodeURIComponent(s.term || rsBuildQuery(s.topic, "pm", s.terms, s.design));
const esummaryUrl = (ids) => EUTILS + "esummary.fcgi?db=pubmed&retmode=json&id=" + ids.join(",");
const efetchUrl = (ids) => EUTILS + "efetch.fcgi?db=pubmed&retmode=xml&rettype=abstract&id=" + ids.join(",");
const pmidUrl = (pmid) => EUTILS + "esummary.fcgi?db=pubmed&retmode=json&id=" + encodeURIComponent(pmid);
const BRIEF = "&per-page=8&select=display_name,authorships,publication_year";
const retrUrl = (dois) => "https://api.openalex.org/works?filter=doi:" + dois.map((d) => encodeURIComponent("https://doi.org/" + d)).join("|") + "&per-page=50&select=doi,is_retracted";
const apRefUrl = (dois) => "https://api.openalex.org/works?filter=doi:" + dois.map((x) => encodeURIComponent("https://doi.org/" + x)).join("|") + "&per-page=50&select=doi,is_retracted,display_name";
const crDoiUrl = (doi) => "https://api.crossref.org/works/" + encodeURIComponent(doi);
function citLastName(a) {
  a = (a || "").split(";")[0].trim();
  if (!a) return "Author";
  if (a.includes(",")) return a.split(",")[0].trim();
  const p = a.split(/\s+/);
  return p[p.length - 1];
}
const crTitle3Url = (e) => "https://api.crossref.org/works?rows=3&query.bibliographic=" + encodeURIComponent(((e.title || "") + " " + citLastName(e.author)).slice(0, 300));
const crTitle1Url = (q) => "https://api.crossref.org/works?rows=1&query.bibliographic=" + encodeURIComponent(q.slice(0, 300));

// ---- Not v1's: the by-id lookups (Task 19) and Europe PMC (Task 21) ----------------------------------------------------------------------------------

/**
 * The requests behind "paste a link, DOI or PubMed number" (src/paste.ts: oaWorkByRef, pmPaperById, pmcidToIds and crLookupDoiV2) and behind Europe PMC's open-access full
 * text (src/fetch/europepmc.ts), each case as [case name, [[file name, URL, the status the corpus means to record], ...]]. The URLs are built as those fetchers build them (v1
 * has no such requests, so the golden capture does not replay these files; test/fetch/lookup-by-id.test.ts, paste.test.ts and europepmc.test.ts do, by exact URL). Public
 * bibliographic data only; the DOI, PMID and PMCID are the walk sheet's paper (Schaefer et al. 2019, Scientific Reports) and a few others named below.
 */
const WALK_DOI = "10.1038/s41598-019-49466-6"; // PMID 31527670, PMCID PMC6746734, OpenAlex W2972990769
const ARXIV_DOI = "10.48550/arxiv.2101.00001"; // arXiv 2101.00001: DataCite's DOI, which Crossref does not hold
const OA_WORK_SELECT = OA_SELECT.slice("&select=".length) + ",biblio"; // rsFetchOpenAlex's select plus biblio (ruling B2-R17)
const oaWorkUrl = (ref) => "https://api.openalex.org/works/" + ref + "?select=" + OA_WORK_SELECT;
const EPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest/";
/** A DOI of plain characters is sent as it is; any other is quoted and percent-encoded (the slash kept), as epmcFullText sends it (an unquoted "(" gives no hit). */
const epmcSearchUrl = (doi) => EPMC + "search?query=DOI:" + (/^[A-Za-z0-9._/-]+$/.test(doi) ? doi : encodeURIComponent('"' + doi + '"').replace(/%2F/g, "/")) + "&format=json&resultType=lite";
const epmcFullTextUrl = (pmcid) => EPMC + pmcid + "/fullTextXML";
export const LOOKUP_CASES = [
  ["paste-cr-doi", [["paste-cr-doi", crDoiUrl(WALK_DOI), 200]]], // Crossref lists the 13317 as article-number, with no page
  ["paste-cr-arxiv", [["paste-cr-arxiv", crDoiUrl(ARXIV_DOI), 404]]], // not a Crossref DOI: the lookup then asks OpenAlex
  ["paste-oa-doi", [["paste-oa-doi", oaWorkUrl("doi:" + WALK_DOI), 200]]],
  ["paste-oa-arxiv", [["paste-oa-arxiv", oaWorkUrl("doi:" + ARXIV_DOI), 200]]], // an arXiv id is found as its DOI
  ["paste-oa-pmcid", [["paste-oa-pmcid", oaWorkUrl("pmcid:PMC6746734"), 404]]], // OpenAlex holds no PMC numbers (has_pmcid:true counted 0 works on 2026-10-24)
  ["paste-oa-work", [["paste-oa-work", oaWorkUrl("W2972990769"), 200]]],
  ["paste-oa-nf", [["paste-oa-nf", oaWorkUrl("doi:10.9999/appuscholar-no-such-doi-2026"), 404]]],
  ["paste-pmc-esummary", [["paste-pmc-esummary", EUTILS + "esummary.fcgi?db=pmc&retmode=json&id=6746734", 200]]], // PubMed Central's PMID and DOI for the PMC number
  ["paste-pm-nf", [["paste-pm-nf", pmidUrl("99999999"), 200]]], // esummary answers 200 with an error item for an id it does not know
  ["epmc-oa", [["epmc-search-oa", epmcSearchUrl(WALK_DOI), 200], ["epmc-fulltext-oa", epmcFullTextUrl("PMC6746734"), 200]]], // open access, in Europe PMC: JATS XML
  ["epmc-nopmc", [["epmc-search-nopmc", epmcSearchUrl("10.1037/0003-066x.55.1.68"), 200]]], // Europe PMC has no record of it: no hit
  ["epmc-nopmcid", [["epmc-search-nopmcid", epmcSearchUrl("10.1016/s0140-6736(97)11096-0"), 200]]], // a record with no PMCID (and a DOI that needs quoting)
  ["epmc-notoa", [["epmc-search-notoa", epmcSearchUrl("10.4022/jafib.1335"), 200]]], // a PMCID, in Europe PMC, but isOpenAccess N
  ["epmc-unknown", [["epmc-fulltext-unknown", epmcFullTextUrl("PMC99999999"), 500]]], // an unknown PMCID answers 500 JSON, not 404
];

// ---- Recording ---------------------------------------------------------------------------------------------------------------------------------------

const argv = process.argv.slice(2);
const onlyAt = argv.indexOf("--only");
const ONLY = onlyAt < 0 ? null : new Set((argv[onlyAt + 1] || "").split(",").filter(Boolean));
if (onlyAt >= 0 && !ONLY.size) throw new Error("--only needs a comma-separated list of case names");
const want = (name) => !ONLY || ONLY.has(name);
const written = new Map(); // url → file
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (url) => createHash("sha256").update(url).digest("hex").slice(0, 8);

const MANIFEST = DIR + "v2-manifest.json";
function listInManifest(file, record) {
  const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : { note: "The v2 recordings (not v1 requests, so not in test/golden/fetch/cases.json, which is v1's and never edited). Written by capture.mjs.", recorded: [] };
  manifest.recorded = manifest.recorded.filter((r) => r.url !== record.url && r.file !== file);
  manifest.recorded.push({ file, url: record.url, status: record.status, sha256: createHash("sha256").update(record.body).digest("hex") });
  manifest.recorded.sort((a, b) => (a.file < b.file ? -1 : 1));
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + "\n");
}

/** `--only` never overwrites a recording. Called before the live request (record), so a file that exists costs no call, and again by save(). */
function refuseOverwrite(file) {
  if (ONLY && readdirSync(DIR).includes(file)) throw new Error(`--only: ${file} already exists and is not overwritten`);
}

function save(file, record) {
  if (written.has(record.url)) return;
  written.set(record.url, file);
  refuseOverwrite(file);
  writeFileSync(DIR + file, JSON.stringify(record, null, 1) + "\n");
  // The v2 recordings reach the manifest: pm-*-v2-* (wave A), paste-* (Task 19) and epmc-* (Task 21). v1's files (cr-doi-*, oa-search-*, pm-esummary-<name>, ...) are in the golden fixture.
  if (/^(pm-(esearch|esummary|efetch)-v2-|paste-|epmc-)/.test(file)) listInManifest(file, record);
  console.log(`${file} ${record.status} ${record.body.length} chars`);
}

/** Fetches `url` live (once per URL), saves it as `<name>.json`, and returns the body. `expect` is the status the corpus means to record. */
async function record(name, url, expect = 200) {
  const done = written.get(url);
  if (done) return JSON.parse(readFileSync(DIR + done, "utf8")).body;
  const file = `${name}-${short(url)}.json`;
  refuseOverwrite(file); // before the live request: a recording that exists is not fetched again
  await sleep(url.startsWith(EUTILS) ? 400 : 250);
  const r = await fetch(url);
  const body = await r.text();
  if (r.status !== expect) throw new Error(`${name}: ${url} answered ${r.status}, the corpus expects ${expect}; nothing about this file is kept`);
  save(file, { url, status: r.status, headers: { "content-type": r.headers.get("content-type") }, body });
  return body;
}

async function main() {
  if (!ONLY) for (const f of readdirSync(DIR)) if (f.endsWith(".json")) unlinkSync(DIR + f);

  const known = new Set(["oa-connected", "oa-retractions", "cr-doi", "cr-title3", "cr-title1", "pm-pmid"]);
  for (const s of OA_SEARCHES) known.add("oa-" + s.name);
  for (const s of [...PM_SEARCHES, ...PM_V2_SEARCHES]) known.add("pm-" + s.name);
  for (const [name] of LOOKUP_CASES) known.add(name);
  for (const n of ONLY || []) if (!known.has(n)) throw new Error(`--only: unknown case "${n}"; the cases are ${[...known].join(", ")}`);

  const oaBodies = {};
  for (const s of OA_SEARCHES) {
    // oa-connected reads the CONNECTED_FROM search; under --only that search is fetched without being saved when it is not itself named.
    if (want("oa-" + s.name)) oaBodies[s.name] = JSON.parse(await record(`oa-search-${s.name}`, oaSearchUrl(s)));
    else if (ONLY && s.name === CONNECTED_FROM && want("oa-connected")) {
      // The cites and cited-by files are named for URLs that this search's body decides, so they cannot be named before it is fetched: refuse on the case's prefix instead.
      const have = readdirSync(DIR).find((f) => f.startsWith("oa-connected-"));
      if (have) throw new Error(`--only: ${have} already exists and is not overwritten`);
      await sleep(250);
      oaBodies[s.name] = await (await fetch(oaSearchUrl(s))).json();
    }
  }
  if (!ONLY) save(`oa-search-429-${short(oaSearchUrl(OA_429))}.json`, {
    url: oaSearchUrl(OA_429), status: 429, headers: { "content-type": "application/json" }, body: SYNTHETIC_429_BODY,
    synthetic: true, note: "Written by hand, never served by OpenAlex: the 429 case (v1 oaHttpError 8032).",
  });

  for (const s of [...PM_SEARCHES, ...PM_V2_SEARCHES]) {
    if (!want("pm-" + s.name)) continue;
    const sj = JSON.parse(await record(`pm-esearch-${s.name}`, esearchUrl(s)));
    const ids = (sj.esearchresult && sj.esearchresult.idlist) || [];
    if (!ids.length) continue;
    await record(`pm-esummary-${s.name}`, esummaryUrl(ids));
    await record(`pm-efetch-${s.name}`, efetchUrl(ids));
  }

  if (want("oa-connected")) {
    const p = (oaBodies[CONNECTED_FROM].results || []).find((w) => (w.referenced_works || []).length);
    if (!p) throw new Error(`connected: no result of the ${CONNECTED_FROM} search has referenced works`);
    const ids = p.referenced_works.slice(0, 8).map((u) => u.split("/").pop()).join("|");
    await record("oa-connected-cites", "https://api.openalex.org/works?filter=openalex_id:" + ids + BRIEF);
    await record("oa-connected-citedby", (p.cited_by_api_url || citedByUrlOf(p.id.split("/").pop())) + BRIEF);
  }

  if (want("oa-retractions")) {
    await record("oa-retractions", retrUrl(RETRACTION_DOIS));
    await record("oa-refcheck", apRefUrl(RETRACTION_DOIS));
  }

  if (want("cr-doi")) for (const [i, doi] of CR_DOIS.entries()) await record(`cr-doi-${String(i + 1).padStart(2, "0")}`, crDoiUrl(doi), doi.startsWith("10.9999/") ? 404 : 200);
  if (want("cr-title3")) for (const [i, e] of CR_TITLE_SEARCHES.entries()) await record(`cr-title3-${i + 1}`, crTitle3Url(e));
  if (want("cr-title1")) for (const [i, q] of CR_FIRST_SEARCHES.entries()) await record(`cr-title1-${i + 1}`, crTitle1Url(q));
  if (want("pm-pmid")) for (const pmid of PMIDS) await record(`pm-pmid-${pmid}`, pmidUrl(pmid));
  for (const [name, requests] of LOOKUP_CASES) if (want(name)) for (const [file, url, expect] of requests) await record(file, url, expect);

  console.log(`${written.size} files`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
