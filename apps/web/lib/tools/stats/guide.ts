import { useSyncExternalStore } from "react";
import { STAT_TESTS, tgNext, TG_DEMO, TG_RES, type StatsTestKey, type TgAnswers, type TgDemo, type TgNextOut, type TgQuestionKey, type TgResult } from "@appuscholar/core";
import { getLab } from "./lab";
import { setTest } from "./runLab";
import { runDemo, runDemoUnreversed, type DemoRun } from "./guideDemo";
import type { Words } from "./resultChart";

/*
 * The "Which test fits my data?" guide (v1 tgToggle, tgAnswer, tgBack, tgRender, tgUse 12441-12483 and 12485-12519): the answers given so far, the prediction
 * for the demo and the demo's result, in a module-level store keyed by project so that a tab switch (which mounts the Panel again) keeps them. Nothing here
 * is written anywhere: no blob, no document, no AI call. The routing, the texts and the arithmetic are core's (packages/core/src/guide.ts, v1's).
 * The demo does not use the lab (lib/tools/stats/lab.ts) at all: the student's text, table, form and result are as they were (register row D-S2-71).
 */

export type Prediction = "" | "yes" | "no";
export type GuideState = {
  /** The guide is shown (v1 #tgPanel visible). */
  open: boolean;
  /** v1 `window._tg`: the questions answered so far. */
  answers: TgAnswers;
  /** The student's prediction for the demo of the result on screen (v1 radios `tgPred`). */
  pred: Prediction;
  /** The demo's result, or null. */
  demo: DemoRun | null;
  /** The demo was asked for without a prediction (v1 toasted it; it is a line under the button now). */
  needPred: boolean;
};

const EMPTY: GuideState = { open: false, answers: {}, pred: "", demo: null, needPred: false };
const guides = new Map<string, GuideState>();
const listeners = new Map<string, Set<() => void>>();

export function getGuide(projectId: string): GuideState { return guides.get(projectId) ?? EMPTY; }
function patchGuide(projectId: string, patch: Partial<GuideState>): void {
  guides.set(projectId, { ...getGuide(projectId), ...patch });
  for (const fn of [...(listeners.get(projectId) ?? [])]) fn();
}
export function useGuide(projectId: string): GuideState {
  return useSyncExternalStore((fn) => {
    let set = listeners.get(projectId);
    if (!set) listeners.set(projectId, (set = new Set()));
    set.add(fn);
    return () => { set.delete(fn); };
  }, () => getGuide(projectId), () => EMPTY);
}
/** Forgets every project's guide (a test's reset; nothing in the app calls it). */
export function resetGuides(): void {
  const ids = [...guides.keys()];
  guides.clear();
  for (const id of ids) for (const fn of [...(listeners.get(id) ?? [])]) fn();
}

/** v1 tgBack's order (12449): the questions in the order they can have been answered, last first. */
export const ANSWER_ORDER = ["goal", "cmpOut", "relOut", "prdOut", "prdN", "cntDes", "cmpDes", "smp"] as const satisfies readonly TgQuestionKey[];

/** What the answers so far lead to: the next question or the result (core's tgNext). */
export function guideNext(answers: TgAnswers): TgNextOut { return tgNext(answers); }

/** v1 tgToggle (12441): opening starts from nothing; closing hides it. */
export function toggleGuide(projectId: string): void {
  if (getGuide(projectId).open) patchGuide(projectId, { open: false });
  else patchGuide(projectId, { open: true, answers: {}, pred: "", demo: null, needPred: false });
}
/** v1 tgAnswer (12446): the answer to a question; what depended on the earlier screen (prediction, demo) goes. */
export function answerQuestion(projectId: string, q: TgQuestionKey, value: string): void {
  patchGuide(projectId, { answers: { ...getGuide(projectId).answers, [q]: value }, pred: "", demo: null, needPred: false });
}
/** v1 tgBack (12447-12452): the last answer given is taken back; with no goal left nothing stays. */
export function backAnswers(a: TgAnswers): TgAnswers {
  const out: TgAnswers = { ...a };
  for (let i = ANSWER_ORDER.length - 1; i >= 0; i--) if (out[ANSWER_ORDER[i]!] !== undefined) { delete out[ANSWER_ORDER[i]!]; break; }
  return out.goal ? out : {};
}
export function goBack(projectId: string): void {
  patchGuide(projectId, { answers: backAnswers(getGuide(projectId).answers), pred: "", demo: null, needPred: false });
}
/** v1's "Start again" (`window._tg={};tgRender()`). */
export function startAgain(projectId: string): void {
  patchGuide(projectId, { answers: {}, pred: "", demo: null, needPred: false });
}
export function setPrediction(projectId: string, pred: Prediction): void { patchGuide(projectId, { pred, needPred: false }); }

/**
 * v1 tgUse (12482-12485): the result's test becomes the test of "Run a test" (its fields start again). v1 refused without a parsed table, with a toast; the answer
 * here is the word the component says inline: "need_data" or "chosen".
 */
export function chooseTest(projectId: string, key: StatsTestKey): "need_data" | "chosen" {
  if (!getLab(projectId).data) return "need_data";
  setTest(projectId, key);
  return "chosen";
}

/** The demo the result offers (v1 tgDemoHTML: only a built result that has one). */
export function demoOf(r: TgResult): TgDemo | null { return r.built ? TG_DEMO[r.id] ?? null : null; }

/**
 * v1 tgDemo (12458-12481) without the lab: no prediction, no demo (the component says so); otherwise the demo table is run through core and kept here for the
 * card to show. Nothing is registered, recorded, inserted or sent.
 */
export function runGuideDemo(projectId: string, r: TgResult, w: Words): boolean {
  const g = getGuide(projectId);
  const dm = demoOf(r);
  if (!dm) return false;
  if (!g.pred) { patchGuide(projectId, { needPred: true }); return false; }
  const demo = runDemo(r.id, dm, g.pred, w);
  patchGuide(projectId, { demo, needPred: false });
  return demo !== null;
}
/** The scale demo run again without reversing its item, shown beside the first result. Pure like the first run: the lab and every blob are left alone. */
export function runGuideDemoUnreversed(projectId: string, r: TgResult, w: Words): boolean {
  const g = getGuide(projectId), dm = demoOf(r);
  if (!g.demo || g.demo.id !== r.id || !dm) return false;
  const next = runDemoUnreversed(g.demo, dm, w);
  if (next) patchGuide(projectId, { demo: next });
  return next !== null;
}
/** v1 tgBackToMine (12453-12460): the demo is put away. The student's own data was never touched, so it is exactly as it was. */
export function backToMine(projectId: string): void { patchGuide(projectId, { demo: null }); }

/** v1 tgRender's "Other options" line (12474): the other test's name, a comma, then the reason without its first clause. */
export function otherOption(x: readonly [string, string]): string {
  const name = (TG_RES as Record<string, { name: string } | undefined>)[x[0]]?.name ?? (STAT_TESTS as Record<string, { label: string } | undefined>)[x[0]]?.label ?? x[0];
  return name + ", " + x[1].replace(/^[^,]*, /, "");
}
