import type { FixtureStatus } from "./fixture";
import type { V1 } from "./v1";
import { smoke } from "../smoke/capture";
import { statsDemos } from "../stats-demos/capture";
import { doctext } from "../doctext/capture";
import { accuracy } from "../accuracy/capture";
import { pd } from "../pd/capture";
import { prompts } from "../prompts/capture";
import { aiuse } from "../aiuse/capture";
import { origin } from "../origin/capture";
import { providers } from "../providers/capture";
import { v1import } from "../v1import/capture";
import { v1locked } from "../v1locked/capture";
import { pvalue } from "../pvalue/capture";
import { statfmt } from "../statfmt/capture";
import { numbers } from "../numbers/capture";
import { html } from "../html/capture";
import { citation } from "../citation/capture";
import { crosscheck } from "../crosscheck/capture";
import { citlib } from "../citlib/capture";
import { analyse } from "../analyse/capture";
import { research } from "../research/capture";
import { promptsIdea } from "../prompts-idea/capture";
import { promptsHelpers } from "../prompts-helpers/capture";
import { promptsResearch } from "../prompts-research/capture";
import { promptsAnalyse } from "../prompts-analyse/capture";
import { statsmath } from "../statsmath/capture";
import { intake } from "../intake/capture";
import { pdscan } from "../pdscan/capture";
import { stats } from "../stats/capture";
import { guide } from "../guide/capture";
import { power } from "../power/capture";
import { charts } from "../charts/capture";
import { quickchart } from "../quickchart/capture";

export type Engine = { name: string; capture(v1: V1, opts: { check: boolean; emit: boolean }): Promise<FixtureStatus[]> };

/**
 * In capture order, which is mostly task order: a task appends its engines, except `prompts`, which sits before `aiuse` because the aiuse capture reads the prompts fixture
 * (so a write-mode `golden:capture all` captures prompts first).
 */
export const ENGINES: Engine[] = [smoke, statsDemos, doctext, accuracy, pd, prompts, aiuse, origin, providers, v1import, v1locked, pvalue, statfmt, numbers, html, citation, crosscheck, citlib, analyse, research, promptsIdea, promptsHelpers, promptsResearch, promptsAnalyse, statsmath, intake, pdscan, stats, guide, power, charts, quickchart];
