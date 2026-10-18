import type { V1 } from "./v1";

/**
 * What the three Wave 1 prompt captures (prompts-idea, prompts-helpers, prompts-research; Task 13) share: the values of the field-of-study setting they run under, the record of
 * one entry point's single callAI call, and a builder of exact-length texts.
 */

/**
 * A custom field of study of 70 characters, as a student types one into "Other". fieldName (v1 2500) trims it and keeps its first 60 characters, which end on a space (index 59):
 * the label is the one value that tells trim-then-cut, v1's order, from cut-then-trim.
 */
export const LONG_FIELD = "mental health nursing and community psychiatry in rural and hill areas";

/** The values of appu_field every Wave 1 capture runs under, recorded raw: never set (v1 then says "psychology"), a menu choice, and LONG_FIELD. The test applies fieldLabel to them. */
export const FIELDS: Array<string | null> = [null, "education", LONG_FIELD];

/** One entry point's callAI call: `entry` is the v1 function a student's click runs, `field` the raw appu_field (null when unset), `label` what v1's fieldName() made of it, `aiu` aiuClassify(prompt). */
export type PromptCase = {
  entry: string;
  field: string | null;
  label: string;
  inputs: Record<string, unknown>;
  prompt: string;
  opts: Record<string, unknown>;
  aiu: { k: string; g: string } | null;
};

/**
 * callAI replaced by a recorder, and the one method that drives an entry point: `run(entry, inputs, go)` calls `go` (the student's click: a v1 entry point, awaited) and records the single
 * callAI call it made, exactly as v1 handed it over (before pdPreSend and before callAIRaw appends contentLangInstruction, as Task 5 records it). It throws when `go` made no call or more
 * than one (a precondition of the entry is not met; the toasts are in the message) or when v1 reported a jsdom error. `setField` sets appu_field in localStorage, where v1's LS.get (1966)
 * reads it for fieldName (2500); null removes it.
 */
export function promptRecorder(v1: V1, engine: string) {
  if (LONG_FIELD.length !== 70 || LONG_FIELD[59] !== " " || LONG_FIELD[58] === " ") throw new Error(`${engine}: LONG_FIELD is not 70 characters with a space at index 59`);
  const calls = v1.stubCallAI();
  const ls = v1.window.localStorage;
  ls.clear(); // v1's start-up leaves appu_theme behind; nothing but appu_field should shape a prompt
  const cases: PromptCase[] = [];
  let field: string | null = null;
  const setField = (raw: string | null) => {
    if (raw === null) ls.removeItem("appu_field");
    else ls.setItem("appu_field", raw);
    field = raw;
  };
  const run = async (entry: string, inputs: Record<string, unknown>, go: () => Promise<unknown>): Promise<PromptCase> => {
    const before = calls.length, toasts = v1.toasts.length, errors = v1.errors.length;
    await go();
    const made = calls.length - before;
    if (made !== 1) throw new Error(`${engine}: ${entry} made ${made} callAI calls (toasts ${JSON.stringify(v1.toasts.slice(toasts))}): a precondition of the entry is not met`);
    if (v1.errors.length !== errors) throw new Error(`${engine}: ${entry}: jsdom errors during the call: ${v1.errors.slice(errors).join(" | ")}`);
    const c = calls[before]!;
    const recorded: PromptCase = { entry, field, label: v1.eval<string>("fieldName()"), inputs, prompt: c.prompt, opts: c.opts, aiu: v1.call<PromptCase["aiu"]>("aiuClassify", c.prompt) };
    cases.push(recorded);
    return recorded;
  };
  return { calls, cases, setField, run };
}

/**
 * A text of exactly `n` characters with no white space at either end, made of `unit(1)`, `unit(2)` and so on joined by spaces and cut at `n`: the running number in each unit shows where a cut
 * fell. A cut that lands on a space ends the text with full stops instead, so that trimming it changes nothing.
 */
export function textOf(n: number, unit: (i: number) => string): string {
  let s = "";
  for (let i = 1; s.length <= n; i++) s += (s ? " " : "") + unit(i);
  s = s.slice(0, n);
  const kept = s.trimEnd();
  s = kept + ".".repeat(n - kept.length);
  if (s.length !== n || s !== s.trim()) throw new Error(`textOf: could not make a text of exactly ${n} characters`);
  return s;
}

/**
 * The smallest size in 1..max for which `accepted(size)` is true, found by trying every size, and checked: every smaller size is refused and every larger one up to max is accepted
 * (an entry that sometimes accepts and sometimes refuses has no threshold).
 */
export async function threshold(name: string, max: number, accepted: (size: number) => Promise<boolean>): Promise<{ refused: number; accepted: number }> {
  const results: boolean[] = [];
  for (let size = 1; size <= max; size++) results.push(await accepted(size));
  const first = results.indexOf(true);
  if (first <= 0 || results.slice(0, first).some(Boolean) || results.slice(first).some((r) => !r)) throw new Error(`${name}: no clean threshold in 1..${max}: ${results.map((r) => (r ? 1 : 0)).join("")}`);
  return { refused: first, accepted: first + 1 };
}
