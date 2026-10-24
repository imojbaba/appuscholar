import { epmcFullText, retrNormDoi, retrValidDoi, shPaperId, type EpmcResult } from "@appuscholar/core";
import type { ShelfIndex, ShelfPaper, StoredEntry } from "@/lib/blobs/kinds";
import { jatsToPages } from "./jats";

/*
 * Open-access full text from Europe PMC comes in by itself (wave B Task 21b, register row D-S2-127; OJ's answer 2; rulings B2-R20, B2-R21, B2-R35 and B2-R39). For each kept paper that has a DOI
 * (or a PMC number, if its entry carries one) and no text on the reading list yet, this asks Europe PMC for the paper's open-access text (core's epmcFullText: the DOI or the PMC number is all
 * that is sent), turns it into pages (lib/papers/jats) and stores it as the paper's text on the reading list, with the paper's pid and DOI, so the paper reads and the reader opens it. It
 * asks one paper at a time, at Keep (a paper kept in this tab is asked for at once: keepEntry calls `kept`) and, for older papers, the first time the Reading list shows them (`viewed`). It
 * does nothing while the vault is locked (it waits for the unlock, as the paper-id runner does) or in a place's own window (no runner is attached there), and never asks for the passphrase.
 *
 * What is remembered and what is retried (ruling B2-R39). "none" (Europe PMC has no text for the paper) is remembered on the library entry as `ft: { none: "<the id asked>" }`, so it is not
 * asked again, in this session or another; a DOI that is filled in or changed later is a different id and is asked. "failed" (the request got no real answer) remembers nothing and stops
 * the queue for the rest of the session, so a student who is offline, or whose network refuses Europe PMC, is not asked to wait for a request per paper; the next session asks again. A text
 * that cannot be stored with the vault open stops the queue the same way; with the vault locked meanwhile it goes on after the unlock. A student who removes the text Europe PMC brought
 * is not given it back (`removed` remembers the id as none).
 *
 * It lives at module level, as one queue for the tab: the Keep that starts a paper (in Find, the paste box or the adding screen) and the runner that does the work (components/frame/FullTextRunner,
 * mounted by the project shell) are in different parts of the page. The runner attaches the project's library and reading list as `FullTextDeps`; this file knows nothing of React. Tests
 * (test/fullText.test.ts) drive it with fakes, and `reset` makes the next session.
 */

/** How long one request to Europe PMC may take: a paper's whole text is one answer, a few megabytes at most. A request that hangs ends as "failed". */
export const FULLTEXT_TIMEOUT_MS = 30_000;

/** What the engine asks Europe PMC for: the PMC number if there is one, else the DOI. */
type Ref = { doi?: string; pmcid?: string };

/** The reading list of one project, as the engine uses it. Each of its operations is a write or a read the student's own copy does not see go wrong. */
export type FullTextSide = {
  /** The reading list's index as it is stored now, or null when it cannot be read or does not open on this device (then nothing is written over it). */
  index(): Promise<ShelfIndex | null>;
  /** One paper's stored text, or null. */
  readPaper(id: string): Promise<ShelfPaper | null>;
  /** Stores a new paper's text now. Throws when it cannot (the vault locked, the network). */
  createPaper(id: string, paper: ShelfPaper): Promise<void>;
  /** An update of the index (the update form, so it lands on what is stored); false when it was refused. */
  updateIndex(u: (prev: ShelfIndex | null) => ShelfIndex): boolean;
  /** Deletes a paper's text; true when it is gone. */
  deletePaper(id: string): Promise<boolean>;
};

/** What the project shell hands the engine for the project that is open. */
export type FullTextDeps = {
  projectId: string;
  /** Whether work may go on now: the vault off, or unlocked and complete, and not a place's own window. */
  open(): boolean;
  /** The library's entries once they have been read (with their pids), else null. */
  library(): StoredEntry[] | null;
  /** An update of the library (the update form); false when it took nothing. */
  updateLibrary(fn: (prev: StoredEntry[]) => StoredEntry[]): boolean;
  /** The reading list's operations: the open list's own when one is open, else a headless client's. */
  shelf(): FullTextSide;
  /** One request to Europe PMC. Absent: core's epmcFullText over the page's fetch. */
  ask?(ref: Ref): Promise<EpmcResult>;
};

let fetchImpl: typeof fetch | null = null;
/** For tests: the fetch the default `ask` uses (null: the page's). */
export function setFullTextFetch(f: typeof fetch | null): void { fetchImpl = f; }
const defaultAsk = (ref: Ref): Promise<EpmcResult> =>
  epmcFullText((input, init) => (fetchImpl ?? fetch)(input, { ...init, signal: AbortSignal.timeout(FULLTEXT_TIMEOUT_MS) }), ref);

/**
 * The id a paper is asked for and remembered by: its PMC number if the entry carries one (upper case), else its DOI as written without a link, in lower case (`retrNormDoi`); "" when it has
 * neither (a DOI that is not one, such as "pending", is not asked for). The remembered "none" is this string, so a changed id is asked for again.
 */
export function ftKey(e: StoredEntry): string {
  const pmc = String(e.pmcid ?? "").trim().toUpperCase();
  if (/^PMC\d{1,10}$/.test(pmc)) return pmc;
  const doi = retrNormDoi(e.doi ?? "");
  return retrValidDoi(doi) ? doi : "";
}
const refOf = (key: string): Ref => (key.startsWith("PMC") ? { pmcid: key } : { doi: key });

// ---------------------------------------------------------------- the tab's queue

let deps: FullTextDeps | null = null;
/** Papers (by pid) to ask for: kept in this tab, or on the reading list when it was shown. */
const wanted = new Set<string>();
/** The ones kept in this tab: they go before the older ones. */
const fromKeep = new Set<string>();
/** Papers not to look at again this session: their text is there, asked and answered, held back for a PDF, or skipped. */
const finished = new Set<string>();
/** Papers whose keep was undone (or whose text was removed): never asked, and an answer on its way is dropped. */
const cancelled = new Set<string>();
/** The reading-list id of the text this session stored for a pid, for Undo. */
const added = new Map<string, string>();
/** The Reading list was shown and the library was not read yet: its papers are taken when it is. */
let viewPending = false;
/** A request failed or a text could not be stored: no more this session. */
let stopped = false;
let draining = false;
/** Counts `reset`s, so a worker that was out when the session was reset (a test) lets go. */
let epoch = 0;
let version = 0;
const listeners = new Set<() => void>();
const bump = () => { version++; for (const l of [...listeners]) l(); };

/** Whether a paper is one to ask for: wanted, on the reading list, with an id that was not answered "none", and not looked at already. */
function eligible(e: StoredEntry): boolean {
  const pid = e.pid;
  if (!pid || e.rl === false || !wanted.has(pid) || finished.has(pid) || cancelled.has(pid)) return false;
  const key = ftKey(e);
  return key !== "" && e.ft?.none !== key;
}

/** The next paper: the one kept now before the older ones, each in library order. Null when nothing may be asked now (locked, the library not read, nothing left). */
function pickNext(d: FullTextDeps): StoredEntry | null {
  if (stopped || !d.open()) return null;
  const lib = d.library();
  if (!lib) return null;
  if (viewPending) {
    // The papers the list shows now: one that joins the library later (an import) waits for the next session's first view.
    for (const e of lib) if (e.pid) wanted.add(e.pid);
    viewPending = false;
    bump();
  }
  let older: StoredEntry | null = null;
  for (const e of lib) {
    if (!eligible(e)) continue;
    if (fromKeep.has(e.pid!)) return e;
    older ??= e;
  }
  return older;
}

/** Remembers on the entry that Europe PMC has no text for `key`. Only an entry that still has that id (the DOI may have been changed while the request was out). */
function remember(d: FullTextDeps, pid: string, key: string): void {
  d.updateLibrary((prev) => prev.map((x) => (x.pid === pid && ftKey(x) === key ? { ...x, ft: { ...x.ft, none: key } } : x)));
}

const finish = (pid: string) => { finished.add(pid); };

/** One paper, from the question to the stored text. Every way out leaves the paper finished, the queue stopped, or the engine unable to pick it again (locked, left, cancelled). */
async function runOne(d: FullTextDeps, e: StoredEntry): Promise<void> {
  const pid = e.pid!;
  const key = ftKey(e);
  /** The project was left, or the keep was undone, while a step was out. */
  const era = epoch;
  const gone = () => deps !== d || cancelled.has(pid) || epoch !== era;
  try {
    const side = d.shelf();
    // The text may be there already (a PDF the student added, another window): the stored index says so, not the copy on screen.
    const before = await side.index();
    if (gone()) return;
    if (!before || before.some((x) => x.pid === pid)) { finish(pid); return; }
    const res = await (d.ask ?? defaultAsk)(refOf(key));
    if (gone()) return;
    if (res.result === "failed") { stopped = true; return; }
    if (res.result === "none") { remember(d, pid, key); finish(pid); return; }
    // An article with no body of its own (Europe PMC holds only its abstract) is no text the student can read: the same answer as none.
    const text = jatsToPages(res.xml);
    if (!text) { remember(d, pid, key); finish(pid); return; }
    // Asked again just before storing: Europe PMC took its time.
    const again = await side.index();
    if (gone()) return;
    if (!again || again.some((x) => x.pid === pid)) { finish(pid); return; }
    if (!d.open()) return;
    const now = new Date();
    const id = shPaperId(now.getTime());
    await side.createPaper(id, { pages: text.pages, notes: [], cells: {} });
    if (gone()) { void side.deletePaper(id).catch(() => false); return; }
    const doi = (e.doi ?? "").trim();
    const entry = {
      id, title: (e.title ?? "").trim() || text.title || key, ...(doi ? { doi } : {}), file: res.pmcid + ".xml",
      size: res.xml.length, added: now.toISOString(), total: text.total, kept: text.pages.length, pid, src: "epmc"
    };
    // The place on the list is written through the list that is open now (it may have been opened while the text was being stored), else a client of its own.
    const took = d.shelf().updateIndex((prev) => {
      const cur = prev ?? [];
      return cur.some((x) => x.pid === pid) ? cur : [...cur, entry];
    });
    if (!took) void side.deletePaper(id).catch(() => false);
    else added.set(pid, id);
    finish(pid);
  } catch {
    // The text could not be stored. The vault locking meanwhile is not a fault: the paper is asked again after the unlock. With the vault open it will not mend by asking more papers.
    if (d.open() && deps === d) stopped = true;
  } finally {
    bump();
  }
}

/** The queue's one worker: papers one after the other, until nothing may be asked now. A second call while it runs finds it running and leaves the rest to it. */
async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  const era = epoch;
  try {
    for (;;) {
      const d = deps;
      const next = d ? pickNext(d) : null;
      if (!d || !next) return;
      await runOne(d, next);
      if (epoch !== era) return;
    }
  } finally { if (epoch === era) draining = false; }
}

const poke = (): void => { if (deps) void Promise.resolve().then(drain); };

export const fullText = {
  /**
   * The shell's runner hands over the open project's library and reading list; returns the detach. A paper kept before this (a keep in a window with no runner stays on the list of
   * wanted papers) is asked for as soon as the engine can.
   */
  attach(d: FullTextDeps): () => void {
    deps = d;
    bump();
    poke();
    return () => { if (deps === d) { deps = null; bump(); } };
  },
  /** Something that decides whether a paper may be asked has changed (the vault, the library): look for the next one. */
  poke,
  /** A paper was kept in this tab (keepEntry): it is asked for at once, before the older ones. */
  kept(pid: string): void {
    wanted.add(pid);
    fromKeep.add(pid);
    bump();
    poke();
  },
  /** A PDF is being added for this paper (Add your own PDF keeps it first): there is nothing to ask for. */
  hold(pid: string): void {
    wanted.delete(pid);
    fromKeep.delete(pid);
    finish(pid);
    bump();
  },
  /** The Reading list shows the kept papers: the older ones are asked for now (once per paper per session, and only those the library holds now). */
  viewed(): void {
    viewPending = true;
    poke();
  },
  /**
   * The keep of this paper was undone (the paste box's Undo): a fetch not begun is never made, an answer on its way is dropped, and a text stored for it this session is taken out again
   * with its place on the reading list. Left alone: a text the student has highlighted, and a reading-list entry that is not the one stored here (a PDF took its place).
   */
  async undone(pid: string): Promise<void> {
    cancelled.add(pid);
    wanted.delete(pid);
    fromKeep.delete(pid);
    bump();
    const id = added.get(pid);
    added.delete(pid);
    const d = deps;
    if (!id || !d) return;
    try {
      const side = d.shelf();
      const index = await side.index();
      if (!index?.some((x) => x.id === id && x.pid === pid)) return;
      const paper = await side.readPaper(id);
      if (paper && paper.notes.length) return;
      if (await side.deletePaper(id)) side.updateIndex((prev) => (prev ?? []).filter((x) => x.id !== id));
    } catch { /* the text stays: nothing is lost, and the student can remove it from the Reading list */ }
  },
  /** The student removed the text Europe PMC brought for this paper: it is not brought back. */
  removed(e: StoredEntry): void {
    const pid = e.pid;
    if (!pid) return;
    finish(pid);
    const key = ftKey(e);
    if (deps && key) remember(deps, pid, key);
    bump();
  },
  /** Whether a row of the Reading list says its text is coming: the paper waits for its turn or is being asked for, and nothing has stopped it. */
  pending(e: StoredEntry | null): boolean {
    const d = deps;
    return !!e && !!d && !stopped && d.open() && eligible(e);
  },
  /** For useSyncExternalStore: the lines of the Reading list follow the queue. */
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
  version: (): number => version,
  /** For tests: a new session. */
  reset(): void {
    deps = null;
    wanted.clear();
    fromKeep.clear();
    finished.clear();
    cancelled.clear();
    added.clear();
    viewPending = false;
    stopped = false;
    draining = false;
    epoch++;
    bump();
  }
};
