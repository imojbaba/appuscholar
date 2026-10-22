// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clCompare, clReportText, type ClResult, type ClSource } from "@appuscholar/core";
import en from "../messages/en.json";
import closeEn from "../messages/tools/close.en.json";

/*
 * The Closeness tab (Task E2; v1 795-815 and 6858-6974): sources, settings, the check, the marked text, totals by source, each passage, the report. The engine runs through the panel's own
 * runner (no Worker in jsdom, so its main-thread path: the same clCompare), and the report the Download button saves is checked against v1's for a golden case.
 */
const E = { ...(en as Record<string, string>), ...(closeEn as Record<string, string>) };
type Case = { id: string; studentText: string; sources: ClSource[]; k: number; minRun: number; date: string; result: ClResult; report: string };
const FX = JSON.parse(readFileSync(join(__dirname, "../../../packages/core/test/golden/closeness/cases.json"), "utf8")) as { cases: Case[] };

const SOURCE = "The quick brown fox jumps over the lazy dog while the farmer watches carefully from the old barn near the river bank today";
const STUDENT = "In my own essay I want to say something important about learning. The quick brown fox jumps over the lazy dog while the farmer watches carefully from the old barn and then I keep writing many more words so that the whole length is comfortably above thirty words in all.";

const h = vi.hoisted(() => ({
  text: "" as string,
  docs: [] as Array<{ id: string; title: string; text: string; html: string }>,
  index: [] as Array<{ id: string; title: string; file: string; size: number; added: string; total: number; kept: number }> | null,
  shelf: { loading: false, locked: false, broken: false, error: false },
  papers: {} as Record<string, string[]>,
  prefs: null as null | { k?: number; min?: number },
  prefsSet: vi.fn(),
  download: vi.fn(),
  hook: null as null | ((...a: unknown[]) => Promise<unknown>),
  currentId: "cur" as string | null
}));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ project: { id: "p1" }, projectId: "p1", currentDoc: h.currentId ? { id: h.currentId } : null }) }));
vi.mock("@/lib/editor/docAccess", () => ({ useDocAccess: () => ({ text: () => h.text, selection: () => "", allDocuments: async () => h.docs }) }));
vi.mock("@/lib/shelf/useShelf", () => ({
  useShelf: () => ({ projectId: "p1", index: h.index, ...h.shelf, loadPaper: async (id: string) => (h.papers[id] ? { pages: h.papers[id], notes: [], cells: {} } : null) })
}));
vi.mock("@/lib/blobs/useProjectBlob", async () => {
  const React = await import("react");
  return {
    useProjectBlob: () => {
      const [v, setV] = React.useState(h.prefs);
      return { value: v, loading: false, locked: false, readOnly: false, flush: async () => true, set: (u: unknown) => { const n = typeof u === "function" ? (u as (p: unknown) => unknown)(v) : u; h.prefsSet(n); setV(n as typeof v); } };
    }
  };
});
vi.mock("@/lib/export/download", () => ({ downloadBlob: (name: string, blob: Blob) => h.download(name, blob) }));
vi.mock("@/lib/tools/close/runner", async (orig) => {
  const m = await orig<typeof import("../lib/tools/close/runner")>();
  return { ...m, createRunner: () => { const real = m.createRunner(); return { run: (...a: Parameters<typeof real.run>) => (h.hook ? (h.hook(...a) as ReturnType<typeof real.run>) : real.run(...a)), dispose: () => real.dispose() }; } };
});

import { Panel } from "../components/tools/close/Panel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => [...document.body.querySelectorAll<HTMLElement>(sel)];
const tid = (id: string) => $(`[data-testid="${id}"]`);
async function settle(ms = 0) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }
async function until(pred: () => boolean) { for (let i = 0; i < 300; i++) { if (pred()) return; await settle(5); } throw new Error("condition not reached"); }
async function mount(projectId = "p1") {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(<Panel tab="closeness" projectId={projectId} />); });
  // The panel's body is fetched when the tab first opens (Panel.tsx).
  await until(() => !!tid("panel-close"));
  await settle();
  return root;
}
async function click(el: HTMLElement | null) { await act(async () => { el!.click(); await new Promise((r) => setTimeout(r, 0)); }); }
function typeIn(el: HTMLTextAreaElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function choose(el: HTMLSelectElement, value: string) {
  act(() => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, value); el.dispatchEvent(new Event("change", { bubbles: true })); });
}
const run = async () => { await click(tid("close-run")); };
const finished = () => until(() => !!tid("close-note") || !!tid("close-result"));
const blobText = (b: Blob) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).replace(/^\uFEFF/, "")); r.readAsText(b); });

// The panel's body is fetched when its tab first opens (Panel.tsx); load it once here so no test waits on the first cold import.
beforeAll(async () => { await import("../components/tools/close/CloseBody"); }, 120_000);
beforeEach(() => {
  h.text = STUDENT; h.docs = []; h.currentId = "cur";
  h.index = [{ id: "p1", title: "Paper one", file: "p1.pdf", size: 1, added: "", total: 1, kept: 1 }, { id: "p2", title: "", file: "second.pdf", size: 1, added: "", total: 1, kept: 1 }];
  h.shelf = { loading: false, locked: false, broken: false, error: false };
  h.papers = { p1: [SOURCE], p2: ["Nothing alike here at all, just some other words about a different subject entirely."] };
  h.prefs = null; h.prefsSet.mockReset(); h.download.mockReset(); h.hook = null;
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Closeness: the sources and settings", () => {
  it("lists the Reading shelf papers (ticked) and other documents over 200 characters (not the open one), and a paste box; settings default to 6 and 8", async () => {
    h.docs = [
      { id: "cur", title: "The open one", text: "", html: "<p>" + "a".repeat(300) + "</p>" },
      { id: "d1", title: "Old essay", text: "", html: "<p>" + "b ".repeat(150) + "</p>" },
      { id: "d2", title: "Tiny", text: "", html: "<p>tiny</p>" }
    ];
    await mount();
    expect($("h3")!.textContent).toBe(E.close_heading);
    const boxes = $$('input[type="checkbox"][data-testid="close-source"]') as HTMLInputElement[];
    expect(boxes.map((b) => b.value)).toEqual(["s:p1", "s:p2", "d:d1"]);
    expect(boxes.every((b) => b.checked)).toBe(true);
    expect(tid("close-sources")!.textContent).toContain("Paper one");
    expect(tid("close-sources")!.textContent).toContain("second.pdf");
    expect(tid("close-sources")!.textContent).toContain("Old essay");
    expect(tid("close-sources")!.textContent).not.toContain("Tiny");
    expect(tid("close-sources")!.textContent).not.toContain("The open one");
    expect(($("#clPaste") as HTMLTextAreaElement).placeholder).toBe(E.close_paste_ph);
    expect((tid("close-k") as HTMLSelectElement).value).toBe("6");
    expect((tid("close-min") as HTMLSelectElement).value).toBe("8");
  });
  it("says the shelf is empty (and offers the paste box) when it has no paper; a shelf not read says so and does not say empty", async () => {
    h.index = []; await mount();
    expect(tid("close-sources")!.textContent).toContain(E.close_shelf_empty);
    act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = "";
    h.index = null; h.shelf.locked = true; await mount();
    expect(tid("close-sources")!.textContent).not.toContain(E.close_shelf_empty);
    expect(tid("close-shelf-locked")!.textContent).toBe(E.vault_shelf_locked);
  });
  it("remembers the two settings in close_prefs and shows the stored ones; a stored value outside the allowed ones reads as the default", async () => {
    h.prefs = { k: 8, min: 15 }; await mount();
    expect((tid("close-k") as HTMLSelectElement).value).toBe("8");
    expect((tid("close-min") as HTMLSelectElement).value).toBe("15");
    choose(tid("close-k") as HTMLSelectElement, "5");
    expect(h.prefsSet).toHaveBeenLastCalledWith({ k: 5, min: 15 });
    choose(tid("close-min") as HTMLSelectElement, "10");
    expect(h.prefsSet).toHaveBeenLastCalledWith({ k: 5, min: 10 });
    act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = "";
    h.prefs = { k: 7, min: 9 }; await mount();
    expect((tid("close-k") as HTMLSelectElement).value).toBe("6");
    expect((tid("close-min") as HTMLSelectElement).value).toBe("8");
  });
});

describe("Closeness: the check", () => {
  it("needs about 30 words and says so in words (no toast)", async () => {
    h.text = "Far too short to compare.";
    await mount(); await run();
    expect(tid("close-note")!.textContent).toBe(E.close_need_words);
    expect(tid("close-result")).toBeNull();
  });
  it("needs a source: every box unticked and nothing pasted", async () => {
    await mount();
    for (const b of $$('input[data-testid="close-source"]') as HTMLInputElement[]) await click(b);
    await run();
    expect(tid("close-note")!.textContent).toBe(E.close_need_source);
  });
  it("shows a result: the number, the marked text with a [1.1] tag, the totals by source and the passage, worded 'close to'", async () => {
    await mount(); await run(); await finished();
    const r = clCompare(STUDENT, [{ name: "Paper one", kind: "Reading shelf", text: SOURCE + "\n", pageStarts: [0] }, { name: "second.pdf", kind: "Reading shelf", text: h.papers.p2![0]! + "\n", pageStarts: [0] }], 6, 8);
    expect(r.runs).toHaveLength(1);
    expect(tid("close-result")!.textContent).toContain(r.pct + "% of your words");
    expect(tid("close-result")!.textContent).toContain("(" + r.covered + " of " + r.counted + " counted)");
    const mark = $("mark")!;
    expect(mark.textContent).toBe(STUDENT.slice(r.runs[0]!.cs, r.runs[0]!.ce));
    expect(mark.nextElementSibling!.textContent).toContain("[1.1]");
    expect(tid("close-marked")!.textContent!.replace("[1.1]", "")).toBe(STUDENT);
    expect(tid("close-by-source")!.textContent).toContain("Paper one");
    expect(tid("close-by-source")!.textContent).not.toContain("second.pdf");
    const p = $$('[data-testid="close-passage"]');
    expect(p).toHaveLength(1);
    expect(p[0]!.textContent).toContain(r.runs[0]!.words + " words close to Paper one, page 1");
    expect(p[0]!.textContent).toContain(E.close_yours);
    expect(p[0]!.textContent).toContain(E.close_theirs);
    expect(p[0]!.textContent).toContain(E.close_todo);
  });
  it("renders the student's words as text, never as markup", async () => {
    h.text = STUDENT + " <img src=x onerror=alert(1)> <b>bold</b>";
    await mount(); await run(); await finished();
    expect(tid("close-marked")!.querySelector("img")).toBeNull();
    expect(tid("close-marked")!.querySelector("b")).toBeNull();
    expect(tid("close-marked")!.textContent).toContain("<img src=x onerror=alert(1)>");
  });
  it("a result of nothing says v1's sentence and does not call it safe; the limits line says a low number is not a clean bill", async () => {
    h.papers = { p1: ["Nothing alike here at all, just some other words about a different subject entirely."], p2: ["More of nothing."] };
    await mount(); await run(); await finished();
    expect(tid("close-result")!.textContent).toContain("No passage of 8 words or more matched. That is only about the sources you chose.");
    expect(tid("close-result")!.textContent).toContain("A low number is not a clean bill.");
    expect(tid("close-result")!.textContent).toContain("ideas reused in new words");
    expect(tid("close-marked")).toBeNull();
    expect(tid("close-download")).toBeNull();
  });
  it("never writes 'copied' or 'safe' anywhere on the panel, whatever the result", async () => {
    await mount(); await run(); await finished();
    const text = tid("panel-close")!.textContent!;
    expect(text).not.toMatch(/copied/i);
    expect(text).not.toMatch(/\bsafe\b/i);
    expect(text).toContain("close to");
  });
  it("uses the passage length setting: a passage under the minimum is not shown", async () => {
    // Eleven shared words: shown at 8, not at 15.
    h.text = "In my own essay I want to say something important about learning. The quick brown fox jumps over the lazy dog while the and then I keep writing many more words so that the whole length is comfortably above thirty words in all.";
    h.prefs = { k: 6, min: 15 };
    await mount(); await run(); await finished();
    expect(tid("close-result")!.textContent).toContain("No passage of 15 words or more matched.");
    act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = "";
    h.prefs = { k: 6, min: 8 };
    await mount(); await run(); await finished();
    expect($$('[data-testid="close-passage"]')).toHaveLength(1);
  });
  it("a pasted passage is a source (kind pasted), and a ticked other document is one (kind your document)", async () => {
    h.index = [];
    h.docs = [{ id: "d1", title: "Old essay", text: "", html: "<p>" + SOURCE + " " + "filler ".repeat(40) + "</p>" }];
    await mount();
    typeIn($("#clPaste") as HTMLTextAreaElement, "unrelated passage words that do not match anything at all in the student text");
    await run(); await finished();
    expect(tid("close-by-source")!.textContent).toContain("Old essay");
    expect(tid("close-by-source")!.textContent).toContain(E.close_kind_doc);
  });
  it("tells the student when a ticked paper could not be read, and does not call the rest complete", async () => {
    h.papers = { p2: ["Nothing alike."] };
    await mount(); await run(); await finished();
    expect(tid("close-skipped")!.textContent).toBe(E.close_skipped_one);
  });
  it("disables the button and says Checking… while it runs, then enables it again", async () => {
    let release!: (r: ClResult) => void;
    h.hook = () => new Promise((res) => { release = res as (r: ClResult) => void; });
    await mount(); await run();
    await until(() => !!tid("close-status"));
    const btn = tid("close-run") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toContain(E.close_running);
    expect(tid("close-status")!.textContent).toBe(E.close_running);
    await act(async () => { release(clCompare(STUDENT, [], 6, 8)); await Promise.resolve(); });
    await until(() => !(tid("close-run") as HTMLButtonElement).disabled);
    expect(tid("close-run")!.textContent).toBe(E.close_run);
  });
  it("ignores a result that comes back after the project changed or the panel went away", async () => {
    let release!: (r: ClResult) => void;
    h.hook = () => new Promise((res) => { release = res as (r: ClResult) => void; });
    const root = await mount(); await run();
    await until(() => !!tid("close-status"));
    await act(async () => { root.render(<Panel tab="closeness" projectId="p2" />); });
    await until(() => !!tid("panel-close") && !tid("close-status"));
    await act(async () => { release(clCompare(STUDENT, [{ name: "Late", kind: "pasted", text: SOURCE }], 6, 8)); await new Promise((r) => setTimeout(r, 0)); });
    expect(tid("close-result")).toBeNull();
    expect((tid("close-run") as HTMLButtonElement).disabled).toBe(false);
    act(() => { root.unmount(); });
    roots.splice(roots.indexOf(root), 1);
    await act(async () => { release(clCompare(STUDENT, [], 6, 8)); await Promise.resolve(); });
  });
  it("a run that fails says so in words and enables the button", async () => {
    h.hook = () => Promise.reject(new Error("boom"));
    await mount(); await run(); await finished();
    expect(tid("close-note")!.textContent).toBe(E.close_failed);
    expect((tid("close-run") as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("Closeness: the report", () => {
  it("the Download button saves closeness-check.txt whose text is v1's report for a golden case (the date injected)", async () => {
    // The golden case with a paged paper and a pasted passage. The shelf holds the paper's pages (cut where the engine's page starts are) and the passage is pasted. v1 named a pasted
    // source "Pasted passage" when it was run from its page; the capture named it "No pages", so that name is the one thing the expectation changes.
    const c = FX.cases.find((x) => x.id === "pagestarts-two-runs")!;
    const s = c.sources[0]!;
    const starts = s.pageStarts!;
    const pages = starts.map((a, i) => s.text.slice(a, i + 1 < starts.length ? starts[i + 1]! - 1 : s.text.length - 1));
    h.index = [{ id: "g", title: s.name, file: "g.pdf", size: 1, added: "", total: pages.length, kept: pages.length }];
    h.papers = { g: pages };
    h.text = c.studentText;
    h.prefs = { k: c.k, min: c.minRun };
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(c.date));
    await mount();
    typeIn($("#clPaste") as HTMLTextAreaElement, c.sources[1]!.text);
    await run(); await finished();
    expect(tid("close-result")!.textContent).toContain(c.result.pct + "% of your words");
    await click(tid("close-download"));
    expect(h.download).toHaveBeenCalledTimes(1);
    const [name, blob] = h.download.mock.calls[0] as [string, Blob];
    expect(name).toBe("closeness-check.txt");
    const text = await blobText(blob);
    expect(text).toBe(c.report.split("No pages").join("Pasted passage"));
    expect(text).toBe(clReportText({ ...c.result, sources: c.result.sources.map((x) => (x.name === "No pages" ? { ...x, name: "Pasted passage" } : x)) }, c.date));
  });
});
