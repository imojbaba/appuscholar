// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";

type FakeVault = {
  status: string; complete: boolean; migrating: { n: number; total: number } | null;
  ensureUnlocked: ReturnType<typeof vi.fn>; changePassphrase: ReturnType<typeof vi.fn>; forgetThisComputer: ReturnType<typeof vi.fn>;
  resumeMigration: ReturnType<typeof vi.fn>;
};
const h = vi.hoisted(() => ({ v: null as unknown as FakeVault, open: vi.fn(), toast: vi.fn(), remembered: vi.fn() }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1" } }) }));
vi.mock("@/lib/vault/remember", () => ({ hasRemembered: h.remembered }));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => h.v }));
vi.mock("@/components/workspace/dialogs/VaultSetup", () => ({ openVaultSetup: h.open }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));

import { VaultError } from "../lib/vault/crypto";
import { VaultPill } from "../components/workspace/VaultPill";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// Radix menus measure their content; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

const roots: Root[] = [];
const $ = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
let root: Root;
async function render() { await act(async () => { root.render(<VaultPill />); }); }
async function click(id: string) {
  const el = $(id);
  if (!el) throw new Error("no element " + id);
  await act(async () => { el.click(); await new Promise((r) => setTimeout(r, 0)); });
}
async function openMenu() {
  const pill = $("vault-pill")!;
  await act(async () => {
    pill.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
  });
}
function type(id: string, value: string) {
  const el = $(id) as HTMLInputElement;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function until(pred: () => boolean) {
  for (let i = 0; i < 200; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 2)); }); }
  throw new Error("condition not reached");
}

beforeEach(() => {
  h.v = { status: "loading", complete: true, migrating: null, ensureUnlocked: vi.fn(async () => true), changePassphrase: vi.fn(async () => {}), forgetThisComputer: vi.fn(async () => {}), resumeMigration: vi.fn(async () => {}) };
  h.open.mockReset().mockResolvedValue(false);
  h.toast.mockReset();
  h.remembered.mockReset().mockResolvedValue(true);
  const box = document.createElement("div");
  document.body.appendChild(box);
  root = createRoot(box);
  roots.push(root);
});
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });

describe("VaultPill", () => {
  it("VaultPill shows off/locked/on/migrating from status and opens setup when off", async () => {
    // Still loading: no pill, so it never flashes "off" for a student who has a vault.
    await render();
    expect($("vault-pill")).toBeNull();

    h.v.status = "off";
    h.v.complete = false; // no vault: nothing to complete, and the pill says off
    await render();
    let pill = $("vault-pill")!;
    expect(pill.textContent).toBe(en.vault_pill_off);
    expect(pill.dataset.status).toBe("off");
    expect(pill.className).toContain("bg-flag-bg"); // amber: needs attention
    await click("vault-pill");
    expect(h.open).toHaveBeenCalledTimes(1);
    expect(h.v.ensureUnlocked).not.toHaveBeenCalled();

    h.v.status = "locked";
    h.v.complete = true;
    await render();
    pill = $("vault-pill")!;
    expect(pill.textContent).toBe(en.vault_pill_locked);
    expect(pill.className).toContain("bg-chip"); // grey
    await click("vault-pill");
    expect(h.v.ensureUnlocked).toHaveBeenCalledTimes(1);
    expect(h.open).toHaveBeenCalledTimes(1);

    h.v.status = "unlocked";
    await render();
    pill = $("vault-pill")!;
    expect(pill.textContent).toBe(en.vault_pill_yours);
    // The open vault says so: "Locked to you" read as locked to the B1 walk's student.
    expect(pill.textContent).toMatch(/unlocked/i);
    expect(pill.className).toContain("bg-ok-bg"); // green
    await openMenu();
    expect($("vault-menu-change")!.textContent).toBe(en.vault_change_h2);
    await until(() => !!$("vault-menu-forget"));
    expect(h.remembered).toHaveBeenCalledWith("u1");
    expect($("vault-menu-forget")!.textContent).toBe(en.vault_forget_btn);
    await click("vault-menu-forget");
    expect(h.v.forgetThisComputer).toHaveBeenCalledTimes(1);
    await until(() => h.toast.mock.calls.length === 1);
    expect(h.toast).toHaveBeenCalledWith(en.vault_forgotten);
    expect(h.v.ensureUnlocked).toHaveBeenCalledTimes(1);

    h.v.status = "migrating";
    h.v.migrating = { n: 3, total: 10 };
    await render();
    pill = $("vault-pill")!;
    expect(pill.textContent).toBe(en.vault_pill_migrating);
    expect(pill.className).toContain("bg-purple-100"); // purple: structure, work in progress
    expect(pill.title).toBe(en.vault_migrating_n.replace("{n}", "3").replace("{total}", "10"));
    expect(h.open).toHaveBeenCalledTimes(1);
  });

  it("an unfinished migration (no run going) keeps the migrating pill, and a click finishes it", async () => {
    for (const status of ["unlocked", "locked"]) {
      h.v.status = status;
      h.v.complete = false;
      h.v.migrating = null;
      h.v.resumeMigration.mockClear();
      await render();
      const pill = $("vault-pill")!;
      expect(pill.tagName).toBe("BUTTON");
      expect(pill.textContent).toBe(en.vault_pill_migrating);
      expect(pill.dataset.status).toBe("migrating");
      expect(pill.className).toContain("bg-purple-100");
      expect(pill.title).toBe(""); // the count is shown only while a run goes
      await click("vault-pill");
      expect(h.v.resumeMigration).toHaveBeenCalledTimes(1);
      expect($("vault-menu")).toBeNull();
    }
    // While a run goes it is a status, not a button.
    h.v.status = "migrating";
    h.v.migrating = { n: 1, total: 4 };
    await render();
    expect($("vault-pill")!.tagName).toBe("SPAN");
    expect($("vault-pill")!.getAttribute("role")).toBe("status");
    // Complete: the ordinary pill again.
    h.v.status = "unlocked";
    h.v.complete = true;
    h.v.migrating = null;
    await render();
    expect($("vault-pill")!.textContent).toBe(en.vault_pill_yours);
  });

  it("Forget on this computer is offered only when this computer remembers the vault", async () => {
    h.v.status = "unlocked";
    h.remembered.mockResolvedValue(false);
    await render();
    await openMenu();
    await until(() => h.remembered.mock.calls.length >= 2); // when the vault opened, and when the menu opened
    expect($("vault-menu-change")).not.toBeNull();
    expect($("vault-menu-forget")).toBeNull();
  });

  it("Change passphrase asks for the current one and the new one twice", async () => {
    h.v.status = "unlocked";
    await render();
    await openMenu();
    await click("vault-menu-change");
    await until(() => !!$("vault-change-dialog"));
    expect($("vault-change-dialog")!.textContent).toContain(en.vault_change_h2);
    expect($("vault-change-submit")!.textContent).toBe(en.vault_change_btn);

    type("vault-change-old", "old passphrase");
    type("vault-change-new", "new passphrase 1");
    type("vault-change-again", "new passphrase 2");
    await click("vault-change-submit");
    expect(h.toast).toHaveBeenCalledWith(en.bk_err_match);
    expect(h.v.changePassphrase).not.toHaveBeenCalled();

    type("vault-change-new", "short");
    type("vault-change-again", "short");
    await click("vault-change-submit");
    expect(h.toast).toHaveBeenLastCalledWith(en.bk_err_short);
    expect(h.v.changePassphrase).not.toHaveBeenCalled();

    h.v.changePassphrase.mockRejectedValueOnce(new VaultError("wrong-passphrase"));
    type("vault-change-new", "new passphrase 1");
    type("vault-change-again", "new passphrase 1");
    await click("vault-change-submit");
    await until(() => h.toast.mock.calls.length === 3);
    expect(h.toast).toHaveBeenLastCalledWith(en.vault_wrong);
    expect($("vault-change-dialog")).not.toBeNull();

    // Any other failure (the network) says so and keeps the dialog open.
    h.v.changePassphrase.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await click("vault-change-submit");
    await until(() => h.toast.mock.calls.length === 4);
    expect(h.toast).toHaveBeenLastCalledWith(en.vault_change_fail);
    expect($("vault-change-dialog")).not.toBeNull();

    await click("vault-change-submit");
    await until(() => h.toast.mock.calls.length === 5);
    expect(h.v.changePassphrase).toHaveBeenLastCalledWith("old passphrase", "new passphrase 1");
    expect(h.toast).toHaveBeenLastCalledWith(en.vault_changed);
    await until(() => !$("vault-change-dialog"));
  });
});
