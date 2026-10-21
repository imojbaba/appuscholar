import { escHTML, rtHash, rtRunRecord, runStats, sanitizeHtml, type ParsedData, type StatsForm, type StatsTestKey } from "@appuscholar/core";
import type { StatsRuns } from "@/lib/blobs/kinds/stats";
import { toStatsForm } from "./form";
import type { FormState, Outcome } from "./lab";
import { resultChart, type Words } from "./resultChart";
import { blocksToHtml } from "./results";

/*
 * Run a test (v1 statsRunNow 12609-13457 and statsResultsShow 11985-12005, statsInsert 12010-12025): core runs the test; this file turns what came back into
 * what the Data tab shows, and builds what "Insert into document" puts in the document and keeps.
 */

/** v1 keeps the newest 300 runs (statsInsert 12019). */
export const RUNS_KEPT = 300;

/**
 * Runs `test` on the table with the form, as v1's "Run test" does. A refusal (a toast in v1) comes back as its text to show inline; a result with an undefined
 * number comes back as v1's note, nothing to insert, no chart (the safety net, register row F22); otherwise the result: its blocks as sanitized HTML (they carry
 * student column names and group labels), its sentence and its chart spec.
 */
export function runLabTest(data: ParsedData, test: StatsTestKey, form: FormState, w: Words): Outcome {
  const sf = toStatsForm(form);
  const res = runStats(data, test, sf);
  if (!res.ok) return res.reason === "toast" ? { kind: "toast", text: res.toast } : { kind: "undefined", html: sanitizeHtml(blocksToHtml(res.blocks)) };
  return { kind: "ok", res, html: sanitizeHtml(blocksToHtml(res.blocks)), chart: resultChart(data, test, sf, res.values, w) };
}

/** v1 statsInsert 12013: "r" + the time in base 36 + four random base-36 characters. */
export function newRunId(now: number = Date.now(), random: () => number = Math.random): string {
  return "r" + now.toString(36) + random().toString(36).slice(2, 6);
}

/**
 * What goes into the document (v1 insertIntoEditor 4196-4204, called by statsInsert 12024): the sentence as escaped text in its own paragraph (core's apa holds a
 * literal "<" in "p < .001"), wrapped in the run's tag when the run is recorded. With no run id the text goes in as v1's demo runs did, with no tag.
 */
export function sentenceHtml(sentence: string, runId: string | null): string {
  const text = escHTML(sentence);
  return "<p>" + (runId ? '<span class="stat-tag" data-run="' + runId + '">' + text + "</span>" : text) + "</p>";
}

/**
 * The run record to keep (rtCapture 12260-12269 plus the sentence and time statsInsert adds, 12016-12018), or null when it cannot be made (v1's try/catch 12011-12022
 * left the run untagged).
 */
export function runRecord(data: ParsedData, test: StatsTestKey, form: StatsForm, ds: string, sentence: string, now: number): StatsRuns[string] | null {
  try {
    return { ...rtRunRecord(data, test, form, ds, rtHash(data)), hash: rtHash(data), sentence, ts: now };
  } catch { return null; }
}

/** v1 statsInsert 12019: the run added under its id, and only the newest 300 kept. */
export function addRun(runs: StatsRuns | null, id: string, rec: StatsRuns[string]): StatsRuns {
  const out: StatsRuns = { ...(runs ?? {}), [id]: rec };
  const ids = Object.keys(out);
  if (ids.length > RUNS_KEPT) ids.sort((a, b) => out[a]!.ts - out[b]!.ts).slice(0, ids.length - RUNS_KEPT).forEach((k) => { delete out[k]; });
  return out;
}
