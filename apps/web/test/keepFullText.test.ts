// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { EpmcResult } from "@appuscholar/core";
import type { ShelfIndex, ShelfPaper, StoredEntry } from "../lib/blobs/kinds";
import { fullText, type FullTextDeps, type FullTextSide } from "../lib/papers/fullText";
import { keepEntry, undoKeepSettled, type KeepDeps } from "../lib/papers/keep";
import type { Library } from "../lib/cite/useLibrary";

/*
 * Keep and the full-text runner (wave B Task 21b, register row D-S2-127): a paper that Keep adds is asked for at once, a paper that is already kept is not, and the paste box's Undo
 * (undoKeepSettled) stops the fetch of the paper it takes out, or takes out the text the fetch stored. The library, the reading list and Europe PMC are fakes.
 */

const FILLER = "The students took part in the study and gave their consent in writing before the first session began. ";
const SMALL = `<article><front><article-meta><title-group><article-title>Small</article-title></title-group></article-meta></front><body><sec><title>Introduction</title><p>${FILLER.repeat(3)}</p></sec></body></article>`;
const SLEEP = { author: "Smith, J.", year: "2020", title: "Sleep duration and exam anxiety in first-year students", source: "Sleep Health", doi: "10.1000/sleep.1", type: "Journal article", style: "apa" };

/** The library, the reading list and Europe PMC; `keepDeps` is what Keep and Undo get, over the same library the runner reads. */
function world() {
  const w = {
    lib: [] as StoredEntry[], index: [] as ShelfIndex, papers: new Map<string, ShelfPaper>(), asked: 0,
    gate: null as null | { promise: Promise<EpmcResult>; resolve(r: EpmcResult): void }
  };
  const side: FullTextSide = {
    index: async () => [...w.index],
    readPaper: async (id) => w.papers.get(id) ?? null,
    createPaper: async (id, p) => { w.papers.set(id, p); },
    updateIndex: (u) => { w.index = u(w.index); return true; },
    deletePaper: async (id) => { w.papers.delete(id); return true; }
  };
  const deps: FullTextDeps = {
    projectId: "p1", open: () => true, library: () => w.lib, updateLibrary: (fn) => { w.lib = fn(w.lib); return true; }, shelf: () => side,
    ask: async () => { w.asked++; return w.gate ? w.gate.promise : { result: "ok", pmcid: "PMC1", xml: SMALL }; }
  };
  const keepDeps: KeepDeps & Pick<Library, "flush"> = {
    get lib() { return w.lib; }, ready: true, loading: false, locked: false, broken: false, error: false,
    update: (fn) => { w.lib = fn(w.lib); fullText.poke(); return true; },
    flush: async () => true
  };
  const gate = () => {
    let resolve!: (r: EpmcResult) => void;
    const promise = new Promise<EpmcResult>((r) => { resolve = r; });
    w.gate = { promise, resolve };
    return w.gate;
  };
  return { w, deps, keepDeps, gate };
}
const tick = () => new Promise<void>((r) => setTimeout(r, 0));
async function until(pred: () => boolean) { for (let i = 0; i < 300; i++) { if (pred()) return; await tick(); } throw new Error("condition not reached"); }
async function quiet() { for (let i = 0; i < 12; i++) await tick(); }

afterEach(() => { fullText.reset(); });

describe("Keep starts the fetch", () => {
  it("a paper that Keep adds is asked for at once and its text comes in under its pid", async () => {
    const { w, deps, keepDeps } = world();
    fullText.attach(deps);
    const r = keepEntry(SLEEP, keepDeps);
    expect(r.state).toBe("kept");
    await until(() => w.index.length === 1);
    expect(w.asked).toBe(1);
    expect(w.index[0]).toMatchObject({ pid: r.pid, doi: "10.1000/sleep.1", src: "epmc" });
  });

  it("a paper that is already kept, or kept with no DOI, starts nothing", async () => {
    const { w, deps, keepDeps } = world();
    w.lib = [{ ...SLEEP, pid: "kold", rl: true }];
    fullText.attach(deps);
    expect(keepEntry({ ...SLEEP, author: "Smith, John" }, keepDeps)).toEqual({ state: "already", pid: "kold" });
    expect(keepEntry({ ...SLEEP, doi: "", title: "A paper about sleep with no DOI at all, found in a book", year: "2019" }, keepDeps).state).toBe("kept");
    await quiet();
    expect(w.asked).toBe(0);
  });

  it("an older paper of the library is not asked for by a keep of another paper", async () => {
    const { w, deps, keepDeps } = world();
    w.lib = [{ author: "Old, A.", year: "2001", title: "An older paper in the library with a DOI", doi: "10.1000/old", pid: "kold", rl: true }];
    fullText.attach(deps);
    keepEntry(SLEEP, keepDeps);
    await until(() => w.index.length === 1);
    expect(w.index.map((e) => e.pid)).not.toContain("kold");
    expect(w.asked).toBe(1);
  });
});

describe("Undo of a keep", () => {
  it("stops a fetch that has not been answered: the text never arrives", async () => {
    const { w, deps, keepDeps, gate } = world();
    const g = gate();
    fullText.attach(deps);
    const r = keepEntry(SLEEP, keepDeps);
    await until(() => w.asked === 1);
    const added: StoredEntry = { ...SLEEP, pid: r.pid, rl: true };
    expect(await undoKeepSettled(added, keepDeps)).toBe("removed");
    g.resolve({ result: "ok", pmcid: "PMC1", xml: SMALL });
    await quiet();
    expect(w.lib).toEqual([]);
    expect(w.index).toEqual([]);
    expect(w.papers.size).toBe(0);
  });

  it("takes out the text it stored, with the paper's place on the reading list", async () => {
    const { w, deps, keepDeps } = world();
    fullText.attach(deps);
    const r = keepEntry(SLEEP, keepDeps);
    await until(() => w.index.length === 1);
    expect(w.papers.size).toBe(1);
    expect(await undoKeepSettled({ ...SLEEP, pid: r.pid, rl: true }, keepDeps)).toBe("removed");
    await until(() => w.index.length === 0);
    expect(w.papers.size).toBe(0);
    expect(w.lib).toEqual([]);
  });

  it("leaves the text, and the fetch, of a paper that stays: Undo that finds the entry changed removes nothing", async () => {
    const { w, deps, keepDeps } = world();
    fullText.attach(deps);
    const r = keepEntry(SLEEP, keepDeps);
    await until(() => w.index.length === 1);
    w.lib = w.lib.map((e) => ({ ...e, title: "The student renamed it" }));
    expect(await undoKeepSettled({ ...SLEEP, pid: r.pid, rl: true }, keepDeps)).toBe("changed");
    await quiet();
    expect(w.index).toHaveLength(1);
    expect(w.papers.size).toBe(1);
  });
});
