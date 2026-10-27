import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.apiFetch }));

import { buildBackupZip, logBackupExport } from "../lib/help/backup/buildZip";
import { lockBackup, unlockBackup } from "../lib/help/backup/lockedBackup";
import { checkBackup } from "../lib/help/backup/checkBackup";

const at = "2026-09-08T10:00:00.000Z";
const SENTENCE = "<p>An invented sentence about sleep.</p>";
const calls: string[] = [];
function api(path: string, init?: RequestInit): Promise<unknown> {
  calls.push((init?.method ?? "GET") + " " + path);
  if (path === "/projects?include=work") return Promise.resolve([{ id: "p1", title: "Sleep study", titleKeyVersion: 0, deks: [], stageMarks: {}, draftWords: 5, draftEditedAt: at, createdAt: at }]);
  if (path === "/projects/p1/documents") return Promise.resolve([{ id: "d1", title: "Draft", titleKeyVersion: 0, deks: [], kind: "draft", createdAt: at, updatedAt: at, deletedAt: null, wordCount: 5 }]);
  if (path === "/documents/d1") return Promise.resolve({ id: "d1", bodyHtml: "ciphertext", keyVersion: 1, deks: [] });
  if (path === "/projects/p1/blobs") return Promise.resolve([{ kind: "idea_intake", keyVersion: 1, updatedAt: at }]);
  if (path === "/projects/p1/blobs/idea_intake") return Promise.resolve({ kind: "idea_intake", body: "blobcipher", keyVersion: 1, deks: [], updatedAt: at, version: 1 });
  if (path.endsWith("/writing-record")) return Promise.resolve({ docs: [], sources: [], weekly: [], aiLog: { byKind: {}, byService: {}, total: 0, firstAt: null, lastAt: null, loggingOff: false } });
  if (path === "/projects/scratch/documents" || path === "/projects/scratch/blobs") return Promise.resolve([]);
  if (path === "/me/export-audit") return Promise.resolve(undefined);
  return Promise.reject(new Error("unexpected " + path));
}
const vault = (over: Record<string, unknown> = {}) => ({
  known: vi.fn(async () => "off"), ensureUnlocked: vi.fn(async () => true),
  decryptBody: vi.fn(async (d: { id: string }) => (d.id === "d1" ? SENTENCE : JSON.stringify({ topic: "invented" }))), ...over
}) as never;
const input = (v = vault()) => ({ vault: v, scratchProjectId: "scratch" as string | null, scratchTitle: "Scratch space", day: "2026-10-24" });

beforeEach(() => { calls.length = 0; h.apiFetch.mockReset(); h.apiFetch.mockImplementation(api); });

describe("buildBackupZip: the same zip Help's Export all my work makes (Task C6)", () => {
  it("reads the same endpoints, in the same order, as Help's exportWork, and adds the scratch space", async () => {
    const blob = await buildBackupZip(input());
    expect(blob).not.toBeNull();
    expect(calls[0]).toBe("GET /projects?include=work");
    for (const c of ["GET /projects/p1/documents", "GET /documents/d1", "GET /projects/p1/blobs", "GET /projects/p1/blobs/idea_intake", "GET /projects/p1/writing-record", "GET /projects/scratch/documents"]) expect(calls, c).toContain(c);
    // The audit is a separate step, as in exportWork: after the zip is built, before it is saved.
    expect(calls).not.toContain("POST /me/export-audit");
  });

  it("the zip is exportAll's: folders with html and doc, stage data, the record and a format 2 index, decrypted in the browser", async () => {
    const zip = await JSZip.loadAsync(await (await buildBackupZip(input()))!.arrayBuffer());
    expect(await zip.file("Sleep study/Draft.html")!.async("string")).toContain(SENTENCE);
    expect(zip.file("Sleep study/Draft.doc")).not.toBeNull();
    expect(JSON.parse(await zip.file("Sleep study/stage-data/idea_intake.json")!.async("string"))).toEqual({ topic: "invented" });
    expect(await zip.file("writing-process-record.txt")!.async("string")).toContain("2026-10-24");
    const index = JSON.parse(await zip.file("index.json")!.async("string"));
    expect(index.format).toBe(2);
    expect(index.projects.map((p: { title: string }) => p.title)).toEqual(["Sleep study", "Scratch space"]);
  });

  it("with the vault locked and the unlock refused it builds nothing and calls no endpoint", async () => {
    const v = vault({ known: vi.fn(async () => "locked"), ensureUnlocked: vi.fn(async () => false) });
    expect(await buildBackupZip(input(v))).toBeNull();
    expect(calls).toEqual([]);
  });

  it("with the vault on, it unlocks first", async () => {
    const v = vault({ known: vi.fn(async () => "locked") });
    expect(await buildBackupZip(input(v))).not.toBeNull();
    expect((v as { ensureUnlocked: ReturnType<typeof vi.fn> }).ensureUnlocked).toHaveBeenCalled();
  });

  it("locked and then checked: the plaintext never appears in the locked bytes and the check reads it back", async () => {
    const plain = new Uint8Array(await (await buildBackupZip(input()))!.arrayBuffer());
    const locked = await lockBackup(plain, "a passphrase of length");
    expect(new TextDecoder("latin1").decode(locked)).not.toContain("invented sentence");
    expect(await unlockBackup(locked, "a passphrase of length")).toEqual(plain);
    expect(await checkBackup(locked, "a passphrase of length")).toMatchObject({ kind: "locked", ok: true, projects: 2, documents: 1 });
  });

  it("logBackupExport posts the same audit entry as the plain export", async () => {
    await logBackupExport();
    expect(calls).toContain("POST /me/export-audit");
  });
});
