import { escHTML } from "./html";
import { pFromF, pFromT } from "./pvalue";
import { fmtP, noLead, pCell } from "./statfmt";
import { smean, ssd, stkAnova2, stkSimpleEffects, stkPtukey, stkOLS, stkTCrit } from "./statsmath";
import type { Anova2Row, Eff } from "./statsmath";
import { finishResult, statsToast, stkAnova2Cells, stkMRData } from "./stats-core";
import type { StatsBlock, StatsCtx, StatsResult } from "./stats-core";

/* The two largest branches of statsRunNow: `anova2`, the two-way between-subjects ANOVA with Type III sums of squares, simple effects, Tukey on the estimated marginal means and
   Bonferroni within levels (12861-12931), and `mregress`, multiple linear regression with VIF and the hierarchical step 2 (12932-12981). Each is v1's branch as v1 wrote it, in the
   shape of stats-means.ts, stats-ranks.ts and stats-counts.ts: the same reads of the form (through stkAnova2Cells and stkMRData, stats-core.ts), the same toasts (a toast and return
   becomes statsToast), the same arithmetic, literals and toFixed calls, the same table cells and note innerHTML, and the same sentence, handed to finishResult as v1 hands them to
   statsResultsShow.
   What differs from v1's text, in both branches:
   - `d` is `ctx.data`, `stkAnova2Cells()` is `stkAnova2Cells(ctx)`, `stkMRData()` is `stkMRData(ctx)`; `d.cols[idx].name` and the indexed reads whose value is used as a number,
     an array or an object (`c.cellMap[..]`, in cellOf too, `res.rows[2]`, `res.rows[fac]`, `em[i]`, `o.beta[j]`, `o.inv[j][j]`, `m.xs[j-1]`, `vif[j-1]`, `coef[j+1]`) carry `!`
     (noUncheckedIndexedAccess; a missing column still throws, as in v1, and runStats turns the throw into v1's catch toast), and so does `coef[j+1].beta` in mregress's sentence after its
     `===null` test (TypeScript does not narrow a property read through a computed index); the label reads that only go into escHTML or a string concatenation (`nm[i]`, `c.aL[i]`,
     `c.bL[j]`, `labs[i]`, `labsO[j]`, `names[j-1]`) have no `!`, as escHTML takes unknown, and are the same text;
   - `showToast(x);return` is `return statsToast(key,x)`; `statsResultsShow(html,apa)` is `finishResult(ctx,key,blocks,apa,values)`;
   - a table v1 built by concatenation is one table block whose rows are its `<tr>`s, each the `th` and `td` cells in order; a cell v1 wrote as a bare number (`r.df`, `res.dfe`,
     `g.length`) is `String(x)`, the same text; a `<p class="desc">` is a note of the same innerHTML, and a `<p class="desc" style="margin:10px 0 2px"><b>title</b></p>` before a
     table (anova2's simple-effects and pairwise titles) is a note whose html is `<b>title</b>`; the tables' `class="stats-table"` and `style="margin-top:10px"` and the notes'
     `class` and `style` are the page's layout, not the result, and are not carried (a block has no attributes); the strings v1 concatenated
     (`html`, `simpleHTML`, `pairHTML`, `stepHTML`, a `tb` it grew with `+=`) are arrays of blocks pushed in the same order, so `html+simpleHTML+pairHTML` and
     `stepHTML+...` are concatenations of block arrays;
   - anova2's `tbl` closure keeps its parameters (title, list, labels, fam) and returns the title note and the table where v1 returned their HTML; `cellOf`, `sent`, mregress's `vif`
     map and its `bits` map are v1's closures with parameter types;
   - `window._statsSkipped=(window._statsSkipped||0)+c.skipped` (12864) is `ctx.skipped=(ctx.skipped||0)+c.skipped`, at the same point (before the first toast); mregress adds nothing
     to the counter: stkMRData's `dropped` is reported in its own note, as v1;
   - each runner returns finishResult's result with `values`, the raw numbers behind the cells (register row F27): anova2 la, lb, N (the scores used), sse, dfe, mse, F_A, p_A, eta_A,
     F_B, p_B, eta_B, F_AB, p_AB, eta_AB, balanced (1 or 0) and, when the simple effects ran, se_A_<i>_F and se_A_<i>_p (the effect of factor B at level i of factor A, se.byA[i]) and
     se_B_<j>_F, se_B_<j>_p (se.byB[j]); mregress n, k, dfe, r2, adj, F, pF, and for each coefficient j of v1's loop (0 the intercept, j >= 1 the predictor names[j-1], in m.labels
     order, dummies included) b_<j>, se_<j>, t_<j>, p_<j>, vif_<j> for j >= 1, beta_<j> where v1 computes β (not the intercept, not a 0/1 dummy), and when step 2 ran k1, r21, adj1,
     F1, p1, dR, Fc, pc;
   - the chart code after statsResultsShow is not ported (F27): anova2's lab/mv/er arrays and statsChartInteraction (12928-12930), mregress's statsChartHistogram (12981); they read
     nothing that can throw.
   Per branch, the rest is v1's character for character, including:
   - anova2: the toasts in v1's order (the same column twice, fewer than 2 levels, more than 6, the empty cells with the count and 'combination has' / 'combinations have', stkAnova2's
     null for dfe < 1 or a singular design, `!(res.sse>0)`); the levels in stkAnova2Cells's first-seen order; `balanced` from the cell sizes in Object.keys order; the Type III note
     with R's `<code>anova()</code>` and the interaction warning when `res.rows[2].p<0.05`; the simple effects (stkSimpleEffects) with `Math.min(1,q.p*fam)` and the sentence's
     `Math.min(1,q.p*la)`; the pairwise block for each factor with 3 or more levels, factor A then B: without a significant interaction and only for a significant main effect, Tukey
     on the estimated marginal means with `q=Math.abs(dd)/Math.sqrt(res.mse/(Lo*Lo)*vs/2)` and `Math.max(0,1-stkPtukey(q,L,res.dfe))` and the Tukey-Kramer words when unbalanced;
     with a significant interaction, t tests within each level of the other factor (`pFromT`, the Bonferroni factor `npair*Lo`); the sentence `sent` for A, B and the interaction,
     then the simple-effects and Tukey sentences;
   - mregress: the toasts in v1's order (stkMRData's err, `k<2`, `k>12`, `n<k+3` with the counts, stkOLS's null, `!(o.sse>1e-9*o.sst)`, and in step 2 `k1<1` and the step 1
     null); `dfe=n-k-1`, `tc=stkTCrit(dfe,0.05)`, the VIF by regressing each predictor on the others (Infinity when stkOLS is null) and `Math.max.apply(null,vif)`; β only for a
     numeric predictor, `b*ssd(m.xs[j-1])/sdy`; the step table and its long note, the step sentence with `noLead((r21*100).toFixed(1))+'%'`; the notes in v1's order (`n<10*k`, a VIF
     of 10 or more else above 5, the reference levels with '(the largest group)' or '(your choice)', a level with fewer than 5 rows, the dropped rows with 'row was' / 'rows were');
     the sentence's `(β = ` with its explicit '-' and `noLead(Math.abs(..).toFixed(2))`, or `(b = ` with `toFixed(2)` for a dummy. */

export function runAnova2(ctx: StatsCtx): StatsResult{
  const d=ctx.data;
  const c=stkAnova2Cells(ctx);
  const dvName=d.cols[c.dvI]!.name,aName=d.cols[c.aI]!.name,bName=d.cols[c.bI]!.name;
  ctx.skipped=(ctx.skipped||0)+c.skipped;
  if(c.aI===c.bI){return statsToast('anova2','Choose two different grouping variables')}
  const la=c.aL.length,lb=c.bL.length;
  if(la<2||lb<2){return statsToast('anova2','Each grouping variable needs at least 2 levels')}
  if(la>6||lb>6){return statsToast('anova2','This test handles up to 6 levels per factor')}
  let empty=0;for(let i=0;i<la;i++)for(let j=0;j<lb;j++)if(!c.cellMap[i+'|'+j])empty++;
  if(empty){return statsToast('anova2','Every combination of the two factors needs at least one score, and '+empty+' combination'+(empty===1?' has':'s have')+' none. A two-way ANOVA cannot be calculated from this layout.')}
  const res=stkAnova2(c.y,c.ai,c.bi,la,lb);
  if(!res){return statsToast('anova2','There are too few scores for this many cells (the error degrees of freedom must be at least 1), so the two-way ANOVA cannot be calculated.')}
  if(!(res.sse>0)){return statsToast('anova2','No cell has any spread (all scores inside each cell are the same), so the F tests cannot be calculated.')}
  const nm=[aName,bName,aName+' × '+bName],cellN=Object.keys(c.cellMap).map(k=>c.cellMap[k]!.length),balanced=cellN.every(v=>v===cellN[0]);
  const rows: string[][]=[];
  res.rows.forEach((r,i)=>{rows.push([escHTML(nm[i]),r.ss.toFixed(2),String(r.df),r.ms.toFixed(2),r.F.toFixed(2),pCell(r.p),noLead(r.eta.toFixed(3))])});
  rows.push(['Error',res.sse.toFixed(2),String(res.dfe),res.mse.toFixed(2),'','','']);
  const cellRows: string[][]=[];
  for(let i=0;i<la;i++)for(let j=0;j<lb;j++){const g=c.cellMap[i+'|'+j]!;cellRows.push([escHTML(c.aL[i]),escHTML(c.bL[j]),String(g.length),smean(g).toFixed(2),(g.length>1?ssd(g).toFixed(2):'—')])}
  const html: StatsBlock[]=[{kind:'table',rows:[[escHTML(aName),escHTML(bName),'N','M','SD'],...cellRows]},
    {kind:'table',rows:[['Source','SS','df','MS','F','p','Partial η²'],...rows]},
    {kind:'note',html:'Type III sums of squares, the default in SPSS and JASP. '+(balanced?'The design is balanced (equal cell sizes), so every sums-of-squares type gives the same answer.':'The cell sizes are unequal, so the sums-of-squares type matters. SPSS and JASP use Type III, which is what is shown; R\'s <code>anova()</code> uses Type I and will differ.')+
      (res.rows[2]!.p<0.05?' The interaction is significant: read the main effects with care, because the effect of one factor depends on the level of the other. Look at the cell means and test simple effects before you interpret a main effect alone.':'')}];
  const values: Record<string, number>={la:la,lb:lb,N:c.y.length,sse:res.sse,dfe:res.dfe,mse:res.mse,balanced:balanced?1:0};
  res.rows.forEach(r=>{values['F_'+r.id]=r.F;values['p_'+r.id]=r.p;values['eta_'+r.id]=r.eta});
  let simpleHTML: StatsBlock[]=[],simpleAPA='';
  if(res.rows[2]!.p<0.05){
    const se=stkSimpleEffects(c.cellMap,la,lb,res.mse,res.dfe);
    const tbl=(title: string,list: Eff[],labels: string[],fam: number): StatsBlock[]=>[{kind:'note',html:'<b>'+title+'</b>'},{kind:'table',rows:[['Level','SS','df','F','p','p, Bonferroni (×'+fam+')'],
      ...list.map((q,i)=>[escHTML(labels[i]),q.ss.toFixed(2),q.df+', '+res.dfe,q.F.toFixed(2),pCell(q.p),pCell(Math.min(1,q.p*fam))])]}];
    simpleHTML=tbl('Effect of '+escHTML(bName)+' at each level of '+escHTML(aName),se.byA,c.aL,la).concat(tbl('Effect of '+escHTML(aName)+' at each level of '+escHTML(bName),se.byB,c.bL,lb),
      [{kind:'note',html:'Simple effects use the error term of the whole design (MSE = '+res.mse.toFixed(2)+', df = '+res.dfe+'). The Bonferroni column multiplies each p by the number of tests in its table. They show where a difference lives; they do not say which pairs of groups differ when a factor has three or more levels.'}]);
    simpleAPA=' Because the interaction was significant, the simple effects of '+bName+' within each level of '+aName+' were examined (Bonferroni-adjusted): '+
      se.byA.map((q,i)=>c.aL[i]+', F('+q.df+', '+res.dfe+') = '+q.F.toFixed(2)+', '+fmtP(Math.min(1,q.p*la))).join('; ')+'.';
    se.byA.forEach((q,i)=>{values['se_A_'+i+'_F']=q.F;values['se_A_'+i+'_p']=q.p});
    se.byB.forEach((q,j)=>{values['se_B_'+j+'_F']=q.F;values['se_B_'+j+'_p']=q.p});
  }
  const pairHTML: StatsBlock[]=[];let pairAPA='';
  {
    const intSig=res.rows[2]!.p<0.05,famBits: string[]=[];
    const cellOf=(fac: number,i: number,j: number)=>c.cellMap[fac?(j+'|'+i):(i+'|'+j)]!;
    [0,1].forEach(fac=>{
      const L=fac?lb:la,Lo=fac?la:lb,labs=fac?c.bL:c.aL,labsO=fac?c.aL:c.bL,nmF=fac?bName:aName,nmO=fac?aName:bName;
      if(L<3)return;
      const npair=L*(L-1)/2;
      if(!intSig){
        if(!(res.rows[fac]!.p<0.05))return;
        const em: number[]=[];for(let i=0;i<L;i++){let t=0;for(let j=0;j<Lo;j++)t+=smean(cellOf(fac,i,j));em.push(t/Lo)}
        const tb: string[][]=[['Pair','Mean diff','q','p (Tukey)']],bits: string[]=[];
        for(let i=0;i<L;i++)for(let k=i+1;k<L;k++){
          let vs=0;for(let j=0;j<Lo;j++)vs+=1/cellOf(fac,i,j).length+1/cellOf(fac,k,j).length;
          const dd=em[i]!-em[k]!,q=Math.abs(dd)/Math.sqrt(res.mse/(Lo*Lo)*vs/2),pq=Math.max(0,1-stkPtukey(q,L,res.dfe));
          tb.push([escHTML(labs[i]+' − '+labs[k]),dd.toFixed(2),q.toFixed(2),pCell(pq)]);
          bits.push(labs[i]+' vs '+labs[k]+' ('+fmtP(pq)+')');
        }
        pairHTML.push({kind:'note',html:'<b>Pairwise comparisons of '+escHTML(nmF)+' (Tukey)</b>'},{kind:'table',rows:tb},
          {kind:'note',html:'Differences between estimated marginal means of '+escHTML(nmF)+' (each level\'s mean averaged over the cell means of '+escHTML(nmO)+'), using the design\'s error term (MSE = '+res.mse.toFixed(2)+', df = '+res.dfe+')'+(balanced?'':' and the Tukey-Kramer adjustment for unequal cell sizes')+'. Run these only because the main effect is significant and the interaction is not.'});
        famBits.push('For '+nmF+', Tukey comparisons of estimated marginal means gave: '+bits.join('; ')+'.');
      }else{
        const tb: string[][]=[[escHTML(nmO),'Pair','Mean diff','t','p','p, Bonferroni (×'+(npair*Lo)+')']];
        for(let j=0;j<Lo;j++)for(let i=0;i<L;i++)for(let k=i+1;k<L;k++){
          const gi=cellOf(fac,i,j),gk=cellOf(fac,k,j),dd=smean(gi)-smean(gk),t=dd/Math.sqrt(res.mse*(1/gi.length+1/gk.length)),p2=pFromT(t,res.dfe);
          tb.push([escHTML(labsO[j]),escHTML(labs[i]+' − '+labs[k]),dd.toFixed(2),t.toFixed(2),pCell(p2),pCell(Math.min(1,p2*npair*Lo))]);
        }
        pairHTML.push({kind:'note',html:'<b>Pairwise comparisons of '+escHTML(nmF)+' within each level of '+escHTML(nmO)+' (Bonferroni)</b>'},{kind:'table',rows:tb},
          {kind:'note',html:'Because the interaction is significant, the levels of '+escHTML(nmF)+' are compared inside each level of '+escHTML(nmO)+', not averaged over it. Every test uses the design\'s error term (MSE = '+res.mse.toFixed(2)+', df = '+res.dfe+'), and the Bonferroni column multiplies each p by all '+(npair*Lo)+' tests in the table.'});
      }
    });
    pairAPA=famBits.length?' '+famBits.join(' '):'';
  }
  const sent=(r: Anova2Row,i: number)=>'the '+(i===2?'interaction between '+aName+' and '+bName:'main effect of '+nm[i])+' was '+(r.p<0.05?'significant':'not significant')+', F('+r.df+', '+res.dfe+') = '+r.F.toFixed(2)+', '+fmtP(r.p)+', ηp² = '+noLead(r.eta.toFixed(3));
  const apa='A '+la+' × '+lb+' between-subjects ANOVA on '+dvName+' showed that '+res.rows.map(sent).join('; ')+'.'+simpleAPA+pairAPA;
  return finishResult(ctx,'anova2',html.concat(simpleHTML,pairHTML),apa,values);
}

export function runMregress(ctx: StatsCtx): StatsResult{
  const d=ctx.data;
  const m=stkMRData(ctx),dvName=d.cols[m.dvI]!.name,k=m.xs.length,n=m.y.length;
  if(m.err){return statsToast('mregress',m.err)}
  if(k<2){return statsToast('mregress','Tick at least 2 predictor columns (a categorical predictor with 3 or more levels counts as several). For one predictor use simple linear regression.')}
  if(k>12){return statsToast('mregress','This test handles up to 12 predictor columns after categorical predictors are expanded')}
  if(n<k+3){return statsToast('mregress','Need at least '+(k+3)+' complete rows for '+k+' predictors; there are '+n)}
  const o=stkOLS(m.xs,m.y);
  if(!o){return statsToast('mregress','Two or more predictors carry the same information (one is a copy or an exact combination of others, or has no variation), so the regression cannot be calculated. Remove one.')}
  const dfe=n-k-1;
  if(!(o.sse>1e-9*o.sst)){return statsToast('mregress','The predictors fit the outcome exactly, so the standard errors cannot be calculated.')}
  const mse=o.sse/dfe,r2=1-o.sse/o.sst,adj=1-(1-r2)*(n-1)/dfe,F=(r2/k)/((1-r2)/dfe),pF=pFromF(F,k,dfe),sdy=ssd(m.y),tc=stkTCrit(dfe,0.05);
  const names=m.labels;
  const vif=m.xs.map((x,j)=>{const others=m.xs.filter((q,i)=>i!==j),q=stkOLS(others,x);if(!q)return Infinity;const r2j=1-q.sse/q.sst;return 1/(1-r2j)});
  const rows: string[][]=[];
  const coef: Array<{ b: number; se: number; t: number; p: number; beta: number | null }>=[];
  const values: Record<string, number>={n:n,k:k,dfe:dfe,r2:r2,adj:adj,F:F,pF:pF};
  for(let j=0;j<=k;j++){
    const b=o.beta[j]!,se=Math.sqrt(mse*o.inv[j]![j]!),t=b/se,pj=pFromT(t,dfe),bet=(j===0||m.isDummy[j-1])?null:b*ssd(m.xs[j-1]!)/sdy;
    coef.push({b:b,se:se,t:t,p:pj,beta:bet});
    rows.push([(j===0?'Intercept':escHTML(names[j-1])),b.toFixed(3),se.toFixed(3),(bet===null?'':noLead(bet.toFixed(3))),t.toFixed(2),pCell(pj),'['+(b-tc*se).toFixed(3)+', '+(b+tc*se).toFixed(3)+']',(j===0?'':vif[j-1]!.toFixed(2))]);
    values['b_'+j]=b;values['se_'+j]=se;values['t_'+j]=t;values['p_'+j]=pj;if(j>0)values['vif_'+j]=vif[j-1]!;if(bet!==null)values['beta_'+j]=bet;
  }
  const maxV=Math.max.apply(null,vif);
  let stepHTML: StatsBlock[]=[],stepAPA='';
  if(m.hasStep2){
    const k1=m.step1n;
    if(k1<1){return statsToast('mregress','Step 2 needs at least one predictor in step 1. Tick the predictors to enter first in the top two lists.')}
    const o1=stkOLS(m.xs.slice(0,k1),m.y);
    if(!o1){return statsToast('mregress','The step 1 predictors carry the same information, so step 1 cannot be calculated.')}
    const dfe1=n-k1-1,r21=1-o1.sse/o1.sst,adj1=1-(1-r21)*(n-1)/dfe1,F1=(r21/k1)/((1-r21)/dfe1),p1=pFromF(F1,k1,dfe1);
    const dk=k-k1,dR=r2-r21,Fc=(dR/dk)/((1-r2)/dfe),pc=pFromF(Fc,dk,dfe);
    stepHTML=[{kind:'table',rows:[['Step','Predictors','R²','Adjusted R²','ΔR²','F change','df','p'],
      ['1',names.slice(0,k1).map(escHTML).join(', '),noLead(r21.toFixed(3)),noLead(adj1.toFixed(3)),noLead(r21.toFixed(3)),F1.toFixed(2),k1+', '+dfe1,pCell(p1)],
      ['2','+ '+names.slice(k1).map(escHTML).join(', '),noLead(r2.toFixed(3)),noLead(adj.toFixed(3)),noLead(dR.toFixed(3)),Fc.toFixed(2),dk+', '+dfe,pCell(pc)]]},
      {kind:'note',html:'F change tests whether the step 2 predictors add anything beyond step 1. The coefficients below are for the final model with every predictor in. Which predictors go in step 1 should come from theory, written down before you look at the results.'}];
    stepAPA=' In step 1, '+names.slice(0,k1).join(', ')+' accounted for '+noLead((r21*100).toFixed(1))+'% of the variance in '+dvName+', F('+k1+', '+dfe1+') = '+F1.toFixed(2)+', '+fmtP(p1)+'. Adding '+names.slice(k1).join(', ')+' in step 2 '+(pc<0.05?'significantly improved':'did not significantly improve')+' the model, ΔR² = '+noLead(dR.toFixed(3))+', F('+dk+', '+dfe+') = '+Fc.toFixed(2)+', '+fmtP(pc)+'.';
    values.k1=k1;values.r21=r21;values.adj1=adj1;values.F1=F1;values.p1=p1;values.dR=dR;values.Fc=Fc;values.pc=pc;
  }
  let notes='';
  if(n<10*k)notes+=' Only '+n+' complete rows for '+k+' predictors: a common rule of thumb asks for 10 to 15 per predictor, so the coefficients may not hold up in a new sample.';
  if(maxV>=10)notes+=' A VIF of 10 or more means that predictor overlaps heavily with the others; its coefficient is unstable and its standard error inflated. Consider dropping or combining predictors.';
  else if(maxV>=5)notes+=' A VIF above 5 means some predictors overlap noticeably, which widens their confidence intervals.';
  if(m.refs.length)notes+=' Each categorical predictor is turned into 0/1 columns, one per level except the reference level, and each b is the difference from the reference level with the other predictors held constant. Reference levels: '+m.refs.map(r=>r.name+' = '+r.level+(r.auto?' (the largest group)':' (your choice)')).join('; ')+'.';
  if(m.refs.some(r=>r.small))notes+=' At least one level of a categorical predictor has fewer than 5 rows, so its coefficient rests on very little data.';
  if(m.dropped)notes+=' '+m.dropped+' row'+(m.dropped===1?' was':'s were')+' left out because a value was missing.';
  const html: StatsBlock[]=stepHTML.concat([{kind:'note',html:'Model: '+escHTML(dvName)+' predicted from '+names.map(escHTML).join(', ')+'. N = '+n+'.'},
    {kind:'table',rows:[['R²','Adjusted R²','F','df','p'],[noLead(r2.toFixed(3)),noLead(adj.toFixed(3)),F.toFixed(2),k+', '+dfe,pCell(pF)]]},
    {kind:'table',rows:[['Predictor','b','SE','β','t','p','95% CI for b','VIF'],...rows]},
    {kind:'note',html:'b is in the units of the outcome per one unit of the predictor, holding the other predictors constant. β is the standardised coefficient, useful for comparing predictors measured on different scales.'+notes+' Standardised β is not shown for 0/1 columns, since a one-standard-deviation change in a yes/no column means little.'}]);
  const bits=names.map((nm,j)=>nm+(coef[j+1]!.beta===null?' (b = '+coef[j+1]!.b.toFixed(2):' (β = '+(coef[j+1]!.beta!<0?'-':'')+noLead(Math.abs(coef[j+1]!.beta!).toFixed(2)))+', '+fmtP(coef[j+1]!.p)+')');
  const apa='A multiple linear regression with '+names.join(', ')+' as predictors of '+dvName+' '+(pF<0.05?'was significant':'was not significant')+', F('+k+', '+dfe+') = '+F.toFixed(2)+', '+fmtP(pF)+', R² = '+noLead(r2.toFixed(2))+', adjusted R² = '+noLead(adj.toFixed(2))+'. Individual predictors: '+bits.join('; ')+'.'+stepAPA;
  return finishResult(ctx,'mregress',html,apa,values);
}
