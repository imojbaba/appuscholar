// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredEntry } from "../lib/blobs/kinds";
import en from "../messages/en.json";
import hi from "../messages/hi.json";

/*
 * The paste box in Find (wave B Task 19, canvas Find, register row D-S2-124): "Already have a paper? Paste a link, DOI or PubMed number". What is pasted is read and looked up by core
 * (paste.ts, held to its own recordings in packages/core); here the box is held to what the student sees and what is kept: the paper is kept at once through Keep's door, "Kept: {title}"
 * with Undo or "Already in your reading list: {title}", the four plan messages word for word, a press that waits for the library as Keep does, and the three hosts it may reach. Every
 * request must have a recording (the same fetch double as the Find tab's), or the test fails.
 */

type Blob = { value: unknown; loading: boolean; locked: boolean; broken?: boolean; error?: boolean; set: ReturnType<typeof vi.fn>; flush: ReturnType<typeof vi.fn> };
const h = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    blobs: {} as Record<string, unknown>,
    oaKey: null as string | null,
    subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
    emit: () => { for (const l of [...listeners]) l(); }
  };
});
vi.mock("@/lib/blobs/useProjectBlob", async () => {
  const { useSyncExternalStore } = await import("react");
  const none = { value: null, loading: false, locked: false, set: () => {}, flush: async () => true };
  return { useProjectBlob: (kind: string) => useSyncExternalStore(h.subscribe, () => h.blobs[kind] ?? none, () => h.blobs[kind] ?? none) };
});
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", scratchProjectId: "scratch-1" }, settings: { field: "psychology" } }) }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ project: { id: "p-1" }, projectId: "p-1" }) }));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => ({ status: "off" }) }));
vi.mock("@/lib/research/oaKey", () => ({ useOpenAlexKey: () => h.oaKey }));

import { PASTE_REQUEST_TIMEOUT_MS, PasteBox } from "../components/literature/PasteBox";
import { proxy } from "../proxy";
import { resetCiteStyle } from "../lib/cite/useLibrary";
import { assertAllRecorded, recordedFetch, RECS } from "./support/recordedFetch";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const E = en as Record<string, string>;
const WALK_DOI = "10.1038/s41598-019-49466-6"; // Schaefer et al. 2019, Scientific Reports: the walk sheet's paper (recorded)
const WALK_TITLE = "Open-label placebos reduce test anxiety and improve self-management skills: A randomized-controlled trial";
const NO_SUCH_DOI = "10.9999/appuscholar-no-such-doi-2026"; // Crossref and OpenAlex 404 (recorded)
const CR = (doi: string) => "https://api.crossref.org/works/" + encodeURIComponent(doi);
const ESUMMARY = (pmid: string) => "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=" + pmid;
const rf = recordedFetch();

const roots: Root[] = [];
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel);
const tid = (id: string) => $(`[data-testid="${id}"]`);
const input = () => tid("find-paste-input") as HTMLInputElement;
const go = () => tid("find-paste-go") as HTMLButtonElement;
const line = () => tid("find-paste-text")?.textContent ?? "";
const undoBtn = () => tid("find-paste-undo") as HTMLButtonElement | null;
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
  await act(async () => { root.render(<PasteBox />); });
  return root;
}
function type(value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function click(el: HTMLElement | null) { await act(async () => { el!.click(); await new Promise((r) => setTimeout(r, 0)); }); }
/** Pastes `value` and presses "Look it up and keep", then waits for the lookup to end (the button is no longer busy). */
async function paste(value: string) {
  type(value);
  await click(go());
  await until(() => !go().hasAttribute("aria-busy"));
}

/** The citations blob, as the client holds it: `set` applies the change to the value at once, as a blob that has been read does, and tells the page. */
function putLibrary(value: StoredEntry[] | null, over: Partial<Blob> = {}) {
  const set: Blob["set"] = vi.fn((next: unknown) => {
    const cur = h.blobs.citations as Blob;
    h.blobs.citations = { ...cur, value: typeof next === "function" ? (next as (p: unknown) => unknown)(cur.value) : next };
    h.emit();
  });
  h.blobs.citations = { value, loading: false, locked: false, set, flush: vi.fn(async () => true), ...over } satisfies Blob;
  act(() => { h.emit(); });
}
const library = () => h.blobs.citations as Blob;
const stored = () => (library().value ?? []) as StoredEntry[];
const sets = () => library().set.mock.calls.length;
/**
 * The next save is refused because another window saved first: the client reads that window's library (`theirs`) and replays every edit made here onto it (createBlobClient's 409 path),
 * so an edit that no longer fits is dropped by its own update. The edits made from now on are the ones replayed; flush() is where it happens.
 */
function loseNextSave(theirs: StoredEntry[]) {
  const ops: Array<(p: StoredEntry[]) => StoredEntry[]> = [];
  const set: Blob["set"] = vi.fn((next: unknown) => {
    const fn = next as (p: StoredEntry[]) => StoredEntry[];
    ops.push(fn);
    h.blobs.citations = { ...library(), value: fn(stored()) };
    h.emit();
  });
  const flush = vi.fn(async () => {
    h.blobs.citations = { ...library(), value: ops.reduce((acc, fn) => fn(acc), theirs) };
    h.emit();
    return true;
  });
  h.blobs.citations = { ...library(), set, flush };
  act(() => { h.emit(); });
}
const STORED_OTHER: StoredEntry = { author: "Stored, S.", title: "A stored paper that is not the one", year: "1999", pid: "kstored1", rl: true };

beforeEach(() => {
  putLibrary([]);
  h.oaKey = null;
  rf.reset();
  vi.stubGlobal("fetch", rf.fetch);
  resetCiteStyle();
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  assertAllRecorded(rf);
});

describe("Paste box: on the page", () => {
  it("is a closed details 'Already have a paper? Paste a link, DOI or PubMed number' with one labelled box and the button 'Look it up and keep'", async () => {
    await mount();
    const d = tid("find-paste") as HTMLDetailsElement;
    expect(d.tagName).toBe("DETAILS");
    expect(d.open).toBe(false);
    expect(d.querySelector("summary")!.textContent).toBe("Already have a paper? Paste a link, DOI or PubMed number");
    expect(input().getAttribute("aria-label")).toBe("Link, DOI or PubMed number");
    expect(go().textContent).toBe("Look it up and keep");
    expect(go().type).toBe("submit");
    // the line is in the page before it speaks, so a screen reader announces it
    expect(tid("find-paste-line")!.getAttribute("role")).toBe("status");
    expect(line()).toBe("");
  });

  it("every sentence of it is a key in both dictionaries, and the four messages are the plan's words", () => {
    const keys = Object.keys(E).filter((k) => k.startsWith("find_paste_"));
    expect(keys.length).toBeGreaterThanOrEqual(14);
    for (const k of keys) expect((hi as Record<string, string>)[k], k).toBeTruthy();
    expect(E.find_paste_link).toBe("This link has no DOI or PubMed number in it. Open the paper's page, copy its DOI and paste that.");
    expect(E.find_paste_text).toBe("That looks like a title. Search for it above.");
    expect(E.find_paste_nf).toBe("No paper found for {ref}. Check it and try again.");
    expect(E.find_paste_fail).toBe("Could not reach Crossref, PubMed or OpenAlex. Try again in a minute.");
    for (const k of keys) expect(E[k], k).not.toMatch(/—|–|Matrix|Shelf|Quick read|Pop out/);
  });
});

describe("Paste box: a DOI, a PubMed number, a PMC number, an arXiv id and an OpenAlex id are kept at once", () => {
  it("a DOI link keeps the paper with every author, the volume, the pages, a new id and the reading list, says 'Kept: {title}' and clears the box", async () => {
    await mount();
    await paste("https://doi.org/" + WALK_DOI);
    expect(rf.requested).toEqual([CR(WALK_DOI)]);
    expect(stored()).toHaveLength(1);
    const e = stored()[0]!;
    expect(e).toMatchObject({ title: WALK_TITLE, year: "2019", source: "Scientific Reports", volume: "9", issue: "1", pages: "13317", doi: WALK_DOI, rl: true });
    expect(e.pid).toMatch(/^k[a-z0-9]+$/);
    expect(e.author!.split("; ")).toHaveLength(6);
    expect(sets()).toBe(1);
    expect(line()).toBe("Kept: " + WALK_TITLE);
    expect(tid("find-paste-line")!.getAttribute("data-kind")).toBe("kept");
    expect(input().value).toBe("");
  });

  it("Enter in the box looks it up, as the button does", async () => {
    await mount();
    type(WALK_DOI);
    await act(async () => { input().form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await until(() => stored().length === 1);
    expect(line()).toBe("Kept: " + WALK_TITLE);
  });

  it("a PubMed number with no DOI keeps the paper as PubMed lists it", async () => {
    await mount();
    await paste("https://pubmed.ncbi.nlm.nih.gov/14907713/");
    expect(rf.requested).toEqual([ESUMMARY("14907713"), ESUMMARY("14907713")]);
    expect(stored()).toHaveLength(1);
    expect(stored()[0]).toMatchObject({ doi: "", url: "https://pubmed.ncbi.nlm.nih.gov/14907713/", rl: true });
    expect(line()).toBe("Kept: " + stored()[0]!.title);
  });

  it("a PMC number is found through PubMed Central and Crossref, an OpenAlex id brings its abstract and its free copy, and an arXiv id is found through OpenAlex", async () => {
    await mount();
    await paste("pmc6746734");
    expect(stored()).toHaveLength(1);
    expect(stored()[0]).toMatchObject({ doi: WALK_DOI, pages: "13317" });
    // the walk paper again by its OpenAlex id: the same DOI, so it is already kept; the abstract and the link come with a paper that is not
    await paste("https://openalex.org/W2972990769");
    expect(line()).toBe("Already in your reading list: " + WALK_TITLE);
    expect(stored()).toHaveLength(1);
    putLibrary([]);
    await paste("W2972990769");
    expect(stored()).toHaveLength(1);
    expect(stored()[0]!.abstract).toMatch(/^Test anxiety is /);
    expect(stored()[0]!.oa).toBe("https://www.nature.com/articles/s41598-019-49466-6.pdf");
    putLibrary([]);
    await paste("arXiv:2101.00001");
    expect(stored()).toHaveLength(1);
    expect(stored()[0]).toMatchObject({ doi: "10.48550/arxiv.2101.00001", oa: "https://arxiv.org/pdf/2101.00001", rl: true });
    expect(stored()[0]!.abstract).toMatch(/^The Multi-armed bandit/);
  });

  it("keeps at most 4,000 characters of the abstract, as Keep does", async () => {
    const words = Array.from({ length: 900 }, (_, i) => "word" + String(i).padStart(3, "0"));
    const inverted = Object.fromEntries(words.map((w, i) => [w, [i]]));
    rf.standIn({
      match: (u) => u.startsWith("https://api.openalex.org/works/W7000000001"),
      respond: () => new Response(JSON.stringify({ id: "https://openalex.org/W7000000001", display_name: "A paper with a very long abstract about sleep", authorships: [{ author: { display_name: "Ada Lovelace" } }], publication_year: 2020, abstract_inverted_index: inverted, open_access: { is_oa: false } }), { status: 200 })
    });
    await mount();
    await paste("W7000000001");
    expect(stored()).toHaveLength(1);
    expect(stored()[0]!.abstract).toHaveLength(4000);
    expect(stored()[0]!.abstract!.startsWith("word000 word001")).toBe(true);
    expect("oa" in stored()[0]!).toBe(false);
  });
});

describe("Paste box: a paper already kept is not added again", () => {
  it("a paper already kept by DOI (however it is written there) is not added again; the line says so and has no Undo", async () => {
    putLibrary([{ title: "The same paper as the library holds it", doi: "https://doi.org/" + WALK_DOI.toUpperCase(), author: "Schaefer, M.", pid: "kheld001", rl: true }]);
    await mount();
    await paste(WALK_DOI);
    expect(sets()).toBe(0);
    expect(stored()).toHaveLength(1);
    expect(line()).toBe("Already in your reading list: " + WALK_TITLE);
    expect(tid("find-paste-line")!.getAttribute("data-kind")).toBe("already");
    expect(undoBtn()).toBeNull();
    // it is still a lookup the student asked for: the box is emptied
    expect(input().value).toBe("");
  });

  it("pasting the same paper twice keeps it once", async () => {
    await mount();
    await paste(WALK_DOI);
    expect(line()).toBe("Kept: " + WALK_TITLE);
    await paste(WALK_DOI);
    expect(line()).toBe("Already in your reading list: " + WALK_TITLE);
    expect(stored()).toHaveLength(1);
  });
});

describe("Paste box: the four messages (W4)", () => {
  it("a publisher link without a DOI asks for the DOI and fetches nothing (W4)", async () => {
    await mount();
    await paste("https://www.sciencedirect.com/science/article/pii/S0000");
    expect(line()).toBe("This link has no DOI or PubMed number in it. Open the paper's page, copy its DOI and paste that.");
    expect(rf.requested).toEqual([]);
    expect(sets()).toBe(0);
    // what was pasted stays, so the student can correct it
    expect(input().value).toBe("https://www.sciencedirect.com/science/article/pii/S0000");
  });

  it("a title is sent nowhere: 'That looks like a title. Search for it above.'", async () => {
    await mount();
    await paste("exam anxiety and sleep");
    expect(line()).toBe("That looks like a title. Search for it above.");
    expect(rf.requested).toEqual([]);
    expect(sets()).toBe(0);
  });

  it("an id nobody holds says 'No paper found for {ref}. Check it and try again.' with the id it read, and keeps nothing", async () => {
    await mount();
    await paste("https://doi.org/" + NO_SUCH_DOI);
    expect(line()).toBe("No paper found for " + NO_SUCH_DOI + ". Check it and try again.");
    expect(rf.requested).toEqual([CR(NO_SUCH_DOI), [...RECS.keys()].find((u) => u.includes("works/doi:" + NO_SUCH_DOI))]);
    expect(sets()).toBe(0);
    expect(input().value).toBe("https://doi.org/" + NO_SUCH_DOI);
  });

  it("a source that cannot be reached says 'Could not reach Crossref, PubMed or OpenAlex. Try again in a minute.' and keeps nothing", async () => {
    rf.standIn({ match: (u) => u.startsWith("https://api.crossref.org/works/10.1234%2Fdown"), respond: () => new Response("", { status: 503 }) });
    await mount();
    await paste("10.1234/down.1");
    expect(line()).toBe("Could not reach Crossref, PubMed or OpenAlex. Try again in a minute.");
    expect(sets()).toBe(0);
    expect(input().value).toBe("10.1234/down.1");
  });

  it("a request that never answers ends in the same message, after a time limit on each request", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => { const c = new AbortController(); setTimeout(() => c.abort(), 5); return c.signal; });
    rf.standIn({
      match: (u) => u.startsWith("https://api.crossref.org/works/10.1234%2Fhang"),
      respond: (_u, init) => new Promise<Response>((_res, rej) => {
        const s = init?.signal;
        if (s) s.addEventListener("abort", () => rej(new DOMException("timed out", "TimeoutError")));
      })
    });
    await mount();
    await paste("10.1234/hang.1");
    expect(timeout).toHaveBeenCalledWith(PASTE_REQUEST_TIMEOUT_MS);
    expect(PASTE_REQUEST_TIMEOUT_MS).toBe(20000);
    expect(line()).toBe("Could not reach Crossref, PubMed or OpenAlex. Try again in a minute.");
    expect(go().hasAttribute("aria-busy")).toBe(false);
  });

  it("an empty box says what to paste, sends nothing and puts the cursor in the box", async () => {
    await mount();
    await paste("   ");
    expect(line()).toBe(E.find_paste_empty);
    expect(rf.requested).toEqual([]);
    expect(document.activeElement).toBe(input());
  });
});

describe("Paste box: Undo", () => {
  it("Undo takes out the paper that was just kept, and the line says it is removed", async () => {
    putLibrary([STORED_OTHER]);
    await mount();
    await paste(WALK_DOI);
    expect(stored()).toHaveLength(2);
    expect(undoBtn()!.textContent).toBe("Undo");
    await click(undoBtn());
    await until(() => stored().length === 1);
    expect(stored()).toEqual([STORED_OTHER]);
    expect(line()).toBe("Removed: " + WALK_TITLE);
    expect(undoBtn()).toBeNull();
  });

  it("Undo leaves the paper when it has changed since it was kept (an edited field, a new volume), and says so", async () => {
    await mount();
    await paste(WALK_DOI);
    const kept = stored()[0]!;
    // the student edits the entry (the Citations tab does this through the library's update)
    act(() => { (library().set as (f: (p: StoredEntry[]) => StoredEntry[]) => void)((prev) => prev.map((e) => (e.pid === kept.pid ? { ...e, pages: "13317-1" } : e))); });
    await click(undoBtn());
    expect(stored()).toHaveLength(1);
    expect(stored()[0]!.pages).toBe("13317-1");
    expect(line()).toBe("Not removed: " + WALK_TITLE + " has changed since you kept it. You can still remove it in Citations.");
    expect(undoBtn()).toBeNull();
  });

  it("a field the app adds in the background (not part of the citation) does not stop Undo", async () => {
    await mount();
    await paste(WALK_DOI);
    const kept = stored()[0]!;
    act(() => { (library().set as (f: (p: StoredEntry[]) => StoredEntry[]) => void)((prev) => prev.map((e) => (e.pid === kept.pid ? ({ ...e, textTried: "none" } as StoredEntry) : e))); });
    await click(undoBtn());
    await until(() => stored().length === 0);
    expect(line()).toBe("Removed: " + WALK_TITLE);
  });

  it("Undo removes by the paper's id, not by its title: another entry with the same title stays", async () => {
    await mount();
    await paste(WALK_DOI);
    const twin: StoredEntry = { ...stored()[0]!, pid: "ktwin001", doi: "", year: "2019" };
    act(() => { (library().set as (f: (p: StoredEntry[]) => StoredEntry[]) => void)((prev) => [twin, ...prev]); });
    await click(undoBtn());
    await until(() => stored().length === 1);
    expect(stored()).toEqual([twin]);
  });

  it("a paper another window took out already is just not there: Undo says removed and writes nothing more", async () => {
    await mount();
    await paste(WALK_DOI);
    act(() => { (library().set as (f: (p: StoredEntry[]) => StoredEntry[]) => void)(() => []); });
    const before = sets();
    await click(undoBtn());
    expect(line()).toBe("Removed: " + WALK_TITLE);
    expect(sets()).toBe(before);
  });

  it("Undo says Removed only when the paper was taken out: another window edited it and the save was refused, so the paper stays and the line says so", async () => {
    await mount();
    await paste(WALK_DOI);
    const kept = stored()[0]!;
    loseNextSave([{ ...kept, pages: "13317-1" }]);
    await click(undoBtn());
    await until(() => !undoBtn()?.hasAttribute("aria-busy"));
    expect(library().flush).toHaveBeenCalled();
    expect(stored()).toEqual([{ ...kept, pages: "13317-1" }]);
    expect(line()).toBe("Not removed: " + WALK_TITLE + " has changed since you kept it. You can still remove it in Citations.");
    expect(undoBtn()).toBeNull();
  });

  it("Undo still says Removed when the save went through and the paper is out of the library", async () => {
    await mount();
    await paste(WALK_DOI);
    const kept = stored()[0]!;
    loseNextSave([kept]);
    await click(undoBtn());
    await until(() => line().startsWith("Removed"));
    expect(stored()).toEqual([]);
    expect(line()).toBe("Removed: " + WALK_TITLE);
  });

  it("a keep that lost to another window's keep of the same paper has an id that was never stored: Undo leaves the other window's copy and says so, and writes nothing", async () => {
    await mount();
    await paste(WALK_DOI);
    const kept = stored()[0]!;
    // the keep was replayed onto the library the other window saved first: the paper is there under that window's id
    const theirs: StoredEntry = { ...kept, pid: "kwindow2" };
    act(() => { (library().set as (f: (p: StoredEntry[]) => StoredEntry[]) => void)(() => [theirs]); });
    const before = sets();
    await click(undoBtn());
    expect(line()).toBe("Not removed: " + WALK_TITLE + " has changed since you kept it. You can still remove it in Citations.");
    expect(stored()).toEqual([theirs]);
    expect(sets()).toBe(before);
  });

  it("focus goes to the paste box after Undo, as the Undo button is gone", async () => {
    await mount();
    await paste(WALK_DOI);
    undoBtn()!.focus();
    expect(document.activeElement).toBe(undoBtn());
    await click(undoBtn());
    await until(() => line().startsWith("Removed"));
    expect(undoBtn()).toBeNull();
    expect(document.activeElement).toBe(input());
  });

  it("focus goes to the paste box after an Undo that left the paper, too", async () => {
    await mount();
    await paste(WALK_DOI);
    const kept = stored()[0]!;
    act(() => { (library().set as (f: (p: StoredEntry[]) => StoredEntry[]) => void)((prev) => prev.map((e) => (e.pid === kept.pid ? { ...e, pages: "13317-1" } : e))); });
    undoBtn()!.focus();
    await click(undoBtn());
    expect(line()).toMatch(/^Not removed/);
    expect(document.activeElement).toBe(input());
  });

  it("the next lookup replaces the line, and with it the Undo", async () => {
    await mount();
    await paste(WALK_DOI);
    expect(undoBtn()).not.toBeNull();
    await paste("exam anxiety and sleep");
    expect(undoBtn()).toBeNull();
    expect(stored()).toHaveLength(1);
  });

  it("Undo waits while the library is locked, as Keep does, and removes the paper once it is read", async () => {
    await mount();
    await paste(WALK_DOI);
    const kept = stored()[0]!;
    putLibrary([kept], { locked: true });
    await click(undoBtn());
    expect(library().flush).toHaveBeenCalled();
    expect(sets()).toBe(0);
    expect(undoBtn()!.getAttribute("aria-busy")).toBe("true");
    // the wait is named, and Undo stays on the line for when the library opens
    expect(line()).toBe(E.vault_cite_locked);
    putLibrary([kept]);
    await until(() => line().startsWith("Removed"));
    expect(stored()).toHaveLength(0);
    expect(line()).toBe("Removed: " + WALK_TITLE);
  });
});

describe("Paste box: a press waits for the library as Keep does", () => {
  it("while the library is being read the button is busy, and the paper is kept on top of what was stored once it is read", async () => {
    putLibrary([], { loading: true });
    await mount();
    type(WALK_DOI);
    await click(go());
    await until(() => rf.requested.length === 1);
    await settle(20);
    expect(go().getAttribute("aria-busy")).toBe("true");
    expect(go().getAttribute("aria-disabled")).toBe("true");
    expect(go().disabled).toBe(false);
    expect(line()).toBe("Looking it up…");
    expect(library().set).not.toHaveBeenCalled();
    putLibrary([STORED_OTHER]);
    await until(() => line().startsWith("Kept"));
    expect(stored()).toHaveLength(2);
    expect(stored()[0]).toEqual(STORED_OTHER);
    expect(stored()[1]!.doi).toBe(WALK_DOI);
    expect(line()).toBe("Kept: " + WALK_TITLE);
    expect(go().hasAttribute("aria-busy")).toBe(false);
  });

  it("while the library is being read, a paper it turns out to hold is not added again", async () => {
    putLibrary([], { loading: true });
    await mount();
    type(WALK_DOI);
    await click(go());
    await until(() => rf.requested.length === 1);
    putLibrary([{ title: "Elsewhere", doi: WALK_DOI, pid: "kread001", rl: true }]);
    await until(() => line().startsWith("Already"));
    expect(sets()).toBe(0);
    expect(line()).toBe("Already in your reading list: " + WALK_TITLE);
  });

  it("a locked library: the press asks for the unlock once, waits, and keeps the paper on top of the stored library when it opens", async () => {
    putLibrary([], { locked: true });
    await mount();
    type(WALK_DOI);
    await click(go());
    await until(() => (library().flush as ReturnType<typeof vi.fn>).mock.calls.length > 0);
    expect(go().getAttribute("aria-busy")).toBe("true");
    expect(sets()).toBe(0);
    putLibrary([STORED_OTHER]);
    await until(() => line().startsWith("Kept"));
    expect(stored()).toHaveLength(2);
    expect(stored()[0]).toEqual(STORED_OTHER);
  });

  it("while the press waits for an unlock the line says the library is locked, not 'Looking it up…', and the paper is kept when it opens", async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    rf.standIn({
      match: (u) => u.startsWith("https://api.openalex.org/works/W7000000004"),
      respond: async () => { await held; return new Response(JSON.stringify({ id: "https://openalex.org/W7000000004", display_name: "A paper about learning that waits for the vault", authorships: [], publication_year: 2020, open_access: { is_oa: false } }), { status: 200 }); }
    });
    putLibrary([], { locked: true });
    await mount();
    type("W7000000004");
    await click(go());
    // the lookup is on its way: that is what the line says, locked library or not
    await until(() => rf.requested.length === 1);
    expect(line()).toBe("Looking it up…");
    release();
    // the lookup is over and the paper waits for the unlock: the line says so
    await until(() => line() === E.vault_cite_locked);
    expect(go().getAttribute("aria-disabled")).toBe("true");
    expect(sets()).toBe(0);
    putLibrary([STORED_OTHER]);
    await until(() => line().startsWith("Kept"));
    expect(stored()).toHaveLength(2);
    expect(line()).toBe("Kept: A paper about learning that waits for the vault");
  });

  it("a library that turns out broken once the vault is unlocked says so, not that the saved papers could not be reached", async () => {
    putLibrary([], { locked: true });
    await mount();
    type(WALK_DOI);
    await click(go());
    await until(() => line() === E.vault_cite_locked);
    putLibrary([], { broken: true });
    await until(() => !go().hasAttribute("aria-busy"));
    expect(line()).toBe(E.vault_cite_broken);
    expect(sets()).toBe(0);
    expect(input().value).toBe(WALK_DOI);
  });

  it("a library that cannot be opened refuses the press: the button is off, nothing is looked up or kept", async () => {
    putLibrary([], { broken: true });
    await mount();
    type(WALK_DOI);
    expect(go().getAttribute("aria-disabled")).toBe("true");
    expect(go().disabled).toBe(false);
    await click(go());
    expect(rf.requested).toEqual([]);
    expect(sets()).toBe(0);
  });

  it("a library that failed to read keeps nothing: the press asks for the read again and says the paper was not kept", async () => {
    putLibrary([], { error: true });
    await mount();
    await paste(WALK_DOI);
    expect(library().flush).toHaveBeenCalledTimes(1);
    expect(sets()).toBe(0);
    expect(line()).toBe(E.find_paste_not_kept);
    expect(input().value).toBe(WALK_DOI);
  });

  it("a second press while one is working is ignored: one lookup, one paper", async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    rf.standIn({
      match: (u) => u.startsWith("https://api.openalex.org/works/W7000000002"),
      respond: async () => { await held; return new Response(JSON.stringify({ id: "https://openalex.org/W7000000002", display_name: "A slow paper about learning and sleep", authorships: [], publication_year: 2020, open_access: { is_oa: false } }), { status: 200 }); }
    });
    await mount();
    type("W7000000002");
    await click(go());
    expect(go().getAttribute("aria-busy")).toBe("true");
    await click(go());
    release();
    await until(() => !go().hasAttribute("aria-busy"));
    expect(rf.requested.filter((u) => u.includes("W7000000002"))).toHaveLength(1);
    expect(stored()).toHaveLength(1);
  });

  it("a student who left Find before the answer came keeps nothing", async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    rf.standIn({
      match: (u) => u.startsWith("https://api.openalex.org/works/W7000000003"),
      respond: async () => { await held; return new Response(JSON.stringify({ id: "https://openalex.org/W7000000003", display_name: "A slow paper about memory and sleep", authorships: [], publication_year: 2020, open_access: { is_oa: false } }), { status: 200 }); }
    });
    const root = await mount();
    type("W7000000003");
    await click(go());
    roots.splice(roots.indexOf(root), 1);
    act(() => { root.unmount(); });
    release();
    await settle(30);
    expect(sets()).toBe(0);
  });
});

describe("Paste box: only OpenAlex, PubMed and Crossref are reached (B2-R20)", () => {
  it("every kind of paste goes to those three hosts, which the content security policy already lets the page reach; a title or a link goes nowhere", async () => {
    await mount();
    for (const s of [WALK_DOI, "14907713", "9500320", "PMC6746734", "2101.00001", "W2972990769", NO_SUCH_DOI, "exam anxiety and sleep", "https://example.org/some-article"]) {
      putLibrary([]);
      await paste(s);
    }
    const hosts = [...new Set(rf.requested.map((u) => new URL(u).origin))].sort();
    expect(hosts).toEqual(["https://api.crossref.org", "https://api.openalex.org", "https://eutils.ncbi.nlm.nih.gov"]);
    // what a request carries: an id, never the pasted text
    expect(rf.requested.some((u) => /exam|anxiety|example\.org/i.test(u))).toBe(false);
    const csp = proxy(new NextRequest("http://localhost:3000/")).headers.get("Content-Security-Policy") ?? "";
    const connect = (csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("connect-src ")) ?? "").split(/\s+/).slice(1);
    for (const host of hosts) expect(connect, host).toContain(host);
  });

  it("the student's OpenAlex key goes to OpenAlex and to no other host", async () => {
    h.oaKey = "k-test-1";
    const work = [...RECS.values()].find((r) => r.url.startsWith("https://api.openalex.org/works/W2972990769?"))!;
    rf.standIn({ match: (u) => u === work.url + "&api_key=k-test-1", respond: () => new Response(work.body, { status: 200 }) });
    await mount();
    await paste("W2972990769");
    expect(rf.requested).toEqual([work.url + "&api_key=k-test-1"]);
    putLibrary([]);
    await paste(WALK_DOI);
    expect(rf.requested.filter((u) => !u.startsWith("https://api.openalex.org/") && u.includes("api_key"))).toEqual([]);
    expect(stored()).toHaveLength(1);
  });
});

describe("Paste box: the layout rules (375 px wide, tokens only)", () => {
  const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1]!.trim(), body: m[2]!.trim(), at: m.index ?? 0 }));
  /** The Find rules end the file with their own phone block (up to 700px): the paste box's rules sit in that block too. */
  const phoneStart = css.lastIndexOf("@media (max-width: 700px)");
  const findStart = css.indexOf("/* Find (wave B Task 18");
  const paste = rules.filter((r) => r.at > findStart && /\.find-paste/.test(r.sel));
  const phone = paste.filter((r) => r.at > phoneStart);

  it("the box, its button, Undo and the summary are 44 px targets on a phone, and the box and the button take the whole row", () => {
    for (const cls of [".find-paste-input", ".find-paste-go", ".find-paste-undo", ".find-paste > summary"]) expect(phone.find((r) => r.sel.includes(cls))?.body, cls).toMatch(/min-height:\s*44px/);
    expect(phone.find((r) => r.sel.includes(".find-paste-row"))?.body).toMatch(/flex:\s*1 1 100%/);
  });

  it("uses colour tokens only: no hex or rgb colour in a .find-paste rule", () => {
    expect(paste.length).toBeGreaterThan(5);
    for (const r of paste) expect(r.body, r.sel).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
  });
});
