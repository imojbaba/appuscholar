import { describe, expect, it, vi } from "vitest";
import { migrateToVault } from "../lib/vault/migrate";
import type { WrappedDek } from "../lib/vault/useVault";

type Rev = { seq: number; bodyHtml: string; keyVersion: number };
type Doc = { id: string; deks: WrappedDek[]; deletedAt: string | null; revs: Rev[] };

/** A server in memory, with the calls the migration makes recorded in order. Bodies are "sealed" by prefixing the key version. */
function fakeServer(docs: Doc[]) {
  const calls: string[] = [];
  const doc = (id: string) => docs.find((d) => d.id === id)!;
  const deps = {
    // The api lists most recently updated first; the migration must not depend on that.
    listAll: vi.fn(async () => docs.map((d) => ({ id: d.id, deks: [...d.deks], deletedAt: d.deletedAt })).reverse()),
    // Newest first, as GET /documents/:id/revisions answers.
    listRevisions: vi.fn(async (id: string) => [...doc(id).revs].sort((a, b) => b.seq - a.seq).map((r) => ({ seq: r.seq, keyVersion: r.keyVersion }))),
    getRevision: vi.fn(async (id: string, seq: number) => { const r = doc(id).revs.find((x) => x.seq === seq)!; return { bodyHtml: r.bodyHtml, keyVersion: r.keyVersion }; }),
    addDek: vi.fn(async (id: string, dek: WrappedDek) => {
      calls.push(`dek ${id}`);
      if (doc(id).deks.some((k) => k.v === dek.v)) throw new Error("dek-exists");
      doc(id).deks.push(dek);
    }),
    rewrite: vi.fn(async (id: string, seq: number, body: { bodyHtml: string; keyVersion: number }) => {
      calls.push(`rewrite ${id}:${seq}`);
      if (!doc(id).deks.some((k) => k.v === body.keyVersion)) throw new Error("unknown-key-version");
      Object.assign(doc(id).revs.find((r) => r.seq === seq)!, body);
    }),
    complete: vi.fn(async () => { calls.push("complete"); }),
    encrypt: vi.fn(async (d: { id: string; deks: WrappedDek[] }, html: string) => {
      if (d.deks.length === 0) return { bodyHtml: `k1:${html}`, keyVersion: 1, dek: { v: 1, wrapped: `w-${d.id}` } };
      const top = Math.max(...d.deks.map((k) => k.v));
      return { bodyHtml: `k${top}:${html}`, keyVersion: top };
    }),
    onProgress: vi.fn()
  };
  return { deps, calls };
}

const twoDocs = (): Doc[] => [
  // "a" was saved once after the vault was set up: its second revision is already sealed under its key.
  { id: "a", deks: [{ v: 1, wrapped: "w-a" }], deletedAt: null, revs: [{ seq: 1, bodyHtml: "<p>a1</p>", keyVersion: 0 }, { seq: 2, bodyHtml: "k1:<p>a2</p>", keyVersion: 1 }] },
  { id: "b", deks: [], deletedAt: null, revs: [{ seq: 1, bodyHtml: "<p>b1</p>", keyVersion: 0 }, { seq: 2, bodyHtml: "<p>b2</p>", keyVersion: 0 }] }
];

describe("migrateToVault", () => {
  it("rewrites every plaintext revision in order, adds one dek per document, reports progress, then completes", async () => {
    const docs = twoDocs();
    const { deps, calls } = fakeServer(docs);
    const out = await migrateToVault(deps);
    expect(out).toEqual({ rewritten: 3 });
    // Documents by id, revisions ascending; "b" gets its key once, before its first rewrite; completion comes last, once.
    expect(calls).toEqual(["rewrite a:1", "dek b", "rewrite b:1", "rewrite b:2", "complete"]);
    expect(deps.addDek).toHaveBeenCalledTimes(1);
    expect(deps.addDek).toHaveBeenCalledWith("b", { v: 1, wrapped: "w-b" });
    // The already sealed revision is neither read nor rewritten.
    expect(deps.getRevision).not.toHaveBeenCalledWith("a", 2);
    expect(deps.rewrite).not.toHaveBeenCalledWith("a", 2, expect.anything());
    // Every rewrite carries ciphertext under a key the document has, never the plaintext.
    for (const [, , body] of deps.rewrite.mock.calls) expect(body.keyVersion).toBe(1);
    expect(docs.flatMap((d) => d.revs)).toEqual([
      { seq: 1, bodyHtml: "k1:<p>a1</p>", keyVersion: 1 },
      { seq: 2, bodyHtml: "k1:<p>a2</p>", keyVersion: 1 },
      { seq: 1, bodyHtml: "k1:<p>b1</p>", keyVersion: 1 },
      { seq: 2, bodyHtml: "k1:<p>b2</p>", keyVersion: 1 }
    ]);
    // The second revision of "b" is sealed with the key that was just added, not a new one.
    expect(deps.encrypt.mock.calls.map(([d]) => [d.id, d.deks.length])).toEqual([["a", 1], ["b", 0], ["b", 1]]);
    expect(deps.onProgress.mock.calls).toEqual([[1, 2], [2, 2]]);
    expect(deps.complete).toHaveBeenCalledTimes(1);
  });

  it("is idempotent after an interruption", async () => {
    const docs = twoDocs();
    const { deps, calls } = fakeServer(docs);
    const rewrite = deps.rewrite.getMockImplementation()!;
    let n = 0;
    deps.rewrite.mockImplementation(async (id, seq, body) => { if (++n === 2) throw new Error("network"); return rewrite(id, seq, body); });
    await expect(migrateToVault(deps)).rejects.toThrow("network");
    expect(deps.complete).not.toHaveBeenCalled();
    // "a" is done and "b" has its key, but neither of its revisions was rewritten.
    expect(docs[1]!.deks).toEqual([{ v: 1, wrapped: "w-b" }]);
    expect(docs[1]!.revs.map((r) => r.keyVersion)).toEqual([0, 0]);

    calls.length = 0;
    deps.onProgress.mockClear();
    deps.rewrite.mockImplementation(rewrite);
    const out = await migrateToVault(deps);
    expect(out).toEqual({ rewritten: 2 });
    // Only what was still plaintext is rewritten, under the key already on the server: no second dek.
    expect(calls).toEqual(["rewrite b:1", "rewrite b:2", "complete"]);
    expect(deps.addDek).toHaveBeenCalledTimes(1);
    expect(deps.complete).toHaveBeenCalledTimes(1);
    expect(deps.onProgress.mock.calls).toEqual([[1, 2], [2, 2]]);
    // Nothing was sealed twice.
    expect(docs.flatMap((d) => d.revs.map((r) => r.bodyHtml))).toEqual(["k1:<p>a1</p>", "k1:<p>a2</p>", "k1:<p>b1</p>", "k1:<p>b2</p>"]);
  });

  it("includes soft-deleted documents", async () => {
    const docs: Doc[] = [
      { id: "live", deks: [], deletedAt: null, revs: [{ seq: 1, bodyHtml: "<p>here</p>", keyVersion: 0 }] },
      { id: "gone", deks: [], deletedAt: "2026-10-01T00:00:00.000Z", revs: [{ seq: 1, bodyHtml: "<p>deleted words</p>", keyVersion: 0 }, { seq: 2, bodyHtml: "<p>more</p>", keyVersion: 0 }] }
    ];
    const { deps, calls } = fakeServer(docs);
    const out = await migrateToVault(deps);
    expect(out).toEqual({ rewritten: 3 });
    expect(calls).toEqual(["dek gone", "rewrite gone:1", "rewrite gone:2", "dek live", "rewrite live:1", "complete"]);
    expect(docs.find((d) => d.id === "gone")!.revs.every((r) => r.keyVersion === 1 && r.bodyHtml.startsWith("k1:"))).toBe(true);
    expect(deps.onProgress.mock.calls).toEqual([[1, 2], [2, 2]]);
  });

  it("with nothing left in plaintext it only completes, and with no documents it still completes", async () => {
    const sealed: Doc[] = [{ id: "a", deks: [{ v: 1, wrapped: "w-a" }], deletedAt: null, revs: [{ seq: 1, bodyHtml: "k1:x", keyVersion: 1 }] }];
    const one = fakeServer(sealed);
    expect(await migrateToVault(one.deps)).toEqual({ rewritten: 0 });
    expect(one.calls).toEqual(["complete"]);
    expect(one.deps.encrypt).not.toHaveBeenCalled();
    const none = fakeServer([]);
    expect(await migrateToVault(none.deps)).toEqual({ rewritten: 0 });
    expect(none.calls).toEqual(["complete"]);
    expect(none.deps.onProgress).not.toHaveBeenCalled();
  });

  it("a revision rewritten meanwhile (another tab) is skipped, and a failed rewrite stops the run before completion", async () => {
    const docs = twoDocs();
    const { deps, calls } = fakeServer(docs);
    const get = deps.getRevision.getMockImplementation()!;
    // Between the listing and the read, another tab sealed a:1 (under the key "a" already has).
    deps.getRevision.mockImplementation(async (id, seq) => (id === "a" && seq === 1 ? { bodyHtml: "k1:other", keyVersion: 1 } : get(id, seq)));
    deps.rewrite.mockImplementation(async (id, seq) => { calls.push(`rewrite ${id}:${seq}`); throw new Error("migration-closed"); });
    await expect(migrateToVault(deps)).rejects.toThrow("migration-closed");
    // a:1 is not rewritten over the other tab's ciphertext; the first refused rewrite ends the run.
    expect(calls).toEqual(["dek b", "rewrite b:1"]);
    expect(deps.rewrite).toHaveBeenCalledTimes(1);
    expect(deps.complete).not.toHaveBeenCalled();
  });
});
