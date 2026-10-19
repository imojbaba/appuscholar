import { STAT_TESTS as STAT_TESTS_TABLE } from "./data/stats-tables";
import type { ParsedData } from "./intake";
import { escHTML } from "./html";
import { fmtP, pCell } from "./statfmt";
import { smean, stkShapiro, stkBrownForsythe, stkOLS } from "./statsmath";

/* v1's Statistics Lab frame (S3, S4): what every runner of statsRunNow (12609-13457) stands on, as data rather than DOM.
   - STAT_TESTS (11750-11777), emitted from v1 into data/stats-tables.ts; StatsTestKey is its keys, in v1's order.
   - The form: v1's runners read `#sf_<id>` through a local `gv` (12613) and the ticked `.sfm_<id>` boxes through querySelectorAll; here StatsForm carries what the form held (`values[id]`, a
     select's value being the column index as a string, an extra field its text; `ticked[id]` the indexes of the checked boxes in column order) and StatsCtx carries it with the parsed data and
     the "left out" counter, v1's `window._statsSkipped` (register row D-W2-5: what fills the form is the panel's business).
   - The page helpers: stkIsBinaryCol, stkBinData, stkBinom5 (11783-11808), statsColVals, statsGroupBy (11834-11857), sig (11983), stkAssumpBlock (8753-8779), stkAnova2Cells (8780-8796),
     stkAssumpFor (8797-8833), stkMRData (8894-8941), and statsResultsShow (11985-12005) as finishResult.
   - Results as data: a toast becomes `{ ok: false, reason: "toast", toast }` with v1's string; the HTML v1 put into #statsResults becomes StatsBlock values (a table's cell strings and a
     note's innerHTML as v1 built them, so `pCell`'s `&lt; .001` and `escHTML(label)` stay HTML; a heading's text; a list's items).
   The arithmetic, strings, branch order and the order in which the counter is incremented are v1's (the "left out" count is doubled for the tests whose assumption pass reads the columns
   again: Review Focus 1, register row D-W2-4). Not ported: statsColOptions (11778, the panel's), statsFieldsRender (11809-11833, the panel's field defaults: D-W2-5), the statsChart*
   functions (11884-11979, Chart.js: register row F27), rtCapture and the window._statsAPA/_statsSummary/_statsRun bookkeeping inside statsResultsShow (Task 13 and the panel), and 12005, the DOMContentLoaded listener after
   statsResultsShow that restores the dataset name (page code).
   What differs from v1's text:
   - parameter and return types, the exported types, `export`; `var` becomes `const` or `let` in the same order (a list mixing kept and reassigned bindings is split into consecutive
     statements in the order of the list); `!` on indexed reads (noUncheckedIndexedAccess) and where TypeScript cannot follow v1's control flow (a `let` narrowed in a callback);
   - `window._statsData` becomes `ctx.data` (stkIsBinaryCol and stkBinData take the ParsedData as their first argument), `window._statsSkipped` becomes `ctx.skipped`, with the same
     increments at the same points;
   - v1's per-function `gv` (`var el=document.getElementById('sf_'+id);return el?el.value:''`, in stkAnova2Cells and stkAssumpFor) becomes the shared `gv(ctx, id)`, which returns
     `ctx.form.values[id]` when the key exists and '' otherwise, so a missing field still parses to NaN and takes v1's throw-and-toast path;
   - stkMRData: `document.getElementById('sf_dv').value` becomes `gv(ctx,'dv')` (v1 would throw on a form with no sf_dv; mregress and logistic always have one), `refEl&&refEl.value||''`
     becomes `gv(ctx,'ref')||''`, `(posEl&&posEl.value)||''` becomes `gv(ctx,'pos')||''` and `posEl.value.trim()` `gv(ctx,'pos').trim()`; its `ticked(cls,skip)` reads
     `ctx.form.ticked[cls] ?? []`, called with the field ids ('preds', 'cats', 'preds2', 'cats2') where v1 passed the class names ('sfm_preds', ...), and drops v1's
     `parseInt(c.value,10)` because the form already holds numbers; the unused `refEl` and `posEl` bindings go;
   - the one knowing difference from v1 in stkMRData (register row D-W2-18, approved by OJ 2026-10-19): `step1n` is the number of design columns of block 1,
     `blk.filter(function(b){return b===1}).length`, where v1 (8937) counted the ticked step 1 columns `idxs1.length+cidx1.length`; `blk` is pushed once per design column in the
     order addNum(idxs1,1), addCat(cidx1,1), addNum(idxs2,2), addCat(cidx2,2), so the block 1 columns lead and mregress's `m.xs.slice(0,k1)` is exactly step 1; the two counts differ
     only when a categorical predictor of 3 or more levels (2 or more dummies) is in step 1, where v1 fitted step 1 on part of its dummies;
   - stkAssumpBlock returns blocks where v1 returned an HTML string: the heading "Assumption checks", one table (header row `[escHTML(what), 'N', 'Shapiro-Wilk W', 'p']`, then a row per
     item: v1's `<td colspan="2">` message is one cell), the Brown-Forsythe note when there is one, the message note (empty when there is no message, as v1's `<p class="desc"></p>`);
     a cell v1 wrote as `'<td>'+n+'</td>'` is `String(n)`, the same text;
   - stkAssumpFor returns `[]` where v1 returned ''; its `catch(e)` is `catch` (the binding was unused);
   - finishResult: statsResultsShow's safety net runs `/NaN|Infinity|undefined(?! \(an empty cell\))/` on the blocks' strings joined with nothing (blocksHtml) plus `' '+apa`, where v1 ran
     it on its HTML (the same words, without the tags between cells); the suppressed result is v1's note as one block (register row F22); otherwise the assumption blocks are appended
     before `ctx.skipped` is read for the "left out" note, as v1 11993-11995 orders it. */

export type StatsTestKey = keyof typeof STAT_TESTS_TABLE;
export type StatsFieldType = "numeric" | "categorical" | "binary";
export type StatsField = { readonly id: string; readonly label: string; readonly type: StatsFieldType; readonly multi?: boolean; readonly unchecked?: boolean };
export type StatsExtra = { readonly id: string; readonly label: string; readonly placeholder: string };
export type StatsTestDef = { readonly label: string; readonly fields: readonly StatsField[]; readonly extra?: readonly StatsExtra[] };
/** v1's STAT_TESTS (11750-11777), as emitted: the label, the column fields and the extra text fields of each of the 26 tests, in v1's order. */
export const STAT_TESTS: Readonly<Record<StatsTestKey, StatsTestDef>> = STAT_TESTS_TABLE;

/** What the Statistics Lab form held when Run was pressed: `values[id]` is `#sf_<id>`'s value, `ticked[id]` the column indexes of the checked `.sfm_<id>` boxes in column order. */
export type StatsForm = { values: Record<string, string>; ticked: Record<string, number[]> };
/** One run: the parsed data, the form, and the count of entries left out because they are not a number (v1's `window._statsSkipped`). */
export type StatsCtx = { data: ParsedData; form: StatsForm; skipped: number };

export type StatsBlock = { kind: "table"; rows: string[][] } | { kind: "note"; html: string } | { kind: "heading"; text: string } | { kind: "list"; items: string[] };
export type StatsOk = { ok: true; test: StatsTestKey; apa: string; blocks: StatsBlock[]; skipped: number; values: Record<string, number> };
export type StatsFail = { ok: false; test: StatsTestKey; reason: "toast"; toast: string } | { ok: false; test: StatsTestKey; reason: "undefined"; blocks: StatsBlock[] };
export type StatsResult = StatsOk | StatsFail;

export type BinData = { M: number[][]; pos: string; neg: string; skipped: number };
export type Anova2Cells = { y: number[]; ai: number[]; bi: number[]; aL: string[]; bL: string[]; cellMap: Record<string, number[]>; cellVals: number[][]; resid: number[]; skipped: number; dvI: number; aI: number; bI: number };
export type MRRef = { name: string; level: string; auto: boolean; n: number; small: number };
export type MRData = {
  posL: string; negL: string; dvI: number; idxs: number[]; cidxs: number[]; y: number[]; xs: number[][]; labels: string[]; isDummy: boolean[]; blk: number[];
  hasStep2: boolean; step1n: number; refs: MRRef[]; dropped: number; err: string;
};

/** v1's `gv` (12613): the form's value for `#sf_<id>`, or '' when the form has no such field. */
export function gv(ctx: StatsCtx, id: string): string {return Object.prototype.hasOwnProperty.call(ctx.form.values,id)?ctx.form.values[id]!:''}

/** A runner's `showToast(msg);return`. */
export function statsToast(test: StatsTestKey, toast: string): StatsFail {return{ok:false,test,reason:'toast',toast}}

/* ---------- Yes/no columns, McNemar, Cochran's Q (Version 20) ---------- */
export function stkIsBinaryCol(data: ParsedData, i: number): boolean{
  const d=data;if(!d)return false;
  const seen: Record<string, number>={};let c=0;
  for(let r=0;r<d.rows.length;r++){const v=d.rows[r]![i];if(v===undefined||v==='')continue;const k=String(v).trim();if(!(k in seen)){seen[k]=1;c++;if(c>2)return false}}
  return c===2;
}
/* Rows with an answer in every chosen column become 0/1 rows. Returns {M,pos,neg,skipped} or {err}. */
export function stkBinData(data: ParsedData, idxs: number[], posTxt: string): BinData | { err: string }{
  const d=data,lv: string[]=[];
  d.rows.forEach(r=>idxs.forEach(i=>{const v=r[i];if(v===undefined||v==='')return;const k=String(v).trim();if(lv.indexOf(k)<0)lv.push(k)}));
  if(lv.length!==2)return{err:lv.length<2?'The ticked columns hold only one kind of answer, so there is nothing to compare.':'The ticked columns hold '+lv.length+' different answers in total ('+lv.slice(0,5).join(', ')+'). They must all use the same two answers, for example 0 and 1.'};
  let pos: string | null=null;const want=(posTxt||'').trim().toLowerCase();
  if(want){lv.forEach(k=>{if(k.toLowerCase()===want)pos=k});if(pos===null)return{err:'“'+posTxt.trim()+'” is not one of the two answers ('+lv.join(', ')+').'}}
  else{lv.forEach(k=>{if(['1','yes','true','y','present','agree'].indexOf(k.toLowerCase())>=0)pos=k});
    if(pos===null){const sorted=lv.slice().sort((a,b)=>{const x=parseFloat(a),y=parseFloat(b);return isFinite(x)&&isFinite(y)?x-y:(a<b?-1:a>b?1:0)});pos=sorted[1]!}}
  const neg=lv.filter(k=>k!==pos)[0]!,M: number[][]=[];let skipped=0;
  d.rows.forEach(r=>{let ok=true;const row=idxs.map(i=>{const v=r[i];if(v===undefined||v===''){ok=false;return 0}return String(v).trim()===pos?1:0});if(ok)M.push(row);else skipped++});
  return{M:M,pos:pos,neg:neg,skipped:skipped};
}
/* Two-sided exact binomial test with p = .5 (b out of nd). */
export function stkBinom5(b: number, nd: number): number{
  if(nd<=0)return 1;
  const lo=Math.min(b,nd-b),lf=[0];for(let i=1;i<=nd;i++)lf.push(lf[i-1]!+Math.log(i));
  let tail=0;for(let i=0;i<=lo;i++)tail+=Math.exp(lf[nd]!-lf[i]!-lf[nd-i]!-nd*Math.LN2);
  return Math.min(1,2*tail);
}

/** v1 11834: a column's values that are not empty; with `numeric`, those parseFloat makes finite, adding the rest to `ctx.skipped`. */
export function statsColVals(ctx: StatsCtx, idx: number, numeric: true): number[];
export function statsColVals(ctx: StatsCtx, idx: number, numeric: false): string[];
export function statsColVals(ctx: StatsCtx, idx: number, numeric: boolean): number[] | string[]{
  const d=ctx.data;
  const raw=d.rows.map(r=>r[idx]).filter((v): v is string=>v!==undefined&&v!=='');
  if(!numeric)return raw;
  const out=raw.map(v=>parseFloat(v)).filter(x=>isFinite(x));
  ctx.skipped=(ctx.skipped||0)+(raw.length-out.length);
  return out;
}
/** v1 11842: the dependent variable's numbers by group label, in a plain object, so the groups come out in object-key order (integer-like labels first, ascending: register row F4). */
export function statsGroupBy(ctx: StatsCtx, dvIdx: number, ivIdx: number): Record<string, number[]>{
  const d=ctx.data,groups: Record<string, number[]>={};
  d.rows.forEach(r=>{
    const g=r[ivIdx],v=r[dvIdx];
    if(g===undefined||g===''||v===undefined||v==='')return;
    const x=parseFloat(v);
    if(!isFinite(x)){ctx.skipped=(ctx.skipped||0)+1;return}
    (groups[g]=groups[g]||[]).push(x);
  });
  Object.keys(groups).forEach(k=>{if(!groups[k]!.length)delete groups[k]});
  return groups;
}

export function sig(p: number): boolean{return p<0.05}

export function stkAssumpBlock(items: Array<{ label: string; vals: number[] }>, groupsForSpread: number[][] | null, what: string): StatsBlock[]{
  const rows: string[][]=[];let small=false,any=false,flagN=false,flagS=false;
  items.forEach(function(it){
    const r=stkShapiro(it.vals);
    if(!r){rows.push([escHTML(it.label),String(it.vals.length),(it.vals.length<3?'needs 3 or more values':it.vals.length>5000?'more than 5,000 values, test not run':'all values the same')]);return}
    any=true;if(r.n<20)small=true;if(r.p<0.05)flagN=true;
    rows.push([escHTML(it.label),String(r.n),r.W.toFixed(3),pCell(r.p)]);
  });
  const h: StatsBlock[]=[{kind:'heading',text:'Assumption checks'},
    {kind:'table',rows:[[escHTML(what),'N','Shapiro-Wilk W','p'],...rows]}];
  let bf: ReturnType<typeof stkBrownForsythe>=null;
  if(groupsForSpread&&groupsForSpread.length>=2&&groupsForSpread.every(function(g){return g.length>=2}))bf=stkBrownForsythe(groupsForSpread);
  if(bf){flagS=bf.p<0.05;h.push({kind:'note',html:'Equal spread (Brown-Forsythe): F('+bf.df1+', '+bf.df2+') = '+bf.F.toFixed(2)+', '+fmtP(bf.p)+'.'})}
  const msg: string[]=[];
  if(any){
    if(flagN)msg.push('At least one Shapiro-Wilk p is below .05, so the scores depart from a normal curve. Look at the histogram. With small groups or a clear skew, a rank test (Mann-Whitney, Wilcoxon, Kruskal-Wallis) is the safer choice. With larger groups the t-test and ANOVA tolerate mild departures.');
    else msg.push('No Shapiro-Wilk p is below .05, so nothing here argues against normality. That is weaker evidence than it sounds when groups are small.');
  }
  if(bf){
    if(flagS)msg.push('The spreads differ (p below .05). Welch t and Welch ANOVA with Games-Howell already allow for that; the classic Student t and one-way ANOVA do not.');
    else msg.push(groupsForSpread!.some(function(g){return g.length<10})?'No sign of unequal spread, but with a group under 10 people this test almost never fires, even when the spreads differ a lot. Compare the SDs in the table yourself.':'No sign of unequal spread.');
  }
  if(small)msg.push('With fewer than 20 values these tests have little power and miss real departures; with several hundred they flag differences too small to matter. Treat them as a prompt to look at the plot, not as a verdict.');
  h.push({kind:'note',html:msg.join(' ')});
  return h;
}

export function stkAnova2Cells(ctx: StatsCtx): Anova2Cells{
  const d=ctx.data;
  const dvI=parseInt(gv(ctx,'dv'),10),aI=parseInt(gv(ctx,'iv'),10),bI=parseInt(gv(ctx,'iv2'),10);
  const aL: string[]=[],bL: string[]=[],y: number[]=[],ai: number[]=[],bi: number[]=[];let skipped=0;
  d.rows.forEach(function(r){
    const ga=r[aI],gb=r[bI],v=r[dvI];
    if(ga===undefined||ga===''||gb===undefined||gb===''||v===undefined||v==='')return;
    const x=parseFloat(v);if(!isFinite(x)){skipped++;return}
    if(aL.indexOf(ga)<0)aL.push(ga);if(bL.indexOf(gb)<0)bL.push(gb);
    y.push(x);ai.push(aL.indexOf(ga));bi.push(bL.indexOf(gb));
  });
  const cellVals: number[][]=[],cellMap: Record<string, number[]>={};
  y.forEach(function(v,k){const key=ai[k]+'|'+bi[k];(cellMap[key]=cellMap[key]||[]).push(v)});
  const resid: number[]=[];y.forEach(function(v,k){const g=cellMap[ai[k]+'|'+bi[k]]!;resid.push(v-smean(g))});
  Object.keys(cellMap).forEach(function(k){cellVals.push(cellMap[k]!)});
  return{y:y,ai:ai,bi:bi,aL:aL,bL:bL,cellMap:cellMap,cellVals:cellVals,resid:resid,skipped:skipped,dvI:dvI,aI:aI,bI:bI};
}
export function stkAssumpFor(key: StatsTestKey, ctx: StatsCtx): StatsBlock[]{
  try{
    const d=ctx.data;let items: Array<{ label: string; vals: number[] }>=[],spread: number[][] | null=null,what='Group';
    if(key==='ttest1'){const v=statsColVals(ctx,parseInt(gv(ctx,'dv'),10),true);what='Variable';items=[{label:d.cols[parseInt(gv(ctx,'dv'),10)]!.name,vals:v}]}
    else if(key==='ttestInd'||key==='anova1'||key==='tukey'||key==='welchAnova'){
      const gr=statsGroupBy(ctx,parseInt(gv(ctx,'dv'),10),parseInt(gv(ctx,'iv'),10)),ks=Object.keys(gr);
      items=ks.map(function(k){return{label:k,vals:gr[k]!}});spread=ks.map(function(k){return gr[k]!});
    }else if(key==='mregress'){
      const m=stkMRData(ctx);if(m.err||m.xs.length<2||m.y.length<m.xs.length+2)return [];
      const o=stkOLS(m.xs,m.y);if(!o)return [];
      what='Variable';items=[{label:'Residuals',vals:o.resid}];
    }else if(key==='moderate'){
      const xi=parseInt(gv(ctx,'x'),10),wi=parseInt(gv(ctx,'w'),10),yi=parseInt(gv(ctx,'dv'),10),XX: number[]=[],WW: number[]=[],YY: number[]=[];
      d.rows.forEach(function(r){const a=parseFloat(r[xi]!),b=parseFloat(r[wi]!),c=parseFloat(r[yi]!);if([a,b,c].every(isFinite)&&r[xi]!==''&&r[wi]!==''&&r[yi]!==''){XX.push(a);WW.push(b);YY.push(c)}});
      if(YY.length<10)return [];const mxx=smean(XX),mww=smean(WW),xcc=XX.map(function(v){return v-mxx}),wcc=WW.map(function(v){return v-mww}),oo=stkOLS([xcc,wcc,xcc.map(function(v,i){return v*wcc[i]!})],YY);if(!oo)return [];
      what='Variable';items=[{label:'Residuals',vals:oo.resid}];
    }else if(key==='anova2'){
      const c=stkAnova2Cells(ctx);if(!c)return [];
      items=[{label:'Residuals (all cells)',vals:c.resid}];spread=c.cellVals;what='Variable';
    }else if(key==='ttestPaired'){
      const a=parseInt(gv(ctx,'v1'),10),b=parseInt(gv(ctx,'v2'),10),df: number[]=[];
      d.rows.forEach(function(r){const x=parseFloat(r[a]!),y=parseFloat(r[b]!);if(r[a]!==''&&r[b]!==''&&r[a]!==undefined&&r[b]!==undefined&&isFinite(x)&&isFinite(y))df.push(x-y)});
      what='Variable';items=[{label:'Differences ('+d.cols[a]!.name+' − '+d.cols[b]!.name+')',vals:df}];
    }else if(key==='regression'){
      const i1=parseInt(gv(ctx,'iv'),10),i2=parseInt(gv(ctx,'dv'),10),xs: number[]=[],ys: number[]=[];
      d.rows.forEach(function(r){const x=parseFloat(r[i1]!),y=parseFloat(r[i2]!);if(r[i1]!==''&&r[i2]!==''&&r[i1]!==undefined&&r[i2]!==undefined&&isFinite(x)&&isFinite(y)){xs.push(x);ys.push(y)}});
      const mx=smean(xs),my=smean(ys);let sxy=0,sxx=0;xs.forEach(function(x,i){sxy+=(x-mx)*(ys[i]!-my);sxx+=(x-mx)*(x-mx)});
      const b1=sxy/sxx,b0=my-b1*mx,res=ys.map(function(y,i){return y-(b0+b1*xs[i]!)});
      what='Variable';items=[{label:'Residuals',vals:res}];
    }else return [];
    if(!items.length)return [];
    return stkAssumpBlock(items,spread,what);
  }catch{return []}
}

export function stkMRData(ctx: StatsCtx, bin?: boolean): MRData{
  const d=ctx.data,dvI=parseInt(gv(ctx,'dv'),10);
  function ticked(cls: string,skip: number[]): number[]{return (ctx.form.ticked[cls]??[]).filter(function(i){return i!==dvI&&skip.indexOf(i)<0})}
  const idxs1=ticked('preds',[]),cidx1=ticked('cats',idxs1),taken=idxs1.concat(cidx1);
  const idxs2=ticked('preds2',taken),cidx2=ticked('cats2',taken.concat(idxs2));
  const idxs=idxs1.concat(idxs2),cidxs=cidx1.concat(cidx2);
  const spec: Record<string, string>={};
  (gv(ctx,'ref')||'').split(/[,;]/).forEach(function(part){const q=part.split('=');if(q.length===2)spec[q[0]!.trim().toLowerCase()]=q[1]!.trim()});
  const kept: string[][]=[];let dropped=0;
  d.rows.forEach(function(r){
    const v=parseFloat(r[dvI]!);
    if(r[dvI]===''||r[dvI]===undefined||(!bin&&!isFinite(v))){dropped++;return}
    for(let j=0;j<idxs.length;j++){const q=parseFloat(r[idxs[j]!]!);if(r[idxs[j]!]===''||r[idxs[j]!]===undefined||!isFinite(q)){dropped++;return}}
    for(let j2=0;j2<cidxs.length;j2++){if(r[cidxs[j2]!]===''||r[cidxs[j2]!]===undefined){dropped++;return}}
    kept.push(r);
  });
  let y=kept.map(function(r){return parseFloat(r[dvI]!)});const xs: number[][]=[],labels: string[]=[],isDummy: boolean[]=[],blk: number[]=[],refs: MRRef[]=[];let err='',posL='',negL='';
  if(bin){
    const lvB: string[]=[];kept.forEach(function(r){const k2=String(r[dvI]).trim();if(lvB.indexOf(k2)<0)lvB.push(k2)});
    if(lvB.length!==2){err=lvB.length<2?'The outcome has only one answer among the rows used, so there is nothing to predict.':'The outcome has '+lvB.length+' different answers among the rows used ('+lvB.slice(0,5).join(', ')+'). It must have exactly two.'}
    else{
      const want=(gv(ctx,'pos')||'').trim().toLowerCase();let pos: string | null=null;
      if(want){lvB.forEach(function(k2){if(k2.toLowerCase()===want)pos=k2});if(pos===null)err='“'+gv(ctx,'pos').trim()+'” is not one of the two answers ('+lvB.join(', ')+').'}
      else{lvB.forEach(function(k2){if(['1','yes','true','y','present','agree'].indexOf(k2.toLowerCase())>=0)pos=k2});
        if(pos===null){const srt=lvB.slice().sort(function(a,b){const x=parseFloat(a),z=parseFloat(b);return isFinite(x)&&isFinite(z)?x-z:(a<b?-1:a>b?1:0)});pos=srt[1]!}}
      if(pos!==null){posL=pos;negL=lvB[0]===pos?lvB[1]!:lvB[0]!;y=kept.map(function(r){return String(r[dvI]).trim()===pos?1:0})}
    }
  }
  function addNum(list: number[],b: number){list.forEach(function(i){xs.push(kept.map(function(r){return parseFloat(r[i]!)}));labels.push(d.cols[i]!.name);isDummy.push(false);blk.push(b)})}
  function addCat(list: number[],b: number){
    list.forEach(function(i){
      const lv: string[]=[],cnt: Record<string, number>={},nm=d.cols[i]!.name;
      kept.forEach(function(r){const g=r[i]!;if(!(g in cnt)){cnt[g]=0;lv.push(g)}cnt[g]!++});
      if(lv.length<2){err=err||'The column “'+nm+'” has only one level in the rows used, so it cannot predict anything.';return}
      if(lv.length>6){err=err||'The column “'+nm+'” has '+lv.length+' levels. This test handles up to 6 per categorical predictor.';return}
      let ref: string | null=null,auto=true;const want=spec[nm.toLowerCase()];
      if(want!==undefined){for(let q=0;q<lv.length;q++)if(String(lv[q]).toLowerCase()===want.toLowerCase()){ref=lv[q]!;auto=false}}
      if(ref===null){ref=lv[0]!;lv.forEach(function(g){if(cnt[g]!>cnt[ref!]!)ref=g})}
      refs.push({name:nm,level:ref,auto:auto,n:cnt[ref]!,small:lv.filter(function(g){return cnt[g]!<5}).length});
      lv.forEach(function(g){if(g===ref)return;xs.push(kept.map(function(r){return r[i]===g?1:0}));labels.push(nm+': '+g+' (vs '+ref+')');isDummy.push(true);blk.push(b)});
    });
  }
  addNum(idxs1,1);addCat(cidx1,1);addNum(idxs2,2);addCat(cidx2,2);
  return{posL:posL,negL:negL,dvI:dvI,idxs:idxs,cidxs:cidxs,y:y,xs:xs,labels:labels,isDummy:isDummy,blk:blk,hasStep2:(idxs2.length+cidx2.length)>0,step1n:blk.filter(function(b){return b===1}).length,refs:refs,dropped:dropped,err:err};
}

/** The blocks' strings joined with nothing (a table's cells, a note's html, a heading's text, a list's items): the words statsResultsShow's safety net looks at. */
export function blocksHtml(blocks: StatsBlock[]): string{
  return blocks.map(b=>b.kind==='table'?b.rows.map(r=>r.join('')).join(''):b.kind==='note'?b.html:b.kind==='heading'?b.text:b.items.join('')).join('');
}

/** statsResultsShow (11985-12005) as data. */
export function finishResult(ctx: StatsCtx, key: StatsTestKey, blocks: StatsBlock[], apa: string, values: Record<string, number>): StatsResult{
  /* Safety net: a result that contains an undefined number is never offered for the document. */
  if(/NaN|Infinity|undefined(?! \(an empty cell\))/.test(blocksHtml(blocks)+' '+apa)){
    return{ok:false,test:key,reason:'undefined',blocks:[{kind:'note',html:'<b>This analysis produced a number that is undefined, so no result is shown.</b> It usually means a group has no spread (every value the same), a group is too small, or the data fit a line exactly. Look at the data and the groups, then try again.'}]};
  }
  const html=blocks.concat(stkAssumpFor(key,ctx));
  if(ctx.skipped)html.push({kind:'note',html:ctx.skipped+' entr'+(ctx.skipped===1?'y that is':'ies that are')+' not a number '+(ctx.skipped===1?'was':'were')+' left out.'});
  return{ok:true,test:key,apa:apa,blocks:html,skipped:ctx.skipped,values:values};
}
