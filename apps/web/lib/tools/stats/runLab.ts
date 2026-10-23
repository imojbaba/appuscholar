import { genVerdict, STATS_TEST_OPTIONS, type StatsTestKey } from "@appuscholar/core";
import { currentForm, toStatsForm } from "./form";
import { getLab, NO_GATE, patchLab, type ExplainState } from "./lab";
import { runLabTest } from "./run";
import type { Words } from "./resultChart";

/*
 * What the Run test area does to the lab (Task B2): picking a test and filling its fields, the practice gate (v1 genGateShow, genReveal, genSwitch, 12578-12608), running,
 * and the explanation's state. All of it changes the lab store (lib/tools/stats/lab.ts) and nothing else: no storage, no network, no page. The hook that adds
 * the project's blobs, the document and the AI is useRunActions.ts.
 */

/** v1 #statsTest's onchange (statsFieldsRender): the fields start again for the new test and the practice gate closes. The result on screen stays until the next run. */
export function setTest(projectId: string, test: StatsTestKey): void {
  patchLab(projectId, { test, form: null, gate: NO_GATE });
}
/** The form as drawn now, the student's change made, kept in the lab so a tab switch keeps it. */
function editForm(projectId: string, edit: (f: { values: Record<string, string>; ticked: Record<string, number[]> }) => void): void {
  const lab = getLab(projectId);
  if (!lab.data) return;
  const f = currentForm(lab.data, lab.test, lab.form);
  const next = { ...f, values: { ...f.values }, ticked: { ...f.ticked } };
  edit(next);
  patchLab(projectId, { form: next });
}
export function setField(projectId: string, id: string, value: string): void {
  editForm(projectId, (f) => { f.values[id] = value; });
}
/** Ticks or unticks one column of a multi field; the ticked list stays in column order (the order sets the coefficient table, core's StatsForm). */
export function tickColumn(projectId: string, id: string, column: number, on: boolean): void {
  editForm(projectId, (f) => {
    const rest = (f.ticked[id] ?? []).filter((c) => c !== column);
    f.ticked[id] = (on ? [...rest, column] : rest).sort((a, b) => a - b);
  });
}

/** "Run test" with the gate already answered (or off): runs the test and keeps what came of it. */
export function runNow(projectId: string, w: Words): void {
  const lab = getLab(projectId);
  if (!lab.data) return;
  const form = currentForm(lab.data, lab.test, lab.form);
  const outcome = runLabTest(lab.data, lab.test, form, w);
  const idle: ExplainState = { status: "idle" };
  patchLab(projectId, { form, gate: NO_GATE, lastRun: { data: lab.data, test: lab.test, form: toStatsForm(form), outcome, explain: idle } });
}

/** v1 statsRun (12604-12608): with practice mode on and the design not yet stated, the gate opens instead of running. No table: nothing happens (the area is not drawn then). */
export function requestRun(projectId: string, genFirst: boolean, w: Words): void {
  if (!getLab(projectId).data) return;
  if (genFirst) patchLab(projectId, { gate: { open: true, design: "", verdict: null, switched: false } });
  else runNow(projectId, w);
}

export function chooseDesign(projectId: string, design: string): void {
  patchLab(projectId, { gate: { ...getLab(projectId).gate, design, verdict: null } });
}
/** v1 genReveal (12589-12601) by core's genVerdict, naming tests as the chooser does (STATS_TEST_OPTIONS). Nothing chosen: nothing to check. */
export function checkChoice(projectId: string): boolean {
  const lab = getLab(projectId);
  if (!lab.gate.design) return false;
  patchLab(projectId, { gate: { ...lab.gate, switched: false, verdict: genVerdict(lab.gate.design, lab.test, (k) => (STATS_TEST_OPTIONS as Record<string, string>)[k]) } });
  return true;
}
/** v1 genSwitch (12602): the usual test for the design, the gate shown again fresh, the fields to choose again. */
export function switchTest(projectId: string, test: StatsTestKey): void {
  patchLab(projectId, { test, form: null, gate: { open: true, design: "", verdict: null, switched: true } });
}

/** The explanation of the result on screen, only while that result is still the one shown. */
export function setExplain(projectId: string, forRun: unknown, explain: ExplainState): void {
  const lr = getLab(projectId).lastRun;
  if (!lr || lr.outcome !== forRun) return;
  patchLab(projectId, { lastRun: { ...lr, explain } });
}
