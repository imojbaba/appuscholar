import type { ParsedData } from "./intake";
import type { StatsCtx, StatsForm, StatsResult, StatsTestKey } from "./stats-core";
import { runAnova1, runDesc, runPearson, runRegression, runTtest1, runTtestInd, runTtestPaired, runTukey } from "./stats-means";
import { runKruskal, runMannwhitney, runSpearman, runWelchAnova, runWilcoxon } from "./stats-ranks";
import { runChisq, runCochran, runFriedman, runGof, runMcnemar } from "./stats-counts";
import { runAnova2, runMregress } from "./stats-factorial";
import { runAlpha, runLogistic, runRmanova } from "./stats-models";
import { runMediate, runMixed, runModerate } from "./stats-advanced";

/* statsRunNow (12609-13457) without its page: the head (12609-12617) builds the run's context, the branches dispatch on the test key in v1's if/else-if order, and the outer catch
   (13456-13457) is v1's toast. Tasks 4-9 added the 26 branches here, in v1's order; a key with no branch falls through to the catch toast.
   What differs from v1's text:
   - the head's `if(!window._statsData){showToast('Parse your data first');return}` goes: runStats takes the ParsedData (the panel refuses to run without one); `actLog('stat')` and
     `statsChartClear()` are page code and go; `window._statsSkipped=0` is `skipped: 0` in the new context; `key` is the `test` argument, the form is the `form` argument (v1's `gv` is
     stats-core's `gv(ctx, id)`);
   - each branch's body is a function of stats-means.ts, stats-ranks.ts, stats-counts.ts, stats-factorial.ts, stats-models.ts or stats-advanced.ts that returns its result; v1's
     26 branches, in v1's order: desc, ttest1, ttestInd, ttestPaired, anova1, tukey, regression, mannwhitney, wilcoxon, pearson, chisq, anova2, mregress, logistic, moderate, mediate,
     welchAnova, gof, kruskal, spearman, mcnemar, cochran, friedman, rmanova, mixed, alpha;
   - a key with no branch (one v1 does not know: every StatsTestKey has its branch) returns the catch toast: v1 would fall through every branch and show nothing (register row D-W2-3);
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
    else if(key==='mannwhitney')return runMannwhitney(ctx);
    else if(key==='wilcoxon')return runWilcoxon(ctx);
    else if(key==='pearson')return runPearson(ctx);
    else if(key==='chisq')return runChisq(ctx);
    else if(key==='anova2')return runAnova2(ctx);
    else if(key==='mregress')return runMregress(ctx);
    else if(key==='logistic')return runLogistic(ctx);
    else if(key==='moderate')return runModerate(ctx);
    else if(key==='mediate')return runMediate(ctx);
    else if(key==='welchAnova')return runWelchAnova(ctx);
    else if(key==='gof')return runGof(ctx);
    else if(key==='kruskal')return runKruskal(ctx);
    else if(key==='spearman')return runSpearman(ctx);
    else if(key==='mcnemar')return runMcnemar(ctx);
    else if(key==='cochran')return runCochran(ctx);
    else if(key==='friedman')return runFriedman(ctx);
    else if(key==='rmanova')return runRmanova(ctx);
    else if(key==='mixed')return runMixed(ctx);
    else if(key==='alpha')return runAlpha(ctx);
  }catch{/* v1 13456: the toast below */}
  return{ok:false,test:key,reason:'toast',toast:'Could not run that test — check the columns you picked match what the test needs'};
}
