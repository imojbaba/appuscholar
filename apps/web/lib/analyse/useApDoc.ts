"use client";
import { useSyncExternalStore } from "react";
import { apBuild, apNumbers, type ApDoc, type ApNumber, type ApRefs, type ApWalkRes, type apCheckQuote } from "@appuscholar/core";

/*
 * The paper the reader has loaded (it was Analyse a paper before wave B Task 27), and what the reader shows of it: v1's page state `AP` (9838), one paper per tab, kept in this tab's memory only, as v1 keeps `AP.doc` (never stored:
 * the chapter's "Never stored: the full text of the loaded paper and the Ask Q&A log"). The reader reads it with useApState(); the actions (intake.ts, ask.ts, refcheck.ts) write it.
 *
 * For the walk-through, the paper card and the cards side by side (Task 13): `doc.id` is the key of `ap_notes`: v1's docId ('a' + the squashed title cut at 24 + the characters read, apBuild 9880) for a pasted text
 * and the practice paper, "p:" + the paper's id for a kept paper (wave B Task 27); `gen` changes with each
 * paper loaded (a reply for an earlier paper is dropped); `refs` holds the last reference check (`finished` once it ran to the end),
 * which v1's card text includes (apCardText 10127); `busy` is v1's AP.busy, shared by Ask and the walk-through.
 * The walk-through's page state is v1's too (9838, reset by apLoad 9887): the stage shown (AP.stage), the words typed in "Try first." (AP.tryDraft) and in "Check yourself." (AP.chkDraft, never
 * stored), which suggested answers are shown (AP.shown) and the replies of this visit (AP.res). The stored notes (the ap_notes blob, lib/analyse/notes.ts) stand in for a stage this visit has
 * not touched, which is what v1's apLoad copies into AP.res and AP.tryDraft (9888-9889). (v1's "📊 My paper cards side by side", whose open box and AI-columns box lived here, is Compare now: wave B Task 22.)
 */
export type ApLoaded = ApDoc & { abstractOnly: boolean };
export type ApQuote = ReturnType<typeof apCheckQuote>;
/** One entry of v1's AP.log (apAsk 10041-10044): the question, apPick's numbers, and the raw reply (not JSON) or the answer and its checked quotations. */
export type ApAskItem = { q: string; title: string; partial: boolean; n: number; of: number; raw?: string; in_paper?: boolean; answer?: string; quotes: ApQuote[] };
/** A walk-through reply as core keeps it, with the title of the paper it was asked about (fix wave A, Task 16; register D-S2-30): the panel says which paper each answer is about. */
export type ApWalkReply = ApWalkRes & { title?: string };
/** AP.refs as apRefCheck (11236-11252) leaves it: one of its two `none` boxes, or the check's result (core's ApRefs; `done` 0 while it runs). */
export type ApRefState = { none: "no reference list" | "no DOIs" } | ApRefs;
export type ApState = {
  doc: ApLoaded | null;
  gen: number;
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
  stage: number;
  tryDraft: Record<string, string>;
  chkDraft: Record<string, string>;
  shown: Record<string, boolean>;
  res: Record<string, ApWalkReply>;
  /** The paper card's fields as typed in this tab, by docId then field: shown in place of the stored ones, so words a refused write (R16) did not store stay in the box. */
  cardDraft: Record<string, Record<string, string>>;
  /** "Your take first" as typed in this tab, by docId (wave B Task 28): shown in place of the stored lines, so words a refused write (R16) did not store stay in the box. */
  takeDraft: Record<string, string>;
};

const INITIAL: ApState = {
  doc: null, gen: 0, log: [], qDraft: "", paste: "", ok: false, busy: false, numbers: null, refs: null, refBusy: false,
  stage: 0, tryDraft: {}, chkDraft: {}, shown: {}, res: {}, cardDraft: {}, takeDraft: {}
};
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

/**
 * apLoad after its refusals (9886-9887): AP.doc = apBuild(title, pages, src) with `sample` and `abstractOnly`, the log, the numbers, the reference check and the walk-through's state cleared (the
 * first stage). AP.busy stays as it is, as in v1. v1's `mode` (the tab shown, set to Ask here) is the reader's `?tab=` now (wave B Task 27). `idOverride` is the key the paper's notes are kept under:
 * a kept paper's reader passes "p:" + its pid (Task 27), so Ask, the walk-through and the card write the note Compare reads; without it the doc keeps v1's docId ('a' + the squashed title + the
 * characters read), the key of a pasted text's and the practice paper's notes.
 */
export function loadDoc(title: string, pages: string[], src: string, isSample: boolean, idOverride?: string): ApLoaded {
  const built = apBuild(title, pages, src);
  const doc: ApLoaded = { ...built, ...(idOverride !== undefined ? { id: idOverride } : {}), abstractOnly: src === "abstract" };
  doc.sample = !!isSample;
  setAp((s) => ({ doc, gen: s.gen + 1, log: [], qDraft: "", numbers: null, refs: null, refBusy: false, stage: 0, tryDraft: {}, chkDraft: {}, shown: {}, res: {} }));
  return doc;
}

/** apOk (9893): the sample and an abstract need no tick; any other paper needs the box. */
export const apOk = (s: Pick<ApState, "doc" | "ok">): boolean => !!(s.doc && (s.doc.sample || s.doc.abstractOnly)) || s.ok;

/** apNumbersRun (10106): the numbers check on the loaded paper. */
export function runNumbers(): void {
  const { doc } = state;
  if (doc) setAp({ numbers: apNumbers(doc) });
}
