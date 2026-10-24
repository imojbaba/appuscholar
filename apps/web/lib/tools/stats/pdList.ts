import {
  PD_DEFAULT, buildMatcher, listTransform, normName,
  type ColumnNames, type ColumnPlan, type IdMode, type Matcher, type ParsedData, type PdFound
} from "@appuscholar/core";
import type { ParticipantList } from "@/lib/blobs/kinds/participants";
import { addPeople, suggestionNotNames, toMatchPeople } from "@/lib/tools/participants/list";
import type { ParticipantsState } from "@/lib/tools/participants/useParticipants";

/*
 * The personal-details box against the participant list (spec 2026-10-24-participants-design.md §1 F1, §7.5 Tables, §8.1, calls C14; rulings R8, R10, R13, R35), as plain functions: the lab
 * store (lab.ts) scans with them, the box (components/tools/stats/PdBox.tsx) draws their view, and Apply (lab.ts applyPd) turns the view into core's plans. Core does the matching
 * (listTableScan) and the writing (listTransform); this file decides what the student is shown, where each choice starts, and how a choice becomes a plan.
 *
 * The list is used only when it can be: the vault open and the list read, with somebody on it (`listNotUsed` says why not, and the box is then v1's, with the line). The scan is of the table
 * as pasted; what the student chooses is kept apart (`ListChoices`, overrides only), so a list that changes under an open table moves every start with it and no choice is lost.
 *
 * Where a column starts:
 * - a name column found by its heading (pdScanV2 kind name, why heading): Replace with their codes, and the names not on the list are added; found by the shape of its values only (a
 *   guess, F1): "Choose…", which Apply treats as Keep, unless over half of its non-empty values are on the list (R8). Under an anonymous plan: Remove, and no codes are offered.
 * - a roll column (C14): codes when every roll number is a listed person's, else Remove (new codes would clash with the list's); codes are offered only when all match.
 * - any other column with something from the list in it: Keep, or codes when over half of its non-empty values are listed (R8); its names inside answers start at their codes; its ask finds
 *   and suggestions start at "Choose…" (nothing is done to a guess).
 * - phone, e-mail, date of birth, address and ID number columns: v1's start (Remove); a code from the list cannot stand for them, so only Remove and Keep.
 * - a name column's cells that are not on the list and were not added, because they are not shaped like a name (more than four words, R11: "K. R. Narayanan Swamy Iyer"), are said (R49): they start
 *   at Remove these cells when the column is going to codes, and at Keep otherwise; the words inside cells that go are not asked about.
 * - rows of a person who withdrew with remove start removed (R10); a row that may be one of several people, some of whom withdrew, is asked about and starts at Keep (R10/R13); a cell that is
 *   two people on the list ("Priya & Rahul") is shown apart, never added as a person, and starts at Keep; a listed cell with more in it than the name is warned about before it is swapped for one code.
 */

/**
 * What the box knows of the participant list: the list when it is read, the hook's state, whether its last save failed (the list shown is then the student's held copy, not what is stored: R38),
 * and the identification plan's mode.
 */
export type PdContext = {
  list: ParticipantList | null; state: ParticipantsState; mode: IdMode | null; saveFailed: boolean;
  /**
   * With the vault locked: whether the project's blob listing holds a `participants` blob (R51), so a list exists that could not be read. false: it does not, or the listing could not be read
   * (there is no way to tell, so nothing is said to be locked: R41); undefined: the listing has not answered yet. Not read in any other state.
   */
  listLocked?: boolean;
};
export const NO_CONTEXT: PdContext = { list: null, state: "loading", mode: null, saveFailed: false };

/**
 * Why the list is not used: the vault is off, or locked (`locked`: the project has a list that could not be read; `lockedNone`: it has none), the list is still being read (or, with the vault
 * locked, the listing that says whether there is one), or cannot be read, its last save failed, or nobody is on it.
 */
export type NotUsed = "off" | "locked" | "lockedNone" | "loading" | "unreadable" | "unsaved" | "empty";
export function listNotUsed(ctx: PdContext): NotUsed | null {
  switch (ctx.state) {
    case "off": return "off";
    case "locked": return ctx.listLocked === undefined ? "loading" : ctx.listLocked ? "locked" : "lockedNone";
    case "loading": return "loading";
    case "broken":
    case "error": return "unreadable";
    case "ready": return ctx.saveFailed ? "unsaved" : ctx.list && ctx.list.people.length > 0 ? null : "empty";
  }
}
export const listInUse = (ctx: PdContext): boolean => listNotUsed(ctx) === null;

/**
 * v1's fresh codes (P001, P002 ...) are never made for a name or roll column while the list is being read, or while it is locked and the project has one (R51): they would clash with the
 * codes on the list. With no list at all they are v1's as ever.
 */
export const freshCodesBlocked = (kind: PdFound["kind"], why: NotUsed | null): boolean => (why === "loading" || why === "locked") && (kind === "name" || kind === "roll");

/** The select of a column of v1's box as it is shown and as Apply takes it: what the student chose (or the start), except that a code the box may not make is Remove. */
export function v1Choice(f: PdFound, chosen: ColAction | undefined, anonymous: boolean, why: NotUsed | null): ColAction {
  const c = chosen ?? startChoice(f, anonymous);
  return c === "code" && freshCodesBlocked(f.kind, why) ? "remove" : c;
}

/** A column's select: Choose… is "", Not names is "notnames" (both are Keep when Apply runs). v1's `lab.choices` hold these too. */
export type ColAction = "" | "code" | "remove" | "keep" | "notnames";
/** What the student chose, overrides only; a key is `<column>` or `<column>:<row or text>`. */
export type ListChoices = {
  action: Record<number, ColAction>;
  unlisted: Record<number, "add" | "keep" | "remove">;
  inText: Record<number, "codes" | "keep">;
  drop: Record<number, boolean>;
  ask: Record<string, "remove" | "keep">;
  /** What to do with a name column's cells that are not on the list and were not added (R49). */
  leftover: Record<number, "remove" | "keep">;
  multi: Record<string, "keep" | "codes" | "remove">;
  /** "" = Choose…, "name" = [name], "add" = add to the list, "keep" = not a name or keep, else the id of the person an ask find is. */
  maybe: Record<string, string>;
};
export const NO_CHOICES: ListChoices = { action: {}, unlisted: {}, inText: {}, drop: {}, ask: {}, leftover: {}, multi: {}, maybe: {} };
export const choiceKey = (col: number, k: string | number): string => `${col}:${k}`;

/** v1's start of a flagged column, except that a column only the values call names (a guess, F1) starts at Choose… and an anonymous plan starts names at Remove. */
export function startChoice(f: PdFound, anonymous: boolean): ColAction {
  if (f.kind !== "name") return PD_DEFAULT[f.kind];
  return anonymous ? "remove" : f.why === "values" ? "" : "code";
}

/** The matcher and core's options for the list: roll numbers by normal form, the columns the heading or the values call names, suggestions on, and the words answered "Not a name" and the made-up names left out. */
export function scanSetup(found: PdFound[], list: ParticipantList): { m: Matcher; opts: { rolls: Map<string, string>; nameColumns: number[]; suggest: boolean; notNames: string[] } } {
  const rolls = new Map<string, string>();
  for (const p of list.people) {
    const r = normName(p.roll ?? "");
    if (r && !rolls.has(r)) rolls.set(r, p.id);
  }
  return {
    m: buildMatcher(toMatchPeople(list, false)),
    opts: { rolls, nameColumns: found.filter((f) => f.kind === "name").map((f) => f.index), suggest: true, notNames: suggestionNotNames(list) }
  };
}

/** Who has each name and spelling of the list, in normal form, in list order: a name two people have is nobody's alone. */
export function ownersOf(list: ParticipantList): Map<string, string[]> {
  const owners = new Map<string, string[]>();
  for (const p of list.people) {
    for (const key of new Set([p.name, ...p.spellings].map(normName))) if (key) owners.set(key, [...(owners.get(key) ?? []), p.id]);
  }
  return owners;
}

// ---- The view ---------------------------------------------------------------------------------------------------------------------------------------

/** A word that might be a name, asked about once for the column: an ask find (a person on the list, or an ordinary word) or a suggestion (not on the list). */
export type MaybeGroup = { key: string; text: string; suggest: boolean; answers: number; people: Array<{ id: string; code: string }>; choice: string };
export type ColView = {
  index: number;
  name: string;
  role: "name" | "roll" | "other" | "answers";
  found: PdFound | null;
  /** The codes of the people in the column's listed cells (not the rows that start removed or asked about), each once, in order. */
  codes: string[];
  /** Cells that are wholly a listed name, withdrawn people's included: what R8's "over half" counts. */
  listedCells: number;
  /** Names not on the list that Apply would add: one person each. */
  unlisted: string[];
  /** Cells that name more than one person on the list. */
  multi: Array<{ key: string; value: string; codes: string[]; choice: "keep" | "codes" | "remove" }>;
  /** Listed cells that hold more than the name. */
  wide: string[];
  /** A name column's cells that are not on the list and were not added (R49: an answer of more than four words under a heading that says names): how many cells, a few of the values, and what Apply does with them. */
  leftover: { cells: number; values: string[]; choice: "remove" | "keep" };
  /** Listed cells whose name more than one person on the list has ("Sam"): they are not coded as the first of those people (R36), they stay as written. `cells` counts them. */
  shared: Array<{ value: string; codes: string[]; cells: number }>;
  withdrawn: Array<{ id: string; name: string; on: string; rows: number }>;
  keepNotes: Array<{ id: string; name: string; on: string }>;
  ask: Array<{ row: number; value: string; codes: string[]; choice: "remove" | "keep" }>;
  sure: { texts: string[]; answers: number };
  maybe: MaybeGroup[];
  rollState: "all" | "some" | "none";
  rollCodes: string[];
  /** The select's options in order; none = no select (the column is only drawn for what is inside it). */
  options: ColAction[];
  action: ColAction;
  unlistedChoice: "add" | "keep" | "remove";
  inText: "codes" | "keep";
  drop: boolean;
  /** The plan is anonymous and this is a name column: the box says so (and starts it at Remove). */
  anonymous: boolean;
  /** The plan is anonymous: nobody is added to the list from this table. */
  noAdd: boolean;
};
export type PdView = {
  cols: ColView[];
  /** The people Apply will add, with the codes the list would give them now. */
  adds: Array<{ name: string; code: string }>;
  /** Words the student said are not names: learned when Apply runs. */
  notNames: string[];
};
export type ViewInput = {
  data: ParsedData;
  found: PdFound[];
  names: ColumnNames[];
  list: ParticipantList;
  mode: IdMode | null;
  choices: ListChoices;
  /** v1's select of each flagged column (lab.choices): read for the columns v1 flags by what they are. */
  v1: Record<number, ColAction>;
  today: string;
};

/** Under an anonymous plan nobody is added to the list from a table: a choice made before the plan said so is Choose… again. */
const noAddChoice = (choice: string, anonymous: boolean): string => (anonymous && choice === "add" ? "" : choice);
const emptyColumn = (index: number): ColumnNames => ({ index, listed: [], unlisted: [], withdrawn: [], withdrawnAsk: [], inText: [], roll: [], leftover: [] });
const distinct = (xs: string[]): string[] => [...new Set(xs)];

export function viewOf(input: ViewInput): PdView {
  const { data, found, names, list, mode, choices, v1, today } = input;
  const anonymous = mode === "anonymous";
  const person = new Map(list.people.map((p) => [p.id, p]));
  const codeOf = (id: string): string => person.get(id)?.code ?? "";
  const foundAt = new Map(found.map((f) => [f.index, f]));
  const namesAt = new Map(names.map((n) => [n.index, n]));
  const owners = ownersOf(list);
  const cols: ColView[] = [];

  data.headers.forEach((header, i) => {
    const f = foundAt.get(i) ?? null;
    const n = namesAt.get(i) ?? null;
    if (!f && !n) return;
    const name = header || "Col" + (i + 1);
    const cellAt = (row: number): string => data.rows[row]?.[i] ?? "";
    const role: ColView["role"] = !f ? "answers" : f.kind === "name" ? "name" : f.kind === "roll" ? "roll" : "other";
    const base: ColView = {
      index: i, name, role, found: f, codes: [], listedCells: 0, unlisted: [], multi: [], wide: [], leftover: { cells: 0, values: [], choice: "keep" }, shared: [], withdrawn: [], keepNotes: [], ask: [], sure: { texts: [], answers: 0 }, maybe: [],
      rollState: "none", rollCodes: [], options: [], action: "keep", unlistedChoice: "add", inText: "keep", drop: true, anonymous: anonymous && role === "name", noAdd: anonymous
    };

    if (role === "other") {
      const a = v1[i] ?? startChoice(f!, anonymous);
      cols.push({ ...base, options: ["remove", "keep"], action: a === "remove" ? "remove" : "keep" });
      return;
    }

    const col = n ?? emptyColumn(i);
    const nonEmpty = data.rows.filter((r) => (r[i] ?? "").trim() !== "").length;

    if (role === "roll") {
      const rollState = nonEmpty > 0 && col.roll.length === nonEmpty ? "all" : col.roll.length > 0 ? "some" : "none";
      const start: ColAction = anonymous || rollState !== "all" ? "remove" : "code";
      const options: ColAction[] = anonymous || rollState !== "all" ? ["remove", "keep"] : ["remove", "code", "keep"];
      const pick = choices.action[i];
      cols.push({ ...base, rollState, rollCodes: distinct(col.roll.map((r) => codeOf(r.personId))), options, action: pick !== undefined && options.includes(pick) ? pick : start });
      return;
    }

    // Name columns and the other columns the list found something in.
    const askRows = new Map(col.withdrawnAsk.map((a) => [a.row, a.personIds]));
    const withdrawnRows = new Set(col.withdrawn.map((w) => w.row));
    const listedRows = new Set(col.listed.map((l) => l.row));
    // A cell that is wholly a name two or more people have is nobody's to code (R36): it stays as written.
    const sharedRows = new Set(col.listed.filter((l) => (owners.get(normName(cellAt(l.row)))?.length ?? 0) >= 2).map((l) => l.row));
    const live = col.listed.filter((l) => !withdrawnRows.has(l.row) && !askRows.has(l.row) && !sharedRows.has(l.row));
    const codes = distinct(live.map((l) => codeOf(l.personId)).filter(Boolean));

    // Which of the unlisted values are cells that name several people on the list.
    const unlistedKeys = new Set(col.unlisted.map(normName));
    const sureOf = (finds: ColumnNames["inText"][number]["finds"]) => distinct(finds.filter((x) => x.kind === "sure").flatMap((x) => x.personIds));
    const multiAt = new Map<string, string[]>();
    for (const t of col.inText) {
      const key = normName(cellAt(t.row));
      const ids = sureOf(t.finds);
      if (unlistedKeys.has(key) && ids.length >= 2 && !multiAt.has(key)) multiAt.set(key, ids);
    }
    const multi: ColView["multi"] = col.unlisted.filter((u) => multiAt.has(normName(u))).map((u) => {
      const key = normName(u);
      return { key, value: u, codes: multiAt.get(key)!.map(codeOf), choice: choices.multi[choiceKey(i, key)] ?? "keep" };
    });
    const singles = col.unlisted.filter((u) => !multiAt.has(normName(u)));

    // Listed cells with more than the name in them (they have a find of their own in the cell).
    const inTextRows = new Set(col.inText.map((t) => t.row));
    const wide = distinct(col.listed.filter((l) => inTextRows.has(l.row) && !askRows.has(l.row)).map((l) => cellAt(l.row).trim()));

    const shared: ColView["shared"] = [];
    for (const l of col.listed) {
      if (askRows.has(l.row) || !sharedRows.has(l.row)) continue;
      const key = normName(cellAt(l.row));
      const had = shared.find((x) => normName(x.value) === key);
      if (had) had.cells++;
      else shared.push({ value: cellAt(l.row).trim(), codes: owners.get(key)!.map(codeOf), cells: 1 });
    }

    const withdrawn: ColView["withdrawn"] = [];
    for (const w of col.withdrawn) {
      const p = person.get(w.personId);
      const had = withdrawn.find((x) => x.id === w.personId);
      if (had) had.rows++;
      else if (p?.withdrawn) withdrawn.push({ id: p.id, name: p.name, on: p.withdrawn.on, rows: 1 });
    }
    const keepNotes: ColView["keepNotes"] = [];
    for (const l of col.listed) {
      const p = person.get(l.personId);
      if (p?.withdrawn?.data === "keep" && !keepNotes.some((k) => k.id === p.id)) keepNotes.push({ id: p.id, name: p.name, on: p.withdrawn.on });
    }
    const ask: ColView["ask"] = col.withdrawnAsk.map((a) => ({ row: a.row, value: cellAt(a.row).trim(), codes: a.personIds.map(codeOf), choice: choices.ask[choiceKey(i, a.row)] ?? "keep" }));

    const canCode = live.length > 0 || singles.length > 0;
    const heading = f?.why === "heading";
    let start: ColAction;
    let options: ColAction[];
    if (role === "name") {
      start = anonymous ? "remove" : !canCode ? "keep" : heading ? "code" : col.listed.length * 2 > nonEmpty ? "code" : "";
      options = anonymous ? ["remove", "keep"]
        : [...(heading ? [] : [""] as ColAction[]), "remove", ...(canCode ? ["code" as const] : []), "keep", ...(heading ? [] : ["notnames" as const])];
    } else {
      start = !anonymous && canCode && col.listed.length * 2 > nonEmpty ? "code" : "keep";
      options = anonymous ? (live.length > 0 ? ["remove", "keep"] : []) : canCode ? ["code", "keep"] : [];
    }
    const pick = choices.action[i];
    const action = pick !== undefined && options.includes(pick) ? pick : start;

    // A name column's cells that are not on the list and not added (R49) go with the codes, unless the student keeps them. The words inside cells that go are not asked about.
    const left = role === "name" ? col.leftover : [];
    const leftKeys = new Set<string>();
    const leftover: ColView["leftover"] = {
      cells: left.length, values: left.map((l) => l.value).filter((v) => !leftKeys.has(normName(v)) && !!leftKeys.add(normName(v))),
      choice: choices.leftover[i] ?? (action === "code" ? "remove" : "keep")
    };
    const leftGone = new Set(action !== "remove" && leftover.choice === "remove" ? left.map((l) => l.row) : []);

    // Names and guesses inside answers: not in the cells that are a name of their own (listed, or one of the unlisted).
    const sureTexts = new Map<string, string>();
    let sureAnswers = 0;
    const groups = new Map<string, MaybeGroup>();
    for (const t of col.inText) {
      if (listedRows.has(t.row) || leftGone.has(t.row) || unlistedKeys.has(normName(cellAt(t.row)))) continue;
      let hasSure = false;
      const inThis = new Set<string>();
      for (const find of t.finds) {
        const key = normName(find.text);
        if (find.kind === "sure") {
          hasSure = true;
          if (!sureTexts.has(key)) sureTexts.set(key, find.text);
          continue;
        }
        let g = groups.get(key);
        if (!g) groups.set(key, (g = { key, text: find.text, suggest: find.kind === "suggest", answers: 0, people: [], choice: noAddChoice(choices.maybe[choiceKey(i, key)] ?? "", anonymous) }));
        if (!inThis.has(key)) { inThis.add(key); g.answers++; }
        for (const id of find.personIds) if (!g.people.some((x) => x.id === id)) g.people.push({ id, code: codeOf(id) });
      }
      if (hasSure) sureAnswers++;
    }

    const sure = { texts: [...sureTexts.values()], answers: sureAnswers };
    const inText = choices.inText[i] ?? (sure.texts.length || multi.length ? "codes" : "keep");
    // The names in a cell of several people are replaced by the same switch as the names inside answers: with that at Keep they stay as typed.
    for (const m of multi) if (m.choice === "codes" && inText !== "codes") m.choice = "keep";
    cols.push({
      ...base, codes, listedCells: col.listed.length, unlisted: singles, multi, wide, leftover, shared, withdrawn, keepNotes, ask, sure, maybe: [...groups.values()], options, action,
      unlistedChoice: choices.unlisted[i] ?? (anonymous ? "remove" : "add"), inText, drop: choices.drop[i] ?? true
    });
  });

  // The people Apply would add: the names not on the list of a column going to codes, and the words the student chose to add; what is learned: the words answered "Not a name".
  const toAdd: string[] = [];
  const notNames: string[] = [];
  const addName = (name: string) => { if (!toAdd.some((x) => normName(x) === normName(name))) toAdd.push(name); };
  for (const c of cols) {
    if (c.role === "other" || c.role === "roll" || c.action === "remove") continue;
    if (c.action === "code" && c.unlistedChoice === "add" && !c.noAdd) c.unlisted.forEach(addName);
    for (const g of c.maybe) {
      if (g.choice === "add" && !c.noAdd) addName(g.text);
      else if (g.choice === "keep" && g.suggest) notNames.push(g.text);
    }
  }
  const preview = addPeople(list, toAdd.map((name) => ({ name, spellings: [] })), today).added;
  return { cols, adds: preview.map((p) => ({ name: p.name, code: p.code })), notNames };
}

// ---- Apply ------------------------------------------------------------------------------------------------------------------------------------------

/** The table written back, and what was added (with the codes the saved list gave). `same`: nothing in the table changed. `answers`: in how many answers a name was replaced. */
export type PdOutcome = { headers: string[]; rows: string[][]; csv: string; coded: number; removed: number; removedRows: number; added: Array<{ name: string; code: string }>; answers: number; same: boolean };
export type PdPlan = {
  /** The names to add to the list before the table is written (R35). */
  adds: string[];
  notNames: string[];
  /** Writes the table with the codes the saved list holds. Throws when a name that was to be added is not on the list it is given (the caller then changes nothing). */
  finish(saved: ParticipantList): PdOutcome;
};

export function makePlan(input: ViewInput, view: PdView): PdPlan {
  const { data, names } = input;
  const namesAt = new Map(names.map((n) => [n.index, n]));
  return {
    adds: view.adds.map((a) => a.name),
    notNames: view.notNames,
    finish(saved) {
      const m = buildMatcher(toMatchPeople(saved, false));
      const byName = new Map<string, string>();
      for (const p of saved.people) if (!byName.has(normName(p.name))) byName.set(normName(p.name), p.code);
      const byId = new Map(saved.people.map((p) => [p.id, p.code]));
      const owners = ownersOf(saved);
      const codeOfName = (name: string): string => {
        const code = byName.get(normName(name));
        if (code === undefined) throw new Error("not on the list");
        return code;
      };
      const rows = data.rows.map((r) => r.slice());
      let answers = 0;
      const scan: ColumnNames[] = [];
      const plans: ColumnPlan[] = [];
      for (const c of view.cols) {
        if (c.role === "other") {
          plans.push({ index: c.index, action: c.action === "remove" ? "remove" : "keep", inText: "keep", dropRows: false, picks: [] });
          continue;
        }
        const n = namesAt.get(c.index) ?? emptyColumn(c.index);
        const action: ColumnPlan["action"] = c.action === "code" ? "codes" : c.action === "remove" ? "remove" : "keep";
        if (c.role === "roll") {
          scan.push({ ...emptyColumn(c.index), roll: n.roll });
          plans.push({ index: c.index, action, inText: "keep", dropRows: false, picks: [] });
          continue;
        }
        const cellKey = (row: number) => normName(data.rows[row]?.[c.index] ?? "");
        const singleKeys = new Set(c.unlisted.map(normName));
        const multiChoice = new Map(c.multi.map((x) => [x.key, x.choice]));
        const askChoice = new Map(c.ask.map((x) => [x.row, x.choice]));
        const askGone = n.withdrawnAsk.filter((a) => askChoice.get(a.row) === "remove");
        const withdrawn = [...(c.drop ? n.withdrawn : []), ...askGone.map((a) => ({ row: a.row, personId: a.personIds[0]! }))];
        // A row that may be several people stays as typed unless it is removed: it is not coded as the first of them. Nor is a cell that is wholly a name several people have (R36).
        const listed = n.listed.filter((l) => !askChoice.has(l.row) && (owners.get(normName(data.rows[l.row]?.[c.index] ?? ""))?.length ?? 0) < 2);
        const adding = action === "codes" && c.unlistedChoice === "add" && !c.noAdd;
        // The cells that are not on the list and were not added go with the codes when the student says so (R49): nothing is replaced inside them. Only the cells the box named
        // (a name column's): a column the box does not show as names loses no cell this way.
        const shown = c.leftover.cells > 0;
        const leftGone = new Set(action !== "remove" && shown && c.leftover.choice === "remove" ? n.leftover.map((l) => l.row) : []);
        const inText = n.inText.filter((t) => {
          const key = cellKey(t.row);
          if (singleKeys.has(key) || leftGone.has(t.row)) return false;
          const choice = multiChoice.get(key);
          return choice === undefined ? true : choice === "codes" && c.inText === "codes";
        });
        // Cells the student chose to remove are emptied before the table is written.
        if (action !== "remove") {
          data.rows.forEach((_, ri) => {
            const key = cellKey(ri);
            const gone = (singleKeys.has(key) && action === "codes" && c.unlistedChoice === "remove") || multiChoice.get(key) === "remove";
            if (gone) rows[ri]![c.index] = "";
          });
        }
        const picks: ColumnPlan["picks"] = [];
        for (const g of c.maybe) {
          if (g.choice === "name") picks.push({ text: g.text, to: "[name]" });
          else if (g.choice === "add" && !c.noAdd) picks.push({ text: g.text, to: codeOfName(g.text) });
          else if (g.choice !== "" && g.choice !== "keep" && g.choice !== "add") {
            const code = byId.get(g.choice);
            if (code !== undefined) picks.push({ text: g.text, to: code });
          }
        }
        // The answers a name inside was replaced in: not the cells that are swapped whole, nor the rows that go.
        if (action !== "remove") {
          const gone = new Set(withdrawn.map((w) => w.row));
          const whole = new Set<number>(action === "codes" ? [...listed.map((l) => l.row), ...(adding ? data.rows.map((_, ri) => ri).filter((ri) => singleKeys.has(cellKey(ri))) : [])] : []);
          const picked = new Set(picks.map((k) => normName(k.text)));
          for (const t of inText) {
            if (!gone.has(t.row) && !whole.has(t.row) && t.finds.some((f) => picked.has(normName(f.text)) || (f.kind === "sure" && c.inText === "codes"))) answers++;
          }
        }
        scan.push({ index: c.index, listed, unlisted: adding ? c.unlisted : [], withdrawn, withdrawnAsk: [], inText, roll: [], leftover: shown ? n.leftover : [] });
        plans.push({ index: c.index, action, inText: c.inText, dropRows: withdrawn.length > 0, picks, leftover: shown ? c.leftover.choice : "keep" });
      }
      const r = listTransform({ ...data, rows }, scan, plans, m, codeOfName);
      const same = !r.coded && !r.removed && !r.removedRows && r.headers.length === data.headers.length
        && r.rows.every((row, ri) => row.every((v, ci) => v === (data.rows[ri]?.[ci] ?? "")));
      return { headers: r.headers, rows: r.rows, csv: r.csv, coded: r.coded, removed: r.removed, removedRows: r.removedRows, added: view.adds.map((a) => ({ name: a.name, code: codeOfName(a.name) })), answers, same };
    }
  };
}
