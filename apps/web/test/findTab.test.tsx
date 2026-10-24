// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { rsEntryFromResultV2, type CitationEntry, type RsPaper } from "@appuscholar/core";
import { editorExtensions } from "../lib/editorExtensions";
import en from "../messages/en.json";

/*
 * The Find tab of the Literature place (wave B Task 18, canvas Find, register row D-S2-123): the search and its AI terms, the filters beside the results,
 * one Keep per paper with the rest in More, the count, the sort and Export together, and a Keep that waits for the library to be read. The search itself is
 * held to the recorded OpenAlex and PubMed responses (research.test.tsx); here, as there, every request must have a recording or the test fails.
 */

type Blob = { value: unknown; loading: boolean; locked: boolean; broken?: boolean; error?: boolean; set: ReturnType<typeof vi.fn>; flush: ReturnType<typeof vi.fn> };
const blob = (value: unknown, over: Partial<Blob> = {}): Blob => ({ value, loading: false, locked: false, set: vi.fn(), flush: vi.fn(async () => true), ...over });
const h = vi.hoisted(() => ({
  blobs: {} as Record<string, Blob>,
  toast: vi.fn(),
  callAI: vi.fn(async (..._a: unknown[]) => ""),
  editor: null as unknown,
  go: vi.fn(),
  setPendingAnalyse: vi.fn(),
  openExport: vi.fn()
}));
vi.mock("@/lib/blobs/useProjectBlob", () => ({
  useProjectBlob: (...a: unknown[]) => h.blobs[a[0] as string] ?? { value: null, loading: false, locked: false, set: () => {}, flush: async () => true }
}));
vi.mock("@/lib/ai/useCallAI", async (orig) => ({ ...(await orig<typeof import("../lib/ai/useCallAI")>()), useCallAI: () => h.callAI }));
vi.mock("@/lib/ai/suggestion", () => ({ useSuggestion: () => ({ editor: h.editor }) }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", scratchProjectId: "scratch-1" }, settings: { field: "psychology" } }) }));
vi.mock("@/components/frame/ProjectContext", () => ({
  useProject: () => ({ project: { id: "p-1" }, projectId: "p-1", documents: [], currentDoc: null, pendingSearch: null, setPendingSearch: () => {}, go: h.go, setPendingAnalyse: h.setPendingAnalyse,
    openExport: h.openExport,
    requestInsert: async (run: (e: never) => void) => { const e = h.editor as { isDestroyed?: boolean } | null; if (!e || e.isDestroyed) return false; run(e as never); return true; } })
}));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => ({ status: "off" }) }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/research/oaKey", () => ({ useOpenAlexKey: () => null }));

import { FindTab } from "../components/literature/FindTab";
import { resetResearch, setResearch } from "../lib/research/useSearch";
import { resetCiteStyle } from "../lib/cite/useLibrary";
import { assertAllRecorded, crossrefNotFound, recordedFetch, taggedEsearchFoundNothing } from "./support/recordedFetch";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const E = en as Record<string, string>;
const CORE_TEST = join(__dirname, "../../../packages/core/test");
type Paper = Record<string, unknown> & { title: string; authors: string; source: string };
type Case = { name: string; in: { topic: string; oa: boolean; pm: boolean; design: string; rank: boolean; terms: string[] }; merged: Paper[]; status: string };
const FX = JSON.parse(readFileSync(join(CORE_TEST, "golden/fetch/cases.json"), "utf8")) as { searches: Case[] };
const run = (name: string) => FX.searches.find((c) => c.name === name)!;
const rf = recordedFetch();

const roots: Root[] = [];
const editors: Editor[] = [];
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => [...document.body.querySelectorAll<HTMLElement>(sel)];
const tid = (id: string) => $(`[data-testid="${id}"]`);
const field = <T extends HTMLElement = HTMLInputElement>(id: string) => $("#" + id) as unknown as T;
async function settle(ms = 0) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }
async function until(pred: () => boolean) {
  for (let i = 0; i < 300; i++) { if (pred()) return; await settle(5); }
  throw new Error("condition not reached");
}
async function mount() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(<FindTab />); });
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
/** Radix opens a menu from its trigger on Enter. */
async function openMore(card: HTMLElement) {
  await act(async () => { card.querySelector('[data-testid="find-more"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
  expect($('[role="menu"]')).not.toBeNull();
}
const menuItems = () => $$('[role="menuitem"]');
/**
 * The recorded run `c`: its sources (the page offers no switch for them), the stand-in for PubMed's tagged search where only v1's query is recorded, Crossref not having
 * the papers a Keep will ask it about (the volume, issue and pages), and the search.
 */
async function search(c: Case) {
  setResearch({ oa: c.in.oa, pm: c.in.pm });
  rf.standIn(taggedEsearchFoundNothing(c.in), ...c.merged.filter((p) => p.source === "OpenAlex" && p.doi).map((p) => crossrefNotFound(String(p.doi))));
  type("rsTopic", c.in.topic);
  type("rsDesign", c.in.design);
  tick(field("rsRank"), c.in.rank);
  await click(tid("rs-find"));
  await until(() => !!tid("rs-status")?.textContent && !tid("rs-status")!.textContent!.includes("Searching"));
}
const toasts = () => h.toast.mock.calls.map((c) => c[0] as string);
const cards = () => $$('[data-testid="rs-card"]');
const keepBtn = (i: number) => cards()[i]!.querySelector<HTMLButtonElement>('[data-testid="find-keep"]')!;
const badges = (card: HTMLElement) => [...card.querySelectorAll('[data-testid="find-badges"] > *')].map((b) => b.textContent);
/** The library after every update the citations blob was given, in order, from `start`. */
const libAfter = (start: CitationEntry[] = []) => h.blobs.citations!.set.mock.calls.reduce((lib: CitationEntry[], call) => (call[0] as (p: CitationEntry[] | null) => CitationEntry[])(lib), start);

beforeEach(() => {
  h.blobs = { citations: blob([]), retraction_cache: blob({}), rs_prefs: blob(null) };
  for (const f of [h.toast, h.go, h.setPendingAnalyse, h.openExport]) f.mockReset();
  h.callAI.mockReset().mockResolvedValue("");
  h.editor = null;
  rf.reset();
  vi.stubGlobal("fetch", rf.fetch);
  resetResearch();
  resetCiteStyle();
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  for (const e of editors.splice(0)) e.destroy();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  assertAllRecorded(rf);
});

describe("Find: the search (canvas Find)", () => {
  it("the topic box is labelled 'Searching for papers on'; Search runs the search; the AI terms come under it as chips, ticked as before", async () => {
    h.callAI.mockResolvedValue('{"terms":["test anxiety","evaluation anxiety"]}');
    await mount();
    expect($('label[for="rsTopic"]')!.textContent).toBe("Searching for papers on");
    expect(tid("rs-find")!.textContent).toBe("Search");
    expect(tid("find-terms-label")).toBeNull();
    type("rsTopic", "exam anxiety");
    await click(tid("rs-terms-btn"));
    await until(() => $$('[data-testid="rs-term"]').length === 2);
    expect(tid("find-terms-label")!.textContent).toBe("Also searching, suggested by AI from your question:");
    const chips = $$('[data-testid="rs-term"]');
    expect(chips.map((c) => [c.textContent, c.querySelector("input")!.checked])).toEqual([["test anxiety", true], ["evaluation anxiety", true]]);
    // a chip is a tick box: unticked, its term is out of the search; ticked again, it is in
    tick(chips[1]!.querySelector("input")!, false);
    expect($$('[data-testid="rs-term"]').map((c) => c.querySelector("input")!.checked)).toEqual([true, false]);
    tick($$('[data-testid="rs-term"]')[1]!.querySelector("input")!, true);
    await search(run("oa-terms"));
    expect(rf.requested.some((u) => u.includes("%22evaluation%20anxiety%22"))).toBe(true);
  });

  it("Enter in the topic box searches, as Search does", async () => {
    await mount();
    setResearch({ oa: true, pm: false });
    type("rsTopic", run("oa-plain").in.topic);
    await act(async () => { field("rsTopic").form!.requestSubmit(); await new Promise((r) => setTimeout(r, 0)); });
    await until(() => tid("rs-status")!.textContent === run("oa-plain").status);
    expect(cards()).toHaveLength(8);
  });

  it("the filters sit in an aside 'Narrow the results' with Kind of study, Published from, Free full text only, Hide retracted papers and Rank by fit; the sources line ends in a Google Scholar link", async () => {
    await mount();
    const aside = tid("find-filters")!;
    expect(aside.tagName).toBe("ASIDE");
    expect(aside.getAttribute("aria-label")).toBe("Narrow the results");
    expect(aside.querySelector("h2")!.textContent).toBe("Narrow the results");
    expect($('label[for="rsDesign"]')!.textContent).toBe("Kind of study");
    expect([...field<HTMLSelectElement>("rsDesign").options].map((o) => [o.value, o.textContent])).toEqual([
      ["any", "Any"], ["rct", "Randomised trial"], ["sr", "Systematic review or meta-analysis"], ["review", "Review article (OpenAlex type; PubMed review)"],
      ["qual", "Qualitative study (words in the title or abstract)"], ["survey", "Survey or questionnaire study (words in the title or abstract)"]
    ]);
    expect(tid("find-design-hint")!.textContent).toBe(E.find_design_hint);
    expect($('label[for="rsFYear"]')!.textContent).toBe("Published from");
    expect(field("rsFYear").placeholder).toBe("Any year");
    expect(field("rsFOA").closest("label")!.textContent).toBe("Free full text only");
    expect(field("rsFRet").closest("label")!.textContent).toBe("Hide retracted papers");
    expect(field("rsRank").closest("label")!.textContent).toBe("Rank by fit to my question (AI)");
    // the AI disclosure that the old label carried stays beside the box
    expect(tid("find-rank-hint")!.textContent).toBe(E.find_rank_hint);
    expect(tid("find-rank-hint")!.textContent).toMatch(/words sent/);
    expect(tid("find-sources")!.textContent).toBe("Sources: OpenAlex and PubMed. Not finding it? Search Google Scholar");
    // the source boxes and the old dialog button are gone
    for (const id of ["rsSrcOA", "rsSrcPubmed"]) expect(field(id)).toBeNull();
    expect(tid("rs-shelf")).toBeNull();
  });

  it("Search Google Scholar opens the topic's search in a new tab; with no topic it asks for one", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    await mount();
    await click(tid("find-scholar"));
    expect(toasts()).toEqual(["Type a search topic first"]);
    expect(open).not.toHaveBeenCalled();
    type("rsTopic", "exam stress");
    await click(tid("find-scholar"));
    expect(open).toHaveBeenCalledWith("https://scholar.google.com/scholar?q=exam%20stress", "_blank", "noopener,noreferrer");
    open.mockRestore();
  });
});

describe("Find: the results (canvas Find)", () => {
  it("above the results: the count, the Sort select and an Export link together; the count says how many match the filters", async () => {
    await mount();
    expect(tid("rs-sort-row")).toBeNull();
    await search(run("oa-plain"));
    expect(tid("find-papers")!.textContent).toBe("8 papers. Showing 8 that match your filters.");
    type("rsFYear", "2021");
    expect(cards()).toHaveLength(5);
    expect(tid("find-papers")!.textContent).toBe("8 papers. Showing 5 that match your filters.");
    const row = tid("rs-sort-row")!;
    expect(row.contains(tid("find-papers"))).toBe(true);
    expect(row.contains(field("rsSort"))).toBe(true);
    expect(row.contains(tid("rs-csv"))).toBe(true);
    expect($('label[for="rsSort"]')!.textContent).toBe("Sort");
    expect(tid("rs-csv")!.textContent).toBe("Export");
    expect(row.compareDocumentPosition(cards()[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the count reads right for one paper, and for one that matches: '1 paper', 'that matches' for 1, 'that match' for 0 and for 2 or more", async () => {
    const [a, b] = run("oa-plain").merged as unknown as RsPaper[];
    const old = { ...b!, year: 2010 } as unknown as RsPaper;
    const recent = { ...a!, year: 2022 } as unknown as RsPaper;
    setResearch({ original: [recent], topic: "growth mindset" });
    await mount();
    expect(tid("find-papers")!.textContent).toBe("1 paper. Showing 1 that matches your filters.");
    type("rsFYear", "2023");
    expect(cards()).toHaveLength(0);
    expect(tid("find-papers")!.textContent).toBe("1 paper. Showing 0 that match your filters.");
    // two papers: one that passes the filter, then both, then none
    type("rsFYear", "");
    await act(async () => { setResearch({ original: [recent, old] }); });
    expect(tid("find-papers")!.textContent).toBe("2 papers. Showing 2 that match your filters.");
    type("rsFYear", "2020");
    expect(tid("find-papers")!.textContent).toBe("2 papers. Showing 1 that matches your filters.");
    type("rsFYear", "2023");
    expect(tid("find-papers")!.textContent).toBe("2 papers. Showing 0 that match your filters.");
  });

  it("there is no CSV button; Export opens the export place with the search list ticked (W11)", async () => {
    await mount();
    await search(run("oa-plain"));
    expect($$("button, a").filter((el) => /csv|download/i.test(el.textContent ?? ""))).toEqual([]);
    await click(tid("rs-csv"));
    expect(h.openExport).toHaveBeenCalledTimes(1);
    expect(h.openExport).toHaveBeenCalledWith("search");
  });

  it("a result shows its title, 'Authors. Year. Journal. Cited n times.' and the badges for a free PDF and a retraction", async () => {
    await mount();
    const c = run("oa-retracted");
    await search(c);
    const i = c.merged.findIndex((p) => p.retracted);
    const p = c.merged[i]!;
    const card = cards()[i]!;
    expect(card.querySelector("h3")!.textContent).toBe(p.title);
    const dot = (s: string) => (s.endsWith(".") ? s : s + ".");
    const cited = p.citationCount ? ` Cited ${p.citationCount} ${p.citationCount === 1 ? "time" : "times"}.` : "";
    expect(card.querySelector('[data-testid="find-meta"]')!.textContent).toBe([p.authors, p.year, p.venue].filter(Boolean).map((x) => dot(String(x))).join(" ") + cited);
    expect(badges(card)).toContain("Retracted");
    expect(card.querySelector('[data-testid="find-badge-retracted"]')!.getAttribute("title")).toBe(E.retr_tip);
    expect(badges(cards()[c.merged.findIndex((x) => x.oaUrl)]!)).toContain("Free PDF");
    expect(badges(cards()[c.merged.findIndex((x) => !x.oaUrl && !x.oaStatus)]!)).not.toContain("Free PDF");
  });

  it("a quick read adds the kind of study and the sample to the badges, under the AI label", async () => {
    const p = { ...run("oa-plain").merged[0]!, quick: { summary: "A short summary.", design: { type: "randomised trial", quote: "q", ok: true }, sample: { n: 1200, quote: "q", ok: true } } } as unknown as RsPaper;
    setResearch({ original: [p], topic: "growth mindset" });
    await mount();
    expect(badges(cards()[0]!)).toEqual(["Free PDF", "Randomised trial", "Sample: 1,200"]);
    expect(cards()[0]!.querySelector('[data-testid="rs-quickbox"]')!.textContent).toContain("AI suggestion");
    // a quick read whose quotes were not found gives no badge
    setResearch({ original: [{ ...p, quick: { design: { type: "randomised trial", quote: "q", ok: false }, sample: { n: 5, quote: "q", ok: false } } } as RsPaper] });
    await settle();
    expect(badges(cards()[0]!)).toEqual(["Free PDF"]);
  });

  it("each result has one primary action and the rest in More", async () => {
    await mount();
    const c = run("oa-plain");
    await search(c);
    for (const card of cards()) {
      // one primary button (Keep) and the More button; nothing else to press until More is open
      expect([...card.querySelectorAll("button")].map((b) => b.getAttribute("data-testid"))).toEqual(["find-keep", "find-more"]);
      expect(card.querySelector('[data-testid="find-keep"]')!.textContent).toBe("Keep");
      expect(card.querySelector('[data-testid="find-more"]')!.textContent).toBe("More");
      expect(card.querySelector('[data-testid="find-more"]')!.getAttribute("aria-label")).toMatch(/^More actions for /);
      expect(card.querySelector('[data-testid="find-more"]')!.getAttribute("aria-haspopup")).toBe("menu");
    }
    // v1's seven buttons are gone
    for (const id of ["rs-insert", "rs-add", "rs-open", "rs-free", "rs-connected", "rs-quick", "rs-analyse"]) expect(tid(id), id).toBeNull();
    // an OpenAlex result with a free link: all six in More, in the plan's order
    const i = c.merged.findIndex((p) => p.oaUrl && p.doi);
    await openMore(cards()[i]!);
    expect(menuItems().map((m) => m.textContent)).toEqual([
      "Put a citation in my document", "Open the paper", "Get the free PDF", "Papers connected to this one", "Read the abstract with AI", "Read it now"
    ]);
    const p = c.merged[i]!;
    const open = tid("find-item-open") as HTMLAnchorElement;
    expect(open.getAttribute("href")).toBe("https://doi.org/" + String(p.doi).split("/").map(encodeURIComponent).join("/"));
    expect([open.target, open.rel]).toEqual(["_blank", "noopener noreferrer"]);
    const pdf = tid("find-item-pdf") as HTMLAnchorElement;
    expect(pdf.getAttribute("href")).toBe(p.oaUrl);
    expect([pdf.target, pdf.rel]).toEqual(["_blank", "noopener noreferrer"]);
  });

  it("a result without a free link has no 'Get the free PDF', a PubMed result no 'Papers connected to this one', and a paper with no DOI opens its link", async () => {
    await mount();
    const c = run("pm-noabstract");
    await search(c);
    await openMore(cards()[0]!);
    expect(menuItems().map((m) => m.textContent)).toEqual(["Put a citation in my document", "Open the paper", "Read the abstract with AI", "Read it now"]);
    expect((tid("find-item-open") as HTMLAnchorElement).getAttribute("href")).toBe(c.merged[0]!.url);
  });

  it("'Why it fits (AI)' appears on a ranked search with the score, and not on an unranked one", async () => {
    h.callAI.mockImplementation(async (...a: unknown[]) => {
      const n = ((a[0] as string).match(/^\[\d+\] TITLE:/gm) ?? []).length;
      return JSON.stringify({ scores: Array.from({ length: n }, (_, k) => ({ id: k + 1, score: 3 - (k % 4), reason: "Reason " + k })) });
    });
    await mount();
    await search(run("oa-rank"));
    const first = cards()[0]!;
    expect(first.querySelector('[data-testid="find-why"]')!.textContent).toMatch(/^Why it fits \(AI\): Reason \d+/);
    expect(first.querySelector('[data-testid="find-fit"]')!.textContent).toBe("Fit 3 of 3");
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    document.body.innerHTML = "";
    resetResearch();
    await mount();
    await search(run("oa-plain"));
    expect(tid("find-why")).toBeNull();
  });

  it("a title-only rating says so", async () => {
    const p = { ...run("oa-plain").merged[0]!, rel: { score: 2, reason: "On the topic.", titleOnly: true } } as unknown as RsPaper;
    setResearch({ original: [p], topic: "growth mindset", sort: "fit" });
    await mount();
    expect(tid("find-why")!.textContent).toBe("Why it fits (AI): On the topic. Rated from the title only.");
    expect(tid("find-fit")!.textContent).toBe("Fit 2 of 3");
  });
});

describe("Find: Keep", () => {
  const firstWithDoi = (c: Case) => c.merged.findIndex((p) => p.doi && p.source === "OpenAlex");

  it("Keep adds one entry with a pid, on the reading list, with the abstract and the free link, and the button says Kept once it is in the library", async () => {
    const root = await mount();
    const c = run("oa-plain");
    await search(c);
    const i = c.merged.findIndex((p) => p.doi && p.abstract && p.oaUrl && p.source === "OpenAlex");
    await click(keepBtn(i));
    const set = h.blobs.citations!.set;
    expect(set).toHaveBeenCalledTimes(1);
    const [entry] = libAfter();
    const p = c.merged[i]!;
    expect(entry).toMatchObject({ title: p.title, doi: p.doi, url: "", rl: true, abstract: String(p.abstract).slice(0, 4000), oa: p.oaUrl });
    expect((entry as { pid?: string }).pid).toMatch(/^k/);
    // the saved library now holds it: the button reads Kept and cannot add it again
    h.blobs.citations = blob([entry]);
    await act(async () => { root.render(<FindTab />); });
    expect(keepBtn(i).textContent).toBe("Kept");
    expect(keepBtn(i).getAttribute("aria-disabled")).toBe("true");
    await click(keepBtn(i));
    expect(set).toHaveBeenCalledTimes(1);
    expect(h.blobs.citations.set).not.toHaveBeenCalled();
  });

  it("Keep on a paper already kept says Kept and adds nothing, whichever way it was kept before (the DOI decides)", async () => {
    const c = run("oa-plain");
    const i = firstWithDoi(c);
    const p = c.merged[i]!;
    // kept earlier from a citation with the DOI written as a link in capitals, and another title
    h.blobs.citations = blob([{ author: "Someone, Else", year: "2001", title: "A different title", doi: "https://doi.org/" + String(p.doi).toUpperCase(), pid: "kearlier1" }]);
    await mount();
    await search(c);
    expect(cards().map((_, k) => keepBtn(k).textContent)).toEqual(cards().map((_, k) => (k === i ? "Kept" : "Keep")));
    await click(keepBtn(i));
    expect(h.blobs.citations!.set).not.toHaveBeenCalled();
  });

  it("a retracted paper kept says so, and the retraction cache is seeded for its DOI", async () => {
    await mount();
    const c = run("oa-retracted");
    await search(c);
    const i = c.merged.findIndex((p) => p.retracted && p.doi);
    await click(keepBtn(i));
    expect(toasts()).toEqual([E.retr_added_warn]);
    const seeded = (h.blobs.retraction_cache!.set.mock.calls[0]![0] as (p: unknown) => Record<string, { r: boolean }>)({});
    expect(seeded[String(c.merged[i]!.doi).toLowerCase()]!.r).toBe(true);
  });

  it("fills the volume, issue and pages from Crossref after keeping an OpenAlex paper, onto the entry that was kept (found by its pid)", async () => {
    const c = run("oa-plain");
    const i = firstWithDoi(c);
    await mount();
    await search(c);
    rf.standIn({
      match: (u) => u.startsWith("https://api.crossref.org/"),
      respond: () => new Response(JSON.stringify({ status: "ok", message: { title: ["x"], author: [{ family: "Other", given: "A." }], volume: "12", issue: "3", page: "45-67", type: "journal-article" } }), { status: 200, headers: { "content-type": "application/json" } })
    });
    await click(keepBtn(i));
    await until(() => h.blobs.citations!.set.mock.calls.length === 2);
    const [kept] = libAfter();
    expect(kept).toMatchObject({ volume: "12", issue: "3", pages: "45-67" });
    expect(rf.requested.filter((u) => u.startsWith("https://api.crossref.org/"))).toEqual(["https://api.crossref.org/works/" + encodeURIComponent(String(c.merged[i]!.doi))]);
  });

  it("while the library is being read, Keep is busy and acts when the library is read", async () => {
    h.blobs.citations = blob([], { loading: true });
    const root = await mount();
    const c = run("oa-plain");
    await search(c);
    const i = firstWithDoi(c);
    await click(keepBtn(i));
    expect(keepBtn(i).getAttribute("aria-busy")).toBe("true");
    expect(keepBtn(i).getAttribute("aria-disabled")).toBe("true");
    expect(h.blobs.citations!.set).not.toHaveBeenCalled();
    // the read lands: the paper is kept once, on top of what was stored
    const stored = [{ author: "Stored, S.", title: "A stored paper that is not the one", year: "1999", pid: "kstored1" }];
    h.blobs.citations = blob(stored);
    await act(async () => { root.render(<FindTab />); });
    expect(h.blobs.citations.set).toHaveBeenCalledTimes(1);
    expect(libAfter(stored)).toHaveLength(2);
    expect(keepBtn(i).hasAttribute("aria-busy")).toBe(false);
  });

  it("while the library is being read, a paper it turns out to hold is not added again", async () => {
    h.blobs.citations = blob([], { loading: true });
    const root = await mount();
    const c = run("oa-plain");
    await search(c);
    const i = firstWithDoi(c);
    await click(keepBtn(i));
    h.blobs.citations = blob([{ title: "Elsewhere", doi: c.merged[i]!.doi, pid: "kread001" }]);
    await act(async () => { root.render(<FindTab />); });
    expect(h.blobs.citations.set).not.toHaveBeenCalled();
    expect(keepBtn(i).textContent).toBe("Kept");
  });

  it("a locked library: Keep waits, the library's locked sentence shows, and the paper is kept on top of the stored library once it opens", async () => {
    h.blobs.citations = blob([], { locked: true });
    const root = await mount();
    await search(run("oa-plain"));
    expect(tid("find-locked")!.textContent).toBe(E.vault_cite_locked);
    await click(keepBtn(0));
    expect(keepBtn(0).getAttribute("aria-busy")).toBe("true");
    expect(h.blobs.citations!.flush).toHaveBeenCalled();
    expect(h.blobs.citations!.set).not.toHaveBeenCalled();
    const stored = [{ author: "Stored, S.", title: "A stored paper that is not the one", year: "1999", pid: "kstored1" }];
    h.blobs.citations = blob(stored);
    await act(async () => { root.render(<FindTab />); });
    expect(tid("find-locked")).toBeNull();
    expect(h.blobs.citations.set).toHaveBeenCalledTimes(1);
    const lib = libAfter(stored);
    expect(lib).toHaveLength(2);
    expect(lib[0]).toEqual(stored[0]);
  });

  it("a library that cannot be opened says so and Keep is off", async () => {
    h.blobs.citations = blob([], { broken: true });
    await mount();
    await search(run("oa-plain"));
    expect(tid("find-broken")!.textContent).toBe(E.vault_cite_broken);
    expect(keepBtn(0).getAttribute("aria-disabled")).toBe("true");
    await click(keepBtn(0));
    expect(h.blobs.citations!.set).not.toHaveBeenCalled();
  });

  it("a library that failed to read says so; the press asks for the read again and keeps nothing", async () => {
    h.blobs.citations = blob([], { error: true });
    await mount();
    await search(run("oa-plain"));
    expect(tid("find-error")!.textContent).toBe(E.find_library_error);
    await click(keepBtn(0));
    expect(h.blobs.citations!.flush).toHaveBeenCalledTimes(1);
    expect(h.blobs.citations!.set).not.toHaveBeenCalled();
    expect(keepBtn(0).hasAttribute("aria-busy")).toBe(false);
  });

  it("a press waiting for a read that then fails is dropped, and nothing is kept", async () => {
    h.blobs.citations = blob([], { loading: true });
    const root = await mount();
    await search(run("oa-plain"));
    await click(keepBtn(0));
    expect(keepBtn(0).getAttribute("aria-busy")).toBe("true");
    h.blobs.citations = blob([], { error: true });
    await act(async () => { root.render(<FindTab />); });
    expect(keepBtn(0).hasAttribute("aria-busy")).toBe(false);
    expect(h.blobs.citations.set).not.toHaveBeenCalled();
    expect(tid("find-error")).not.toBeNull();
  });
});

describe("Find: Keep, after a failed save and for a keyboard or screen-reader student", () => {
  const firstWithDoi = (c: Case) => c.merged.findIndex((p) => p.doi && p.source === "OpenAlex");

  it("a kept paper still reads Kept after a save fails (the blob client sets error while the library is known and the keep is held for a retry)", async () => {
    const root = await mount();
    const c = run("oa-plain");
    await search(c);
    const i = firstWithDoi(c);
    await click(keepBtn(i));
    const [entry] = libAfter();
    // the save then failed: the library still holds the keep, the client holds it for a retry, and says the save failed
    h.blobs.citations = blob([entry], { error: true });
    await act(async () => { root.render(<FindTab />); });
    expect(tid("find-error")).not.toBeNull();
    expect(cards().map((_, k) => keepBtn(k).textContent)).toEqual(cards().map((_, k) => (k === i ? "Kept" : "Keep")));
    expect(keepBtn(i).getAttribute("aria-disabled")).toBe("true");
  });

  it("a library that failed to read shows no paper as Kept (nothing is known about it)", async () => {
    h.blobs.citations = blob(null, { error: true });
    await mount();
    await search(run("oa-plain"));
    expect(cards().every((_, k) => keepBtn(k).textContent === "Keep")).toBe(true);
  });

  it("Keep is aria-disabled, never disabled, while busy and once Kept, so focus stays on it; the click is ignored then", async () => {
    h.blobs.citations = blob([], { loading: true });
    const root = await mount();
    const c = run("oa-plain");
    await search(c);
    const i = firstWithDoi(c);
    const btn = keepBtn(i);
    act(() => { btn.focus(); });
    expect(document.activeElement).toBe(btn);
    await click(btn);
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    expect(btn.hasAttribute("disabled")).toBe(false);
    expect(document.activeElement).toBe(btn);
    // a second press while it waits is ignored: the paper is kept once
    await click(btn);
    h.blobs.citations = blob([]);
    await act(async () => { root.render(<FindTab />); });
    expect(h.blobs.citations.set).toHaveBeenCalledTimes(1);
    // the library now holds the keep
    const [entry] = libAfter();
    h.blobs.citations = blob([entry]);
    await act(async () => { root.render(<FindTab />); });
    expect(keepBtn(i)).toBe(btn);
    expect(btn.textContent).toBe("Kept");
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    expect(btn.hasAttribute("disabled")).toBe(false);
    expect(document.activeElement).toBe(btn);
    await click(btn);
    expect(h.blobs.citations.set).not.toHaveBeenCalled();
  });

  it("one polite live region says 'Kept: {title}' when a Keep went through, and nothing when it did not", async () => {
    h.blobs.citations = blob([], { error: true });
    const root = await mount();
    const c = run("oa-plain");
    await search(c);
    const live = $$('[data-testid="find-announce"]');
    expect(live).toHaveLength(1);
    expect(live[0]!.getAttribute("role")).toBe("status");
    expect(live[0]!.getAttribute("aria-live")).toBe("polite");
    // the region is in the page before anything is said, and no result carries a live region of its own
    expect(live[0]!.textContent).toBe("");
    expect(cards().flatMap((card) => [...card.querySelectorAll('[aria-live], [role="status"], [role="alert"]')])).toEqual([]);
    // a Keep that keeps nothing (the library failed to read) says nothing
    await click(keepBtn(0));
    expect(tid("find-announce")!.textContent).toBe("");
    // the read is made, and a Keep goes through
    h.blobs.citations = blob([]);
    await act(async () => { root.render(<FindTab />); });
    const i = firstWithDoi(c);
    await click(keepBtn(i));
    expect(tid("find-announce")!.textContent).toBe("Kept: " + c.merged[i]!.title);
    expect($$('[data-testid="find-announce"]')).toHaveLength(1);
  });
});

describe("Find: More", () => {
  it("Put a citation in my document keeps the paper and puts the in-text citation at the cursor", async () => {
    const ed = new Editor({ extensions: editorExtensions, content: "<p>Learning is social.</p>" });
    editors.push(ed);
    h.editor = ed;
    await mount();
    const c = run("oa-plain");
    await search(c);
    const i = c.merged.findIndex((p) => p.doi && p.source === "OpenAlex");
    await openMore(cards()[i]!);
    await click(tid("find-item-cite"));
    expect(h.blobs.citations!.set).toHaveBeenCalledTimes(1);
    const [kept] = libAfter();
    expect(kept).toMatchObject({ rl: true, doi: c.merged[i]!.doi });
    const entry = rsEntryFromResultV2({ ...(c.merged[i] as unknown as RsPaper) }, "apa");
    expect(ed.getText()).toContain(entry.author!.split(",")[0]!);
    expect(toasts()).toEqual([E.rs_inserted]);
  });

  it("Read it now keeps the paper, loads its abstract into Analyse a paper and opens the Reading list here", async () => {
    await mount();
    const c = run("oa-plain");
    await search(c);
    const i = c.merged.findIndex((p) => String(p.abstract ?? "").replace(/\s+/g, "").length >= 150 && p.year && p.venue);
    const p = c.merged[i]!;
    await openMore(cards()[i]!);
    await click(tid("find-item-read"));
    expect(h.blobs.citations!.set).toHaveBeenCalledTimes(1);
    expect(h.setPendingAnalyse).toHaveBeenCalledWith({ title: p.title, pages: [p.title + "\n" + p.authors + " (" + p.year + ")" + ". " + p.venue + "\nAbstract\n" + String(p.abstract).trim()], src: "abstract" });
    expect(h.go).toHaveBeenCalledWith("/p/p-1/lit/reading");
    expect(toasts()).toEqual(["Abstract loaded. This is a shallow read; load the full paper for a real analysis."]);
  });

  it("Read it now on a paper already kept keeps nothing again, and still opens the Reading list", async () => {
    const c = run("oa-plain");
    const i = c.merged.findIndex((p) => p.doi && String(p.abstract ?? "").replace(/\s+/g, "").length >= 150);
    h.blobs.citations = blob([{ title: "Elsewhere", doi: c.merged[i]!.doi, pid: "kearly01" }]);
    await mount();
    await search(c);
    await openMore(cards()[i]!);
    await click(tid("find-item-read"));
    expect(h.blobs.citations!.set).not.toHaveBeenCalled();
    expect(h.setPendingAnalyse).toHaveBeenCalledTimes(1);
    expect(h.go).toHaveBeenCalledWith("/p/p-1/lit/reading");
  });

  it("Read it now on a paper with no abstract still keeps the paper, says there is nothing to read, and stays on Find", async () => {
    await mount();
    await search(run("pm-noabstract"));
    await openMore(cards()[0]!);
    await click(tid("find-item-read"));
    expect(h.blobs.citations!.set).toHaveBeenCalledTimes(1);
    expect(h.setPendingAnalyse).not.toHaveBeenCalled();
    expect(h.go).not.toHaveBeenCalled();
    expect(toasts()).toEqual([E.rs2_no_abstract_came_with_2]);
  });

  it("on a library that cannot be opened, 'Put a citation in my document' and 'Read it now' are off like Keep (the others still work)", async () => {
    const ed = new Editor({ extensions: editorExtensions, content: "<p>Learning is social.</p>" });
    editors.push(ed);
    h.editor = ed;
    h.blobs.citations = blob([], { broken: true });
    await mount();
    const c = run("oa-plain");
    await search(c);
    const i = c.merged.findIndex((p) => p.oaUrl && p.doi);
    await openMore(cards()[i]!);
    for (const id of ["find-item-cite", "find-item-read"]) {
      const item = tid(id)!;
      expect(item.getAttribute("aria-disabled"), id).toBe("true");
      expect(item.hasAttribute("data-disabled"), id).toBe(true);
    }
    for (const id of ["find-item-open", "find-item-pdf", "find-item-connected", "find-item-quick"]) expect(tid(id)!.getAttribute("aria-disabled"), id).toBeNull();
    const before = ed.getText();
    await click(tid("find-item-cite"));
    await click(tid("find-item-read"));
    expect(h.blobs.citations!.set).not.toHaveBeenCalled();
    expect(ed.getText()).toBe(before);
    expect(h.setPendingAnalyse).not.toHaveBeenCalled();
    expect(h.go).not.toHaveBeenCalled();
    expect(toasts()).toEqual([]);
  });

  it("on a library that opens, those two items are on", async () => {
    await mount();
    const c = run("oa-plain");
    await search(c);
    await openMore(cards()[0]!);
    for (const id of ["find-item-cite", "find-item-read"]) expect(tid(id)!.getAttribute("aria-disabled"), id).toBeNull();
  });

  it("Read it now does not read the abstract of a paper the library would not take (a library that cannot be read)", async () => {
    h.blobs.citations = blob([], { broken: true });
    await mount();
    await search(run("oa-plain"));
    await openMore(cards()[0]!);
    await click(tid("find-item-read"));
    expect(h.setPendingAnalyse).not.toHaveBeenCalled();
    expect(h.go).not.toHaveBeenCalled();
  });
});

describe("Find: the test double", () => {
  it("a request the test double has no recording for fails the test", async () => {
    await mount();
    setResearch({ oa: true, pm: false });
    type("rsTopic", "a topic nobody recorded for this test");
    await click(tid("rs-find"));
    await until(() => rf.unrecorded().length > 0);
    expect(rf.unrecorded()[0]).toMatch(/^https:\/\/api\.openalex\.org\/works\?search=a%20topic%20nobody%20recorded/);
    // every test in this file ends with this check; here it is shown to throw, then cleared because the request was made on purpose
    expect(() => assertAllRecorded(rf)).toThrow(/no recording/);
    rf.forget();
  });

  it("a stand-in answers only the URL it names", async () => {
    const url = "https://example.test/stand-in";
    rf.standIn({ match: (u) => u === url, respond: () => new Response("ok") });
    expect(await (await rf.fetch(url)).text()).toBe("ok");
    await expect(rf.fetch(url + "?other=1")).rejects.toThrow("Failed to fetch");
    expect(rf.unrecorded()).toEqual([url + "?other=1"]);
    rf.forget();
  });
});

describe("Find: Add from any journal page (Task 20, W6)", () => {
  it("the bookmark's section sits under the search, before the filters and the results, with the heading, the line and the button", async () => {
    await mount();
    const section = tid("add-from-page")!;
    expect(section.querySelector("h2")!.textContent).toBe("Add from any journal page");
    expect(section.querySelector("p")!.textContent).toBe("Drag this button to your bookmarks bar. On a paper's page, click it to keep that paper here.");
    const btn = section.querySelector<HTMLAnchorElement>('[data-testid="add-bookmark"]')!;
    expect(btn.textContent).toBe("Keep in Appuscholar");
    expect(decodeURIComponent(btn.getAttribute("href")!)).toContain(window.location.origin + "/add#capture=");
    const find = tid("panel-find")!;
    const order = [...find.children];
    expect(order.indexOf(section)).toBeGreaterThan(order.indexOf(find.querySelector(".find-search")!));
    expect(order.indexOf(section)).toBeLessThan(order.indexOf(find.querySelector(".find-grid")!));
  });
});

describe("Find: the layout rules (375 px wide, tokens only)", () => {
  const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1]!.trim(), body: m[2]!.trim(), at: m.index ?? 0 }));
  /** The Find rules are the last in the file, with their own phone block (up to 700px) at the end. */
  const phoneStart = css.lastIndexOf("@media (max-width: 700px)");
  const findStart = css.indexOf("/* Find (wave B Task 18");
  const find = rules.filter((r) => r.at > findStart && /\.find-/.test(r.sel));
  const phone = find.filter((r) => r.at > phoneStart);

  it("the filters never sit beside the results on a phone, and chips, ticks and buttons are 44 px targets", () => {
    expect(phone.find((r) => /\.find-grid\b/.test(r.sel))?.body).toMatch(/flex-direction:\s*column/);
    for (const cls of [".find-chip", ".find-check", ".find-keep"]) expect(phone.find((r) => r.sel.includes(cls))?.body, cls).toMatch(/min-height:\s*44px/);
  });

  it("the AI line has a gold edge", () => {
    expect(find.find((r) => /\.find-why\b/.test(r.sel))?.body).toMatch(/border-left:[^;]*var\(--gold\)/);
  });

  it("the AI box inside a result has a gold edge too (not the purple of the tools' own boxes)", () => {
    const box = find.find((r) => /\.find-result\s+\.rs-quick\b/.test(r.sel));
    expect(box?.body).toMatch(/border-left:[^;]*var\(--gold\)/);
    // the shared rule is left as it is: other tools' boxes keep their edge
    expect(rules.find((r) => r.sel.endsWith(".rs-quick") && !/find-result/.test(r.sel))?.body).toMatch(/border-left:[^;]*var\(--purple-600\)/);
  });

  it("uses colour tokens only: no hex or rgb colour in a .find- rule", () => {
    expect(find.length).toBeGreaterThan(10);
    for (const r of find) expect(r.body, r.sel).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
  });
});
