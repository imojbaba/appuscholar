// Records the live responses that only the stage-2 journey asks for (e2e/stage2-idea-literature.spec.ts): node apps/web/e2e/fixtures/recorded/capture.mjs
//
// The journey is answered from packages/core/test/fetch/recorded (the core fetcher tests' corpus, which the golden capture also replays to v1) and,
// for the requests its own library and papers make, from the files here: one JSON file per request, { url, status, headers: { "content-type" }, body },
// in the core corpus's format. Every *.json here is deleted first, so the directory holds exactly this list. Run it once; the files are committed and
// never edited by hand. No API key and no mailto are sent; 250 ms between calls. What is sent is what the app itself would send: DOIs and OpenAlex ids.
//
// The URLs are the ones the journey's browser asks for (run the spec with E2E_LOG_UNRECORDED=1 to see any it asks for that are not recorded); they are
// `--only a,b` records just the named cases (the first element of each URLS entry) and deletes nothing; it refuses to overwrite a file that exists.
//
// built by core's own fetchers (packages/core/src/fetch: oaConnected, oaRetractions, rcCheckOne), so they are listed here exactly as those build them.

import { existsSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL("./", import.meta.url));
const doi = (d) => encodeURIComponent("https://doi.org/" + d);
/** The journey's library, in library order: the capture (Ryan and Deci), the manual add (Cohen), then the two papers kept from the search. */
const RYAN = "10.1037/0003-066x.55.1.68", COHEN = "10.4324/9780203771587", MU = "10.3389/fpsyg.2022.878479", DORDI = "10.1016/j.sbspro.2011.04.372";
const retractions = (dois) => "https://api.openalex.org/works?filter=doi:" + dois.map(doi).join("|") + "&per-page=50&select=doi,is_retracted";

export const URLS = [
  // Step 5, "🔗 Connected papers" on "On the relationship between test anxiety and academic performance" (W2131323061): its referenced works, as the
  // recorded "exam anxiety" search lists them (OpenAlex no longer gives cited_by_api_url, so no second request is made).
  ["oa-connected-dordinejad", "https://api.openalex.org/works?filter=openalex_id:W24263745|W1938591297|W1967508604|W2035718657|W2070711012|W2130144748|W2132913832|W2139908002&per-page=8&select=display_name,authorships,publication_year"],
  // Fix wave A (W12): the same paper's "cited by" list, as core's oaConnected asks for it now that OpenAlex gives no cited_by_api_url.
  ["oa-citedby-dordinejad", "https://api.openalex.org/works?filter=cites:W2131323061&per-page=8&select=display_name,authorships,publication_year"],
  // Step 6, the Citation Manager's quiet refresh as it opens: the two sources whose retraction status is not known yet (the search's two are seeded).
  ["oa-retractions-quiet", retractions([RYAN, COHEN])],
  // Step 11, "🛡 Check for retractions": every DOI of the library.
  ["oa-retractions-forced", retractions([RYAN, COHEN, MU, DORDI])],
  // Step 11, "🔎 Check that sources exist (Crossref)": the two sources from the search (Ryan and Cohen are in the core corpus).
  ["cr-doi-mu", "https://api.crossref.org/works/" + encodeURIComponent(MU)],
  ["cr-doi-dordinejad", "https://api.crossref.org/works/" + encodeURIComponent(DORDI)]
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (url) => createHash("sha256").update(url).digest("hex").slice(0, 8);

async function main() {
  const argv = process.argv.slice(2);
  const onlyAt = argv.indexOf("--only");
  const only = onlyAt < 0 ? null : new Set((argv[onlyAt + 1] || "").split(",").filter(Boolean));
  if (only) {
    if (!only.size) throw new Error("--only needs a comma-separated list of case names");
    for (const n of only) if (!URLS.some(([name]) => name === n)) throw new Error(`--only: unknown case "${n}"; the cases are ${URLS.map(([name]) => name).join(", ")}`);
  } else for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json"))) unlinkSync(DIR + f);
  for (const [name, url] of URLS) {
    if (only && !only.has(name)) continue;
    await sleep(250);
    const r = await fetch(url);
    const body = await r.text();
    if (r.status !== 200) throw new Error(name + ": HTTP " + r.status);
    const file = `${name}-${short(url)}.json`;
    if (only && existsSync(DIR + file)) throw new Error(`--only: ${file} already exists and is not overwritten`);
    writeFileSync(DIR + file, JSON.stringify({ url, status: r.status, headers: { "content-type": r.headers.get("content-type") }, body }, null, 1) + "\n");
    console.log("recorded", name, r.status, body.length);
  }
}
await main();
