import { createHash } from "node:crypto";
import { loadRecordings } from "../golden/fetch/capture";
import type { Recording } from "../golden/fetch/capture";
import { readFixture } from "../golden/harness/fixture";
import { goldenMode } from "../golden/harness/compare";
import type { CitationEntry } from "../../src/citation";

/**
 * The recorded responses (recorded/*.json, written live once by recorded/capture.mjs) served to our fetchers, and v1's parse of the same bodies
 * (test/golden/fetch/cases.json, `golden:capture fetch`, which replays the same files to v1 running). A URL is matched exactly, as the golden capture's
 * replayer matches it; a URL with no recording rejects and is noted in `unknown`, so a test sees a URL our builders make differently from v1's.
 */
export const RECORDINGS = loadRecordings();

export type Replay = { f: typeof fetch; requested: string[]; unknown: string[] };

/** A fetch that answers from the recordings; a URL in `throwFor` throws TypeError("Failed to fetch"), as a browser's fetch does offline. */
export function replay(throwFor: string[] = []): Replay {
  const r: Replay = { requested: [], unknown: [], f: undefined as unknown as typeof fetch };
  r.f = (async (input: RequestInfo | URL) => {
    const url = String(input);
    r.requested.push(url);
    if (throwFor.includes(url)) throw new TypeError("Failed to fetch");
    const rec: Recording | undefined = RECORDINGS.get(url);
    if (!rec) {
      r.unknown.push(url);
      throw new Error("no recording for " + url);
    }
    const headers: Record<string, string> = rec.headers["content-type"] ? { "content-type": rec.headers["content-type"] } : {};
    return new Response(rec.body, { status: rec.status, headers });
  }) as typeof fetch;
  return r;
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

type Paper = Record<string, unknown> & { title: string };
export type SearchCase = {
  name: string;
  in: { topic: string; oa: boolean; pm: boolean; design: string; rank: boolean; terms: string[]; throwFor: string[] };
  requested: string[];
  oa: Array<Paper[] | null>;
  pm: Array<Paper[] | null>;
  merged: Paper[];
  status: string;
};
export type Card = { title: string; meta: string };
export type Fx = {
  recorded: Array<{ file: string; url: string; status: number; sha256: string }>;
  searches: SearchCase[];
  connected: Array<{ in: { oaId: string; title: string; referencedWorks: string[]; citedByApiUrl: string }; requested: string[]; cites: { heading: string; cards: Card[] }; citedBy: { heading: string; cards: Card[] } }>;
  retractions: { dois: string[]; batch: { requested: string[]; out: Record<string, boolean> }; refresh: { library: Array<{ doi: string }>; requested: string[]; cache: Record<string, { r: boolean }> } };
  refcheck: { dois: string[]; requested: string[]; refs: Record<string, unknown> };
  rc: { throwFor: string[]; requested: string[]; entries: Array<{ entry: CitationEntry; key: string; out: Record<string, unknown> }> };
  lookups: Array<{ input: string; throwFor: string[]; requested: string[]; toast: string; toastKey: string; form: Record<string, string> }>;
  pmids: Array<{ pmid: string; requested: string[]; out: string }>;
};

export const fx = readFixture<Fx>("fetch", "cases");
export const mode = goldenMode(fx);

/** The fields wave A added to a search result (W2: every author, the volume, the issue and the pages), which v1's parse does not have. */
export const V2_PAPER_KEYS = ["authorList", "volume", "issue", "pages"] as const;
/** A paper (or a list of them) as v1 built it: without V2_PAPER_KEYS. The golden comparisons hold this view to v1's parse, so the added fields cannot hide a change in v1's. */
export function v1View<T>(x: T): T {
  if (Array.isArray(x)) return x.map((p) => v1View(p)) as T;
  if (x === null || typeof x !== "object") return x;
  const o = { ...(x as Record<string, unknown>) };
  for (const k of V2_PAPER_KEYS) delete o[k];
  return o as T;
}
