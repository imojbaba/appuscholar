import {
  TG_Q as TG_Q_TABLE, TG_RES as TG_RES_TABLE, TG_IMP as TG_IMP_TABLE, TG_EXTRA as TG_EXTRA_TABLE, TG_DEMO as TG_DEMO_TABLE, GEN_DESIGNS as GEN_DESIGNS_TABLE,
  STATS_TEST_OPTIONS as STATS_TEST_OPTIONS_TABLE,
} from "./data/guide-tables";
import type { ParsedData } from "./intake";
import { statsColVals, statsGroupBy } from "./stats-core";
import type { StatsCtx, StatsTestKey } from "./stats-core";
import { smean, ssd } from "./statsmath";

/* v1's which-test guide, "Check my numbers" and practice mode (S5), as data rather than DOM.
   - Emitted from v1 into data/guide-tables.ts (golden:capture guide --emit), never retyped: TG_Q (12038-12047), TG_RES (12076-12099), TG_IMP (12385-12394), TG_EXTRA (12395-12417),
     TG_DEMO (12418-12432, its csv strings as v1 evaluated them), GEN_DESIGNS (12562-12573), and STATS_TEST_OPTIONS, the text of each `<option>` of #statsTest (static HTML, 1559-1597),
     which genReveal reads for its names: it differs from STAT_TESTS's label for 12 of the 26 tests (tukey, mcnemar, cochran, chisq, moderate, mediate, logistic, friedman, rmanova,
     mixed, kruskal, spearman: register row D-W2-19), so a panel that wants v1's sentences passes genVerdict a `labelOf` reading this table.
   - Ported: tgNext (12048-12075), tgRes (12484), the data of tgWhyHTML's items (12434-12436) as tgWhyItems and its TG_EXTRA lookup (12437) as tgExtra, tgSkew, tgQuant, tgOutliers
     (12531-12533), tgCheck (12534-12556) as tgCheck with its two halves tgCheckNumbers (12537-12546) and tgCheckCounts (12548-12553), and the paragraph of 12553 as tgCountsText, and genReveal (12588-12600) as genVerdict.
   - Not ported (page code, the panel's): tgState, tgToggle, tgAnswer, tgBack, tgRender, tgUse, tgWhyHTML's markup, tgDemoHTML, tgDemo, tgBackToMine, tgCheckHTML, genFirstOn,
     genFirstToggle, genGateHide, genGateShow, genSwitch, genRunMine, and genReveal's `if(!dk){showToast('Pick the design first');return}` guard (12590; the panel does not call
     genVerdict without a design).
   The routing, arithmetic, strings and branch order are v1's: tgNext never reaches `mixed`, and rmanova, friedman, twoway and wilcox1 have `keys: []`, so tgRes calls them not built
   (register row F20); tgSkew is the adjusted Fisher-Pearson skew with the sample SD (register row F16); tgQuant interpolates between order statistics; tgOutliers counts values beyond
   1.5 IQR; groups print in object-key order (register row F4).
   What differs from v1's text:
   - parameter and return types, the exported types, `export`; `!` on indexed reads (noUncheckedIndexedAccess) and on `a[q]` inside tgWhyItems's callback, where the narrowing of
     `a[q]!==undefined` does not reach the nested reads; the object of tgNext's counts branch carries `as Record<string, TgResKey>` so that it can be indexed by a string;
   - tgRes keeps v1's unused second parameter `a` (optional here), and tgWhyItems takes v1's `r` though only tgExtra reads it, each with an eslint-disable comment for the unused binding;
   - tgWhyItems pushes `{ answer: o[1], why: TG_IMP[q][a[q]] }` where v1 pushed `'<li><b>'+escHTML(o[1])+'.</b> '+escHTML(TG_IMP[q][a[q]])+'</li>'`; tgExtra is v1's `TG_EXTRA[r.id]`;
   - tgCheck takes the four selects' values (`sel.num`, `sel.grp`, `sel.c1`, `sel.c2`, each "" or a column index as a string) where v1 read `#tgNum`, `#tgGrp`, `#tgC1`, `#tgC2`, and
     returns `{ numbers, counts }`, each null where v1 added nothing, where v1 wrote HTML into #tgCheckOut (both null: v1's fallback text, TG_CHECK_FALLBACK);
   - tgCheckNumbers takes the parsed indexes (v1's `parseInt(ni,10)`, `gi!==''?...:null` as `grpIdx`) and returns the table's rows as `{ group, n, skew, outliers }`, `skew` the printed
     cell (`isFinite(sk)?sk.toFixed(2):'–'`), `group` the label before v1's escHTML, and `rank` and `tiny` where v1 chose and added the two paragraphs; its `groups` is typed
     `Record<string, number[]>`; `window._statsData` is `ctx.data`, and statsColVals and statsGroupBy add to `ctx.skipped` as v1's add to `window._statsSkipped` (nothing reads it here);
   - tgCheckCounts takes `data` and the two parsed indexes and returns `{ r, c, N, minE, low, cells, ok }` where v1 built the paragraph: `r` and `c` are `Object.keys(r1).length` and
     `Object.keys(r2).length`, `minE` the printed `isFinite(minE)?minE.toFixed(2):'–'`, `ok` is `!(low>0)` (v1's choice of sentence); its `cnt` is kept, written and never read, as in v1;
   - the table's header row (12540) and the paragraphs' fixed sentences (12544, 12545, 12553) are TG_CHECK_TEXT, and the fallback is TG_CHECK_FALLBACK (12555); tgCountsText(c)
     returns 12553's paragraph as text, v1's concatenation with `Object.keys(r1).length`, `Object.keys(r2).length`, `N`, the printed minE, `low` and `cells` read from c's fields;
   - the fixed words of tgWhyHTML's markup (12436-12438) are TG_WHY_TEXT, each as its textContent reads (`<b>What it assumes.</b> ` is `'What it assumes. '`; an item's `<b>label.</b> `
     is the label then `TG_WHY_TEXT.item`), and the button labels' prefixes of genReveal (12599-12600) are GEN_TEXT;
   - genVerdict takes the design and test keys and `labelOf` where v1 read #genDesign, #statsTest and the option's textContent: `labelOf(key)||key` is v1's
     `(document.querySelector('#statsTest option[value="'+key+'"]')||{}).textContent||key`; it returns `{ head, cls, why, switchTo }` where v1 wrote the paragraphs and buttons,
     `switchTo` (`{ key: first, label: firstName }`) present exactly when v1 showed the "Switch to" button (`cls==='warn'`). */

export type TgQuestionKey = keyof typeof TG_Q_TABLE;
export type TgAnswers = Partial<Record<"goal" | "cmpOut" | "cmpDes" | "smp" | "relOut" | "prdOut" | "prdN" | "cntDes", string>>;
export type TgQuestion = { readonly q: string; readonly o: ReadonlyArray<readonly [string, string]> };
export type TgResKey = keyof typeof TG_RES_TABLE;
export type TgResEntry = { readonly name: string; readonly keys: readonly StatsTestKey[]; readonly why: string; readonly alt: ReadonlyArray<readonly [string, string]>; readonly note?: string };
export type TgResult = { readonly id: TgResKey; readonly built: boolean } & TgResEntry;
export type TgNextOut = { ask: TgQuestionKey } | { res: TgResult };
export type TgWhyItem = { answer: string; why: string };
export type TgExtra = { readonly assume: string; readonly watch: string };
export type TgDemo = {
  readonly title: string; readonly note: string; readonly test: StatsTestKey; readonly csv: string; readonly sel?: Readonly<Record<string, string>>; readonly extra?: Readonly<Record<string, string>>;
  readonly tick?: readonly string[]; readonly rev?: string; readonly rrange?: string; readonly read: string;
};
export type GenDesignKey = keyof typeof GEN_DESIGNS_TABLE;
export type GenDesign = { readonly label: string; readonly ok: readonly string[]; readonly alt: readonly string[]; readonly why: string };
export type TgCheckSel = { num: string; grp: string; c1: string; c2: string };
export type TgNumbersRow = { group: string; n: number; skew: string; outliers: number };
export type TgNumbers = { rows: TgNumbersRow[]; rank: boolean; tiny: boolean };
export type TgCounts = { r: number; c: number; N: number; minE: string; low: number; cells: number; ok: boolean };
export type TgCheckOut = { numbers: TgNumbers | null; counts: TgCounts | null };
export type GenVerdict = { head: string; cls: "good" | "warn"; why: string; switchTo?: { key: string; label: string } };

/** v1's TG_Q (12038-12047): each question of the guide and its options, `[value, label]`. */
export const TG_Q: Readonly<Record<TgQuestionKey, TgQuestion>> = TG_Q_TABLE;
/** v1's TG_RES (12076-12099): each result, the Statistics Lab keys that run it (`[]`: not built, F20), why it fits and the alternatives. */
export const TG_RES: Readonly<Record<TgResKey, TgResEntry>> = TG_RES_TABLE;
/** v1's TG_IMP (12385-12394): what each answer implies, by question and option value. */
export const TG_IMP: Readonly<Record<TgQuestionKey, Readonly<Record<string, string>>>> = TG_IMP_TABLE;
/** v1's TG_EXTRA (12395-12417): what a test assumes and when it stops fitting, by result or test key. */
export const TG_EXTRA: Readonly<Record<string, TgExtra>> = TG_EXTRA_TABLE;
/** v1's TG_DEMO (12418-12432), the csv strings as v1 evaluated them. */
export const TG_DEMO: Readonly<Record<string, TgDemo>> = TG_DEMO_TABLE;
/** v1's GEN_DESIGNS (12562-12573): practice mode's designs, the tests that fit (`ok`), the valid fallbacks (`alt`) and why. */
export const GEN_DESIGNS: Readonly<Record<GenDesignKey, GenDesign>> = GEN_DESIGNS_TABLE;
/** The text of each `<option>` of v1's #statsTest (1559-1597) by its value: what genReveal names a test by. */
export const STATS_TEST_OPTIONS: Readonly<Record<StatsTestKey, string>> = STATS_TEST_OPTIONS_TABLE;

/** tgCheck's fixed text: the table's header row (12540, `head`) and its paragraphs' fixed sentences, 12544 (`rank` or `means`, then `thumb`), 12545 (`tiny`), 12553 (`low` or `fine`, after the counts; see tgCountsText). */
export const TG_CHECK_TEXT = {
  head: ['Group', 'n', 'Skew', 'Outliers'],
  rank: 'Some groups have fewer than 20 people and either strong skew (beyond ±1) or extreme values. A rank-based test is the safer choice here.',
  means: 'Nothing here points away from a test on means.',
  thumb: ' This is a rule of thumb with no formal source behind it, and you can still choose differently. Do not rely on a normality test to decide: with small groups it has little power, and with large groups it flags differences too small to matter.',
  tiny: 'A group with fewer than 5 people gives very unstable results.',
  low: 'Chi-square is not trustworthy here. Fisher\'s exact test (2 by 2) or merging sparse categories is the usual answer. On a 2 by 2 table the app switches to Fisher\'s exact test by itself.',
  fine: 'Chi-square is fine on this count.',
} as const;
/** tgCheck's text when neither a score column nor two different category columns are picked (12555). */
export const TG_CHECK_FALLBACK = 'Pick a score column, or two category columns, then tap Check.';
/** tgWhyHTML's fixed words (12436-12438) as its textContent reads them: the heading, the separator after an item's label, and the two labels before TG_EXTRA's texts. */
export const TG_WHY_TEXT = { head: 'Why this fits', item: '. ', assume: 'What it assumes. ', watch: 'When it stops fitting. ' } as const;
/** The prefixes of genReveal's two button labels (12599-12600), before the test's name. */
export const GEN_TEXT = { switchTo: 'Switch to ', run: 'Run ' } as const;

export function tgNext(a: TgAnswers): TgNextOut{
  const g=a.goal;
  if(!g)return{ask:'goal'};
  if(g==='reliab')return{res:tgRes('alpha',a)};
  if(g==='relate'){if(!a.relOut)return{ask:'relOut'};return{res:tgRes(a.relOut==='scale'?'pearson':'spearman',a)}}
  if(g==='predict'){
    if(!a.prdOut)return{ask:'prdOut'};
    if(a.prdOut==='binary')return{res:tgRes('logistic',a)};
    if(!a.prdN)return{ask:'prdN'};
    return{res:tgRes(a.prdN==='one'?'regression':'multreg',a)};
  }
  if(g==='counts'){
    if(!a.cntDes)return{ask:'cntDes'};
    return{res:tgRes(({gof:'gof',ind:'chisq',rel2:'mcnemar',rel3:'cochran'} as Record<string, TgResKey>)[a.cntDes]!,a)};
  }
  if(!a.cmpOut)return{ask:'cmpOut'};
  if(!a.cmpDes)return{ask:'cmpDes'};
  const o=a.cmpOut,d=a.cmpDes;
  if(d==='one')return{res:tgRes(o==='scale'?'ttest1':'wilcox1',a)};
  if(d==='factors')return{res:tgRes('twoway',a)};
  if(!a.smp)return{ask:'smp'};
  if(d==='two'){
    if(a.smp==='ind')return{res:tgRes(o==='scale'?'ttestInd':'mannwhitney',a)};
    return{res:tgRes(o==='scale'?'ttestPaired':'wilcoxon',a)};
  }
  if(a.smp==='ind')return{res:tgRes(o==='scale'?'anova1':'kruskal',a)};
  return{res:tgRes(o==='scale'?'rmanova':'friedman',a)};
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- v1's tgRes(k,a) never reads a
export function tgRes(k: TgResKey,a?: TgAnswers): TgResult{const r=TG_RES[k];return Object.assign({id:k,built:r.keys.length>0},r)}

/** tgWhyHTML's items (12434-12436): for each answered question, in v1's order, the option's label and what the answer implies. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- v1's tgWhyHTML reads r only for TG_EXTRA and r.why, which tgExtra and the result carry
export function tgWhyItems(a: TgAnswers,r: TgResult): TgWhyItem[]{
  const order=['goal','cmpOut','relOut','prdOut','prdN','cntDes','cmpDes','smp'] as const,items: TgWhyItem[]=[];
  order.forEach(q=>{if(a[q]!==undefined&&TG_Q[q]){const o=TG_Q[q].o.find(x=>x[0]===a[q]);if(o&&TG_IMP[q]&&TG_IMP[q][a[q]!])items.push({answer:o[1],why:TG_IMP[q][a[q]!]!})}});
  return items;
}
/** tgWhyHTML's `TG_EXTRA[r.id]` (12437): what the test assumes and when it stops fitting, or undefined. */
export function tgExtra(id: string): TgExtra | undefined{return TG_EXTRA[id]}

export function tgSkew(a: number[]): number{const n=a.length;if(n<3)return NaN;const m=smean(a),s=ssd(a);if(!(s>0))return 0;let c=0;a.forEach(v=>{c+=Math.pow((v-m)/s,3)});return n/((n-1)*(n-2))*c}
export function tgQuant(sorted: number[],q: number): number{const pos=(sorted.length-1)*q,lo=Math.floor(pos),hi=Math.ceil(pos);return sorted[lo]!+(sorted[hi]!-sorted[lo]!)*(pos-lo)}
export function tgOutliers(a: number[]): number{if(a.length<4)return 0;const s=a.slice().sort((x,y)=>x-y),q1=tgQuant(s,.25),q3=tgQuant(s,.75),i=q3-q1;return a.filter(v=>v<q1-1.5*i||v>q3+1.5*i).length}

/** tgCheck (12534-12561): the numbers half when a score column is picked, the counts half when two different category columns are; both null is v1's fallback text. */
export function tgCheck(ctx: StatsCtx, sel: TgCheckSel): TgCheckOut{
  const d=ctx.data;let numbers: TgNumbers | null=null,counts: TgCounts | null=null;
  const ni=sel.num,gi=sel.grp;
  if(ni!=='')numbers=tgCheckNumbers(ctx,parseInt(ni,10),gi!==''?parseInt(gi,10):null);
  const c1=sel.c1,c2=sel.c2;
  if(c1!==''&&c2!==''&&c1!==c2)counts=tgCheckCounts(d,parseInt(c1,10),parseInt(c2,10));
  return{numbers,counts};
}
/** 12537-12546: group sizes, skew and outliers of a score, by group or for all values; `rank` picks 12543's first sentence, `tiny` adds 12545's. */
export function tgCheckNumbers(ctx: StatsCtx, numIdx: number, grpIdx: number | null): TgNumbers{
  const groups: Record<string, number[]>=grpIdx!==null?statsGroupBy(ctx,numIdx,grpIdx):{All:statsColVals(ctx,numIdx,true).filter(v=>isFinite(v))};
  const keys=Object.keys(groups);let rank=false;
  const rows=keys.map(k=>{
    const g=groups[k]!,sk=tgSkew(g),ol=tgOutliers(g);
    if(g.length<20&&(Math.abs(sk)>1||ol>0))rank=true;
    return{group:k,n:g.length,skew:isFinite(sk)?sk.toFixed(2):'–',outliers:ol}});
  return{rows,rank,tiny:keys.some(k=>groups[k]!.length<5)};
}
/** 12548-12553: the counts table of two category columns, its smallest expected count and the cells below 5. */
export function tgCheckCounts(data: ParsedData, i1: number, i2: number): TgCounts{
  const d=data,cnt: Record<string, number>={},r1: Record<string, number>={},r2: Record<string, number>={};let N=0;
  d.rows.forEach(r=>{const x=r[i1],y=r[i2];if(x===undefined||x===''||y===undefined||y==='')return;const k=x+'\u0001'+y;cnt[k]=(cnt[k]||0)+1;r1[x]=(r1[x]||0)+1;r2[y]=(r2[y]||0)+1;N++});
  let minE=Infinity,low=0,cells=0;
  Object.keys(r1).forEach(x=>Object.keys(r2).forEach(y=>{const e=r1[x]!*r2[y]!/N;cells++;if(e<minE)minE=e;if(e<5)low++}));
  return{r:Object.keys(r1).length,c:Object.keys(r2).length,N,minE:isFinite(minE)?minE.toFixed(2):'–',low,cells,ok:!(low>0)};
}
/** 12553's paragraph, as text, from tgCheckCounts's fields. */
export function tgCountsText(c: TgCounts): string{return 'Table of '+c.r+' by '+c.c+', N = '+c.N+'. Smallest expected count: '+c.minE+'. '+c.low+' of '+c.cells+' cells are below 5. '+(c.low>0?TG_CHECK_TEXT.low:TG_CHECK_TEXT.fine)}

/** genReveal (12588-12600): whether the picked test fits the stated design, with the reason, and the usual test to switch to when it does not. */
export function genVerdict(designKey: string, testKey: string, labelOf: (key: string) => string | undefined): GenVerdict{
  const D=GEN_DESIGNS[designKey as GenDesignKey],key=testKey;
  const name=labelOf(key)||key;
  const first=D.ok[0]!,firstName=labelOf(first)||first;
  let head: string,cls: "good" | "warn";
  if(D.ok.includes(key)){head='Your choice, '+name+', fits this design.';cls='good'}
  else if(D.alt.includes(key)){head=name+' is a valid choice for this design, usually as the fallback when the usual assumptions fail.';cls='good'}
  else{head='The usual test for this design is '+firstName+', not '+name+'.';cls='warn'}
  return cls==='warn'?{head,cls,why:D.why,switchTo:{key:first,label:firstName}}:{head,cls,why:D.why};
}
