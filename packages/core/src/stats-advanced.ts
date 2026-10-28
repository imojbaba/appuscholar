import { escHTML } from "./html";
import { pFromChi, pFromF, pFromT } from "./pvalue";
import { fmtP, noLead, pCell } from "./statfmt";
import { smean, ssd, stkOLS, stkTCrit } from "./statsmath";
import { finishResult, gv, sig, statsToast } from "./stats-core";
import type { StatsBlock, StatsCtx, StatsResult } from "./stats-core";

/* The last three branches of statsRunNow: `moderate`, moderation with mean-centred predictors, the simple slopes at the moderator's mean and one SD either side, and the
   Johnson-Neyman region (13025-13072), `mediate`, the a, b, c′ and c paths with the indirect effect's seeded percentile bootstrap (13073-13115), and `mixed`, the mixed ANOVA with one
   between-people factor and one within-people factor, Mauchly's test and the Greenhouse-Geisser and Huynh-Feldt corrections (13334-13399). Each is v1's branch as v1 wrote it, in
   the shape of stats-models.ts: the same reads of the form (`gv` for moderate's dv, x and w, mediate's x, m and dv and mixed's grp, the ticked `items` for mixed), the same toasts (a
   toast and return becomes statsToast), the same arithmetic, literals and toFixed calls, the same table cells and note innerHTML, and the same sentence, handed to finishResult as v1
   hands them to statsResultsShow.
   What differs from v1's text, in all three branches:
   - `d` is `ctx.data`; v1's `gv('x')` is `gv(ctx,'x')`; mixed's `Array.from(document.querySelectorAll('.sfm_items:checked')).map(c=>parseInt(c.value,10))` is
     `ctx.form.ticked.items??[]` (the form already holds the indexes as numbers, in column order), then v1's `.filter(i=>i!==gI)`; `d.cols[i].name` and the indexed reads whose value is
     used as a number or an array carry `!` (noUncheckedIndexedAccess: `r[xI]` inside parseFloat, `wc[i]`, `o.beta[j]`, `V[j][j]`, `cuts[i]`, `X[j]`, `ix[i]`, `ok[lo]`, `oa.beta[1]`,
     `oa.inv[1][1]`, `r[i]`, `mg[gi[i]][c]`, `Mall[c]`, `ng[q]`, `gmn[gi[i]]`, `A[a][b]`, `M2[b][a]`; a missing column still throws, as in v1, and runStats turns the throw into v1's
     catch toast); the label reads that only go into escHTML or a string concatenation (`nm[j]`, `gl[ng.findIndex(...)]`) have no `!`; moderate's reduced model `stkOLS([xc,wc],Y0)`
     carries `!` (v1 reads `o0.sse` unchecked; a null throws into the catch toast in both);
   - `showToast(x);return` is `return statsToast(key,x)`; `statsResultsShow(html,apa)` is `finishResult(ctx,key,blocks,apa,values)`; the chart after it (statsChartSlopes 13072,
     statsChartBarMeans 13115, statsChartInteraction 13399) is not ported (F27);
   - `window._statsSkipped=(window._statsSkipped||0)+dropped` (moderate 13030, mediate 13078) is `ctx.skipped=(ctx.skipped||0)+dropped`, and mixed's
     `window._statsSkipped=(window._statsSkipped||0)+1` in its row filter is `ctx.skipped=(ctx.skipped||0)+1`, at the same points;
   - a table v1 built by concatenation is one table block whose rows are its `<tr>`s, each the `th` and `td` cells in order; mixed's `<tr><td colspan="7"><b>Between people</b></td></tr>`
     and `...Within people...` are rows of one cell, `<b>Between people</b>` and `<b>Within people</b>`; a cell v1 wrote as a bare number (`v.length`) is `String(x)`, the same text; a
     `<p class="desc">` is a note of the same innerHTML; the `class` and `style` attributes are the page's layout and are not carried (a block has no attributes); the strings v1
     concatenated (moderate's `rows`, `slRows` and `html`, mediate's `html`, mixed's `html`) are arrays pushed in the same order, v1's `html+=(k>2?a:'')` inside the Source table is
     `if(k>2)rows.push(a)` and v1's `if(c)html+=a;else html+=b` is `if(c)html.push(a);else html.push(b)`;
   - v1's closures and arrays get parameter and element types (`fw`, `rowOf`, `f3`, `pr`, `qf`, mixed's `row`, `pe`, `cellX`, `dfTxt`, `dd`; `new Array(n)` is `new Array<number>(n)`,
     `new Array(k).fill(0)` is `new Array<number>(k).fill(0)`); mixed's `row` takes `number | null` for F, p and e2, as v1 passes null;
   - mixed: v1's `let eps=1,gg=1,hf=1,W=1,chi=0,pM=1,dfM=0,mauchOK=false` declares `eps` and never reads it (the branch uses `epsV`): it goes (the no-unused-vars rule);
   - each runner returns finishResult's result with `values`, the raw numbers behind the cells (register row F27): moderate n, r2, F, pF, dr2, Fc, pFc, and for each coefficient j of
     v1's loop (0 the intercept, 1 X, 2 W, 3 the product, v1's `nm` order) b_<j>, se_<j>, t_<j>, p_<j>; for the simple slopes q of lo, mid, hi (mean − 1 SD, mean, mean + 1 SD)
     sl_<q>_b, sl_<q>_se, sl_<q>_p (the SE beside the brief's slope and p, so that the reference can hold it); and roots, the number of Johnson-Neyman points inside the observed range;
     mediate n, a_b, a_p, b_b, b_p, cp_b, cp_p, c_b, c_p, ab, lo, hi, bse, abStd, r2m, r2y and okCount, the resamples that could be calculated; mixed n, G, k, SSg, SSs, SSt, SSi, E, Fg,
     pg, Ft, pt, Fi, pi, gg, hf, W, chi, pM, epsV, ptc, pic, peg, pet, pei (with k = 2 v1's starting values: gg, hf and W 1, chi 0, pM 1, epsV 1).
   Per branch, the rest is v1's character for character, including:
   - moderate: the toasts in v1's order (`new Set([yI,xI,wI]).size<3`, `n<10` with the count, `!(sdx>0)||!(sdw>0)`, stkOLS's null, `dfe<1`, `!(o.sse>1e-9*o.sst)`); the row filter
     (an empty or undefined cell, or a value parseFloat does not make finite, drops the row and counts it in `dropped`); centring on the means, `ic` the product of the centred columns;
     `V` the inverse times mse, `stkTCrit(dfe,0.05)`, R², F on (3, dfe), ΔR² and F change on (1, dfe) from the model without the product; the coefficient rows with the t interval; the
     simple slopes at `[-sdw,0,sdw]` with `V[1][1]+2*lev*V[1][3]+lev*lev*V[3][3]` and the labels 'Low (W = mean − 1 SD)', 'Average (W = mean)', 'High (W = mean + 1 SD)' followed by
     ' = ' and the raw level to 2 decimals; Johnson-Neyman: the quadratic `A`, `B`, `C` in the centred moderator, the `Math.abs(A)>1e-12` and `Math.abs(B)>1e-12` guards, the roots
     strictly inside (wlo, whi), sorted, the segments' midpoints tested by `A*mid*mid+B*mid+C>0`, `fw` adding the mean back with toFixed(2), and the three sentences (every segment
     significant, none, or the significant segments with 'at or below ', 'from ', ' upward', ' to ', joined by ' and '); the notes (`n<50`, the dropped rows with 'row was' /
     'rows were'); the sentence with the product's b, SE and t and `fmtP(pFc)`;
   - mediate: the toasts in v1's order (`new Set([yI,xI,mI]).size<3`, `n<20` with the count, `!(ssd(X)>0)||!(ssd(M)>0)||!(ssd(Y)>0)`, any of the three stkOLS null, any of the three
     `!(o.sse>1e-9*o.sst)`); `rowOf` with `Math.sqrt(inv*sse/df)` and `stkTCrit(df,0.05)`; the bootstrap: `REPS=5000`, the seed `(n*2654435761+12345)>>>0` (a plain number product,
     not Math.imul, so it depends on n alone: register row F14), the `rnd` closure's `0x6D2B79F5` step and its two Math.imul mixes, `Math.floor(rnd()*n)`, the resample's a·b from
     centred sums with `den>1e-12*Math.abs(smm*sxx)` and NaN otherwise, the finite ones sorted, `qf`'s linear interpolation at .025 and .975, `bse` the SD of the finite ones; `abStd`,
     `sigAB=lo>0||hi<0`; the notes (`n<100`, the resamples left out, the dropped rows); `REPS.toLocaleString('en-US')` in the note and the sentence (5,000 in Node and Chrome, register
     row D-W2-7); the causal note; the sentence;
   - mixed: the toasts in v1's order (`<2` columns, `>8`, `G<2`, `G>6`, a group under 2 people with its label, `n-G<k`, `!(E>1e-9*(E+SSt+SSi))||!(SSs>0)`); the groups in data
     order (`gl.indexOf`, 13341: not object-key order, so groups 10 and 2 stay 10, 2); the Helmert rows `H` normalised by `Math.sqrt(r*(r+1))`, `Y` the contrast scores, `mg` the group
     means of the contrasts, `Mall`, `E`, `varf=(1/(G*G))*sum(1/ng)`, `SSt` from the unweighted mean of the group means over `varf`, `SSi`, the between-people `SSg` and `SSs` from the
     person means; the F tests; with k > 2 the pooled within-group covariance `A` over n − G, gg, hf with `Math.min(1, ...)`, the determinant by partial pivoting with `1e-300`,
     Mauchly's W, `fW`, `dfM`, `mauchOK`, `chi=Math.max(0,-(n-G-fW)*Math.log(Math.min(W,1)))`; `epsV=k>2?(useGG?gg:hf):1`; the means table; `row` with its `1e-9` test for a whole df;
     the Source rows, the corrected rows only when k > 2; the sphericity note or the 'With two conditions' note; the unequal-sizes note; the Box's M note; the interaction note's two
     arms; `dfTxt`, `dd` with its `1e-9`, the sentence and its k > 2 tail. */

type Path = { b: number; se: number; t: number; p: number; lo: number; hi: number; df: number };

export function runModerate(ctx: StatsCtx): StatsResult{
  const d=ctx.data;
  const yI=parseInt(gv(ctx,'dv'),10),xI=parseInt(gv(ctx,'x'),10),wI=parseInt(gv(ctx,'w'),10);
  if(new Set([yI,xI,wI]).size<3){return statsToast('moderate','Choose three different columns for Y, X and W')}
  const yN=d.cols[yI]!.name,xN=d.cols[xI]!.name,wN=d.cols[wI]!.name,X0: number[]=[],W0: number[]=[],Y0: number[]=[];let dropped=0;
  d.rows.forEach(r=>{const a=parseFloat(r[xI]!),b=parseFloat(r[wI]!),c=parseFloat(r[yI]!);if([r[xI],r[wI],r[yI]].some(v=>v===''||v===undefined)||![a,b,c].every(isFinite)){dropped++;return}X0.push(a);W0.push(b);Y0.push(c)});
  ctx.skipped=(ctx.skipped||0)+dropped;
  const n=Y0.length;
  if(n<10){return statsToast('moderate','Need at least 10 people with all three values; there are '+n)}
  const mx=smean(X0),mw=smean(W0),sdx=ssd(X0),sdw=ssd(W0);
  if(!(sdx>0)||!(sdw>0)){return statsToast('moderate','X and W each need some variation (not every person the same)')}
  const xc=X0.map(v=>v-mx),wc=W0.map(v=>v-mw),ic=xc.map((v,i)=>v*wc[i]!);
  const o=stkOLS([xc,wc,ic],Y0);
  if(!o){return statsToast('moderate','The interaction cannot be calculated: X, W and their product carry the same information (for example, W is a copy of X).')}
  const dfe=n-4;if(dfe<1){return statsToast('moderate','Too few people for this model')}
  if(!(o.sse>1e-9*o.sst)){return statsToast('moderate','The model fits Y exactly, so standard errors cannot be calculated')}
  const mse=o.sse/dfe,V=o.inv.map(r=>r.map(v=>v*mse)),tc=stkTCrit(dfe,0.05),r2=1-o.sse/o.sst,F=(r2/3)/((1-r2)/dfe),pF=pFromF(F,3,dfe);
  const o0=stkOLS([xc,wc],Y0)!,dr2=(o0.sse-o.sse)/o.sst,Fc=(o0.sse-o.sse)/mse,pFc=pFromF(Fc,1,dfe);
  const nm=['Intercept',xN+' (centred)',wN+' (centred)',xN+' × '+wN];const rows: string[][]=[];const co: Array<{ b: number; se: number; t: number; p: number }>=[];
  const values: Record<string, number>={n:n,r2:r2,F:F,pF:pF,dr2:dr2,Fc:Fc,pFc:pFc};
  for(let j=0;j<4;j++){const b=o.beta[j]!,se=Math.sqrt(V[j]![j]!),t=b/se,pj=pFromT(t,dfe);co.push({b:b,se:se,t:t,p:pj});
    rows.push([escHTML(nm[j]),b.toFixed(3),se.toFixed(3),t.toFixed(2),pCell(pj),'['+(b-tc*se).toFixed(3)+', '+(b+tc*se).toFixed(3)+']']);
    values['b_'+j]=b;values['se_'+j]=se;values['t_'+j]=t;values['p_'+j]=pj}
  const sl=[-sdw,0,sdw].map((lev,q)=>{const sv=o.beta[1]!+o.beta[3]!*lev,vv=V[1]![1]!+2*lev*V[1]![3]!+lev*lev*V[3]![3]!,se=Math.sqrt(vv),t=sv/se;return{lev:lev,raw:mw+lev,b:sv,se:se,t:t,p:pFromT(t,dfe),lo:sv-tc*se,hi:sv+tc*se,lab:['Low ('+wN+' = mean − 1 SD)','Average ('+wN+' = mean)','High ('+wN+' = mean + 1 SD)'][q]!}});
  const slRows=sl.map(q=>[escHTML(q.lab)+' = '+q.raw.toFixed(2),q.b.toFixed(3),q.se.toFixed(3),q.t.toFixed(2),pCell(q.p),'['+q.lo.toFixed(3)+', '+q.hi.toFixed(3)+']']);
  ['lo','mid','hi'].forEach((q,i)=>{values['sl_'+q+'_b']=sl[i]!.b;values['sl_'+q+'_se']=sl[i]!.se;values['sl_'+q+'_p']=sl[i]!.p});
  // Johnson-Neyman: where is the slope of X significant, across the observed range of W
  const A=o.beta[3]!*o.beta[3]!-tc*tc*V[3]![3]!,B=2*(o.beta[1]!*o.beta[3]!-tc*tc*V[1]![3]!),C=o.beta[1]!*o.beta[1]!-tc*tc*V[1]![1]!;
  const wlo=Math.min.apply(null,wc),whi=Math.max.apply(null,wc);
  const roots: number[]=[];const disc=B*B-4*A*C;
  if(Math.abs(A)>1e-12){if(disc>0){const sq=Math.sqrt(disc);[(-B-sq)/(2*A),(-B+sq)/(2*A)].forEach(r=>{if(r>wlo&&r<whi)roots.push(r)})}}else if(Math.abs(B)>1e-12){const r=-C/B;if(r>wlo&&r<whi)roots.push(r)}
  roots.sort((a,b)=>a-b);const cuts=[wlo].concat(roots,[whi]),segs: Array<{ lo: number; hi: number; sig: boolean }>=[];
  for(let i=0;i<cuts.length-1;i++){const mid=(cuts[i]!+cuts[i+1]!)/2;segs.push({lo:cuts[i]!,hi:cuts[i+1]!,sig:A*mid*mid+B*mid+C>0})}
  values.roots=roots.length;
  const fw=(v: number)=>(v+mw).toFixed(2);
  let jn='';
  if(segs.every(q=>q.sig))jn='The effect of '+escHTML(xN)+' on '+escHTML(yN)+' is significant at every value of '+escHTML(wN)+' in your data ('+fw(wlo)+' to '+fw(whi)+').';
  else if(segs.every(q=>!q.sig))jn='The effect of '+escHTML(xN)+' on '+escHTML(yN)+' is not significant at any value of '+escHTML(wN)+' in your data ('+fw(wlo)+' to '+fw(whi)+').';
  else jn='The effect of '+escHTML(xN)+' on '+escHTML(yN)+' is significant where '+escHTML(wN)+' is '+segs.filter(q=>q.sig).map(q=>(q.lo===wlo?'at or below ':'from ')+(q.lo===wlo?fw(q.hi):fw(q.lo)+(q.hi===whi?' upward':' to '+fw(q.hi)))).join(' and ')+', and not significant elsewhere in the observed range ('+fw(wlo)+' to '+fw(whi)+'). These cut-offs are the Johnson-Neyman points.';
  let notes='';
  if(n<50)notes+=' With fewer than 50 people the test of an interaction has very little power, so a non-significant result says little.';
  if(dropped)notes+=' '+dropped+' row'+(dropped===1?' was':'s were')+' left out because a value was missing.';
  const html: StatsBlock[]=[{kind:'note',html:'Model: '+escHTML(yN)+' predicted from '+escHTML(xN)+', '+escHTML(wN)+' and their product. N = '+n+'. '+escHTML(xN)+' and '+escHTML(wN)+' are centred on their means, so the coefficient for each of them is its effect at the average of the other.'},
    {kind:'table',rows:[['R²','F','df','p','ΔR² for the interaction','F change','df','p'],[noLead(r2.toFixed(3)),F.toFixed(2),'3, '+dfe,pCell(pF),noLead(dr2.toFixed(3)),Fc.toFixed(2),'1, '+dfe,pCell(pFc)]]},
    {kind:'table',rows:[['Term','b','SE','t','p','95% CI for b'],...rows]},
    {kind:'note',html:'<b>Simple slopes</b>: the effect of '+escHTML(xN)+' on '+escHTML(yN)+' at three levels of '+escHTML(wN)+'.'},
    {kind:'table',rows:[['Level of the moderator','Slope of X','SE','t','p','95% CI'],...slRows]},
    {kind:'note',html:jn+' The interaction p-value is the test of whether the slope changes with '+escHTML(wN)+'; the simple slopes describe the shape. A significant interaction does not show that '+escHTML(wN)+' causes the change.'+notes}];
  const sigI=pFc<0.05;
  const apa='A moderation analysis showed that '+wN+' '+(sigI?'significantly moderated':'did not significantly moderate')+' the effect of '+xN+' on '+yN+', b = '+co[3]!.b.toFixed(2)+', SE = '+co[3]!.se.toFixed(2)+', t('+dfe+') = '+co[3]!.t.toFixed(2)+', '+fmtP(pFc)+', ΔR² = '+noLead(dr2.toFixed(3))+'. The simple slope of '+xN+' was '+sl.map(q=>q.b.toFixed(2)+' ('+fmtP(q.p)+')').join(', ')+' at low, average and high '+wN+' (mean − 1 SD, mean, mean + 1 SD). Predictors were mean-centred.';
  return finishResult(ctx,'moderate',html,apa,values);
}

export function runMediate(ctx: StatsCtx): StatsResult{
  const d=ctx.data;
  const xI=parseInt(gv(ctx,'x'),10),mI=parseInt(gv(ctx,'m'),10),yI=parseInt(gv(ctx,'dv'),10);
  if(new Set([yI,xI,mI]).size<3){return statsToast('mediate','Choose three different columns for X, M and Y')}
  const xN=d.cols[xI]!.name,mN=d.cols[mI]!.name,yN=d.cols[yI]!.name,X: number[]=[],M: number[]=[],Y: number[]=[];let dropped=0;
  d.rows.forEach(r=>{const a=parseFloat(r[xI]!),b=parseFloat(r[mI]!),c=parseFloat(r[yI]!);if([r[xI],r[mI],r[yI]].some(v=>v===''||v===undefined)||![a,b,c].every(isFinite)){dropped++;return}X.push(a);M.push(b);Y.push(c)});
  ctx.skipped=(ctx.skipped||0)+dropped;
  const n=Y.length;
  if(n<20){return statsToast('mediate','Need at least 20 people with all three values; there are '+n+'. A bootstrap interval needs more, ideally 100 or more.')}
  if(!(ssd(X)>0)||!(ssd(M)>0)||!(ssd(Y)>0)){return statsToast('mediate','X, M and Y each need some variation')}
  const oa=stkOLS([X],M),ob=stkOLS([X,M],Y),oc=stkOLS([X],Y);
  if(!oa||!ob||!oc){return statsToast('mediate','X and M carry the same information (one is a copy of the other), so the paths cannot be separated.')}
  const dfa=n-2,dfb=n-3,dfc=n-2;
  if(!(oa.sse>1e-9*oa.sst)||!(ob.sse>1e-9*ob.sst)||!(oc.sse>1e-9*oc.sst)){return statsToast('mediate','A path fits perfectly, so standard errors cannot be calculated')}
  const rowOf=(b: number,inv: number,sse: number,df: number): Path=>{const se=Math.sqrt(inv*sse/df),t=b/se,tc=stkTCrit(df,0.05);return{b:b,se:se,t:t,p:pFromT(t,df),lo:b-tc*se,hi:b+tc*se,df:df}};
  const A=rowOf(oa.beta[1]!,oa.inv[1]![1]!,oa.sse,dfa),Bp=rowOf(ob.beta[2]!,ob.inv[2]![2]!,ob.sse,dfb),Cp=rowOf(ob.beta[1]!,ob.inv[1]![1]!,ob.sse,dfb),Ct=rowOf(oc.beta[1]!,oc.inv[1]![1]!,oc.sse,dfc);
  const ab=A.b*Bp.b;
  // percentile bootstrap, fixed seed so the same data always give the same interval
  const REPS=5000;let sd0=(n*2654435761+12345)>>>0;const rnd=()=>{sd0=(sd0+0x6D2B79F5)>>>0;let t=sd0;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296};
  const bs=new Array<number>(REPS);
  for(let rI=0;rI<REPS;rI++){let sx=0,sm=0,sy=0;const ix=new Array<number>(n);for(let i=0;i<n;i++){const j=Math.floor(rnd()*n);ix[i]=j;sx+=X[j]!;sm+=M[j]!;sy+=Y[j]!}
    sx/=n;sm/=n;sy/=n;let sxx=0,sxm=0,smm=0,sxy=0,smy=0;
    for(let i=0;i<n;i++){const j=ix[i]!,a=X[j]!-sx,b=M[j]!-sm,c=Y[j]!-sy;sxx+=a*a;sxm+=a*b;smm+=b*b;sxy+=a*c;smy+=b*c}
    const den=smm*sxx-sxm*sxm;bs[rI]=(sxx>0&&den>1e-12*Math.abs(smm*sxx))?(sxm/sxx)*((smy*sxx-sxy*sxm)/den):NaN}
  const ok=bs.filter(v=>isFinite(v)).sort((a,b)=>a-b),qf=(pq: number)=>{const pos=pq*(ok.length-1),lo=Math.floor(pos),hi=Math.ceil(pos);return ok[lo]!+(ok[hi]!-ok[lo]!)*(pos-lo)};
  const lo=qf(0.025),hi=qf(0.975),bse=Math.sqrt((()=>{const m=smean(ok);return ok.reduce((a,v)=>a+(v-m)*(v-m),0)/(ok.length-1)})());
  const abStd=ab*ssd(X)/ssd(Y),sigAB=lo>0||hi<0;
  const f3=(v: number)=>v.toFixed(3),pr=(lab: string,r: Path)=>[lab,f3(r.b),f3(r.se),r.t.toFixed(2),pCell(r.p),'['+f3(r.lo)+', '+f3(r.hi)+']'];
  const r2m=1-oa.sse/oa.sst,r2y=1-ob.sse/ob.sst;
  let notes='';
  if(n<100)notes+=' With fewer than 100 people the bootstrap interval is unstable and the test has low power.';
  if(ok.length<REPS)notes+=' '+(REPS-ok.length)+' of the '+REPS+' resamples could not be calculated and were left out.';
  if(dropped)notes+=' '+dropped+' row'+(dropped===1?' was':'s were')+' left out because a value was missing.';
  const html: StatsBlock[]=[{kind:'note',html:'Model: '+escHTML(xN)+' (X) → '+escHTML(mN)+' (M) → '+escHTML(yN)+' (Y). N = '+n+'.'},
    {kind:'table',rows:[['Path','b','SE','t','p','95% CI'],
      pr('a: '+escHTML(xN)+' → '+escHTML(mN),A),pr('b: '+escHTML(mN)+' → '+escHTML(yN)+' (controlling for '+escHTML(xN)+')',Bp),pr('c′ (direct): '+escHTML(xN)+' → '+escHTML(yN)+' (controlling for '+escHTML(mN)+')',Cp),pr('c (total): '+escHTML(xN)+' → '+escHTML(yN),Ct)]},
    {kind:'table',rows:[['Indirect effect (a × b)','Bootstrap SE','95% bootstrap CI','Standardised (X in SD units, Y in SD units)','R² of M','R² of Y'],[f3(ab),f3(bse),'['+f3(lo)+', '+f3(hi)+']',f3(abStd),noLead(r2m.toFixed(3)),noLead(r2y.toFixed(3))]]},
    {kind:'note',html:(sigAB?'The indirect effect is significant: the interval does not contain zero.':'The indirect effect is not significant: the interval contains zero.')+' The interval is a percentile bootstrap from '+REPS.toLocaleString('en-US')+' resamples with a fixed seed, so the same data always give the same interval. The total effect c equals the direct effect c′ plus the indirect effect a × b. The standardised value is a × b multiplied by the SD of X and divided by the SD of Y.'+notes},
    {kind:'note',html:'Mediation is a claim about causes. The statistics show whether the pattern fits the chain X → M → Y. They cannot show that M comes between X and Y in time, or rule out another variable that affects both M and Y. Data on all three variables measured at one time cannot establish the order. The p-values of the a, b and c paths are ordinary regression tests; the indirect effect is judged by its bootstrap interval.'}];
  const apa='A mediation analysis with a percentile bootstrap ('+REPS.toLocaleString('en-US')+' resamples) showed that the indirect effect of '+xN+' on '+yN+' through '+mN+' was '+(sigAB?'significant':'not significant')+', ab = '+f3(ab)+', 95% CI ['+f3(lo)+', '+f3(hi)+']. '+xN+' '+(A.p<0.05?'significantly predicted':'did not significantly predict')+' '+mN+' (a = '+A.b.toFixed(2)+', '+fmtP(A.p)+'), and '+mN+' '+(Bp.p<0.05?'significantly predicted':'did not significantly predict')+' '+yN+' when '+xN+' was controlled (b = '+Bp.b.toFixed(2)+', '+fmtP(Bp.p)+'). The direct effect was c′ = '+Cp.b.toFixed(2)+' ('+fmtP(Cp.p)+') and the total effect was c = '+Ct.b.toFixed(2)+' ('+fmtP(Ct.p)+').';
  const values: Record<string, number>={n:n,a_b:A.b,a_p:A.p,b_b:Bp.b,b_p:Bp.p,cp_b:Cp.b,cp_p:Cp.p,c_b:Ct.b,c_p:Ct.p,ab:ab,lo:lo,hi:hi,bse:bse,abStd:abStd,r2m:r2m,r2y:r2y,okCount:ok.length};
  return finishResult(ctx,'mediate',html,apa,values);
}

export function runMixed(ctx: StatsCtx): StatsResult{
  const d=ctx.data;
  const gI=parseInt(gv(ctx,'grp'),10),idxs=(ctx.form.ticked.items??[]).filter(i=>i!==gI);
  if(idxs.length<2){return statsToast('mixed','Tick at least 2 columns, one for each time point or condition.')}
  if(idxs.length>8){return statsToast('mixed','This test handles up to 8 conditions.')}
  const names=idxs.map(i=>d.cols[i]!.name),k=idxs.length,gName=d.cols[gI]!.name,X: number[][]=[],gl: string[]=[],gi: number[]=[];
  d.rows.forEach(r=>{
    const lab=String(r[gI]===undefined?'':r[gI]).trim(),row=idxs.map(i=>(r[i]===''||r[i]===undefined)?NaN:parseFloat(r[i]!));
    if(lab!==''&&row.every(isFinite)){let q=gl.indexOf(lab);if(q<0){gl.push(lab);q=gl.length-1}gi.push(q);X.push(row)}else ctx.skipped=(ctx.skipped||0)+1});
  const G=gl.length,n=X.length;
  if(G<2){return statsToast('mixed','The grouping variable needs at least 2 groups among the people with complete scores.')}
  if(G>6){return statsToast('mixed','This test handles up to 6 groups.')}
  const ng=gl.map((_,q)=>gi.filter(v=>v===q).length);
  if(ng.some(v=>v<2)){return statsToast('mixed','Every group needs at least 2 people with a score in every ticked column. Group "'+gl[ng.findIndex(v=>v<2)]+'" has fewer.')}
  if(n-G<k){return statsToast('mixed','Need more people: '+n+' people in '+G+' groups leave too few degrees of freedom for '+k+' conditions.')}
  const p1=k-1,H: number[][]=[];for(let r=1;r<k;r++){const row=new Array<number>(k).fill(0);for(let c=0;c<r;c++)row[c]=1;row[r]=-r;const nm2=Math.sqrt(r*(r+1));H.push(row.map(v=>v/nm2))}
  const Y=X.map(r=>H.map(h=>h.reduce((a,v,i)=>a+v*r[i]!,0)));
  const mg=gl.map((_,q)=>{const rows=Y.filter((_,i)=>gi[i]===q);return H.map((_,c)=>smean(rows.map(r=>r[c]!)))});
  const Mall=H.map((_,c)=>smean(Y.map(r=>r[c]!)));
  let E=0;Y.forEach((r,i)=>r.forEach((v,c)=>{E+=(v-mg[gi[i]!]![c]!)*(v-mg[gi[i]!]![c]!)}));
  const dfE=(n-G)*p1;
  const varf=(1/(G*G))*ng.reduce((a,v)=>a+1/v,0);
  let SSt=0;for(let c=0;c<p1;c++){const L=smean(mg.map(m=>m[c]!));SSt+=L*L/varf}
  let SSi=0;gl.forEach((_,q)=>{for(let c=0;c<p1;c++)SSi+=ng[q]!*(mg[q]![c]!-Mall[c]!)*(mg[q]![c]!-Mall[c]!)});
  const Sb=X.map(r=>smean(r)),Sm=smean(Sb),gmn=gl.map((_,q)=>smean(Sb.filter((_,i)=>gi[i]===q)));
  let SSg=0,SSs=0;gl.forEach((_,q)=>{SSg+=k*ng[q]!*(gmn[q]!-Sm)*(gmn[q]!-Sm)});Sb.forEach((v,i)=>{SSs+=k*(v-gmn[gi[i]!]!)*(v-gmn[gi[i]!]!)});
  if(!(E>1e-9*(E+SSt+SSi))||!(SSs>0)){return statsToast('mixed','There is no variation left inside the groups once the group means are removed, so the F tests cannot be calculated.')}
  const dfS=n-G,d1g=G-1,d1t=p1,d1i=(G-1)*p1;
  const Fg=(SSg/d1g)/(SSs/dfS),pg=pFromF(Fg,d1g,dfS),Ft=(SSt/d1t)/(E/dfE),Fi=(SSi/d1i)/(E/dfE),pt=pFromF(Ft,d1t,dfE),pi=pFromF(Fi,d1i,dfE);
  let gg=1,hf=1,W=1,chi=0,pM=1,dfM=0,mauchOK=false;
  if(k>2){
    const A: number[][]=[];for(let a=0;a<p1;a++){A.push([]);for(let b=0;b<p1;b++){let t2=0;Y.forEach((r,i)=>{t2+=(r[a]!-mg[gi[i]!]![a]!)*(r[b]!-mg[gi[i]!]![b]!)});A[a]!.push(t2/(n-G))}}
    let trA=0,trA2=0;for(let a=0;a<p1;a++){trA+=A[a]![a]!;for(let b=0;b<p1;b++)trA2+=A[a]![b]!*A[a]![b]!}
    gg=trA*trA/(p1*trA2);hf=Math.min(1,(n*p1*gg-2)/(p1*(n-G-p1*gg)));
    let det=1;{const M2=A.map(r=>r.slice());for(let a=0;a<p1;a++){let pv=a;for(let b=a+1;b<p1;b++)if(Math.abs(M2[b]![a]!)>Math.abs(M2[pv]![a]!))pv=b;if(Math.abs(M2[pv]![a]!)<1e-300){det=0;break}if(pv!==a){const tmp=M2[a]!;M2[a]=M2[pv]!;M2[pv]=tmp;det=-det}det*=M2[a]![a]!;for(let b=a+1;b<p1;b++){const f=M2[b]![a]!/M2[a]![a]!;for(let c=a;c<p1;c++)M2[b]![c]!-=f*M2[a]![c]!}}}
    W=det/Math.pow(trA/p1,p1);const fW=(2*p1*p1+p1+2)/(6*p1);dfM=k*(k-1)/2-1;
    mauchOK=isFinite(W)&&W>0;if(mauchOK){chi=Math.max(0,-(n-G-fW)*Math.log(Math.min(W,1)));pM=pFromChi(chi,dfM)}
  }
  const useGG=gg<0.75,epsV=k>2?(useGG?gg:hf):1,epsName=useGG?'Greenhouse-Geisser':'Huynh-Feldt';
  const ptc=pFromF(Ft,epsV*d1t,epsV*dfE),pic=pFromF(Fi,epsV*d1i,epsV*dfE);
  const pe=(a: number,b: number)=>a/(a+b),peg=pe(SSg,SSs),pet=pe(SSt,E),pei=pe(SSi,E);
  const cellX=(q: number,j: number)=>X.filter((_,i)=>gi[i]===q).map(r=>r[j]!);
  const means: string[][]=[[escHTML(gName),'Condition','N','M','SD']];
  gl.forEach((g,q)=>names.forEach((nm,j)=>{const v=cellX(q,j);means.push([escHTML(g),escHTML(nm),String(v.length),smean(v).toFixed(2),ssd(v).toFixed(2)])}));
  const html: StatsBlock[]=[{kind:'table',rows:means}];
  const row=(lab: string,ss: number,df: number,F: number | null,p: number | null,e2: number | null)=>[lab,ss.toFixed(2),(Math.abs(df-Math.round(df))<1e-9?String(Math.round(df)):df.toFixed(2)),(ss/df).toFixed(2),(F===null?'':F.toFixed(2)),(p===null?'':pCell(p)),(e2===null?'':noLead(e2.toFixed(3)))];
  const src: string[][]=[['Source','SS','df','MS','F','p','Partial η²'],
    ['<b>Between people</b>'],row(escHTML(gName),SSg,d1g,Fg,pg,peg),row('People within groups (error)',SSs,dfS,null,null,null),
    ['<b>Within people</b>'],row('Conditions (sphericity assumed)',SSt,d1t,Ft,pt,pet)];
  if(k>2)src.push(row('Conditions ('+epsName+')',SSt,epsV*d1t,Ft,ptc,pet));
  src.push(row(escHTML(gName)+' × conditions (sphericity assumed)',SSi,d1i,Fi,pi,pei));
  if(k>2)src.push(row(escHTML(gName)+' × conditions ('+epsName+')',SSi,epsV*d1i,Fi,pic,pei));
  src.push(row('Error (assumed)',E,dfE,null,null,null));
  if(k>2)src.push(row('Error ('+epsName+')',E,epsV*dfE,null,null,null));
  html.push({kind:'table',rows:src});
  if(k>2)html.push({kind:'note',html:'Sphericity (the differences between every pair of conditions have equal spread), checked on the within-group covariance pooled over all groups. '+(mauchOK?'Mauchly\'s W = '+W.toFixed(3)+', χ²('+dfM+') = '+chi.toFixed(2)+', '+fmtP(pM)+'. ':'Mauchly\'s test could not be calculated for these data. ')+
    'Greenhouse-Geisser ε = '+noLead(gg.toFixed(3))+', Huynh-Feldt ε = '+noLead(hf.toFixed(3))+'. The corrected rows to report are '+epsName+', chosen by the usual rule: Greenhouse-Geisser when ε is below .75, Huynh-Feldt otherwise.'});
  else html.push({kind:'note',html:'With two conditions there is only one difference between them, so sphericity cannot be violated and no correction is needed.'});
  const unb=ng.some(v=>v!==ng[0]);
  if(unb)html.push({kind:'note',html:'The groups have unequal sizes ('+ng.join(', ')+'). The between-groups test weights people equally, and the conditions test and the interaction treat each group equally, which is the SPSS default (Type III). Check that this matches the question you are asking.'});
  html.push({kind:'note',html:'Box\'s M for equal covariance matrices across groups is not run. With groups of very different size and clearly different spread, treat the within-people p-values with care.'});
  const sigI=sig(pic),sigT=sig(ptc),sigG=sig(pg);
  html.push({kind:'note',html:(sigI?'<b>The interaction is significant</b>, so the groups change differently across the conditions. Interpret the plot and the group-by-condition means first; main effects alone can mislead. To follow up, run a repeated-measures ANOVA inside each group, or compare the groups at each condition with a one-way test.':'The interaction is not significant, so there is no evidence that the groups change differently across the conditions. The two main effects can be read on their own.')});
  const dfTxt=(df1: number | string,df2: number | string,F: number,p: number,e2: number)=>'F('+df1+', '+df2+') = '+F.toFixed(2)+', '+fmtP(p)+', ηp² = '+noLead(e2.toFixed(2));
  const dd=(x: number)=>Math.abs(x-Math.round(x))<1e-9?String(Math.round(x)):x.toFixed(2);
  const apa='A mixed ANOVA with '+gName+' as the between-people factor ('+G+' groups) and condition as the within-people factor ('+k+' levels) showed '+
    (sigG?'a significant':'no significant')+' main effect of '+gName+', '+dfTxt(d1g,dfS,Fg,pg,peg)+'; '+(sigT?'a significant':'no significant')+' main effect of condition, '+dfTxt(dd(epsV*d1t),dd(epsV*dfE),Ft,ptc,pet)+'; and '+(sigI?'a significant':'no significant')+' interaction, '+dfTxt(dd(epsV*d1i),dd(epsV*dfE),Fi,pic,pei)+'.'+(k>2?' Degrees of freedom for the within-people effects use the '+epsName+' correction (ε = '+noLead(epsV.toFixed(2))+')'+(mauchOK?'; Mauchly\'s test '+(pM<0.05?'indicated that sphericity was violated':'did not indicate a violation of sphericity')+', χ²('+dfM+') = '+chi.toFixed(2)+', '+fmtP(pM)+'.':'.'):'');
  const values: Record<string, number>={n:n,G:G,k:k,SSg:SSg,SSs:SSs,SSt:SSt,SSi:SSi,E:E,Fg:Fg,pg:pg,Ft:Ft,pt:pt,Fi:Fi,pi:pi,gg:gg,hf:hf,W:W,chi:chi,pM:pM,epsV:epsV,ptc:ptc,pic:pic,peg:peg,pet:pet,pei:pei};
  return finishResult(ctx,'mixed',html,apa,values);
}
