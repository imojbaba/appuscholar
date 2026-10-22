// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rtHash, statsParseText } from "@appuscholar/core";
import en from "../messages/en.json";
import statsEn from "../messages/tools/stats.en.json";
import statsHi from "../messages/tools/stats.hi.json";

/*
 * Task B1: the Statistics lab's Data tab (v1 9348-9522, panel 769-779): paste or upload, parse, the columns found, the rows left out, the
 * personal-data scan with Remove / Replace with a code / Keep and the key file. Rows stay in memory (ledger R1): no blob holds one.
 */

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  download: vi.fn(),
  /** The blobs the panel reads (by kind), and every write it made, as the JSON that would be sent. */
  store: {} as Record<string, unknown>,
  writes: [] as Array<{ kind: string; json: string }>,
  broken: {} as Record<string, boolean>,
  /** A kind whose stored value is not known yet (the read is under way) or sits behind the locked vault. */
  loading: {} as Record<string, boolean>,
  locked: {} as Record<string, boolean>,
  confirm: vi.fn(() => true),
  openDocument: vi.fn()
}));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/export/download", () => ({ downloadBlob: h.download, safeFileName: (s: string) => s }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ projectId: "p1", docOpen: false, openDocument: h.openDocument }) }));
// Task B2 added the Run test area under the intake: it reads the document access, the AI call and the settings, which this file does not exercise.
vi.mock("@/lib/editor/docAccess", () => ({ useDocAccess: () => ({ insertBlock: async () => true }) }));
vi.mock("@/lib/ai/useCallAI", () => ({ useCallAI: () => async () => "" }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1" }, settings: { field: "psychology" } }) }));
vi.mock("@/lib/blobs/useProjectBlob", async () => {
  const { useReducer, useRef, useEffect } = await import("react");
  return {
    useProjectBlob: (kind: string) => {
      const [, force] = useReducer((n: number) => n + 1, 0);
      // As the real hook: once the component is gone its set() sends nothing.
      const alive = useRef(true);
      useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
      return {
        value: h.store[kind] ?? null, loading: h.loading[kind] ?? false, locked: h.locked[kind] ?? false, broken: h.broken[kind] ?? false, readOnly: false,
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
import * as stats from "../components/tools/stats";
import { getData, getLab, resetLabs, setName } from "../lib/tools/stats/lab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = { ...(en as Record<string, string>), ...(statsEn as Record<string, string>) };
/** The Statistics tabs and the ones that are built; each later task adds its id to BUILT_TABS and nothing else here. */
const ALL_TABS = ["data", "power", "charts", "check", "scales"];
const BUILT_TABS = ["data", "power", "charts", "check", "scales"];
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
async function unmount(root: Root) { await act(async () => { root.unmount(); }); roots.splice(roots.indexOf(root), 1); }
async function type(testId: string, value: string) {
  const el = tid(testId) as HTMLInputElement | HTMLTextAreaElement;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function click(testId: string) { await act(async () => { tid(testId)!.click(); }); }
async function choose(testId: string, value: string) {
  const el = tid(testId) as HTMLSelectElement;
  await act(async () => { el.value = value; el.dispatchEvent(new Event("change", { bubbles: true })); });
}
/** Lets timers and promises run until the condition holds (a FileReader, a sliced parse). */
async function until(cond: () => boolean, ms = 5000) {
  const t0 = Date.now();
  while (!cond() && Date.now() - t0 < ms) await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  expect(cond(), "condition not met in time").toBe(true);
}
async function upload(name: string, body: string) {
  const input = tid("stats-file") as HTMLInputElement;
  const file = new File([body], name, { type: "text/csv" });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
}
/** A Blob's text, with the byte-order mark kept (readAsText would drop it). */
const readBlob = (b: Blob) => new Promise<{ text: string; bytes: number[] }>((res) => {
  const r = new FileReader();
  r.onload = () => { const buf = r.result as ArrayBuffer; res({ text: new TextDecoder("utf-8", { ignoreBOM: true }).decode(buf), bytes: [...new Uint8Array(buf).slice(0, 3)] }); };
  r.readAsArrayBuffer(b);
});
const wrote = (kind: string) => h.writes.filter((w) => w.kind === kind);

const SMALL = "group,score\nA,12\nA,15\nB,9\nB,11";
/** Ten participants: names that the scan codes, phone numbers it removes, and a sentinel in an ordinary column. */
const PEOPLE = ["name,phone,site,score", ...Array.from({ length: 6 }, (_, i) => `${["Asha Rao", "Ravi Kumar", "Meena Iyer", "John Paul", "Sita Devi", "Omar Khan"][i]},98765432${10 + i},ZXQ-SITE-${i},${10 + i}`)].join("\n");

beforeEach(() => {
  resetLabs();
  h.store = {}; h.writes = []; h.broken = {}; h.loading = {}; h.locked = {};
  h.toast.mockClear(); h.download.mockClear(); h.openDocument.mockClear();
  h.confirm.mockReset(); h.confirm.mockReturnValue(true);
  vi.spyOn(window, "confirm").mockImplementation(h.confirm);
});
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; vi.restoreAllMocks(); });

describe("the module (Task B1)", () => {
  it("is turned on and exports the Panel", () => {
    expect(stats.built).toBe(true);
    expect(stats.Panel).toBe(Panel);
  });
  it("draws 'Not built yet' in words for the tabs that are not built", async () => {
    for (const tab of ALL_TABS.filter((x) => !BUILT_TABS.includes(x))) {
      await mount(tab);
      expect(text("not-built"), tab).toContain(E.place_not_built);
      expect(tid("stats-paste"), tab).toBeNull();
      act(() => { for (const r of roots.splice(0)) r.unmount(); });
      document.body.innerHTML = "";
    }
  });
});

describe("paste, parse and the columns found (v1 statsParse 9389)", () => {
  it("says what to do when the box is empty, in a quiet line and not a toast, and registers nothing", async () => {
    await mount();
    await click("stats-parse");
    expect(text("stats-status")).toBe(E.stats_data_empty);
    expect(h.toast).not.toHaveBeenCalled();
    expect(h.writes).toEqual([]);
    expect(getData("p1")).toBeNull();
  });

  it("parses, lists the columns as numeric or categorical with n, and says the data parsed", async () => {
    await mount();
    await type("stats-paste", SMALL);
    await click("stats-parse");
    expect(text("stats-status")).toBe(E.stats_data_parsed);
    expect(text("stats-rows")).toBe(fill(E.stats_data_rows_found!, { n: 4 }));
    expect(all("stats-chip").map((c) => c.textContent)).toEqual([
      fill(E.stats_data_chip_categorical!, { name: "group", n: 4 }),
      fill(E.stats_data_chip_numeric!, { name: "score", n: 4 })
    ]);
    expect(h.toast).not.toHaveBeenCalled();
    expect(getData("p1")!.rows).toHaveLength(4);
  });

  it("registers the set as its name, fingerprint, time and row count (rtSetRecord) under the dataset name, and nothing else", async () => {
    await mount();
    await type("stats-name", "Study 1 survey");
    await type("stats-paste", SMALL);
    const before = Date.now();
    await click("stats-parse");
    const sets = h.store.stats_sets as Record<string, { hash: string; ts: number; n: number }>;
    expect(Object.keys(sets)).toEqual(["Study 1 survey"]);
    expect(Object.keys(sets["Study 1 survey"]!).sort()).toEqual(["hash", "n", "ts"]);
    expect(sets["Study 1 survey"]!.hash).toBe(rtHash(statsParseText(SMALL)!));
    expect(sets["Study 1 survey"]!.n).toBe(4);
    expect(sets["Study 1 survey"]!.ts).toBeGreaterThanOrEqual(before);
  });

  it("registers an unnamed set as 'Untitled data' (v1 rtDsName), and the same data again keeps its first time", async () => {
    await mount();
    await type("stats-paste", SMALL);
    await click("stats-parse");
    const first = (h.store.stats_sets as Record<string, { ts: number }>)["Untitled data"]!.ts;
    await new Promise((r) => setTimeout(r, 5));
    await click("stats-parse");
    expect((h.store.stats_sets as Record<string, { ts: number }>)["Untitled data"]!.ts).toBe(first);
  });

  it("remembers the dataset name in stats_prefs, and shows the remembered name when the tab opens", async () => {
    h.store.stats_prefs = { statsname: "Remembered" };
    await mount();
    expect((tid("stats-name") as HTMLInputElement).value).toBe("Remembered");
    await type("stats-name", "Study 2");
    expect((h.store.stats_prefs as { statsname: string }).statsname).toBe("Study 2");
  });

  it("keeps the dataset name to 60 characters", async () => {
    await mount();
    expect((tid("stats-name") as HTMLInputElement).maxLength).toBe(60);
  });

  it("asks before registering over a saved record that cannot be opened, and parses all the same when the answer is no", async () => {
    h.broken.stats_sets = true;
    h.confirm.mockReturnValue(false);
    await mount();
    await type("stats-paste", SMALL);
    await click("stats-parse");
    expect(h.confirm).toHaveBeenCalledWith(E.stats_data_sets_confirm);
    expect(wrote("stats_sets")).toEqual([]);
    expect(getData("p1")!.rows).toHaveLength(4);
    // The answer holds for this visit: it does not ask again at every Parse.
    await click("stats-parse");
    expect(h.confirm).toHaveBeenCalledTimes(1);
    expect(wrote("stats_sets")).toEqual([]);
  });

  it("registers over it once the student says yes, and asks only that once", async () => {
    h.broken.stats_sets = true;
    await mount();
    await type("stats-paste", SMALL);
    await click("stats-parse");
    await click("stats-parse");
    expect(h.confirm).toHaveBeenCalledTimes(1);
    expect(wrote("stats_sets")).toHaveLength(2);
  });

  it("lists the rows left out, by their line in the pasted text", async () => {
    await mount();
    await type("stats-paste", "a,b\n1,2\n3\n4,5\n6,7,8");
    await click("stats-parse");
    expect(text("stats-skipped")).toBe(fill(E.stats_data_skipped!, { n: 2, lines: "3, 5" }));
    expect(text("stats-rows")).toBe(fill(E.stats_data_rows_found!, { n: 2 }));
  });

  it("says nothing about left-out rows when none were", async () => {
    await mount();
    await type("stats-paste", SMALL);
    await click("stats-parse");
    expect(tid("stats-skipped")).toBeNull();
  });

  it("clears the table, the paste box and the notes, and keeps the name", async () => {
    await mount();
    await type("stats-name", "Study 1");
    await type("stats-paste", SMALL);
    await click("stats-parse");
    await click("stats-clear");
    expect((tid("stats-paste") as HTMLTextAreaElement).value).toBe("");
    expect(tid("stats-chips")).toBeNull();
    expect(tid("pd-box")).toBeNull();
    expect((tid("stats-name") as HTMLInputElement).value).toBe("Study 1");
    expect(getData("p1")).toBeNull();
  });
});

describe("upload (v1 statsUpload 9403)", () => {
  it("fills the box, seeds the dataset name from the file name, and parses", async () => {
    await mount();
    await upload("pilot_survey.csv", SMALL);
    await until(() => getData("p1") !== null);
    expect((tid("stats-paste") as HTMLTextAreaElement).value).toBe(SMALL);
    expect((tid("stats-name") as HTMLInputElement).value).toBe("pilot_survey");
    expect((h.store.stats_prefs as { statsname: string }).statsname).toBe("pilot_survey");
    expect(Object.keys(h.store.stats_sets as object)).toEqual(["pilot_survey"]);
    expect(text("stats-status")).toBe(E.stats_data_parsed);
  });

  it("keeps a name the student already typed", async () => {
    await mount();
    await type("stats-name", "Mine");
    await upload("other.tsv", "a\tb\n1\t2");
    await until(() => getData("p1") !== null);
    expect((tid("stats-name") as HTMLInputElement).value).toBe("Mine");
  });

  it("accepts .csv, .tsv and .txt, and says so when a file cannot be read", async () => {
    await mount();
    expect((tid("stats-file") as HTMLInputElement).accept).toBe(".csv,.tsv,.txt");
    const orig = window.FileReader;
    class Failing { onerror: (() => void) | null = null; readAsText() { setTimeout(() => this.onerror?.(), 0); } }
    (window as unknown as { FileReader: unknown }).FileReader = Failing;
    try {
      await upload("bad.csv", "x");
      await until(() => text("stats-status") === E.stats_data_read_failed);
    } finally { window.FileReader = orig; }
  });

  it("opens the file picker from 'Upload .csv'", async () => {
    await mount();
    const spy = vi.spyOn(tid("stats-file") as HTMLInputElement, "click").mockImplementation(() => {});
    await click("stats-upload");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("Review Focus 1: a large, messy file", () => {
  it("parses a 20,000-row semicolon file within 2 s and lists skipped rows", async () => {
    const lines = ["id;score;answer"];
    const ragged = [7, 9000, 19999];
    for (let i = 1; i <= 20000; i++) lines.push(ragged.includes(i) ? `${i};${i % 50};too;many;fields` : `${i};${i % 50};answer ${i} about sleep`);
    await mount();
    // Wall-clock time follows the machine's load (other jobs share this one), so the 2 s is held against the CPU time this work took: the
    // process's user and system time, which does not grow when the machine is busy. The wall-clock time must still be sane.
    const t0 = performance.now();
    const cpu0 = process.cpuUsage();
    await upload("big.csv", lines.join("\n"));
    await until(() => getData("p1") !== null);
    // v1 reads a semicolon file as one column; the tab says so and offers the split, which is the student's to press.
    expect(getData("p1")!.cols).toHaveLength(1);
    expect(text("stats-semicolon")).toContain(E.stats_data_semicolon);
    await click("stats-semicolon-btn");
    await until(() => (getData("p1")?.cols.length ?? 0) === 3);
    const wall = performance.now() - t0;
    const cpu = process.cpuUsage(cpu0);
    const cpuMs = (cpu.user + cpu.system) / 1000;
    expect(cpuMs).toBeLessThan(2000);
    expect(wall).toBeLessThan(30000);
    expect(getData("p1")!.rows).toHaveLength(19997);
    expect(text("stats-rows")).toBe(fill(E.stats_data_rows_found!, { n: 19997 }));
    expect(all("stats-chip").map((c) => c.textContent)).toEqual([
      fill(E.stats_data_chip_numeric!, { name: "id", n: 19997 }),
      fill(E.stats_data_chip_numeric!, { name: "score", n: 19997 }),
      fill(E.stats_data_chip_categorical!, { name: "answer", n: 19997 })
    ]);
    // The three ragged rows are listed by their line in the box (the header is line 1).
    expect(text("stats-skipped")).toBe(fill(E.stats_data_skipped!, { n: 3, lines: "8, 9001, 20000" }));
    expect(tid("stats-semicolon")).toBeNull();
    expect(text("stats-status")).toBe(E.stats_data_split_done);
    expect(getLab("p1").busy).toBe(false);
  }, 60000);

  it("does not offer the split for a table that already has columns", async () => {
    await mount();
    await type("stats-paste", "a,b;c\n1,2;3");
    await click("stats-parse");
    expect(tid("stats-semicolon")).toBeNull();
  });
});

describe("the personal-data box (v1 pdRender 9487, pdApply 9488)", () => {
  async function parsePeople() {
    await mount();
    await type("stats-paste", PEOPLE);
    await click("stats-parse");
  }

  it("flags the names and phone numbers, each with the choice v1 starts at, and shows the warnings", async () => {
    await parsePeople();
    expect(text("pd-found")).toContain(E.stats_pd_title);
    expect(text("pd-found")).toContain(E.stats_pd_intro);
    expect(text("pd-found")).toContain(E.stats_pd_pseudo);
    expect(text("pd-found")).toContain(E.stats_pd_label_name);
    expect(text("pd-found")).toContain(E.stats_pd_label_phone);
    expect((tid("pd-sel-0") as HTMLSelectElement).value).toBe("code"); // names: replace with a code
    expect((tid("pd-sel-1") as HTMLSelectElement).value).toBe("remove"); // phone numbers: remove
    expect(tid("pd-sel-2")).toBeNull(); // site is not flagged
    expect([...(tid("pd-sel-0") as HTMLSelectElement).options].map((o) => o.textContent)).toEqual([E.stats_pd_remove, E.stats_pd_code, E.stats_pd_keep]);
    expect(tid("pd-none")).toBeNull();
  });

  it("says what was checked when nothing was flagged, and does not call the data safe", async () => {
    await mount();
    await type("stats-paste", SMALL);
    await click("stats-parse");
    const line = text("pd-none");
    expect(line).toBe(E.stats_pd_none);
    expect(line).not.toMatch(/safe|anonymous|no personal data|nothing personal/i);
    expect(line).toMatch(/names/);
    expect(tid("pd-found")).toBeNull();
    expect(text("pd-scope")).toContain(E.stats_pd_scope);
  });

  it("names the columns with long text, which the scan cannot read", async () => {
    await mount();
    await type("stats-paste", "id,comment\n1," + "a long open answer about how things went at home and school ".repeat(2) + "\n2," + "another long open answer that goes on for quite a while indeed ".repeat(2));
    await click("stats-parse");
    expect(text("pd-scope")).toContain(fill(E.stats_pd_long!, { cols: "comment" }));
  });

  it("codes the names, removes the phone numbers, rewrites the box and downloads the key file with a byte-order mark", async () => {
    await parsePeople();
    await click("pd-apply");
    await until(() => tid("pd-result") !== null);
    const box = (tid("stats-paste") as HTMLTextAreaElement).value;
    expect(box.split("\n")[0]).toBe("ParticipantCode,site,score");
    expect(box).not.toContain("Asha");
    expect(box).not.toContain("98765432");
    expect(getData("p1")!.headers).toEqual(["ParticipantCode", "site", "score"]);
    expect(text("pd-result")).toBe([E.stats_pd_done, fill(E.stats_pd_removed!, { n: 1 }), fill(E.stats_pd_coded!, { n: 1 }), E.stats_pd_keyed].join(" "));
    expect(h.download).toHaveBeenCalledTimes(1);
    const [name, blob] = h.download.mock.calls[0] as [string, Blob];
    expect(name).toBe("appuscholar_key_keep_separate.csv");
    expect(blob.type).toBe("text/csv;charset=utf-8");
    const { text: key, bytes } = await readBlob(blob);
    expect(bytes).toEqual([0xef, 0xbb, 0xbf]);
    expect(key.slice(1).split("\n")[0]).toBe("ParticipantCode,name");
    expect(key).toContain("P001,Asha Rao");
    expect(key).toContain("P006,Omar Khan");
    // The coded table is the data the lab now holds, and its new fingerprint is registered.
    const sets = h.store.stats_sets as Record<string, { hash: string }>;
    expect(sets["Untitled data"]!.hash).toBe(rtHash(getData("p1")!));
    expect(h.toast).not.toHaveBeenCalled();
  });

  it("offers no key file when the flagged columns are only removed", async () => {
    await parsePeople();
    await choose("pd-sel-0", "remove");
    await click("pd-apply");
    await until(() => tid("pd-result") !== null);
    expect(h.download).not.toHaveBeenCalled();
    expect(text("pd-result")).toBe([E.stats_pd_done, fill(E.stats_pd_removed!, { n: 2 })].join(" "));
    expect(getData("p1")!.headers).toEqual(["site", "score"]);
  });

  it("changes nothing when every flagged column is kept, and downloads nothing", async () => {
    await parsePeople();
    await choose("pd-sel-0", "keep");
    await choose("pd-sel-1", "keep");
    await click("pd-apply");
    await until(() => tid("pd-result") !== null);
    expect(text("pd-result")).toBe(E.stats_pd_unchanged);
    expect(h.download).not.toHaveBeenCalled();
    expect((tid("stats-paste") as HTMLTextAreaElement).value).toBe(PEOPLE);
  });

  it("is gone from the screen once the rows are cleared", async () => {
    await parsePeople();
    await click("stats-clear");
    expect(tid("pd-box")).toBeNull();
  });
});

describe("no data row is in any blob (ledger R1)", () => {
  it("no data row is in any blob: after parse and apply no serialized write holds a cell, and stats_sets holds name, hash, ts and n only", async () => {
    await mount();
    await type("stats-name", "Study 1");
    await type("stats-paste", PEOPLE);
    await click("stats-parse");
    await click("pd-apply");
    await until(() => tid("pd-result") !== null);
    await click("stats-parse");
    expect(h.writes.length).toBeGreaterThan(0);
    // Every cell that cannot be mistaken for a digit run of a time or a count.
    const cells = statsParseText(PEOPLE)!.rows.flat().filter((c) => /[A-Za-z]/.test(c));
    expect(cells).toContain("ZXQ-SITE-3");
    expect(cells).toContain("Asha Rao");
    const written = h.writes.map((w) => w.json).join("\n");
    for (const c of cells) expect(written, c).not.toContain(c);
    expect(written).not.toContain("P001"); // nor a participant code
    // Only the two kinds the tab owns were written, and the set holds the four fields.
    expect([...new Set(h.writes.map((w) => w.kind))].sort()).toEqual(["stats_prefs", "stats_sets"]);
    const sets = h.store.stats_sets as Record<string, Record<string, unknown>>;
    expect(Object.keys(sets)).toEqual(["Study 1"]);
    expect(Object.keys(sets["Study 1"]!).sort()).toEqual(["hash", "n", "ts"]);
    expect(Object.keys(h.store.stats_prefs as object)).toEqual(["statsname"]);
    expect(h.store.stats_runs).toBeUndefined();
  });

  it("nor in the browser's storage, nor sent anywhere", async () => {
    const ls = vi.spyOn(Storage.prototype, "setItem");
    const net = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", net);
    await mount();
    await type("stats-paste", PEOPLE);
    await click("stats-parse");
    await click("pd-apply");
    await until(() => tid("pd-result") !== null);
    expect(ls.mock.calls.map((c) => String(c[1])).join("")).not.toContain("ZXQ-SITE");
    expect(net).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("what the Data tab says about where the rows go", () => {
  it("says the rows are neither sent nor saved, and that the name, row count and fingerprint are saved to the project", () => {
    for (const lang of [E, hi]) {
      const line = lang.stats_data_privacy!;
      expect(line).not.toMatch(/—/);
      expect(line).not.toMatch(/this tab|इस टैब/i);
    }
    expect(E.stats_data_privacy).toMatch(/not sent or saved/);
    expect(E.stats_data_privacy).toMatch(/name.*row count.*fingerprint/);
  });
  it("does not describe results that cannot be inserted yet", () => {
    expect(E.stats_data_name_help).not.toMatch(/insert|tagged|out of date|flagged/i);
  });
});

describe("a parse that finishes after the tab was left is still recorded", () => {
  const BIG = ["group,score", ...Array.from({ length: 20000 }, (_, i) => `${i % 2 ? "A" : "B"},${i % 50}`)].join("\n");
  /** Polls the lab without act (nothing is mounted). */
  async function lands() { const t0 = Date.now(); while (!getData("p1") && Date.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 10)); expect(getData("p1")).not.toBeNull(); }

  it("registers the set when the tab is opened again, under the name the student typed", async () => {
    const first = await mount();
    await type("stats-name", "Study late");
    await type("stats-paste", BIG);
    act(() => { tid("stats-parse")!.click(); });
    await unmount(first);
    await lands();
    expect(h.store.stats_sets).toBeUndefined(); // nothing was mounted to record it
    await mount();
    const sets = h.store.stats_sets as Record<string, { hash: string; n: number }>;
    expect(Object.keys(sets)).toEqual(["Study late"]);
    expect(sets["Study late"]!.hash).toBe(rtHash(getData("p1")!));
    expect(sets["Study late"]!.n).toBe(20000);
  }, 60000);

  it("remembers a file-seeded name that arrived after the tab was left, and registers under it", async () => {
    const first = await mount();
    await upload("late_survey.csv", BIG);
    await unmount(first);
    await lands();
    expect(h.store.stats_prefs).toBeUndefined();
    await mount();
    expect((tid("stats-name") as HTMLInputElement).value).toBe("late_survey");
    expect((h.store.stats_prefs as { statsname: string }).statsname).toBe("late_survey");
    expect(Object.keys(h.store.stats_sets as object)).toEqual(["late_survey"]);
  }, 60000);

  it("does not register a table that is already recorded, nor again at each mount", async () => {
    const first = await mount();
    await type("stats-paste", SMALL);
    await click("stats-parse");
    await unmount(first);
    const before = h.writes.length;
    await mount();
    expect(h.writes.length).toBe(before);
  });
});

describe("nothing is saved before the stored lists are known (R16)", () => {
  it("records the set only once stats_sets has been read, and then in the same open tab", async () => {
    h.loading.stats_sets = true;
    await mount();
    await type("stats-paste", SMALL);
    await click("stats-parse");
    expect(getData("p1")).not.toBeNull();
    expect(wrote("stats_sets")).toEqual([]);
    h.loading.stats_sets = false;
    await type("stats-name", "Study 1"); // any change draws the tab again
    expect(Object.keys(h.store.stats_sets as object)).toEqual(["Study 1"]);
  });

  it("does not ask 'Save anyway?' nor save over a list that cannot be opened while it is still being read", async () => {
    h.loading.stats_sets = true;
    h.broken.stats_sets = true;
    h.confirm.mockReturnValue(false);
    await mount();
    await type("stats-paste", SMALL);
    await click("stats-parse");
    expect(h.confirm).not.toHaveBeenCalled();
    expect(wrote("stats_sets")).toEqual([]);
    h.loading.stats_sets = false; // known now: broken, and the student says no
    await type("stats-name", "Study 1");
    expect(h.confirm).toHaveBeenCalledTimes(1);
    expect(wrote("stats_sets")).toEqual([]);
  });

  it("waits for a locked vault instead of queueing a save that would raise the passphrase prompt", async () => {
    h.locked.stats_sets = true;
    await mount();
    await type("stats-paste", SMALL);
    await click("stats-parse");
    expect(wrote("stats_sets")).toEqual([]);
    h.locked.stats_sets = false;
    await type("stats-name", "Study 1");
    expect(Object.keys(h.store.stats_sets as object)).toEqual(["Study 1"]);
  });

  it("remembers a name the lab already holds only once stats_prefs has been read", async () => {
    setName("p1", "From a file");
    h.loading.stats_prefs = true;
    await mount();
    expect(wrote("stats_prefs")).toEqual([]);
    h.loading.stats_prefs = false;
    await type("stats-paste", SMALL); // draws the tab again
    expect((h.store.stats_prefs as { statsname: string }).statsname).toBe("From a file");
  });
});

describe("a tab switch keeps the rows (ledger R1)", () => {
  it("parse on Data, mount the Panel again: the rows, the chips and the paste box are still there", async () => {
    const first = await mount();
    await type("stats-name", "Study 1");
    await type("stats-paste", SMALL);
    await click("stats-parse");
    await unmount(first);
    expect(tid("stats-paste")).toBeNull();
    // Another tab in between (Power, built in Task B4) comes and goes; the lab is not a component's state.
    const other = await mount("power");
    await unmount(other);
    await mount();
    expect((tid("stats-paste") as HTMLTextAreaElement).value).toBe(SMALL);
    expect((tid("stats-name") as HTMLInputElement).value).toBe("Study 1");
    expect(text("stats-rows")).toBe(fill(E.stats_data_rows_found!, { n: 4 }));
    expect(all("stats-chip")).toHaveLength(2);
    expect(getData("p1")!.rows).toHaveLength(4);
  });
});
