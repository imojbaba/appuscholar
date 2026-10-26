// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetRemembered } from "../lib/vault/remember";
import en from "../messages/en.json";

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
import { keyStore, lockKey } from "../lib/ai/keys";
import { KeysProvider, useKeys, type KeysValue } from "../lib/ai/useKeys";
import { useVault, VaultProvider, type VaultValue } from "../lib/vault/useVault";
import { ProviderKey } from "../components/workspace/dialogs/ProviderKey";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The API's CredentialBody rule (apps/api/src/routes/me.ts): three base64url fields. A blob it refuses would never be stored. */
const WIRE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const VAULT_PASS = "vault passphrase 1";

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
  if (m && method === "PUT") {
    const k = String(body?.encryptedKey ?? "");
    if (!WIRE.test(k)) return Promise.reject(new ApiError(400, "invalid"));
    server.creds[m[1]!] = k;
    return Promise.resolve(undefined);
  }
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
  const box: { keys: KeysValue | null; vault: VaultValue | null } = { keys: null, vault: null };
  function Probe() { box.keys = useKeys(); box.vault = useVault(); return null; }
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(<VaultProvider><KeysProvider><Probe />{withDialog && <ProviderKey />}</KeysProvider></VaultProvider>); });
  return { get keys() { return box.keys!; }, get vault() { return box.vault!; } };
}
const credPuts = () => server.calls.filter((c) => c.path.startsWith("/me/credentials/") && c.method === "PUT");

beforeEach(async () => {
  server = { vault: null, creds: {}, calls: [] };
  h.api.mockReset().mockImplementation(fakeApi);
  h.ask.mockReset(); h.toast.mockReset(); h.openSetup.mockReset(); h.ws.closeDialog.mockReset();
  localStorage.clear();
  keyStore.clearSession();
  await forgetRemembered("u1");
});
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });

/** Types into a field as a student does (React's onChange). */
function typeInto(id: string, value: string) {
  const input = $(id) as HTMLInputElement;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("the key window on a first login (no vault yet)", () => {
  it("starts at Remember on this computer, says the key can be locked later, and Save stores it here without opening the vault setup", async () => {
    const s = await mount(true);
    await until(() => s.vault.status === "off" && s.keys.loaded);
    expect(($("key-mode-plain") as HTMLInputElement).checked).toBe(true);
    expect(($("key-mode-pass") as HTMLInputElement).checked).toBe(false);
    expect($("key-mode-later")!.textContent).toBe(en.settings_keymode_later);
    typeInto("key-input", "AIza-secret-1");
    await act(async () => { $("key-save")!.click(); await new Promise((r) => setTimeout(r, 10)); });
    expect(h.openSetup).not.toHaveBeenCalled();
    expect(h.ask).not.toHaveBeenCalled();
    expect(server.calls.some((c) => c.path === "/me/vault" && c.method === "PUT")).toBe(false);
    expect(credPuts()).toHaveLength(0);
    expect(keyStore.getUnlocked("gemini")).toBe("AIza-secret-1");
    expect(keyStore.isPlain("gemini")).toBe(true);
    expect(h.ws.closeDialog).toHaveBeenCalled();
  }, 30_000);

  it("Protect with a passphrase stays a choice: chosen, it opens the setup", async () => {
    const s = await mount(true);
    await until(() => s.vault.status === "off" && s.keys.loaded);
    h.openSetup.mockResolvedValue(false);
    act(() => { ($("key-mode-pass") as HTMLInputElement).click(); });
    expect(($("key-mode-pass") as HTMLInputElement).checked).toBe(true);
    expect($("key-mode-later")).toBeNull();
    typeInto("key-input", "AIza-secret-1");
    await act(async () => { $("key-save")!.click(); await new Promise((r) => setTimeout(r, 10)); });
    expect(h.openSetup).toHaveBeenCalledTimes(1);
  }, 30_000);

  it("with a vault (locked or open), the window starts at Protect with a passphrase", async () => {
    const s = await mount();
    await until(() => s.vault.status === "off" && s.keys.loaded);
    await act(async () => { await s.vault.setup(VAULT_PASS, false); });
    const t = await mount(true);
    await until(() => t.vault.status === "locked" && t.keys.loaded);
    expect(($("key-mode-pass") as HTMLInputElement).checked).toBe(true);
    expect($("key-mode-later")).toBeNull();
  }, 30_000);
});

describe("AI keys locked under the vault", () => {
  it("saving a key in pass mode with the vault off runs setup first, then stores a v2: blob", async () => {
    const s = await mount(true);
    await until(() => s.vault.status === "off" && s.keys.loaded);
    // The setup dialog (mocked here) sets the vault up with the passphrase the student chose there.
    h.openSetup.mockImplementation(async () => { await s.vault.setup(VAULT_PASS, false); return true; });

    typeInto("key-input", "AIza-secret-1");
    // With no vault the window starts at Remember on this computer: Protect with a passphrase is chosen on purpose.
    act(() => { ($("key-mode-pass") as HTMLInputElement).click(); });
    expect(($("key-mode-pass") as HTMLInputElement).checked).toBe(true);
    await act(async () => { $("key-save")!.click(); });
    await until(() => credPuts().length === 1);

    expect(h.openSetup).toHaveBeenCalledTimes(1);
    // Setup first, then the key: the vault record is written before the credential.
    const order = server.calls.map((c) => c.method + " " + c.path);
    expect(order.indexOf("PUT /me/vault")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("PUT /me/vault")).toBeLessThan(order.indexOf("PUT /me/credentials/gemini"));
    // No second passphrase for the key: the vault's passphrase is the key's.
    expect(h.ask).not.toHaveBeenCalled();

    const blob = server.creds.gemini!;
    expect(blob.startsWith("v2.")).toBe(true);
    expect(blob).not.toContain("AIza-secret-1");
    expect(await s.vault.unwrapSecret(blob.slice(3))).toBe("AIza-secret-1");
    await until(() => s.keys.blobs.gemini === blob);
    expect(keyStore.getUnlocked("gemini")).toBe("AIza-secret-1");
    expect(h.ws.closeDialog).toHaveBeenCalled();
  }, 30_000);

  it("Not now in the setup saves nothing", async () => {
    const s = await mount(true);
    await until(() => s.vault.status === "off" && s.keys.loaded);
    h.openSetup.mockResolvedValue(false);
    typeInto("key-input", "AIza-secret-1");
    act(() => { ($("key-mode-pass") as HTMLInputElement).click(); });
    await act(async () => { $("key-save")!.click(); await new Promise((r) => setTimeout(r, 10)); });
    expect(h.openSetup).toHaveBeenCalledTimes(1);
    expect(credPuts()).toHaveLength(0);
    expect(keyStore.getUnlocked("gemini")).toBeNull();
    expect(h.ws.closeDialog).not.toHaveBeenCalled();
  }, 30_000);

  it("a v2 blob is read with the vault key after ensureUnlocked, without the key passphrase", async () => {
    const s = await mount();
    await until(() => s.vault.status === "off" && s.keys.loaded);
    await act(async () => { await s.vault.setup(VAULT_PASS, false); });
    await act(async () => { await s.keys.save("groq", "gsk-secret", "pass"); });
    expect(server.creds.groq!.startsWith("v2.")).toBe(true);

    // A new tab: nothing in memory, the vault locked.
    keyStore.clearSession();
    act(() => { s.vault.lock(); });
    h.ask.mockImplementation(async (a: { kind: string }) => (a.kind === "vault-unlock" ? VAULT_PASS : null));
    let got: string | null = null;
    await act(async () => { got = await s.keys.getUnlocked("groq"); });
    expect(got).toBe("gsk-secret");
    expect(h.ask).toHaveBeenCalledTimes(1);
    expect(h.ask).toHaveBeenCalledWith({ kind: "vault-unlock" });
    expect(keyStore.getUnlocked("groq")).toBe("gsk-secret");

    // Cancelling the vault prompt unlocks nothing.
    keyStore.clearSession();
    act(() => { s.vault.lock(); });
    h.ask.mockResolvedValue(null);
    await act(async () => { got = await s.keys.getUnlocked("groq"); });
    expect(got).toBeNull();
    expect(keyStore.getUnlocked("groq")).toBeNull();
  }, 30_000);

  it("a legacy blob unlocks with the key passphrase and is re-saved as v2:", async () => {
    const legacy = await lockKey("AIza-legacy", "old key pass");
    server.creds.gemini = legacy;
    const s = await mount();
    await until(() => s.vault.status === "off" && s.keys.loaded && s.keys.blobs.gemini === legacy);
    await act(async () => { await s.vault.setup(VAULT_PASS, false); });

    // A wrong passphrase throws and leaves the old blob in place.
    h.ask.mockResolvedValueOnce("not it at all");
    await act(async () => { await expect(s.keys.getUnlocked("gemini")).rejects.toBeDefined(); });
    expect(server.creds.gemini).toBe(legacy);
    expect(credPuts()).toHaveLength(0);

    h.ask.mockResolvedValueOnce("old key pass");
    let got: string | null = null;
    await act(async () => { got = await s.keys.getUnlocked("gemini"); });
    expect(got).toBe("AIza-legacy");
    expect(h.ask).toHaveBeenLastCalledWith({ kind: "unlock", provider: "gemini" });
    expect(keyStore.getUnlocked("gemini")).toBe("AIza-legacy");
    // Re-saved under the vault key, replacing the old blob (one PUT, no DELETE).
    await until(() => credPuts().length === 1);
    const blob = server.creds.gemini!;
    expect(blob).not.toBe(legacy);
    expect(blob.startsWith("v2.")).toBe(true);
    expect(await s.vault.unwrapSecret(blob.slice(3))).toBe("AIza-legacy");
    expect(server.calls.some((c) => c.method === "DELETE")).toBe(false);
    await until(() => s.keys.blobs.gemini === blob);

    // Next time it opens with the vault, never the old key passphrase.
    keyStore.clearSession();
    h.ask.mockReset();
    await act(async () => { got = await s.keys.getUnlocked("gemini"); });
    expect(got).toBe("AIza-legacy");
    expect(h.ask).not.toHaveBeenCalled();
  }, 30_000);

  it("legacy blobs still unlock when there is no vault, and stay as they are", async () => {
    const legacy = await lockKey("AIza-legacy", "old key pass");
    server.creds.gemini = legacy;
    const s = await mount();
    await until(() => s.vault.status === "off" && s.keys.blobs.gemini === legacy);
    h.ask.mockResolvedValueOnce("old key pass");
    let got: string | null = null;
    await act(async () => { got = await s.keys.getUnlocked("gemini"); });
    expect(got).toBe("AIza-legacy");
    expect(server.creds.gemini).toBe(legacy);
    expect(credPuts()).toHaveLength(0);
    // save with a passphrase still writes the legacy form (kept for callers that pass one).
    await act(async () => { await s.keys.save("groq", "gsk-1", "pass", "a key pass"); });
    expect(server.creds.groq!.startsWith("v2.")).toBe(false);
    expect(WIRE.test(server.creds.groq!)).toBe(true);
  }, 30_000);
});
