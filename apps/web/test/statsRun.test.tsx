// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { sanitizeHtml, STAT_TESTS, STATS_TEST_OPTIONS, statsParseText, type StatsTestKey } from "@appuscholar/core";
import en from "../messages/en.json";
import statsEn from "../messages/tools/stats.en.json";
import statsHi from "../messages/tools/stats.hi.json";
import { editorExtensions } from "../lib/editorExtensions";
import { casesOf, fixtureFiles } from "./support/statsGolden";

/*
 * Task B2: the Run test area of the Data tab (v1 statsDlg step 2, 1553-1604, statsRun 12604, statsRunNow 12609, statsResultsShow 11985, statsInsert 12010, statsExplain 12027,
 * practice mode 12557-12608). The expected sentences, refusals and forms are v1's own, read from core's golden fixtures (test/golden/stats/<test>.json, v1 driven in jsdom).
 */

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  /** The blobs the panel reads (by kind), and every write it made, as the JSON that would be sent. */
  store: {} as Record<string, unknown>,
  writes: [] as Array<{ kind: string; json: string }>,
  broken: {} as Record<string, boolean>,
  loading: {} as Record<string, boolean>,
  locked: {} as Record<string, boolean>,
  /** A read that failed: the hook then says loading:false, locked:false, broken:false, error:true, value:null. */
  error: {} as Record<string, boolean>,
  confirm: vi.fn(() => true),
  insert: vi.fn(async (_html: string, _o?: unknown) => true),
  api: vi.fn(),
  /** The project's names for callAI's own check (Task 11); null: none, as for a window with no project. */
  names: null as null | { list: unknown; mode: "codes" | "pseudonyms" | "anonymous" | null; locked: boolean },
  askPd: vi.fn(async (_sc: unknown) => ({ answer: "send", leave: [] as string[] }) as { answer: "send" | "mask" | "cancel"; leave: string[] }),
  calls: [] as string[],
  /** Re-draws every blob hook of the mounted tab (a read that finished, a vault that opened). */
  forces: new Set<() => void>()
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
// The AI button's entry point with the real callAI (its personal-data step included) and a dialog the test answers.
vi.mock("@/lib/ai/useCallAI", async () => {
  const { callAI } = await import("../lib/ai/callAI");
  return {
    useCallAI: () => (prompt: string, opts: { temp?: number; max?: number } = {}) => callAI(prompt, opts, {
      provider: "gemini", blobs: {}, fallbackOn: false, contentLang: "en", projectId: "p1",
      askPassphrase: async () => null, askPd: async (sc) => { h.calls.push("askPd"); return h.askPd(sc); }, openSettings: () => {}, onFailover: () => {},
      ...(h.names ? { names: async () => h.names as unknown as import("../lib/ai/names").NamesCtx } : {})
    })
  };
});
// The Run area's own personal-data question (names written in the request), answered by the test like callAI's.
vi.mock("@/lib/ai/pdDialog", () => ({ askPd: async (sc: unknown) => { h.calls.push("askPd"); return h.askPd(sc); } }));
// The Data tab reads the participant list (Task 10), which needs the vault's state. These tests have no vault, so no list is used and the personal-details box is v1's.
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => ({ status: "off" }) }));
vi.mock("@/lib/blobs/useProjectBlob", async () => {
  const { useReducer, useRef, useEffect } = await import("react");
  return {
    useProjectBlob: (kind: string) => {
      const [, force] = useReducer((n: number) => n + 1, 0);
      const alive = useRef(true);
      useEffect(() => { alive.current = true; h.forces.add(force); return () => { alive.current = false; h.forces.delete(force); }; }, [force]);
      return {
        value: h.store[kind] ?? null, loading: h.loading[kind] ?? false, locked: h.locked[kind] ?? false, broken: h.broken[kind] ?? false, error: h.error[kind] ?? false, readOnly: false,
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

import { keyStore } from "../lib/ai/keys";
import { resetPdMemo } from "../lib/ai/callAI";
import { Panel } from "../components/tools/stats/Panel";
import { getLab, resetLabs } from "../lib/tools/stats/lab";
import { addRun, RUNS_KEPT, runLabTest } from "../lib/tools/stats/run";
import { defaultForm } from "../lib/tools/stats/form";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// The golden loops run all 292 of core's cases (a few take seconds each); the machine they run on is often loaded.
vi.setConfig({ testTimeout: 90_000, hookTimeout: 120_000 });
const E = { ...(en as Record<string, string>), ...(statsEn as Record<string, string>) };
const hi = statsHi as Record<string, string>;
const roots: Root[] = [];
const tid = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const all = (id: string) => [...document.body.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
const text = (id: string) => tid(id)?.textContent ?? "";
const fill = (s: string, vars: Record<string, string | number> = {}) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

async function mount(tab = "data"): Promise<Root> {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(<Panel tab={tab} projectId="p1" />); });
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
/** The blobs' state changed outside the tab (a read finished, the vault opened): every hook of the tab draws again. */
async function rerender() { await act(async () => { for (const f of [...h.forces]) f(); }); }
async function settle(ms = 0) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }
/** Pastes a table and parses it. */
async function load(csv: string, name = "") {
  await type("stats-paste", csv);
  if (name) await type("stats-name", name);
  await click("stats-parse");
  await settle();
}

/** Fills the form as a student would, from a StatsForm: the test, then each picker, extra box and tick. */
async function fillForm(test: StatsTestKey, form: { values: Record<string, string>; ticked: Record<string, number[]> }) {
  await pick("stats-test", test);
  for (const [id, v] of Object.entries(form.values)) {
    if (tid("stats-field-" + id)) { if (v !== "") await pick("stats-field-" + id, v); }
    else if (tid("stats-extra-" + id)) await type("stats-extra-" + id, v);
  }
  for (const [id, cols] of Object.entries(form.ticked)) {
    const boxes = [...document.body.querySelectorAll<HTMLInputElement>(`[data-testid^="stats-tick-${id}-"]`)];
    for (const b of boxes) {
      const col = Number(b.dataset.testid!.split("-").pop());
      if (b.checked !== cols.includes(col)) await act(async () => { b.click(); });
    }
  }
}

const TWO = "group,score\nA,7\nA,8\nA,9\nA,8\nB,5\nB,6\nB,5\nB,7";

beforeEach(() => {
  resetLabs();
  resetPdMemo();
  for (const k of Object.keys(h.store)) delete h.store[k];
  for (const o of [h.broken, h.loading, h.locked, h.error]) for (const k of Object.keys(o)) delete o[k];
  h.writes.length = 0; h.calls.length = 0; h.names = null;
  h.toast.mockClear(); h.insert.mockReset(); h.insert.mockResolvedValue(true);
  h.confirm.mockReset(); h.confirm.mockReturnValue(true);
  h.api.mockReset(); h.askPd.mockReset(); h.askPd.mockResolvedValue({ answer: "send", leave: [] });
  vi.stubGlobal("confirm", h.confirm);
  window.confirm = h.confirm as typeof window.confirm;
  keyStore.setSession("gemini", "AIza-test");
});
afterEach(async () => {
  await act(async () => { for (const r of roots.splice(0)) r.unmount(); });
  document.body.innerHTML = "";
  keyStore.clear("gemini");
  vi.unstubAllGlobals();
});

describe("the test chooser and its fields", () => {
  it("says to parse first while there is no table, and shows the chooser once there is one", async () => {
    await mount();
    expect(tid("stats-run-need")?.textContent).toBe(E.stats_run_need_data);
    expect(tid("stats-test")).toBeNull();
    await load(TWO);
    expect(tid("stats-run-need")).toBeNull();
    const opts = [...(tid("stats-test") as HTMLSelectElement).options].map((o) => [o.value, o.text]);
    expect(opts).toEqual(Object.entries(STATS_TEST_OPTIONS));
    expect([...document.body.querySelectorAll("#statsTest optgroup")].map((g) => g.getAttribute("label"))).toEqual(
      ["stats_run_group_describe", "stats_run_group_means", "stats_run_group_nonpar", "stats_run_group_relations", "stats_run_group_scales"].map((k) => E[k]));
  });

  it("all 26 keys render their fields: a picker per column field, a tick list per multi field, a box per extra", async () => {
    // columns of every kind: text groups, numbers, yes/no answers
    const csv = "g,h,a,b,c,yn1,yn2,yn3\nA,u,1,2,3,yes,no,yes\nA,v,2,3,5,no,no,yes\nB,u,3,5,4,yes,yes,no\nB,v,4,4,6,no,yes,no\nA,u,5,7,6,yes,no,no\nB,v,6,6,8,no,yes,yes";
    await mount();
    await load(csv);
    const keys = Object.keys(STAT_TESTS) as StatsTestKey[];
    expect(keys).toHaveLength(26);
    for (const k of keys) {
      await pick("stats-test", k);
      const cfg = STAT_TESTS[k];
      const pickers = cfg.fields.filter((f) => !f.multi).map((f) => "stats-field-" + f.id);
      const multis = cfg.fields.filter((f) => f.multi).map((f) => "stats-multi-" + f.id);
      const extras = (cfg.extra ?? []).map((e) => "stats-extra-" + e.id);
      for (const id of [...pickers, ...multis, ...extras]) expect(tid(id), `${k} ${id}`).not.toBeNull();
      expect(all("stats-fields")[0]!.querySelectorAll("select, input[type=text]").length, k).toBe(pickers.length + extras.length);
      expect(document.body.querySelectorAll('[data-testid^="stats-multi-"]').length, k).toBe(multis.length);
      for (const f of cfg.fields) {
        const label = f.multi ? tid("stats-multi-" + f.id)!.querySelector("legend")!.textContent : document.body.querySelector(`label[for="sf_${f.id}"]`)!.textContent;
        expect(label, `${k} ${f.id}`).toBe(f.label);
      }
      if (k === "mcnemar") {
        // a yes/no picker offers the columns with two answers, whatever their type
        expect([...(tid("stats-field-v1") as HTMLSelectElement).options].map((o) => o.text)).toEqual(["g", "h", "yn1", "yn2", "yn3"]);
      }
    }
  });

  it("starts each test on v1's defaults, and a tick list starts all ticked", async () => {
    await mount();
    await load("g,a,b,c\nA,1,2,3\nA,2,3,5\nB,3,5,4\nB,4,4,6\nA,5,7,6\nB,6,6,8");
    await pick("stats-test", "pearson");
    expect((tid("stats-field-v1") as HTMLSelectElement).value).toBe("1");
    expect((tid("stats-field-v2") as HTMLSelectElement).value).toBe("2"); // two fields of one type start on different columns
    await pick("stats-test", "alpha");
    expect(all("stats-multi-items")[0]!.querySelectorAll("input:checked")).toHaveLength(3); // every numeric column starts ticked
    await pick("stats-test", "mregress");
    expect(all("stats-multi-preds")[0]!.querySelectorAll("input:checked")).toHaveLength(0); // a predictor list starts unticked (v1: unchecked)
    await pick("stats-test", "friedman");
    expect(all("stats-multi-items")[0]!.querySelectorAll("input").length).toBe(3);
    expect(all("stats-multi-items")[0]!.querySelectorAll("input:checked")).toHaveLength(0); // this field starts unticked (v1: unchecked)
  });

  it("keeps the form and the result when the student leaves the tab and comes back", async () => {
    const r = await mount();
    await load(TWO);
    await pick("stats-test", "ttestInd");
    await click("stats-run-btn");
    const sentence = text("stats-sentence");
    expect(sentence).not.toBe("");
    await act(async () => { r.unmount(); }); roots.splice(roots.indexOf(r), 1);
    await mount();
    expect((tid("stats-test") as HTMLSelectElement).value).toBe("ttestInd");
    expect(text("stats-sentence")).toBe(sentence);
  });
});

describe("Run test", () => {
  it("a refusal is said inline, in v1's words, with nothing to insert and no run record", async () => {
    await mount();
    await load("g,s\nA,5\nA,5\nB,5\nB,5\nA,5\nB,5"); // every score the same: no spread
    await pick("stats-test", "ttestInd");
    await click("stats-run-btn");
    const msg = text("stats-run-message");
    expect(msg).toMatch(/no spread|same/i);
    expect(tid("stats-insert")).toBeNull();
    expect(tid("stats-explain")).toBeNull();
    expect(tid("stats-chart")).toBeNull();
    expect(h.store.stats_runs).toBeUndefined();
    expect(h.toast).not.toHaveBeenCalled();
  });

  it("a result with an undefined number shows v1's note: nothing to insert, no chart, no run record", async () => {
    const c = casesOf("ttestInd.json").find((x) => x.id === "ttestInd-group-named-NaN")!;
    expect(c.apa).toBeNull();
    await mount();
    await load(c.csv);
    await fillForm(c.test, c.form);
    await click("stats-run-btn");
    expect(text("stats-results-html")).toContain("This analysis produced a number that is undefined, so no result is shown.");
    expect(tid("stats-sentence")).toBeNull();
    expect(tid("stats-insert")).toBeNull();
    expect(tid("stats-explain")).toBeNull();
    expect(tid("stats-chart")).toBeNull();
    expect(h.insert).not.toHaveBeenCalled();
    expect(h.store.stats_runs).toBeUndefined();
  });

  it("a result shows its tables, the sentence, the left-out count, v1's footer note, and a chart", async () => {
    await mount();
    const c = casesOf("ttestInd.json").find((x) => x.id === "ttestInd-text-in-numeric")!;
    await load(c.csv);
    await fillForm(c.test, c.form);
    await click("stats-run-btn");
    expect(all("stats-results-html")[0]!.querySelectorAll("table.stats-table").length).toBeGreaterThan(0);
    expect(text("stats-results-html")).toMatch(/\d+ entr(y that is|ies that are) not a number (was|were) left out\./);
    expect(text("stats-sentence")).toMatch(/^An independent-samples Welch t-test showed/);
    expect(tid("stats-chart")).not.toBeNull();
    expect(text("stats-footer")).toBe(E.stats_run_footer);
    expect(E.stats_run_footer).toContain("cross-check against SPSS or JASP");
  });

  it("a group label that looks like HTML is shown as text, in the table, the sentence and the chart, with no handler in the page", async () => {
    const evil = "<img src=x onerror=alert(1)>";
    await mount();
    await load(`group,score\n${evil},7\n${evil},8\n${evil},9\n${evil},8\nB,5\nB,6\nB,5\nB,7`);
    await pick("stats-test", "ttestInd");
    await click("stats-run-btn");
    expect(text("stats-results-html")).toContain(evil);
    expect(text("stats-sentence")).toContain(evil);
    expect(text("stats-chart")).toContain(evil);
    expect(document.body.querySelector("[onerror]")).toBeNull();
    expect(document.body.querySelector("img")).toBeNull();
    expect(document.body.innerHTML).not.toContain("<img");
    // inserted as text as well
    await click("stats-insert");
    const html = h.insert.mock.calls[0]![0];
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    const ed = new Editor({ extensions: editorExtensions, content: html });
    expect(ed.getText()).toContain(evil);
    expect(sanitizeHtml(ed.getHTML())).not.toContain("<img");
    ed.destroy();
  });
});

describe("each of the 26 tests prints v1's sentence for its golden corpus file", () => {
  const files = fixtureFiles();
  it("there is a corpus file per test", () => { expect(files.map((f) => f.replace(/\.json$/, "")).sort()).toEqual(Object.keys(STAT_TESTS).sort()); });

  it.each(files)("%s: every case gives v1's sentence, refusal or undefined note", async (file) => {
    // The slow case runs alone in core's stats-slow.test.ts (a 1,001-person alpha with bootstrap resamples).
    const cases = casesOf(file).filter((c) => c.id !== "alpha-large-boot-200");
    expect(cases.length).toBeGreaterThan(3);
    const w = (k: string, v?: Record<string, string | number>) => fill(E[k] ?? k, v);
    for (const c of cases) {
      await new Promise((r) => setTimeout(r, 0)); // a heavy case does not hold the timers for the whole file
      const data = statsParseText(c.csv)!;
      const f = defaultForm(data, c.test);
      f.values = { ...c.form.values }; f.ticked = { ...c.form.ticked };
      const o = runLabTest(data, c.test, f, w);
      if (c.apa === null && c.toasts.length) { expect(o, c.id).toEqual({ kind: "toast", text: c.toasts[0] }); continue; }
      if (c.apa === null) { expect(o.kind, c.id).toBe("undefined"); continue; }
      expect(o.kind, c.id).toBe("ok");
      // Register row D-W2-18 (approved): core fits step 1 of that one case on both dummies of the 3-level predictor, so its step sentences differ from v1's; the rest of the sentence is v1's.
      if (o.kind === "ok") expect(c.id === "mregress-step1-categorical-3-levels" ? o.res.apa.split(" In step 1")[0] : o.res.apa, c.id).toBe(c.id === "mregress-step1-categorical-3-levels" ? c.apa.split(" In step 1")[0] : c.apa);
    }
  }, 280_000);

  it.each(files)("%s: the Data tab shows that sentence when the student fills the form and presses Run test", async (file) => {
    const c = casesOf(file).find((x) => x.apa !== null && x.csv.length < 4000 && x.id !== "alpha-large-boot-200")!;
    await mount();
    await load(c.csv);
    await fillForm(c.test, c.form);
    await click("stats-run-btn");
    expect(text("stats-sentence"), c.id).toBe(c.apa);
  }, 60_000);
});

describe("Insert into document", () => {
  it("inserts the sentence at the end as a paragraph tagged with the run, and keeps the run under the data set's name", async () => {
    await mount();
    await load(TWO, "Study 1");
    await pick("stats-test", "ttestInd");
    await click("stats-run-btn");
    const sentence = text("stats-sentence");
    await click("stats-insert");
    expect(h.insert).toHaveBeenCalledTimes(1);
    const html = h.insert.mock.calls[0]![0] as string;
    const m = /^<p><span class="stat-tag" data-run="(r[0-9a-z]+)">(.*)<\/span><\/p>$/.exec(html)!;
    expect(m).not.toBeNull();
    expect(m[2]!.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")).toBe(sentence);
    expect(h.insert.mock.calls[0]![1]).toBeUndefined(); // the default: after everything written (R29)
    const id = m[1]!;
    expect(id).toMatch(/^r[0-9a-z]+$/);
    const runs = h.store.stats_runs as Record<string, { test: string; ds: string; hash: string; sentence: string; ts: number; fields: Record<string, string>; label: string }>;
    expect(Object.keys(runs)).toEqual([id]);
    expect(runs[id]).toMatchObject({ test: "ttestInd", ds: "Study 1", sentence, fields: { dv: "score", iv: "group" }, label: STAT_TESTS.ttestInd.label });
    expect(runs[id]!.hash).toMatch(/^[0-9a-f]+-[0-9a-f]+-\d+$/);
    expect(h.toast.mock.calls).toEqual([[E.stats_res_inserted]]);
    expect(E.stats_res_inserted).toBe("Inserted");
  });

  it("the inserted sentence survives reload: the tag is still on it after the editor and the sanitizer have been through it", async () => {
    await mount();
    await load(TWO, "Study 1");
    await pick("stats-test", "ttestInd");
    await click("stats-run-btn");
    await click("stats-insert");
    const html = h.insert.mock.calls[0]![0] as string;
    const runId = /data-run="([^"]+)"/.exec(html)![1]!;
    const first = new Editor({ extensions: editorExtensions, content: "<p>Intro.</p>" + html });
    const saved = sanitizeHtml(first.getHTML());
    const second = new Editor({ extensions: editorExtensions, content: saved });
    const dom = document.createElement("div");
    dom.innerHTML = second.getHTML();
    const tag = dom.querySelector("span.stat-tag[data-run]");
    expect(tag?.getAttribute("data-run")).toBe(runId);
    expect(tag?.textContent).toBe(text("stats-sentence"));
    expect(saved).toContain(`data-run="${runId}"`);
    first.destroy(); second.destroy();
  });

  it("a document that did not take the sentence leaves no record and no toast", async () => {
    h.insert.mockResolvedValue(false);
    await mount();
    await load(TWO, "Study 1");
    await pick("stats-test", "ttestInd");
    await click("stats-run-btn");
    await click("stats-insert");
    expect(h.store.stats_runs).toBeUndefined();
    expect(h.toast).not.toHaveBeenCalled();
  });

  it("the whole vault locked: Insert tags the sentence at once, writes nothing, and after the unlock one record exists and the set is registered", async () => {
    h.locked.stats_sets = true; h.locked.stats_runs = true;
    await mount();
    await load(TWO, "Study 1");
    await pick("stats-test", "ttestInd");
    await click("stats-run-btn");
    await click("stats-insert");
    const html = h.insert.mock.calls[0]![0] as string;
    const id = /^<p><span class="stat-tag" data-run="(r[0-9a-z]+)">/.exec(html)![1]!; // tagged although nothing could be registered
    expect(h.writes.filter((w) => w.kind === "stats_runs" || w.kind === "stats_sets")).toEqual([]);
    expect(h.toast).toHaveBeenCalledWith(E.stats_res_inserted);
    expect(getLab("p1").pendingRuns.map((p) => p.id)).toEqual([id]); // held, not dropped
    // the student opens the vault
    delete h.locked.stats_sets; delete h.locked.stats_runs;
    await rerender();
    const runs = h.store.stats_runs as Record<string, { ds: string; sentence: string }>;
    expect(Object.keys(runs)).toEqual([id]);
    expect(runs[id]).toMatchObject({ ds: "Study 1", sentence: text("stats-sentence") });
    expect(Object.keys(h.store.stats_sets as object)).toEqual(["Study 1"]);
    expect(h.writes.filter((w) => w.kind === "stats_runs")).toHaveLength(1);
    expect(getLab("p1").pendingRuns).toEqual([]);
  });

  it("only stats_runs still loading: the sentence is tagged, nothing is written before the list is known, then one record", async () => {
    h.loading.stats_runs = true;
    await mount();
    await load(TWO);
    await pick("stats-test", "ttestInd");
    await click("stats-run-btn");
    await click("stats-insert");
    const id = /data-run="([^"]+)"/.exec(h.insert.mock.calls[0]![0] as string)![1]!;
    expect(h.writes.filter((w) => w.kind === "stats_runs")).toEqual([]);
    delete h.loading.stats_runs;
    await rerender();
    const runs = h.store.stats_runs as Record<string, { ds: string }>;
    expect(Object.keys(runs)).toEqual([id]);
    expect(runs[id]!.ds).toBe("Untitled data"); // no name was typed, so the name v1 gives (rtDsName)
  });

  it("stats_runs loading and broken: Insert writes nothing and replaces nothing; once known it asks once, and 'yes' saves the one record", async () => {
    h.loading.stats_runs = true; h.broken.stats_runs = true;
    await mount();
    await load(TWO, "Study 1");
    await pick("stats-test", "ttestInd");
    await click("stats-run-btn");
    await click("stats-insert");
    await click("stats-insert");
    expect(h.confirm).not.toHaveBeenCalled();
    expect(h.writes.filter((w) => w.kind === "stats_runs")).toEqual([]);
    delete h.loading.stats_runs;
    await rerender();
    expect(h.confirm).toHaveBeenCalledTimes(1);
    expect(h.confirm).toHaveBeenCalledWith(E.stats_res_runs_confirm);
    expect(Object.keys(h.store.stats_runs as object)).toHaveLength(2); // both inserts, one confirm
    await click("stats-insert");
    expect(h.confirm).toHaveBeenCalledTimes(1); // once for this visit
  });

  it("a saved list of runs that does not open, and the student says no: the sentences stay tagged, nothing is saved over the list, and it is not asked again", async () => {
    h.broken.stats_runs = true;
    h.confirm.mockReturnValue(false);
    await mount();
    await load(TWO, "Study 1");
    await pick("stats-test", "ttestInd");
    await click("stats-run-btn");
    await click("stats-insert");
    expect(h.confirm).toHaveBeenCalledTimes(1);
    expect(h.insert.mock.calls[0]![0]).toContain("data-run");
    expect(h.writes.filter((w) => w.kind === "stats_runs")).toEqual([]);
    await click("stats-insert");
    expect(h.confirm).toHaveBeenCalledTimes(1);
    expect(h.writes.filter((w) => w.kind === "stats_runs")).toEqual([]);
    expect(getLab("p1").pendingRuns).toEqual([]);
  });

  it("a failed read of stats_runs (error, not loading) holds the record: nothing is written until the retry succeeds, then once", async () => {
    h.error.stats_runs = true;
    await mount();
    await load(TWO, "Study 1");
    await pick("stats-test", "ttestInd");
    await click("stats-run-btn");
    await click("stats-insert");
    expect(h.insert.mock.calls[0]![0]).toContain("data-run");
    expect(h.writes.filter((w) => w.kind === "stats_runs")).toEqual([]);
    expect(getLab("p1").pendingRuns).toHaveLength(1);
    delete h.error.stats_runs;
    await rerender();
    expect(h.writes.filter((w) => w.kind === "stats_runs")).toHaveLength(1);
    expect(Object.keys(h.store.stats_runs as object)).toHaveLength(1);
    expect(getLab("p1").pendingRuns).toEqual([]);
  });

  it("a failed read of stats_sets holds the registration too, and it happens once the read works", async () => {
    h.error.stats_sets = true;
    await mount();
    await load(TWO, "Study 1");
    expect(h.writes.filter((w) => w.kind === "stats_sets")).toEqual([]);
    delete h.error.stats_sets;
    await rerender();
    expect(Object.keys(h.store.stats_sets as object)).toEqual(["Study 1"]);
  });

  it("a rename while the vault is locked cannot make the tag read 'no set': the set is registered under the name the record carries", async () => {
    h.locked.stats_sets = true; h.locked.stats_runs = true;
    await mount();
    await load(TWO, "Study 1");
    await pick("stats-test", "ttestInd");
    await click("stats-run-btn");
    await click("stats-insert");
    await type("stats-name", "Renamed later");
    delete h.locked.stats_sets; delete h.locked.stats_runs;
    await rerender();
    const sets = h.store.stats_sets as Record<string, unknown>;
    const runs = h.store.stats_runs as Record<string, { ds: string }>;
    expect(Object.values(runs).map((r) => r.ds)).toEqual(["Study 1"]);
    expect(Object.keys(sets)).toEqual(["Study 1"]); // the run's data set exists under the run's name
  });

  it("stats_runs keeps the newest 300", async () => {
    const mk = (ts: number) => ({ test: "desc", label: "x", ds: "d", hash: "h", fields: {}, multi: {}, extra: {}, sentence: "s", ts });
    const full: Record<string, ReturnType<typeof mk>> = {};
    for (let i = 0; i < RUNS_KEPT; i++) full["old" + i] = mk(1000 + i);
    const out = addRun(full, "new", mk(5000));
    expect(Object.keys(out)).toHaveLength(300);
    expect(out.new).toBeDefined();
    expect(out.old0).toBeUndefined(); // the oldest goes
    expect(out.old1).toBeDefined();
    // through the tab: 300 saved already, one more insert
    h.store.stats_runs = full;
    await mount();
    await load(TWO, "Study 1");
    await pick("stats-test", "ttestInd");
    await click("stats-run-btn");
    await click("stats-insert");
    const runs = h.store.stats_runs as Record<string, { ts: number }>;
    expect(Object.keys(runs)).toHaveLength(300);
    expect(runs.old0).toBeUndefined();
    expect(Object.keys(runs).filter((k) => !k.startsWith("old"))).toHaveLength(1);
    expect(getLab("p1").lastRun).not.toBeNull();
  });
});

describe("Explain in plain language", () => {
  const NAMES = "who,score,note\nana@example.org,7,ZZSENTINEL91\nana@example.org,8,ZZSENTINEL92\nana@example.org,9,ZZSENTINEL93\nana@example.org,8,ZZSENTINEL94\nbob@example.org,5,ZZSENTINEL95\nbob@example.org,6,ZZSENTINEL96\nbob@example.org,5,ZZSENTINEL97\nbob@example.org,7,ZZSENTINEL98";
  async function ready() {
    await mount();
    await load(NAMES, "Study 1");
    await pick("stats-test", "ttestInd");
    await pick("stats-field-dv", "1");
    await pick("stats-field-iv", "0");
    await click("stats-run-btn");
    expect(text("stats-sentence")).toMatch(/Welch t-test/);
  }

  it("explain scans first and the blob holds no row", async () => {
    let answer!: (v: { answer: "mask" | "send" | "cancel"; leave: string[] }) => void;
    h.askPd.mockImplementation(() => new Promise((res) => { answer = res; }));
    h.api.mockResolvedValue({ text: "  The groups differ.  ", model: "m" });
    await ready();

    // 1. the scan is offered before anything is sent; nothing has gone to the network yet
    await click("stats-explain");
    await settle();
    expect(h.askPd).toHaveBeenCalledTimes(1);
    expect(h.calls).toEqual(["askPd"]);
    expect(h.api).not.toHaveBeenCalled();
    const found = h.askPd.mock.calls[0]![0] as { counts: Record<string, number>; total: number };
    expect(found.counts["email address"]).toBeGreaterThan(0);
    expect(tid("stats-explain-busy")).not.toBeNull();

    // 2. cancel: nothing is ever sent, and the student is told
    await act(async () => { answer({ answer: "cancel", leave: [] }); });
    await settle();
    expect(h.api).not.toHaveBeenCalled();
    expect(text("stats-explain-cancelled")).toBe("Cancelled. Nothing was sent to the AI provider.");
    expect(tid("stats-explain-failed")).toBeNull(); // a quiet line, not the red banner
    expect(document.body.querySelector('[role="alert"]')).toBeNull();
    expect(tid("stats-explain-out")).toBeNull();

    // 3. ask again and mask: one request, with the address masked and no cell of the table in it
    await click("stats-explain");
    await settle();
    expect(h.askPd).toHaveBeenCalledTimes(2);
    expect(h.api).not.toHaveBeenCalled();
    await act(async () => { answer({ answer: "mask", leave: [] }); });
    await settle();
    expect(h.calls).toEqual(["askPd", "askPd", "api"]);
    expect(h.api).toHaveBeenCalledTimes(1);
    const body = JSON.parse((h.api.mock.calls[0]![1] as { body: string }).body) as { prompt: string; temperature: number; maxTokens: number };
    expect(body.temperature).toBe(0.3);
    expect(body.prompt.startsWith("You are a statistics tutor for students of ")).toBe(true);
    expect(body.prompt).toContain("APA sentence: ");
    expect(body.prompt).toContain("[email]");
    expect(body.prompt).not.toContain("example.org");
    expect(body.prompt).not.toContain("ZZSENTINEL"); // the unused column's cells are in no request
    for (const cell of ["ana@", "bob@"]) expect(body.prompt).not.toContain(cell);

    // 4. the answer is the machine's: gold edge, label, apart from the sentence
    expect(text("stats-explain-out")).toContain("The groups differ.");
    expect(text("stats-explain-out")).toContain(E.stats_res_explain_label);
    expect(tid("stats-explain-out")!.className).toContain("ai-read");
    expect(text("stats-sentence")).not.toContain("The groups differ.");

    // 5. no blob write holds a row of the data (or the sentinel, or an address)
    expect(h.writes.length).toBeGreaterThan(0);
    for (const wr of h.writes) {
      expect(wr.json, wr.kind).not.toContain("ZZSENTINEL");
      expect(wr.json, wr.kind).not.toContain("@example.org");
    }
    await click("stats-insert");
    for (const wr of h.writes) expect(wr.json, wr.kind).not.toContain("ZZSENTINEL");
    // the inserted sentence is the APA sentence only, never the explanation
    expect(h.insert.mock.calls[0]![0]).not.toContain("The groups differ.");
  });

  it("send as it is: one request, flagged as accepted; the request still carries no row", async () => {
    h.api.mockResolvedValue({ text: "It differs.", model: "m" });
    h.askPd.mockResolvedValue({ answer: "send", leave: [] });
    await ready();
    await click("stats-explain");
    await settle();
    expect(h.api).toHaveBeenCalledTimes(1);
    const body = JSON.parse((h.api.mock.calls[0]![1] as { body: string }).body) as { prompt: string; pdAccepted: boolean };
    expect(body.pdAccepted).toBe(true);
    expect(body.prompt).not.toContain("ZZSENTINEL");
  });

  it("a request with no personal data in it goes straight out, and a failure is said under the button", async () => {
    h.api.mockRejectedValue(Object.assign(new Error("429"), { status: 429, code: "rate-limit" }));
    await mount();
    await load(TWO, "Study 1");
    await pick("stats-test", "ttestInd");
    await click("stats-run-btn");
    await click("stats-explain");
    await settle();
    expect(h.askPd).not.toHaveBeenCalled();
    expect(h.api).toHaveBeenCalledTimes(1);
    expect(tid("stats-explain-failed")).not.toBeNull();
    expect(tid("stats-explain-out")).toBeNull();
  });
});

describe("Explain: a participant's name in the request (rule 2, Review Focus 2)", () => {
  // The column "name" is flagged by core's pdScan (three names, each twice); the names are the groups, so they are in the tables and nowhere else is a name.
  const NAMED = "name,score\nPriya Nair,7\nPriya Nair,8\nAmit Rao,5\nAmit Rao,6\nSara Khan,9\nSara Khan,10";
  async function readyNamed() {
    await mount();
    await load(NAMED, "Study 1");
    expect(getLab("p1").scan!.found.map((f) => f.name)).toEqual(["name"]); // the lab's scan flags the column
    await pick("stats-test", "anova1");
    await pick("stats-field-dv", "1");
    await pick("stats-field-iv", "0");
    await click("stats-run-btn");
    expect(text("stats-results-html")).toContain("Priya Nair");
  }
  const bodyOf = () => JSON.parse((h.api.mock.calls[0]![1] as { body: string }).body) as { prompt: string };

  it("the dialog shows before any request; cancel sends nothing", async () => {
    let answer!: (v: { answer: "mask" | "send" | "cancel"; leave: string[] }) => void;
    h.askPd.mockImplementation(() => new Promise((res) => { answer = res; }));
    await readyNamed();
    await click("stats-explain");
    await settle();
    expect(h.calls).toEqual(["askPd"]);
    expect(h.api).not.toHaveBeenCalled();
    expect(h.askPd.mock.calls[0]![0]).toMatchObject({ counts: { name: 3 }, total: 3 });
    await act(async () => { answer({ answer: "cancel", leave: [] }); });
    await settle();
    expect(h.api).not.toHaveBeenCalled();
    expect(h.calls).toEqual(["askPd"]);
    expect(text("stats-explain-cancelled")).toBe("Cancelled. Nothing was sent to the AI provider.");
    expect(document.body.querySelector('[role="alert"]')).toBeNull();
  });

  it("mask: the request has no name, carries the same code for the same name in the tables, and the answer comes back", async () => {
    h.askPd.mockResolvedValue({ answer: "mask", leave: [] });
    h.api.mockResolvedValue({ text: "[name 1] scored lower.", model: "m" });
    await readyNamed();
    await click("stats-explain");
    await settle();
    expect(h.calls).toEqual(["askPd", "api"]);
    const { prompt } = bodyOf();
    for (const n of ["Priya", "Nair", "Amit", "Rao", "Sara", "Khan"]) expect(prompt).not.toContain(n);
    for (const c of ["[name 1]", "[name 2]", "[name 3]"]) expect(prompt).toContain(c);
    const n = (c: string) => prompt.split(c).length - 1;
    expect(n("[name 1]")).toBeGreaterThan(0);
    expect(n("[name 2]")).toBe(n("[name 1]")); // the same name is the same code wherever it stands, so each group is counted alike
    expect(text("stats-explain-out")).toContain("scored lower");
    // the sentence on screen and the table are the student's own, unmasked
    expect(text("stats-results-html")).toContain("Priya Nair");
  });

  it("send as it is: one request with the names in it", async () => {
    h.askPd.mockResolvedValue({ answer: "send", leave: [] });
    h.api.mockResolvedValue({ text: "ok", model: "m" });
    await readyNamed();
    await click("stats-explain");
    await settle();
    expect(h.api).toHaveBeenCalledTimes(1);
    expect(h.askPd).toHaveBeenCalledTimes(1);
    expect(bodyOf().prompt).toContain("Priya Nair");
  });

  it("with the participant list open, send as it is is asked once: callAI's own check for names skips the names this step asked about (Task 11)", async () => {
    const { emptyList } = await import("../lib/blobs/kinds/participants");
    const { addPerson } = await import("../lib/tools/participants/list");
    // Priya Nair and Amit Rao are on the list; Sara Khan is not (her first name would be a suggestion). All three are group labels in the table, so all three were asked about.
    const list = ["Priya Nair", "Amit Rao"].reduce((l, name) => addPerson(l, { name, spellings: [], joined: "2026-10-01" }).list, emptyList());
    h.names = { list, mode: "codes", locked: false };
    h.askPd.mockResolvedValue({ answer: "send", leave: [] });
    h.api.mockResolvedValue({ text: "ok", model: "m" });
    await readyNamed();
    await click("stats-explain");
    await settle();
    expect(h.askPd).toHaveBeenCalledTimes(1);
    expect(h.calls).toEqual(["askPd", "api"]);
    expect(bodyOf().prompt).toContain("Priya Nair");
  });

  it("a numeric 'student id' column raises no question and the statistics reach the request unchanged", async () => {
    h.api.mockResolvedValue({ text: "ok", model: "m" });
    const rows = Array.from({ length: 12 }, (_, i) => `${i + 1},${i < 6 ? "A" : "B"},${6 + (i % 4) + (i < 6 ? 0 : 2)}`);
    await mount();
    await load("student id,group,score\n" + rows.join("\n"), "Study 1");
    expect(getLab("p1").scan!.found.map((f) => f.name)).toEqual(["student id"]);
    await pick("stats-test", "ttestInd");
    await pick("stats-field-dv", "2");
    await pick("stats-field-iv", "1");
    await click("stats-run-btn");
    const sentence = text("stats-sentence");
    await click("stats-explain");
    await settle();
    expect(h.askPd).not.toHaveBeenCalled();
    expect(h.api).toHaveBeenCalledTimes(1);
    const { prompt } = bodyOf();
    expect(prompt).not.toMatch(/\[roll number/);
    expect(prompt).toContain("APA sentence: " + sentence);
  });

  it("no flagged column, no extra question: a plain result goes straight to callAI's own check", async () => {
    h.api.mockResolvedValue({ text: "ok", model: "m" });
    await mount();
    await load(TWO, "Study 1");
    await pick("stats-test", "ttestInd");
    await click("stats-run-btn");
    await click("stats-explain");
    await settle();
    expect(h.askPd).not.toHaveBeenCalled();
    expect(h.api).toHaveBeenCalledTimes(1);
  });
});

describe("Copy", () => {
  it("copies the sentence and says so in a quiet line, not a toast; says if it could not", async () => {
    const write = vi.fn(async (_t: string) => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: write } });
    await mount();
    await load(TWO);
    await pick("stats-test", "ttestInd");
    await click("stats-run-btn");
    await click("stats-copy");
    expect(write).toHaveBeenCalledWith(text("stats-sentence"));
    expect(text("stats-copy-status")).toBe(E.stats_res_copied);
    await click("stats-run-btn"); // a new run: the old "Copied." is not about it
    expect(tid("stats-copy-status")).toBeNull();
    await click("stats-copy");
    expect(h.toast).not.toHaveBeenCalled();
    write.mockRejectedValueOnce(new Error("denied"));
    await click("stats-copy");
    expect(text("stats-copy-status")).toBe(E.stats_res_copy_failed);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
  });
});

describe("Practice mode", () => {
  it("the switch is kept in stats_prefs.gen_first, off to begin with", async () => {
    await mount();
    await load(TWO);
    expect((tid("stats-gen") as HTMLInputElement).checked).toBe(false);
    await click("stats-gen");
    expect(h.store.stats_prefs).toMatchObject({ gen_first: true });
    expect((tid("stats-gen") as HTMLInputElement).checked).toBe(true);
    await click("stats-gen");
    expect(h.store.stats_prefs).toMatchObject({ gen_first: false });
  });

  it("with it on, Run test asks for the design first; the verdict is core's; switching and running follow v1", async () => {
    h.store.stats_prefs = { gen_first: true };
    await mount();
    await load(TWO);
    await pick("stats-test", "mannwhitney");
    await click("stats-run-btn");
    expect(tid("stats-gate")).not.toBeNull();
    expect(tid("stats-results")).toBeNull(); // nothing ran
    expect(h.api).not.toHaveBeenCalled();
    const designs = [...(tid("stats-gate-design") as HTMLSelectElement).options].map((o) => o.value);
    expect(designs).toEqual(["", "desc", "one", "ind", "paired", "three", "corr", "pred", "rel", "gof", "cat"]);

    // nothing chosen: nothing to check
    await click("stats-gate-check");
    expect(tid("stats-gate-verdict")).toBeNull();
    expect(tid("stats-gate-pick")).not.toBeNull();

    // Mann-Whitney for two separate groups is the valid fallback (v1: good)
    await pick("stats-gate-design", "ind");
    await click("stats-gate-check");
    expect(text("stats-gate-verdict")).toContain(STATS_TEST_OPTIONS.mannwhitney + " is a valid choice for this design");
    expect(tid("stats-gate-switch")).toBeNull();
    expect(text("stats-gate-run")).toBe(fill(E.stats_gate_run!, { name: STATS_TEST_OPTIONS.mannwhitney }));

    // a test that does not fit: the usual test is offered, and switching asks again with fresh fields
    await pick("stats-gate-design", "corr");
    await click("stats-gate-check");
    expect(text("stats-gate-verdict")).toContain("The usual test for this design is " + STATS_TEST_OPTIONS.pearson + ", not " + STATS_TEST_OPTIONS.mannwhitney + ".");
    expect(text("stats-gate-switch")).toBe(fill(E.stats_gate_switch!, { name: STATS_TEST_OPTIONS.pearson }));
    await click("stats-gate-switch");
    expect((tid("stats-test") as HTMLSelectElement).value).toBe("pearson");
    expect(text("stats-gate-switched")).toBe(E.stats_gate_switched);
    expect(tid("stats-gate-verdict")).toBeNull();
    expect(h.toast).not.toHaveBeenCalled(); // v1 toasted this; the sentence is inline now

    // run my own choice: the gate goes and the test runs
    await pick("stats-gate-design", "ind");
    await pick("stats-test", "ttestInd"); // changing the test closes the gate (v1 statsFieldsRender)
    expect(tid("stats-gate")).toBeNull();
    await click("stats-run-btn");
    await pick("stats-gate-design", "ind");
    await click("stats-gate-check");
    await click("stats-gate-run");
    expect(tid("stats-gate")).toBeNull();
    expect(text("stats-sentence")).toMatch(/^An independent-samples Welch t-test/);
  });

  it("with it off, Run test runs at once", async () => {
    await mount();
    await load(TWO);
    await click("stats-run-btn");
    expect(tid("stats-gate")).toBeNull();
    expect(tid("stats-sentence")).not.toBeNull();
  });
});

describe("the chart under a result", () => {
  it("is drawn for the tests v1 drew one for (Pearson: a scatter with the fitted line) and for alpha and logistic there is none", async () => {
    await mount();
    await load("a,b,c,d\n1,2,3,1\n2,3,5,0\n3,5,4,1\n4,4,6,0\n5,7,6,1\n6,6,8,0\n7,8,9,1\n8,9,9,0");
    await pick("stats-test", "pearson");
    await click("stats-run-btn");
    expect(tid("stats-chart")?.getAttribute("data-kind")).toBe("scatter");
    expect(document.body.querySelectorAll("figure svg circle")).toHaveLength(8);
    await pick("stats-test", "alpha");
    await click("stats-run-btn");
    expect(tid("stats-results")).not.toBeNull();
    expect(tid("stats-chart")).toBeNull();
  });
});

describe("the words", () => {
  it("every new English key has a Hindi draft with the same placeholders", () => {
    for (const k of Object.keys(statsEn).filter((x) => /^stats_(run|gate|res|chart)_/.test(x))) {
      expect(hi[k], k).toBeTruthy();
      const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
      expect(vars(hi[k]!), k).toBe(vars((statsEn as Record<string, string>)[k]!));
    }
  });
  it("no em dash, no emoji in the new English copy", () => {
    for (const [k, v] of Object.entries(statsEn as Record<string, string>).filter(([x]) => /^stats_(run|gate|res|chart)_/.test(x))) {
      expect(v, k).not.toMatch(/—/);
      expect(v, k).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});
