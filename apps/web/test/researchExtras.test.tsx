// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildQuickReadPrompt, type RsPaper, type RsQuick } from "@appuscholar/core";
import en from "../messages/en.json";

/*
 * The Find tab, part 2 (v1 976-1030 and its script): the quick read and its box (rsQuickHTML / rsQuickP 8161-8182), the filters that are left (the year, free full
 * text, retracted: 8331-8375), the export of the shown list (rsCsvDownload 8196, now Export) and connected papers over the recorded OpenAlex bodies (8498-8523). Moved
 * from the Research panel in wave B Task 18: a result's actions are in its More menu; the ticked-papers batch, the literature review, the research gap, the confirmed
 * filters, the other three external searches and the manual add left Find (the review and the gap come back in Compare, Task 22). Every request must have a recording.
 */

type Blob_ = { value: unknown; loading: boolean; locked: boolean; set: ReturnType<typeof vi.fn>; flush: ReturnType<typeof vi.fn> };
const blob = (value: unknown): Blob_ => ({ value, loading: false, locked: false, set: vi.fn(), flush: vi.fn(async () => true) });
const h = vi.hoisted(() => ({
  blobs: {} as Record<string, Blob_>,
  toast: vi.fn(),
  callAI: vi.fn(async (..._a: unknown[]) => ""),
  oaKey: null as string | null,
  go: vi.fn(),
  openExport: vi.fn(),
  download: vi.fn()
}));
vi.mock("@/lib/blobs/useProjectBlob", () => ({
  useProjectBlob: (...a: unknown[]) => h.blobs[a[0] as string] ?? { value: null, loading: false, locked: false, set: () => {}, flush: async () => true }
}));
vi.mock("@/lib/ai/useCallAI", async (orig) => ({ ...(await orig<typeof import("../lib/ai/useCallAI")>()), useCallAI: () => h.callAI }));
vi.mock("@/lib/ai/suggestion", () => ({ useSuggestion: () => ({ editor: null }) }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", scratchProjectId: "scratch-1" }, settings: { field: "psychology" } }) }));
vi.mock("@/components/frame/ProjectContext", () => ({
  useProject: () => ({ project: { id: "p-1" }, projectId: "p-1", documents: [], currentDoc: null, pendingSearch: null, setPendingSearch: () => {}, go: h.go, requestInsert: async () => false, openExport: h.openExport })
}));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => ({ status: "off" }) }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/research/oaKey", () => ({ useOpenAlexKey: () => h.oaKey }));
vi.mock("@/lib/export/download", async (orig) => ({ ...(await orig<typeof import("../lib/export/download")>()), downloadBlob: h.download }));

import { FindTab } from "../components/literature/FindTab";
import { getResearch, resetResearch, setResearch, shownNow } from "../lib/research/useSearch";
import { resetCiteStyle } from "../lib/cite/useLibrary";
import { assertAllRecorded, recordedFetch } from "./support/recordedFetch";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const E = en as Record<string, string>;
const CORE_TEST = join(__dirname, "../../../packages/core/test");
type Connected = { in: { oaId: string; title: string; referencedWorks: string[]; citedByApiUrl: string }; requested: string[]; cites: { heading: string; cards: Array<{ title: string; meta: string }> }; citedBy: { heading: string; cards: Array<{ title: string; meta: string }> } };
const FETCH = JSON.parse(readFileSync(join(CORE_TEST, "golden/fetch/cases.json"), "utf8")) as { searches: Array<{ name: string; merged: RsPaper[] }>; connected: Connected[] };
const RES = JSON.parse(readFileSync(join(CORE_TEST, "golden/research/cases.json"), "utf8")) as { papers: RsPaper[]; quick: Array<{ ab: string; raw: string; out: RsQuick | null }> };
/** The research fixture's papers as a search leaves them: no quick read, no fit. */
const fresh = (): RsPaper[] => RES.papers.map((p) => { const { quick: _q, rel: _r, ...rest } = p; return rest as RsPaper; });
const rf = recordedFetch();

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
const toasts = () => h.toast.mock.calls.map((c) => c[0] as string);
const cards = () => $$('[data-testid="rs-card"]');
const titles = () => cards().map((c) => c.querySelector("h3")!.textContent);
const cardOf = (title: string) => cards().find((c) => c.querySelector("h3")!.textContent === title)!;
/** Radix opens a menu from its trigger on Enter. */
async function moreItem(card: HTMLElement, item: string) {
  await act(async () => { card.querySelector('[data-testid="find-more"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
  await click(tid(item));
}

beforeEach(() => {
  h.blobs = { citations: blob([]), retraction_cache: blob({}), rs_prefs: blob(null) };
  for (const f of [h.toast, h.go, h.openExport, h.download]) f.mockReset();
  h.callAI.mockReset().mockResolvedValue("");
  h.oaKey = null;
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

describe("Find part 2: the layout", () => {
  it("the results, then the filters beside them and Export in the row above them; Connected papers only once asked for", async () => {
    await mount();
    const order = ["rs-sort-row", "rs-results"];
    const els = order.map((id) => tid(id));
    for (let i = 1; i < els.length; i++) expect(els[i - 1]!.compareDocumentPosition(els[i]!) & Node.DOCUMENT_POSITION_FOLLOWING, order[i]).toBeTruthy();
    // Wave B Task 12 (D-S2-42): v1's "Download this list (.csv)" is Export.
    expect(tid("rs-csv")!.textContent).toBe(E.exp_link);
    expect(tid("rs-sort-row")!.contains(tid("rs-csv"))).toBe(true);
    // the ticked-papers actions, the literature review and the research gap are not here
    for (const id of ["rs-actions", "rs-quick-ticked", "rs-litreview", "rs-gapfinder", "rs-external", "rs-manual", "rs-connected-box"]) expect(tid(id), id).toBeNull();
    expect($$("input[type=checkbox]").filter((c) => c.closest('[data-testid="rs-card"]'))).toEqual([]);
  });
});

describe("Find part 2: Quick read (rsQuickHTML / rsQuickP 8161-8182)", () => {
  const boxOf = (title: string) => cardOf(title).querySelector<HTMLElement>('[data-testid="rs-quickbox"]');

  it("a result with too short an abstract toasts v1's sentence and calls no AI", async () => {
    const ps = fresh();
    ps[0] = { ...ps[0]!, abstract: "Too short to read." };
    await mount(ps);
    await moreItem(cardOf(ps[0]!.title), "find-item-quick");
    expect(toasts()).toEqual(["This result has no abstract to read."]);
    expect(h.callAI).not.toHaveBeenCalled();
    expect(boxOf(ps[0]!.title)).toBeNull();
  });

  it("a confirmed read: v1's box under the details with the summary, the kind of study and the sample with their quotes, and the badges", async () => {
    const c = RES.quick[0]!;
    const ps = fresh();
    ps[0] = { ...ps[0]!, abstract: c.ab };
    h.callAI.mockResolvedValueOnce(c.raw);
    await mount(ps);
    await moreItem(cardOf(ps[0]!.title), "find-item-quick");
    await until(() => !!boxOf(ps[0]!.title));
    expect(h.callAI).toHaveBeenCalledWith(buildQuickReadPrompt("psychology", c.ab).prompt, { temp: 0.1, max: 700, noLang: true });
    const lines = [...boxOf(ps[0]!.title)!.querySelectorAll<HTMLElement>("[data-line]")].map((l) => l.textContent);
    expect(lines).toEqual([
      "Quick read (AI suggestion, from the abstract only)",
      "Cutting social media use for 4 weeks lowered anxiety scores by 2.5 points in 1,200 adolescents.",
      "Kind of study: randomised trial — “In this randomised trial, 1,200 adolescents aged 13 to 17”",
      "Sample size: 1,200 — “1,200 adolescents aged 13 to 17 from 12 schools”"
    ]);
    // the box sits after the title and the details line
    const card = cardOf(ps[0]!.title);
    expect(card.querySelector("h3")!.compareDocumentPosition(boxOf(ps[0]!.title)!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.querySelector('[data-testid="find-meta"]')!.compareDocumentPosition(boxOf(ps[0]!.title)!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect([...card.querySelectorAll('[data-testid="find-badges"] > *')].map((b) => b.textContent)).toEqual(expect.arrayContaining(["Randomised trial", "Sample: 1,200"]));
    expect(getResearch().original[0]!.quick).toEqual(c.out);
    expect(toasts()).toEqual([]);
  });

  it("Review Focus 3: the summary with a number the abstract lacks is dropped with v1's sentence; design and sample stay confirmed", async () => {
    const c = RES.quick[1]!;
    const ps = fresh();
    ps[0] = { ...ps[0]!, abstract: c.ab };
    h.callAI.mockResolvedValueOnce(c.raw);
    await mount(ps);
    await moreItem(cardOf(ps[0]!.title), "find-item-quick");
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

  it("not confirmed and not stated: v1's warnings and sentences, and no badge for what was not confirmed", async () => {
    const ps = fresh();
    ps[0] = { ...ps[0]!, abstract: RES.quick[2]!.ab, title: "A" };
    ps[1] = { ...ps[1]!, abstract: RES.quick[3]!.ab, title: "B" };
    h.callAI.mockResolvedValueOnce(RES.quick[2]!.raw).mockResolvedValueOnce(RES.quick[3]!.raw);
    await mount(ps);
    await moreItem(cardOf("A"), "find-item-quick");
    await until(() => !!boxOf("A"));
    await moreItem(cardOf("B"), "find-item-quick");
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
    const badge = (t: string) => [...cardOf(t).querySelectorAll('[data-testid="find-badges"] > *')].map((b) => b.textContent);
    expect(badge("A")).toContain("Sample: 12");
    expect(badge("A")).not.toContain("Randomised trial");
    expect(badge("B").filter((x) => /^Sample/.test(x ?? ""))).toEqual([]);
  });
});

describe("Find part 2: the filters (8331-8375)", () => {
  it("Published from, Free full text only and Hide retracted papers filter what was found; the count says how many match; the list is never deleted from", async () => {
    const ps = fresh();
    await mount(ps);
    const all = titles();
    expect(all).toHaveLength(ps.length);
    expect(tid("find-papers")!.textContent).toBe(`${ps.length} papers. Showing ${ps.length} that match your filters.`);
    type("rsFYear", "2020");
    const kept = ps.filter((p) => (parseInt(String(p.year), 10) || 0) >= 2020);
    expect(titles()).toEqual(kept.map((p) => p.title));
    expect(tid("find-papers")!.textContent).toBe(`${ps.length} papers. Showing ${kept.length} that match your filters.`);
    expect(getResearch().original).toHaveLength(ps.length);
    type("rsFYear", "");
    expect(titles()).toEqual(all);
    tick(field("rsFOA"), true);
    expect(titles()).toEqual(ps.filter((p) => p.oaStatus || p.oaUrl).map((p) => p.title));
    tick(field("rsFOA"), false);
    tick(field("rsFRet"), true);
    expect(titles()).toEqual(ps.filter((p) => !p.retracted).map((p) => p.title));
    expect(getResearch().original).toHaveLength(ps.length);
  });

  it("the confirmed kind-of-study and sample filters are not offered", async () => {
    await mount();
    expect(field("rsFDes")).toBeNull();
    expect(field("rsFN")).toBeNull();
    expect(tid("rs-filter-clear")).toBeNull();
  });
});

describe("Find part 2: Export (rsCsvDownload 8196), now in the export place (Task 12)", () => {
  it("Export opens the export place with the search lists ticked, and its last search is the papers shown", async () => {
    const ps = fresh();
    await mount(ps);
    type("rsSort", "citations");
    type("rsFYear", "2019");
    await click(tid("rs-csv"));
    expect(h.openExport).toHaveBeenCalledWith("search");
    expect(h.download).not.toHaveBeenCalled();
    const shown = titles().map((tt) => ps.find((p) => p.title === tt)!);
    expect(shownNow()).toEqual(shown);
  });
});

describe("Find part 2: connected papers (rsConnected 8498-8523, over the recorded OpenAlex bodies)", () => {
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
      rf.fetch.mockImplementationOnce(async (input) => { await gate; return rf.fetch(input); });
      await moreItem(cardOf(p.title), "find-item-connected");
      expect(tid("rs-connected-out")!.textContent).toBe("🔎 Loading connected papers for “" + p.title + "”…");
      release();
      await until(() => !!tid("rs-connected-out")!.querySelector("h3"));
      // the two requests run at once (the first was held above)
      // v1 had no cited-by URL to fetch here; v2 asks OpenAlex by filter=cites for the paper's id instead (W3, D-S2-25), so the case without a URL
      // sends the case with one's second request and shows its list
      const withUrl = FETCH.connected.find((x) => x.in.citedByApiUrl)!;
      const want = c.in.citedByApiUrl ? c : { ...c, requested: withUrl.requested, citedBy: withUrl.citedBy };
      expect([...rf.requested].sort()).toEqual([...want.requested].sort());
      expect(tid("rs-connected-out")!.querySelector("h3")!.textContent).toBe("🔗 Connected to: " + p.title);
      const none = "None found.";
      expect(lists()).toEqual([
        { heading: want.cites.heading, cards: want.cites.cards.length ? want.cites.cards : none },
        { heading: want.citedBy.heading, cards: want.citedBy.cards.length ? want.citedBy.cards : none }
      ]);
      // the box opens by itself, and sits above the results
      expect((tid("rs-connected-box") as HTMLDetailsElement).open).toBe(true);
      expect(tid("rs-connected-box")!.compareDocumentPosition(tid("rs-results")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

  it("a paper with no cited-by URL asks by filter=cites for its OpenAlex id, with the key (W3)", async () => {
    h.oaKey = "oa-k";
    const p = { ...paperFor(FETCH.connected[0]!), citedByApiUrl: "" };
    // the recordings hold the keyless URL: the keyed one is answered with an empty list, by name
    rf.standIn({ match: (u) => u.includes("api_key=oa-k"), respond: () => new Response('{"results":[]}', { status: 200, headers: { "content-type": "application/json" } }) });
    await mount([p]);
    await moreItem(cardOf(p.title), "find-item-connected");
    await until(() => !!tid("rs-connected-out")!.querySelector("h3"));
    expect(rf.requested).toContain("https://api.openalex.org/works?filter=cites:W2487945683&per-page=8&select=display_name,authorships,publication_year&api_key=oa-k");
  });

  it("the key goes with the request; a failure shows v1's sentence", async () => {
    h.oaKey = "oa-k";
    const p = paperFor(FETCH.connected[0]!);
    rf.standIn({ match: (u) => u.includes("api_key=oa-k"), respond: () => new Response('{"results":[]}', { status: 200, headers: { "content-type": "application/json" } }) });
    await mount([p]);
    await moreItem(cardOf(p.title), "find-item-connected");
    await until(() => !!tid("rs-connected-out")!.querySelector("h3"));
    expect(rf.requested[0]).toContain("&api_key=oa-k");
    vi.stubGlobal("fetch", () => { throw new Error("blocked"); });
    await moreItem(cardOf(p.title), "find-item-connected");
    await until(() => tid("rs-connected-out")!.textContent === "Could not load connected papers right now — try again in a moment.");
  });
});
