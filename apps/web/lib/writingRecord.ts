import { PROVIDERS } from "@appuscholar/core";

export type OriginStats = { typed: number; ai: number; passages: number; kept: number; edited: number; unknown: number };
/** The wire shape of GET /projects/:id/writing-record. */
export type WritingRecord = {
  docs: Array<{ id: string; title: string; kind: string; stats: OriginStats }>;
  sources: Array<{ title: string; words: number }>;
  weekly: Array<{ weekStart: string; typed: number; ai: number }>;
  aiLog: { byKind: Record<string, number>; byProvider: Record<string, number>; total: number };
};

const pct = (part: number, whole: number) => (whole ? Math.round((100 * part) / whole) : 0);

/** The writing-process record as plain text: v1 `provReportText`, section by section, with the same sentences. `today` is the local YYYY-MM-DD. */
export function buildRecordText(rec: WritingRecord, build: string, today: string): string {
  let t = "WRITING-PROCESS RECORD (made with Appuscholar, " + build + ")\nDate: " + today + "\n\n";
  t += "WHAT THIS IS\nA count, kept in the student's browser, of words typed in the editor against words inserted from an AI suggestion or the chat, with a summary of the AI-use log. It was made by counting, with no AI. It is the student's own record. It can be edited on the student's computer, so it supports an honest account and is not proof against a determined person. It cannot see text typed from another source, or retyped from an AI chat elsewhere. It is not an AI detector.\n\n";
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
  t += "AI-USE LOG (summary)\n";
  const log = rec.aiLog;
  if (!log.total) t += "No AI requests logged.\n\n";
  else {
    t += log.total + " request" + (log.total === 1 ? "" : "s") + ".\n";
    for (const k of Object.keys(log.byKind).sort((x, y) => (log.byKind[y] ?? 0) - (log.byKind[x] ?? 0))) t += "- " + k + ": " + log.byKind[k] + "\n";
    t += "Services used: " + Object.keys(log.byProvider).map((k) => ((PROVIDERS as Record<string, { name: string }>)[k]?.name ?? k) + " " + log.byProvider[k]).join("; ") + ".\n\n";
  }
  t += "DECLARED WRITING SAMPLES\n(none declared yet)\n\n";
  t += "LIMITS\nCounting where words came from does not show who thought of the ideas. A student who retypes AI text by hand is counted as the author of those words. The record is useful together with drafts, notes and a talk with the supervisor.\n";
  return t;
}
