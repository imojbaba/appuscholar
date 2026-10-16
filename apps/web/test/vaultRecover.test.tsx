// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeypair, generateVaultKey, sealVaultCheck, unwrapWithPassphrase, unwrapWithRecovery, wrapPrivateKey, wrapWithPassphrase, wrapWithRecovery } from "../lib/vault/crypto";
import { forgetRemembered, hasRemembered } from "../lib/vault/remember";
import en from "../messages/en.json";

const h = vi.hoisted(() => ({ api: vi.fn(), toast: vi.fn() }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1" } }) }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));

import { ApiError } from "../lib/api";
import { useVault, VaultProvider, type VaultValue } from "../lib/vault/useVault";
import { askPassphrase, PassphraseHost } from "../components/workspace/dialogs/Passphrase";
import { formatRecoveryCode, openVaultRecover, VaultRecoverHost } from "../components/workspace/dialogs/VaultRecover";
import { ChangePassphrase } from "../components/workspace/dialogs/ChangePassphrase";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Rec = { passWrapped: string; recoveryWrapped: string; checkWrapped: string; publicKey: string | null; privateKeyWrapped: string | null; complete: boolean; updatedAt: string };
let server: { vault: Rec | null; calls: { path: string; method: string; body?: Record<string, unknown> }[] };
/** PATCH /me/vault/wraps as the api answers it: 409 stale when expectUpdatedAt is not the stored updatedAt; a change moves updatedAt forward. */
function patchWraps(body: Record<string, unknown>): Promise<unknown> {
  const { reason: _r, expectUpdatedAt, ...w } = body;
  if (!server.vault) return Promise.reject(new ApiError(404, "no-vault"));
  if (expectUpdatedAt !== undefined && expectUpdatedAt !== server.vault.updatedAt) return Promise.reject(new ApiError(409, "stale"));
  server.vault = { ...server.vault, ...w, updatedAt: new Date(Date.parse(server.vault.updatedAt) + 1000).toISOString() };
  return Promise.resolve({ ...server.vault });
}

function fakeApi(path: string, init: RequestInit = {}) {
  const method = init.method ?? "GET";
  const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
  server.calls.push({ path, method, body });
  if (path === "/me/vault" && method === "GET") return server.vault ? Promise.resolve({ ...server.vault }) : Promise.reject(new ApiError(404, "no-vault"));
  if (path === "/me/vault/wraps" && method === "PATCH") return patchWraps(body!);
  return Promise.reject(new ApiError(404, "not-found"));
}

const OLD = "old passphrase 1";
const NEW = "new passphrase 2";
const CODE = "AAAAA-BBBBB-CCCCC-DDDDD";
const NEW_CODE = /^[A-HJ-NP-Z2-9]{5}(-[A-HJ-NP-Z2-9]{5}){3}$/;
async function vaultWith(pass: string, code: string): Promise<Rec> {
  const vk = await generateVaultKey();
  const kp = await generateKeypair();
  return { passWrapped: await wrapWithPassphrase(vk, pass), recoveryWrapped: await wrapWithRecovery(vk, code), checkWrapped: await sealVaultCheck(vk), publicKey: kp.publicKeyB64, privateKeyWrapped: await wrapPrivateKey(kp.privateKey, vk), complete: true, updatedAt: new Date().toISOString() };
}

const roots: Root[] = [];
const $ = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
async function mount(extra: React.ReactNode = null) {
  const box: { v: VaultValue | null } = { v: null };
  function Probe() { box.v = useVault(); return null; }
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(<VaultProvider><Probe /><PassphraseHost /><VaultRecoverHost />{extra}</VaultProvider>); });
  return { get v(): VaultValue { return box.v!; } };
}
async function until(pred: () => boolean) {
  for (let i = 0; i < 400; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); }
  throw new Error("condition not reached");
}
function type(id: string, value: string) {
  const el = $(id) as HTMLInputElement;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function click(id: string) {
  const el = $(id);
  if (!el) throw new Error("no element " + id);
  await act(async () => { el.click(); await new Promise((r) => setTimeout(r, 0)); });
}
const writes = () => server.calls.filter((c) => c.method !== "GET");

beforeEach(async () => {
  server = { vault: await vaultWith(OLD, CODE), calls: [] };
  h.api.mockReset().mockImplementation(fakeApi);
  h.toast.mockReset();
  await forgetRemembered("u1");
});
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });

describe("VaultRecover", () => {
  it("the code field groups what is typed into fives, upper case, without look-alike characters", () => {
    expect(formatRecoveryCode("aaaaabbbbbcc")).toBe("AAAAA-BBBBB-CC");
    expect(formatRecoveryCode("aaaaa bbbbb-ccccc dddddEXTRA")).toBe("AAAAA-BBBBB-CCCCC-DDDDD");
    expect(formatRecoveryCode("AAAAA-")).toBe("AAAAA");
    expect(formatRecoveryCode("a0b1c")).toBe("ABC");
  });

  it("recover with a wrong code changes nothing and keeps the old passphrase working", async () => {
    const s = await mount();
    await until(() => s.v.status === "locked");
    act(() => { openVaultRecover(); });
    await until(() => !!$("vault-recover-dialog"));
    type("recover-code", "ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ");
    type("recover-pass", NEW);
    type("recover-pass2", NEW);
    expect(($("recover-code") as HTMLInputElement).value).toBe("ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ");
    const before = { ...server.vault! };
    await click("recover-submit");
    await until(() => h.toast.mock.calls.length > 0);
    expect(h.toast).toHaveBeenCalledWith(en.vault_recover_bad);
    // The verdict is also inside the window (O9): a toast at the foot of the page goes unseen behind a modal.
    expect($("recover-verdict")!.textContent).toBe(en.vault_recover_bad);
    expect(writes()).toEqual([]);
    expect(server.vault).toEqual(before);
    expect(s.v.status).toBe("locked");
    expect($("vault-recover-dialog")).not.toBeNull(); // still open, to try again
    expect($("vault-sheet-dialog")).toBeNull();
    // The old passphrase still opens the vault; the new one does not.
    await expect(unwrapWithPassphrase(server.vault!.passWrapped, NEW)).rejects.toMatchObject({ code: "wrong-passphrase" });
    await act(async () => { await s.v.unlock(OLD, false); });
    expect(s.v.status).toBe("unlocked");
  });

  it("recover with the right code sets the new passphrase and shows a new sheet", async () => {
    const s = await mount();
    await until(() => s.v.status === "locked");
    act(() => { openVaultRecover(); });
    await until(() => !!$("vault-recover-dialog"));
    type("recover-code", CODE.toLowerCase().replace(/-/g, ""));
    type("recover-pass", NEW);
    type("recover-pass2", NEW);
    await click("recover-submit");
    await until(() => !!$("vault-sheet-dialog"));
    expect(h.toast).toHaveBeenCalledWith(en.vault_recovered);
    expect($("vault-recover-dialog")).toBeNull();
    const shown = $("vault-code")!.textContent!;
    expect(shown).toMatch(NEW_CODE);
    expect(shown).not.toBe(CODE);
    expect(s.v.status).toBe("unlocked");
    // One write: the new wraps. The code itself never goes to the server.
    expect(writes().map((c) => [c.method, c.path])).toEqual([["PATCH", "/me/vault/wraps"]]);
    const sent = JSON.stringify(server.calls);
    expect(sent).not.toContain(CODE);
    expect(sent).not.toContain(shown);
    await expect(unwrapWithPassphrase(server.vault!.passWrapped, NEW)).resolves.toBeDefined();
    await expect(unwrapWithRecovery(server.vault!.recoveryWrapped, shown)).resolves.toBeDefined();
    // The old code is void.
    await expect(unwrapWithRecovery(server.vault!.recoveryWrapped, CODE)).rejects.toMatchObject({ code: "wrong-code" });
    // The sheet closes only once saved.
    await click("vault-sheet-saved");
    await click("vault-sheet-done");
    expect($("vault-sheet-dialog")).toBeNull();
  });

  it("a new passphrase that is too short or typed differently is refused before anything is sent", async () => {
    const s = await mount();
    await until(() => s.v.status === "locked");
    act(() => { openVaultRecover(); });
    await until(() => !!$("vault-recover-dialog"));
    type("recover-code", CODE);
    type("recover-pass", "short");
    type("recover-pass2", "short");
    await click("recover-submit");
    expect(h.toast).toHaveBeenLastCalledWith(en.bk_err_short);
    expect($("recover-verdict")!.textContent).toBe(en.bk_err_short);
    type("recover-pass", NEW);
    type("recover-pass2", NEW + "x");
    await click("recover-submit");
    expect(h.toast).toHaveBeenLastCalledWith(en.bk_err_match);
    expect($("recover-verdict")!.textContent).toBe(en.bk_err_match);
    expect(writes()).toEqual([]);
  });

  it("the unlock ask offers vault_forgot, which opens the recovery", async () => {
    const s = await mount();
    await until(() => s.v.status === "locked");
    let opened: Promise<boolean> | null = null;
    act(() => { opened = s.v.ensureUnlocked(); });
    await until(() => !!$("pass-dialog"));
    expect($("vault-forgot")!.textContent).toBe(en.vault_forgot);
    await click("vault-forgot");
    await until(() => !!$("vault-recover-dialog"));
    expect($("pass-dialog")).toBeNull();
    await expect(opened!).resolves.toBe(false); // the unlock ask is cancelled; the recovery opens the vault instead
  });
});

describe("ChangePassphrase", () => {
  async function openChange() {
    const box: { open: boolean } = { open: true };
    const s = await mount(<ChangePassphrase open onClose={() => { box.open = false; }} />);
    await until(() => s.v.status === "locked");
    return { s, box };
  }

  it("change passphrase re-wraps VK only", async () => {
    const { s, box } = await openChange();
    type("vault-change-old", OLD);
    type("vault-change-new", NEW);
    type("vault-change-again", NEW);
    await click("vault-change-submit");
    await until(() => h.toast.mock.calls.length > 0);
    expect(h.toast).toHaveBeenCalledWith(en.vault_changed);
    expect(box.open).toBe(false);
    // PATCH /me/vault/wraps once, with the passphrase wrap only; no document is touched.
    expect(writes().map((c) => [c.method, c.path])).toEqual([["PATCH", "/me/vault/wraps"]]);
    expect(Object.keys(writes()[0]!.body!).sort()).toEqual(["expectUpdatedAt", "passWrapped", "reason"]);
    expect(server.calls.filter((c) => c.path.startsWith("/documents"))).toEqual([]);
    expect(JSON.stringify(server.calls)).not.toContain(NEW);
    await expect(unwrapWithPassphrase(server.vault!.passWrapped, NEW)).resolves.toBeDefined();
    await expect(unwrapWithRecovery(server.vault!.recoveryWrapped, CODE)).resolves.toBeDefined(); // the code still works
    expect(s.v.status).toBe("unlocked");
  });

  it("a wrong old passphrase says vault_wrong and sends nothing", async () => {
    const { box } = await openChange();
    type("vault-change-old", "not the passphrase");
    type("vault-change-new", NEW);
    type("vault-change-again", NEW);
    await click("vault-change-submit");
    await until(() => h.toast.mock.calls.length > 0);
    expect(h.toast).toHaveBeenCalledWith(en.vault_wrong);
    expect($("vault-change-verdict")!.textContent).toBe(en.vault_wrong); // inside the window too (O9)
    expect(writes()).toEqual([]);
    expect(box.open).toBe(true);
  });
});

describe("the vault unlock ask", () => {
  it("offers Remember on this computer, unticked; ticked, the unlock keeps the vault on this computer", async () => {
    const s = await mount();
    await until(() => s.v.status === "locked");
    // Unticked (the default): unlocked for this tab only.
    let opened = s.v.ensureUnlocked();
    await until(() => !!$("pass-dialog"));
    expect(($("pass-remember") as HTMLInputElement).checked).toBe(false);
    expect($("pass-remember")!.closest("label")!.textContent).toBe(en.vault_remember);
    type("pass-input", OLD);
    await click("pass-ok");
    await act(async () => { expect(await opened).toBe(true); });
    expect(await hasRemembered("u1")).toBe(false);
    act(() => { s.v.lock(); });
    // Ticked, then cancelled: nothing is remembered.
    opened = s.v.ensureUnlocked();
    await until(() => !!$("pass-dialog"));
    await click("pass-remember");
    await click("pass-cancel");
    await act(async () => { expect(await opened).toBe(false); });
    expect(await hasRemembered("u1")).toBe(false);
    // Ticked and answered: remembered.
    opened = s.v.ensureUnlocked();
    await until(() => !!$("pass-dialog"));
    expect(($("pass-remember") as HTMLInputElement).checked).toBe(false); // each ask starts unticked
    await click("pass-remember");
    type("pass-input", OLD);
    await click("pass-ok");
    await act(async () => { expect(await opened).toBe(true); });
    expect(s.v.status).toBe("unlocked");
    expect(await hasRemembered("u1")).toBe(true);
  });

  it("shows the wrong-passphrase verdict under the field on the next ask, and not on a fresh one", async () => {
    const s = await mount();
    await until(() => s.v.status === "locked");
    const opened = s.v.ensureUnlocked();
    await until(() => !!$("pass-dialog"));
    expect($("pass-verdict")).toBeNull();
    type("pass-input", "not it");
    await click("pass-ok");
    await until(() => !!$("pass-verdict"));
    expect($("pass-verdict")!.textContent).toBe(en.vault_wrong);
    expect($("pass-verdict")!.getAttribute("role")).toBe("alert");
    expect($("pass-input")!.getAttribute("aria-invalid")).toBe("true");
    expect(($("pass-input") as HTMLInputElement).value).toBe(""); // the field is emptied for the next try
    expect(h.toast).toHaveBeenCalledWith(en.vault_wrong); // the toast stays
    type("pass-input", OLD);
    await click("pass-ok");
    await act(async () => { expect(await opened).toBe(true); });
    // A fresh round, after a lock, starts without a verdict.
    act(() => { s.v.lock(); });
    const again = s.v.ensureUnlocked();
    await until(() => !!$("pass-dialog"));
    expect($("pass-verdict")).toBeNull();
    expect($("pass-input")!.getAttribute("aria-invalid")).toBeNull();
    await click("pass-cancel");
    await act(async () => { expect(await again).toBe(false); });
  });

  it("the other passphrase asks have no Remember box", async () => {
    await mount();
    let answer: Promise<string | null> = Promise.resolve(null);
    act(() => { answer = askPassphrase({ kind: "vault-choose" }); });
    await until(() => !!$("pass-dialog"));
    expect($("pass-remember")).toBeNull();
    await click("pass-cancel");
    await act(async () => { expect(await answer).toBeNull(); });
  });
});
