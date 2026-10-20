// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rsEntryFromResult } from "@appuscholar/core";
import { decryptText, encryptText, generateDek, generateKeypair, generateVaultKey, sealVaultCheck, unwrapKey, wrapKey, wrapPrivateKey, wrapWithPassphrase, wrapWithRecovery } from "../lib/vault/crypto";

/*
 * Review Focus 1, at the panel: after a reload with the vault locked, the Research search works (it stores nothing), and "+ Citation library" asks
 * for the passphrase once and then saves the paper on top of the stored library, sealed. The panel runs with the real blob hook and vault
 * (useProjectBlob, VaultProvider), the API mocked and the passphrase dialog driven by a mock.
 */

const h = vi.hoisted(() => ({ api: vi.fn(), ask: vi.fn(), toast: vi.fn() }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u-rs", scratchProjectId: "p1" }, settings: { field: "psychology" }, update: async () => undefined }) }));
vi.mock("@/components/workspace/dialogs/Passphrase", async () => (await import("./support/passphraseMock")).passphraseMock(h.ask));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/components/workspace/WorkspaceContext", () => ({
  useWorkspace: () => ({ project: { id: "p2" }, projectId: "p2", pendingSearch: null, setPendingSearch: () => {}, showTool: () => {}, dockShow: () => {} })
}));
vi.mock("@/lib/ai/useCallAI", async (orig) => ({ ...(await orig<typeof import("../lib/ai/useCallAI")>()), useCallAI: () => async () => "" }));
vi.mock("@/lib/ai/suggestion", () => ({ useSuggestion: () => ({ editor: null }) }));
vi.mock("@/lib/research/oaKey", () => ({ useOpenAlexKey: () => null }));

import { ApiError } from "../lib/api";
import { VaultProvider } from "../lib/vault/useVault";
import { ResearchPanel } from "../components/tools/research/ResearchPanel";
import { resetResearch } from "../lib/research/useSearch";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const PASS = "right passphrase";
const SMITH = { author: "Smith, John", year: "2020", title: "Sleep and memory" };

const CORE_TEST = join(__dirname, "../../../packages/core/test");
type Rec = { url: string; status: number; headers: Record<string, string | null>; body: string };
const RECS = new Map<string, Rec>(readdirSync(join(CORE_TEST, "fetch/recorded")).filter((f) => f.endsWith(".json") && f !== "v2-manifest.json").map((f) => {
  const r = JSON.parse(readFileSync(join(CORE_TEST, "fetch/recorded", f), "utf8")) as Rec;
  return [r.url, r];
}));
type Case = { name: string; in: { topic: string }; merged: Array<Record<string, unknown> & { title: string }>; status: string };
const OA_PLAIN = (JSON.parse(readFileSync(join(CORE_TEST, "golden/fetch/cases.json"), "utf8")) as { searches: Case[] }).searches.find((c) => c.name === "oa-plain")!;

type Wire = { kind: string; body: string; keyVersion: number; deks: Array<{ v: number; wrapped: string }>; updatedAt: string };
let vk: CryptoKey;
let blobs: Record<string, Wire>;
const puts: Array<{ path: string; body: Wire }> = [];
async function setup() {
  vk = await generateVaultKey();
  const kp = await generateKeypair();
  const record = { passWrapped: await wrapWithPassphrase(vk, PASS), recoveryWrapped: await wrapWithRecovery(vk, "AAAAA-BBBBB-CCCCC-DDDDD"), checkWrapped: await sealVaultCheck(vk), publicKey: kp.publicKeyB64, privateKeyWrapped: await wrapPrivateKey(kp.privateKey, vk), complete: true, updatedAt: new Date().toISOString() };
  const dek = await generateDek();
  blobs = { citations: { kind: "citations", body: await encryptText(JSON.stringify([SMITH]), dek), keyVersion: 1, deks: [{ v: 1, wrapped: await wrapKey(dek, vk) }], updatedAt: "2026-10-19T00:00:00Z" } };
  h.api.mockImplementation((path: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    if (path === "/me/vault") return Promise.resolve({ ...record });
    const m = /^\/projects\/p2\/blobs\/(\w+)$/.exec(path);
    if (m && method === "GET") return blobs[m[1]!] ? Promise.resolve({ ...blobs[m[1]!] }) : Promise.reject(new ApiError(404, "not-found"));
    if (m && method === "PUT") {
      const b = JSON.parse(String(init.body)) as { body: string; keyVersion: number; dek?: { v: number; wrapped: string } };
      const prev = blobs[m[1]!];
      const wire: Wire = { kind: m[1]!, body: b.body, keyVersion: b.keyVersion, deks: prev?.deks?.length ? prev.deks : b.dek ? [b.dek] : [], updatedAt: new Date().toISOString() };
      blobs[m[1]!] = wire;
      puts.push({ path, body: wire });
      return Promise.resolve({ ...wire });
    }
    return Promise.reject(new ApiError(404, "not-found"));
  });
}
async function open(w: Wire): Promise<unknown> {
  const dek = await unwrapKey(w.deks[0]!.wrapped, vk);
  return JSON.parse(await decryptText(w.body, dek));
}

let requested: string[] = [];
const fakeFetch = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  requested.push(url);
  const r = RECS.get(url);
  if (!r) throw new TypeError("Failed to fetch");
  return new Response(r.body, { status: r.status, headers: r.headers["content-type"] ? { "content-type": r.headers["content-type"] } : {} });
});

const roots: Root[] = [];
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel);
async function until(pred: () => boolean, n = 800) {
  for (let i = 0; i < n; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); }
  throw new Error("condition not reached");
}
async function settle(ms = 100) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }

beforeEach(() => { h.api.mockReset(); h.ask.mockReset(); h.toast.mockReset(); puts.length = 0; requested = []; vi.stubGlobal("fetch", fakeFetch); resetResearch(); });
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; vi.unstubAllGlobals(); });

describe("Research with the vault locked after a reload (Review Focus 1)", () => {
  it("the search works and stores nothing; + Citation library asks once, then saves on top of the stored library", async () => {
    await setup();
    // The panel's own read on mount asks (ruling R21's contract); the student cancels it.
    h.ask.mockResolvedValue(null);
    const host = document.body.appendChild(document.createElement("div"));
    const root = createRoot(host);
    roots.push(root);
    await act(async () => { root.render(<VaultProvider><ResearchPanel /></VaultProvider>); });
    await settle(300);
    const mountAsks = h.ask.mock.calls.length;
    expect(mountAsks).toBeLessThanOrEqual(1);

    const topic = $("#rsTopic") as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(topic, OA_PLAIN.in.topic);
      topic.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const pm = $("#rsSrcPubmed") as HTMLInputElement;
    act(() => { pm.click(); });
    await act(async () => { $('[data-testid="rs-find"]')!.click(); });
    await until(() => $('[data-testid="rs-status"]')!.textContent === OA_PLAIN.status);
    expect(document.body.querySelectorAll('[data-testid="rs-card"]')).toHaveLength(8);
    await settle(1000);
    expect(puts).toEqual([]);
    expect(h.ask.mock.calls.length).toBe(mountAsks);

    // + Citation library: one ask, then the library is read, the paper added on top of it and the whole sealed again.
    h.ask.mockReset().mockResolvedValue(PASS);
    const i = OA_PLAIN.merged.findIndex((p) => p.doi);
    await act(async () => { (document.body.querySelectorAll('[data-testid="rs-add"]')[i] as HTMLElement).click(); });
    await until(() => puts.some((p) => p.path === "/projects/p2/blobs/citations"), 1500);
    expect(h.ask).toHaveBeenCalledTimes(1);
    const put = puts.find((p) => p.path === "/projects/p2/blobs/citations")!;
    expect(put.body.keyVersion).toBe(1);
    expect(put.body.body).not.toContain("Smith");
    expect(await open(put.body)).toEqual([SMITH, rsEntryFromResult(OA_PLAIN.merged[i] as never, "apa")]);
    // and the retraction cache is seeded for its DOI, sealed too
    await until(() => puts.some((p) => p.path === "/projects/p2/blobs/retraction_cache"), 1500);
    const cache = (await open(puts.find((p) => p.path === "/projects/p2/blobs/retraction_cache")!.body)) as Record<string, { r: boolean }>;
    expect(Object.keys(cache)).toEqual([String(OA_PLAIN.merged[i]!.doi).toLowerCase()]);
    expect(h.ask).toHaveBeenCalledTimes(1);
  }, 30_000);
});
