import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { BrowserContext, Route } from "@playwright/test";
import { dictUrl } from "@appuscholar/core";
import type { ConsoleAllowance } from "./watcher";

/**
 * The outside services the app asks from the browser (OpenAlex, PubMed's E-utilities, Crossref and dictionaryapi.dev: apps/web/proxy.ts lists them in the CSP), answered from
 * recordings, and every other address outside this machine refused (spec section 6). Nothing here goes to a real service unless `allowLive` says so.
 *
 * The recordings are the ones the stage-2 journey uses (e2e/stage2-idea-literature.spec.ts): the files in `apps/web/e2e/fixtures/recorded/` (written by its capture.mjs, one
 * `{ url, status, headers, body }` per request) and the core fetchers' corpus in `packages/core/test/fetch/recorded`, matched by the exact address; and for the dictionary
 * the payloads the Words golden was captured with (`packages/core/test/golden/words/cases.json`, dict.fetch), matched by the address the app builds for the word (core's dictUrl).
 *
 * What a case needs to know:
 *  - `qa.allow({ hosts: SERVICE_HOSTS })` for the services it uses: the watcher's host rule counts any request outside this machine as an Error unless the case allows it.
 *  - A request no recording fits is answered 599 (readable by the page, so the app shows it as the failure it is) and listed in `refused`: a case checks it is empty, as the
 *    e2e specs' `quiet()` does. The watcher does not look at a 599 from another address.
 *  - A service named in `fail` is down the way dictionaryapi.dev was on 2026-10-23 (docs/walkthroughs/notes/2026-10-23-tools-walk.md, row 4): Cloudflare answered 530 without
 *    the CORS headers, so the browser dropped the request and the page's fetch rejected, status 0. That is reproduced by dropping the connection. The browser prints one console
 *    error for it, which the case allows with `qa.allow({ consoleErrors: [SERVICE_DOWN_CONSOLE] })`.
 *  - It never answers the web app, the api (QA_API_ORIGIN) or anything else on this machine: only addresses outside localhost, 127.0.0.1 and [::1] are routed.
 *  - A case calls it once for each context it uses. A second call on the same context adds a router that takes over from the first (Playwright runs the latest route first).
 *  - A service answering 404 for an unknown word or paper is the service's own answer, and the watcher counts a 4xx from anywhere: the case allows it by method, path and status
 *    (`qa.allow({ responses })`), as for the dictionary's "zzyzx".
 */
export type Service = "openalex" | "pubmed" | "crossref" | "dictionary";
export type RouteServicesOptions = { fail?: Service[]; allowLive?: boolean };

const SERVICE_OF = new Map<string, Service>([
  ["api.openalex.org", "openalex"],
  ["eutils.ncbi.nlm.nih.gov", "pubmed"],
  ["api.crossref.org", "crossref"],
  ["api.dictionaryapi.dev", "dictionary"]
]);
/** The hosts of the four services, for `qa.allow({ hosts: SERVICE_HOSTS })`. */
export const SERVICE_HOSTS: string[] = [...SERVICE_OF.keys()];

/** The console error the browser prints for a request that failed on the way (a service in `fail`): for `qa.allow({ consoleErrors: [SERVICE_DOWN_CONSOLE] })`. */
export const SERVICE_DOWN_CONSOLE: ConsoleAllowance = {
  match: /^Failed to load resource: net::ERR_CONNECTION_FAILED/,
  reason: "a service the case made fail on purpose (routeServices fail): the browser drops the request and prints this"
};

type Recording = { url: string; status: number; headers: Record<string, string>; body: string };

const WEB_DIR = path.resolve(__dirname, "..", "..");
const E2E_RECORDED = path.join(WEB_DIR, "e2e", "fixtures", "recorded");
const CORE_RECORDED = path.resolve(WEB_DIR, "..", "..", "packages", "core", "test", "fetch", "recorded");
const WORDS_GOLDEN = path.resolve(WEB_DIR, "..", "..", "packages", "core", "test", "golden", "words", "cases.json");
/** The corpus folder also holds a manifest of what was captured: not a recording. */
const NOT_RECORDINGS = new Set(["v2-manifest.json"]);

let recordings: Map<string, Recording> | undefined;

function readRecordings(dir: string, into: Map<string, Recording>): void {
  if (!existsSync(dir)) return;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json") && !NOT_RECORDINGS.has(f)).sort()) {
    const r = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as Partial<Recording>;
    if (typeof r.url !== "string" || typeof r.status !== "number" || typeof r.body !== "string") {
      throw new Error(`QA services: ${path.join(dir, file)} is not a recording ({ url, status, headers, body }), which capture.mjs writes.`);
    }
    into.set(r.url, { url: r.url, status: r.status, headers: r.headers ?? {}, body: r.body });
  }
}

/** Every recording by address: the core corpus first, then this app's own (which wins where both have the address), then the dictionary's. Read once per worker. */
function loadRecordings(): Map<string, Recording> {
  if (recordings) return recordings;
  const out = new Map<string, Recording>();
  // A router with nothing to answer from would refuse everything and every case would look broken at once: say it here.
  if (!existsSync(E2E_RECORDED)) throw new Error(`QA services: the recordings folder is missing (${E2E_RECORDED}).`);
  readRecordings(CORE_RECORDED, out);
  readRecordings(E2E_RECORDED, out);
  if (out.size === 0) throw new Error(`QA services: no recordings were found in ${E2E_RECORDED} or ${CORE_RECORDED}.`);
  const golden = (JSON.parse(readFileSync(WORDS_GOLDEN, "utf8")) as { dict: { fetch: Array<{ word: string; status: number; payload: unknown }> } }).dict.fetch;
  for (const c of golden) {
    const url = dictUrl(c.word);
    out.set(url, { url, status: c.status, headers: { "content-type": "application/json" }, body: JSON.stringify(c.payload) });
  }
  return (recordings = out);
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
/** A request to route: http(s), and not to this machine. */
const isOutside = (url: URL): boolean => (url.protocol === "http:" || url.protocol === "https:") && !LOCAL_HOSTS.has(url.hostname);

const CORS = { "access-control-allow-origin": "*" };
const PREFLIGHT = { ...CORS, "access-control-allow-headers": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-max-age": "600" };

/**
 * Routes the outside services on `context`. Returns two lists that grow as the case runs, oldest first, as the addresses are written:
 *  - `asked`: every request to an address outside this machine that the page made (a preflight is the browser's own and is not one), whether it was answered, failed on
 *    purpose, refused or sent on live. A case that expects no search says `expect(asked).toEqual([])`.
 *  - `refused`: the ones answered 599 because no recording fits.
 * `fail`: services that are down (see above). `allowLive`: the four services go to the real ones (the live-services check), the rest is still refused; a service in `fail` still fails.
 */
export async function routeServices(context: BrowserContext, o: RouteServicesOptions = {}): Promise<{ asked: string[]; refused: string[] }> {
  const all = loadRecordings();
  const down = new Set<Service>(o.fail ?? []);
  const asked: string[] = [];
  const refused: string[] = [];

  await context.route(isOutside, async (route: Route) => {
    const request = route.request();
    const url = request.url();
    const service = SERVICE_OF.get(new URL(url).hostname);
    if (request.method() === "OPTIONS" && service) return void (await route.fulfill({ status: 204, headers: PREFLIGHT }));
    asked.push(url);
    if (service && down.has(service)) return void (await route.abort("connectionfailed"));
    if (service && o.allowLive) return void (await route.fallback());
    const recording = service ? all.get(url) : undefined;
    if (recording) {
      const type = recording.headers["content-type"];
      return void (await route.fulfill({ status: recording.status, headers: { ...CORS, ...(type ? { "content-type": type } : {}) }, body: recording.body }));
    }
    refused.push(url);
    // The page can read a refused service (so the app shows its error); another address gets no CORS headers and the page's request fails.
    await route.fulfill({ status: 599, headers: service ? CORS : {}, body: "not recorded" });
  });
  return { asked, refused };
}
