// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { chartParseLines, quickChartSvg, sanitizeHtml, statsParseText, vennSvg, VZ_I18N, type ParsedData, type VzOptions } from "@appuscholar/core";
import en from "../messages/en.json";
import hiBase from "../messages/hi.json";
import statsEn from "../messages/tools/stats.en.json";
import statsHi from "../messages/tools/stats.hi.json";

/*
 * Task B5: the Charts tab (v1 Chart Studio vzDlg 1651-1699 and vz* 3636-3924; Quick chart chartDlg 1754-1799 and 4854-4947). The expected values for Chart Studio are core's golden fixture
 * (packages/core/test/golden/charts/cases.json: v1's dialog driven in jsdom, 84 cases), read here, not retyped, and every case is fed through the tab as a student would: the data
 * is pasted, the chart, columns and options are picked, and the page is read. jsdom has no canvas, so the SVG-to-PNG renderer is injected (setPngEnv) with a stub canvas.
 */

type Block = { kind: string; html?: string; rows?: string[][] };
type Gold = {
  id: string; csv: string; lang: "en" | "hi"; yIdx: number | null; gIdx: number | null; options: VzOptions; fig: string; given: Record<string, string>; svg: string; tableHtml: string | null;
  table: Block[]; warn: string | null; caption: { n: number; title: string; note: string } | null; typed: boolean; fields: { title: string; note: string; xl: string; yl: string };
  selects: { yName: string; gName: string; gLabel: string }; nodata: string | null; threw: string | null;
};
const FX = JSON.parse(readFileSync(join(__dirname, "../../../packages/core/test/golden/charts/cases.json"), "utf8")) as { cases: Gold[]; node: string; platform: string; arch: string };
/** Core's rule for comparing an svg with the fixture (register rows D-W1-16, D-W2-23; harness/compare.ts expectSvgGolden, which cannot be imported under jsdom): exact on the platform that captured it; elsewhere the text around the numbers exact and each number within 1e-12 relative (1e-13 absolute). */
const EXACT = FX.node.replace(/^v(\d+).*/, "$1") === process.versions.node.split(".")[0] && FX.platform === process.platform && FX.arch === process.arch;
function expectSvgGolden(actual: string, expected: string, label: string) {
  if (EXACT) { expect(actual, label).toBe(expected); return; }
  const NUM = /-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/g;
  expect(actual.split(NUM), label).toEqual(expected.split(NUM));
  const a = (actual.match(NUM) ?? []).map(Number), e = (expected.match(NUM) ?? []).map(Number);
  expect(a.length, label).toBe(e.length);
  a.forEach((v, i) => {
    if (Number.isInteger(v) && Number.isInteger(e[i])) expect(v, label).toBe(e[i]);
    else expect(Math.abs(v - e[i]!), `${label} number ${i}`).toBeLessThanOrEqual(Math.max(1e-12 * Math.max(Math.abs(v), Math.abs(e[i]!)), 1e-13));
  });
}

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  download: vi.fn(),
  insertBlock: vi.fn(async (_html: string, _o?: { at?: string }) => true),
  store: {} as Record<string, unknown>,
  writes: [] as Array<{ kind: string; json: string }>,
  loading: {} as Record<string, boolean>,
  locked: {} as Record<string, boolean>
}));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/export/download", () => ({ downloadBlob: h.download, safeFileName: (s: string) => s }));
vi.mock("@/lib/editor/docAccess", () => ({ useDocAccess: () => ({ insertBlock: h.insertBlock }) }));
vi.mock("@/lib/blobs/useProjectBlob", async () => {
  const { useReducer } = await import("react");
  return {
    useProjectBlob: (kind: string) => {
      const [, force] = useReducer((n: number) => n + 1, 0);
      return {
        value: h.store[kind] ?? null, loading: h.loading[kind] ?? false, locked: h.locked[kind] ?? false, broken: false, readOnly: false,
        set: (next: unknown) => {
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
// Task B1/B2 pieces the Panel pulls in for its Data tab; this file mounts the Charts tab only.
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ projectId: "p1", docOpen: false, openDocument: vi.fn() }) }));
vi.mock("@/lib/ai/useCallAI", () => ({ useCallAI: () => async () => "" }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1" }, settings: { field: "psychology" } }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.setConfig({ testTimeout: 90_000, hookTimeout: 120_000 });

import { Panel } from "../components/tools/stats/Panel";
import { ChartsTab } from "../components/tools/stats/ChartsTab";
import { LangProvider } from "../lib/i18n";
import { editorExtensions } from "../lib/editorExtensions";
import { patchLab, resetLabs } from "../lib/tools/stats/lab";
import { resetCharts, quickView, defaultQuickForm, vzTrFor } from "../lib/tools/stats/chartStudio";
import { dataUrlToBlob, LOAD_TIMEOUT_MS, PNG_URL, setPngEnv, svgDataUrl, svgSize, svgToPng, withSize, type PngCanvas, type PngEnv } from "../lib/tools/stats/png";

const E = { ...(en as Record<string, string>), ...(statsEn as Record<string, string>) };
const roots: Root[] = [];
const tid = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const text = (id: string) => tid(id)?.textContent ?? "";
const fill = (s: string, vars: Record<string, string | number> = {}) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
const plain = (html: string) => { const d = document.createElement("div"); d.innerHTML = html; return d.textContent ?? ""; };
/** The svg a data-URL <img> carries. */
const svgOf = (img: HTMLElement | null) => decodeURIComponent((img as HTMLImageElement).getAttribute("src")!.replace(/^data:image\/svg\+xml;charset=utf-8,/, ""));

async function mount(lang: "en" | "hi" = "en", tab: "panel" | "tab" = "tab"): Promise<Root> {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => {
    root.render(<LangProvider lang={lang} onChange={() => {}}>{tab === "panel" ? <Panel tab="charts" projectId="p1" /> : <ChartsTab projectId="p1" />}</LangProvider>);
  });
  return root;
}
async function unmount(root: Root) { await act(async () => { root.unmount(); }); roots.splice(roots.indexOf(root), 1); }
async function type(testId: string, value: string) {
  const el = tid(testId) as HTMLInputElement | HTMLTextAreaElement;
  if (!el) throw new Error("no element " + testId);
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function pick(testId: string, value: string) {
  const el = tid(testId) as HTMLSelectElement;
  if (!el) throw new Error("no element " + testId);
  await act(async () => { el.value = value; el.dispatchEvent(new Event("change", { bubbles: true })); });
}
async function tick(testId: string, on: boolean) {
  const el = tid(testId) as HTMLInputElement;
  if (!el) throw new Error("no element " + testId);
  if (el.checked !== on) await act(async () => { el.click(); });
}
async function click(testId: string) {
  const el = tid(testId);
  if (!el) throw new Error("no element " + testId);
  await act(async () => { el.click(); });
}
async function until(cond: () => boolean, ms = 5000) {
  const t0 = Date.now();
  while (!cond() && Date.now() - t0 < ms) await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  expect(cond(), "condition not met in time").toBe(true);
}

/** A stub canvas: it keeps what was drawn on it, and its "PNG" is the text `image/png|<width>x<height>|<fill>` in base64. */
type Stub = PngCanvas & { drawn: Array<{ w: number; h: number }>; fills: string[]; loaded: string[] };
let canvases: Stub[] = [];
let loadFails = false;
/** While set, the stub's image load waits for it (a slow PNG step). */
let loadGate: Promise<void> | null = null;
const stubEnv = (): PngEnv => ({
  load: async (url) => { if (loadGate) await loadGate; if (loadFails) throw new Error("no"); stubLog.loaded.push(url); return { url }; },
  canvas: (width, height) => {
    const c: Stub = {
      width, height, drawn: [], fills: [], loaded: stubLog.loaded,
      getContext: () => ({
        set fillStyle(v: string) { c.fills.push(v); },
        get fillStyle() { return c.fills[c.fills.length - 1] ?? ""; },
        fillRect: () => {},
        drawImage: (_i, _x, _y, w, hh) => { c.drawn.push({ w, h: hh }); }
      }),
      toDataURL: (type) => `data:${type};base64,${btoa(`${type}|${c.width}x${c.height}`)}`
    };
    canvases.push(c);
    return c;
  }
});
/** A Blob's text (jsdom's Blob has no text()). */
const blobText = (b: Blob) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsText(b); });
const stubLog = { loaded: [] as string[] };
const pngInfo = (url: string) => atob(url.replace("data:image/png;base64,", ""));

beforeEach(() => {
  resetLabs(); resetCharts();
  h.store = {}; h.writes = []; h.loading = {}; h.locked = {};
  h.toast.mockClear(); h.download.mockClear(); h.insertBlock.mockClear(); h.insertBlock.mockResolvedValue(true);
  canvases = []; stubLog.loaded = []; loadFails = false; loadGate = null;
  setPngEnv(stubEnv());
});
afterEach(async () => {
  for (const r of roots.splice(0)) await act(async () => { r.unmount(); });
  document.body.innerHTML = "";
  setPngEnv(null);
  vi.restoreAllMocks();
});

const ANOVA = "arm,score\n" + ["CBT,12", "CBT,14", "CBT,11", "Mindful,16", "Mindful,18", "Mindful,17", "Waitlist,22", "Waitlist,25", "Waitlist,21"].join("\n");

describe("the picture helpers (png.ts)", () => {
  it("reads the size from the viewBox and gives a svg without width and height the viewBox's", () => {
    const v = vennSvg({ a: "A", aSize: "1", b: "B", bSize: "2", c: "", cSize: "", ab: "3", ac: "", bc: "", abc: "", title: "" });
    expect(svgSize(v)).toEqual({ w: 420, h: 260 });
    expect(svgSize('<svg viewBox="0 0 12.5 8">')).toEqual({ w: 12.5, h: 8 });
    expect(svgSize("<svg>")).toBeNull();
    expect(svgSize('<svg viewBox="0 0 0 0">')).toBeNull();
    const sized = withSize(v, 420, 260);
    expect(sized).toContain(' width="420"');
    expect(sized).toContain(' height="260"');
    // a svg that has a size is left as it is
    const own = '<svg viewBox="0 0 640 420" width="640" height="420">';
    expect(withSize(own + "</svg>", 640, 420)).toBe(own + "</svg>");
  });
  it("svgToPng draws the svg on a white canvas twice its size and gives the canvas's PNG", async () => {
    const svg = quickChartSvg([{ label: "a", val: 1 }], "bar", "");
    const { w, h: ht } = svgSize(svg)!;
    const url = await svgToPng(svg, 2);
    expect(canvases).toHaveLength(1);
    const c = canvases[0]!;
    expect([c.width, c.height]).toEqual([w * 2, ht * 2]);
    expect(c.fills).toEqual(["#fff"]);
    expect(c.drawn).toEqual([{ w: w * 2, h: ht * 2 }]);
    expect(pngInfo(url)).toBe(`image/png|${w * 2}x${ht * 2}`);
    expect(PNG_URL.test(url)).toBe(true);
    // the browser is given the svg as a data URL with a size
    expect(decodeURIComponent(stubLog.loaded[0]!.replace(/^data:image\/svg\+xml;charset=utf-8,/, ""))).toBe(withSize(svg, w, ht));
    // another scale
    const one = await svgToPng(svg, 1);
    expect(pngInfo(one)).toBe(`image/png|${w}x${ht}`);
  });
  it("refuses a svg with no size, a canvas with no context, and a svg the browser cannot load", async () => {
    await expect(svgToPng("<svg></svg>")).rejects.toThrow();
    setPngEnv({ load: async () => ({}), canvas: () => ({ width: 1, height: 1, getContext: () => null, toDataURL: () => "" }) });
    await expect(svgToPng(quickChartSvg([{ label: "a", val: 1 }], "line", ""))).rejects.toThrow();
    setPngEnv(stubEnv());
    loadFails = true;
    await expect(svgToPng(quickChartSvg([{ label: "a", val: 1 }], "line", ""))).rejects.toThrow();
  });
  it("only a base64 PNG data URL may become a picture's src; a data URL becomes a Blob of its bytes", () => {
    expect(PNG_URL.test("data:image/png;base64,AAAA")).toBe(true);
    for (const bad of ['data:image/png;base64,AAAA" onerror="x', "data:image/svg+xml;base64,AAAA", "javascript:alert(1)", "data:image/png,AAAA", "data:image/png;base64,"]) expect(PNG_URL.test(bad), bad).toBe(false);
    const b = dataUrlToBlob("data:image/png;base64," + btoa("PNGDATA"));
    expect(b.type).toBe("image/png");
    expect(b.size).toBe(7);
    expect(() => dataUrlToBlob("nope")).toThrow();
  });
  it("svgDataUrl round-trips any svg", () => {
    const s = '<svg viewBox="0 0 1 1"><text>é & "x" #1 %</text></svg>';
    expect(decodeURIComponent(svgDataUrl(s).replace(/^data:image\/svg\+xml;charset=utf-8,/, ""))).toBe(s);
  });
});

describe("Chart Studio: 84 chart cases render v1's tables", () => {
  it("every golden case, pasted and picked through the tab, shows v1's key, table, warning, picture and 'No numbers to draw yet' message", async () => {
    expect(FX.cases).toHaveLength(84);
    const kinds = new Set<string>();
    for (const c of FX.cases) {
      resetCharts();
      const root = await mount(c.lang);
      const tr = vzTrFor(c.lang);
      const o = c.options;
      await type("chart-paste", c.csv);
      // the groups first: the select is hidden for a histogram and a Q-Q plot, so it is set while a box plot is showing
      await pick("chart-type", "box");
      if (tid("chart-y")) await pick("chart-y", c.yIdx === null ? "" : String(c.yIdx));
      if (tid("chart-g")) await pick("chart-g", c.gIdx === null ? "" : String(c.gIdx));
      await pick("chart-type", o.type);
      if (o.type === "bar") await pick("chart-err", o.err);
      await pick("chart-pal", o.palette);
      if (o.type === "hist" && c.given.vzBins !== "") await type("chart-bins", c.given.vzBins!);
      if (o.type === "box" || o.type === "bar") await tick("chart-pts", o.showPts);
      await tick("chart-n", o.showN);
      if (o.title !== "") await tick("chart-titlein", true);
      if (c.typed) {
        await type("chart-title", c.fields.title);
        await type("chart-note", c.fields.note);
        await type("chart-xl", c.fields.xl);
        await type("chart-yl", c.fields.yl);
      }
      if (c.given.vzYMin !== "") await type("chart-ymin", c.given.vzYMin!);
      if (c.given.vzYMax !== "") await type("chart-ymax", c.given.vzYMax!);
      await type("chart-fig", c.given.vzFig!);

      if (c.threw !== null) {
        expect(text("chart-failed"), c.id).toBe(E.stats_ch_failed);
        expect(tid("chart-result"), c.id).toBeNull();
        kinds.add("threw");
      } else if (c.nodata !== null) {
        expect(text("chart-nodata"), c.id).toBe(c.nodata);
        expect(c.nodata).toBe(tr("vz_nodata"));
        expect(tid("chart-result"), c.id).toBeNull();
        expect(tid("chart-insert"), c.id).toBeNull();
        kinds.add("nodata");
      } else {
        // the key note and the table, cell by cell, as v1's #vzTable read back
        const tbl = tid("chart-table")!;
        const gold = c.table;
        expect(tbl.querySelector("p.desc")!.textContent, c.id).toBe(plain(gold[0]!.html!));
        const rows = [...tbl.querySelectorAll("table tr")].map((r) => [...r.children].map((x) => x.textContent));
        expect(rows, c.id).toEqual(gold[1]!.rows!.map((r) => r.map(plain)));
        expect([...tbl.querySelectorAll("table tr:first-child > *")].every((x) => x.tagName === "TH"), c.id).toBe(true);
        // the warning (amber), only where v1 showed one
        if (c.warn !== null) expect(text("chart-warn"), c.id).toBe(c.warn);
        else expect(tid("chart-warn"), c.id).toBeNull();
        // the picture is core's svg for these options, held to v1's string as core's own test holds it
        const svg = svgOf(tid("chart-img"));
        expectSvgGolden(svg, c.svg, c.id);
        // the figure number and caption v1 would insert
        expect(tid("chart-img")!.getAttribute("alt"), c.id).toBe(fill(((c.lang === "hi" ? statsHi : statsEn) as Record<string, string>).stats_ch_preview_alt!, { n: c.caption!.n }));
        expect((tid("chart-fig") as HTMLInputElement).value, c.id).toBe(c.given.vzFig);
        // the default title, note and axis labels v1 wrote while the student had not typed
        expect((tid("chart-title") as HTMLInputElement).value, c.id).toBe(c.fields.title);
        expect((tid("chart-note") as HTMLInputElement).value, c.id).toBe(c.fields.note);
        expect((tid("chart-xl") as HTMLInputElement).value, c.id).toBe(c.fields.xl);
        expect((tid("chart-yl") as HTMLInputElement).value, c.id).toBe(c.fields.yl);
        kinds.add(o.type + (c.lang === "hi" ? "-hi" : "") + (c.warn ? "-warn" : ""));
      }
      await unmount(root);
    }
    // all four charts, Hindi, the warning, no data and the throw were driven
    for (const k of ["box", "bar", "hist", "qq", "box-hi", "bar-hi", "hist-hi", "qq-hi", "bar-warn", "nodata", "threw"]) expect(kinds.has(k), k).toBe(true);
  });
  it("the Hindi cases use v1's Hindi strings for the table and key", async () => {
    const c = FX.cases.find((x) => x.id === "anova1-box-hindi")!;
    await mount("hi");
    await type("chart-paste", c.csv);
    await pick("chart-y", String(c.yIdx));
    await pick("chart-g", String(c.gIdx));
    const hi = VZ_I18N.hi as Record<string, string>;
    expect(tid("chart-table")!.querySelector("p.desc")!.textContent).toBe(hi.vz_box_key);
    expect(tid("chart-table")!.querySelector("th")!.textContent).toBe(hi.vz_th_group);
  });
});

describe("Chart Studio: the controls", () => {
  it("shows nothing but the paste box until the text has columns, and says so when it has none", async () => {
    await mount();
    expect(tid("chart-controls")).toBeNull();
    expect(tid("chart-no-columns")).toBeNull();
    await type("chart-paste", "just some words");
    expect(tid("chart-controls")).toBeNull();
    expect(text("chart-no-columns")).toBe(E.stats_ch_no_columns);
    await type("chart-paste", ANOVA);
    expect(tid("chart-controls")).not.toBeNull();
    expect(tid("chart-no-columns")).toBeNull();
  });
  it("shows each option only for the chart that uses it (v1 vzSync)", async () => {
    await mount();
    await type("chart-paste", ANOVA);
    const shown = () => ["chart-g", "chart-err", "chart-bins", "chart-pts"].filter((id) => tid(id)).join(",");
    await pick("chart-type", "box"); expect(shown()).toBe("chart-g,chart-pts");
    await pick("chart-type", "bar"); expect(shown()).toBe("chart-g,chart-err,chart-pts");
    await pick("chart-type", "hist"); expect(shown()).toBe("chart-bins");
    await pick("chart-type", "qq"); expect(shown()).toBe("");
    // the options of the type and the labels are v1's, through the dictionary
    await pick("chart-type", "bar");
    expect([...(tid("chart-type") as HTMLSelectElement).options].map((x) => x.textContent)).toEqual(["vz_t_box", "vz_t_bar", "vz_t_hist", "vz_t_qq"].map((k) => E[k]));
    expect([...(tid("chart-err") as HTMLSelectElement).options].map((x) => x.value)).toEqual(["ci", "sd", "se", "none"]);
    expect([...(tid("chart-err") as HTMLSelectElement).options].map((x) => x.textContent)).toEqual(["stats_ch_err_ci", "stats_ch_err_sd", "stats_ch_err_se", "stats_ch_err_none"].map((k) => E[k]));
  });
  it("offers the numeric columns for the score and the categorical ones (and 'no groups') for the groups; the first of each is picked", async () => {
    await mount();
    await type("chart-paste", "id,arm,sex,score,age\n1,A,F,12,20\n2,B,M,15,22\n3,A,F,11,21\n4,B,M,19,25");
    const d = statsParseText("id,arm,sex,score,age\n1,A,F,12,20")!;
    const names = (id: string) => [...(tid(id) as HTMLSelectElement).options].map((x) => x.textContent);
    const num = d.cols.filter((c) => c.type === "numeric").map((c) => c.name);
    const cat = d.cols.filter((c) => c.type === "categorical").map((c) => c.name);
    expect(names("chart-y")).toEqual(num);
    expect(names("chart-g")).toEqual([E.vz_none, ...cat]);
    expect((tid("chart-y") as HTMLSelectElement).selectedOptions[0]!.textContent).toBe(num[0]);
    expect((tid("chart-g") as HTMLSelectElement).selectedOptions[0]!.textContent).toBe(cat[0]);
  });
  it("a typed title, note or axis label stays when the chart changes; an untouched one follows the new chart (v1 dataset.touched)", async () => {
    await mount();
    await type("chart-paste", ANOVA);
    expect((tid("chart-title") as HTMLInputElement).value).toBe("Distribution of score by arm");
    await pick("chart-type", "hist");
    expect((tid("chart-title") as HTMLInputElement).value).toBe("Distribution of score");
    await type("chart-title", "My figure");
    await pick("chart-type", "qq");
    expect((tid("chart-title") as HTMLInputElement).value).toBe("My figure");
    expect((tid("chart-yl") as HTMLInputElement).value).toBe("Sample quantiles");
  });
  it("the figure title is drawn inside the picture only when asked", async () => {
    await mount();
    await type("chart-paste", ANOVA);
    expect(svgOf(tid("chart-img"))).not.toContain("Distribution of score by arm");
    await tick("chart-titlein", true);
    expect(svgOf(tid("chart-img"))).toContain("Distribution of score by arm");
  });
  it("keeps what was typed when the tab is left and opened again, and the rows are in no blob", async () => {
    const root = await mount();
    await type("chart-paste", "group,score\nZXQ-SENTINEL,12\nZXQ-SENTINEL,15\nB,9");
    await pick("chart-type", "bar");
    await unmount(root);
    await mount();
    expect((tid("chart-paste") as HTMLTextAreaElement).value).toContain("ZXQ-SENTINEL");
    expect((tid("chart-type") as HTMLSelectElement).value).toBe("bar");
    expect(h.writes.map((w) => w.json).join("")).not.toContain("ZXQ-SENTINEL");
  });
  it("is mounted by the stats Panel for the 'charts' tab", async () => {
    await mount("en", "panel");
    expect(tid("charts-tab")).not.toBeNull();
    expect(tid("not-built")).toBeNull();
    expect(text("chart-studio")).toContain(E.stats_ch_studio);
    expect(text("quick-chart")).toContain(E.stats_ch_quick);
  });
});

describe("Chart Studio: the data from the Data tab", () => {
  const LAB: ParsedData = statsParseText("group,score\nA,12\nA,15\nB,9\nB,11\nB,10")!;
  it("without a parsed table the button says so and nothing is drawn", async () => {
    await mount();
    await click("chart-use-lab");
    expect(text("chart-note")).toBe(E.stats_ch_no_lab);
    expect(tid("chart-controls")).toBeNull();
  });
  it("with one the chart is drawn from it (cells that hold a comma are not split), and 'use the pasted data instead' goes back", async () => {
    const data = statsParseText('group,score\n"Smith, J",12\n"Smith, J",15\n"Lee, K",9\n"Lee, K",11')!;
    patchLab("p1", { data });
    await mount();
    await click("chart-use-lab");
    expect(text("chart-source")).toBe(fill(E.stats_ch_from_lab!, { n: 4 }));
    const rows = [...tid("chart-table")!.querySelectorAll("table tr")].map((r) => r.children[0]!.textContent);
    expect(rows).toEqual([E.vz_th_group, "Smith, J", "Lee, K"]);
    await click("chart-use-paste");
    expect(tid("chart-source")).toBeNull();
    expect(tid("chart-controls")).toBeNull();
    await type("chart-paste", ANOVA);
    expect(tid("chart-controls")).not.toBeNull();
  });
  it("typing in the paste box takes over from the Data tab's table, and the rows never reach a blob", async () => {
    patchLab("p1", { data: LAB });
    await mount();
    await click("chart-use-lab");
    expect(tid("chart-controls")).not.toBeNull();
    await type("chart-paste", ANOVA);
    expect(tid("chart-source")).toBeNull();
    expect(h.writes).toEqual([]);
  });
});

describe("Chart Studio: Insert into my document, and the downloads", () => {
  const draw = async (csv = ANOVA) => { await mount(); await type("chart-paste", csv); };
  const inserted = () => {
    const [html, opts] = h.insertBlock.mock.calls[0]!;
    const d = document.createElement("div");
    d.innerHTML = html;
    return { html, opts, kids: [...d.children], d };
  };

  it("puts 'Figure 1' in bold, the title in italics, the picture as a PNG at twice the size, 'Note.' and the note, at the cursor, in that order", async () => {
    await draw();
    await type("chart-title", "Scores by arm");
    await type("chart-note", "Bars show means.");
    await click("chart-insert");
    await until(() => h.insertBlock.mock.calls.length === 1);
    const { opts, kids } = inserted();
    expect(opts).toEqual({ at: "cursor" });
    expect(kids.map((k) => k.tagName)).toEqual(["P", "P", "IMG", "P", "P"]);
    expect(kids[0]!.innerHTML).toBe("<strong>Figure 1</strong>");
    expect(kids[1]!.innerHTML).toBe("<em>Scores by arm</em>");
    const img = kids[2] as HTMLImageElement;
    expect(PNG_URL.test(img.getAttribute("src")!)).toBe(true);
    expect(img.getAttribute("alt")).toBe("Scores by arm");
    expect(img.getAttribute("style")).toBe("width:520px;max-width:100%");
    expect(kids[3]!.innerHTML).toBe("<em>Note.</em> Bars show means.");
    // 640 by 420 is core's frame; the PNG is twice that
    expect(pngInfo(img.getAttribute("src")!)).toBe("image/png|1280x840");
    expect(canvases).toHaveLength(1);
    expect(h.toast).toHaveBeenCalledWith(E.stats_res_inserted);
    expect(E.stats_res_inserted).toBe("Inserted");
  });
  it("uses the figure number in the box and the default title when none was typed, then counts up: the box shows 2 and stats_prefs.figno is 2", async () => {
    await draw();
    await click("chart-insert");
    await until(() => h.insertBlock.mock.calls.length === 1);
    expect(inserted().kids[0]!.innerHTML).toBe("<strong>Figure 1</strong>");
    expect(inserted().kids[1]!.innerHTML).toBe("<em>Distribution of score by arm</em>");
    await until(() => (tid("chart-fig") as HTMLInputElement).value === "2");
    expect(h.writes.filter((w) => w.kind === "stats_prefs").map((w) => JSON.parse(w.json))).toEqual([{ figno: 2 }]);
    // the second insert is Figure 2 and makes the next 3
    await click("chart-insert");
    await until(() => h.insertBlock.mock.calls.length === 2);
    expect(h.insertBlock.mock.calls[1]![0]).toContain("<strong>Figure 2</strong>");
    await until(() => (tid("chart-fig") as HTMLInputElement).value === "3");
    expect((h.store.stats_prefs as { figno: number }).figno).toBe(3);
  });
  it("starts from the saved figure number (stats_prefs.figno) and keeps the other preferences", async () => {
    h.store.stats_prefs = { statsname: "Study 1", gen_first: true, figno: 4 };
    await draw();
    expect((tid("chart-fig") as HTMLInputElement).value).toBe("4");
    await click("chart-insert");
    await until(() => h.insertBlock.mock.calls.length === 1);
    expect(inserted().kids[0]!.innerHTML).toBe("<strong>Figure 4</strong>");
    await until(() => h.writes.length === 1);
    expect(JSON.parse(h.writes[0]!.json)).toEqual({ statsname: "Study 1", gen_first: true, figno: 5 });
  });
  it("a number typed in the box wins; a locked vault writes nothing but the box still counts up", async () => {
    h.locked.stats_prefs = true;
    await draw();
    await type("chart-fig", "7");
    await click("chart-insert");
    await until(() => h.insertBlock.mock.calls.length === 1);
    expect(inserted().kids[0]!.innerHTML).toBe("<strong>Figure 7</strong>");
    await until(() => (tid("chart-fig") as HTMLInputElement).value === "8");
    expect(h.writes).toEqual([]);
  });
  it("leaves out the title and note paragraphs when both are empty, and escapes what was typed", async () => {
    await draw();
    await type("chart-title", "");
    await type("chart-note", "");
    await click("chart-insert");
    await until(() => h.insertBlock.mock.calls.length === 1);
    expect(inserted().kids.map((k) => k.tagName)).toEqual(["P", "IMG", "P"]);
    expect(inserted().kids[1]!.getAttribute("alt")).toBe("Figure 1");
    h.insertBlock.mockClear();
    await type("chart-title", '<b onmouseover=alert(1)>"x"</b>');
    await type("chart-note", "<script>alert(2)</script> & more");
    await click("chart-insert");
    await until(() => h.insertBlock.mock.calls.length === 1);
    const { html, d } = inserted();
    expect(d.querySelector("b, script")).toBeNull();
    expect(d.querySelector("[onmouseover]")).toBeNull();
    expect(html).toContain("&lt;b onmouseover=alert(1)&gt;&quot;x&quot;&lt;/b&gt;");
    expect(d.children[1]!.textContent).toBe('<b onmouseover=alert(1)>"x"</b>');
    expect([...d.children].at(-2)!.textContent).toBe("Note. <script>alert(2)</script> & more");
  });
  it("puts nothing in and counts nothing when the document did not take it (insertBlock false)", async () => {
    h.insertBlock.mockResolvedValue(false);
    await draw();
    await click("chart-insert");
    await until(() => h.insertBlock.mock.calls.length === 1);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect((tid("chart-fig") as HTMLInputElement).value).toBe("1");
    expect(h.writes).toEqual([]);
    expect(h.toast).not.toHaveBeenCalled();
  });
  it("says 'Could not make the picture' and inserts nothing when the browser cannot make the PNG", async () => {
    loadFails = true;
    await draw();
    await click("chart-insert");
    await until(() => tid("chart-img-fail") !== null);
    expect(text("chart-img-fail")).toBe(E.vz_img_fail);
    expect(tid("chart-img-fail")!.getAttribute("role")).toBe("alert");
    expect(h.insertBlock).not.toHaveBeenCalled();
    expect(h.toast).not.toHaveBeenCalled();
    // the SVG download needs no canvas
    await click("chart-svg");
    expect(h.download).toHaveBeenCalledTimes(1);
  });
  it("Download PNG gives figure-<N>.png (the PNG at 2x) and Download SVG gives figure-<N>.svg (the svg that is drawn)", async () => {
    await draw();
    await type("chart-fig", "3");
    await click("chart-png");
    await until(() => h.download.mock.calls.length === 1);
    const [name, blob] = h.download.mock.calls[0] as [string, Blob];
    expect(name).toBe("figure-3.png");
    expect(blob.type).toBe("image/png");
    expect(await blobText(blob)).toBe("image/png|1280x840");
    await click("chart-svg");
    const [n2, b2] = h.download.mock.calls[1] as [string, Blob];
    expect(n2).toBe("figure-3.svg");
    expect(b2.type).toBe("image/svg+xml");
    expect(await blobText(b2)).toBe(svgOf(tid("chart-img")));
    // downloading does not count a figure
    expect((tid("chart-fig") as HTMLInputElement).value).toBe("3");
    expect(h.writes).toEqual([]);
  });
  it("shows no buttons (and nothing to insert) when there are no numbers to draw", async () => {
    await mount();
    await type("chart-paste", "group,score\nA,\nB,");
    expect(text("chart-nodata")).toBe(E.vz_nodata);
    for (const id of ["chart-insert", "chart-png", "chart-svg", "chart-img"]) expect(tid(id), id).toBeNull();
    expect(h.insertBlock).not.toHaveBeenCalled();
  });
});

describe("Chart Studio: group names are text, never markup", () => {
  const HOSTILE = "<img src=x onerror=alert(1)>";
  it("a group named like a tag appears as text in the table and as escaped text in the picture; no element or handler is created", async () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    await mount();
    await type("chart-paste", `group,score\n"${HOSTILE}",3\n"${HOSTILE}",5\nB,4\nB,7`);
    const cells = [...tid("chart-table")!.querySelectorAll("td:first-child")].map((x) => x.textContent);
    expect(cells).toEqual([HOSTILE, "B"]);
    expect(tid("chart-table")!.querySelector("img, script, [onerror]")).toBeNull();
    // the only picture on the page is the chart's own, and its source is a data URL
    expect(document.body.querySelectorAll("img")).toHaveLength(1);
    expect(document.body.querySelector("[onerror]")).toBeNull();
    const svg = svgOf(tid("chart-img"));
    // v1 cuts a group name to 22 characters before it escapes it
    expect(svg).toContain("&lt;img src=x onerror=ale<");
    expect(svg).not.toContain("<img");
    // the same safe text goes into the file that is downloaded
    await click("chart-svg");
    expect(await blobText(h.download.mock.calls[0]![1] as Blob)).toBe(svg);
    expect(alert).not.toHaveBeenCalled();
  });
  it("a hostile title and axis label cannot leave the picture or the page either", async () => {
    await mount();
    await type("chart-paste", ANOVA);
    await tick("chart-titlein", true);
    for (const id of ["chart-title", "chart-xl", "chart-yl"]) await type(id, HOSTILE);
    const svg = svgOf(tid("chart-img"));
    expect(svg).not.toContain("<img");
    expect((svg.match(/&lt;img src=x onerror=alert\(1\)&gt;/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(document.body.querySelectorAll("img")).toHaveLength(1);
  });
});

describe("Quick chart: bar and line", () => {
  const make = async (kind: string, data: string, title = "") => {
    await mount();
    await pick("quick-type", kind);
    await type("quick-data", data);
    if (title) await type("quick-title", title);
    await click("quick-make");
  };
  it("draws core's svg for the lines the student typed: a bar chart that starts at zero even when every value is 95 to 99", async () => {
    await make("bar", "A,95\nB,99\nC,97", "Scores");
    const svg = svgOf(tid("quick-img"));
    expect(svg).toBe(quickChartSvg(chartParseLines("A,95\nB,99\nC,97"), "bar", "Scores"));
    const ticks = [...svg.matchAll(/<text\b[^>]*text-anchor="end"[^>]*>([^<]*)<\/text>/g)].map((m) => parseFloat(m[1]!));
    expect(Math.min(...ticks)).toBe(0);
    expect(tid("quick-img")!.getAttribute("alt")).toBe(E.stats_ch_q_preview_alt);
  });
  it("draws a line chart", async () => {
    await make("line", "Mon,3\nTue,5\nWed,4");
    const svg = svgOf(tid("quick-img"));
    expect(svg).toBe(quickChartSvg(chartParseLines("Mon,3\nTue,5\nWed,4"), "line", ""));
    expect(svg).toContain("<polyline");
  });
  it("refuses with v1's message when no line can be read, and draws nothing", async () => {
    await make("bar", "no comma\nname,notanumber\n");
    expect(text("quick-empty")).toBe(E.stats_ch_q_empty);
    expect(tid("quick-empty")!.getAttribute("role")).toBe("alert");
    expect(tid("quick-img")).toBeNull();
    expect(tid("quick-insert")).toBeNull();
  });
  it("a good list after a refusal replaces the message; changing the type clears the picture (v1 chartTypeChange)", async () => {
    await make("bar", "x");
    expect(tid("quick-empty")).not.toBeNull();
    await type("quick-data", "A,1\nB,2");
    await click("quick-make");
    expect(tid("quick-empty")).toBeNull();
    expect(tid("quick-img")).not.toBeNull();
    await pick("quick-type", "line");
    expect(tid("quick-img")).toBeNull();
    await pick("quick-type", "bar");
    expect(tid("quick-data")).not.toBeNull();
    expect((tid("quick-data") as HTMLTextAreaElement).value).toBe("A,1\nB,2");
  });
  it("Insert puts a PNG at 2x at the cursor, with the title as its alt text, and says 'Inserted'", async () => {
    await make("bar", "A,1\nB,2", "My bars");
    await click("quick-insert");
    await until(() => h.insertBlock.mock.calls.length === 1);
    const [html, opts] = h.insertBlock.mock.calls[0]!;
    expect(opts).toEqual({ at: "cursor" });
    const d = document.createElement("div");
    d.innerHTML = html;
    expect(d.children).toHaveLength(1);
    const img = d.firstElementChild as HTMLImageElement;
    expect(img.tagName).toBe("IMG");
    expect(PNG_URL.test(img.getAttribute("src")!)).toBe(true);
    expect(pngInfo(img.getAttribute("src")!)).toBe("image/png|1120x680");
    expect(img.getAttribute("alt")).toBe("My bars");
    expect(h.toast).toHaveBeenCalledWith("Inserted");
  });
  it("an untitled chart's alt text names its kind; labels in a chart are text, never markup", async () => {
    await make("line", "<img src=x onerror=alert(1)>,3\nB,4");
    const svg = svgOf(tid("quick-img"));
    expect(svg).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(document.body.querySelectorAll("img")).toHaveLength(1);
    await click("quick-insert");
    await until(() => h.insertBlock.mock.calls.length === 1);
    expect(h.insertBlock.mock.calls[0]![0]).toContain(`alt="${E.stats_ch_q_line}"`);
  });
  it("says 'Could not make the picture' when the browser cannot, and inserts nothing", async () => {
    loadFails = true;
    await make("bar", "A,1");
    await click("quick-insert");
    await until(() => tid("quick-img-fail") !== null);
    expect(text("quick-img-fail")).toBe(E.vz_img_fail);
    expect(h.insertBlock).not.toHaveBeenCalled();
  });
});

describe("Quick chart: Venn diagrams", () => {
  const venn = { a: "Anxiety", aSize: "18", b: "Depression", bSize: "12", c: "", cSize: "", ab: "7", ac: "", bc: "", abc: "", title: "Overlap" };
  async function fillVenn(v: Partial<typeof venn>) {
    const m: Record<string, string> = { a: "quick-a", aSize: "quick-aSize", b: "quick-b", bSize: "quick-bSize", c: "quick-c", cSize: "quick-cSize", ab: "quick-ab", ac: "quick-ac", bc: "quick-bc", abc: "quick-abc", title: "quick-vtitle" };
    for (const [k, val] of Object.entries(v)) if (val !== "" && tid(m[k]!)) await type(m[k]!, val);
  }
  it("2 sets: only the A, B and overlap boxes are shown, and the picture is core's vennSvg", async () => {
    await mount();
    await pick("quick-type", "venn2");
    for (const id of ["quick-c", "quick-cSize", "quick-ac", "quick-bc", "quick-abc"]) expect(tid(id), id).toBeNull();
    await fillVenn(venn);
    await click("quick-make");
    expect(svgOf(tid("quick-img"))).toBe(vennSvg(venn));
    expect(svgOf(tid("quick-img"))).not.toContain("<circle cx=\"210\" cy=\"220\"");
  });
  it("3 sets: every box is shown and the picture is core's vennSvg; a blank C label is called C", async () => {
    await mount();
    await pick("quick-type", "venn3");
    const three = { ...venn, c: "Insomnia", cSize: "10", ac: "4", bc: "3", abc: "2" };
    await fillVenn(three);
    await click("quick-make");
    expect(svgOf(tid("quick-img"))).toBe(vennSvg(three));
    await type("quick-c", "");
    await click("quick-make");
    expect(svgOf(tid("quick-img"))).toBe(vennSvg({ ...three, c: "C" }));
  });
  it("a number that is not a number or is negative is 0 (v1 _vennNum); a hostile label is text", async () => {
    await mount();
    await pick("quick-type", "venn3");
    await fillVenn({ a: "<script>alert(1)</script>", aSize: "abc", b: "B", bSize: "-5", c: "C", cSize: "2.50", ab: "1e2", title: "t" });
    await click("quick-make");
    const svg = svgOf(tid("quick-img"));
    expect(svg).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(svg).not.toContain("<script");
    expect(svg).toContain(">2.5<");
    expect(svg).toContain(">100<");
    expect(document.body.querySelectorAll("script")).toHaveLength(0);
  });
  it("Insert puts the diagram in as a PNG at 2x at the cursor (not as markup), titled by the diagram's title", async () => {
    await mount();
    await pick("quick-type", "venn2");
    await fillVenn(venn);
    await click("quick-make");
    await click("quick-insert");
    await until(() => h.insertBlock.mock.calls.length === 1);
    const [html, opts] = h.insertBlock.mock.calls[0]!;
    expect(opts).toEqual({ at: "cursor" });
    expect(html).not.toContain("<svg");
    const d = document.createElement("div");
    d.innerHTML = html;
    const img = d.firstElementChild as HTMLImageElement;
    expect(pngInfo(img.getAttribute("src")!)).toBe("image/png|840x520");
    expect(img.getAttribute("alt")).toBe("Overlap");
    // the svg handed to the canvas was given a size (core's Venn svg has only a viewBox)
    expect(decodeURIComponent(stubLog.loaded[0]!.replace(/^data:image\/svg\+xml;charset=utf-8,/, ""))).toContain('width="420" height="260"');
  });
  it("quickView is the same step the buttons take (pure)", () => {
    const f = defaultQuickForm();
    expect(quickView({ ...f, type: "bar", data: "" })).toEqual({ kind: "empty" });
    const ok = quickView({ ...f, type: "venn2", venn: { ...venn, c: "Ignored" } });
    expect(ok.kind === "ok" && ok.svg).toBe(vennSvg(venn));
  });
});

describe("the words (stats_ch_*)", () => {
  const keys = Object.keys(statsEn).filter((k) => k.startsWith("stats_ch_"));
  it("every English key has a Hindi one with the same placeholders, under the file's DRAFT marker", () => {
    expect(keys.length).toBeGreaterThan(40);
    expect((statsHi as Record<string, string>).$draft).toMatch(/^DRAFT/);
    for (const k of keys) {
      const hi = (statsHi as Record<string, string>)[k];
      expect(hi, k).toBeTruthy();
      const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(ph(hi!), k).toEqual(ph((statsEn as Record<string, string>)[k]!));
    }
  });
  it("the English is plain: no emoji, no em-dash, sentence case, and the toast stays 'Inserted'", () => {
    for (const k of keys) {
      const v = (statsEn as Record<string, string>)[k]!;
      expect(v, k).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(v, k).not.toContain("—");
      expect(v, k).not.toContain("–");
    }
    expect(E.stats_res_inserted).toBe("Inserted");
  });
  it("the v1 vz_* labels the tab reuses exist in both languages and carry no emoji (the ones with an emoji are not used)", () => {
    const used = ["vz_data", "vz_type", "vz_t_box", "vz_t_bar", "vz_t_hist", "vz_t_qq", "vz_y", "vz_g", "vz_none", "vz_err", "vz_pal", "vz_pal_c", "vz_pal_g", "vz_bins", "vz_pts", "vz_n", "vz_title_in", "vz_title", "vz_xl", "vz_yl",
      "vz_ymin", "vz_ymax", "vz_fig", "vz_note", "vz_insert", "vz_nodata", "vz_img_fail"];
    for (const k of used) {
      expect((en as Record<string, string>)[k], k).toBeTruthy();
      expect((hiBase as Record<string, string>)[k], k).toBeTruthy();
      expect((en as Record<string, string>)[k], k).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
  it("the tab's own Hindi shows when the language is Hindi", async () => {
    await mount("hi");
    expect(text("chart-studio")).toContain((statsHi as Record<string, string>).stats_ch_studio);
    expect(text("quick-chart")).toContain((statsHi as Record<string, string>).stats_ch_quick);
  });
});

describe("fix round 1: what the document keeps of an inserted picture", () => {
  type Node = { type?: string; text?: string; marks?: Array<{ type: string }>; attrs?: Record<string, unknown>; content?: Node[] };
  /** The inserted markup as the document gets it: through the sanitizer insertBlock applies, then into the real editor schema. */
  const intoEditor = (html: string): { json: Node; editor: Editor } => {
    const editor = new Editor({ extensions: editorExtensions, content: sanitizeHtml(html) });
    return { json: editor.getJSON() as Node, editor };
  };
  const flat = (n: Node): Node[] => [n, ...(n.content ?? []).flatMap(flat)];
  const textOf = (n: Node) => flat(n).map((x) => x.text ?? "").join("");
  afterEach(() => { loadGate = null; });

  it("Chart Studio's figure keeps a 520 px picture (not a 100 px thumbnail), the bold 'Figure N', the italic title and the Note", async () => {
    await mount();
    await type("chart-paste", ANOVA);
    await type("chart-title", "Scores by arm");
    await type("chart-note", "Bars show means.");
    await click("chart-insert");
    await until(() => h.insertBlock.mock.calls.length === 1);
    const { json, editor } = intoEditor(h.insertBlock.mock.calls[0]![0]);
    const nodes = flat(json);
    const img = nodes.find((n) => n.type === "image")!;
    expect(img).toBeTruthy();
    expect(img.attrs!.width).toBe(520);
    expect(PNG_URL.test(img.attrs!.src as string)).toBe(true);
    expect(img.attrs!.alt).toBe("Scores by arm");
    const fig = nodes.find((n) => n.text === "Figure 1")!;
    expect(fig.marks!.map((m) => m.type)).toContain("bold");
    const title = nodes.find((n) => n.text === "Scores by arm")!;
    expect(title.marks!.map((m) => m.type)).toContain("italic");
    const note = nodes.find((n) => n.text === "Note.")!;
    expect(note.marks!.map((m) => m.type)).toContain("italic");
    expect(textOf(json)).toContain("Bars show means.");
    // saved again as html the width is a pixel width
    expect(editor.getHTML()).toMatch(/<img[^>]*style="width: 520px;?"/);
    editor.destroy();
  });
  it("the quick chart goes in 520 px wide and the Venn diagram 420 px wide (v1's widths)", async () => {
    await mount();
    await pick("quick-type", "bar");
    await type("quick-data", "A,1\nB,2");
    await click("quick-make");
    await click("quick-insert");
    await until(() => h.insertBlock.mock.calls.length === 1);
    let r = intoEditor(h.insertBlock.mock.calls[0]![0]);
    expect(flat(r.json).find((n) => n.type === "image")!.attrs!.width).toBe(520);
    r.editor.destroy();
    await pick("quick-type", "venn2");
    await click("quick-make");
    await click("quick-insert");
    await until(() => h.insertBlock.mock.calls.length === 2);
    r = intoEditor(h.insertBlock.mock.calls[1]![0]);
    expect(flat(r.json).find((n) => n.type === "image")!.attrs!.width).toBe(420);
    r.editor.destroy();
  });
  it("the figure carries no data-cap attributes (the editor drops them)", async () => {
    await mount();
    await type("chart-paste", ANOVA);
    await click("chart-insert");
    await until(() => h.insertBlock.mock.calls.length === 1);
    expect(h.insertBlock.mock.calls[0]![0]).not.toContain("data-cap");
  });
  it("text typed while the PNG is being made is not lost when the figure goes in", async () => {
    let open!: () => void;
    loadGate = new Promise<void>((r) => { open = r; });
    await mount();
    await type("chart-paste", ANOVA);
    await click("chart-insert");
    await type("chart-title", "Typed while waiting");
    await type("chart-xl", "My x label");
    open();
    await until(() => h.insertBlock.mock.calls.length === 1);
    await until(() => (tid("chart-fig") as HTMLInputElement).value === "2");
    expect((tid("chart-title") as HTMLInputElement).value).toBe("Typed while waiting");
    expect((tid("chart-xl") as HTMLInputElement).value).toBe("My x label");
    expect((tid("chart-paste") as HTMLTextAreaElement).value).toBe(ANOVA);
  });
});

describe("fix round 1: a character cut by a slice cannot crash the page", () => {
  const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
  it("svgDataUrl repairs a lone surrogate instead of throwing", () => {
    const bad = '<svg viewBox="0 0 1 1"><text>' + "a".repeat(3) + "\uD83D" + "</text></svg>";
    expect(() => encodeURIComponent(bad)).toThrow();
    const url = svgDataUrl(bad);
    expect(decodeURIComponent(url.replace(/^data:image\/svg\+xml;charset=utf-8,/, ""))).toContain("aaa\uFFFD</text>");
    // a pair is left whole
    expect(decodeURIComponent(svgDataUrl("<svg>😀</svg>").replace(/^data:image\/svg\+xml;charset=utf-8,/, ""))).toBe("<svg>😀</svg>");
  });
  it("Chart Studio: a group name of 21 letters and an emoji (core cuts it at 22 code units) still draws, and the picture is a well formed data URL", async () => {
    await mount();
    await type("chart-paste", "group,score\n" + ("a".repeat(21) + "😀 tail") + ",3\n" + ("a".repeat(21) + "😀 tail") + ",5\nB,4\nB,7");
    expect(tid("chart-img")).not.toBeNull();
    expect(tid("chart-failed")).toBeNull();
    expect(LONE.test(svgOf(tid("chart-img")))).toBe(false);
    // the table still names the whole group
    expect(tid("chart-table")!.textContent).toContain("a".repeat(21) + "😀 tail");
    // and the PNG step can load it
    await click("chart-insert");
    await until(() => h.insertBlock.mock.calls.length === 1);
  });
  it("Quick chart: a label and a long label with an emoji at the cut draw, show an ellipsis, and insert", async () => {
    await mount();
    await pick("quick-type", "bar");
    await type("quick-data", "a".repeat(21) + "😀tail,3\n" + "b".repeat(39) + "😀tail,4");
    await click("quick-make");
    expect(tid("quick-img")).not.toBeNull();
    const svg = svgOf(tid("quick-img"));
    expect(LONE.test(svg)).toBe(false);
    expect(svg).toContain("a".repeat(21) + "😀…");
    expect(svg).toContain("b".repeat(39) + "😀…: 4");
    await click("quick-insert");
    await until(() => h.insertBlock.mock.calls.length === 1);
  });
  it("any failure in making the picture's data URL is a message, not a crash", async () => {
    // a group the chart draws with a name that makes encodeURIComponent throw cannot happen once repaired; the guard is for anything else: force it
    const mod = await import("../lib/tools/stats/png");
    const spy = vi.spyOn(mod, "svgDataUrl").mockImplementation(() => { throw new URIError("boom"); });
    try {
      const { studioView, defaultStudioForm } = await import("../lib/tools/stats/chartStudio");
      const d = statsParseText(ANOVA)!;
      expect(studioView({ ...defaultStudioForm(), text: ANOVA }, d, vzTrFor("en"), "1")).toEqual({ kind: "failed" });
    } finally { spy.mockRestore(); }
  });
});

describe("fix round 1: the browser's image loader gives up", () => {
  it("svgToPng rejects when the image neither loads nor fails (the buttons are not left disabled)", async () => {
    setPngEnv(null);
    vi.useFakeTimers();
    try {
      const p = svgToPng(quickChartSvg([{ label: "a", val: 1 }], "bar", ""), 2);
      const seen = p.then(() => "resolved", (e: Error) => e.message);
      await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS + 1000);
      expect(await seen).toMatch(/time/i);
    } finally { vi.useRealTimers(); }
  });
});
