import { normName, scanText, type ParsedData, type PdKind } from "@appuscholar/core";
import type { ParticipantList } from "@/lib/blobs/kinds/participants";
import type { PdScanResult } from "./lab";

/*
 * The personal-data step "Explain in plain language" adds in front of callAI's own (rule 2, Review Focus 2). callAI scans the request with core's scanText, which finds
 * e-mail addresses, phone numbers and ID numbers and nothing else, so a participant's NAME used as a group label would go out unscanned. The lab already holds the
 * column scan of the table (core's pdScan: names, roll numbers, dates of birth, addresses ...), so the request is checked against it: a value of a flagged column that
 * is written in the tables' text or the sentence is a personal detail in the request. The student then chooses mask, send as it is, or cancel (the same dialog, lib/ai/pdDialog).
 * What scanText finds is left to callAI's own dialog, so nobody is asked twice about an e-mail address. (Register row D-S2-70.)
 *
 * With the participant list open, a flagged value that is a listed person's name or spelling is masked as that person's code (their made-up name in made-up names mode) instead of "[name 1]",
 * so the AI's answer still reads against the study's codes (spec 2026-10-24-participants-design.md §8.3). The other flagged values are masked as before. (Asking only once about a name across this
 * step and callAI's own scan is callAI's: Task 11.)
 */

export type Flagged = { kind: PdKind; value: string };

/** The words the dialog counts each kind of column by ("Found: 2 names."). */
const KIND_WORD: Record<PdKind, string> = { name: "name", phone: "phone number", email: "email address", roll: "roll number", dob: "birth date", address: "address", govid: "ID number" };

const NUMBER = /^[-+]?[\d.,\s]+$/;
const isWord = (c: string | undefined): boolean => c !== undefined && /[\p{L}\p{N}]/u.test(c);
/** Whether `value` stands in `text` as its own word or words (not inside another word). */
function appearsIn(text: string, value: string): boolean {
  for (let at = text.indexOf(value); at >= 0; at = text.indexOf(value, at + 1)) {
    if (!isWord(text[at - 1]) && !isWord(text[at + value.length])) return true;
  }
  return false;
}

/** The distinct values of the table's flagged columns that are written in any of `texts`, longest first (so a name is replaced before a shorter name inside it). */
export function flaggedInText(data: ParsedData, scan: PdScanResult | null, texts: string[]): Flagged[] {
  if (!scan) return [];
  const out: Flagged[] = [];
  const seen = new Set<string>();
  for (const f of scan.found) {
    for (const row of data.rows) {
      const v = (row[f.index] ?? "").trim();
      // A number is never a name: the figures in the tables come from code, and a roll number column (1 to 12) would match inside "M = 6.00". One character is no name either.
      if (v.length < 2 || NUMBER.test(v) || seen.has(v) || scanText(v).total > 0) continue; // an e-mail, phone or ID value is callAI's own dialog's business
      seen.add(v);
      if (texts.some((t) => appearsIn(t, v))) out.push({ kind: f.kind, value: v });
    }
  }
  return out.sort((a, b) => b.value.length - a.value.length);
}

/** What the dialog reports: the count of values by kind. */
export function flaggedCounts(found: Flagged[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of found) counts[KIND_WORD[f.kind]] = (counts[KIND_WORD[f.kind]] ?? 0) + 1;
  return counts;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The same value is the same code everywhere: "[name 1]", "[name 2]" ... in the order of the found list. A value `listed` knows is that person's code, and takes no number. */
export function codesFor(found: Flagged[], listed?: ListedMasks): Map<string, string> {
  const per: Partial<Record<PdKind, number>> = {};
  const m = new Map<string, string>();
  for (const f of found) {
    const own = f.kind === "name" ? listed?.(f.value) ?? null : null;
    if (own !== null) { m.set(f.value, own); continue; }
    per[f.kind] = (per[f.kind] ?? 0) + 1;
    m.set(f.value, `[${KIND_WORD[f.kind]} ${per[f.kind]}]`);
  }
  return m;
}

/** What a flagged value stands for on the participant list: the person's code (or made-up name), or null when it is not on the list or two people share it. */
export type ListedMasks = (value: string) => string | null;

/**
 * Who a value is, by the participant list: a person's name or one of their spellings (any case and spacing, as the matcher reads them) is that person; the word two people share is nobody's.
 * `pseudonyms`: made-up names mode, where a person who has a made-up name is masked as it. Nothing for no list, a destroyed list or an empty one.
 */
export function listedMasks(list: ParticipantList | null, pseudonyms: boolean): ListedMasks {
  if (!list || list.destroyedAt || list.people.length === 0) return () => null;
  const owners = new Map<string, Set<string>>();
  for (const p of list.people) {
    for (const key of [p.name, ...p.spellings].map(normName)) {
      if (!key) continue;
      const had = owners.get(key);
      if (had) had.add(p.id);
      else owners.set(key, new Set([p.id]));
    }
  }
  const byId = new Map(list.people.map((p) => [p.id, p]));
  return (value) => {
    const ids = owners.get(normName(value));
    if (!ids || ids.size !== 1) return null;
    const p = byId.get([...ids][0]!);
    return p ? (pseudonyms && p.pseudonym ? p.pseudonym : p.code) : null;
  };
}
/**
 * Replaces each flagged value, where it stands as its own word, by its code. One pass with one alternation, longest value first: a code that was just written is never
 * searched again, so a value such as "name" cannot match inside "[name 1]" and no code holds another.
 */
export function maskLabels(text: string, found: Flagged[], codes: Map<string, string>): string {
  if (!found.length) return text;
  const values = [...new Set(found.map((f) => f.value))].sort((a, b) => b.length - a.length);
  const re = new RegExp("(?<![\\p{L}\\p{N}])(?:" + values.map(escapeRe).join("|") + ")(?![\\p{L}\\p{N}])", "gu");
  return text.replace(re, (m) => codes.get(m) ?? m);
}
