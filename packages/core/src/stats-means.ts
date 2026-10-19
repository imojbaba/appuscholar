import { pFromT } from "./pvalue";
import { fmtP, pCell } from "./statfmt";
import { smean, ssd, smedian, stkTCrit } from "./statsmath";
import { finishResult, gv, sig, statsColVals, statsToast } from "./stats-core";
import type { StatsBlock, StatsCtx, StatsResult } from "./stats-core";

/* The runners of statsRunNow for means: `desc` (12618-12626) and `ttest1` (12628-12640). Each is v1's branch as v1 wrote it: the same reads of the form, the same toasts (a toast and
   return becomes statsToast), the same arithmetic and toFixed calls, the same table cells (v1's `<table class="stats-table">` becomes a table block whose first row is the `th` cells
   and second the `td` cells) and the same sentence, handed to finishResult as v1 hands them to statsResultsShow.
   What differs from v1's text:
   - `d` is `ctx.data`, `gv('x')` is `gv(ctx,'x')`, `statsColVals(idx,true)` is `statsColVals(ctx,idx,true)`; `d.cols[idx].name` carries `!` (a missing column still throws, as in v1, and
     runStats turns the throw into v1's catch toast);
   - a cell v1 wrote as `'<td>'+n+'</td>'` (vals.length, n, mu, df) is `String(n)`, the same text;
   - each runner returns finishResult's result with `values`, the raw numbers behind the cells (desc: n, m, s, md, min, max; ttest1: n, m, s, mu, t, df, p, dlo, dhi, dEff), which v1
     keeps only in its closures;
   - statsChartHistogram (12626, 12640) is not called: the charts are not ported (register row F27); their data is in `values` and the blocks. */

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
