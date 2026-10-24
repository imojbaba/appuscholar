// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { citKey } from "@appuscholar/core";
import type { ApNote, ApNotes, RefCheckCache, ShelfIndex, StoredEntry } from "../lib/blobs/kinds";
import { heldBlobs } from "../lib/blobs/held";
import { projectBlobClient } from "../lib/blobs/useProjectBlob";
import { mergePaperNotes } from "../lib/papers/ids";
import { mergeDuplicate, mergeEntries, mergeLibrary, repointShelf, settleRefcheck } from "../lib/papers/merge";
import { createBlobServer, fakeVault, unlock, type FakeVault, type Server } from "./support/blobServer";

/*
 * "Merge the two" (wave B Task 24, register row D-S2-130; rulings B2-R29, R9, R10, R11): two library entries that are the same paper become one. The older pid stays, its empty fields are
 * filled from the other, the other's notes move to it (the old key stays, with `movedTo`, so nothing the student wrote is lost), the reading-list entries of the dropped pid are
 * repointed to the kept one, and the dropped entry's Crossref answer is dropped. Resumable: the library, which is what shows the pair, is written last.
 */

const h = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));

const P = "p1";
const note = (over: Partial<ApNote> = {}): ApNote => ({ stages: {}, card: {}, ...over });
const KEPT: StoredEntry = { pid: "ka", author: "", year: "1988", title: "Statistical power analysis for the behavioral sciences", doi: "10.4324/9780203771587", rl: true };
const DROPPED: StoredEntry = { pid: "kb", author: "Cohen, J.", year: "1988", title: "Statistical power analysis for the behavioral sciences, second edition", doi: "10.4324/9780203771587", source: "Erlbaum", abstract: "An abstract.", ack: ["year"] };

describe("mergeEntries and mergeLibrary", () => {
  it("the kept entry keeps its pid and every field it has, and takes the empty ones from the other", () => {
    const m = mergeEntries(KEPT, DROPPED);
    expect(m).toEqual({ ...KEPT, author: "Cohen, J.", source: "Erlbaum", abstract: "An abstract.", ack: ["year"] });
    // The kept title is the kept entry's, not the other's.
    expect(m.title).toBe(KEPT.title);
    expect(m.pid).toBe("ka");
  });
  it("what the student kept is kept: the acks of both are joined; on the reading list if either was", () => {
    const m = mergeEntries({ ...KEPT, ack: ["title"], rl: false }, { ...DROPPED, rl: undefined });
    expect(m.ack).toEqual(["title", "year"]);
    expect(m.rl).toBe(true);
    expect(mergeEntries({ ...KEPT, rl: false }, { ...DROPPED, rl: false }).rl).toBe(false);
  });
  it("mergeLibrary takes the dropped entry out and fills the kept one in place; a library without the pair is returned as it is", () => {
    const other: StoredEntry = { pid: "kc", title: "Another paper entirely, with a long title", author: "Putwain, D.", year: "2008" };
    const lib = [other, KEPT, DROPPED];
    const out = mergeLibrary(lib, "ka", "kb");
    expect(out.map((e) => e.pid)).toEqual(["kc", "ka"]);
    expect(out[1]!.author).toBe("Cohen, J.");
    expect(out[0]).toBe(other);
    expect(mergeLibrary(out, "ka", "kb")).toBe(out);
    expect(mergeLibrary([KEPT], "ka", "kb")).toEqual([KEPT]);
    expect(mergeLibrary([DROPPED], "ka", "kb")).toEqual([DROPPED]);
  });
});

describe("repointShelf", () => {
  const e = (id: string, pid?: string): ShelfIndex[number] => ({ id, title: "T" + id, file: id + ".pdf", size: 1, added: "2026-01-01", total: 1, kept: 1, ...(pid ? { pid } : {}) });
  it("repoints every reading-list entry of the dropped pid (two PDFs of one paper) and no other", () => {
    const index = [e("s1", "kb"), e("s2", "kc"), e("s3", "kb"), e("s4")];
    const out = repointShelf(index, "kb", "ka");
    expect(out.map((x) => x.pid)).toEqual(["ka", "kc", "ka", undefined]);
    expect(out[1]).toBe(index[1]);
    expect(repointShelf(out, "kb", "ka")).toBe(out);
  });
});

describe("mergePaperNotes", () => {
  it("merging keeps one pid and moves the other's notes: the student's words of both are joined, the old key stays with movedTo (R9, R10, R11)", () => {
    const notes: ApNotes = {
      "p:ka": note({ pid: "ka", title: "Kept", stages: { design: { mine: "Mine on the kept one." } }, card: { strengths: "Clear." }, take: "A take." }),
      "p:kb": note({ pid: "kb", title: "Dropped", stages: { design: { mine: "Mine on the other." }, stats: { mine: "Only here." } }, card: { strengths: "Clear.", weak: "Small sample." }, take: "A second take.", cells: { sample: "60" } })
    };
    const out = mergePaperNotes(notes, "kb", "ka");
    expect(out["p:ka"]!.pid).toBe("ka");
    expect(out["p:ka"]!.title).toBe("Kept");
    expect(out["p:ka"]!.stages.design!.mine).toBe("Mine on the kept one.\n\nMine on the other.");
    expect(out["p:ka"]!.stages.stats!.mine).toBe("Only here.");
    expect(out["p:ka"]!.card).toEqual({ strengths: "Clear.", weak: "Small sample." });
    expect(out["p:ka"]!.take).toBe("A take.\n\nA second take.");
    expect(out["p:ka"]!.cells).toEqual({ sample: "60" });
    // The old note stays whole, pointing at where its words went, and it is not counted twice.
    expect(out["p:kb"]).toEqual({ ...notes["p:kb"], movedTo: "p:ka" });
    // Every note it writes has its stages and its card.
    for (const n of Object.values(out)) { expect(n.stages).toBeDefined(); expect(n.card).toBeDefined(); }
    // Again: nothing moves twice.
    expect(mergePaperNotes(out, "kb", "ka")).toBe(out);
  });
  it("the dropped paper's note alone becomes the kept paper's note; neither having one changes nothing", () => {
    const notes: ApNotes = { "p:kb": note({ pid: "kb", title: "Dropped", stages: { design: { mine: "Words." } } }), "p:kz": note({ pid: "kz" }) };
    const out = mergePaperNotes(notes, "kb", "ka");
    expect(out["p:ka"]).toEqual({ ...notes["p:kb"], pid: "ka" });
    expect(out["p:kb"]!.movedTo).toBe("p:ka");
    expect(out["p:kz"]).toBe(notes["p:kz"]);
    expect(mergePaperNotes({ "p:kz": note() }, "kb", "ka")).toEqual({ "p:kz": note() });
    const same: ApNotes = { "p:ka": note({ pid: "ka" }) };
    expect(mergePaperNotes(same, "kb", "ka")).toBe(same);
  });
  it("an old note that moved to the dropped paper now points at the kept one, so no move leads through two keys", () => {
    const notes: ApNotes = {
      "p:kb": note({ pid: "kb", stages: { design: { mine: "x" } } }),
      "aold": note({ title: "Old", movedTo: "p:kb" })
    };
    const out = mergePaperNotes(notes, "kb", "ka");
    expect(out["aold"]!.movedTo).toBe("p:ka");
    expect(out["p:ka"]!.stages.design!.mine).toBe("x");
  });
});

describe("settleRefcheck", () => {
  const rc = (title = "x") => ({ s: "ok" as const, m: [], f: { title, year: 1988, author: "Cohen", doi: "" }, t: 1 });
  it("the kept entry's answer moves with its key (it was filled), and the dropped entry's answer is dropped (R29)", () => {
    const after = mergeEntries(KEPT, DROPPED);
    const cache: RefCheckCache = { [citKey(KEPT)]: rc("kept"), [citKey(DROPPED)]: rc("dropped"), other: rc("other") };
    const out = settleRefcheck(cache, { keptBefore: KEPT, keptAfter: after, dropped: DROPPED });
    expect(Object.keys(out).sort()).toEqual([citKey(after), "other"].sort());
    // The kept answer is at the key its filled author gives.
    expect(citKey(after)).toBe(citKey({ ...KEPT, author: "Cohen, J." }));
    expect(out[citKey(after)]).toMatchObject({ f: { title: "kept" } });
  });
  it("the dropped entry's own key is dropped when it differs from the kept one's; a shared key keeps its answer", () => {
    const keptWhole: StoredEntry = { ...KEPT, author: "Cohen, J." };
    const cache: RefCheckCache = { [citKey(keptWhole)]: rc("kept"), [citKey(DROPPED)]: rc("dropped") };
    const out = settleRefcheck(cache, { keptBefore: keptWhole, keptAfter: mergeEntries(keptWhole, DROPPED), dropped: DROPPED });
    expect(Object.keys(out)).toEqual([citKey(keptWhole)]);
    const same: StoredEntry = { ...DROPPED, pid: "ka" };
    const shared: RefCheckCache = { [citKey(same)]: rc("both") };
    expect(settleRefcheck(shared, { keptBefore: same, keptAfter: same, dropped: DROPPED })).toBe(shared);
  });
  it("a cache with nothing for either entry is returned as it is", () => {
    const cache: RefCheckCache = { other: rc() };
    expect(settleRefcheck(cache, { keptBefore: KEPT, keptAfter: mergeEntries(KEPT, DROPPED), dropped: DROPPED })).toBe(cache);
  });
});

// ---------------------------------------------------------------- the whole merge over a fake server

let server: Server;
beforeEach(() => {
  server = createBlobServer(P);
  h.api.mockReset().mockImplementation(server.api);
  heldBlobs.clear();
});
afterEach(() => { vi.restoreAllMocks(); });

/** The shell's library client, as the merge gets it: the entries as read, an update and a flush that go to the server through a blob client. */
async function libraryOver(vault: FakeVault) {
  let state: { value: StoredEntry[] | null } = { value: null };
  const c = projectBlobClient("citations", P, () => vault, (s) => { state = s; });
  await c.start();
  return {
    get lib() { return state.value ?? []; },
    update: (fn: (prev: StoredEntry[]) => StoredEntry[]) => { c.set((prev) => fn(prev ?? [])); return true; },
    flush: () => c.flush(),
    close: () => c.dispose()
  };
}

async function seed(vault: FakeVault) {
  const lib: StoredEntry[] = [KEPT, DROPPED, { pid: "kc", author: "Putwain, D.", year: "2008", title: "Examination stress and test anxiety" }];
  const index: ShelfIndex = [
    { id: "s1", title: "Cohen pdf", file: "c.pdf", size: 1, added: "2026-01-01", total: 1, kept: 1, pid: "kb" },
    { id: "s2", title: "Putwain pdf", file: "p.pdf", size: 1, added: "2026-01-02", total: 1, kept: 1, pid: "kc" }
  ];
  const notes: ApNotes = {
    "p:ka": note({ pid: "ka", stages: { design: { mine: "Kept words." } } }),
    "p:kb": note({ pid: "kb", stages: { design: { mine: "Dropped words." } }, card: { verdict: "Solid." } })
  };
  const cache: RefCheckCache = { [citKey(KEPT)]: { s: "diff", m: [{ k: "author", v: "Cohen" }], miss: ["author"], f: { title: "x", year: 1988, author: "Cohen", doi: "", authors: "Cohen, Jacob" }, t: 1 }, [citKey(DROPPED)]: { s: "ok", m: [], t: 1 } };
  server.vaultExists = vault.status !== "off";
  const put = (kind: string, value: unknown) => (vault.status === "off" ? Promise.resolve(server.putPlain(kind, value)) : server.putSealed(vault, kind, value));
  await put("citations", lib);
  await put("shelf_index", index);
  await put("ap_notes", notes);
  await put("refcheck_cache", cache);
  return { lib, index, notes, cache };
}

describe("mergeDuplicate", () => {
  /** A refcheck client the way the checks hook holds it. */
  async function refcheckOver(vault: FakeVault) {
    let state: { value: RefCheckCache | null } = { value: null };
    const c = projectBlobClient("refcheck_cache", P, () => vault, (s) => { state = s; });
    await c.start();
    return {
      // As the checks hook's updateRefcheck: an update that changes nothing writes nothing.
      update: async (fn: (prev: RefCheckCache) => RefCheckCache) => {
        const prev = state.value ?? {};
        const next = fn(prev);
        if (next === prev) return true;
        c.set(() => next);
        return c.flush();
      },
      get value() { return state.value; },
      close: () => c.dispose()
    };
  }

  for (const sealed of [false, true]) {
    it(`${sealed ? "sealed under the vault" : "with the vault off"}: the notes move, the reading list is repointed, the answer is dropped, and the library is written last, with one pid left`, async () => {
      const vault = await fakeVault({ status: sealed ? "unlocked" : "off", complete: true });
      await seed(vault);
      const library = await libraryOver(vault);
      const rc = await refcheckOver(vault);
      const r = await mergeDuplicate("ka", "kb", { projectId: P, vault: () => vault, library, updateRefcheck: rc.update });
      expect(r).toBe("done");
      const v = sealed ? vault : undefined;

      const lib = (await server.value<StoredEntry[]>("citations", v))!;
      expect(lib.map((e) => e.pid)).toEqual(["ka", "kc"]);
      expect(lib[0]).toMatchObject({ pid: "ka", author: "Cohen, J.", source: "Erlbaum", abstract: "An abstract.", ack: ["year"], doi: KEPT.doi });
      const index = (await server.value<ShelfIndex>("shelf_index", v))!;
      expect(index.map((x) => [x.id, x.pid])).toEqual([["s1", "ka"], ["s2", "kc"]]);
      const notes = (await server.value<ApNotes>("ap_notes", v))!;
      expect(notes["p:ka"]!.stages.design!.mine).toBe("Kept words.\n\nDropped words.");
      expect(notes["p:ka"]!.card.verdict).toBe("Solid.");
      expect(notes["p:kb"]!.movedTo).toBe("p:ka");
      expect(notes["p:kb"]!.stages.design!.mine).toBe("Dropped words.");
      const cache = (await server.value<RefCheckCache>("refcheck_cache", v))!;
      // The kept entry's answer moved to the key its filled author gives; no answer is left for the dropped entry's own key.
      expect(Object.keys(cache)).toEqual([citKey({ ...KEPT, author: "Cohen, J." })]);
      expect(cache[Object.keys(cache)[0]!]!.s).toBe("ok");

      // The library was written after the reading list and the notes.
      const order = server.puts().map((c) => decodeURIComponent(c.path.split("/blobs/")[1]!)).filter((k) => ["citations", "shelf_index", "ap_notes"].includes(k));
      expect(order.at(-1)).toBe("citations");
      expect(order).toContain("shelf_index");
      expect(order).toContain("ap_notes");
      library.close(); rc.close();
    });
  }

  it("is idempotent: again, with the library as the first run left it, writes nothing; a run that stopped before the library is finished by the next", async () => {
    const vault = await fakeVault({ status: "off" });
    await seed(vault);
    const library = await libraryOver(vault);
    const rc = await refcheckOver(vault);
    // The first run is stopped at the library: the vault is locked meanwhile (here: the library's update is refused).
    const refuse = { ...library, update: () => false };
    expect(await mergeDuplicate("ka", "kb", { projectId: P, vault: () => vault, library: refuse, updateRefcheck: rc.update })).toBe("busy");
    expect((await server.value<StoredEntry[]>("citations"))!.map((e) => e.pid)).toEqual(["ka", "kb", "kc"]);
    expect((await server.value<ShelfIndex>("shelf_index"))!.map((x) => x.pid)).toEqual(["ka", "kc"]);
    // The next run finishes it, and moves nothing twice.
    expect(await mergeDuplicate("ka", "kb", { projectId: P, vault: () => vault, library, updateRefcheck: rc.update })).toBe("done");
    expect((await server.value<StoredEntry[]>("citations"))!.map((e) => e.pid)).toEqual(["ka", "kc"]);
    expect((await server.value<ApNotes>("ap_notes"))!["p:ka"]!.stages.design!.mine).toBe("Kept words.\n\nDropped words.");
    const before = server.puts().length;
    expect(await mergeDuplicate("ka", "kb", { projectId: P, vault: () => vault, library, updateRefcheck: rc.update })).toBe("done");
    expect(server.puts().length).toBe(before);
    library.close(); rc.close();
  });

  it("a locked vault writes nothing and never asks for the passphrase", async () => {
    const vault = await fakeVault({ status: "unlocked", complete: true });
    await seed(vault);
    const library = await libraryOver(vault);
    const rc = await refcheckOver(vault);
    vault.lock();
    const before = server.puts().length;
    expect(await mergeDuplicate("ka", "kb", { projectId: P, vault: () => vault, library, updateRefcheck: rc.update })).toBe("locked");
    expect(server.puts().length).toBe(before);
    expect(vault.prompts).toBe(0);
    unlock(vault);
    library.close(); rc.close();
  });
});
