// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApNotes, ShelfIndex, StoredEntry } from "../lib/blobs/kinds";
import { parseBlob } from "../lib/blobs/kinds";
import { ApiError } from "../lib/api";
import { heldBlobs, shouldWarnOnUnloadBlobs } from "../lib/blobs/held";
import { stageStates } from "../lib/frame/stages";
import { ensurePaperIds, type MigrationBlob, type PaperIdsResult } from "../lib/papers/migrate";
import { withPids } from "../lib/papers/ids";
import { createBlobServer, fakeVault, unlock, type FakeVault, type Server } from "./support/blobServer";
import { MORNING_TITLE, MU_TITLE, SDT_DOI, SDT_TITLE, THESIS_TITLE, todayLibrary, todayNotes, todayShelf } from "./support/paperFixtures";

/*
 * The client migration that gives every stored paper an id (wave B, Task 17), run against a fake api that answers the blob routes the way the real one does
 * (versions, 409s, the vault rules). The stored data is what today's code writes (test/support/paperFixtures.ts).
 */

const h = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));

const P = "p1";
const CIPHERTEXT = /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/;
let server: Server;

beforeEach(() => {
  server = createBlobServer(P);
  h.api.mockReset().mockImplementation(server.api);
  heldBlobs.clear();
  window.history.replaceState(null, "", "/");
});
afterEach(() => { window.history.replaceState(null, "", "/"); });

type Seed = { lib: StoredEntry[]; index: ShelfIndex; papers: ReturnType<typeof todayShelf>["papers"]; notes: ApNotes; keys: ReturnType<typeof todayNotes>["keys"] };
/** Stores today's project: the library, the reading list with each paper's blob, the notes and the two column lists. Sealed under `vault` unless it is null. */
async function seed(vault: FakeVault | null, over: { notes?: boolean } = {}): Promise<Seed> {
  const lib = await todayLibrary();
  const { index, papers } = todayShelf();
  const { notes, keys } = todayNotes();
  server.vaultExists = vault !== null && vault.status !== "off";
  const put = (kind: string, value: unknown) => (vault && vault.status !== "off" ? server.putSealed(vault, kind, value) : Promise.resolve(server.putPlain(kind, value)));
  await put("citations", lib);
  await put("shelf_index", index);
  for (const [id, p] of Object.entries(papers)) await put("shelf_paper:" + id, p);
  if (over.notes !== false) await put("ap_notes", notes);
  await put("ap_cols", ["design", "verdict"]);
  await put("shelf_cols", []);
  return { lib, index, papers, notes, keys };
}
const vaultOff = () => fakeVault({ status: "off" });
const unlocked = () => fakeVault({ status: "unlocked", complete: true });
const run = (vault: FakeVault, d: { citations?: MigrationBlob<StoredEntry[]> } = {}): Promise<PaperIdsResult> => ensurePaperIds(P, { vault: () => vault, ...d });
/** The kinds PUT so far, each once, in the order first written. */
const putKinds = (): string[] => [...new Set(server.puts().map((c) => decodeURIComponent(c.path.split("/blobs/")[1]!)))];
const litState = () => stageStates({ blobs: server.work()[0]!.blobs, stageMarks: server.marks, draftWords: 0, draftEditedAt: null }).lit;

/** What a finished migration leaves, whether the vault is off or on. */
async function expectMigrated(s: Seed, vault: FakeVault | null) {
  const lib = (await server.value<StoredEntry[]>("citations", vault ?? undefined))!;
  const index = (await server.value<ShelfIndex>("shelf_index", vault ?? undefined))!;
  const notes = (await server.value<ApNotes>("ap_notes", vault ?? undefined))!;

  // Every library entry has its own pid and keeps every field it had.
  expect(lib).toHaveLength(s.lib.length);
  lib.forEach((e, i) => expect(e).toMatchObject(s.lib[i]!));
  const pids = lib.map((e) => e.pid);
  expect(pids.every((p) => /^k[0-9a-z]+$/.test(p ?? ""))).toBe(true);
  expect(new Set(pids).size).toBe(lib.length);

  // The reading list: the DOI finds the library entry, so does the title; the thesis chapter is on no list and gets its own.
  expect(index).toHaveLength(3);
  index.forEach((e, i) => expect(e).toMatchObject(s.index[i]!));
  const sdt = lib.find((e) => e.doi === SDT_DOI)!.pid!;
  const morning = lib.find((e) => e.title === MORNING_TITLE)!.pid!;
  const mu = lib.find((e) => e.title === MU_TITLE)!.pid!;
  expect(index[0]!.pid).toBe(sdt);
  expect(index[1]!.pid).toBe(morning);
  const thesis = index[2]!.pid!;
  expect(thesis).toMatch(/^k[0-9a-z]+$/);
  expect(pids).not.toContain(thesis);

  // The notes: one per paper, the old keys kept whole with movedTo.
  for (const [key, old] of Object.entries(s.notes)) expect(notes[key], key).toMatchObject(old);
  expect(notes[s.keys.sdtAbstract]!.movedTo).toBe("p:" + sdt);
  expect(notes[s.keys.sdtPdf]!.movedTo).toBe("p:" + sdt);
  expect(notes[s.keys.morningPdf]!.movedTo).toBe("p:" + morning);
  expect(notes[s.keys.muAbstract]!.movedTo).toBe("p:" + mu);
  expect(notes[s.keys.pasted]!.movedTo).toBeUndefined();
  // Both readings of the Ryan and Deci paper are on one note, with the words and the card of each.
  expect(notes["p:" + sdt]).toMatchObject({
    pid: sdt, title: SDT_TITLE,
    stages: { gap: { mine: "It joins motivation and well-being." }, design: { mine: "A review of the theory, not an experiment." } },
    card: { weak: "Only the abstract was read.", strengths: "Clear definitions", verdict: "Worth citing" }
  });
  expect(notes["p:" + morning]).toMatchObject({ card: { notes: "Small sample from one college." } });
  expect(notes["p:" + mu]).toMatchObject({ stages: { gap: { mine: "Anxiety is studied in students, but not with scripts." } } });
  // The matrix cells of each reading-list paper are on its note; the shelf copy stays where it was.
  expect(notes["p:" + sdt]!.cells).toEqual({ Sample: "Not applicable", Method: "Review" });
  expect(notes["p:" + morning]!.cells).toEqual({});
  expect(notes["p:" + thesis]).toMatchObject({ title: THESIS_TITLE, pid: thesis, stages: {}, card: {}, cells: { Sample: "40 students, one college" } });
  for (const [id, paper] of Object.entries(s.papers)) expect(await server.value("shelf_paper:" + id, vault ?? undefined)).toEqual(paper);
  expect(server.puts().filter((c) => c.path.includes("shelf_paper"))).toEqual([]);

  // Nothing the blobs hold stopped being readable (a note without stages or card would break the whole blob).
  expect(parseBlob("citations", JSON.stringify(lib))).not.toBeNull();
  expect(parseBlob("shelf_index", JSON.stringify(index))).not.toBeNull();
  expect(parseBlob("ap_notes", JSON.stringify(notes))).not.toBeNull();
  // The other blobs were not touched, and no route that rewrites a vault was used.
  expect(putKinds().sort()).toEqual(["ap_notes", "citations", "shelf_index"]);
  expect(server.calls.some((c) => /rewrite/.test(c.path))).toBe(false);
}

describe("ensurePaperIds with the vault off", () => {
  it("vault off migrates: every stored paper gets one id (the library, the reading list by DOI and by title, the notes by title) and its cells", async () => {
    const vault = await vaultOff();
    const s = await seed(null);
    expect(await run(vault)).toBe("done");
    await expectMigrated(s, null);
    // Plain in, plain out: the blobs are stored as the vault-less account stores them.
    for (const kind of ["citations", "shelf_index", "ap_notes"]) expect(server.find(kind)!.keyVersion).toBe(0);
    expect(vault.prompts).toBe(0);
  });

  it("a second run writes nothing, reads no reading-list paper, and does not even ask about the stage", async () => {
    const vault = await vaultOff();
    await seed(null);
    expect(await run(vault)).toBe("done");
    const before = server.calls.length;
    const versions = server.blobs.map((b) => [b.kind, b.version]);
    expect(await run(vault)).toBe("done");
    const second = server.calls.slice(before);
    expect(second.filter((c) => c.method !== "GET")).toEqual([]);
    expect(second.some((c) => c.path.includes("shelf_paper"))).toBe(false);
    expect(second.some((c) => c.path.startsWith("/projects?"))).toBe(false);
    expect(server.blobs.map((b) => [b.kind, b.version])).toEqual(versions);
  });

  it("an empty project is done at once and creates nothing", async () => {
    expect(await run(await vaultOff())).toBe("done");
    expect(server.puts()).toEqual([]);
    expect(server.blobs).toEqual([]);
  });

  it("a reading list with no notes yet gets a notes blob, one note per paper, made with stages and card", async () => {
    const s = await seed(null, { notes: false });
    expect(await run(await vaultOff())).toBe("done");
    const notes = (await server.value<ApNotes>("ap_notes"))!;
    const index = (await server.value<ShelfIndex>("shelf_index"))!;
    expect(Object.keys(notes).sort()).toEqual(index.map((e) => "p:" + e.pid).sort());
    for (const n of Object.values(notes)) expect(n).toMatchObject({ stages: {}, card: {} });
    expect(parseBlob("ap_notes", JSON.stringify(notes))).not.toBeNull();
    expect(notes["p:" + index[2]!.pid]!.cells).toEqual(s.papers.pmgq3g4h5i!.cells);
  });

  it("matrix cells are copied to the paper's note once: cells typed in Compare since are not written over", async () => {
    const vault = await vaultOff();
    const s = await seed(null);
    expect(await run(vault)).toBe("done");
    const notes = (await server.value<ApNotes>("ap_notes"))!;
    const sdt = (await server.value<ShelfIndex>("shelf_index"))![0]!.pid!;
    await server.writeAs(null, "ap_notes", { ...notes, ["p:" + sdt]: { ...notes["p:" + sdt]!, cells: { Sample: "typed in Compare" } } });
    // The shelf copy changes too (the old matrix): neither is copied again.
    await server.writeAs(null, "shelf_paper:pmgq1a2b3c", { ...s.papers.pmgq1a2b3c!, cells: { Sample: "changed on the shelf" } });
    expect(await run(vault)).toBe("done");
    expect((await server.value<ApNotes>("ap_notes"))!["p:" + sdt]!.cells).toEqual({ Sample: "typed in Compare" });
  });

  it("an old note for a paper that already has p:<pid> joins it on a later run", async () => {
    const vault = await vaultOff();
    const s = await seed(null);
    expect(await run(vault)).toBe("done");
    // Analyse a paper, still writing a... keys until B3, reads the paper once more as a new reading.
    const notes = (await server.value<ApNotes>("ap_notes"))!;
    const sdt = (await server.value<ShelfIndex>("shelf_index"))![0]!.pid!;
    await server.writeAs(null, "ap_notes", { ...notes, aextranewreading: { title: SDT_TITLE, stages: { limits: { mine: "Written later." } }, card: {} } });
    expect(await run(vault)).toBe("done");
    const after = (await server.value<ApNotes>("ap_notes"))!;
    expect(after["p:" + sdt]!.stages.limits).toEqual({ mine: "Written later." });
    expect(after["p:" + sdt]!.stages.design).toEqual(s.notes[s.keys.sdtPdf]!.stages.design);
    expect(after.aextranewreading!.movedTo).toBe("p:" + sdt);
  });

  it("two readings of one paper that both have the student's words: both texts, and both card values, are in the paper's note (B2-R31)", async () => {
    const vault = await vaultOff();
    const s = await seed(null);
    // The Ryan and Deci paper was read once more as a PDF; the student wrote about the same stage and judged it again.
    server.putPlain("ap_notes", {
      ...s.notes,
      athirdreadingofryandeci9999: { title: SDT_TITLE, stages: { design: { mine: "Read again: it is a review, so there is no design to judge." } }, card: { verdict: "Cite it for the definitions only." } }
    });
    expect(await run(vault)).toBe("done");
    const index = (await server.value<ShelfIndex>("shelf_index"))!;
    const notes = (await server.value<ApNotes>("ap_notes"))!;
    const merged = notes["p:" + index[0]!.pid]!;
    expect(merged.stages.design!.mine).toBe("A review of the theory, not an experiment.\n\nRead again: it is a review, so there is no design to judge.");
    expect(merged.card.verdict).toBe("Worth citing\n\nCite it for the definitions only.");
    // Nothing is shown twice, and a second run adds nothing.
    const before = server.puts().length;
    expect(await run(vault)).toBe("done");
    expect(server.puts().length).toBe(before);
  });

  it("what a tab on the previous build writes to a key that already moved stays on that key: the next run sends nothing (B2-R34)", async () => {
    const vault = await vaultOff();
    const s = await seed(null);
    expect(await run(vault)).toBe("done");
    const notes = (await server.value<ApNotes>("ap_notes"))!;
    const sdt = (await server.value<ShelfIndex>("shelf_index"))![0]!.pid!;
    const old = notes[s.keys.sdtPdf]!;
    server.putPlain("ap_notes", { ...notes, [s.keys.sdtPdf]: { ...old, stages: { ...old.stages, limits: { mine: "Written in the previous build." } } } });
    const puts = server.puts("ap_notes").length;
    expect(await run(vault)).toBe("done");
    expect(server.puts("ap_notes")).toHaveLength(puts);
    const after = (await server.value<ApNotes>("ap_notes"))!;
    expect(after[s.keys.sdtPdf]!.stages.limits).toEqual({ mine: "Written in the previous build." });
    expect(after["p:" + sdt]!.stages.limits).toBeUndefined();
  });

  it("two runs at once are one run", async () => {
    await seed(null);
    const vault = await vaultOff();
    const both = await Promise.all([run(vault), run(vault)]);
    expect(both).toEqual(["done", "done"]);
    expect(server.puts("citations")).toHaveLength(1);
    expect(server.puts("ap_notes")).toHaveLength(1);
  });
});

describe("ensurePaperIds with the vault on", () => {
  it("opens and writes every blob through the vault: sealed in, sealed out, never a plaintext body", async () => {
    const vault = await unlocked();
    const s = await seed(vault);
    expect(await run(vault)).toBe("done");
    await expectMigrated(s, vault);
    for (const kind of ["citations", "shelf_index", "ap_notes"]) {
      const b = server.find(kind)!;
      expect(b.keyVersion).toBeGreaterThanOrEqual(1);
      expect(b.body).toMatch(CIPHERTEXT);
      expect(b.body).not.toContain("Worth citing");
    }
    for (const c of server.puts()) expect((c.body as { keyVersion: number }).keyVersion).toBeGreaterThanOrEqual(1);
    expect(vault.prompts).toBe(0);
  });

  it("a notes blob made by the migration is sealed under its own new key", async () => {
    const vault = await unlocked();
    await seed(vault, { notes: false });
    expect(await run(vault)).toBe("done");
    const b = server.find("ap_notes")!;
    expect(b.keyVersion).toBe(1);
    expect(b.deks).toHaveLength(1);
    expect(b.body).toMatch(CIPHERTEXT);
    expect(Object.keys((await server.value<ApNotes>("ap_notes", vault))!)).toHaveLength(3);
  });

  it("a second run writes nothing", async () => {
    const vault = await unlocked();
    await seed(vault);
    expect(await run(vault)).toBe("done");
    const before = server.calls.length;
    expect(await run(vault)).toBe("done");
    expect(server.calls.slice(before).filter((c) => c.method !== "GET")).toEqual([]);
  });
});

describe("a locked vault, and a vault not ready", () => {
  it("a locked vault runs nothing until unlock, asks for nothing, and runs once it is unlocked", async () => {
    const vault = await unlocked();
    const s = await seed(vault);
    vault.lock();
    expect(await run(vault)).toBe("locked");
    expect(server.calls).toEqual([]);
    expect(vault.prompts).toBe(0);
    unlock(vault);
    expect(await run(vault)).toBe("done");
    await expectMigrated(s, vault);
  });

  it.each([
    ["still loading", { status: "loading" as const }],
    ["running its one-off migration", { status: "migrating" as const }],
    ["unlocked but not complete", { status: "unlocked" as const, complete: false }]
  ])("a vault %s is busy: nothing is read or written", async (_label, o) => {
    const vault = await fakeVault(o);
    await seed(vault);
    server.calls.length = 0;
    expect(await run(vault)).toBe("busy");
    expect(server.calls).toEqual([]);
  });

  it("a vault that locks while the run is under way stops it: locked, nothing more written, nothing held for later, no prompt", async () => {
    const vault = await unlocked();
    const s = await seed(vault);
    server.onPut = (kind) => { if (kind === "citations") vault.lock(); };
    expect(await run(vault)).toBe("locked");
    expect(putKinds()).toEqual(["citations"]);
    expect(vault.prompts).toBe(0);
    expect(heldBlobs.size).toBe(0);
    expect(shouldWarnOnUnloadBlobs()).toBe(false);
    // The run that follows the unlock finishes it.
    server.onPut = undefined;
    unlock(vault);
    expect(await run(vault)).toBe("done");
    await expectMigrated(s, vault);
  });

  it("a vault that locks as a write is sealed: locked, and the write is not kept to be sent later", async () => {
    const vault = await unlocked();
    await seed(vault);
    let sealed = 0;
    const flaky: FakeVault = Object.assign(Object.create(vault) as FakeVault, {
      encryptBody: async (doc: Parameters<FakeVault["encryptBody"]>[0], html: string) => { if (++sealed > 1) throw new Error("vault-locked"); return vault.encryptBody(doc, html); }
    });
    expect(await ensurePaperIds(P, { vault: () => flaky })).toBe("locked");
    expect(putKinds()).toEqual(["citations"]);
    expect(heldBlobs.size).toBe(0);
    expect(shouldWarnOnUnloadBlobs()).toBe(false);
  });
});

describe("a blob that does not open", () => {
  /** A vault with another key: every blob sealed with `vault` is damaged for it. */
  const otherKey = () => unlocked();

  it("a library that cannot be decrypted is broken, and nothing is written anywhere", async () => {
    const mine = await unlocked();
    const theirs = await otherKey();
    const s = await seed(mine);
    await server.putSealed(theirs, "citations", s.lib);
    const before = server.puts().length;
    expect(await run(mine)).toBe("broken");
    expect(server.puts().length).toBe(before);
    expect(heldBlobs.size).toBe(0);
  });

  it("a reading list that is not a list is broken: the library keeps the ids it was given, and nothing is written to the list, the cells or the notes", async () => {
    const vault = await vaultOff();
    const s = await seed(null);
    server.putPlain("shelf_index", { this: "is not a reading list" });
    const notesVersion = server.find("ap_notes")!.version;
    expect(await run(vault)).toBe("broken");
    expect(putKinds()).toEqual(["citations"]);
    expect(((await server.value<StoredEntry[]>("citations"))!).every((e) => !!e.pid)).toBe(true);
    expect(server.find("shelf_index")!.version).toBe(2);
    expect(server.find("ap_notes")!.version).toBe(notesVersion);
    expect(await server.value("ap_notes")).toEqual(s.notes);
  });

  it("notes that do not open are broken, and are left as they are", async () => {
    const vault = await vaultOff();
    await seed(null);
    server.putPlain("ap_notes", ["not", "notes"]);
    const version = server.find("ap_notes")!.version;
    expect(await run(vault)).toBe("broken");
    expect(putKinds()).toEqual(["citations", "shelf_index"]);
    expect(server.find("ap_notes")!.version).toBe(version);
  });

  it("one reading-list paper that does not open is skipped: the run goes on with the others, answers broken, and gives that paper's note no cells so the next run tries it again (B2-R32)", async () => {
    const vault = await vaultOff();
    const s = await seed(null);
    server.putPlain("shelf_paper:pmgq3g4h5i", { pages: "not a list" });
    expect(await run(vault)).toBe("broken");
    // The notes were written: the old ones moved, and the papers that opened have their cells.
    expect(putKinds().sort()).toEqual(["ap_notes", "citations", "shelf_index"]);
    const notes = (await server.value<ApNotes>("ap_notes"))!;
    const index = (await server.value<ShelfIndex>("shelf_index"))!;
    expect(notes[s.keys.sdtPdf]!.movedTo).toBe("p:" + index[0]!.pid);
    expect(notes["p:" + index[0]!.pid]!.cells).toEqual({ Sample: "Not applicable", Method: "Review" });
    expect(notes["p:" + index[1]!.pid]!.cells).toEqual({});
    // The paper that did not open has no note with cells, so nothing says it is done.
    expect(notes["p:" + index[2]!.pid]).toBeUndefined();
    // Once it opens again the next run finishes it, and then a run sends nothing.
    server.putPlain("shelf_paper:pmgq3g4h5i", s.papers.pmgq3g4h5i);
    expect(await run(vault)).toBe("done");
    expect(((await server.value<ApNotes>("ap_notes"))!)["p:" + index[2]!.pid]).toMatchObject({ title: THESIS_TITLE, cells: { Sample: "40 students, one college" } });
    const before = server.puts().length;
    expect(await run(vault)).toBe("done");
    expect(server.puts().length).toBe(before);
  });

  it("a reading-list paper that is locked, not damaged, stops the run", async () => {
    const vault = await unlocked();
    await seed(vault);
    // The vault locks as the first reading-list paper is read.
    const real = vault.decryptBody;
    vault.decryptBody = async (doc) => { if (doc.id.includes("shelf_paper:")) vault.lock(); return real(doc); };
    expect(await run(vault)).toBe("locked");
    expect(putKinds()).toEqual(["citations", "shelf_index"]);
  });

  it("a blob that cannot be read at all (the network) is busy, not broken, and writes nothing after it", async () => {
    const vault = await vaultOff();
    await seed(null);
    const real = server.api;
    h.api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.endsWith("/blobs/shelf_index") && (init?.method ?? "GET") === "GET") throw new Error("offline");
      return real(path, init);
    });
    expect(await run(vault)).toBe("busy");
    expect(putKinds()).toEqual(["citations"]);
  });
});

describe("a write that loses to another device (409)", () => {
  it("is read again and replayed: an entry the other device added meanwhile is kept, and gets an id too", async () => {
    const vault = await vaultOff();
    const s = await seed(null);
    let once = true;
    server.onPut = async (kind) => {
      if (kind !== "citations" || !once) return;
      once = false;
      const cur = (await server.value<StoredEntry[]>("citations"))!;
      await server.writeAs(null, "citations", [...cur, { author: "Added, Elsewhere", title: "Added on the other device", year: "2026", type: "Journal article", style: "apa" }]);
    };
    expect(await run(vault)).toBe("done");
    const lib = (await server.value<StoredEntry[]>("citations"))!;
    expect(lib).toHaveLength(s.lib.length + 1);
    expect(lib.every((e) => !!e.pid)).toBe(true);
    expect(lib.at(-1)).toMatchObject({ title: "Added on the other device" });
    expect(new Set(lib.map((e) => e.pid)).size).toBe(lib.length);
  });

  it("the notes another device wrote meanwhile are kept, and the paper they are about is merged in", async () => {
    const vault = await vaultOff();
    const s = await seed(null);
    let once = true;
    server.onPut = async (kind) => {
      if (kind !== "ap_notes" || !once) return;
      once = false;
      const cur = (await server.value<ApNotes>("ap_notes"))!;
      await server.writeAs(null, "ap_notes", { ...cur, athesisreadelsewhere1234: { title: THESIS_TITLE, stages: { gap: { mine: "Read on the other device." } }, card: { weak: "Not checked." } } });
    };
    expect(await run(vault)).toBe("done");
    const notes = (await server.value<ApNotes>("ap_notes"))!;
    const thesis = (await server.value<ShelfIndex>("shelf_index"))![2]!.pid!;
    expect(notes.athesisreadelsewhere1234!.movedTo).toBe("p:" + thesis);
    expect(notes["p:" + thesis]).toMatchObject({ stages: { gap: { mine: "Read on the other device." } }, card: { weak: "Not checked." }, cells: { Sample: "40 students, one college" } });
    expect(notes[s.keys.pasted]).toEqual(s.notes[s.keys.pasted]);
  });
});

describe("a write the server refuses", () => {
  it("a library too large to save (413) is busy, nothing is kept to be sent later, and the stored library is as it was", async () => {
    const vault = await vaultOff();
    const s = await seed(null);
    server.onPut = (kind) => { if (kind === "citations") throw new ApiError(413, "too-large"); };
    expect(await run(vault)).toBe("busy");
    expect(await server.value("citations")).toEqual(s.lib);
    expect(heldBlobs.size).toBe(0);
    expect(shouldWarnOnUnloadBlobs()).toBe(false);
    // The reading list and the notes were not touched: the run stopped at the first step it could not take.
    expect(putKinds()).toEqual(["citations"]);
  });
});

describe("Review Focus 3: a run that stops after the citations", () => {
  it("it resumes after a run that stopped after the citations (Review Focus 3): on another device, one id per paper, no lost note, no lost card", async () => {
    const vault = await vaultOff();
    const s = await seed(null);
    // The tab closes (the network goes) as the reading list is about to be written.
    server.onPut = (kind) => { if (kind === "shelf_index") throw new Error("the tab was closed"); };
    expect(await run(vault)).toBe("busy");
    const afterFirst = (await server.value<StoredEntry[]>("citations"))!;
    expect(afterFirst.every((e) => !!e.pid)).toBe(true);
    expect((await server.value<ShelfIndex>("shelf_index"))!.every((e) => e.pid === undefined)).toBe(true);
    expect(await server.value("ap_notes")).toEqual(s.notes);
    // The run left nothing to be sent later, and no leave-the-page warning behind it.
    expect(heldBlobs.size).toBe(0);
    expect(shouldWarnOnUnloadBlobs()).toBe(false);

    // Another device: a fresh tab (nothing held), a fresh vault object, the stored data.
    server.onPut = undefined;
    heldBlobs.clear();
    expect(await run(await vaultOff())).toBe("done");
    await expectMigrated({ ...s, lib: afterFirst }, null);
    const lib = (await server.value<StoredEntry[]>("citations"))!;
    // The ids the first run gave were kept, not given again.
    expect(lib.map((e) => e.pid)).toEqual(afterFirst.map((e) => e.pid));
  });

  it("the same holds with the vault on", async () => {
    const vault = await unlocked();
    const s = await seed(vault);
    server.onPut = (kind) => { if (kind === "ap_notes") throw new Error("the tab was closed"); };
    expect(await run(vault)).toBe("busy");
    const idx = (await server.value<ShelfIndex>("shelf_index", vault))!;
    expect(idx.every((e) => !!e.pid)).toBe(true);
    expect(await server.value("ap_notes", vault)).toEqual(s.notes);
    server.onPut = undefined;
    heldBlobs.clear();
    expect(await run(vault)).toBe("done");
    const afterFirst = (await server.value<StoredEntry[]>("citations", vault))!;
    await expectMigrated({ ...s, lib: afterFirst }, vault);
    expect((await server.value<ShelfIndex>("shelf_index", vault))!.map((e) => e.pid)).toEqual(idx.map((e) => e.pid));
  });
});

describe("Literature's Ready mark", () => {
  const markReady = () => { server.marks.lit = { readyAt: server.now() }; };

  it("a Ready stage is still Ready afterwards: the migration's own writes are re-stamped with the server's clock", async () => {
    const vault = await vaultOff();
    await seed(null);
    markReady();
    expect(litState()).toBe("ready");
    expect(await run(vault)).toBe("done");
    expect(litState()).toBe("ready");
    // Stamped again after each of the three writes (the library, the reading list, the notes), so no step leaves the stage reopened for the next.
    const posts = server.calls.filter((c) => c.method === "POST");
    expect(posts.map((c) => c.path)).toEqual(Array(3).fill(`/projects/${P}/stages/lit/ready`));
    // The time is the server's, never sent by this device.
    expect(posts.every((c) => c.body === undefined)).toBe(true);
    // Each stamp came right after its write.
    const order = server.calls.filter((c) => c.method === "POST" || c.method === "PUT").map((c) => (c.method === "POST" ? "stamp" : decodeURIComponent(c.path.split("/blobs/")[1]!)));
    expect(order).toEqual(["citations", "stamp", "shelf_index", "stamp", "ap_notes", "stamp"]);
  });

  it("a tab closed between two steps leaves Literature Ready: the stamp follows each write, it does not wait for the end of the run (B2-R32)", async () => {
    // Its own project, since the run below never ends and a run is one per project.
    server = createBlobServer("pclosed");
    h.api.mockImplementation(server.api);
    await seed(null);
    markReady();
    expect(litState()).toBe("ready");
    // The reading-list write never answers: the tab is gone before the run can reach its end.
    server.onPut = (kind) => (kind === "shelf_index" ? new Promise<void>(() => {}) : undefined);
    const vault = await vaultOff();
    void ensurePaperIds("pclosed", { vault: () => vault });
    for (let i = 0; i < 400 && !server.puts("shelf_index").length; i++) await new Promise((r) => setTimeout(r, 5));
    expect(server.puts("shelf_index")).toHaveLength(1);
    expect(server.puts("citations")).toHaveLength(1);
    expect(server.calls.filter((c) => c.method === "POST")).toHaveLength(1);
    expect(litState()).toBe("ready");
  });

  it("a write that was refused is not stamped for", async () => {
    const vault = await vaultOff();
    await seed(null);
    markReady();
    server.onPut = (kind) => { if (kind === "citations") throw new ApiError(413, "too-large"); };
    expect(await run(vault)).toBe("busy");
    expect(server.calls.filter((c) => c.method === "POST")).toEqual([]);
  });

  it("a stage already reopened by the student's own work stays reopened", async () => {
    const vault = await vaultOff();
    await seed(null);
    markReady();
    // The student keeps working on the reading list after marking Literature Ready.
    server.putPlain("shelf_index", todayShelf().index);
    expect(litState()).toBe("reopened");
    expect(await run(vault)).toBe("done");
    expect(litState()).toBe("reopened");
    expect(server.calls.filter((c) => c.method === "POST")).toEqual([]);
  });

  it("a stage that was never Ready is not marked Ready", async () => {
    await seed(null);
    expect(await run(await vaultOff())).toBe("done");
    expect(server.calls.filter((c) => c.method === "POST")).toEqual([]);
    expect(litState()).not.toBe("ready");
  });

  it("a run that writes nothing marks nothing", async () => {
    const vault = await vaultOff();
    await seed(null);
    await run(vault);
    markReady();
    const before = server.calls.length;
    expect(await run(vault)).toBe("done");
    expect(server.calls.slice(before).filter((c) => c.method !== "GET")).toEqual([]);
    expect(litState()).toBe("ready");
  });

  it("a run that wrote something and stopped still re-stamps, so the run that finishes it does not find a stage it reopened", async () => {
    const vault = await vaultOff();
    await seed(null);
    markReady();
    server.onPut = (kind) => { if (kind === "shelf_index") throw new Error("offline"); };
    expect(await run(vault)).toBe("busy");
    expect(litState()).toBe("ready");
  });
});

describe("where it does not run", () => {
  it("never in a place's own window", async () => {
    await seed(null);
    server.calls.length = 0;
    window.history.replaceState(null, "", `/p/${P}/lit/find?window=1`);
    expect(await run(await vaultOff())).toBe("busy");
    expect(server.calls).toEqual([]);
  });

  it("never on the adding screen: its tab is closed straight after the keep (B2-R16)", async () => {
    await seed(null);
    server.calls.length = 0;
    window.history.replaceState(null, "", "/add#capture=eyJ0aXRsZSI6IlQifQ%3D%3D");
    expect(await run(await vaultOff())).toBe("busy");
    expect(server.calls).toEqual([]);
  });

  it("never at / with a #capture= hash: an old bookmark's hop through / to the adding screen (W13)", async () => {
    await seed(null);
    server.calls.length = 0;
    window.history.replaceState(null, "", "/#capture=eyJ0aXRsZSI6IlQifQ%3D%3D");
    expect(await run(await vaultOff())).toBe("busy");
    expect(server.calls).toEqual([]);
  });

  it("any other hash at / does not stop it", async () => {
    await seed(null);
    window.history.replaceState(null, "", "/#top");
    expect(await run(await vaultOff())).toBe("done");
  });
});

describe("the citations step through the shell's library", () => {
  it("reads and writes the library through the blob it is given, and links the reading list to the ids it wrote", async () => {
    const s = await seed(null);
    let stored: StoredEntry[] = s.lib;
    const calls: string[] = [];
    const shared: MigrationBlob<StoredEntry[]> = {
      read: async () => { calls.push("read"); return { out: "ok", value: stored }; },
      write: async (u) => { calls.push("write"); stored = withPids(u(stored)); return { out: "ok", value: stored }; },
      close: () => { calls.push("close"); }
    };
    expect(await run(await vaultOff(), { citations: shared })).toBe("done");
    expect(calls.slice(0, 2)).toEqual(["read", "write"]);
    // The citations blob was not touched by the migration's own client.
    expect(server.gets("citations")).toEqual([]);
    expect(server.puts("citations")).toEqual([]);
    const index = (await server.value<ShelfIndex>("shelf_index"))!;
    expect(index[0]!.pid).toBe(stored.find((e) => e.doi === SDT_DOI)!.pid);
    expect(index[1]!.pid).toBe(stored.find((e) => e.title === MORNING_TITLE)!.pid);
  });

  it.each([["locked"], ["broken"], ["busy"]] as const)("a library that answers %s stops the run before anything else is read or written", async (why) => {
    await seed(null);
    server.calls.length = 0;
    const shared: MigrationBlob<StoredEntry[]> = { read: async () => ({ out: why }), write: async () => ({ out: why }), close: () => {} };
    expect(await run(await vaultOff(), { citations: shared })).toBe(why);
    expect(server.calls).toEqual([]);
  });
});
