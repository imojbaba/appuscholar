// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AP_SAMPLE, apBuild, apRefDois, buildAskPrompt, fieldLabel } from "@appuscholar/core";
import en from "../messages/en.json";
import { withPanelFixes } from "../scripts/i18n-overrides.mjs";

/*
 * Analyse a paper, part 1 (v1 741-760, apLoad and the intake 9882-9932, apAsk 10032-10047, apNumbersHTML 10106-10110, apRefCheck/apRefHTML 11221-11270, apRender 11272-11305). The expected
 * text is v1's own, read from core's golden fixture test/golden/appanel/cases.json (`golden:capture appanel`, v1 driven in jsdom on the same inputs): what the toasts said, what AP.doc held,
 * and the textContent of what apRender, apNumbersHTML and apRefHTML drew.
 */

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  callAI: vi.fn(async (..._a: unknown[]) => ""),
  oaKey: null as string | null,
  pending: null as null | { title: string; pages: string[]; src: "abstract" },
  setPending: vi.fn(),
  index: null as null | Array<{ id: string; title: string; file: string; size: number; added: string; total: number; kept: number }>,
  locked: false,
  loading: false,
  broken: false,
  error: false,
  projectId: "p-1" as string | null,
  loadPaper: vi.fn(async (_id: string) => null as null | { pages: string[]; notes: unknown[]; cells: Record<string, string> }),
  extract: vi.fn(async (_f: File) => "no-text" as unknown),
  mammoth: vi.fn(async (_o: unknown) => ({ value: "" })),
  noMammoth: false,
  /** The panel's own blobs (ap_notes, ap_cols) are still being read. */
  apLoading: false,
}));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/ai/useCallAI", () => ({ useCallAI: () => h.callAI }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1" }, settings: { field: "psychology" } }) }));
vi.mock("@/lib/research/oaKey", () => ({ useOpenAlexKey: () => h.oaKey }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ project: { id: "p-1" }, projectId: "p-1", pendingAnalyse: h.pending, setPendingAnalyse: h.setPending }) }));
vi.mock("@/lib/shelf/useShelf", () => ({ useShelf: () => ({ projectId: h.projectId, index: h.index, loading: h.loading, locked: h.locked, broken: h.broken, error: h.error, loadPaper: h.loadPaper }) }));
vi.mock("@/lib/shelf/extract", async (orig) => ({ ...(await orig<typeof import("../lib/shelf/extract")>()), extractPdfPages: (f: File) => h.extract(f) }));
vi.mock("@/lib/blobs/useProjectBlob", () => ({ useProjectBlob: () => ({ value: null, loading: h.apLoading, locked: false, set: () => {}, flush: async () => true }) }));
vi.mock("mammoth/mammoth.browser", () => ({ get default() { if (h.noMammoth) throw new Error("chunk failed"); return { extractRawText: h.mammoth }; } }));

import { AnalysePanel } from "../components/tools/analyse/AnalysePanel";
import { StubPanel } from "../components/tools/StubPanel";
import { getAp, resetAp, setAp } from "../lib/analyse/useApDoc";
import { loadPaper } from "../lib/analyse/intake";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const E = en as Record<string, string>;
const CORE_TEST = join(__dirname, "../../../packages/core/test");
type Doc = { title: string; src: string; pages: string[]; sample: boolean; abstractOnly: boolean } | null;
type Fx = {
  files: Array<{ id: string; name: string; input: { pages?: string[]; text?: string }; toasts: string[]; doc: Doc }>;
  pastes: Array<{ id: string; text: string; toasts: string[]; doc: Doc }>;
  heads: Array<{ id: string; text: string; pre: string; tabs: Array<{ text: string; disabled: boolean; title: string | null }>; refBtn: boolean }>;
  numbers: Array<{ id: string; text: string; lines: Array<{ mark: string; label: string; note: string }> }>;
  refs: Array<{ id: string; refs: unknown; busy: boolean; button: string; disabled: boolean; text: string; links: Array<{ href: string; text: string; target: string; rel: string }> }>;
  asks: Array<{ id: string; paper: string; consent: boolean; q: string; reply: string; opts: Array<Record<string, unknown>>; toasts: string[]; qDraftAfter: string; box: null | { text: string; banner: string | null; quotes: Array<{ text: string; bad: boolean }> } }>;
};
const FX = JSON.parse(readFileSync(join(CORE_TEST, "golden/appanel/cases.json"), "utf8")) as Fx;
const FETCH = JSON.parse(readFileSync(join(CORE_TEST, "golden/fetch/cases.json"), "utf8")) as { refcheck: { dois: string[]; requested: string[] } };
type Paper = { id: string; src: string; title?: string; pages?: string[]; from?: "AP_SAMPLE" };
const CORPUS = JSON.parse(readFileSync(join(CORE_TEST, "golden/analyse/papers.json"), "utf8")) as Paper[];
type Rec = { url: string; status: number; headers: Record<string, string | null>; body: string };
const REC = (name: string) => JSON.parse(readFileSync(join(CORE_TEST, "fetch/recorded", name), "utf8")) as Rec;
const SAMPLE_TITLE = AP_SAMPLE[0]!.split("\n")[0]!;
/** A paper of the fixture as the capture loaded it (analyse/papers.json, the sample by apSample, the sample three times). */
function paperOf(id: string): { title: string; pages: string[]; src: string; sample: boolean } {
  if (id === "sample@apSample") return { title: SAMPLE_TITLE, pages: [...AP_SAMPLE], src: "pdf", sample: true };
  if (id === "sample-x3") return { title: SAMPLE_TITLE + " (three times)", pages: [...AP_SAMPLE, ...AP_SAMPLE, ...AP_SAMPLE], src: "pdf", sample: false };
  const p = CORPUS.find((x) => x.id === id)!;
  return p.from === "AP_SAMPLE" ? { title: SAMPLE_TITLE, pages: [...AP_SAMPLE], src: p.src, sample: false } : { title: p.title!, pages: p.pages!, src: p.src, sample: false };
}

const roots: Root[] = [];
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => [...document.body.querySelectorAll<HTMLElement>(sel)];
const tid = (id: string) => $(`[data-testid="${id}"]`);
async function settle(ms = 0) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }
async function until(pred: () => boolean) {
  for (let i = 0; i < 300; i++) { if (pred()) return; await settle(5); }
  throw new Error("condition not reached");
}
async function mount(node: React.ReactNode = <AnalysePanel />) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(node); });
  return root;
}
async function click(el: HTMLElement | null) { await act(async () => { el!.click(); await new Promise((r) => setTimeout(r, 0)); }); }
function typeIn(el: HTMLTextAreaElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function tick(el: HTMLInputElement, on: boolean) { if (el.checked !== on) act(() => { el.click(); }); }
async function choose(file: File) {
  const input = $("#apFile") as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });
}
const toasts = () => h.toast.mock.calls.map((c) => c[0] as string);
const docRecord = (): Doc => { const d = getAp().doc; return d ? { title: d.title, src: d.src, pages: [...d.pages], sample: d.sample, abstractOnly: d.abstractOnly } : null; };
const quiet = { toast: () => {}, t: (k: string, v?: Record<string, string | number>) => (v ? E[k]!.replace(/\{(\w+)\}/g, (m, x: string) => (x in v ? String(v[x]) : m)) : E[k]!) };
const load = (id: string) => { const p = paperOf(id); act(() => { expect(loadPaper(p.title, p.pages, p.src, p.sample, quiet)).toBe(true); }); };

beforeEach(() => {
  resetAp();
  for (const f of [h.toast, h.setPending, h.loadPaper, h.extract, h.mammoth]) f.mockReset();
  h.callAI.mockReset().mockResolvedValue("");
  h.oaKey = null; h.pending = null; h.index = null; h.locked = false; h.loading = false; h.broken = false; h.error = false; h.projectId = "p-1"; h.noMammoth = false; h.apLoading = false;
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("Analyse a paper: the panel (v1 741-760)", () => {
  it("in v1's order: the heading and its sentence, the upload field, the paste box, the four buttons, the box about the paper; nothing in #apMain yet (All lectures is not built: W23)", async () => {
    await mount();
    expect($("h3")!.textContent).toBe("📄 Analyse a paper");
    expect($(".panel > .desc")!.textContent).toBe(E.ap2_give_appuscholer_a_research);
    expect(tid("ap-lectures")).toBeNull();
    expect($(".ap-lect-desc")).toBeNull();
    expect($('label[for="apFile"]')!.textContent).toBe("Upload a PDF, a Word file (.docx) or a text file");
    expect(($("#apFile") as HTMLInputElement).accept).toBe(".pdf,.docx,.txt");
    expect($('label[for="apPaste"]')!.textContent).toBe("Or paste the text of the paper");
    expect(($("#apPaste") as HTMLTextAreaElement).placeholder).toBe("Paste the paper here");
    expect([...$(".ap-row.ap-wrap")!.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Use pasted text", "Use this paper", "Try a practice paper"]);
    expect($("#apShelf")!.getAttribute("aria-label")).toBe("Paper from your Reading shelf");
    expect(tid("ap-consent")!.textContent).toBe("I am allowed to read this paper, and it is not a manuscript sent to me for confidential peer review. I understand that its text goes to my AI provider through my own key.");
    expect(($("#apOK") as HTMLInputElement).checked).toBe(false);
    expect(tid("ap-main")!.textContent).toBe("");
    const order = ["ap-file", "ap-paste", "ap-paste-btn", "ap-shelf", "ap-shelf-btn", "ap-sample-btn", "ap-consent", "ap-main"].map(tid);
    for (let i = 1; i < order.length; i++) expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the Lesson tab is not offered, not even for the practice paper (W23); the walk-through and the paper card open (Task 13)", async () => {
    await mount();
    await click(tid("ap-sample-btn"));
    expect(tid("ap-tabs")).not.toBeNull();
    expect(tid("ap-tab-lesson")).toBeNull();
    expect([...tid("ap-tabs")!.querySelectorAll("button")].map((b) => b.dataset.testid)).toEqual(["ap-tab-ask", "ap-tab-walk", "ap-tab-card"]);
    await click(tid("ap-tab-walk"));
    expect(getAp().mode).toBe("walk");
    await click(tid("ap-tab-card"));
    expect(getAp().mode).toBe("card");
    expect(toasts()).toEqual([]);
  });

  it("the stub no longer stands in for Analyse a paper: no abstract line (Task 10's placeholder is gone)", async () => {
    h.pending = { title: "Growth mindset and poverty", pages: ["x"], src: "abstract" };
    await mount(<StubPanel id="analyse" />);
    expect(tid("pending-analyse")).toBeNull();
    expect(document.body.textContent).not.toContain("Abstract kept");
  });
});

describe("Analyse a paper: the cards side by side while the saved notes open (W8)", () => {
  it("Analyse shows the loading sign, not its empty state, until its data is read (W8)", async () => {
    h.apLoading = true;
    const root = await mount();
    load("sample@apSample");
    const box = $("#apAcrossBox") as HTMLDetailsElement;
    await act(async () => { box.open = true; box.dispatchEvent(new Event("toggle")); });
    const sign = $("#apAcross")!.querySelector('[data-testid="panel-loading"]')!;
    expect(sign.textContent).toBe(E.blob_loading);
    expect(sign.getAttribute("aria-busy")).toBe("true");
    expect($("#apAcross")!.textContent).not.toContain(E.ap2_no_paper_card_yet);
    // The intake's own dropdown keeps its wording (D-S2-15).
    expect($("#apShelf")!.textContent).not.toContain(E.blob_loading);
    // The notes are read: "No paper card yet…" (nothing is stored) replaces the sign.
    h.apLoading = false;
    await act(async () => { root.render(<AnalysePanel />); });
    expect($('[data-testid="panel-loading"]')).toBeNull();
    expect($("#apAcross")!.textContent).toContain(E.ap2_no_paper_card_yet);
  });
});

describe("Analyse a paper: the intake (apFromFile, apFromPaste, apFromShelf, apSample, apLoad)", () => {
  it.each(FX.files.map((f) => [f.id, f] as const))("a file, %s: v1's toasts and v1's AP.doc", async (_id, c) => {
    const pages = c.input.pages, text = c.input.text ?? "";
    if (c.id === "pdf-error") h.extract.mockRejectedValue(new Error("Invalid PDF structure."));
    else if (pages) h.extract.mockResolvedValue({ pages, total: pages.length });
    if (c.id === "docx-no-reader") h.noMammoth = true;
    h.mammoth.mockResolvedValue({ value: text });
    await mount();
    await choose(new File([text], c.name));
    await settle();
    expect(toasts()).toEqual(c.toasts);
    expect(docRecord()).toEqual(c.doc);
    expect(($("#apFile") as HTMLInputElement).value).toBe("");
    if (c.doc && c.name.toLowerCase().endsWith(".docx")) expect(h.mammoth.mock.calls[0]![0]).toHaveProperty("arrayBuffer");
  });

  it("a scanned PDF (Task 11's extractor finds no text): v1's sentence, nothing loaded", async () => {
    h.extract.mockResolvedValue("no-text");
    await mount();
    await choose(new File(["%PDF"], "scan.pdf"));
    await settle();
    expect(toasts()).toEqual(["Reading scan.pdf…", "This file has too little readable text. A scanned PDF has no text layer; paste the text instead."]);
    expect(getAp().doc).toBeNull();
  });

  it.each(FX.pastes.map((p) => [p.id, p] as const))("pasted text, %s: v1's toasts and AP.doc", async (_id, c) => {
    await mount();
    typeIn($("#apPaste") as HTMLTextAreaElement, c.text);
    await click(tid("ap-paste-btn"));
    expect(toasts()).toEqual(c.toasts);
    expect(docRecord()).toEqual(c.doc);
  });

  it("Try a practice paper loads v1's sample with no tick, marked as the sample", async () => {
    await mount();
    await click(tid("ap-sample-btn"));
    expect(docRecord()).toEqual({ title: SAMPLE_TITLE, src: "pdf", pages: [...AP_SAMPLE], sample: true, abstractOnly: false });
    expect(getAp().doc!.id).toBe(apBuild(SAMPLE_TITLE, [...AP_SAMPLE], "pdf").id);
    expect(toasts()).toEqual([]);
  });

  it("the Reading shelf: v1's first line (empty, or choose), one line per paper, the paper's text read once and loaded as a PDF under its title", async () => {
    // useShelf after a read that found no shelf_index blob (a project with no paper yet: index null, nothing loading, locked or broken), then after a read of an empty index.
    for (const index of [null, []]) {
      h.index = index;
      const r = await mount();
      expect([...$("#apShelf")!.querySelectorAll("option")].map((o) => o.textContent)).toEqual(["Your Reading shelf is empty"]);
      expect(tid("ap-shelf-locked")).toBeNull();
      expect(tid("ap-shelf-broken")).toBeNull();
      act(() => r.unmount()); roots.length = 0; document.body.innerHTML = "";
    }
    h.index = null;
    await mount();
    await click(tid("ap-shelf-btn"));
    expect(toasts()).toEqual(["Choose a paper first"]);
    act(() => { for (const x of roots.splice(0)) x.unmount(); }); document.body.innerHTML = "";
    const p = paperOf("pdf-wrapped-lines");
    h.index = [{ id: "sh1", title: "", file: "reading.pdf", size: 10, added: "2026-10-01", total: 2, kept: 2 }, { id: "sh2", title: p.title, file: "vocab.pdf", size: 10, added: "2026-10-02", total: 2, kept: 2 }];
    h.loadPaper.mockResolvedValue({ pages: p.pages, notes: [], cells: {} });
    await mount();
    const sel = $("#apShelf") as HTMLSelectElement;
    expect([...sel.querySelectorAll("option")].map((o) => o.textContent)).toEqual(["Choose a paper from your Reading shelf", "reading.pdf", p.title]);
    act(() => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(sel, "sh2"); sel.dispatchEvent(new Event("change", { bubbles: true })); });
    await click(tid("ap-shelf-btn"));
    await settle();
    expect(h.loadPaper).toHaveBeenCalledWith("sh2");
    expect(docRecord()).toEqual({ title: p.title, src: "pdf", pages: p.pages, sample: false, abstractOnly: false });
  });

  it.each([["locked", { locked: true }], ["loading", { loading: true }], ["broken", { broken: true }], ["a failed read", { error: true }], ["no project", { projectId: null }]] as const)("a shelf not read yet (%s, useShelf's index null) offers \"Choose a paper\", never \"empty\"; Use this paper asks for a choice", async (kind, st) => {
    h.index = null;
    Object.assign(h, st);
    await mount();
    expect([...$("#apShelf")!.querySelectorAll("option")].map((o) => o.textContent)).toEqual(["Choose a paper from your Reading shelf"]);
    expect(document.body.textContent).not.toContain("Your Reading shelf is empty");
    expect(tid("ap-shelf-locked")?.textContent ?? null).toBe(kind === "locked" ? E.vault_shelf_locked : null);
    expect(tid("ap-shelf-broken")?.textContent ?? null).toBe(kind === "broken" ? E.vault_shelf_broken : null);
    await click(tid("ap-shelf-btn"));
    expect(toasts()).toEqual(["Choose a paper first"]);
    expect(h.loadPaper).not.toHaveBeenCalled();
    expect(getAp().doc).toBeNull();
  });

  /** Choose shelf paper "sh1" in the dropdown. */
  const pickShelf = (id: string) => { const sel = $("#apShelf") as HTMLSelectElement; act(() => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(sel, id); sel.dispatchEvent(new Event("change", { bubbles: true })); }); };
  const SHELF1 = [{ id: "sh1", title: "A slow shelf paper about reading", file: "slow.pdf", size: 1, added: "", total: 2, kept: 2 }];

  it("a shelf paper that finishes loading after the practice paper was chosen does not replace it (W20)", async () => {
    h.index = SHELF1;
    let done: (v: { pages: string[]; notes: unknown[]; cells: Record<string, string> }) => void = () => {};
    h.loadPaper.mockImplementation(() => new Promise((r) => { done = r; }));
    await mount();
    pickShelf("sh1");
    await click(tid("ap-shelf-btn"));
    await click(tid("ap-sample-btn"));
    expect(tid("ap-head")!.textContent).toContain(SAMPLE_TITLE);
    await act(async () => { done({ pages: ["A slow shelf paper about reading\n" + "words ".repeat(200)], notes: [], cells: {} }); await new Promise((r) => setTimeout(r, 0)); });
    await settle();
    expect(h.loadPaper).toHaveBeenCalledWith("sh1");
    expect(tid("ap-head")!.textContent).toContain(SAMPLE_TITLE);
    expect(tid("ap-head")!.textContent).not.toContain("A slow shelf paper");
    expect(getAp().doc!.sample).toBe(true);
    expect(toasts()).toEqual([]);
  });

  it("the same holds for a PDF file read and for a paste", async () => {
    let done: (v: unknown) => void = () => {};
    h.extract.mockImplementation(() => new Promise((r) => { done = r; }));
    await mount();
    await choose(new File(["%PDF"], "slow.pdf"));
    await click(tid("ap-sample-btn"));
    await act(async () => { done({ pages: ["A slow PDF about reading\n" + "words ".repeat(200)], total: 1 }); await new Promise((r) => setTimeout(r, 0)); });
    await settle();
    expect(tid("ap-head")!.textContent).toContain(SAMPLE_TITLE);
    expect(toasts()).toEqual(["Reading slow.pdf…"]);
    // A paste chosen while a shelf paper is still being read wins too.
    h.index = SHELF1;
    let shelfDone: (v: { pages: string[]; notes: unknown[]; cells: Record<string, string> }) => void = () => {};
    h.loadPaper.mockImplementation(() => new Promise((r) => { shelfDone = r; }));
    act(() => { for (const x of roots.splice(0)) x.unmount(); }); document.body.innerHTML = "";
    resetAp();
    await mount();
    pickShelf("sh1");
    await click(tid("ap-shelf-btn"));
    typeIn($("#apPaste") as HTMLTextAreaElement, "My pasted paper on reading\n" + "pasted words ".repeat(60));
    await click(tid("ap-paste-btn"));
    await act(async () => { shelfDone({ pages: ["A slow shelf paper about reading\n" + "words ".repeat(200)], notes: [], cells: {} }); await new Promise((r) => setTimeout(r, 0)); });
    await settle();
    expect(tid("ap-head")!.textContent).toContain("My pasted paper on reading");
    expect(toasts()).toEqual(["Reading slow.pdf…"]);
  });

  it("Use this paper with nothing chosen asks for a choice and does not cancel a paper still being read", async () => {
    let done: (v: unknown) => void = () => {};
    h.extract.mockImplementation(() => new Promise((r) => { done = r; }));
    h.index = SHELF1;
    await mount();
    await choose(new File(["%PDF"], "slow.pdf"));
    // The dropdown is still on "Choose a paper from your Reading shelf".
    await click(tid("ap-shelf-btn"));
    expect(toasts()).toEqual(["Reading slow.pdf…", "Choose a paper first"]);
    await act(async () => { done({ pages: ["A slow PDF about reading\n" + "words ".repeat(200)], total: 1 }); await new Promise((r) => setTimeout(r, 0)); });
    await settle();
    expect(h.loadPaper).not.toHaveBeenCalled();
    expect(tid("ap-head")!.textContent).toContain("A slow PDF about reading");
  });

  it("a shelf paper whose text cannot be read here says so and loads nothing", async () => {
    h.index = [{ id: "sh1", title: "Locked paper", file: "l.pdf", size: 1, added: "", total: 1, kept: 1 }];
    await mount();
    const sel = $("#apShelf") as HTMLSelectElement;
    act(() => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(sel, "sh1"); sel.dispatchEvent(new Event("change", { bubbles: true })); });
    await click(tid("ap-shelf-btn"));
    await settle();
    expect(toasts()).toEqual(["Locked paper could not be read"]);
    expect(getAp().doc).toBeNull();
  });
});

describe("Analyse a paper: what apRender draws for the loaded paper (11278-11285)", () => {
  it.each(FX.heads.map((x) => [x.id, x] as const))("%s: the head box, the tabs and the reference check's button are v1's", async (id, c) => {
    load(id);
    await mount();
    expect(tid("ap-head")!.textContent).toBe(withPanelFixes(c.text));
    expect(tid("ap-preview")!.textContent).toBe(c.pre);
    // v1's tabs less the lesson (the practice paper's), which is not built and not offered (W23, register D-S2-44).
    expect([...tid("ap-tabs")!.querySelectorAll("button")].map((b) => ({ text: b.textContent, disabled: b.disabled, title: b.getAttribute("title") }))).toEqual(c.tabs.filter((x) => x.text !== E.ap2_lesson_on_this_paper));
    expect(!!tid("ap-ref-btn")).toBe(c.refBtn);
  });

  it("an abstract from Research (pendingAnalyse) loads abstract-only with no tick: the banner, the walk-through disabled, no reference check; the kept abstract is cleared", async () => {
    const p = paperOf("abstract-only");
    h.pending = { title: p.title, pages: p.pages, src: "abstract" };
    await mount();
    expect(h.setPending).toHaveBeenCalledWith(null);
    expect(docRecord()).toEqual({ title: p.title, src: "abstract", pages: p.pages, sample: false, abstractOnly: true });
    expect(tid("ap-head")!.textContent).toBe(withPanelFixes(FX.heads.find((x) => x.id === "abstract-only")!.text));
    expect(tid("ap-abstract-only")!.textContent).toBe(E.ap2_abstract_only_shallow_an);
    const walk = tid("ap-tab-walk") as HTMLButtonElement;
    expect([walk.textContent, walk.disabled, walk.title]).toEqual(["🧭 Walk me through it (full paper needed)", true, "The walk-through needs the full paper"]);
    expect(tid("ap-ref-btn")).toBeNull();
    h.callAI.mockResolvedValue('{"in_paper":true,"answer":"From the abstract.","quotes":[]}');
    typeIn($("#apQ") as HTMLTextAreaElement, "What was the design?");
    await click(tid("ap-ask-btn"));
    await until(() => !!tid("ap-answer"));
    expect(toasts()).toEqual([]);
  });

  it("under StrictMode (the effect runs twice) the kept abstract is loaded once, and a refusal toasted once", async () => {
    const p = paperOf("abstract-only");
    h.pending = { title: p.title, pages: p.pages, src: "abstract" };
    const g = getAp().gen;
    await mount(<StrictMode><AnalysePanel /></StrictMode>);
    expect(getAp().gen).toBe(g + 1);
    expect(getAp().doc!.abstractOnly).toBe(true);
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    document.body.innerHTML = "";
    resetAp();
    h.pending = { title: "Thin", pages: ["Thin\n\nAbstract\nToo short."], src: "abstract" };
    await mount(<StrictMode><AnalysePanel /></StrictMode>);
    expect(toasts()).toEqual(["This search result has no abstract to read. Open the source and paste the paper text instead."]);
  });

  it("a second, different abstract kept later is loaded too (the first one's guard does not block it)", async () => {
    const a = paperOf("abstract-only");
    h.pending = { title: a.title, pages: a.pages, src: "abstract" };
    const root = await mount();
    expect(getAp().doc!.title).toBe(a.title);
    const second = { title: "A second abstract", pages: ["A second abstract\n\nAbstract\n" + "Students who slept longer before the exam reported less worry. ".repeat(4)], src: "abstract" as const };
    h.pending = second;
    await act(async () => { root.render(<AnalysePanel />); });
    expect(docRecord()).toEqual({ title: second.title, src: "abstract", pages: second.pages, sample: false, abstractOnly: true });
    expect(h.setPending).toHaveBeenCalledTimes(2);
  });

  it("an abstract too short to read is refused with v1's sentence", async () => {
    h.pending = { title: "Thin", pages: ["Thin\n\nAbstract\nToo short."], src: "abstract" };
    await mount();
    expect(toasts()).toEqual(["This search result has no abstract to read. Open the source and paste the paper text instead."]);
    expect(getAp().doc).toBeNull();
  });
});

describe("Analyse a paper: Ask (apAsk 10032-10047, apQuotesHTML 10018-10026, the log 11298-11305)", () => {
  it.each(FX.asks.map((a) => [a.id, a] as const))("%s: v1's options, toasts and answer box", async (_id, c) => {
    if (c.paper === "sample@apSample") { await mount(); await click(tid("ap-sample-btn")); } else { load(c.paper); await mount(); }
    tick($("#apOK") as HTMLInputElement, c.consent);
    h.callAI.mockResolvedValue(c.reply);
    typeIn($("#apQ") as HTMLTextAreaElement, c.q);
    await click(tid("ap-ask-btn"));
    await settle();
    expect(toasts()).toEqual(c.toasts);
    expect(h.callAI.mock.calls.map((k) => k[1])).toEqual(c.opts);
    if (c.opts.length) expect(h.callAI.mock.calls[0]![0]).toBe(buildAskPrompt(fieldLabel("psychology"), getAp().doc!, c.q).prompt);
    expect(($("#apQ") as HTMLTextAreaElement).value).toBe(c.qDraftAfter);
    const box = tid("ap-answer");
    if (!c.box) { expect(box).toBeNull(); return; }
    expect(box!.textContent).toBe(c.box.text);
    expect(box!.querySelector('[data-testid="ap-banner"]')?.textContent ?? null).toBe(c.box.banner);
    expect([...box!.querySelectorAll("blockquote")].map((b) => ({ text: b.textContent, bad: b.classList.contains("ap-bad") }))).toEqual(c.box.quotes);
  });

  it("the cases reach what the brief names: one quote matched and one missed (banner with 1), the non-JSON sentence, the partial-read note", () => {
    expect(FX.asks.find((a) => a.id === "sample-json")!.box!.banner).toBe("⚠ 1 of the quotations below could not be matched to the paper text. The answer may rest on words the paper does not contain. Open the paper and check.");
    expect(FX.asks.find((a) => a.id === "sample-raw")!.box!.text).toContain(E.ap2_the_answer_could_not);
    expect(FX.asks.find((a) => a.id === "long-partial")!.box!.text).toContain("The paper is long, so the 20 passages closest to your question (of 34) were read.");
  });

  it("a chip puts its question in the box and gives the box the focus; the five chips are v1's", async () => {
    await mount();
    await click(tid("ap-sample-btn"));
    const chips = $$('[data-testid="ap-chip"]');
    expect(chips.map((c) => c.textContent)).toEqual(["What was the research gap?", "Why did the authors choose this design?", "Who were the participants and how were they chosen?", "Which statistical test was used and why?", "What are the limitations?"]);
    await click(chips[3]!);
    expect(($("#apQ") as HTMLTextAreaElement).value).toBe("Which statistical test was used and why?");
    expect(document.activeElement).toBe($("#apQ"));
    expect(($("#apQ") as HTMLTextAreaElement).placeholder).toBe("Ask anything about the paper");
    expect($('label[for="apQ"]')!.textContent).toBe("Your question about this paper");
  });

  it("while the AI reads: v1's box, Ask disabled, a second press does nothing; the log shows the newest first", async () => {
    await mount();
    await click(tid("ap-sample-btn"));
    let answer: (s: string) => void = () => {};
    h.callAI.mockImplementationOnce(() => new Promise<string>((r) => { answer = r; }));
    typeIn($("#apQ") as HTMLTextAreaElement, "What was the research gap?");
    await click(tid("ap-ask-btn"));
    expect(tid("ap-busy")!.textContent).toBe("Reading the paper and writing the answer…");
    expect((tid("ap-ask-btn") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { answer('{"in_paper":true,"answer":"First.","quotes":[]}'); });
    await settle();
    expect(tid("ap-busy")).toBeNull();
    h.callAI.mockResolvedValueOnce('{"in_paper":true,"answer":"Second.","quotes":[]}');
    typeIn($("#apQ") as HTMLTextAreaElement, "What are the limitations?");
    await click(tid("ap-ask-btn"));
    await settle();
    expect($$('[data-testid="ap-answer"]').map((b) => b.textContent)).toEqual(["You asked: What are the limitations?Second.", "You asked: What was the research gap?First."]);
    expect(h.callAI).toHaveBeenCalledTimes(2);
  });

  it("an Ask reply that arrives after another paper was loaded is dropped (W20)", async () => {
    await mount();
    await click(tid("ap-sample-btn"));
    let answer: (s: string) => void = () => {};
    h.callAI.mockImplementationOnce(() => new Promise<string>((r) => { answer = r; }));
    typeIn($("#apQ") as HTMLTextAreaElement, "What was the research gap?");
    await click(tid("ap-ask-btn"));
    typeIn($("#apPaste") as HTMLTextAreaElement, "My pasted paper on reading\n" + "pasted words ".repeat(60));
    await click(tid("ap-paste-btn"));
    await act(async () => { answer('{"in_paper":true,"answer":"For the practice paper.","quotes":[]}'); await new Promise((r) => setTimeout(r, 0)); });
    await settle();
    expect(getAp().log).toEqual([]);
    expect(tid("ap-answer")).toBeNull();
    expect(tid("ap-about")).toBeNull();
    expect(getAp().busy).toBe(false);
  });

  it("each answer names its paper", async () => {
    await mount();
    await click(tid("ap-sample-btn"));
    h.callAI.mockResolvedValue('{"in_paper":true,"answer":"First.","quotes":[]}');
    typeIn($("#apQ") as HTMLTextAreaElement, "What was the research gap?");
    await click(tid("ap-ask-btn"));
    await settle();
    expect(tid("ap-about")).toHaveProperty("textContent", "About: " + SAMPLE_TITLE);
    // The line is above the answer, not part of its box.
    expect(tid("ap-about")!.compareDocumentPosition(tid("ap-answer")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tid("ap-answer")!.textContent).toBe("You asked: What was the research gap?First.");
  });

  it("a failed call toasts callAI's sentence and keeps the question", async () => {
    await mount();
    await click(tid("ap-sample-btn"));
    h.callAI.mockRejectedValueOnce(new Error("Your AI key was not accepted. Check it in Settings."));
    typeIn($("#apQ") as HTMLTextAreaElement, "What was the research gap?");
    await click(tid("ap-ask-btn"));
    await settle();
    expect(toasts()).toEqual(["Your AI key was not accepted. Check it in Settings."]);
    expect(tid("ap-answer")).toBeNull();
    expect(($("#apQ") as HTMLTextAreaElement).value).toBe("What was the research gap?");
  });
});

describe("Analyse a paper: the numbers check (apNumbersRun / apNumbersHTML 10106-10110)", () => {
  it("nothing before the button; the button is v1's", async () => {
    load("sample");
    await mount();
    expect(tid("ap-num-btn")!.textContent).toBe("🔢 Check the paper's numbers");
    expect(tid("ap-numbers")).toBeNull();
  });
  it.each(FX.numbers.map((n) => [n.id, n] as const))("%s: v1's box, line for line", async (id, c) => {
    load(id);
    await mount();
    await click(tid("ap-num-btn"));
    expect(tid("ap-numbers")!.textContent).toBe(c.text);
    expect($$('[data-testid="ap-num-line"]').map((l) => ({ mark: l.firstChild!.textContent!.trim(), label: l.querySelector("code")!.textContent, note: l.querySelector("span")!.textContent }))).toEqual(c.lines);
  });
  it("the cases hold the two caveats and the none-found sentence", () => {
    const all = FX.numbers.map((n) => n.text).join("\n");
    expect(all).toContain("This tests arithmetic only. It says nothing about whether the test was the right one.");
    expect(all).toContain("A one-tailed test, a correction, or a typing slip can explain this; read the paper.");
    expect(all).toContain("Many papers print results in tables, which this check cannot read.");
  });
});

describe("Analyse a paper: the reference check (apRefCheck / apRefHTML 11236-11270)", () => {
  it.each(FX.refs.map((r) => [r.id, r] as const))("%s: v1's box, button and links", async (_id, c) => {
    load("sample");
    await mount();
    // The 429 reaches the panel as core's "429" (register D-S2-6); v1's state holds oaHttpError's sentence, which the panel shows for it.
    const refs = c.id === "stopped-429" ? { ...(c.refs as object), error: "429" } : c.refs;
    act(() => { setAp({ refs: refs as never, refBusy: c.busy }); });
    expect(tid("ap-ref-btn")!.textContent).toBe(c.button);
    expect((tid("ap-ref-btn") as HTMLButtonElement).disabled).toBe(c.disabled);
    expect(tid("ap-refs")!.textContent).toBe(c.text);
    expect([...tid("ap-refs")!.querySelectorAll("a")].map((a) => ({ href: a.getAttribute("href"), text: a.textContent, target: a.getAttribute("target"), rel: a.getAttribute("rel") }))).toEqual(c.links);
  });

  it("a paper with no reference list, and one whose list prints no DOIs: v1's boxes, no request", async () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    load("pdf-three-pages");
    await mount();
    await click(tid("ap-ref-btn"));
    expect(tid("ap-refs")!.textContent).toBe(FX.refs.find((r) => r.id === "no-list")!.text);
    load("sample");
    await settle();
    await click(tid("ap-ref-btn"));
    expect(tid("ap-refs")!.textContent).toBe(FX.refs.find((r) => r.id === "no-dois")!.text);
    expect(f).not.toHaveBeenCalled();
  });

  it("the list's DOIs go to OpenAlex (the recorded answer): 'Checking…' while it runs, then v1's report; the OpenAlex key rides along when there is one", async () => {
    const rec = REC("oa-refcheck-355dede8.json");
    const seen: string[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      seen.push(String(input));
      await gate;
      return new Response(rec.body, { status: rec.status, headers: { "content-type": "application/json" } });
    }));
    h.oaKey = "k-test";
    const body = paperOf("sample").pages.slice(0, 2).join("\n");
    const pages = [body + "\nReferences\nReferences. " + FETCH.refcheck.dois.join(" ; ")];
    act(() => { expect(loadPaper("Reference check", pages, "paste", false, quiet)).toBe(true); });
    expect(apRefDois(getAp().doc!)).toEqual(FETCH.refcheck.dois);
    await mount();
    tick($("#apOK") as HTMLInputElement, true);
    await click(tid("ap-ref-btn"));
    expect(tid("ap-refs")!.textContent).toBe("Checking 12 DOIs with OpenAlex… 0 done.");
    expect((tid("ap-ref-btn") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 0)); });
    await settle();
    expect(seen).toEqual([FETCH.refcheck.requested[0] + "&api_key=k-test"]);
    const finished = FX.refs.find((r) => r.id === "finished")!;
    expect(tid("ap-refs")!.textContent).toBe(finished.text);
    expect(getAp().refs).toMatchObject({ finished: true, dois: FETCH.refcheck.dois });
  });
});
