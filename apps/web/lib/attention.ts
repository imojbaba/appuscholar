import { apSquash, citKey, citKind, citLastName, citNames, retrNormDoi, retrValidDoi, type RcCheck } from "@appuscholar/core";
import type { ApNotes, RefCheckCache, RetractionCache, StoredEntry } from "@/lib/blobs/kinds";
import { rcCurrent } from "@/lib/cite/checks";
import { paperMatch } from "@/lib/papers/ids";
import { paperShort } from "@/lib/papers/list";

/*
 * "Needs your attention" (wave B Task 24; register row D-S2-130): what is wrong with the project's sources, in one list the project home, the Citations tab and the Reading list all
 * show, each item with its fix. v1 reported the same facts in toasts and in a line on each card of the Citation Manager; here the list is worked out from the stored data
 * (the library, the Crossref check's answers, the retraction answers), so a problem stays on screen until it is fixed, and a fix made in one place clears it in the others.
 * This module is the list and its words; the fixes are lib/useAttention.ts.
 */

type T = (key: string, vars?: Record<string, string | number>) => string;
type Vars = Record<string, string | number>;

export type AttentionKind = "retracted" | "no-authors" | "crossref-differs" | "not-found" | "missing-fields" | "duplicate" | "unchecked" | "numbers";
/** What the button of an item does. "open-numbers" is Task 30's (the number check): no item has it yet, and its button has no words until then. */
export type AttentionFix = "crossref" | "keep-mine" | "merge" | "check" | "open-numbers";

/**
 * One thing that needs attention. `pids` are the papers it is about (an item about one paper has one; a duplicate has the older paper first; "unchecked" and "missing fields" are about
 * several). Its sentence is `t(key, vars)`. `vars.field`, on a difference, is the field's kind ("title", "year" or "author"), which is also what Keep mine stores in the entry's `ack`.
 * `row` is how one paper of an item about several reads on that paper's own row (the Citations tab and the Reading list), with that paper's own words.
 */
export type AttentionItem = {
  id: string;
  kind: AttentionKind;
  pids: string[];
  key: string;
  vars: Vars;
  fix: AttentionFix | null;
  row?: Record<string, { key: string; vars: Vars }>;
};

/** The home lists this many and links to the rest in Citations. */
export const HOME_LIMIT = 5;
/** Longest piece of a title Crossref holds that a sentence quotes. */
const VALUE_MAX = 80;
/** Surnames named in "Crossref lists ..."; the rest are counted. */
const NAMES_MAX = 4;

const FIELD_WORD = { volume: "cite_vol_label", issue: "cite_issue_label", pages: "cite_pages_label" } as const;
type Field = keyof typeof FIELD_WORD;
const FIELDS: readonly Field[] = ["volume", "issue", "pages"];

const cut = (s: string, max: number): string => (s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s);

/** "a", "a and b", "a, b and c": the words joined as the dictionary's "and" joins them. */
function joinAnd(words: string[], t: T): string {
  return words.length <= 1 ? words[0] ?? "" : t("attn_and", { a: words.slice(0, -1).join(", "), b: words[words.length - 1]! });
}
/** The surnames Crossref lists for a source with no authors: four at most, then "and 2 more". */
function crossrefNames(authors: string, t: T): string {
  const last = citNames(authors).map((n) => n.last).filter(Boolean);
  return last.length > NAMES_MAX ? t("attn_names_more", { names: last.slice(0, NAMES_MAX).join(", "), n: last.length - NAMES_MAX }) : joinAnd(last, t);
}
/** The names of the fields a journal article is missing, lower case, as a list. */
const fieldWords = (fields: readonly Field[], t: T): string => joinAnd(fields.map((f) => t(FIELD_WORD[f]).toLowerCase()), t);

/**
 * What "Keep {mine}" keeps: the year as the source has it, the surname of its first author, and for a title the words "my title" (a title is too long for a button).
 */
export function mineOf(e: StoredEntry, field: string, t: T): string {
  if (field === "year") return (e.year ?? "").trim();
  if (field === "author") return citLastName(e.author);
  return t("attn_mine_title");
}

/** What Crossref holds, as the sentence quotes it: a long title is cut. */
const valueOf = (m: NonNullable<RcCheck["m"]>[number]): string => (m.k === "title" ? cut(m.v, VALUE_MAX) : m.v);

/**
 * The attention list, in the plan's order: retracted, no authors, differs from Crossref, not found, missing fields, duplicates, not checked yet (and Task 30's numbers, later). Within
 * a kind the sources come in library order.
 * - `refcheck` is the Crossref check's answers by citKey, read as they stand now (rcCurrent: a field filled since the check, or a difference the student kept, is no longer one); null
 *   when they have not been read, which leaves out every item that needs them (a cache that is not known must not read as "nothing is checked").
 * - A source with no pid yet (the paper-id migration has not reached it) is left out: an item is about a paper, found again by its pid. Any save gives it one.
 * - A difference in the author of a source that has none is the "no authors" item's; a field Crossref has and a book lacks is not a journal article's missing field.
 * - `notes` is Task 30's (the stored number checks); nothing reads it yet.
 */
export function attentionItems(i: { lib: StoredEntry[]; refcheck: RefCheckCache | null; retraction: RetractionCache | null; notes: ApNotes | null; t: T }): AttentionItem[] {
  const { refcheck, retraction, t } = i;
  const lib = i.lib.filter((e): e is StoredEntry & { pid: string } => !!e.pid);
  const short = (e: StoredEntry & { pid: string }) => paperShort({ pid: e.pid, entry: e, shelf: null, note: null }, t);
  const answer = (e: StoredEntry) => (refcheck ? rcCurrent(e, refcheck[citKey(e)]) : undefined);
  const noAuthor = (e: StoredEntry) => !(e.author ?? "").trim();
  const out: AttentionItem[] = [];

  for (const e of lib) {
    const doi = retrNormDoi(e.doi ?? "");
    if (retrValidDoi(doi) && retraction?.[doi]?.r) out.push({ id: "retracted:" + e.pid, kind: "retracted", pids: [e.pid], key: "attn_retracted", vars: { short: short(e) }, fix: null });
  }

  for (const e of lib) {
    if (!noAuthor(e)) continue;
    const c = answer(e);
    const names = c && c.s === "diff" && c.miss?.includes("author") && c.f?.authors ? crossrefNames(c.f.authors, t) : "";
    out.push(names
      ? { id: "no-authors:" + e.pid, kind: "no-authors", pids: [e.pid], key: "attn_noauthors_crossref", vars: { short: short(e), names }, fix: "crossref" }
      : { id: "no-authors:" + e.pid, kind: "no-authors", pids: [e.pid], key: "attn_noauthors", vars: { short: short(e) }, fix: null });
  }

  for (const e of lib) {
    const c = answer(e);
    if (!c || c.s !== "diff") continue;
    for (const m of c.m ?? []) {
      if (m.k === "author" && noAuthor(e)) continue;
      out.push({
        id: `crossref-differs:${e.pid}:${m.k}`, kind: "crossref-differs", pids: [e.pid], key: "attn_differs_" + m.k,
        vars: { short: short(e), field: m.k, value: valueOf(m), mine: mineOf(e, m.k, t) }, fix: "keep-mine"
      });
    }
  }

  for (const e of lib) {
    if (answer(e)?.s === "nf") out.push({ id: "not-found:" + e.pid, kind: "not-found", pids: [e.pid], key: "attn_not_found", vars: { short: short(e) }, fix: null });
  }

  const gaps = lib.flatMap((e) => {
    const c = citKind(e.type) === "journal" ? answer(e) : undefined;
    const miss = c && c.s === "diff" ? FIELDS.filter((f) => c.miss?.includes(f)) : [];
    return miss.length ? [{ e, miss }] : [];
  });
  if (gaps.length) {
    const all = FIELDS.filter((f) => gaps.some((g) => g.miss.includes(f)));
    out.push({
      id: "missing-fields", kind: "missing-fields", pids: gaps.map((g) => g.e.pid), key: gaps.length === 1 ? "attn_missing_one" : "attn_missing",
      vars: { fields: fieldWords(all, t), n: gaps.length }, fix: "crossref",
      row: Object.fromEntries(gaps.map((g) => [g.e.pid, { key: "attn_missing_row", vars: { short: short(g.e), fields: fieldWords(g.miss, t) } }]))
    });
  }

  // Each source that is the same paper as an earlier one (paperMatch) is paired with the first earlier source that is not itself a copy: the older pid is the one that stays. The earlier
  // sources are indexed by DOI and by squashed title, so only those that could match are compared (a library of thousands is not compared pair by pair).
  const byDoi = new Map<string, Array<StoredEntry & { pid: string }>>();
  const byTitle = new Map<string, Array<StoredEntry & { pid: string }>>();
  const add = (m: Map<string, Array<StoredEntry & { pid: string }>>, k: string, e: StoredEntry & { pid: string }) => { if (k) m.set(k, [...(m.get(k) ?? []), e]); };
  const titleKey = (e: StoredEntry) => { const k = apSquash(e.title ?? ""); return k.length >= 20 ? k : ""; };
  const order = new Map(lib.map((e, n) => [e, n]));
  for (const e of lib) {
    const doi = retrNormDoi(e.doi ?? "");
    const near = [...(doi ? byDoi.get(doi) ?? [] : []), ...(titleKey(e) ? byTitle.get(titleKey(e)) ?? [] : [])].filter((x) => paperMatch(x, e));
    const twin = near.reduce<(StoredEntry & { pid: string }) | undefined>((a, x) => (a === undefined || order.get(x)! < order.get(a)! ? x : a), undefined);
    if (twin) { out.push({ id: `duplicate:${twin.pid}+${e.pid}`, kind: "duplicate", pids: [twin.pid, e.pid], key: "attn_duplicate", vars: { short: short(twin) }, fix: "merge" }); continue; }
    add(byDoi, doi, e);
    add(byTitle, titleKey(e), e);
  }

  if (refcheck) {
    const loose = lib.filter((e) => { const c = refcheck[citKey(e)]; return !c || c.s === "err"; });
    if (loose.length) out.push({ id: "unchecked", kind: "unchecked", pids: loose.map((e) => e.pid), key: loose.length === 1 ? "attn_unchecked_one" : "attn_unchecked", vars: { n: loose.length }, fix: "check" });
  }
  return out;
}

/** An item's sentence; with `pid`, the words it has on that paper's own row where it has some. */
export function attentionText(item: AttentionItem, t: T, pid?: string): string {
  const row = pid ? item.row?.[pid] : undefined;
  return row ? t(row.key, row.vars) : t(item.key, item.vars);
}

/**
 * An item's button, or null when it has none (it has no fix, or its fix is Task 30's). The fill for the list-wide "missing fields" says it goes one source at a time, unless it is the
 * row of one paper (or the item is about one paper).
 */
export function fixLabel(item: AttentionItem, t: T, pid?: string): string | null {
  switch (item.fix) {
    case "crossref": return item.kind === "missing-fields" && !pid && item.pids.length > 1 ? t("attn_fix_each") : t("attn_fix_crossref");
    case "keep-mine": return t("attn_fix_keep", { mine: item.vars.mine ?? "" });
    case "merge": return t("attn_fix_merge");
    case "check": return t("attn_fix_check");
    default: return null;
  }
}

/**
 * The items a paper's own row shows (the Citations tab, the Reading list): the ones that name the paper. "Not checked yet" is not among them: it is about the list, and the row's
 * status already says it.
 */
export function itemsForPaper(items: AttentionItem[], pid: string): AttentionItem[] {
  return pid ? items.filter((x) => x.kind !== "unchecked" && x.pids.includes(pid)) : [];
}

/** The entries with the field's kind added to the `ack` of the paper `pid`: the difference is kept for good. The same array when it was kept already or there is no such paper. */
export function ackField(lib: StoredEntry[], pid: string, field: string): StoredEntry[] {
  const at = lib.find((e) => e.pid === pid);
  if (!at || (at.ack ?? []).includes(field)) return lib;
  return lib.map((e) => (e === at ? { ...e, ack: [...(e.ack ?? []), field] } : e));
}
