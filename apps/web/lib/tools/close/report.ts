import { clGather, clReportText, type ClResult, type ClRun } from "@appuscholar/core";

/* The Closeness tab's report and marked text. The report is the engine's v1 text (clReportText 6967-6972) with the date given, never the page's clock read inside the engine. */

/** The file the Download button saves (v1 clDownload 6973). */
export const CLOSE_FILE = "closeness-check.txt";

/** The report text for `r` as of `now`: v1's, with the date as its first ten characters (the ISO day). */
export function closeReport(r: ClResult, now: Date): string {
  return clReportText(r, now.toISOString());
}

/** v1's highlight colours (CL_COLS 6948), one for each source in turn. A colour is never the only sign: every passage carries its [source.n] tag. */
export const CL_COLS = ["rgba(220,38,38,.20)", "rgba(37,99,235,.20)", "rgba(5,150,105,.22)", "rgba(217,119,6,.25)", "rgba(124,58,237,.22)"] as const;

/** A stretch of the student's text: plain, or one run's words with the run's source and its tag as v1 wrote it ("[1.2]": the source's number, then the run's). */
export type Piece = { text: string; run?: { src: number; tag: string } };

/** clRender's loop (6955-6960): the text cut at each run, in order. The pieces put end to end are the text, unchanged; the caller draws them as text, never as markup. */
export function markedPieces(text: string, runs: ClRun[]): Piece[] {
  const out: Piece[] = [];
  let pos = 0;
  runs.forEach((x, n) => {
    if (x.cs > pos) out.push({ text: text.slice(pos, x.cs) });
    out.push({ text: text.slice(x.cs, x.ce), run: { src: x.src, tag: "[" + (x.src + 1) + "." + (n + 1) + "]" } });
    pos = x.ce;
  });
  if (pos < text.length || out.length === 0) out.push({ text: text.slice(pos) });
  return out;
}

/**
 * The engine names a source's kind in English ("Reading shelf", "your document", "pasted": the report prints them). The panel shows them through t(), found by asking the engine for each
 * kind, so the words are never typed here a second time.
 */
const KINDS: Array<[string, string]> = [
  [clGather(["s:k"], [{ id: "k" }], [], "")[0]!.kind, "close_kind_shelf"],
  [clGather(["d:k"], [], [{ id: "k" }], "")[0]!.kind, "close_kind_doc"],
  [clGather([], [], [], "x")[0]!.kind, "close_kind_pasted"]
];
/** The message key for a source's kind, or null for a kind the panel does not know (shown as the engine wrote it). */
export const kindKey = (kind: string): string | null => KINDS.find(([k]) => k === kind)?.[1] ?? null;
