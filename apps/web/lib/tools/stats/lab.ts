import { useSyncExternalStore } from "react";
import { PD_DEFAULT, pdTransform, type ParsedData, type PdChoice, type PdFound } from "@appuscholar/core";
import { looksSemicolon, NO_SKIPPED, parseSliced, scanSliced, semicolonsToTabs, skippedLines, type SliceOpts, type Skipped } from "./intake";

/*
 * The Statistics lab's memory (ledger ruling R1): the pasted text, the dataset name, the parsed table, the personal-data scan and the student's
 * choices, in a module-level store keyed by project. A tab's Panel mounts again on every tab switch (StagedPlace), so what the student pasted
 * cannot live in a component; and the participants' rows are never written to a blob (v1 kept them in `window._statsData` only), so a reload
 * loses them, as v1's did. Later tabs read the table with getData(projectId) and add their own fields to LabState (`lastRun` is B2's).
 * Nothing here touches storage, the network or the page; the components do the registering (`stats_sets`) and the downloads.
 */

/** What the last action said, drawn by the Data tab as a quiet line (v1 toasted these; toasts are only "Saved" and "Inserted" now, register row D-S2-62). */
export type LabStatus = { kind: "none" } | { kind: "empty" } | { kind: "parsed" } | { kind: "split" } | { kind: "read_failed" };
/** What "Apply" in the personal-data box did (v1 `_pdMsg`, 9498-9504): the sentence is drawn from these numbers. */
export type PdResult = { unchanged: true } | { removed: number; coded: number; keyed: boolean };
export type PdScanResult = { found: PdFound[]; freeText: string[] };

export type LabState = {
  /** The paste box. */
  text: string;
  /** The dataset name box (at most 60 characters); stored in `stats_prefs.statsname` by the component. */
  name: string;
  /** The parsed table: the participants' rows. Memory only. */
  data: ParsedData | null;
  /** The rows statsParseText dropped, listed (register row D-S2-60). */
  skipped: Skipped;
  /** pdScan of `data` (v1 pdRender 9487): null until a table is parsed. */
  scan: PdScanResult | null;
  /** The select of each flagged column, by column index; starts at PD_DEFAULT. */
  choices: Record<number, PdChoice>;
  /** The sentence of the last Apply, or null. */
  pdResult: PdResult | null;
  /** The table is one column and its first line holds a semicolon: the Data tab offers to split it (register row D-S2-61). */
  semicolons: boolean;
  status: LabStatus;
  /** A big table is being read in slices (the page keeps responding; the Data tab says so). */
  busy: boolean;
  /** B2's last result (the run record), kept so a tab switch does not lose it. */
  lastRun?: unknown;
};

const EMPTY: LabState = { text: "", name: "", data: null, skipped: NO_SKIPPED, scan: null, choices: {}, pdResult: null, semicolons: false, status: { kind: "none" }, busy: false };

const labs = new Map<string, LabState>();
const listeners = new Map<string, Set<() => void>>();

/** The lab of a project; one object until it changes (useSyncExternalStore compares it). */
export function getLab(projectId: string): LabState { return labs.get(projectId) ?? EMPTY; }
/** The parsed table of a project, or null: what the Power, Charts, Check and Scales tabs read. */
export function getData(projectId: string): ParsedData | null { return getLab(projectId).data; }

export function subscribeLab(projectId: string, fn: () => void): () => void {
  let set = listeners.get(projectId);
  if (!set) listeners.set(projectId, (set = new Set()));
  set.add(fn);
  return () => { set.delete(fn); };
}
/** The lab of a project, redrawn when it changes. */
export function useLab(projectId: string): LabState {
  return useSyncExternalStore((fn) => subscribeLab(projectId, fn), () => getLab(projectId), () => EMPTY);
}

/** Merges a change into a project's lab and tells its subscribers. */
export function patchLab(projectId: string, patch: Partial<LabState>): void {
  labs.set(projectId, { ...getLab(projectId), ...patch });
  for (const fn of [...(listeners.get(projectId) ?? [])]) fn();
}
/** Forgets every project's lab (a test's reset; nothing in the app calls it). */
export function resetLabs(): void {
  const ids = [...labs.keys()];
  labs.clear();
  for (const id of ids) for (const fn of [...(listeners.get(id) ?? [])]) fn();
}

export function setText(projectId: string, text: string): void { patchLab(projectId, { text }); }
/** At most 60 characters (v1's maxlength). */
export function setName(projectId: string, name: string): void { patchLab(projectId, { name: name.slice(0, 60) }); }
export function setChoice(projectId: string, index: number, choice: PdChoice): void {
  patchLab(projectId, { choices: { ...getLab(projectId).choices, [index]: choice } });
}
/** Each project's latest parse; a parse that finds another began after it (or a clear) stops and says nothing. */
const tickets = new Map<string, number>();
const nextTicket = (projectId: string): number => { const n = (tickets.get(projectId) ?? 0) + 1; tickets.set(projectId, n); return n; };

/** Empties the paste box, the table and what was said about it; the dataset name stays. A parse still reading is dropped. */
export function clearLab(projectId: string): void {
  nextTicket(projectId);
  patchLab(projectId, { text: "", data: null, skipped: NO_SKIPPED, scan: null, choices: {}, pdResult: null, semicolons: false, status: { kind: "none" }, busy: false });
}

/**
 * v1 statsParse (9389-9402): parse the paste box with core's statsParseText. Nothing parsed (or no column): the status says so and what the lab
 * held stays, as v1 left `_statsData`. Otherwise the table, the rows left out, the personal-data scan (v1 wrapped pdRender in a try, so a scan
 * that throws leaves the table usable) and the default choice of each flagged column. The previous Apply sentence is cleared; applyPd sets its own after.
 * A table of a few hundred rows is done before this returns its promise; a big one is read in slices (intake.ts parseSliced and scanSliced), so
 * the page keeps responding, and `busy` is set from the first slice the clock gives up on. `opts` is for tests (a tiny slice, a no-op yield).
 */
export async function parse(projectId: string, opts: SliceOpts = {}): Promise<ParsedData | null> {
  const ticket = nextTicket(projectId);
  const stale = () => tickets.get(projectId) !== ticket;
  const o: SliceOpts = { ...opts, cancelled: stale, onSlow: () => { patchLab(projectId, { busy: true }); opts.onSlow?.(); } };
  const text = getLab(projectId).text;
  const data = await parseSliced(text, o);
  if (stale()) return null;
  if (!data || !data.cols.length) { patchLab(projectId, { status: { kind: "empty" }, busy: false }); return null; }
  let scan: PdScanResult | null;
  try { scan = await scanSliced(data, o); } catch { scan = null; }
  if (stale()) return null;
  const choices: Record<number, PdChoice> = {};
  for (const f of scan?.found ?? []) choices[f.index] = PD_DEFAULT[f.kind];
  patchLab(projectId, {
    data, scan, choices, skipped: skippedLines(text, data), pdResult: null, semicolons: looksSemicolon(text, data), status: { kind: "parsed" }, busy: false
  });
  return data;
}

/** Rewrites a semicolon table with tabs in the paste box and parses it (the student pressed "Split on semicolons"). */
export async function splitOnSemicolons(projectId: string, opts: SliceOpts = {}): Promise<ParsedData | null> {
  patchLab(projectId, { text: semicolonsToTabs(getLab(projectId).text) });
  const data = await parse(projectId, opts);
  if (data) patchLab(projectId, { status: { kind: "split" } });
  return data;
}

/**
 * v1 pdApply (9488-9506): the flagged columns by the student's choices through core's pdTransform. Every flagged column kept: nothing changes
 * (null; the sentence says so). Otherwise the paste box becomes the cleaned table, it is parsed again, and the sentence counts the columns.
 * Returns the key file's text ('' when no column was coded) for the component to download; the key never stays in the lab.
 */
export async function applyPd(projectId: string, opts: SliceOpts = {}): Promise<{ keyCsv: string } | null> {
  const lab = getLab(projectId);
  if (!lab.data || !lab.scan) return null;
  const choices: Record<number, PdChoice> = {};
  for (const f of lab.scan.found) choices[f.index] = lab.choices[f.index] ?? "keep";
  const r = pdTransform(lab.data, choices);
  if (!r.removed && !r.coded) {
    await parse(projectId, opts);
    patchLab(projectId, { pdResult: { unchanged: true } });
    return null;
  }
  patchLab(projectId, { text: r.csv });
  await parse(projectId, opts);
  patchLab(projectId, { pdResult: { removed: r.removed, coded: r.coded, keyed: !!r.keyCsv } });
  return { keyCsv: r.keyCsv };
}
