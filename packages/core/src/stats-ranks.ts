import { escHTML } from "./html";
import { pFromZ } from "./pvalue";
import { fmtP, noLead, pCell } from "./statfmt";
import { smean, ssd, smedian, ranks, stkTieTerm, stkExactMW, stkExactSR, stkKruskal, stkDunn, stkSpearman, stkWelchAnova, stkGamesHowell } from "./statsmath";
import { finishResult, gv, sig, statsGroupBy, statsToast } from "./stats-core";
import type { StatsBlock, StatsCtx, StatsResult } from "./stats-core";

/* The rank tests and Welch's ANOVA of statsRunNow: `mannwhitney` (12751-12771), `wilcoxon` (12772-12794), `welchAnova` with Games-Howell (13116-13136), `kruskal` with Dunn
   (13165-13187) and `spearman` (13188-13202). Each is v1's branch as v1 wrote it, in the shape of stats-means.ts: the same reads of the form, the same toasts (a toast and return becomes
   statsToast), the same arithmetic, literals and toFixed calls, the same table cells and note innerHTML, and the same sentence, handed to finishResult as v1 hands them to statsResultsShow.
   What differs from v1's text, in every branch:
   - `d` is `ctx.data`, `gv('x')` is `gv(ctx,'x')`, `statsGroupBy(dvI,ivI)` is `statsGroupBy(ctx,dvI,ivI)`; `d.cols[idx].name`, `groups[k]`, `keys[i]`, `gs[i]`, `r[i]`,
     `kw.meanRanks[i]` and the pairs' `p[0]`/`p[1]` carry `!` (noUncheckedIndexedAccess; a missing column still throws, as in v1, and runStats turns the throw into v1's catch toast);
   - `showToast(x);return` is `return statsToast(key,x)`; `statsResultsShow(html,apa)` is `finishResult(ctx,key,blocks,apa,values)`;
   - a table v1 built by concatenation is one table block whose first row is the `th` cells and the rest the `td` cells, a cell v1 wrote as a bare number (n1, n2, n, sp.n, sp.df,
     gs[i].length) is `String(x)`, the same text, and a `keys.map(...).join('')` or `gh.map(...).join('')`/`dn.map(...).join('')` becomes the rows it joined; a `<p class="desc">` is a
     note of the same innerHTML; `let html=...; html+=...` (welchAnova, kruskal) becomes pushes onto the blocks in the same order;
   - the arrow helpers `fe` and `fr` gain a parameter type;
   - each runner returns finishResult's result with `values`, the raw numbers behind the cells (register row F27: the charts' data): mannwhitney n1, n2, U, U1, U2, z, p, rrb, exact
     (exactOK as 1 or 0); wilcoxon n, W, wPlus, wMinus, z, p, rbc, exact; kruskal H, df, p, eps2 and, when the Dunn table is shown, padj_i_j for each pair (i < j in key order);
     spearman n, rho, df, p, lo, hi; welchAnova F, df1, df2, p, omega2 and, when the Games-Howell table is shown, gh_p_i_j, gh_diff_i_j, gh_lo_i_j, gh_hi_i_j;
   - the statsChartBarMeans and statsChartScatter calls after statsResultsShow (12770, 12790-12793, 13135, 13186, 13201) are not ported (F27); they read nothing that can throw
     (wilcoxon's block builds v1s and v2s from the pairs for its chart only, and goes with it).
   Per branch, the rest is v1's character for character, including:
   - mannwhitney: `Math.min(0,U-meanU+0.5)/sdU`; `stkTieTerm(combined)>0` as the tie test (exact floating-point equality, register row F15) and `n1<50&&n2<50`; `escHTML(keys[0])` in the
     cells and the note, raw keys in the sentence; the groups in object-key order (F4), so with integer-like labels the note's "(positive: <first key> tends to score higher)" names the
     smaller label; the "left out" count comes from statsGroupBy (no assumption pass for this test, so it is not doubled);
   - wilcoxon: the pair filter counts `ctx.skipped=(ctx.skipped||0)+1` inline at v1's point (12774); `Math.max(1e-12, …)` in sdW; `tieS===0&&nZero===0&&n<50` (F15);
   - welchAnova: Games-Howell's p cell `(q.p<0.001?'&lt; .001':noLead(q.p.toFixed(3)))` as v1 wrote it; ω² is stkWelchAnova's, from the classic sums of squares (F9); the assumption
     pass calls statsGroupBy again, so the "left out" count is doubled (register row D-W2-4);
   - kruskal: the sentence's `' groups'` suffix after the column name ("across the group groups", F2); Dunn's p cell `(q.padj<0.001?'&lt; .001':noLead(q.padj.toFixed(3)))`; the
     `!isFinite(kw.H)` toast is kept though stkKruskal's H is finite for every input that reaches it (all-tied scores give H = 0: register row D-W2-16);
   - spearman: the p cell is `noLead(sp.p.toFixed(3))`, not pCell, so a tiny p prints `.000` while the sentence's fmtP prints `p < .001` (F1); its pair filter drops what is not a
     number without counting it, so no "left out" line (F18); p is stkSpearman's t approximation at every n (F7). */

export function runMannwhitney(ctx: StatsCtx): StatsResult{
  const d=ctx.data;
  const dvI=parseInt(gv(ctx,'dv'),10),ivI=parseInt(gv(ctx,'iv'),10),dvName=d.cols[dvI]!.name;
  const groups=statsGroupBy(ctx,dvI,ivI),keys=Object.keys(groups);
  if(keys.length!==2){return statsToast('mannwhitney','This grouping variable needs exactly 2 groups — it has '+keys.length)}
  const g1=groups[keys[0]!]!,g2=groups[keys[1]!]!,n1=g1.length,n2=g2.length;
  const combined=g1.concat(g2),r=ranks(combined);
  const R1=r.slice(0,n1).reduce((s,v)=>s+v,0);
  const U1=R1-n1*(n1+1)/2,U2=n1*n2-U1,U=Math.min(U1,U2);
  const NN=n1+n2,meanU=n1*n2/2,sdU=Math.sqrt(n1*n2/12*((NN+1)-stkTieTerm(combined)/(NN*(NN-1))));
  if(!(sdU>0)){return statsToast('mannwhitney','All scores are identical, so they cannot be ranked and the test cannot be calculated.')}
  const hasTies=stkTieTerm(combined)>0,exactOK=!hasTies&&n1<50&&n2<50;
  const z=Math.min(0,U-meanU+0.5)/sdU,p=exactOK?stkExactMW(n1,n2,U):pFromZ(z),rrb=(U1-U2)/(n1*n2);
  const zTxt=exactOK?'':', z = '+z.toFixed(2);
  const html: StatsBlock[]=[{kind:'table',rows:[['Group','N','Median'],
    [escHTML(keys[0]!),String(n1),smedian(g1).toFixed(2)],
    [escHTML(keys[1]!),String(n2),smedian(g2).toFixed(2)]]},
    {kind:'note',html:'U = '+U.toFixed(1)+zTxt+', '+fmtP(p)+', rank-biserial r = '+noLead(rrb.toFixed(2))+' (positive: '+escHTML(keys[0]!)+' tends to score higher). '+(exactOK?'Exact p-value, because no scores are tied and each group has fewer than 50.':'Normal approximation with continuity and tie corrections, the same as R. Used because some scores are tied or a group has 50 or more.')}];
  const apa='A Mann-Whitney U test showed that '+dvName+' '+(sig(p)?'differed significantly':'did not differ significantly')+' between '+keys[0]+' (Mdn = '+smedian(g1).toFixed(2)+') and '+keys[1]+' (Mdn = '+smedian(g2).toFixed(2)+'), U = '+U.toFixed(1)+zTxt+', '+fmtP(p)+(exactOK?' (exact)':'')+'.';
  return finishResult(ctx,'mannwhitney',html,apa,{n1:n1,n2:n2,U:U,U1:U1,U2:U2,z:z,p:p,rrb:rrb,exact:exactOK?1:0});
}

export function runWilcoxon(ctx: StatsCtx): StatsResult{
  const d=ctx.data;
  const i1=parseInt(gv(ctx,'v1'),10),i2=parseInt(gv(ctx,'v2'),10),n1name=d.cols[i1]!.name,n2name=d.cols[i2]!.name;
  const pairs=d.rows.map(r=>[r[i1],r[i2]]).filter(p=>p[0]!==undefined&&p[0]!==''&&p[1]!==undefined&&p[1]!=='').map(p=>[parseFloat(p[0]!),parseFloat(p[1]!)]).filter(p=>{const ok=isFinite(p[0]!)&&isFinite(p[1]!);if(!ok)ctx.skipped=(ctx.skipped||0)+1;return ok});
  const diffs=pairs.map(p=>p[0]!-p[1]!).filter(x=>x!==0);
  const n=diffs.length;
  if(n<2){return statsToast('wilcoxon','Need at least 2 non-zero paired differences')}
  const absd=diffs.map(Math.abs),r=ranks(absd);
  let wPlus=0,wMinus=0;
  diffs.forEach((x,i)=>{if(x>0)wPlus+=r[i]!;else wMinus+=r[i]!});
  const W=Math.min(wPlus,wMinus),meanW=n*(n+1)/4;
  const tieS=stkTieTerm(absd),nZero=pairs.length-n,exactOK=(tieS===0&&nZero===0&&n<50);
  const sdW=Math.sqrt(Math.max(1e-12,n*(n+1)*(2*n+1)/24-tieS/48));
  const z=Math.min(0,W-meanW+0.5)/sdW,p=exactOK?stkExactSR(n,W):pFromZ(z);
  const rbc=(wPlus-wMinus)/(n*(n+1)/2);
  const html: StatsBlock[]=[{kind:'table',rows:[['N (non-zero diffs)','W','z','p'],
    [String(n),W.toFixed(1),(exactOK?'—':z.toFixed(2)),pCell(p)]]}];
  const apa='A Wilcoxon signed-rank test showed a '+(sig(p)?'significant':'non-significant')+' difference between '+n1name+' and '+n2name+(exactOK?', '+fmtP(p)+' (exact)':', z = '+z.toFixed(2)+', '+fmtP(p)+' (normal approximation with continuity and tie corrections)')+', matched-pairs rank-biserial r = '+noLead(rbc.toFixed(2))+'.';
  return finishResult(ctx,'wilcoxon',html,apa,{n:n,W:W,wPlus:wPlus,wMinus:wMinus,z:z,p:p,rbc:rbc,exact:exactOK?1:0});
}

export function runWelchAnova(ctx: StatsCtx): StatsResult{
  const d=ctx.data;
  const dvI=parseInt(gv(ctx,'dv'),10),ivI=parseInt(gv(ctx,'iv'),10),dvName=d.cols[dvI]!.name,ivName=d.cols[ivI]!.name;
  const groups=statsGroupBy(ctx,dvI,ivI),keys=Object.keys(groups);
  if(keys.length<3){return statsToast('welchAnova','This test needs 3 or more groups. For 2 groups use the independent t-test (Welch)')}
  if(keys.some(k2=>groups[k2]!.length<2)){return statsToast('welchAnova','Each group needs at least 2 values')}
  const gs=keys.map(k2=>groups[k2]!),wa=stkWelchAnova(gs);
  if(!wa){return statsToast('welchAnova','One group has no spread at all (every value is the same), so Welch ANOVA cannot be computed')}
  const fe=(x: number)=>noLead(x.toFixed(2));
  const html: StatsBlock[]=[{kind:'table',rows:[['Group','N','M','SD'],
    ...keys.map((k2,i)=>[escHTML(k2),String(gs[i]!.length),smean(gs[i]!).toFixed(2),ssd(gs[i]!).toFixed(2)])]},
    {kind:'note',html:'Welch F('+wa.df1+', '+wa.df2.toFixed(2)+') = '+wa.F.toFixed(2)+', '+fmtP(wa.p)+', ω² = '+fe(wa.omega2)+' (conventional labels: .01 small, .06 medium, .14 large; they say nothing about importance).'}];
  let apa='A Welch one-way ANOVA showed '+(sig(wa.p)?'a significant':'no significant')+' effect of '+ivName+' on '+dvName+', F('+wa.df1+', '+wa.df2.toFixed(2)+') = '+wa.F.toFixed(2)+', '+fmtP(wa.p)+', ω² = '+fe(wa.omega2)+'.';
  const values: Record<string, number>={F:wa.F,df1:wa.df1,df2:wa.df2,p:wa.p,omega2:wa.omega2};
  if(sig(wa.p)){
    const gh=stkGamesHowell(gs);
    html.push({kind:'table',rows:[['Games-Howell comparison','Mean difference','95% CI','df','p (adjusted)'],
      ...gh.map(q=>[escHTML(keys[q.i]!)+' vs '+escHTML(keys[q.j]!),q.diff.toFixed(2),'['+q.lo.toFixed(2)+', '+q.hi.toFixed(2)+']',q.df.toFixed(1),(q.p<0.001?'&lt; .001':noLead(q.p.toFixed(3)))])]});
    apa+=' Games-Howell comparisons: '+gh.map(q=>keys[q.i]+' vs '+keys[q.j]+' (M diff = '+q.diff.toFixed(2)+', 95% CI ['+q.lo.toFixed(2)+', '+q.hi.toFixed(2)+'], '+fmtP(q.p)+')').join('; ')+'.';
    gh.forEach(q=>{const ij=q.i+'_'+q.j;values['gh_p_'+ij]=q.p;values['gh_diff_'+ij]=q.diff;values['gh_lo_'+ij]=q.lo;values['gh_hi_'+ij]=q.hi});
  }else html.push({kind:'note',html:'The overall test is not significant, so no pairwise comparisons are shown.'});
  return finishResult(ctx,'welchAnova',html,apa,values);
}

export function runKruskal(ctx: StatsCtx): StatsResult{
  const d=ctx.data;
  const dvI=parseInt(gv(ctx,'dv'),10),ivI=parseInt(gv(ctx,'iv'),10),dvName=d.cols[dvI]!.name,ivName=d.cols[ivI]!.name;
  const groups=statsGroupBy(ctx,dvI,ivI),keys=Object.keys(groups);
  if(keys.length<3){return statsToast('kruskal','Kruskal-Wallis needs 3 or more groups. For 2 groups use Mann-Whitney U')}
  if(keys.some(k2=>groups[k2]!.length<2)){return statsToast('kruskal','Each group needs at least 2 values')}
  const gs=keys.map(k2=>groups[k2]!),kw=stkKruskal(gs);
  if(!isFinite(kw.H)){return statsToast('kruskal','All values are identical, so there is nothing to rank')}
  const fe=(x: number)=>noLead(x.toFixed(2));
  const html: StatsBlock[]=[{kind:'table',rows:[['Group','N','Mdn','Mean rank'],
    ...keys.map((k2,i)=>[escHTML(k2),String(gs[i]!.length),smedian(gs[i]!).toFixed(2),kw.meanRanks[i]!.toFixed(1)])]},
    {kind:'note',html:'H('+kw.df+') = '+kw.H.toFixed(2)+', '+fmtP(kw.p)+', epsilon-squared = '+fe(kw.eps2)+' (corrected for tied scores).'+
    (gs.some(g=>g.length<5)?' A group has fewer than 5 values, so the p-value is rough. Treat it with care.':'')}];
  let apa='A Kruskal-Wallis test showed '+(sig(kw.p)?'a significant':'no significant')+' difference in '+dvName+' across the '+ivName+' groups, H('+kw.df+') = '+kw.H.toFixed(2)+', '+fmtP(kw.p)+', ε² = '+fe(kw.eps2)+'.';
  const values: Record<string, number>={H:kw.H,df:kw.df,p:kw.p,eps2:kw.eps2};
  if(sig(kw.p)){
    const dn=stkDunn(gs,kw);
    html.push({kind:'table',rows:[['Dunn comparison','z','p (Holm-adjusted)'],
      ...dn.map(q=>[escHTML(keys[q.i]!)+' vs '+escHTML(keys[q.j]!),q.z.toFixed(2),(q.padj<0.001?'&lt; .001':noLead(q.padj.toFixed(3)))])]});
    const sg=dn.filter(q=>q.padj<0.05).map(q=>keys[q.i]+' and '+keys[q.j]);
    apa+=' Dunn post-hoc tests with Holm adjustment '+(sg.length?'found significant differences between '+sg.join('; ')+'.':'found no significant pair after adjustment.');
    dn.forEach(q=>{values['padj_'+q.i+'_'+q.j]=q.padj});
  }
  return finishResult(ctx,'kruskal',html,apa,values);
}

export function runSpearman(ctx: StatsCtx): StatsResult{
  const d=ctx.data;
  const i1=parseInt(gv(ctx,'v1'),10),i2=parseInt(gv(ctx,'v2'),10),n1name=d.cols[i1]!.name,n2name=d.cols[i2]!.name;
  const pairs=d.rows.map(r=>[r[i1],r[i2]]).filter(p2=>p2[0]!==undefined&&p2[0]!==''&&p2[1]!==undefined&&p2[1]!=='').map(p2=>[parseFloat(p2[0]!),parseFloat(p2[1]!)]).filter(p2=>isFinite(p2[0]!)&&isFinite(p2[1]!));
  if(pairs.length<5){return statsToast('spearman','Need at least 5 complete pairs')}
  const sp=stkSpearman(pairs.map(p2=>p2[0]!),pairs.map(p2=>p2[1]!)),r=sp.rho;
  if(!isFinite(r)){return statsToast('spearman','One of the variables has the same value in every row, so there is nothing to correlate')}
  const strength=Math.abs(r)<0.1?'negligible':Math.abs(r)<0.3?'weak':Math.abs(r)<0.5?'moderate':Math.abs(r)<0.7?'strong':'very strong';
  const fr=(x: number)=>noLead(x.toFixed(2));
  const html: StatsBlock[]=[{kind:'table',rows:[['N','rₛ','95% CI','df','p'],
    [String(sp.n),fr(r),'['+fr(sp.lo)+', '+fr(sp.hi)+']',String(sp.df),noLead(sp.p.toFixed(3))]]},
    {kind:'note',html:'Spearman works on ranks, so it fits ordinal scores and relationships that rise or fall steadily without being a straight line.'+(sp.n<10?' With fewer than 10 pairs the p-value is approximate.':'')}];
  const apa='There was a '+strength+' '+(r>=0?'positive':'negative')+' monotonic association between '+n1name+' and '+n2name+', which '+(sig(sp.p)?'was':'was not')+' statistically significant, rₛ('+sp.df+') = '+fr(r)+', '+fmtP(sp.p)+', 95% CI ['+fr(sp.lo)+', '+fr(sp.hi)+'].';
  return finishResult(ctx,'spearman',html,apa,{n:sp.n,rho:r,df:sp.df,p:sp.p,lo:sp.lo,hi:sp.hi});
}
