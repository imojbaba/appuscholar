// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildLitReviewPrompt, buildQuickReadPrompt, RS_DESIGNS, rsCsvText, type CitationEntry, type RsPaper, type RsQuick } from "@appuscholar/core";
import en from "../messages/en.json";

/*
 * The Research panel, part 2 (v1 976-1030 and its script): the quick read and its box (rsQuickHTML / rsQuickP / rsQuickChecked 8161-8190), the
 * filters and their count (8331-8375), the CSV (8196), the ticked papers' actions with the two generators (8524-8551), the external search buttons
 * (8424-8434), the manual add (8436-8454), connected papers over the recorded OpenAlex bodies (8498-8523) and "Analyse this paper" (8411-8419).
 */

type Blob_ = { value: unknown; loading: boolean; locked: boolean; set: ReturnType<typeof vi.fn>; flush: ReturnType<typeof vi.fn> };
const blob = (value: unknown): Blob_ => ({ value, loading: false, locked: false, set: vi.fn(), flush: vi.fn(async () => true) });
const h = vi.hoisted(() => ({
  blobs: {} as Record<string, Blob_>,
  toast: vi.fn(),
  callAI: vi.fn(async (..._a: unknown[]) => ""),
  oaKey: null as string | null,
  go: vi.fn(),
  dockShow: vi.fn(),
  setPendingAnalyse: vi.fn(),
  openExport: vi.fn(),
  setThinking: vi.fn((..._a: unknown[]) => 7),
  set: vi.fn(),
  clear: vi.fn(),
  download: vi.fn()
}));
vi.mock("@/lib/blobs/useProjectBlob", () => ({
  useProjectBlob: (...a: unknown[]) => h.blobs[a[0] as string] ?? { value: null, loading: false, locked: false, set: () => {}, flush: async () => true }
}));
vi.mock("@/lib/ai/useCallAI", async (orig) => ({ ...(await orig<typeof import("../lib/ai/useCallAI")>()), useCallAI: () => h.callAI }));
vi.mock("@/lib/ai/suggestion", () => ({ useSuggestion: () => ({ editor: null, setThinking: h.setThinking, isCurrent: (tk: number) => tk === 7, set: h.set, clear: h.clear }) }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", scratchProjectId: "scratch-1" }, settings: { field: "psychology" } }) }));
vi.mock("@/components/frame/ProjectContext", () => ({
  useProject: () => ({ project: { id: "p-1" }, projectId: "p-1", documents: [], currentDoc: null, pendingSearch: null, setPendingSearch: () => {}, pendingAnalyse: null, setPendingAnalyse: h.setPendingAnalyse, go: h.go, dockShow: h.dockShow, openExport: h.openExport })
}));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => ({ status: "off" }) }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/research/oaKey", () => ({ useOpenAlexKey: () => h.oaKey }));
vi.mock("@/lib/export/download", async (orig) => ({ ...(await orig<typeof import("../lib/export/download")>()), downloadBlob: h.download }));

import { ResearchPanel } from "../components/tools/research/ResearchPanel";
import { getResearch, resetResearch, setResearch, shownNow } from "../lib/research/useSearch";
import { downloadCsv } from "../lib/research/extras";
import { resetCiteStyle } from "../lib/cite/useLibrary";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const E = en as Record<string, string>;
const CORE_TEST = join(__dirname, "../../../packages/core/test");
type Rec = { url: string; status: number; headers: Record<string, string | null>; body: string };
const RECS = new Map<string, Rec>(readdirSync(join(CORE_TEST, "fetch/recorded")).filter((f) => f.endsWith(".json") && f !== "v2-manifest.json").map((f) => {
  const r = JSON.parse(readFileSync(join(CORE_TEST, "fetch/recorded", f), "utf8")) as Rec;
  return [r.url, r];
}));
type Connected = { in: { oaId: string; title: string; referencedWorks: string[]; citedByApiUrl: string }; requested: string[]; cites: { heading: string; cards: Array<{ title: string; meta: string }> }; citedBy: { heading: string; cards: Array<{ title: string; meta: string }> } };
const FETCH = JSON.parse(readFileSync(join(CORE_TEST, "golden/fetch/cases.json"), "utf8")) as { searches: Array<{ name: string; merged: RsPaper[] }>; connected: Connected[] };
const RES = JSON.parse(readFileSync(join(CORE_TEST, "golden/research/cases.json"), "utf8")) as { papers: RsPaper[]; quick: Array<{ ab: string; raw: string; out: RsQuick | null }> };
/** The research fixture's papers as a search leaves them: no quick read, no fit. */
const fresh = (): RsPaper[] => RES.papers.map((p) => { const { quick: _q, rel: _r, ...rest } = p; return rest as RsPaper; });

let requested: string[] = [];
const fakeFetch = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  requested.push(url);
  const r = RECS.get(url);
  if (!r) throw new TypeError("Failed to fetch");
  return new Response(r.body, { status: r.status, headers: r.headers["content-type"] ? { "content-type": r.headers["content-type"] } : {} });
});

const roots: Root[] = [];
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => [...document.body.querySelectorAll<HTMLElement>(sel)];
const tid = (id: string) => $(`[data-testid="${id}"]`);
const field = <T extends HTMLElement = HTMLInputElement>(id: string) => $("#" + id) as unknown as T;
async function settle(ms = 0) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }
async function until(pred: () => boolean) {
  for (let i = 0; i < 300; i++) { if (pred()) return; await settle(5); }
  throw new Error("condition not reached");
}
async function mount(papers: RsPaper[] = fresh(), topic = "social media and adolescent anxiety") {
  setResearch({ original: papers, topic });
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(<ResearchPanel />); });
  return root;
}
function type(id: string, value: string) {
  const el = field<HTMLInputElement | HTMLSelectElement>(id);
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
function tick(el: HTMLInputElement, on: boolean) { if (el.checked !== on) act(() => { el.click(); }); }
async function click(el: HTMLElement | null) { await act(async () => { el!.click(); await new Promise((r) => setTimeout(r, 0)); }); }
const toasts = () => h.toast.mock.calls.map((c) => c[0] as string);
const cards = () => $$('[data-testid="rs-card"]');
const titles = () => cards().map((c) => c.querySelector("h4")!.textContent);
const cardOf = (title: string) => cards().find((c) => c.querySelector("h4")!.textContent === title)!;
const tickCard = (title: string, on = true) => tick(cardOf(title).querySelector<HTMLInputElement>('input[type="checkbox"]')!, on);
/** jsdom's Blob has no arrayBuffer(): read it with a FileReader. */
const bytes = (b: Blob) => new Promise<ArrayBuffer>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as ArrayBuffer); r.onerror = () => rej(r.error); r.readAsArrayBuffer(b); });
const actionsShown = () => !(tid("rs-actions") as HTMLElement).hidden;

let open: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  h.blobs = { citations: blob([]), retraction_cache: blob({}), rs_prefs: blob(null) };
  for (const f of [h.toast, h.go, h.dockShow, h.setPendingAnalyse, h.set, h.clear, h.download, h.openExport]) f.mockReset();
  h.setThinking.mockReset().mockReturnValue(7);
  h.callAI.mockReset().mockResolvedValue("");
  h.oaKey = null;
  requested = [];
  fakeFetch.mockClear();
  vi.stubGlobal("fetch", fakeFetch);
  open = vi.spyOn(window, "open").mockReturnValue(null);
  resetResearch();
  resetCiteStyle();
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  open.mockRestore();
});

describe("Research part 2: the layout (v1 976-1030)", () => {
  it("in v1's order: filters, their count, the results, the CSV row, the actions block, the external search, the manual add, connected papers", async () => {
    await mount();
    const order = ["rs-filters", "rs-fstat", "rs-results", "rs-csv", "rs-actions", "rs-external", "rs-manual", "rs-connected-box"];
    const els = order.map((id) => tid(id));
    for (let i = 1; i < els.length; i++) expect(els[i - 1]!.compareDocumentPosition(els[i]!) & Node.DOCUMENT_POSITION_FOLLOWING, order[i]).toBeTruthy();
    expect(tid("rs-filters")!.querySelector("summary")!.textContent).toBe("Filter these results");
    // Wave B Task 12 (D-S2-42): v1's "⬇ Download this list (.csv)" is now Export.
    expect(tid("rs-csv")!.textContent).toBe(E.exp_link);
    const acts = [...tid("rs-actions")!.querySelectorAll("button")].map((b) => b.textContent);
    expect(acts).toEqual(["⚡ Quick read the papers I ticked (up to 10)", E.research_litreview_btn, E.research_gapfinder_btn]);
    expect(tid("rs-actions")!.querySelector("p")!.textContent).toBe(E.research_grounded_note);
    expect(tid("rs-external")!.querySelector("summary")!.textContent).toBe(E.research_external_summary);
    expect(tid("rs-manual")!.querySelector("summary")!.textContent).toBe(E.research_manual_summary);
    expect(tid("rs-connected-box")!.querySelector("summary")!.textContent).toBe(E.research_connected_summary);
    expect(tid("rs-connected-box")!.querySelector(".desc")!.textContent).toBe(E.research_connected_desc);
  });
});

describe("Research part 2: Quick read (rsQuickHTML / rsQuickP 8161-8182)", () => {
  const boxOf = (title: string) => cardOf(title).querySelector<HTMLElement>('[data-testid="rs-quickbox"]');

  it("a result with too short an abstract toasts v1's sentence and calls no AI", async () => {
    const ps = fresh();
    ps[0] = { ...ps[0]!, abstract: "Too short to read." };
    await mount(ps);
    await click(cardOf(ps[0]!.title).querySelector('[data-testid="rs-quick"]'));
    expect(toasts()).toEqual(["This result has no abstract to read."]);
    expect(h.callAI).not.toHaveBeenCalled();
    expect(boxOf(ps[0]!.title)).toBeNull();
  });

  it("a confirmed read: v1's box under the title with the summary, the kind of study and the sample with their quotes", async () => {
    const c = RES.quick[0]!;
    const ps = fresh();
    ps[0] = { ...ps[0]!, abstract: c.ab };
    h.callAI.mockResolvedValueOnce(c.raw);
    await mount(ps);
    await click(cardOf(ps[0]!.title).querySelector('[data-testid="rs-quick"]'));
    await until(() => !!boxOf(ps[0]!.title));
    expect(h.callAI).toHaveBeenCalledWith(buildQuickReadPrompt("psychology", c.ab).prompt, { temp: 0.1, max: 700, noLang: true });
    const lines = [...boxOf(ps[0]!.title)!.querySelectorAll<HTMLElement>("[data-line]")].map((l) => l.textContent);
    expect(lines).toEqual([
      "Quick read (AI suggestion, from the abstract only)",
      "Cutting social media use for 4 weeks lowered anxiety scores by 2.5 points in 1,200 adolescents.",
      "Kind of study: randomised trial — “In this randomised trial, 1,200 adolescents aged 13 to 17”",
      "Sample size: 1,200 — “1,200 adolescents aged 13 to 17 from 12 schools”"
    ]);
    // the box sits after the title and before the meta line
    const card = cardOf(ps[0]!.title);
    expect(card.querySelector("h4")!.compareDocumentPosition(boxOf(ps[0]!.title)!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(boxOf(ps[0]!.title)!.compareDocumentPosition(card.querySelector(".meta")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(getResearch().original[0]!.quick).toEqual(c.out);
    expect(toasts()).toEqual([]);
  });

  it("Review Focus 3: the summary with a number the abstract lacks is dropped with v1's sentence; design and sample stay confirmed", async () => {
    const c = RES.quick[1]!;
    const ps = fresh();
    ps[0] = { ...ps[0]!, abstract: c.ab };
    h.callAI.mockResolvedValueOnce(c.raw);
    await mount(ps);
    await click(cardOf(ps[0]!.title).querySelector('[data-testid="rs-quick"]'));
    await until(() => !!boxOf(ps[0]!.title));
    const box = boxOf(ps[0]!.title)!;
    const lines = [...box.querySelectorAll<HTMLElement>("[data-line]")].map((l) => l.textContent);
    expect(lines).toEqual([
      "Quick read (AI suggestion, from the abstract only)",
      "The one-line summary was dropped because it contained a number that is not in the abstract.",
      "Kind of study: randomised trial — “in this randomised trial”",
      "Sample size: 1,200 — “1,200 adolescents”"
    ]);
    expect(box.querySelector(".ap-warn")!.textContent).toBe(E.rs2_the_one_line_summary);
    expect([...box.querySelectorAll("b")].map((b) => b.textContent)).toEqual(["Quick read", "randomised trial", "1,200"]);
  });

  it("not confirmed and not stated: v1's warnings and sentences", async () => {
    const ps = fresh();
    ps[0] = { ...ps[0]!, abstract: RES.quick[2]!.ab, title: "A" };
    ps[1] = { ...ps[1]!, abstract: RES.quick[3]!.ab, title: "B" };
    h.callAI.mockResolvedValueOnce(RES.quick[2]!.raw).mockResolvedValueOnce(RES.quick[3]!.raw);
    await mount(ps);
    await click(cardOf("A").querySelector('[data-testid="rs-quick"]'));
    await until(() => !!boxOf("A"));
    await click(cardOf("B").querySelector('[data-testid="rs-quick"]'));
    await until(() => !!boxOf("B"));
    const lines = (t: string) => [...boxOf(t)!.querySelectorAll<HTMLElement>("[data-line]")].map((l) => l.textContent);
    expect(lines("A")).toEqual([
      "Quick read (AI suggestion, from the abstract only)", "A programme to cut social media use reduced anxiety.",
      "Kind of study: not confirmed (the quoted words were not found in the abstract)", "Sample size: 12 — “from 12 schools”"
    ]);
    expect(lines("B")).toEqual([
      "Quick read (AI suggestion, from the abstract only)", "Anxiety fell more with less social media.",
      "Kind of study: not stated in the abstract", "Sample size: not confirmed (the quoted words did not contain this number)"
    ]);
  });

  it("the ticked batch: up to 10 papers, v1's toasts, the boxes, the ticks and the actions block kept", async () => {
    const c = RES.quick[0]!;
    const ps = fresh().slice(0, 3).map((p, i) => ({ ...p, title: "T" + i, abstract: c.ab }));
    h.callAI.mockResolvedValue(c.raw);
    await mount(ps);
    await click(tid("rs-quick-ticked"));
    expect(toasts()).toEqual(["Tick some papers first"]);
    tickCard("T0");
    tickCard("T2");
    expect(actionsShown()).toBe(true);
    await click(tid("rs-quick-ticked"));
    await until(() => toasts().length === 4);
    expect(toasts().slice(1)).toEqual(["Quick read 1 of 2…", "Quick read 2 of 2…", "Quick read done for 2 of 2"]);
    expect(!!boxOf("T0")).toBe(true);
    expect(boxOf("T1")).toBeNull();
    expect(!!boxOf("T2")).toBe(true);
    expect(cardOf("T0").querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
    expect(cardOf("T2").querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
    expect(actionsShown()).toBe(true);
  });
});

describe("Research part 2: the literature review and the research gap (8530-8551)", () => {
  it("one ticked: v1's toast; two ticked: core's prompt over those two, v1's pane text, the answer insertable, v1's toast", async () => {
    const ps = fresh();
    await mount(ps);
    tickCard(ps[1]!.title);
    await click(tid("rs-litreview"));
    expect(toasts()).toEqual(["Check at least 2 papers above first"]);
    expect(h.callAI).not.toHaveBeenCalled();
    tickCard(ps[3]!.title);
    h.callAI.mockResolvedValueOnce("A grounded paragraph.");
    await click(tid("rs-litreview"));
    await until(() => h.set.mock.calls.length === 1);
    // the ticked papers in the order shown
    expect(h.callAI).toHaveBeenCalledWith(buildLitReviewPrompt("psychology", [ps[1]!, ps[3]!]).prompt, { temp: 0.35, max: 1200 });
    expect(h.setThinking).toHaveBeenCalledWith("custom", null, "💜 Reading 2 abstracts and drafting…");
    expect(h.set).toHaveBeenCalledWith("A grounded paragraph.", null, 7);
    expect(h.dockShow).toHaveBeenCalledWith("ai");
    expect(toasts().at(-1)).toBe("Ready — press Tab in the editor to insert");
  });

  it("the gap finder's pane text", async () => {
    const ps = fresh();
    await mount(ps);
    tickCard(ps[0]!.title);
    tickCard(ps[2]!.title);
    h.callAI.mockResolvedValueOnce("Gap 1 (Population): …");
    await click(tid("rs-gapfinder"));
    await until(() => h.set.mock.calls.length === 1);
    expect(h.setThinking).toHaveBeenCalledWith("custom", null, "💜 Looking for what these papers leave unanswered…");
    expect((h.callAI.mock.calls[0]![0] as string)).toContain("find a research gap");
  });
});

describe("Research part 2: the filters (8331-8375)", () => {
  it("v1's controls; the kind of study offers Any and RS_DESIGNS", async () => {
    await mount();
    const f = tid("rs-filters")!;
    expect(f.textContent).toContain("Published from");
    expect(field("rsFYear").placeholder).toBe("year");
    expect(field("rsFYear").type).toBe("number");
    expect(field("rsFN").placeholder).toBe("n");
    expect(f.textContent).toContain("Open access only");
    expect(f.textContent).toContain("Hide papers flagged as retracted");
    expect(f.textContent).toContain("Kind of study (confirmed)");
    expect(f.textContent).toContain("Sample at least (confirmed)");
    expect(f.textContent).toContain(E.rs2_filters_only_hide_papers);
    expect([...field<HTMLSelectElement>("rsFDes").options].map((o) => [o.value, o.textContent])).toEqual([["", "Any"], ...RS_DESIGNS.map((x) => [x, x])]);
    expect(tid("rs-fstat")!.textContent).toBe("");
  });

  it("filters hide, never delete: v1's count, ticks on hidden papers kept, Clear filters brings them back", async () => {
    const ps = fresh();
    await mount(ps);
    const all = titles();
    expect(all).toHaveLength(ps.length);
    const old = ps.find((p) => (parseInt(String(p.year), 10) || 0) < 2020)!;
    tickCard(old.title);
    type("rsFYear", "2020");
    const kept = ps.filter((p) => (parseInt(String(p.year), 10) || 0) >= 2020);
    expect(titles()).toEqual(kept.map((p) => p.title));
    expect(tid("rs-fstat")!.textContent).toBe("Showing " + kept.length + " of " + ps.length + " papers. " + (ps.length - kept.length) + " hidden by your filters, not deleted.");
    // the hidden ticked paper is not part of the ticked papers now
    expect(actionsShown()).toBe(false);
    expect(getResearch().original).toHaveLength(ps.length);
    await click(tid("rs-filter-clear"));
    expect(field("rsFYear").value).toBe("");
    expect(titles()).toEqual(all);
    expect(tid("rs-fstat")!.textContent).toBe("");
    expect(cardOf(old.title).querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
    expect(actionsShown()).toBe(true);
  });

  it("the confirmed filters need a quick read: v1's extra sentence; nothing shown adds 'Clear a filter'", async () => {
    const ps = fresh();
    ps[0] = { ...ps[0]!, quick: RES.papers[0]!.quick };
    await mount(ps);
    type("rsFDes", "randomised trial");
    expect(titles()).toEqual([ps[0]!.title]);
    expect(tid("rs-fstat")!.textContent).toBe("Showing 1 of " + ps.length + " papers. " + (ps.length - 1) + " hidden by your filters, not deleted. " + (ps.length - 1) + " of those are hidden only because they have no Quick read yet.");
    type("rsFN", "5000");
    expect(titles()).toEqual([]);
    expect(tid("rs-fstat")!.textContent).toBe("Showing 0 of " + ps.length + " papers. " + ps.length + " hidden by your filters, not deleted. " + (ps.length - 1) + " of those are hidden only because they have no Quick read yet. Clear a filter to see them again.");
  });

  it("open access only and hide retracted", async () => {
    const ps = fresh();
    await mount(ps);
    tick(field("rsFOA"), true);
    expect(titles()).toEqual(ps.filter((p) => p.oaStatus || p.oaUrl).map((p) => p.title));
    tick(field("rsFOA"), false);
    tick(field("rsFRet"), true);
    expect(titles()).toEqual(ps.filter((p) => !p.retracted).map((p) => p.title));
  });
});

describe("Research part 2: the CSV (rsCsvDownload 8196), now in the export place (Task 12)", () => {
  it("Export opens the export place with the search lists ticked, and its last search is the papers shown, as the CSV wrote them", async () => {
    const ps = fresh();
    await mount(ps);
    type("rsSort", "citations");
    type("rsFYear", "2019");
    await click(tid("rs-csv"));
    expect(h.openExport).toHaveBeenCalledWith("search");
    expect(h.download).not.toHaveBeenCalled();
    const shown = titles().map((tt) => ps.find((p) => p.title === tt)!);
    expect(shownNow()).toEqual(shown);
    // v1's file, as search/last-search.csv holds it.
    const file = await new Promise<{ name: string; file: Blob }>((done) => downloadCsv(shownNow()!, { download: (name, f) => done({ name, file: f }), toast: () => {}, t: (k) => k }));
    expect(file.name).toBe("search-results.csv");
    expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(await bytes(file.file))).toBe("﻿" + rsCsvText(shown));
  });
});

describe("Research part 2: the external search (rsOpenExternal 8424-8434)", () => {
  it("the four buttons with v1's labels and titles open a new tab with noopener", async () => {
    await mount(fresh(), "exam stress");
    const btns = [...tid("rs-external")!.querySelectorAll<HTMLButtonElement>("button")];
    expect(btns.map((b) => [b.textContent, b.title])).toEqual([
      [E.research_ext_scholar, E.rs2_opens_scholar_google_com_title], [E.research_ext_jstor, E.rs2_opens_jstor_org_with_title],
      [E.research_ext_sciencedirect, E.rs2_opens_sciencedirect_com_with_title], [E.research_ext_base, E.rs2_opens_base_bielefeld_academic_title]
    ]);
    expect(tid("rs-external")!.querySelector(".desc")!.textContent).toBe(E.research_external_desc);
    for (const b of btns) await click(b);
    expect(open.mock.calls).toEqual([
      ["https://scholar.google.com/scholar?q=exam%20stress", "_blank", "noopener"], ["https://www.jstor.org/action/doBasicSearch?Query=exam%20stress", "_blank", "noopener"],
      ["https://www.sciencedirect.com/search?qs=exam%20stress", "_blank", "noopener"], ["https://www.base-search.net/Search/Results?lookfor=exam%20stress", "_blank", "noopener"]
    ]);
    type("rsTopic", " ");
    await click(btns[0]!);
    expect(toasts()).toEqual(["Type a search topic first"]);
  });
});

describe("Research part 2: the manual add (rsAddManual 8435-8454)", () => {
  it("v1's five fields with their labels and placeholders; title required; the record as an update; the fields cleared; the duplicate rule", async () => {
    await mount();
    const ids = ["rsManTitle", "rsManAuthor", "rsManYear", "rsManSource", "rsManDoi"];
    expect(ids.map((id) => [$(`label[for="${id}"]`)!.textContent, field(id).placeholder])).toEqual([
      [E.research_man_title_label, "Paper title"], [E.research_man_author_label, "Last, F. M.; Last, F. M."], [E.research_man_year_label, "2026"],
      [E.research_man_source_label, "Journal name"], [E.research_man_doi_label, "10.xxxx/... or https://…"]
    ]);
    expect(tid("rs-manual")!.querySelector(".desc")!.textContent).toBe(E.research_manual_desc);
    expect(tid("rs-man-add")!.textContent).toBe(E.research_man_add_btn);
    await click(tid("rs-man-add"));
    expect(toasts()).toEqual(["Enter a title first"]);
    type("rsManTitle", "Hostel life and loneliness");
    type("rsManAuthor", "Rao, P.");
    type("rsManYear", "2024");
    type("rsManSource", "Indian J Psych");
    type("rsManDoi", "10.1/abc");
    await click(tid("rs-man-add"));
    const set = h.blobs.citations!.set;
    expect(set).toHaveBeenCalledTimes(1);
    const entry: CitationEntry = { author: "Rao, P.", year: "2024", title: "Hostel life and loneliness", source: "Indian J Psych", volume: "", issue: "", pages: "", doi: "10.1/abc", url: "", type: "Journal article", style: "apa" };
    expect((set.mock.calls[0]![0] as (p: CitationEntry[] | null) => CitationEntry[])(null)).toEqual([entry]);
    expect(ids.map((id) => field(id).value)).toEqual(["", "", "", "", ""]);
    expect(toasts().at(-1)).toBe("Added to citation library ✓");
    h.blobs.citations = blob([entry]);
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    await mount();
    type("rsManTitle", "Hostel life and loneliness");
    type("rsManAuthor", "Rao, P.");
    await click(tid("rs-man-add"));
    expect(toasts().at(-1)).toBe("Already in your library");
    expect(field("rsManTitle").value).toBe("Hostel life and loneliness");
  });
});

describe("Research part 2: connected papers (rsConnected 8498-8523, over the recorded OpenAlex bodies)", () => {
  const paperFor = (c: Connected): RsPaper => ({ ...FETCH.searches.find((s) => s.name === "oa-plain")!.merged[0]!, citedByApiUrl: c.in.citedByApiUrl } as RsPaper);
  const lists = () => [...tid("rs-connected-out")!.querySelectorAll("h4")].map((h4) => {
    const next = h4.nextElementSibling as HTMLElement;
    return { heading: h4.textContent, cards: next.classList.contains("connected-list") ? [...next.querySelectorAll(".paper-card")].map((c) => ({ title: c.querySelector("b")!.textContent, meta: c.querySelector(".meta")!.textContent })) : next.textContent };
  });

  for (const [k, c] of FETCH.connected.entries())
    it(`#${k}: v1's loading line, then the heading and the two lists with their counts`, async () => {
      h.oaKey = null;
      const p = paperFor(c);
      await mount([p]);
      let release: () => void = () => {};
      const gate = new Promise<void>((r) => { release = r; });
      fakeFetch.mockImplementationOnce(async (input) => { await gate; return fakeFetch(input); });
      await click(cardOf(p.title).querySelector('[data-testid="rs-connected"]'));
      expect(tid("rs-connected-out")!.textContent).toBe("🔎 Loading connected papers for “" + p.title + "”…");
      release();
      await until(() => !!tid("rs-connected-out")!.querySelector("h3"));
      // the two requests run at once (the first was held above)
      // v1 had no cited-by URL to fetch here; v2 asks OpenAlex by filter=cites for the paper's id instead (W3, D-S2-25), so the case without a URL
      // sends the case with one's second request and shows its list
      const withUrl = FETCH.connected.find((x) => x.in.citedByApiUrl)!;
      const want = c.in.citedByApiUrl ? c : { ...c, requested: withUrl.requested, citedBy: withUrl.citedBy };
      expect([...requested].sort()).toEqual([...want.requested].sort());
      expect(tid("rs-connected-out")!.querySelector("h3")!.textContent).toBe("🔗 Connected to: " + p.title);
      const none = "None found.";
      expect(lists()).toEqual([
        { heading: want.cites.heading, cards: want.cites.cards.length ? want.cites.cards : none },
        { heading: want.citedBy.heading, cards: want.citedBy.cards.length ? want.citedBy.cards : none }
      ]);
    });

  it("a paper with no cited-by URL asks by filter=cites for its OpenAlex id, with the key (W3)", async () => {
    h.oaKey = "oa-k";
    const p = { ...paperFor(FETCH.connected[0]!), citedByApiUrl: "" };
    await mount([p]);
    await click(cardOf(p.title).querySelector('[data-testid="rs-connected"]'));
    await until(() => !!tid("rs-connected-out")!.querySelector("h3"));
    // the recordings hold the keyless URL; the keyed one is asked for and, unrecorded, comes back empty here
    expect(requested).toContain("https://api.openalex.org/works?filter=cites:W2487945683&per-page=8&select=display_name,authorships,publication_year&api_key=oa-k");
  });

  it("the key goes with the request; a failure shows v1's sentence", async () => {
    h.oaKey = "oa-k";
    const p = paperFor(FETCH.connected[0]!);
    await mount([p]);
    await click(cardOf(p.title).querySelector('[data-testid="rs-connected"]'));
    await until(() => !!tid("rs-connected-out")!.querySelector("h3"));
    expect(requested[0]).toContain("&api_key=oa-k");
    vi.stubGlobal("fetch", () => { throw new Error("blocked"); });
    await click(cardOf(p.title).querySelector('[data-testid="rs-connected"]'));
    await until(() => tid("rs-connected-out")!.textContent === "Could not load connected papers right now — try again in a moment.");
  });
});

describe("Research part 2: Analyse this paper (rsAnalyse 8407-8419)", () => {
  it("keeps the abstract with v1's head for Analyse a paper, opens the tool and says what it is", async () => {
    const ps = fresh();
    const p = ps.find((x) => x.abstract && x.abstract.replace(/\s+/g, "").length >= 150 && x.year && x.venue)!;
    await mount(ps);
    await click(cardOf(p.title).querySelector('[data-testid="rs-analyse"]'));
    expect(h.setPendingAnalyse).toHaveBeenCalledWith({ title: p.title, pages: [p.title + "\n" + p.authors + " (" + p.year + ")" + ". " + p.venue + "\nAbstract\n" + p.abstract!.trim()], src: "abstract" });
    expect(h.go).toHaveBeenCalledWith("/p/p-1/lit/reading");
    expect(toasts()).toEqual(["Abstract loaded. This is a shallow read; load the full paper for a real analysis."]);
  });

  it("no abstract: v1's toast and nothing kept", async () => {
    const ps = fresh();
    ps[0] = { ...ps[0]!, abstract: "", oaUrl: "" };
    await mount(ps);
    await click(cardOf(ps[0]!.title).querySelector('[data-testid="rs-analyse"]'));
    expect(toasts()).toEqual([E.rs2_no_abstract_came_with_2]);
    expect(h.setPendingAnalyse).not.toHaveBeenCalled();
    expect(h.go).not.toHaveBeenCalled();
  });
});
