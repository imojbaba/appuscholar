// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptText, encryptText, generateDek, generateVaultKey, sealVaultCheck, unwrapKey, wrapKey, wrapWithPassphrase, wrapWithRecovery } from "../lib/vault/crypto";
import { forgetRemembered } from "../lib/vault/remember";

const h = vi.hoisted(() => ({ api: vi.fn(), ask: vi.fn(), toast: vi.fn() }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", scratchProjectId: "scratch" } }) }));
vi.mock("@/components/workspace/dialogs/Passphrase", async () => (await import("./support/passphraseMock")).passphraseMock(h.ask));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));

import { ApiError } from "../lib/api";
import { useVault, VaultProvider, type VaultValue, type WrappedDek } from "../lib/vault/useVault";
import { BLOB_SAVE_DEBOUNCE_MS, useProjectBlob, type ProjectBlob } from "../lib/blobs/useProjectBlob";
import { BLOB_KINDS, blobId, isBlobKind, parseBlob, shelfPaperKind, type BlobKind, type IdeaIntake } from "../lib/blobs/kinds";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Rec = { passWrapped: string; recoveryWrapped: string; checkWrapped: string; publicKey: string | null; privateKeyWrapped: string | null; complete: boolean; updatedAt: string };
type SBlob = { projectId: string; kind: string; body: string; keyVersion: number; deks: WrappedDek[] };
type Call = { path: string; method: string; body?: Record<string, unknown> };
let server: { vault: Rec | null; calls: Call[]; blobs: SBlob[] };

const CIPHERTEXT = /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/;
const wire = (b: SBlob) => ({ kind: b.kind, body: b.body, keyVersion: b.keyVersion, deks: [...b.deks], updatedAt: "2026-10-19T00:00:00.000Z" });

/** The blob routes with the documents' vault rules, as apps/api/src/routes/blobs.ts answers them. */
function blobApi(path: string, method: string, body: Record<string, unknown> | undefined): Promise<unknown> | null {
  const m = /^\/projects\/([^/]+)\/blobs\/([^/]+)$/.exec(path);
  if (!m) return null;
  const projectId = m[1]!, kind = decodeURIComponent(m[2]!);
  if (!isBlobKind(kind)) return Promise.reject(new ApiError(400, "invalid"));
  const cur = server.blobs.find((b) => b.projectId === projectId && b.kind === kind);
  if (method === "GET") return cur ? Promise.resolve(wire(cur)) : Promise.reject(new ApiError(404, "not-found"));
  if (method !== "PUT") return null;
  const b = body as { body: string; keyVersion: number; dek?: WrappedDek };
  const deks = cur?.deks ?? [];
  let add: WrappedDek | undefined;
  if (b.keyVersion === 0) {
    if (server.vault) return Promise.reject(new ApiError(409, "vault-required"));
  } else {
    if (!CIPHERTEXT.test(b.body) || (b.dek && b.dek.v !== b.keyVersion)) return Promise.reject(new ApiError(400, "invalid"));
    if (!deks.some((k) => k.v === b.keyVersion) && b.dek?.v !== b.keyVersion) return Promise.reject(new ApiError(400, "unknown-key-version"));
    const clash = b.dek ? deks.find((k) => k.v === b.dek!.v) : undefined;
    if (clash && clash.wrapped !== b.dek!.wrapped) return Promise.reject(new ApiError(409, "dek-exists"));
    add = b.dek && !clash ? b.dek : undefined;
  }
  const next: SBlob = { projectId, kind, body: b.body, keyVersion: b.keyVersion, deks: add ? [...deks, add] : deks };
  server.blobs = [...server.blobs.filter((x) => x !== cur), next];
  return Promise.resolve(wire(next));
}

function fakeApi(path: string, init: RequestInit = {}) {
  const method = init.method ?? "GET";
  const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
  server.calls.push({ path, method, body });
  const blob = blobApi(path, method, body);
  if (blob) return blob;
  if (path === "/me/vault" && method === "GET") return server.vault ? Promise.resolve({ ...server.vault }) : Promise.reject(new ApiError(404, "no-vault"));
  return Promise.reject(new ApiError(404, "not-found"));
}

/** A complete vault (no migration runs on unlock) for the given key, opened by `pass`. */
async function vaultFor(vk: CryptoKey, pass: string): Promise<Rec> {
  return {
    passWrapped: await wrapWithPassphrase(vk, pass), recoveryWrapped: await wrapWithRecovery(vk, "AAAAA-BBBBB-CCCCC-DDDDD"), checkWrapped: await sealVaultCheck(vk),
    publicKey: null, privateKeyWrapped: null, complete: true, updatedAt: new Date().toISOString()
  };
}
/** A blob sealed the way the browser seals it: its own dek, wrapped under the vault key. */
async function sealedBlob(vk: CryptoKey, projectId: string, kind: string, value: unknown): Promise<SBlob> {
  const dk = await generateDek();
  return { projectId, kind, body: await encryptText(JSON.stringify(value), dk), keyVersion: 1, deks: [{ v: 1, wrapped: await wrapKey(dk, vk) }] };
}
async function openSealed(vk: CryptoKey, b: { body: string; deks: WrappedDek[]; keyVersion: number }): Promise<unknown> {
  const dek = b.deks.find((d) => d.v === b.keyVersion)!;
  return JSON.parse(await decryptText(b.body, await unwrapKey(dek.wrapped, vk)));
}

const roots: Root[] = [];
type Mounted = { readonly v: VaultValue; readonly b: ProjectBlob<unknown>; rerender(projectId: string | null, kind?: BlobKind): Promise<void>; unmount(): void };
async function mount(kind: BlobKind, projectId: string | null, opts?: { readOnly?: boolean }): Promise<Mounted> {
  const box: { v: VaultValue | null; b: ProjectBlob<unknown> | null } = { v: null, b: null };
  function Probe({ k, pid }: { k: BlobKind; pid: string | null }) {
    box.v = useVault();
    box.b = useProjectBlob(k, pid, opts) as ProjectBlob<unknown>;
    return null;
  }
  const root = createRoot(document.createElement("div"));
  roots.push(root);
  let current = kind;
  const render = (pid: string | null, k: BlobKind) => root.render(<VaultProvider><Probe k={k} pid={pid} /></VaultProvider>);
  await act(async () => { render(projectId, kind); });
  return {
    get v() { return box.v!; },
    get b() { return box.b!; },
    rerender: async (pid, k) => { current = k ?? current; await act(async () => { render(pid, current); }); },
    unmount: () => { act(() => { root.unmount(); }); roots.splice(roots.indexOf(root), 1); }
  };
}
async function until(pred: () => boolean) {
  for (let i = 0; i < 600; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); }
  throw new Error("condition not reached");
}
const settle = (ms = 30) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const blobCalls = () => server.calls.filter((c) => c.path.includes("/blobs"));
const putsTo = (projectId: string, kind: string) => server.calls.filter((c) => c.method === "PUT" && c.path === `/projects/${projectId}/blobs/${encodeURIComponent(kind)}`);

const INTAKE: IdeaIntake = { topic: "sleep and memory in adolescents", resources: "school survey", timeframe: "six months", constraints: "no lab" };
const NEXT: IdeaIntake = { ...INTAKE, timeframe: "one year" };
const NEXT2: IdeaIntake = { ...INTAKE, constraints: "evenings only" };

beforeEach(async () => {
  server = { vault: null, calls: [], blobs: [] };
  h.api.mockReset().mockImplementation(fakeApi);
  h.ask.mockReset();
  h.toast.mockReset();
  await forgetRemembered("u1");
});
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); });

describe("blob kinds", () => {
  it("mirrors the api's kinds, and blob ids never look like a document id", () => {
    expect(BLOB_KINDS).toEqual(["idea_intake", "citations", "retraction_cache", "refcheck_cache", "shelf_index", "ap_notes", "ap_cols", "rs_prefs"]);
    expect(isBlobKind("citations")).toBe(true);
    expect(isBlobKind(shelfPaperKind("p1a2_b-3"))).toBe(true);
    expect(isBlobKind("shelf_paper:")).toBe(false);
    expect(isBlobKind("shelf_paper:has space")).toBe(false);
    expect(isBlobKind("shelf_paper:" + "x".repeat(65))).toBe(false);
    expect(isBlobKind("documents")).toBe(false);
    expect(blobId("p1", "citations")).toBe("blob:p1:citations");
    expect(blobId("p1", "shelf_paper:abc")).toBe("blob:p1:shelf_paper:abc");
  });

  it("parseBlob reads each kind's shape and answers null for a body that is not JSON or not of that shape", () => {
    expect(parseBlob("idea_intake", JSON.stringify(INTAKE))).toEqual(INTAKE);
    expect(parseBlob("idea_intake", "{not json")).toBeNull();
    expect(parseBlob("idea_intake", JSON.stringify({ ...INTAKE, topic: 5 }))).toBeNull();
    expect(parseBlob("citations", JSON.stringify([{ author: "Ng, A.", year: "2020", title: "T" }]))).toEqual([{ author: "Ng, A.", year: "2020", title: "T" }]);
    expect(parseBlob("citations", JSON.stringify({ author: "x" }))).toBeNull();
    expect(parseBlob("retraction_cache", JSON.stringify({ "10.1/x": { r: true, at: 1 } }))).toEqual({ "10.1/x": { r: true, at: 1 } });
    expect(parseBlob("retraction_cache", JSON.stringify({ "10.1/x": { r: "yes", at: 1 } }))).toBeNull();
    expect(parseBlob("refcheck_cache", JSON.stringify({ k: { anything: [1] } }))).toEqual({ k: { anything: [1] } });
    const paper = { id: "p1", title: "A", file: "a.pdf", size: 10, added: "2026-10-19T00:00:00.000Z", total: 3, kept: 3 };
    expect(parseBlob("shelf_index", JSON.stringify([paper]))).toEqual([paper]);
    const sp = { pages: ["one", "two"], notes: [{ id: "n1", page: 1, quote: "q", note: "", at: "2026-10-19T00:00:00.000Z" }], cells: { "Sample size": "40" } };
    expect(parseBlob("shelf_paper:p1", JSON.stringify(sp))).toEqual(sp);
    expect(parseBlob("shelf_paper:p1", JSON.stringify({ pages: [1] }))).toBeNull();
    const notes = { d1: { stages: { aims: { mine: "my words" }, design: { res: { reading: "x" } } }, card: {}, title: "Paper" } };
    expect(parseBlob("ap_notes", JSON.stringify(notes))).toEqual(notes);
    expect(parseBlob("ap_cols", JSON.stringify(["Sample size"]))).toEqual(["Sample size"]);
    expect(parseBlob("rs_prefs", JSON.stringify({ rank: true }))).toEqual({ rank: true });
    expect(parseBlob("rs_prefs", JSON.stringify({ rank: 1 }))).toBeNull();
    // Unknown fields are kept, never stripped by a read.
    expect(parseBlob("rs_prefs", JSON.stringify({ rank: false, later: "x" }))).toEqual({ rank: false, later: "x" });
  });
});

describe("useProjectBlob", () => {
  it("round trip encrypted: the PUT carries ciphertext with keyVersion 1 and the blob's first dek; a fresh read decrypts it back", async () => {
    const vk = await generateVaultKey();
    server.vault = await vaultFor(vk, "right");
    h.ask.mockResolvedValue("right");
    const s = await mount("idea_intake", "p1");
    await until(() => !s.b.loading);
    // No blob yet: nothing to open, so no prompt.
    expect(s.b.value).toBeNull();
    expect(s.b.locked).toBe(false);
    expect(h.ask).not.toHaveBeenCalled();
    act(() => { s.b.set(INTAKE); });
    expect(s.b.value).toEqual(INTAKE);
    await act(async () => { await s.b.flush(); });
    expect(h.ask).toHaveBeenCalledTimes(1);
    const [put] = putsTo("p1", "idea_intake");
    const sent = put!.body as { body: string; keyVersion: number; dek?: WrappedDek };
    expect(sent.keyVersion).toBe(1);
    expect(sent.dek).toMatchObject({ v: 1 });
    expect(sent.body).toMatch(CIPHERTEXT);
    expect(sent.body).not.toContain("sleep");
    expect(await openSealed(vk, { body: sent.body, deks: [sent.dek!], keyVersion: 1 })).toEqual(INTAKE);
    expect(s.b.locked).toBe(false);
    // The next save is sealed under the key the server now holds: no second dek.
    act(() => { s.b.set(NEXT); });
    await act(async () => { await s.b.flush(); });
    const second = putsTo("p1", "idea_intake")[1]!.body as { keyVersion: number; dek?: WrappedDek; body: string };
    expect(second.keyVersion).toBe(1);
    expect(second.dek).toBeUndefined();
    // Another visit: the blob decrypts back to what was set.
    const t = await mount("idea_intake", "p1");
    await until(() => !t.b.loading);
    expect(t.b.value).toEqual(NEXT);
    expect(t.b.broken).toBeFalsy();
  }, 30_000);

  it("vault off: the blob is stored as plaintext JSON with keyVersion 0 and no dek, and read back as it is", async () => {
    const s = await mount("rs_prefs", "p1");
    await until(() => !s.b.loading);
    act(() => { s.b.set({ rank: true }); });
    await act(async () => { await s.b.flush(); });
    expect(putsTo("p1", "rs_prefs").map((c) => c.body)).toEqual([{ body: JSON.stringify({ rank: true }), keyVersion: 0 }]);
    const t = await mount("rs_prefs", "p1");
    await until(() => !t.b.loading);
    expect(t.b.value).toEqual({ rank: true });
    expect(h.ask).not.toHaveBeenCalled();
  });

  it("a locked read prompts once; cancelled, it stays locked with no value (never a default), and a later unlock reads it", async () => {
    const vk = await generateVaultKey();
    server.vault = await vaultFor(vk, "right");
    server.blobs = [await sealedBlob(vk, "p1", "idea_intake", INTAKE)];
    h.ask.mockResolvedValue(null);
    const s = await mount("idea_intake", "p1");
    await until(() => !s.b.loading);
    expect(h.ask).toHaveBeenCalledTimes(1);
    expect(s.b.locked).toBe(true);
    expect(s.b.value).toBeNull();
    expect(s.b.broken).toBeFalsy();
    // Rendering again asks nothing more.
    await s.rerender("p1");
    await settle();
    expect(h.ask).toHaveBeenCalledTimes(1);
    // Opened from elsewhere (the pill): the blob is read now.
    await act(async () => { await s.v.unlock("right", false); });
    await until(() => s.b.value !== null);
    expect(s.b.value).toEqual(INTAKE);
    expect(s.b.locked).toBe(false);
    expect(putsTo("p1", "idea_intake")).toHaveLength(0);
  }, 30_000);

  it("set while locked prompts once; cancelled, the value is held (shown, still locked) and sent after a later unlock", async () => {
    const vk = await generateVaultKey();
    server.vault = await vaultFor(vk, "right");
    server.blobs = [await sealedBlob(vk, "p1", "idea_intake", INTAKE)];
    h.ask.mockResolvedValue(null);
    const s = await mount("idea_intake", "p1");
    await until(() => !s.b.loading);
    expect(h.ask).toHaveBeenCalledTimes(1);
    act(() => { s.b.set(NEXT); });
    await until(() => h.ask.mock.calls.length === 2);
    await settle();
    expect(s.b.value).toEqual(NEXT);
    expect(s.b.locked).toBe(true);
    // A second edit while still locked: held too, with no further prompt, even past the debounce.
    act(() => { s.b.set(NEXT2); });
    await settle(BLOB_SAVE_DEBOUNCE_MS + 100);
    await act(async () => { await s.b.flush(); });
    expect(h.ask).toHaveBeenCalledTimes(2);
    expect(s.b.value).toEqual(NEXT2);
    expect(putsTo("p1", "idea_intake")).toHaveLength(0);
    // The vault opens: the held value goes out, sealed under the blob's existing key.
    await act(async () => { await s.v.unlock("right", false); });
    await until(() => putsTo("p1", "idea_intake").length === 1);
    await until(() => !s.b.locked);
    const sent = putsTo("p1", "idea_intake")[0]!.body as { body: string; keyVersion: number; dek?: WrappedDek };
    expect(sent.keyVersion).toBe(1);
    expect(sent.dek).toBeUndefined();
    expect(await openSealed(vk, { body: sent.body, deks: server.blobs[0]!.deks, keyVersion: 1 })).toEqual(NEXT2);
    expect(s.b.value).toEqual(NEXT2);
    expect(h.ask).toHaveBeenCalledTimes(2);
  }, 30_000);

  it("debounces: three sets in a row produce one PUT, of the last value, after BLOB_SAVE_DEBOUNCE_MS", async () => {
    expect(BLOB_SAVE_DEBOUNCE_MS).toBe(800);
    const s = await mount("rs_prefs", "p1");
    await until(() => !s.b.loading);
    act(() => { s.b.set({ rank: true }); s.b.set({ rank: false }); s.b.set({ rank: true }); });
    expect(s.b.value).toEqual({ rank: true });
    await settle(BLOB_SAVE_DEBOUNCE_MS / 2);
    expect(putsTo("p1", "rs_prefs")).toHaveLength(0);
    await until(() => putsTo("p1", "rs_prefs").length === 1);
    await settle(BLOB_SAVE_DEBOUNCE_MS + 100);
    expect(putsTo("p1", "rs_prefs").map((c) => c.body)).toEqual([{ body: JSON.stringify({ rank: true }), keyVersion: 0 }]);
  });

  it("409 vault-required (a vault was set up in another tab): the keys are read again, the body sealed, and sent once more", async () => {
    const s = await mount("idea_intake", "p1");
    await until(() => !s.b.loading);
    expect(s.v.status).toBe("off");
    const vk = await generateVaultKey();
    server.vault = await vaultFor(vk, "right");
    h.ask.mockResolvedValue("right");
    act(() => { s.b.set(INTAKE); });
    await act(async () => { await s.b.flush(); });
    const puts = putsTo("p1", "idea_intake").map((c) => c.body as { body: string; keyVersion: number; dek?: WrappedDek });
    expect(puts.map((p) => p.keyVersion)).toEqual([0, 1]);
    expect(await openSealed(vk, { body: puts[1]!.body, deks: [puts[1]!.dek!], keyVersion: 1 })).toEqual(INTAKE);
    expect(h.ask).toHaveBeenCalledTimes(1);
    expect(s.b.error).toBeFalsy();
    expect(server.blobs[0]).toMatchObject({ keyVersion: 1, deks: [puts[1]!.dek] });
  }, 30_000);

  it("a second 409 after the one retry is an error: nothing more is sent, and the value is kept", async () => {
    const vk = await generateVaultKey();
    server.vault = await vaultFor(vk, "right");
    h.ask.mockResolvedValue("right");
    h.api.mockImplementation((path: string, init?: RequestInit) => {
      if (init?.method === "PUT" && path.includes("/blobs/")) { server.calls.push({ path, method: "PUT", body: JSON.parse(String(init.body)) as Record<string, unknown> }); return Promise.reject(new ApiError(409, "vault-required")); }
      return fakeApi(path, init);
    });
    const s = await mount("idea_intake", "p1");
    await until(() => !s.b.loading);
    act(() => { s.b.set(INTAKE); });
    await act(async () => { await s.b.flush(); });
    expect(putsTo("p1", "idea_intake")).toHaveLength(2);
    // Between the two: the blob's keys read again.
    const i = server.calls.findIndex((c) => c.method === "PUT");
    expect(server.calls.slice(i + 1).some((c) => c.method === "GET" && c.path === "/projects/p1/blobs/idea_intake")).toBe(true);
    expect(s.b.error).toBe(true);
    expect(s.b.value).toEqual(INTAKE);
  }, 30_000);

  it("a corrupt blob is broken: not JSON, the wrong shape, or ciphertext that does not open; the panel gets no value", async () => {
    server.blobs = [
      { projectId: "p1", kind: "idea_intake", body: "{not json", keyVersion: 0, deks: [] },
      { projectId: "p1", kind: "rs_prefs", body: JSON.stringify({ rank: "yes" }), keyVersion: 0, deks: [] }
    ];
    const a = await mount("idea_intake", "p1");
    await until(() => !a.b.loading);
    expect(a.b).toMatchObject({ value: null, broken: true, locked: false });
    const b = await mount("rs_prefs", "p1");
    await until(() => !b.b.loading);
    expect(b.b).toMatchObject({ value: null, broken: true });

    // Sealed under a key this vault never wrapped.
    const vk = await generateVaultKey();
    server.vault = await vaultFor(vk, "right");
    const other = await sealedBlob(await generateVaultKey(), "p1", "citations", []);
    server.blobs.push(other);
    h.ask.mockResolvedValue("right");
    const c = await mount("citations", "p1");
    await until(() => !c.b.loading);
    expect(c.b).toMatchObject({ value: null, broken: true, locked: false });
  }, 30_000);

  it("projectId null: nothing is requested, there is no value, and set is a no-op", async () => {
    const s = await mount("idea_intake", null);
    await settle();
    expect(s.b).toMatchObject({ value: null, loading: false, locked: false });
    act(() => { s.b.set(INTAKE); });
    await act(async () => { await s.b.flush(); });
    await settle(BLOB_SAVE_DEBOUNCE_MS + 100);
    expect(blobCalls()).toHaveLength(0);
    expect(s.b.value).toBeNull();
  });

  it("switching project sends the pending save to the old project first, then reads the new one", async () => {
    server.blobs = [{ projectId: "p2", kind: "rs_prefs", body: JSON.stringify({ rank: false }), keyVersion: 0, deks: [] }];
    const s = await mount("rs_prefs", "p1");
    await until(() => !s.b.loading);
    act(() => { s.b.set({ rank: true }); });
    await s.rerender("p2");
    await until(() => !s.b.loading && s.b.value !== null);
    expect(s.b.value).toEqual({ rank: false });
    await until(() => putsTo("p1", "rs_prefs").length === 1);
    expect(putsTo("p1", "rs_prefs")[0]!.body).toEqual({ body: JSON.stringify({ rank: true }), keyVersion: 0 });
    await settle(BLOB_SAVE_DEBOUNCE_MS + 100);
    expect(putsTo("p2", "rs_prefs")).toHaveLength(0);
    expect(server.blobs.find((b) => b.projectId === "p2")!.body).toBe(JSON.stringify({ rank: false }));
  });

  it("readOnly (the pop-out's seam): the blob is read, and set sends nothing", async () => {
    server.blobs = [{ projectId: "p1", kind: "ap_cols", body: JSON.stringify(["Sample size"]), keyVersion: 0, deks: [] }];
    const s = await mount("ap_cols", "p1", { readOnly: true });
    await until(() => !s.b.loading);
    expect(s.b.value).toEqual(["Sample size"]);
    act(() => { s.b.set(["Other"]); });
    await act(async () => { await s.b.flush(); });
    expect(s.b.value).toEqual(["Sample size"]);
    expect(server.calls.filter((c) => c.method === "PUT")).toHaveLength(0);
  });

  it("a shelf paper's blob kind goes in the path encoded", async () => {
    const s = await mount(shelfPaperKind("p1"), "proj");
    await until(() => !s.b.loading);
    expect(server.calls.some((c) => c.method === "GET" && c.path === "/projects/proj/blobs/shelf_paper%3Ap1")).toBe(true);
  });
});
