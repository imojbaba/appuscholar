/* v1's citation cross-check (item 48): a document's in-text citations against its reference list (index.html:12100-12157). It splits the plain text at the last reference heading (English, or the Hindi one),
   reads the citations of the body (narrative, `Smith and Lee (2019)` or `Smith et al. (2018)`, and the groups inside brackets, split at semicolons) and the references of the list, and reports the citations with no
   source, the sources never cited and the list lines it could not read. With no heading it checks against the library instead. It uses no AI.
   The patterns and the logic are v1's as v1 wrote them: CC_SN and CC_YR, the strings every regex is built from, with `new RegExp(...)` and its `u` / `gu` flags where v1 has them (ccParseRef, ccCites, ccNorm); the heading
   pattern of ccSplit, a regex literal with its Hindi alternative; ccNorm's NFD strip (the class from U+0300 to U+036F) and its \p{L} fold; the NBSP replaces of ccSplit and ccCites; the object `seen` that
   de-duplicates the citations by key (an object, not a Map); ccLev's early return of 9 when the lengths differ by more than 2, which ccAnalyse reads as `<=2`; and the branch order of ccAnalyse. The characters in the code
   that are not ASCII are v1's own bytes, copied: the Hindi alternative of the heading (pinned by test/golden/devanagari.test.ts), the two ends of ccNorm's class and the U+00A0 of the two replaces.
   CC_STOP (12103), a Set in v1, is built here from data/crosscheck-tables.ts, which the golden harness generates from v1 (`golden:capture crosscheck --emit`); its membership test is v1's.
   What differs from v1's text is only what TypeScript and this package's lint need:
   - parameter and return types, `export`, and the types below;
   - ccAnalyse's style is a required parameter. v1's library branch (12139) calls `citFmt(d)` with no number and no style: citFmt takes the style from the page's #citStyle (7325) and the number as
     `num=(n&&n>0)?n:0` (7331), so an absent number is 0. Core reads no page, so the port calls `citFmt(d,0,style)`; the lib-branch cases of the golden suite hold it to v1's output in all eight styles;
   - a `!` on each read that v1 trusts to exist (noUncheckedIndexedAccess): the heading line, the captured groups of a match, the rows of ccLev's matrix and the entry just stored in `seen`;
   - CC_STOP as above. v1 declares everything else in these lines with const and let, so no declaration changed.
   Not ported: ccOpen 12158-12177 and ccJump 12178, which draw the dialog and move the selection. crossCheckHtml is what ccOpen computes: the document's text as ccOpen reads it, `(editor.innerText||'').replace(/\u00a0/g,' ')`
   (12159), with docInnerText (doctext.ts) in the place of the editor's innerText, then ccAnalyse with the library and the style the page has chosen. */
import { citFmt, citLastName } from "./citation";
import type { CitationEntry, CitationStyle } from "./citation";
import { CC_STOP as CC_STOP_LIST } from "./data/crosscheck-tables";
import { docInnerText } from "./doctext";

export type CcCite = { sn: string; yr: string; raw: string };
export type CcRef = { sn: string; yr: string; text: string };
export type CcUniq = CcCite & { n: number };
export type CcMissing = { c: CcUniq; near: Array<{ kind: "year" | "name"; e: CcRef }> };
export type CcResult = { srcKind: "none" | "doc" | "lib"; heading: string; listN: number; cited: number; missing: CcMissing[]; unused: CcRef[]; unread: number; body: string };

/* ---- Citation cross-check (item 48, 2026-10-07): in-text citations against the reference list. No AI. ---- */
export const CC_SN: string="(?:(?:van|von|de|del|della|der|den|di|da|le|la|bin|al|el|ibn)\\s+){0,2}\\p{Lu}[\\p{L}'\\u2019\\-]+";
export const CC_YR: string="((?:1[5-9]|20)\\d\\d[a-z]?|n\\.d\\.)";
/* CC_STOP (12103) is built from data/crosscheck-tables.ts, generated from v1: the same members in v1's order. */
export const CC_STOP: Set<string>=new Set<string>(CC_STOP_LIST);
export function ccNorm(s: string): string{return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^\p{L}]+/gu,' ').trim()}
export function ccKey(sn: string,yr: string): string{return ccNorm(sn)+'|'+String(yr||'').toLowerCase()}
export function ccYrMatch(a: string,b: string): boolean{const x=String(a).toLowerCase(),y=String(b).toLowerCase();const xc=x.replace(/[a-z]$/,''),yc=y.replace(/[a-z]$/,'');if(x==='n.d.'||y==='n.d.')return x===y;if(xc!==yc)return false;const xl=x.slice(xc.length),yl=y.slice(yc.length);return !xl||!yl||xl===yl}
export function ccSplit(plain: string): { body: string; refs: string[] | null; heading: string }{
  const lines=plain.split(/\n/);let idx=-1;
  lines.forEach((l,i)=>{if(/^\s*(references?|reference list|bibliography|works cited|संदर्भ(?:\s*सूची)?)\s*:?\s*$/i.test(l))idx=i});
  if(idx<0)return{body:plain,refs:null,heading:''};
  const refs=lines.slice(idx+1).map(l=>l.replace(/ /g,' ').trim()).filter(Boolean);
  return{body:lines.slice(0,idx).join('\n'),refs:refs,heading:lines[idx]!.trim()};
}
export function ccParseRef(line: string): CcRef | null{
  const m1=line.match(new RegExp('^\\s*('+CC_SN+')\\s*,','u'))||line.match(new RegExp('^\\s*('+CC_SN+')','u'));
  const m2=line.match(/\(\s*((?:1[5-9]|20)\d\d[a-z]?|n\.d\.)\s*\)/);
  if(!m1||!m2)return null;
  return{sn:m1[1]!,yr:m2[1]!,text:line};
}
export function ccCites(body: string): CcCite[]{
  const out: CcCite[]=[],push=(sn: string,yr: string,raw: string)=>{if(CC_STOP.has(ccNorm(sn)))return;out.push({sn:sn,yr:yr,raw:raw.replace(/ /g,' ')})};
  const narr=new RegExp('('+CC_SN+')(?:\\s+(?:and|&)\\s+'+CC_SN+'|\\s+et\\s+al\\.?|(?:,\\s+'+CC_SN+'){1,5}(?:,?\\s+(?:and|&)\\s+'+CC_SN+'))?\\s*\\(\\s*'+CC_YR+'[^)]*\\)','gu');
  let m: RegExpExecArray | null;
  while((m=narr.exec(body)))push(m[1]!,m[2]!,m[0]);
  const grp=/\(([^()]{3,260})\)/g;
  while((m=grp.exec(body))){
    m[1]!.split(';').forEach(seg=>{
      const mm=seg.match(new RegExp('(?:^|[^\\p{L}])('+CC_SN+')[^;]{0,90}?[,\\s]+'+CC_YR+'(?!\\d)','u'));
      if(mm)push(mm[1]!,mm[2]!,seg.trim());
    });
  }
  return out;
}
export function ccLev(a: string,b: string): number{const m=a.length,n=b.length;if(Math.abs(m-n)>2)return 9;const d: number[][]=[];for(let i=0;i<=m;i++){d[i]=[i]}for(let j=1;j<=n;j++)d[0]![j]=j;for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)d[i]![j]=Math.min(d[i-1]![j]!+1,d[i]![j-1]!+1,d[i-1]![j-1]!+(a[i-1]===b[j-1]?0:1));return d[m]![n]!}
export function ccAnalyse(plain: string,lib: CitationEntry[],style: CitationStyle): CcResult{
  const sp=ccSplit(plain),cites=ccCites(sp.body);
  let list: CcRef[]=[],unread=0,srcKind: CcResult["srcKind"]='none';
  if(sp.refs){srcKind='doc';sp.refs.forEach(l=>{const r=ccParseRef(l);if(r)list.push(r);else unread++})}
  else if(lib&&lib.length){srcKind='lib';list=lib.map(d=>({sn:citLastName(d.author),yr:String(d.year||'').trim()||'n.d.',text:citFmt(d,0,style).ref}))}
  const uniq: CcUniq[]=[];const seen: Record<string, CcUniq>={};
  cites.forEach(c=>{const k=ccKey(c.sn,c.yr);if(!seen[k]){seen[k]={sn:c.sn,yr:c.yr,raw:c.raw,n:1};uniq.push(seen[k]!)}else seen[k]!.n++});
  const missing: CcMissing[]=[],hit: boolean[]=new Array(list.length).fill(false);
  uniq.forEach(c=>{
    let found=false;
    list.forEach((e,i)=>{if(ccNorm(e.sn)===ccNorm(c.sn)&&ccYrMatch(e.yr,c.yr)){found=true;hit[i]=true}});
    if(!found){
      const near: CcMissing["near"]=[];
      list.forEach(e=>{
        if(ccNorm(e.sn)===ccNorm(c.sn))near.push({kind:'year',e:e});
        else if(ccYrMatch(e.yr,c.yr)&&ccLev(ccNorm(e.sn),ccNorm(c.sn))<=2)near.push({kind:'name',e:e});
      });
      missing.push({c:c,near:near});
    }
  });
  const unused=list.filter((e,i)=>!hit[i]);
  return{srcKind:srcKind,heading:sp.heading,listN:list.length,cited:uniq.length,missing:missing,unused:unused,unread:unread,body:sp.body};
}
/** What ccOpen computes (12159-12161) from the editor's HTML: its innerText with U+00A0 as a space (docInnerText is the pinned stand-in for Chromium's innerText), checked with ccAnalyse against the library in the page's style. */
export function crossCheckHtml(html: string, lib: CitationEntry[], style: CitationStyle): CcResult {
  return ccAnalyse(docInnerText(html).replace(/\u00a0/g, " "), lib, style);
}
