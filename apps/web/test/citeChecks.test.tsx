// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { citKey, crossCheckHtml, rcCheckOneV2, type CitationEntry, type RcCheck } from "@appuscholar/core";
import { editorExtensions } from "../lib/editorExtensions";
import en from "../messages/en.json";

type Blob = { value: unknown; loading: boolean; locked: boolean; broken?: boolean; set: ReturnType<typeof vi.fn>; flush: ReturnType<typeof vi.fn> };
const h = vi.hoisted(() => ({
  blobs: {} as Record<string, Blob>,
  toast: vi.fn(),
  editor: null as unknown,
  documents: [] as Array<{ id: string; title: string; updatedAt: string }>,
  currentDoc: null as null | { id: string },
  selectDoc: vi.fn(async () => true),
  stored: {} as Record<string, { bodyHtml: string; keyVersion: number }>,
  project: null as null | { id: string }
}));
vi.mock("@/lib/blobs/useProjectBlob", () => ({ useProjectBlob: (kind: string) => h.blobs[kind] }));
// The quote box calls the AI through useCallAI (Task 8b); these tests make no call.
vi.mock("@/lib/ai/useCallAI", async (orig) => ({ ...(await orig<typeof import("../lib/ai/useCallAI")>()), useCallAI: () => async () => "" }));
vi.mock("@/lib/ai/suggestion", () => ({ useSuggestion: () => ({ editor: h.editor }) }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", scratchProjectId: "scratch-1" }, settings: {} }) }));
vi.mock("@/components/frame/ProjectContext", () => ({
  useProject: () => ({ project: h.project, projectId: h.project?.id ?? null, documents: h.documents, currentDoc: h.currentDoc, selectDoc: h.selectDoc, go: vi.fn(), openExport: vi.fn(),
    requestInsert: async (run: (e: never) => void) => { const e = h.editor as { isDestroyed?: boolean } | null; if (!e || e.isDestroyed) return false; run(e as never); return true; } })
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
import { RETRACT_TTL, rcCurrent, rcRun, resetCheckBusy, retractionRefresh, useCiteChecks, type CiteChecks, type RcDeps, type RetractionDeps } from "../lib/cite/checks";
import { parseBlob, type RefCheckCache, type RetractionCache } from "../lib/blobs/kinds";
import { resetCiteActive } from "../lib/cite/active";
import { resetCiteStyle, useLibrary, type Library } from "../lib/cite/useLibrary";
import { noPids } from "./support/noPids";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = en as Record<string, string>;
const t = (k: string, vars?: Record<string, string | number>) => (E[k] ?? k).replace(/\{(\w+)\}/g, (m, x: string) => (vars && x in vars ? String(vars[x]) : m));

const SMITH: CitationEntry = { author: "Smith, John", year: "2020", title: "Sleep and memory", doi: "10.1000/smith" };
const LEE: CitationEntry = { author: "Lee, Kim", year: "2018", title: "Homework helps little", doi: "https://doi.org/10.1000/LEE" };
const RAO: CitationEntry = { author: "Rao, Kavita", year: "2015", title: "No identifier here" };

const oaUrl = (dois: string[]) => "https://api.openalex.org/works?filter=doi:" + dois.map((d) => encodeURIComponent("https://doi.org/" + d)).join("|") + "&per-page=50&select=doi,is_retracted";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
/** OpenAlex: every DOI asked for is known; the ones in `retracted` are flagged. */
function openAlex(retracted: string[]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = decodeURIComponent(String(input));
    const dois = (url.match(/filter=doi:(.*)&per-page/)?.[1] ?? "").split("|").map((u) => u.replace("https://doi.org/", ""));
    return json({ results: dois.map((d) => ({ doi: "https://doi.org/" + d, is_retracted: retracted.includes(d) })) });
  });
}

const roots: Root[] = [];
const editors: Editor[] = [];
/** The library and the checks as the tab holds them, handed out of a component. */
type HookProbe = { library?: Library; checks?: CiteChecks };
function probe(out: HookProbe): Root {
  const root = createRoot(document.body.appendChild(document.createElement("div")));
  roots.push(root);
  act(() => { root.render(<Hooks out={out} />); });
  return root;
}
function Hooks({ out }: { out: HookProbe }) {
  const library = useLibrary();
  const checks = useCiteChecks(library);
  // Handed out after each render, as an effect does it (the probe's owner keeps the latest).
  useEffect(() => { Object.assign(out, { library, checks }); });
  return null;
}
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
}
async function settle(ms = 0) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }
async function click(el: HTMLElement) { await act(async () => { el.click(); await new Promise((r) => setTimeout(r, 0)); }); }
function editorWith(html: string) {
  const e = new Editor({ extensions: editorExtensions, content: html });
  editors.push(e);
  h.editor = e;
  return e;
}

beforeEach(() => {
  h.blobs = { citations: blob([SMITH, LEE, RAO]), retraction_cache: blob({}), refcheck_cache: blob({}) };
  h.toast.mockReset();
  h.editor = null;
  h.documents = [];
  h.currentDoc = null;
  h.selectDoc.mockClear();
  h.stored = {};
  h.project = null;
  resetCheckBusy();
  resetCiteActive();
  resetCiteStyle();
  vi.stubGlobal("fetch", openAlex([]));
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  for (const e of editors.splice(0)) e.destroy();
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the retraction check (v1 citRetractionRefresh 7579-7600)", () => {
  const NOW = Date.UTC(2026, 9, 19, 12);
  const DAY = 24 * 3600 * 1000;
  const deps = (over: Partial<RetractionDeps> = {}) => {
    const saved: RetractionCache[] = [];
    const save = vi.fn((fn: (p: RetractionCache | null) => RetractionCache) => { saved.push(fn(saved.length ? saved[saved.length - 1]! : null)); });
    const toast = vi.fn((msg: string) => { void msg; });
    const d = { lib: [SMITH, LEE, RAO], cache: {}, fetch: openAlex(["10.1000/lee"]) as unknown as typeof fetch, now: () => NOW, t, ...over, save, toast };
    return { d, saved };
  };

  it("the TTL is v1's week; only DOIs never checked or older than a week are looked up (a fake clock), each answered with { r, t: now }", async () => {
    expect(RETRACT_TTL).toBe(7 * 24 * 3600 * 1000);
    const fetchFn = openAlex(["10.1000/lee"]);
    const third: CitationEntry = { author: "Ng, A.", year: "2019", title: "Third", doi: "10.1000/ng" };
    const { d, saved } = deps({
      lib: [SMITH, LEE, RAO, third], fetch: fetchFn as unknown as typeof fetch,
      cache: { "10.1000/smith": { r: false, t: NOW - 6 * DAY }, "10.1000/lee": { r: false, t: NOW - 8 * DAY } }
    });
    await retractionRefresh(false, d);
    expect(fetchFn.mock.calls.map((c) => String(c[0]))).toEqual([oaUrl(["10.1000/lee", "10.1000/ng"])]);
    expect(saved.at(-1)).toEqual({ "10.1000/lee": { r: true, t: NOW }, "10.1000/ng": { r: false, t: NOW } });
    expect(d.toast).not.toHaveBeenCalled();
    // A week to the millisecond is still fresh (v1: now - t > TTL).
    const fresh = deps({ fetch: fetchFn as unknown as typeof fetch, cache: { "10.1000/smith": { r: false, t: NOW - RETRACT_TTL }, "10.1000/lee": { r: false, t: NOW - RETRACT_TTL } } });
    fetchFn.mockClear();
    await retractionRefresh(false, fresh.d);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("DOIs go out in batches of 40, each batch saved as it answers", async () => {
    const fetchFn = openAlex(["10.1000/x7"]);
    const lib = Array.from({ length: 45 }, (_, i) => ({ author: "A" + i, title: "T" + i, year: "2020", doi: "10.1000/x" + i }));
    const { d, saved } = deps({ lib, fetch: fetchFn as unknown as typeof fetch });
    await retractionRefresh(false, d);
    expect(fetchFn.mock.calls.map((c) => String(c[0]))).toEqual([oaUrl(lib.slice(0, 40).map((x) => x.doi)), oaUrl(lib.slice(40).map((x) => x.doi))]);
    expect(d.save).toHaveBeenCalledTimes(2);
    expect(Object.keys(saved[0] as object)).toHaveLength(40);
    expect(Object.keys(saved[1] as object)).toHaveLength(45);
    expect((saved[1] as Record<string, { r: boolean }>)["10.1000/x7"]!.r).toBe(true);
  });

  it("forced: every DOI again and retr_done; a failure: retr_failed when forced, nothing when quiet; no DOI: retr_nodoi when forced only", async () => {
    const fetchFn = openAlex([]);
    const forced = deps({ fetch: fetchFn as unknown as typeof fetch, cache: { "10.1000/smith": { r: false, t: NOW }, "10.1000/lee": { r: false, t: NOW } } });
    await retractionRefresh(true, forced.d);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(forced.d.toast.mock.calls).toEqual([[E.retr_done]]);
    const failing = vi.fn(async () => json({}, 503)) as unknown as typeof fetch;
    const f1 = deps({ fetch: failing });
    await retractionRefresh(true, f1.d);
    expect(f1.d.toast.mock.calls).toEqual([[E.retr_failed]]);
    const f2 = deps({ fetch: failing });
    await retractionRefresh(false, f2.d);
    expect(f2.d.toast).not.toHaveBeenCalled();
    const none = deps({ lib: [RAO] });
    await retractionRefresh(false, none.d);
    expect(none.d.toast).not.toHaveBeenCalled();
    await retractionRefresh(true, none.d);
    expect(none.d.toast.mock.calls).toEqual([[E.retr_nodoi]]);
  });

  it("opening the Cite tab refreshes quietly (no toast); the button forces it and toasts retr_done", async () => {
    const fetchFn = openAlex(["10.1000/lee"]);
    vi.stubGlobal("fetch", fetchFn);
    mount();
    await settle();
    expect(fetchFn.mock.calls.map((c) => String(c[0]))).toEqual([oaUrl(["10.1000/smith", "10.1000/lee"])]);
    expect(toasts()).toEqual([]);
    const cache = applied(h.blobs.retraction_cache!, {}) as Record<string, { r: boolean }>;
    expect(Object.keys(cache)).toEqual(["10.1000/smith", "10.1000/lee"]);
    await click(tid("cite-retract-btn")!);
    expect(tid("cite-retract-btn")!.textContent).toBe("Check for retractions");
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(toasts()).toEqual([E.retr_done]);
  });

  it("a flagged paper: the line under the heading is retr_summary_fmt (bold), and the row says Retracted with retr_lib_warn", async () => {
    h.blobs.retraction_cache = blob({ "10.1000/smith": { r: false, t: Date.now() }, "10.1000/lee": { r: true, t: Date.now() } });
    mount();
    await settle();
    expect(tid("cit-checked")!.textContent).toBe(t("retr_summary_fmt", { c: 2, r: 1, n: 1 }));
    expect(tid("cit-checked")!.classList.contains("cite-flagged")).toBe(true);
    const cards = all("source-row");
    expect(cards.map((c) => c.querySelector('[data-cite-slot="cite-attention"]')!.textContent)).toEqual(["", E.retr_lib_warn, ""]);
    expect(cards.map((c) => c.querySelector('[data-testid="source-status"]')!.textContent)).toEqual(["Not checked yet", "Retracted", "Not checked yet"]);
    expect(cards[1]!.querySelector(".cit-problem-retracted")).not.toBeNull();
  });

  it("a cache that does not open (R16): the quiet refresh leaves it alone; the button asks first, and Cancel checks nothing", async () => {
    const fetchFn = openAlex([]);
    vi.stubGlobal("fetch", fetchFn);
    h.blobs.retraction_cache = { ...blob(null), broken: true };
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    mount();
    await settle();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    await click(tid("cite-retract-btn")!);
    expect(confirm).toHaveBeenCalledWith(E.vault_check_broken_confirm);
    expect(fetchFn).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await click(tid("cite-retract-btn")!);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(toasts()).toEqual([E.retr_done]);
  });

  it("a broken cache with nothing to look up asks nothing: the forced check toasts retr_nodoi", async () => {
    h.blobs.citations = blob([RAO]);
    h.blobs.retraction_cache = { ...blob(null), broken: true };
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    mount();
    await settle();
    await click(tid("cite-retract-btn")!);
    expect(confirm).not.toHaveBeenCalled();
    expect(toasts()).toEqual([E.retr_nodoi]);
  });

  it("a project switch with the Cite tab open refreshes quietly for the new project", async () => {
    const fetchFn = openAlex([]);
    vi.stubGlobal("fetch", fetchFn);
    mount();
    await settle();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    h.project = { id: "p-2" };
    act(() => { for (const r of roots) r.render(<CitationsTab />); });
    await settle();
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(toasts()).toEqual([]);
  });

  it("nothing checked yet: there is no line under the heading", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    mount();
    await settle();
    expect(tid("cit-checked")).toBeNull();
    expect(toasts()).toEqual([]);
  });
});

describe("the reference check (v1 rcRun 7772-7790, rcLine 7792-7797)", () => {
  const work = (title: string, year: number, family: string, doi: string) => ({ message: { title: [title], issued: { "date-parts": [[year]] }, author: [{ family }], DOI: doi } });
  function crossref() {
    return vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://api.crossref.org/works/" + encodeURIComponent("10.1000/smith")) return json(work("Sleep and memory", 2020, "Smith", "10.1000/smith"));
      if (url === "https://api.crossref.org/works/" + encodeURIComponent("10.1000/lee")) return json(work("A different paper on homework entirely", 2012, "Leigh", "10.1000/lee"));
      if (url.startsWith("https://api.crossref.org/works?rows=3")) return json({ message: { items: [] } });
      throw new TypeError("Failed to fetch");
    });
  }
  const rdeps = (fetchFn: unknown, over: Partial<RcDeps> = {}) => {
    const saved: RefCheckCache[] = [];
    const save = vi.fn((fn: (p: RefCheckCache | null) => RefCheckCache) => { saved.push(fn(null)); });
    const toast = vi.fn((msg: string) => { void msg; });
    return { d: { lib: [SMITH, LEE, RAO], cache: {}, fetch: fetchFn as typeof fetch, t, ...over, save, toast }, saved };
  };

  it("one Crossref call per entry with a 200 ms pause after each (fake timers); rc_busy first, rc_done after; the cache keyed by citKey", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const fetchFn = crossref();
    const { d, saved } = rdeps(fetchFn);
    const run = rcRun(true, d);
    await vi.advanceTimersByTimeAsync(0);
    expect(d.toast.mock.calls[0]).toEqual([E.rc_busy]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(199);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(200);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(200);
    await run;
    expect(d.toast.mock.calls.map((c) => c[0])).toEqual([E.rc_busy, E.rc_done]);
    const cache = saved.at(-1) as Record<string, RcCheck>;
    expect(Object.keys(cache)).toEqual([citKey(SMITH), citKey(LEE), citKey(RAO)]);
    expect(citKey(SMITH)).toBe("Smith|2020|sleep and memory");
    expect(cache[citKey(SMITH)]!.s).toBe("ok");
    expect(cache[citKey(LEE)]).toMatchObject({ s: "diff", m: [{ k: "title" }, { k: "year", v: "2012" }, { k: "author", v: "Leigh" }] });
    expect(cache[citKey(RAO)]!.s).toBe("nf");
  });

  it("unforced, a stored answer (not an error) skips the call; the button forces every entry again", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const fetchFn = crossref();
    const cached = { [citKey(SMITH)]: { s: "ok", t: 1 }, [citKey(LEE)]: { s: "err", t: 1 } } as Record<string, RcCheck>;
    const { d } = rdeps(fetchFn, { cache: cached });
    const run = rcRun(false, d);
    await vi.advanceTimersByTimeAsync(1000);
    await run;
    expect(fetchFn.mock.calls.map((c) => String(c[0]))).toEqual([
      "https://api.crossref.org/works/" + encodeURIComponent("10.1000/lee"),
      "https://api.crossref.org/works?rows=3&query.bibliographic=" + encodeURIComponent("No identifier here Rao")
    ]);
    vi.useRealTimers();
    const panelFetch = crossref();
    vi.stubGlobal("fetch", panelFetch);
    h.blobs.citations = blob([SMITH]);
    h.blobs.retraction_cache = blob({ "10.1000/smith": { r: false, t: Date.now() } });
    h.blobs.refcheck_cache = blob(cached);
    mount();
    await settle();
    expect(tid("cite-rc-btn")!.textContent).toBe("Check details against Crossref");
    await click(tid("cite-rc-btn")!);
    await settle(250);
    expect(panelFetch.mock.calls.map((c) => String(c[0]))).toEqual(["https://api.crossref.org/works/" + encodeURIComponent("10.1000/smith")]);
    expect(toasts()).toEqual([E.rc_busy, E.rc_done]);
  });

  it("rc_empty with no library (the button); rc_fail when every lookup failed", async () => {
    const empty = rdeps(crossref(), { lib: [] });
    await rcRun(true, empty.d);
    expect(empty.d.toast.mock.calls).toEqual([[E.rc_empty]]);
    await rcRun(false, empty.d);
    expect(empty.d.toast.mock.calls).toEqual([[E.rc_empty]]);
    const failing = rdeps(vi.fn(async () => { throw new TypeError("Failed to fetch"); }), { lib: [SMITH], pace: async () => {} });
    await rcRun(true, failing.d);
    expect(failing.d.toast.mock.calls.map((c) => c[0])).toEqual([E.rc_busy, E.rc_fail]);
    expect((failing.saved.at(-1) as Record<string, RcCheck>)[citKey(SMITH)]!.s).toBe("err");
  });

  it("each row's Crossref sentence per state: a difference, a source Crossref does not know; a match and a failed lookup say nothing there", async () => {
    const LIN: CitationEntry = { author: "Lin, May", year: "2011", title: "Title search" };
    const ERR: CitationEntry = { author: "Err, Ann", year: "2001", title: "Could not check" };
    h.blobs.citations = blob([SMITH, LEE, RAO, LIN, ERR]);
    h.blobs.refcheck_cache = blob({
      [citKey(SMITH)]: { s: "ok", m: [], f: { title: "Sleep and memory", year: 2020, author: "Smith", doi: "10.1000/smith" }, t: 1 },
      [citKey(LEE)]: { s: "diff", m: [{ k: "title", v: "Other" }, { k: "year", v: "2012" }], f: { title: "Other", year: 2012, author: "Lee", doi: "10.9/x" }, viaTitle: true, t: 1 },
      [citKey(RAO)]: { s: "nf", t: 1 },
      [citKey(LIN)]: { s: "ok", m: [], f: { title: "Title search", year: 2011, author: "Lin", doi: "10.5/lin" }, viaTitle: true, t: 1 },
      [citKey(ERR)]: { s: "err", t: 1 }
    });
    mount();
    await settle();
    const rows = all("source-row");
    expect(rows.map((c) => c.querySelector('[data-testid="source-status"]')!.textContent)).toEqual(["Checked", "Needs a fix", "Needs a fix", "Checked", "Not checked yet"]);
    expect(rows.map((c) => c.querySelector('[data-cite-slot="cite-attention"]')!.textContent)).toEqual([
      "",
      E.rc_title + " Other  ·  " + E.rc_year + " 2012" + E.rc_doi_missing + " 10.9/x",
      E.rc_nf,
      "",
      ""
    ]);
    expect(rows[1]!.querySelector('[data-cite-slot="cite-attention"] br')).not.toBeNull();
  });

  it("nothing checked: every row reads Not checked yet and has nothing in its Crossref slot", async () => {
    mount();
    await settle();
    expect(all("source-row").map((c) => c.querySelector('[data-testid="source-status"]')!.textContent)).toEqual(["Not checked yet", "Not checked yet", "Not checked yet"]);
    expect(all("source-row").map((c) => c.querySelector('[data-cite-slot="cite-attention"]')!.textContent)).toEqual(["", "", ""]);
  });
});

describe("Fill from Crossref (fix wave A, W27, W28; register D-S2-33)", () => {
  const TITLE = "Sleep timing and attention in adolescents", DOI = "10.1038/s41598-024-0001-x";
  const AUTHORS = "Schaefer, Ellen M.; Gonzalez, Carlos B.; Lee, Kim";
  const WORK = { title: [TITLE], DOI, issued: { "date-parts": [[2019]] }, volume: "9", issue: "1", page: "13317", type: "journal-article", author: [{ family: "Schaefer", given: "Ellen M." }, { family: "Gonzalez", given: "Carlos B." }, { family: "Lee", given: "Kim" }] };
  const crFetch = (async () => json({ message: WORK })) as unknown as typeof fetch;
  const AUTHORLESS: CitationEntry = { author: "", year: "2019", title: TITLE, doi: DOI, volume: "12" };
  /** The Crossref check of the authorless entry, as rcRun stores it. */
  async function checked(d: CitationEntry = AUTHORLESS) { return { [citKey(d)]: await rcCheckOneV2(crFetch, d) } as RefCheckCache; }
  const lineOf = () => all("source-row")[0]!.querySelector('[data-cite-slot="cite-attention"]')!;
  const stubConfirm = (answer: boolean) => vi.spyOn(window, "confirm").mockReturnValue(answer);

  it("rcRun stores the empty author and the missing fields (an authorless capture is no longer a full match)", async () => {
    const saved: RefCheckCache[] = [];
    await rcRun(true, { lib: [AUTHORLESS], cache: {}, fetch: crFetch, t, pace: async () => {}, save: (fn) => { saved.push(fn(null)); }, toast: vi.fn() });
    const c = saved.at(-1)![citKey(AUTHORLESS)]!;
    expect(c.s).toBe("diff");
    expect(c.miss).toEqual(["author", "issue", "pages"]);
    expect(c.m).toContainEqual({ k: "author", v: "Schaefer" });
  });

  it("the row names the missing fields and offers Use Crossref details", async () => {
    h.blobs.citations = blob([AUTHORLESS]);
    h.blobs.refcheck_cache = blob(await checked());
    mount();
    await settle();
    expect(lineOf().textContent).toContain(E.rc_author + " Schaefer");
    expect(tid("cite-rc-missing")!.textContent).toBe(t("rc_missing", { fields: "author, issue, pages" }));
    expect(tid("source-fix")!.textContent).toBe("Use Crossref details");
  });

  it("Use Crossref details asks with each field and its value, then fills only the empty fields", async () => {
    const confirm = stubConfirm(true);
    h.blobs.citations = blob([AUTHORLESS, SMITH]);
    h.blobs.refcheck_cache = blob(await checked());
    mount();
    await settle();
    await click(tid("source-fix")!);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0]![0]).toBe(t("rc_fill_confirm", { list: "Author: " + AUTHORS + "\nIssue: 1\nPages: 13317" }));
    expect(confirm.mock.calls[0]![0]).toBe("Fill these from Crossref? Only empty fields change.\n\nAuthor: " + AUTHORS + "\nIssue: 1\nPages: 13317");
    expect(noPids(applied(h.blobs.citations!, [AUTHORLESS, SMITH]) as CitationEntry[])).toEqual([{ ...AUTHORLESS, author: AUTHORS, issue: "1", pages: "13317" }, SMITH]);
    expect((applied(h.blobs.citations!, [AUTHORLESS, SMITH]) as CitationEntry[])[0]!.volume).toBe("12");
    expect(toasts()).toEqual([E.rc_filled]);
  });

  it("after a fill the source reads Checked (the cache entry moved to the new key)", async () => {
    stubConfirm(true);
    const cache = await checked();
    h.blobs.citations = blob([AUTHORLESS]);
    h.blobs.refcheck_cache = blob(cache);
    mount();
    await settle();
    await click(tid("source-fix")!);
    const lib = applied(h.blobs.citations!, [AUTHORLESS]) as CitationEntry[];
    const next = applied(h.blobs.refcheck_cache!, cache) as RefCheckCache;
    expect(Object.keys(next)).toEqual([citKey(lib[0]!)]);
    expect(citKey(lib[0]!)).toBe("Schaefer|2019|" + TITLE.toLowerCase());
    expect(next[citKey(lib[0]!)]).toMatchObject({ s: "ok", m: [], f: cache[citKey(AUTHORLESS)]!.f });
    // The panel shows it: remount over what was written.
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    document.body.innerHTML = "";
    h.blobs.citations = blob(lib);
    h.blobs.refcheck_cache = blob(next);
    mount();
    await settle();
    expect(all("source-status")[0]!.textContent).toBe("Checked");
    expect(lineOf().textContent).toBe("");
    expect(tid("source-fix")).toBeNull();
  });

  it("Fill never overwrites a field that has a value: a volume written after the check stays, and a fill of nothing writes nothing", async () => {
    stubConfirm(true);
    const cache = await checked();
    const nowFull: CitationEntry = { ...AUTHORLESS, issue: "7", pages: "1-9" };
    h.blobs.citations = blob([nowFull]);
    h.blobs.refcheck_cache = blob(cache);
    mount();
    await settle();
    // The cache is keyed by the same citKey; the entry already has issue and pages, so only the author is offered.
    await click(tid("source-fix")!);
    expect((vi.mocked(window.confirm).mock.calls[0]![0])).toBe(t("rc_fill_confirm", { list: "Author: " + AUTHORS }));
    expect(noPids(applied(h.blobs.citations!, [nowFull]) as CitationEntry[])).toEqual([{ ...nowFull, author: AUTHORS }]);
    // Nothing left to fill: no question, no write.
    h.blobs.citations!.set.mockClear(); h.blobs.refcheck_cache!.set.mockClear(); vi.mocked(window.confirm).mockClear();
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    document.body.innerHTML = "";
    const done: CitationEntry = { ...nowFull, author: "Mine, A." };
    h.blobs.citations = blob([done]);
    h.blobs.refcheck_cache = blob({ [citKey(done)]: { ...cache[citKey(AUTHORLESS)]! } });
    mount();
    await settle();
    // The answer still says "no author", but the source has one now (wave A LATER T11): the row reads Checked and offers nothing.
    expect(all("source-status")[0]!.textContent).toBe("Checked");
    expect(tid("source-fix")).toBeNull();
    expect(lineOf().textContent).toBe("");
    // And a fill asked for anyway has nothing to write: no question, no write.
    const out: HookProbe = {};
    probe(out);
    out.checks!.fillFromCrossref(done);
    expect(window.confirm).not.toHaveBeenCalled();
    expect(h.blobs.citations.set).not.toHaveBeenCalled();
    expect(h.blobs.refcheck_cache.set).not.toHaveBeenCalled();
  });

  it("Cancel changes nothing; the pop-out shows no fix button", async () => {
    const confirm = stubConfirm(false);
    h.blobs.citations = blob([AUTHORLESS]);
    h.blobs.refcheck_cache = blob(await checked());
    mount();
    await settle();
    await click(tid("source-fix")!);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(h.blobs.citations.set).not.toHaveBeenCalled();
    expect(h.blobs.refcheck_cache.set).not.toHaveBeenCalled();
    expect(toasts()).toEqual([]);
    // The pop-out cannot write the cache: the line still says what is missing, with no button.
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    document.body.innerHTML = "";
    h.blobs.refcheck_cache = { ...blob(await checked()), readOnly: true } as Blob;
    mount();
    await settle();
    expect(tid("cite-rc-missing")!.textContent).toBe(t("rc_missing", { fields: "author, issue, pages" }));
    expect(tid("source-fix")).toBeNull();
  });

  it("fillEmpty with no matching entry returns false and writes nothing (wave A LATER T11)", () => {
    h.blobs.citations = blob([SMITH]);
    const out: HookProbe = {};
    probe(out);
    expect(out.library!.fillEmpty((e) => e.title === "No such source", { volume: "9" })).toBe(false);
    expect(h.blobs.citations.set).not.toHaveBeenCalled();
    // An entry that matches is filled, as before.
    expect(out.library!.fillEmpty((e) => e.title === SMITH.title, { volume: "9" })).toBe(true);
    expect(noPids(applied(h.blobs.citations, [SMITH]) as CitationEntry[])).toEqual([{ ...SMITH, volume: "9" }]);
  });

  it("fillEmpty asks the library as it stands now, not as it was when the function was handed out; a library still being read queues the fill", () => {
    // One blob client, so one `set`: the hook's own is stable across renders.
    const first = blob([]);
    h.blobs.citations = first;
    const out: HookProbe = {};
    const root = probe(out);
    const early = out.library!.fillEmpty;
    // The source is kept after `early` was handed out (Keep, then Crossref's answer, which calls the function it was given).
    h.blobs.citations = { ...first, value: [SMITH] };
    act(() => { root.render(<Hooks out={out} />); });
    expect(early((e) => e.title === SMITH.title, { volume: "9" })).toBe(true);
    expect(first.set).toHaveBeenCalledTimes(1);
    // A write just made is not in the list the last render read: the next fill is queued, not refused.
    expect(early((e) => e.title === "Written a moment ago", { volume: "9" })).toBe(true);
    expect(first.set).toHaveBeenCalledTimes(2);
    // Not read yet: there is nothing to say no with, so the fill waits for the stored library, as an add does.
    h.blobs.citations = { ...first, value: null, loading: true };
    act(() => { root.render(<Hooks out={out} />); });
    expect(out.library!.fillEmpty((e) => e.title === SMITH.title, { volume: "9" })).toBe(true);
    expect(first.set).toHaveBeenCalledTimes(3);
    // A locked library is not read either.
    h.blobs.citations = { ...first, value: null, locked: true };
    act(() => { root.render(<Hooks out={out} />); });
    expect(out.library!.fillEmpty((e) => e.title === SMITH.title, { volume: "9" })).toBe(true);
    expect(first.set).toHaveBeenCalledTimes(4);
  });

  it("the author line leaves the check once the entry has an author; a real difference of a saved author stays (wave A LATER T11)", async () => {
    const answer = await checked();
    const c = answer[citKey(AUTHORLESS)]!;
    expect(c.m).toContainEqual({ k: "author", v: "Schaefer" });
    // Nothing to change while the entry has no author: the same answer comes back.
    expect(rcCurrent(AUTHORLESS, c)).toBe(c);
    // An author typed or captured since: the author line and the author in `miss` go; the other missing fields stay.
    const now = rcCurrent({ ...AUTHORLESS, author: "Mine, A." }, c)!;
    expect(now.m).toEqual([]);
    expect(now.miss).toEqual(["issue", "pages"]);
    expect(now.s).toBe("diff");
    // Nothing else wrong: the answer is a match.
    const only = rcCurrent({ ...AUTHORLESS, author: "Mine, A.", issue: "1", pages: "13317" }, c)!;
    expect(only).toMatchObject({ s: "ok", m: [] });
    expect(only.miss).toBeUndefined();
    expect(only.f).toEqual(c.f);
    // A difference the check found with an author saved (no `miss`) is still a difference.
    const real: RcCheck = { s: "diff", m: [{ k: "author", v: "Cohen" }], t: 1 };
    expect(rcCurrent({ author: "Smith, J.", year: "2019", title: "T" }, real)).toBe(real);
    // No answer, or an answer that is not a difference: untouched.
    expect(rcCurrent(AUTHORLESS, undefined)).toBeUndefined();
    const okAnswer: RcCheck = { s: "ok", m: [], t: 1 };
    expect(rcCurrent({ author: "A, B." }, okAnswer)).toBe(okAnswer);
  });

  it("Use Crossref details on a source that changed since the check moves nothing and says nothing (the cache move was worked out from a stale entry)", async () => {
    stubConfirm(true);
    const cache = await checked();
    // The library's entry has an author now (another window filled it): its key is no longer the one the answer is under.
    const moved: CitationEntry = { ...AUTHORLESS, author: "Mine, A." };
    h.blobs.citations = blob([moved]);
    h.blobs.refcheck_cache = blob(cache);
    const out: HookProbe = {};
    probe(out);
    out.checks!.fillFromCrossref(AUTHORLESS);
    expect(h.blobs.citations.set).not.toHaveBeenCalled();
    expect(h.blobs.refcheck_cache.set).not.toHaveBeenCalled();
    expect(toasts()).toEqual([]);
  });
});

/**
 * Wave A LATER T11, a strict old-schema test. The weak one parsed with a loose copy of the old schema, so it could not fail. Here build 6c38396's schemas are written out as that
 * build had them, and the test holds this build to both halves of the promise: what it writes is accepted by the old build and survives the old build's read and save unchanged
 * (the loose objects keep every new key, Task 17's `pid`, `rl`, `abstract`, `oa` and `ack` included), and everything the old build refuses this build refuses too.
 */
describe("blobs written by this build stay readable by build 6c38396, and refuse what it refuses", () => {
  const TITLE = "Sleep timing and attention in adolescents", DOI = "10.1038/s41598-024-0001-x";
  const AUTHORS = "Schaefer, Ellen M.; Gonzalez, Carlos B.; Lee, Kim";
  const WORK = { title: [TITLE], DOI, issued: { "date-parts": [[2019]] }, volume: "9", issue: "1", page: "13317", type: "journal-article", author: [{ family: "Schaefer", given: "Ellen M." }, { family: "Gonzalez", given: "Carlos B." }, { family: "Lee", given: "Kim" }] };
  const crFetch = (async () => json({ message: WORK })) as unknown as typeof fetch;
  const AUTHORLESS: CitationEntry = { author: "", year: "2019", title: TITLE, doi: DOI, volume: "12" };

  async function oldSchemas() {
    const { z } = await import("zod");
    const str = z.string(), num = z.number();
    const OldEntry = z.looseObject({
      author: str.optional(), year: str.optional(), title: str.optional(), source: str.optional(), volume: str.optional(), issue: str.optional(),
      pages: str.optional(), doi: str.optional(), url: str.optional(), month: str.optional(), day: str.optional(), accessed: str.optional(),
      container: str.optional(), editors: str.optional(), number: str.optional(), degree: str.optional(), type: str.optional(), style: str.optional(), lang: str.optional()
    });
    const OldRcCheck = z.looseObject({
      s: z.enum(["ok", "diff", "nf", "err"]),
      m: z.array(z.looseObject({ k: z.enum(["title", "year", "author"]), v: str })).optional(),
      f: z.looseObject({ title: str, year: z.union([num, str]), author: str, doi: str }).optional(),
      viaTitle: z.literal(true).optional(),
      t: num
    });
    return { citations: z.array(OldEntry), refcheck_cache: z.record(str, OldRcCheck) };
  }

  const WRITTEN: Array<[string, "citations" | "refcheck_cache", () => Promise<unknown>]> = [
    ["a Crossref check with the empty author and the fields Crossref has (`miss`, and `authors`, `issue`, `pages` in `f`)", "refcheck_cache", async () => ({ [citKey(AUTHORLESS)]: await rcCheckOneV2(crFetch, AUTHORLESS) })],
    ["v1's own answers: a match, a difference found by title, not found, an error", "refcheck_cache", async () => ({
      "a|1|x": { s: "ok", m: [], f: { title: "x", year: 2020, author: "a", doi: "10.1/x" }, t: 1 },
      "b|2|y": { s: "diff", m: [{ k: "title", v: "Other" }, { k: "year", v: "2012" }], f: { title: "Other", year: "2012", author: "b", doi: "10.9/x" }, viaTitle: true, t: 2 },
      "c|3|z": { s: "nf", t: 3 }, "d|4|w": { s: "err", t: 4 }
    })],
    ["an answer moved to its new key by Use Crossref details", "refcheck_cache", async () => ({ "Schaefer|2019|t": { s: "ok", m: [], f: { title: "t", year: 2019, author: "Schaefer", doi: DOI, authors: AUTHORS }, t: 5 } })],
    ["v1's entries", "citations", async () => [SMITH, LEE, RAO]],
    ["entries a kept paper carries: pid, rl, abstract, oa and ack (Task 17)", "citations", async () => [
      { ...SMITH, pid: "kmg3x1abcd", rl: true, abstract: "We tested sleep.", oa: "https://example.org/free.pdf", ack: ["year"] },
      { ...RAO, pid: "kmg3x1abce", rl: false }
    ]]
  ];
  it.each(WRITTEN)("%s: accepted by 6c38396, nothing stripped by its read and save, and read here as written", async (_n, kind, make) => {
    const written = JSON.parse(JSON.stringify(await make()));
    const old = (await oldSchemas())[kind].safeParse(written);
    expect(old.success).toBe(true);
    expect(old.success ? old.data : null).toEqual(written);
    expect(parseBlob(kind, JSON.stringify(written))).toEqual(written);
  });

  const REJECTED: Array<[string, "citations" | "refcheck_cache", unknown]> = [
    ["an answer with an unknown outcome", "refcheck_cache", { k: { s: "maybe", t: 1 } }],
    ["an answer with no time", "refcheck_cache", { k: { s: "ok" } }],
    ["an answer whose time is text", "refcheck_cache", { k: { s: "ok", t: "1" } }],
    ["a difference of a kind that is not title, year or author", "refcheck_cache", { k: { s: "diff", m: [{ k: "pages", v: "x" }], t: 1 } }],
    ["a difference with no value", "refcheck_cache", { k: { s: "diff", m: [{ k: "title" }], t: 1 } }],
    ["what Crossref holds with no DOI", "refcheck_cache", { k: { s: "ok", f: { title: "x", year: 2020, author: "a" }, t: 1 } }],
    ["a year that is neither a number nor text", "refcheck_cache", { k: { s: "ok", f: { title: "x", year: true, author: "a", doi: "d" }, t: 1 } }],
    ["viaTitle false", "refcheck_cache", { k: { s: "ok", viaTitle: false, t: 1 } }],
    ["a list in place of a record", "refcheck_cache", [{ s: "ok", t: 1 }]],
    ["text in place of a record", "refcheck_cache", "ok"],
    ["an author that is a number", "citations", [{ author: 3 }]],
    ["a year that is a number", "citations", [{ year: 2020 }]],
    ["a title that is null", "citations", [{ title: null }]],
    ["an entry that is text", "citations", ["Smith, 2020"]],
    ["a record in place of the list", "citations", { 0: { title: "x" } }]
  ];
  it.each(REJECTED)("%s: refused by 6c38396 and refused here", async (_n, kind, value) => {
    expect((await oldSchemas())[kind].safeParse(value).success).toBe(false);
    expect(parseBlob(kind, JSON.stringify(value))).toBeNull();
  });

  it("the fields this build adds are typed here; 6c38396, which does not know them, keeps whatever they hold", async () => {
    const odd = [{ ...SMITH, rl: "yes", ack: "year", pid: 7 }];
    expect((await oldSchemas()).citations.safeParse(odd).success).toBe(true);
    expect(parseBlob("citations", JSON.stringify(odd))).toBeNull();
  });
});

describe("usage in the tab (v1 citRender 7835-7858)", () => {
  it("the heading's count, each source's use line, a document's name that shows that document; the open document is read live", async () => {
    h.documents = [{ id: "d1", title: "Review", updatedAt: "1" }, { id: "d2", title: "Draft", updatedAt: "1" }];
    h.stored = { d1: { bodyHtml: "sealed:<p>(Smith, 2020) and Smith (2020).</p>", keyVersion: 1 }, d2: { bodyHtml: "<p>stored, not live</p>", keyVersion: 0 } };
    h.currentDoc = { id: "d2" };
    const e = editorWith("<p>Live: (Lee, 2018).</p>");
    mount();
    await settle(10);
    expect(tid("cit-head")!.textContent).toBe("3 sources, 2 cited in your document");
    const used = all("source-row").map((c) => c.querySelector('[data-testid="source-use"]')!.textContent);
    expect(used).toEqual(["Cited 2 times", "Cited once in Draft", "Not cited yet"]);
    await click(all("source-row")[1]!.querySelector('[data-testid="source-use"] button')!);
    expect(h.selectDoc).toHaveBeenCalledWith("d2");
    // Typing in the open document counts shortly after.
    await act(async () => { e.commands.insertContentAt(e.state.doc.content.size - 1, " Rao (2015)."); await new Promise((r) => setTimeout(r, 450)); });
    expect(tid("cit-head")!.textContent).toBe("3 sources, 3 cited in your document");
  });

  it("numbered style: num_missing_fmt lists the open document's numbers past the library", async () => {
    h.documents = [{ id: "d1", title: "Review", updatedAt: "1" }];
    h.currentDoc = { id: "d1" };
    editorWith("<p>As shown [1], [4,5] and <sup>3</sup>.</p>");
    mount();
    const style = document.getElementById("citStyle") as HTMLSelectElement;
    act(() => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(style, "vancouver"); style.dispatchEvent(new Event("change", { bubbles: true })); });
    await settle(10);
    expect(tid("cite-num-missing")!.textContent).toBe(t("num_missing_fmt", { n: "[4], [5]" }));
  });
});

describe("the cross-check dialog (v1 ccOpen/ccJump 12158-12193)", () => {
  const DOC = "<p>Sleep consolidates memory (Smith, 2020). Exam stress rises (Jones et al., 2019; Smyth, 2021). Lee (2017) disagrees, and (Jones et al., 2019) again.</p>"
    + "<p>References</p><p>Smith, J. (2020). Sleep and memory. Journal of Sleep.</p><p>Smith, J. (2021). Another paper. Journal.</p><p>Lee, K. (2018). Homework. Journal.</p>"
    + "<p>Brown, A. (2015). Never cited. Journal.</p><p>not a reference line</p>";

  it("the dialog's sections from the document's References section, in v1's order and copy", async () => {
    const e = editorWith(DOC);
    mount();
    await settle();
    expect(tid("cite-cc-btn")!.textContent).toBe("Cross-check citations in my document");
    await click(tid("cite-cc-btn")!);
    const dlg = tid("cc-dialog")!;
    expect(dlg).not.toBeNull();
    const r = crossCheckHtml(e.getHTML(), h.blobs.citations!.value as CitationEntry[], "apa");
    expect([r.srcKind, r.cited, r.missing.length, r.unused.length, r.unread]).toEqual(["doc", 4, 3, 3, 1]);
    expect(dlg.querySelector("h2")!.textContent).toBe(E.cc_h);
    expect(tid("cc-desc")!.textContent).toBe(E.cc_desc);
    expect(tid("cc-src")!.textContent).toBe(t("cc_src_doc", { h: "References", n: 4 }));
    expect(tid("cc-sum")!.textContent).toBe(t("cc_sum", { c: 4, m: 3, u: 3 }));
    expect([...dlg.querySelectorAll("h3")].map((x) => x.textContent)).toEqual([E.cc_missing_h, E.cc_unused_h]);
    const missing = all("cc-missing");
    expect(missing.map((m) => m.querySelector("b")!.textContent)).toEqual(["Lee 2017", "Jones 2019", "Smyth 2021"]);
    expect(missing[1]!.textContent).toContain("(2×)");
    expect(missing.map((m) => m.querySelector("code")!.textContent)).toEqual(["Lee (2017)", "Jones et al., 2019", "Smyth, 2021"]);
    expect(missing[0]!.textContent).toContain(t("cc_near_year", { n: "Lee", y: "2018" }));
    expect(missing[2]!.textContent).toContain(t("cc_near_name", { n: "Smith", y: "2021" }));
    expect(all("cc-go").map((b) => b.textContent)).toEqual([E.nc_go, E.nc_go, E.nc_go]);
    expect(all("cc-unused").map((u) => u.textContent)).toEqual(["Smith, J. (2021). Another paper. Journal.", "Lee, K. (2018). Homework. Journal.", "Brown, A. (2015). Never cited. Journal."]);
    expect(tid("cc-unread")!.textContent).toBe(t("cc_unread", { n: 1 }));
    expect(tid("cc-note")!.textContent).toBe(E.cc_note);
    expect(tid("cc-rescan")!.textContent).toBe(E.nc_rescan);
    expect(tid("cc-close")!.textContent).toBe(E.close_btn);
  });

  it("\"Go to this text\" closes the dialog and selects the passage in the editor", async () => {
    const e = editorWith(DOC);
    mount();
    await settle();
    await click(tid("cite-cc-btn")!);
    await click(all("cc-go")[1]!);
    expect(tid("cc-dialog")).toBeNull();
    const { from, to } = e.state.selection;
    expect(e.state.doc.textBetween(from, to)).toBe("Jones et al., 2019");
    await click(tid("cite-cc-btn")!);
    await click(all("cc-go")[0]!);
    expect(e.state.doc.textBetween(e.state.selection.from, e.state.selection.to)).toBe("Lee (2017)");
  });

  it("no References section: the library is the list (cc_src_lib); none at all: cc_src_none with no sections; Scan again re-reads; Close closes", async () => {
    const e = editorWith("<p>As Smith (2020) said (Rao, 2015) and (Brown, 2016).</p>");
    mount();
    await settle();
    await click(tid("cite-cc-btn")!);
    expect(tid("cc-src")!.textContent).toBe(t("cc_src_lib", { n: 3 }));
    expect(all("cc-missing").map((m) => m.querySelector("b")!.textContent)).toEqual(["Brown 2016"]);
    expect(all("cc-unused").map((u) => u.textContent)).toEqual([crossCheckHtml(e.getHTML(), [SMITH, LEE, RAO], "apa").unused[0]!.text]);
    act(() => { e.commands.setContent("<p>All cited: Smith (2020), Lee (2018) and Rao (2015).</p>"); });
    await click(tid("cc-rescan")!);
    expect(all("cc-missing")).toEqual([]);
    expect(tid("cc-dialog")!.textContent).toContain(E.cc_none_missing);
    expect(tid("cc-dialog")!.textContent).toContain(E.cc_none_unused);
    await click(tid("cc-close")!);
    expect(tid("cc-dialog")).toBeNull();
    h.blobs.citations = blob([]);
    act(() => { e.commands.setContent("<p>No citations at all.</p>"); for (const r of roots) r.render(<CitationsTab />); });
    await click(tid("cite-cc-btn")!);
    expect(tid("cc-src")!.textContent).toBe(E.cc_src_none);
    expect(tid("cc-sum")!.textContent).toBe("");
    expect(tid("cc-dialog")!.querySelectorAll("h3")).toHaveLength(0);
  });

  it("with no document open the button is disabled", async () => {
    mount();
    await settle();
    expect((tid("cite-cc-btn") as HTMLButtonElement).disabled).toBe(true);
  });
});
