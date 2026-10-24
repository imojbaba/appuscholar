import type { Engine } from "../harness/engines";
import { writeFixture } from "../harness/fixture";

/**
 * Task 14's AI-use statement builder (v1 index.html: AIU_MONTHS, aiuDate, aiuJoin, aiuInRange 5461-5467; aiuBuild 5492-5537), page-bound: every expected string is what v1 wrote into
 * #aiuOut or toasted. Reference only: aiuOpen 5468 and aiuRender 5479, which the capture calls to open the dialog and to render the row ticks from the log.
 *
 * - The log: 12 entries over three dates (one on 2026-09-01, five on 2026-09-15, six on 2026-10-02) and three providers (gemini and claude, which PROVIDERS names, with models, and
 *   `ollama`, which it does not, with no model), stored as `localStorage.appu_ailog`; each entry's `k` and `g` are read from v1's own AIU_RULES (through eval) and aiuClassify's
 *   fallback, so the fixture does not depend on the port's classifier. Seven kinds: two text, two feedback, two explain and `other help`.
 * - `date`: aiuDate on 9 strings (the regex, the month names, a month out of range, the String(d||'') fallback); `join`: aiuJoin on 0 to 4 items.
 * - `range`: aiuInRange for 6 (from, to) pairs: #aiuFrom and #aiuTo set, the list it returns.
 * - `cases`: after aiuOpen(), for each case: #aiuFrom and #aiuTo set and aiuRender() called (the page calls it on change), the rows outside `keep` unticked, #aiuOther, #aiuFmt and the
 *   five checkboxes (#aiuOwn, #aiuReword, #aiuCite, #aiuFacts, #aiuNoData) set, `appu_style_on`, `appu_style_meta` and `appu_style_samples` stored, #aiuOut cleared, aiuBuild()
 *   called. Recorded: the input, `list` (aiuInRange() just before the call), `keep` (the data-k of every ticked .aiuRow), `out` (#aiuOut.value, or null when v1 toasted instead),
 *   `toast`, and `arms`, the sentence arms of 5492-5536 the output shows (named below, read from the input and the text). The grid is 3 formats x 4 tick sets (none, the text
 *   kinds, the feedback kinds, all seven) x other ''/'Grammarly' x ticks all/none/all but reword x style on/off (144), then 14 cases for the arms the grid does not reach.
 */

export type AiuEntry = { d: string; p: string; m: string; k: string; g: string };
export type AiuTicks = { own: boolean; reword: boolean; cite: boolean; facts: boolean; noData: boolean };
export type AiuStyle = { on: boolean; decl: string; samples: number };
export type AiuCaseInput = { from: string; to: string; keepSet: string; other: string; fmt: string; ticks: AiuTicks; style: AiuStyle };
export type AiuCase = { id: string; input: AiuCaseInput; list: AiuEntry[]; keep: string[]; out: string | null; toast: string | null; arms: string[] };

const D1 = "2026-09-01", D2 = "2026-09-15", D3 = "2026-10-02";
const LOG_SPEC: Array<[d: string, p: string, m: string, k: string]> = [
  [D1, "gemini", "gemini-3.8-flash", "continuing my draft"],
  [D2, "gemini", "gemini-3.8-flash", "grammar and polish"],
  [D2, "claude", "claude-haiku-5-5", "feedback on my draft"],
  [D2, "claude", "claude-haiku-5-5", "grammar and polish"],
  [D2, "ollama", "", "summarising a paper"],
  [D2, "gemini", "gemini-2.5-flash", "other help"],
  [D3, "claude", "claude-haiku-5-5", "practice viva questions"],
  [D3, "gemini", "gemini-3.8-flash", "continuing my draft"],
  [D3, "ollama", "", "explaining a concept"],
  [D3, "gemini", "gemini-3.8-flash", "grammar and polish"],
  [D3, "claude", "claude-haiku-5-5", "feedback on my draft"],
  [D3, "gemini", "gemini-3.8-flash", "explaining a concept"],
];
const KEEP_SETS: Record<string, string[]> = {
  none: [],
  text: ["continuing my draft", "grammar and polish"],
  feedback: ["feedback on my draft", "practice viva questions"],
  all: ["continuing my draft", "grammar and polish", "feedback on my draft", "summarising a paper", "other help", "practice viva questions", "explaining a concept"],
  explain: ["summarising a paper", "explaining a concept"],
  other: ["other help"],
};
const TICKS: Record<string, AiuTicks> = {
  all: { own: true, reword: true, cite: true, facts: true, noData: true },
  none: { own: false, reword: false, cite: false, facts: false, noData: false },
  "reword-off": { own: true, reword: false, cite: true, facts: true, noData: true },
};
const STYLE_ON: AiuStyle = { on: true, decl: "2026-08-20", samples: 3 };
const STYLE_OFF: AiuStyle = { on: false, decl: "2026-08-20", samples: 3 };

function cases(): Array<{ id: string; input: AiuCaseInput }> {
  const out: Array<{ id: string; input: AiuCaseInput }> = [];
  for (const fmt of ["course", "thesis", "journal"])
    for (const keepSet of ["none", "text", "feedback", "all"])
      for (const other of ["", "Grammarly"])
        for (const t of ["all", "none", "reword-off"])
          for (const [sn, style] of [["style-on", STYLE_ON], ["style-off", STYLE_OFF]] as const)
            out.push({ id: `${fmt}-${keepSet}-${other ? "other" : "no-other"}-ticks-${t}-${sn}`, input: { from: D1, to: D3, keepSet, other, fmt, ticks: TICKS[t]!, style } });
  const add = (id: string, over: Partial<AiuCaseInput>) => out.push({ id, input: { from: D1, to: D3, keepSet: "all", other: "", fmt: "course", ticks: TICKS.all!, style: STYLE_OFF, ...over } });
  add("one-entry-refused", { from: D1, to: D1, keepSet: "none" });
  add("one-entry-course", { from: D1, to: D1 });
  add("one-entry-thesis-style-one-sample", { from: D1, to: D1, fmt: "thesis", style: { on: true, decl: "2026-08-20", samples: 1 } });
  add("one-date-journal", { from: D2, to: D2, fmt: "journal", style: { on: true, decl: "2026-08-20", samples: 1 } });
  add("no-log-in-range-course", { from: "2026-11-01", to: "2026-11-30" });
  add("no-log-in-range-journal", { from: "2026-11-01", to: "2026-11-30", fmt: "journal" });
  add("no-log-in-range-other-thesis", { from: "2026-11-01", to: "2026-11-30", fmt: "thesis", other: "  ChatGPT in another window to brainstorm headings. . ", style: STYLE_ON });
  add("dates-empty", { from: "", to: "", fmt: "thesis" });
  add("to-only", { from: "", to: D2, keepSet: "explain", fmt: "journal" });
  add("other-only-kinds-trailing-dots", { keepSet: "other", other: "Grammarly for spelling...", fmt: "journal", ticks: TICKS["reword-off"]! });
  add("style-on-no-decl", { style: { on: true, decl: "", samples: 3 } });
  add("style-on-no-samples", { style: { on: true, decl: "2026-08-20", samples: 0 } });
  add("explain-only-reword-off", { keepSet: "explain", ticks: TICKS["reword-off"]! });
  add("refused-with-ticks-off", { keepSet: "none", fmt: "journal", ticks: TICKS.none! });
  return out;
}

const DATES = ["2026-03-05", "2026-12-31", "2026-01-09", "2026-13-01", "2026-00-10", "2026-3-5", "", "5 March 2026", "2026-03-05T10:00"];
const JOINS = [[], ["a"], ["a", "b"], ["a", "b", "c"], ["Google Gemini (gemini-3.8-flash)", "Claude (Anthropic) (claude-haiku-5-5)", "ollama", "x"]];
const RANGES: Array<[string, string]> = [[D1, D3], ["", ""], [D2, ""], ["", D1], [D2, D2], ["2026-11-01", "2026-09-01"]];

/** The arms of aiuBuild (5492-5536) a case reaches, from its input and v1's text. */
function armsOf(input: AiuCaseInput, list: AiuEntry[], keep: string[], out: string | null, toast: string | null): string[] {
  const a: string[] = [];
  if (out === null) { a.push(list.length === 1 ? "refuse-one" : "refuse-many"); if (toast === null) throw new Error("aiustatement: neither text nor toast"); return a; }
  const J = input.fmt === "journal", use = list.filter((e) => keep.includes(e.k));
  if (out.startsWith("Use of AI tools")) return [J ? "none-used-journal" : "none-used"];
  a.push("head-" + (J ? "journal" : input.fmt === "thesis" ? "thesis" : "course"));
  if (use.length) {
    a.push(J ? "first-journal" : "first");
    a.push(new Set(use.map((e) => e.d)).size === 1 ? "when-on" : "when-between");
    if (use.some((e) => e.m === "")) a.push("pair-no-model");
    if (use.some((e) => e.p === "ollama")) a.push("pair-unknown-provider");
    for (const g of ["text", "feedback", "explain", "other"]) if (use.some((e) => e.g === g)) a.push("group-" + g);
  }
  if (input.other.trim()) a.push(use.length ? "other-outside" : "other-only");
  if (input.other.trim() !== input.other.trim().replace(/[.\s]+$/, "")) a.push("other-trailing-stripped");
  const o = Object.values(input.ticks).filter(Boolean).length;
  if (o) a.push((J ? "ticks-journal-" : "ticks-") + o);
  if (out.includes("profile of")) a.push(input.style.samples === 1 ? "style-one-sample" : "style-samples");
  if (out.includes("[Say which passages")) a.push("say-which-passages");
  if (out.includes("In all, ")) a.push(use.length === 1 ? "thesis-count-one" : "thesis-count");
  a.push(J ? "close-journal" : "close");
  return a;
}

export const aiustatement: Engine = {
  name: "aiustatement",
  async capture(v1, opts) {
    const d = v1.document, ls = v1.window.localStorage;
    const el = <T extends HTMLElement>(id: string): T => {
      const e = d.getElementById(id);
      if (!e) throw new Error(`aiustatement: v1 has no #${id}`);
      return e as T;
    };
    const setVal = (id: string, value: string) => {
      v1.setValue(id, value);
      if (el<HTMLInputElement>(id).value !== value) throw new Error(`aiustatement: #${id} did not take ${JSON.stringify(value)}`);
    };
    const plain = <T>(x: unknown): T => JSON.parse(JSON.stringify(x)) as T;

    // The log, with v1's own kinds and groups
    const rules = plain<Array<[string, string]>>(v1.eval("AIU_RULES.map(r=>[r[1],r[2]])"));
    const fallback = plain<{ k: string; g: string }>(v1.call("aiuClassify", "Something new"));
    if (fallback.k !== "other help") throw new Error(`aiustatement: aiuClassify's fallback is ${fallback.k}`);
    const groupOf = (k: string): string => {
      if (k === fallback.k) return fallback.g;
      const r = rules.find(([rk]) => rk === k);
      if (!r) throw new Error(`aiustatement: no AIU_RULES row gives ${k}`);
      return r[1];
    };
    const log: AiuEntry[] = LOG_SPEC.map(([dd, p, m, k]) => ({ d: dd, p, m, k, g: groupOf(k) }));
    ls.clear();
    ls.setItem("appu_ailog", JSON.stringify(log));

    const date = DATES.map((s) => ({ in: s, out: v1.call<string>("aiuDate", s) }));
    const join = JOINS.map((a) => ({ in: a, out: v1.call<string>("aiuJoin", a.slice()) }));

    v1.call("aiuOpen");
    if (el<HTMLInputElement>("aiuFrom").value !== D1 || el<HTMLInputElement>("aiuTo").value !== D3) throw new Error("aiustatement: aiuOpen did not set the log's dates");
    const range = RANGES.map(([from, to]) => {
      setVal("aiuFrom", from); setVal("aiuTo", to);
      return { from, to, list: plain<AiuEntry[]>(v1.call("aiuInRange")) };
    });

    const out: AiuCase[] = [];
    for (const c of cases()) {
      const i = c.input;
      setVal("aiuFrom", i.from); setVal("aiuTo", i.to);
      v1.call("aiuRender");
      const want = KEEP_SETS[i.keepSet]!;
      for (const box of Array.from(d.querySelectorAll<HTMLInputElement>("#aiuRows .aiuRow"))) box.checked = want.includes(box.getAttribute("data-k") ?? "");
      setVal("aiuOther", i.other);
      setVal("aiuFmt", i.fmt);
      const ids: Record<keyof AiuTicks, string> = { own: "aiuOwn", reword: "aiuReword", cite: "aiuCite", facts: "aiuFacts", noData: "aiuNoData" };
      for (const [k, id] of Object.entries(ids) as Array<[keyof AiuTicks, string]>) el<HTMLInputElement>(id).checked = i.ticks[k];
      ls.setItem("appu_style_on", i.style.on ? "1" : "0");
      ls.setItem("appu_style_meta", JSON.stringify(i.style.decl ? { decl: i.style.decl } : {}));
      ls.setItem("appu_style_samples", JSON.stringify(Array.from({ length: i.style.samples }, (_, n) => ({ id: "s" + n, text: "My own paragraph " + n }))));
      const list = plain<AiuEntry[]>(v1.call("aiuInRange"));
      const keep = Array.from(d.querySelectorAll<HTMLInputElement>("#aiuRows .aiuRow")).filter((b) => b.checked).map((b) => b.getAttribute("data-k") ?? "");
      const ta = el<HTMLTextAreaElement>("aiuOut");
      ta.value = "";
      v1.toasts.length = 0;
      v1.call("aiuBuild");
      const toasts = v1.toasts.splice(0, v1.toasts.length);
      const text = ta.value === "" ? null : ta.value;
      if ((text === null) === (toasts.length === 0) || toasts.length > 1) throw new Error(`aiustatement ${c.id}: text ${JSON.stringify(text)} and ${toasts.length} toasts`);
      const toast = toasts[0] ?? null;
      out.push({ id: c.id, input: i, list, keep, out: text, toast, arms: armsOf(i, list, keep, text, toast) });
    }
    ls.clear();

    const arms: Record<string, number> = {};
    for (const c of out) for (const a of c.arms) arms[a] = (arms[a] ?? 0) + 1;
    console.log(`aiustatement: ${date.length} dates, ${join.length} joins, ${range.length} ranges, ${out.length} cases (${out.filter((c) => c.out === null).length} refused); arms ${JSON.stringify(arms)}`);
    return [writeFixture("aiustatement", "cases", { log, date, join, range, cases: out }, v1, opts.check)];
  },
};
