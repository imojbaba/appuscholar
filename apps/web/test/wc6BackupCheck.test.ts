import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ apiFetch: vi.fn(async () => { throw new Error("the check must not call the api"); }) }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.apiFetch }));

import { BackupError } from "../lib/help/backup/format";
import { checkBackup } from "../lib/help/backup/checkBackup";
import { lockBackup } from "../lib/help/backup/lockedBackup";
import { exportAll, type ExportDeps } from "../lib/vault/export";

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };

const at = "2026-09-08T10:00:00.000Z";
const P = [
  { id: "p1", title: "Sleep study", titleKeyVersion: 0, deks: [], stageMarks: {}, draftWords: 8, draftEditedAt: at, createdAt: at },
  { id: "p2", title: "Reading log", titleKeyVersion: 0, deks: [], stageMarks: {}, draftWords: 0, draftEditedAt: null, createdAt: at }
];
const D = [
  { id: "d1", pid: "p1", title: "Draft one", kind: "draft", bad: false },
  { id: "d2", pid: "p1", title: "Draft two", kind: "draft", bad: false },
  { id: "s1", pid: "p2", title: "A source", kind: "source", bad: false }
];
function deps(opts: { unreadable?: string; badBlob?: boolean } = {}): ExportDeps {
  return {
    listProjects: async () => P,
    listDocuments: async (pid) => D.filter((d) => d.pid === pid).map((d) => ({ id: d.id, title: d.title, titleKeyVersion: 0, deks: [], kind: d.kind, createdAt: at, updatedAt: at, deletedAt: null, wordCount: 3 })),
    getDocument: async (id) => ({ id, bodyHtml: "x", keyVersion: 0, deks: [] }),
    decrypt: async (doc) => {
      if (doc.id === opts.unreadable) { const { VaultError } = await import("../lib/vault/crypto"); throw new VaultError("corrupt"); }
      return `<p>Invented sentence for ${doc.id}.</p>`;
    },
    openTitle: async (t) => ({ state: "open", text: t.title }),
    writingRecordText: async () => "RECORD",
    listBlobs: async () => [{ kind: "idea_intake", keyVersion: 0, updatedAt: at }],
    getBlob: async (_p, kind) => ({ kind, body: "{}", keyVersion: 0, deks: [], updatedAt: at, version: 1 }),
    decryptBlob: async () => {
      if (opts.badBlob) { const { VaultError } = await import("../lib/vault/crypto"); throw new VaultError("corrupt"); }
      return JSON.stringify({ topic: "invented" });
    }
  };
}
const zipBytes = async (o?: Parameters<typeof deps>[0]) => new Uint8Array(await (await exportAll(deps(o))).arrayBuffer());
async function without(bytes: Uint8Array, path: string) { const z = await JSZip.loadAsync(bytes); z.remove(path); return new Uint8Array(await z.generateAsync({ type: "arraybuffer" })); }
const rejectsWith = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e instanceof BackupError ? e.code : "other:" + String(e); } };

beforeEach(() => { store.clear(); h.apiFetch.mockClear(); });

describe("checkBackup (Task C6)", () => {
  it("reports the counts of a plain zip made by exportAll and says nothing is wrong", async () => {
    const r = await checkBackup(await zipBytes());
    expect(r).toMatchObject({ kind: "plain", ok: true, projects: 2, documents: 3, problems: [] });
    expect(r.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("adds up the word counts index.json carries, as v1's \"about {w} words\" (3 documents of 3 words)", async () => {
    expect((await checkBackup(await zipBytes())).words).toBe(9);
  });

  it("opens a locked file with the right passphrase and reports the same counts, kind locked", async () => {
    const locked = await lockBackup(await zipBytes(), "a long enough passphrase");
    expect(await checkBackup(locked, "a long enough passphrase")).toMatchObject({ kind: "locked", ok: true, projects: 2, documents: 3, problems: [] });
  });

  it("a wrong passphrase rejects with wrong-passphrase, and a locked file without one with passphrase-needed", async () => {
    const locked = await lockBackup(await zipBytes(), "a long enough passphrase");
    expect(await rejectsWith(checkBackup(locked, "not the passphrase!!"))).toBe("wrong-passphrase");
    expect(await rejectsWith(checkBackup(locked))).toBe("passphrase-needed");
  });

  it("flags a listed file that is missing from the zip", async () => {
    const r = await checkBackup(await without(await zipBytes(), "Sleep study/Draft two.html"));
    expect(r.ok).toBe(false);
    expect(r.problems).toEqual(["missing:Sleep study/Draft two.html"]);
    expect(r.documents).toBe(3);
  });

  it("flags a missing stage-data file and a missing writing-process record", async () => {
    const bytes = await zipBytes();
    const r1 = await checkBackup(await without(bytes, "Reading log/stage-data/idea_intake.json"));
    expect(r1.problems).toEqual(["missing:Reading log/stage-data/idea_intake.json"]);
    const r2 = await checkBackup(await without(bytes, "writing-process-record.txt"));
    expect(r2.problems).toEqual(["missing:writing-process-record.txt"]);
  });

  it("lists a document that was already unreadable when the backup was made, under its project", async () => {
    const r = await checkBackup(await zipBytes({ unreadable: "d2" }));
    expect(r.ok).toBe(false);
    expect(r.documents).toBe(2);
    expect(r.problems).toEqual(["unreadable:Sleep study/Draft two"]);
  });

  it("lists stage data that was unreadable when the backup was made once per project, by project not by internal kind, and does not record a check", async () => {
    const r = await checkBackup(await zipBytes({ badBlob: true }), undefined, "u1");
    expect(r.ok).toBe(false);
    expect(r.documents).toBe(3);
    expect(r.problems).toEqual(["unreadable-stage:Sleep study", "unreadable-stage:Reading log"]);
    expect([...store.keys()].some((k) => k.startsWith("appu_last_verify"))).toBe(false);
  });

  it("a saved date that is not a date is left out, not shown as NaN", async () => {
    const z = await JSZip.loadAsync(await zipBytes());
    const idx = JSON.parse(await z.file("index.json")!.async("string"));
    z.file("index.json", JSON.stringify({ ...idx, exportedAt: "last tuesday-ish" }));
    expect((await checkBackup(new Uint8Array(await z.generateAsync({ type: "arraybuffer" })))).exportedAt).toBeNull();
  });

  it("rejects a non-zip, a zip without index.json, and a zip with a broken index.json as not-a-backup", async () => {
    expect(await rejectsWith(checkBackup(new TextEncoder().encode("just some words")))).toBe("not-a-backup");
    expect(await rejectsWith(checkBackup(await without(await zipBytes(), "index.json")))).toBe("not-a-backup");
    const z = await JSZip.loadAsync(await zipBytes());
    z.file("index.json", "{not json");
    expect(await rejectsWith(checkBackup(new Uint8Array(await z.generateAsync({ type: "arraybuffer" }))))).toBe("not-a-backup");
    z.file("index.json", JSON.stringify({ hello: 1 }));
    expect(await rejectsWith(checkBackup(new Uint8Array(await z.generateAsync({ type: "arraybuffer" }))))).toBe("not-a-backup");
  });

  it("a locked file whose inside is not a zip is not-a-backup", async () => {
    const locked = await lockBackup(new TextEncoder().encode("not a zip at all"), "a long enough passphrase");
    expect(await rejectsWith(checkBackup(locked, "a long enough passphrase"))).toBe("not-a-backup");
  });

  it("records appu_last_verify_<user id> on success only, and nothing when it is not told who is asking", async () => {
    await rejectsWith(checkBackup(new TextEncoder().encode("nope"), undefined, "u1"));
    expect(store.size).toBe(0);
    await checkBackup(await zipBytes(), undefined, "u1");
    expect([...store.keys()]).toEqual(["appu_last_verify_u1"]);
    expect(Number(store.get("appu_last_verify_u1"))).toBeGreaterThan(0);
    store.clear();
    await checkBackup(await zipBytes());
    await checkBackup(await zipBytes(), undefined, null);
    expect(store.size).toBe(0);
  });

  it("never calls the api or the network", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      await checkBackup(await zipBytes());
      await rejectsWith(checkBackup(new TextEncoder().encode("nope")));
    } finally { vi.unstubAllGlobals(); }
    expect(h.apiFetch).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
