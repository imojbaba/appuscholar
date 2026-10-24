// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { heldBlobs } from "../lib/blobs/held";
import type { ShelfIndex, ShelfPaper, StoredEntry } from "../lib/blobs/kinds";
import { createBlobServer, fakeVault, unlock, type FakeVault, type Server } from "./support/blobServer";
import { assertAllRecorded, recordedFetch, RECS, type RecordedFetch } from "./support/recordedFetch";

/*
 * The full-text runner in the project shell (wave B Task 21b, register row D-S2-127; OJ's answer 2): the shell's FullTextRunner hands the project's library and reading list to the queue
 * (lib/papers/fullText), which asks Europe PMC for a kept paper's open-access text and stores it as the paper's. Over a fake blob server with real crypto and core's recorded Europe PMC
 * responses (packages/core/test/fetch/recorded, `capture.mjs --only epmc-...`): the requests carry only the DOI or the PMC number, the text lands in the paper's own blob and in the
 * index with the paper's pid and DOI, nothing runs while the vault is locked or in a place's own window, and the passphrase is never asked for.
 */

const h = vi.hoisted(() => ({ api: vi.fn(), vault: null as unknown }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", scratchProjectId: "scratch" } }) }));
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => h.vault }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ projectId: "p1", project: { id: "p1" } }) }));

import { CiteLibraryProvider, useLibrary, type Library } from "../lib/cite/useLibrary";
import { FullTextRunner } from "../components/frame/FullTextRunner";
import { fullText, setFullTextFetch } from "../lib/papers/fullText";
import { jatsToPages } from "../lib/papers/jats";
import { readIndexOnce } from "../lib/shelf/useShelf";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REST = "https://www.ebi.ac.uk/europepmc/webservices/rest/";
const WALK_DOI = "10.1038/s41598-019-49466-6";
const WALK_TITLE = "Open-label placebos reduce test anxiety and improve self-management skills";
const NOT_OA = "10.4022/jafib.1335";
const NO_PMC = "10.1037/0003-066x.55.1.68";
const SEARCH = (doi: string) => REST + "search?query=DOI:" + doi + "&format=json&resultType=lite";
const FULL = REST + "PMC6746734/fullTextXML";
const JATS = RECS.get(FULL)!.body;

let server: Server;
let rf: RecordedFetch;
const roots: Root[] = [];
const seen: { library: Library | null } = { library: null };

const walk = (over: Partial<StoredEntry> = {}): StoredEntry => ({ pid: "kwalk", rl: true, author: "Schaefer, C.", year: "2019", title: WALK_TITLE, doi: WALK_DOI, ...over });
const other = (n: number, doi: string, over: Partial<StoredEntry> = {}): StoredEntry => ({ pid: "kother" + n, rl: true, author: "Doe, J.", year: "2020", title: "Another paper " + n, doi, ...over });

/** What an open panel reads: the shell's shared library, passively. */
function Panel() {
  const library = useLibrary({ passive: true });
  useEffect(() => { seen.library = library; });
  return null;
}
async function mount(): Promise<{ rerender(): Promise<void> }> {
  const root = createRoot(document.createElement("div"));
  roots.push(root);
  const render = () => root.render(<CiteLibraryProvider><FullTextRunner /><Panel /></CiteLibraryProvider>);
  await act(async () => { render(); });
  return { rerender: async () => { await act(async () => { render(); }); } };
}
async function until(pred: () => boolean, what = "condition") {
  for (let i = 0; i < 600; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); }
  throw new Error(what + " not reached");
}
const quiet = () => act(async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 5)); });
const seed = async (lib: StoredEntry[], vault?: FakeVault, index?: ShelfIndex) => {
  const put = (kind: string, value: unknown) => (vault ? server.putSealed(vault, kind, value) : Promise.resolve(server.putPlain(kind, value)));
  await put("citations", lib);
  if (index) await put("shelf_index", index);
  server.vaultExists = !!vault;
};
/** The request URLs Europe PMC was sent, in order. */
const europeRequests = () => rf.requested.filter((u) => u.startsWith("https://www.ebi.ac.uk/"));
const indexOf = async (vault?: FakeVault) => (await server.value<ShelfIndex>("shelf_index", vault)) ?? [];
const asked = (url: string) => rf.fetch.mock.calls.filter((c) => String(c[0]) === url).length;

beforeEach(async () => {
  server = createBlobServer("p1");
  h.vault = await fakeVault({ status: "off" });
  h.api.mockReset().mockImplementation(server.api);
  rf = recordedFetch();
  setFullTextFetch(rf.fetch as unknown as typeof fetch);
  seen.library = null;
  heldBlobs.clear();
  fullText.reset();
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  setFullTextFetch(null);
  fullText.reset();
  vi.useRealTimers();
  window.history.replaceState(null, "", "/");
});

describe("a paper kept in this tab", () => {
  it("is asked for at once with its DOI only; its text lands in the paper's own blob and the index, with the pid, the DOI and where it came from", async () => {
    await seed([walk()]);
    await mount();
    await until(() => seen.library!.lib.length === 1 && seen.library!.ready && !seen.library!.loading);
    fullText.kept("kwalk");
    await until(() => server.find("shelf_index") !== undefined);
    // Exactly the two requests of core's fetcher, GET, with no header, no body and no credentials: the DOI, then the PMC number Europe PMC named.
    expect(europeRequests()).toEqual([SEARCH(WALK_DOI), FULL]);
    for (const c of rf.fetch.mock.calls) expect(Object.keys((c[1] ?? {}) as object)).toEqual(["signal"]);
    assertAllRecorded(rf);
    const index = await indexOf();
    expect(index).toHaveLength(1);
    expect(index[0]).toMatchObject({ pid: "kwalk", doi: WALK_DOI, src: "epmc", title: WALK_TITLE, file: "PMC6746734.xml" });
    const paper = (await server.value<ShelfPaper>("shelf_paper:" + index[0]!.id))!;
    expect(paper.pages).toEqual(jatsToPages(JATS)!.pages);
    expect(paper).toMatchObject({ notes: [], cells: {} });
    expect(index[0]!.kept).toBe(paper.pages.length);
    // The page sent nothing else anywhere: no library data went to Europe PMC.
    expect(JSON.stringify(rf.fetch.mock.calls)).not.toContain(WALK_TITLE);
  });

  it("is asked for once, however many times the library changes meanwhile", async () => {
    await seed([walk()]);
    await mount();
    await until(() => seen.library!.lib.length === 1);
    fullText.kept("kwalk");
    seen.library!.update((prev) => prev.map((e) => ({ ...e, abstract: "An abstract." })));
    fullText.poke();
    await until(() => server.find("shelf_index") !== undefined);
    await quiet();
    expect(asked(SEARCH(WALK_DOI))).toBe(1);
    expect(asked(FULL)).toBe(1);
    expect(server.puts("shelf_index")).toHaveLength(1);
  });
});

describe("older papers", () => {
  it("are not asked for before the Reading list is shown; when it is, one at a time", async () => {
    await seed([walk(), other(1, NO_PMC)]);
    await mount();
    await quiet();
    expect(europeRequests()).toEqual([]);
    fullText.viewed();
    await until(() => seen.library!.lib.some((e) => e.ft));
    await until(() => server.find("shelf_index") !== undefined);
    // The first paper's text is stored; the second has no PMC copy, which Europe PMC said in its search, so only one request was made for it.
    expect(europeRequests()).toEqual([SEARCH(WALK_DOI), FULL, SEARCH(NO_PMC)]);
    expect((await indexOf()).map((e) => e.pid)).toEqual(["kwalk"]);
  });

  it("a paper that has text on the reading list is never asked for", async () => {
    await seed([walk()], undefined, [{ id: "pmine", title: WALK_TITLE, file: "mine.pdf", size: 1, added: "2026-01-01T00:00:00.000Z", total: 1, kept: 1, pid: "kwalk" }]);
    await mount();
    fullText.viewed();
    fullText.kept("kwalk");
    await quiet();
    expect(europeRequests()).toEqual([]);
    expect(server.puts("shelf_index")).toEqual([]);
  });
});

describe("none and failed", () => {
  it("none is remembered on the library entry, keyed to the id asked, and is not asked again in the next session", async () => {
    await seed([other(1, NO_PMC)]);
    await mount();
    fullText.viewed();
    await until(() => seen.library!.lib[0]?.ft?.none === NO_PMC);
    await act(async () => { await seen.library!.flush(); });
    expect((await server.value<StoredEntry[]>("citations"))![0]!.ft).toEqual({ none: NO_PMC });
    expect(europeRequests()).toEqual([SEARCH(NO_PMC)]);
    // Another session: a fresh queue over the same stored library asks nothing.
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    fullText.reset();
    rf.requested.length = 0;
    await mount();
    fullText.viewed();
    await quiet();
    expect(europeRequests()).toEqual([]);
  });

  it("a paper Europe PMC lists but does not hold as open access is none, after the search alone", async () => {
    await seed([other(1, NOT_OA)]);
    await mount();
    fullText.viewed();
    await until(() => seen.library!.lib[0]?.ft?.none === NOT_OA);
    expect(europeRequests()).toEqual([SEARCH(NOT_OA)]);
  });

  it("failed (a request that gets no answer) stops the queue for the session, remembers nothing, and the next session asks again", async () => {
    // The first paper's DOI has no recording, so its request fails as an offline browser's does; the second would be answered.
    await seed([other(1, "10.9999/not-recorded"), walk()]);
    await mount();
    fullText.viewed();
    await until(() => rf.unrecorded().length === 1);
    rf.forget();
    await quiet();
    fullText.kept("kwalk");
    fullText.poke();
    await quiet();
    expect(europeRequests()).toEqual([SEARCH("10.9999/not-recorded")]);
    expect(seen.library!.lib.every((e) => e.ft === undefined)).toBe(true);
    expect(server.puts("shelf_index")).toEqual([]);
    // Next session: the page is loaded again.
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    fullText.reset();
    rf.requested.length = 0;
    await mount();
    fullText.viewed();
    fullText.kept("kwalk");
    await until(() => server.find("shelf_index") !== undefined);
    expect(europeRequests()).toContain(FULL);
  });

  it("a server error on a PMC number Europe PMC named (500) is failed, not none: nothing is remembered", async () => {
    await seed([other(1, NO_PMC, { pmcid: "PMC99999999" })]);
    await mount();
    fullText.viewed();
    await until(() => europeRequests().length === 1);
    await quiet();
    expect(europeRequests()).toEqual([REST + "PMC99999999/fullTextXML"]);
    expect(seen.library!.lib[0]!.ft).toBeUndefined();
  });
});

describe("the vault and the window", () => {
  it("with the vault locked nothing is read or asked and the passphrase is not asked for; the unlock lets the paper's text come in, sealed", async () => {
    const vault = await fakeVault({ status: "unlocked", complete: true });
    h.vault = vault;
    await seed([walk()], vault);
    vault.lock();
    server.calls.length = 0;
    const m = await mount();
    fullText.kept("kwalk");
    fullText.viewed();
    await quiet();
    expect(europeRequests()).toEqual([]);
    expect(server.calls).toEqual([]);
    expect(vault.prompts).toBe(0);
    unlock(vault);
    await m.rerender();
    await until(() => server.find("shelf_index") !== undefined);
    expect(vault.prompts).toBe(0);
    const index = (await server.value<ShelfIndex>("shelf_index", vault))!;
    expect(index[0]).toMatchObject({ pid: "kwalk", src: "epmc" });
    expect(server.find("shelf_index")!.keyVersion).toBeGreaterThanOrEqual(1);
    const paperBlob = server.find("shelf_paper:" + index[0]!.id)!;
    expect(paperBlob.keyVersion).toBeGreaterThanOrEqual(1);
    expect(paperBlob.body).not.toContain("Test anxiety");
    expect((await server.value<ShelfPaper>("shelf_paper:" + index[0]!.id, vault))!.pages[0]).toContain("Test anxiety is a condition");
  });

  it("a vault that is still being set up or checked (migrating, not complete) is waited for", async () => {
    h.vault = await fakeVault({ status: "unlocked", complete: false });
    await seed([walk()]);
    await mount();
    fullText.kept("kwalk");
    fullText.viewed();
    await quiet();
    expect(europeRequests()).toEqual([]);
  });

  it("in a place's own window nothing runs: a keep there asks nothing, writes nothing", async () => {
    window.history.replaceState(null, "", "/?window=1");
    await seed([walk()]);
    await mount();
    fullText.kept("kwalk");
    fullText.viewed();
    await quiet();
    expect(europeRequests()).toEqual([]);
    expect(server.puts()).toEqual([]);
  });
});

describe("readIndexOnce", () => {
  it("reads the stored index as it is; an empty list when there is none; null when it does not open or the read fails; and it never asks for the passphrase", async () => {
    const vault = await fakeVault({ status: "unlocked", complete: true });
    const index: ShelfIndex = [{ id: "pa", title: "T", file: "a.pdf", size: 1, added: "2026-01-01T00:00:00.000Z", total: 1, kept: 1, pid: "k1" }];
    expect(await readIndexOnce("p1", vault)).toEqual([]);
    await server.putSealed(vault, "shelf_index", index);
    expect(await readIndexOnce("p1", vault)).toEqual(index);
    vault.lock();
    expect(await readIndexOnce("p1", vault)).toBeNull();
    expect(vault.prompts).toBe(0);
    server.putPlain("shelf_index", { not: "an index" });
    expect(await readIndexOnce("p1", await fakeVault({ status: "off" }))).toBeNull();
    h.api.mockReset().mockRejectedValue(new Error("offline"));
    expect(await readIndexOnce("p1", await fakeVault({ status: "off" }))).toBeNull();
  });
});
