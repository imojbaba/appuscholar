// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";

const h = vi.hoisted(() => ({
  remembered: vi.fn(), signOut: vi.fn(async () => {}), lock: vi.fn(), forget: vi.fn(async () => {}),
  ws: { dialog: "help", closeDialog: vi.fn(), openWelcome: vi.fn(), openTerms: vi.fn(), openImportV1: vi.fn() }
}));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => h.ws }));
vi.mock("@/lib/session", () => ({ useSession: () => ({ email: "asha@example.edu", signOutAction: h.signOut }) }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1" } }) }));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => ({ lock: h.lock, forgetThisComputer: h.forget }) }));
vi.mock("@/lib/vault/remember", () => ({ hasRemembered: h.remembered }));
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: vi.fn() }));

import { keyStore } from "../lib/ai/keys";
import { Help } from "../components/workspace/dialogs/Help";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const KEYS_TITLE = "Forget the AI keys remembered on this computer?";
const KEYS_SENTENCE = "you will not need to paste them again";
const roots: Root[] = [];
const $ = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
async function until(pred: () => boolean) {
  for (let i = 0; i < 200; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 2)); }); }
  throw new Error("condition not reached");
}
async function signOutWith(keys: boolean, vault: boolean) {
  if (keys) keyStore.setPlain("gemini", "AIza-1");
  h.remembered.mockResolvedValue(vault);
  const box = document.createElement("div");
  document.body.appendChild(box);
  const root = createRoot(box);
  roots.push(root);
  await act(async () => { root.render(<Help />); });
  await act(async () => { $("sign-out")!.click(); await new Promise((r) => setTimeout(r, 0)); });
}
const title = () => $("forget-keys-confirm")!.querySelector("h2")!.textContent;

beforeEach(() => {
  localStorage.clear();
  keyStore.setUser("u1");
  keyStore.clearSession();
  h.remembered.mockReset(); h.signOut.mockClear(); h.lock.mockClear(); h.forget.mockClear();
});
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });

describe("Help sign-out: forget what this computer remembers", () => {
  it("the vault remembered and no plain key: the dialog asks about the vault, without the AI-keys sentence", async () => {
    await signOutWith(false, true);
    await until(() => !!$("forget-keys-confirm"));
    expect(h.remembered).toHaveBeenCalledWith("u1");
    expect(title()).toBe(en.vault_forget_q);
    expect($("forget-keys-confirm")!.textContent).not.toContain(KEYS_SENTENCE);
    expect($("forget-vault-q")).toBeNull();
    expect($("keep-keys-signout")).not.toBeNull();
    expect($("forget-keys-signout")).not.toBeNull();
    expect(h.signOut).not.toHaveBeenCalled();
    // Forget: the vault is forgotten before the sign-out goes.
    await act(async () => { $("forget-keys-signout")!.click(); await new Promise((r) => setTimeout(r, 0)); });
    expect(h.forget).toHaveBeenCalledTimes(1);
    expect(h.signOut).toHaveBeenCalledTimes(1);
  });

  it("keys and the vault remembered: the existing title, with the vault question added", async () => {
    await signOutWith(true, true);
    await until(() => !!$("forget-keys-confirm"));
    expect(title()).toBe(KEYS_TITLE);
    expect($("forget-keys-confirm")!.textContent).toContain(KEYS_SENTENCE);
    expect($("forget-vault-q")!.textContent).toBe(en.vault_forget_q);
    expect($("keep-keys-signout")).not.toBeNull();
    expect($("forget-keys-signout")).not.toBeNull();
    await act(async () => { $("keep-keys-signout")!.click(); await new Promise((r) => setTimeout(r, 0)); });
    expect(h.forget).not.toHaveBeenCalled();
    expect(h.signOut).toHaveBeenCalledTimes(1);
    expect(keyStore.hasPlain()).toBe(true);
  });

  it("keys only: the existing dialog, no vault line", async () => {
    await signOutWith(true, false);
    await until(() => !!$("forget-keys-confirm"));
    expect(title()).toBe(KEYS_TITLE);
    expect($("forget-vault-q")).toBeNull();
    expect($("keep-keys-signout")).not.toBeNull();
    expect($("forget-keys-signout")).not.toBeNull();
  });

  it("nothing remembered: signs out at once, no dialog", async () => {
    await signOutWith(false, false);
    await until(() => h.signOut.mock.calls.length === 1);
    expect($("forget-keys-confirm")).toBeNull();
    expect(h.lock).toHaveBeenCalled();
    expect(h.forget).not.toHaveBeenCalled();
  });
});
