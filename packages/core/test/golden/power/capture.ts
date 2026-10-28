import type { Engine } from "../harness/engines";
import { emitTables, writeFixture } from "../harness/fixture";
import type { V1 } from "../harness/v1";
import type { StatsBlock } from "../../../src/stats-core";
import { readBlocks } from "../stats/drive";

/**
 * Task 11's sample-size and power calculator and the power simulator (v1 index.html: PW_INFO 13458-13466, pwArt 13479, pwNum 13480, pwRun 13481-13531; plRun 9007-9043), page-bound:
 * every expected value is what v1's page showed; the only hand-written inputs are the field strings of POWER_CASES and the arguments of SIM_CASES.
 *
 * - `power`: for each case, every field of the calculator set as a string (#pwTest, #pwSolve, #pwAlpha, #pwTails, #pwDrop, #pwEffect, #pwN, #pwPow, #pwK, #pwP, #pwDf; pwTestChange()
 *   is called first, then every field is set again, so the defaults it writes into #pwEffect never stand), then pwRun(). #pwOut is read back:
 *   - an error (`<p class="desc" style="color:var(--danger,…)">`, the only child) is recorded as `error`, its innerHTML (checked to equal its textContent);
 *   - otherwise #pwSentence's textContent is `sentence`, and the computed part is `blocks`: #pwOut without #pwSentence and the button row, read by stats/drive.ts's readBlocks (h4 →
 *     heading, p → note, table.stats-table → rows), with the last two notes, the static footer of 13527-13529 ("For your methods section or ethics form:" and "Power is worked out for one
 *     planned test…"), cut off by position; the capture checks they are the same in every case and records them once, with the Copy button's label, as `footer`.
 *   - `values`: what pwRun computed, read from v1 itself: the top-level calls pwRun made to pwSolveN, pwPower and pwSolveEffect are recorded by wrappers on v1's window (a call those
 *     functions make to one another is not top-level and is not recorded), so `n` is pwSolveN's first return (mode n) or the `n` pwRun passed (modes power and effect), `pw` pwPower's
 *     return and `e` pwSolveEffect's; `total` and `rec` are the integers v1 printed in the heading and in the dropout note.
 * - `sim`: plRun page-bound: #plD, #plN, #plK, #plSeed set as strings, plRun() called, the string v1 assigned to #plOut.innerHTML kept as `html` (an own innerHTML setter on #plOut records
 *   it before the element's own setter runs), and then read: a refusal is `warn`, the `span.ap-warn`'s innerHTML; otherwise `banner` (the div.ap-banner's innerHTML), `texts` (every `p`
 *   child's innerHTML, in order, each checked to occur in `html` as written, so the DOM did not re-serialise it), `svg` (`html` from `<svg` to `</svg>`: v1's string, since the DOM
 *   writes `<rect …/>` back as `<rect …></rect>`), and `last` (window._plLast). #plK is a select offering 100, 200 and 500 only; a case with another number of studies adds that
 *   option to the select first and is marked `kOffered: false` (plRun reads `parseInt(#plK.value)`, which is all that changes).
 * - `tables.json` (and, under --emit, src/data/power-tables.ts): PW_INFO, read through eval.
 */

export type PowerFields = { test: string; mode: string; alpha: string; tails: string; drop: string; effect: string; n: string; power: string; k: string; p: string; df: string };
export type PowerCall = { fn: "pwSolveN" | "pwPower" | "pwSolveEffect"; args: unknown[]; ret: unknown };
export type PowerCase = { id: string; input: PowerFields; error: string | null; blocks: StatsBlock[]; sentence: string | null; values: Record<string, number>; calls: PowerCall[] };
export type PowerFooter = { notes: string[]; button: string };
export type SimInput = { d: string; n: string; k: string; seed: string };
export type SimLast = { d: number; n: number; k: number; seed: number; sig: number; meanSig: number; pw: number };
export type SimCase = { id: string; input: SimInput; kOffered: boolean; html: string; warn: string | null; banner: string | null; texts: string[]; svg: string | null; last: SimLast | null };

type PwInfo = Record<string, { def: string }>;
const TESTS = ["ind", "paired", "one", "anova", "corr", "regr", "chisq"] as const;
const MODES = ["n", "power", "effect"] as const;
const FIELD_IDS: Record<keyof PowerFields, string> = {
  test: "pwTest", mode: "pwSolve", alpha: "pwAlpha", tails: "pwTails", drop: "pwDrop", effect: "pwEffect", n: "pwN", power: "pwPow", k: "pwK", p: "pwP", df: "pwDf",
};

/** The default case for a test and mode: PW_INFO's default effect, α .05, two-tailed, no dropout, n 30, power .80 (v1's field defaults, 1723-1733), 3 groups, 3 predictors, df 1. */
function base(info: PwInfo, test: string, mode: string): PowerFields {
  return { test, mode, alpha: "0.05", tails: "2", drop: "0", effect: info[test]!.def, n: "30", power: "0.80", k: "3", p: "3", df: "1" };
}

function powerCases(info: PwInfo): Array<{ id: string; input: PowerFields; wantError?: string }> {
  const out: Array<{ id: string; input: PowerFields; wantError?: string }> = [];
  const add = (id: string, test: string, mode: string, over: Partial<PowerFields> = {}, wantError?: string) => out.push({ id, input: { ...base(info, test, mode), ...over }, wantError });
  // The grid: 7 tests x 3 modes at the defaults
  for (const t of TESTS) for (const m of MODES) add(`${t}-${m}`, t, m);
  // One-tailed for the four tests that read #pwTails, in every mode; and anova with tails 1, which pwRun overrides to 2
  for (const t of ["ind", "paired", "one", "corr"]) for (const m of MODES) add(`${t}-${m}-one-tailed`, t, m, { tails: "1" });
  add("anova-n-tails-1-ignored", "anova", "n", { tails: "1" });
  // Dropout (mode n only shows it; pwRun reads it in every mode but uses it in mode n only)
  for (const t of ["ind", "paired", "anova", "corr", "regr", "chisq"]) add(`${t}-n-drop-20`, t, "n", { drop: "20" });
  add("ind-n-drop-12.5", "ind", "n", { drop: "12.5" });
  add("anova-n-k5-drop-33", "anova", "n", { k: "5", drop: "33" });
  add("ind-power-drop-20-unused", "ind", "power", { drop: "20" });
  add("ind-n-drop-negative", "ind", "n", { drop: "-5" });
  add("ind-n-drop-text", "ind", "n", { drop: "abc" });
  // Comma decimals and white space through pwNum
  add("ind-n-alpha-comma", "ind", "n", { alpha: "0,05" });
  add("ind-n-effect-comma", "ind", "n", { effect: "0,3" });
  add("corr-power-effect-spaces", "corr", "power", { effect: " 0.25 " });
  add("ind-n-alpha-01", "ind", "n", { alpha: "0.01" });
  add("ind-n-alpha-10", "ind", "n", { alpha: ".10" });
  // Other targets, sizes and designs
  add("ind-n-power-95", "ind", "n", { power: "0.95" });
  add("ind-n-power-50", "ind", "n", { power: "0.5" });
  add("ind-n-large-effect", "ind", "n", { effect: "1.2" });
  add("one-n-large-effect", "one", "n", { effect: "2" });
  add("ind-n-tiny-effect-rows-null", "ind", "n", { effect: "0.01", power: "0.5" });
  add("ind-power-n100-reaches", "ind", "power", { n: "100" });
  add("ind-power-n-rounds", "ind", "power", { n: "29.6" });
  add("anova-n-k6", "anova", "n", { k: "6" });
  add("anova-power-k20", "anova", "power", { k: "20" });
  add("anova-n-k-rounds", "anova", "n", { k: "3.6" });
  add("regr-n-p1", "regr", "n", { p: "1" });
  add("regr-n-p50", "regr", "n", { p: "50" });
  add("regr-effect-p10-n120", "regr", "effect", { p: "10", n: "120" });
  add("chisq-n-df4", "chisq", "n", { df: "4" });
  add("chisq-power-df100", "chisq", "power", { df: "100", n: "500" });
  add("corr-n-r-10", "corr", "n", { effect: "0.1" });
  add("corr-n-r-98", "corr", "n", { effect: "0.98" });
  add("corr-power-n4", "corr", "power", { n: "4" });
  add("f2-ten-or-more", "regr", "effect", { n: "6", p: "1", power: "0.99" });
  // Every label of the smallest-effect branch
  add("ind-effect-n10-large", "ind", "effect", { n: "10" });
  add("ind-effect-n200-small-medium", "ind", "effect", { n: "200" });
  add("ind-effect-n1000-below-small", "ind", "effect", { n: "1000" });
  add("corr-effect-n2000-below-small", "corr", "effect", { n: "2000" });
  add("anova-effect-n3-large", "anova", "effect", { n: "3" });
  add("chisq-effect-n10000", "chisq", "effect", { n: "10000" });
  // Every error path of pwRun, in its order
  add("err-alpha-0.6", "ind", "n", { alpha: "0.6" }, "Alpha must be between 0 and .5 (usually .05).");
  add("err-alpha-0.5", "ind", "n", { alpha: "0.5" }, "Alpha must be between 0 and .5 (usually .05).");
  add("err-alpha-0", "ind", "power", { alpha: "0" }, "Alpha must be between 0 and .5 (usually .05).");
  add("err-alpha-text", "ind", "effect", { alpha: "abc" }, "Alpha must be between 0 and .5 (usually .05).");
  add("err-drop-95", "ind", "n", { drop: "95" }, "Dropout must be below 90%.");
  add("err-drop-90", "anova", "n", { drop: "90" }, "Dropout must be below 90%.");
  add("err-drop-95-power-mode", "ind", "power", { drop: "95" }, "Dropout must be below 90%.");
  add("err-k-2", "anova", "n", { k: "2" }, "Give 3 to 20 groups. For two groups use the independent-samples t-test.");
  add("err-k-21", "anova", "power", { k: "21" }, "Give 3 to 20 groups. For two groups use the independent-samples t-test.");
  add("err-k-text", "anova", "effect", { k: "x" }, "Give 3 to 20 groups. For two groups use the independent-samples t-test.");
  add("err-p-0", "regr", "n", { p: "0" }, "Give 1 to 50 predictors.");
  add("err-p-51", "regr", "power", { p: "51" }, "Give 1 to 50 predictors.");
  add("err-df-101", "chisq", "n", { df: "101" }, "Give the degrees of freedom, 1 to 100.");
  add("err-df-0", "chisq", "effect", { df: "0" }, "Give the degrees of freedom, 1 to 100.");
  add("err-effect-0", "ind", "n", { effect: "0" }, "The effect size must be above zero.");
  add("err-effect-negative-power-mode", "paired", "power", { effect: "-0.4" }, "The effect size must be above zero.");
  add("err-effect-text", "anova", "n", { effect: "big" }, "The effect size must be above zero.");
  add("err-r-.99", "corr", "n", { effect: ".99" }, "r must be below 1.");
  add("err-r-1.2-power-mode", "corr", "power", { effect: "1.2" }, "r must be below 1.");
  add("err-power-.4", "ind", "n", { power: ".4" }, "Power must be between .50 and .9999 (usually .80).");
  add("err-power-.9999", "one", "n", { power: ".9999" }, "Power must be between .50 and .9999 (usually .80).");
  add("err-power-.4-effect-mode", "ind", "effect", { power: ".4" }, "Power must be between .50 and .9999 (usually .80).");
  add("err-n-2-power-mode", "ind", "power", { n: "2" }, "Give the sample size (3 or more).");
  add("err-n-2-effect-mode", "ind", "effect", { n: "2" }, "Give the sample size (3 or more).");
  add("err-n-text", "chisq", "power", { n: "lots" }, "Give the sample size (3 or more).");
  add("err-exceeds-200000", "ind", "n", { effect: ".001" }, "That effect is so small that the sample would exceed 200,000. Check the effect size.");
  add("err-too-small-design-corr", "corr", "power", { n: "3" }, "That sample is too small for this test and design.");
  add("err-too-small-design-regr", "regr", "power", { n: "4", p: "3" }, "That sample is too small for this test and design.");
  add("err-no-effect-in-range-regr", "regr", "effect", { n: "5", p: "3" }, "No effect in the usual range reaches that power with this sample.");
  add("err-no-effect-in-range-corr", "corr", "effect", { n: "3" }, "No effect in the usual range reaches that power with this sample.");
  return out;
}

const SIM_CASES: Array<{ id: string; input: SimInput; wantWarn?: string }> = [
  { id: "d0.5-n15-k200-seed1", input: { d: "0.5", n: "15", k: "200", seed: "1" } },
  { id: "d0.5-n120-k200-seed1", input: { d: "0.5", n: "120", k: "200", seed: "1" } },
  { id: "d0.2-n30-k50-seed42", input: { d: "0.2", n: "30", k: "50", seed: "42" } },
  { id: "d1.5-n5-k10-seed7", input: { d: "1.5", n: "5", k: "10", seed: "7" } },
  { id: "d2-n2000-k5-seed3", input: { d: "2", n: "2000", k: "5", seed: "3" } },
  { id: "d0.5-n30-k100-seed1", input: { d: "0.5", n: "30", k: "100", seed: "1" } },
  { id: "d0.8-n64-k500-seed9", input: { d: "0.8", n: "64", k: "500", seed: "9" } },
  { id: "d0.1-n5-k100-seed5-few-sig", input: { d: "0.1", n: "5", k: "100", seed: "5" } },
  { id: "d0.1-n5-k5-seed2-none-sig", input: { d: "0.1", n: "5", k: "5", seed: "2" } },
  // mean(pos) just above d*1.1 (1.1001 d and 1.1084 d): the "overstate" sentence, which a threshold of 1.2 would not give
  { id: "d0.5-n64-k100-seed3-just-over-1.1", input: { d: "0.5", n: "64", k: "100", seed: "3" } },
  { id: "d0.5-n64-k200-seed2-over-1.1", input: { d: "0.5", n: "64", k: "200", seed: "2" } },
  { id: "d-comma-0,7-n20", input: { d: "0,7", n: "20", k: "200", seed: "11" } },
  { id: "seed-0-falls-to-1", input: { d: "0.5", n: "15", k: "200", seed: "0" } },
  { id: "seed-text-falls-to-1", input: { d: "0.5", n: "15", k: "200", seed: "abc" } },
  { id: "warn-d-0.05", input: { d: "0.05", n: "30", k: "200", seed: "1" }, wantWarn: "Choose a true effect size d between 0.1 and 2." },
  { id: "warn-d-2.5", input: { d: "2.5", n: "30", k: "200", seed: "1" }, wantWarn: "Choose a true effect size d between 0.1 and 2." },
  { id: "warn-n-3", input: { d: "0.5", n: "3", k: "200", seed: "1" }, wantWarn: "Choose between 5 and 2000 people per group." },
  { id: "warn-n-2001", input: { d: "0.5", n: "2001", k: "200", seed: "1" }, wantWarn: "Choose between 5 and 2000 people per group." },
];

/** Wraps v1's pwSolveN, pwPower and pwSolveEffect so that pwRun's own (top-level) calls are recorded; returns the record list and the undo. */
function spy(v1: V1): { calls: PowerCall[]; restore(): void } {
  const w = v1.window as unknown as Record<string, unknown>;
  const names = ["pwSolveN", "pwPower", "pwSolveEffect"] as const;
  const orig: Record<string, (...a: unknown[]) => unknown> = {};
  const calls: PowerCall[] = [];
  let depth = 0;
  for (const name of names) {
    const fn = w[name];
    if (typeof fn !== "function") throw new Error(`power: v1 has no function ${name}`);
    orig[name] = fn as (...a: unknown[]) => unknown;
    w[name] = function (this: unknown, ...args: unknown[]) {
      const top = depth === 0;
      const snap = top ? (JSON.parse(JSON.stringify(args)) as unknown[]) : [];
      depth++;
      let ret: unknown;
      try { ret = orig[name]!.apply(this, args); } finally { depth--; }
      if (top) calls.push({ fn: name, args: snap, ret });
      return ret;
    };
  }
  return { calls, restore() { for (const name of names) w[name] = orig[name]; } };
}

const intOf = (s: string | undefined, what: string): number => {
  if (s === undefined || !/^\d+$/.test(s)) throw new Error(`power: ${what} is not an integer: ${s}`);
  return parseInt(s, 10);
};

function capturePower(v1: V1, info: PwInfo): { cases: PowerCase[]; footer: PowerFooter } {
  const d = v1.document;
  const out = d.getElementById("pwOut");
  if (!out) throw new Error("v1 has no #pwOut");
  const cases: PowerCase[] = [];
  let footer: PowerFooter | null = null;
  for (const c of powerCases(info)) {
    const setAll = () => {
      for (const [key, id] of Object.entries(FIELD_IDS) as Array<[keyof PowerFields, string]>) {
        v1.setValue(id, c.input[key]);
        if ((d.getElementById(id) as HTMLInputElement).value !== c.input[key]) throw new Error(`power ${c.id}: #${id} did not take ${JSON.stringify(c.input[key])}`);
      }
    };
    setAll();
    v1.call("pwTestChange");
    setAll();
    out.innerHTML = "";
    const s = spy(v1);
    try { v1.call("pwRun"); } finally { s.restore(); }
    const kids = Array.from(out.children);
    const first = kids[0];
    if (kids.length === 1 && first && first.tagName === "P" && (first.getAttribute("style") ?? "").includes("color:var(--danger")) {
      if (first.innerHTML !== first.textContent) throw new Error(`power ${c.id}: the error ${JSON.stringify(first.innerHTML)} is not plain text`);
      if (c.wantError !== undefined && first.innerHTML !== c.wantError) throw new Error(`power ${c.id}: expected the error ${JSON.stringify(c.wantError)}, v1 gave ${JSON.stringify(first.innerHTML)}`);
      if (c.wantError === undefined) throw new Error(`power ${c.id}: v1 refused with ${JSON.stringify(first.innerHTML)}`);
      cases.push({ id: c.id, input: c.input, error: first.innerHTML, blocks: [], sentence: null, values: {}, calls: s.calls });
      continue;
    }
    if (c.wantError !== undefined) throw new Error(`power ${c.id}: expected the error ${JSON.stringify(c.wantError)}, v1 computed a result`);
    const sentenceEl = d.getElementById("pwSentence");
    if (!sentenceEl) throw new Error(`power ${c.id}: no #pwSentence`);
    const sentence = sentenceEl.textContent ?? "";
    if (sentenceEl.innerHTML !== sentence) throw new Error(`power ${c.id}: #pwSentence holds markup`);
    const button = out.querySelector("div.row button")?.textContent ?? "";
    const clone = out.cloneNode(true) as Element;
    clone.querySelector("#pwSentence")?.remove();
    clone.querySelector("div.row")?.remove();
    const all = readBlocks(clone, "power " + c.id);
    const tail = all.slice(-2), blocks = all.slice(0, -2);
    if (tail.length !== 2 || tail.some((b) => b.kind !== "note")) throw new Error(`power ${c.id}: the footer is not two notes`);
    const notes = tail.map((b) => (b as { html: string }).html);
    if (!notes[0]!.includes("For your methods section") || !notes[1]!.startsWith("Power is worked out for one planned test")) throw new Error(`power ${c.id}: unexpected footer ${JSON.stringify(notes)}`);
    if (footer === null) footer = { notes, button };
    else if (JSON.stringify(footer) !== JSON.stringify({ notes, button })) throw new Error(`power ${c.id}: the footer differs from the first case's`);

    // values, from v1's own calls and printed integers
    const mode = c.input.mode, values: Record<string, number> = {};
    const top = (fn: PowerCall["fn"]) => s.calls.filter((x) => x.fn === fn);
    if (mode === "n") {
      const solved = top("pwSolveN"), pw = top("pwPower");
      if (solved.length !== 4 || pw.length !== 1) throw new Error(`power ${c.id}: mode n made ${solved.length} pwSolveN and ${pw.length} pwPower calls`);
      values.n = solved[0]!.ret as number;
      const head = blocks[0]!.kind === "heading" ? blocks[0]!.text : "";
      const m = /^(\d+) people in each group \((\d+) in total\)$/.exec(head) ?? /^(\d+) people$/.exec(head);
      if (!m || intOf(m[1], "n") !== values.n) throw new Error(`power ${c.id}: heading ${JSON.stringify(head)}`);
      values.total = intOf(m[2] ?? m[1], "total");
      values.pw = pw[0]!.ret as number;
      const dropNote = blocks.find((b) => b.kind === "note" && b.html.startsWith("With ") && b.html.includes("dropout"));
      if (dropNote && dropNote.kind === "note") {
        const r = /recruit about <b>(?:(\d+) per group \((\d+) in total\)|(\d+))<\/b>/.exec(dropNote.html);
        if (!r) throw new Error(`power ${c.id}: dropout note ${dropNote.html}`);
        values.rec = intOf(r[2] ?? r[3], "rec");
      }
    } else if (mode === "power") {
      const pw = top("pwPower");
      if (pw.length !== 1) throw new Error(`power ${c.id}: mode power made ${pw.length} pwPower calls`);
      values.n = pw[0]!.args[1] as number;
      values.pw = pw[0]!.ret as number;
    } else {
      const e = top("pwSolveEffect");
      if (e.length !== 1) throw new Error(`power ${c.id}: mode effect made ${e.length} pwSolveEffect calls`);
      values.n = e[0]!.args[1] as number;
      values.e = e[0]!.ret as number;
    }
    cases.push({ id: c.id, input: c.input, error: null, blocks, sentence, values, calls: s.calls });
  }
  if (!footer) throw new Error("power: no case computed a result");
  return { cases, footer };
}

function captureSim(v1: V1): SimCase[] {
  const d = v1.document, w = v1.window as unknown as Record<string, unknown>;
  const out = d.getElementById("plOut");
  const kSel = d.getElementById("plK") as HTMLSelectElement | null;
  if (!out || !kSel) throw new Error("v1 has no #plOut or #plK");
  const offered = Array.from(kSel.options).map((o) => o.value);
  if (offered.join(",") !== "100,200,500") throw new Error(`power: #plK offers ${offered.join(",")}`);
  const proto = Object.getPrototypeOf(Object.getPrototypeOf(out)) as object; // HTMLDivElement.prototype → HTMLElement.prototype; innerHTML lives on Element.prototype
  let desc: PropertyDescriptor | undefined, p: object | null = proto;
  while (p && !desc) { desc = Object.getOwnPropertyDescriptor(p, "innerHTML"); p = Object.getPrototypeOf(p) as object | null; }
  if (!desc?.set || !desc.get) throw new Error("power: no innerHTML accessor");
  let assigned: string | null = null;
  Object.defineProperty(out, "innerHTML", { configurable: true, get() { return desc.get!.call(this) as string; }, set(v: string) { assigned = v; desc.set!.call(this, v); } });
  const cases: SimCase[] = [];
  try {
    for (const c of SIM_CASES) {
      const kOffered = offered.includes(c.input.k);
      if (!kOffered && !Array.from(kSel.options).some((o) => o.value === c.input.k)) { const o = d.createElement("option"); o.textContent = c.input.k; kSel.appendChild(o); }
      v1.setValue("plD", c.input.d); v1.setValue("plN", c.input.n); v1.setValue("plK", c.input.k); v1.setValue("plSeed", c.input.seed);
      if (kSel.value !== c.input.k) throw new Error(`power sim ${c.id}: #plK did not take ${c.input.k}`);
      assigned = null;
      w._plLast = undefined;
      v1.call("plRun");
      const html = assigned as string | null;
      if (html === null) throw new Error(`power sim ${c.id}: plRun assigned nothing`);
      const warnEl = out.querySelector("span.ap-warn");
      if (warnEl) {
        if (out.children.length !== 1 || warnEl.innerHTML !== warnEl.textContent) throw new Error(`power sim ${c.id}: unexpected refusal ${html}`);
        if (c.wantWarn !== warnEl.innerHTML) throw new Error(`power sim ${c.id}: expected ${JSON.stringify(c.wantWarn)}, v1 gave ${JSON.stringify(warnEl.innerHTML)}`);
        if (w._plLast !== undefined) throw new Error(`power sim ${c.id}: a refusal set _plLast`);
        cases.push({ id: c.id, input: c.input, kOffered, html, warn: warnEl.innerHTML, banner: null, texts: [], svg: null, last: null });
        continue;
      }
      if (c.wantWarn !== undefined) throw new Error(`power sim ${c.id}: expected the warning ${c.wantWarn}, v1 ran`);
      const banner = out.querySelector("div.ap-banner");
      if (!banner || banner !== out.firstElementChild || banner.innerHTML !== banner.textContent) throw new Error(`power sim ${c.id}: no plain banner first`);
      const texts = Array.from(out.children).filter((el) => el.tagName === "P").map((el) => el.innerHTML);
      for (const t of texts) if (!html.includes(">" + t + "</p>")) throw new Error(`power sim ${c.id}: the paragraph ${JSON.stringify(t)} is not in v1's string as written`);
      const a = html.indexOf("<svg"), b = html.indexOf("</svg>");
      if (a < 0 || b < a) throw new Error(`power sim ${c.id}: no svg`);
      const raw = w._plLast as SimLast | undefined;
      if (!raw || Object.keys(raw).join(",") !== "d,n,k,seed,sig,meanSig,pw") throw new Error(`power sim ${c.id}: _plLast is ${JSON.stringify(raw)}`);
      const lastOut: SimLast = { d: raw.d, n: raw.n, k: raw.k, seed: raw.seed, sig: raw.sig, meanSig: raw.meanSig, pw: raw.pw };
      cases.push({ id: c.id, input: c.input, kOffered, html, warn: null, banner: banner.innerHTML, texts, svg: html.slice(a, b + 6), last: lastOut });
    }
  } finally {
    delete (out as unknown as Record<string, unknown>).innerHTML;
  }
  return cases;
}

export const power: Engine = {
  name: "power",
  async capture(v1, opts) {
    const PW_INFO = v1.eval<PwInfo>("PW_INFO");
    if (Object.keys(PW_INFO).join(",") !== "ind,paired,one,anova,corr,regr,chisq") throw new Error(`power: PW_INFO keys ${Object.keys(PW_INFO).join(",")}`);
    const { cases, footer } = capturePower(v1, PW_INFO);
    const sim = captureSim(v1);
    const errors = cases.filter((c) => c.error !== null).length;
    const byTestMode: Record<string, number> = {};
    for (const c of cases) if (c.error === null) byTestMode[`${c.input.test}/${c.input.mode}`] = (byTestMode[`${c.input.test}/${c.input.mode}`] ?? 0) + 1;
    console.log(`power: ${cases.length} calculator cases (${cases.length - errors} results, ${errors} errors; by test/mode ${JSON.stringify(byTestMode)}), ${sim.length} simulator cases (${sim.filter((s) => s.warn).length} warnings)`);
    return [
      emitTables(v1, "power", "power-tables", { PW_INFO }, opts),
      writeFixture("power", "cases", { cases, footer, sim }, v1, opts.check),
    ];
  },
};
