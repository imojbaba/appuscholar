/* v1's Research helpers (index.html, the Research tool from 8025): the abstract OpenAlex sends as an inverted index put back into text (rsReconstructAbstract 8041-8049) and its open-access
   status (rsOaStatus 8055-8060); the check of the AI's quick read of an abstract against that abstract (rsQuickCheck 8131-8160, with the kinds of study, RS_DESIGNS 8127); the result list as a CSV
   file (rsCsvText 8191-8195, through pdCsv, csv.ts); the parser of the AI's 0 to 3 ratings (rsRankParse 8209-8219); the clean-up of a related term (rsCleanTerm 8245-8250) and the query built from
   the topic, the ticked terms and the kind-of-study filter (rsBuildQuery 8273-8282, with RS_DESIGN 8237-8244); the de-duplication of the merged OpenAlex and PubMed results inside researchSearch
   (8312-8314, here rsDedupe); the result filters (rsFilterPass 8336-8346); and a result turned into a citation library entry (rsAuthorsToCit 8455-8464, rsEntryFromResult 8465-8470) or into the
   numbered list of papers the literature review and research gap prompts quote (rsCorpusText 8525-8529). None of it fetches or calls the AI.
   The code is v1's as v1 wrote it, cut out of index.html by a script and changed only by the edits listed here: the same regex sources and flags (rsReconstructAbstract's white-space collapse;
   rsQuickCheck's two number patterns, its comma removals and its `new RegExp('(^|\\D)'+n+'(\\D|$)')`, with the inAb closure, apSquash and at least 8 characters, kept; rsRankParse's collapse;
   rsCleanTerm's quote, bracket and AND/OR/NOT patterns, with v1's curly quotes; the `\W+` title key cut at 60 characters; rsAuthorsToCit's et al., comma, white-space and initials patterns), the
   same limits (rsQuickCheck's 250 and 300 characters and a sample from 1 to 10000000; rsRankParse's whole scores from 0 to 3 and 200 characters; rsCleanTerm's 2 to 40 characters and 5 words), the
   same strings (rsCsvText's twelve column heads; rsBuildQuery's parentheses, ` OR `, ` AND ` and `"[tiab]` suffix; rsEntryFromResult's 'Journal article', 'Website' and 'apa'; rsCorpusText's lines
   and its retraction warning) and the same order. What differs from v1's text:
   - parameter and return types, `export`, and the types RsQuick, RsPaper and RsFilter; RsQuickReply and RsRankReply (not exported) are the parts of the AI's reply that rsQuickCheck and rsRankParse
     read, which v1 reads untyped: apJson's result is read `as RsQuickReply | null` and `as RsRankReply | null`, and rsQuickCheck's `out` and rsRankParse's `res` are typed;
   - rsQuickCheck's inAb takes `q: unknown` and hands it to apSquash `as string` (v1 passes d.quote, which may be any JSON value or missing; apSquash's String(s||'') reads it either way), its
     `let sum` is `const sum` (prefer-const: it is never reassigned), and its `abn` is typed string[] (the type of `match(...)||[]` would make abn.indexOf take no argument);
   - rsCsvText(results): v1 maps the page's result list, `rsResults.map(` (8193); here the caller hands the list, `results.map(`;
   - rsDedupe(merged) holds researchSearch's lines 8312-8314 as v1 wrote them, their indentation kept, inside a function that then returns `merged`;
   - rsFilterPass's `parseInt(p.year,10)` is `parseInt(p.year as string,10)` (a year may be a number; parseInt reads its String either way);
   - a `!` on `parts[1]` in rsAuthorsToCit's initials test (noUncheckedIndexedAccess; parts has two members there);
   - rsEntryFromResult(p, style): v1's `const sel=document.getElementById('citStyle');` (8466) is gone and `(sel&&sel.value)||'apa'` is `style||'apa'`, so a style of "" gives 'apa', as v1's
     #citStyle with no option chosen does;
   - RS_DESIGNS (8127) and RS_DESIGN (8237-8244) are imported from data/research-tables.ts and exported as they are, typed readonly string[] and Record<string, { oa?: string; pm?: string;
     oaFilter?: string }>. The golden harness generates the file from v1 (`golden:capture research --emit`).
   These lines declare with const and let only, so no `var` changed.
   Not ported (network, AI and page): rsFetchOpenAlex 8061, rsPubmedAbstracts 8088 and rsFetchPubmed 8103; rsQuickPrompt 8128 and rsRankPrompt 8206 (Task 13), rsQuick, rsQuickP and rsQuickChecked
   8171-8190, rsRank 8220 and rsSuggestTerms 8251; the rest of researchSearch (8283-8311, 8315-8329); and what renders or reads the page: rsQuickHTML 8161, rsCsvDownload 8196, rsRelHTML 8201,
   RS_TERMS 8236, rsTermsRender and rsPickedTerms 8264-8272, rsFilterInit and rsFilterVals 8331-8335, rsFilterClear to rsAddManual 8347-8452, rsAddToLibrary to rsCheckedPapers 8471-8524, and
   researchLitReview onwards. The page state (rsResults and rsResultsOriginal, 8026), the OpenAlex key helpers (8028-8032) and v1's comments between the ported lines are not copied either. */
import { apJson, apSquash } from "./analyse";
import type { CitationEntry } from "./citation";
import { pdCsv } from "./csv";
import { RS_DESIGN as RS_DESIGN_TABLE, RS_DESIGNS as RS_DESIGNS_TABLE } from "./data/research-tables";

/** The quick read of one abstract as rsQuickCheck (8131-8160) returns it: the summary, or summaryDropped when it holds a number the abstract does not; the kind of study and the sample size, each
 * ok only when its quoted words are in the abstract (and, for the sample, hold the number). */
export type RsQuick = { summary?: string; summaryDropped?: true; design?: { type: string; quote?: string; ok: boolean }; sample?: { n: number; quote?: string; ok: boolean } };
/** One search result as rsFetchOpenAlex (8061) and rsFetchPubmed (8103) build it (each adds fields of its own, which these helpers do not read), with `rel` from rsRank (8231) and `quick` from rsQuickP (8180). */
export type RsPaper = { title: string; authors: string; year: string | number; venue: string; doi: string; url?: string; source: string; abstract?: string; retracted?: boolean; oaStatus?: string; oaUrl?: string; citationCount?: number; rel?: { score: number; reason: string; titleOnly?: boolean }; quick?: RsQuick;
  /** Wave A (W2): every author name, in the source's order (`authors` stays v1's card line, four names and "et al."), and the paper's volume, issue and pages. v1 has none of them. */
  authorList?: string[]; volume?: string; issue?: string; pages?: string };
/** The result filters as rsFilterVals (8332-8335) reads them from the page: a year from, open access only, hide retracted, a confirmed kind of study, a confirmed sample of at least n (0, false or "" when not set). */
export type RsFilter = { year: number; oa: boolean; ret: boolean; des: string; n: number };
/** What rsQuickCheck reads of the AI's reply (apJson's object): any of it may be missing or of another type, which v1's own checks handle. */
type RsQuickReply = { summary?: unknown; design?: { type?: unknown; quote?: unknown } | null; sample?: { n?: unknown; quote?: unknown } | null };
/** What rsRankParse reads of the AI's reply (apJson's object): `scores`, a list v1 checks entry by entry. */
type RsRankReply = { scores?: Array<{ id?: unknown; score?: unknown; reason?: unknown } | null> };

export function rsReconstructAbstract(inv: Record<string, number[]> | null | undefined): string{
  if(!inv)return'';
  let maxPos=-1;
  Object.values(inv).forEach(positions=>positions.forEach(p=>{if(p>maxPos)maxPos=p}));
  if(maxPos<0)return'';
  const arr=new Array(maxPos+1).fill('');
  Object.entries(inv).forEach(([word,positions])=>positions.forEach(p=>{arr[p]=word}));
  return arr.join(' ').replace(/\s+/g,' ').trim();
}
export function rsOaStatus(oa: { is_oa?: boolean; oa_status?: string } | null | undefined): "" | "gold" | "green" | "hybrid" | "bronze"{
  if(!oa||!oa.is_oa)return'';
  const s=String(oa.oa_status||'').toLowerCase();
  if(s==='diamond')return'gold';
  return(s==='gold'||s==='green'||s==='hybrid'||s==='bronze')?s:'';
}
/* RS_DESIGNS (8127) is imported from data/research-tables.ts, generated from v1. */
export const RS_DESIGNS: readonly string[]=RS_DESIGNS_TABLE;
export function rsQuickCheck(raw: string,ab: string): RsQuick | null{
  const j=apJson(raw) as RsQuickReply | null;if(!j||typeof j!=='object')return null;
  const sq=apSquash(ab),out: RsQuick={};
  const inAb=(q: unknown)=>{const x=apSquash(q as string);return x.length>=8&&sq.indexOf(x)>=0};
  const sum=String(j.summary||'').replace(/\s+/g,' ').trim().slice(0,250);
  if(sum){
    const nums=(sum.match(/\d[\d,]*(?:\.\d+)?/g)||[]).map(x=>x.replace(/,/g,''));
    const abn: string[]=(ab.replace(/,/g,'').match(/\d+(?:\.\d+)?/g)||[]);
    if(nums.some(x=>abn.indexOf(x)<0))out.summaryDropped=true;else out.summary=sum;
  }
  const d=j.design;
  if(d&&typeof d==='object'){
    const ty=String(d.type||'').toLowerCase().trim();
    if(ty&&ty!=='not stated'){
      if(RS_DESIGNS.indexOf(ty)>=0&&inAb(d.quote))out.design={type:ty,quote:String(d.quote).trim().slice(0,300),ok:true};
      else out.design={type:ty,ok:false};
    }
  }
  const sm=j.sample;
  if(sm&&typeof sm==='object'&&sm.n!=null){
    const n=Number(sm.n);
    if(Number.isInteger(n)&&n>0&&n<=10000000){
      const q=String(sm.quote||'');
      const digits=q.replace(/,/g,'');
      if(inAb(q)&&new RegExp('(^|\\D)'+n+'(\\D|$)').test(digits))out.sample={n:n,quote:q.trim().slice(0,300),ok:true};
      else out.sample={n:n,ok:false};
    }
  }
  return out;
}
export function rsCsvText(results: RsPaper[]): string{
  const head=['Title','Authors','Year','Venue','DOI','Source','Retracted (OpenAlex)','Fit 0-3 (AI)','Fit reason (AI)','Kind of study (AI, confirmed from abstract)','Sample size (AI, confirmed from abstract)','Summary (AI)'];
  const rows=results.map(p=>[p.title,p.authors,p.year,p.venue,p.doi,p.source,p.retracted?'yes':'',p.rel?p.rel.score:'',p.rel?p.rel.reason:'',p.quick&&p.quick.design&&p.quick.design.ok?p.quick.design.type:'',p.quick&&p.quick.sample&&p.quick.sample.ok?p.quick.sample.n:'',p.quick&&p.quick.summary||'']);
  return pdCsv(head,rows);
}
export function rsRankParse(out: string,n: number): Record<number, { score: number; reason: string }>{
  const j=apJson(out) as RsRankReply | null;const res: Record<number, { score: number; reason: string }>={};
  if(!j||!Array.isArray(j.scores))return res;
  j.scores.forEach(e=>{
    if(!e||typeof e!=='object')return;
    const id=Number(e.id),sc=Number(e.score);
    if(!Number.isInteger(id)||id<1||id>n||!Number.isInteger(sc)||sc<0||sc>3||res[id])return;
    res[id]={score:sc,reason:String(e.reason||'').replace(/\s+/g,' ').trim().slice(0,200)};
  });
  return res;
}
/* RS_DESIGN (8237-8244) is imported from data/research-tables.ts, generated from v1. */
export const RS_DESIGN: Record<string, { oa?: string; pm?: string; oaFilter?: string }>=RS_DESIGN_TABLE;
export function rsCleanTerm(t: string,q: string): string{
  t=String(t||'').replace(/["“”\[\]()]/g,' ').replace(/\b(AND|OR|NOT)\b/g,' ').replace(/\s+/g,' ').trim();
  if(t.length<2||t.length>40||t.split(' ').length>5)return'';
  if(t.toLowerCase()===String(q||'').trim().toLowerCase())return'';
  return t;
}
export function rsBuildQuery(q: string,kind: "oa" | "pm",terms: string[],design: string): string{
  const d=RS_DESIGN[design]||{};
  let core=q;
  if(terms.length){
    core=kind==='oa'?'('+q+') OR '+terms.map(t=>'"'+t+'"').join(' OR '):'('+q+') OR '+terms.map(t=>'"'+t+'"[tiab]').join(' OR ');
  }
  const cl=kind==='oa'?d.oa:d.pm;
  if(cl)core='('+core+') AND '+cl;
  return core;
}
/* researchSearch's de-duplication (8312-8314), as v1 wrote it inside researchSearch, between the merge of the two sources and rsResultsOriginal=merged. */
export function rsDedupe(merged: RsPaper[]): RsPaper[]{
  const seen=new Set();
  merged=merged.filter(p=>{const k=p.title.toLowerCase().replace(/\W+/g,'').slice(0,60);
    if(seen.has(k))return false;seen.add(k);return true});
  return merged;
}
export function rsFilterPass(p: RsPaper,f: RsFilter): { ok: boolean; needsQuick?: true }{
  if(f.year&&!((parseInt(p.year as string,10)||0)>=f.year))return{ok:false};
  if(f.oa&&!(p.oaStatus||p.oaUrl))return{ok:false};
  if(f.ret&&p.retracted)return{ok:false};
  if(f.des||f.n){
    if(!p.quick)return{ok:false,needsQuick:true};
    if(f.des&&!(p.quick.design&&p.quick.design.ok&&p.quick.design.type===f.des))return{ok:false};
    if(f.n&&!(p.quick.sample&&p.quick.sample.ok&&p.quick.sample.n>=f.n))return{ok:false};
  }
  return{ok:true};
}
export function rsAuthorsToCit(str: string): string{
  const names=String(str||'').replace(/,?\s*et al\.?$/i,'').split(/,\s*/).map(x=>x.trim()).filter(Boolean);
  if(!names.length||names[0]==='Unknown authors')return'';
  return names.map(n=>{
    const parts=n.split(/\s+/);
    if(parts.length===1)return n;
    if(parts.length===2&&/^[A-Z]{1,4}$/.test(parts[1]!))return parts[0]+', '+parts[1];
    return parts[parts.length-1]+', '+parts.slice(0,-1).join(' ');
  }).join('; ');
}
export function rsEntryFromResult(p: RsPaper,style: string): CitationEntry{
  return{author:rsAuthorsToCit(p.authors),year:String(p.year||''),title:p.title,
    source:p.venue||'',volume:'',issue:'',pages:'',doi:p.doi||'',url:p.doi?'':(p.url||''),
    type:p.source==='PubMed'||p.venue?'Journal article':'Website',style:style||'apa'};
}
export function rsCorpusText(papers: RsPaper[]): string{
  return papers.map((p,i)=>'['+(i+1)+'] '+p.authors+' ('+(p.year||'n.d.')+'). '+p.title+'. '+(p.venue||p.source)+'.'+
    (p.abstract?'\nAbstract: '+p.abstract:'\nAbstract: not available.')+
    (p.retracted?'\nWARNING: this paper is marked as retracted. Do not present its findings as reliable; mention the retraction if you refer to it.':'')).join('\n\n');
}
/* Stage 2 (Task 9), golden test/golden/rspanel (`golden:capture rspanel`), cut from v1 as the lines above and changed only as listed:
   - rsParseTerms(out, q): the related terms rsSuggestTerms (8251-8263) keeps of the AI's reply, its lines 8257-8258 as v1 wrote them, inside a function that returns `terms`; `out` and `q` are
     parameters (v1's reply of callAI and its trimmed #rsTopic, 8252: the caller trims), apJson's result is read `as { terms?: unknown } | null`, the map hands rsCleanTerm its value `as string`
     (v1 passes any JSON value; rsCleanTerm's String(t||'') reads it either way), and `seen` is typed;
   - rsSortResults(results, mode): the four orders of rsApplySort (8356-8362) as v1 wrote them, on a copy of the list it is given (v1 sorts the filtered copy of rsResultsOriginal, 8355, `let list`),
     returned; `mode` is #rsSort's value (8351) and `parseInt(b.year,10)` takes `String(b.year)` (a year may be a number; parseInt reads its String either way);
   - rsFoldIndex(results, mode): rsRenderResults' fold, `(document.getElementById('rsSort').value==='fit')?rsResults.findIndex(p=>p.rel&&p.rel.score<=1):-1` (8402) with the mode a parameter;
     the panel folds only when it is above 0, as 8403 does. */
export function rsParseTerms(out: string,q: string): string[]{
  const j=apJson(out) as { terms?: unknown } | null;
  const seen: Record<string, number>={};const terms=((j&&Array.isArray(j.terms))?j.terms:[]).map(x=>rsCleanTerm(x as string,q)).filter(x=>{if(!x||seen[x.toLowerCase()])return false;seen[x.toLowerCase()]=1;return true}).slice(0,8);
  return terms;
}
export function rsSortResults(results: RsPaper[],mode: string): RsPaper[]{
  let list=results.slice();
  if(mode==='citations')list.sort((a,b)=>(b.citationCount||0)-(a.citationCount||0));
  else if(mode==='year')list.sort((a,b)=>(parseInt(String(b.year),10)||0)-(parseInt(String(a.year),10)||0));
  else if(mode==='fit'){
    const rk=(x: RsPaper)=>x.rel?(x.rel.score>=2?3-x.rel.score:(x.rel.score===1?3:4)):2; /* 3, 2, unscored, 1, 0 */
    list=list.map((x,i)=>({x:x,i:i})).sort((a,b)=>rk(a.x)-rk(b.x)||a.i-b.i).map(o=>o.x);
  }
  return list;
}
export function rsFoldIndex(results: RsPaper[],mode: string): number{
  return (mode==='fit')?results.findIndex(p=>p.rel&&p.rel.score<=1):-1;
}
/* Wave A (walk fault W2, register row D-S2-24): a search result into the library keeps every author and its volume, issue and pages. Siblings of rsAuthorsToCit and
   rsEntryFromResult, which stay v1's; held to their stated differences by test/research-v2.test.ts and test/references-w28.test.ts. */
/** rsAuthorsToCit's rule for one name (8458-8462): one word as it is; a surname and one to four capitals as "Surname, Initials"; else the last word, a comma, the rest. */
function rsNameToCit(n: string): string{
  const parts=n.split(/\s+/);
  if(parts.length===1)return n;
  if(parts.length===2&&/^[A-Z]{1,4}$/.test(parts[1]!))return parts[0]+', '+parts[1];
  return parts[parts.length-1]+', '+parts.slice(0,-1).join(' ');
}
/** Every name of a result's authorList by rsAuthorsToCit's per-name rule, joined "; ". The names come one by one, so a name with a comma is kept whole (as written). */
export function rsAuthorListToCit(names: string[]): string{
  return names.map(n=>String(n||'').trim()).filter(Boolean).map(n=>n.indexOf(',')>=0?n:rsNameToCit(n)).join('; ');
}
/** rsEntryFromResult (8465-8470) with the author written from `authorList` when it has a name, and the paper's volume, issue and pages. */
export function rsEntryFromResultV2(p: RsPaper,style: string): CitationEntry{
  const e=rsEntryFromResult(p,style);
  const all=rsAuthorListToCit(p.authorList||[]);
  return{...e,author:all||e.author,volume:p.volume||'',issue:p.issue||'',pages:p.pages||''};
}
