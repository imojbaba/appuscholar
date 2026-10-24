import { slScoreData, type ParsedData, type Scale } from "@appuscholar/core";
import { getLab, parse, setText } from "./lab";
import type { SliceOpts } from "./intake";

/*
 * Scoring a scale in the lab (v1 slScoreOpen's guard 11471, slScoreRun 11487-11512). Rule 10: nothing here reads or writes a scale's wording, and nothing here
 * reaches the AI, a blob or the network: the scorer is core's slScoreData over the table the lab holds, and a scored table goes back into the lab's paste text and is parsed again by the
 * lab's own parse (which scans the new table for personal details, as v1's statsParse did inside slScoreRun).
 */

/** What pressing "Compute scores" came to: no table to score; a refusal or a no-row sentence (plain text); or scores added (core's sentence, which carries <b> and is sanitized by the tab). */
export type ScaleOutcome =
  | { kind: "nodata" }
  | { kind: "refused"; message: string }
  | { kind: "scored"; html: string; data: ParsedData | null };

/**
 * v1 slScoreRun: `idx` is the column chosen for each item (-1 for none), `codingIndex` the coding chosen (v1's `parseInt(...)||0`, so a bad index is the first). On a run that scores,
 * the table with the new columns becomes the lab's paste text and is parsed again (so the personal-data scan runs on it), and the result is the table that parse made (null when the
 * student cleared the lab meanwhile, in which case the sentence still reports what was scored).
 */
export async function scoreInLab(projectId: string, scale: Scale, idx: number[], codingIndex: number, opts: SliceOpts = {}): Promise<ScaleOutcome> {
  const lab = getLab(projectId);
  if (!lab.data) return { kind: "nodata" };
  const coding = scale.codings[codingIndex] ?? scale.codings[0]!;
  const r = slScoreData(scale, lab.data, idx, coding);
  if (!r.ok) return { kind: "refused", message: r.message };
  setText(projectId, r.csv);
  const data = await parse(projectId, opts);
  return { kind: "scored", html: r.message, data };
}
