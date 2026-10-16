// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeypair, generateVaultKey, unwrapWithPassphrase, unwrapWithRecovery, VaultError, wrapPrivateKey, wrapWithPassphrase, wrapWithRecovery } from "../lib/vault/crypto";
import { forgetRemembered, hasRemembered } from "../lib/vault/remember";
import en from "../messages/en.json";

const h = vi.hoisted(() => ({ api: vi.fn(), ask: vi.fn(), toast: vi.fn(), uid: "u1" }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: h.uid } }) }));
vi.mock("@/components/workspace/dialogs/Passphrase", () => ({ askPassphrase: h.ask }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));

import { ApiError } from "../lib/api";
import { useVault, VaultProvider, type VaultValue } from "../lib/vault/useVault";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Rec = { passWrapped: string; recoveryWrapped: string; publicKey: string; privateKeyWrapped: string; complete: boolean; updatedAt: string };
let server: { vault: Rec | null; calls: { path: string; method: string; body?: Record<string, unknown> }[] };

function fakeApi(path: string, init: RequestInit = {}) {
  const method = init.method ?? "GET";
  const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
  server.calls.push({ path, method, body });
  if (path === "/me/vault" && method === "GET") return server.vault ? Promise.resolve({ ...server.vault }) : Promise.reject(new ApiError(404, "no-vault"));
  if (path === "/me/vault" && method === "PUT") { server.vault = { ...(body as Omit<Rec, "complete" | "updatedAt">), complete: false, updatedAt: new Date().toISOString() }; return Promise.resolve(undefined); }
  if (path === "/me/vault/wraps" && method === "PATCH") { const { reason: _r, ...w } = body!; server.vault = { ...server.vault!, ...w }; return Promise.resolve({ ok: true }); }
  if (path === "/me/vault/complete" && method === "POST") { server.vault = { ...server.vault!, complete: true }; return Promise.resolve(undefined); }
  return Promise.reject(new ApiError(404, "not-found"));
}

async function vaultWith(pass: string, code = "AAAAA-BBBBB-CCCCC-DDDDD"): Promise<Rec> {
  const vk = await generateVaultKey();
  const kp = await generateKeypair();
  return { passWrapped: await wrapWithPassphrase(vk, pass), recoveryWrapped: await wrapWithRecovery(vk, code), publicKey: kp.publicKeyB64, privateKeyWrapped: await wrapPrivateKey(kp.privateKey, vk), complete: false, updatedAt: new Date().toISOString() };
}

const roots: Root[] = [];
async function mount() {
  const seen: VaultValue["status"][] = [];
  const box: { v: VaultValue | null } = { v: null };
  function Probe() { const v = useVault(); box.v = v; if (seen[seen.length - 1] !== v.status) seen.push(v.status); return null; }
  const root = createRoot(document.createElement("div"));
  roots.push(root);
  const render = () => root.render(<VaultProvider><Probe /></VaultProvider>);
  await act(async () => { render(); });
  return { get v(): VaultValue { return box.v!; }, seen, render };
}
async function until(pred: () => boolean) {
  for (let i = 0; i < 400; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); }
  throw new Error("condition not reached");
}
const CODE = /^[A-HJ-NP-Z2-9]{5}(-[A-HJ-NP-Z2-9]{5}){3}$/;

beforeEach(async () => {
  server = { vault: null, calls: [] };
  h.uid = "u1";
  h.api.mockReset().mockImplementation(fakeApi);
  h.ask.mockReset();
  h.toast.mockReset();
  await forgetRemembered("u1");
});
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); });

describe("useVault", () => {
  it("setup creates the record, returns a recovery code and leaves the vault unlocked", async () => {
    const s = await mount();
    await until(() => s.v.status === "off");
    expect(s.seen[0]).toBe("loading");
    expect(s.v.complete).toBe(false);
    let out!: { recoveryCode: string };
    await act(async () => { out = await s.v.setup("pw", false); });
    expect(out.recoveryCode).toMatch(CODE);
    const put = server.calls.find((c) => c.path === "/me/vault" && c.method === "PUT")!;
    expect(Object.keys(put.body!).sort()).toEqual(["passWrapped", "privateKeyWrapped", "publicKey", "recoveryWrapped"]);
    for (const v of Object.values(put.body!)) expect(typeof v === "string" && v.length > 0).toBe(true);
    // The server holds wraps that open with the passphrase and with the code, never the key itself.
    await expect(unwrapWithPassphrase(put.body!.passWrapped as string, "pw")).resolves.toBeDefined();
    await expect(unwrapWithRecovery(put.body!.recoveryWrapped as string, out.recoveryCode)).resolves.toBeDefined();
    expect(s.v.status).toBe("unlocked");
    expect(await hasRemembered("u1")).toBe(false);
  }, 30_000);

  it("unlock with the wrong passphrase keeps the vault locked and throws wrong-passphrase", async () => {
    server.vault = await vaultWith("right");
    const s = await mount();
    await until(() => s.v.status === "locked");
    expect(s.seen).toEqual(["loading", "locked"]);
    let err: unknown;
    await act(async () => { await s.v.unlock("wrong", false).catch((e: unknown) => { err = e; }); });
    expect(err).toBeInstanceOf(VaultError);
    expect((err as VaultError).code).toBe("wrong-passphrase");
    expect(s.v.status).toBe("locked");
    await act(async () => { await s.v.unlock("right", false); });
    expect(s.v.status).toBe("unlocked");
    act(() => { s.v.lock(); });
    expect(s.v.status).toBe("locked");
  }, 30_000);

  it("encryptBody adds a dek on first use and decryptBody reads it back", async () => {
    server.vault = await vaultWith("right");
    const s = await mount();
    await until(() => s.v.status === "locked");
    await act(async () => { await s.v.unlock("right", false); });
    const html = "<p>my secret thesis</p>";
    const first = await s.v.encryptBody({ id: "d1", deks: [] }, html);
    expect(first.keyVersion).toBe(1);
    expect(first.dek?.v).toBe(1);
    expect(first.bodyHtml).not.toContain("secret");
    // A retry before the server has the dek carries the same dek, so the server accepts it as the same write.
    const retry = await s.v.encryptBody({ id: "d1", deks: [] }, html);
    expect(retry.dek).toEqual(first.dek);
    const deks = [first.dek!];
    expect(await s.v.decryptBody({ id: "d1", deks, bodyHtml: first.bodyHtml, keyVersion: 1 })).toBe(html);
    const second = await s.v.encryptBody({ id: "d1", deks }, "<p>v2</p>");
    expect(second.dek).toBeUndefined();
    expect(second.keyVersion).toBe(1);
    // The highest version wins once there are several.
    const other = await s.v.encryptBody({ id: "d2", deks: [] }, "x");
    const third = await s.v.encryptBody({ id: "d1", deks: [...deks, { v: 2, wrapped: other.dek!.wrapped }] }, "<p>v3</p>");
    expect(third.keyVersion).toBe(2);
    // After a lock the cache is gone: the wrapped dek alone, under the vault key, opens the text.
    act(() => { s.v.lock(); });
    // Locked is its own error, never mistaken for corrupt data.
    await expect(s.v.decryptBody({ id: "d1", deks, bodyHtml: second.bodyHtml, keyVersion: 1 })).rejects.toMatchObject({ message: "vault-locked" });
    await expect(s.v.decryptBody({ id: "d1", deks, bodyHtml: second.bodyHtml, keyVersion: 1 })).rejects.not.toBeInstanceOf(VaultError);
    await expect(s.v.encryptBody({ id: "d1", deks }, "x")).rejects.toMatchObject({ message: "vault-locked" });
    await act(async () => { await s.v.unlock("right", false); });
    expect(await s.v.decryptBody({ id: "d1", deks, bodyHtml: second.bodyHtml, keyVersion: 1 })).toBe("<p>v2</p>");
  }, 30_000);

  it("decryptBody of keyVersion 0 passes through; corrupt ciphertext throws corrupt", async () => {
    server.vault = await vaultWith("right");
    const s = await mount();
    await until(() => s.v.status === "locked");
    expect(await s.v.decryptBody({ id: "d0", deks: [], bodyHtml: "<p>plain</p>", keyVersion: 0 })).toBe("<p>plain</p>");
    await act(async () => { await s.v.unlock("right", false); });
    const enc = await s.v.encryptBody({ id: "d1", deks: [] }, "<p>hello</p>");
    const deks = [enc.dek!];
    const [iv, ct] = enc.bodyHtml.split(".") as [string, string];
    const flipped = iv + "." + (ct[0] === "A" ? "B" : "A") + ct.slice(1);
    const code = (p: Promise<unknown>) => p.then(() => "resolved", (e: unknown) => (e instanceof VaultError ? e.code : "other"));
    expect(await code(s.v.decryptBody({ id: "d1", deks, bodyHtml: flipped, keyVersion: 1 }))).toBe("corrupt");
    expect(await code(s.v.decryptBody({ id: "d1", deks, bodyHtml: "not-a-blob", keyVersion: 1 }))).toBe("corrupt");
    // A version the document has no key for.
    expect(await code(s.v.decryptBody({ id: "d1", deks, bodyHtml: enc.bodyHtml, keyVersion: 7 }))).toBe("corrupt");
    // A dek that does not open under this vault key.
    expect(await code(s.v.decryptBody({ id: "d9", deks: [{ v: 1, wrapped: "AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" }], bodyHtml: enc.bodyHtml, keyVersion: 1 }))).toBe("corrupt");
  }, 30_000);

  it("wrapSecret / unwrapSecret round-trip under the vault key and refuse while locked", async () => {
    server.vault = await vaultWith("right");
    const s = await mount();
    await until(() => s.v.status === "locked");
    await expect(s.v.wrapSecret("AIza-1")).rejects.toMatchObject({ message: "vault-locked" });
    await act(async () => { await s.v.unlock("right", false); });
    const blob = await s.v.wrapSecret("AIza-1");
    expect(blob).not.toContain("AIza-1");
    expect(blob.split(".")).toHaveLength(2);
    expect(await s.v.unwrapSecret(blob)).toBe("AIza-1");
    await expect(s.v.unwrapSecret("bad.blob")).rejects.toBeInstanceOf(VaultError);
    act(() => { s.v.lock(); });
    await expect(s.v.unwrapSecret(blob)).rejects.toMatchObject({ message: "vault-locked" });
  }, 30_000);

  it("ensureUnlocked prompts until correct and returns false on cancel", async () => {
    server.vault = await vaultWith("right");
    const s = await mount();
    await until(() => s.v.status === "locked");
    h.ask.mockResolvedValueOnce("wrong").mockResolvedValueOnce(null);
    let ok: boolean | undefined;
    await act(async () => { ok = await s.v.ensureUnlocked(); });
    expect(ok).toBe(false);
    expect(h.ask).toHaveBeenCalledTimes(2);
    expect(h.ask).toHaveBeenCalledWith({ kind: "vault-unlock" });
    expect(h.toast).toHaveBeenCalledWith(en.vault_wrong);
    expect(s.v.status).toBe("locked");
    h.ask.mockReset().mockResolvedValueOnce("wrong").mockResolvedValueOnce("right");
    await act(async () => { ok = await s.v.ensureUnlocked(); });
    expect(ok).toBe(true);
    expect(h.ask).toHaveBeenCalledTimes(2);
    expect(s.v.status).toBe("unlocked");
    // Already unlocked: no prompt.
    h.ask.mockReset();
    await act(async () => { ok = await s.v.ensureUnlocked(); });
    expect(ok).toBe(true);
    expect(h.ask).not.toHaveBeenCalled();
  }, 30_000);

  it("a remembered vault opens on the next visit without the passphrase, and forgetting it locks the next visit", async () => {
    const a = await mount();
    await until(() => a.v.status === "off");
    await act(async () => { await a.v.setup("pw", true); });
    expect(await hasRemembered("u1")).toBe(true);
    const b = await mount();
    await until(() => b.v.status === "unlocked");
    expect(b.seen).toEqual(["loading", "locked", "unlocked"]);
    const enc = await b.v.encryptBody({ id: "d1", deks: [] }, "<p>x</p>");
    expect(await b.v.decryptBody({ id: "d1", deks: [enc.dek!], bodyHtml: enc.bodyHtml, keyVersion: 1 })).toBe("<p>x</p>");
    // Sign-out: lock, and on "Forget and sign out" forget this computer.
    act(() => { b.v.lock(); });
    expect(b.v.status).toBe("locked");
    await act(async () => { await b.v.forgetThisComputer(); });
    expect(await hasRemembered("u1")).toBe(false);
    const c = await mount();
    await until(() => c.v.status === "locked");
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(c.v.status).toBe("locked");
  }, 30_000);

  it("unlock with remember keeps the vault on this computer; a remembered key from another vault is dropped", async () => {
    server.vault = await vaultWith("right");
    const a = await mount();
    await until(() => a.v.status === "locked");
    await act(async () => { await a.v.unlock("right", true); });
    expect(await hasRemembered("u1")).toBe(true);
    // The vault was replaced (another vault key): the remembered copy cannot open it and is forgotten.
    server.vault = await vaultWith("other");
    const b = await mount();
    await until(() => b.v.status === "locked");
    await until(() => h.api.mock.calls.length > 0);
    for (let i = 0; i < 40 && (await hasRemembered("u1")); i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(await hasRemembered("u1")).toBe(false);
    expect(b.v.status).toBe("locked");
  }, 30_000);

  it("recover sets a new passphrase and a new code; the old code no longer opens", async () => {
    server.vault = await vaultWith("right", "AAAAA-BBBBB-CCCCC-DDDDD");
    const s = await mount();
    await until(() => s.v.status === "locked");
    let err: unknown;
    await act(async () => { await s.v.recover("ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ", "new").catch((e: unknown) => { err = e; }); });
    expect((err as VaultError).code).toBe("wrong-code");
    expect(server.calls.some((c) => c.method === "PATCH")).toBe(false);
    let out!: { recoveryCode: string };
    await act(async () => { out = await s.v.recover("aaaaa bbbbb ccccc ddddd", "new"); });
    expect(out.recoveryCode).toMatch(CODE);
    expect(out.recoveryCode).not.toBe("AAAAA-BBBBB-CCCCC-DDDDD");
    const patch = server.calls.find((c) => c.method === "PATCH")!;
    expect(patch.path).toBe("/me/vault/wraps");
    expect(patch.body!.reason).toBe("recovery-used");
    expect(s.v.status).toBe("unlocked");
    await expect(unwrapWithRecovery(server.vault!.recoveryWrapped, "AAAAA-BBBBB-CCCCC-DDDDD")).rejects.toMatchObject({ code: "wrong-code" });
    act(() => { s.v.lock(); });
    await act(async () => { await s.v.unlock("new", false); });
    expect(s.v.status).toBe("unlocked");
  }, 30_000);

  it("changePassphrase re-wraps under the new passphrase and refuses a wrong old one", async () => {
    server.vault = await vaultWith("right");
    const s = await mount();
    await until(() => s.v.status === "locked");
    let err: unknown;
    await act(async () => { await s.v.changePassphrase("wrong", "next").catch((e: unknown) => { err = e; }); });
    expect((err as VaultError).code).toBe("wrong-passphrase");
    expect(server.calls.some((c) => c.method === "PATCH")).toBe(false);
    await act(async () => { await s.v.changePassphrase("right", "next"); });
    const patch = server.calls.find((c) => c.method === "PATCH")!;
    expect(patch.body!.reason).toBe("passphrase-changed");
    expect(patch.body!.recoveryWrapped).toBeUndefined();
    act(() => { s.v.lock(); });
    err = undefined;
    await act(async () => { await s.v.unlock("right", false).catch((e: unknown) => { err = e; }); });
    expect((err as VaultError).code).toBe("wrong-passphrase");
    await act(async () => { await s.v.unlock("next", false); });
    expect(s.v.status).toBe("unlocked");
  }, 30_000);

  it("ensureUnlocked called while the vault is still loading waits for the record, then prompts", async () => {
    server.vault = await vaultWith("right");
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    h.api.mockImplementation(async (path: string, init?: RequestInit) => { if (path === "/me/vault" && !init?.method) await gate; return fakeApi(path, init); });
    const s = await mount();
    expect(s.v.status).toBe("loading");
    h.ask.mockResolvedValueOnce("right");
    let ok: boolean | undefined;
    const pending = s.v.ensureUnlocked().then((v) => { ok = v; });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(ok).toBeUndefined();
    expect(h.ask).not.toHaveBeenCalled();
    await act(async () => { release(); await pending; });
    expect(ok).toBe(true);
    expect(h.ask).toHaveBeenCalledTimes(1);
    expect(s.v.status).toBe("unlocked");
  }, 30_000);

  it("a failed load retries with backoff and reaches locked without a reload", async () => {
    server.vault = await vaultWith("right");
    h.api.mockImplementationOnce(() => Promise.reject(new TypeError("Failed to fetch")));
    const s = await mount();
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(s.v.status).toBe("loading");
    await until(() => s.v.status === "locked");
    expect(server.calls.filter((c) => c.path === "/me/vault" && c.method === "GET").length).toBe(1); // the rejected first try never reached fakeApi
    expect(h.api).toHaveBeenCalledTimes(2);
  }, 30_000);

  it("a failed load retries at once when the browser comes back online", async () => {
    server.vault = await vaultWith("right");
    h.api.mockImplementationOnce(() => Promise.reject(new ApiError(503, "unavailable")));
    const s = await mount();
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(s.v.status).toBe("loading");
    await act(async () => { window.dispatchEvent(new Event("online")); await new Promise((r) => setTimeout(r, 20)); });
    expect(s.v.status).toBe("locked");
  }, 30_000);

  it("an unlock that finishes after the account changed never opens the new account's session", async () => {
    server.vault = await vaultWith("right");
    const s = await mount();
    await until(() => s.v.status === "locked");
    const unlocking = s.v.unlock("right", true).then(() => "resolved", (e: unknown) => (e as Error).message);
    // Another account signs in while the passphrase is being checked; it has no vault.
    h.api.mockImplementation((path: string, init?: RequestInit) => (path === "/me/vault" && !init?.method ? Promise.reject(new ApiError(404, "no-vault")) : fakeApi(path, init)));
    h.uid = "u2";
    await act(async () => { s.render(); });
    expect(await unlocking).toBe("vault-changed");
    await until(() => s.v.status === "off");
    expect(s.v.status).toBe("off");
    await expect(s.v.encryptBody({ id: "d1", deks: [] }, "x")).rejects.toMatchObject({ message: "vault-locked" });
    expect(await hasRemembered("u1")).toBe(false);
    expect(await hasRemembered("u2")).toBe(false);
  }, 30_000);

  it("recover and changePassphrase that finish after the account changed do not touch the new account's session", async () => {
    server.vault = await vaultWith("right", "AAAAA-BBBBB-CCCCC-DDDDD");
    const s = await mount();
    await until(() => s.v.status === "locked");
    const recovering = s.v.recover("AAAAA-BBBBB-CCCCC-DDDDD", "new");
    const changing = s.v.changePassphrase("right", "next");
    const other = await vaultWith("other");
    h.api.mockImplementation((path: string, init?: RequestInit) => (path === "/me/vault" && !init?.method ? Promise.resolve({ ...other }) : fakeApi(path, init)));
    h.uid = "u2";
    await act(async () => { s.render(); });
    await act(async () => { await Promise.allSettled([recovering, changing]); });
    await until(() => s.v.status === "locked");
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(s.v.status).toBe("locked");
    // The new account's record was not overwritten: its own passphrase still opens it.
    await act(async () => { await s.v.unlock("other", false); });
    expect(s.v.status).toBe("unlocked");
  }, 30_000);
});
