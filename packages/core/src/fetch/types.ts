/* Shared shapes of the network fetchers (openalex.ts, pubmed.ts, crossref.ts), ported from v1's Research tool (index.html 8025-8120, 8492-8520), its
   Citation Manager (7556-7600, 7723-7797, 7907-7961) and Analyse a paper (11236-11253). Every fetcher takes the page's fetch as its first argument, `f`, and
   uses no global fetch and no DOM, so a test hands it a replay of recorded responses. */
import type { RsPaper } from "../research";

/** One OpenAlex search result as rsFetchOpenAlex (8061-8086) builds it, with wave A's `authorList` (W2). */
export type OaPaper = RsPaper & { source: "OpenAlex"; oaId: string; title: string; authors: string; year: string; venue: string; abstract: string; citationCount: number; doi: string; url: string; referencedWorks: string[]; citedByApiUrl: string; retracted: boolean; oaStatus: string; oaUrl: string; authorList: string[] };
/** One PubMed search result as rsFetchPubmed (8103-8120) builds it, with wave A's `authorList`, `volume`, `issue` and `pages` (W2). */
export type PmPaper = RsPaper & { source: "PubMed"; ssId: null; title: string; authors: string; year: string; venue: string; abstract: string; pmid: string; citationCount: number; doi: string; url: string; authorList: string[]; volume: string; issue: string; pages: string };
/** A connected paper as rsOaBrief (8492-8497) builds it. */
export type RsBrief = { title: string; authors: string; year: string };
/**
 * What a search hands back in place of v1's list or throw (researchSearch 8306-8310): the papers, and when the source failed `error`, which is "429" for
 * OpenAlex's HTTP 429 (v1's oaHttpError sentence, 8032, is the panel's to show) and otherwise the thrown message, or "unknown error" when it had none.
 * `fellBack` is set when the query with the related terms failed and the topic alone was searched (withFallback 8297-8303). A search never rejects.
 */
export type SearchResult<P> = { papers: P[]; error?: string; fellBack?: true };

/** The pause between calls: rcRun waits 200 ms after each lookup (7785). Callers await it between calls. */
export function pace(ms = 200): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** researchSearch's withFallback (8297-8303): the query with the related terms, and on a failure that is not OpenAlex's spent budget (v1 tests its
 * sentence with /budget/; here the error "429"), the query without them. */
export async function withFallback<T>(fn: (s: string) => Promise<T>, build: (terms: string[]) => string, terms: string[], fellBack: { v: boolean }): Promise<T> {
  try{return await fn(build(terms))}
  catch(e){
    if(terms.length&&!(e&&(e as Error).message==='429')){fellBack.v=true;return await fn(build([]))}
    throw e;
  }
}

/** researchSearch's catch (8306-8307), `(e&&e.message)||'unknown error'`, and the result the panel reads. */
export async function settle<P>(job: (fellBack: { v: boolean }) => Promise<P[]>): Promise<SearchResult<P>> {
  const fellBack = { v: false };
  let out: SearchResult<P>;
  try{out={papers:await job(fellBack)}}
  catch(e){out={papers:[],error:((e as Error | null)&&(e as Error).message)||'unknown error'}}
  if(fellBack.v)out.fellBack=true;
  return out;
}
