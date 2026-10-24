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
import { heldBlobs, shouldWarnOnUnloadBlobs } from "../lib/blobs/held";
import { BLOB_KINDS, blobId, isBlobKind, parseBlob, shelfPaperKind, type BlobKind, type IdeaIntake } from "../lib/blobs/kinds";
import { setSyncChannel } from "../lib/popout/channel";
import { blobWritable } from "../lib/popout/mode";
import { FakeChannel } from "./support/fakeChannel";
import en from "../messages/en.json";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Rec = { passWrapped: string; recoveryWrapped: string; checkWrapped: string; publicKey: string | null; privateKeyWrapped: string | null; complete: boolean; updatedAt: string };
/** `version` absent is 1 (a blob a test wrote directly). */
type SBlob = { projectId: string; kind: string; body: string; keyVersion: number; deks: WrappedDek[]; version?: number };
type Call = { path: string; method: string; body?: Record<string, unknown>; ifMatch?: string };
/** `versionless`: an api from before Task 4 (no `version` on the wire, If-Match ignored). */
let server: { vault: Rec | null; calls: Call[]; blobs: SBlob[]; versionless?: boolean };

const CIPHERTEXT = /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/;
const versionOf = (b: SBlob | undefined): number => (b ? b.version ?? 1 : 0);
const wire = (b: SBlob) => ({ kind: b.kind, body: b.body, keyVersion: b.keyVersion, deks: [...b.deks], updatedAt: "2026-10-19T00:00:00.000Z", ...(server.versionless ? {} : { version: versionOf(b) }) });

/** The blob routes with the documents' vault rules and Task 4's versions, as apps/api/src/routes/blobs.ts answers them. */
function blobApi(path: string, method: string, body: Record<string, unknown> | undefined, ifMatch?: string): Promise<unknown> | null {
  const m = /^\/projects\/([^/]+)\/blobs\/([^/]+)$/.exec(path);
  if (!m) return null;
  const projectId = m[1]!, kind = decodeURIComponent(m[2]!);
  if (!isBlobKind(kind)) return Promise.reject(new ApiError(400, "invalid"));
  const cur = server.blobs.find((b) => b.projectId === projectId && b.kind === kind);
  if (method === "GET") return cur ? Promise.resolve(wire(cur)) : Promise.reject(new ApiError(404, "not-found"));
  if (method !== "PUT") return null;
  if (ifMatch !== undefined && !server.versionless) {
    const im = /^"?(\d+)"?$/.exec(ifMatch.trim());
    if (!im) return Promise.reject(new ApiError(400, "invalid"));
    if (Number(im[1]) !== versionOf(cur)) return Promise.reject(new ApiError(409, "version-conflict"));
  }
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
  const next: SBlob = { projectId, kind, body: b.body, keyVersion: b.keyVersion, deks: add ? [...deks, add] : deks, version: versionOf(cur) + 1 };
  server.blobs = [...server.blobs.filter((x) => x !== cur), next];
  return Promise.resolve(wire(next));
}

function fakeApi(path: string, init: RequestInit = {}) {
  const method = init.method ?? "GET";
  const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
  const ifMatch = (init.headers as Record<string, string> | undefined)?.["if-match"];
  server.calls.push({ path, method, body, ...(ifMatch !== undefined ? { ifMatch } : {}) });
  const blob = blobApi(path, method, body, ifMatch);
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
type Mounted = { readonly v: VaultValue; readonly b: ProjectBlob<any>; rerender(projectId: string | null, kind?: BlobKind): Promise<void>; unmount(): void };
async function mount(kind: BlobKind, projectId: string | null, opts?: { readOnly?: boolean }): Promise<Mounted> {
  // The probe serves every kind; each test knows its own shape.
  const box: { v: VaultValue | null; b: ProjectBlob<any> | null } = { v: null, b: null };
  function Probe({ k, pid }: { k: BlobKind; pid: string | null }) {
    box.v = useVault();
    box.b = useProjectBlob(k, pid, opts);
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
  heldBlobs.clear();
  await forgetRemembered("u1");
});
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); });

describe("blob kinds", () => {
  it("mirrors the api's kinds, and blob ids never look like a document id", () => {
    expect(BLOB_KINDS).toEqual([
      "idea_intake", "citations", "retraction_cache", "refcheck_cache", "shelf_index", "ap_notes", "ap_cols", "rs_prefs", "shelf_cols",
      "design_reg", "design_proto", "design_ec", "design_ctri", "design_pi", "design_budget", "stats_sets", "stats_runs", "stats_prefs", "qual_codes", "qual_prefs",
      "style_profile", "style_samples", "style_meta", "words_bank", "words_prefs", "close_prefs", "viva_log",
      "participants"
    ]);
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
    // v1's field names (7569): r, t.
    expect(parseBlob("retraction_cache", JSON.stringify({ "10.1/x": { r: true, t: 1 } }))).toEqual({ "10.1/x": { r: true, t: 1 } });
    expect(parseBlob("retraction_cache", JSON.stringify({ "10.1/x": { r: "yes", t: 1 } }))).toBeNull();
    expect(parseBlob("retraction_cache", JSON.stringify({ "10.1/x": { r: true, at: 1 } }))).toBeNull();
    // core's RcCheck, as v1 stores it per citKey (rcCheckOne 7750-7771).
    const rc = { "smith|2020|t": { s: "diff", m: [{ k: "year", v: "2019" }], f: { title: "T", year: 2019, author: "Smith", doi: "10.1/x" }, viaTitle: true, t: 5 }, "lee|2018|u": { s: "nf", t: 6 } };
    expect(parseBlob("refcheck_cache", JSON.stringify(rc))).toEqual(rc);
    expect(parseBlob("refcheck_cache", JSON.stringify({ k: { anything: [1] } }))).toBeNull();
    expect(parseBlob("refcheck_cache", JSON.stringify({ k: { s: "maybe", t: 1 } }))).toBeNull();
    const paper = { id: "p1", title: "A", file: "a.pdf", size: 10, added: "2026-10-19T00:00:00.000Z", total: 3, kept: 3 };
    expect(parseBlob("shelf_index", JSON.stringify([paper]))).toEqual([paper]);
    const sp = { pages: ["one", "two"], notes: [{ id: "n1", page: 1, quote: "q", note: "", at: "2026-10-19T00:00:00.000Z" }], cells: { "Sample size": "40" } };
    expect(parseBlob("shelf_paper:p1", JSON.stringify(sp))).toEqual(sp);
    expect(parseBlob("shelf_paper:p1", JSON.stringify({ pages: [1] }))).toBeNull();
    const notes = { d1: { stages: { aims: { mine: "my words" }, design: { res: { reading: "x" } } }, card: {}, title: "Paper" } };
    expect(parseBlob("ap_notes", JSON.stringify(notes))).toEqual(notes);
    // v1's note as apWalkShow and apCardField write it (10061, 10121): a reply with its checked quotations, the card's fields (Task 13).
    const v1Note = { a1: { stages: { gap: { mine: "m", res: { partial: false, n: 3, of: 3, reading: "r", quotes: [{ q: "a quotation", ok: true, page: 1, sec: "Method", label: "page 1" }, { q: "x", ok: false, why: "too short to check" }], not_stated: ["n"], watch: "w", cq: "q", ca: "a" } }, stats: { res: { partial: true, n: 1, of: 9, raw: "not json", quotes: [] } } }, card: { strengths: "s", weak: "w", verdict: "v", notes: "n" }, title: "T" } };
    expect(parseBlob("ap_notes", JSON.stringify(v1Note))).toEqual(v1Note);
    expect(parseBlob("ap_notes", JSON.stringify({ a1: { stages: { gap: { res: { quotes: "q" } } }, card: {} } }))).toBeNull();
    expect(parseBlob("ap_notes", JSON.stringify({ a1: { stages: {}, card: { verdict: 1 } } }))).toBeNull();
    expect(parseBlob("ap_cols", JSON.stringify(["Sample size"]))).toEqual(["Sample size"]);
    // The Reading shelf's matrix columns (ruling R14): names, v1's appu_shelf_cols (11697).
    expect(parseBlob("shelf_cols", JSON.stringify(["Sample", "Method", "Key finding"]))).toEqual(["Sample", "Method", "Key finding"]);
    expect(parseBlob("shelf_cols", JSON.stringify([]))).toEqual([]);
    expect(parseBlob("shelf_cols", JSON.stringify([1]))).toBeNull();
    expect(parseBlob("shelf_cols", JSON.stringify({ a: 1 }))).toBeNull();
    expect(parseBlob("rs_prefs", JSON.stringify({ rank: true }))).toEqual({ rank: true });
    expect(parseBlob("rs_prefs", JSON.stringify({ rank: 1 }))).toBeNull();
    // Unknown fields are kept, never stripped by a read.
    expect(parseBlob("rs_prefs", JSON.stringify({ rank: false, later: "x" }))).toEqual({ rank: false, later: "x" });
  });
});

describe("the stage 3 to 6 tools' kinds (Task G3, ruling R8)", () => {
  /** Each kind, a value in v1's shape (the v1 lines are in lib/blobs/kinds/<tool>.ts), and one that is not of it. */
  const CASES: Array<[BlobKind, unknown, unknown]> = [
    ["design_reg", { type: "interventional", pop: "minors", bio: false, multi: true, done: true, savedAt: 1729500000000 }, { bio: "no" }],
    ["design_proto", { bg: "Why", obj: "", design: "RCT", part: "", sample: "", proc: "", risk: "", dmp: "", done: true }, { bg: 1 }],
    ["design_ec", { checklist: { 0: true, 3: false }, title: "T", pi: "Dr X", status: "applied", apprNo: "", apprDate: "2026-10-01", consentMode: "written", minors: "no", done: true }, { checklist: { 0: "yes" } }],
    ["design_ctri", { checklist: { 2: true }, done: true }, { done: "true" }],
    ["design_pi", { checklist: {}, cv: "My CV", done: true }, { cv: ["x"] }],
    ["design_budget", { rows: [{ label: "Travel", amount: "2500" }, { label: "", amount: "" }], done: true }, { rows: [{ label: "Travel" }] }],
    ["stats_sets", { "Untitled data": { hash: "811c9dc5-1505-0", ts: 1729500000000, n: 40 } }, { x: { hash: "h", ts: 1 } }],
    ["stats_runs", { rlx1abcd: { test: "ttest_ind", label: "Independent t-test", ds: "Untitled data", hash: "h", fields: { dv: "Score" }, multi: {}, extra: { tails: "2" }, sentence: "t(38) = 2.10, p = .04", ts: 1 } }, [{ test: "x" }]],
    ["stats_prefs", { statsname: "Wave 1", gen_first: true }, { gen_first: "1" }],
    ["qual_codes", [{ id: "c1", name: "Coping", parentId: null, color: "#f59e0b" }, { id: "c2", name: "Sleep", parentId: "c1", color: "#10b981" }], [{ id: "c1", name: "Coping" }]],
    ["qual_prefs", { showcolors: false }, { showcolors: "0" }],
    ["style_profile", { profile: "Short sentences.", on: true }, { profile: "x" }],
    ["style_samples", [{ id: "s1", name: "Essay", date: "2026-10-01", n: 320, sc: 14, sm: 22.9, ssd: 6.1, wl: 4.812, ls: 0.4211, fw: [0.05], pu: [48.1], vw: ["particularly"] }], [{ id: "s1", name: "Essay" }]],
    ["style_meta", { decl: "2026-10-01", livePassage: 2, live: { date: "2026-10-02", matched: 3, total: 4 }, fb: "ok", vocab_level: { score: 7, k: "advanced", date: "2026-10-02" } }, { fb: "maybe" }],
    ["words_bank", [{ w: "salient", pos: "adjective", m: "most noticeable", h: "", d: "2026-10-01" }], [{ w: "salient" }]],
    ["words_prefs", { gram_stats: { discuss_about: 3 }, spell: "uk" }, { spell: "british" }],
    ["close_prefs", { k: 6, min: 8 }, { k: "6" }],
    ["viva_log", [{ t: 1729500000000, aud: "viva", q: "Why this sample?", a: "Because…" }], [{ t: 1, aud: "viva", q: "Q" }]]
  ];

  it("parseBlob reads each new kind in v1's shape, keeps unknown fields, and refuses another shape", () => {
    for (const [kind, ok, bad] of CASES) {
      expect(parseBlob(kind, JSON.stringify(ok)), kind).toEqual(ok);
      expect(parseBlob(kind, JSON.stringify(bad)), kind).toBeNull();
    }
    expect(parseBlob("design_reg", JSON.stringify({ type: "drug", later: 1 }))).toEqual({ type: "drug", later: 1 });
    expect(parseBlob("design_reg", JSON.stringify({}))).toEqual({});
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

  describe("updates set before the stored value is known", () => {
    const A = { author: "Ng, A.", year: "2020", title: "Stored earlier" };
    const B = { author: "Ho, B.", year: "2024", title: "Added now" };
    const add = (e: typeof B) => (prev: unknown[] | null) => [...(prev ?? []), e];

    it("an update set while locked (the ask cancelled) lands on top of the stored list after unlock; the entry the panel never saw survives", async () => {
      const vk = await generateVaultKey();
      server.vault = await vaultFor(vk, "right");
      server.blobs = [await sealedBlob(vk, "p1", "citations", [A])];
      h.ask.mockResolvedValue(null);
      const s = await mount("citations", "p1");
      await until(() => !s.b.loading);
      expect(s.b).toMatchObject({ locked: true, value: null });
      act(() => { s.b.set(add(B)); });
      await until(() => h.ask.mock.calls.length === 2);
      await settle();
      // Held: shown as the panel set it, nothing sent.
      expect(s.b.locked).toBe(true);
      expect(putsTo("p1", "citations")).toHaveLength(0);
      await act(async () => { await s.v.unlock("right", false); });
      await until(() => putsTo("p1", "citations").length === 1);
      await until(() => !s.b.locked);
      const sent = putsTo("p1", "citations")[0]!.body as { body: string; keyVersion: number };
      expect(await openSealed(vk, { body: sent.body, deks: server.blobs[0]!.deks, keyVersion: sent.keyVersion })).toEqual([A, B]);
      expect(s.b.value).toEqual([A, B]);
    }, 30_000);

    it("a set while the first read is still in flight is applied to the loaded value, not over it", async () => {
      server.blobs = [{ projectId: "p1", kind: "citations", body: JSON.stringify([A]), keyVersion: 0, deks: [] }];
      let release!: () => void;
      const gate = new Promise<void>((r) => { release = r; });
      h.api.mockImplementation(async (path: string, init?: RequestInit) => { if (path.includes("/blobs/") && !init?.method) await gate; return fakeApi(path, init); });
      const s = await mount("citations", "p1");
      expect(s.b.loading).toBe(true);
      act(() => { s.b.set(add(B)); });
      await act(async () => { release(); });
      await until(() => !s.b.loading);
      expect(s.b.value).toEqual([A, B]);
      let ok: boolean | undefined;
      await act(async () => { ok = await s.b.flush(); });
      expect(ok).toBe(true);
      expect(putsTo("p1", "citations").map((c) => JSON.parse((c.body as { body: string }).body))).toEqual([[A, B]]);
    });

    it("a failed read is retried by flush, and what was set meanwhile is applied to the stored value", async () => {
      server.blobs = [{ projectId: "p1", kind: "citations", body: JSON.stringify([A]), keyVersion: 0, deks: [] }];
      let offline = true;
      h.api.mockImplementation((path: string, init?: RequestInit) => (offline && path.includes("/blobs/") && !init?.method ? Promise.reject(new TypeError("Failed to fetch")) : fakeApi(path, init)));
      const s = await mount("citations", "p1");
      await until(() => !s.b.loading);
      expect(s.b).toMatchObject({ value: null, error: true, locked: false });
      act(() => { s.b.set(add(B)); });
      offline = false;
      let ok: boolean | undefined;
      await act(async () => { ok = await s.b.flush(); });
      expect(ok).toBe(true);
      expect(s.b).toMatchObject({ value: [A, B], error: false });
      expect(putsTo("p1", "citations").map((c) => JSON.parse((c.body as { body: string }).body))).toEqual([[A, B]]);
    });
  });

  it("409 dek-exists (another tab created the blob under its own key): the keys are read again and the value sealed under that key", async () => {
    const vk = await generateVaultKey();
    server.vault = await vaultFor(vk, "right");
    h.ask.mockResolvedValue("right");
    const s = await mount("rs_prefs", "p1");
    await until(() => !s.b.loading);
    expect(s.b.value).toBeNull();
    // Meanwhile another tab creates the blob, with its own first dek.
    const theirs = await sealedBlob(vk, "p1", "rs_prefs", { rank: false });
    server.blobs.push(theirs);
    act(() => { s.b.set({ rank: true }); });
    let ok: boolean | undefined;
    await act(async () => { ok = await s.b.flush(); });
    expect(ok).toBe(true);
    const puts = putsTo("p1", "rs_prefs").map((c) => c.body as { body: string; keyVersion: number; dek?: WrappedDek });
    expect(puts).toHaveLength(2);
    expect(puts[0]!.dek).toBeDefined();
    expect(puts[0]!.dek!.wrapped).not.toBe(theirs.deks[0]!.wrapped);
    expect(puts[1]!.dek).toBeUndefined();
    expect(server.blobs[0]!.deks).toEqual(theirs.deks);
    expect(await openSealed(vk, server.blobs[0]!)).toEqual({ rank: true });
    expect(s.b.error).toBeFalsy();
  }, 30_000);

  it("a broken blob shows broken until the panel sets a value over it", async () => {
    server.blobs = [{ projectId: "p1", kind: "rs_prefs", body: "{not json", keyVersion: 0, deks: [] }];
    const s = await mount("rs_prefs", "p1");
    await until(() => !s.b.loading);
    expect(s.b.broken).toBe(true);
    act(() => { s.b.set({ rank: true }); });
    expect(s.b).toMatchObject({ value: { rank: true }, broken: false });
  });

  describe("values held when the panel goes away", () => {
    it("unmounted while locked and declined: the value is held by blob id, and a new mount of the same blob adopts it and saves it onto the stored value", async () => {
      const vk = await generateVaultKey();
      server.vault = await vaultFor(vk, "right");
      const A = { author: "Ng, A." }, B = { author: "Ho, B." };
      server.blobs = [await sealedBlob(vk, "p1", "citations", [A])];
      h.ask.mockResolvedValue(null);
      const s = await mount("citations", "p1");
      await until(() => !s.b.loading);
      act(() => { s.b.set((prev: unknown[] | null) => [...(prev ?? []), B]); });
      await until(() => h.ask.mock.calls.length === 2);
      await settle();
      expect(shouldWarnOnUnloadBlobs()).toBe(true);
      s.unmount();
      await until(() => heldBlobs.has("blob:p1:citations"));
      // No prompt from a panel that is gone.
      expect(h.ask).toHaveBeenCalledTimes(2);
      expect(putsTo("p1", "citations")).toHaveLength(0);
      // Leaving the page now asks first.
      const ev = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(true);
      // The panel opens again; this time the student unlocks.
      h.ask.mockResolvedValue("right");
      const t = await mount("citations", "p1");
      await until(() => putsTo("p1", "citations").length === 1);
      expect(heldBlobs.size).toBe(0);
      await until(() => !t.b.loading && !t.b.locked);
      expect(t.b.value).toEqual([A, B]);
      expect(await openSealed(vk, server.blobs[0]!)).toEqual([A, B]);
      expect(shouldWarnOnUnloadBlobs()).toBe(false);
    }, 30_000);

    it("held after the panel went away, it is sent when the vault unlocks, with no panel for that blob mounted", async () => {
      const vk = await generateVaultKey();
      server.vault = await vaultFor(vk, "right");
      h.ask.mockResolvedValue(null);
      const s = await mount("rs_prefs", "p1");
      await until(() => !s.b.loading);
      act(() => { s.b.set({ rank: true }); });
      await act(async () => { await s.b.flush(); });
      expect(s.b.locked).toBe(true);
      // Another project: this blob's client goes away, the vault (same provider) stays.
      await s.rerender(null);
      await until(() => heldBlobs.has("blob:p1:rs_prefs"));
      await act(async () => { await s.v.unlock("right", false); });
      await until(() => putsTo("p1", "rs_prefs").length === 1);
      await until(() => heldBlobs.size === 0);
      expect(await openSealed(vk, server.blobs[0]!)).toEqual({ rank: true });
    }, 30_000);

    it("a final save that fails (offline) is held and sent when the browser comes back online", async () => {
      let offline = false;
      h.api.mockImplementation((path: string, init?: RequestInit) => {
        if (offline && init?.method === "PUT") { server.calls.push({ path, method: "PUT" }); return Promise.reject(new TypeError("Failed to fetch")); }
        return fakeApi(path, init);
      });
      const s = await mount("ap_cols", "p1");
      await until(() => !s.b.loading);
      offline = true;
      act(() => { s.b.set(["Sample size"]); });
      s.unmount();
      await until(() => heldBlobs.has("blob:p1:ap_cols"));
      expect(server.blobs).toHaveLength(0);
      offline = false;
      await act(async () => { window.dispatchEvent(new Event("online")); });
      await until(() => heldBlobs.size === 0 && server.blobs.length === 1);
      expect(server.blobs[0]).toMatchObject({ body: JSON.stringify(["Sample size"]), keyVersion: 0 });
    });
  });

  describe("a save in flight when the panel goes away", () => {
    /** Holds every blob PUT until released, then answers it (ok) or fails it as offline. */
    function gatePuts() {
      let release!: (ok: boolean) => void;
      const gate = new Promise<boolean>((r) => { release = r; });
      h.api.mockImplementation(async (path: string, init?: RequestInit) => {
        if (init?.method === "PUT" && path.includes("/blobs/")) {
          if (!(await gate)) { server.calls.push({ path, method: "PUT" }); throw new TypeError("Failed to fetch"); }
        }
        return fakeApi(path, init);
      });
      return (ok: boolean) => release(ok);
    }
    const started = () => h.api.mock.calls.filter(([p, i]) => String(p).includes("/blobs/") && (i as RequestInit | undefined)?.method === "PUT").length;

    it("a slow PUT that fails after unmount: the value is held by blob id, and back online it is sent", async () => {
      const release = gatePuts();
      const s = await mount("ap_cols", "p1");
      await until(() => !s.b.loading);
      act(() => { s.b.set(["Sample size"]); });
      await until(() => started() === 1);
      // The PUT is out; the student leaves the panel.
      s.unmount();
      // The panel's own mark is cleared; its last save, still running, keeps the warning.
      expect(shouldWarnOnUnloadBlobs()).toBe(true);
      await act(async () => { release(false); });
      await until(() => heldBlobs.has("blob:p1:ap_cols"));
      expect(server.blobs).toHaveLength(0);
      expect(shouldWarnOnUnloadBlobs()).toBe(true);
      h.api.mockImplementation(fakeApi);
      await act(async () => { window.dispatchEvent(new Event("online")); });
      await until(() => heldBlobs.size === 0 && server.blobs.length === 1);
      expect(server.blobs[0]).toMatchObject({ body: JSON.stringify(["Sample size"]), keyVersion: 0 });
      expect(shouldWarnOnUnloadBlobs()).toBe(false);
    });

    it("a slow PUT that succeeds after unmount: a new mount of the same blob waits for it and shows the saved value", async () => {
      server.blobs = [{ projectId: "p1", kind: "ap_cols", body: JSON.stringify(["Old"]), keyVersion: 0, deks: [] }];
      const release = gatePuts();
      const s = await mount("ap_cols", "p1");
      await until(() => !s.b.loading);
      act(() => { s.b.set(["New"]); });
      await until(() => started() === 1);
      s.unmount();
      const gets = () => server.calls.filter((c) => c.method === "GET" && c.path === "/projects/p1/blobs/ap_cols").length;
      const t = await mount("ap_cols", "p1");
      await settle(50);
      // Not read yet: it would show the older value.
      expect(gets()).toBe(1);
      expect(t.b.loading).toBe(true);
      await act(async () => { release(true); });
      await until(() => !t.b.loading);
      expect(gets()).toBe(2);
      expect(t.b.value).toEqual(["New"]);
      expect(heldBlobs.size).toBe(0);
    });
  });

  it("a drain that fails and then succeeds leaves no unsent-value warning behind", async () => {
    let offline = false;
    h.api.mockImplementation((path: string, init?: RequestInit) => (offline && init?.method === "PUT" ? Promise.reject(new TypeError("Failed to fetch")) : fakeApi(path, init)));
    const s = await mount("rs_prefs", "p1");
    await until(() => !s.b.loading);
    offline = true;
    act(() => { s.b.set({ rank: true }); });
    s.unmount();
    await until(() => heldBlobs.has("blob:p1:rs_prefs"));
    // Still offline: the drain fails and the value stays held.
    await act(async () => { await heldBlobs.drain(); });
    expect(heldBlobs.has("blob:p1:rs_prefs")).toBe(true);
    offline = false;
    await act(async () => { await heldBlobs.drain(); });
    expect(heldBlobs.size).toBe(0);
    expect(server.blobs[0]).toMatchObject({ body: JSON.stringify({ rank: true }) });
    expect(shouldWarnOnUnloadBlobs()).toBe(false);
  });

  it("a shelf paper's blob kind goes in the path encoded", async () => {
    const s = await mount(shelfPaperKind("p1"), "proj");
    await until(() => !s.b.loading);
    expect(server.calls.some((c) => c.method === "GET" && c.path === "/projects/proj/blobs/shelf_paper%3Ap1")).toBe(true);
  });
});

describe("blob save versions: a save that lost a race re-reads and replays its own edits (D-S2-35)", () => {
  const A = { author: "Ng, A.", title: "Stored" }, X = { author: "Li, X.", title: "Added in another window" }, Y = { author: "Ho, Y.", title: "Added here" };
  const add = (e: object) => (prev: unknown[] | null) => [...(prev ?? []), e];
  const STORED: IdeaIntake = { topic: "A", resources: "R1", timeframe: "six months", constraints: "no lab" };
  const blobOf = (projectId: string, kind: string) => server.blobs.find((b) => b.projectId === projectId && b.kind === kind)!;
  /** Another window's save of a plain blob, straight into the store: the version moves on. */
  const elsewhere = (projectId: string, kind: string, value: unknown) => {
    const cur = blobOf(projectId, kind);
    server.blobs = [...server.blobs.filter((b) => b !== cur), { ...cur, body: JSON.stringify(value), version: versionOf(cur) + 1 }];
  };
  /** The same, for a sealed blob: another window of this student seals under the blob's own key. */
  const elsewhereSealed = async (vk: CryptoKey, projectId: string, kind: string, value: unknown) => {
    const cur = blobOf(projectId, kind);
    const dek = await unwrapKey(cur.deks.find((d) => d.v === cur.keyVersion)!.wrapped, vk);
    server.blobs = [...server.blobs.filter((b) => b !== cur), { ...cur, body: await encryptText(JSON.stringify(value), dek), version: versionOf(cur) + 1 }];
  };
  const plainPuts = (projectId: string, kind: string) => putsTo(projectId, kind).map((c) => JSON.parse((c.body as { body: string }).body) as unknown);

  it("a save sends If-Match with the version it read", async () => {
    server.blobs = [{ projectId: "p1", kind: "rs_prefs", body: JSON.stringify({ rank: false }), keyVersion: 0, deks: [], version: 3 }];
    const s = await mount("rs_prefs", "p1");
    await until(() => !s.b.loading);
    act(() => { s.b.set({ rank: true }); });
    await act(async () => { await s.b.flush(); });
    expect(putsTo("p1", "rs_prefs").map((c) => c.ifMatch)).toEqual(['"3"']);
    expect(blobOf("p1", "rs_prefs").version).toBe(4);
    // The next save names the version the last one was given.
    act(() => { s.b.set({ rank: false }); });
    await act(async () => { await s.b.flush(); });
    expect(putsTo("p1", "rs_prefs").map((c) => c.ifMatch)).toEqual(['"3"', '"4"']);
    // A blob not there yet is version 0.
    const t = await mount("ap_cols", "p1");
    await until(() => !t.b.loading);
    act(() => { t.b.set(["Age"]); });
    await act(async () => { await t.b.flush(); });
    expect(putsTo("p1", "ap_cols").map((c) => c.ifMatch)).toEqual(['"0"']);
  });

  it("a 409 re-reads, replays the edits made here onto the newer value and saves", async () => {
    const vk = await generateVaultKey();
    server.vault = await vaultFor(vk, "right");
    server.blobs = [await sealedBlob(vk, "p1", "idea_intake", STORED)];
    h.ask.mockResolvedValue("right");
    const s = await mount("idea_intake", "p1");
    await until(() => !s.b.loading);
    expect(s.b.value).toEqual(STORED);
    // Another window saves v2 meanwhile.
    await elsewhereSealed(vk, "p1", "idea_intake", { ...STORED, resources: "R2" });
    act(() => { s.b.set((p: IdeaIntake | null) => ({ ...p!, topic: "B" })); });
    let ok: boolean | undefined;
    await act(async () => { ok = await s.b.flush(); });
    expect(ok).toBe(true);
    const puts = putsTo("p1", "idea_intake");
    expect(puts.map((c) => c.ifMatch)).toEqual(['"1"', '"2"']);
    const lastPut = { json: await openSealed(vk, { ...(puts[1]!.body as { body: string; keyVersion: number }), deks: blobOf("p1", "idea_intake").deks }), ifMatch: puts[1]!.ifMatch };
    expect(lastPut.json).toMatchObject({ topic: "B", resources: "R2" });
    expect(lastPut.ifMatch).toBe('"2"');
    expect(await openSealed(vk, blobOf("p1", "idea_intake"))).toEqual({ ...STORED, topic: "B", resources: "R2" });
    expect(blobOf("p1", "idea_intake").version).toBe(3);
    expect(s.b).toMatchObject({ value: { ...STORED, topic: "B", resources: "R2" }, error: false, locked: false });
    // One prompt, the first read's; the re-read asks nothing.
    expect(h.ask).toHaveBeenCalledTimes(1);
    expect(h.toast).not.toHaveBeenCalled();
    expect(shouldWarnOnUnloadBlobs()).toBe(false);
  }, 30_000);

  it("a collection keeps both sides: an entry added here and one added in another window", async () => {
    server.blobs = [{ projectId: "p1", kind: "citations", body: JSON.stringify([A]), keyVersion: 0, deks: [] }];
    const s = await mount("citations", "p1");
    await until(() => !s.b.loading);
    elsewhere("p1", "citations", [A, X]);
    act(() => { s.b.set(add(Y)); });
    expect(s.b.value).toEqual([A, Y]);
    await act(async () => { await s.b.flush(); });
    expect(plainPuts("p1", "citations")).toEqual([[A, Y], [A, X, Y]]);
    expect(JSON.parse(blobOf("p1", "citations").body)).toEqual([A, X, Y]);
    expect(s.b.value).toEqual([A, X, Y]);
  });

  it("an old tab's save in between is merged, not lost (Review Focus 2)", async () => {
    server.blobs = [{ projectId: "p1", kind: "idea_intake", body: JSON.stringify(STORED), keyVersion: 0, deks: [] }];
    const s = await mount("idea_intake", "p1");
    await until(() => !s.b.loading);
    // A tab on a build from before versions saves through the api with no If-Match: the server takes it and moves the version on.
    await fakeApi("/projects/p1/blobs/idea_intake", { method: "PUT", body: JSON.stringify({ body: JSON.stringify({ ...STORED, resources: "R2" }), keyVersion: 0 }) });
    expect(blobOf("p1", "idea_intake").version).toBe(2);
    act(() => { s.b.set((p: IdeaIntake | null) => ({ ...p!, topic: "B" })); });
    await act(async () => { await s.b.flush(); });
    expect(JSON.parse(blobOf("p1", "idea_intake").body)).toEqual({ ...STORED, topic: "B", resources: "R2" });
    expect(putsTo("p1", "idea_intake").map((c) => c.ifMatch)).toEqual([undefined, '"1"', '"2"']);
    expect(s.b.value).toEqual({ ...STORED, topic: "B", resources: "R2" });
  });

  it("three conflicts in a row hold the value, mark error and call onConflict once", async () => {
    server.blobs = [{ projectId: "p1", kind: "citations", body: JSON.stringify([A]), keyVersion: 0, deks: [] }];
    let racing = true;
    let n = 0;
    // Another window saves just before each of these PUTs reaches the server.
    h.api.mockImplementation((path: string, init?: RequestInit) => {
      if (racing && init?.method === "PUT" && path.endsWith("/citations")) { n++; elsewhere("p1", "citations", [...(JSON.parse(blobOf("p1", "citations").body) as unknown[]), { author: `W${n}` }]); }
      return fakeApi(path, init);
    });
    const s = await mount("citations", "p1");
    await until(() => !s.b.loading);
    act(() => { s.b.set(add(Y)); });
    let ok: boolean | undefined;
    await act(async () => { ok = await s.b.flush(); });
    expect(ok).toBe(false);
    expect(putsTo("p1", "citations")).toHaveLength(3);
    expect(blobOf("p1", "citations").version).toBe(4);
    expect(JSON.parse(blobOf("p1", "citations").body)).toEqual([A, { author: "W1" }, { author: "W2" }, { author: "W3" }]);
    // Held, with the newest value read under it; shown, and leaving the page asks first.
    expect(s.b).toMatchObject({ value: [A, { author: "W1" }, { author: "W2" }, Y], error: true });
    expect(shouldWarnOnUnloadBlobs()).toBe(true);
    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(h.toast).toHaveBeenCalledWith(en.blob_conflict);
    // Nothing more is sent on its own.
    await settle(BLOB_SAVE_DEBOUNCE_MS + 100);
    expect(putsTo("p1", "citations")).toHaveLength(3);
    // The next edit saves it, replayed onto what the other window saved.
    racing = false;
    const Z = { author: "Ok, Z." };
    act(() => { s.b.set(add(Z)); });
    await act(async () => { ok = await s.b.flush(); });
    expect(ok).toBe(true);
    expect(JSON.parse(blobOf("p1", "citations").body)).toEqual([A, { author: "W1" }, { author: "W2" }, { author: "W3" }, Y, Z]);
    expect(s.b).toMatchObject({ value: [A, { author: "W1" }, { author: "W2" }, { author: "W3" }, Y, Z], error: false });
    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(shouldWarnOnUnloadBlobs()).toBe(false);
  });

  /** Every blob PUT reaches the store; while `lose` is on, the browser hears a network error instead of the answer. */
  function loseAnswers() {
    const st = { lose: false };
    h.api.mockImplementation(async (path: string, init?: RequestInit) => {
      const r = await fakeApi(path, init);
      if (st.lose && init?.method === "PUT" && path.includes("/blobs/")) throw new TypeError("Failed to fetch");
      return r;
    });
    return st;
  }

  it("a save whose response is lost is not replayed twice", async () => {
    server.blobs = [{ projectId: "p1", kind: "citations", body: JSON.stringify([A]), keyVersion: 0, deks: [] }];
    const net = loseAnswers();
    const s = await mount("citations", "p1");
    await until(() => !s.b.loading);
    net.lose = true;
    act(() => { s.b.set(add(Y)); });
    let ok: boolean | undefined;
    await act(async () => { ok = await s.b.flush(); });
    // Stored, but this tab does not know it.
    expect(ok).toBe(false);
    expect(s.b.error).toBe(true);
    expect(JSON.parse(blobOf("p1", "citations").body)).toEqual([A, Y]);
    expect(blobOf("p1", "citations").version).toBe(2);
    net.lose = false;
    const Z = { author: "Ok, Z." };
    act(() => { s.b.set(add(Z)); });
    await act(async () => { ok = await s.b.flush(); });
    expect(ok).toBe(true);
    // The next save named the old version (409), read the lost save back, and replayed only the later edit.
    expect(putsTo("p1", "citations").map((c) => c.ifMatch)).toEqual(['"1"', '"1"', '"2"']);
    expect(JSON.parse(blobOf("p1", "citations").body)).toEqual([A, Y, Z]);
    expect(s.b).toMatchObject({ value: [A, Y, Z], error: false });
    expect(shouldWarnOnUnloadBlobs()).toBe(false);
  });

  it("a save whose response is lost is not replayed twice by the held-blobs drain", async () => {
    server.blobs = [{ projectId: "p1", kind: "citations", body: JSON.stringify([A]), keyVersion: 0, deks: [] }];
    const net = loseAnswers();
    const s = await mount("citations", "p1");
    await until(() => !s.b.loading);
    net.lose = true;
    act(() => { s.b.set(add(Y)); });
    // The panel goes away; its last save is stored but its answer is lost, so the edit is held.
    s.unmount();
    await until(() => heldBlobs.has("blob:p1:citations"));
    expect(JSON.parse(blobOf("p1", "citations").body)).toEqual([A, Y]);
    net.lose = false;
    await act(async () => { await heldBlobs.drain(); });
    expect(heldBlobs.size).toBe(0);
    expect(JSON.parse(blobOf("p1", "citations").body)).toEqual([A, Y]);
    // A new mount reads it once, too.
    const t = await mount("citations", "p1");
    await until(() => !t.b.loading);
    expect(t.b.value).toEqual([A, Y]);
  });

  it("a save whose response is lost, then overwritten elsewhere, still replays the edit onto the newer value", async () => {
    server.blobs = [{ projectId: "p1", kind: "idea_intake", body: JSON.stringify(STORED), keyVersion: 0, deks: [] }];
    const net = loseAnswers();
    const s = await mount("idea_intake", "p1");
    await until(() => !s.b.loading);
    // The lost save never reached the store this time (the network failed before it).
    h.api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (net.lose && init?.method === "PUT") throw new TypeError("Failed to fetch");
      return fakeApi(path, init);
    });
    net.lose = true;
    act(() => { s.b.set((p: IdeaIntake | null) => ({ ...p!, topic: "B" })); });
    await act(async () => { await s.b.flush(); });
    elsewhere("p1", "idea_intake", { ...STORED, resources: "R2" });
    net.lose = false;
    await act(async () => { await s.b.flush(); });
    expect(JSON.parse(blobOf("p1", "idea_intake").body)).toEqual({ ...STORED, topic: "B", resources: "R2" });
    expect(s.b.error).toBe(false);
  });

  it("a save whose answer is a 5xx after the store took it (a gateway timeout) is not replayed twice", async () => {
    server.blobs = [{ projectId: "p1", kind: "citations", body: JSON.stringify([A]), keyVersion: 0, deks: [] }];
    let gateway = false;
    h.api.mockImplementation(async (path: string, init?: RequestInit) => {
      const r = await fakeApi(path, init);
      if (gateway && init?.method === "PUT" && path.includes("/blobs/")) throw new ApiError(504, "gateway-timeout");
      return r;
    });
    const s = await mount("citations", "p1");
    await until(() => !s.b.loading);
    gateway = true;
    act(() => { s.b.set(add(Y)); });
    let ok: boolean | undefined;
    await act(async () => { ok = await s.b.flush(); });
    expect(ok).toBe(false);
    expect(s.b.error).toBe(true);
    expect(JSON.parse(blobOf("p1", "citations").body)).toEqual([A, Y]);
    gateway = false;
    const Z = { author: "Ok, Z." };
    act(() => { s.b.set(add(Z)); });
    await act(async () => { ok = await s.b.flush(); });
    expect(ok).toBe(true);
    expect(putsTo("p1", "citations").map((c) => c.ifMatch)).toEqual(['"1"', '"1"', '"2"']);
    expect(JSON.parse(blobOf("p1", "citations").body)).toEqual([A, Y, Z]);
    expect(s.b).toMatchObject({ value: [A, Y, Z], error: false });
  });

  it("a 4xx answer is a known failure: the next save sends the edit again", async () => {
    server.blobs = [{ projectId: "p1", kind: "citations", body: JSON.stringify([A]), keyVersion: 0, deks: [] }];
    let refuse = false;
    h.api.mockImplementation((path: string, init?: RequestInit) => {
      if (refuse && init?.method === "PUT" && path.includes("/blobs/")) { server.calls.push({ path, method: "PUT" }); return Promise.reject(new ApiError(413, "too-large")); }
      return fakeApi(path, init);
    });
    const s = await mount("citations", "p1");
    await until(() => !s.b.loading);
    refuse = true;
    act(() => { s.b.set(add(Y)); });
    await act(async () => { await s.b.flush(); });
    expect(s.b.error).toBe(true);
    refuse = false;
    await act(async () => { await s.b.flush(); });
    expect(JSON.parse(blobOf("p1", "citations").body)).toEqual([A, Y]);
    expect(s.b).toMatchObject({ value: [A, Y], error: false });
  });

  it("a 409 re-read that finds a blob that will not open holds the value and shows broken; nothing is written until the panel sets over it (R16)", async () => {
    server.blobs = [{ projectId: "p1", kind: "citations", body: JSON.stringify([A]), keyVersion: 0, deks: [] }];
    const s = await mount("citations", "p1");
    await until(() => !s.b.loading);
    // Another window (or a damaged write) leaves a body this build cannot read.
    const cur = blobOf("p1", "citations");
    server.blobs = [{ ...cur, body: "{not json", version: 2 }];
    act(() => { s.b.set(add(Y)); });
    let ok: boolean | undefined;
    await act(async () => { ok = await s.b.flush(); });
    expect(ok).toBe(false);
    expect(putsTo("p1", "citations").map((c) => c.ifMatch)).toEqual(['"1"']);
    expect(blobOf("p1", "citations").body).toBe("{not json");
    // The panel is told (broken), and still shows the student's own held value: useLibrary asks before its next write.
    expect(s.b).toMatchObject({ value: [A, Y], broken: true });
    expect(shouldWarnOnUnloadBlobs()).toBe(true);
    // Neither a flush nor the debounce sends it on its own.
    await act(async () => { ok = await s.b.flush(); });
    expect(ok).toBe(false);
    await settle(BLOB_SAVE_DEBOUNCE_MS + 100);
    expect(putsTo("p1", "citations")).toHaveLength(1);
    expect(blobOf("p1", "citations").body).toBe("{not json");
    // The student said yes (R16): the next set goes on from what this window held, and is saved over the broken blob.
    const Z = { author: "Ok, Z." };
    act(() => { s.b.set(add(Z)); });
    expect(s.b.value).toEqual([A, Y, Z]);
    await act(async () => { ok = await s.b.flush(); });
    expect(ok).toBe(true);
    expect(putsTo("p1", "citations").map((c) => c.ifMatch)).toEqual(['"1"', '"2"']);
    expect(JSON.parse(blobOf("p1", "citations").body)).toEqual([A, Y, Z]);
    expect(s.b).toMatchObject({ value: [A, Y, Z], broken: false, error: false });
    expect(shouldWarnOnUnloadBlobs()).toBe(false);
  });

  it("while a value is held over an unreadable blob, value is the held value (broken stays reported); a kind with an R16 guard saves it only after the next set", async () => {
    server.blobs = [{ projectId: "p1", kind: "ap_cols", body: JSON.stringify(["a"]), keyVersion: 0, deks: [] }];
    const s = await mount("ap_cols", "p1");
    await until(() => !s.b.loading);
    server.blobs = [{ ...blobOf("p1", "ap_cols"), body: "{not json", version: 2 }];
    act(() => { s.b.set((p: string[] | null) => [...(p ?? []), "b"]); });
    await act(async () => { await s.b.flush(); });
    expect(s.b).toMatchObject({ value: ["a", "b"], broken: true });
    // A guarded panel asks the student, then sets: the set goes on from the held value and the blob is replaced.
    act(() => { s.b.set((p: string[] | null) => [...(p ?? []), "c"]); });
    expect(s.b).toMatchObject({ value: ["a", "b", "c"], broken: false });
    await act(async () => { await s.b.flush(); });
    expect(JSON.parse(blobOf("p1", "ap_cols").body)).toEqual(["a", "b", "c"]);
  });

  it("a kind with no R16 guard (idea_intake): the held value is shown, the next edit lands on it and is NOT saved over the unreadable blob", async () => {
    server.blobs = [{ projectId: "p1", kind: "idea_intake", body: JSON.stringify(INTAKE), keyVersion: 0, deks: [] }];
    const s = await mount("idea_intake", "p1");
    await until(() => !s.b.loading);
    server.blobs = [{ ...blobOf("p1", "idea_intake"), body: "{not json", version: 2 }];
    act(() => { s.b.set((p: IdeaIntake | null) => ({ ...p!, timeframe: "one year" })); });
    let ok: boolean | undefined;
    await act(async () => { ok = await s.b.flush(); });
    expect(ok).toBe(false);
    expect(s.b).toMatchObject({ value: NEXT, broken: true });
    // The next keystroke goes on from the held value, so no other field is lost, and nothing is sent.
    act(() => { s.b.set((p: IdeaIntake | null) => ({ ...p!, constraints: "evenings only" })); });
    expect(s.b).toMatchObject({ value: { ...NEXT, constraints: "evenings only" }, broken: true });
    await settle(BLOB_SAVE_DEBOUNCE_MS + 100);
    await act(async () => { ok = await s.b.flush(); });
    expect(ok).toBe(false);
    expect(putsTo("p1", "idea_intake").map((c) => c.ifMatch)).toEqual(['"1"']);
    expect(blobOf("p1", "idea_intake").body).toBe("{not json");
    expect(shouldWarnOnUnloadBlobs()).toBe(true);
    // Gone with the panel: the drain has nobody to ask either.
    s.unmount();
    await settle(50);
    await act(async () => { await heldBlobs.drain(); });
    expect(putsTo("p1", "idea_intake")).toHaveLength(1);
    expect(blobOf("p1", "idea_intake").body).toBe("{not json");
  });

  it("a preference kind (close_prefs) has no R16 ask, as rs_prefs; a tool's work kind (design_reg) keeps it (fix round 1)", async () => {
    server.blobs = [{ projectId: "p1", kind: "close_prefs", body: JSON.stringify({ k: 6 }), keyVersion: 0, deks: [] }, { projectId: "p1", kind: "design_reg", body: JSON.stringify({ type: "drug" }), keyVersion: 0, deks: [] }];
    const p = await mount("close_prefs", "p1");
    const w = await mount("design_reg", "p1");
    await until(() => !p.b.loading && !w.b.loading);
    server.blobs = server.blobs.map((b) => ({ ...b, body: "{not json", version: 2 }));
    act(() => { p.b.set({ k: 8 }); w.b.set({ type: "device" }); });
    await act(async () => { await p.b.flush(); await w.b.flush(); });
    expect([p.b.broken, w.b.broken]).toEqual([true, true]);
    // The next set: the guarded kind takes it as the panel's go-ahead and saves; the preference stays held, never saved over the blob unasked.
    act(() => { p.b.set({ k: 5 }); w.b.set({ type: "observational" }); });
    await act(async () => { await p.b.flush(); await w.b.flush(); });
    await settle(BLOB_SAVE_DEBOUNCE_MS + 100);
    expect(JSON.parse(blobOf("p1", "design_reg").body)).toEqual({ type: "observational" });
    expect(blobOf("p1", "close_prefs").body).toBe("{not json");
    expect(putsTo("p1", "close_prefs")).toHaveLength(1);
  });

  it("a value held over a broken blob is not sent by the held-blobs drain once the panel goes away (no panel to ask, R16)", async () => {
    server.blobs = [{ projectId: "p1", kind: "citations", body: JSON.stringify([A]), keyVersion: 0, deks: [] }];
    const s = await mount("citations", "p1");
    await until(() => !s.b.loading);
    server.blobs = [{ ...blobOf("p1", "citations"), body: "{not json", version: 2 }];
    act(() => { s.b.set(add(Y)); });
    await act(async () => { await s.b.flush(); });
    expect(s.b.broken).toBe(true);
    s.unmount();
    await settle(50);
    await act(async () => { await heldBlobs.drain(); });
    expect(putsTo("p1", "citations")).toHaveLength(1);
    expect(blobOf("p1", "citations").body).toBe("{not json");
  });

  it("a 409 re-read that finds the blob deleted elsewhere (a shelf paper removed) drops the edits: nothing is re-created", async () => {
    const kind = shelfPaperKind("x1");
    const PAPER = { pages: ["Page one."], notes: [], cells: {} };
    server.blobs = [{ projectId: "p1", kind, body: JSON.stringify(PAPER), keyVersion: 0, deks: [], version: 3 }];
    const s = await mount(kind, "p1");
    await until(() => !s.b.loading);
    // Another window removes the paper from the shelf, which deletes its blob.
    server.blobs = [];
    act(() => { s.b.set((p: typeof PAPER | null) => ({ ...(p ?? PAPER), cells: { Sample: "40" } })); });
    let ok: boolean | undefined;
    await act(async () => { ok = await s.b.flush(); });
    expect(putsTo("p1", kind).map((c) => c.ifMatch)).toEqual(['"3"']);
    expect(server.blobs).toEqual([]);
    // What the server has now: no blob. Nothing is left to send, and nothing is sent later.
    expect(ok).toBe(true);
    expect(s.b).toMatchObject({ value: null, error: false });
    expect(shouldWarnOnUnloadBlobs()).toBe(false);
    await settle(BLOB_SAVE_DEBOUNCE_MS + 100);
    expect(putsTo("p1", kind)).toHaveLength(1);
    expect(server.blobs).toEqual([]);
  });

  it("an api without versions gets no If-Match", async () => {
    server.versionless = true;
    server.blobs = [{ projectId: "p1", kind: "rs_prefs", body: JSON.stringify({ rank: false }), keyVersion: 0, deks: [] }];
    const s = await mount("rs_prefs", "p1");
    await until(() => !s.b.loading);
    act(() => { s.b.set({ rank: true }); });
    await act(async () => { await s.b.flush(); });
    act(() => { s.b.set({ rank: false }); });
    await act(async () => { await s.b.flush(); });
    expect(putsTo("p1", "rs_prefs")).toHaveLength(2);
    expect(putsTo("p1", "rs_prefs").map((c) => c.ifMatch)).toEqual([undefined, undefined]);
    const inits = h.api.mock.calls.filter(([, i]) => (i as RequestInit | undefined)?.method === "PUT").map(([, i]) => (i as RequestInit).headers);
    expect(inits).toEqual([undefined, undefined]);
  });

  it("the held-blobs drain (headless) resolves a conflict the same way", async () => {
    server.blobs = [{ projectId: "p1", kind: "citations", body: JSON.stringify([A]), keyVersion: 0, deks: [] }];
    let offline = false;
    let raceOnce = false;
    const W = { author: "Wu, W.", title: "Saved while the drain was reading" };
    h.api.mockImplementation((path: string, init?: RequestInit) => {
      if (init?.method === "PUT" && path.endsWith("/citations")) {
        if (offline) { server.calls.push({ path, method: "PUT" }); return Promise.reject(new TypeError("Failed to fetch")); }
        if (raceOnce) { raceOnce = false; elsewhere("p1", "citations", [...(JSON.parse(blobOf("p1", "citations").body) as unknown[]), W]); }
      }
      return fakeApi(path, init);
    });
    const s = await mount("citations", "p1");
    await until(() => !s.b.loading);
    offline = true;
    act(() => { s.b.set(add(Y)); });
    s.unmount();
    await until(() => heldBlobs.has("blob:p1:citations"));
    // While this tab was offline another window added X; and another save lands between the drain's read and its save.
    elsewhere("p1", "citations", [A, X]);
    offline = false;
    raceOnce = true;
    await act(async () => { await heldBlobs.drain(); });
    expect(heldBlobs.size).toBe(0);
    expect(JSON.parse(blobOf("p1", "citations").body)).toEqual([A, X, W, Y]);
    const sent = putsTo("p1", "citations").filter((c) => c.body);
    expect(sent.map((c) => c.ifMatch)).toEqual(['"2"', '"3"']);
    expect(h.ask).not.toHaveBeenCalled();
    expect(shouldWarnOnUnloadBlobs()).toBe(false);
  });
});

describe("the pop-out's write guard and the two windows' sync (v1 POPOUT_WRITABLE 1964, the storage listener 7614-7616; register row D-S2-43)", () => {
  let ch: FakeChannel;
  beforeEach(() => { ch = new FakeChannel(); setSyncChannel(ch); });
  afterEach(() => { setSyncChannel(undefined); window.history.replaceState(null, "", "/"); });
  const litWindow = () => window.history.replaceState(null, "", "/p/p1/lit/citations?window=1");
  const ideaWindow = () => window.history.replaceState(null, "", "/p/p1/idea?window=1");

  it("in a Literature window idea_intake is read, and set is a no-op that holds nothing; flush resolves false", async () => {
    litWindow();
    server.blobs = [{ projectId: "p1", kind: "idea_intake", body: JSON.stringify(INTAKE), keyVersion: 0, deks: [] }];
    const s = await mount("idea_intake", "p1");
    await until(() => !s.b.loading);
    expect(s.b.value).toEqual(INTAKE);
    expect(s.b.readOnly).toBe(true);
    act(() => { s.b.set(NEXT); });
    expect(s.b.value).toEqual(INTAKE);
    expect(shouldWarnOnUnloadBlobs()).toBe(false);
    let ok: boolean | undefined;
    await act(async () => { ok = await s.b.flush(); });
    expect(ok).toBe(false);
    await settle(BLOB_SAVE_DEBOUNCE_MS + 100);
    expect(server.calls.filter((c) => c.method === "PUT")).toHaveLength(0);
    s.unmount();
    expect(heldBlobs.take(blobId("p1", "idea_intake"))).toBeFalsy();
  });

  it.each(["citations", "refcheck_cache", "rs_prefs", "ap_notes", "shelf_cols", "ap_cols"] as const)("in an Idea window %s sends nothing", async (kind) => {
    ideaWindow();
    const s = await mount(kind, "p1");
    await until(() => !s.b.loading);
    expect(s.b.readOnly).toBe(true);
    act(() => { s.b.set((prev: unknown) => (Array.isArray(prev) || prev === null ? ["x"] : { ...(prev as object), x: 1 }) as never); });
    await settle(BLOB_SAVE_DEBOUNCE_MS + 100);
    expect(server.calls.filter((c) => c.method === "PUT")).toHaveLength(0);
  });

  it("in a Literature window every Literature kind writes as anywhere: the library, both caches, the shelf's list, a paper and its columns", async () => {
    litWindow();
    const c = await mount("citations", "p1");
    const r = await mount("retraction_cache", "p1");
    const k = await mount("refcheck_cache", "p1");
    const i = await mount("shelf_index", "p1");
    const p = await mount(shelfPaperKind("x"), "p1");
    const cols = await mount("shelf_cols", "p1");
    await until(() => [c, r, k, i, p, cols].every((m) => !m.b.loading));
    expect([c, r, k, i, p, cols].map((m) => m.b.readOnly)).toEqual([false, false, false, false, false, false]);
    act(() => {
      c.b.set([{ author: "Ng, A.", title: "T" }]); r.b.set({ "10.1/x": { r: false, t: 1 } }); k.b.set({ "ng|2020|t": { s: "nf", t: 1 } });
      i.b.set([]); p.b.set({ pages: ["t"], notes: [], cells: {} }); cols.b.set(["Age"]);
    });
    await until(() => (["citations", "retraction_cache", "refcheck_cache", "shelf_index", shelfPaperKind("x"), "shelf_cols"] as const).every((x) => putsTo("p1", x).length === 1));
  });

  it("a pop-out of Review cannot write a collect kind", async () => {
    window.history.replaceState(null, "", "/p/p1/review/closeness?window=1");
    const sets = await mount("stats_sets", "p1");
    const codes = await mount("qual_codes", "p1");
    const close = await mount("close_prefs", "p1");
    const viva = await mount("viva_log", "p1");
    await until(() => [sets, codes, close, viva].every((m) => !m.b.loading));
    expect([sets, codes, close, viva].map((m) => m.b.readOnly)).toEqual([true, true, false, false]);
    expect([blobWritable("stats_sets"), blobWritable("stats_prefs"), blobWritable("design_reg"), blobWritable("close_prefs"), blobWritable("viva_log")]).toEqual([false, false, false, true, true]);
    act(() => {
      sets.b.set({ x: { hash: "h", ts: 1, n: 2 } }); codes.b.set([{ id: "c1", name: "Coping", parentId: null, color: "#f59e0b" }]);
      close.b.set({ k: 8, min: 10 }); viva.b.set([{ t: 1, aud: "viva", q: "Q", a: "A" }]);
    });
    await until(() => putsTo("p1", "close_prefs").length === 1 && putsTo("p1", "viva_log").length === 1);
    await settle(BLOB_SAVE_DEBOUNCE_MS + 100);
    expect([putsTo("p1", "stats_sets"), putsTo("p1", "qual_codes")]).toEqual([[], []]);
  });

  it("the writing window writes every kind", async () => {
    const s = await mount("idea_intake", "p1");
    await until(() => !s.b.loading);
    expect(s.b.readOnly).toBe(false);
    act(() => { s.b.set(NEXT); });
    await until(() => putsTo("p1", "idea_intake").length === 1);
  });

  it("a saved blob of any kind is announced on appu_sync, as a place's window may write any kind of its stage; a shelf paper is not", async () => {
    const c = await mount("citations", "p1");
    const p = await mount("rs_prefs", "p1");
    const x = await mount(shelfPaperKind("x"), "p1");
    await until(() => !c.b.loading && !p.b.loading && !x.b.loading);
    act(() => { c.b.set([{ author: "Ng, A.", title: "T" }]); p.b.set({ rank: true }); x.b.set({ pages: ["t"], notes: [], cells: {} }); });
    await until(() => putsTo("p1", "citations").length === 1 && putsTo("p1", "rs_prefs").length === 1 && putsTo("p1", shelfPaperKind("x")).length === 1);
    await settle();
    expect(ch.sent).toEqual(expect.arrayContaining([{ type: "blob", id: blobId("p1", "citations") }, { type: "blob", id: blobId("p1", "rs_prefs") }]));
    expect(ch.sent).toHaveLength(2);
  });

  it("an announced library is read again, so the other window's addition shows here", async () => {
    const A = { author: "Ng, A.", title: "Stored" }, B = { author: "Ho, B.", title: "Added in the pop-out" };
    server.blobs = [{ projectId: "p1", kind: "citations", body: JSON.stringify([A]), keyVersion: 0, deks: [] }];
    const s = await mount("citations", "p1");
    await until(() => !s.b.loading);
    server.blobs = [{ projectId: "p1", kind: "citations", body: JSON.stringify([A, B]), keyVersion: 0, deks: [] }];
    act(() => { ch.deliver({ type: "blob", id: blobId("p2", "citations") }); ch.deliver({ type: "blob", id: blobId("p1", "rs_prefs") }); });
    await settle();
    expect(s.b.value).toEqual([A]);
    act(() => { ch.deliver({ type: "blob", id: blobId("p1", "citations") }); });
    await until(() => (s.b.value as unknown[]).length === 2);
    expect(s.b.value).toEqual([A, B]);
    expect(server.calls.filter((c) => c.method === "PUT")).toHaveLength(0);
  });

  it("an edit made while a re-read is out lands on the fresh value and is sent", async () => {
    const A = { author: "Ng, A.", title: "Stored" }, C = { author: "Li, C.", title: "From the pop-out" }, B = { author: "Ho, B.", title: "Added here meanwhile" };
    server.blobs = [{ projectId: "p1", kind: "citations", body: JSON.stringify([A]), keyVersion: 0, deks: [] }];
    const s = await mount("citations", "p1");
    await until(() => !s.b.loading);
    server.blobs = [{ projectId: "p1", kind: "citations", body: JSON.stringify([A, C]), keyVersion: 0, deks: [] }];
    let answer: (() => void) | null = null;
    h.api.mockImplementation((path: string, init?: RequestInit) => (!init?.method && path.endsWith("/citations") && !answer
      ? new Promise((done) => { answer = () => done(fakeApi(path, init)); }) : fakeApi(path, init)));
    act(() => { ch.deliver({ type: "blob", id: blobId("p1", "citations") }); });
    await until(() => answer !== null);
    act(() => { s.b.set((prev: unknown[] | null) => [...(prev ?? []), B]); });
    await act(async () => { answer!(); });
    await until(() => putsTo("p1", "citations").length === 1);
    expect(JSON.parse((putsTo("p1", "citations")[0]!.body as { body: string }).body)).toEqual([A, C, B]);
    expect(s.b.value).toEqual([A, C, B]);
    expect(shouldWarnOnUnloadBlobs()).toBe(false);
  });

  it("an edit made while a re-read is out that then fails lands on what was shown and is sent", async () => {
    const A = { author: "Ng, A.", title: "Stored" }, B = { author: "Ho, B.", title: "Added here meanwhile" };
    server.blobs = [{ projectId: "p1", kind: "citations", body: JSON.stringify([A]), keyVersion: 0, deks: [] }];
    const s = await mount("citations", "p1");
    await until(() => !s.b.loading);
    let fail: (() => void) | null = null;
    h.api.mockImplementation((path: string, init?: RequestInit) => (!init?.method && path.endsWith("/citations") && !fail
      ? new Promise((_done, reject) => { fail = () => reject(new TypeError("Failed to fetch")); }) : fakeApi(path, init)));
    act(() => { ch.deliver({ type: "blob", id: blobId("p1", "citations") }); });
    await until(() => fail !== null);
    act(() => { s.b.set((prev: unknown[] | null) => [...(prev ?? []), B]); });
    await act(async () => { fail!(); });
    await until(() => putsTo("p1", "citations").length === 1);
    expect(JSON.parse((putsTo("p1", "citations")[0]!.body as { body: string }).body)).toEqual([A, B]);
    expect(s.b.value).toEqual([A, B]);
    expect(shouldWarnOnUnloadBlobs()).toBe(false);
  });

  it("a re-read that fails keeps what was shown", async () => {
    const A = { author: "Ng, A.", title: "Stored" };
    server.blobs = [{ projectId: "p1", kind: "citations", body: JSON.stringify([A]), keyVersion: 0, deks: [] }];
    const s = await mount("citations", "p1");
    await until(() => !s.b.loading);
    h.api.mockImplementation(async () => { throw new TypeError("Failed to fetch"); });
    act(() => { ch.deliver({ type: "blob", id: blobId("p1", "citations") }); });
    await settle();
    expect(s.b.value).toEqual([A]);
    expect(s.b.error).toBeFalsy();
  });
});
