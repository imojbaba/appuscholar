import { escHTML } from "./html";
import { pFromF, pFromT } from "./pvalue";
import { fmtP, noLead, pCell } from "./statfmt";
import { smean, svar, ssd, smedian, stkPtukey, stkQtukey, stkTCrit } from "./statsmath";
import { finishResult, gv, sig, statsColVals, statsGroupBy, statsToast } from "./stats-core";
import type { StatsBlock, StatsCtx, StatsResult } from "./stats-core";

/* The runners of statsRunNow for means: `desc` (12618-12626), `ttest1` (12628-12640), `ttestInd` (12641-12664), `ttestPaired` (12665-12683), `anova1` (12684-12701), `tukey`
   (12702-12724), `regression` (12725-12750) and `pearson` (12795-12819). Each is v1's branch as v1 wrote it: the same reads of the form, the same toasts (a toast and
   return becomes statsToast), the same arithmetic and toFixed calls, the same table cells (v1's `<table class="stats-table">` becomes a table block whose first row is the `th` cells
   and second the `td` cells) and the same sentence, handed to finishResult as v1 hands them to statsResultsShow.
   What differs from v1's text:
   - `d` is `ctx.data`, `gv('x')` is `gv(ctx,'x')`, `statsColVals(idx,true)` is `statsColVals(ctx,idx,true)`; `d.cols[idx].name` carries `!` (a missing column still throws, as in v1, and
     runStats turns the throw into v1's catch toast);
   - a cell v1 wrote as `'<td>'+n+'</td>'` (vals.length, n, mu, df) is `String(n)`, the same text;
   - each runner returns finishResult's result with `values`, the raw numbers behind the cells (desc: n, m, s, md, min, max; ttest1: n, m, s, mu, t, df, p, dlo, dhi, dEff), which v1
     keeps only in its closures;
   - statsChartHistogram (12626, 12640) is not called: the charts are not ported (register row F27); their data is in `values` and the blocks.
   The six tests on means (Task 4) follow the same rules, and also:
   - `window._statsSkipped=(window._statsSkipped||0)+1` in the pair filters of ttestPaired (12667), regression (12727) and pearson (12797) is `ctx.skipped=(ctx.skipped||0)+1`, at the
     same point; ttestInd, anova1 and tukey count through `statsGroupBy(ctx,dvI,ivI)`, and their assumption pass counts again (register row D-W2-4); the group order is object-key order (F4);
   - a table v1 built by concatenation (`'<tr><td>'+escHTML(k)+'</td>...'`, `keys.map(...).join('')`, tukey's `html+=` per pair) is one table block whose rows are the same cells; a cell v1
     wrote as a bare number (n1, n2, n, df, g.length) is `String(x)`; a `<p class="desc">` is a note of the same innerHTML (regression's `&nbsp;|&nbsp;`, ttestPaired's `d<sub>z</sub>`);
     `statsResultsShow(html+'<p ...>',apa.replace(...))` is `finishResult(ctx,key,html.concat([note]),apa.replace(...),values)` with the same replace; pearson's `(ciR?'<p ...>':'')` adds
     the note only when ciR is not empty;
   - `[].concat(...)` (anova1 12688, tukey 12706) is `([] as number[]).concat(...)`; `groups[k]` and `gk[i]` carry `!`; the pairs' `p[0]`/`p[1]` carry `!`;
   - ttestInd's `ivName` is read as v1 reads it (only its chart uses it, but `d.cols[NaN].name` throws on a form with no grouping column and v1's catch shows its toast), with an
     eslint-disable comment for the unused binding (anova1's sentence uses its `ivName`); the chart blocks (ttestInd 12660-12663, ttestPaired 12678-12683, anova1 12698-12701, tukey 12721-12724, regression 12744-12750,
     pearson 12813-12819) are not ported (F27) and read nothing that can throw;
   - tukey's p cell keeps v1's `noLead(pq<0.001?'< .001':pq.toFixed(3))` (a raw `<`, not pCell's `&lt;`: register row D-W2-6);
   - `values`: ttestInd n1, n2, m1, m2, v1, v2, t, df, p, tS, dfS, pS, dcohen, gH, ciLo, ciHi; ttestPaired n, md, sdv, t, df, p, dz, plo, phi; anova1 N, k, F, dfb, dfw, p, eta2;
     tukey kk, dfw, msw, qc and diff_i_j, q_i_j, p_i_j for each pair i < j in gk order; regression n, b0, b1, seB1, t, df, p, F, pF, r2, lo1, hi1, seB0, beta (sxy/Math.sqrt(sxx*syy),
     the number noLead prints); pearson n, r, df, t, p, and cl, ch when n > 3;
   - a value may be ±Infinity where v1's closure held one without printing it (pearson-perfect: r = 1 makes t = r*Math.sqrt(df/(1-r*r)) Infinity, which no cell or sentence shows, so the
     safety net does not fire); JSON.stringify writes such a value as null. */

export function runDesc(ctx: StatsCtx): StatsResult{
  const d=ctx.data;
  const idx=parseInt(gv(ctx,'dv'),10),name=d.cols[idx]!.name,vals=statsColVals(ctx,idx,true);
  if(vals.length<2){return statsToast('desc','Need at least 2 values')}
  const m=smean(vals),s=ssd(vals),md=smedian(vals);
  const html: StatsBlock[]=[{kind:'table',rows:[['N','M','SD','Median','Min','Max'],
    [String(vals.length),m.toFixed(2),s.toFixed(2),md.toFixed(2),Math.min(...vals).toFixed(2),Math.max(...vals).toFixed(2)]]}];
  return finishResult(ctx,'desc',html,name+': M = '+m.toFixed(2)+', SD = '+s.toFixed(2)+', N = '+vals.length+'.',{n:vals.length,m:m,s:s,md:md,min:Math.min(...vals),max:Math.max(...vals)});
}

export function runTtest1(ctx: StatsCtx): StatsResult{
  const d=ctx.data;
  const idx=parseInt(gv(ctx,'dv'),10),name=d.cols[idx]!.name,vals=statsColVals(ctx,idx,true),mu=parseFloat(gv(ctx,'mu'))||0;
  if(vals.length<2){return statsToast('ttest1','Need at least 2 values')}
  const m=smean(vals),s=ssd(vals),n=vals.length,df=n-1;
  if(!(s>0)){return statsToast('ttest1','Every value is the same, so there is no spread and this test cannot be calculated.')}
  const t=(m-mu)/(s/Math.sqrt(n)),p=pFromT(t,df);
  const html: StatsBlock[]=[{kind:'table',rows:[['M','SD','N','Test value','t','df','p'],
    [m.toFixed(2),s.toFixed(2),String(n),String(mu),t.toFixed(2),String(df),pCell(p)]]}];
  const apa='A one-sample t-test showed that '+name+' (M = '+m.toFixed(2)+', SD = '+s.toFixed(2)+') was '+(sig(p)?'significantly '+(m>mu?'higher':'lower')+' than':'not significantly different from')+' the test value of '+mu+', t('+df+') = '+t.toFixed(2)+', '+fmtP(p)+'.';
  const tc1=stkTCrit(df,0.05),dlo=(m-mu)-tc1*s/Math.sqrt(n),dhi=(m-mu)+tc1*s/Math.sqrt(n),dEff=(m-mu)/s;
  const ciTxt='mean difference = '+(m-mu).toFixed(2)+', 95% CI ['+dlo.toFixed(2)+', '+dhi.toFixed(2)+'], d = '+dEff.toFixed(2);
  return finishResult(ctx,'ttest1',html.concat([{kind:'note',html:'Mean difference '+(m-mu).toFixed(2)+', 95% CI ['+dlo.toFixed(2)+', '+dhi.toFixed(2)+'], Cohen\'s d = '+dEff.toFixed(2)+'.'}]),apa.replace(/\.$/,'')+', '+ciTxt+'.',
    {n:n,m:m,s:s,mu:mu,t:t,df:df,p:p,dlo:dlo,dhi:dhi,dEff:dEff});
}

export function runTtestInd(ctx: StatsCtx): StatsResult{
  const d=ctx.data;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- only v1's chart reads ivName, but the read throws on a form with no grouping column, which v1's catch turns into its toast
  const dvI=parseInt(gv(ctx,'dv'),10),ivI=parseInt(gv(ctx,'iv'),10),dvName=d.cols[dvI]!.name,ivName=d.cols[ivI]!.name;
  const groups=statsGroupBy(ctx,dvI,ivI),keys=Object.keys(groups);
  if(keys.length!==2){return statsToast('ttestInd','This grouping variable needs exactly 2 groups — it has '+keys.length)}
  const g1=groups[keys[0]!]!,g2=groups[keys[1]!]!;
  if(g1.length<2||g2.length<2){return statsToast('ttestInd','Each group needs at least 2 values')}
  const n1=g1.length,n2=g2.length,m1=smean(g1),m2=smean(g2),v1=svar(g1),v2=svar(g2);
  if(!(v1>0)&&!(v2>0)){return statsToast('ttestInd','Neither group has any spread (all values in each group are the same), so the t-test cannot be calculated.')}
  const se2=v1/n1+v2/n2,df=se2*se2/((v1/n1)*(v1/n1)/(n1-1)+(v2/n2)*(v2/n2)/(n2-1));
  const t=(m1-m2)/Math.sqrt(se2),p=pFromT(t,df),dfS=n1+n2-2,pooled=((n1-1)*v1+(n2-1)*v2)/dfS;
  const tS=(m1-m2)/Math.sqrt(pooled*(1/n1+1/n2)),pS=pFromT(tS,dfS);
  const dcohen=(m1-m2)/Math.sqrt(pooled),gH=dcohen*(1-3/(4*(n1+n2)-9));
  const tc=stkTCrit(df,0.05),ciLo=(m1-m2)-tc*Math.sqrt(se2),ciHi=(m1-m2)+tc*Math.sqrt(se2);
  const html: StatsBlock[]=[{kind:'table',rows:[['Group','N','M','SD'],
    [escHTML(keys[0]!),String(n1),m1.toFixed(2),Math.sqrt(v1).toFixed(2)],
    [escHTML(keys[1]!),String(n2),m2.toFixed(2),Math.sqrt(v2).toFixed(2)]]},
    {kind:'note',html:'Welch t('+df.toFixed(1)+') = '+t.toFixed(2)+', '+fmtP(p)+', Hedges\' g = '+gH.toFixed(2)+', mean difference '+(m1-m2).toFixed(2)+', 95% CI ['+ciLo.toFixed(2)+', '+ciHi.toFixed(2)+']. '+
    'Welch is the default because it stays accurate when the two groups have different spreads and loses almost nothing when they do not. For comparison, Student\'s t('+dfS+') = '+tS.toFixed(2)+', '+fmtP(pS)+'.'}];
  const apa='An independent-samples Welch t-test showed that '+dvName+' '+(sig(p)?'differed significantly':'did not differ significantly')+' between '+keys[0]+' (M = '+m1.toFixed(2)+', SD = '+Math.sqrt(v1).toFixed(2)+') and '+keys[1]+' (M = '+m2.toFixed(2)+', SD = '+Math.sqrt(v2).toFixed(2)+'), t('+df.toFixed(2)+') = '+t.toFixed(2)+', '+fmtP(p)+', g = '+gH.toFixed(2)+', 95% CI of the difference ['+ciLo.toFixed(2)+', '+ciHi.toFixed(2)+'].';
  return finishResult(ctx,'ttestInd',html,apa,{n1:n1,n2:n2,m1:m1,m2:m2,v1:v1,v2:v2,t:t,df:df,p:p,tS:tS,dfS:dfS,pS:pS,dcohen:dcohen,gH:gH,ciLo:ciLo,ciHi:ciHi});
}

export function runTtestPaired(ctx: StatsCtx): StatsResult{
  const d=ctx.data;
  const i1=parseInt(gv(ctx,'v1'),10),i2=parseInt(gv(ctx,'v2'),10),n1name=d.cols[i1]!.name,n2name=d.cols[i2]!.name;
  const pairs=d.rows.map(r=>[r[i1],r[i2]]).filter(p=>p[0]!==undefined&&p[0]!==''&&p[1]!==undefined&&p[1]!=='').map(p=>[parseFloat(p[0]!),parseFloat(p[1]!)]).filter(p=>{const ok=isFinite(p[0]!)&&isFinite(p[1]!);if(!ok)ctx.skipped=(ctx.skipped||0)+1;return ok});
  if(pairs.length<2){return statsToast('ttestPaired','Need at least 2 complete pairs')}
  const diffs=pairs.map(p=>p[0]!-p[1]!),n=diffs.length,md=smean(diffs),sdv=ssd(diffs),df=n-1;
  if(!(sdv>0)){return statsToast('ttestPaired','Every pair has exactly the same difference, so there is no spread and the paired t-test cannot be calculated.')}
  const t=md/(sdv/Math.sqrt(n)),p=pFromT(t,df),dz=md/sdv;
  const html: StatsBlock[]=[{kind:'table',rows:[['N pairs','Mean diff','SD diff','t','df','p'],
    [String(n),md.toFixed(2),sdv.toFixed(2),t.toFixed(2),String(df),pCell(p)]]}];
  const apa='A paired-samples t-test showed a '+(sig(p)?'significant':'non-significant')+' difference between '+n1name+' and '+n2name+' (M diff = '+md.toFixed(2)+', SD = '+sdv.toFixed(2)+'), t('+df+') = '+t.toFixed(2)+', '+fmtP(p)+', d = '+dz.toFixed(2)+'.';
  const tcP=stkTCrit(df,0.05),plo=md-tcP*sdv/Math.sqrt(n),phi=md+tcP*sdv/Math.sqrt(n);
  return finishResult(ctx,'ttestPaired',html.concat([{kind:'note',html:'Mean difference '+md.toFixed(2)+', 95% CI ['+plo.toFixed(2)+', '+phi.toFixed(2)+'], d<sub>z</sub> = '+dz.toFixed(2)+'.'}]),apa.replace(/, d = /,', 95% CI ['+plo.toFixed(2)+', '+phi.toFixed(2)+'], d = '),
    {n:n,md:md,sdv:sdv,t:t,df:df,p:p,dz:dz,plo:plo,phi:phi});
}

export function runAnova1(ctx: StatsCtx): StatsResult{
  const d=ctx.data;
  const dvI=parseInt(gv(ctx,'dv'),10),ivI=parseInt(gv(ctx,'iv'),10),dvName=d.cols[dvI]!.name,ivName=d.cols[ivI]!.name;
  const groups=statsGroupBy(ctx,dvI,ivI),keys=Object.keys(groups);
  if(keys.length<3){return statsToast('anova1','One-way ANOVA needs 3 or more groups — use the t-test for 2')}
  const all=([] as number[]).concat(...keys.map(k=>groups[k]!)),grand=smean(all),N=all.length,k=keys.length;
  let ssb=0,ssw=0;
  keys.forEach(key2=>{const g=groups[key2]!,m=smean(g);ssb+=g.length*(m-grand)*(m-grand);g.forEach(v=>ssw+=(v-m)*(v-m))});
  if(!(ssw>0)||N-k<1){return statsToast('anova1','No group has any spread, or there are too few values for the number of groups, so the ANOVA cannot be calculated.')}
  const dfb=k-1,dfw=N-k,msb=ssb/dfb,msw=ssw/dfw,F=msb/msw,p=pFromF(F,dfb,dfw),eta2=ssb/(ssb+ssw);
  const html: StatsBlock[]=[{kind:'table',rows:[['Group','N','M','SD'],
    ...keys.map(key2=>{const g=groups[key2]!;return[escHTML(key2),String(g.length),smean(g).toFixed(2),(g.length>1?ssd(g).toFixed(2):'—')]})]},
    {kind:'note',html:'F('+dfb+', '+dfw+') = '+F.toFixed(2)+', '+fmtP(p)+', η² = '+eta2.toFixed(3)}];
  const apa='A one-way ANOVA showed a '+(sig(p)?'significant':'non-significant')+' effect of '+ivName+' on '+dvName+', F('+dfb+', '+dfw+') = '+F.toFixed(2)+', '+fmtP(p)+', η² = '+eta2.toFixed(3)+'.'+(sig(p)?' Post-hoc comparisons (e.g. Tukey HSD) are needed to locate which groups differ.':'');
  return finishResult(ctx,'anova1',html,apa,{N:N,k:k,F:F,dfb:dfb,dfw:dfw,p:p,eta2:eta2});
}

export function runTukey(ctx: StatsCtx): StatsResult{
  const dvI=parseInt(gv(ctx,'dv'),10),ivI=parseInt(gv(ctx,'iv'),10);
  const groups=statsGroupBy(ctx,dvI,ivI),gk=Object.keys(groups);
  if(gk.length<3){return statsToast('tukey','Tukey HSD needs 3 or more groups')}
  const all=([] as number[]).concat(...gk.map(k2=>groups[k2]!)),N=all.length,kk=gk.length;
  let ssw=0;gk.forEach(k2=>{const g=groups[k2]!,m=smean(g);g.forEach(v=>ssw+=(v-m)*(v-m))});
  if(!(ssw>0)||N-kk<1){return statsToast('tukey','No group has any spread, or there are too few values, so Tukey HSD cannot be calculated.')}
  const dfw=N-kk,msw=ssw/dfw,qc=stkQtukey(0.95,kk,dfw);
  const rows: string[][]=[['Comparison','Mean diff','q','p (adjusted)','Sig?']];
  const apaBits: string[]=[];
  const values: Record<string, number>={kk:kk,dfw:dfw,msw:msw,qc:qc};
  for(let i=0;i<kk;i++)for(let j=i+1;j<kk;j++){
    const gi=groups[gk[i]!]!,gj=groups[gk[j]!]!;
    const diff=smean(gi)-smean(gj),se=Math.sqrt(msw/2*(1/gi.length+1/gj.length)),q=Math.abs(diff)/se,pq=Math.max(0,1-stkPtukey(q,kk,dfw)),isSig=pq<0.05;
    rows.push([escHTML(gk[i]!)+' vs '+escHTML(gk[j]!),diff.toFixed(2),q.toFixed(2),noLead(pq<0.001?'< .001':pq.toFixed(3)),(isSig?'Yes':'No')]);
    apaBits.push(gk[i]+' vs '+gk[j]+' ('+fmtP(pq)+')');
    values['diff_'+i+'_'+j]=diff;values['q_'+i+'_'+j]=q;values['p_'+i+'_'+j]=pq;
  }
  const html: StatsBlock[]=[{kind:'table',rows:rows},{kind:'note',html:'MSW = '+msw.toFixed(2)+', df = '+dfw+'. Exact studentized-range probabilities. Tukey HSD assumes similar spread in every group; with unequal spreads use Welch ANOVA, which comes with Games-Howell.'}];
  const apa='Tukey HSD post-hoc comparisons (q critical = '+qc.toFixed(2)+', α = .05) gave: '+apaBits.join('; ')+'.';
  return finishResult(ctx,'tukey',html,apa,values);
}

export function runRegression(ctx: StatsCtx): StatsResult{
  const d=ctx.data;
  const i1=parseInt(gv(ctx,'iv'),10),i2=parseInt(gv(ctx,'dv'),10),xName=d.cols[i1]!.name,yName=d.cols[i2]!.name;
  const pairs=d.rows.map(r=>[r[i1],r[i2]]).filter(p=>p[0]!==undefined&&p[0]!==''&&p[1]!==undefined&&p[1]!=='').map(p=>[parseFloat(p[0]!),parseFloat(p[1]!)]).filter(p=>{const ok=isFinite(p[0]!)&&isFinite(p[1]!);if(!ok)ctx.skipped=(ctx.skipped||0)+1;return ok});
  const n=pairs.length;
  if(n<3){return statsToast('regression','Need at least 3 complete pairs')}
  const xs=pairs.map(p=>p[0]!),ys=pairs.map(p=>p[1]!),mx=smean(xs),my=smean(ys);
  let sxy=0,sxx=0,syy=0;
  for(let i=0;i<n;i++){sxy+=(xs[i]!-mx)*(ys[i]!-my);sxx+=(xs[i]!-mx)*(xs[i]!-mx);syy+=(ys[i]!-my)*(ys[i]!-my)}
  if(!(sxx>0)||!(syy>0)){return statsToast('regression','One of the two variables has no spread (every value is the same), so a regression cannot be calculated.')}
  const b1=sxy/sxx,b0=my-b1*mx,r2=(sxy*sxy)/(sxx*syy),df=n-2;
  const ssResid=syy-b1*sxy,mse=ssResid/df,seB1=Math.sqrt(mse/sxx);
  if(!(ssResid>1e-10*syy)){return statsToast('regression','The points fall exactly on a straight line, so the standard errors and p-value cannot be calculated. Check that the data are real measurements.')}
  const t=b1/seB1,p=pFromT(t,df),F=t*t,pF=pFromF(F,1,df);
  const html: StatsBlock[]=[{kind:'table',rows:[['N','b0 (intercept)','b1 (slope)','SE(b1)','t','df','p','R²'],
    [String(n),b0.toFixed(3),b1.toFixed(3),seB1.toFixed(3),t.toFixed(2),String(df),pCell(p),r2.toFixed(3)]]},
    {kind:'note',html:'ŷ = '+b0.toFixed(3)+' + '+b1.toFixed(3)+'·x &nbsp;|&nbsp; F(1, '+df+') = '+F.toFixed(2)+', '+fmtP(pF)}];
  const apa='A simple linear regression showed that '+xName+' '+(sig(p)?'significantly predicted':'did not significantly predict')+' '+yName+', b = '+b1.toFixed(3)+', SE = '+seB1.toFixed(3)+', t('+df+') = '+t.toFixed(2)+', '+fmtP(p)+', R² = '+r2.toFixed(3)+', F(1, '+df+') = '+F.toFixed(2)+', '+fmtP(pF)+'.';
  const tcR=stkTCrit(df,0.05),seB0=Math.sqrt(mse*(1/n+mx*mx/sxx)),lo1=b1-tcR*seB1,hi1=b1+tcR*seB1;
  return finishResult(ctx,'regression',html.concat([{kind:'note',html:'95% CI for the slope ['+lo1.toFixed(3)+', '+hi1.toFixed(3)+'], SE(b0) = '+seB0.toFixed(3)+'. Standardised slope (β) = '+noLead(((sxy/Math.sqrt(sxx*syy))).toFixed(3))+'. Check the residuals for a curve or a fan shape before you trust these numbers.'}]),apa.replace(/, R² = /,', 95% CI ['+lo1.toFixed(3)+', '+hi1.toFixed(3)+'], R² = '),
    {n:n,b0:b0,b1:b1,seB1:seB1,t:t,df:df,p:p,F:F,pF:pF,r2:r2,lo1:lo1,hi1:hi1,seB0:seB0,beta:sxy/Math.sqrt(sxx*syy)});
}

export function runPearson(ctx: StatsCtx): StatsResult{
  const d=ctx.data;
  const i1=parseInt(gv(ctx,'v1'),10),i2=parseInt(gv(ctx,'v2'),10),n1name=d.cols[i1]!.name,n2name=d.cols[i2]!.name;
  const pairs=d.rows.map(r=>[r[i1],r[i2]]).filter(p=>p[0]!==undefined&&p[0]!==''&&p[1]!==undefined&&p[1]!=='').map(p=>[parseFloat(p[0]!),parseFloat(p[1]!)]).filter(p=>{const ok=isFinite(p[0]!)&&isFinite(p[1]!);if(!ok)ctx.skipped=(ctx.skipped||0)+1;return ok});
  const n=pairs.length;
  if(n<3){return statsToast('pearson','Need at least 3 complete pairs')}
  const xs=pairs.map(p=>p[0]!),ys=pairs.map(p=>p[1]!),mx=smean(xs),my=smean(ys);
  let sxy=0,sxx=0,syy=0;
  for(let i=0;i<n;i++){sxy+=(xs[i]!-mx)*(ys[i]!-my);sxx+=(xs[i]!-mx)*(xs[i]!-mx);syy+=(ys[i]!-my)*(ys[i]!-my)}
  if(!(sxx>0)||!(syy>0)){return statsToast('pearson','One of the two variables has no spread (every value is the same), so a correlation cannot be calculated.')}
  const r=sxy/Math.sqrt(sxx*syy),df=n-2;
  const t=r*Math.sqrt(df/(1-r*r)),p=pFromT(t,df);
  const strength=Math.abs(r)<0.1?'negligible':Math.abs(r)<0.3?'weak':Math.abs(r)<0.5?'moderate':Math.abs(r)<0.7?'strong':'very strong';
  const html: StatsBlock[]=[{kind:'table',rows:[['N','r','df','p'],
    [String(n),noLead(r.toFixed(2)),String(df),pCell(p)]]}];
  const apa='There was a '+strength+' '+(r>=0?'positive':'negative')+' correlation between '+n1name+' and '+n2name+', which '+(sig(p)?'was':'was not')+' statistically significant, r('+df+') = '+noLead(r.toFixed(2))+', '+fmtP(p)+'.';
  const values: Record<string, number>={n:n,r:r,df:df,t:t,p:p};
  let ciR='';
  if(n>3){const zf=Math.atanh(r),sef=1/Math.sqrt(n-3),cl=Math.tanh(zf-1.959963984540054*sef),ch=Math.tanh(zf+1.959963984540054*sef);ciR=', 95% CI ['+noLead(cl.toFixed(2))+', '+noLead(ch.toFixed(2))+']';values.cl=cl;values.ch=ch}
  return finishResult(ctx,'pearson',html.concat(ciR?[{kind:'note',html:ciR.slice(2)+' (Fisher z).'}]:[]),apa.replace(/\.$/,'')+ciR+'.',values);
}
