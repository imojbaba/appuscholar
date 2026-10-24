// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { rsAuthorListToCit, rsEntryFromResult, rsEntryFromResultV2, type CitationEntry, type RsPaper } from "@appuscholar/core";
import { editorExtensions } from "../lib/editorExtensions";
import en from "../messages/en.json";

/*
 * The Research panel, part 1 (v1 950-1034, researchSearch 8283-8330, rsApplySort / rsRenderResults 8347-8406, rsAddToLibrary / rsInsertCitation
 * 8471-8491): the form in v1's order, the search over the recorded OpenAlex and PubMed responses with v1's status line, the sort row, the cards,
 * the rank path with its fold, the related terms, the two library buttons, the rank preference and the selection bubble's pending search.
 */

type Blob = { value: unknown; loading: boolean; locked: boolean; broken?: boolean; set: ReturnType<typeof vi.fn>; flush: ReturnType<typeof vi.fn> };
const blob = (value: unknown): Blob => ({ value, loading: false, locked: false, set: vi.fn(), flush: vi.fn(async () => true) });
const h = vi.hoisted(() => ({
  blobs: {} as Record<string, Blob>,
  blobArgs: [] as unknown[][],
  toast: vi.fn(),
  callAI: vi.fn(async (..._a: unknown[]) => ""),
  editor: null as unknown,
  oaKey: null as string | null,
  pending: null as string | null,
  setPending: vi.fn(),
  go: vi.fn()
}));
vi.mock("@/lib/blobs/useProjectBlob", () => ({
  useProjectBlob: (...a: unknown[]) => { h.blobArgs.push(a); return h.blobs[a[0] as string] ?? { value: null, loading: false, locked: false, set: () => {}, flush: async () => true }; }
}));
vi.mock("@/lib/ai/useCallAI", async (orig) => ({ ...(await orig<typeof import("../lib/ai/useCallAI")>()), useCallAI: () => h.callAI }));
vi.mock("@/lib/ai/suggestion", () => ({ useSuggestion: () => ({ editor: h.editor }) }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", scratchProjectId: "scratch-1" }, settings: { field: "psychology" } }) }));
vi.mock("@/components/frame/ProjectContext", () => ({
  useProject: () => ({ project: { id: "p-1" }, projectId: "p-1", documents: [], currentDoc: null, pendingSearch: h.pending, setPendingSearch: h.setPending, go: h.go,
    requestInsert: async (run: (e: never) => void) => { const e = h.editor as { isDestroyed?: boolean } | null; if (!e || e.isDestroyed) return false; run(e as never); return true; } })
}));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => ({ status: "off" }) }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/research/oaKey", () => ({ useOpenAlexKey: () => h.oaKey }));

import { ResearchPanel } from "../components/tools/research/ResearchPanel";
import { resetResearch } from "../lib/research/useSearch";
import { resetCiteStyle } from "../lib/cite/useLibrary";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const E = en as Record<string, string>;
const CORE_TEST = join(__dirname, "../../../packages/core/test");
type Rec = { url: string; status: number; headers: Record<string, string | null>; body: string };
const RECS = new Map<string, Rec>(readdirSync(join(CORE_TEST, "fetch/recorded")).filter((f) => f.endsWith(".json") && f !== "v2-manifest.json").map((f) => {
  const r = JSON.parse(readFileSync(join(CORE_TEST, "fetch/recorded", f), "utf8")) as Rec;
  return [r.url, r];
}));
type Paper = Record<string, unknown> & { title: string; authors: string; source: string };
type Case = { name: string; in: { topic: string; oa: boolean; pm: boolean; design: string; rank: boolean; terms: string[] }; merged: Paper[]; status: string };
const FX = JSON.parse(readFileSync(join(CORE_TEST, "golden/fetch/cases.json"), "utf8")) as { searches: Case[] };
const run = (name: string) => FX.searches.find((c) => c.name === name)!;

let requested: string[] = [];
/** Crossref's answer for "+ Citation library"'s lookup (W2); null: Crossref is not recorded here, so the request fails as offline. */
let crossref: ((url: string, init?: RequestInit) => Promise<Response>) | null = null;
const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  requested.push(url);
  if (crossref && url.startsWith("https://api.crossref.org/")) return crossref(url, init);
  const r = RECS.get(url);
  // W12: PubMed is asked first for the topic's words tagged [tiab] (pmSearchV2). Where that search was not recorded, PubMed answers that it found nothing, so pmSearchV2
  // runs v1's search once, which is recorded: these cases hold the panel to v1's papers and status, and the fallback is what gets them.
  if (!r && url.startsWith("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?") && url.includes("%5Btiab%5D")) {
    return new Response('{"esearchresult":{"idlist":[]}}', { status: 200, headers: { "content-type": "application/json; charset=UTF-8" } });
  }
  if (!r) throw new TypeError("Failed to fetch");
  return new Response(r.body, { status: r.status, headers: r.headers["content-type"] ? { "content-type": r.headers["content-type"] } : {} });
});

/** Every author of an OpenAlex result, as the recorded search body lists them (rsFetchOpenAlex's authorList, W2). */
function oaAuthorList(title: string): string[] {
  for (const r of RECS.values()) {
    if (!r.url.startsWith("https://api.openalex.org/works?search=") || r.status !== 200) continue;
    const w = ((JSON.parse(r.body) as { results?: Array<{ display_name?: string; authorships?: Array<{ author?: { display_name?: string } | null }> }> }).results ?? []).find((x) => x.display_name === title);
    if (w) return (w.authorships ?? []).map((a) => a.author?.display_name ?? "").filter(Boolean);
  }
  throw new Error("no recorded OpenAlex result titled " + title);
}
/** The entry "+ Citation library" saves for a result of the golden list: rsEntryFromResultV2 of the paper as the search built it (with every author). */
const v2Entry = (p: Paper) => rsEntryFromResultV2({ ...(p as unknown as RsPaper), authorList: p.source === "OpenAlex" ? oaAuthorList(p.title) : undefined }, "apa");
/** The library after every update the citations blob was given, in order, from `start`. */
const libAfter = (start: CitationEntry[] = []) => h.blobs.citations!.set.mock.calls.reduce((lib: CitationEntry[], call) => (call[0] as (p: CitationEntry[] | null) => CitationEntry[])(lib), start);

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
async function search(c: Case) {
  type("rsTopic", c.in.topic);
  type("rsDesign", c.in.design);
  tick(field("rsSrcOA"), c.in.oa);
  tick(field("rsSrcPubmed"), c.in.pm);
  tick(field("rsRank"), c.in.rank);
  await click(tid("rs-find"));
  await until(() => !!tid("rs-status")?.textContent && tid("rs-status")!.textContent !== "🔎 Searching…" && !tid("rs-status")!.textContent!.startsWith("🔎"));
}
const toasts = () => h.toast.mock.calls.map((c) => c[0] as string);
const cards = () => $$('[data-testid="rs-card"]');
const titles = () => cards().map((c) => c.querySelector("h4")!.textContent);

beforeEach(() => {
  h.blobs = { citations: blob([]), retraction_cache: blob({}), rs_prefs: blob(null) };
  h.blobArgs = [];
  h.toast.mockReset();
  h.callAI.mockReset().mockResolvedValue("");
  h.editor = null;
  h.oaKey = null;
  h.pending = null;
  h.setPending.mockReset();
  requested = [];
  crossref = null;
  fakeFetch.mockClear();
  vi.stubGlobal("fetch", fakeFetch);
  resetResearch();
  resetCiteStyle();
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  for (const e of editors.splice(0)) e.destroy();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("Research: the form (v1 950-965)", () => {
  it("v1's controls in v1's order with v1's labels", async () => {
    await mount();
    const order = ["rs-topic", "rs-terms-btn", "rs-design", "rs-terms", "rs-rank", "rs-src-oa", "rs-src-pm", "rs-shelf", "rs-find", "rs-status"];
    const els = order.map((id) => tid(id));
    for (let i = 1; i < els.length; i++) expect(els[i - 1]!.compareDocumentPosition(els[i]!) & Node.DOCUMENT_POSITION_FOLLOWING, order[i]).toBeTruthy();
    expect($('label[for="rsTopic"]')!.textContent).toBe(E.research_topic_label);
    expect(field("rsTopic").placeholder).toBe(E.rs2_topic_placeholder);
    expect(tid("rs-terms-btn")!.textContent).toBe("💡 Suggest related terms");
    expect([...field<HTMLSelectElement>("rsDesign").options].map((o) => [o.value, o.textContent])).toEqual([
      ["any", "Any"], ["rct", "Randomised trial"], ["sr", "Systematic review or meta-analysis"], ["review", "Review article (OpenAlex type; PubMed review)"],
      ["qual", "Qualitative study (words in the title or abstract)"], ["survey", "Survey or questionnaire study (words in the title or abstract)"]
    ]);
    expect(tid("rs-rank")!.textContent).toBe(E.rs2_rank_by_fit_to);
    expect(field("rsRank").checked).toBe(false);
    expect(field("rsSrcOA").checked).toBe(true);
    expect(field("rsSrcPubmed").checked).toBe(true);
    expect(tid("rs-src-oa")!.textContent).toBe(E.research_src_openalex);
    expect(tid("rs-src-pm")!.textContent).toBe(E.research_src_pubmed);
    expect(tid("rs-shelf")!.textContent).toBe("📚 Reading shelf (your own PDFs)");
    expect(tid("rs-find")!.textContent).toBe(E.research_find_btn);
    expect(tid("rs-sort-row")).toBeNull();
  });

  it("the Reading shelf button opens the shelf on its Papers tab (shOpen 11601), and reads the project's shelf blobs", async () => {
    await mount();
    expect(tid("shelf-dialog")).toBeNull();
    await click(tid("rs-shelf"));
    expect(toasts()).toEqual([]);
    expect(tid("shelf-dialog")!.querySelector("h2")!.textContent).toBe(E.sh2_reading_shelf);
    expect(tid("sh-tab-papers")!.getAttribute("aria-selected")).toBe("true");
    expect(h.blobArgs.some((a) => a[0] === "shelf_index" && a[1] === "p-1")).toBe(true);
    expect(h.blobArgs.some((a) => a[0] === "shelf_cols" && a[1] === "p-1")).toBe(true);
  });

  it("an empty topic toasts v1's sentence; symbols alone write it in the status", async () => {
    await mount();
    await click(tid("rs-find"));
    expect(toasts()).toEqual(["Type a topic or question first"]);
    type("rsTopic", "%%% ???");
    await click(tid("rs-find"));
    expect(tid("rs-status")!.textContent).toBe("Use some words or numbers in the search. Symbols alone find nothing.");
    expect(requested).toEqual([]);
  });
});

describe("Research: a search (researchSearch 8283-8330)", () => {
  for (const name of ["both-merge", "oa-plain", "pm-plain", "both-oa429", "oa-zero"]) {
    it(`${name}: v1's status line and its papers, in v1's order`, async () => {
      await mount();
      const c = run(name);
      await search(c);
      expect(tid("rs-status")!.textContent).toBe(c.status);
      expect(titles()).toEqual(c.merged.map((p) => p.title));
      expect(!!tid("rs-sort-row")).toBe(c.merged.length > 0);
    });
  }

  it("the results survive the panel closing and opening again (the dock's AI tab), in memory only", async () => {
    const r = await mount();
    await search(run("oa-plain"));
    act(() => r.unmount());
    roots.splice(roots.indexOf(r), 1);
    await mount();
    expect(cards()).toHaveLength(8);
    expect(tid("rs-status")!.textContent).toBe(run("oa-plain").status);
    // nothing about the search is stored: only rs_prefs is ever written, and only when the box changed
    for (const k of ["citations", "retraction_cache", "rs_prefs"]) expect(h.blobs[k]!.set).not.toHaveBeenCalled();
  });

  it("the OpenAlex key reaches the search URL", async () => {
    h.oaKey = "oa-test-key";
    await mount();
    type("rsTopic", "growth mindset academic achievement");
    tick(field("rsSrcPubmed"), false);
    await click(tid("rs-find"));
    await until(() => requested.length > 0);
    expect(requested[0]).toContain("&api_key=oa-test-key");
  });

  it("the selection bubble's pending text becomes the topic and is searched at once, then cleared", async () => {
    h.pending = "caffeine sleep quality";
    await mount();
    await until(() => tid("rs-status")!.textContent === run("both-oa429").status);
    expect(field("rsTopic").value).toBe("caffeine sleep quality");
    expect(h.setPending).toHaveBeenCalledWith(null);
    expect(cards()).toHaveLength(6);
  });
});

describe("Research: the cards (rsRenderResults 8376-8406)", () => {
  it("title, source tag, authors, year, venue and citations; v1's buttons in v1's order", async () => {
    await mount();
    const c = run("oa-plain");
    await search(c);
    const p = c.merged[0]!;
    const card = cards()[0]!;
    expect(card.querySelector(".src-tag")!.textContent).toBe("OpenAlex");
    const meta = card.querySelector(".meta")!.textContent!;
    const cites = p.citationCount ? " · " + p.citationCount + " citations" : "";
    const badges = [...card.querySelectorAll(".meta > span")].map((s) => s.textContent).join("");
    expect(meta).toBe(badges + p.authors + (p.year ? " · " + p.year : "") + (p.venue ? " · " + p.venue : "") + cites);
    const labels = [...card.querySelectorAll(".row button")].map((b) => b.textContent);
    expect(labels).toEqual([E.rs_insert_cite, "+ Citation library", "Open source", ...(p.oaUrl ? ["📄 " + E.oa_free_btn] : []), "🔗 Connected papers", "⚡ Quick read", "📄 Analyse this paper"]);
    expect(card.querySelector('[data-testid="rs-quick"]')!.getAttribute("title")).toBe("One-line summary, kind of study and sample size, read from the abstract");
    expect(card.querySelector('[data-testid="rs-analyse"]')!.getAttribute("title")).toBe("Read the abstract with the Analyse a paper tool");
    // no quick-read box before a quick read (researchExtras.test.tsx covers the box)
    expect(card.querySelector('[data-testid="rs-quickbox"]')).toBeNull();
  });

  it("the open-access badge, the retracted badge and Show more / less", async () => {
    await mount();
    const c = run("oa-retracted");
    await search(c);
    const i = c.merged.findIndex((p) => p.retracted);
    const card = cards()[i]!;
    const badge = card.querySelector(".retr-badge")!;
    expect(badge.textContent).toBe("⚠ " + E.retr_badge);
    expect(badge.getAttribute("title")).toBe(E.retr_tip);
    const j = c.merged.findIndex((p) => p.oaStatus);
    if (j >= 0) {
      const oa = cards()[j]!.querySelector(".oa-badge")!;
      const st = c.merged[j]!.oaStatus as string;
      expect(oa.className).toBe("oa-badge oa-" + st);
      expect(oa.textContent).toBe(E.oa_badge_fmt!.replace("{type}", st));
      expect(oa.getAttribute("title")).toBe(E["oa_tip_" + st]);
    }
    const k = c.merged.findIndex((p) => p.abstract);
    const abs = cards()[k]!.querySelector(".abs")!;
    expect(abs.textContent).toBe(c.merged[k]!.abstract);
    expect(abs.classList.contains("open")).toBe(false);
    const more = cards()[k]!.querySelector<HTMLElement>('[data-testid="rs-more"]')!;
    expect(more.textContent).toBe("Show more / less");
    await click(more);
    expect(abs.classList.contains("open")).toBe(true);
    await click(more);
    expect(abs.classList.contains("open")).toBe(false);
  });

  it("a ticked box shows the actions block; a new sort hides it and keeps the tick (v1 8374, 8405)", async () => {
    await mount();
    await search(run("both-merge"));
    expect((tid("rs-actions") as HTMLElement).hidden).toBe(true);
    const box = cards()[2]!.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    tick(box, true);
    expect((tid("rs-actions") as HTMLElement).hidden).toBe(false);
    const title = titles()[2];
    type("rsSort", "citations");
    expect((tid("rs-actions") as HTMLElement).hidden).toBe(true);
    const at = titles().indexOf(title!);
    expect(cards()[at]!.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
  });

  it("the sort select: v1's four options; most cited and newest first reorder the cards", async () => {
    await mount();
    const c = run("both-merge");
    await search(c);
    expect([...field<HTMLSelectElement>("rsSort").options].map((o) => [o.value, o.textContent])).toEqual([
      ["relevance", E.research_sort_relevance], ["citations", E.research_sort_citations], ["year", E.research_sort_year], ["fit", "Fit to my question (AI)"]
    ]);
    expect(field<HTMLSelectElement>("rsSort").value).toBe("relevance");
    type("rsSort", "citations");
    const cited = c.merged.map((p, i) => ({ p, i })).sort((a, b) => ((b.p.citationCount as number) || 0) - ((a.p.citationCount as number) || 0) || a.i - b.i).map((x) => x.p.title);
    expect(titles()).toEqual(cited);
    type("rsSort", "year");
    expect(titles()[0]).toBe(c.merged.map((p, i) => ({ p, i })).sort((a, b) => (parseInt(b.p.year as string, 10) || 0) - (parseInt(a.p.year as string, 10) || 0) || a.i - b.i)[0]!.p.title);
    type("rsSort", "relevance");
    expect(titles()).toEqual(c.merged.map((p) => p.title));
  });
});

describe("Research: Rank by fit (rsRank 8220-8234, the fold 8402-8403)", () => {
  it("ranked: the fit sort, the Fit chip, the fold of fit 0 or 1, the disclosure in the status, the box stored", async () => {
    let call = 0;
    h.callAI.mockImplementation(async (...a: unknown[]) => {
      const prompt = a[0] as string;
      const n = (prompt.match(/^\[\d+\] TITLE:/gm) ?? []).length;
      call++;
      return JSON.stringify({ scores: Array.from({ length: n }, (_, k) => ({ id: k + 1, score: (k + call) % 4, reason: "Reason " + k })) });
    });
    await mount();
    const c = run("oa-rank");
    await search(c);
    expect(h.callAI).toHaveBeenCalledTimes(2);
    // Ranking reads published abstracts: it opts out of name suggestions (C13, Task 11). "Suggest related terms" (below) is made from the student's own topic and does not.
    expect(h.callAI.mock.calls.map((x) => x[1])).toEqual([{ temp: 0.1, max: 1500, noLang: true, literature: true }, { temp: 0.1, max: 1500, noLang: true, literature: true }]);
    expect(tid("rs-status")!.textContent).toMatch(/^22 papers found · ranked by fit to your question \(22 of 22 scored, about [\d,]+ words sent to your AI\)$/);
    expect(field<HTMLSelectElement>("rsSort").value).toBe("fit");
    const chips = cards().map((card) => card.querySelector('[data-testid="rs-fit"]')!.textContent);
    expect(chips[0]).toMatch(/^Fit 3\/3 Direct( \(title only\))? AI suggestion: Reason \d+$/);
    const fold = tid("rs-fold") as HTMLDetailsElement;
    const low = cards().filter((card) => fold.contains(card));
    expect(fold.querySelector("summary")!.textContent).toBe(low.length + " probably not relevant (fit 0 or 1). Nothing is deleted.");
    expect(low.every((card) => /^Fit [01]\/3/.test(card.querySelector('[data-testid="rs-fit"]')!.textContent!))).toBe(true);
    expect(cards().filter((card) => !fold.contains(card)).every((card) => /^Fit [23]\/3/.test(card.querySelector('[data-testid="rs-fit"]')!.textContent!))).toBe(true);
    // the box is remembered (v1 8306) as an update of the rs_prefs blob
    const set = h.blobs.rs_prefs!.set;
    expect(set).toHaveBeenCalledTimes(1);
    expect((set.mock.calls[0]![0] as (p: unknown) => unknown)(null)).toEqual({ rank: true });
    expect((set.mock.calls[0]![0] as (p: unknown) => unknown)({ rank: false, other: 1 })).toEqual({ rank: true, other: 1 });
  });

  it("two overlapping ranked searches: the first stops calling the AI once the second begins, and the second's results stay", async () => {
    let release!: (v: string) => void;
    const reply = (prompt: string, score: number) => JSON.stringify({ scores: Array.from({ length: (prompt.match(/^\[\d+\] TITLE:/gm) ?? []).length }, (_, k) => ({ id: k + 1, score, reason: "R" })) });
    h.callAI.mockImplementationOnce(() => new Promise<string>((r) => { release = r; }));
    h.callAI.mockImplementation(async (...a: unknown[]) => reply(a[0] as string, 3));
    await mount();
    const c = run("oa-rank");
    type("rsTopic", c.in.topic);
    tick(field("rsSrcPubmed"), false);
    tick(field("rsRank"), true);
    await click(tid("rs-find"));
    await until(() => h.callAI.mock.calls.length === 1);
    // the second search, while the first waits on its first batch
    await click(tid("rs-find"));
    await until(() => tid("rs-status")!.textContent === "22 papers found · ranked by fit to your question (22 of 22 scored, about " + tid("rs-status")!.textContent!.split("about ")[1]);
    expect(h.callAI).toHaveBeenCalledTimes(3);
    const second = tid("rs-status")!.textContent;
    // the first search's batch comes back (with no scores): it neither ranks on nor writes
    await act(async () => { release(reply(String(h.callAI.mock.calls[0]![0]), 0)); await new Promise((r) => setTimeout(r, 20)); });
    expect(h.callAI).toHaveBeenCalledTimes(3);
    expect(tid("rs-status")!.textContent).toBe(second);
    expect(cards()[0]!.querySelector('[data-testid="rs-fit"]')!.textContent).toMatch(/^Fit 3\/3/);
    expect(tid("rs-fold")).toBeNull();
  });

  it("a stored rank preference ticks the box on mount (fieldInit 2511)", async () => {
    h.blobs.rs_prefs = blob({ rank: true });
    await mount();
    expect(field("rsRank").checked).toBe(true);
    expect(h.blobArgs.some((a) => a[0] === "rs_prefs" && a[1] === "p-1")).toBe(true);
  });
});

describe("Research: the rank box while its saved choice opens (W8)", () => {
  it("Research shows the loading sign, not its empty state, until its data is read (W8): the rank box is disabled and busy, with no text", async () => {
    h.blobs.rs_prefs = { ...blob(null), loading: true };
    const root = await mount();
    expect(field("rsRank").disabled).toBe(true);
    expect(field("rsRank").getAttribute("aria-busy")).toBe("true");
    expect(tid("panel-loading")).toBeNull();
    expect(document.body.textContent).not.toContain(E.blob_loading);
    // The read lands with the stored choice: the box is ticked and usable again.
    h.blobs.rs_prefs = blob({ rank: true });
    await act(async () => { root.render(<ResearchPanel />); });
    expect(field("rsRank").disabled).toBe(false);
    expect(field("rsRank").hasAttribute("aria-busy")).toBe(false);
    expect(field("rsRank").checked).toBe(true);
  });

  it("a locked vault leaves the rank box usable (a search asks for no passphrase)", async () => {
    h.blobs.rs_prefs = { ...blob(null), locked: true };
    await mount();
    expect(field("rsRank").disabled).toBe(false);
    expect(field("rsRank").hasAttribute("aria-busy")).toBe(false);
  });
});

describe("Research: Suggest related terms (rsSuggestTerms 8251-8272)", () => {
  it("up to 8 ticked boxes with v1's note; the ticked terms go into the search", async () => {
    h.callAI.mockResolvedValue('{"terms":["test anxiety","evaluation anxiety"]}');
    await mount();
    type("rsTopic", "exam anxiety");
    await click(tid("rs-terms-btn"));
    await until(() => $$('[data-testid="rs-term"]').length === 2);
    expect(h.callAI.mock.calls[0]![1]).toEqual({ temp: 0.3, max: 500, noLang: true });
    expect(tid("rs-terms")!.querySelector("div")!.textContent).toBe("Also search for (untick any that miss your meaning). These come from the AI, so read them; the search adds them to your own words with OR.");
    expect($$('[data-testid="rs-term"]').map((l) => [l.textContent, l.querySelector("input")!.checked])).toEqual([["test anxiety", true], ["evaluation anxiety", true]]);
    await search(run("both-terms"));
    expect(tid("rs-status")!.textContent).toBe(run("both-terms").status);
  });

  it("no useful term shows v1's note; a short topic toasts", async () => {
    h.callAI.mockResolvedValue("nothing useful");
    await mount();
    await click(tid("rs-terms-btn"));
    expect(toasts()).toEqual(["Type a topic first"]);
    type("rsTopic", "exam anxiety");
    await click(tid("rs-terms-btn"));
    await until(() => tid("rs-terms")!.textContent === "No useful related terms came back. Search with your own words, or try again.");
  });
});

describe("Research: + Citation library and Insert citation (8471-8491)", () => {
  const firstWithDoi = (c: Case) => c.merged.findIndex((p) => p.doi && p.source === "OpenAlex");

  it("+ Citation library: core's entry as an update, the retraction cache seeded, v1's toast; a second press says it is there", async () => {
    const r = await mount();
    const c = run("oa-plain");
    await search(c);
    const i = firstWithDoi(c);
    await click(cards()[i]!.querySelector('[data-testid="rs-add"]'));
    const set = h.blobs.citations!.set;
    expect(set).toHaveBeenCalledTimes(1);
    // W2: every author (v1's entry kept the card's four), and no Crossref answer here, so the volume, issue and pages stay empty.
    const entry = v2Entry(c.merged[i]!);
    expect(entry.author).toBe(rsAuthorListToCit(oaAuthorList(c.merged[i]!.title)));
    expect((set.mock.calls[0]![0] as (p: CitationEntry[] | null) => CitationEntry[])([])).toEqual([entry]);
    const retr = h.blobs.retraction_cache!.set;
    expect(retr).toHaveBeenCalledTimes(1);
    const seeded = (retr.mock.calls[0]![0] as (p: unknown) => Record<string, { r: boolean; t: number }>)({});
    const doi = String(c.merged[i]!.doi).toLowerCase();
    expect(Object.keys(seeded)).toEqual([doi]);
    expect(seeded[doi]!.r).toBe(false);
    expect(typeof seeded[doi]!.t).toBe("number");
    expect(toasts()).toEqual(["Added to citation library ✓ — check author formatting before you submit"]);
    h.blobs.citations = blob([entry]);
    act(() => r.unmount());
    roots.splice(roots.indexOf(r), 1);
    await mount();
    await click(cards()[i]!.querySelector('[data-testid="rs-add"]'));
    expect(toasts().at(-1)).toBe("Already in your library");
  });

  it("Insert citation saves the paper and puts the in-text citation at the cursor, with rs_inserted", async () => {
    const ed = new Editor({ extensions: editorExtensions, content: "<p>Learning is social.</p>" });
    editors.push(ed);
    h.editor = ed;
    await mount();
    const c = run("oa-plain");
    await search(c);
    const i = firstWithDoi(c);
    await click(cards()[i]!.querySelector('[data-testid="rs-insert"]'));
    expect(h.blobs.citations!.set).toHaveBeenCalledTimes(1);
    const entry = v2Entry(c.merged[i]!);
    const surname = entry.author!.split(",")[0]!;
    expect(surname).toBe(rsEntryFromResult(c.merged[i] as never, "apa").author!.split(",")[0]);
    expect(ed.getText()).toContain(surname);
    expect(toasts()).toEqual([E.rs_inserted]);
  });

  it("a paper with more than four authors is saved with all of them (W2)", async () => {
    await mount();
    const c = run("oa-rct");
    await search(c);
    const i = c.merged.findIndex((p) => p.source === "OpenAlex" && oaAuthorList(p.title).length > 4);
    expect(i).toBeGreaterThanOrEqual(0);
    await click(cards()[i]!.querySelector('[data-testid="rs-add"]'));
    const saved = libAfter()[0]!;
    expect(saved.author!.split("; ")).toHaveLength(oaAuthorList(c.merged[i]!.title).length);
    expect(c.merged[i]!.authors).toMatch(/et al\.$/);
  });

  it("+ Citation library fills an OpenAlex paper's volume, issue and pages from Crossref after adding", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const seen: Array<{ url: string; signal: AbortSignal | null | undefined }> = [];
    crossref = async (url, init) => {
      seen.push({ url, signal: init?.signal });
      return new Response(JSON.stringify({ status: "ok", message: { title: ["Another title"], author: [{ family: "Other", given: "A." }], volume: "12", issue: "3", page: "45-67", type: "journal-article" } }), { status: 200, headers: { "content-type": "application/json" } });
    };
    await mount();
    const c = run("oa-plain");
    await search(c);
    const i = firstWithDoi(c);
    await click(cards()[i]!.querySelector('[data-testid="rs-add"]'));
    await until(() => h.blobs.citations!.set.mock.calls.length === 2);
    const entry = v2Entry(c.merged[i]!);
    // Only the empty fields are filled: the author from OpenAlex stays.
    expect(libAfter()).toEqual([{ ...entry, volume: "12", issue: "3", pages: "45-67" }]);
    // One request, carrying the DOI only, under a 4 s timeout.
    expect(seen.map((x) => x.url)).toEqual(["https://api.crossref.org/works/" + encodeURIComponent(String(c.merged[i]!.doi))]);
    expect(timeout).toHaveBeenCalledWith(4000);
    expect(seen[0]!.signal).toBeInstanceOf(AbortSignal);
    expect(toasts()).toEqual(["Added to citation library ✓ — check author formatting before you submit"]);
    timeout.mockRestore();
  });

  it("a Crossref lookup that fails or takes 4 s leaves the added entry as it was, with no toast", async () => {
    await mount();
    const c = run("oa-plain");
    await search(c);
    const withDoi = c.merged.map((p, i) => (p.doi && p.source === "OpenAlex" ? i : -1)).filter((i) => i >= 0);
    expect(withDoi.length).toBeGreaterThanOrEqual(3);
    const add = async (i: number) => { await click(cards()[i]!.querySelector('[data-testid="rs-add"]')); await settle(20); };
    const set = h.blobs.citations!.set;

    // An HTTP error.
    crossref = async () => new Response("", { status: 500 });
    await add(withDoi[0]!);
    expect(set).toHaveBeenCalledTimes(1);
    // Not in Crossref (404).
    crossref = async () => new Response("", { status: 404 });
    await add(withDoi[1]!);
    expect(set).toHaveBeenCalledTimes(2);
    // Slow: the 4 s timeout fires (AbortSignal.timeout's signal, aborted here) and the answer never lands.
    const ctl = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => ctl.signal);
    let answer: (() => void) | null = null;
    crossref = (_url, init) => new Promise<Response>((resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("The operation timed out.", "TimeoutError")));
      answer = () => resolve(new Response(JSON.stringify({ message: { volume: "1", issue: "2", page: "3-4" } }), { status: 200 }));
    });
    await add(withDoi[2]!);
    expect(timeout).toHaveBeenCalledWith(4000);
    act(() => { ctl.abort(); });
    await settle(20);
    (answer as (() => void) | null)?.();
    await settle(20);
    expect(set).toHaveBeenCalledTimes(3);
    expect(libAfter().map((e) => [e.volume, e.issue, e.pages])).toEqual([["", "", ""], ["", "", ""], ["", "", ""]]);
    expect(toasts()).toEqual(Array(3).fill("Added to citation library ✓ — check author formatting before you submit"));
    timeout.mockRestore();
  });

  it("a PubMed paper is not looked up: its volume, issue and pages come with the search (W2)", async () => {
    await mount();
    const c = run("pm-rct");
    await search(c);
    const before = requested.length;
    await click(cards()[0]!.querySelector('[data-testid="rs-add"]'));
    await settle(20);
    expect(requested.slice(before)).toEqual([]);
    const saved = libAfter()[0]!;
    expect(saved.volume).not.toBe("");
    expect(saved.author!.split("; ").length).toBeGreaterThanOrEqual(1);
  });

  it("Insert citation stays enabled while no document is open: the insert opens it (Task 11)", async () => {
    await mount();
    await search(run("oa-plain"));
    expect((cards()[0]!.querySelector('[data-testid="rs-insert"]') as HTMLButtonElement).disabled).toBe(false);
  });
});
