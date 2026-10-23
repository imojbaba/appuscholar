// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SCALES, SL_PENDING, slCodebookCsv, slGuessColumns, slText, slVarNames, statsParseText } from "@appuscholar/core";
import en from "../messages/en.json";
import statsEn from "../messages/tools/stats.en.json";
import statsHi from "../messages/tools/stats.hi.json";

/*
 * Task B7: the Scales tab (v1 scale library 11390-11455, scoring 11456-11512, dialogs 1255-1271). The expected values are core's golden fixture for the scales
 * (packages/core/test/golden/scales/cases.json: v1's own functions and dialogs driven in jsdom: 24 scoring matrices, 18 dialog runs), read here, not retyped, and
 * every case is fed through the tab as a student would: the table in the lab, the scale picked, the columns chosen, the button pressed.
 */

type Mat = Array<Array<number | null | { $n: string }>>;
type ScoreCase = { id: string; scale: string; coding: number; mat: Mat; out: { totals: Array<number | null>; bad: number; miss: number } };
type RunCase = { id: string; scale: string; csv: string; guess: number[]; idx: number[]; coding: number; html: string; text: string; paste: string };
const FX = JSON.parse(readFileSync(join(__dirname, "../../../packages/core/test/golden/scales/cases.json"), "utf8")) as { score: ScoreCase[]; runs: RunCase[] };

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  download: vi.fn(),
  ai: vi.fn(async () => ""),
  store: {} as Record<string, unknown>,
  writes: [] as Array<{ kind: string; json: string }>,
  openDocument: vi.fn()
}));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/export/download", () => ({ downloadBlob: h.download, safeFileName: (s: string) => s }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ projectId: "p1", docOpen: false, openDocument: h.openDocument }) }));
vi.mock("@/lib/editor/docAccess", () => ({ useDocAccess: () => ({ insertBlock: async () => true }) }));
vi.mock("@/lib/ai/useCallAI", () => ({ useCallAI: () => h.ai }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1" }, settings: { field: "psychology" } }) }));
vi.mock("@/lib/blobs/useProjectBlob", async () => {
  const { useReducer } = await import("react");
  return {
    useProjectBlob: (kind: string) => {
      const [, force] = useReducer((n: number) => n + 1, 0);
      return {
        value: h.store[kind] ?? null, loading: false, locked: false, broken: false, readOnly: false,
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

import { Panel } from "../components/tools/stats/Panel";
import { getData, getLab, patchLab, resetLabs, setText, parse } from "../lib/tools/stats/lab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = { ...(en as Record<string, string>), ...(statsEn as Record<string, string>) };
const hi = statsHi as Record<string, string>;
const roots: Root[] = [];
const tid = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const all = (id: string) => [...document.body.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
const text = (id: string) => tid(id)?.textContent ?? "";
const fill = (s: string, vars: Record<string, string | number> = {}) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

async function mount(tab = "scales"): Promise<Root> {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(<Panel tab={tab} projectId="p1" />); });
  return root;
}
async function unmount(root: Root) { await act(async () => { root.unmount(); }); roots.splice(roots.indexOf(root), 1); }
async function click(testId: string) { await act(async () => { tid(testId)!.click(); }); }
async function choose(testId: string, value: string) {
  const el = tid(testId) as HTMLSelectElement;
  await act(async () => { el.value = value; el.dispatchEvent(new Event("change", { bubbles: true })); });
}
async function until(cond: () => boolean, ms = 5000) {
  const t0 = Date.now();
  while (!cond() && Date.now() - t0 < ms) await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  expect(cond(), "condition not met in time").toBe(true);
}
/** The student parsed a table on the Data tab: the lab holds it. */
async function giveData(csv: string) {
  setText("p1", csv);
  await parse("p1");
  expect(getData("p1"), "the fixture table must parse").not.toBeNull();
}
/** Opens the scoring area of a scale. */
async function openScoring(id: string) {
  await click("scale-pick-" + id);
  await click("scale-score-open");
}
const sel = (i: number) => tid("scale-map-" + i) as HTMLSelectElement;
const cell = (v: number | null | { $n: string }): string => (v === null ? "" : typeof v === "object" ? v.$n : String(v));
const scale = (id: string) => SCALES.find((x) => x.id === id)!;

beforeEach(() => {
  resetLabs();
  h.store = {}; h.writes = [];
  h.toast.mockClear(); h.download.mockClear(); h.ai.mockClear();
});
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; vi.restoreAllMocks(); });

describe("the library (v1 slOpen 11421, slPick 11433)", () => {
  it("lists the scales core has and the pending paragraph, and shows no scale until one is picked", async () => {
    await mount();
    expect(SCALES.map((x) => x.id)).toEqual(["RSES", "SWLS"]);
    for (const x of SCALES) expect(text("scale-pick-" + x.id)).toBe(`${x.short} · ${x.construct}`);
    expect(text("scale-pending")).toBe(fill(E.stats_sc_pending!, { list: SL_PENDING }));
    expect(tid("scale-view")).toBeNull();
    expect(text("scales-tab")).toContain(E.stats_sc_intro!);
  });

  for (const x of SCALES) {
    it(`${x.id}: the view shows the stem, options, every item byte for byte, the reverse marks, the scoring note and the licence record`, async () => {
      await mount();
      await click("scale-pick-" + x.id);
      expect(text("scale-name")).toBe(`${x.name} (${x.short})`);
      expect(text("scale-stem")).toBe(x.stem);
      expect(text("scale-options")).toBe(fill(E.stats_sc_options!, { list: x.labels.join(" | ") }));
      const items = all("scale-item");
      expect(items).toHaveLength(x.items.length);
      items.forEach((el, i) => expect(el.textContent, `item ${i + 1}`).toBe(x.items[i]));
      const marked = items.map((_, i) => !!tid("scale-reverse-" + i));
      expect(marked).toEqual(x.items.map((_, i) => (x.reverse as readonly number[]).includes(i + 1)));
      if (x.reverse.length) expect(text("scale-reverse-" + (x.reverse[0]! - 1))).toBe(E.stats_sc_reverse);
      expect(text("scale-scoring")).toBe(`${E.stats_sc_scoring_lead} ${x.scoring}`);
      const lic = text("scale-licence");
      expect(lic).toContain(x.licence.status);
      expect(lic).toContain(fill(E.stats_sc_lic_line!, { status: x.licence.status, use: x.licence.commercial ? E.stats_sc_use_yes! : E.stats_sc_use_no!, date: x.licence.checked }));
      expect(lic).toContain(x.licence.note);
      expect(lic).toContain(fill(E.stats_sc_credit!, { credit: x.licence.attribution }));
      expect(lic).toContain(x.licence.verified);
      const link = tid("scale-source") as HTMLAnchorElement;
      expect(link.getAttribute("href")).toBe(x.licence.source);
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
    });
  }

  it("switching scale replaces the view", async () => {
    await mount();
    await click("scale-pick-RSES");
    expect(all("scale-item")).toHaveLength(10);
    await click("scale-pick-SWLS");
    expect(all("scale-item")).toHaveLength(5);
    expect(text("scale-name")).toContain("Satisfaction With Life Scale");
  });
});

describe("Copy the questionnaire text and Download the item list (v1 slCopy 11446, slCodebook 11450)", () => {
  for (const x of SCALES) {
    it(`${x.id}: copies core's text with its credit line and says so in a quiet line, not a toast`, async () => {
      const write = vi.fn(async () => undefined);
      Object.defineProperty(navigator, "clipboard", { value: { writeText: write }, configurable: true });
      await mount();
      await click("scale-pick-" + x.id);
      await click("scale-copy");
      await until(() => !!tid("scale-copy-status"));
      expect(write).toHaveBeenCalledTimes(1);
      expect(write).toHaveBeenCalledWith(slText(x, true));
      expect(text("scale-copy-status")).toBe(E.stats_sc_copied);
      expect(h.toast).not.toHaveBeenCalled();
    });

    it(`${x.id}: downloads ${x.id}_items.csv with core's codebook, as UTF-8 with a byte-order mark`, async () => {
      await mount();
      await click("scale-pick-" + x.id);
      await click("scale-csv");
      expect(h.download).toHaveBeenCalledTimes(1);
      const [name, blob] = h.download.mock.calls[0] as unknown as [string, Blob];
      const want = slCodebookCsv(x);
      expect(name).toBe(x.id + "_items.csv");
      expect(name).toBe(want.name);
      const bytes = new Uint8Array(await new Promise<ArrayBuffer>((res) => { const r = new FileReader(); r.onload = () => res(r.result as ArrayBuffer); r.readAsArrayBuffer(blob); }));
      expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
      expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes)).toBe("\uFEFF" + want.csv);
      expect(blob.type).toContain("text/csv");
      // the codebook names the columns the scorer looks for
      expect(want.csv.split("\n")[1]!.startsWith(slVarNames(x)[0]!)).toBe(true);
    });
  }

  it("a refused copy says to select the text by hand, in the same quiet line", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn(async () => { throw new Error("no"); }) }, configurable: true });
    await mount();
    await click("scale-pick-RSES");
    await click("scale-copy");
    await until(() => !!tid("scale-copy-status"));
    expect(text("scale-copy-status")).toBe(E.stats_res_copy_failed);
  });
});

describe("Rule 10: the wording is fixed and no AI path touches it", () => {
  const files = () => {
    const root = join(__dirname, "..");
    const comps = readdirSync(join(root, "components/tools/stats")).filter((f) => /^Scale.*\.tsx$/.test(f)).map((f) => join(root, "components/tools/stats", f));
    const libs = readdirSync(join(root, "lib/tools/stats")).filter((f) => /^scale.*\.ts$/.test(f)).map((f) => join(root, "lib/tools/stats", f));
    return [...comps, ...libs];
  };
  it("no scales file imports or mentions the AI, a blob, or storage (read from the sources)", () => {
    const fs = files();
    expect(fs.length).toBeGreaterThanOrEqual(3);
    for (const f of fs) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/useCallAI|lib\/ai|from\s+["'][^"']*\/ai\b|callAI|\bfetch\(|localStorage|sessionStorage|useProjectBlob|useStatsSets|StatsSets/);
    }
  });
  it("a whole visit (pick, copy, download, score) sends nothing to the AI and writes no blob", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => undefined }, configurable: true });
    await giveData(["RSES_01,RSES_02,RSES_03,RSES_04,RSES_05,RSES_06,RSES_07,RSES_08,RSES_09,RSES_10", "0,1,2,3,0,1,2,3,0,1", "2,2,2,2,2,2,2,2,2,2", "1,1,1,1,1,1,1,1,1,1"].join("\n"));
    await mount();
    await openScoring("RSES");
    await click("scale-copy");
    await click("scale-csv");
    await click("scale-run");
    await until(() => !!tid("scale-out"));
    expect(h.ai).not.toHaveBeenCalled();
    // The Scales tab writes nothing itself; the table given and the scored table are recorded in stats_sets by the stats Panel (StatsSetsHost, as v1 registered every parse), and nothing else is written.
    expect(h.writes.length).toBeGreaterThan(0);
    expect(h.writes.every((x) => x.kind === "stats_sets")).toBe(true);
    // each record is a fingerprint, a time and a row count (never a row), and each distinct table is recorded once
    const lists = h.writes.map((x) => JSON.parse(x.json) as Record<string, Record<string, unknown>>);
    for (const l of lists) for (const v of Object.values(l)) expect(Object.keys(v).sort()).toEqual(["hash", "n", "ts"]);
    const seen = lists.map((l) => Object.values(l).map((v) => String(v.hash)).sort().join("|"));
    expect(new Set(seen).size).toBe(h.writes.length);
  });
});

describe("Score this scale in my data (v1 slScoreOpen 11470, slScoreRun 11487)", () => {
  it("with no parsed table it says to parse data on the Data tab first and links there; nothing is scored", async () => {
    await mount();
    await click("scale-pick-RSES");
    await click("scale-score-open");
    expect(text("scale-nodata")).toContain(E.stats_sc_nodata!);
    expect(tid("scale-run")).toBeNull();
    const link = tid("scale-to-data") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/p/p1/collect/data");
    expect(link.textContent).toBe(E.stats_sc_to_data);
    expect(getData("p1")).toBeNull();
  });

  it("once the Data tab has parsed a table, the same tab shows the mapping without being reopened", async () => {
    await mount();
    await openScoring("SWLS");
    expect(tid("scale-nodata")).not.toBeNull();
    await giveData("SWLS_01,SWLS_02,SWLS_03,SWLS_04,SWLS_05\n1,2,3,4,5\n4,4,4,4,4\n7,7,7,7,7");
    await until(() => !!tid("scale-map-0"));
    expect(tid("scale-nodata")).toBeNull();
  });

  it("offers every item with its own column list starting with 'Choose a column', the item's wording unchanged, reverse items marked, and every coding", async () => {
    await giveData("a,RSES_01,RSES_02\n1,2,3\n1,2,3\n1,2,3");
    await mount();
    await openScoring("RSES");
    const x = scale("RSES");
    const data = getData("p1")!;
    x.items.forEach((item, i) => {
      expect(text("scale-map-item-" + i), `item ${i + 1}`).toBe(item);
      expect(!!tid("scale-map-reverse-" + i)).toBe((x.reverse as readonly number[]).includes(i + 1));
      const opts = [...sel(i).options].map((o) => o.textContent);
      expect(opts).toEqual([E.stats_sc_choose, ...data.headers]);
    });
    expect([...(tid("scale-coding") as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(x.codings.map((c) => c.label));
    expect(text("scale-score")).toContain(E.stats_sc_score_intro!);
  });

  it("guesses the columns with core's slGuessColumns (RSES_01 and a prefix-and-number name), and the student can change them", async () => {
    const headers = ["id2", "rses 1", "RSES_02", "RSES-3", "x", "x2", "x3", "x4", "x5", "x6", "x7"];
    await giveData(headers.join(",") + "\n" + headers.map(() => "1").join(","));
    await mount();
    await openScoring("RSES");
    const want = slGuessColumns(scale("RSES"), getData("p1")!.headers);
    expect(want.slice(0, 3)).toEqual([1, 2, 3]);
    want.forEach((g, i) => expect(sel(i).value).toBe(String(g)));
    await choose("scale-map-0", "4");
    expect(sel(0).value).toBe("4");
    await click("scale-pick-SWLS");
    await click("scale-score-open");
    expect(sel(0).value).toBe(String(slGuessColumns(scale("SWLS"), getData("p1")!.headers)[0]));
  });

  it("shows a column name that looks like markup as text", async () => {
    const hostile = "<img src=x onerror=alert(1)>";
    await giveData(`"${hostile}",RSES_01\n1,2\n2,3\n3,1`);
    await mount();
    await openScoring("RSES");
    expect(document.body.querySelector("img")).toBeNull();
    expect([...sel(0).options].map((o) => o.textContent)).toContain(hostile);
  });

  it("names a blank header Col<n> in the column lists, as v1 does", async () => {
    await giveData("RSES_01,,RSES_03\n1,2,3\n2,3,1\n3,1,2");
    await mount();
    await openScoring("RSES");
    expect([...sel(0).options].map((o) => o.textContent)).toEqual([E.stats_sc_choose, "RSES_01", "Col2", "RSES_03"]);
  });

  it("refuses an item with no column, and one column used twice, with core's sentences and changes nothing", async () => {
    await giveData("SWLS_01,SWLS_02,SWLS_03,SWLS_04,SWLS_05\n1,2,3,4,5\n4,4,4,4,4\n7,7,7,7,7");
    await mount();
    await openScoring("SWLS");
    const text0 = getLab("p1").text, data0 = getData("p1");
    await choose("scale-map-4", "-1");
    await click("scale-run");
    expect(text("scale-out")).toBe("Choose a column for every item.");
    await choose("scale-map-4", "0");
    await click("scale-run");
    expect(text("scale-out")).toBe("Each item needs its own column.");
    expect(getLab("p1").text).toBe(text0);
    expect(getData("p1")).toBe(data0);
  });

  it("gives RSES_total on a second scoring a free name (RSES_total_2) as v1's nameFree does, and the scan runs both times", async () => {
    await giveData(["RSES_01,RSES_02,RSES_03,RSES_04,RSES_05,RSES_06,RSES_07,RSES_08,RSES_09,RSES_10", "0,1,2,3,0,1,2,3,0,1", "2,2,2,2,2,2,2,2,2,2", "1,1,1,1,1,1,1,1,1,1"].join("\n"));
    await mount();
    await openScoring("RSES");
    await click("scale-run");
    await until(() => getData("p1")!.headers.includes("RSES_total"));
    const scan1 = getLab("p1").scan;
    await click("scale-run");
    await until(() => getData("p1")!.headers.includes("RSES_total_2"));
    expect(getLab("p1").scan).not.toBe(scan1);
    expect(text("scale-out")).toContain("RSES_total_2");
  });

  it("keeps the student's own column choices after scoring (the new columns are added at the end)", async () => {
    await giveData("q1,q2,q3,q4,q5\n1,2,3,4,5\n4,4,4,4,4\n7,7,7,7,7\n3,3,3,3,3");
    await mount();
    await openScoring("SWLS");
    for (let i = 0; i < 5; i++) await choose("scale-map-" + i, String(i));
    await click("scale-run");
    await until(() => getData("p1")!.headers.includes("SWLS_total"));
    await until(() => !!tid("scale-out"));
    for (let i = 0; i < 5; i++) expect(sel(i).value).toBe(String(i));
    expect(getData("p1")!.headers).toEqual(["q1", "q2", "q3", "q4", "q5", "SWLS_total", "SWLS_band"]);
  });

  it("re-runs the personal-data scan on the new table and points to the Data tab when it flags a column; it never says the data is safe", async () => {
    const rows = ["Asha Rao,9876543210,3,3,3,3,3", "Ravi Kumar,9876543211,4,4,4,4,4", "Meena Iyer,9876543212,5,5,5,5,5", "John Paul,9876543213,2,2,2,2,2", "Sita Devi,9876543214,6,6,6,6,6", "Omar Khan,9876543215,1,1,1,1,1"];
    await giveData(["name,phone,SWLS_01,SWLS_02,SWLS_03,SWLS_04,SWLS_05", ...rows].join("\n"));
    const scan0 = getLab("p1").scan;
    expect(scan0!.found.length).toBeGreaterThan(0);
    await mount();
    await openScoring("SWLS");
    await click("scale-run");
    await until(() => getData("p1")!.headers.includes("SWLS_total"));
    await until(() => !!tid("scale-pd-note"));
    const scan1 = getLab("p1").scan;
    expect(scan1).not.toBe(scan0);
    expect(scan1!.found.map((f) => f.name).sort()).toEqual(scan0!.found.map((f) => f.name).sort());
    expect(text("scale-pd-note")).toBe(E.stats_sc_pd_again + " " + E.stats_sc_pd_link);
    expect((tid("scale-pd-link") as HTMLAnchorElement).getAttribute("href")).toBe("/p/p1/collect/data");
    expect(text("scales-tab")).not.toMatch(/\bsafe\b/i);
  });

  it("says nothing about personal details when the scan flags nothing (no 'safe' either)", async () => {
    await giveData("SWLS_01,SWLS_02,SWLS_03,SWLS_04,SWLS_05\n1,2,3,4,5\n4,4,4,4,4\n7,7,7,7,7");
    await mount();
    await openScoring("SWLS");
    await click("scale-run");
    await until(() => !!tid("scale-out") && getData("p1")!.headers.includes("SWLS_total"));
    expect(tid("scale-pd-note")).toBeNull();
    expect(text("scales-tab")).not.toMatch(/\bsafe\b/i);
  });

  it("the button waits while a big table is still being read", async () => {
    await giveData("SWLS_01,SWLS_02,SWLS_03,SWLS_04,SWLS_05\n1,2,3,4,5\n4,4,4,4,4\n7,7,7,7,7");
    await mount();
    await openScoring("SWLS");
    expect((tid("scale-run") as HTMLButtonElement).disabled).toBe(false);
    await act(async () => { patchLab("p1", { busy: true }); });
    expect((tid("scale-run") as HTMLButtonElement).disabled).toBe(true);
  });

  it("the lab is in memory: leaving the tab and coming back keeps the table and the scores added", async () => {
    await giveData("SWLS_01,SWLS_02,SWLS_03,SWLS_04,SWLS_05\n1,2,3,4,5\n4,4,4,4,4\n7,7,7,7,7");
    const r1 = await mount();
    await openScoring("SWLS");
    await click("scale-run");
    await until(() => getData("p1")!.headers.includes("SWLS_total"));
    await unmount(r1);
    await mount("data");
    expect((tid("stats-paste") as HTMLTextAreaElement).value).toContain("SWLS_total");
  });
});

describe("24 scoring cases match v1 (golden scales/cases.json, 'score')", () => {
  it("covers 24 matrices", () => { expect(FX.score).toHaveLength(24); });
  for (const c of FX.score) {
    it(c.id, async () => {
      const x = scale(c.scale);
      const names = slVarNames(x);
      const csv = [names.join(","), ...c.mat.map((r) => r.map(cell).join(","))].join("\n");
      setText("p1", csv);
      await parse("p1");
      const data = getData("p1");
      await mount();
      await openScoring(c.scale);
      expect(data, "a header-only paste still gives a table with no rows").not.toBeNull();
      await choose("scale-coding", String(c.coding));
      await click("scale-run");
      await until(() => !!tid("scale-out"));
      const anyScored = c.out.totals.some((v) => v !== null);
      if (!anyScored) {
        const coding = x.codings[c.coding]!;
        expect(text("scale-out")).toBe(
          "No row could be scored. " + (c.out.bad ? `${c.out.bad} answers fall outside ${coding.min} to ${coding.max}. Check the coding choice above. ` : "") + (c.out.miss ? `${c.out.miss} answers are missing.` : "")
        );
        expect(getLab("p1").text).toBe(csv);
        expect(getData("p1")!.headers).not.toContain(x.id + "_total");
        return;
      }
      await until(() => getData("p1")!.headers.includes(x.id + "_total"));
      const now = getData("p1")!;
      const col = now.headers.indexOf(x.id + "_total");
      expect(now.rows.map((r) => r[col])).toEqual(c.out.totals.map((v) => (v === null ? "" : String(v))));
      expect(getLab("p1").text.split("\n")[0]).toContain(x.id + "_total");
      if (x.bands) expect(now.headers).toContain(x.id + "_band");
      const valid = c.out.totals.filter((v) => v !== null).length;
      expect(text("scale-out")).toContain(`Scored ${valid} of ${c.mat.length} rows`);
    });
  }
});

describe("18 dialog runs match v1 (golden scales/cases.json, 'runs')", () => {
  it("covers 18 runs", () => { expect(FX.runs).toHaveLength(18); });
  for (const c of FX.runs) {
    it(c.id, async () => {
      const x = scale(c.scale);
      setText("p1", c.csv);
      await parse("p1");
      const before = getLab("p1");
      expect(before.data!.headers).toEqual(statsParseText(c.csv)!.headers);
      await mount();
      await openScoring(c.scale);
      // v1's pre-selected columns
      expect(x.items.map((_, i) => Number(sel(i).value))).toEqual(c.guess);
      for (let i = 0; i < x.items.length; i++) if (String(c.idx[i]) !== sel(i).value) await choose("scale-map-" + i, String(c.idx[i]));
      await choose("scale-coding", String(c.coding));
      await click("scale-run");
      await until(() => !!tid("scale-out") && text("scale-out") !== "");
      const refused = c.paste === c.csv;
      if (refused) {
        expect(text("scale-out")).toBe(c.text);
        expect(getLab("p1").text).toBe(c.csv);
        expect(getLab("p1").data).toBe(before.data);
        expect(getLab("p1").scan).toBe(before.scan);
        return;
      }
      await until(() => getLab("p1").text === c.paste);
      expect(text("scale-out")).toBe(c.text);
      await until(() => getLab("p1").data !== before.data && getLab("p1").scan !== before.scan);
      expect(getData("p1")!.headers).toEqual(statsParseText(c.paste)!.headers);
      expect(getData("p1")!.rows).toEqual(statsParseText(c.paste)!.rows);
    });
  }

  it("the result sentence passes through the sanitizer: its bold column name is a real <b>, nothing else is markup", async () => {
    const c = FX.runs.find((r) => r.id === "rses-by-name-clean")!;
    setText("p1", c.csv);
    await parse("p1");
    await mount();
    await openScoring("RSES");
    await click("scale-run");
    await until(() => text("scale-out") === c.text);
    expect(tid("scale-out")!.innerHTML).toBe(c.html);
  });
});

describe("the words (stats_sc_*)", () => {
  const keys = Object.keys(statsEn).filter((k) => k.startsWith("stats_sc_"));
  const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  it("has the keys the tab uses, each in Hindi with the same placeholders", () => {
    expect(keys.length).toBeGreaterThanOrEqual(25);
    for (const k of keys) {
      expect(hi[k], k).toBeTruthy();
      expect(vars(hi[k]!), k).toEqual(vars((statsEn as Record<string, string>)[k]!));
    }
  });
  it("the English has no emoji and no dash used as punctuation", () => {
    for (const k of keys) {
      const s = (statsEn as Record<string, string>)[k]!;
      expect(s, k).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(s, k).not.toMatch(/[–—]/);
    }
  });
  it("draws in Hindi when the Hindi file is merged over the English (tab text is read from the keys)", () => {
    expect(hi.stats_sc_title).not.toBe(E.stats_sc_title);
  });
});
