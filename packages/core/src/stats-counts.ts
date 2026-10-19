import { escHTML } from "./html";
import { pFromChi, pFromZ } from "./pvalue";
import { fmtP, noLead, pCell } from "./statfmt";
import { smedian, stkFisher2x2, stkFisherRC, stkBinomTwo } from "./statsmath";
import { finishResult, gv, sig, statsToast, stkBinData, stkBinom5 } from "./stats-core";
import type { StatsBlock, StatsCtx, StatsResult } from "./stats-core";

/* The tests on counts of statsRunNow: `chisq` with Yates, Fisher's exact 2x2 and Fisher-Freeman-Halton (12820-12860), `gof` with the exact binomial (13137-13164), `mcnemar`
   (13203-13223), `cochran` (13224-13249) and `friedman` (13250-13280). Each is v1's branch as v1 wrote it, in the shape of stats-means.ts and stats-ranks.ts: the same reads of the form,
   the same toasts (a toast and return becomes statsToast), the same arithmetic, literals and toFixed calls, the same table cells and note innerHTML, and the same sentence, handed to
   finishResult as v1 hands them to statsResultsShow.
   What differs from v1's text, in every branch:
   - `d` is `ctx.data`, `gv('x')` is `gv(ctx,'x')`, `stkBinData(idxs,pos)` is `stkBinData(ctx.data,idxs,pos)`; `d.cols[idx].name` and the indexed reads of arrays (`rowT[i]`, `colT[j]`,
     `table[..][..]`, `row[j]`, `exp[i]`, `obs[0]`, `share[0]`, `C[j]`, `r[j]`, `RS[..]`, `ord[..]`, `mr[i]`, `m[1]`, `m[2]`, `map[..]`) carry `!` (noUncheckedIndexedAccess; a missing column
     still throws, as in v1, and runStats turns the throw into v1's catch toast);
   - `showToast(x);return` is `return statsToast(key,x)`; `statsResultsShow(html,apa)` is `finishResult(ctx,key,blocks,apa,values)`;
   - a table v1 built by concatenation is one table block whose rows are its `<tr>`s, each the `th` and `td` cells in order (chisq's and mcnemar's row labels are `<th>` cells inside the
     body rows, read the same way); a cell v1 wrote as a bare number (`'<td>'+o+'</td>'`, n, a, b, c, dd, df, `C[j]`, `obs[i]`) is `String(x)`, the same text; a `.map(...).join('')`
     becomes the rows it joined, and the pairwise loops of cochran and friedman push their rows where v1 appended `<tr>`s; a `<p class="desc">` is a note of the same innerHTML;
     `let html=...; html+=...` becomes pushes onto the blocks in the same order (the note that opens the pairwise follow-ups, which v1 wrote in one string with the table after it,
     is a note block and then a table block);
   - `window._statsSkipped=(window._statsSkipped||0)+x` is `ctx.skipped=(ctx.skipped||0)+x` at the same point: B.skipped in mcnemar and cochran (after their n checks, as v1), and 1 per
     row in friedman's row filter;
   - `if(B.err)` is `if('err' in B)`: stkBinData returns `{err}` or the data, and every err it returns is a non-empty string, so the two tests agree;
   - cochran and friedman read the ticked `.sfm_items` boxes as `ctx.form.ticked.items ?? []` (the column indexes in column order, as v1's querySelectorAll returns the boxes), without
     v1's `parseInt(c.value,10)` because the form holds numbers (stkMRData's convention);
   - gof's `vals` filter gains the type guard `(v): v is string=>`, its `map` is `const map: Record<string, number>={}` (a plain object, as v1's), friedman's `new Array(k)` is
     `new Array<number>(k)` and its `X` is typed `number[][]`;
   - each runner returns finishResult's result with `values`, the raw numbers behind the cells (register row F27): chisq N, df, chi2, p, v, minE, lowC, and on a 2x2 chiY and
     pY (`pFromChi(chiY,1)`, the p v1 prints inline), where Fisher is reported fisherP and fisherOr (stkFisher2x2's sample odds ratio a*d/(b*c), register row F8, NaN or Infinity
     with an empty cell), where Fisher-Freeman-Halton runs ffhP and ffhTables; gof N, k, chi2, df, p, w, minE and binomP where the exact binomial is reported; mcnemar n, a, b, c,
     dd, nd, pEx, chi, pChi, useEx (1 or 0), p1, p2; cochran n, k, Q, df, pQ and, when the pairwise table is shown, pair_p_i_j (the exact McNemar p before the Bonferroni factor) for
     each pair i < j in the ticked order; friedman n, k, chi, df, pF, W and, when the pairwise table is shown, pair_p_i_j (the normal-approximation p before the Bonferroni factor);
   - the statsChartGrouped and statsChartBarMeans calls after statsResultsShow (12858, 13163, 13222, 13248, 13279) are not ported (F27); they read nothing that can throw.
   Per branch, the rest is v1's character for character, including:
   - chisq: the row and column keys are `[...new Set(...)]` of the cells in data order (not statsGroupBy's object-key order: F4's other branch), so labels 10, 2, 3 stay 10, 2, 3;
     `if(e>0)` in both chi-square sums; the Yates term `Math.max(0,Math.abs(o-e)-0.5)` on a 2x2 only; Fisher's exact test when the table is 2x2 and minE<5, with
     `isFinite(fx.or)?fx.or.toFixed(2):'undefined (an empty cell)'` (the text the safety net's lookahead lets through, finishResult); else Fisher-Freeman-Halton when
     `lowC/nCells>0.2` and `N<=200` (stkFisherRC's 30,000,000-table limit returns null, the same "too many possible tables" note as N > 200), its count printed
     `fx.tables.toLocaleString('en-US')` (register row D-W2-7);
   - gof: the categories are `[...new Set(vals)]`, in data order; the shares parsed by `/^(.+?)\s*[:=]\s*(\d+(?:\.\d+)?)$/` part by part, names lower-cased, and the one toast for a
     bad part, a missing or non-positive share, or a share for a category not in the data; `Math.min.apply(null,exp)`; with minE<5 the exact binomial (stkBinomTwo) for two
     categories, the "not reliable" note otherwise; the residuals `((obs[i]-exp[i])/Math.sqrt(exp[i])).toFixed(2)`;
   - mcnemar: the toasts in v1's order (same column or NaN, stkBinData's err with its curly quotes, n<2, nobody changed); `chi=(Math.abs(b-c)-1)*(Math.abs(b-c)-1)/nd`;
     `useEx=nd<25`; the curly quotes around `pYes` in the note; the sentence's raw `B.pos` and the cells' `escHTML(B.pos)`;
   - cochran: `if(!(den>0))`; `pFromChi(Math.max(0,Q),df)`; the Bonferroni `mPW=k*(k-1)/2` and `pCell(Math.min(1,p2*mPW))`; `n<20` for the rough-approximation sentence, and the
     note's trailing space when n is 20 or more (v1 concatenates '' after "each time. ");
   - friedman: the row filter (an empty cell is NaN, every value finite) counts each dropped row inline; average ranks for ties by v1's sort of the indexes; `corr>1e-12`;
     `pFromChi(Math.max(0,chi),df)`, `W=Math.max(0,chi)/(n*(k-1))`; `se=Math.sqrt(k*(k+1)/(6*n))`, pFromZ and the Bonferroni `mPW`; the tie and the `n<10` sentences. */

export function runChisq(ctx: StatsCtx): StatsResult{
  const d=ctx.data;
  const i1=parseInt(gv(ctx,'v1'),10),i2=parseInt(gv(ctx,'v2'),10),n1name=d.cols[i1]!.name,n2name=d.cols[i2]!.name;
  const rows2=d.rows.filter(r=>r[i1]!==undefined&&r[i1]!==''&&r[i2]!==undefined&&r[i2]!=='');
  const rowKeys=[...new Set(rows2.map(r=>r[i1]!))],colKeys=[...new Set(rows2.map(r=>r[i2]!))];
  if(rowKeys.length<2||colKeys.length<2){return statsToast('chisq','Each variable needs at least 2 different values')}
  const table=rowKeys.map(()=>colKeys.map(()=>0));
  rows2.forEach(r=>{table[rowKeys.indexOf(r[i1]!)]![colKeys.indexOf(r[i2]!)]!++});
  const N=rows2.length;
  const rowT=table.map(row=>row.reduce((s,v)=>s+v,0));
  const colT=colKeys.map((_,j)=>table.reduce((s,row)=>s+row[j]!,0));
  let chi2=0;
  table.forEach((row,i)=>row.forEach((o,j)=>{const e=rowT[i]!*colT[j]!/N;if(e>0)chi2+=(o-e)*(o-e)/e}));
  const df=(rowKeys.length-1)*(colKeys.length-1),p=pFromChi(chi2,df);
  const v=Math.sqrt(chi2/(N*(Math.min(rowKeys.length,colKeys.length)-1)));
  const html: StatsBlock[]=[{kind:'table',rows:[['',...colKeys.map(c=>escHTML(c))],
    ...table.map((row,i)=>[escHTML(rowKeys[i]!),...row.map(o=>String(o))])]},
    {kind:'note',html:'χ²('+df+', N = '+N+') = '+chi2.toFixed(2)+', '+fmtP(p)+", Cramér's V = "+v.toFixed(2)}];
  let apa='A chi-square test of independence showed '+(sig(p)?'a significant association':'no significant association')+' between '+n1name+' and '+n2name+', χ²('+df+', N = '+N+') = '+chi2.toFixed(2)+', '+fmtP(p)+", Cramér's V = "+v.toFixed(2)+'.';
  const values: Record<string, number>={N:N,df:df,chi2:chi2,p:p,v:v};
  if(rowKeys.length===2&&colKeys.length===2){
    let chiY=0;table.forEach((row,i)=>row.forEach((o,j)=>{const e=rowT[i]!*colT[j]!/N;if(e>0){const dv=Math.max(0,Math.abs(o-e)-0.5);chiY+=dv*dv/e}}));
    html.push({kind:'note',html:'With the Yates continuity correction (the default in R and shown by SPSS): χ²(1, N = '+N+') = '+chiY.toFixed(2)+', '+fmtP(pFromChi(chiY,1))+'. Current guidance prefers the uncorrected test, or an exact test when a count is small.'});
    values.chiY=chiY;values.pY=pFromChi(chiY,1);
  }
  let minE=Infinity,lowC=0;
  table.forEach((row,i)=>row.forEach((o,j)=>{const e=rowT[i]!*colT[j]!/N;if(e<minE)minE=e;if(e<5)lowC++}));
  const nCells=rowKeys.length*colKeys.length;
  values.minE=minE;values.lowC=lowC;
  if(rowKeys.length===2&&colKeys.length===2&&minE<5){
    const fx=stkFisher2x2(table[0]![0]!,table[0]![1]!,table[1]![0]!,table[1]![1]!);
    const orT=isFinite(fx.or)?fx.or.toFixed(2):'undefined (an empty cell)';
    html.push({kind:'note',html:'<b>The smallest expected count is '+minE.toFixed(2)+', below 5, so chi-square is unreliable here. Fisher\'s exact test (two-sided): '+fmtP(fx.p)+', odds ratio = '+orT+'.</b> Report the Fisher result.'});
    apa='A Fisher\'s exact test showed '+(sig(fx.p)?'a significant association':'no significant association')+' between '+n1name+' and '+n2name+', '+fmtP(fx.p)+', odds ratio = '+orT+' (N = '+N+').';
    values.fisherP=fx.p;values.fisherOr=fx.or;
  }else if(lowC/nCells>0.2){
    html.push({kind:'note',html:lowC+' of '+nCells+' cells have an expected count below 5, more than the 20% limit, so the chi-square p-value is not trustworthy.'});
    const fx=(N<=200)?stkFisherRC(table):null;
    if(fx){
      html.push({kind:'note',html:'<b>Fisher-Freeman-Halton exact test: '+fmtP(fx.p)+'.</b> All '+fx.tables.toLocaleString('en-US')+' tables with the same row and column totals were enumerated, and the p value is the chance of a table no more likely than yours. Report this result.'});
      apa='A Fisher-Freeman-Halton exact test showed '+(sig(fx.p)?'a significant association':'no significant association')+' between '+n1name+' and '+n2name+', '+fmtP(fx.p)+' (N = '+N+').';
      values.ffhP=fx.p;values.ffhTables=fx.tables;
    }else html.push({kind:'note',html:'There are too many possible tables to enumerate here for an exact test. Merge sparse categories if that makes sense for your question, or ask a statistician for the exact test.'});
  }
  return finishResult(ctx,'chisq',html,apa,values);
}

export function runGof(ctx: StatsCtx): StatsResult{
  const d=ctx.data;
  const i1=parseInt(gv(ctx,'v1'),10),name=d.cols[i1]!.name;
  const vals=d.rows.map(r=>r[i1]).filter((v): v is string=>v!==undefined&&v!==''),cats=[...new Set(vals)],k=cats.length,N=vals.length;
  if(k<2){return statsToast('gof','The variable needs at least 2 categories')}
  const obs=cats.map(c=>vals.filter(v=>v===c).length);
  let share=cats.map(()=>1/k);const txt=(gv(ctx,'exp')||'').trim();
  if(txt){
    const map: Record<string, number>={};let bad=false;
    txt.split(',').forEach(part=>{const m=part.trim().match(/^(.+?)\s*[:=]\s*(\d+(?:\.\d+)?)$/);if(!m)bad=true;else map[m[1]!.trim().toLowerCase()]=parseFloat(m[2]!)});
    if(bad||!cats.every(c=>map[c.toLowerCase()]!>0)||Object.keys(map).length!==k){return statsToast('gof','List every category once, like A:50, B:30, C:20. Categories found: '+cats.join(', '))}
    const tot=cats.reduce((a,c)=>a+map[c.toLowerCase()]!,0);share=cats.map(c=>map[c.toLowerCase()]!/tot);
  }
  const exp=share.map(x=>x*N);let chi2=0;obs.forEach((o,i)=>{chi2+=(o-exp[i]!)*(o-exp[i]!)/exp[i]!});
  const df=k-1,p=pFromChi(chi2,df),w=Math.sqrt(chi2/N),minE=Math.min.apply(null,exp);
  const html: StatsBlock[]=[{kind:'table',rows:[['Category','Observed','Expected','Standardised residual'],
    ...cats.map((c,i)=>[escHTML(c),String(obs[i]),exp[i]!.toFixed(2),((obs[i]!-exp[i]!)/Math.sqrt(exp[i]!)).toFixed(2)])]},
    {kind:'note',html:'χ²('+df+', N = '+N+') = '+chi2.toFixed(2)+', '+fmtP(p)+', Cohen\'s w = '+noLead(w.toFixed(2))+'. A residual beyond ±2 marks a category that departs from what you expected.'}];
  let apa='A chi-square goodness-of-fit test showed that the distribution of '+name+' '+(sig(p)?'differed significantly from':'did not differ significantly from')+' the expected distribution, χ²('+df+', N = '+N+') = '+chi2.toFixed(2)+', '+fmtP(p)+', w = '+noLead(w.toFixed(2))+'.';
  const values: Record<string, number>={N:N,k:k,chi2:chi2,df:df,p:p,w:w,minE:minE};
  if(minE<5){
    if(k===2){
      const px=stkBinomTwo(obs[0]!,N,share[0]!);
      html.push({kind:'note',html:'<b>An expected count is below 5, so the exact binomial test is reported: '+fmtP(px)+'.</b>'});
      apa='An exact binomial test showed that the proportion of '+cats[0]+' in '+name+' ('+obs[0]+' of '+N+') '+(sig(px)?'differed significantly from':'did not differ significantly from')+' the expected '+noLead(share[0]!.toFixed(2))+', '+fmtP(px)+'.';
      values.binomP=px;
    }else html.push({kind:'note',html:'An expected count is below 5 ('+minE.toFixed(2)+'), so the chi-square p-value is not reliable. Merge sparse categories if that makes sense, or ask a statistician about an exact multinomial test.'});
  }
  return finishResult(ctx,'gof',html,apa,values);
}

export function runMcnemar(ctx: StatsCtx): StatsResult{
  const d=ctx.data;
  const i1=parseInt(gv(ctx,'v1'),10),i2=parseInt(gv(ctx,'v2'),10);
  if(i1===i2||isNaN(i1)||isNaN(i2)){return statsToast('mcnemar','Choose two different columns, the first and the second time.')}
  const n1name=d.cols[i1]!.name,n2name=d.cols[i2]!.name,B=stkBinData(d,[i1,i2],gv(ctx,'pos'));
  if('err' in B){return statsToast('mcnemar',B.err)}
  const n=B.M.length;if(n<2){return statsToast('mcnemar','Need at least 2 people with an answer at both times.')}
  ctx.skipped=(ctx.skipped||0)+B.skipped;
  let a=0,b=0,c=0,dd=0;B.M.forEach(r=>{if(r[0]&&r[1])a++;else if(r[0]&&!r[1])b++;else if(!r[0]&&r[1])c++;else dd++});
  const nd=b+c;
  if(nd===0){return statsToast('mcnemar','Nobody changed their answer between the two times, so there is nothing to test.')}
  const pEx=stkBinom5(b,nd),chi=(Math.abs(b-c)-1)*(Math.abs(b-c)-1)/nd,pChi=pFromChi(chi,1),useEx=nd<25;
  const p1=(a+b)/n,p2=(a+c)/n,pYes=escHTML(B.pos),pNo=escHTML(B.neg);
  const html: StatsBlock[]=[{kind:'table',rows:[['',escHTML(n2name)+': '+pYes,escHTML(n2name)+': '+pNo],
    [escHTML(n1name)+': '+pYes,String(a),String(b)],[escHTML(n1name)+': '+pNo,String(c),String(dd)]]},
    {kind:'table',rows:[['N people','Changed yes → no','Changed no → yes','Test',(useEx?'Exact':'χ²(1)'),'p'],
    [String(n),String(b),String(c),(useEx?'Exact binomial':'McNemar with continuity correction'),(useEx?'—':chi.toFixed(2)),pCell(useEx?pEx:pChi)]]},
    {kind:'note',html:'Answering “'+pYes+'”: '+noLead(p1.toFixed(2))+' of people at the first time ('+(a+b)+' of '+n+') and '+noLead(p2.toFixed(2))+' at the second ('+(a+c)+' of '+n+'). Only the '+nd+' people who changed their answer enter the test. '+(useEx?'With fewer than 25 changers the exact binomial test is used; for comparison, the χ² version gives χ²(1) = '+chi.toFixed(2)+', '+fmtP(pChi)+'.':'With 25 or more changers the χ² version is used; for comparison, the exact test gives '+fmtP(pEx)+'.')}];
  const pu=useEx?pEx:pChi;
  const apa='A McNemar test'+(useEx?' (exact binomial)':'')+' showed that the proportion answering '+B.pos+' '+(sig(pu)?'changed significantly':'did not change significantly')+' from '+n1name+' ('+noLead(p1.toFixed(2))+') to '+n2name+' ('+noLead(p2.toFixed(2))+'), '+(useEx?'':'χ²(1, N = '+n+') = '+chi.toFixed(2)+', ')+fmtP(pu)+'; '+c+' people changed from no to yes and '+b+' from yes to no.';
  return finishResult(ctx,'mcnemar',html,apa,{n:n,a:a,b:b,c:c,dd:dd,nd:nd,pEx:pEx,chi:chi,pChi:pChi,useEx:useEx?1:0,p1:p1,p2:p2});
}

export function runCochran(ctx: StatsCtx): StatsResult{
  const d=ctx.data;
  const idxs=ctx.form.ticked.items??[];
  if(idxs.length<3){return statsToast('cochran','Tick at least 3 columns, one for each time or condition. For two, use the McNemar test.')}
  if(idxs.length>8){return statsToast('cochran','This test handles up to 8 conditions.')}
  const names=idxs.map(i=>d.cols[i]!.name),k=idxs.length,B=stkBinData(d,idxs,gv(ctx,'pos'));
  if('err' in B){return statsToast('cochran',B.err)}
  const X=B.M,n=X.length;if(n<3){return statsToast('cochran','Need at least 3 people with an answer in every ticked column.')}
  ctx.skipped=(ctx.skipped||0)+B.skipped;
  const C=names.map((_,j)=>X.reduce((a,r)=>a+r[j]!,0)),R=X.map(r=>r.reduce((a,v)=>a+v,0)),T=C.reduce((a,v)=>a+v,0);
  let sc2=0,sr2=0;C.forEach(v=>sc2+=v*v);R.forEach(v=>sr2+=v*v);
  const den=k*T-sr2;
  if(!(den>0)){return statsToast('cochran','Every person gave the same answer in every column, so the test cannot be calculated.')}
  const Q=(k-1)*(k*sc2-T*T)/den,df=k-1,pQ=pFromChi(Math.max(0,Q),df),mPW=k*(k-1)/2;
  const html: StatsBlock[]=[{kind:'table',rows:[['Condition','N','Answered “'+escHTML(B.pos)+'”','Proportion'],
    ...names.map((nm,j)=>[escHTML(nm),String(n),String(C[j]),noLead((C[j]!/n).toFixed(2))])]},
    {kind:'table',rows:[['N people','Q','df','p'],[String(n),Q.toFixed(2),String(df),pCell(pQ)]]},
    {kind:'note',html:'Cochran\'s Q asks whether the proportion answering “'+escHTML(B.pos)+'” differs across the '+k+' conditions, using the same people each time. '+(n<20?'With fewer than 20 people the χ² approximation is rough; read the p value with care.':'')}];
  const values: Record<string, number>={n:n,k:k,Q:Q,df:df,pQ:pQ};
  if(sig(pQ)){
    html.push({kind:'note',html:'<b>Pairwise follow-ups</b> (exact McNemar tests, p multiplied by '+mPW+' for the Bonferroni correction). Read these only because the overall test is significant.'});
    const rows: string[][]=[['Pair','Yes → no','No → yes','p','p (Bonferroni)']];
    for(let i=0;i<k;i++)for(let j=i+1;j<k;j++){let b=0,c=0;X.forEach(r=>{if(r[i]&&!r[j])b++;else if(!r[i]&&r[j])c++});const p2=stkBinom5(b,b+c);rows.push([escHTML(names[i]+' − '+names[j]),String(b),String(c),pCell(p2),pCell(Math.min(1,p2*mPW))]);values['pair_p_'+i+'_'+j]=p2}
    html.push({kind:'table',rows:rows});
  }else html.push({kind:'note',html:'The overall test is not significant, so pairwise follow-ups are not shown. Looking for a significant pair after a non-significant overall test inflates false positives.'});
  const apa='Cochran\'s Q test '+(sig(pQ)?'showed that the proportion answering '+B.pos+' differed significantly':'showed no significant difference in the proportion answering '+B.pos)+' across the '+k+' conditions ('+names.join(', ')+'), Q('+df+', N = '+n+') = '+Q.toFixed(2)+', '+fmtP(pQ)+'.';
  return finishResult(ctx,'cochran',html,apa,values);
}

export function runFriedman(ctx: StatsCtx): StatsResult{
  const d=ctx.data;
  const idxs=ctx.form.ticked.items??[];
  if(idxs.length<3){return statsToast('friedman','Tick at least 3 columns, one for each time point or condition. For two, use the Wilcoxon signed-rank test.')}
  if(idxs.length>8){return statsToast('friedman','This test handles up to 8 conditions.')}
  const names=idxs.map(i=>d.cols[i]!.name),k=idxs.length,X: number[][]=[];
  d.rows.forEach(r=>{const row=idxs.map(i=>(r[i]===''||r[i]===undefined)?NaN:parseFloat(r[i]!));if(row.every(isFinite))X.push(row);else ctx.skipped=(ctx.skipped||0)+1});
  const n=X.length;
  if(n<3){return statsToast('friedman','Need at least 3 people who have a score in every ticked column.')}
  const RS=new Array<number>(k).fill(0);let tieSum=0;
  X.forEach(r=>{
    const ord=r.map((v,j)=>j).sort((a,b)=>r[a]!-r[b]!);let i=0;
    while(i<k){let j=i;while(j+1<k&&r[ord[j+1]!]===r[ord[i]!])j++;const avg=(i+j)/2+1,t=j-i+1;for(let q=i;q<=j;q++)RS[ord[q]!]!+=avg;if(t>1)tieSum+=t*t*t-t;i=j+1}
  });
  const corr=1-tieSum/(n*k*(k*k-1));
  if(!(corr>1e-12)){return statsToast('friedman','Every person gives the same score in every condition, so the test cannot be calculated.')}
  let sr2=0;RS.forEach(v=>sr2+=v*v);
  const chi=(12/(n*k*(k+1))*sr2-3*n*(k+1))/corr,df=k-1,pF=pFromChi(Math.max(0,chi),df),W=Math.max(0,chi)/(n*(k-1)),mr=RS.map(v=>v/n);
  const mPW=k*(k-1)/2,se=Math.sqrt(k*(k+1)/(6*n));
  const html: StatsBlock[]=[{kind:'table',rows:[['Condition','N','Median','Mean rank'],
    ...names.map((nm,j)=>[escHTML(nm),String(n),smedian(X.map(r=>r[j]!)).toFixed(2),mr[j]!.toFixed(2)])]},
    {kind:'table',rows:[['N people','χ²','df','p','Kendall\'s W'],[String(n),chi.toFixed(2),String(df),pCell(pF),noLead(W.toFixed(3))]]},
    {kind:'note',html:'Each person\'s scores are ranked from lowest to highest, ties share the average rank, and the test asks whether the mean ranks differ more than chance allows. Kendall\'s W runs from 0 (no agreement across people) to 1 (everyone orders the conditions identically); about .1 is small, .3 moderate, .5 large.'+(tieSum>0?' Tied scores are present and the χ² includes the usual correction for them.':'')+(n<10?' With fewer than 10 people the χ² approximation is rough; read the p value with care.':'')}];
  const values: Record<string, number>={n:n,k:k,chi:chi,df:df,pF:pF,W:W};
  if(sig(pF)){
    html.push({kind:'note',html:'<b>Pairwise follow-ups</b> (differences in mean rank, normal approximation, p multiplied by '+mPW+' for the Bonferroni correction). Read these only because the overall test is significant.'});
    const rows: string[][]=[['Pair','Mean rank diff','z','p','p (Bonferroni)']];
    for(let i=0;i<k;i++)for(let j=i+1;j<k;j++){const z=(mr[i]!-mr[j]!)/se,p2=pFromZ(z),pb=Math.min(1,p2*mPW);rows.push([escHTML(names[i]+' − '+names[j]),(mr[i]!-mr[j]!).toFixed(2),z.toFixed(2),pCell(p2),pCell(pb)]);values['pair_p_'+i+'_'+j]=p2}
    html.push({kind:'table',rows:rows});
  }else html.push({kind:'note',html:'The overall test is not significant, so pairwise follow-ups are not shown. Looking for a significant pair after a non-significant overall test inflates false positives.'});
  const apa='A Friedman test '+(sig(pF)?'showed a significant difference':'showed no significant difference')+' across the '+k+' conditions ('+names.join(', ')+'), χ²('+df+', N = '+n+') = '+chi.toFixed(2)+', '+fmtP(pF)+', Kendall\'s W = '+noLead(W.toFixed(2))+'.';
  return finishResult(ctx,'friedman',html,apa,values);
}
