import type { ParsedData } from "./intake";
import type { StatsCtx, StatsForm, StatsResult, StatsTestKey } from "./stats-core";
import { runAnova1, runDesc, runPearson, runRegression, runTtest1, runTtestInd, runTtestPaired, runTukey } from "./stats-means";

/* statsRunNow (12609-13457) without its page: the head (12609-12617) builds the run's context, the branches dispatch on the test key in v1's if/else-if order, and the outer catch
   (13456-13457) is v1's toast. Tasks 4-9 add the other 24 branches here, in v1's order; until a key has its branch it falls through to the catch toast.
   What differs from v1's text:
   - the head's `if(!window._statsData){showToast('Parse your data first');return}` goes: runStats takes the ParsedData (the panel refuses to run without one); `actLog('stat')` and
     `statsChartClear()` are page code and go; `window._statsSkipped=0` is `skipped: 0` in the new context; `key` is the `test` argument, the form is the `form` argument (v1's `gv` is
     stats-core's `gv(ctx, id)`);
   - each branch's body is a function of stats-means.ts (and, later, of the other runner modules) that returns its result; v1's branches present so far: desc, ttest1, ttestInd,
     ttestPaired, anova1, tukey, regression, pearson (mannwhitney and wilcoxon, between regression and pearson in v1, come with their task);
   - a key with no branch returns the catch toast: v1 would fall through every branch and show nothing (register row D-W2-3); a key of a later task does the same until that task lands;
   - `catch(e)` is `catch` (the binding was unused). */

export function runStats(data: ParsedData, test: StatsTestKey, form: StatsForm): StatsResult{
  const ctx: StatsCtx={data:data,form:form,skipped:0};
  const key=test;
  try{
    if(key==='desc')return runDesc(ctx);
    else if(key==='ttest1')return runTtest1(ctx);
    else if(key==='ttestInd')return runTtestInd(ctx);
    else if(key==='ttestPaired')return runTtestPaired(ctx);
    else if(key==='anova1')return runAnova1(ctx);
    else if(key==='tukey')return runTukey(ctx);
    else if(key==='regression')return runRegression(ctx);
    else if(key==='pearson')return runPearson(ctx);
  }catch{/* v1 13456: the toast below */}
  return{ok:false,test:key,reason:'toast',toast:'Could not run that test — check the columns you picked match what the test needs'};
}
