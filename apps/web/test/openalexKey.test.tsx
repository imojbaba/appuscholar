// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetRemembered } from "../lib/vault/remember";
import en from "../messages/en.json";

/*
 * The OpenAlex key (v1 1186-1190, oaKeySave 8031): the field in Settings (v1 had it in the AI Provider / Key dialog), stored as the
 * credential `openalex` locked under the vault ("v2." + the vault's iv.ct, as an AI key) when there is one, else remembered on this computer (never
 * the vault setup), never an AI provider; useOpenAlexKey opens it once the vault is open and never asks for a passphrase itself.
 */

const h = vi.hoisted(() => ({
  api: vi.fn(), ask: vi.fn(), toast: vi.fn(), openSetup: vi.fn(), update: vi.fn(async () => {}),
  ws: { dialog: "settings", closeDialog: vi.fn(), project: null, reloadProject: vi.fn(), openTerms: vi.fn(), settingsProvider: null }
}));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1" }, settings: {}, update: h.update }) }));
vi.mock("@/components/workspace/dialogs/Passphrase", async () => (await import("./support/passphraseMock")).passphraseMock(h.ask));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/components/workspace/dialogs/VaultSetup", () => ({ openVaultSetup: h.openSetup }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => h.ws }));

import { ApiError } from "../lib/api";
import { keyStore } from "../lib/ai/keys";
import { KeysProvider, useKeys, type KeysValue } from "../lib/ai/useKeys";
import { useVault, VaultProvider, type VaultValue } from "../lib/vault/useVault";
import { useOpenAlexKey } from "../lib/research/oaKey";
import { SettingsWindow } from "../components/workspace/dialogs/Settings";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = en as Record<string, string>;
const VAULT_PASS = "vault passphrase 1";
const KEY = "oa-free-key-123";

type Call = { path: string; method: string; body?: Record<string, unknown> };
let server: { vault: Record<string, unknown> | null; creds: Record<string, string>; calls: Call[] };
function fakeApi(path: string, init: RequestInit = {}) {
  const method = init.method ?? "GET";
  const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
  server.calls.push({ path, method, body });
  if (path === "/me/vault" && method === "GET") return server.vault ? Promise.resolve({ ...server.vault }) : Promise.reject(new ApiError(404, "no-vault"));
  if (path === "/me/vault" && method === "PUT") { server.vault = { ...body, complete: false, updatedAt: new Date().toISOString() }; return Promise.resolve({ ...server.vault }); }
  if (path === "/me/credentials" && method === "GET") return Promise.resolve(Object.entries(server.creds).map(([provider, encryptedKey]) => ({ provider, encryptedKey })));
  const m = /^\/me\/credentials\/(\w+)$/.exec(path);
  if (m && method === "PUT") { server.creds[m[1]!] = String(body?.encryptedKey ?? ""); return Promise.resolve(undefined); }
  if (m && method === "DELETE") { if (!server.creds[m[1]!]) return Promise.reject(new ApiError(404, "not-found")); delete server.creds[m[1]!]; return Promise.resolve(undefined); }
  return Promise.reject(new ApiError(404, "not-found"));
}

const roots: Root[] = [];
const $ = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
async function until(pred: () => boolean) {
  for (let i = 0; i < 400; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); }
  throw new Error("condition not reached");
}
async function mount(withDialog = false) {
  const box: { keys: KeysValue | null; vault: VaultValue | null; oa: string | null } = { keys: null, vault: null, oa: null };
  function Probe() { box.keys = useKeys(); box.vault = useVault(); box.oa = useOpenAlexKey(); return null; }
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(<VaultProvider><KeysProvider><Probe />{withDialog && <SettingsWindow />}</KeysProvider></VaultProvider>); });
  return { get keys() { return box.keys!; }, get vault() { return box.vault!; }, get oa() { return box.oa; } };
}
function typeKey(v: string) {
  const input = $("oa-key-input") as HTMLInputElement;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, v);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => { input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
}
// The vault's own toasts (its migration line after a setup) are not this setting's.
const toasts = () => h.toast.mock.calls.map((c) => c[0] as string).filter((m) => m.startsWith("OpenAlex"));

beforeEach(async () => {
  server = { vault: null, creds: {}, calls: [] };
  h.api.mockReset().mockImplementation(fakeApi);
  h.ask.mockReset(); h.toast.mockReset(); h.openSetup.mockReset(); h.ws.closeDialog.mockReset();
  localStorage.clear();
  keyStore.clearSession();
  await forgetRemembered("u1");
});
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });

describe("the OpenAlex key setting (v1 1186-1190)", () => {
  it("sits below the AI writing language in Settings (the field of study first, in the first-run spec's order), with v1's label, placeholder and note", async () => {
    await mount(true);
    const input = $("oa-key-input") as HTMLInputElement;
    expect(input.type).toBe("password");
    expect(input.placeholder).toBe(E.rs2_oa_key_placeholder);
    expect(document.body.querySelector('label[for="oaKeyIn"]')!.textContent).toBe(E.rs2_oa_key_label);
    expect(input.closest(".field")!.querySelector("p")!.textContent).toBe(E.rs2_oa_key_desc);
    const lang = $("content-lang")!, field = $("field-select")!;
    expect(lang.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(field.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }, 30_000);

  it("with no vault yet, a key is remembered on this computer (as the AI key is then), the vault setup is not opened, and v1's sentence is toasted", async () => {
    const s = await mount(true);
    await until(() => s.vault.status === "off" && s.keys.loaded);
    typeKey("  " + KEY + "  ");
    await until(() => toasts().length === 1);
    expect(toasts()).toEqual([E.rs2_openalex_key_saved_on]);
    expect(h.openSetup).not.toHaveBeenCalled();
    expect(h.ask).not.toHaveBeenCalled();
    expect(server.calls.some((c) => c.path === "/me/vault" && c.method === "PUT")).toBe(false);
    expect(server.creds.openalex).toBeUndefined();
    expect(keyStore.isPlain("openalex")).toBe(true);
    await until(() => s.oa === KEY);
    // not an AI provider: the provider list is unchanged
    expect(s.keys.providersWithKeys()).toEqual([]);
  }, 30_000);

  it("with a vault, a key is stored as the credential openalex, locked under the vault, and toasts v1's sentence", async () => {
    const s = await mount(true);
    await until(() => s.vault.status === "off" && s.keys.loaded);
    await act(async () => { await s.vault.setup(VAULT_PASS, false); });
    typeKey("  " + KEY + "  ");
    await until(() => !!server.creds.openalex);
    expect(h.openSetup).not.toHaveBeenCalled();
    const blob = server.creds.openalex!;
    expect(blob.startsWith("v2.")).toBe(true);
    expect(blob).not.toContain(KEY);
    expect(await s.vault.unwrapSecret(blob.slice(3))).toBe(KEY);
    expect(toasts()).toEqual([E.rs2_openalex_key_saved_on]);
    // not an AI provider: the provider list and the AI keys are unchanged
    await until(() => s.keys.blobs.openalex === blob);
    expect(s.keys.providersWithKeys()).toEqual([]);
    expect(s.oa).toBe(KEY);
  }, 30_000);

  it("an emptied field removes the key and toasts 'OpenAlex key removed'", async () => {
    const s = await mount(true);
    await until(() => s.vault.status === "off" && s.keys.loaded);
    typeKey(KEY);
    await until(() => s.oa === KEY);
    typeKey("");
    await until(() => toasts().length === 2);
    expect(toasts()).toEqual([E.rs2_openalex_key_saved_on, E.rs2_openalex_key_removed]);
    await until(() => s.oa === null);
    expect(keyStore.isPlain("openalex")).toBe(false);
    expect(h.openSetup).not.toHaveBeenCalled();
  }, 30_000);

  it("in a new tab the key stays closed while the vault is locked (no prompt of its own) and opens with the vault", async () => {
    const first = await mount();
    await until(() => first.vault.status === "off" && first.keys.loaded);
    await act(async () => { await first.vault.setup(VAULT_PASS, false); });
    await act(async () => { await first.keys.save("openalex", KEY, "pass"); });
    // A new tab: nothing in memory, the vault locked.
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    keyStore.clearSession();
    await forgetRemembered("u1");
    const s = await mount();
    await until(() => s.vault.status === "locked" && s.keys.blobs.openalex === server.creds.openalex);
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(s.oa).toBeNull();
    expect(h.ask).not.toHaveBeenCalled();
    h.ask.mockImplementation(async (a: { kind: string }) => (a.kind === "vault-unlock" ? VAULT_PASS : null));
    await act(async () => { await s.vault.ensureUnlocked(); });
    await until(() => s.oa === KEY);
    expect(h.ask).toHaveBeenCalledTimes(1);
  }, 30_000);
});
