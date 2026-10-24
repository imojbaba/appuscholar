/* v1's Numbers check (item 43): the reading rules NC_NUM, NC_P and NC_RES, and ncFind, ncPOf, ncJudge and ncFmtP (index.html:12195-12257). It finds each statistic written in the APA order (t, F, chi-square, H, r and z, with
   its df and p), recomputes p from the statistic with the p-value core (pvalue.ts) and judges the reported p. It uses no AI.
   The regexes and the arithmetic are v1's as v1 wrote them: the same regex sources and flags ('g', and 'gi' on the chi rule); NC_RES a module-level array of /g regexes that ncFind rewinds (lastIndex=0) before each scan;
   the same operation order, tolerances (half a unit in the last place of the statistic and of the reported p, eps 1e-12, the .005 and .05 cuts) and branch order; and ncPOf's switch, which gives undefined for a kind it does
   not know. The note ids (nc_c_form, nc_c_df, nc_c_zero, nc_c_onetail, nc_c_round, nc_c_typo) are returned as keys: the panel renders them with t().
   What differs from v1's text is only what TypeScript and this package's lint need: the types and `export`; a `!` on each captured group, df read and p value that v1 trusts (noUncheckedIndexedAccess, and df1 and df2
   are `number | null` in NcFind); and ncJudge's `let a=...,b=...` as a `const a` and a `let b`, since only b is reassigned (prefer-const).
   Not ported: ncOpen 12351-12367 and ncJump 12368, which draw the dialog and move the selection. numbersCheck and numbersSummary are what ncOpen computes, and numbersCheckHtml reads the document's text as ncOpen does,
   `editor.textContent` (12353): the text of two blocks runs together (register row D-W1-1). */
import { docTextContent } from "./doctext";
import { pFromChi, pFromF, pFromT, pFromZ } from "./pvalue";
import { noLead } from "./statfmt";

export type NcKind = "t" | "F" | "chi" | "H" | "r" | "z";
export type NcFind = { kind: NcKind; df1: number | null; df2: number | null; stat: number; dec: number; op: string; p: number; pStr: string; pdec: number; start: number; end: number; raw: string };
export type NcNote = "" | "nc_c_form" | "nc_c_df" | "nc_c_zero" | "nc_c_onetail" | "nc_c_round" | "nc_c_typo";
export type NcJudge = { status: "ok" | "warn" | "error"; note: NcNote; pcalc?: number; pLo?: number; pHi?: number };
/** The groups a rule's map picks out of a match: the digits as v1 reads them, before parseFloat. */
type NcGroups = { df1?: string; df2?: string; stat: string; op: string; p: string };

const NC_NUM='([\\u2212\\u2013-]?\\s*\\d*\\.?\\d+)',NC_P='\\s*,?\\s*[pP]\\s*([<>=\\u2264\\u2265])\\s*(\\d*\\.\\d+|\\d+)';
const NC_RES: Array<{ k: NcKind; re: RegExp; map: (m: RegExpExecArray) => NcGroups }>=[
  {k:'t',re:new RegExp('\\bt\\s*\\(\\s*(\\d+(?:\\.\\d+)?)\\s*\\)\\s*=\\s*'+NC_NUM+NC_P,'g'),map:m=>({df1:m[1],stat:m[2]!,op:m[3]!,p:m[4]!})},
  {k:'F',re:new RegExp('\\bF\\s*\\(\\s*(\\d+(?:\\.\\d+)?)\\s*,\\s*(\\d+(?:\\.\\d+)?)\\s*\\)\\s*=\\s*'+NC_NUM+NC_P,'g'),map:m=>({df1:m[1],df2:m[2],stat:m[3]!,op:m[4]!,p:m[5]!})},
  {k:'chi',re:new RegExp('(?:\\u03c7\\s*(?:2|\\u00b2|\\^2)|chi[- ]?square|chi2)\\s*\\(\\s*(\\d+)(?:\\s*,\\s*N\\s*=\\s*\\d+)?\\s*\\)\\s*=\\s*'+NC_NUM+NC_P,'gi'),map:m=>({df1:m[1],stat:m[2]!,op:m[3]!,p:m[4]!})},
  {k:'H',re:new RegExp('\\bH\\s*\\(\\s*(\\d+)\\s*\\)\\s*=\\s*'+NC_NUM+NC_P,'g'),map:m=>({df1:m[1],stat:m[2]!,op:m[3]!,p:m[4]!})},
  {k:'r',re:new RegExp('\\br\\s*\\(\\s*(\\d+)\\s*\\)\\s*=\\s*'+NC_NUM+NC_P,'g'),map:m=>({df1:m[1],stat:m[2]!,op:m[3]!,p:m[4]!})},
  {k:'z',re:new RegExp('\\bz\\s*=\\s*'+NC_NUM+NC_P,'g'),map:m=>({stat:m[1]!,op:m[2]!,p:m[3]!})}
];
export function ncFind(text: string): NcFind[] {
  const out: NcFind[]=[];
  NC_RES.forEach(def=>{
    def.re.lastIndex=0;let m: RegExpExecArray | null;
    while((m=def.re.exec(text))){
      const o=def.map(m);
      const statStr=String(o.stat).replace(/[−–]/g,'-').replace(/\s+/g,'');
      const dec=(statStr.split('.')[1]||'').length,pdec=(String(o.p).split('.')[1]||'').length;
      out.push({kind:def.k,df1:o.df1!==undefined?parseFloat(o.df1):null,df2:o.df2!==undefined?parseFloat(o.df2):null,stat:parseFloat(statStr),dec:dec,op:o.op,p:parseFloat(o.p),pStr:String(o.p),pdec:pdec,start:m.index,end:m.index+m[0].length,raw:m[0]});
    }
  });
  out.sort((a,b)=>a.start-b.start);
  return out;
}
export function ncPOf(f: Pick<NcFind, "kind" | "df1" | "df2">, x: number): number | undefined {
  switch(f.kind){
    case 't':return pFromT(x,f.df1!);
    case 'F':return pFromF(x,f.df1!,f.df2!);
    case 'chi':case 'H':return pFromChi(x,f.df1!);
    case 'z':return pFromZ(x);
    case 'r':{const r=Math.min(0.9999999,Math.abs(x));return pFromT(r*Math.sqrt(f.df1!/(1-r*r)),f.df1!)}
  }
}
export function ncJudge(f: NcFind): NcJudge {
  const r: NcJudge={status:'ok',note:''};
  if(f.p<0||f.p>1){r.status='warn';r.note='nc_c_form';r.pcalc=NaN;return r}
  if((f.df1!==null&&!(f.df1>0))||(f.df2!==null&&!(f.df2>0))){r.status='warn';r.note='nc_c_df';r.pcalc=NaN;return r}
  const h=0.5*Math.pow(10,-f.dec),ax=Math.abs(f.stat);
  const a=Math.max(0,ax-h);let b=ax+h;
  if(f.kind==='r'){b=Math.min(0.9999999,b)}
  const pHi=ncPOf(f,a)!,pLo=ncPOf(f,b)!,pMid=ncPOf(f,ax)!;
  r.pcalc=pMid;r.pLo=pLo;r.pHi=pHi;
  const hp=0.5*Math.pow(10,-f.pdec),eps=1e-12;
  let ok: boolean;
  if(f.op==='=')ok=!(f.p+hp<pLo-eps||f.p-hp>pHi+eps);
  else if(f.op==='<')ok=pLo<f.p+eps;
  else if(f.op==='>')ok=pHi>f.p-eps;
  else if(f.op==='≤')ok=pLo<=f.p+hp;
  else ok=pHi>=f.p-hp;
  const zero=f.op==='='&&f.p===0&&f.pdec>0;
  if(zero){r.status='warn';r.note='nc_c_zero'}
  if(ok&&!zero)return r;
  if(ok&&zero){return r}
  const repSig=(f.op==='<'||f.op==='≤')?f.p<=0.05:(f.op==='='?f.p<0.05:false);
  const calcSig=pMid<0.05;
  r.status=repSig!==calcSig?'error':'warn';
  if(!zero){
    if(f.op==='='&&!(f.p+hp<pLo/2-eps||f.p-hp>pHi/2+eps))r.note='nc_c_onetail';
    else if(Math.abs((f.op==='='?f.p:f.p)-pMid)<0.005)r.note='nc_c_round';
    else r.note='nc_c_typo';
  }
  return r;
}
export function ncFmtP(p: number): string {return !isFinite(p)?'–':(p<0.001?'< .001':'= '+noLead(p.toFixed(3)))}

/** What ncOpen builds from the document's text (12354): every statistic ncFind reads, with ncJudge's verdict as `j`. */
export function numbersCheck(text: string): Array<NcFind & { j: NcJudge }> {
  return ncFind(text).map(f => ({ ...f, j: ncJudge(f) }));
}
/** ncOpen's counts (12356): `warn` is every item whose status is not 'ok', so it includes the errors. */
export function numbersSummary(items: ReadonlyArray<{ j: Pick<NcJudge, "status"> }>): { n: number; ok: number; warn: number; err: number } {
  return {
    n: items.length,
    ok: items.filter(f => f.j.status === 'ok').length,
    err: items.filter(f => f.j.status === 'error').length,
    warn: items.filter(f => f.j.status !== 'ok').length,
  };
}
/** ncOpen's whole path from a document: `editor.textContent` (12353) is docTextContent of the editor's HTML, with no separator between blocks. */
export function numbersCheckHtml(html: string): Array<NcFind & { j: NcJudge }> {
  return numbersCheck(docTextContent(html));
}
