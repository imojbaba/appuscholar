// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runStats, STATS_TEST_OPTIONS, statsParseText, tgCheck, tgCountsText, TG_CHECK_FALLBACK, TG_CHECK_TEXT, TG_DEMO, TG_RES, type StatsForm, type StatsTestKey } from "@appuscholar/core";
import en from "../messages/en.json";
import statsEn from "../messages/tools/stats.en.json";
import statsHi from "../messages/tools/stats.hi.json";

/*
 * Task B3: "Which test fits my data?", the predict-first demo and "Check my numbers" in the Data tab (v1 tgToggle..tgUse 12441-12483, tgDemo 12458-12481, tgCheck 12534-12561).
 * The expected values are core's golden fixtures (packages/core/test/golden/guide/cases.json: v1 driven in jsdom), read here, not retyped.
 */

type Path = { answers: Record<string, string>; out: { ask?: string; res?: { id: string; built: boolean; name: string; keys: string[]; why: string; alt: Array<[string, string]>; note?: string } } };
type Check = { id: string; dataset: string; sel: { num: string; grp: string; c1: string; c2: string }; fallback: string | null; text: string; blocks: Array<{ kind: string; rows?: string[][]; html?: string }> };
const GOLD = JSON.parse(readFileSync(join(__dirname, "../../../packages/core/test/golden/guide/cases.json"), "utf8")) as {
  paths: Path[]; why: Array<{ answers: Record<string, string>; id: string; items: string[]; text: string }>; datasets: Array<{ id: string; csv: string }>; checks: Check[];
};

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  store: {} as Record<string, unknown>,
  writes: [] as Array<{ kind: string; json: string }>,
  confirm: vi.fn(() => true),
  insert: vi.fn(async (_html: string, _o?: unknown) => true),
  api: vi.fn(),
  askPd: vi.fn(async (_sc: unknown) => ({ answer: "send", leave: [] as string[] }) as { answer: "send" | "mask" | "cancel"; leave: string[] }),
  calls: [] as string[]
}));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/export/download", () => ({ downloadBlob: vi.fn(), safeFileName: (s: string) => s }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ projectId: "p1", docOpen: false, openDocument: vi.fn() }) }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1" }, settings: { field: "psychology" } }) }));
vi.mock("@/lib/editor/docAccess", () => ({ useDocAccess: () => ({ insertBlock: h.insert }) }));
vi.mock("@/lib/api", () => {
  class ApiError extends Error { constructor(public status: number, public code: string, public detail?: string) { super(`${status} ${code}`); } }
  return { apiFetch: (...a: unknown[]) => { h.calls.push("api"); return h.api(...a); }, ApiError };
});
vi.mock("@/lib/ai/useCallAI", () => ({ useCallAI: () => async () => { h.calls.push("callAI"); return "x"; } }));
vi.mock("@/lib/ai/pdDialog", () => ({ askPd: async (sc: unknown) => { h.calls.push("askPd"); return h.askPd(sc); } }));
// The Data tab reads the participant list (Task 10), which needs the vault's state. These tests have no vault, so no list is used and the personal-details box is v1's.
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => ({ status: "off" }) }));
vi.mock("@/lib/blobs/useProjectBlob", async () => {
  const { useReducer, useRef, useEffect } = await import("react");
  return {
    useProjectBlob: (kind: string) => {
      const [, force] = useReducer((n: number) => n + 1, 0);
      const alive = useRef(true);
      useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
      return {
        value: h.store[kind] ?? null, loading: false, locked: false, broken: false, error: false, readOnly: false,
        set: (next: unknown) => {
          if (!alive.current) return;
          const v = typeof next === "function" ? (next as (p: unknown) => unknown)(h.store[kind] ?? null) : next;
          h.store[kind] = v;
          h.writes.push({ kind, json: JSON.stringify(v) });
          force();
        },
        flush: async () => true
      };
    }
  };
});

import { Panel } from "../components/tools/stats/Panel";
import { getLab, resetLabs } from "../lib/tools/stats/lab";
import { backAnswers, getGuide, otherOption, resetGuides } from "../lib/tools/stats/guide";
import { sentenceIsClear } from "../lib/tools/stats/guideDemo";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.setConfig({ testTimeout: 90_000, hookTimeout: 120_000 });
const E = { ...(en as Record<string, string>), ...(statsEn as Record<string, string>) };
const hi = statsHi as Record<string, string>;
const roots: Root[] = [];
const tid = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const all = (id: string) => [...document.body.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
const text = (id: string) => tid(id)?.textContent ?? "";
const fill = (s: string | undefined, vars: Record<string, string | number> = {}) => (s ?? "").replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

async function mount(): Promise<Root> {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(<Panel tab="data" projectId="p1" />); });
  return root;
}
async function type(testId: string, value: string) {
  const el = tid(testId) as HTMLInputElement | HTMLTextAreaElement;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function pick(testId: string, value: string) {
  const el = tid(testId) as HTMLSelectElement;
  await act(async () => { el.value = value; el.dispatchEvent(new Event("change", { bubbles: true })); });
}
async function click(testId: string) {
  const el = tid(testId);
  if (!el) throw new Error("no element " + testId);
  await act(async () => { el.click(); });
}
async function settle(ms = 0) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }
async function load(csv: string) {
  await type("stats-paste", csv);
  await click("stats-parse");
  await settle();
}
/** Opens the guide and gives the answers a student would, reading each question from the screen. Returns the keys of the questions asked, in order. */
async function walk(answers: Record<string, string>): Promise<string[]> {
  if (!tid("stats-guide-panel")) await click("stats-guide-toggle");
  else if (tid("stats-guide-again")) await click("stats-guide-again");
  const asked: string[] = [];
  for (let i = 0; i < 10; i++) {
    const q = tid("stats-guide-question");
    if (!q) break;
    const key = q.dataset.ask!;
    if (answers[key] === undefined) break; // the path ends at this question
    asked.push(key);
    const opt = all("stats-guide-opt").find((b) => b.dataset.value === answers[key]);
    if (!opt) throw new Error(`no option ${answers[key]} for ${key}`);
    await act(async () => { opt.click(); });
  }
  return asked;
}

beforeEach(() => {
  resetLabs();
  resetGuides();
  for (const k of Object.keys(h.store)) delete h.store[k];
  h.writes.length = 0; h.calls.length = 0;
  h.toast.mockClear(); h.insert.mockReset(); h.insert.mockResolvedValue(true);
  h.confirm.mockReset(); h.confirm.mockReturnValue(true);
  h.api.mockReset(); h.askPd.mockReset(); h.askPd.mockResolvedValue({ answer: "send", leave: [] });
  window.confirm = h.confirm as typeof window.confirm;
});
afterEach(async () => {
  await act(async () => { for (const r of roots.splice(0)) r.unmount(); });
  document.body.innerHTML = "";
});

describe("the guide's questions and results", () => {
  it("is closed until it is opened, and opens without any data", async () => {
    await mount();
    expect(tid("stats-guide")).not.toBeNull();
    expect(tid("stats-guide-panel")).toBeNull();
    expect(tid("stats-guide-toggle")!.getAttribute("aria-expanded")).toBe("false");
    await click("stats-guide-toggle");
    expect(tid("stats-guide-toggle")!.getAttribute("aria-expanded")).toBe("true");
    expect(tid("stats-guide-question")!.dataset.ask).toBe("goal");
    await click("stats-guide-toggle");
    expect(tid("stats-guide-panel")).toBeNull();
  });

  it("the 34 guide paths end where v1's do", async () => {
    expect(GOLD.paths).toHaveLength(34);
    await mount();
    for (const p of GOLD.paths) {
      const asked = await walk(p.answers);
      const label = JSON.stringify(p.answers);
      if (p.out.ask) {
        // v1 stops at a question: the screen shows exactly that question and every answer given was used
        expect(tid("stats-guide-question")?.dataset.ask, label).toBe(p.out.ask);
        expect(asked, label).toHaveLength(Object.keys(p.answers).length);
        expect(tid("stats-guide-result"), label).toBeNull();
      } else {
        const r = p.out.res!;
        expect(tid("stats-guide-question"), label).toBeNull();
        expect(asked, label).toHaveLength(Object.keys(p.answers).length);
        const card = tid("stats-guide-result")!;
        expect(card.dataset.result, label).toBe(r.id);
        expect(card.dataset.built, label).toBe(String(r.built));
        expect(text("stats-guide-name"), label).toBe(r.name);
        expect(text("stats-guide-fit"), label).toBe(r.why);
        // built: "Use this test" for the first of its keys; not built: v1's hand-over text and no button
        expect(!!tid("stats-guide-use"), label).toBe(r.built);
        expect(!!tid("stats-guide-unbuilt"), label).toBe(!r.built);
        expect(r.built, label).toBe(r.keys.length > 0);
      }
    }
  });

  it("every result's 'Why this fits' reads as v1's does, and its other options and note are v1's", async () => {
    expect(GOLD.why).toHaveLength(22);
    await mount();
    for (const w of GOLD.why) {
      await walk(w.answers);
      const label = w.id;
      expect(tid("stats-guide-result")!.dataset.result, label).toBe(w.id);
      expect(text("stats-guide-why"), label).toBe(w.text);
      expect(all("stats-guide-why-item").map((e) => e.textContent), label).toEqual(w.items);
      const r = GOLD.paths.find((p) => p.out.res?.id === w.id)!.out.res!;
      expect(all("stats-guide-other").map((e) => e.textContent), label).toEqual(r.alt.map((x) => {
        const name = (TG_RES as Record<string, { name: string }>)[x[0]]?.name ?? x[0];
        return name + ", " + x[1].replace(/^[^,]*, /, "");
      }));
      expect(tid("stats-guide-note")?.textContent ?? null, label).toBe(r.note ?? null);
    }
  });

  it("the unbuilt results (v1's results with no key: four tests, five paths) say v1's hand-over text and offer no test and no demo", async () => {
    await mount();
    const unbuilt = GOLD.paths.filter((p) => p.out.res && !p.out.res.built);
    expect(unbuilt.map((p) => p.out.res!.id).sort()).toEqual(["friedman", "rmanova", "twoway", "twoway", "wilcox1"]);
    for (const p of unbuilt) {
      await walk(p.answers);
      expect(text("stats-guide-unbuilt")).toBe(E.stats_guide_unbuilt);
      expect(tid("stats-guide-use")).toBeNull();
      expect(tid("stats-guide-demo")).toBeNull();
    }
    expect(E.stats_guide_unbuilt).toMatch(/jamovi or JASP/);
  });

  it("Back takes back the last answer and Start again clears them, as v1's do", async () => {
    await mount();
    await click("stats-guide-toggle");
    expect(tid("stats-guide-back")).toBeNull(); // nothing answered yet (v1 draws Back only once there is an answer)
    const choose = async (v: string) => { await act(async () => { all("stats-guide-opt").find((b) => b.dataset.value === v)!.click(); }); };
    await choose("compare"); await choose("scale"); await choose("two");
    expect(tid("stats-guide-question")!.dataset.ask).toBe("smp");
    await click("stats-guide-back");
    expect(tid("stats-guide-question")!.dataset.ask).toBe("cmpDes");
    await click("stats-guide-back");
    expect(tid("stats-guide-question")!.dataset.ask).toBe("cmpOut");
    await click("stats-guide-back");
    expect(tid("stats-guide-question")!.dataset.ask).toBe("goal");
    expect(tid("stats-guide-back")).toBeNull();
    await choose("relate"); await choose("scale");
    expect(tid("stats-guide-result")!.dataset.result).toBe("pearson");
    await click("stats-guide-again");
    expect(tid("stats-guide-question")!.dataset.ask).toBe("goal");
  });

  it("backAnswers is v1's tgBack: the last answered question goes, and with no goal nothing stays", () => {
    expect(backAnswers({ goal: "compare", cmpOut: "scale", cmpDes: "two", smp: "ind" })).toEqual({ goal: "compare", cmpOut: "scale", cmpDes: "two" });
    expect(backAnswers({ goal: "predict", prdOut: "scale", prdN: "many" })).toEqual({ goal: "predict", prdOut: "scale" });
    expect(backAnswers({ goal: "reliab" })).toEqual({});
    expect(backAnswers({})).toEqual({});
  });

  it("the other options read as v1's tgRender line: the name, a comma, the reason without its first clause", () => {
    expect(otherOption(["spearman", "Spearman, if the plot is curved but still rising or falling"])).toBe("Spearman correlation, if the plot is curved but still rising or falling");
    expect(otherOption(["tukey", "Tukey, after a significant ANOVA"])).toMatch(/^Tukey/);
    expect(otherOption(["nosuchtest", "x, y"])).toBe("nosuchtest, y");
  });

  it("keeps its place when the student goes to another tab and comes back", async () => {
    const root = await mount();
    await walk({ goal: "relate", relOut: "scale" });
    expect(tid("stats-guide-result")!.dataset.result).toBe("pearson");
    await act(async () => { root.unmount(); });
    roots.splice(0);
    document.body.innerHTML = "";
    await mount();
    expect(tid("stats-guide-result")!.dataset.result).toBe("pearson");
    expect(getGuide("p1").answers).toEqual({ goal: "relate", relOut: "scale" });
  });
});

describe("Use this test", () => {
  const TWO = "group,score\nA,7\nA,8\nA,9\nA,8\nB,5\nB,6\nB,5\nB,7";
  it("without a parsed table says to parse first and chooses nothing", async () => {
    await mount();
    await walk({ goal: "relate", relOut: "scale" });
    await click("stats-guide-use");
    expect(text("stats-guide-use-msg")).toBe(E.stats_guide_need_data);
    expect(getLab("p1").test).toBe("desc");
    expect(document.activeElement).not.toBe(tid("stats-test"));
  });

  it("with a table puts the first key of the result into the chooser of Run a test", async () => {
    await mount();
    await load("a,b\n1,2\n2,3\n3,5\n4,4\n5,7");
    expect(getLab("p1").test).toBe("desc");
    await walk({ goal: "relate", relOut: "scale" });
    await click("stats-guide-use");
    expect(getLab("p1").test).toBe(TG_RES.pearson.keys[0]);
    expect((tid("stats-test") as HTMLSelectElement).value).toBe("pearson");
    expect(text("stats-guide-use-msg")).toBe(fill(E.stats_guide_chosen, { name: STATS_TEST_OPTIONS.pearson }));
    expect(document.activeElement).toBe(tid("stats-test")); // v1 scrolled to the test area; the chooser takes the focus
  });

  it("every built result in the golden paths selects its own first key", async () => {
    await mount();
    await load("g,x,y,z\nA,1,2,3\nA,2,3,5\nB,3,5,4\nB,4,4,6\nA,5,7,6\nB,6,6,8");
    for (const p of GOLD.paths) {
      const r = p.out.res;
      if (!r || !r.built) continue;
      await walk(p.answers);
      await click("stats-guide-use");
      expect(getLab("p1").test, r.id).toBe(r.keys[0]);
      expect((tid("stats-test") as HTMLSelectElement).value, r.id).toBe(r.keys[0]);
    }
  });
});

/** The thirteen demos: the result id to reach each, from the golden paths. */
const DEMO_IDS = Object.keys(TG_DEMO);
const pathTo = (id: string) => GOLD.paths.find((p) => p.out.res?.id === id)!.answers;
/** The form the demo fills, rebuilt here from TG_DEMO by column names, so that the expected sentence is core's own for the same inputs. */
function expectedApa(id: string): string {
  const dm = TG_DEMO[id]!;
  const data = statsParseText(dm.csv)!;
  const idx = (n: string) => String(data.cols.find((c) => c.name === n)!.index);
  const values: Record<string, string> = {};
  for (const [k, n] of Object.entries(dm.sel ?? {})) values[k] = idx(n);
  for (const [k, v] of Object.entries(dm.extra ?? {})) values[k] = v;
  if (dm.rev) { values.rev = dm.rev; values.rrange = dm.rrange!; }
  const form: StatsForm = { values, ticked: dm.tick ? { items: dm.tick.map((n) => Number(idx(n))) } : {} };
  const res = runStats(data, dm.test as StatsTestKey, form);
  if (!res.ok) throw new Error("demo " + id + " did not run");
  return res.apa;
}

describe("the predict-first demo", () => {
  it("there are thirteen demos, every one reachable from a built result", () => {
    expect(DEMO_IDS).toHaveLength(13);
    for (const id of DEMO_IDS) expect(GOLD.paths.some((p) => p.out.res?.id === id && p.out.res.built), id).toBe(true);
  });

  it("asks for a prediction first: without one nothing runs and the line says so", async () => {
    await mount();
    await walk(pathTo("ttestInd"));
    expect(text("stats-guide-demo")).toContain(E.stats_guide_predict_head);
    expect(text("stats-guide-demo")).toContain(E.stats_guide_demo_invented);
    await click("stats-guide-demo-run");
    expect(text("stats-guide-demo-msg")).toBe(E.stats_guide_demo_need_pred);
    expect(tid("stats-guide-demo-out")).toBeNull();
  });

  it("each of the 13 demos prints core's sentence for its table, compares the prediction, and reads it", async () => {
    await mount();
    for (const id of DEMO_IDS) {
      const dm = TG_DEMO[id]!;
      await walk(pathTo(id));
      expect(text("stats-guide-demo-title"), id).toBe(fill(E.stats_guide_demo_title, { title: dm.title }));
      const lines = dm.csv.split("\n");
      expect(text("stats-guide-demo-shape"), id).toBe(fill(E.stats_guide_demo_shape, { n: lines.length - 1, cols: lines[0]!.split(",").join(", ") }));
      await click("stats-guide-pred-yes");
      await click("stats-guide-demo-run");
      const apa = expectedApa(id);
      expect(text("stats-guide-demo-sentence"), id).toBe(apa);
      expect(text("stats-guide-demo-read"), id).toContain(dm.read);
      expect(tid("stats-guide-demo-results")!.querySelector("table"), id).not.toBeNull();
      const sig = id === "alpha" ? true : sentenceIsClear(apa);
      const verdict = text("stats-guide-demo-verdict");
      expect(verdict, id).toContain(E.stats_guide_you_clear);
      expect(verdict, id).toContain(id === "alpha" ? E.stats_guide_scale : sig ? E.stats_guide_agree : E.stats_guide_says_none);
    }
  });

  it("which demos find a clear result: the hand-read answer for each of the 13, from the sentences and reading texts of each", () => {
    // read by hand from each demo's sentence: only the one-sample t (p = .218) and the chi-square (p = .436) are not clear; the scale is always "what the scale did"
    const clear: Record<string, boolean> = {
      ttest1: false, ttestInd: true, mannwhitney: true, ttestPaired: true, wilcoxon: true, anova1: true, kruskal: true,
      pearson: true, spearman: true, regression: true, chisq: false, gof: true, alpha: true
    };
    expect(Object.keys(clear).sort()).toEqual([...DEMO_IDS].sort());
    for (const id of DEMO_IDS) expect(id === "alpha" ? true : sentenceIsClear(expectedApa(id)), id).toBe(clear[id]);
  });

  it("the prediction is compared both ways: a right guess agrees, a wrong one is told what the test said", async () => {
    await mount();
    await walk(pathTo("ttest1")); // no clear result
    await click("stats-guide-pred-no");
    await click("stats-guide-demo-run");
    expect(text("stats-guide-demo-verdict")).toBe(E.stats_guide_you_none + " " + E.stats_guide_agree);
    await click("stats-guide-demo-back");
    await click("stats-guide-pred-yes");
    await click("stats-guide-demo-run");
    expect(text("stats-guide-demo-verdict")).toBe(E.stats_guide_you_clear + " " + E.stats_guide_says_none);
    await walk(pathTo("ttestInd")); // a clear result
    await click("stats-guide-pred-no");
    await click("stats-guide-demo-run");
    expect(text("stats-guide-demo-verdict")).toBe(E.stats_guide_you_none + " " + E.stats_guide_says_clear);
  });

  it("the scale demo can be run again without reversing its item: core's sentence for that, and alpha is lower", async () => {
    const dm = TG_DEMO.alpha!;
    const data = statsParseText(dm.csv)!;
    const idx = (n: string) => data.cols.find((c) => c.name === n)!.index;
    const items = dm.tick!.map(idx);
    const plain = runStats(data, "alpha", { values: { rev: "", rrange: "" }, ticked: { items } });
    const reversed = runStats(data, "alpha", { values: { rev: dm.rev!, rrange: dm.rrange! }, ticked: { items } });
    if (!plain.ok || !reversed.ok) throw new Error("alpha demo did not run");
    const alphaOf = (s: string) => parseFloat(/α = (\.\d+)/.exec(s)![1]!.replace(/^/, "0"));
    expect(alphaOf(plain.apa)).toBeLessThan(alphaOf(reversed.apa));
    await mount();
    await walk(pathTo("alpha"));
    expect(tid("stats-guide-demo-unrev")).toBeNull(); // nothing to undo before the first run
    await click("stats-guide-pred-yes");
    await click("stats-guide-demo-run");
    expect(text("stats-guide-demo-sentence")).toBe(reversed.apa);
    expect(text("stats-guide-demo-unrev")).toBe(fill(E.stats_guide_demo_unrev, { item: dm.rev! }));
    expect(tid("stats-guide-demo-second")).toBeNull();
    const writes = h.writes.length;
    await click("stats-guide-demo-unrev");
    expect(text("stats-guide-demo-second-sentence")).toBe(plain.apa);
    expect(text("stats-guide-demo-sentence")).toBe(reversed.apa); // the first result stays beside it
    expect(tid("stats-guide-demo-second")!.querySelector("table")).not.toBeNull();
    expect(alphaOf(text("stats-guide-demo-second-sentence"))).toBeLessThan(alphaOf(text("stats-guide-demo-sentence")));
    expect(h.writes.length).toBe(writes);
    expect(getLab("p1").data).toBeNull();
    await click("stats-guide-demo-back");
    expect(tid("stats-guide-demo-second")).toBeNull();
  });

  it("only the demo with a reversed item offers it", async () => {
    await mount();
    for (const id of DEMO_IDS.filter((i) => i !== "alpha")) {
      await walk(pathTo(id));
      await click("stats-guide-pred-yes");
      await click("stats-guide-demo-run");
      expect(tid("stats-guide-demo-unrev"), id).toBeNull();
    }
  });

  it("Back to my own data after new data was parsed in the middle of a demo keeps the new data and puts the demo away", async () => {
    await mount();
    await load("g,x\nA,1\nA,2\nB,3\nB,4");
    await walk(pathTo("pearson"));
    await click("stats-guide-pred-yes");
    await click("stats-guide-demo-run");
    expect(tid("stats-guide-demo-out")).not.toBeNull();
    const second = "h,y\nC,10\nC,20\nD,30\nD,40\nD,50";
    await load(second);
    const parsed = getLab("p1").data;
    expect(parsed!.rows).toHaveLength(5);
    await click("stats-guide-demo-back");
    expect(tid("stats-guide-demo-out")).toBeNull();
    expect(getLab("p1").text).toBe(second);
    expect(getLab("p1").data).toBe(parsed);
    expect((tid("stats-paste") as HTMLTextAreaElement).value).toBe(second);
    expect(text("stats-rows")).toBe(fill(E.stats_data_rows_found, { n: 5 }));
  });

  it("sentenceIsClear reads the p-value of the sentence as v1 did", () => {
    expect(sentenceIsClear("t(10) = 2.50, p < .001")).toBe(true);
    expect(sentenceIsClear("t(10) = 2.50, p = .034")).toBe(true);
    expect(sentenceIsClear("t(10) = 0.50, p = .627")).toBe(false);
    expect(sentenceIsClear("t(10) = 2.0, p = .050")).toBe(false);
    expect(sentenceIsClear("no p here")).toBe(false);
  });

  it("leaves stats_sets, stats_runs, the document and the AI alone, and the student's own text, table and result as they were", async () => {
    await mount();
    const own = "group,score\nA,7\nA,8\nA,9\nA,8\nB,5\nB,6\nB,5\nB,7";
    await load(own);
    await pick("stats-test", "ttestInd");
    await click("stats-run-btn");
    await settle();
    const before = getLab("p1");
    const writesBefore = h.writes.length;
    expect(before.lastRun).not.toBeNull();
    for (const id of DEMO_IDS) {
      await walk(pathTo(id));
      await click("stats-guide-pred-no");
      await click("stats-guide-demo-run");
      expect(tid("stats-guide-demo-out"), id).not.toBeNull();
      // nothing the demo shows can be inserted or explained: those buttons belong to the student's own result only
      expect(tid("stats-guide-demo")!.querySelector('[data-testid="stats-insert"], [data-testid="stats-explain"]'), id).toBeNull();
    }
    const mid = getLab("p1");
    expect(mid.text).toBe(own);
    expect(mid.data).toBe(before.data); // the same table object, not re-parsed
    expect(mid.lastRun).toBe(before.lastRun);
    expect(mid.registered).toBe(before.registered);
    expect(mid.pendingRuns).toEqual([]);
    expect((tid("stats-paste") as HTMLTextAreaElement).value).toBe(own);
    await click("stats-guide-demo-back");
    expect(tid("stats-guide-demo-out")).toBeNull();
    const after = getLab("p1");
    expect(after.text).toBe(own);
    expect(after.data).toBe(before.data);
    expect((tid("stats-paste") as HTMLTextAreaElement).value).toBe(own);
    expect(text("stats-rows")).toBe(fill(E.stats_data_rows_found, { n: 8 }));
    // no write of any kind after the student's own run: no set, no run record, no preference
    expect(h.writes.length).toBe(writesBefore);
    expect(h.writes.slice(writesBefore)).toEqual([]);
    expect(h.insert).not.toHaveBeenCalled();
    expect(h.api).not.toHaveBeenCalled();
    expect(h.calls).toEqual([]);
    expect(h.toast).not.toHaveBeenCalled();
  });

  it("with no data of the student's at all, the demo writes nothing anywhere and leaves the paste box empty", async () => {
    await mount();
    await walk(pathTo("pearson"));
    await click("stats-guide-pred-yes");
    await click("stats-guide-demo-run");
    expect(tid("stats-guide-demo-out")).not.toBeNull();
    expect(h.writes).toEqual([]);
    expect(Object.keys(h.store)).toEqual([]);
    expect(getLab("p1").text).toBe("");
    expect(getLab("p1").data).toBeNull();
    expect((tid("stats-paste") as HTMLTextAreaElement).value).toBe("");
    expect(tid("stats-run")).toBeNull(); // "Run a test" still asks for the student's own data
  });

  it("says in words that the numbers are invented and the demo is apart from the student's data", async () => {
    await mount();
    await walk(pathTo("pearson"));
    await click("stats-guide-pred-yes");
    await click("stats-guide-demo-run");
    expect(text("stats-guide-demo")).toContain("The numbers are invented for practice.");
    expect(text("stats-guide-demo-apart")).toBe(E.stats_guide_demo_apart);
    expect(text("stats-guide-demo-back")).toBe("Back to my own data");
  });

  it("a new answer or Start again puts the demo and the prediction away", async () => {
    await mount();
    await walk(pathTo("pearson"));
    await click("stats-guide-pred-yes");
    await click("stats-guide-demo-run");
    await click("stats-guide-again");
    await walk(pathTo("pearson"));
    expect(tid("stats-guide-demo-out")).toBeNull();
    expect((tid("stats-guide-pred-yes") as HTMLInputElement).checked).toBe(false);
  });
});

describe("Check my numbers", () => {
  it("says to parse first while there is no table", async () => {
    await mount();
    await walk({ goal: "reliab" });
    expect(text("stats-guide-check")).toContain(E.stats_guide_check_need);
    expect(tid("stats-guide-check-btn")).toBeNull();
  });

  it("each of the 531 golden cases prints what v1's check printed (the text of its output), over 19 data sets", async () => {
    expect(GOLD.checks).toHaveLength(531);
    expect(GOLD.datasets).toHaveLength(19);
    await mount();
    let seen = 0;
    for (const ds of GOLD.datasets) {
      await click("stats-clear").catch(() => undefined);
      await load(ds.csv);
      await walk({ goal: "reliab" });
      for (const c of GOLD.checks.filter((x) => x.dataset === ds.id)) {
        await pick("stats-guide-check-num", c.sel.num);
        await pick("stats-guide-check-grp", c.sel.grp);
        await pick("stats-guide-check-c1", c.sel.c1);
        await pick("stats-guide-check-c2", c.sel.c2);
        await click("stats-guide-check-btn");
        // core's text (v1's), then, after each half that raised no flag, one line saying what the check did not look at (rule 8)
        const out = text("stats-guide-check-out");
        const quiet = (html: string) => html.startsWith(TG_CHECK_TEXT.means) || html.endsWith(TG_CHECK_TEXT.fine);
        // golden table cells are HTML (escaped); the notes are plain: the line goes after each quiet note, found in v1's text in order
        let expected = c.text, from = 0;
        for (const b of c.blocks) {
          if (b.kind !== "note" || !quiet(b.html!)) continue;
          const at = expected.indexOf(b.html!, from) + b.html!.length;
          expected = expected.slice(0, at) + E.stats_guide_check_not_proof + expected.slice(at);
          from = at + E.stats_guide_check_not_proof!.length;
        }
        expect(out, c.id).toBe(expected);
        expect(out.split(E.stats_guide_check_not_proof!).join(""), c.id).toBe(c.text); // with the line taken out it is v1's text, character for character
        expect(all("stats-guide-check-not-proof").length, c.id).toBe(c.blocks.filter((b) => b.kind === "note" && quiet(b.html!)).length);
        if (c.fallback !== null) expect(out, c.id).toBe(TG_CHECK_FALLBACK);
        seen++;
      }
    }
    expect(seen).toBe(531);
  });

  it("a flagged case shows no such line: small skewed groups and a sparse table say what core says and nothing more", async () => {
    await mount();
    await load("g,x,a,b\nA,1,u,p\nA,2,u,p\nA,30,u,q\nB,4,v,q\nB,5,v,p\nB,6,v,p");
    await walk({ goal: "reliab" });
    await pick("stats-guide-check-num", "1");
    await pick("stats-guide-check-grp", "0");
    await pick("stats-guide-check-c1", "2");
    await pick("stats-guide-check-c2", "3");
    await click("stats-guide-check-btn");
    const out = text("stats-guide-check-out");
    expect(out).toContain(TG_CHECK_TEXT.rank);
    expect(out).toContain(TG_CHECK_TEXT.low);
    expect(out).not.toContain(TG_CHECK_TEXT.means);
    expect(out).not.toContain(TG_CHECK_TEXT.fine);
    expect(out).not.toContain(E.stats_guide_check_not_proof);
    expect(tid("stats-guide-check-not-proof")).toBeNull();
  });

  it("the line is plain words, not a clearance: it names what was looked at and says it does not show the assumptions are met", () => {
    expect(E.stats_guide_check_not_proof).toBe("This looked only at group size, skew, outliers and expected counts. It does not show that the test's assumptions are met.");
    expect(E.stats_guide_check_not_proof).not.toMatch(/\u2014/);
  });

  it("offers score columns for the score box and category columns for the others, as v1's selects did", async () => {
    await mount();
    await load("g,h,a,b\nA,u,1,2\nB,v,2,3\nA,u,3,5\nB,v,4,4");
    await walk({ goal: "reliab" });
    const opts = (id: string) => [...(tid(id) as HTMLSelectElement).options].map((o) => [o.value, o.text]);
    expect(opts("stats-guide-check-num").map((o) => o[0])).toEqual(["", "2", "3"]);
    expect(opts("stats-guide-check-grp").map((o) => o[0])).toEqual(["", "0", "1"]);
    expect(opts("stats-guide-check-c1").map((o) => o[0])).toEqual(["", "0", "1"]);
    expect(opts("stats-guide-check-c2").map((o) => o[0])).toEqual(["", "0", "1"]);
    expect(opts("stats-guide-check-num")[1]![1]).toBe("a");
  });

  it("the counts paragraph is core's tgCountsText, and the output equals core's tgCheck for the same choices", async () => {
    const csv = "a,b,n\nx,p,1\nx,q,2\ny,p,3\ny,q,4\nx,p,5\ny,q,6";
    await mount();
    await load(csv);
    await walk({ goal: "reliab" });
    await pick("stats-guide-check-c1", "0");
    await pick("stats-guide-check-c2", "1");
    await click("stats-guide-check-btn");
    const out = tgCheck({ data: statsParseText(csv)!, form: { values: {}, ticked: {} }, skipped: 0 }, { num: "", grp: "", c1: "0", c2: "1" });
    expect(text("stats-guide-check-out")).toBe(tgCountsText(out.counts!));
  });

  it("a group label that looks like markup is shown as text, not read as markup", async () => {
    await mount();
    await load("group,score\n<img src=x onerror=alert(1)>,1\n<img src=x onerror=alert(1)>,2\n<b>bold</b>,3\n<b>bold</b>,4");
    await walk({ goal: "reliab" });
    await pick("stats-guide-check-num", "1");
    await pick("stats-guide-check-grp", "0");
    await click("stats-guide-check-btn");
    const out = tid("stats-guide-check-out")!;
    expect(out.querySelector("img")).toBeNull();
    expect(out.querySelector("b")).toBeNull();
    expect(out.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(out.textContent).toContain("<b>bold</b>");
  });

  it("shows information only: nothing is blocked, no test is chosen, no write is made", async () => {
    await mount();
    await load("g,x\nA,1\nA,2\nB,3\nB,40");
    await walk({ goal: "reliab" });
    await pick("stats-guide-check-num", "1");
    await click("stats-guide-check-btn");
    expect(text("stats-guide-check")).toContain(E.stats_guide_check_help);
    expect(getLab("p1").test).toBe("desc");
    expect(h.writes.filter((w) => w.kind !== "stats_sets" && w.kind !== "stats_prefs")).toEqual([]);
  });

  it("the output goes when the table it was made for is replaced", async () => {
    await mount();
    await load("g,x\nA,1\nA,2\nB,3\nB,4");
    await walk({ goal: "reliab" });
    await pick("stats-guide-check-num", "1");
    await click("stats-guide-check-btn");
    expect(tid("stats-guide-check-out")).not.toBeNull();
    await load("g,x\nA,10\nA,20\nB,30\nB,40");
    expect(tid("stats-guide-check-out")).toBeNull();
  });
});

describe("the words of the guide", () => {
  const keys = Object.keys(statsEn).filter((k) => k.startsWith("stats_guide_"));
  it("every guide message has a Hindi draft with the same placeholders, and no emoji or em dash", () => {
    expect(keys.length).toBeGreaterThan(30);
    for (const k of keys) {
      const en0 = (statsEn as Record<string, string>)[k]!;
      expect(hi[k], k).toBeTruthy();
      expect((hi[k]!.match(/\{\w+\}/g) ?? []).sort(), k).toEqual((en0.match(/\{\w+\}/g) ?? []).sort());
      expect(en0, k).not.toMatch(/[—\u{1F300}-\u{1FAFF}☀-➿]/u);
    }
  });
});
