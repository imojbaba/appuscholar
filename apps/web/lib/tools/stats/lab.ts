import { useSyncExternalStore } from "react";
import { pdTransform, type ColumnNames, type GenVerdict, type ParsedData, type PdChoice, type PdFound, type StatsForm, type StatsOk, type StatsTestKey } from "@appuscholar/core";
import type { StatsRuns } from "@/lib/blobs/kinds/stats";
import type { ParticipantList } from "@/lib/blobs/kinds/participants";
import { addNotName, addPeople } from "@/lib/tools/participants/list";
import type { ChartSpec } from "./resultChart";
import { looksSemicolon, NO_SKIPPED, parseSliced, scanNamesSliced, scanSliced, semicolonsToTabs, skippedLines, type SliceOpts, type Skipped } from "./intake";
import { listNotUsed, makePlan, NO_CHOICES, NO_CONTEXT, startChoice, viewOf, type ColAction, type ListChoices, type PdContext } from "./pdList";

/*
 * The Statistics lab's memory (ledger ruling R1): the pasted text, the dataset name, the parsed table, the personal-data scan and the student's
 * choices, in a module-level store keyed by project. A tab's Panel mounts again on every tab switch (StagedPlace), so what the student pasted
 * cannot live in a component; and the participants' rows are never written to a blob (v1 kept them in `window._statsData` only), so a reload
 * loses them, as v1's did. Later tabs read the table with getData(projectId) and add their own fields to LabState (`test`, `form`, `gate` and `lastRun` are B2's).
 * Nothing here touches storage, the network or the page; the components do the registering (`stats_sets`) and the downloads.
 *
 * The participant list (spec 2026-10-24-participants-design.md §8.1): the Data tab hands the lab what the list and the plan say now (`setPdContext`: the list, the hook's state, the plan's mode) and
 * the lab scans the table against the list (`names`, core's listTableScan; pdList.ts says what the box makes of it) whenever the list is in use. What the student chooses in that box is kept
 * apart (`listChoices`, overrides only), so a list that changes under an open table moves every start with it. Apply (`applyPd`) adds the people the table names to the list first, through a save
 * the caller hands in, then writes the table with the codes the saved list holds. Rows stay in memory (R1): the list's people are added by name, never a row.
 */

/** What the last action said, drawn by the Data tab as a quiet line (v1 toasted these; toasts are only "Saved" and "Inserted" now, register row D-S2-62). */
export type LabStatus = { kind: "none" } | { kind: "empty" } | { kind: "parsed" } | { kind: "split" } | { kind: "read_failed" } | { kind: "adding" };
/**
 * What "Apply" in the personal-data box did (v1 `_pdMsg`, 9498-9504): the sentence is drawn from these numbers. With the participant list, `list` says what the list did: the rows of people who
 * withdrew that were removed, the people added with the codes they were given, and whether names inside answers were replaced; no key file is made (the list is the key). `failed`: the table
 * was not changed, because the people could not be added to the list (`list`), the words answered "Not a name" could not be saved (`words`), the list could not be saved at all (`unsaved`), the
 * table changed while the list was being saved (`changed`) or could not be written once it was (`table`); `added` says the people were added to the list before that.
 */
export type PdResult =
  | { unchanged: true }
  | { removed: number; coded: number; keyed: boolean; list?: { rows: number; added: Array<{ name: string; code: string }>; answers: boolean } }
  | { failed: "list" | "words" | "unsaved" | "changed" | "table"; added?: boolean };
export type PdScanResult = { found: PdFound[]; freeText: string[] };
/** What the participant list said about the table, and the list it was said against (a list that has changed since is scanned again). */
export type PdNames = { list: ParticipantList; cols: ColumnNames[] };

/** What the test form holds for the table it was made for (Task B2): the picked columns by field id, and the ticked columns of each multi field, in column order. */
export type FormState = { test: StatsTestKey; data: ParsedData; values: Record<string, string>; ticked: Record<string, number[]> };
/** What pressing "Run test" came to (v1 statsRunNow): a refusal to say inline, a result with an undefined number (nothing to insert), or a result. `html` is sanitized; `chart` is the spec the picture is drawn from, or null. */
export type Outcome =
  | { kind: "toast"; text: string }
  | { kind: "undefined"; html: string }
  | { kind: "ok"; res: StatsOk; html: string; chart: ChartSpec | null };
/** The plain-language explanation of the shown result: not asked, under way, here, or failed (the sentence to show). It is never part of the sentence that is inserted. */
export type ExplainState = { status: "idle" } | { status: "busy" } | { status: "done"; text: string } | { status: "failed"; message: string } | { status: "cancelled"; message: string };
/** A run record waiting to be saved, with the id its sentence carries in the document. */
export type PendingRun = { id: string; rec: StatsRuns[string] };
/** The last run: the table it ran on, the form it ran with, and what it came to. */
export type LastRun = { data: ParsedData; test: StatsTestKey; form: StatsForm; outcome: Outcome; explain: ExplainState };
/** Practice mode's gate (v1 genGateShow, 12580): open or not, the design chosen, the verdict shown and whether the last change was a switch. */
export type GateState = { open: boolean; design: string; verdict: GenVerdict | null; switched: boolean };

export type LabState = {
  /** The paste box. */
  text: string;
  /** The dataset name box (at most 60 characters); stored in `stats_prefs.statsname` by the component. */
  name: string;
  /** The parsed table: the participants' rows. Memory only. */
  data: ParsedData | null;
  /** The rows statsParseText dropped, listed (register row D-S2-60). */
  skipped: Skipped;
  /** pdScanV2 of `data` (v1 pdRender 9487; open answers are not names: F1): null until a table is parsed. */
  scan: PdScanResult | null;
  /** The select of each flagged column, by column index; starts at v1's PD_DEFAULT, except that a column only the values call names starts at Choose… (F1) and an anonymous plan starts names at Remove. */
  choices: Record<number, ColAction>;
  /** What the participant list can say about this box: the list, the hook's state and the plan's mode (set by the Data tab while it is open). */
  ctx: PdContext;
  /** The scan of the table against the list (null when the list is not used, or until it is made). */
  names: PdNames | null;
  /** What the student chose in the box when the list is used (overrides of where each row starts). */
  listChoices: ListChoices;
  /** The sentence of the last Apply, or null. */
  pdResult: PdResult | null;
  /** The table is one column and its first line holds a semicolon: the Data tab offers to split it (register row D-S2-61). */
  semicolons: boolean;
  status: LabStatus;
  /** The table whose fingerprint was last recorded in `stats_sets` while the Data tab was open; a table that is not this one is recorded when the tab is next open (a parse can finish after the student left). */
  registered: ParsedData | null;
  /** A big table is being read in slices (the page keeps responding; the Data tab says so). */
  busy: boolean;
  /** The data set's name when `registered` was recorded: the name a run is recorded under (v1 `_statsDsName`). */
  regName: string;
  /** The test chosen in the Data tab (v1 #statsTest; the first option is the default). */
  test: StatsTestKey;
  /** The test form's fields; null until the student touches one (the defaults are then those of lib/tools/stats/form.ts). */
  form: FormState | null;
  gate: GateState;
  /** B2's last result, kept so a tab switch does not lose it. */
  lastRun: LastRun | null;
  /** The name a sentence was tagged under before its table could be registered (a locked vault, a list being read): the set is registered under that name, whatever the box says by then. */
  lockedName: string | null;
  /** Run records of sentences already in the document, waiting for `stats_runs` to be known, unlocked and not broken (R16); the Data tab writes them from an effect. */
  pendingRuns: PendingRun[];
  /**
   * The student's answer to "replace the saved data sets that do not open?" (R16), kept here and not in a component because the Panel mounts again on every tab and a question
   * asked on each visit would be asked five times: null = not asked, true = replace, false = keep. It is forgotten when the list can be read again (StatsSets.tsx); a new parse
   * does not reset it (the student already said no to replacing that list).
   */
  setsDecided: boolean | null;
};

export const NO_GATE: GateState = { open: false, design: "", verdict: null, switched: false };
const EMPTY: LabState = {
  text: "", name: "", data: null, skipped: NO_SKIPPED, scan: null, choices: {}, ctx: NO_CONTEXT, names: null, listChoices: NO_CHOICES, pdResult: null, semicolons: false, status: { kind: "none" }, registered: null, busy: false,
  regName: "", test: "desc", form: null, gate: NO_GATE, lastRun: null, pendingRuns: [], lockedName: null, setsDecided: null
};

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
export function setChoice(projectId: string, index: number, choice: ColAction): void {
  patchLab(projectId, { choices: { ...getLab(projectId).choices, [index]: choice } });
}
/** One choice of the box when the list is used (see pdList.ts ListChoices): `key` is a column index, or `<column>:<row or text>`. */
export function setListChoice<K extends keyof ListChoices>(projectId: string, kind: K, key: string | number, value: ListChoices[K][keyof ListChoices[K]]): void {
  const now = getLab(projectId).listChoices;
  patchLab(projectId, { listChoices: { ...now, [kind]: { ...now[kind], [key]: value } } });
}
/** Each project's latest parse; a parse that finds another began after it (or a clear) stops and says nothing. */
const tickets = new Map<string, number>();
const nextTicket = (projectId: string): number => { const n = (tickets.get(projectId) ?? 0) + 1; tickets.set(projectId, n); return n; };

/** Empties the paste box, the table and what was said about it; the dataset name stays. A parse still reading is dropped. */
export function clearLab(projectId: string): void {
  nextTicket(projectId);
  patchLab(projectId, { text: "", data: null, skipped: NO_SKIPPED, scan: null, choices: {}, names: null, listChoices: NO_CHOICES, pdResult: null, semicolons: false, status: { kind: "none" }, busy: false, form: null, gate: NO_GATE, lastRun: null, lockedName: null });
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
  // The participant list, when it can be used: what it says about each column (a scan that fails leaves the box with v1's flags alone).
  const ctx = getLab(projectId).ctx;
  let names: PdNames | null = null;
  if (scan && (listNotUsed(ctx) === null)) {
    let cols: ColumnNames[] | null;
    try { cols = await scanNamesSliced(data, scan.found, ctx.list!, o); } catch { cols = []; }
    if (cols === null || stale()) return null;
    names = { list: ctx.list!, cols };
  }
  const choices: Record<number, ColAction> = {};
  for (const f of scan?.found ?? []) choices[f.index] = startChoice(f, ctx.mode === "anonymous");
  patchLab(projectId, {
    data, scan, choices, names, listChoices: NO_CHOICES, skipped: skippedLines(text, data), pdResult: null, semicolons: looksSemicolon(text, data), status: { kind: "parsed" }, busy: false,
    // A new table: the form was made for the old one, and a result of the old one is no longer of this data.
    form: null, gate: NO_GATE, lastRun: null, lockedName: null
  });
  // The list may have changed while the table was being read.
  void rescanNames(projectId);
  return data;
}

/** Rewrites a semicolon table with tabs in the paste box and parses it (the student pressed "Split on semicolons"). */
export async function splitOnSemicolons(projectId: string, opts: SliceOpts = {}): Promise<ParsedData | null> {
  patchLab(projectId, { text: semicolonsToTabs(getLab(projectId).text) });
  const data = await parse(projectId, opts);
  if (data) patchLab(projectId, { status: { kind: "split" } });
  return data;
}

/** The latest scan of each project against the list: a scan that finds another began after it, or a table that changed, says nothing. */
const scanTickets = new Map<string, number>();

/** Scans the table against the list again when the list the scan was made on is not the one in use (the list was read late, or changed, or the student added somebody and came back). */
export async function rescanNames(projectId: string, opts: SliceOpts = {}): Promise<void> {
  const mine = (scanTickets.get(projectId) ?? 0) + 1;
  scanTickets.set(projectId, mine);
  const lab = getLab(projectId);
  if (!lab.data || !lab.scan) return;
  const ctx = lab.ctx;
  if (!(listNotUsed(ctx) === null)) {
    if (lab.names) patchLab(projectId, { names: null });
    return;
  }
  if (lab.names?.list === ctx.list) return;
  const data = lab.data;
  const parsed = tickets.get(projectId);
  const list = ctx.list!;
  const stale = () => scanTickets.get(projectId) !== mine || tickets.get(projectId) !== parsed || getLab(projectId).data !== data;
  let cols: ColumnNames[] | null;
  try { cols = await scanNamesSliced(data, lab.scan.found, list, { ...opts, cancelled: stale }); } catch { cols = []; }
  if (cols === null || stale()) return;
  patchLab(projectId, { names: { list, cols } });
}

/**
 * What the participant list and the identification plan say now (the Data tab sets it while it is open and clears it when it closes, so the list is not kept in the page beyond its use).
 * A change moves the table's scan against the list; an anonymous plan that arrives or goes moves the starts of the name columns the student has not touched.
 */
export function setPdContext(projectId: string, next: PdContext): void {
  const prev = getLab(projectId).ctx;
  if (prev.list === next.list && prev.state === next.state && prev.mode === next.mode && prev.saveFailed === next.saveFailed) return;
  patchLab(projectId, { ctx: next });
  const lab = getLab(projectId);
  const was = prev.mode === "anonymous";
  const now = next.mode === "anonymous";
  if (lab.scan && was !== now) {
    const choices = { ...lab.choices };
    for (const f of lab.scan.found) if (choices[f.index] === startChoice(f, was)) choices[f.index] = startChoice(f, now);
    patchLab(projectId, { choices });
  }
  void rescanNames(projectId);
}

/** What Apply needs of the world when the list is used: a save of the list that says what was saved (useParticipants.saveNow), and today's date for the people it adds. */
export type ApplyIo = { saveNow(update: (prev: ParticipantList) => ParticipantList): Promise<ParticipantList | null>; today(): string };

/**
 * v1 pdApply (9488-9506): the flagged columns by the student's choices through core's pdTransform. Every flagged column kept: nothing changes
 * (null; the sentence says so). Otherwise the paste box becomes the cleaned table, it is parsed again, and the sentence counts the columns.
 * Returns the key file's text ('' when no column was coded) for the component to download; the key never stays in the lab.
 *
 * With the participant list (the lab holds a scan against it, and `io`): the people the table names who are not on the list, and the words the student said are not names, are saved to the list
 * FIRST (R35), and then the table is written with the codes the saved list holds, so it can never carry a code the list does not (core's listTransform). The key file is not made (the list is
 * the key): the result's `keyCsv` is ''. If the list cannot take the people, nothing is changed and the sentence says so.
 */
export async function applyPd(projectId: string, opts: SliceOpts = {}, io?: ApplyIo): Promise<{ keyCsv: string } | null> {
  const lab = getLab(projectId);
  if (!lab.data || !lab.scan) return null;
  const why = listNotUsed(lab.ctx);
  // A list whose last save failed is the student's held copy, not what is stored: nothing is coded against it, and nothing is made from v1's fresh codes in its place (R38).
  if (why === "unsaved") return null;
  if (why === null) {
    // The list is in use: the table is scanned against the list that is in use, or Apply waits for that scan. It is never v1's fresh codes (R39a).
    if (!lab.names || lab.names.list !== lab.ctx.list) return null;
    return applyList(projectId, opts, io);
  }
  const choices: Record<number, PdChoice> = {};
  for (const f of lab.scan.found) {
    const c = lab.choices[f.index] ?? "keep";
    choices[f.index] = c === "" || c === "notnames" ? "keep" : c;
  }
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

/** Projects whose Apply is under way: a second press while the list is being saved is not a second Apply. */
const applying = new Set<string>();

async function applyList(projectId: string, opts: SliceOpts, io: ApplyIo | undefined): Promise<{ keyCsv: string } | null> {
  if (applying.has(projectId)) return null;
  applying.add(projectId);
  try { return await applyListNow(projectId, opts, io); } finally { applying.delete(projectId); }
}

async function applyListNow(projectId: string, opts: SliceOpts, io: ApplyIo | undefined): Promise<{ keyCsv: string } | null> {
  const lab = getLab(projectId);
  const { data, scan, names, ctx, text, status } = lab;
  if (!data || !scan || !names || !ctx.list) return null;
  const parsed = tickets.get(projectId);
  const input = { data, found: scan.found, names: names.cols, list: ctx.list, mode: ctx.mode, choices: lab.listChoices, v1: lab.choices, today: io?.today() ?? "" };
  const plan = makePlan(input, viewOf(input));
  const added = plan.adds.length > 0;
  // The page is held while the list saves (R37): Parse, Upload, Clear and the box are off, and the status says so.
  patchLab(projectId, { busy: true, status: { kind: "adding" } });
  try {
    // Always saved first (R38): what the table is coded against is the list the save answers with, never a copy the student's page was holding. Nobody to add: the list goes as it is.
    // The update may run again on a newer list: it makes the same change to any list it is given (a name already on it is skipped).
    const saved = io ? await io.saveNow((prev) => {
      const withPeople = added ? addPeople(prev, plan.adds.map((name) => ({ name, spellings: [] })), input.today).list : prev;
      return plan.notNames.reduce((l, word) => addNotName(l, word), withPeople);
    }) : null;
    if (!saved) {
      patchLab(projectId, { pdResult: { failed: added ? "list" : plan.notNames.length ? "words" : "unsaved" } });
      return null;
    }
    // The people are on the list now. If the table is not the one the box was drawn for, it is not written over (R37).
    const now = getLab(projectId);
    if (now.data !== data || now.text !== text || tickets.get(projectId) !== parsed) {
      patchLab(projectId, { pdResult: { failed: "changed", added } });
      return null;
    }
    // The parse below scans the new table against the list as saved; the tab's own copy is left alone if it has moved on.
    if (now.ctx.list === ctx.list) patchLab(projectId, { ctx: { ...now.ctx, list: saved } });
    let r;
    try { r = plan.finish(saved); } catch {
      patchLab(projectId, { pdResult: { failed: "table", added } });
      return null;
    }
    if (r.same) {
      await parse(projectId, opts);
      patchLab(projectId, { pdResult: { unchanged: true } });
      return null;
    }
    patchLab(projectId, { text: r.csv });
    await parse(projectId, opts);
    patchLab(projectId, { pdResult: { removed: r.removed, coded: r.coded, keyed: false, list: { rows: r.removedRows, added: r.added, answers: r.answers > 0 } } });
    return { keyCsv: "" };
  } finally {
    const end = getLab(projectId);
    patchLab(projectId, { busy: false, ...(end.status.kind === "adding" ? { status } : {}) });
  }
}
