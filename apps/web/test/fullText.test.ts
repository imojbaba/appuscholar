// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { EpmcResult } from "@appuscholar/core";
import type { ShelfIndex, ShelfPaper, StoredEntry } from "../lib/blobs/kinds";
import { ftKey, fullText, type FullTextDeps, type FullTextSide } from "../lib/papers/fullText";
import { jatsToPages } from "../lib/papers/jats";

/*
 * The full-text runner (wave B Task 21b, register row D-S2-127; OJ's answer 2; rulings B2-R21, B2-R35 and B2-R39): for each kept paper with a DOI (or a PMC number) and no text on the
 * reading list yet, it asks Europe PMC for the open-access text, one request at a time, at Keep and, for older papers, the first time the Reading list shows them. "none" is
 * remembered on the library entry; "failed" stops the queue for the session and remembers nothing. These tests drive the engine with fakes for the library, the reading list and Europe PMC;
 * the shell's runner, the mounted list and the real requests are in fullTextRunner.test.tsx.
 */

const RECORDED = join(__dirname, "../../../packages/core/test/fetch/recorded/epmc-fulltext-oa-8da0c20f.json");
const JATS = (JSON.parse(readFileSync(RECORDED, "utf8")) as { body: string }).body;
const FILLER = "The students took part in the study and gave their consent in writing before the first session began. ";
/** A small article with a body long enough to count (the recorded one is for the tests of what is stored). */
const SMALL = `<?xml version="1.0"?><article><front><article-meta><title-group><article-title>Small</article-title></title-group></article-meta></front><body><sec><title>Introduction</title><p>${FILLER.repeat(3)}</p></sec></body></article>`;
const OK = (xml = SMALL, pmcid = "PMC1"): EpmcResult => ({ result: "ok", pmcid, xml });
const NONE: EpmcResult = { result: "none" };
const FAILED: EpmcResult = { result: "failed", status: 503 };

type Answer = EpmcResult | (() => Promise<EpmcResult>);
type Ref = { doi?: string; pmcid?: string };

const entry = (pid: string, doi: string | undefined, over: Partial<StoredEntry> = {}): StoredEntry =>
  ({ pid, rl: true, author: "Doe, J.", year: "2020", title: "Paper " + pid, ...(doi ? { doi } : {}), ...over });

/** The project's library, reading list and Europe PMC as fakes; `deps` is what the shell hands the engine. */
function world(lib: StoredEntry[]) {
  const w = {
    lib, index: [] as ShelfIndex, papers: new Map<string, ShelfPaper>(), open: true, read: true, indexReadable: true, createFails: false,
    asked: [] as Ref[], inFlight: 0, maxInFlight: 0, answers: new Map<string, Answer>(), deleted: [] as string[], libraryWrites: 0
  };
  const side: FullTextSide = {
    index: async () => (w.indexReadable ? [...w.index] : null),
    readPaper: async (id) => w.papers.get(id) ?? null,
    createPaper: async (id, paper) => {
      if (!w.open) throw new Error("vault_save_locked");
      if (w.createFails) throw new Error("could not be saved");
      w.papers.set(id, paper);
    },
    updateIndex: (u) => { w.index = u(w.index); return true; },
    deletePaper: async (id) => { w.deleted.push(id); w.papers.delete(id); return true; }
  };
  const deps = (over: Partial<FullTextDeps> = {}): FullTextDeps => ({
    projectId: "p1",
    open: () => w.open,
    library: () => (w.read ? w.lib : null),
    updateLibrary: (fn) => { w.libraryWrites++; w.lib = fn(w.lib); return true; },
    shelf: () => side,
    ask: async (ref) => {
      w.asked.push(ref);
      w.inFlight++;
      w.maxInFlight = Math.max(w.maxInFlight, w.inFlight);
      try {
        const a = w.answers.get(ref.pmcid ?? ref.doi ?? "") ?? OK();
        return typeof a === "function" ? await a() : a;
      } finally { w.inFlight--; }
    },
    ...over
  });
  const stored = (pid: string) => w.index.find((e) => e.pid === pid);
  return { w, deps, side, stored };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));
async function until(pred: () => boolean, what = "condition") {
  for (let i = 0; i < 300; i++) { if (pred()) return; await tick(); }
  throw new Error(what + " not reached");
}
/** Lets everything that can run, run. */
async function quiet() { for (let i = 0; i < 12; i++) await tick(); }
const deferred = () => {
  let resolve!: (r: EpmcResult) => void;
  const p = new Promise<EpmcResult>((r) => { resolve = r; });
  return { p, resolve };
};

afterEach(() => { fullText.reset(); });

describe("ftKey: the id a paper is asked for and remembered by", () => {
  it("is the DOI as written without a link and in lower case, or the PMC number if the entry carries one; nothing without either", () => {
    expect(ftKey(entry("a", "https://doi.org/10.1038/S41598-019-49466-6"))).toBe("10.1038/s41598-019-49466-6");
    expect(ftKey(entry("a", "10.1038/x", { pmcid: "pmc123" }))).toBe("PMC123");
    expect(ftKey(entry("a", undefined))).toBe("");
    expect(ftKey(entry("a", "not a doi"))).toBe("");
    expect(ftKey(entry("a", "", { pmcid: "PMC abc" }))).toBe("");
  });
});

describe("at Keep", () => {
  it("a paper kept now is asked for at once, with its DOI only, and its text is stored as the paper's with its pid and DOI and a note of where it came from", async () => {
    const { w, deps, stored } = world([entry("k1", "10.1038/s41598-019-49466-6", { title: "Open-label placebos reduce test anxiety" })]);
    fullText.attach(deps());
    fullText.kept("k1");
    await until(() => !!stored("k1"));
    expect(w.asked).toEqual([{ doi: "10.1038/s41598-019-49466-6" }]);
    const e = stored("k1")!;
    expect(e).toMatchObject({ pid: "k1", doi: "10.1038/s41598-019-49466-6", src: "epmc", title: "Open-label placebos reduce test anxiety", kept: w.papers.get(e.id)!.pages.length });
    expect(e.id).toMatch(/^p[a-z0-9]+$/);
    expect(w.papers.get(e.id)).toEqual({ pages: jatsToPages(SMALL)!.pages, notes: [], cells: {} });
    // The text is the answer, Europe PMC's file is not stored.
    expect(JSON.stringify([...w.papers.values()])).not.toContain("<article");
  });

  it("names the paper by the library's title, else the article's, and stores the recorded paper's pages", async () => {
    const { w, deps, stored } = world([entry("k1", "10.1000/a", { title: "" }), entry("k2", "10.1000/b", { title: "  Kept title  " })]);
    w.answers.set("10.1000/a", OK(JATS, "PMC6746734"));
    fullText.attach(deps());
    fullText.kept("k1");
    fullText.kept("k2");
    await until(() => !!stored("k1") && !!stored("k2"));
    expect(stored("k1")!.title).toBe("Open-label placebos reduce test anxiety and improve self-management skills: A randomized-controlled trial");
    expect(stored("k2")!.title).toBe("Kept title");
    expect(w.papers.get(stored("k1")!.id)!.pages).toEqual(jatsToPages(JATS)!.pages);
    expect(stored("k1")!.total).toBe(jatsToPages(JATS)!.total);
  });

  it("waits for the paper to be in the library the engine reads (the save of a keep lands a moment after it)", async () => {
    const { w, deps, stored } = world([]);
    fullText.attach(deps());
    fullText.kept("k1");
    await quiet();
    expect(w.asked).toEqual([]);
    w.lib = [entry("k1", "10.1000/a")];
    fullText.poke();
    await until(() => !!stored("k1"));
    expect(w.asked).toEqual([{ doi: "10.1000/a" }]);
  });

  it("asks one paper at a time, the paper kept now before the older ones, and never two requests at once", async () => {
    const first = deferred(), second = deferred();
    const { w, deps, stored } = world([entry("k1", "10.1000/a"), entry("k2", "10.1000/b"), entry("k3", "10.1000/c")]);
    w.answers.set("10.1000/c", () => first.p);
    w.answers.set("10.1000/a", () => second.p);
    fullText.attach(deps());
    fullText.viewed();
    fullText.kept("k3");
    await until(() => w.asked.length === 1);
    await quiet();
    // k3 was kept now, so it goes first although k1 and k2 come before it in the library; the next waits for its answer.
    expect(w.asked).toEqual([{ doi: "10.1000/c" }]);
    first.resolve(OK());
    await until(() => w.asked.length === 2);
    await quiet();
    expect(w.asked).toEqual([{ doi: "10.1000/c" }, { doi: "10.1000/a" }]);
    expect(stored("k3")).toBeDefined();
    second.resolve(OK());
    await until(() => w.asked.length === 3 && !!stored("k2"));
    expect(w.asked).toEqual([{ doi: "10.1000/c" }, { doi: "10.1000/a" }, { doi: "10.1000/b" }]);
    expect(w.maxInFlight).toBe(1);
  });

  it("is asked once: a second keep note or a poke while the answer is on its way asks nothing more", async () => {
    const gate = deferred();
    const { w, deps, stored } = world([entry("k1", "10.1000/a")]);
    w.answers.set("10.1000/a", () => gate.p);
    fullText.attach(deps());
    fullText.kept("k1");
    await until(() => w.asked.length === 1);
    fullText.kept("k1");
    fullText.poke();
    fullText.viewed();
    await quiet();
    gate.resolve(OK());
    await until(() => !!stored("k1"));
    await quiet();
    expect(w.asked).toHaveLength(1);
    expect(w.index).toHaveLength(1);
  });
});

describe("older papers", () => {
  it("are asked for the first time the Reading list shows them, not before", async () => {
    const { w, deps, stored } = world([entry("k1", "10.1000/a"), entry("k2", "10.1000/b")]);
    fullText.attach(deps());
    await quiet();
    expect(w.asked).toEqual([]);
    fullText.viewed();
    await until(() => !!stored("k1") && !!stored("k2"));
    expect(w.asked).toEqual([{ doi: "10.1000/a" }, { doi: "10.1000/b" }]);
    expect(w.maxInFlight).toBe(1);
  });

  it("wait for the library to be read when the list is shown first", async () => {
    const { w, deps, stored } = world([entry("k1", "10.1000/a")]);
    w.read = false;
    fullText.attach(deps());
    fullText.viewed();
    await quiet();
    expect(w.asked).toEqual([]);
    w.read = true;
    fullText.poke();
    await until(() => !!stored("k1"));
  });

  it("do not include a paper that joined the library after the list was shown: it waits for the next session's first view", async () => {
    const { w, deps, stored } = world([entry("k1", "10.1000/a")]);
    fullText.attach(deps());
    fullText.viewed();
    await until(() => !!stored("k1"));
    w.lib = [...w.lib, entry("k9", "10.1000/new")];
    fullText.poke();
    await quiet();
    expect(w.asked).toEqual([{ doi: "10.1000/a" }]);
    fullText.reset();
    fullText.attach(deps());
    fullText.viewed();
    await until(() => !!stored("k9"));
    expect(w.asked).toContainEqual({ doi: "10.1000/new" });
  });
});

describe("who is never asked", () => {
  it("a paper that has text on the reading list already, one with no DOI or PMC number, one with a DOI that is not one, one that is not on the reading list", async () => {
    const { w, deps } = world([
      entry("k1", "10.1000/has"), entry("k2", undefined), entry("k3", "doi pending"), entry("k4", "10.1000/off", { rl: false }), entry("k5", "10.1000/ok")
    ]);
    w.index = [{ id: "pold", title: "Has text", file: "a.pdf", size: 1, added: "2026-01-01T00:00:00.000Z", total: 1, kept: 1, pid: "k1" }];
    fullText.attach(deps());
    fullText.viewed();
    await until(() => w.index.length === 2);
    await quiet();
    expect(w.asked).toEqual([{ doi: "10.1000/ok" }]);
  });

  it("a paper whose text appears on the reading list while Europe PMC is being asked is not stored a second time", async () => {
    const gate = deferred();
    const { w, deps } = world([entry("k1", "10.1000/a")]);
    w.answers.set("10.1000/a", () => gate.p);
    fullText.attach(deps());
    fullText.kept("k1");
    await until(() => w.asked.length === 1);
    // The student added the PDF meanwhile.
    w.index = [{ id: "pmine", title: "T", file: "a.pdf", size: 1, added: "2026-01-01T00:00:00.000Z", total: 1, kept: 1, pid: "k1" }];
    gate.resolve(OK());
    await quiet();
    expect(w.index).toHaveLength(1);
    expect(w.index[0]!.src).toBeUndefined();
    expect(w.papers.size).toBe(0);
  });

  it("a paper being given a PDF (Add your own PDF keeps it) is held back", async () => {
    const { w, deps } = world([entry("k1", "10.1000/a")]);
    fullText.attach(deps());
    fullText.kept("k1");
    fullText.hold("k1");
    await quiet();
    expect(w.asked).toEqual([]);
  });

  it("an index that cannot be read now is skipped for the session without asking Europe PMC or remembering anything", async () => {
    const { w, deps } = world([entry("k1", "10.1000/a")]);
    w.indexReadable = false;
    fullText.attach(deps());
    fullText.kept("k1");
    await quiet();
    expect(w.asked).toEqual([]);
    expect(w.libraryWrites).toBe(0);
  });
});

describe("a PMC number", () => {
  it("is asked for instead of the DOI, and only it is sent", async () => {
    const { w, deps, stored } = world([entry("k1", "10.1000/a", { pmcid: "pmc6746734" })]);
    fullText.attach(deps());
    fullText.kept("k1");
    await until(() => !!stored("k1"));
    expect(w.asked).toEqual([{ pmcid: "PMC6746734" }]);
  });
});

describe("none: Europe PMC has no text", () => {
  it("is remembered on the entry as the id that was asked, and is not asked again: not later, not in another session", async () => {
    const { w, deps } = world([entry("k1", "10.1000/A")]);
    w.answers.set("10.1000/a", NONE);
    fullText.attach(deps());
    fullText.kept("k1");
    await until(() => w.libraryWrites === 1);
    expect(w.lib[0]).toMatchObject({ pid: "k1", ft: { none: "10.1000/a" } });
    expect(w.index).toEqual([]);
    fullText.viewed();
    fullText.poke();
    await quiet();
    expect(w.asked).toHaveLength(1);
    // Another session: the module starts again, the entry remembers.
    fullText.reset();
    fullText.attach(deps());
    fullText.viewed();
    await quiet();
    expect(w.asked).toHaveLength(1);
  });

  it("a DOI filled in or changed later is asked again; so is a PMC number given later", async () => {
    const { w, deps } = world([entry("k1", "10.1000/new", { ft: { none: "10.1000/old" } }), entry("k2", "10.1000/b", { pmcid: "PMC9", ft: { none: "10.1000/b" } })]);
    w.answers.set("10.1000/new", NONE);
    w.answers.set("PMC9", NONE);
    fullText.attach(deps());
    fullText.viewed();
    await until(() => w.libraryWrites === 2);
    expect(w.asked).toEqual([{ doi: "10.1000/new" }, { pmcid: "PMC9" }]);
    expect(w.lib.map((e) => e.ft)).toEqual([{ none: "10.1000/new" }, { none: "PMC9" }]);
  });

  it("is not written onto an entry whose DOI changed while Europe PMC was being asked", async () => {
    const gate = deferred();
    const { w, deps } = world([entry("k1", "10.1000/a")]);
    w.answers.set("10.1000/a", () => gate.p);
    fullText.attach(deps());
    fullText.kept("k1");
    await until(() => w.asked.length === 1);
    w.lib = [entry("k1", "10.1000/fixed")];
    gate.resolve(NONE);
    await quiet();
    expect(w.lib[0]!.ft).toBeUndefined();
  });

  it("an article with no readable body is treated as none and remembered", async () => {
    const { w, deps } = world([entry("k1", "10.1000/a")]);
    w.answers.set("10.1000/a", OK("<article><front/><body><p>Too short.</p></body></article>"));
    fullText.attach(deps());
    fullText.kept("k1");
    await until(() => w.libraryWrites === 1);
    expect(w.lib[0]!.ft).toEqual({ none: "10.1000/a" });
    expect(w.index).toEqual([]);
  });
});

describe("failed: the request did not get an answer", () => {
  it("stops the queue for the session at the first one and remembers nothing", async () => {
    const { w, deps } = world([entry("k1", "10.1000/a"), entry("k2", "10.1000/b"), entry("k3", "10.1000/c")]);
    w.answers.set("10.1000/a", FAILED);
    fullText.attach(deps());
    fullText.viewed();
    await until(() => w.asked.length === 1);
    await quiet();
    fullText.kept("k3");
    fullText.viewed();
    fullText.poke();
    await quiet();
    expect(w.asked).toEqual([{ doi: "10.1000/a" }]);
    expect(w.libraryWrites).toBe(0);
    expect(w.lib.every((e) => e.ft === undefined)).toBe(true);
    expect(w.index).toEqual([]);
  });

  it("is asked again in the next session (a fresh module), where the same paper gets its text", async () => {
    const { w, deps, stored } = world([entry("k1", "10.1000/a")]);
    w.answers.set("10.1000/a", FAILED);
    fullText.attach(deps());
    fullText.kept("k1");
    await until(() => w.asked.length === 1);
    await quiet();
    fullText.reset();
    w.answers.set("10.1000/a", OK());
    fullText.attach(deps());
    fullText.viewed();
    await until(() => !!stored("k1"));
    expect(w.asked).toHaveLength(2);
  });
});

describe("the vault and the window", () => {
  it("nothing is read or asked while the vault is locked; the unlock lets it go on", async () => {
    const { w, deps, stored } = world([entry("k1", "10.1000/a")]);
    w.open = false;
    fullText.attach(deps());
    fullText.kept("k1");
    fullText.viewed();
    await quiet();
    expect(w.asked).toEqual([]);
    expect(fullText.pending(w.lib[0]!)).toBe(false);
    w.open = true;
    fullText.poke();
    await until(() => !!stored("k1"));
    expect(w.asked).toEqual([{ doi: "10.1000/a" }]);
  });

  it("a vault that locks while the text is being stored is not a failure: nothing is remembered, the queue goes on after the unlock and asks again", async () => {
    const gate = deferred();
    const { w, deps, stored } = world([entry("k1", "10.1000/a")]);
    w.answers.set("10.1000/a", () => gate.p);
    fullText.attach(deps());
    fullText.kept("k1");
    await until(() => w.asked.length === 1);
    w.open = false;
    gate.resolve(OK());
    await quiet();
    expect(w.libraryWrites).toBe(0);
    expect(w.index).toEqual([]);
    w.answers.set("10.1000/a", OK());
    w.open = true;
    fullText.poke();
    await until(() => !!stored("k1"));
    expect(w.asked).toHaveLength(2);
  });

  it("a text that cannot be stored while the vault is open stops the queue for the session", async () => {
    const { w, deps } = world([entry("k1", "10.1000/a"), entry("k2", "10.1000/b")]);
    w.createFails = true;
    fullText.attach(deps());
    fullText.viewed();
    await until(() => w.asked.length === 1);
    await quiet();
    expect(w.asked).toHaveLength(1);
    expect(w.index).toEqual([]);
    expect(w.libraryWrites).toBe(0);
  });

  it("an answer for a project that was left is dropped: nothing stored, nothing remembered", async () => {
    const gate = deferred();
    const { w, deps } = world([entry("k1", "10.1000/a")]);
    w.answers.set("10.1000/a", () => gate.p);
    fullText.attach(deps());
    fullText.kept("k1");
    await until(() => w.asked.length === 1);
    const other = world([]);
    fullText.attach(other.deps({ projectId: "p2" }));
    gate.resolve(OK());
    await quiet();
    expect(w.index).toEqual([]);
    expect(w.libraryWrites).toBe(0);
    expect(other.w.asked).toEqual([]);
  });

  it("does nothing without a runner attached (a keep in a window that has none) and begins when one is attached", async () => {
    const { w, deps, stored } = world([entry("k1", "10.1000/a")]);
    fullText.kept("k1");
    await quiet();
    expect(w.asked).toEqual([]);
    const detach = fullText.attach(deps());
    await until(() => !!stored("k1"));
    detach();
  });
});

describe("the line a row shows", () => {
  it("is on for a paper that waits for its turn and the one being asked, and off for a paper with a text, a none, a failed queue or no id", async () => {
    const gate = deferred();
    const { w, deps } = world([entry("k1", "10.1000/a"), entry("k2", "10.1000/b"), entry("k3", undefined), entry("k4", "10.1000/d", { ft: { none: "10.1000/d" } })]);
    w.answers.set("10.1000/a", () => gate.p);
    fullText.attach(deps());
    expect(fullText.pending(w.lib[0]!)).toBe(false);
    fullText.viewed();
    await until(() => w.asked.length === 1);
    const [a, b, c, d] = w.lib as [StoredEntry, StoredEntry, StoredEntry, StoredEntry];
    expect([a, b, c, d].map((e) => fullText.pending(e))).toEqual([true, true, false, false]);
    expect(fullText.pending(null)).toBe(false);
    gate.resolve(FAILED);
    await quiet();
    expect([a, b].map((e) => fullText.pending(e))).toEqual([false, false]);
  });

  it("tells the ones who listen as soon as a paper is wanted, not only when the answer is in", async () => {
    const gate = deferred();
    const { w, deps } = world([entry("k1", "10.1000/a"), entry("k2", "10.1000/b")]);
    w.answers.set("10.1000/a", () => gate.p);
    fullText.attach(deps());
    const seen: boolean[] = [];
    const off = fullText.subscribe(() => { seen.push(fullText.pending(w.lib[1]!)); });
    fullText.viewed();
    await until(() => w.asked.length === 1);
    // The list was shown and the first paper is out: the second has been told it waits, before anything is answered.
    expect(seen).toContain(true);
    expect(fullText.pending(w.lib[1]!)).toBe(true);
    off();
    gate.resolve(OK());
    await until(() => w.index.length === 2);
  });

  it("tells the ones who listen when it changes", async () => {
    const { w, deps } = world([entry("k1", "10.1000/a")]);
    let n = 0;
    const off = fullText.subscribe(() => { n++; });
    const before = fullText.version();
    fullText.attach(deps());
    fullText.kept("k1");
    await until(() => w.index.length === 1);
    expect(n).toBeGreaterThan(0);
    expect(fullText.version()).toBeGreaterThan(before);
    off();
  });
});

describe("Undo of a keep", () => {
  it("a fetch still waiting for its turn is stopped: it is never asked", async () => {
    const gate = deferred();
    const { w, deps } = world([entry("k1", "10.1000/a"), entry("k2", "10.1000/b")]);
    w.answers.set("10.1000/a", () => gate.p);
    fullText.attach(deps());
    fullText.kept("k1");
    fullText.kept("k2");
    await until(() => w.asked.length === 1);
    await fullText.undone("k2");
    gate.resolve(OK());
    await quiet();
    expect(w.asked).toEqual([{ doi: "10.1000/a" }]);
  });

  it("an answer on its way is dropped: nothing is stored and nothing is remembered", async () => {
    const gate = deferred();
    const { w, deps } = world([entry("k1", "10.1000/a")]);
    w.answers.set("10.1000/a", () => gate.p);
    fullText.attach(deps());
    fullText.kept("k1");
    await until(() => w.asked.length === 1);
    await fullText.undone("k1");
    gate.resolve(OK());
    await quiet();
    expect(w.index).toEqual([]);
    expect(w.papers.size).toBe(0);
    expect(w.libraryWrites).toBe(0);
  });

  it("a text stored already is removed with its place on the reading list", async () => {
    const { w, deps, stored } = world([entry("k1", "10.1000/a")]);
    fullText.attach(deps());
    fullText.kept("k1");
    await until(() => !!stored("k1"));
    const id = stored("k1")!.id;
    await fullText.undone("k1");
    expect(w.index).toEqual([]);
    expect(w.papers.has(id)).toBe(false);
    expect(w.deleted).toEqual([id]);
  });

  it("a text the student has highlighted is left, and so is a PDF the student added in its place", async () => {
    const { w, deps, stored } = world([entry("k1", "10.1000/a"), entry("k2", "10.1000/b")]);
    fullText.attach(deps());
    fullText.kept("k1");
    fullText.kept("k2");
    await until(() => !!stored("k1") && !!stored("k2"));
    const id1 = stored("k1")!.id, id2 = stored("k2")!.id;
    w.papers.set(id1, { ...w.papers.get(id1)!, notes: [{ id: "n1", page: 1, quote: "The students", note: "", at: "2026-10-24T00:00:00.000Z" }] });
    // k2's text was taken out and a PDF put in its place.
    w.index = w.index.map((e) => (e.pid === "k2" ? { ...e, id: "pmypdf", src: undefined } : e));
    await fullText.undone("k1");
    await fullText.undone("k2");
    expect(w.index.map((e) => e.id).sort()).toEqual([id1, "pmypdf"].sort());
    expect(w.deleted).toEqual([]);
    expect(w.papers.has(id1)).toBe(true);
    expect(id2).not.toBe("pmypdf");
  });
});

describe("the student removes the text Europe PMC brought", () => {
  it("is not brought back: the id is remembered as none", async () => {
    const { w, deps, stored } = world([entry("k1", "10.1000/A")]);
    fullText.attach(deps());
    fullText.kept("k1");
    await until(() => !!stored("k1"));
    w.index = [];
    fullText.removed(w.lib[0]!);
    expect(w.lib[0]!.ft).toEqual({ none: "10.1000/a" });
    fullText.reset();
    fullText.attach(deps());
    fullText.viewed();
    await quiet();
    expect(w.asked).toHaveLength(1);
  });
});
