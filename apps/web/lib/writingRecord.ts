import type { OpenedTitle, Titled } from "@/lib/vault/titles";
import type { WrappedDek } from "@/lib/vault/useVault";

export type OriginStats = { typed: number; ai: number; passages: number; kept: number; edited: number; unknown: number };
/** The wire shape of GET /projects/:id/writing-record. A document's `title` is ciphertext when `titleKeyVersion` is 1 or more (see openRecordTitles). */
export type WritingRecord = {
  docs: Array<{ id: string; title: string; titleKeyVersion: number; deks: WrappedDek[]; kind: string; stats: OriginStats }>;
  sources: Array<{ title: string; words: number }>;
  weekly: Array<{ weekStart: string; typed: number; ai: number }>;
  /** `byService` is keyed "Name (model)"; `firstAt` and `lastAt` are YYYY-MM-DD days; `loggingOff` is the account setting. */
  aiLog: { byKind: Record<string, number>; byService: Record<string, number>; total: number; firstAt: string | null; lastAt: string | null; loggingOff: boolean };
};

/**
 * The record with its document titles opened in the browser (key version 0 afterwards), for the text and the dialog; a title that is
 * locked or does not open reads `fallback`.
 */
export async function openRecordTitles(rec: WritingRecord, open: (t: Titled, keyId: string) => Promise<OpenedTitle>, fallback: string): Promise<WritingRecord> {
  const docs = await Promise.all(rec.docs.map(async (d) => {
    const o = await open(d, d.id);
    return { ...d, title: o.state === "open" ? o.text : fallback, titleKeyVersion: 0 };
  }));
  return { ...rec, docs };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** v1 `aiuDate`: "15 October 2026" from YYYY-MM-DD; anything else is shown as it is. */
function aiuDate(d: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d ?? "");
  return m ? parseInt(m[3]!, 10) + " " + MONTHS[parseInt(m[2]!, 10) - 1] + " " + m[1] : String(d ?? "");
}
const pct = (part: number, whole: number) => (whole ? Math.round((100 * part) / whole) : 0);

/** The writing-process record as plain text: v1 `provReportText`, section by section, with the same sentences. `today` is the local YYYY-MM-DD. */
export function buildRecordText(rec: WritingRecord, build: string, today: string): string {
  return recordHead(build, today) + recordWords(rec) + recordAiLog(rec.aiLog) + recordTail();
}

/**
 * The record for several projects in one file (the export): the header once, the words-by-origin sections of each project under its
 * title, then the AI-use log once (it is the student's whole log, the same in every project's record) and the closing sections once.
 */
export function buildAllRecordText(parts: Array<{ title: string; rec: WritingRecord }>, build: string, today: string): string {
  let t = recordHead(build, today);
  for (const p of parts) t += p.title + "\n" + "=".repeat(p.title.length) + "\n\n" + recordWords(p.rec);
  if (parts[0]) t += recordAiLog(parts[0].rec.aiLog);
  return t + recordTail();
}

function recordHead(build: string, today: string): string {
  let t = "WRITING-PROCESS RECORD (made with Appuscholar, " + build + ")\nDate: " + today + "\n\n";
  t += "WHAT THIS IS\nA count, kept under the student's account, of words typed in the editor against words inserted from an AI suggestion or the chat, with a summary of the AI-use log. It was made by counting, with no AI. It is the student's own record. It can be edited by the student, so it supports an honest account and is not proof against a determined person. It cannot see text typed from another source, or retyped from an AI chat elsewhere. It is not an AI detector.\n\n";
  return t;
}

function recordWords(rec: WritingRecord): string {
  let t = "";
  const typed = rec.docs.reduce((a, d) => a + d.stats.typed, 0), ai = rec.docs.reduce((a, d) => a + d.stats.ai, 0), tot = typed + ai;
  t += "WORDS BY ORIGIN (all documents the student wrote)\n";
  if (!tot) t += "No writing recorded yet.\n\n";
  else {
    t += "Typed in the editor: " + typed + " (" + pct(typed, tot) + "%)\nInserted from an AI suggestion or chat: " + ai + " (" + (100 - pct(typed, tot)) + "%)\n\n";
    for (const d of rec.docs) {
      const s = d.stats, n = s.typed + s.ai;
      t += "- " + d.title + ": " + n + " words, " + pct(s.typed, n) + "% typed; " + s.passages + " AI passage" + (s.passages === 1 ? "" : "s")
        + (s.passages ? " (" + s.kept + " left as inserted, " + s.edited + " edited later" + (s.unknown ? ", " + s.unknown + " unknown" : "") + ")" : "") + "\n";
    }
    t += "\n";
  }
  if (rec.sources.length) t += "Documents marked as sources by the student (not counted above): " + rec.sources.length + ", " + rec.sources.reduce((a, x) => a + x.words, 0) + " words.\n\n";
  if (rec.weekly.length > 1) {
    t += "WEEKLY PICTURE (share typed by the student)\n";
    for (const w of rec.weekly) { const n = w.typed + w.ai; t += "- week of " + w.weekStart + ": " + pct(w.typed, n) + "% typed of " + n + " words\n"; }
    t += "\n";
  }
  return t;
}

function recordAiLog(log: WritingRecord["aiLog"]): string {
  let t = "AI-USE LOG (summary)\n";
  if (log.loggingOff) t += "Logging is switched off for this account, so this part is empty by choice.\n\n";
  else if (!log.total) t += "No AI requests logged.\n\n";
  else {
    t += log.total + " request" + (log.total === 1 ? "" : "s") + " from " + aiuDate(log.firstAt) + " to " + aiuDate(log.lastAt) + ".\n";
    for (const k of Object.keys(log.byKind).sort((x, y) => (log.byKind[y] ?? 0) - (log.byKind[x] ?? 0))) t += "- " + k + ": " + log.byKind[k] + "\n";
    t += "Services used: " + Object.keys(log.byService).map((k) => k + " " + log.byService[k]).join("; ") + ".\n\n";
  }
  return t;
}

function recordTail(): string {
  let t = "DECLARED WRITING SAMPLES\n(none declared yet)\n\n";
  t += "LIMITS\nCounting where words came from does not show who thought of the ideas. A student who retypes AI text by hand is counted as the author of those words. The record is useful together with drafts, notes and a talk with the supervisor.\n";
  return t;
}
