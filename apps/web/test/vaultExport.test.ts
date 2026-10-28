import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import { VaultError } from "../lib/vault/crypto";
import { exportAll, exportFileName, zipName, type ExportDeps } from "../lib/vault/export";
import { projectKeyId, type OpenedTitle, type Titled } from "../lib/vault/titles";
import hi from "../messages/hi.json";

type Doc = { id: string; projectId: string; title: string; titleKeyVersion: number; deks: { v: number; wrapped: string }[]; kind: string; createdAt: string; updatedAt: string; deletedAt: string | null; wordCount: number };
const P = [
  { id: "p1", title: "P1", titleKeyVersion: 0, deks: [], stageMarks: {}, draftWords: 8, draftEditedAt: "2026-09-05T10:00:00.000Z", createdAt: "2026-09-01T10:00:00.000Z" },
  { id: "p2", title: "P2", titleKeyVersion: 0, deks: [], stageMarks: { idea: { readyAt: "2026-09-01T00:00:00.000Z" } }, draftWords: 0, draftEditedAt: null, createdAt: "2026-09-02T10:00:00.000Z" }
];
const D: Doc[] = [
  { id: "d1", projectId: "p1", title: "D1", titleKeyVersion: 0, deks: [], kind: "draft", createdAt: "2026-09-03T10:00:00.000Z", updatedAt: "2026-09-04T10:00:00.000Z", deletedAt: null, wordCount: 5 },
  { id: "d2", projectId: "p1", title: "D2", titleKeyVersion: 0, deks: [], kind: "draft", createdAt: "2026-09-03T10:00:00.000Z", updatedAt: "2026-09-05T10:00:00.000Z", deletedAt: null, wordCount: 3 },
  { id: "s1", projectId: "p2", title: "S", titleKeyVersion: 0, deks: [], kind: "source", createdAt: "2026-09-06T10:00:00.000Z", updatedAt: "2026-09-06T10:00:00.000Z", deletedAt: null, wordCount: 4 },
  { id: "gone", projectId: "p2", title: "Gone", titleKeyVersion: 0, deks: [], kind: "draft", createdAt: "2026-09-06T10:00:00.000Z", updatedAt: "2026-09-06T10:00:00.000Z", deletedAt: "2026-09-07T10:00:00.000Z", wordCount: 1 }
];
const SECRET: Record<string, string> = { d1: "<p>The first sentence of D1.</p>", d2: "<p>Second draft.</p>", s1: "<p>A source paper.</p>", gone: "<p>Deleted.</p>" };

const at = "2026-09-08T10:00:00.000Z";
const BLOBS: Record<string, { kind: string; updatedAt: string; text: string }[]> = {
  p1: [
    { kind: "idea_intake", updatedAt: at, text: JSON.stringify({ topic: "Sleep and exam anxiety" }) },
    { kind: "citations", updatedAt: at, text: JSON.stringify([{ id: "c1" }]) },
    { kind: "shelf_index", updatedAt: at, text: JSON.stringify([{ id: "p1" }]) },
    { kind: "shelf_paper:p1", updatedAt: at, text: JSON.stringify({ id: "p1", name: "Paper" }) },
    { kind: "ap_notes", updatedAt: at, text: JSON.stringify({}) },
    { kind: "refcheck_cache", updatedAt: at, text: JSON.stringify({}) }
  ],
  p2: [{ kind: "rs_prefs", updatedAt: at, text: JSON.stringify({ sort: "year" }) }]
};

/** Opens a title the way the vault does: "ct:<text>" under the key id it was sealed for (`for` names it), anything else does not open. */
const sealedFor = new Map<string, string>();
async function fakeOpenTitle(t: Titled, keyId: string): Promise<OpenedTitle> {
  if (t.titleKeyVersion === 0) return { state: "open", text: t.title };
  if (t.title === "locked") return { state: "locked" };
  return t.title.startsWith("ct:") && sealedFor.get(t.title) === keyId ? { state: "open", text: t.title.slice(3) } : { state: "unreadable" };
}

function deps(): ExportDeps & { decrypt: ReturnType<typeof vi.fn>; getDocument: ReturnType<typeof vi.fn>; listBlobs: ReturnType<typeof vi.fn>; getBlob: ReturnType<typeof vi.fn>; decryptBlob: ReturnType<typeof vi.fn> } {
  return {
    listProjects: async () => P,
    listDocuments: async (projectId: string) => D.filter((d) => d.projectId === projectId),
    // The server holds ciphertext only; decrypt turns it back into the student's text in the browser.
    getDocument: vi.fn(async (id: string) => ({ ...D.find((d) => d.id === id)!, bodyHtml: "ct:" + id, keyVersion: 1, deks: [{ v: 1, wrapped: "w" }] })),
    decrypt: vi.fn(async (doc: { id: string; bodyHtml: string }) => { expect(doc.bodyHtml).toBe("ct:" + doc.id); return SECRET[doc.id]!; }),
    openTitle: vi.fn(fakeOpenTitle),
    writingRecordText: async () => "WRITING-PROCESS RECORD (test)",
    listBlobs: vi.fn(async (projectId: string) => (BLOBS[projectId] ?? []).map((b) => ({ kind: b.kind, keyVersion: 1, updatedAt: b.updatedAt }))),
    getBlob: vi.fn(async (projectId: string, kind: string) => {
      const b = (BLOBS[projectId] ?? []).find((x) => x.kind === kind)!;
      return { kind, body: `ct:blob:${projectId}:${kind}`, keyVersion: 1, deks: [{ v: 1, wrapped: "w" }], updatedAt: b.updatedAt, version: 2 };
    }),
    // Opens a blob the way the vault does: only for the blob it was sealed for.
    decryptBlob: vi.fn(async (projectId: string, w: { kind: string; body: string }) => { expect(w.body).toBe(`ct:blob:${projectId}:${w.kind}`); return (BLOBS[projectId] ?? []).find((x) => x.kind === w.kind)!.text; })
  };
}

describe("exportAll", () => {
  it("export zips every document decrypted, plus the record and index", async () => {
    const d = deps();
    const blob = await exportAll(d);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const names = Object.keys(zip.files).filter((n) => !zip.files[n]!.dir && !n.includes("/stage-data/")).sort();
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
      format: number;
      projects: { title: string; createdAt: string; documents: { title: string; kind: string; createdAt: string; updatedAt: string; html: string; doc: string }[] }[];
    };
    expect(index.format).toBe(2);
    expect(index.projects.map((p) => [p.title, p.createdAt])).toEqual([["P1", P[0]!.createdAt], ["P2", P[1]!.createdAt]]);
    expect(index.projects[0]!.documents.map((x) => x.title)).toEqual(["D1", "D2"]);
    expect(index.projects[1]!.documents).toEqual([
      { title: "S", kind: "source", createdAt: D[2]!.createdAt, updatedAt: D[2]!.updatedAt, wordCount: 4, html: "P2/sources/S.html", doc: "P2/sources/S.doc" }
    ]);
  });

  it("export adds every stage blob of every project, decrypted, under stage-data", async () => {
    const zip = await JSZip.loadAsync(await (await exportAll(deps())).arrayBuffer());
    const names = Object.keys(zip.files).filter((n) => !zip.files[n]!.dir);
    expect(names).toEqual(expect.arrayContaining(["P1/stage-data/idea_intake.json", "P1/stage-data/citations.json", "P1/stage-data/shelf_index.json",
      "P1/stage-data/shelf_paper-p1.json", "P1/stage-data/ap_notes.json", "P1/stage-data/refcheck_cache.json", "P2/stage-data/rs_prefs.json"]));
    const text = await zip.file("P1/stage-data/idea_intake.json")!.async("string");
    expect(JSON.parse(text).topic).toBe("Sleep and exam anxiety");
    expect(text).toBe(JSON.stringify({ topic: "Sleep and exam anxiety" }, null, 2) + "\n");
    expect(text).not.toContain("ct:blob");
  });

  it("decryptBlob gets the ciphertext from the api for blob:<projectId>:<kind>", async () => {
    const d = deps();
    await exportAll(d);
    expect(d.getBlob).toHaveBeenCalledWith("p1", "shelf_paper:p1");
    expect(d.decryptBlob).toHaveBeenCalledWith("p1", expect.objectContaining({ kind: "idea_intake", body: "ct:blob:p1:idea_intake", keyVersion: 1 }));
    expect(d.decryptBlob).toHaveBeenCalledWith("p2", expect.objectContaining({ kind: "rs_prefs", body: "ct:blob:p2:rs_prefs" }));
  });

  it("blobs are read one at a time", async () => {
    const d = deps();
    let open = 0, max = 0;
    const get = d.getBlob.getMockImplementation() as (p: string, k: string) => Promise<unknown>;
    d.getBlob.mockImplementation(async (p: string, k: string) => { open++; max = Math.max(max, open); await new Promise((r) => setTimeout(r, 1)); try { return await get(p, k); } finally { open--; } });
    await exportAll(d);
    expect(max).toBe(1);
  });

  it("a kind the api lists that this build does not know is exported too", async () => {
    const d = deps();
    BLOBS.p2!.push({ kind: "future_kind", updatedAt: at, text: JSON.stringify({ a: 1 }) });
    try {
      const zip = await JSZip.loadAsync(await (await exportAll(d)).arrayBuffer());
      expect(JSON.parse(await zip.file("P2/stage-data/future_kind.json")!.async("string"))).toEqual({ a: 1 });
    } finally { BLOBS.p2!.pop(); }
  });

  it("a plaintext blob (keyVersion 0, vault off) exports as it is", async () => {
    const d = deps();
    d.listBlobs.mockImplementation(async (p: string) => (p === "p2" ? [{ kind: "rs_prefs", keyVersion: 0, updatedAt: at }] : []));
    d.getBlob.mockImplementation(async () => ({ kind: "rs_prefs", body: '{"sort":"year"}', keyVersion: 0, deks: [], updatedAt: at }));
    d.decryptBlob.mockImplementation(async (_p: string, w: { body: string }) => w.body);
    const zip = await JSZip.loadAsync(await (await exportAll(d)).arrayBuffer());
    expect(JSON.parse(await zip.file("P2/stage-data/rs_prefs.json")!.async("string"))).toEqual({ sort: "year" });
  });

  it("a blob that will not open is listed as unreadable and the rest still export", async () => {
    const d = deps();
    const ok = d.decryptBlob.getMockImplementation() as (p: string, w: { kind: string; body: string }) => Promise<string>;
    d.decryptBlob.mockImplementation(async (p: string, w: { kind: string; body: string }) => {
      if (w.kind === "citations") throw new VaultError("corrupt");
      if (w.kind === "ap_notes") return "not json {";
      return ok(p, w);
    });
    const zip = await JSZip.loadAsync(await (await exportAll(d)).arrayBuffer());
    expect(zip.file("P1/stage-data/citations.json")).toBeNull();
    expect(zip.file("P1/stage-data/ap_notes.json")).toBeNull();
    expect(zip.file("P1/stage-data/idea_intake.json")).not.toBeNull();
    expect(zip.file("P2/stage-data/rs_prefs.json")).not.toBeNull();
    const index = JSON.parse(await zip.file("index.json")!.async("string")) as { projects: { stageData: { kind: string; unreadable?: boolean; file?: string }[] }[] };
    const sd = index.projects[0]!.stageData;
    expect(sd.find((s) => s.kind === "citations")).toEqual({ kind: "citations", updatedAt: at, unreadable: true });
    expect(sd.find((s) => s.kind === "ap_notes")).toEqual({ kind: "ap_notes", updatedAt: at, unreadable: true });
    d.decryptBlob.mockRejectedValue(new Error("vault-locked"));
    await expect(exportAll(d)).rejects.toThrow("vault-locked");
  });

  it("the account export lists a blob that is not JSON as unreadable, and rejects on other errors", async () => {
    const d = deps();
    const ok = d.decryptBlob.getMockImplementation() as (p: string, w: { kind: string; body: string }) => Promise<string>;
    d.decryptBlob.mockImplementation(async (p: string, w: { kind: string; body: string }) => (w.kind === "rs_prefs" ? "{ not json" : ok(p, w)));
    const zip = await JSZip.loadAsync(await (await exportAll(d)).arrayBuffer());
    const index = JSON.parse(await zip.file("index.json")!.async("string")) as { projects: { stageData: { kind: string; unreadable?: boolean }[] }[] };
    expect(index.projects[1]!.stageData).toEqual([{ kind: "rs_prefs", updatedAt: at, unreadable: true }]);
    // Only JSON.parse's SyntaxError means "not JSON": one from anywhere else (the api's answer that is not JSON, the vault) rejects.
    const e1 = deps();
    e1.getBlob.mockRejectedValue(new SyntaxError("Unexpected token < in JSON"));
    await expect(exportAll(e1)).rejects.toThrow(SyntaxError);
    const e2 = deps();
    e2.decryptBlob.mockRejectedValue(new SyntaxError("bad key data"));
    await expect(exportAll(e2)).rejects.toThrow("bad key data");
  });

  it("index.json lists each project's stage data with its file and date", async () => {
    const zip = await JSZip.loadAsync(await (await exportAll(deps())).arrayBuffer());
    const index = JSON.parse(await zip.file("index.json")!.async("string")) as { projects: { stageData: unknown[] }[] };
    expect(index.projects[1]!.stageData).toEqual([{ kind: "rs_prefs", file: "P2/stage-data/rs_prefs.json", updatedAt: at }]);
    expect(index.projects[0]!.stageData).toContainEqual({ kind: "shelf_paper:p1", file: "P1/stage-data/shelf_paper-p1.json", updatedAt: at });
    expect(index.projects[0]!.stageData).toHaveLength(6);
  });

  it("the export's index.json carries format 2 and derived stages, no stage", async () => {
    const zip = await JSZip.loadAsync(await (await exportAll(deps())).arrayBuffer());
    const index = JSON.parse(await zip.file("index.json")!.async("string")) as { format: number; projects: Record<string, unknown>[] };
    expect(index.format).toBe(2);
    for (const p of index.projects) expect(p).not.toHaveProperty("stage");
    // P1: an idea and Literature work (the caches are not work) and a draft with words; P2: Idea marked Ready, nothing else but a preference.
    expect(index.projects[0]!.stages).toEqual({ idea: "in-progress", lit: "in-progress", design: "not-started", collect: "not-started", writing: "in-progress", review: "not-started" });
    expect(index.projects[1]!.stages).toEqual({ idea: "ready", lit: "not-started", design: "not-started", collect: "not-started", writing: "not-started", review: "not-started" });
  });

  it("two documents with the same title, or a title with unsafe characters, still get their own file", async () => {
    const d = deps();
    d.listProjects = async () => [{ id: "p1", title: "My/Thesis: one", titleKeyVersion: 0, deks: [], stageMarks: {}, draftWords: 8, draftEditedAt: "2026-09-05T10:00:00.000Z", createdAt: "2026-09-01T10:00:00.000Z" }];
    d.listDocuments = async () => [{ ...D[0]!, title: "Chapter" }, { ...D[1]!, title: "Chapter" }];
    const zip = await JSZip.loadAsync(await (await exportAll(d)).arrayBuffer());
    const names = Object.keys(zip.files).filter((n) => !zip.files[n]!.dir && !n.includes("/stage-data/")).sort();
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

  it("Hindi and accented titles keep their letters in the zip; only path and reserved characters go", async () => {
    const d = deps();
    d.listProjects = async () => [
      { id: "p1", title: "मेरा शोध", titleKeyVersion: 0, deks: [], stageMarks: {}, draftWords: 8, draftEditedAt: "2026-09-05T10:00:00.000Z", createdAt: "2026-09-01T10:00:00.000Z" },
      { id: "p2", title: "Café: notes/2026", titleKeyVersion: 0, deks: [], stageMarks: { idea: { readyAt: "2026-09-01T00:00:00.000Z" } }, draftWords: 0, draftEditedAt: null, createdAt: "2026-09-02T10:00:00.000Z" }
    ];
    d.listDocuments = async (id: string) => id === "p1"
      ? [{ ...D[0]!, title: "पहला अध्याय" }, { ...D[2]!, projectId: "p1", title: "स्रोत पत्र" }]
      : [{ ...D[1]!, projectId: "p2", title: "Résumé?" }];
    const zip = await JSZip.loadAsync(await (await exportAll(d)).arrayBuffer());
    const names = Object.keys(zip.files).filter((n) => !zip.files[n]!.dir && !n.includes("/stage-data/")).sort();
    expect(names).toEqual([
      "Café notes2026/Résumé.doc", "Café notes2026/Résumé.html",
      "index.json", "writing-process-record.txt",
      "मेरा शोध/sources/स्रोत पत्र.doc", "मेरा शोध/sources/स्रोत पत्र.html",
      "मेरा शोध/पहला अध्याय.doc", "मेरा शोध/पहला अध्याय.html"
    ]);
    expect(await zip.file("मेरा शोध/पहला अध्याय.html")!.async("string")).toContain("The first sentence of D1.");
  });

  it("the export's folder names and the Word and LaTeX file names come from the opened titles", async () => {
    const d = deps();
    sealedFor.set("ct:Sleep and exam anxiety", projectKeyId("p1")).set("ct:Chapter one", "d1").set("ct:Opened elsewhere", "someone-else");
    d.listProjects = async () => [
      { ...P[0]!, title: "ct:Sleep and exam anxiety", titleKeyVersion: 1, deks: [{ v: 1, wrapped: "w" }] },
      { ...P[1]!, title: "ct:Opened elsewhere", titleKeyVersion: 1, deks: [{ v: 1, wrapped: "w" }] }
    ];
    d.listDocuments = async (id: string) => id === "p1"
      ? [{ ...D[0]!, title: "ct:Chapter one", titleKeyVersion: 1 }, { ...D[1]!, title: "locked", titleKeyVersion: 1 }]
      : [{ ...D[2]!, title: "ct:Chapter one", titleKeyVersion: 1 }];
    const zip = await JSZip.loadAsync(await (await exportAll(d)).arrayBuffer());
    const names = Object.keys(zip.files).filter((n) => !zip.files[n]!.dir && !n.includes("/stage-data/")).sort();
    // A project's title opens under projectKeyId, a document's under its own id; one that does not open is "untitled".
    expect(names).toEqual([
      "Sleep and exam anxiety/Chapter one.doc", "Sleep and exam anxiety/Chapter one.html", "Sleep and exam anxiety/untitled.doc", "Sleep and exam anxiety/untitled.html",
      "index.json", "untitled/sources/untitled.doc", "untitled/sources/untitled.html", "writing-process-record.txt"
    ]);
    expect(await zip.file("Sleep and exam anxiety/Chapter one.html")!.async("string")).toContain("<title>Chapter one</title>");
    const index = await zip.file("index.json")!.async("string");
    expect(JSON.parse(index).projects.map((p: { title: string }) => p.title)).toEqual(["Sleep and exam anxiety", "untitled"]);
    expect(index).not.toContain("ct:");
  });

  it("zipName keeps letters, marks and digits in any script, and falls back when nothing is left", () => {
    expect(zipName(hi.export_scratch)).toBe(hi.export_scratch);
    expect(zipName("Café")).toBe("Café");
    expect(zipName("a\\b/c:d*e?f\"g<h>i|j")).toBe("abcdefghij");
    expect(zipName("Draft v2...")).toBe("Draft v2");
    expect(zipName("../..")).toBe("appuscholar-document");
    expect(zipName("  ")).toBe("appuscholar-document");
  });

  it("names the file appuscholar-export-YYYY-MM-DD.zip", () => {
    expect(exportFileName(new Date(2026, 9, 6))).toBe("appuscholar-export-2026-10-06.zip");
  });
});
