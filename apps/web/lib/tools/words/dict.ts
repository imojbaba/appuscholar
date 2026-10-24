import { dictCachePut, dictNorm, dictParse, dictUrl, type DictEntry } from "@appuscholar/core";

/*
 * Words and grammar's dictionary (v1 dictFetch 6574-6598): the word is looked up at dictionaryapi.dev straight from the browser, as v1 did (the host is in the
 * CSP's connect-src, apps/web/proxy.ts). The cache is v1's 200 words, kept in this page's memory only (register row D-S2-90): never in a blob, never on disk.
 * core's dictParse reads the answer and dictCachePut keeps the 200 newest; what is written here is only the fetch and the memory.
 */

let cache: Record<string, DictEntry> = {};
/** Empties the memory cache (a test starts clean). */
export function resetDictCache(): void { cache = {}; }
/** How many words the memory cache holds. */
export function dictCacheSize(): number { return Object.keys(cache).length; }

/** What a lookup came to. `offline`: the request itself failed (no internet, or the host is blocked). `service`: the service answered with an error status. */
export type Lookup =
  | { kind: "found"; entry: DictEntry; cached: boolean }
  | { kind: "notfound" }
  | { kind: "service"; status: number }
  | { kind: "offline" };

/** v1 dictNorm for what the student typed or selected: one lower-case word of letters, apostrophes and hyphens, 40 characters at most. */
export const normWord = (w: unknown): string => dictNorm(w);

/** v1 dictFetch: the cache first (a word looked up before works offline), then the service. A word with no entry is "notfound" and is not cached. */
export async function lookupWord(w: string, fetchFn: typeof fetch = (...a) => fetch(...a)): Promise<Lookup> {
  const hit = cache[w];
  if (hit) return { kind: "found", entry: hit, cached: true };
  let r: Response;
  try { r = await fetchFn(dictUrl(w)); } catch { return { kind: "offline" }; }
  if (r.status === 404) return { kind: "notfound" };
  if (!r.ok) return { kind: "service", status: r.status };
  let j: unknown;
  try { j = await r.json(); } catch { return { kind: "service", status: r.status }; }
  const out = dictParse(w, j);
  if ("notfound" in out) return { kind: "notfound" };
  cache = dictCachePut(cache, w, out) as Record<string, DictEntry>;
  return { kind: "found", entry: out, cached: false };
}
