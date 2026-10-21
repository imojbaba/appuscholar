import { statsParseText, STAT_TESTS, type ParsedData, type StatsTestKey, type TgDemo } from "@appuscholar/core";
import { defaultForm } from "./form";
import type { Outcome } from "./lab";
import { runLabTest } from "./run";
import type { Words } from "./resultChart";

/*
 * The demo of the which-test guide (v1 tgDemo 12458-12481, with TG_DEMO 12418-12432): a small invented table, run by core's runStats through runLabTest, with the
 * student's prediction compared to what the test found. Pure: the lab, the blobs and the document are not read or written here, so a demo can never register a
 * set, record a run, or be inserted (register row D-S2-71).
 */

export type DemoRun = {
  /** The guide's result the demo belongs to (TG_DEMO's key). */
  id: string;
  title: string;
  /** What the student predicted. */
  guess: "yes" | "no";
  test: StatsTestKey;
  data: ParsedData;
  outcome: Extract<Outcome, { kind: "ok" }>;
  /** The test found a clear result (alpha: always, as v1 set it). */
  sig: boolean;
  isScale: boolean;
  /** TG_DEMO's "How to read it" text. */
  read: string;
};

/** The form v1 filled for a demo (12466-12470): the defaults, then the columns, boxes and ticks the demo names (a name not in the table leaves the field as it was). */
export function demoForm(data: ParsedData, dm: TgDemo) {
  const f = defaultForm(data, dm.test);
  const idx = (name: string): string => { const c = data.cols.find((c2) => c2.name === name); return c ? String(c.index) : ""; };
  for (const [k, name] of Object.entries(dm.sel ?? {})) if (k in f.values) f.values[k] = idx(name);
  for (const [k, v] of Object.entries(dm.extra ?? {})) if (k in f.values) f.values[k] = v;
  if (dm.tick) {
    const multi = STAT_TESTS[dm.test].fields.find((x) => x.multi && x.id === "items");
    if (multi) f.ticked[multi.id] = dm.tick.map(idx).filter((s) => s !== "").map(Number).sort((a, b) => a - b);
  }
  if (dm.rev && "rev" in f.values) f.values.rev = dm.rev;
  if (dm.rrange && "rrange" in f.values) f.values.rrange = dm.rrange;
  return f;
}

/** v1 12472-12473: the p-value read from the sentence ("p < .001" is clear, "p = .034" is clear below .05). */
export function sentenceIsClear(sentence: string): boolean {
  const m = sentence.match(/p\s*(<|=)\s*\.?(\d+)/);
  return m ? m[1] === "<" || parseFloat("0." + m[2]) < 0.05 : false;
}

/** Runs one demo. Null if core's run did not come to a result (it does for all thirteen; the card then says so). */
export function runDemo(id: string, dm: TgDemo, guess: "yes" | "no", w: Words): DemoRun | null {
  const data = statsParseText(dm.csv);
  if (!data) return null;
  const outcome = runLabTest(data, dm.test, demoForm(data, dm), w);
  if (outcome.kind !== "ok") return null;
  const isScale = dm.test === "alpha";
  return { id, title: dm.title, guess, test: dm.test, data, outcome, sig: isScale || sentenceIsClear(outcome.res.apa), isScale, read: dm.read };
}
