import { apSquash, retrNormDoi, type CitationEntry } from "@appuscholar/core";
import type { ApNote, ApNotes, ShelfIndex, StoredEntry } from "@/lib/blobs/kinds";

/*
 * One stable id for every kept paper (wave B, Task 17; register row D-S2-122). v1 knew a source by its position and title, a reading-list paper by a random id and
 * a note by its title plus its length; from here each kept paper has a `pid` that the library entry, the reading-list entry, the notes (kept under `p:<pid>`), the
 * cards and Compare all carry. The pid is generated, never the DOI, so a DOI filled in later changes nothing; the DOI is only used to find the same paper.
 */

const CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

/** "k", the time in base 36 and four characters of [a-z0-9]: fits the reading-list id pattern [A-Za-z0-9_-]{1,64}, and never collides with a shelf id (those begin with p). */
export function newPid(): string {
  let tail = "";
  for (let i = 0; i < 4; i++) tail += CHARS[Math.floor(Math.random() * CHARS.length)];
  return "k" + Date.now().toString(36) + tail;
}

/** A pid not in `used`, added to it: a few hundred made in one millisecond differ only in their four characters, so a clash is retried. */
function mint(used: Set<string>): string {
  let pid = newPid();
  while (used.has(pid)) pid = newPid();
  used.add(pid);
  return pid;
}

/** The same array when every entry has a pid; otherwise a copy in which each entry without one has its own. An entry that has one is the same object. */
export function withPids<T extends StoredEntry>(lib: T[]): T[] {
  if (lib.every((e) => !!e.pid)) return lib;
  const used = new Set(lib.flatMap((e) => (e.pid ? [e.pid] : [])));
  return lib.map((e) => (e.pid ? e : { ...e, pid: mint(used) }));
}

type Matchable = { doi?: string; title?: string; year?: string };

/**
 * Whether two records are one paper. With a DOI on both sides the DOIs decide (retrNormDoi: no URL, lower case), and nothing else is looked at. Otherwise the squashed
 * titles (apSquash) are equal and at least 20 characters long, and the years agree when both have one.
 */
export function paperMatch(a: Matchable, b: Matchable): boolean {
  const da = retrNormDoi(a.doi ?? ""), db = retrNormDoi(b.doi ?? "");
  if (da && db) return da === db;
  const ta = apSquash(a.title ?? "");
  if (ta.length < 20 || ta !== apSquash(b.title ?? "")) return false;
  const ya = (a.year ?? "").trim(), yb = (b.year ?? "").trim();
  return !ya || !yb || ya === yb;
}

/**
 * Gives each reading-list entry without a pid the pid of the library entry that is the same paper (the DOI printed on its first page first, then its title), else a
 * new one. An entry that has a pid keeps it. The same array when none lacks one. A library entry without a pid is never matched.
 */
export function linkShelf(index: ShelfIndex, lib: StoredEntry[]): ShelfIndex {
  if (index.every((e) => !!e.pid)) return index;
  const held = lib.filter((e) => !!e.pid);
  const used = new Set([...index, ...held].flatMap((e) => (e.pid ? [e.pid] : [])));
  return index.map((e) => {
    if (e.pid) return e;
    const doi = retrNormDoi(e.doi ?? "");
    const hit = (doi ? held.find((l) => retrNormDoi(l.doi ?? "") === doi) : undefined) ?? held.find((l) => paperMatch(e, l));
    return { ...e, pid: hit?.pid ?? mint(used) };
  });
}

/** The key a paper's note is kept under. */
export const noteKey = (pid: string): string => "p:" + pid;

/** The pid a note belongs to: the one it carries, else the one in its key `p:<pid>`; none for an old `a...` note that has not moved. */
export function pidOfNote(key: string, note: ApNote): string | undefined {
  return note.pid ?? (key.startsWith("p:") ? key.slice(2) : undefined);
}

const filled = (v: unknown): boolean => typeof v === "string" && v.trim() !== "";

/** Whether a note holds any of the student's work or an AI reading: a stage's words or reading, or a card field. */
export function noteHasWork(n: ApNote): boolean {
  return Object.values(n.stages).some((s) => filled(s.mine) || s.res !== undefined) || noteHasCard(n);
}
/** Whether a note has any card field filled in. */
export const noteHasCard = (n: ApNote): boolean => Object.values(n.card).some(filled);

/**
 * The distinct filled texts of one field across the notes of one paper, in note order, joined with a blank line between (ruling B2-R31): the same text twice is one. A single
 * text comes back exactly as it is; undefined when none is filled.
 */
function joinDistinct(values: unknown[]): string | undefined {
  const seen = new Set<string>();
  const texts: string[] = [];
  for (const v of values) {
    if (!filled(v)) continue;
    const text = (v as string).trim();
    if (!seen.has(text)) { seen.add(text); texts.push(v as string); }
  }
  return texts.length <= 1 ? texts[0] : texts.map((x) => x.trim()).join("\n\n");
}

/**
 * One merged note from the notes of one paper, in order (ruling B2-R31: nothing the student wrote leaves the view): per stage, the student's words of every note that has some,
 * each distinct text once, in note order with a blank line between; the AI reading and the rest of the stage are those of the first note with words, else the first note that
 * has the stage. Per card field, every distinct filled value the same way; a field no note has filled keeps the first note's value.
 */
function mergeNotes(notes: ApNote[]): Pick<ApNote, "stages" | "card"> {
  const stages: ApNote["stages"] = {};
  for (const k of new Set(notes.flatMap((n) => Object.keys(n.stages)))) {
    const have = notes.filter((n) => n.stages[k] !== undefined);
    const base = (have.find((n) => filled(n.stages[k]!.mine)) ?? have[0]!).stages[k]!;
    const mine = joinDistinct(have.map((n) => n.stages[k]!.mine));
    stages[k] = mine !== undefined && mine !== base.mine ? { ...base, mine } : base;
  }
  const card: ApNote["card"] = {};
  for (const k of new Set(notes.flatMap((n) => Object.keys(n.card)))) {
    const have = notes.filter((n) => n.card[k] !== undefined);
    card[k] = joinDistinct(have.map((n) => n.card[k])) ?? have[0]!.card[k];
  }
  return { stages, card };
}

/**
 * Moves each old note ('a' + the squashed title + the characters read) to `p:<pid>` of the paper whose title it has (apSquash equal). A title that two different pids
 * share is left alone, and so is a note with no title. The notes of one paper are merged with a note already kept under its `p:<pid>` first (mergeNotes: the distinct texts of
 * the student, joined); the old keys stay, whole, with `movedTo`, so nothing is lost and a build that does not know the move still reads them. A note that already moved is not
 * touched again, whatever a tab on the previous build writes to its old key afterwards (that stays on the old key: copying it on would bring back text the student cleared), so a
 * second run changes nothing and gives back the same object. `papers` may name a paper twice (the library and the reading list), and in different words.
 */
export function rekeyNotes(notes: ApNotes, papers: Array<{ pid: string; title: string }>): ApNotes {
  const byTitle = new Map<string, string | null>();
  const titleOf = new Map<string, string>();
  for (const p of papers) {
    if (!titleOf.has(p.pid)) titleOf.set(p.pid, p.title);
    const k = apSquash(p.title);
    if (!k) continue;
    const cur = byTitle.get(k);
    byTitle.set(k, cur === undefined || cur === p.pid ? p.pid : null);
  }
  const moving = new Map<string, string[]>();
  for (const [key, n] of Object.entries(notes)) {
    if (n.movedTo !== undefined || !key.startsWith("a") || n.title === undefined) continue;
    const pid = byTitle.get(apSquash(n.title));
    if (pid) moving.set(pid, [...(moving.get(pid) ?? []), key]);
  }
  let out = notes;
  for (const [pid, keys] of moving) {
    if (out === notes) out = { ...notes };
    const target = noteKey(pid);
    const kept = notes[target];
    const merged = mergeNotes([...(kept ? [kept] : []), ...keys.map((k) => notes[k]!)]);
    out[target] = { ...(kept ?? {}), ...merged, title: kept?.title ?? titleOf.get(pid) ?? notes[keys[0]!]!.title, pid };
    for (const k of keys) out[k] = { ...notes[k]!, movedTo: target };
  }
  return out;
}

/**
 * Copies a reading-list paper's matrix cells to its note, where the note has none (`{}` counts as having them, so a paper whose cells were empty is not read again). A paper
 * with no note gets one with empty stages and card (an `ap_notes` note without them breaks the whole blob). The shelf's copy is not touched. The same object when nothing is added.
 */
export function cellsToNotes(notes: ApNotes, papers: Array<{ pid: string; title: string; cells: Record<string, string> }>): ApNotes {
  let out = notes;
  for (const p of papers) {
    const key = noteKey(p.pid);
    const cur = out[key];
    if (cur?.cells !== undefined) continue;
    if (out === notes) out = { ...notes };
    out[key] = cur ? { ...cur, cells: { ...p.cells } } : { stages: {}, card: {}, title: p.title, pid: p.pid, cells: { ...p.cells } };
  }
  return out;
}

/** The library as the class-share file holds it (ruling B2-R13): v1's fields only, without the fields of wave B. */
export function forLibraryFile(lib: StoredEntry[]): CitationEntry[] {
  return lib.map((e) => {
    const { pid: _pid, rl: _rl, abstract: _abstract, oa: _oa, ack: _ack, ft: _ft, pmcid: _pmcid, ...rest } = e;
    return rest;
  });
}
