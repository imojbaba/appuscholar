import { PROVIDERS } from "@appuscholar/core";
import type { AiUseEntry, OriginStats } from "../store/types";

const DAY = 86_400_000;

/** The Monday (UTC, 00:00) of the ISO week containing `t`, as epoch milliseconds. */
export function weekStart(t: number): number {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - ((d.getUTCDay() + 6) % 7) * DAY;
}

/** One revision of a document: when it was made and its origin counts. */
export type DatedStats = { at: number; stats: OriginStats };

/**
 * The weekly picture: for each of the last `weeks` ISO weeks (oldest first, the week containing `now` last), the sum over documents of the
 * newest revision made before the next week begins. A week no document had a revision in yet, or whose counted words are all zero, is left out.
 * `perDoc` holds each document's revisions in any order.
 */
export function foldWeekly(perDoc: DatedStats[][], now: number, weeks = 8): { weekStart: string; typed: number; ai: number }[] {
  const out: { weekStart: string; typed: number; ai: number }[] = [];
  const thisWeek = weekStart(now);
  for (let i = weeks - 1; i >= 0; i--) {
    const start = thisWeek - i * 7 * DAY, end = start + 7 * DAY;
    let typed = 0, ai = 0, seen = false;
    for (const revs of perDoc) {
      let best: DatedStats | null = null;
      for (const r of revs) if (r.at < end && (!best || r.at > best.at)) best = r;
      if (best) { typed += best.stats.typed; ai += best.stats.ai; seen = true; }
    }
    if (seen && typed + ai > 0) out.push({ weekStart: new Date(start).toISOString().slice(0, 10), typed, ai });
  }
  return out;
}

export type AiLogRecord = { byKind: Record<string, number>; byService: Record<string, number>; total: number; firstAt: string | null; lastAt: string | null; loggingOff: boolean };

/** The AI-use log as the writing-process record states it: by help type and by "Name (model)", with the first and last day. `rows` are YYYY-MM-DD days. */
export function summariseAiLog(rows: AiUseEntry[], loggingOff: boolean): AiLogRecord {
  const byKind: Record<string, number> = {}, byService: Record<string, number> = {};
  let firstAt: string | null = null, lastAt: string | null = null;
  for (const e of rows) {
    byKind[e.k] = (byKind[e.k] ?? 0) + 1;
    const svc = ((PROVIDERS as Record<string, { name: string }>)[e.p]?.name ?? e.p) + (e.m ? " (" + e.m + ")" : "");
    byService[svc] = (byService[svc] ?? 0) + 1;
    if (firstAt === null || e.d < firstAt) firstAt = e.d;
    if (lastAt === null || e.d > lastAt) lastAt = e.d;
  }
  return { byKind, byService, total: rows.length, firstAt, lastAt, loggingOff };
}
