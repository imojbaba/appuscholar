import { escHTML } from "./html";
import { pFromChi, pFromF, pFromT, pFromZ } from "./pvalue";
import { fmtP, noLead, pCell } from "./statfmt";
import { smean, ssd, stkOLS, stkLogit, stkAUC, stkCorrMat, stkAlpha, stkOmega, stkOmegaBoot, stkFQuant } from "./statsmath";
import type { LogitFit } from "./statsmath";
import { finishResult, gv, sig, statsToast, stkMRData } from "./stats-core";
import type { StatsBlock, StatsCtx, StatsResult } from "./stats-core";

/* Three branches of statsRunNow: `logistic`, binary logistic regression with the likelihood-ratio test, pseudo-R², AUC, Wald tests, odds ratios and the classification table
   (12982-13024), `rmanova`, the one-way repeated-measures ANOVA with Mauchly's test, the Greenhouse-Geisser and Huynh-Feldt corrections and Bonferroni paired t-tests (13281-13333),
   and `alpha`, Cronbach's alpha with its F interval and McDonald's omega with its bootstrap interval and the item table (13400-13455). Each is v1's branch as v1 wrote it, in the shape
   of stats-factorial.ts: the same reads of the form (stkMRData(ctx, true) for logistic, the ticked `items` for rmanova and alpha, `gv` for alpha's `rev` and `rrange`), the same toasts
   (a toast and return becomes statsToast), the same arithmetic, literals and toFixed calls, the same table cells, note innerHTML and list items, and the same sentence, handed to
   finishResult as v1 hands them to statsResultsShow.
   What differs from v1's text, in all three branches:
   - `d` is `ctx.data`, `stkMRData(true)` is `stkMRData(ctx,true)`; `Array.from(document.querySelectorAll('.sfm_items:checked')).map(c=>parseInt(c.value,10))` is
     `ctx.form.ticked.items??[]` (the form already holds the indexes as numbers, in column order); `d.cols[i].name` and the indexed reads whose value is used as a number or an array
     (`m.y[i]` stays unmarked where it is only compared, `o.beta[j]`, `o.se[j]`, `coef[j+1]`, `X` rows and cells, `cm[j]`, `S[i][j]`, `A[i][j]`, `M2[i][c]`, `h[i]`, `R[a][b]`,
     `aci[0]`, `om.loadings[j]`, `m[1]` of the rrange match) carry `!` (noUncheckedIndexedAccess; a missing column still throws, as in v1, and runStats turns the throw into v1's catch
     toast); the label reads that only go into escHTML or a string concatenation (`names[i]`, `names[j-1]`) have no `!`;
   - `showToast(x);return` is `return statsToast(key,x)`; `statsResultsShow(html,apa)` is `finishResult(ctx,key,blocks,apa,values)`;
   - a table v1 built by concatenation is one table block whose rows are its `<tr>`s, each the `th` and `td` cells in order; a cell v1 wrote as a bare number (`k`, `n`, `d1`, `d2`,
     `n-1`, `tn`, `fp`, `fn`, `tp`) is `String(x)`, the same text; a `<p class="desc">` is a note of the same innerHTML; alpha's `<ul>` of `<li>` items is a list block whose items are
     the `<li>` innerHTML, `escHTML(x)`; the `class` and `style` attributes of the tables, notes and list are the page's layout and are not carried (a block has no attributes);
     the strings v1 concatenated (logistic's `rows`, rmanova's `html` and `pw`, alpha's `html`) are arrays pushed in the same order, and v1's `html+=(showPW?a:b)` is
     `if(showPW)html.push(a);else html.push(b)`;
   - logistic: stkLogit returns `{singular:true}`, `{sep:true}` or the full fit (statsmath.ts's `Logit`); `o` is read through the widened type `LogitAny`, every member optional, so
     the three tests `o.sep&&!o.beta`, `o.singular`, `o.sep` read v1's properties in v1's order and on v1's objects (`{singular:true}` has no `sep` and no `beta`, `{sep:true}` has no
     `beta`), and the fit's members carry `!` after them (`o.ll!`, `o.ll0!`, `o.pr!`, `o.beta!`, `o.se!`): TypeScript cannot see that the three tests leave only the full fit;
     `f3`, `f2` and the `vif` map are v1's closures with parameter types, and `coef`'s element type is declared;
   - rmanova: v1's `let pw='',pwAPA=[]` followed by `pw='<table ...'` is the table's rows started with its header row (`pwAPA` is never read in v1 and goes); `window._statsSkipped=
     (window._statsSkipped||0)+1` in the row filter is `ctx.skipped=(ctx.skipped||0)+1`, at the same point; `H`, `S`, `HS`, `A` and the determinant block's `M2` are v1's loops with
     element types (`new Array(k).fill(0)` is `new Array<number>(k).fill(0)`), the determinant loop with its `1e-300` pivot test and its row swaps character for character; the chart after statsResultsShow (statsChartBarMeans, 13333) is not
     ported (F27);
   - alpha: `lo` and `hi` are `number | null` as in v1 and are read as `lo!+hi!` inside the row callback (v1 reads them only when `rev` named an item, after the range test set them);
     `fq` and the `rows` map are v1's closures with parameter types; the row filter counts nothing into the "left out" counter (v1 reports `dropped` in its own list item);
   - each runner returns finishResult's result with `values`, the raw numbers behind the cells (register row F27): logistic n, k, ev, ne, lr, pLR, cs, nag, mcf, auc, acc, sens, spec,
     tp, tn, fp, fn and, for each coefficient j of v1's loop (0 the intercept, j >= 1 the predictor names[j-1], in m.labels order, dummies included), b_<j>, se_<j>, z_<j>, p_<j>,
     and for j >= 1 or_<j>, lo_<j>, hi_<j> (the cells v1 fills; the intercept's are blank) and vif_<j>; rmanova n, k, ssc, sss, sst, sse, F, d1, d2, pU, gg, hf, W, chi, pM, dfM, eps,
     pC, pe2, ge2 and, for each pair i < j in the ticked order whose differences have spread, pair_t_<i>_<j> and pair_p_<i>_<j> (the paired t and its p before the Bonferroni factor,
     computed by v1's loop whether or not the table is shown); alpha n, k, alpha, aciLo, aciHi, meanR, and for each item j (0-based, ticked order) rit_<j> and ad_<j>, with omega and
     load_<j> (the raw loading, before the cell's clamp to 1) when stkOmega returned a model, and ociLo, ociHi when the bootstrap returned an interval.
   Per branch, the rest is v1's character for character, including:
   - logistic: the toasts in v1's order (stkMRData's err, `k<1`, `k>12`, `n<k+10||ev<3||ne<3` with the counts, stkLogit's null, then `o.sep&&!o.beta`, `o.singular`, `o.sep`, two of
     them the same string); `lr=2*(o.ll-o.ll0)`, `pFromChi(Math.max(0,lr),k)`, Cox-Snell, Nagelkerke and McFadden; stkAUC; the `.50` cut-off (`q>=0.5`); the VIF by regressing each
     predictor on the others (`[1]` for one predictor, Infinity when stkOLS is null); the Wald interval with `1.959963984540054`; the notes in v1's order (`epv<10` with the count and
     '(4.3 per predictor)', a VIF of 10 or more else above 5, the reference levels with '(the largest group)' and no '(your choice)', a level with fewer than 5 rows, the dropped rows
     with 'row was' / 'rows were'); the confusion table; the two long notes; `isFinite(sens)` and `isFinite(spec)` with '–'; the sentence;
   - rmanova: the toasts in v1's order (`<3` columns, `>8`, `n<3`, `n<=k`, `!(sse>1e-9*sst)||!(sst>0)`); the sums of squares; the Helmert contrasts `H`, `A = H S H'`, Greenhouse-
     Geisser `trA*trA/((k-1)*trA2)` and Huynh-Feldt with `Math.min(1, ...)`; the determinant by partial pivoting with `1e-300`; Mauchly's `W`, `fW=(2*pp*pp+pp+2)/(6*pp)`, `dfM`,
     `mauchOK`, `chi=Math.max(0,-(n-1-fW)*Math.log(Math.min(W,1)))`; `gg<0.75` choosing the row; the five Source rows; the sphericity note with either Mauchly's figures or 'could not be
     calculated'; the effect sizes; the pairwise rows with the '—' row for a pair without spread and `Math.min(1,p2*mPW)`; `sig(pC)`; the sentence;
   - alpha: the toasts in v1's order (`<3` items, the names not found, the rrange pattern `/^\s*(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*$/`, `!(hi>lo)`, `X.length<5`,
     stkCorrMat's null); the reversal `lo+hi-row[j]`; the alpha interval `1-(1-al.alpha)*stkFQuant(0.975,n-1,(n-1)*(k-1))` and with `0.025`, `[1,1]` at alpha 1; `stkOmega(R)` and
     `stkOmegaBoot(X,n*k>40000?200:400)`, while the note always says "a bootstrap of 400 resamples" (register row F13, proposed: copy); the corrected item-total r, alpha if item deleted,
     the loading cell `Math.sign(r2.load)*Math.min(1,Math.abs(r2.load))`; the notes in v1's order (negative, weak with `fq(r2.rit)`, above .95, `n<30`, the ceiling `>=0.99`, omega not
     computed, `dropped+' row(s) ...'`); the sentence. */

type LogitAny = Partial<LogitFit> & { singular?: true; sep?: boolean };

export function runLogistic(ctx: StatsCtx): StatsResult{
  const d=ctx.data;
  const m=stkMRData(ctx,true),dvName=d.cols[m.dvI]!.name;
  if(m.err){return statsToast('logistic',m.err)}
  const k=m.xs.length,n=m.y.length;
  if(k<1){return statsToast('logistic','Tick at least 1 predictor column (a categorical predictor with 3 or more levels counts as several).')}
  if(k>12){return statsToast('logistic','This test handles up to 12 predictor columns after categorical predictors are expanded')}
  const ev=m.y.reduce((a,v)=>a+v,0),ne=n-ev;
  if(n<k+10||ev<3||ne<3){return statsToast('logistic','Too few rows for this model: '+n+' complete rows with '+ev+' events and '+ne+' non-events. Need at least '+(k+10)+' rows and 3 of each outcome.')}
  const o: LogitAny | null=stkLogit(m.xs,m.y);
  if(!o){return statsToast('logistic','The outcome has only one answer, so there is nothing to predict.')}
  if(o.sep&&!o.beta){return statsToast('logistic','The model could not be fitted. A predictor (or a combination of them) separates the two outcomes perfectly, or almost perfectly, so the estimates run off to infinity. This usually means too many predictors for the number of events. Remove a predictor, or merge small categories.')}
  if(o.singular){return statsToast('logistic','Two or more predictors carry the same information (one is a copy or an exact combination of others, or has no variation), so the model cannot be calculated. Remove one.')}
  if(o.sep){return statsToast('logistic','The model could not be fitted. A predictor (or a combination of them) separates the two outcomes perfectly, or almost perfectly, so the estimates run off to infinity. This usually means too many predictors for the number of events. Remove a predictor, or merge small categories.')}
  const lr=2*(o.ll!-o.ll0!),pLR=pFromChi(Math.max(0,lr),k),cs=1-Math.exp((2/n)*(o.ll0!-o.ll!)),nag=cs/(1-Math.exp((2/n)*o.ll0!)),mcf=1-o.ll!/o.ll0!;
  const auc=stkAUC(o.pr!,m.y);
  let tp=0,tn=0,fp=0,fn=0;o.pr!.forEach((q,i)=>{const pd=q>=0.5?1:0;if(pd===1&&m.y[i]===1)tp++;else if(pd===0&&m.y[i]===0)tn++;else if(pd===1)fp++;else fn++});
  const names=m.labels,f3=(x: number)=>noLead(x.toFixed(3)),f2=(x: number)=>noLead(x.toFixed(2));
  const vif=k>1?m.xs.map((x,j)=>{const others=m.xs.filter((q,i)=>i!==j),q=stkOLS(others,x);if(!q)return Infinity;return 1/(1-(1-q.sse/q.sst))}):[1];
  const rows: string[][]=[];const coef: Array<{ b: number; se: number; z: number; p: number; or: number; lo: number; hi: number }>=[];
  const values: Record<string, number>={n:n,k:k,ev:ev,ne:ne,lr:lr,pLR:pLR,cs:cs,nag:nag,mcf:mcf,auc:auc,tp:tp,tn:tn,fp:fp,fn:fn};
  for(let j=0;j<=k;j++){
    const b=o.beta![j]!,se=o.se![j]!,z=b/se,pj=pFromZ(z),orr=Math.exp(b),lo=Math.exp(b-1.959963984540054*se),hi=Math.exp(b+1.959963984540054*se);
    coef.push({b:b,se:se,z:z,p:pj,or:orr,lo:lo,hi:hi});
    rows.push([(j===0?'Intercept':escHTML(names[j-1])),b.toFixed(3),se.toFixed(3),z.toFixed(2),pCell(pj),(j===0?'':orr.toFixed(3)),(j===0?'':'['+lo.toFixed(3)+', '+hi.toFixed(3)+']')]);
    values['b_'+j]=b;values['se_'+j]=se;values['z_'+j]=z;values['p_'+j]=pj;if(j>0){values['or_'+j]=orr;values['lo_'+j]=lo;values['hi_'+j]=hi;values['vif_'+j]=vif[j-1]!}
  }
  const maxV=Math.max.apply(null,vif),epv=Math.min(ev,ne)/k;
  let notes='';
  if(epv<10)notes+=' Only '+Math.min(ev,ne)+' cases in the rarer outcome for '+k+' predictor column'+(k===1?'':'s')+' ('+epv.toFixed(1)+' per predictor). A common rule of thumb asks for at least 10, and below that the estimates are biased and the intervals unreliable.';
  if(maxV>=10)notes+=' A VIF of 10 or more means a predictor overlaps heavily with the others, so its odds ratio is unstable.';
  else if(maxV>=5)notes+=' A VIF above 5 means some predictors overlap noticeably, which widens their intervals.';
  if(m.refs.length)notes+=' Each categorical predictor is turned into 0/1 columns, one per level except the reference level, and each odds ratio compares a level with the reference level. Reference levels: '+m.refs.map(r=>r.name+' = '+r.level+(r.auto?' (the largest group)':'')).join('; ')+'.';
  if(m.refs.some(r=>r.small))notes+=' At least one level of a categorical predictor has fewer than 5 rows, so its odds ratio rests on very little data.';
  if(m.dropped)notes+=' '+m.dropped+' row'+(m.dropped===1?' was':'s were')+' left out because a value was missing.';
  const acc=(tp+tn)/n,sens=tp+fn?tp/(tp+fn):NaN,spec=tn+fp?tn/(tn+fp):NaN;
  values.acc=acc;values.sens=sens;values.spec=spec;
  const html: StatsBlock[]=[{kind:'note',html:'Model: the log odds that '+escHTML(dvName)+' = <b>'+escHTML(m.posL)+'</b> (the event) rather than '+escHTML(m.negL)+', predicted from '+names.map(escHTML).join(', ')+'. N = '+n+' ('+ev+' events, '+ne+' non-events).'},
    {kind:'table',rows:[['Likelihood-ratio χ²','df','p','McFadden R²','Cox-Snell R²','Nagelkerke R²','AUC'],[lr.toFixed(2),String(k),pCell(pLR),f3(mcf),f3(cs),f3(nag),f3(auc)]]},
    {kind:'table',rows:[['Predictor','b (log odds)','SE','Wald z','p','Odds ratio','95% CI for the odds ratio'],...rows]},
    {kind:'table',rows:[['','Predicted '+escHTML(m.negL),'Predicted '+escHTML(m.posL)],['Actually '+escHTML(m.negL),String(tn),String(fp)],['Actually '+escHTML(m.posL),String(fn),String(tp)]]},
    {kind:'note',html:'Correct at a .50 cut-off: '+(acc*100).toFixed(1)+'%. Sensitivity (events caught) '+(isFinite(sens)?(sens*100).toFixed(1)+'%':'–')+', specificity (non-events caught) '+(isFinite(spec)?(spec*100).toFixed(1)+'%':'–')+'. Accuracy looks good by default when one outcome is much commoner than the other, so read the AUC and the two rates beside it. These classification figures use the same people that built the model, so they are optimistic for new people.'},
    {kind:'note',html:'An odds ratio is the factor by which the odds of the event are multiplied for one more unit of a numeric predictor, or for the level against the reference level, with the other predictors held constant. Above 1 raises the odds, below 1 lowers them. The p-values are Wald tests; the likelihood-ratio test above is the one for the model as a whole. The intervals are Wald intervals. The Hosmer-Lemeshow test is not shown, because programs form its groups differently and report different values.'+notes}];
  const bits=names.map((nm,j)=>nm+' (OR = '+coef[j+1]!.or.toFixed(2)+', 95% CI ['+coef[j+1]!.lo.toFixed(2)+', '+coef[j+1]!.hi.toFixed(2)+'], '+fmtP(coef[j+1]!.p)+')');
  const apa='A logistic regression with '+names.join(', ')+' as predictors of '+dvName+' ('+m.posL+' versus '+m.negL+') '+(pLR<0.05?'was significant':'was not significant')+', χ²('+k+', N = '+n+') = '+lr.toFixed(2)+', '+fmtP(pLR)+', Nagelkerke R² = '+f3(nag)+'. The model classified '+(acc*100).toFixed(1)+'% of cases correctly (AUC = '+f2(auc)+'). Odds ratios: '+bits.join('; ')+'.';
  return finishResult(ctx,'logistic',html,apa,values);
}

export function runRmanova(ctx: StatsCtx): StatsResult{
  const d=ctx.data;
  const idxs=ctx.form.ticked.items??[];
  if(idxs.length<3){return statsToast('rmanova','Tick at least 3 columns, one for each time point or condition. For two, use the paired t-test.')}
  if(idxs.length>8){return statsToast('rmanova','This test handles up to 8 conditions.')}
  const names=idxs.map(i=>d.cols[i]!.name),k=idxs.length,X: number[][]=[];
  d.rows.forEach(r=>{const row=idxs.map(i=>(r[i]===''||r[i]===undefined)?NaN:parseFloat(r[i]!));if(row.every(isFinite))X.push(row);else ctx.skipped=(ctx.skipped||0)+1});
  const n=X.length;
  if(n<3){return statsToast('rmanova','Need at least 3 people who have a score in every ticked column.')}
  if(n<=k){return statsToast('rmanova','Need more people than conditions ('+k+' conditions, '+n+' people with complete scores). Sphericity cannot be checked otherwise.')}
  const cm=names.map((_,j)=>smean(X.map(r=>r[j]!))),sm=X.map(r=>smean(r)),gm=smean(sm);
  let ssc=0,sss=0,sst=0;
  cm.forEach(m=>ssc+=n*(m-gm)*(m-gm));sm.forEach(m=>sss+=k*(m-gm)*(m-gm));X.forEach(r=>r.forEach(v=>sst+=(v-gm)*(v-gm)));
  const sse=sst-ssc-sss;
  if(!(sse>1e-9*sst)||!(sst>0)){return statsToast('rmanova','Every person changes by exactly the same amount across the conditions, so there is no error variance and the F test cannot be calculated.')}
  const d1=k-1,d2=(n-1)*(k-1),F=(ssc/d1)/(sse/d2),pU=pFromF(F,d1,d2);
  const S: number[][]=[];for(let i=0;i<k;i++){S.push([]);for(let j=0;j<k;j++){let t2=0;X.forEach(r=>t2+=(r[i]!-cm[i]!)*(r[j]!-cm[j]!));S[i]!.push(t2/(n-1))}}
  const H: number[][]=[];for(let r=1;r<k;r++){const row=new Array<number>(k).fill(0);for(let c=0;c<r;c++)row[c]=1;row[r]=-r;const nm=Math.sqrt(r*(r+1));H.push(row.map(v=>v/nm))}
  const HS=H.map(h=>S[0]!.map((_,j)=>h.reduce((a,v,i)=>a+v*S[i]![j]!,0)));
  const A=HS.map(hs=>H.map(h=>hs.reduce((a,v,i)=>a+v*h[i]!,0)));
  let trA=0,trA2=0;for(let i=0;i<k-1;i++){trA+=A[i]![i]!;for(let j=0;j<k-1;j++)trA2+=A[i]![j]!*A[i]![j]!}
  const gg=trA*trA/((k-1)*trA2),hf=Math.min(1,(n*(k-1)*gg-2)/((k-1)*(n-1-(k-1)*gg)));
  let det=1;{const M2=A.map(r=>r.slice());for(let i=0;i<k-1;i++){let pv=i;for(let j=i+1;j<k-1;j++)if(Math.abs(M2[j]![i]!)>Math.abs(M2[pv]![i]!))pv=j;if(Math.abs(M2[pv]![i]!)<1e-300){det=0;break}if(pv!==i){const tmp=M2[i]!;M2[i]=M2[pv]!;M2[pv]=tmp;det=-det}det*=M2[i]![i]!;for(let j=i+1;j<k-1;j++){const f=M2[j]![i]!/M2[i]![i]!;for(let c=i;c<k-1;c++)M2[j]![c]!-=f*M2[i]![c]!}}}
  const W=det/Math.pow(trA/(k-1),k-1),pp=k-1,fW=(2*pp*pp+pp+2)/(6*pp),dfM=k*(k-1)/2-1;
  const mauchOK=isFinite(W)&&W>0;
  let chi=0,pM=1;if(mauchOK){chi=Math.max(0,-(n-1-fW)*Math.log(Math.min(W,1)));pM=pFromChi(chi,dfM)}
  const useGG=gg<0.75,eps=useGG?gg:hf,epsName=useGG?'Greenhouse-Geisser':'Huynh-Feldt',pC=pFromF(F,eps*d1,eps*d2);
  const pe2=ssc/(ssc+sse),ge2=ssc/(ssc+sss+sse),msc=ssc/d1,mse=sse/d2;
  const values: Record<string, number>={n:n,k:k,ssc:ssc,sss:sss,sst:sst,sse:sse,F:F,d1:d1,d2:d2,pU:pU,gg:gg,hf:hf,W:W,chi:chi,pM:pM,dfM:dfM,eps:eps,pC:pC,pe2:pe2,ge2:ge2};
  const html: StatsBlock[]=[{kind:'table',rows:[['Condition','N','M','SD'],
    ...names.map((nm,j)=>[escHTML(nm),String(n),cm[j]!.toFixed(2),ssd(X.map(r=>r[j]!)).toFixed(2)])]}];
  html.push({kind:'table',rows:[['Source','SS','df','MS','F','p'],
    ['Conditions (sphericity assumed)',ssc.toFixed(2),String(d1),msc.toFixed(2),F.toFixed(2),pCell(pU)],
    ['Conditions ('+epsName+')',ssc.toFixed(2),(eps*d1).toFixed(2),(ssc/(eps*d1)).toFixed(2),F.toFixed(2),pCell(pC)],
    ['People',sss.toFixed(2),String(n-1),(sss/(n-1)).toFixed(2),'',''],
    ['Error (assumed)',sse.toFixed(2),String(d2),mse.toFixed(2),'',''],
    ['Error ('+epsName+')',sse.toFixed(2),(eps*d2).toFixed(2),(sse/(eps*d2)).toFixed(2),'','']]});
  html.push({kind:'note',html:'Sphericity (the differences between every pair of conditions have equal spread). '+(mauchOK?'Mauchly\'s W = '+W.toFixed(3)+', χ²('+dfM+') = '+chi.toFixed(2)+', '+fmtP(pM)+'. ':'Mauchly\'s test could not be calculated for these data. ')+
    'Greenhouse-Geisser ε = '+noLead(gg.toFixed(3))+', Huynh-Feldt ε = '+noLead(hf.toFixed(3))+'. The corrected row to report is '+epsName+', chosen by the usual rule: Greenhouse-Geisser when ε is below .75, Huynh-Feldt otherwise. It is safe to report even when sphericity holds, because the correction then changes almost nothing.'});
  html.push({kind:'note',html:'Effect size: partial η² = '+noLead(pe2.toFixed(3))+', generalized η² = '+noLead(ge2.toFixed(3))+'. Partial η² is what SPSS prints and what most journals expect; generalized η² allows comparison with between-groups designs.'});
  const mPW=k*(k-1)/2;
  const pw: string[][]=[['Pair','Mean diff','t','df','p','p (Bonferroni)']];
  for(let i=0;i<k;i++)for(let j=i+1;j<k;j++){
    const df2=X.map(r=>r[i]!-r[j]!),md=smean(df2),sd2=ssd(df2);
    if(!(sd2>0)){pw.push([escHTML(names[i]+' − '+names[j]),md.toFixed(2),'—',String(n-1),'—','—']);continue}
    const t2=md/(sd2/Math.sqrt(n)),p2=pFromT(t2,n-1),pb=Math.min(1,p2*mPW);
    pw.push([escHTML(names[i]+' − '+names[j]),md.toFixed(2),t2.toFixed(2),String(n-1),pCell(p2),pCell(pb)]);
    values['pair_t_'+i+'_'+j]=t2;values['pair_p_'+i+'_'+j]=p2;
  }
  const showPW=sig(pC);
  if(showPW)html.push({kind:'note',html:'<b>Pairwise follow-ups</b> (paired t-tests, p multiplied by '+mPW+' for the Bonferroni correction). Read these only because the overall test is significant.'},{kind:'table',rows:pw});
  else html.push({kind:'note',html:'The overall test is not significant, so pairwise follow-ups are not shown. Looking for a significant pair after a non-significant overall test inflates false positives.'});
  const dfTxt='F('+(eps*d1).toFixed(2)+', '+(eps*d2).toFixed(2)+') = '+F.toFixed(2)+', '+fmtP(pC)+', ηp² = '+noLead(pe2.toFixed(2));
  const apa='A one-way repeated-measures ANOVA with a '+epsName+' correction (ε = '+noLead(eps.toFixed(2))+') showed that scores '+(sig(pC)?'differed significantly':'did not differ significantly')+' across the '+k+' conditions ('+names.join(', ')+'), '+dfTxt+'.'+(mauchOK?' Mauchly\'s test '+(pM<0.05?'indicated that sphericity was violated':'did not indicate a violation of sphericity')+', χ²('+dfM+') = '+chi.toFixed(2)+', '+fmtP(pM)+'.':'');
  return finishResult(ctx,'rmanova',html,apa,values);
}

export function runAlpha(ctx: StatsCtx): StatsResult{
  const d=ctx.data;
  const idxs=ctx.form.ticked.items??[];
  if(idxs.length<3){return statsToast('alpha','Tick at least 3 items that belong to one scale')}
  const names=idxs.map(i=>d.cols[i]!.name);
  let revIdx: number[]=[];
  const revTxt=(gv(ctx,'rev')||'').trim();
  let lo: number | null=null,hi: number | null=null;
  if(revTxt){
    const want=revTxt.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
    const miss=want.filter(w2=>!names.some(nm=>nm.toLowerCase()===w2));
    if(miss.length){return statsToast('alpha','Not found among the ticked items: '+miss.join(', '))}
    revIdx=names.map((nm,j)=>want.indexOf(nm.toLowerCase())>=0?j:-1).filter(j=>j>=0);
    const m=(gv(ctx,'rrange')||'').match(/^\s*(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*$/);
    if(!m){return statsToast('alpha','To reverse items, give the lowest and highest answer, for example 1-5')}
    lo=parseFloat(m[1]!);hi=parseFloat(m[2]!);
    if(!(hi>lo)){return statsToast('alpha','The highest answer must be larger than the lowest')}
  }
  const X: number[][]=[];
  d.rows.forEach(r=>{
    const row=idxs.map(i=>parseFloat(r[i]!));
    if(row.every(v=>isFinite(v))){revIdx.forEach(j=>{row[j]=lo!+hi!-row[j]!});X.push(row)}
  });
  const dropped=d.rows.length-X.length,k=idxs.length;
  if(X.length<5){return statsToast('alpha','Need at least 5 people who answered every ticked item')}
  const R=stkCorrMat(X);
  if(!R){return statsToast('alpha','One item has the same answer from everyone, so it cannot be analysed. Untick it')}
  const n=X.length,al=stkAlpha(X),fq=(x: number)=>noLead(x.toFixed(2));
  const aci=al.alpha<1?[1-(1-al.alpha)*stkFQuant(0.975,n-1,(n-1)*(k-1)),1-(1-al.alpha)*stkFQuant(0.025,n-1,(n-1)*(k-1))]:[1,1];
  const om=stkOmega(R),oci=om?stkOmegaBoot(X,n*k>40000?200:400):null;
  let sumR=0,cnt=0;for(let a=0;a<k;a++)for(let b=a+1;b<k;b++){sumR+=R[a]![b]!;cnt++}
  const rows=names.map((nm,j)=>{
    const col=X.map(r=>r[j]!),rest=X.map(r=>r.reduce((x,y)=>x+y,0)-r[j]!);
    const mx=smean(col),mr=smean(rest);let sxy=0,sxx=0,syy=0;
    for(let i=0;i<n;i++){sxy+=(col[i]!-mx)*(rest[i]!-mr);sxx+=(col[i]!-mx)*(col[i]!-mx);syy+=(rest[i]!-mr)*(rest[i]!-mr)}
    const rit=sxy/Math.sqrt(sxx*syy);
    const ad=k>2?stkAlpha(X.map(r=>r.filter((_,q)=>q!==j))).alpha:NaN;
    return{name:nm,m:mx,sd:Math.sqrt(sxx/(n-1)),rit:rit,ad:ad,rev:revIdx.indexOf(j)>=0,load:om?om.loadings[j]!:NaN};
  });
  const notes: string[]=[];
  rows.filter(r2=>r2.rit<0).forEach(r2=>notes.push(r2.name+' correlates negatively with the rest of the scale. If it is worded in the opposite direction, reverse-score it above and run again.'));
  rows.filter(r2=>r2.rit>=0&&r2.rit<0.2).forEach(r2=>notes.push(r2.name+' correlates only weakly with the rest ('+fq(r2.rit)+'). Check its wording.'));
  if(al.alpha>0.95)notes.push('An alpha above .95 can mean some items repeat each other.');
  if(n<30)notes.push('With fewer than 30 people the intervals are wide and the values are unstable.');
  rows.filter(r2=>isFinite(r2.load)&&Math.abs(r2.load)>=0.99).forEach(r2=>notes.push(r2.name+' has a loading at the ceiling of 1.00. The item is almost a copy of the scale, or the sample is too small for a stable estimate. Treat omega as approximate.'));
  if(!om)notes.push('Omega could not be computed for these items.');
  if(dropped>0)notes.push(dropped+' row(s) with a missing answer were left out.');
  const html: StatsBlock[]=[{kind:'table',rows:[['People','Items','Cronbach\'s α','95% CI','McDonald\'s ω','95% CI','Mean inter-item r'],
    [String(n),String(k),fq(al.alpha),'['+fq(aci[0]!)+', '+fq(aci[1]!)+']',(om?fq(om.omega):'–'),(oci?'['+fq(oci[0])+', '+fq(oci[1])+']':'–'),fq(sumR/cnt)]]},
    {kind:'table',rows:[['Item','M','SD','Corrected item-total r','α if item deleted','Loading'],
      ...rows.map(r2=>[escHTML(r2.name)+(r2.rev?' (reversed)':''),r2.m.toFixed(2),r2.sd.toFixed(2),fq(r2.rit),(isFinite(r2.ad)?fq(r2.ad):'–'),(isFinite(r2.load)?fq(Math.sign(r2.load)*Math.min(1,Math.abs(r2.load))):'–')])]},
    {kind:'note',html:'There is no single pass mark for either value. What counts as acceptable depends on the purpose, so report the value with its interval. Omega assumes the items measure one thing. If the scale has subscales, run each subscale separately. Omega here comes from a one-factor model; its interval is a bootstrap of 400 resamples.'}];
  if(notes.length)html.push({kind:'list',items:notes.map(x=>escHTML(x))});
  const apa='Internal consistency was α = '+fq(al.alpha)+', 95% CI ['+fq(aci[0]!)+', '+fq(aci[1]!)+']'+(om?', and McDonald\'s ω = '+fq(om.omega)+(oci?', 95% CI ['+fq(oci[0])+', '+fq(oci[1])+']':''):'')+' (k = '+k+' items, N = '+n+').';
  const values: Record<string, number>={n:n,k:k,alpha:al.alpha,aciLo:aci[0]!,aciHi:aci[1]!,meanR:sumR/cnt};
  if(om)values.omega=om.omega;
  if(oci){values.ociLo=oci[0];values.ociHi=oci[1]}
  rows.forEach((r2,j)=>{values['rit_'+j]=r2.rit;values['ad_'+j]=r2.ad;if(om)values['load_'+j]=r2.load});
  return finishResult(ctx,'alpha',html,apa,values);
}
