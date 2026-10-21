import { describe, expect, it, vi } from "vitest";
import { migrateToVault } from "../lib/vault/migrate";
import type { WrappedDek } from "../lib/vault/useVault";
import type { Titled } from "../lib/vault/titles";

type Rev = { seq: number; bodyHtml: string; keyVersion: number };
/** An api refusal as the migration sees it: apiFetch's ApiError carries the server's error as `code`. */
const refused = (code: string) => Object.assign(new Error(code), { code });
type Doc = { id: string; deks: WrappedDek[]; deletedAt: string | null; revs: Rev[] };

/** A project's stage blob as the server holds it. */
type Blob = { projectId: string; kind: string; body: string; keyVersion: number; deks: WrappedDek[] };

/**
 * A server in memory, with the calls the migration makes recorded in order. Bodies are "sealed" by prefixing the key version. `projects`
 * is what listProjects answers (the scratch project among them); a project missing from `blobs`' owners still lists no blobs.
 */
function fakeServer(docs: Doc[], blobs: Blob[] = [], projects: string[] = []) {
  const calls: string[] = [];
  const doc = (id: string) => docs.find((d) => d.id === id)!;
  const blob = (projectId: string, kind: string) => blobs.find((b) => b.projectId === projectId && b.kind === kind)!;
  const deps = {
    // The api lists most recently updated first; the migration must not depend on that.
    listAll: vi.fn(async () => docs.map((d) => ({ id: d.id, deks: [...d.deks], deletedAt: d.deletedAt })).reverse()),
    // Newest first, as GET /documents/:id/revisions answers.
    listRevisions: vi.fn(async (id: string) => [...doc(id).revs].sort((a, b) => b.seq - a.seq).map((r) => ({ seq: r.seq, keyVersion: r.keyVersion }))),
    getRevision: vi.fn(async (id: string, seq: number) => { const r = doc(id).revs.find((x) => x.seq === seq)!; return { bodyHtml: r.bodyHtml, keyVersion: r.keyVersion }; }),
    addDek: vi.fn(async (id: string, dek: WrappedDek) => {
      calls.push(`dek ${id}`);
      if (doc(id).deks.some((k) => k.v === dek.v)) throw refused("dek-exists");
      doc(id).deks.push(dek);
    }),
    rewrite: vi.fn(async (id: string, seq: number, body: { bodyHtml: string; keyVersion: number }) => {
      calls.push(`rewrite ${id}:${seq}`);
      if (!doc(id).deks.some((k) => k.v === body.keyVersion)) throw new Error("unknown-key-version");
      Object.assign(doc(id).revs.find((r) => r.seq === seq)!, body);
    }),
    complete: vi.fn(async () => {
      calls.push("complete");
      // The server counts plaintext blobs too.
      const left = docs.flatMap((d) => d.revs).filter((r) => r.keyVersion === 0).length + blobs.filter((b) => b.keyVersion === 0).length;
      if (left) throw refused("plaintext-remains");
    }),
    listProjects: vi.fn(async () => [...projects]),
    // Most recently updated first, as GET /projects/:id/blobs answers; the migration must not depend on that.
    listBlobs: vi.fn(async (projectId: string) => blobs.filter((b) => b.projectId === projectId).map((b) => ({ kind: b.kind, keyVersion: b.keyVersion })).reverse()),
    getBlob: vi.fn(async (projectId: string, kind: string) => { const b = blob(projectId, kind); return { body: b.body, keyVersion: b.keyVersion, deks: [...b.deks] }; }),
    rewriteBlob: vi.fn(async (projectId: string, kind: string, body: { body: string; keyVersion: number; dek?: WrappedDek }) => {
      calls.push(`blob ${projectId}:${kind}`);
      const b = blob(projectId, kind);
      // The documents' rules: a dek for this version that clashes with the blob's is refused; ciphertext must name a key the blob has.
      if (body.dek && b.deks.some((k) => k.v === body.dek!.v && k.wrapped !== body.dek!.wrapped)) throw refused("dek-exists");
      const deks = body.dek && !b.deks.some((k) => k.v === body.dek!.v) ? [...b.deks, body.dek] : b.deks;
      if (!deks.some((k) => k.v === body.keyVersion)) throw new Error("unknown-key-version");
      Object.assign(b, { body: body.body, keyVersion: body.keyVersion, deks });
    }),
    encrypt: vi.fn(async (d: { id: string; deks: WrappedDek[] }, html: string) => {
      if (d.deks.length === 0) return { bodyHtml: `k1:${html}`, keyVersion: 1, dek: { v: 1, wrapped: `w-${d.id}` } };
      const top = Math.max(...d.deks.map((k) => k.v));
      return { bodyHtml: `k${top}:${html}`, keyVersion: top };
    }),
    onProgress: vi.fn(),
    // No titles here: the title step has its own tests (titles.test.tsx and below).
    titles: {
      listProjects: vi.fn(async (): Promise<Titled[]> => []),
      listDocuments: vi.fn(async (_id: string): Promise<Titled[]> => []),
      patchProject: vi.fn(async (_id: string, _body: object) => {}),
      patchDocument: vi.fn(async (_id: string, _body: object, _deleted: boolean) => {})
    }
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

  it("a plaintext revision that appears on an already-processed document during the run is sealed before complete", async () => {
    const docs = twoDocs();
    const { deps, calls } = fakeServer(docs);
    const rewrite = deps.rewrite.getMockImplementation()!;
    let late = false;
    // A stale tab (it still thinks the vault is off) saves "a" in plaintext after the run has passed "a".
    deps.rewrite.mockImplementation(async (id, seq, body) => {
      await rewrite(id, seq, body);
      if (id === "b" && seq === 2 && !late) { late = true; docs[0]!.revs.push({ seq: 3, bodyHtml: "<p>a3 late</p>", keyVersion: 0 }); }
    });
    const out = await migrateToVault(deps);
    expect(out).toEqual({ rewritten: 4 });
    expect(calls).toEqual(["rewrite a:1", "dek b", "rewrite b:1", "rewrite b:2", "rewrite a:3", "complete"]);
    expect(docs[0]!.revs[2]).toEqual({ seq: 3, bodyHtml: "k1:<p>a3 late</p>", keyVersion: 1 });
    expect(deps.complete).toHaveBeenCalledTimes(1);
    // Progress is the first pass's; the checking passes do not count the documents again.
    expect(deps.onProgress.mock.calls).toEqual([[1, 2], [2, 2]]);
  });

  it("complete answered 409 plaintext-remains runs one more pass and retries once; a second refusal fails the run", async () => {
    const docs = twoDocs();
    const { deps, calls } = fakeServer(docs);
    const complete = deps.complete.getMockImplementation()!;
    // A plaintext write lands after the last pass and before complete.
    deps.complete.mockImplementationOnce(async () => { docs[1]!.revs.push({ seq: 3, bodyHtml: "<p>b3 late</p>", keyVersion: 0 }); return complete(); });
    const out = await migrateToVault(deps);
    expect(out).toEqual({ rewritten: 4 });
    expect(calls).toEqual(["rewrite a:1", "dek b", "rewrite b:1", "rewrite b:2", "complete", "rewrite b:3", "complete"]);
    expect(docs[1]!.revs[2]).toEqual({ seq: 3, bodyHtml: "k1:<p>b3 late</p>", keyVersion: 1 });

    // Plaintext keeps arriving before every complete: the one retry is refused too, and the run fails without looping.
    const docsB = twoDocs();
    const third = fakeServer(docsB);
    const finish = third.deps.complete.getMockImplementation()!;
    let seq = 10;
    third.deps.complete.mockImplementation(async () => { docsB[0]!.revs.push({ seq: seq++, bodyHtml: "<p>more</p>", keyVersion: 0 }); return finish(); });
    await expect(migrateToVault(third.deps)).rejects.toMatchObject({ code: "plaintext-remains" });
    expect(third.deps.complete).toHaveBeenCalledTimes(2);
  });

  it("stops repeating after five passes when every pass finds new plaintext, then lets complete decide", async () => {
    const docs = twoDocs();
    const { deps } = fakeServer(docs);
    const rewrite = deps.rewrite.getMockImplementation()!;
    let seq = 10;
    // Every rewrite of "a" is followed by another plaintext save of "a".
    deps.rewrite.mockImplementation(async (id, s, body) => { await rewrite(id, s, body); if (id === "a") docs[0]!.revs.push({ seq: seq++, bodyHtml: "<p>again</p>", keyVersion: 0 }); });
    await expect(migrateToVault(deps)).rejects.toMatchObject({ code: "plaintext-remains" });
    // Five passes, the one extra pass after the refusal, and its retry: never an endless loop.
    expect(deps.listAll).toHaveBeenCalledTimes(6);
    expect(deps.complete).toHaveBeenCalledTimes(2);
  });

  it("another tab gave a document its first key (409 dek-exists): its key is re-read and the revision sealed under it", async () => {
    const docs = twoDocs();
    const { deps, calls } = fakeServer(docs);
    const add = deps.addDek.getMockImplementation()!;
    // The other tab's key lands on "b" just before this tab's.
    deps.addDek.mockImplementationOnce(async (id, dek) => { docs[1]!.deks.push({ v: 1, wrapped: "w-other" }); return add(id, dek); });
    const out = await migrateToVault(deps);
    expect(out).toEqual({ rewritten: 3 });
    expect(calls).toEqual(["rewrite a:1", "dek b", "rewrite b:1", "rewrite b:2", "complete"]);
    expect(docs[1]!.deks).toEqual([{ v: 1, wrapped: "w-other" }]);
    // The refused key is never used: "b" is sealed under the other tab's key from then on.
    const forB = deps.encrypt.mock.calls.filter(([d]) => d.id === "b").map(([d]) => d.deks);
    expect(forB).toEqual([[], [{ v: 1, wrapped: "w-other" }], [{ v: 1, wrapped: "w-other" }]]);
    expect(deps.complete).toHaveBeenCalledTimes(1);
  });

  it("a dek refusal other than dek-exists stops the run", async () => {
    const { deps } = fakeServer(twoDocs());
    deps.addDek.mockRejectedValueOnce(refused("not-found"));
    await expect(migrateToVault(deps)).rejects.toMatchObject({ code: "not-found" });
    expect(deps.complete).not.toHaveBeenCalled();
  });

  it("after the blobs, plain project and document titles are sealed with the migration's own sealing, counted, before complete", async () => {
    const docs = twoDocs();
    const { deps, calls } = fakeServer(docs, [], ["p1"]);
    const titles = { projects: [{ id: "p1", title: "Thesis", titleKeyVersion: 0, deks: [] as WrappedDek[] }], docs: [{ id: "a", title: "Chapter", titleKeyVersion: 0, deks: [{ v: 1, wrapped: "w-a" }] }] };
    deps.titles = {
      listProjects: vi.fn(async () => titles.projects.map((p) => ({ ...p }))),
      listDocuments: vi.fn(async (id: string) => (id === "p1" ? titles.docs.map((d) => ({ ...d })) : [])),
      patchProject: vi.fn(async (id: string, body: object) => { calls.push(`title ${id}`); Object.assign(titles.projects.find((p) => p.id === id)!, body); }),
      patchDocument: vi.fn(async (id: string, body: object, _deleted: boolean) => { calls.push(`title ${id}`); Object.assign(titles.docs.find((d) => d.id === id)!, body); })
    };
    const out = await migrateToVault(deps);
    expect(out).toEqual({ rewritten: 5 });
    expect(calls).toEqual(["rewrite a:1", "dek b", "rewrite b:1", "rewrite b:2", "title p1", "title a", "complete"]);
    // The project's first key travels with its title; the document's title is under its own key.
    expect(deps.titles.patchProject).toHaveBeenCalledWith("p1", { title: "k1:Thesis", titleKeyVersion: 1, dek: { v: 1, wrapped: "w-project:p1" } });
    expect(deps.titles.patchDocument).toHaveBeenCalledWith("a", { title: "k1:Chapter", titleKeyVersion: 1 }, false);
  });

  describe("project blobs", () => {
    const plainBlob = (projectId: string, kind: string, value: unknown): Blob => ({ projectId, kind, body: JSON.stringify(value), keyVersion: 0, deks: [] });

    it("after the documents, every plaintext blob of every project is sealed under its own first dek, in one rewrite, and counted", async () => {
      const docs = twoDocs();
      const blobs = [plainBlob("p1", "citations", [{ author: "Ng, A." }]), plainBlob("p1", "idea_intake", { topic: "t" }), plainBlob("scratch", "rs_prefs", { rank: true })];
      const { deps, calls } = fakeServer(docs, blobs, ["scratch", "p1"]);
      const out = await migrateToVault(deps);
      expect(out).toEqual({ rewritten: 6 });
      // Projects by id, kinds by name, after the documents of the same listing; the checking pass finds nothing more.
      expect(calls).toEqual(["rewrite a:1", "dek b", "rewrite b:1", "rewrite b:2", "blob p1:citations", "blob p1:idea_intake", "blob scratch:rs_prefs", "complete"]);
      // The dek travels with the rewrite: no separate key request for a blob.
      expect(deps.addDek).toHaveBeenCalledTimes(1);
      expect(deps.rewriteBlob).toHaveBeenCalledWith("p1", "citations", { body: `k1:${JSON.stringify([{ author: "Ng, A." }])}`, keyVersion: 1, dek: { v: 1, wrapped: "w-blob:p1:citations" } });
      // Each blob is sealed under its own id, never a document's.
      expect(deps.encrypt.mock.calls.map(([d]) => d.id).filter((id) => id.startsWith("blob:"))).toEqual(["blob:p1:citations", "blob:p1:idea_intake", "blob:scratch:rs_prefs"]);
      expect(blobs.every((b) => b.keyVersion === 1 && b.body.startsWith("k1:") && b.deks.length === 1)).toBe(true);
      // Progress counts documents only.
      expect(deps.onProgress.mock.calls).toEqual([[1, 2], [2, 2]]);
      expect(deps.complete).toHaveBeenCalledTimes(1);
    });

    it("a blob already sealed is left as it is, and so is one sealed between the listing and the read", async () => {
      const blobs: Blob[] = [
        { projectId: "p1", kind: "citations", body: "k1:sealed", keyVersion: 1, deks: [{ v: 1, wrapped: "w-x" }] },
        plainBlob("p1", "rs_prefs", { rank: true })
      ];
      const { deps, calls } = fakeServer([], blobs, ["p1"]);
      const get = deps.getBlob.getMockImplementation()!;
      // Another tab seals rs_prefs after this tab listed it.
      deps.getBlob.mockImplementationOnce(async (p, k) => { Object.assign(blobs[1]!, { body: "k1:other", keyVersion: 1, deks: [{ v: 1, wrapped: "w-o" }] }); return get(p, k); });
      expect(await migrateToVault(deps)).toEqual({ rewritten: 0 });
      expect(calls).toEqual(["complete"]);
      expect(deps.getBlob).not.toHaveBeenCalledWith("p1", "citations");
      expect(blobs[0]!.body).toBe("k1:sealed");
      expect(blobs[1]!.body).toBe("k1:other");
    });

    it("409 dek-exists on a blob's rewrite (another tab gave it a key first): the blob is read again and sealed under that key", async () => {
      const blobs = [plainBlob("p1", "citations", [])];
      const { deps, calls } = fakeServer([], blobs, ["p1"]);
      const rewrite = deps.rewriteBlob.getMockImplementation()!;
      deps.rewriteBlob.mockImplementationOnce(async (p, k, body) => { blobs[0]!.deks.push({ v: 1, wrapped: "w-other" }); return rewrite(p, k, body); });
      expect(await migrateToVault(deps)).toEqual({ rewritten: 1 });
      expect(calls).toEqual(["blob p1:citations", "blob p1:citations", "complete"]);
      expect(deps.rewriteBlob.mock.calls[1]).toEqual(["p1", "citations", { body: "k1:[]", keyVersion: 1 }]);
      expect(blobs[0]).toMatchObject({ keyVersion: 1, deks: [{ v: 1, wrapped: "w-other" }] });
      expect(deps.encrypt.mock.calls.map(([d]) => d.deks)).toEqual([[], [{ v: 1, wrapped: "w-other" }]]);
    });

    it("a project gone from the list (deleted meanwhile, not-found) is skipped; any other blob failure stops the run", async () => {
      const blobs = [plainBlob("p2", "ap_cols", ["A"])];
      const { deps, calls } = fakeServer([], blobs, ["gone", "p2"]);
      const list = deps.listBlobs.getMockImplementation()!;
      deps.listBlobs.mockImplementation(async (p) => { if (p === "gone") throw refused("not-found"); return list(p); });
      expect(await migrateToVault(deps)).toEqual({ rewritten: 1 });
      expect(calls).toEqual(["blob p2:ap_cols", "complete"]);

      // Gone between its listing and the read of a blob: skipped too.
      const late = fakeServer([], [plainBlob("p1", "ap_cols", []), plainBlob("p2", "ap_cols", [])], ["p1", "p2"]);
      const get = late.deps.getBlob.getMockImplementation()!;
      late.deps.getBlob.mockImplementation(async (p, k) => { if (p === "p1") throw refused("not-found"); return get(p, k); });
      late.deps.complete.mockResolvedValue(undefined);
      expect(await migrateToVault(late.deps)).toEqual({ rewritten: 1 });
      expect(late.calls).toEqual(["blob p2:ap_cols"]);

      const failing = fakeServer([], [plainBlob("p1", "ap_cols", [])], ["p1"]);
      failing.deps.rewriteBlob.mockRejectedValueOnce(refused("too-large"));
      await expect(migrateToVault(failing.deps)).rejects.toMatchObject({ code: "too-large" });
      expect(failing.deps.complete).not.toHaveBeenCalled();
    });

    it("complete answered plaintext-remains because of a late plaintext blob: one more pass seals it", async () => {
      const blobs: Blob[] = [];
      const { deps, calls } = fakeServer([], blobs, ["p1"]);
      const complete = deps.complete.getMockImplementation()!;
      deps.complete.mockImplementationOnce(async () => { blobs.push(plainBlob("p1", "rs_prefs", { rank: false })); return complete(); });
      expect(await migrateToVault(deps)).toEqual({ rewritten: 1 });
      expect(calls).toEqual(["complete", "blob p1:rs_prefs", "complete"]);
      expect(blobs[0]!.keyVersion).toBe(1);
    });
  });
});
