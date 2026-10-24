import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { vi } from "vitest";
import { rsBuildQueryV2 } from "@appuscholar/core";

/*
 * The fetch double of the Find tab's tests (wave B Task 18; wave A LATER T10). It answers a request from core's recorded responses
 * (packages/core/test/fetch/recorded) or from a stand-in the test names, and nothing else: a URL that has neither is refused (the page sees a failed
 * fetch, as offline) and remembered, and `assertAllRecorded` fails the test that sent it. So a panel that asks for a URL nobody recorded can no longer
 * pass because the page quietly swallowed the failure.
 */

export type Rec = { url: string; status: number; headers: Record<string, string | null>; body: string };
const CORE_TEST = join(__dirname, "../../../../packages/core/test");

/** Core's recorded responses, by URL. */
export const RECS = new Map<string, Rec>(readdirSync(join(CORE_TEST, "fetch/recorded")).filter((f) => f.endsWith(".json") && f !== "v2-manifest.json").map((f) => {
  const r = JSON.parse(readFileSync(join(CORE_TEST, "fetch/recorded", f), "utf8")) as Rec;
  return [r.url, r];
}));

/** An answer the test makes up for a URL that has no recording, named in the test that needs it. */
export type StandIn = { match(url: string): boolean; respond(url: string, init?: RequestInit): Response | Promise<Response> };

export function recordedFetch() {
  const requested: string[] = [];
  let unrecorded: string[] = [];
  let standIns: StandIn[] = [];
  const f = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requested.push(url);
    const r = RECS.get(url);
    if (r) return new Response(r.body, { status: r.status, headers: r.headers["content-type"] ? { "content-type": r.headers["content-type"] } : {} });
    const s = standIns.find((x) => x.match(url));
    if (s) return s.respond(url, init);
    unrecorded.push(url);
    throw new TypeError("Failed to fetch");
  });
  return {
    fetch: f,
    /** Every URL asked for, in order. */
    requested,
    /** The stand-ins of the test now running (cleared by `reset`); the newest answers first. */
    standIn(...s: StandIn[]): void { standIns = [...s, ...standIns]; },
    /** The URLs asked for that have no recording and no stand-in. */
    unrecorded: () => [...unrecorded],
    /** Forgets the unrecorded URLs (a test that asked for one on purpose, and has checked it). */
    forget(): void { unrecorded = []; },
    reset(): void { requested.length = 0; unrecorded = []; standIns = []; f.mockClear(); }
  };
}
export type RecordedFetch = ReturnType<typeof recordedFetch>;

/** Throws when a request had no recording: call it after every test. */
export function assertAllRecorded(rf: RecordedFetch): void {
  const u = rf.unrecorded();
  if (u.length) throw new Error("these requests have no recording or stand-in:\n" + u.join("\n"));
}

/**
 * PubMed's tagged search (W12) for exactly the search `c` makes answers that it found nothing, so pmSearchV2 runs v1's query, which is recorded. The URL is built from core's
 * rsBuildQueryV2, so a panel that sends any other tagged search is not answered: it is unrecorded and fails the test.
 */
export const taggedEsearchFoundNothing = (c: { topic: string; terms: string[]; design: string; rank: boolean }): StandIn => {
  const url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=" + (c.rank ? 15 : 6) + "&term=" + encodeURIComponent(rsBuildQueryV2(c.topic, "pm", c.terms, c.design));
  return {
    match: (u) => u === url,
    respond: () => new Response('{"esearchresult":{"idlist":[]}}', { status: 200, headers: { "content-type": "application/json; charset=UTF-8" } })
  };
};

/** Crossref, asked for exactly this DOI (a kept OpenAlex paper's volume, issue and pages), does not have the paper. */
export const crossrefNotFound = (doi: string): StandIn => ({
  match: (u) => u === "https://api.crossref.org/works/" + encodeURIComponent(doi),
  respond: () => new Response("", { status: 404 })
});
