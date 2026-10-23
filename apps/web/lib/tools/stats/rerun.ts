import { rtHash, STAT_TESTS, type ParsedData, type StatsTestKey } from "@appuscholar/core";
import type { StatsRuns, StatsSets } from "@/lib/blobs/kinds/stats";
import { defaultForm, fieldColumns, toStatsForm } from "./form";
import type { FormState, LabState } from "./lab";
import type { Words } from "./resultChart";
import { runLabTest, runRecord } from "./run";

/*
 * Re-run a result on the data now loaded (v1 rtRerunOne 12313-12330): the run's test and the columns it used are put back into the form, the test is run on the table
 * held under that data set's name, and the sentence it comes to is what replaces the old one. The engine is the Data tab's own runLabTest, so the numbers are core's.
 */

export type Run = StatsRuns[string];
export type Prepared = { ok: true; test: StatsTestKey; form: FormState; data: ParsedData; sentence: string; record: Run } | { ok: false; msg: string };

const isTest = (k: string): k is StatsTestKey => Object.prototype.hasOwnProperty.call(STAT_TESTS, k);

/** True when the table the lab holds is the one stored under the run's data set name: registered under that name, and its fingerprint is the stored one (v1 12315). */
export function loadedFor(lab: Pick<LabState, "data" | "registered" | "regName">, run: Run, sets: StatsSets): boolean {
  const ds = sets[run.ds];
  return !!ds && !!lab.data && lab.registered === lab.data && lab.regName === run.ds && rtHash(lab.data) === ds.hash;
}

/** The form v1 filled in from the run (12317-12321): the test, each column by its name, the ticked columns of each multi field, the extra boxes. `col` names the column that is gone. */
export function restoreForm(data: ParsedData, run: Run): { form: FormState } | { col: string } | null {
  if (!isTest(run.test)) return null;
  const test = run.test;
  const cfg = STAT_TESTS[test];
  const form = defaultForm(data, test);
  const values = { ...form.values }, ticked = { ...form.ticked };
  for (const [k, name] of Object.entries(run.fields)) {
    const col = data.cols.find((c) => c.name === name);
    if (!col) return { col: name };
    values[k] = String(col.index);
  }
  for (const [k, wanted] of Object.entries(run.multi)) {
    const field = cfg.fields.find((f) => f.id === k && f.multi);
    if (field) ticked[k] = fieldColumns(data, field).filter((c) => wanted.includes(c.name)).map((c) => c.index);
  }
  for (const [k, v] of Object.entries(run.extra)) if (k in values) values[k] = v;
  return { form: { test, data, values, ticked } };
}

/**
 * Everything a re-run needs before the document is touched: the data must be loaded under the run's name, every column it used must still be there, and the test
 * must come to a sentence. `msgs` are the student's words for each refusal. The record is the run as it would now be kept (new fingerprint, new sentence, now).
 */
export function prepareRerun(lab: LabState, run: Run, sets: StatsSets, w: Words, now: number): Prepared {
  if (!loadedFor(lab, run, sets) || !lab.data) return { ok: false, msg: w("stats_check_load_first", { n: run.ds }) };
  const restored = restoreForm(lab.data, run);
  if (!restored) return { ok: false, msg: w("rt_failed") };
  if ("col" in restored) return { ok: false, msg: w("rt_col_gone", { c: restored.col }) };
  const { form } = restored;
  const outcome = runLabTest(lab.data, form.test, form, w);
  if (outcome.kind !== "ok") return { ok: false, msg: w("rt_failed") };
  const sentence = outcome.res.apa;
  const record = sentence ? runRecord(lab.data, form.test, toStatsForm(form), run.ds, sentence, now) : null;
  if (!record) return { ok: false, msg: w("rt_failed") };
  return { ok: true, test: form.test, form, data: lab.data, sentence, record };
}
