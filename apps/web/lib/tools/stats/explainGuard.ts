import { scanText, type ParsedData, type PdKind } from "@appuscholar/core";
import type { PdScanResult } from "./lab";

/*
 * The personal-data step "Explain in plain language" adds in front of callAI's own (rule 2, Review Focus 2). callAI scans the request with core's scanText, which finds
 * e-mail addresses, phone numbers and ID numbers and nothing else, so a participant's NAME used as a group label would go out unscanned. The lab already holds the
 * column scan of the table (core's pdScan: names, roll numbers, dates of birth, addresses ...), so the request is checked against it: a value of a flagged column that
 * is written in the tables' text or the sentence is a personal detail in the request. The student then chooses mask, send as it is, or cancel (the same dialog, lib/ai/pdDialog).
 * What scanText finds is left to callAI's own dialog, so nobody is asked twice about an e-mail address. (Register row D-S2-70.)
 */

export type Flagged = { kind: PdKind; value: string };

/** The words the dialog counts each kind of column by ("Found: 2 names."). */
const KIND_WORD: Record<PdKind, string> = { name: "name", phone: "phone number", email: "email address", roll: "roll number", dob: "birth date", address: "address", govid: "ID number" };

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
      if (!v || seen.has(v) || scanText(v).total > 0) continue; // an e-mail, phone or ID value is callAI's own dialog's business
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

/** The same value is the same code everywhere: "[name 1]", "[name 2]" ... in the order of the found list. */
export function codesFor(found: Flagged[]): Map<string, string> {
  const per: Partial<Record<PdKind, number>> = {};
  const m = new Map<string, string>();
  for (const f of found) { per[f.kind] = (per[f.kind] ?? 0) + 1; m.set(f.value, `[${KIND_WORD[f.kind]} ${per[f.kind]}]`); }
  return m;
}
/** Replaces each flagged value, where it stands as its own word, by its code. */
export function maskLabels(text: string, found: Flagged[], codes: Map<string, string>): string {
  let out = text;
  for (const f of found) out = out.replace(new RegExp("(?<![\\p{L}\\p{N}])" + escapeRe(f.value) + "(?![\\p{L}\\p{N}])", "gu"), () => codes.get(f.value)!);
  return out;
}
