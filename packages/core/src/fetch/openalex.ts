/* v1's OpenAlex calls (index.html build 2026.10.13a): oaUrl 8030 and oaHttpError 8032; rsFetchOpenAlex 8061-8086 and the OpenAlex job of researchSearch
   8297-8310 (withFallback and the catch, types.ts), here oaSearch; rsOaBrief 8492-8497 and the two requests of rsConnected 8502-8513, here oaConnected;
   retrFetchBatch 7571-7578 and the batch loop of citRetractionRefresh 7579-7597, here oaRetractions; and the batch loop of apRefCheck 11241-11251.
   The code is v1's, with the parsing, the URLs (the select lists, per-page, the filters joined by `|`) and the order kept. What differs:
   - `f` (the page's fetch) is the first argument of each function, in place of the global fetch;
   - oaUrl(u, key): v1 reads the key from localStorage (oaKey 8029); here the caller hands it (register D-S2-4);
   - oaHttpError's 429 is Error('429'), not v1's sentence, which the panel shows; withFallback tests it in place of /budget/ (register D-S2-6);
   - rsFetchOpenAlex takes the key; oaSearch builds the query with rsBuildQuery and the filter from RS_DESIGN, as researchSearch does (8292, 8305);
   - oaConnected returns the two lists rsConnected renders, `cites` and `citedBy`; rsConnected's outer catch (8519) only guards its rendering;
   - oaRetractions(f, dois): the DOIs are normalised, kept when valid and de-duplicated as citRetractionRefresh does with the library's (7581), and
     each batch's answer is handed to `onBatch` where v1 writes it to the cache (7592); a failing batch rejects (v1 then toasts retr_failed);
   - apRefCheck(f, dois) returns AP.refs as apRefCheck leaves it (11240-11252), given apRefDois' list; the 429 error is "429" here too;
   - types, and `as` casts on the JSON read. */
import { retrNormDoi, retrValidDoi } from "../analyse";
import { RS_DESIGN, rsBuildQuery, rsOaStatus, rsReconstructAbstract } from "../research";
import { settle, withFallback } from "./types";
import type { OaPaper, RsBrief, SearchResult } from "./types";

type OaAuthorship = { author?: { display_name?: string } | null };
type OaWork = { id?: string; display_name?: string; authorships?: OaAuthorship[]; publication_year?: number | null; primary_location?: { source?: { display_name?: string } | null } | null; abstract_inverted_index?: Record<string, number[]> | null; cited_by_count?: number; doi?: string | null; referenced_works?: string[]; cited_by_api_url?: string; open_access?: { is_oa?: boolean; oa_status?: string; oa_url?: string | null } | null; is_retracted?: boolean };
type OaList = { results?: OaWork[] };

export function oaUrl(u: string,key?: string): string{const k=(key||'').trim();return k?u+(u.indexOf('?')>=0?'&':'?')+'api_key='+encodeURIComponent(k):u}
function oaHttpError(r: Response): Error{return r.status===429?new Error('429'):new Error('HTTP '+r.status)}

export async function rsFetchOpenAlex(f: typeof fetch,q: string,extra?: { filter?: string; per?: number },key?: string): Promise<OaPaper[]>{
  const url=oaUrl('https://api.openalex.org/works?search='+encodeURIComponent(q)+(extra&&extra.filter?'&filter='+extra.filter:'')+
    '&per-page='+((extra&&extra.per)||8)+'&select=id,display_name,authorships,publication_year,primary_location,abstract_inverted_index,cited_by_count,doi,referenced_works,cited_by_api_url,open_access,is_retracted',key);
  const r=await f(url);
  if(!r.ok)throw oaHttpError(r);
  const j=await r.json() as OaList;
  return(j.results||[]).map(w=>{
    const authors=(w.authorships||[]).map(a=>a.author&&a.author.display_name).filter(Boolean) as string[];
    const venue=(w.primary_location&&w.primary_location.source&&w.primary_location.source.display_name)||'';
    const doi=(w.doi||'').replace(/^https?:\/\/doi\.org\//i,'');
    return{
      source:'OpenAlex',oaId:(w.id||'').split('/').pop()!,
      title:w.display_name||'Untitled',
      authors:authors.length>4?authors.slice(0,4).join(', ')+', et al.':(authors.join(', ')||'Unknown authors'),
      year:String(w.publication_year||''),venue,
      abstract:rsReconstructAbstract(w.abstract_inverted_index),
      citationCount:w.cited_by_count||0,doi,
      url:w.doi||('https://openalex.org/'+(w.id||'').split('/').pop()),
      referencedWorks:(w.referenced_works||[]).slice(0,8),
      citedByApiUrl:w.cited_by_api_url||'',
      retracted:w.is_retracted===true,
      oaStatus:rsOaStatus(w.open_access),
      oaUrl:(w.open_access&&w.open_access.is_oa&&/^https?:\/\//i.test(w.open_access.oa_url||''))?w.open_access.oa_url!:''
    };
  });
}

/** researchSearch's OpenAlex job (8305): the topic with the ticked terms and the kind of study, `perPage` 25 when ranking, else 8. Never rejects. */
export function oaSearch(f: typeof fetch,o: { q: string; terms?: string[]; design?: string; perPage?: number; key?: string }): Promise<SearchResult<OaPaper>>{
  const terms=o.terms||[],design=o.design||'any',dd=RS_DESIGN[design]||{};
  return settle(fb=>withFallback(s=>rsFetchOpenAlex(f,s,{filter:dd.oaFilter||'',per:o.perPage||8},o.key),t=>rsBuildQuery(o.q,'oa',t,design),terms,fb));
}

export function rsOaBrief(w: OaWork): RsBrief{
  const authors=(w.authorships||[]).map(a=>a.author&&a.author.display_name).filter(Boolean) as string[];
  return{title:w.display_name||'Untitled',
    authors:authors.length>4?authors.slice(0,4).join(', ')+', et al.':(authors.join(', ')||'Unknown authors'),
    year:String(w.publication_year||'')};
}

/** rsConnected's two requests (8502-8513): what the paper cites (its first 8 referenced works) and what cites it (8). A failure is an empty list. */
export async function oaConnected(f: typeof fetch,p: { referencedWorks: string[]; citedByApiUrl: string; key?: string }): Promise<{ cites: RsBrief[]; citedBy: RsBrief[] }>{
  const jobs: Array<Promise<RsBrief[]>>=[];
  if(p.referencedWorks&&p.referencedWorks.length){
    const ids=p.referencedWorks.map(u=>u.split('/').pop()).join('|');
    jobs.push(f(oaUrl('https://api.openalex.org/works?filter=openalex_id:'+ids+
      '&per-page=8&select=display_name,authorships,publication_year',p.key))
      .then(r=>r.ok?r.json() as Promise<OaList>:{results:[]}).then(j=>(j.results||[]).map(rsOaBrief)).catch(()=>[]));
  }else jobs.push(Promise.resolve([]));
  if(p.citedByApiUrl){
    jobs.push(f(p.citedByApiUrl+'&per-page=8&select=display_name,authorships,publication_year')
      .then(r=>r.ok?r.json() as Promise<OaList>:{results:[]}).then(j=>(j.results||[]).map(rsOaBrief)).catch(()=>[]));
  }else jobs.push(Promise.resolve([]));
  const[refs,cits]=await Promise.all(jobs);
  return{cites:refs!,citedBy:cits!};
}

export async function retrFetchBatch(f: typeof fetch,dois: string[],key?: string): Promise<Record<string, boolean>>{
  const url=oaUrl('https://api.openalex.org/works?filter=doi:'+dois.map(d=>encodeURIComponent('https://doi.org/'+d)).join('|')+
    '&per-page=50&select=doi,is_retracted',key);
  const r=await f(url);
  if(!r.ok)throw new Error('HTTP '+r.status);
  const j=await r.json() as OaList;
  const out: Record<string, boolean>={};
  (j.results||[]).forEach(w=>{const d=retrNormDoi(w.doi as string);if(d)out[d]=(w.is_retracted===true)});
  return out;
}

/** citRetractionRefresh's lookups (7581, 7589-7593): every valid, normalised DOI once, in batches of 40, each `true` when OpenAlex flags it as retracted. */
export async function oaRetractions(f: typeof fetch,dois: string[],key?: string,onBatch?: (batch: Record<string, boolean>) => void): Promise<Record<string, boolean>>{
  const stale=Array.from(new Set(dois.map(d=>retrNormDoi(d)).filter(retrValidDoi)));
  const cache: Record<string, boolean>={};
  for(let i=0;i<stale.length;i+=40){
    const chunk=stale.slice(i,i+40);
    const res=await retrFetchBatch(f,chunk,key);
    const batch: Record<string, boolean>={};
    chunk.forEach(d=>{cache[d]=batch[d]=!!res[d]});
    if(onBatch)onBatch(batch);
  }
  return cache;
}

/** AP.refs as apRefCheck (11240-11252) leaves it: the DOIs flagged as retracted with their titles (160 characters), the DOIs OpenAlex knew, how many were checked, and `finished`, or `error`. */
export type ApRefs = { dois: string[]; flag: Record<string, string>; seen: Record<string, true>; done: number; finished?: true; error?: string };
export async function apRefCheck(f: typeof fetch,dois: string[],key?: string): Promise<ApRefs>{
  const refs: ApRefs={dois:dois,flag:{},seen:{},done:0};
  try{
    for(let i=0;i<dois.length;i+=40){
      const chunk=dois.slice(i,i+40);
      const r=await f(oaUrl('https://api.openalex.org/works?filter=doi:'+chunk.map(x=>encodeURIComponent('https://doi.org/'+x)).join('|')+'&per-page=50&select=doi,is_retracted,display_name',key));
      if(!r.ok)throw oaHttpError(r);
      const j=await r.json() as { results?: Array<OaWork> };
      (j.results||[]).forEach(w=>{const k=retrNormDoi(w.doi as string);if(k){refs.seen[k]=true;if(w.is_retracted===true)refs.flag[k]=String(w.display_name||'').slice(0,160)}});
      refs.done=Math.min(dois.length,i+40);
    }
    refs.finished=true;
  }catch(e){refs.error=((e as Error | null)&&(e as Error).message)||'the lookup failed'}
  return refs;
}
