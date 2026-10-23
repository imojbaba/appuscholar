import { PW_INFO, powerCompute, sanitizeHtml, simulatorCompute, simulatorParse, type PowerInput, type PowerMode, type PowerTestKey, type SimLast } from "@appuscholar/core";
import { blocksToHtml } from "./results";
import { parseSimSvg, type SvgNode } from "./powerSvg";

/*
 * The Power tab (v1 powerDlg 1701-1752, pwTestChange 13467-13477, pwRun 13481-13531, plRun 9007-9043, plPreset 9006). Core does the arithmetic (powerCompute,
 * simulatorCompute); this file is the tab's side: which fields a test and mode show, the form-to-input mapping, the default effect and hint, and the result as safe HTML.
 */

/** The calculator's fields as the strings a student typed (core's PowerInput). */
export type PowerForm = PowerInput;
/** The simulator's four boxes (v1 #plD, #plN, #plK, #plSeed). */
export type SimForm = { d: string; n: string; k: string; seed: string };

export const TEST_KEYS = Object.keys(PW_INFO) as PowerTestKey[];
export const SIM_K = ["100", "200", "500"] as const;
export const SIM_PRESETS = [15, 30, 64, 120] as const;

export function defaultPowerForm(): PowerForm {
  return { test: "ind", mode: "n", alpha: "0.05", tails: "2", drop: "0", effect: PW_INFO.ind.def, n: "30", power: "0.80", k: "3", p: "3", df: "1" };
}
export function defaultSimForm(): SimForm { return { d: "0.5", n: "30", k: "200", seed: "1" }; }

export type PowerField = "effect" | "n" | "power" | "alpha" | "tails" | "k" | "p" | "df" | "drop";
/** The fields pwTestChange shows (13471-13474), in the order of v1's dialog. */
export function powerFields(test: PowerTestKey, mode: PowerMode): PowerField[] {
  const f: PowerField[] = [];
  if (mode !== "effect") f.push("effect");
  if (mode !== "n") f.push("n");
  if (mode !== "power") f.push("power");
  f.push("alpha");
  if (test === "ind" || test === "paired" || test === "one" || test === "corr") f.push("tails");
  if (test === "anova") f.push("k");
  if (test === "regr") f.push("p");
  if (test === "chisq") f.push("df");
  if (mode === "n") f.push("drop");
  return f;
}

/** Cohen's benchmarks as v1 wrote them into the hint: `.2, .5, .8`. */
export function benchmarkList(test: PowerTestKey): string {
  return PW_INFO[test].conv.map((x) => String(x).replace(/^0\./, ".")).join(", ");
}

/**
 * The form as core's input. v1's pwRun read every box including the ones pwTestChange had hidden, so a dropout left in the box in mode n refused a calculation in
 * the other two modes with a message about a box the student could not see. Dropout is sent only when it is shown (register row D-S2-73); every other hidden box is one
 * powerCompute does not read in that test and mode.
 */
export function toPowerInput(f: PowerForm): PowerInput {
  return { ...f, drop: f.mode === "n" ? f.drop : "0" };
}

export type PowerOutcome = { ok: true; html: string; sentence: string } | { ok: false; error: string };
/** "Calculate": the result's blocks as sanitized HTML (core's markup, with the test and symbols in it), the sentence, or core's refusal. */
export function runPower(f: PowerForm): PowerOutcome {
  const r = powerCompute(toPowerInput(f));
  return r.ok ? { ok: true, html: sanitizeHtml(blocksToHtml(r.blocks)), sentence: r.sentence } : { ok: false, error: r.error };
}

export function toSimInput(f: SimForm): { d: number; n: number; k: number; seed: number } { return simulatorParse(f); }

export type SimView =
  | { ok: true; banner: string; texts: string[]; above: string[]; caption: string; raj: string; note: string; svgText: string; svg: SvgNode | null; last: SimLast }
  | { ok: false; warn: string };
/**
 * "Run the pretend studies" with v1's seed handling (a seed that is 0 or not a number runs as 1). The paragraphs carry core's markup (bold, `&lt;`, a muted span) and go
 * through the sanitizer; the picture is rebuilt from a short list of shapes (powerSvg.ts) because the sanitizer removes svg.
 */
export function runSim(p: { d: number; n: number; k: number; seed: number }): SimView {
  const r = simulatorCompute(p.d, p.n, p.k, p.seed);
  if (!r.ok) return { ok: false, warn: r.warn };
  const above = r.texts.length - 3;
  return {
    ok: true, banner: r.banner, texts: r.texts,
    above: r.texts.slice(0, above).map(sanitizeHtml),
    caption: sanitizeHtml(r.texts[above]!), raj: sanitizeHtml(r.texts[above + 1]!), note: sanitizeHtml(r.texts[above + 2]!),
    svgText: r.svg, svg: parseSimSvg(r.svg), last: r.last
  };
}

/* What was typed stays when the student visits another tab (the Panel mounts again), per project. The results are not kept: Calculate makes them again. */
const memory = new Map<string, { form: PowerForm; sim: SimForm }>();
export function recallPower(projectId: string): { form: PowerForm; sim: SimForm } {
  return memory.get(projectId) ?? { form: defaultPowerForm(), sim: defaultSimForm() };
}
export function rememberPower(projectId: string, form: PowerForm, sim: SimForm): void { memory.set(projectId, { form, sim }); }
export function resetPower(): void { memory.clear(); }
