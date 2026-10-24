import { PW_INFO } from "./data/power-tables";
import { pwPower, pwSolveN, pwSolveEffect, plSim } from "./statsmath";
import type { PowerSpec, PowerTest, SimRun } from "./statsmath";
import type { StatsBlock } from "./stats-core";

export { PW_INFO };

/* v1's sample-size and power calculator and its power simulator (S6), the page functions that call Task 1's maths (statsmath.ts: pwPower, pwSolveN, pwSolveEffect, plSim):
   pwArt (index.html:13479), pwNum (13480), pwRun (13481-13531) and plRun (9007-9043). PW_INFO (13458-13466) is emitted from v1 into data/power-tables.ts (golden:capture power --emit),
   never retyped. Not ported: pwTestChange (13467-13477: shows and hides the fields, fills #pwEffect with PW_INFO's default and writes #pwHint; the panel's), pwOpen (13478: opens the
   dialog) and plPreset (9006: sets #plN and runs).
   The strings, arithmetic, branch order and early returns are v1's: f2's `Math.abs(x)<10?x.toFixed(2):x.toFixed(1)` and leading-zero strip, pf, effTxt's per-test choice of f2 or
   toFixed(2), tailTxt, pwArt's two regexes, the 0.8/0.9/0.95 rows (a row whose pwSolveN is null is left out, as v1's '' is), the dropout `Math.ceil(n/(1-drop/100))`, the `lab`
   thresholds, every error string and sentence; in the simulator `seed||1`, the d and n guards, `Math.round(100*sig.length/k)`, the bins (lo -0.6, hi `Math.max(2.0,d+1.4)`, width 0.1),
   `0.82*H`, every `toFixed(1)` coordinate, `mean(pos)>d*1.1`, the svg string and the paragraphs (with the `&lt;` of `p &lt; .05` as v1 wrote it into innerHTML).
   What differs from v1's text:
   - types and `export`; v1's `I=PW_INFO[t]` is typed PwInfoEntry (PW_INFO is `as const`, and only ind and anova carry `per`), and `spec` is a PowerSpec;
   - pwNum takes the field's string (v1: `pwNum(id)` reads `document.getElementById(id).value`); powerCompute takes PowerInput, the raw strings of #pwTest, #pwSolve, #pwAlpha,
     #pwTails, #pwDrop, #pwEffect, #pwN, #pwPow, #pwK, #pwP and #pwDf, and applies pwNum and `parseInt(…,10)` exactly where pwRun does;
   - pwRun's `err(m)` (`out.innerHTML='<p class="desc" style="color:var(--danger,#b91c1c)">'+m+'</p>'`) returns `{ ok: false, error: m }`; the `html+=` pieces become StatsBlock values in the
     same order: the `<h4 style="margin:6px 0">` a heading of its text, a `<p class="desc">` a note of its innerHTML, the `<table class="stats-table">` a table whose first row is the
     `th` cells (v1's `[0.8,0.9,0.95].map(…).join('')`, which gives '' for a target pwSolveN cannot reach, becomes a forEach that pushes a row only when nn is not null: the same
     rows); `sentence` is returned as v1 put it into #pwSentence; the static footer pwRun appends after every result (13527-13529: the "For your methods section or ethics form:" note, the
     #pwSentence box with its "Copy sentence" button, the closing note) is POWER_FOOTER_NOTE, for the panel to render; `values` holds what the branch computed (mode n: n, total, pw
     and, with dropout, rec; mode power: n, pw; mode effect: n, e);
   - plRun's parsing (9009) is simulatorParse, which takes the four field strings; simulatorCompute takes the parsed numbers and applies `seed||1` again (a direct caller's 0 runs as 1,
     as v1's field does); a refusal (`out.innerHTML='<span class="ap-warn">'+m+'</span>'`) returns `{ ok: false, warn: m }`; the string v1 assigns to #plOut.innerHTML is split into
     `banner` (the div.ap-banner's text), `texts` (each `<p>`'s innerHTML, in order) and `svg`, and simulatorHtml joins them back into v1's string, with v1's tags and styles;
     `window._plLast=…` becomes the returned `last`, whose meanSig is `meanPos`, the one `mean(pos)` (v1 calls mean(pos) again for _plLast: the same value); `bins` is typed, and `bins[i]!` carries the `!` of noUncheckedIndexedAccess.
   Register rows: F19 (correlation power by Fisher z, in pwPower), D-W2-20 (the mode n note's "For a " before every test name) and D-W2-21 (the simulator's average over the significant
   studies with a positive d, NaN when there are none). */

export type PowerTestKey = keyof typeof PW_INFO;
export type PowerMode = "n" | "power" | "effect";
/** The raw strings of the calculator's fields, as pwRun reads them. */
export type PowerInput = { test: PowerTestKey; mode: PowerMode; alpha: string; tails: string; drop: string; effect: string; n: string; power: string; k: string; p: string; df: string };
export type PowerResult = { ok: true; blocks: StatsBlock[]; sentence: string; values: Record<string, number> } | { ok: false; error: string };
type PwInfoEntry = { name: string; eff: string; sym: string; conv: readonly [number, number, number]; def: string; nLbl: string; per?: boolean; hint: string };

/** The static part pwRun appends under every result (13527-13529): the label above the sentence box, the copy button's label, and the closing note. */
export const POWER_FOOTER_NOTE = {
  methods: "<b>For your methods section or ethics form:</b>",
  copy: "Copy sentence",
  caveat: "Power is worked out for one planned test, with the assumptions of that test. A study that plans several tests, a dropout rate you cannot predict, or data that break the assumptions will need a larger sample. A supervisor or statistician should confirm the effect size you chose.",
} as const;

export function pwArt(w: string): string {return /^(one|u)/i.test(w)?'a':/^[aeiou]/i.test(w)?'an':'a'}
export function pwNum(raw: string): number {const v=parseFloat(String(raw).replace(',','.').trim());return v}

export function powerCompute(input: PowerInput): PowerResult {
  const t=input.test,mode=input.mode,I: PwInfoEntry=PW_INFO[t];
  const err=(m: string): PowerResult=>({ok:false,error:m});
  const alpha=pwNum(input.alpha),tails=parseInt(input.tails,10),drop=Math.max(0,pwNum(input.drop)||0);
  if(!(alpha>0&&alpha<0.5))return err('Alpha must be between 0 and .5 (usually .05).');
  if(drop>=90)return err('Dropout must be below 90%.');
  const spec: PowerSpec={test:t as PowerTest,alpha:alpha,tails:(t==='anova'||t==='regr'||t==='chisq')?2:tails};
  if(t==='anova'){spec.k=Math.round(pwNum(input.k));if(!(spec.k>=3&&spec.k<=20))return err('Give 3 to 20 groups. For two groups use the independent-samples t-test.')}
  if(t==='regr'){spec.p=Math.round(pwNum(input.p));if(!(spec.p>=1&&spec.p<=50))return err('Give 1 to 50 predictors.')}
  if(t==='chisq'){spec.df=Math.round(pwNum(input.df));if(!(spec.df>=1&&spec.df<=100))return err('Give the degrees of freedom, 1 to 100.')}
  const f2=(x: number)=>(Math.abs(x)<10?x.toFixed(2):x.toFixed(1)).replace(/^(-?)0\./,'$1.'),pf=(x: number)=>x.toFixed(2).replace(/^0\./,'.');
  const effTxt=(e: number)=>I.sym+' = '+(t==='corr'||t==='chisq'||t==='anova'||t==='regr'?f2(e):e.toFixed(2));
  const tailTxt=(t==='anova'||t==='regr'||t==='chisq')?'':(spec.tails===2?'two-tailed, ':'one-tailed, ');
  const tname=I.name;const blocks: StatsBlock[]=[];let sentence='';const values: Record<string, number>={};
  if(mode==='n'){
    spec.effect=pwNum(input.effect);const target=pwNum(input.power);
    if(!(spec.effect>0))return err('The effect size must be above zero.');
    if(t==='corr'&&spec.effect>=0.99)return err('r must be below 1.');
    if(!(target>=0.5&&target<0.9999))return err('Power must be between .50 and .9999 (usually .80).');
    const n=pwSolveN(spec,target);
    if(n===null)return err('That effect is so small that the sample would exceed 200,000. Check the effect size.');
    const total=(I.per?n*(t==='anova'?spec.k!:2):n),pw=pwPower(spec,n);
    values.n=n;values.total=total;values.pw=pw;
    blocks.push({kind:'heading',text:(I.per?n+' people in each group ('+total+' in total)':n+' people')});
    blocks.push({kind:'note',html:'For a '+tname+' ('+tailTxt+'α = '+f2(alpha)+', '+effTxt(spec.effect)+') the power at this size is '+pf(pw)+'.'});
    const rows: string[][]=[];
    [0.8,0.9,0.95].forEach(q=>{const nn=pwSolveN(spec,q);if(nn!==null)rows.push([pf(q),(I.per?nn+' per group ('+nn*(t==='anova'?spec.k!:2)+' in total)':String(nn))])});
    blocks.push({kind:'table',rows:[['Power','People needed'],...rows]});
    sentence='An a priori power analysis for '+pwArt(tname)+' '+tname+' ('+tailTxt+'α = '+f2(alpha)+', '+effTxt(spec.effect)+', power = '+pf(target)+') showed that '+(I.per?n+' participants per group (N = '+total+')':n+' participants')+' were needed.';
    if(drop>0){const gN=I.per?(t==='anova'?spec.k!:2):1,recG=Math.ceil(n/(1-drop/100)),rec=recG*gN;values.rec=rec;blocks.push({kind:'note',html:'With '+drop+'% expected dropout, recruit about <b>'+(I.per?recG+' per group ('+rec+' in total)':rec)+'</b>, so that at least '+total+' complete cases remain.'});sentence+=' Allowing for '+drop+'% dropout, the target was '+rec+' participants'+(I.per?' in total':'')+'.'}
  }else if(mode==='power'){
    spec.effect=pwNum(input.effect);const n=Math.round(pwNum(input.n));
    if(!(spec.effect>0))return err('The effect size must be above zero.');
    if(t==='corr'&&spec.effect>=0.99)return err('r must be below 1.');
    if(!(n>=3))return err('Give the sample size (3 or more).');
    const pw=pwPower(spec,n);if(!isFinite(pw))return err('That sample is too small for this test and design.');
    values.n=n;values.pw=pw;
    blocks.push({kind:'heading',text:'Power = '+pf(pw)},{kind:'note',html:'For '+(I.per?n+' people in each group':n+' people')+' in '+pwArt(tname)+' '+tname+' ('+tailTxt+'α = '+f2(alpha)+', '+effTxt(spec.effect)+'). '+(pw<0.8?'This is below the usual .80, so a real effect of this size would be missed more than one time in five.':'This reaches the usual .80.')});
    sentence='With '+(I.per?n+' participants per group':n+' participants')+', '+pwArt(tname)+' '+tname+' ('+tailTxt+'α = '+f2(alpha)+') has power = '+pf(pw)+' to detect '+effTxt(spec.effect)+'.';
  }else{
    const n=Math.round(pwNum(input.n)),target=pwNum(input.power);
    if(!(n>=3))return err('Give the sample size (3 or more).');
    if(!(target>=0.5&&target<0.9999))return err('Power must be between .50 and .9999 (usually .80).');
    const e=pwSolveEffect(spec,n,target);if(e===null)return err('No effect in the usual range reaches that power with this sample.');
    values.n=n;values.e=e;
    const lab=e<I.conv[0]?'below small':e<I.conv[1]?'between small and medium':e<I.conv[2]?'between medium and large':'large or above';
    blocks.push({kind:'heading',text:'Smallest detectable effect: '+effTxt(e)},{kind:'note',html:'With '+(I.per?n+' people in each group':n+' people')+' in '+pwArt(tname)+' '+tname+' ('+tailTxt+'α = '+f2(alpha)+', power = '+pf(target)+'). By Cohen\'s benchmarks that is '+lab+'. Smaller true effects would often go undetected.'});
    sentence='A sensitivity analysis for '+pwArt(tname)+' '+tname+' with '+(I.per?n+' participants per group':n+' participants')+' ('+tailTxt+'α = '+f2(alpha)+', power = '+pf(target)+') showed that the smallest detectable effect was '+effTxt(e)+'.';
  }
  return {ok:true,blocks,sentence,values};
}

export type SimBin = { s: number; u: number };
export type SimLast = { d: number; n: number; k: number; seed: number; sig: number; meanSig: number; pw: number };
export type SimResult =
  | { ok: true; res: SimRun[]; sig: SimRun[]; pos: SimRun[]; rate: number; meanPos: number; pw: number; bins: SimBin[]; banner: string; svg: string; texts: string[]; last: SimLast }
  | { ok: false; warn: string };

/** plRun's reading of #plD, #plN, #plK and #plSeed (9009). */
export function simulatorParse(raw: { d: string; n: string; k: string; seed: string }): { d: number; n: number; k: number; seed: number } {
  const d=parseFloat(String(raw.d).replace(',','.')),n=parseInt(raw.n,10),k=parseInt(raw.k,10),seed=parseInt(raw.seed,10)||1;
  return {d,n,k,seed};
}

export function simulatorCompute(d: number, n: number, k: number, seed: number): SimResult {
  seed=seed||1;
  if(!(d>=0.1&&d<=2)){return {ok:false,warn:'Choose a true effect size d between 0.1 and 2.'}}
  if(!(n>=5&&n<=2000)){return {ok:false,warn:'Choose between 5 and 2000 people per group.'}}
  const res=plSim(d,n,k,seed),sig=res.filter(x=>x.sig),pos=sig.filter(x=>x.d>0);
  const pw=pwPower({test:'ind',effect:d,alpha:0.05,tails:2},n);
  const mean=(a: SimRun[])=>a.length?a.reduce((x,y)=>x+y.d,0)/a.length:NaN;
  const rate=Math.round(100*sig.length/k);
  const lo=-0.6,hi=Math.max(2.0,d+1.4),bw=0.1,nb=Math.ceil((hi-lo)/bw),bins: SimBin[]=[];
  for(let i=0;i<nb;i++)bins.push({s:0,u:0});
  res.forEach(x=>{let i=Math.floor((x.d-lo)/bw);i=Math.max(0,Math.min(nb-1,i));if(x.sig)bins[i]!.s++;else bins[i]!.u++});
  const mx=Math.max.apply(null,bins.map(b=>b.s+b.u))||1,W=520,H=150,bwid=W/nb;
  let svg='<svg viewBox="0 0 '+W+' '+(H+22)+'" width="100%" role="img" aria-label="Observed effect sizes of '+k+' simulated studies. Studies with p below .05 are dark. True effect '+d+'.">';
  bins.forEach((b,i)=>{
    const hu=0.82*H*b.u/mx,hs=0.82*H*b.s/mx,x=i*bwid+1;
    svg+='<rect x="'+x.toFixed(1)+'" y="'+(H-hu).toFixed(1)+'" width="'+(bwid-2).toFixed(1)+'" height="'+hu.toFixed(1)+'" fill="#b8b3c9"/>';
    svg+='<rect x="'+x.toFixed(1)+'" y="'+(H-hu-hs).toFixed(1)+'" width="'+(bwid-2).toFixed(1)+'" height="'+hs.toFixed(1)+'" fill="#6d28d9"/>';
  });
  const tx=(v: number)=>((v-lo)/(hi-lo)*W).toFixed(1);
  svg+='<line x1="'+tx(d)+'" x2="'+tx(d)+'" y1="0" y2="'+H+'" stroke="#111" stroke-width="2" stroke-dasharray="4 3"/>';
  svg+='<text x="'+(+tx(d)+4)+'" y="12" font-size="11" fill="currentColor">true d = '+d+'</text>';
  for(let v=Math.ceil(lo);v<hi-0.15;v+=0.5){svg+='<text x="'+tx(v)+'" y="'+(H+14)+'" font-size="10" text-anchor="middle" fill="currentColor">'+v.toFixed(1)+'</text>'}
  svg+='</svg>';
  const banner='SIMULATED. '+k+' pretend studies, '+n+' people per group, true d = '+d+'. None of this is real data.';
  const texts: string[]=[];
  texts.push('<b>'+sig.length+' of '+k+' pretend studies ('+rate+'%) reached p &lt; .05.</b> The power calculator gives '+(isFinite(pw)?Math.round(pw*100)+'%':'no value')+' for these inputs. The two agree up to chance; a longer run agrees more closely.');
  texts.push((k-sig.length)+' studies missed an effect that is really there. Each of those teams would have written "no difference".');
  if(sig.length)texts.push('Among the studies that did reach p &lt; .05, the average observed d was <b>'+mean(pos).toFixed(2)+'</b>. The truth is '+d+'. '+(mean(pos)>d*1.1?'Low-powered studies that succeed overstate the effect, because only the lucky large results get over the line. This is why small published effects often shrink when someone repeats the study.':'With this much power the successful studies sit close to the truth.'));
  texts.push('Each bar counts pretend studies by the effect size they observed. Dark bars reached p &lt; .05; grey bars did not. The dashed line is the true effect.');
  texts.push('<b>Professor RAJ</b> <span style="font-size:11px;color:var(--muted)">(AI character)</span>: Run n = 15, then n = 120. Watch the dark bars climb and the lucky tail disappear.');
  texts.push('Teaching tool only. It assumes normal data and equal group sizes and shows nothing about any real study. Written by AI, checked against the power calculator on this page; no human reviewer yet.');
  const meanPos=mean(pos);
  return {ok:true,res,sig,pos,rate,meanPos,pw,bins,banner,svg,texts,last:{d:d,n:n,k:k,seed:seed,sig:sig.length,meanSig:meanPos,pw:pw}};
}

/**
 * The string plRun assigns to #plOut.innerHTML (9031-9040) for a result: the banner div, the paragraphs above the chart (two, or three when a study reached p < .05) in
 * `<p style="margin:6px 0">`, the svg, then the caption, Professor RAJ's line and the teaching note with v1's styles; a refusal's `<span class="ap-warn">`.
 */
export function simulatorHtml(r: SimResult): string {
  if(!r.ok)return '<span class="ap-warn">'+r.warn+'</span>';
  const above=r.texts.length-3,P='<p style="margin:6px 0">';
  let h='<div class="ap-banner">'+r.banner+'</div>';
  for(let i=0;i<above;i++)h+=P+r.texts[i]!+'</p>';
  h+=r.svg;
  h+='<p style="font-size:12px;color:var(--muted);margin:2px 0">'+r.texts[above]!+'</p>';
  h+=P+r.texts[above+1]!+'</p>';
  h+='<p style="font-size:11px;color:var(--muted);margin:4px 0">'+r.texts[above+2]!+'</p>';
  return h;
}
