import { SCALES, SL_PENDING } from "./data/scale-tables";
import { pdCsv } from "./csv";
import { stkAlpha } from "./statsmath";
import { escHTML } from "./html";
import type { ParsedData } from "./intake";

export { SCALES, SL_PENDING };

/* v1's scale library (O1), the parts that compute: slById (index.html:11420), slVarNames and slText (11426-11432), slCodebook's rows and file (11450-11455), slScore and slBand
   (11456-11469), slScoreOpen's column guess (11477-11480) and slScoreRun (11487-11512). SCALES (11394-11418) and SL_PENDING (11419) are emitted from v1 into data/scale-tables.ts
   (golden:capture scales --emit), never retyped; the scales are English and their `hindi` field is v1's `null`. Not ported (the panel's): slOpen (11421-11425) and slPick
   (11433-11445), which draw the library, slCopy (11446-11449), which copies slText(x) with a toast, the dialogs, slScoreOpen's form (11470-11486 apart from the guess) and the
   download link.
   The arithmetic, strings, branch order and early returns are v1's: slScore's `v==null||v===''||isNaN(v)` (missing) before `v<coding.min||v>coding.max||Math.round(v)!==v` (bad),
   each counted once per cell and the row's total null on either, and its `flip` (`coding.min+coding.max-v`) on the reverse-scored items; slBand's loop and its fall-through to the
   last band; slVarNames' `Math.max(2,String(n).length)` padding; slText's lines and its credit line unless `withCredit` is false; the codebook's five columns; slScoreRun's two
   refusals, its no-row sentence, `nameFree`'s `_2`, `_3` suffixing, the `A.length>=3&&x.items.length>=2` guard and empty catch around stkAlpha, its mean and n-1 SD, and the
   sentence it writes into #slScoreOut with alpha's `.toFixed(2).replace(/^(-?)0\./,'$1.')` and the "rows were left blank" tail.
   What differs from v1's text:
   - types and `export`; the functions take a ScaleShape (Scale, SCALES' element type, read through the widened fields: a union of `as const` tuples does not take indexOf or map);
   - slScore's mat is `Array<Array<number | null>>`, as slScoreRun builds it, so v1's `v===''` test is written `(v as unknown)===''` (it is never true for such a matrix and is kept);
   - slCodebook's rows are slCodebookRows(x) and its `pdDownload(x.id+'_items.csv',pdCsv(...))` is slCodebookCsv(x), the name and the text (the download is the panel's);
   - slScoreOpen's guess is slGuessColumns(x, headers), the index each select gets selected (-1 when none, the "Choose a column" option), v1's two findIndex rules unchanged;
     the map's unused item parameter is `_` (the no-unused-vars rule);
   - slScoreRun is slScoreData(x, data, idx, coding): `data` is window._statsData, `idx` the selects' values (parseInt of #slm_<i>), `coding` x.codings[#slCoding] (v1's
     `parseInt(…)||0` index is the caller's). Where v1 writes `out.textContent=m;return` it returns `{ ok: false, message: m }`; on a run that scores it returns the new headers and
     rows, cT and cB (the column names), the valid totals, mean, sd and alpha (stkAlpha's alpha, null when the guard or the catch left `al` null), `message`, the innerHTML v1 writes into
     #slScoreOut, and `csv`, pdCsv(newHeaders,newRows), what v1 writes into #statsPaste before `window._pdMsg=null;statsParse()` (re-parsing and showing it are the panel's, register
     row D-W2-15); its `catch(e){}` is `catch{}` (e is never read), and `valid`'s filter is a type guard;
   - `!` on indexed reads (noUncheckedIndexedAccess) where v1's lengths guarantee the value (`names[i]`, `x.codings[0]`, slBand's last band); newRows' `r.totals[i]` is read
     `as number | null` and A's answers `as number` (A keeps only the rows whose total is not null, so every answer in it is a number); the arrow parameters `n` and `v` are typed.
   Register rows: F29 (the SWLS bands come from one published scoring sheet), D-W2-15. */

export type Scale = (typeof SCALES)[number];
export type ScaleCoding = { label: string; min: number; max: number; dir: string };
export type ScaleBand = { max: number; label: string };
export type ScaleShape = {
  id: string; name: string; short: string; construct: string; stem: string; items: readonly string[]; labels: readonly string[]; codings: readonly ScaleCoding[];
  reverse: readonly number[]; bands: readonly ScaleBand[] | null; scoring: string;
  licence: { status: string; commercial: boolean; attribution: string; source: string; checked: string; note: string; verified: string };
  screening: boolean; hindi: null;
};
export type SlScore = { totals: Array<number | null>; bad: number; miss: number };
export type SlScoreData =
  | { ok: true; headers: string[]; rows: string[][]; cT: string; cB: string | null; valid: number[]; mean: number; sd: number; alpha: number | null; message: string; csv: string }
  | { ok: false; message: string };

export function slById(id: string): Scale | undefined{return SCALES.find(x=>x.id===id)}
export function slVarNames(x: ScaleShape): string[]{const w=Math.max(2,String(x.items.length).length);return x.items.map((_,i)=>x.id+'_'+String(i+1).padStart(w,'0'))}
export function slText(x: ScaleShape,withCredit?: boolean): string{
  const L=[x.name+' ('+x.short+')','',x.stem,'','Response options: '+x.labels.join(' | '),''];
  x.items.forEach((t,i)=>L.push((i+1)+'. '+t));
  if(withCredit!==false)L.push('','Source: '+x.licence.attribution);
  return L.join('\n');
}
export function slCodebookRows(x: ScaleShape): string[][]{
  const names=slVarNames(x);
  return x.items.map((t,i)=>[names[i]!,t,x.reverse.indexOf(i+1)>=0?'yes':'no',x.codings[0]!.min+' to '+x.codings[0]!.max,x.short]);
}
export function slCodebookCsv(x: ScaleShape): { name: string; csv: string }{
  return{name:x.id+'_items.csv',csv:pdCsv(['variable','label','reverse_scored','response_codes','scale'],slCodebookRows(x))};
}
/* pure scorer: mat is rows of item answers (numbers or null); coding {min,max}. */
export function slScore(x: ScaleShape,mat: Array<Array<number | null>>,coding: { min: number; max: number }): SlScore{
  const flip=(v: number)=>coding.min+coding.max-v,out: Array<number | null>=[];let bad=0,miss=0;
  mat.forEach(r=>{
    let tot=0,ok=true;
    r.forEach((v,j)=>{
      if(v==null||(v as unknown)===''||isNaN(v)){ok=false;miss++;return}
      if(v<coding.min||v>coding.max||Math.round(v)!==v){ok=false;bad++;return}
      tot+=x.reverse.indexOf(j+1)>=0?flip(v):v;
    });
    out.push(ok?tot:null);
  });
  return{totals:out,bad:bad,miss:miss};
}
export function slBand(x: ScaleShape,t: number | null): string{if(t==null||!x.bands)return '';for(const b of x.bands)if(t<=b.max)return b.label;return x.bands[x.bands.length-1]!.label}
export function slGuessColumns(x: ScaleShape,headers: string[]): number[]{
  const names=slVarNames(x),pre=x.id.toLowerCase();
  return x.items.map((_,i)=>{
    let guess=headers.findIndex(h=>h.toLowerCase().replace(/[^a-z0-9]/g,'')===names[i]!.toLowerCase().replace(/[^a-z0-9]/g,''));
    if(guess<0)guess=headers.findIndex(h=>{const z=h.toLowerCase().replace(/[^a-z0-9]/g,'');return z.indexOf(pre)===0&&parseInt(z.replace(/\D/g,''),10)===i+1});
    return guess;
  });
}
export function slScoreData(x: ScaleShape,data: ParsedData,idx: number[],coding: { min: number; max: number }): SlScoreData{
  if(idx.some(v=>v<0)){return{ok:false,message:'Choose a column for every item.'}}
  if(new Set(idx).size!==idx.length){return{ok:false,message:'Each item needs its own column.'}}
  const mat=data.rows.map(r=>idx.map(k=>{const v=String(r[k]==null?'':r[k]).trim();return v===''?null:Number(v)}));
  const r=slScore(x,mat,coding),valid=r.totals.filter((v): v is number=>v!=null);
  if(!valid.length){return{ok:false,message:'No row could be scored. '+(r.bad?r.bad+' answers fall outside '+coding.min+' to '+coding.max+'. Check the coding choice above. ':'')+(r.miss?r.miss+' answers are missing.':'')}}
  const col=x.id+'_total',band=x.id+'_band';
  const cols=data.headers.slice();
  const nameFree=(n: string)=>{let m=n,i=2;while(cols.indexOf(m)>=0)m=n+'_'+(i++);return m};
  const cT=nameFree(col),cB=x.bands?nameFree(band):null;
  const newHeaders=data.headers.concat([cT],cB?[cB]:[]);
  const newRows=data.rows.map((row,i)=>row.concat([r.totals[i]==null?'':String(r.totals[i])],cB?[slBand(x,r.totals[i] as number | null)]:[]));
  /* alpha on the reverse-scored items, rows with every item valid */
  const flip=(v: number)=>coding.min+coding.max-v;
  const A=mat.filter((m,i)=>r.totals[i]!=null).map(m=>m.map((v,j)=>x.reverse.indexOf(j+1)>=0?flip(v as number):v as number));
  let al: { alpha: number; n: number; k: number } | null=null;if(A.length>=3&&x.items.length>=2){try{al=stkAlpha(A)}catch{/* v1's catch(e){}: no alpha */}}
  const mean=valid.reduce((a,b)=>a+b,0)/valid.length,sd=valid.length>1?Math.sqrt(valid.reduce((a,b)=>a+(b-mean)*(b-mean),0)/(valid.length-1)):0;
  const csv=pdCsv(newHeaders,newRows);
  const message='Added <b>'+escHTML(cT)+'</b>'+(cB?' and <b>'+escHTML(cB)+'</b>':'')+' to your data. Scored '+valid.length+' of '+data.rows.length+' rows (M = '+mean.toFixed(2)+', SD = '+sd.toFixed(2)+')'+(al&&isFinite(al.alpha)?'. Cronbach\'s alpha in your sample: '+al.alpha.toFixed(2).replace(/^(-?)0\./,'$1.'):'')+'.'+(data.rows.length-valid.length?' '+(data.rows.length-valid.length)+' rows were left blank because an answer was missing or outside the allowed codes.':'');
  return{ok:true,headers:newHeaders,rows:newRows,cT,cB,valid,mean,sd,alpha:al?al.alpha:null,message,csv};
}
