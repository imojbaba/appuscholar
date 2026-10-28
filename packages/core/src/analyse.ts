/* v1's Analyse a paper helpers ("Analyse a paper (Version 30)", index.html): the chunker that cuts a paper's pages into pieces under their section headings (apSquash 9855, apToks 9856,
   apHeadName 9857-9861 and apBuild 9862-9881, with AP_HEADS 9853 and AP_STOP 9854), the picker that keeps the pieces closest to a question within a budget of characters (apPick 9987-10001), the reply
   parser (apJson 10003-10008), the quotation guard that looks for an AI's quotation in the paper's text (apCheckQuote 10009-10017), the numbers check that recomputes each reported p-value from its
   statistic with the p-value core, pvalue.ts (apNumbers 10066-10105), and the DOIs of the reference list (apRefDois 11225-11235, through retrNormDoi and retrValidDoi 7564-7565, which come from the
   Citation tool's retraction check). None of it uses AI.
   The code is v1's as v1 wrote it, cut out of index.html by a script and changed only by the edits listed here: the same regex sources and flags (AP_HEADS's alternation and `i`; the \p{L}\p{N} classes
   of apSquash and apToks with `u`; apHeadName's numbering and trailing-punctuation patterns; apBuild's white-space collapse, its cut at 700 characters after a line ending in . ! ? or ), and its
   reference-section test; apJson's fence pattern; apNumbers's four statistic patterns with `gi`, its replaces of the minus sign and en dash and of the chi-square spellings, written with v1's own
   characters, and its `$10.` replacement; apRefDois's DOI pattern and its class of trailing punctuation, with v1's curly quotes), the same arithmetic in the same order (apPick's 1.5 x budget, its scores
   of 1, 1.5 for a word of more than six letters and 2 for the first piece, its comparator `b.s-a.s||a.i-b.i` and its `continue` past a piece that does not fit; apNumbers's half a unit in the last place,
   its 1e-9 tolerances and its de-duplication by label, `out.some(o=>o.label===label)`, after the verdict), and the same strings (apPick's `[ page N, Section ]` lines, apCheckQuote's `why` and `label`
   texts, and v1's comment at 10002). apBuild's `id` ('a', the squashed title cut at 24, the count of characters outside the reference list) and its `paged` rule (more than one page, or src 'pdf') are
   v1's. What differs from v1's text:
   - parameter and return types, `export`, and the types ApChunk, ApDoc, ApStage and ApNumber;
   - v1 keeps the loaded paper in its page state, `AP.doc` (9838). apPick, apCheckQuote, apNumbers and apRefDois take it as their first parameter, `doc`: apPick's `AP.doc.chunks` is `doc.chunks`, and
     the `const d=AP.doc;` of the other three is `const d=doc;`. apNumbers and apRefDois keep v1's `if(!d)return[];`, which no typed call reaches;
   - the arrays v1 starts empty are typed (apBuild's chunks and sections, apPick's keep, the out of apNumbers and of apRefDois), and so are the parameters of apNumbers's arrows (num, dec, pRep, verdict
     and tOf);
   - a `!` on each captured group apNumbers reads (noUncheckedIndexedAccess): m[1] to m[5] in its four loops, and m[1] in dec;
   - apJson's `catch(e)` is `catch` (the binding was unused), and apRefDois's `let v` is `const v` (prefer-const: it is never reassigned);
   - AP_SAMPLE (9837), AP_STAGES (9839-9852) and AP_NAME (10435) are imported from data/analyse-tables.ts and exported as they are, typed readonly string[], readonly ApStage[] and
     Record<string, string>; AP_STOP (9854), in v1 a Set of the words of one string, is a Set built from that file's list of its members in v1's order. The golden harness generates the file from v1
     (`golden:capture analyse --emit`). Everything else in these lines v1 declares with const, let and function, so no `var` changed.
   Not ported: the page state AP (9838); apLoad (9882-9891), which refuses a paper with too little text (a toast), stores AP.doc = apBuild(title, pages, src) with `sample` set from its isSample flag and
   `abstractOnly` set to src === 'abstract', brings back the stored notes and draws the panel; the rest of 9892-9986 (loading from the shelf and from files, notes, page code); apQuotesHTML (10018-10026),
   apCall and the prompts (10027-10064, Task 14) and the section comment at 10065; apNumbersRun onwards (10106: rendering, lessons, voice); apRefCheck (11236, the retraction lookup, which fetches). */
import { AP_NAME as AP_NAME_TABLE, AP_SAMPLE as AP_SAMPLE_TABLE, AP_STAGES as AP_STAGES_TABLE, AP_STOP as AP_STOP_LIST } from "./data/analyse-tables";
import { pFromChi, pFromF, pFromT } from "./pvalue";

/** A piece of the paper as the flush of apBuild (9864) cuts it: its page (0 when the paper is not paged), the section heading above it, its text with white space made single, that text squashed (apSquash) and whether it is in the reference list. */
export type ApChunk = { page: number; sec: string; text: string; sq: string; ref: boolean };
/** The paper as apBuild returns it (9879-9880), in v1's key order. */
export type ApDoc = { title: string; src: string; pages: string[]; paged: boolean; chunks: ApChunk[]; sections: Array<{ name: string; page: number }>; chars: number; fullSq: string; id: string; sample: boolean; refsCut: boolean };
/** One of the twelve walk-through stages (9839-9852). */
export type ApStage = { k: string; name: string; ask: string; brief: string; terms: string };
/** A statistic apNumbers found (10079): the label is the match in the text it read, lo and hi the p-values recomputed at the two ends of the statistic's rounding, rep the reported p with half its last unit. */
export type ApNumber = { label: string; lo: number; hi: number; rep: { op: string; v: number; h: number }; ok: boolean };

export function retrNormDoi(d: string): string{return String(d||'').trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i,'').toLowerCase()}
export function retrValidDoi(d: string): boolean{return /^10\.\d{4,}\/\S+$/.test(d)&&!/[|,]/.test(d)}
/* AP_SAMPLE (9837) and AP_STAGES (9839-9852) are imported from data/analyse-tables.ts, generated from v1. */
export const AP_SAMPLE: readonly string[]=AP_SAMPLE_TABLE;
export const AP_STAGES: readonly ApStage[]=AP_STAGES_TABLE;
export const AP_HEADS: RegExp=/^(abstract|introduction|background|literature review|review of literature|theoretical (?:background|framework)|method(?:s|ology)?|participants|sample|measures?|materials|instruments?|procedure|design|results|findings|analysis|discussion|general discussion|conclusions?|limitations|recommendations|implications|references|bibliography|acknowledg(?:e)?ments?)$/i;
/* AP_STOP (9854) is built from data/analyse-tables.ts, generated from v1: the same members in v1's order. */
export const AP_STOP: Set<string>=new Set<string>(AP_STOP_LIST);
export function apSquash(s: string): string{return String(s||'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'')}
export function apToks(s: string): string[]{return String(s||'').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w=>w.length>3&&!AP_STOP.has(w))}
export function apHeadName(line: string): string | null{
  let x=line.trim();if(!x||x.length>60)return null;
  x=x.replace(/^(\d+(\.\d+)*|[IVX]+)[.)]?\s+/,'').replace(/[:.\s]+$/,'');
  return AP_HEADS.test(x)?(x.charAt(0).toUpperCase()+x.slice(1).toLowerCase()):null;
}
export function apBuild(title: string,pages: string[],src: string): ApDoc{
  const chunks: ApChunk[]=[],sections: ApDoc["sections"]=[];let sec='',buf='',bufPage=0;
  const flush=()=>{const t=buf.replace(/\s+/g,' ').trim();if(t.length>=2)chunks.push({page:bufPage,sec:sec,text:t,sq:apSquash(t),ref:/^(references|bibliography)$/i.test(sec)});buf=''};
  pages.forEach((pt,pi)=>{
    const paged=pages.length>1||src==='pdf';
    String(pt||'').split('\n').forEach(line=>{
      const h=apHeadName(line);
      if(h){flush();sec=h;sections.push({name:h,page:paged?pi+1:0});return}
      if(!buf)bufPage=paged?pi+1:0;
      buf+=line+' ';
      if(buf.length>=700&&/[.!?)]\s*$/.test(line.trim()))flush();
    });
    flush();
  });
  const body=chunks.filter(c=>!c.ref);
  const chars=body.reduce((a,c)=>a+c.text.length,0);
  const full=chunks.map(c=>c.sq).join('');
  return{title:title,src:src,pages:pages,paged:pages.length>1||src==='pdf',chunks:chunks,sections:sections,chars:chars,fullSq:full,
         id:'a'+apSquash(title).slice(0,24)+chars,sample:false,refsCut:chunks.some(c=>c.ref)};
}
export function apPick(doc: ApDoc,question: string,terms: string,budget: number): { text: string; partial: boolean; n: number; of: number }{
  const ch=doc.chunks.filter(c=>!c.ref);
  const total=ch.reduce((a,c)=>a+c.text.length,0);
  let pick=ch,partial=false;
  if(total>budget*1.5){
    const qs=apToks(question+' '+(terms||''));
    const sc=ch.map((c,i)=>{const lc=c.text.toLowerCase();let s=0;qs.forEach(w=>{if(lc.indexOf(w)>=0)s+=1+(w.length>6?0.5:0)});if(i===0)s+=2;return{c:c,i:i,s:s}});
    sc.sort((a,b)=>b.s-a.s||a.i-b.i);
    let used=0;const keep: Array<{ c: ApChunk; i: number; s: number }>=[];
    for(const x of sc){if(used+x.c.text.length>budget)continue;keep.push(x);used+=x.c.text.length}
    keep.sort((a,b)=>a.i-b.i);pick=keep.map(x=>x.c);partial=true;
  }
  const text=pick.map(c=>'[ '+(c.page?'page '+c.page:'text')+(c.sec?', '+c.sec:'')+' ]\n'+c.text).join('\n\n');
  return{text:text,partial:partial,n:pick.length,of:ch.length};
}
/* ---- reply parsing and the quotation guard ---- */
export function apJson(s: string): unknown{
  s=String(s||'').replace(/```(?:json)?/gi,'');
  const a=s.indexOf('{'),b=s.lastIndexOf('}');
  if(a<0||b<=a)return null;
  try{return JSON.parse(s.slice(a,b+1))}catch{return null}
}
export function apCheckQuote(doc: ApDoc,q: string): { q: string; ok: boolean; why?: string; page?: number; sec?: string; label?: string }{
  q=String(q||'');const sq=apSquash(q);
  if(sq.length<15)return{q:q,ok:false,why:'too short to check'};
  const d=doc;
  let u=d.chunks.find(c=>c.sq.indexOf(sq)>=0);
  if(!u&&d.fullSq.indexOf(sq)>=0){const head=sq.slice(0,20);u=d.chunks.find(c=>c.sq.indexOf(head)>=0)}
  if(!u)return{q:q,ok:false,why:'not found'};
  return{q:q,ok:true,page:u.page,sec:u.sec,label:u.page?'page '+u.page:(u.sec?'section: '+u.sec:'in the text')};
}
export function apNumbers(doc: ApDoc): ApNumber[]{
  const d=doc;if(!d)return[];
  const txt=d.chunks.filter(c=>!c.ref).map(c=>c.text).join(' ').replace(/[−–]/g,'-').replace(/χ\s*2|χ²|x2|chi-?square/gi,'chi2').replace(/\s+/g,' ');
  const out: ApNumber[]=[];
  const num=(s: string)=>parseFloat(String(s).replace(/^(-?)\./,'$10.'));
  const dec=(s: string)=>{const m=String(s).match(/\.(\d+)/);return m?m[1]!.length:0};
  const pRep=(op: string,pv: string)=>{const v=num(pv),h=0.5*Math.pow(10,-dec(pv));return{op:op,v:v,h:h}};
  const verdict=(label: string,lo: number,hi: number,rep: ApNumber["rep"])=>{
    let ok;
    if(rep.op==='=')ok=!(hi<rep.v-rep.h-1e-9||lo>rep.v+rep.h+1e-9);
    else if(rep.op==='<')ok=lo<rep.v+1e-9;
    else ok=hi>rep.v-1e-9;
    if(out.some(o=>o.label===label))return;
    out.push({label:label,lo:lo,hi:hi,rep:rep,ok:ok});
  };
  const pt=/\bt\s*\(\s*(\d+(?:\.\d+)?)\s*\)\s*=\s*(-?\d*\.?\d+)\s*[,;]?\s*p\s*([=<>])\s*(\d*\.?\d+)/gi;
  let m;
  while((m=pt.exec(txt))){
    const df=num(m[1]!),t=Math.abs(num(m[2]!)),h=0.5*Math.pow(10,-dec(m[2]!));
    verdict(m[0],pFromT(t+h,df),pFromT(Math.max(t-h,0),df),pRep(m[3]!,m[4]!));
  }
  const pf=/\bF\s*\(\s*(\d+)\s*,\s*(\d+(?:\.\d+)?)\s*\)\s*=\s*(\d*\.?\d+)\s*[,;]?\s*p\s*([=<>])\s*(\d*\.?\d+)/gi;
  while((m=pf.exec(txt))){
    const d1=num(m[1]!),d2=num(m[2]!),f=num(m[3]!),h=0.5*Math.pow(10,-dec(m[3]!));
    verdict(m[0],pFromF(f+h,d1,d2),pFromF(Math.max(f-h,0),d1,d2),pRep(m[4]!,m[5]!));
  }
  const pr=/\br\s*\(\s*(\d+)\s*\)\s*=\s*(-?\d*\.?\d+)\s*[,;]?\s*p\s*([=<>])\s*(\d*\.?\d+)/gi;
  while((m=pr.exec(txt))){
    const df=num(m[1]!),r=Math.abs(num(m[2]!)),h=0.5*Math.pow(10,-dec(m[2]!));
    if(r+h>=1||df<2)continue;
    const tOf=(x: number)=>x*Math.sqrt(df/(1-x*x));
    verdict(m[0],pFromT(tOf(r+h),df),pFromT(tOf(Math.max(r-h,0)),df),pRep(m[3]!,m[4]!));
  }
  const pc=/chi2\s*\(\s*(\d+)(?:\s*,\s*N\s*=\s*\d+)?\s*\)\s*=\s*(\d*\.?\d+)\s*[,;]?\s*p\s*([=<>])\s*(\d*\.?\d+)/gi;
  while((m=pc.exec(txt))){
    const df=num(m[1]!),c=num(m[2]!),h=0.5*Math.pow(10,-dec(m[2]!));
    verdict(m[0],pFromChi(c+h,df),pFromChi(Math.max(c-h,0),df),pRep(m[3]!,m[4]!));
  }
  return out;
}
/* AP_NAME (10435) is imported from data/analyse-tables.ts, generated from v1. */
export const AP_NAME: Record<string, string>=AP_NAME_TABLE;
export function apRefDois(doc: ApDoc): string[]{
  const d=doc;if(!d)return[];
  const txt=d.chunks.filter(c=>c.ref).map(c=>c.text).join(' ');
  const found=txt.match(/10\.\d{4,9}\/[^\s"<>]+/g)||[];
  const out: string[]=[];
  found.forEach(x=>{
    const v=retrNormDoi(x).replace(/[.,;:)\]}'’”]+$/,'');
    if(retrValidDoi(v)&&out.indexOf(v)<0)out.push(v);
  });
  return out;
}
