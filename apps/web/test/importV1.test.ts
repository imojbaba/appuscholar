import { describe, expect, it, vi } from "vitest";
import { importV1Backup, type V1DocumentBody, type V1ImportDeps } from "../lib/import/v1";
import { ImportError } from "../lib/import/parse";
import type { VaultValue, WrappedDek } from "../lib/vault/useVault";
import type { TitleFields } from "../lib/vault/titles";

const DEK: WrappedDek = { v: 1, wrapped: "wrapped-dek" };
const backup = (n = 2, extra: Record<string, unknown> = {}) => ({
  exported: "2026-10-12T09:30:00.000Z",
  projectTitle: "Sleep and memory (imported from v1)",
  documents: Array.from({ length: n }, (_, i) => ({ title: `Doc ${i + 1}`, bodyHtml: `<p>secret words ${i + 1}</p>` })),
  ...extra
});

function deps(over: Partial<V1ImportDeps> = {}) {
  // `title` is the title as sent (ciphertext under a vault); `sent` is the whole title fields.
  const created: { projectId: string; title: string; sent: TitleFields; body: V1DocumentBody; kind: "draft" | "source" }[] = [];
  const base = {
    createProject: vi.fn(async (_title: TitleFields) => ({ id: "p-new" })),
    createDocument: vi.fn(async (projectId: string, title: TitleFields, body: V1DocumentBody, kind: "draft" | "source") => { created.push({ projectId, title: title.title, sent: title, body, kind }); }),
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
    expect(d.createProject).toHaveBeenCalledExactlyOnceWith({ title: "Sleep and memory (imported from v1)", titleKeyVersion: 0 });
    expect(created.map((c) => c.projectId)).toEqual(["p-new", "p-new"]);
    expect(created.map((c) => c.title)).toEqual(["Doc 1", "Untitled"]);
    expect(created[0]!.body).toEqual({ bodyHtml: "<p>ok</p><img>", keyVersion: 0 });
    expect(JSON.stringify(created)).not.toContain("onerror");
    expect(JSON.stringify(created)).not.toContain("<script");
  });

  // D-W0-4, approved by OJ 2026-10-19: a paper v1 marked as a source (origin "source", index.html 3230) is saved as a source, so the
  // writing record leaves it out of the student's counts as v1's provScan did (3428); every other document stays a draft.
  it("saves a v1 source paper as a source and every other document as a draft", async () => {
    const { d, created } = deps();
    const b = backup(3);
    Object.assign(b.documents[1]!, { origin: "source", src: "Walker 2017.pdf" });
    Object.assign(b.documents[2]!, { origin: "something else" });
    await importV1Backup(b, {}, d);
    expect(created.map((c) => [c.title, c.kind])).toEqual([["Doc 1", "draft"], ["Doc 2", "source"], ["Doc 3", "draft"]]);
  });

  it("reads a source mark from JSON text too, and ignores an origin that is not a string", async () => {
    const { d, created } = deps();
    const b = backup(2);
    Object.assign(b.documents[0]!, { origin: "source" });
    Object.assign(b.documents[1]!, { origin: 1 });
    await importV1Backup(JSON.stringify(b), {}, d);
    expect(created.map((c) => c.kind)).toEqual(["source", "draft"]);
  });

  it("adds to an existing project when given its id, and never creates another", async () => {
    const { d, created } = deps();
    expect(await importV1Backup(backup(1), { projectId: "p-old" }, d)).toEqual({ projectId: "p-old", imported: 1 });
    expect(d.createProject).not.toHaveBeenCalled();
    expect(created[0]!.projectId).toBe("p-old");
  });

  it("takes the new project's title from the target when given, else the backup, else a plain default", async () => {
    let r = deps(); await importV1Backup(backup(1), { projectTitle: "Mine" }, r.d);
    expect(r.d.createProject).toHaveBeenCalledWith({ title: "Mine", titleKeyVersion: 0 });
    r = deps(); await importV1Backup({ documents: backup(1).documents }, {}, r.d);
    expect(r.d.createProject).toHaveBeenCalledWith({ title: "Imported from v1", titleKeyVersion: 0 });
  });

  it("with a vault, sends only ciphertext with the counts and the document's first key, sealed under a placeholder id", async () => {
    const encrypt = vi.fn(seal);
    const { d, created } = deps({ encrypt });
    await importV1Backup(backup(2), {}, d);
    // The bodies (the titles are sealed too: see "a v1 backup import ... sends sealed titles").
    const bodies = encrypt.mock.calls.filter((c) => c[1].startsWith("<p>"));
    expect(bodies).toHaveLength(2);
    expect(bodies[0]![0]).toMatchObject({ deks: [] });
    expect(bodies[0]![0].id).toMatch(/^new:/);
    expect(bodies[0]![0].id).not.toBe(bodies[1]![0].id);
    expect(created[0]!.body).toMatchObject({ keyVersion: 1, dek: DEK, wordCount: 3, bodyHtml: "sealed:" + "<p>secret words 1</p>".length });
    expect(created[0]!.body.originStats).toMatchObject({ typed: 3 });
    expect(JSON.stringify(created)).not.toContain("secret");
  });

  it("a v1 backup import and an imported PDF send sealed titles: the project's with its own dek, each document's under its body's dek", async () => {
    const encrypt = vi.fn(seal);
    const { d, created } = deps({ encrypt });
    await importV1Backup(backup(2), {}, d);
    // The project's title: under a placeholder project key id, with the dek it made (the project has none yet).
    const projectCall = encrypt.mock.calls.find((c) => c[0].id.startsWith("project:new:"))!;
    expect(projectCall[1]).toBe("Sleep and memory (imported from v1)");
    expect(d.createProject).toHaveBeenCalledExactlyOnceWith({ title: "sealed:" + "Sleep and memory (imported from v1)".length, titleKeyVersion: 1, dek: DEK });
    // Each document's title: under the same placeholder as its body, with the body's dek (one dek, sent once, with the body).
    const titleCall = encrypt.mock.calls.find((c) => c[1] === "Doc 1")!;
    const bodyCall = encrypt.mock.calls.find((c) => c[1] === "<p>secret words 1</p>")!;
    expect(titleCall[0]).toEqual({ id: bodyCall[0].id, deks: [DEK] });
    expect(created[0]!.sent).toEqual({ title: "sealed:5", titleKeyVersion: 1 });
    expect(JSON.stringify([created, d.createProject.mock.calls])).not.toMatch(/Doc 1|Sleep and memory/);
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
    d.createDocument.mockImplementation(async (_p, title) => { if (title.title === "Doc 3") throw new Error("boom"); });
    await expect(importV1Backup(backup(5), {}, d)).rejects.toThrow("boom");
    expect(progress).toEqual([[0, 5, "p-new"], [1, 5, "p-new"], [2, 5, "p-new"]]);
    expect(d.createDocument).toHaveBeenCalledTimes(3);
  });
});
