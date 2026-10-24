// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { citFmt, citKey, sanitizeHtml, type CitationEntry, type RcCheck } from "@appuscholar/core";
import type { StoredEntry } from "../lib/blobs/kinds";
import { editorExtensions } from "../lib/editorExtensions";
import en from "../messages/en.json";

/*
 * Literature's Citations tab (wave B Task 23, register row D-S2-129): every source with its status, its use in the student's documents and its fix. It replaces the Citation
 * Manager panel; what the panel carried and the tab keeps (ruling B2-R28) is pinned here too: per-source Insert citation and Remove in the row's More menu, the caret chip's lit
 * row, and the quote box inside "Add a source by hand".
 */
type Blob = { value: unknown; loading: boolean; locked: boolean; broken?: boolean; error?: boolean; readOnly?: boolean; set: ReturnType<typeof vi.fn>; flush: ReturnType<typeof vi.fn> };
const h = vi.hoisted(() => ({
  blobs: {} as Record<string, Blob>,
  toast: vi.fn(),
  editor: null as unknown,
  documents: [] as Array<{ id: string; title: string; titleKeyVersion: number; deks: unknown[]; updatedAt: string }>,
  currentDoc: null as null | { id: string },
  selectDoc: vi.fn(async () => true),
  stored: {} as Record<string, { bodyHtml: string; keyVersion: number }>,
  openExport: vi.fn(),
  /** What the shell's requestInsert does: opens a closed document (making its editor) and runs the insert on it. */
  opened: 0,
  openEditor: null as null | (() => unknown)
}));
vi.mock("@/lib/blobs/useProjectBlob", () => ({ useProjectBlob: (kind: string) => h.blobs[kind] }));
vi.mock("@/lib/ai/useCallAI", async (orig) => ({ ...(await orig<typeof import("../lib/ai/useCallAI")>()), useCallAI: () => async () => "" }));
vi.mock("@/lib/ai/suggestion", () => ({ useSuggestion: () => ({ editor: h.editor }) }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", scratchProjectId: "scratch-1" }, settings: {} }) }));
vi.mock("@/components/frame/ProjectContext", () => ({
  useProject: () => ({
    project: { id: "p1" }, projectId: "p1", documents: h.documents, currentDoc: h.currentDoc, selectDoc: h.selectDoc, go: vi.fn(), openExport: h.openExport,
    requestInsert: async (run: (e: never) => void) => {
      let e = h.editor as { isDestroyed?: boolean } | null;
      if ((!e || e.isDestroyed) && h.openEditor) { h.opened++; e = h.openEditor() as typeof e; }
      if (!e || e.isDestroyed) return false;
      run(e as never);
      return true;
    }
  })
}));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => ({ status: "unlocked", decryptBody: async (d: { bodyHtml: string }) => d.bodyHtml.replace(/^sealed:/, "") }) }));
vi.mock("@/lib/api", () => ({
  apiFetch: async (path: string) => {
    const id = path.replace("/documents/", "");
    const d = h.stored[id];
    if (!d) throw new Error("404");
    return { id, deks: [], ...d };
  }
}));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));

import { CitationsTab } from "../components/literature/CitationsTab";
import { sourceStatus, type SourceStatus } from "../lib/cite/checks";
import { sourceUse } from "../lib/cite/usage";
import { resetCheckBusy } from "../lib/cite/checks";
import { resetCiteActive, setCiteActive } from "../lib/cite/active";
import { resetCiteForm } from "../lib/cite/form";
import { resetCiteStyle } from "../lib/cite/useLibrary";
import { noPids } from "./support/noPids";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = en as Record<string, string>;
const t = (k: string, vars?: Record<string, string | number>) => (E[k] ?? k).replace(/\{(\w+)\}/g, (m, x: string) => (vars && x in vars ? String(vars[x]) : m));

const NOW = Date.UTC(2026, 9, 24, 12);
const DAY = 24 * 3600 * 1000;
/** The canvas's four sources (Citations.dc.html), written as the library holds them. */
const OMEGA: CitationEntry = { type: "Journal article", author: "", year: "2011", title: "Omega-3 supplementation lowers inflammation and anxiety in medical students: a randomized controlled trial", source: "Brain, Behavior, and Immunity", volume: "25", issue: "8", doi: "10.1016/j.bbi.2011.07.229" };
const COHEN: CitationEntry = { type: "Book", author: "Cohen, J.", year: "1988", title: "Statistical power analysis for the behavioral sciences", source: "Lawrence Erlbaum Associates", doi: "10.4324/9780203771587" };
const PUTWAIN: CitationEntry = { type: "Journal article", author: "Putwain, D. W.", year: "2008", title: "Examination stress and test anxiety" };
const SCHAEFER: CitationEntry = {
  type: "Journal article", author: "Schaefer, M.; Denke, C.; Harke, R.; Olk, N.; Erkovan, M.; Enge, S.", year: "2019",
  title: "Open-label placebos reduce test anxiety and improve self-management skills: A randomized-controlled trial", source: "Scientific Reports", volume: "9", pages: "13317", doi: "10.1038/s41598-019-49466-6"
};
const CROSSREF_F = { title: "x", year: 2011, author: "Kiecolt-Glaser", doi: "10.1016/j.bbi.2011.07.229", authors: "Kiecolt-Glaser, Janice K.; Belury, Martha A.; Andridge, Rebecca; Malarkey, William B.; Glaser, Ronald" };

const roots: Root[] = [];
const editors: Editor[] = [];
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel);
const tid = (id: string) => $(`[data-testid="${id}"]`);
const all = (id: string) => [...document.body.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
const toasts = () => h.toast.mock.calls.map((c) => c[0] as string);
function blob(value: unknown): Blob { return { value, loading: false, locked: false, set: vi.fn(), flush: vi.fn(async () => true) }; }
/** Applies the updates a blob's set() was given, in order, to `start`. */
function applied(b: Blob, start: unknown = null) {
  return b.set.mock.calls.reduce((prev, [u]) => (typeof u === "function" ? (u as (p: unknown) => unknown)(prev) : u), start);
}
function mount() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  act(() => { root.render(<CitationsTab />); });
  return root;
}
function unmountAll() { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; }
async function settle(ms = 0) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }
async function click(el: HTMLElement) { await act(async () => { el.click(); await new Promise((r) => setTimeout(r, 0)); }); }
function editorWith(html: string) {
  const e = new Editor({ extensions: editorExtensions, content: html });
  editors.push(e);
  h.editor = e;
  return e;
}
/**
 * Radix opens a menu from its trigger on Enter. It first lets the timers of an earlier menu run (a closed menu hands focus back to its trigger on a timer, after the test's own
 * timer), so a second menu opened at once is not met by the first one's leftovers when the machine is busy.
 */
async function openMore(row: HTMLElement) {
  await settle(30);
  await act(async () => { row.querySelector('[data-testid="source-more"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
  expect($('[role="menu"]')).not.toBeNull();
}
const menuItems = () => [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')];
const rows = () => all("source-row");
const rcOf = (d: CitationEntry, c: RcCheck) => ({ [citKey(d)]: c });
const ok = (): RcCheck => ({ s: "ok", m: [], f: { title: "x", year: 2020, author: "x", doi: "10.1/x" }, t: 1 });

beforeEach(() => {
  h.blobs = { citations: blob([OMEGA, COHEN, PUTWAIN, SCHAEFER]), retraction_cache: blob({}), refcheck_cache: blob({}) };
  h.toast.mockReset();
  h.openExport.mockReset();
  h.editor = null;
  h.openEditor = null;
  h.opened = 0;
  h.documents = [];
  h.currentDoc = null;
  h.selectDoc.mockClear();
  h.stored = {};
  resetCheckBusy();
  resetCiteActive();
  resetCiteStyle();
  resetCiteForm();
  vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
});
afterEach(() => {
  unmountAll();
  for (const e of editors.splice(0)) e.destroy();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * Each source's status (the brief's five words), from the Crossref answer the project stored for it and OpenAlex's retraction answer; the use line comes apart from it.
 * `check` is keyed by the entry's own citKey. The author line leaves the check once the entry has an author (wave A LATER T11).
 */
type StatusCase = { name: string; entry: CitationEntry; check?: RcCheck; retr?: { r: boolean; t: number }; status: SourceStatus; text: string };
const diff = (m: NonNullable<RcCheck["m"]>, miss?: NonNullable<RcCheck["miss"]>): RcCheck => ({ s: "diff", m, ...(miss ? { miss } : {}), f: CROSSREF_F, t: 1 });
const SOURCE_STATUS_CASES: StatusCase[] = [
  { name: "a match is Checked", entry: PUTWAIN, check: ok(), status: "checked", text: "Checked" },
  { name: "no stored answer is Not checked yet", entry: PUTWAIN, status: "unchecked", text: "Not checked yet" },
  { name: "a lookup that failed is Not checked yet", entry: PUTWAIN, check: { s: "err", t: 1 }, status: "unchecked", text: "Not checked yet" },
  { name: "not in Crossref Needs a fix", entry: PUTWAIN, check: { s: "nf", t: 1 }, status: "fix", text: "Needs a fix" },
  { name: "no author where Crossref lists them Needs a fix", entry: OMEGA, check: diff([{ k: "author", v: "Kiecolt-Glaser" }], ["author"]), status: "fix", text: "Needs a fix" },
  { name: "a title that differs Needs a fix", entry: COHEN, check: diff([{ k: "title", v: "Other" }]), status: "fix", text: "Needs a fix" },
  { name: "a volume missing here Needs a fix", entry: COHEN, check: diff([], ["volume"]), status: "fix", text: "Needs a fix" },
  { name: "a year that differs alone is Year differs from Crossref", entry: COHEN, check: diff([{ k: "year", v: "2013" }]), status: "year", text: "Year differs from Crossref" },
  { name: "a year that differs with a page missing Needs a fix", entry: COHEN, check: diff([{ k: "year", v: "2013" }], ["pages"]), status: "fix", text: "Needs a fix" },
  { name: "a retraction is Retracted, whatever Crossref says", entry: SCHAEFER, check: ok(), retr: { r: true, t: NOW }, status: "retracted", text: "Retracted" },
  { name: "a retraction answer of no keeps Checked", entry: SCHAEFER, check: ok(), retr: { r: false, t: NOW }, status: "checked", text: "Checked" },
  { name: "an author typed after the check leaves the author line, and nothing else is wrong: Checked", entry: { ...OMEGA, author: "Kiecolt-Glaser, J." }, check: diff([{ k: "author", v: "Kiecolt-Glaser" }], ["author"]), status: "checked", text: "Checked" },
  { name: "an author typed after the check, with a page still missing: Needs a fix", entry: { ...OMEGA, author: "Kiecolt-Glaser, J." }, check: diff([{ k: "author", v: "Kiecolt-Glaser" }], ["author", "pages"]), status: "fix", text: "Needs a fix" },
  { name: "a real author difference (the saved author is not empty) stays", entry: COHEN, check: diff([{ k: "author", v: "Cohen" }]), status: "fix", text: "Needs a fix" }
];

describe("each source's status", () => {
  it.each(SOURCE_STATUS_CASES)("source status: $name", async (c) => {
    expect(sourceStatus(c.entry, c.check, c.retr ?? null)).toBe(c.status);
    h.blobs.citations = blob([c.entry]);
    h.blobs.refcheck_cache = blob(c.check ? rcOf(c.entry, c.check) : {});
    h.blobs.retraction_cache = blob(c.retr && c.entry.doi ? { [c.entry.doi.toLowerCase()]: c.retr } : {});
    mount();
    await settle();
    const st = tid("source-status")!;
    expect(st.textContent).toBe(c.text);
    expect(st.getAttribute("data-status")).toBe(c.status);
    // Not colour alone: the word, and an icon beside it.
    expect(st.querySelector("svg")).not.toBeNull();
  });

  it("the five words are the brief's, exactly", () => {
    expect([E.cit_status_checked, E.cit_status_fix, E.cit_status_year, E.cit_status_retracted, E.cit_status_unchecked]).toEqual(
      ["Checked", "Needs a fix", "Year differs from Crossref", "Retracted", "Not checked yet"]);
  });
});

describe("each source's use in the student's documents", () => {
  it("sourceUse: none, once in a document, n times", () => {
    expect(sourceUse([])).toEqual({ kind: "none" });
    expect(sourceUse([{ id: "d1", title: "Review", n: 1 }])).toEqual({ kind: "once", doc: { id: "d1", title: "Review", n: 1 } });
    // More than one mention: the count and the documents it is in, each with its own count (v1 citRender 7851-7854).
    expect(sourceUse([{ id: "d1", title: "Review", n: 2 }])).toEqual({ kind: "many", n: 2, docs: [{ id: "d1", title: "Review", n: 2 }] });
    expect(sourceUse([{ id: "d1", title: "Review", n: 1 }, { id: "d2", title: "Draft", n: 1 }])).toEqual({
      kind: "many", n: 2, docs: [{ id: "d1", title: "Review", n: 1 }, { id: "d2", title: "Draft", n: 1 }]
    });
  });

  it("Not cited yet, Cited once in {document}, Cited {n} times; the document's name opens it", async () => {
    h.blobs.citations = blob([COHEN, PUTWAIN, SCHAEFER]);
    h.documents = [{ id: "d1", title: "My first document", titleKeyVersion: 0, deks: [], updatedAt: "1" }, { id: "d2", title: "Draft", titleKeyVersion: 0, deks: [], updatedAt: "1" }];
    h.stored = {
      d1: { bodyHtml: "sealed:<p>As Putwain (2008) says, and again (Putwain, 2008).</p>", keyVersion: 1 },
      d2: { bodyHtml: "<p>Once only: (Schaefer et al., 2019).</p>", keyVersion: 0 }
    };
    h.currentDoc = { id: "d2" };
    mount();
    await settle(20);
    const use = rows().map((r) => r.querySelector('[data-testid="source-use"]')!.textContent);
    expect(use).toEqual(["Not cited yet", "Cited 2 times: My first document (2×)", "Cited once in Draft"]);
    const link = rows()[2]!.querySelector<HTMLElement>('[data-testid="source-use"] a, [data-testid="source-use"] button')!;
    expect(link.textContent).toBe("Draft");
    await click(link);
    expect(h.selectDoc).toHaveBeenCalledWith("d2");
  });

  it("a source cited more than once names its documents, each a link that opens it, with a count where a document has it more than once (v1's \"Cited in: A (2x), B\")", async () => {
    h.blobs.citations = blob([PUTWAIN, COHEN]);
    h.documents = ["d1", "d2", "d3"].map((id, i) => ({ id, title: ["My first document", "Draft", "Notes"][i]!, titleKeyVersion: 0, deks: [], updatedAt: "1" }));
    h.stored = {
      d1: { bodyHtml: "sealed:<p>As Putwain (2008) says, and again (Putwain, 2008).</p>", keyVersion: 1 },
      d2: { bodyHtml: "<p>Once more (Putwain, 2008), and Cohen (1988).</p>", keyVersion: 0 },
      d3: { bodyHtml: "<p>Nothing cited here.</p>", keyVersion: 0 }
    };
    h.currentDoc = { id: "d3" };
    mount();
    await settle(20);
    const useOf = (i: number) => rows()[i]!.querySelector<HTMLElement>('[data-testid="source-use"]')!;
    // The plan's "Cited {n} times" first, then the documents in the project's order; the count only where a document has more than one.
    expect(useOf(0).textContent).toBe("Cited 3 times: My first document (2×), Draft");
    expect(useOf(1).textContent).toBe("Cited once in Draft");
    const links = [...useOf(0).querySelectorAll<HTMLElement>("button")];
    expect(links.map((l) => l.textContent)).toEqual(["My first document", "Draft"]);
    await click(links[1]!);
    expect(h.selectDoc).toHaveBeenLastCalledWith("d2");
    await click(links[0]!);
    expect(h.selectDoc).toHaveBeenLastCalledWith("d1");
  });
});

describe("the heading and the line under it", () => {
  it("cit_head: {n} sources, {c} cited in your document (the open document is read live)", async () => {
    h.documents = [{ id: "d1", title: "My first document", titleKeyVersion: 0, deks: [], updatedAt: "1" }];
    h.currentDoc = { id: "d1" };
    editorWith("<p>Open-label placebos work (Schaefer et al., 2019).</p>");
    mount();
    await settle(20);
    expect(tid("cit-head")!.textContent).toBe("4 sources, 1 cited in your document");
    expect(tid("cit-head")!.textContent).toBe(t("cit_head", { n: 4, c: 1 }));
  });

  it("one source reads \"1 source\"; an empty library says so and still counts 0", async () => {
    h.blobs.citations = blob([COHEN]);
    mount();
    await settle();
    expect(tid("cit-head")!.textContent).toBe("1 source, 0 cited in your document");
    unmountAll();
    h.blobs.citations = blob([]);
    mount();
    await settle();
    expect(tid("cit-head")!.textContent).toBe("0 sources, 0 cited in your document");
    expect(tid("cite-lib")!.textContent).toBe(E.cit_empty);
  });

  it("while the saved library is read there is no count and no \"no sources\"; a locked one says so and shows no count", async () => {
    h.blobs.citations = { ...blob(null), loading: true };
    const root = mount();
    expect(tid("cite-lib")!.querySelector('[data-testid="panel-loading"]')!.textContent).toBe(E.blob_loading);
    expect(tid("cit-head")).toBeNull();
    expect(document.body.textContent).not.toContain("0 sources");
    expect(tid("cite-lib")!.textContent).not.toContain(E.cit_empty);
    h.blobs.citations = blob([COHEN, PUTWAIN]);
    act(() => { root.render(<CitationsTab />); });
    await settle();
    expect($('[data-testid="panel-loading"]')).toBeNull();
    expect(tid("cit-head")!.textContent).toBe("2 sources, 0 cited in your document");
    unmountAll();
    h.blobs.citations = { ...blob(null), locked: true };
    mount();
    expect(tid("cite-locked")!.textContent).toBe(E.vault_cite_locked);
    expect(tid("cit-head")).toBeNull();
    expect($('[data-testid="panel-loading"]')).toBeNull();
  });

  it("after a retraction check that flagged nothing: the brief's sentence, with the day it was checked", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    h.blobs.retraction_cache = blob({
      "10.1016/j.bbi.2011.07.229": { r: false, t: NOW }, "10.4324/9780203771587": { r: false, t: NOW - 2 * DAY }, "10.1038/s41598-019-49466-6": { r: false, t: NOW - 2 * DAY }
    });
    mount();
    await settle();
    expect(tid("cit-checked")!.textContent).toBe("Checked today against Crossref and OpenAlex. No retractions found; that does not prove a paper is sound.");
    unmountAll();
    // Another day: the date of the latest answer, written out.
    vi.setSystemTime(NOW + 3 * DAY);
    mount();
    await settle();
    const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(NOW));
    expect(tid("cit-checked")!.textContent).toBe(`Checked ${day} against Crossref and OpenAlex. No retractions found; that does not prove a paper is sound.`);
    expect(tid("cit-checked")!.textContent).toBe(t("cit_checked_line", { date: day }));
  });

  it("nothing checked: no line; a flagged paper: the count of flags instead of the all-clear", async () => {
    mount();
    await settle();
    expect(tid("cit-checked")).toBeNull();
    unmountAll();
    h.blobs.retraction_cache = blob({ "10.4324/9780203771587": { r: true, t: Date.now() }, "10.1038/s41598-019-49466-6": { r: false, t: Date.now() } });
    mount();
    await settle();
    // Two answers stored, one flagged; Putwain has no DOI to check.
    expect(tid("cit-checked")!.textContent).toBe(t("retr_summary_fmt", { c: 2, r: 1, n: 1 }));
    expect(tid("cit-checked")!.textContent).not.toContain("No retractions found");
    expect(rows().map((r) => r.querySelector('[data-testid="source-status"]')!.getAttribute("data-status"))).toEqual(["unchecked", "retracted", "unchecked", "unchecked"]);
  });

  it("numbered style: the numbers cited in the open document with no source are listed (num_missing_fmt)", async () => {
    h.documents = [{ id: "d1", title: "Review", titleKeyVersion: 0, deks: [], updatedAt: "1" }];
    h.currentDoc = { id: "d1" };
    editorWith("<p>As shown [1], [6,7] and <sup>3</sup>.</p>");
    mount();
    const style = document.getElementById("citStyle") as HTMLSelectElement;
    act(() => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(style, "vancouver"); style.dispatchEvent(new Event("change", { bubbles: true })); });
    await settle(10);
    expect(tid("cite-num-missing")!.textContent).toBe(t("num_missing_fmt", { n: "[6], [7]" }));
  });
});

describe("a source row", () => {
  it("the reference in the chosen style, then the status and the use; the style follows the select above the list", async () => {
    h.blobs.citations = blob([COHEN, SCHAEFER]);
    mount();
    expect(rows()).toHaveLength(2);
    expect(rows()[0]!.querySelector('[data-testid="source-ref"]')!.innerHTML).toBe(sanitizeHtml(citFmt(COHEN, 1, "apa").refHTML));
    expect(rows()[1]!.querySelector('[data-testid="source-ref"]')!.textContent).toContain("Schaefer, M., Denke, C., Harke, R., Olk, N., Erkovan, M., & Enge, S. (2019).");
    const parts = ["source-ref", "source-status", "source-use"].map((x) => rows()[0]!.querySelector(`[data-testid="${x}"]`)!);
    for (let i = 1; i < parts.length; i++) expect(parts[i - 1]!.compareDocumentPosition(parts[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const style = document.getElementById("citStyle") as HTMLSelectElement;
    expect(document.querySelector("label[for=citStyle]")!.textContent).toBe("Style");
    // The select sits above the list.
    expect(style.compareDocumentPosition(tid("cite-lib")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    act(() => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(style, "vancouver"); style.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(rows()[1]!.querySelector('[data-testid="source-ref"]')!.innerHTML).toBe(sanitizeHtml(citFmt(SCHAEFER, 2, "vancouver").refHTML));
  });

  it("it leaves a slot for the problem sentence and its fix, in every row", () => {
    mount();
    for (const r of rows()) expect(r.querySelector('[data-cite-slot="cite-attention"]')).not.toBeNull();
  });

  it("the row the caret chip points at is lit, by index, and comes into view", async () => {
    const scrolled = vi.fn();
    (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = scrolled;
    try {
      mount();
      expect(rows().map((r) => r.classList.contains("cit-active"))).toEqual([false, false, false, false]);
      expect(rows().map((r) => r.getAttribute("data-cite-index"))).toEqual(["0", "1", "2", "3"]);
      await act(async () => { setCiteActive(2, true); });
      expect(rows().map((r) => r.classList.contains("cit-active"))).toEqual([false, false, true, false]);
      expect(scrolled).toHaveBeenLastCalledWith({ block: "center", behavior: "smooth" });
      await act(async () => { setCiteActive(1, false); });
      expect(scrolled).toHaveBeenLastCalledWith({ block: "nearest", behavior: "smooth" });
    } finally { delete (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView; }
  });
});

describe("a source's More menu (ruling B2-R28)", () => {
  it("holds Insert citation and Remove; the trigger names its source", async () => {
    h.blobs.citations = blob([COHEN, SCHAEFER]);
    mount();
    const more = rows()[0]!.querySelector('[data-testid="source-more"]')!;
    expect(more.textContent).toContain("More");
    expect(more.getAttribute("aria-label")).toBe(t("cit_more_aria", { source: "Cohen, 1988" }));
    expect(more.getAttribute("aria-haspopup")).toBe("menu");
    expect(menuItems()).toEqual([]);
    await openMore(rows()[0]!);
    expect(menuItems().map((m) => m.textContent)).toEqual(["Insert citation (Cohen, 1988)", "Remove from my library"]);
  });

  it("Insert citation puts the in-text form at the cursor, and says so", async () => {
    const e = editorWith("<p>Seven.</p>");
    e.view.dom.dispatchEvent(new FocusEvent("focus"));
    e.commands.setTextSelection(e.state.doc.content.size - 1);
    h.blobs.citations = blob([COHEN, SCHAEFER]);
    mount();
    await openMore(rows()[1]!);
    await click(menuItems()[0]!);
    expect(e.getHTML()).toBe("<p>Seven. (Schaefer et al., 2019)</p>");
    expect(toasts()).toEqual(["Citation inserted ✓"]);
  });

  it("with no document open the insert opens it first; when it does not open no success is claimed", async () => {
    h.blobs.citations = blob([COHEN]);
    mount();
    await openMore(rows()[0]!);
    await click(menuItems()[0]!);
    expect(toasts()).toEqual([]);
    h.openEditor = () => editorWith("<p>Opened.</p>");
    await openMore(rows()[0]!);
    await click(menuItems()[0]!);
    expect(h.opened).toBe(1);
    expect(toasts()).toEqual(["Citation inserted ✓"]);
  });

  it("Remove takes that source out, as an update that replays onto a newer library, and puts the light out", async () => {
    h.blobs.citations = blob([COHEN, SCHAEFER]);
    mount();
    await act(async () => { setCiteActive(1, false); });
    await openMore(rows()[1]!);
    await click(menuItems()[1]!);
    const b = h.blobs.citations!;
    expect(b.set).toHaveBeenCalledTimes(1);
    expect(noPids(applied(b, [COHEN, SCHAEFER]) as CitationEntry[])).toEqual([COHEN]);
    // Another window removed the first source meanwhile: this one still goes, and no other.
    expect(applied(b, [SCHAEFER])).toEqual([]);
    expect(applied(b, null)).toEqual([]);
    expect(rows().some((r) => r.classList.contains("cit-active"))).toBe(false);
  });
});

describe("In your document", () => {
  it("the heading, Insert reference list and the sentence about citing while writing", () => {
    mount();
    const aside = tid("cit-doc")!;
    expect(aside.querySelector("h2")!.textContent).toBe("In your document");
    expect(tid("cite-insertbib")!.textContent).toBe("Insert reference list");
    expect(aside.contains(tid("cite-insertbib"))).toBe(true);
    expect(tid("cit-cite-hint")!.textContent).toBe("To cite while writing, select text in the document and choose Cite. Your library is the same everywhere.");
  });

  it("Insert reference list with the document closed opens it and inserts every author and 13317 (wave A LATER T19)", async () => {
    h.blobs.citations = blob([SCHAEFER]);
    h.openEditor = () => editorWith("<p>Mine.</p>");
    mount();
    expect(h.editor).toBeNull();
    await click(tid("cite-insertbib")!);
    expect(h.opened).toBe(1);
    const e = h.editor as Editor;
    const html = e.getHTML();
    expect(html.match(/class="ref-item"/g)).toHaveLength(1);
    const text = e.getText();
    for (const a of ["Schaefer, M.", "Denke, C.", "Harke, R.", "Olk, N.", "Erkovan, M.", "& Enge, S."]) expect(text, a).toContain(a);
    expect(text).toContain("13317");
    expect(text).toContain("Scientific Reports, 9, 13317");
    expect(text.split("13317")).toHaveLength(2);
    expect(toasts()).toEqual([E.cite_bib_fmt]);
  });

  it("with an empty library there is nothing to insert (v1's sentence)", async () => {
    h.blobs.citations = blob([]);
    h.openEditor = () => editorWith("<p>Mine.</p>");
    mount();
    await click(tid("cite-insertbib")!);
    expect(h.opened).toBe(0);
    expect(toasts()).toEqual(["Library is empty — add a source first"]);
  });
});

describe("Check again", () => {
  const openAlex = () => vi.fn(async (input: RequestInfo | URL) => {
    const dois = (decodeURIComponent(String(input)).match(/filter=doi:(.*)&per-page/)?.[1] ?? "").split("|").map((u) => u.replace("https://doi.org/", ""));
    return new Response(JSON.stringify({ results: dois.map((d) => ({ doi: "https://doi.org/" + d, is_retracted: false })) }), { status: 200, headers: { "content-type": "application/json" } });
  });

  it("three buttons, in the brief's words", () => {
    mount();
    const aside = tid("cit-check")!;
    expect(aside.querySelector("h2")!.textContent).toBe("Check again");
    expect([tid("cite-retract-btn"), tid("cite-rc-btn"), tid("cite-cc-btn")].map((b) => b!.textContent)).toEqual(
      ["Check for retractions", "Check details against Crossref", "Cross-check citations in my document"]);
    for (const b of [tid("cite-retract-btn"), tid("cite-rc-btn"), tid("cite-cc-btn")]) expect(aside.contains(b)).toBe(true);
  });

  it("Check for retractions asks OpenAlex for every DOI and stores the answers", async () => {
    const f = openAlex();
    vi.stubGlobal("fetch", f);
    mount();
    await settle();
    f.mockClear();
    await click(tid("cite-retract-btn")!);
    expect(f).toHaveBeenCalledTimes(1);
    // A finished check says nothing: the rows and the attention list change (Task 24).
    expect(toasts()).toEqual([]);
    const stored = applied(h.blobs.retraction_cache!, {}) as Record<string, { r: boolean }>;
    expect(Object.keys(stored).sort()).toEqual(["10.1016/j.bbi.2011.07.229", "10.1038/s41598-019-49466-6", "10.4324/9780203771587"]);
  });

  it("Check details against Crossref looks every source up again and keeps each answer under its citKey", async () => {
    const f = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    vi.stubGlobal("fetch", f);
    h.blobs.citations = blob([PUTWAIN]);
    mount();
    await settle();
    await click(tid("cite-rc-btn")!);
    await settle(250);
    // The check that reached nothing keeps v1's error toast.
    expect(toasts()).toEqual([E.rc_busy, E.rc_fail]);
    expect(Object.keys(applied(h.blobs.refcheck_cache!, {}) as object)).toEqual([citKey(PUTWAIN)]);
  });

  it("Cross-check citations in my document is off until a document is open, and says so; then it opens the dialog", async () => {
    mount();
    expect((tid("cite-cc-btn") as HTMLButtonElement).disabled).toBe(true);
    expect(tid("cit-cc-hint")!.textContent).toBe(E.cit_cc_hint);
    expect(tid("cite-cc-btn")!.getAttribute("aria-describedby")).toBe(tid("cit-cc-hint")!.id);
    unmountAll();
    editorWith("<p>As Cohen (1988) said, (Putwain, 2008).</p>");
    mount();
    expect((tid("cite-cc-btn") as HTMLButtonElement).disabled).toBe(false);
    expect(tid("cit-cc-hint")).toBeNull();
    await click(tid("cite-cc-btn")!);
    expect(tid("cc-dialog")).not.toBeNull();
  });
});

describe("Needs your attention in a row (Task 24, register row D-S2-130): the items that name the paper, with their fixes", () => {
  const TITLE = "Sleep timing and attention in adolescents", DOI = "10.1038/s41598-024-0001-x";
  const AUTHORS = "Schaefer, Ellen M.; Gonzalez, Carlos B.; Lee, Kim";
  const AUTHORLESS: StoredEntry = { pid: "kauth", author: "", year: "2019", title: TITLE, doi: DOI, volume: "12" };
  const SHORT = "2019: sleep timing and attention";
  const answer = (over: Partial<RcCheck> = {}): RcCheck => ({
    s: "diff", m: [{ k: "author", v: "Schaefer" }], miss: ["author", "issue", "pages"],
    f: { title: TITLE, year: 2019, author: "Schaefer", doi: DOI, authors: AUTHORS, volume: "9", issue: "1", pages: "13317" }, t: 1, ...over
  });
  const stubConfirm = (yes: boolean) => vi.spyOn(window, "confirm").mockReturnValue(yes);
  const slotOf = (i = 0) => rows()[i]!.querySelector('[data-cite-slot="cite-attention"]')!;
  const says = (i = 0) => [...slotOf(i).querySelectorAll('[data-testid="attention-text"]')].map((x) => x.textContent);

  it("the row says what is wrong with its paper and offers the fix; a source that is not missing anything has none", async () => {
    h.blobs.citations = blob([AUTHORLESS, { ...PUTWAIN, pid: "kputwain" }]);
    h.blobs.refcheck_cache = blob({ ...rcOf(AUTHORLESS, answer()), ...rcOf(PUTWAIN, ok()) });
    mount();
    await settle();
    expect(says(0)).toEqual([
      t("attn_noauthors_crossref", { short: SHORT, names: "Schaefer, Gonzalez and Lee" }),
      t("attn_missing_row", { short: SHORT, fields: "issue and pages" })
    ]);
    expect([...slotOf(0).querySelectorAll('[data-testid="attention-fix"]')].map((b) => b.textContent)).toEqual(["Use Crossref details", "Use Crossref details"]);
    expect(says(1)).toEqual([]);
    expect(rows()[1]!.querySelector('[data-testid="attention-fix"]')).toBeNull();
    expect(slotOf(1).textContent).toBe("");
  });

  it("Use Crossref details fills only empty fields and the source then reads Checked", async () => {
    const confirm = stubConfirm(true);
    const cache = rcOf(AUTHORLESS, answer());
    h.blobs.citations = blob([AUTHORLESS, COHEN]);
    h.blobs.refcheck_cache = blob(cache);
    mount();
    await settle();
    expect(rows()[0]!.querySelector('[data-testid="source-status"]')!.textContent).toBe("Needs a fix");
    await click(tid("attention-fix")!);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0]![0]).toBe(t("rc_fill_confirm", { list: "Author: " + AUTHORS + "\nIssue: 1\nPages: 13317" }));
    const lib = applied(h.blobs.citations!, [AUTHORLESS, COHEN]) as CitationEntry[];
    expect(noPids(lib)).toEqual([{ ...noPids([AUTHORLESS])[0], author: AUTHORS, issue: "1", pages: "13317" }, COHEN]);
    // The volume the student wrote is kept, not Crossref's.
    expect(lib[0]!.volume).toBe("12");
    // The fix says it in a toast (what it does to the document's citations), and the finished fix is the item leaving.
    expect(toasts()).toEqual([E.rc_filled]);
    // The answer moved with the source (its key holds the surname): the tab, remounted over what was written, reads Checked and lists nothing.
    const next = applied(h.blobs.refcheck_cache!, cache) as Record<string, RcCheck>;
    expect(Object.keys(next)).toEqual([citKey(lib[0]!)]);
    unmountAll();
    h.blobs.citations = blob(lib);
    h.blobs.refcheck_cache = blob(next);
    mount();
    await settle();
    expect(rows()[0]!.querySelector('[data-testid="source-status"]')!.textContent).toBe("Checked");
    expect(tid("attention-fix")).toBeNull();
    expect(slotOf(0).textContent).toBe("");
  });

  it("Cancel changes nothing; a window that cannot write the check cache shows the items without the buttons", async () => {
    const confirm = stubConfirm(false);
    h.blobs.citations = blob([AUTHORLESS]);
    h.blobs.refcheck_cache = blob(rcOf(AUTHORLESS, answer()));
    mount();
    await settle();
    await click(tid("attention-fix")!);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(h.blobs.citations.set).not.toHaveBeenCalled();
    expect(h.blobs.refcheck_cache.set).not.toHaveBeenCalled();
    // The button is free again after a "no".
    expect((tid("attention-fix") as HTMLButtonElement).disabled).toBe(false);
    unmountAll();
    h.blobs.refcheck_cache = { ...blob(rcOf(AUTHORLESS, answer())), readOnly: true };
    mount();
    await settle();
    expect(says(0)).toHaveLength(2);
    expect(tid("attention-fix")).toBeNull();
  });

  it("a Retracted source says why, in the same slot, in the danger colours, and has no fix", async () => {
    h.blobs.citations = blob([{ ...SCHAEFER, pid: "kschaefer" }]);
    h.blobs.refcheck_cache = blob(rcOf(SCHAEFER, ok()));
    h.blobs.retraction_cache = blob({ "10.1038/s41598-019-49466-6": { r: true, t: NOW } });
    mount();
    await settle();
    expect(says(0)).toEqual([t("attn_retracted", { short: "Schaefer et al., 2019: open-label placebos reduce test" })]);
    expect(slotOf(0).querySelector(".attn-item-retracted")).not.toBeNull();
    expect(tid("attention-fix")).toBeNull();
  });

  it("a year that differs from Crossref: Keep 1988 keeps it, writes the kind into the entry's ack, and the row reads Checked again", async () => {
    const cohen: StoredEntry = { ...COHEN, pid: "kcohen" };
    h.blobs.citations = blob([cohen]);
    h.blobs.refcheck_cache = blob(rcOf(cohen, { s: "diff", m: [{ k: "year", v: "2013" }], f: { title: "x", year: 2013, author: "Cohen", doi: "10.4324/9780203771587" }, t: 1 }));
    mount();
    await settle();
    expect(rows()[0]!.querySelector('[data-testid="source-status"]')!.textContent).toBe("Year differs from Crossref");
    expect(says(0)).toEqual([t("attn_differs_year", { short: "Cohen, 1988: statistical power analysis for", value: "2013" })]);
    expect(tid("attention-fix")!.textContent).toBe("Keep 1988");
    await click(tid("attention-fix")!);
    const lib = applied(h.blobs.citations!, [cohen]) as StoredEntry[];
    expect(lib).toEqual([{ ...cohen, ack: ["year"] }]);
    expect(h.blobs.citations.flush).toHaveBeenCalled();
    // Remounted over what was written: nothing to attend to, and the status no longer holds it against the source.
    unmountAll();
    h.blobs.citations = blob(lib);
    mount();
    await settle();
    expect(rows()[0]!.querySelector('[data-testid="source-status"]')!.textContent).toBe("Checked");
    expect(slotOf(0).textContent).toBe("");
  });
});

describe("DOI found after a title search (v1 rcLine 7794: \"Found in Crossref and the details match. DOI found: 10...\")", () => {
  const FOUND = "10.1111/found.2008.1";
  const byTitle = (over: Partial<RcCheck> = {}): RcCheck => ({ s: "ok", m: [], f: { title: "x", year: 2008, author: "Putwain", doi: FOUND }, viaTitle: true, t: 1, ...over });
  const problemOf = (i = 0) => rows()[i]!.querySelector('[data-cite-slot="cite-attention"]')!;

  it("a source with no DOI that Crossref matched by its title reads Checked and shows the DOI that was found", async () => {
    h.blobs.citations = blob([PUTWAIN]);
    h.blobs.refcheck_cache = blob(rcOf(PUTWAIN, byTitle()));
    mount();
    await settle();
    expect(rows()[0]!.querySelector('[data-testid="source-status"]')!.textContent).toBe("Checked");
    expect(tid("cite-rc-doi")!.textContent).toBe(`${E.rc_doi_found} ${FOUND}`);
    expect(E.rc_doi_found).toBe("DOI found:");
    expect(problemOf().contains(tid("cite-rc-doi"))).toBe(true);
    // It is information, not a problem: no fix button, and the warning words are not used.
    expect(tid("source-fix")).toBeNull();
    expect(problemOf().textContent).not.toContain(E.rc_doi_missing);
  });

  it("only for a match by title: a match by DOI, or a title match that found no DOI, says nothing more", async () => {
    h.blobs.citations = blob([PUTWAIN, COHEN]);
    h.blobs.refcheck_cache = blob({ ...rcOf(PUTWAIN, byTitle({ viaTitle: undefined })), ...rcOf(COHEN, byTitle({ f: { title: "x", year: 1988, author: "Cohen", doi: "" } })) });
    mount();
    await settle();
    expect(rows().map((r) => r.querySelector('[data-testid="source-status"]')!.textContent)).toEqual(["Checked", "Checked"]);
    expect(tid("cite-rc-doi")).toBeNull();
    expect(problemOf(0).textContent).toBe("");
    expect(problemOf(1).textContent).toBe("");
  });
});

describe("a library that could not be read is not an empty library", () => {
  const unread = ["cite-insertbib", "cite-retract-btn", "cite-rc-btn"];
  const off = (id: string) => (tid(id) as HTMLButtonElement).disabled;

  it("a failed read says so: no count, no \"No sources yet\", and Insert reference list, Check for retractions and Check details are off", async () => {
    h.blobs.citations = { ...blob(null), error: true };
    mount();
    await settle();
    expect(tid("cit-library-error")!.textContent).toBe(E.cit_library_error);
    expect(tid("cit-head")).toBeNull();
    expect(document.body.textContent).not.toContain("0 sources");
    expect(tid("cite-lib")!.textContent).not.toContain(E.cit_empty);
    expect(tid("cite-broken")).toBeNull();
    for (const id of unread) expect(off(id), id).toBe(true);
    // Each says why it is off, by the line that tells the student.
    for (const id of unread) expect(tid(id)!.getAttribute("aria-describedby"), id).toBe(tid("cit-library-error")!.id);
    // Nothing it would have done was done.
    await click(tid("cite-insertbib")!);
    await click(tid("cite-retract-btn")!);
    await click(tid("cite-rc-btn")!);
    expect(toasts()).toEqual([]);
  });

  it("a broken blob says what it said before, and the same three buttons are off", async () => {
    h.blobs.citations = { ...blob(null), broken: true };
    mount();
    await settle();
    expect(tid("cite-broken")!.textContent).toBe(E.vault_cite_broken);
    expect(tid("cit-library-error")).toBeNull();
    expect(tid("cit-head")).toBeNull();
    expect(document.body.textContent).not.toContain("0 sources");
    expect(tid("cite-lib")!.textContent).not.toContain(E.cit_empty);
    for (const id of unread) expect(off(id), id).toBe(true);
    for (const id of unread) expect(tid(id)!.getAttribute("aria-describedby"), id).toBe(tid("cite-broken")!.id);
  });

  it("what the student has put in meanwhile is still shown, but never counted as the whole library", async () => {
    h.blobs.citations = { ...blob([COHEN]), error: true };
    mount();
    await settle();
    expect(rows()).toHaveLength(1);
    expect(tid("cit-head")).toBeNull();
    expect(tid("cit-library-error")).not.toBeNull();
    for (const id of unread) expect(off(id), id).toBe(true);
  });

  it("while it is read and while it is locked the three buttons are off too, and once it is read they are on (an empty library then really is empty)", async () => {
    h.blobs.citations = { ...blob(null), loading: true };
    mount();
    for (const id of unread) expect(off(id), id).toBe(true);
    unmountAll();
    h.blobs.citations = { ...blob(null), locked: true };
    mount();
    for (const id of unread) expect(off(id), id).toBe(true);
    unmountAll();
    h.blobs.citations = blob([]);
    mount();
    await settle();
    expect(tid("cit-head")!.textContent).toBe("0 sources, 0 cited in your document");
    expect(tid("cit-library-error")).toBeNull();
    for (const id of unread) expect(off(id), id).toBe(false);
  });

  it("the sentence is in both languages", () => {
    const hi = JSON.parse(readFileSync(join(__dirname, "../messages/hi.json"), "utf8")) as Record<string, string>;
    expect(E.cit_library_error).toBe("Your sources could not be reached. Check your connection, then reload this page.");
    expect(hi.cit_library_error).toBeTruthy();
    expect(hi.cit_library_error).not.toBe(E.cit_library_error);
  });
});

describe("the cross-check hint in a pop-out", () => {
  afterEach(() => { window.history.replaceState(null, "", "/"); });

  it("the document is not in a pop-out, so the hint says to open it in the main window; in the main window it keeps saying open your document", async () => {
    window.history.replaceState(null, "", "/p/p1/lit/citations?window=1");
    mount();
    await settle();
    const hint = tid("cit-cc-hint")!;
    expect(hint.textContent).toBe(E.cit_cc_hint_window);
    expect(E.cit_cc_hint_window).toBe("Open the document in the main window first, then cross-check it there.");
    expect(hint.textContent).not.toBe(E.cit_cc_hint);
    expect((tid("cite-cc-btn") as HTMLButtonElement).disabled).toBe(true);
    expect(tid("cite-cc-btn")!.getAttribute("aria-describedby")).toBe(hint.id);
    unmountAll();
    window.history.replaceState(null, "", "/p/p1/lit/citations");
    mount();
    await settle();
    expect(tid("cit-cc-hint")!.textContent).toBe(E.cit_cc_hint);
  });
});

describe("Add a source by hand, and More", () => {
  it("Add a source by hand is a <details> (closed) holding the form and the quote box; the form's style select is the tab's", () => {
    mount();
    const d = tid("cit-hand") as HTMLDetailsElement;
    expect(d.tagName).toBe("DETAILS");
    expect(d.open).toBe(false);
    expect(d.querySelector("summary")!.textContent).toBe("Add a source by hand");
    for (const x of ["cite-lookup", "cite-insert", "cite-add", "cite-clear", "cite-quote", "cite-insertquote"]) expect(d.contains(tid(x)), x).toBe(true);
    expect(document.querySelectorAll("#citStyle")).toHaveLength(1);
    expect(d.contains(document.getElementById("citStyle"))).toBe(false);
    expect(d.contains(document.getElementById("citAuthor"))).toBe(true);
  });

  it("More is a <details> (closed) with Import a library file and Add the classic psychology sources; the file's export is the export place's", async () => {
    mount();
    const d = tid("cit-more") as HTMLDetailsElement;
    expect(d.tagName).toBe("DETAILS");
    expect(d.open).toBe(false);
    expect(d.querySelector("summary")!.textContent).toBe("More");
    expect(tid("cite-import")!.textContent).toBe("Import a library file");
    expect(tid("cite-loadclassics")!.textContent).toBe("Add the classic psychology sources");
    expect(d.contains(tid("cite-import")) && d.contains(tid("cite-loadclassics"))).toBe(true);
    await click(tid("cite-export")!);
    expect(h.openExport).toHaveBeenCalledWith("citations");
    // There is no second place where a library file is written from here.
    expect(all("cite-export")).toHaveLength(1);
  });

  it("+ Library saves the form's entry", async () => {
    mount();
    const set = (id: string, v: string) => act(() => {
      const el = document.getElementById(id) as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    set("citAuthor", "Bandura, Albert"); set("citTitle", "Social learning theory"); set("citYear", "1977");
    await click(tid("cite-add")!);
    expect(toasts()).toEqual(["Saved to library ✓"]);
    const saved = noPids(applied(h.blobs.citations!, [COHEN]) as CitationEntry[]);
    expect(saved.map((e) => e.author)).toEqual(["Cohen, J.", "Bandura, Albert"]);
  });
});

describe("the tab's own copy and layout", () => {
  const EMOJI = /\p{Extended_Pictographic}/u;

  it("its chrome has no emoji, and every string is the dictionary's", async () => {
    h.documents = [{ id: "d1", title: "Review", titleKeyVersion: 0, deks: [], updatedAt: "1" }];
    h.stored = { d1: { bodyHtml: "<p>(Schaefer et al., 2019)</p>", keyVersion: 0 } };
    h.blobs.refcheck_cache = blob({ ...rcOf(OMEGA, { s: "diff", m: [{ k: "author", v: "Kiecolt-Glaser" }], miss: ["author"], f: CROSSREF_F, t: 1 }), ...rcOf(PUTWAIN, { s: "nf", t: 1 }) });
    h.blobs.retraction_cache = blob({ "10.1038/s41598-019-49466-6": { r: true, t: NOW } });
    mount();
    await settle(20);
    for (const id of ["cit-head", "cit-checked", "cit-doc", "cit-check", "cit-hand", "cit-more"]) {
      const el = tid(id);
      if (el) expect(EMOJI.test(el.querySelector("summary") ? el.querySelector("summary")!.textContent! : el.textContent!), id).toBe(false);
    }
    for (const r of rows()) {
      for (const x of ["source-status", "source-use", "source-more"]) expect(EMOJI.test(r.querySelector(`[data-testid="${x}"]`)!.textContent!), x).toBe(false);
      expect(EMOJI.test(r.querySelector('[data-cite-slot="cite-attention"]')!.textContent!)).toBe(false);
    }
    expect(EMOJI.test(tid("cit-doc")!.textContent! + tid("cit-check")!.textContent!)).toBe(false);
  });

  it("the stylesheet block for the tab uses colour tokens only, no fixed widths past a phone's, and a 44px target on a phone", () => {
    const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
    const start = css.indexOf("/* Citations tab (wave B Task 23)");
    const end = css.indexOf("/* end Citations tab */");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = css.slice(start, end);
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(block).not.toMatch(/\brgba?\(/);
    expect(block).toMatch(/var\(--/);
    // No width fixed in pixels: a row grows and shrinks with the screen.
    expect(block).not.toMatch(/(^|[;{\s])width:\s*\d+px/m);
    expect(block).toMatch(/min-height:\s*44px/);
  });
});
