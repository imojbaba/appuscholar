// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => { throw new Error("not a hook test"); } }));

import { ApiError } from "../lib/api";
import { buildRecapApi, type RecapSource } from "../lib/help/recap/api";

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 24, 12, 0, 0).getTime();
const SINCE = NOW - 8 * DAY;
const iso = (ms: number) => new Date(ms).toISOString();

const doc = (id: string, over: Record<string, unknown> = {}) => ({
  id, projectId: "p1", title: "Draft " + id, titleKeyVersion: 0, deks: [], kind: "draft", currentSeq: 1, wordCount: 100,
  createdAt: iso(SINCE - DAY), updatedAt: iso(SINCE - DAY), ...over
});
const project = (over: Record<string, unknown> = {}) => ({ id: "p1", title: "Sleep and exams", titleKeyVersion: 0, deks: [], field: "psychology", stage: "writing", status: "active", contentLang: "en", kind: "research", ...over });

type Vault = RecapSource["vault"];
const open: Vault = { status: "off", decryptBody: async (d) => d.bodyHtml };
const locked: Vault = { status: "locked", decryptBody: async () => { throw new Error("vault-locked"); } };

function source(over: Partial<RecapSource> = {}): RecapSource {
  const docs = [doc("d1")];
  return {
    uid: "user-a", since: SINCE, now: NOW, loadedAt: NOW - 3000, aiLogOff: false, vault: open,
    shell: { project: project(), projectId: "p1", documents: docs, currentDoc: { ...docs[0]!, bodyHtml: "<p>text</p>", keyVersion: 0 }, wordCount: 420 },
    ...over
  } as RecapSource;
}

beforeEach(() => { h.api.mockReset(); localStorage.clear(); });

describe("recap host's readers (RecapApi from the shell, the vault and the api)", () => {
  it("states the project's title (no stage: v2 reads none), the open document's title, and its live word count", async () => {
    const a = await buildRecapApi(source());
    expect(a.project).toEqual({ name: "Sleep and exams" });
    expect(a.openDoc).toEqual({ title: "Draft d1", words: 420 });
    expect(a.documents).toHaveLength(1);
    expect(a.loadedAt).toBe(NOW - 3000);
  });

  it("falls back to the stored word count until the editor has reported one, and states no open document when there is none", async () => {
    const s = source();
    const a = await buildRecapApi({ ...s, shell: { ...s.shell, wordCount: null } });
    expect(a.openDoc?.words).toBe(100);
    const b = await buildRecapApi({ ...s, shell: { ...s.shell, currentDoc: null } });
    expect(b.openDoc).toBeNull();
  });

  it("opens sealed titles through the vault, and names none while it is locked", async () => {
    const decryptBody = vi.fn(async (d: { bodyHtml: string }) => "opened " + d.bodyHtml);
    const sealed = { project: project({ title: "ciphertext-p", titleKeyVersion: 1, deks: [{ v: 1, wrapped: "w" }] }) };
    const docs = [doc("d1", { title: "ciphertext-d", titleKeyVersion: 1, deks: [{ v: 1, wrapped: "w" }] })];
    const shell = { ...source().shell, ...sealed, documents: docs, currentDoc: { ...docs[0]!, bodyHtml: "", keyVersion: 1 } };
    const a = await buildRecapApi(source({ shell, vault: { status: "unlocked", decryptBody } }));
    expect(a.project?.name).toBe("opened ciphertext-p");
    expect(a.openDoc?.title).toBe("opened ciphertext-d");
    const b = await buildRecapApi(source({ shell, vault: locked }));
    expect(b.project?.name).toBeNull();
    expect(b.openDoc?.title).toBeNull();
    expect(JSON.stringify(b)).not.toContain("ciphertext");
  });

  it("in the scratch space (no project) there is no project line and the AI log is not counted", async () => {
    const a = await buildRecapApi(source({ shell: { ...source().shell, project: null } }));
    expect(a.project).toBeNull();
    expect(a.aiCountable).toBe(false);
    await expect(Promise.resolve(a.documents)).resolves.toHaveLength(1);
  });

  it("the AI log is asked for this project only, from the given day, and is not counted when switched off", async () => {
    h.api.mockResolvedValueOnce([{ d: "2026-10-20" }]);
    const a = await buildRecapApi(source());
    expect(a.aiCountable).toBe(true);
    await expect(a.aiRows("2026-10-17")).resolves.toEqual([{ d: "2026-10-20" }]);
    expect(h.api).toHaveBeenCalledWith("/ai/log?from=2026-10-17&projectId=p1");
    expect((await buildRecapApi(source({ aiLogOff: true }))).aiCountable).toBe(false);
  });

  it("an AI log answer that is not a list is a read that failed", async () => {
    h.api.mockResolvedValueOnce({ error: "x" });
    const a = await buildRecapApi(source());
    await expect(a.aiRows("2026-10-17")).rejects.toThrow();
  });

  it("documents are not read before the project has loaded", async () => {
    const a = await buildRecapApi(source({ shell: { ...source().shell, projectId: null } }));
    expect(a.documents).toBeNull();
  });

  it("test times come from the stats_runs record, plain when the vault is off, opened when it is unlocked", async () => {
    h.api.mockResolvedValueOnce({ kind: "stats_runs", body: JSON.stringify({ r1: run(SINCE + 5), r2: run(SINCE - 5) }), keyVersion: 0, deks: [], updatedAt: iso(NOW) });
    const a = await buildRecapApi(source());
    await expect(a.testTimes()).resolves.toEqual([SINCE + 5, SINCE - 5]);
    expect(h.api).toHaveBeenCalledWith("/projects/p1/blobs/stats_runs");
    h.api.mockResolvedValueOnce({ kind: "stats_runs", body: "ct", keyVersion: 1, deks: [{ v: 1, wrapped: "w" }], updatedAt: iso(NOW) });
    const decryptBody = vi.fn(async () => JSON.stringify({ r1: run(SINCE + 9) }));
    const b = await buildRecapApi(source({ vault: { status: "unlocked", decryptBody } }));
    await expect(b.testTimes()).resolves.toEqual([SINCE + 9]);
    expect(decryptBody).toHaveBeenCalledWith({ id: "blob:p1:stats_runs", deks: [{ v: 1, wrapped: "w" }], bodyHtml: "ct", keyVersion: 1 });
  });

  it("no stats_runs record is no test results (zero), a record that does not open or parse is not countable", async () => {
    h.api.mockRejectedValueOnce(new ApiError(404, "not-found"));
    await expect((await buildRecapApi(source())).testTimes()).resolves.toEqual([]);
    h.api.mockResolvedValueOnce({ kind: "stats_runs", body: "{not json", keyVersion: 0, deks: [], updatedAt: iso(NOW) });
    await expect((await buildRecapApi(source())).testTimes()).resolves.toBeNull();
    h.api.mockRejectedValueOnce(new ApiError(500, "error"));
    await expect((await buildRecapApi(source())).testTimes()).rejects.toThrow();
  });

  it("a locked vault: the stats record is not even fetched and no passphrase is asked for", async () => {
    const ensureUnlocked = vi.fn();
    const a = await buildRecapApi(source({ vault: { ...locked, ensureUnlocked } as unknown as Vault }));
    await expect(a.testTimes()).resolves.toBeNull();
    expect(h.api).not.toHaveBeenCalled();
    expect(ensureUnlocked).not.toHaveBeenCalled();
  });

  it("the last document is the newest of the student's own, never a source; its first words are read from the body", async () => {
    const docs = [
      doc("old", { updatedAt: iso(SINCE - 5 * DAY) }),
      doc("src", { kind: "source", updatedAt: iso(SINCE + 1000) }),
      doc("new", { updatedAt: iso(SINCE - DAY) })
    ];
    h.api.mockResolvedValueOnce({ ...docs[2], bodyHtml: "<p>Sleep and <b>attention</b> in first-years, a short study of habits and marks</p>", keyVersion: 0, deks: [] });
    const a = await buildRecapApi(source({ shell: { ...source().shell, documents: docs } }));
    const got = await a.lastDoc();
    expect(h.api).toHaveBeenCalledTimes(1);
    expect(h.api).toHaveBeenCalledWith("/documents/new");
    expect(got).toEqual({ at: Date.parse(docs[2]!.updatedAt), text: "Sleep and attention in first-years, a short study of habits and marks" });
  });

  it("with only source documents there is no last document and nothing is fetched", async () => {
    const docs = [doc("s1", { kind: "source" })];
    const a = await buildRecapApi(source({ shell: { ...source().shell, documents: docs } }));
    await expect(a.lastDoc()).resolves.toBeNull();
    expect(h.api).not.toHaveBeenCalled();
  });

  it("the last document is never fetched while the vault is locked, even if asked", async () => {
    const a = await buildRecapApi(source({ vault: locked }));
    expect(a.vaultOpen).toBe(false);
    await expect(a.lastDoc()).resolves.toBeNull();
    expect(h.api).not.toHaveBeenCalled();
  });

  it("the previous answer comes from this account's answers on this device only", async () => {
    localStorage.setItem("appu_recap_answers_user-a", JSON.stringify([{ t: SINCE, a1: "mine", a2: "", a3: "" }]));
    localStorage.setItem("appu_recap_answers_user-b", JSON.stringify([{ t: SINCE, a1: "theirs", a2: "", a3: "" }]));
    expect((await buildRecapApi(source())).answer).toEqual({ t: SINCE, text: "mine" });
    expect((await buildRecapApi(source({ uid: "user-c" }))).answer).toBeNull();
  });
});

const run = (ts: number) => ({ test: "t", label: "l", ds: "d", hash: "h", fields: {}, multi: {}, extra: {}, sentence: "s", ts });
