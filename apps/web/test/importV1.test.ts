import { describe, expect, it, vi } from "vitest";
import { importV1Backup, type V1DocumentBody, type V1ImportDeps } from "../lib/import/v1";
import { ImportError } from "../lib/import/parse";
import type { VaultValue, WrappedDek } from "../lib/vault/useVault";

const DEK: WrappedDek = { v: 1, wrapped: "wrapped-dek" };
const backup = (n = 2, extra: Record<string, unknown> = {}) => ({
  exported: "2026-10-12T09:30:00.000Z",
  projectTitle: "Sleep and memory (imported from v1)",
  documents: Array.from({ length: n }, (_, i) => ({ title: `Doc ${i + 1}`, bodyHtml: `<p>secret words ${i + 1}</p>` })),
  ...extra
});

function deps(over: Partial<V1ImportDeps> = {}) {
  const created: { projectId: string; title: string; body: V1DocumentBody }[] = [];
  const base = {
    createProject: vi.fn(async (_title: string) => ({ id: "p-new" })),
    createDocument: vi.fn(async (projectId: string, title: string, body: V1DocumentBody) => { created.push({ projectId, title, body }); }),
    encrypt: null as VaultValue["encryptBody"] | null,
    yieldToUi: vi.fn(async () => {})
  };
  const d = { ...base, ...over } as typeof base & Pick<V1ImportDeps, "onProgress">;
  return { d, created };
}
// Stands in for the vault: a recognisable "ciphertext", the document's first key only while it has none.
const seal: VaultValue["encryptBody"] = async (doc, html) => ({ bodyHtml: "sealed:" + html.length, keyVersion: 1, ...(doc.deks.length ? {} : { dek: DEK }) });

describe("importV1Backup", () => {
  it("refuses text that is not JSON, and anything that is not a backup, without creating anything", async () => {
    for (const bad of ["nope", "", "{", "null", "[]", "42", {}, { documents: [] }, { projectTitle: "x", documents: [] }, { projectTitle: "x", documents: [{ title: "a" }] }, { projectTitle: "x", documents: "no" }]) {
      const { d } = deps();
      await expect(importV1Backup(bad, {}, d)).rejects.toBeInstanceOf(ImportError);
      expect(d.createProject).not.toHaveBeenCalled();
      expect(d.createDocument).not.toHaveBeenCalled();
    }
  });

  it("reads JSON text as well as an already parsed backup", async () => {
    const { d } = deps();
    expect(await importV1Backup(JSON.stringify(backup(2)), {}, d)).toEqual({ projectId: "p-new", imported: 2 });
  });

  it("creates a project and imports every document into it, sanitised, in the vault-off plaintext shape", async () => {
    const { d, created } = deps();
    const b = backup(2);
    b.documents[0]!.bodyHtml = '<p>ok</p><img src="x" onerror="fetch(1)"><script>alert(1)</script>';
    b.documents[1]!.title = "   ";
    expect(await importV1Backup(b, {}, d)).toEqual({ projectId: "p-new", imported: 2 });
    expect(d.createProject).toHaveBeenCalledExactlyOnceWith("Sleep and memory (imported from v1)");
    expect(created.map((c) => c.projectId)).toEqual(["p-new", "p-new"]);
    expect(created.map((c) => c.title)).toEqual(["Doc 1", "Untitled"]);
    expect(created[0]!.body).toEqual({ bodyHtml: "<p>ok</p><img>", keyVersion: 0 });
    expect(JSON.stringify(created)).not.toContain("onerror");
    expect(JSON.stringify(created)).not.toContain("<script");
  });

  it("adds to an existing project when given its id, and never creates another", async () => {
    const { d, created } = deps();
    expect(await importV1Backup(backup(1), { projectId: "p-old" }, d)).toEqual({ projectId: "p-old", imported: 1 });
    expect(d.createProject).not.toHaveBeenCalled();
    expect(created[0]!.projectId).toBe("p-old");
  });

  it("takes the new project's title from the target when given, else the backup, else a plain default", async () => {
    let r = deps(); await importV1Backup(backup(1), { projectTitle: "Mine" }, r.d);
    expect(r.d.createProject).toHaveBeenCalledWith("Mine");
    r = deps(); await importV1Backup({ documents: backup(1).documents }, {}, r.d);
    expect(r.d.createProject).toHaveBeenCalledWith("Imported from v1");
  });

  it("with a vault, sends only ciphertext with the counts and the document's first key, sealed under a placeholder id", async () => {
    const encrypt = vi.fn(seal);
    const { d, created } = deps({ encrypt });
    await importV1Backup(backup(2), {}, d);
    expect(encrypt).toHaveBeenCalledTimes(2);
    expect(encrypt.mock.calls[0]![0]).toMatchObject({ deks: [] });
    expect(encrypt.mock.calls[0]![0].id).toMatch(/^new:/);
    expect(encrypt.mock.calls[0]![0].id).not.toBe(encrypt.mock.calls[1]![0].id);
    expect(created[0]!.body).toMatchObject({ keyVersion: 1, dek: DEK, wordCount: 3, bodyHtml: "sealed:" + "<p>secret words 1</p>".length });
    expect(created[0]!.body.originStats).toMatchObject({ typed: 3 });
    expect(JSON.stringify(created)).not.toContain("secret");
  });

  it("lets nothing through in plaintext when the vault refuses: a locked vault stops the import", async () => {
    const { d, created } = deps({ encrypt: vi.fn(async () => { throw new Error("vault-locked"); }) });
    await expect(importV1Backup(backup(3), {}, d)).rejects.toThrow("vault-locked");
    expect(created).toEqual([]);
  });

  it("gives the UI a turn after every 20 documents, not after the last", async () => {
    const seen: number[] = [];
    const { d } = deps();
    d.yieldToUi.mockImplementation(async () => { seen.push(d.createDocument.mock.calls.length); });
    expect(await importV1Backup(backup(45), {}, d)).toEqual({ projectId: "p-new", imported: 45 });
    expect(seen).toEqual([20, 40]);
    const exact = deps(); const s2: number[] = [];
    exact.d.yieldToUi.mockImplementation(async () => { s2.push(exact.d.createDocument.mock.calls.length); });
    await importV1Backup(backup(40), {}, exact.d);
    expect(s2).toEqual([20]);
  });

  it("reports progress, and a failing document stops the import after the ones already stored", async () => {
    const progress: [number, number, string][] = [];
    const { d } = deps({ onProgress: (p) => { progress.push([p.imported, p.total, p.projectId]); } });
    d.createDocument.mockImplementation(async (_p, title) => { if (title === "Doc 3") throw new Error("boom"); });
    await expect(importV1Backup(backup(5), {}, d)).rejects.toThrow("boom");
    expect(progress).toEqual([[0, 5, "p-new"], [1, 5, "p-new"], [2, 5, "p-new"]]);
    expect(d.createDocument).toHaveBeenCalledTimes(3);
  });
});
