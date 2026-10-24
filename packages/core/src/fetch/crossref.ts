/* v1's Crossref calls (index.html build 2026.10.13a): the source reality check, rcWords 7728, rcSim 7729-7734, rcCompare 7735-7749 and rcCheckOne
   7750-7771 (rcRun 7772-7790 calls it once per library entry, with a 200 ms pause, `pace` in types.ts); and the Citation Manager's lookup, citExtractDoi
   7907-7910, citExtractPmid 7911-7916 and citLookup 7931-7961 (with citPmidToDoi, pubmed.ts). The code is v1's, with the URLs, the 3 rows and the Jaccard
   threshold 0.6 of the title search, citLookup's 1 row and first hit, the field reads and the order kept. What differs:
   - `f` (the page's fetch) is the first argument of each function, in place of the global fetch;
   - citLookup(f, {doi, url, title}) takes the three form fields it reads (7933-7934) and returns `result`, the toast it would show (cite_lookup_<result>;
     'busy' is the panel's), and on 'ok' `entry`, the form fields it fills (7948-7960: title, author, year, month, day, container, source, editors, volume,
     issue, pages, doi, url and type, each a string as `set` writes it); citTypeChanged and citRender are the panel's;
   - crToEntry is citLookup's fill (7948-7960) on its own; crLookupDoi is its DOI request (null for a 404 or no message), crFirstByTitle its title
     request (rows=1, the first hit with no similarity test), and crLookupTitle rcCheckOne's title request (rows=3, the best rcSim, null under 0.6),
     returning the Crossref work beside its entry and score;
   - rcCompare(d, it) and rcCheckOne(f, d) return what rcRun stores per entry in appu_refcheck, `t` (Date.now()) included;
   - types, and `as` casts on the JSON read.
   Wave B2 (Task 19, "paste a link, DOI or PubMed number"; ruling B2-R36): crLookupDoiV2 is crLookupDoi with Crossref's article number as the pages when it lists no page. It sits
   beside the port and changes none of it. test/fetch/lookup-by-id.test.ts. */
import { citLastName, citNames } from "../citation";
import type { CitationEntry } from "../citation";
import { retrNormDoi, retrValidDoi } from "../analyse";
import { pmidToDoi } from "./pubmed";

type CrName = { family?: string; given?: string };
type CrDate = { "date-parts"?: Array<Array<number | null>> };
/** A Crossref work, as much of it as citLookup and rcCompare read. */
export type CrWork = { title?: string[]; author?: CrName[]; editor?: CrName[]; issued?: CrDate; "published-print"?: CrDate; "published-online"?: CrDate; type?: string; "container-title"?: string[]; publisher?: string; volume?: string; issue?: string; page?: string; DOI?: string };
/** What rcCheckOne returns and rcRun stores per entry: ok, diff (with the differences), nf (not found) or err, and when found what Crossref holds. */
export type RcCheck = {
  s: "ok" | "diff" | "nf" | "err";
  m?: Array<{ k: "title" | "year" | "author"; v: string }>;
  f?: { title: string; year: number | string; author: string; doi: string; authors?: string; volume?: string; issue?: string; pages?: string };
  viaTitle?: true;
  /** Fix wave A (W27, W28), rcCheckOneV2 only: the fields the saved source leaves empty that Crossref has. */
  miss?: Array<"author" | "volume" | "issue" | "pages">;
  t: number;
};

export function rcWords(x: unknown): string[]{return String(x||'').toLowerCase().replace(/<[^>]*>/g,' ').replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(w=>w.length>2)}
export function rcSim(a: unknown,b: unknown): number{
  const A=new Set(rcWords(a)),B=new Set(rcWords(b));
  if(!A.size||!B.size)return 0;
  let n=0;A.forEach(w=>{if(B.has(w))n++});
  return n/(A.size+B.size-n);
}
export function rcCompare(d: CitationEntry,it: CrWork): { msgs: NonNullable<RcCheck["m"]>; found: NonNullable<RcCheck["f"]> }{
  const msgs: NonNullable<RcCheck["m"]>=[];
  const ct=(it.title||[''])[0]||'';
  const dp=((it.issued||it['published-print']||it['published-online']||{})['date-parts']||[[]])[0]||[];
  const cy=dp[0]||'';
  const ca=((it.author||[])[0]||{}).family||'';
  const ty=String(d.year||'').trim();
  if(ct&&rcSim(d.title,ct)<0.75)msgs.push({k:'title',v:ct});
  if(cy&&/^\d{4}$/.test(ty)&&Math.abs(+ty-(cy as number))>1)msgs.push({k:'year',v:String(cy)});
  const ln=citLastName(d.author);
  if(ca&&ln&&ln!=='Author'&&!citNames(d.author)[0]!.org&&ca.toLowerCase()!==ln.toLowerCase())msgs.push({k:'author',v:ca});
  return{msgs:msgs,found:{title:ct,year:cy,author:ca,doi:it.DOI||''}};
}

/** Crossref's work for a DOI (the request of rcCheckOne 7754 and citLookup 7944): null for a 404; rejects on another HTTP error. */
async function crWork(f: typeof fetch,doi: string): Promise<CrWork | null | undefined>{
  const r=await f('https://api.crossref.org/works/'+encodeURIComponent(doi));
  if(r.status===404)return null;
  if(!r.ok)throw new Error('HTTP '+r.status);
  return (await r.json() as { message?: CrWork }).message;
}
/** rcCheckOne's title search (7761-7766): 3 rows for the title and the first author's surname, the best rcSim with the saved title; null under 0.6. */
export async function crLookupTitle(f: typeof fetch,title: string,surname: string): Promise<{ entry: CitationEntry; work: CrWork; score: number } | null>{
  const q=(title||'')+' '+surname;
  const r=await f('https://api.crossref.org/works?rows=3&query.bibliographic='+encodeURIComponent(q.slice(0,300)));
  if(!r.ok)throw new Error('HTTP '+r.status);
  const items=((await r.json() as { message?: { items?: CrWork[] } }).message||{}).items||[];
  let best: CrWork | null=null,bs=0;
  items.forEach(it=>{const sc=rcSim(title,(it.title||[''])[0]);if(sc>bs){bs=sc;best=it}});
  if(!best||bs<0.6)return null;
  return{entry:crToEntry(best),work:best,score:bs};
}

export async function rcCheckOne(f: typeof fetch,d: CitationEntry): Promise<RcCheck>{
  const doi=retrNormDoi(d.doi as string);
  try{
    if(retrValidDoi(doi)){
      const it=await crWork(f,doi);
      if(it===null)return{s:'nf',t:Date.now()};
      const c=rcCompare(d,it as CrWork);
      return{s:c.msgs.length?'diff':'ok',m:c.msgs,f:c.found,t:Date.now()};
    }
    const hit=await crLookupTitle(f,d.title||'',citLastName(d.author));
    if(!hit)return{s:'nf',t:Date.now()};
    const c=rcCompare(d,hit.work);
    return{s:c.msgs.length?'diff':'ok',m:c.msgs,f:c.found,viaTitle:true,t:Date.now()};
  }catch{return{s:'err',t:Date.now()}}
}

/**
 * Fix wave A (walk faults W27, W28; register row D-S2-33): rcCheckOne's lookup and rcCompare, then two things v1 does not look at. An entry with no author is no
 * longer a full match when Crossref lists authors (v1 compares nothing when the saved author is empty, so an authorless capture came back "ok"): `m` gains
 * { k: "author", v: <the first family name> }, the message v1 already words for an author that differs. `miss` lists the fields among author, volume, issue and pages
 * that are empty in `d` and present in Crossref, and `f` then also carries Crossref's `authors` (all of them, as the library writes them), `volume`, `issue` and
 * `pages` for the fill. `s` is "diff" when `m` or `miss` is not empty. When nothing is missing the result is rcCheckOne's, key for key.
 */
export async function rcCheckOneV2(f: typeof fetch,d: CitationEntry): Promise<RcCheck>{
  const doi=retrNormDoi(d.doi as string);
  try{
    let it: CrWork | null | undefined,viaTitle=false;
    if(retrValidDoi(doi)){
      it=await crWork(f,doi);
      if(it===null)return{s:'nf',t:Date.now()};
    }else{
      const hit=await crLookupTitle(f,d.title||'',citLastName(d.author));
      if(!hit)return{s:'nf',t:Date.now()};
      it=hit.work;viaTitle=true;
    }
    const c=rcCompare(d,it as CrWork);
    const e=crToEntry(it as CrWork);
    const empty=(k: keyof CitationEntry)=>!String(d[k]||'').trim();
    const miss: NonNullable<RcCheck["miss"]>=[];
    for(const k of ['author','volume','issue','pages'] as const)if(empty(k)&&String(e[k]||'').trim())miss.push(k);
    if(miss.includes('author')){const fam=(((it as CrWork).author||[]).find(a=>a.family)||{}).family||'';if(fam)c.msgs.push({k:'author',v:fam})}
    const found: NonNullable<RcCheck["f"]>={...c.found};
    if(miss.length){
      if(miss.includes('author'))found.authors=e.author as string;
      for(const k of ['volume','issue','pages'] as const)if(miss.includes(k))found[k]=e[k] as string;
    }
    const out: RcCheck={s:c.msgs.length||miss.length?'diff':'ok',m:c.msgs,f:found,t:0};
    if(viaTitle)out.viaTitle=true;
    if(miss.length)out.miss=miss;
    out.t=Date.now();
    return out;
  }catch{return{s:'err',t:Date.now()}}
}
/**
 * What "Fill from Crossref" writes into `d` (W27, W28): for each field in `c.miss`, Crossref's value, and only where `d`'s own field is empty now (a field the student
 * wrote since the check is never replaced). null when there is nothing to write.
 */
export function rcFillPatch(d: CitationEntry,c: RcCheck): Partial<CitationEntry> | null{
  const patch: Partial<CitationEntry>={};
  const fnd=c.f;
  if(!fnd)return null;
  for(const k of c.miss||[]){
    const v=k==='author'?fnd.authors:fnd[k];
    if(v&&!String(d[k]||'').trim())patch[k]=v;
  }
  return Object.keys(patch).length?patch:null;
}

export function citExtractDoi(txt: unknown): string{
  const m=String(txt||'').match(/10\.\d{4,9}\/[^\s"<>]+/);
  return m?m[0].replace(/[.,;:)\]]+$/,'').toLowerCase():'';
}
export function citExtractPmid(txt: unknown): string{
  txt=String(txt||'');
  const m=(txt as string).match(/PMID:?\s*(\d{4,9})/i)||(txt as string).match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d{4,9})/i)||(txt as string).match(/ncbi\.nlm\.nih\.gov\/pubmed\/(\d{4,9})/i);
  if(m)return m[1]!;
  return /^\s*\d{6,9}\s*$/.test(txt as string)?(txt as string).trim():'';
}

/** citLookup's fill of the form from a Crossref work (7948-7960), as the strings `set` writes (v==null?'':String(v)). */
export function crToEntry(it: CrWork): CitationEntry{
  const e: CitationEntry={};
  const set=(k: keyof CitationEntry,v: unknown)=>{e[k]=v==null?'':String(v)};
  set('title',(it.title||[''])[0]);
  set('author',(it.author||[]).map(a=>(a.family||'')+(a.given?', '+a.given:'')).join('; '));
  const dp=((it.issued||{})['date-parts']||[[]])[0]||[];
  set('year',dp[0]||'');set('month',dp[1]||'');set('day',dp[2]||'');
  const ctype=String(it.type||'');
  const isCh=(ctype==='book-chapter'||ctype==='book-section'||ctype==='reference-entry'),isConf=(ctype==='proceedings-article'),isRep=(ctype==='report'),isThesis=(ctype==='dissertation'),isBook=(ctype==='book'||ctype==='monograph'||ctype==='edited-book');
  if(isCh||isConf){set('container',(it['container-title']||[''])[0]);set('source',it.publisher||'')}
  else if(isBook||isRep||isThesis){set('source',it.publisher||(it['container-title']||[''])[0]||'');set('container','')}
  else{set('source',(it['container-title']||[''])[0]);set('container','')}
  set('editors',(it.editor||[]).map(a=>(a.family||'')+(a.given?', '+a.given:'')).join('; '));
  set('volume',it.volume);set('issue',it.issue);set('pages',it.page);set('doi',it.DOI);
  set('url','');
  e.type=isCh?'Book chapter':isConf?'Conference paper':isRep?'Report':isThesis?'Thesis':isBook?'Book':'Journal article';
  return e;
}
/** citLookup's DOI request (7944-7947): the entry it fills, null when Crossref has no such DOI (404) or no message; rejects on another HTTP error. */
export async function crLookupDoi(f: typeof fetch,doi: string): Promise<CitationEntry | null>{
  const it=await crWork(f,doi);
  return it?crToEntry(it):null;
}
/**
 * crLookupDoi, with one difference (Task 19): when Crossref lists no `page` but an `article-number` (Scientific Reports' 13317, PLOS ONE's e0123), the entry's `pages` is that number,
 * as the same paper's OpenAlex `biblio` and PubMed's `pages` give it. v1's fill (crToEntry) reads `page` only and leaves `pages` empty. A work with a `page` is crLookupDoi's, key for key.
 */
export async function crLookupDoiV2(f: typeof fetch,doi: string): Promise<CitationEntry | null>{
  const it=await crWork(f,doi) as (CrWork & { "article-number"?: string }) | null | undefined;
  if(!it)return null;
  const e=crToEntry(it);
  if(!e.pages&&it['article-number'])e.pages=String(it['article-number']);
  return e;
}
/** citLookup's title request (7944-7947): rows=1, Crossref's first hit with no similarity test; null when there is none (or a 404, as citLookup reads
 * either request). Rejects on another HTTP error. */
export async function crFirstByTitle(f: typeof fetch,query: string): Promise<CitationEntry | null>{
  const r=await f('https://api.crossref.org/works?rows=1&query.bibliographic='+encodeURIComponent(query.slice(0,300)));
  if(r.status===404)return null;
  if(!r.ok)throw new Error('HTTP '+r.status);
  const j=await r.json() as { message?: { items?: CrWork[] } };
  const it=((j.message&&j.message.items)||[])[0];
  return it?crToEntry(it):null;
}

/** citLookup (7931-7961): reads a DOI, a doi.org or PubMed link, a PubMed ID, a pasted full reference, or a title, from the DOI, link and title fields. */
export async function citLookup(f: typeof fetch,form: { doi?: string; url?: string; title?: string }): Promise<{ result: "ok" | "nf" | "nopmid" | "fail" | "empty"; entry?: CitationEntry }>{
  const val=(x: string | undefined)=>String(x||'').trim();
  const raw=[val(form.doi),val(form.url),val(form.title)];
  let doi='',pmid='',query='';
  for(const x of raw){if(!doi){doi=citExtractDoi(x)}if(!pmid){pmid=citExtractPmid(x)}}
  if(!doi&&!pmid)query=raw.find(x=>x&&!/^https?:\/\/\S+$/.test(x))||'';
  if(!doi&&!pmid&&!query)return{result:'empty'};
  try{
    if(!doi&&pmid){
      try{doi=await pmidToDoi(f,pmid)||''}catch{doi=''}
      if(!doi)return{result:'nopmid'};
    }
    const entry=doi?await crLookupDoi(f,doi):await crFirstByTitle(f,query);
    if(!entry)return{result:'nf'};
    return{result:'ok',entry};
  }catch{return{result:'fail'}}
}
