// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rsAuthorListToCit, rsEntryFromResultV2, type CitationEntry, type RsPaper } from "@appuscholar/core";
import en from "../messages/en.json";

/*
 * The Find tab, part 1: what the Research panel did (v1 950-1034, researchSearch 8283-8330, rsApplySort / rsRenderResults 8347-8406, rsAddToLibrary 8471-8483)
 * and Find still does: the search over the recorded OpenAlex and PubMed responses with v1's status line, the sort row, the rank path with its fold, the related
 * terms, the rank preference, the selection bubble's pending search, and what Keep stores. The cards, Keep and More are in findTab.test.tsx. Moved from the
 * Research panel in wave B Task 18; every request must have a recording (wave A LATER T10), and PubMed's tagged search is answered "found nothing" only for the
 * exact URL core builds, so v1's recorded query runs as the fallback.
 */

type Blob = { value: unknown; loading: boolean; locked: boolean; broken?: boolean; set: ReturnType<typeof vi.fn>; flush: ReturnType<typeof vi.fn> };
const blob = (value: unknown): Blob => ({ value, loading: false, locked: false, set: vi.fn(), flush: vi.fn(async () => true) });
const h = vi.hoisted(() => ({
  blobs: {} as Record<string, Blob>,
  blobArgs: [] as unknown[][],
  toast: vi.fn(),
  callAI: vi.fn(async (..._a: unknown[]) => ""),
  oaKey: null as string | null,
  pending: null as string | null,
  setPending: vi.fn(),
  go: vi.fn()
}));
vi.mock("@/lib/blobs/useProjectBlob", () => ({
  useProjectBlob: (...a: unknown[]) => { h.blobArgs.push(a); return h.blobs[a[0] as string] ?? { value: null, loading: false, locked: false, set: () => {}, flush: async () => true }; }
}));
vi.mock("@/lib/ai/useCallAI", async (orig) => ({ ...(await orig<typeof import("../lib/ai/useCallAI")>()), useCallAI: () => h.callAI }));
vi.mock("@/lib/ai/suggestion", () => ({ useSuggestion: () => ({ editor: null }) }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", scratchProjectId: "scratch-1" }, settings: { field: "psychology" } }) }));
vi.mock("@/components/frame/ProjectContext", () => ({
  useProject: () => ({ project: { id: "p-1" }, projectId: "p-1", documents: [], currentDoc: null, pendingSearch: h.pending, setPendingSearch: h.setPending, go: h.go, setPendingAnalyse: () => {},
    openExport: () => {}, requestInsert: async () => false })
}));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => ({ status: "off" }) }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/research/oaKey", () => ({ useOpenAlexKey: () => h.oaKey }));

import { FindTab } from "../components/literature/FindTab";
import { resetResearch, setResearch } from "../lib/research/useSearch";
import { resetCiteStyle } from "../lib/cite/useLibrary";
import { assertAllRecorded, crossrefNotFound, recordedFetch, taggedEsearchFoundNothing } from "./support/recordedFetch";
import { RECS } from "./support/recordedFetch";
import { noPids } from "./support/noPids";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const E = en as Record<string, string>;
const CORE_TEST = join(__dirname, "../../../packages/core/test");
type Paper = Record<string, unknown> & { title: string; authors: string; source: string };
type Case = { name: string; in: { topic: string; oa: boolean; pm: boolean; design: string; rank: boolean; terms: string[] }; merged: Paper[]; status: string };
const FX = JSON.parse(readFileSync(join(CORE_TEST, "golden/fetch/cases.json"), "utf8")) as { searches: Case[] };
const run = (name: string) => FX.searches.find((c) => c.name === name)!;
const rf = recordedFetch();

/** Every author of an OpenAlex result, as the recorded search body lists them (rsFetchOpenAlex's authorList, W2). */
function oaAuthorList(title: string): string[] {
  for (const r of RECS.values()) {
    if (!r.url.startsWith("https://api.openalex.org/works?search=") || r.status !== 200) continue;
    const w = ((JSON.parse(r.body) as { results?: Array<{ display_name?: string; authorships?: Array<{ author?: { display_name?: string } | null }> }> }).results ?? []).find((x) => x.display_name === title);
    if (w) return (w.authorships ?? []).map((a) => a.author?.display_name ?? "").filter(Boolean);
  }
  throw new Error("no recorded OpenAlex result titled " + title);
}
/** The entry Keep stores for a result of the golden list, before the fields of wave B: rsEntryFromResultV2 of the paper as the search built it (with every author). */
const v2Entry = (p: Paper) => rsEntryFromResultV2({ ...(p as unknown as RsPaper), authorList: p.source === "OpenAlex" ? oaAuthorList(p.title) : undefined }, "apa");
/** The library after every update the citations blob was given, in order, from `start`. */
const libAfter = (start: CitationEntry[] = []) => h.blobs.citations!.set.mock.calls.reduce((lib: CitationEntry[], call) => (call[0] as (p: CitationEntry[] | null) => CitationEntry[])(lib), start);
/** What Keep adds to the entry rsEntryFromResultV2 makes, besides the pid: the reading list, the abstract and the free link. */
const kept = (p: Paper) => ({ ...v2Entry(p), rl: true, ...(p.abstract ? { abstract: String(p.abstract).slice(0, 4000) } : {}), ...(p.oaUrl ? { oa: p.oaUrl } : {}) });

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
/** The recorded run `c` (the page offers no switch for its sources) with its stand-ins, then the search. */
function declare(c: Case) {
  setResearch({ oa: c.in.oa, pm: c.in.pm });
  rf.standIn(taggedEsearchFoundNothing(c.in), ...c.merged.filter((p) => p.source === "OpenAlex" && p.doi).map((p) => crossrefNotFound(String(p.doi))));
}
async function search(c: Case) {
  declare(c);
  type("rsTopic", c.in.topic);
  type("rsDesign", c.in.design);
  tick(field("rsRank"), c.in.rank);
  await click(tid("rs-find"));
  await until(() => !!tid("rs-status")?.textContent && !tid("rs-status")!.textContent!.includes("Searching"));
}
const toasts = () => h.toast.mock.calls.map((c) => c[0] as string);
const cards = () => $$('[data-testid="rs-card"]');
const titles = () => cards().map((c) => c.querySelector("h3")!.textContent);
const keepBtn = (i: number) => cards()[i]!.querySelector<HTMLButtonElement>('[data-testid="find-keep"]')!;

beforeEach(() => {
  h.blobs = { citations: blob([]), retraction_cache: blob({}), rs_prefs: blob(null) };
  h.blobArgs = [];
  h.toast.mockReset();
  h.callAI.mockReset().mockResolvedValue("");
  h.oaKey = null;
  h.pending = null;
  h.setPending.mockReset();
  rf.reset();
  vi.stubGlobal("fetch", rf.fetch);
  resetResearch();
  resetCiteStyle();
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  assertAllRecorded(rf);
});

describe("Find: the form (v1 950-965)", () => {
  it("the controls in the canvas's order", async () => {
    await mount();
    const order = ["rs-topic", "rs-find", "rs-terms", "rs-design", "rs-rank", "rs-status"];
    const els = order.map((id) => tid(id));
    for (let i = 1; i < els.length; i++) expect(els[i - 1]!.compareDocumentPosition(els[i]!) & Node.DOCUMENT_POSITION_FOLLOWING, order[i]).toBeTruthy();
    expect(field("rsTopic").placeholder).toBe(E.find_topic_ph);
    expect(tid("rs-terms")!.contains(tid("rs-terms-btn"))).toBe(true);
    expect(tid("rs-terms-btn")!.textContent).toBe("Suggest related terms");
    expect(field("rsRank").checked).toBe(false);
    expect(tid("rs-sort-row")).toBeNull();
  });

  it("an empty topic toasts v1's sentence; symbols alone write it in the status", async () => {
    await mount();
    await click(tid("rs-find"));
    expect(toasts()).toEqual(["Type a topic or question first"]);
    type("rsTopic", "%%% ???");
    await click(tid("rs-find"));
    expect(tid("rs-status")!.textContent).toBe("Use some words or numbers in the search. Symbols alone find nothing.");
    expect(rf.requested).toEqual([]);
  });
});

describe("Find: a search (researchSearch 8283-8330)", () => {
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
    rf.standIn({ match: (u) => u.includes("api_key=oa-test-key"), respond: () => new Response('{"results":[]}', { status: 200, headers: { "content-type": "application/json" } }) });
    await mount();
    setResearch({ pm: false });
    type("rsTopic", "growth mindset academic achievement");
    await click(tid("rs-find"));
    await until(() => rf.requested.length > 0);
    expect(rf.requested[0]).toContain("&api_key=oa-test-key");
  });

  it("the selection bubble's pending text becomes the topic and is searched at once, then cleared", async () => {
    h.pending = "caffeine sleep quality";
    declare(run("both-oa429"));
    await mount();
    await until(() => tid("rs-status")!.textContent === run("both-oa429").status);
    expect(field("rsTopic").value).toBe("caffeine sleep quality");
    expect(h.setPending).toHaveBeenCalledWith(null);
    expect(cards()).toHaveLength(6);
  });
});

describe("Find: the sort (rsApplySort 8347-8375)", () => {
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

describe("Find: Rank by fit (rsRank 8220-8234, the fold 8402-8403)", () => {
  it("ranked: the fit sort, the fit and its reason, the fold of fit 0 or 1, the disclosure in the status, the box stored", async () => {
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
    expect(h.callAI.mock.calls.map((x) => x[1])).toEqual([{ temp: 0.1, max: 1500, noLang: true }, { temp: 0.1, max: 1500, noLang: true }]);
    expect(tid("rs-status")!.textContent).toMatch(/^22 papers found · ranked by fit to your question \(22 of 22 scored, about [\d,]+ words sent to your AI\)$/);
    expect(field<HTMLSelectElement>("rsSort").value).toBe("fit");
    const fit = (card: HTMLElement) => Number(card.querySelector('[data-testid="find-fit"]')!.textContent!.match(/^Fit (\d) of 3$/)![1]);
    expect(cards().every((card) => /^Why it fits \(AI\): Reason \d+/.test(card.querySelector('[data-testid="find-why"]')!.textContent!))).toBe(true);
    expect(fit(cards()[0]!)).toBe(3);
    const fold = tid("rs-fold") as HTMLDetailsElement;
    const low = cards().filter((card) => fold.contains(card));
    expect(fold.querySelector("summary")!.textContent).toBe(low.length + " probably not relevant (fit 0 or 1). Nothing is deleted.");
    expect(low.every((card) => fit(card) <= 1)).toBe(true);
    expect(cards().filter((card) => !fold.contains(card)).every((card) => fit(card) >= 2)).toBe(true);
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
    declare(c);
    type("rsTopic", c.in.topic);
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
    expect(cards()[0]!.querySelector('[data-testid="find-fit"]')!.textContent).toBe("Fit 3 of 3");
    expect(tid("rs-fold")).toBeNull();
  });

  it("a stored rank preference ticks the box on mount (fieldInit 2511)", async () => {
    h.blobs.rs_prefs = blob({ rank: true });
    await mount();
    expect(field("rsRank").checked).toBe(true);
    expect(h.blobArgs.some((a) => a[0] === "rs_prefs" && a[1] === "p-1")).toBe(true);
  });
});

describe("Find: the rank box while its saved choice opens (W8)", () => {
  it("Find shows the loading sign, not its empty state, until its data is read (W8): the rank box is disabled and busy, with no text", async () => {
    h.blobs.rs_prefs = { ...blob(null), loading: true };
    const root = await mount();
    expect(field("rsRank").disabled).toBe(true);
    expect(field("rsRank").getAttribute("aria-busy")).toBe("true");
    expect(tid("panel-loading")).toBeNull();
    expect(document.body.textContent).not.toContain(E.blob_loading);
    // The read lands with the stored choice: the box is ticked and usable again.
    h.blobs.rs_prefs = blob({ rank: true });
    await act(async () => { root.render(<FindTab />); });
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

describe("Find: Suggest related terms (rsSuggestTerms 8251-8272)", () => {
  it("up to 8 ticked chips; the ticked terms go into the search", async () => {
    h.callAI.mockResolvedValue('{"terms":["test anxiety","evaluation anxiety"]}');
    await mount();
    type("rsTopic", "exam anxiety");
    await click(tid("rs-terms-btn"));
    await until(() => $$('[data-testid="rs-term"]').length === 2);
    expect(h.callAI.mock.calls[0]![1]).toEqual({ temp: 0.3, max: 500, noLang: true });
    expect(tid("find-terms-label")!.textContent).toBe("Also searching, suggested by AI from your question:");
    expect($$('[data-testid="rs-term"]').map((l) => [l.textContent, l.querySelector("input")!.checked])).toEqual([["test anxiety", true], ["evaluation anxiety", true]]);
    await search(run("both-terms"));
    expect(tid("rs-status")!.textContent).toBe(run("both-terms").status);
  });

  it("no useful term shows the note; a short topic toasts", async () => {
    h.callAI.mockResolvedValue("nothing useful");
    await mount();
    await click(tid("rs-terms-btn"));
    expect(toasts()).toEqual(["Type a topic first"]);
    type("rsTopic", "exam anxiety");
    await click(tid("rs-terms-btn"));
    await until(() => tid("rs-terms")!.textContent!.includes("No useful related terms came back. Search with your own words, or try again."));
  });
});

describe("Find: what Keep stores (8471-8491)", () => {
  const firstWithDoi = (c: Case) => c.merged.findIndex((p) => p.doi && p.source === "OpenAlex");

  it("Keep: core's v2 entry with the pid, the reading list, the abstract and the free link, as an update; the retraction cache seeded; a second press says it is there", async () => {
    const r = await mount();
    const c = run("oa-plain");
    await search(c);
    const i = firstWithDoi(c);
    await click(keepBtn(i));
    const set = h.blobs.citations!.set;
    expect(set).toHaveBeenCalledTimes(1);
    // W2: every author (v1's entry kept the card's four), and no Crossref answer here, so the volume, issue and pages stay empty.
    const entry = v2Entry(c.merged[i]!);
    expect(entry.author).toBe(rsAuthorListToCit(oaAuthorList(c.merged[i]!.title)));
    const [stored] = libAfter();
    expect((stored as { pid?: string }).pid).toMatch(/^k[a-z0-9]+$/);
    expect(noPids([stored!])).toEqual([kept(c.merged[i]!)]);
    const retr = h.blobs.retraction_cache!.set;
    expect(retr).toHaveBeenCalledTimes(1);
    const seeded = (retr.mock.calls[0]![0] as (p: unknown) => Record<string, { r: boolean; t: number }>)({});
    const doi = String(c.merged[i]!.doi).toLowerCase();
    expect(Object.keys(seeded)).toEqual([doi]);
    expect(seeded[doi]!.r).toBe(false);
    expect(typeof seeded[doi]!.t).toBe("number");
    expect(toasts()).toEqual([]);
    h.blobs.citations = blob([stored]);
    act(() => r.unmount());
    roots.splice(roots.indexOf(r), 1);
    await mount();
    await search(c);
    expect(keepBtn(i).textContent).toBe("Kept");
    await click(keepBtn(i));
    expect(h.blobs.citations.set).not.toHaveBeenCalled();
  });

  it("a paper with more than four authors is saved with all of them (W2)", async () => {
    await mount();
    const c = run("oa-rct");
    await search(c);
    const i = c.merged.findIndex((p) => p.source === "OpenAlex" && p.doi && oaAuthorList(p.title).length > 4);
    expect(i).toBeGreaterThanOrEqual(0);
    await click(keepBtn(i));
    const saved = libAfter()[0]!;
    expect(saved.author!.split("; ")).toHaveLength(oaAuthorList(c.merged[i]!.title).length);
    expect(c.merged[i]!.authors).toMatch(/et al\.$/);
  });

  it("Keep fills an OpenAlex paper's volume, issue and pages from Crossref after keeping", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const seen: Array<{ url: string; signal: AbortSignal | null | undefined }> = [];
    await mount();
    const c = run("oa-plain");
    await search(c);
    rf.standIn({
      match: (u) => u.startsWith("https://api.crossref.org/"),
      respond: (url, init) => {
        seen.push({ url, signal: init?.signal });
        return new Response(JSON.stringify({ status: "ok", message: { title: ["Another title"], author: [{ family: "Other", given: "A." }], volume: "12", issue: "3", page: "45-67", type: "journal-article" } }), { status: 200, headers: { "content-type": "application/json" } });
      }
    });
    const i = firstWithDoi(c);
    await click(keepBtn(i));
    await until(() => h.blobs.citations!.set.mock.calls.length === 2);
    // Only the empty fields are filled: the author from OpenAlex stays.
    expect(noPids(libAfter())).toEqual([{ ...kept(c.merged[i]!), volume: "12", issue: "3", pages: "45-67" }]);
    // One request, carrying the DOI only, under a 4 s timeout.
    expect(seen.map((x) => x.url)).toEqual(["https://api.crossref.org/works/" + encodeURIComponent(String(c.merged[i]!.doi))]);
    expect(timeout).toHaveBeenCalledWith(4000);
    expect(seen[0]!.signal).toBeInstanceOf(AbortSignal);
    timeout.mockRestore();
  });

  it("a Crossref lookup that fails or takes 4 s leaves the kept entry as it was, with no toast", async () => {
    await mount();
    const c = run("oa-plain");
    await search(c);
    const withDoi = c.merged.map((p, i) => (p.doi && p.source === "OpenAlex" ? i : -1)).filter((i) => i >= 0);
    expect(withDoi.length).toBeGreaterThanOrEqual(3);
    const keep = async (i: number) => { await click(keepBtn(i)); await settle(20); };
    const set = h.blobs.citations!.set;

    // An HTTP error.
    rf.standIn({ match: (u) => u.includes(encodeURIComponent(String(c.merged[withDoi[0]!]!.doi))), respond: () => new Response("", { status: 500 }) });
    await keep(withDoi[0]!);
    expect(set).toHaveBeenCalledTimes(1);
    // Not in Crossref (404): the stand-in the search declared.
    await keep(withDoi[1]!);
    expect(set).toHaveBeenCalledTimes(2);
    // Slow: the 4 s timeout fires (AbortSignal.timeout's signal, aborted here) and the answer never lands.
    const ctl = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => ctl.signal);
    let answer: (() => void) | null = null;
    rf.standIn({
      match: (u) => u.includes(encodeURIComponent(String(c.merged[withDoi[2]!]!.doi))),
      respond: (_url, init) => new Promise<Response>((resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("The operation timed out.", "TimeoutError")));
        answer = () => resolve(new Response(JSON.stringify({ message: { volume: "1", issue: "2", page: "3-4" } }), { status: 200 }));
      })
    });
    await keep(withDoi[2]!);
    expect(timeout).toHaveBeenCalledWith(4000);
    act(() => { ctl.abort(); });
    await settle(20);
    (answer as (() => void) | null)?.();
    await settle(20);
    expect(set).toHaveBeenCalledTimes(3);
    expect(libAfter().map((e) => [e.volume, e.issue, e.pages])).toEqual([["", "", ""], ["", "", ""], ["", "", ""]]);
    expect(toasts()).toEqual([]);
    timeout.mockRestore();
  });

  it("a PubMed paper is not looked up: its volume, issue and pages come with the search (W2)", async () => {
    await mount();
    const c = run("pm-rct");
    await search(c);
    const before = rf.requested.length;
    await click(keepBtn(0));
    await settle(20);
    expect(rf.requested.slice(before)).toEqual([]);
    const saved = libAfter()[0]!;
    expect(saved.volume).not.toBe("");
    expect(saved.author!.split("; ").length).toBeGreaterThanOrEqual(1);
  });
});
