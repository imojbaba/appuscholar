import { pdCsv } from "./csv";
import type { ParsedData } from "./intake";
import { findNames, normName, replaceFinds, suggestNames } from "./participants";
import type { Matcher, NameFind } from "./participants";
import { pdScan } from "./pdscan";
import type { PdFound } from "./pdscan";

/*
 * Tables against the participant list (spec 2026-10-24 §8.1, calls C14 and C17), and the fix for fault F1 of the 2026-10-23 walk. New in v2, so there is no v1 text and no golden;
 * pdscan.ts is v1's and is only called here, never changed. The web's Statistics box reads these three functions:
 * - pdScanV2: v1's pdScan, except that a column v1 flags as names only by the shape of its values is not flagged when any value has more than four words. A person's name is not
 *   five words long; open answers ("Priya said she liked it in the second week...") are, and v1 would have offered to replace each of them with a code (F1). The column then goes on
 *   to v1's long-text rule (first value not a number, mean length above 40 or a value above 120: freeText). A column found by its heading is not touched: the heading is the student's word.
 *   With no such column the result is v1's own object.
 * - listTableScan: per column, which cells are people on the list (a cell that is wholly a listed name or spelling, in any case and spacing, by normName), which values of a name column are
 *   not on the list, which rows belong to a person who withdrew and asked for their data to be removed (`withdrawn`: a cell that is their name, a spelling or their code), which rows might
 *   (`withdrawnAsk`: a spelling shared by people of whom some withdrew with remove and some did not, so the cell is asked about, not removed), which cells hold a name inside an answer
 *   (findNames, plus suggestNames for the first names when asked), and which cells are a roll number of a listed person. Only columns with something to report are in the result; each
 *   says which column it is by `index`.
 *   A name column is one the caller names (the heading rule) or one with at least one cell that is wholly a listed name. A spelling that the matcher would only ask about (shared by two
 *   people, one letter, or marked everyday) is a name cell in a name column only; elsewhere the cell is searched like any answer, so a lone "Will" among open answers is an ask find and
 *   does not turn the column into names (F1 again). In a name column, a value that is not on the list is one name, "unlisted" (distinct, first seen), unless it is not shaped like a name:
 *   more than four words, no letter in it (a number, a dash), or a placeholder (NA, N/A, nil, none); those are never unlisted, so one exact-name answer cannot turn a comments column into
 *   new participants. Those values, and any other value with a letter in it that is neither on the list, nor a name to add, nor a code, are the column's `leftover` (R49): reported, never
 *   added as people (R11), and emptied by listTransform when the plan says `leftover: "remove"`. Every cell that is not wholly a name is also searched for names inside it (inText). A name column's value whose sure finds name exactly one person is that person's
 *   cell (listed, and withdrawn if they withdrew with remove), not a new name, so "Dr. Priya Sharma" is never added beside P001. A cell that is a person's code is already a code: it is
 *   neither listed nor unlisted (but it still marks the row of a withdrawn person). A cell that is only a number is not searched. Cells are the table's own, not trimmed again: finds are
 *   positions in the cell as it is.
 * - listTransform: writes the table back with the student's choices per column. `codes` puts each person's code (from the list) in place of a listed or roll cell and what `add` returns
 *   in place of an unlisted value (the caller allocates the code and puts the person on the list; one call per distinct name, in column order and then row order, among the rows kept);
 *   `remove` drops the column; `keep` leaves it; `codes` on a column the scan has nothing about is `keep`. `dropRows` drops the rows in that column's `withdrawn` (the union over every
 *   column that asks; `withdrawnAsk` rows are never dropped here), whether or not the column itself stays. `leftover: "remove"` empties the column's leftover cells (they would otherwise
 *   stay in the table as they are, under the coded header); a plan with no `leftover` keeps them.
 *   Names inside cells: with `inText: "codes"` a sure find becomes its person's code; a pick (the student's answer for an ask or suggest find, by the normal form of the find's text)
 *   replaces every find with that text in the column; a find with no answer is left as it is. Header of the first coded column is `ParticipantCode`, later ones `ParticipantCode 2`,
 *   `ParticipantCode 3`, skipping any name that a column left in the table already has; each stays where its column was. The CSV is v1's pdCsv.
 */

const wordCount = (v: string) => (v.match(/\S+/g) ?? []).length;

/** v1's pdScan, except that a column flagged as names only by its values is not flagged when a value has more than four words (F1); it goes on to the long-text rule instead. */
export function pdScanV2(data: ParsedData): { found: PdFound[]; freeText: string[] } {
  const v1 = pdScan(data);
  const open = new Set(v1.found.filter((f) => f.kind === "name" && f.why === "values" && data.rows.some((r) => wordCount(r[f.index] ?? "") > 4)).map((f) => f.index));
  if (!open.size) return v1;
  const found = v1.found.filter((f) => !open.has(f.index));
  const flagged = new Set(found.map((f) => f.index));
  // v1's long-text rule (pdscan.ts), for every column that is not flagged, in column order: the dropped columns join the ones v1 already listed.
  const freeText: string[] = [];
  data.headers.forEach((h, i) => {
    if (flagged.has(i)) return;
    const vals = data.rows.map((r) => (r[i] || "").trim()).filter((v) => v !== "");
    if (!vals.length || /^-?\d+(\.\d+)?$/.test(vals[0]!)) return;
    const mean = vals.reduce((a, v) => a + v.length, 0) / vals.length;
    if (mean > 40 || vals.some((v) => v.length > 120)) freeText.push(h || "Col" + (i + 1));
  });
  return { found, freeText };
}

/** What the list says about one column of a table (see the file's note). Rows are positions in `data.rows`. */
export type ColumnNames = {
  index: number;
  /** Cells that are wholly a listed name or spelling, with the person (the first on the list when two share the spelling). */
  listed: Array<{ row: number; personId: string }>;
  /** In a name column, the values that are not on the list: distinct (by normal form), first seen, as written the first time. Never an answer of more than four words, a number or a placeholder. */
  unlisted: string[];
  /** Rows of a person who withdrew with `data: "remove"`: a cell that is their name, a spelling (shared only with others who withdrew with remove, then the first of them), or their code. */
  withdrawn: Array<{ row: number; personId: string }>;
  /** Rows whose cell is a spelling shared by several people, at least one of whom withdrew with remove and not all: asked about, not removed. `personIds` are all who share it. */
  withdrawnAsk: Array<{ row: number; personIds: string[] }>;
  /** Cells that hold a name inside an answer: the sure and ask finds of the list, and the suggestions when asked for, in text order. */
  inText: Array<{ row: number; finds: NameFind[] }>;
  /** Cells that are the roll number of a listed person. */
  roll: Array<{ row: number; personId: string }>;
  /**
   * In a name column, the cells (not the distinct values) with a letter in them that are not on the list and not a name to add either: an answer of more than four words (R11), as written
   * (trimmed). Not a code, a roll number, a placeholder or a number. They are never added as people; the student keeps them or removes them (ColumnPlan.leftover).
   */
  leftover: Array<{ row: number; value: string }>;
};

/** The student's choice for one column. `picks` answer the column's ask and suggest finds by the normal form of the find's text; `to` is a person's code or "[name]". */
export type ColumnPlan = {
  index: number;
  action: "codes" | "remove" | "keep";
  inText: "codes" | "keep";
  dropRows: boolean;
  picks: Array<{ text: string; to: string }>;
  /** What to do with the column's leftover cells: "remove" empties them; "keep" or nothing leaves them as they are. */
  leftover?: "remove" | "keep";
};

/** A spelling that is one letter, with its marks (as participants.ts counts it). */
const ONE_LETTER = /^\p{L}\p{M}*$/u;
/** v1's test for a number (intake.ts, pdscan.ts). */
const NUMBER = /^-?\d+(\.\d+)?$/;
/** What a table says when it has no answer. */
const PLACEHOLDER = /^(na|n\/a|nil|none)$/i;
/** Whether a value could be a person's name: a letter in it, not a placeholder, and not more than four words (a longer value is an answer, F1). */
const shapedLikeAName = (v: string) => /\p{L}/u.test(v) && !PLACEHOLDER.test(v) && wordCount(v) <= 4;

/** The people who have a spelling, in list order. `ambiguous`: the matcher only asks about it in text (shared, one letter, or marked everyday), so a cell of it is a name only in a name column. */
type Spoken = { personIds: string[]; ambiguous: boolean };

/** Every name and spelling the matcher looks for, in normal form, with the people who have it; the codes of the people; the people who asked to be removed. */
function indexPeople(m: Matcher) {
  const names = new Map<string, Spoken>();
  const codes = new Map<string, string>();
  const removed = new Set<string>();
  for (const p of m.people) {
    const everyday = new Set(p.everyday.map(normName));
    for (const key of new Set([p.name, ...p.spellings].map(normName))) {
      if (!/\p{L}/u.test(key)) continue; // the matcher does not look for a spelling with no letter in it
      const had = names.get(key);
      if (!had) names.set(key, { personIds: [p.id], ambiguous: everyday.has(key) || ONE_LETTER.test(key) });
      else {
        had.personIds.push(p.id);
        had.ambiguous = true; // shared by two people: asked about in text
      }
    }
    codes.set(normName(p.code), p.id);
    if (p.withdrawn?.data === "remove") removed.add(p.id);
  }
  return { names, codes, removed };
}

/**
 * Which cells of each column are people on the list, names that are not, rows of people who withdrew, names inside answers and roll numbers (see the file's note). `rolls` maps a roll
 * number in normal form to a person's id; `nameColumns` are the columns the caller already knows hold names (the heading rule); `suggest` adds the common first names as suggestions
 * inside answers; `notNames` are the words the student said are not names.
 */
export function listTableScan(
  data: ParsedData,
  m: Matcher,
  opts: { rolls: Map<string, string>; nameColumns: number[]; suggest: boolean; notNames: string[] },
): ColumnNames[] {
  const { names, codes, removed } = indexPeople(m);
  const named = new Set(opts.nameColumns);
  const out: ColumnNames[] = [];
  data.headers.forEach((_, index) => {
    const cells = data.rows.map((r) => r[index] ?? "");
    // Only a spelling the matcher would not ask about counts as "a listed value" for finding a name column (F1: one lone "Will" among open answers must not make them all names).
    const isName = named.has(index) || cells.some((c) => names.get(normName(c))?.ambiguous === false);
    const col: ColumnNames = { index, listed: [], unlisted: [], withdrawn: [], withdrawnAsk: [], inText: [], roll: [], leftover: [] };
    const seen = new Set<string>();
    /** A cell that is these people's: removed when all of them withdrew with remove, asked about when only some did. */
    const withdraw = (row: number, ids: string[]) => {
      const gone = ids.filter((id) => removed.has(id));
      if (!gone.length) return;
      if (gone.length === ids.length) col.withdrawn.push({ row, personId: gone[0]! });
      else col.withdrawnAsk.push({ row, personIds: [...ids] });
    };
    cells.forEach((cell, row) => {
      const value = cell.trim();
      if (!value) return;
      const key = normName(value);
      const hit = names.get(key);
      if (hit && (isName || !hit.ambiguous)) {
        col.listed.push({ row, personId: hit.personIds[0]! });
        withdraw(row, hit.personIds);
        return;
      }
      const owner = codes.get(key);
      if (owner !== undefined) {
        withdraw(row, [owner]);
        return;
      }
      const roll = opts.rolls.get(key);
      if (roll !== undefined) {
        col.roll.push({ row, personId: roll });
        return;
      }
      if (NUMBER.test(value)) return;
      const finds = [...findNames(cell, m), ...suggestNames(cell, m, opts.notNames, { speakerLabels: false, firstNames: opts.suggest })].sort((a, b) => a.start - b.start);
      if (finds.length) col.inText.push({ row, finds });
      if (!isName) return;
      if (!shapedLikeAName(value)) {
        // Not one person's name (R11), so not added; but it is in a name column and will sit under the coded header unless the student says otherwise (R49). A number or a placeholder is not worth a word.
        if (/\p{L}/u.test(value) && !PLACEHOLDER.test(value)) col.leftover.push({ row, value });
        return;
      }
      // A value of a name column that holds exactly one person's name is that person's cell; otherwise it is a name that is not on the list.
      const sure = new Set(finds.filter((f) => f.kind === "sure").flatMap((f) => f.personIds));
      if (sure.size === 1) {
        const [id] = sure;
        col.listed.push({ row, personId: id! });
        withdraw(row, [id!]);
      } else if (!seen.has(key)) {
        seen.add(key);
        col.unlisted.push(value);
      }
    });
    if (col.listed.length || col.unlisted.length || col.withdrawn.length || col.withdrawnAsk.length || col.inText.length || col.roll.length || col.leftover.length) out.push(col);
  });
  return out;
}

/**
 * The table written back with the student's choices (see the file's note). `scan` is listTableScan's result for the same `data`; a column with no plan is left as it is. `add` is called
 * with an unlisted name (as scanned) and returns the code of the person it put on the list; it is called once for each distinct name, and the names are returned in `added` in that order.
 */
export function listTransform(
  data: ParsedData,
  scan: ColumnNames[],
  plans: ColumnPlan[],
  m: Matcher,
  add: (name: string) => string,
): { headers: string[]; rows: string[][]; csv: string; coded: number; removed: number; removedRows: number; added: string[] } {
  const planAt = new Map(plans.map((p) => [p.index, p]));
  const scanAt = new Map(scan.map((s) => [s.index, s]));
  const codeOfId = new Map(m.people.map((p) => [p.id, p.code]));
  const dropped = new Set<number>();
  for (const p of plans) if (p.dropRows) for (const w of scanAt.get(p.index)?.withdrawn ?? []) dropped.add(w.row);
  // `codes` on a column the scan has nothing about has nothing to code: it stays as it is, header and all.
  const actionAt = (ci: number) => {
    const a = planAt.get(ci)?.action;
    return a === "codes" && !scanAt.has(ci) ? "keep" : a;
  };
  const keepRows = data.rows.map((_, i) => i).filter((i) => !dropped.has(i));
  const keepCols = data.headers.map((_, i) => i).filter((i) => actionAt(i) !== "remove");
  const added: string[] = [];
  const addedCode = new Map<string, string>();
  let coded = 0;
  let numbered = 0;
  const taken = new Set(keepCols.filter((ci) => actionAt(ci) !== "codes").map((ci) => (data.headers[ci] ?? "").trim().toLowerCase()));
  const headers = keepCols.map((ci) => {
    if (actionAt(ci) !== "codes") return data.headers[ci] ?? "";
    coded++;
    let h: string;
    do h = ++numbered === 1 ? "ParticipantCode" : `ParticipantCode ${numbered}`;
    while (taken.has(h.toLowerCase()));
    taken.add(h.toLowerCase());
    return h;
  });
  // Column by column, so the names are added in the order the scan reports them, and only for the rows that are kept.
  const columns = keepCols.map((ci) => {
    const cellAt = (ri: number) => data.rows[ri]?.[ci] ?? "";
    const p = planAt.get(ci);
    const s = scanAt.get(ci);
    if (!p || !s) return keepRows.map(cellAt);
    const people = new Map([...s.listed, ...s.roll].map((l) => [l.row, l.personId]));
    const unlisted = new Map(s.unlisted.map((u) => [normName(u), u]));
    const inText = new Map(s.inText.map((t) => [t.row, t.finds]));
    const picks = new Map(p.picks.map((k) => [normName(k.text), k.to]));
    const leftover = new Set(p.leftover === "remove" ? s.leftover.map((l) => l.row) : []);
    return keepRows.map((ri) => {
      if (leftover.has(ri)) return "";
      const cell = cellAt(ri);
      if (p.action === "codes") {
        const code = codeOfId.get(people.get(ri) ?? "");
        if (code !== undefined) return code;
        const key = normName(cell);
        const name = unlisted.get(key);
        if (name !== undefined) {
          let made = addedCode.get(key);
          if (made === undefined) {
            made = add(name);
            addedCode.set(key, made);
            added.push(name);
          }
          return made;
        }
      }
      const finds = inText.get(ri);
      if (!finds) return cell;
      return replaceFinds(cell, finds, (f) => picks.get(normName(f.text)) ?? (f.kind === "sure" && p.inText === "codes" ? (codeOfId.get(f.personIds[0] ?? "") ?? null) : null));
    });
  });
  const rows = keepRows.map((_, k) => columns.map((c) => c[k] ?? ""));
  const removed = data.headers.filter((_, i) => actionAt(i) === "remove").length;
  return { headers, rows, csv: pdCsv(headers, rows), coded, removed, removedRows: data.rows.length - keepRows.length, added };
}
