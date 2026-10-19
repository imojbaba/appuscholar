"use client";
import { useSyncExternalStore } from "react";
import { apBuild, apNumbers, type ApDoc, type ApNumber, type ApRefs, type apCheckQuote } from "@appuscholar/core";

/*
 * The paper Analyse a paper has loaded, and what the panel shows of it: v1's page state `AP` (9838), one paper per tab, kept in this tab's memory only, as v1 keeps `AP.doc` (never stored:
 * the chapter's "Never stored: the full text of the loaded paper and the Ask Q&A log"). The panel reads it with useApState(); the actions (intake.ts, ask.ts, refcheck.ts) write it.
 *
 * For Task 13 (Walk, Paper card, Across papers): `doc.id` is v1's docId ('a' + the squashed title cut at 24 + the characters read, apBuild 9880), the key of `ap_notes`; `gen` changes with each
 * paper loaded (a reply for an earlier paper is dropped); `mode` is the tab ("ask" until Task 13 opens the others); `refs` holds the last reference check (`finished` once it ran to the end),
 * which v1's card text includes (apCardText 10127); `busy` is v1's AP.busy, shared by Ask and the walk-through.
 */
export type ApLoaded = ApDoc & { abstractOnly: boolean };
export type ApQuote = ReturnType<typeof apCheckQuote>;
/** One entry of v1's AP.log (apAsk 10041-10044): the question, apPick's numbers, and the raw reply (not JSON) or the answer and its checked quotations. */
export type ApAskItem = { q: string; partial: boolean; n: number; of: number; raw?: string; in_paper?: boolean; answer?: string; quotes: ApQuote[] };
/** AP.refs as apRefCheck (11236-11252) leaves it: one of its two `none` boxes, or the check's result (core's ApRefs; `done` 0 while it runs). */
export type ApRefState = { none: "no reference list" | "no DOIs" } | ApRefs;
export type ApMode = "ask" | "walk" | "card" | "lesson";
export type ApState = {
  doc: ApLoaded | null;
  gen: number;
  mode: ApMode;
  log: ApAskItem[];
  /** The question box (AP.qDraft). */
  qDraft: string;
  /** The paste box (#apPaste), which v1 keeps on its page. */
  paste: string;
  /** The box "I am allowed to read this paper…" (#apOK), which v1 keeps ticked across papers. */
  ok: boolean;
  busy: boolean;
  numbers: ApNumber[] | null;
  refs: ApRefState | null;
  refBusy: boolean;
};

const INITIAL: ApState = { doc: null, gen: 0, mode: "ask", log: [], qDraft: "", paste: "", ok: false, busy: false, numbers: null, refs: null, refBusy: false };
let state: ApState = INITIAL;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const read = () => state;
export function setAp(next: Partial<ApState> | ((s: ApState) => Partial<ApState>)): void {
  state = { ...state, ...(typeof next === "function" ? next(state) : next) };
  for (const l of listeners) l();
}
export const getAp = (): ApState => state;
/** Back to no paper (tests). */
export function resetAp(): void { state = INITIAL; for (const l of listeners) l(); }
export function useApState(): ApState { return useSyncExternalStore(subscribe, read, read); }

/** apLoad after its refusals (9886-9887): AP.doc = apBuild(title, pages, src) with `sample` and `abstractOnly`, the log, the numbers and the reference check cleared, the Ask tab shown. AP.busy stays as it is, as in v1. */
export function loadDoc(title: string, pages: string[], src: string, isSample: boolean): ApLoaded {
  const doc: ApLoaded = { ...apBuild(title, pages, src), abstractOnly: src === "abstract" };
  doc.sample = !!isSample;
  setAp((s) => ({ doc, gen: s.gen + 1, log: [], qDraft: "", numbers: null, refs: null, refBusy: false, mode: "ask" }));
  return doc;
}

/** apOk (9893): the sample and an abstract need no tick; any other paper needs the box. */
export const apOk = (s: Pick<ApState, "doc" | "ok">): boolean => !!(s.doc && (s.doc.sample || s.doc.abstractOnly)) || s.ok;

/** apNumbersRun (10106): the numbers check on the loaded paper. */
export function runNumbers(): void {
  const { doc } = state;
  if (doc) setAp({ numbers: apNumbers(doc) });
}
