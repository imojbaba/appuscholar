import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import { VaultError } from "../lib/vault/crypto";
import { exportAll, exportFileName, type ExportDeps } from "../lib/vault/export";

type Doc = { id: string; projectId: string; title: string; kind: string; createdAt: string; updatedAt: string; deletedAt: string | null; wordCount: number };
const P = [
  { id: "p1", title: "P1", stage: "writing", createdAt: "2026-09-01T10:00:00.000Z" },
  { id: "p2", title: "P2", stage: "reading", createdAt: "2026-09-02T10:00:00.000Z" }
];
const D: Doc[] = [
  { id: "d1", projectId: "p1", title: "D1", kind: "draft", createdAt: "2026-09-03T10:00:00.000Z", updatedAt: "2026-09-04T10:00:00.000Z", deletedAt: null, wordCount: 5 },
  { id: "d2", projectId: "p1", title: "D2", kind: "draft", createdAt: "2026-09-03T10:00:00.000Z", updatedAt: "2026-09-05T10:00:00.000Z", deletedAt: null, wordCount: 3 },
  { id: "s1", projectId: "p2", title: "S", kind: "source", createdAt: "2026-09-06T10:00:00.000Z", updatedAt: "2026-09-06T10:00:00.000Z", deletedAt: null, wordCount: 4 },
  { id: "gone", projectId: "p2", title: "Gone", kind: "draft", createdAt: "2026-09-06T10:00:00.000Z", updatedAt: "2026-09-06T10:00:00.000Z", deletedAt: "2026-09-07T10:00:00.000Z", wordCount: 1 }
];
const SECRET: Record<string, string> = { d1: "<p>The first sentence of D1.</p>", d2: "<p>Second draft.</p>", s1: "<p>A source paper.</p>", gone: "<p>Deleted.</p>" };

function deps(): ExportDeps & { decrypt: ReturnType<typeof vi.fn>; getDocument: ReturnType<typeof vi.fn> } {
  return {
    listProjects: async () => P,
    listDocuments: async (projectId: string) => D.filter((d) => d.projectId === projectId),
    // The server holds ciphertext only; decrypt turns it back into the student's text in the browser.
    getDocument: vi.fn(async (id: string) => ({ ...D.find((d) => d.id === id)!, bodyHtml: "ct:" + id, keyVersion: 1, deks: [{ v: 1, wrapped: "w" }] })),
    decrypt: vi.fn(async (doc: { id: string; bodyHtml: string }) => { expect(doc.bodyHtml).toBe("ct:" + doc.id); return SECRET[doc.id]!; }),
    writingRecordText: async () => "WRITING-PROCESS RECORD (test)"
  };
}

describe("exportAll", () => {
  it("export zips every document decrypted, plus the record and index", async () => {
    const d = deps();
    const blob = await exportAll(d);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const names = Object.keys(zip.files).filter((n) => !zip.files[n]!.dir).sort();
    expect(names).toEqual([
      "P1/D1.doc", "P1/D1.html", "P1/D2.doc", "P1/D2.html",
      "P2/sources/S.doc", "P2/sources/S.html",
      "index.json", "writing-process-record.txt"
    ]);
    // Decrypted in the browser: the html and the Word file carry the student's sentence, never the ciphertext.
    const html = await zip.file("P1/D1.html")!.async("string");
    expect(html).toContain("The first sentence of D1.");
    expect(html).not.toContain("ct:d1");
    expect(await zip.file("P1/D1.doc")!.async("string")).toContain("The first sentence of D1.");
    expect(await zip.file("P2/sources/S.html")!.async("string")).toContain("A source paper.");
    expect(await zip.file("writing-process-record.txt")!.async("string")).toBe("WRITING-PROCESS RECORD (test)");
    // The deleted document is left out, and never fetched or decrypted.
    expect(d.getDocument).not.toHaveBeenCalledWith("gone");
    expect(names.some((n) => n.includes("Gone"))).toBe(false);
    const index = JSON.parse(await zip.file("index.json")!.async("string")) as {
      projects: { title: string; stage: string; createdAt: string; documents: { title: string; kind: string; createdAt: string; updatedAt: string; html: string; doc: string }[] }[];
    };
    expect(index.projects.map((p) => [p.title, p.stage, p.createdAt])).toEqual([["P1", "writing", P[0]!.createdAt], ["P2", "reading", P[1]!.createdAt]]);
    expect(index.projects[0]!.documents.map((x) => x.title)).toEqual(["D1", "D2"]);
    expect(index.projects[1]!.documents).toEqual([
      { title: "S", kind: "source", createdAt: D[2]!.createdAt, updatedAt: D[2]!.updatedAt, wordCount: 4, html: "P2/sources/S.html", doc: "P2/sources/S.doc" }
    ]);
  });

  it("two documents with the same title, or a title with unsafe characters, still get their own file", async () => {
    const d = deps();
    d.listProjects = async () => [{ id: "p1", title: "My/Thesis: one", stage: "writing", createdAt: "2026-09-01T10:00:00.000Z" }];
    d.listDocuments = async () => [{ ...D[0]!, title: "Chapter" }, { ...D[1]!, title: "Chapter" }];
    const zip = await JSZip.loadAsync(await (await exportAll(d)).arrayBuffer());
    const names = Object.keys(zip.files).filter((n) => !zip.files[n]!.dir).sort();
    expect(names).toEqual(["MyThesis one/Chapter (2).doc", "MyThesis one/Chapter (2).html", "MyThesis one/Chapter.doc", "MyThesis one/Chapter.html", "index.json", "writing-process-record.txt"]);
  });

  it("a document that will not decrypt is listed as unreadable and the rest still export; a locked vault rejects", async () => {
    const d = deps();
    d.decrypt.mockImplementation(async (doc: { id: string }) => { if (doc.id === "d2") throw new VaultError("corrupt"); return SECRET[doc.id]!; });
    const zip = await JSZip.loadAsync(await (await exportAll(d)).arrayBuffer());
    expect(zip.file("P1/D1.html")).not.toBeNull();
    expect(zip.file("P1/D2.html")).toBeNull();
    const index = JSON.parse(await zip.file("index.json")!.async("string")) as { projects: { documents: { title: string; unreadable?: boolean; html?: string }[] }[] };
    expect(index.projects[0]!.documents[1]).toMatchObject({ title: "D2", unreadable: true });
    expect(index.projects[0]!.documents[1]!.html).toBeUndefined();
    d.decrypt.mockRejectedValue(new Error("vault-locked"));
    await expect(exportAll(d)).rejects.toThrow("vault-locked");
  });

  it("names the file appuscholar-export-YYYY-MM-DD.zip", () => {
    expect(exportFileName(new Date(2026, 9, 6))).toBe("appuscholar-export-2026-10-06.zip");
  });
});
