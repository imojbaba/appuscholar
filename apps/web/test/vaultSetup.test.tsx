// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";

// The real passphrase window (PassphraseHost) is mounted: what the student is told must be inside it, under its field (O9), not only in a toast.
const h = vi.hoisted(() => ({ toast: vi.fn(), dl: vi.fn(), setup: vi.fn(), api: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/export/download", () => ({ downloadBlob: h.dl }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/session", () => ({ useSession: () => ({ email: "asha@example.edu", signOutAction: async () => {} }) }));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => ({ status: "off", setup: h.setup }) }));

import { ApiError } from "../lib/api";
import { openVaultSetup, VaultSetupHost } from "../components/workspace/dialogs/VaultSetup";
import { PassphraseHost } from "../components/workspace/dialogs/Passphrase";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CODE = "ABCDE-FGHJK-LMNPQ-RSTUV";
const PASS = "correct horse battery";
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k]));
const roots: Root[] = [];
const $ = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
async function until(pred: () => boolean) {
  for (let i = 0; i < 200; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 2)); }); }
  throw new Error("condition not reached");
}
async function click(id: string) {
  const el = $(id);
  if (!el) throw new Error("no element " + id);
  await act(async () => { el.click(); await new Promise((r) => setTimeout(r, 0)); });
}
function type(id: string, value: string) {
  const el = $(id) as HTMLInputElement;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
/** Types into the passphrase window and presses OK. */
async function answer(value: string) {
  await until(() => !!$("pass-input"));
  type("pass-input", value);
  await click("pass-ok");
}
const message = () => $("pass-message")?.textContent ?? null;
async function mount() {
  const box = document.createElement("div");
  document.body.appendChild(box);
  const root = createRoot(box);
  roots.push(root);
  await act(async () => { root.render(<><VaultSetupHost /><PassphraseHost /></>); });
}
/** Opens the setup; `result` is what openVaultSetup answers (wrapped: an async function would wait for it). */
async function open(): Promise<{ result: Promise<boolean> }> {
  await mount();
  let result!: Promise<boolean>;
  await act(async () => { result = openVaultSetup(); });
  return { result };
}
function readBlob(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsText(b); });
}
/** Opens the setup and goes through to the recovery sheet with matching passphrases. */
async function toSheet(): Promise<{ result: Promise<boolean> }> {
  const { result } = await open();
  h.setup.mockResolvedValue({ recoveryCode: CODE });
  await click("vault-setup-submit");
  await answer(PASS);
  await until(() => message() === en.bk_pass2);
  await answer(PASS);
  await until(() => !!$("vault-code"));
  return { result };
}

beforeEach(() => { h.toast.mockReset(); h.dl.mockReset(); h.setup.mockReset(); h.api.mockReset(); });
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });

describe("VaultSetup and the recovery sheet", () => {
  it("the choose prompt says the minimum before anything is typed", async () => {
    await open();
    await click("vault-setup-submit");
    await until(() => message() === en.vault_setup_intro);
    expect($("pass-rule")!.textContent).toBe(fill(en.vault_pass_rule, { n: 10 }));
    expect($("pass-verdict")).toBeNull();
  });

  it("a passphrase too short is refused inside the choose window, under its field, and asked again there: never back to the intro", async () => {
    await open();
    await click("vault-setup-submit");
    await answer("short");
    await until(() => !!$("pass-verdict"));
    expect($("pass-verdict")!.textContent).toBe(fill(en.vault_err_short, { n: 10 }));
    expect($("pass-input")!.getAttribute("aria-describedby")).toBe("pass-verdict");
    // Still the choose window, with what was typed kept; the intro is not back.
    expect(message()).toBe(en.vault_setup_intro);
    expect(($("pass-input") as HTMLInputElement).value).toBe("short");
    expect($("vault-setup-dialog")).toBeNull();
    expect(h.setup).not.toHaveBeenCalled();
    // A long enough one goes on to the confirm window.
    await answer(PASS);
    await until(() => message() === en.bk_pass2);
    expect($("pass-verdict")).toBeNull();
  });

  it("two entries apart: the reason shows in a fresh choose window (never the intro); then matching entries set the vault up", async () => {
    const { result } = await open();
    await click("vault-setup-remember");
    await click("vault-setup-submit");
    await answer(PASS);
    await until(() => message() === en.bk_pass2);
    await answer(PASS + "x");
    await until(() => message() === en.vault_setup_intro && !!$("pass-verdict"));
    expect($("pass-verdict")!.textContent).toBe(en.vault_err_match);
    expect(($("pass-input") as HTMLInputElement).value).toBe("");
    expect($("vault-setup-dialog")).toBeNull();
    expect(h.setup).not.toHaveBeenCalled();
    h.setup.mockResolvedValue({ recoveryCode: CODE });
    await answer(PASS);
    await until(() => message() === en.bk_pass2);
    await answer(PASS);
    await until(() => !!$("vault-code"));
    expect(h.setup).toHaveBeenCalledTimes(1);
    expect(h.setup).toHaveBeenCalledWith(PASS, true);
    await expect(result).resolves.toBe(true);
    expect(h.toast).not.toHaveBeenCalled();
  });

  it("a failed setup is said inside the confirm window, and OK there tries again with the same entries", async () => {
    const { result } = await open();
    await click("vault-setup-submit");
    await answer(PASS);
    await until(() => message() === en.bk_pass2);
    h.setup.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await answer(PASS);
    await until(() => !!$("pass-verdict"));
    expect($("pass-verdict")!.textContent).toBe(en.vault_setup_fail);
    expect(message()).toBe(en.bk_pass2);
    expect($("vault-setup-dialog")).toBeNull();
    expect($("vault-code")).toBeNull();
    // The entry is kept: OK alone tries again.
    h.setup.mockResolvedValueOnce({ recoveryCode: CODE });
    await click("pass-ok");
    await until(() => !!$("vault-code"));
    expect(h.setup).toHaveBeenCalledTimes(2);
    expect(h.setup).toHaveBeenLastCalledWith(PASS, false);
    await expect(result).resolves.toBe(true);
  });

  it("a vault that exists already (set up meanwhile elsewhere) closes the setup and says so", async () => {
    const { result } = await open();
    await click("vault-setup-submit");
    await answer(PASS);
    await until(() => message() === en.bk_pass2);
    h.setup.mockRejectedValueOnce(new ApiError(409, "vault-exists"));
    await answer(PASS);
    await expect(result).resolves.toBe(false);
    expect(h.toast).toHaveBeenCalledWith(en.vault_setup_fail);
    await until(() => !$("pass-dialog"));
    expect($("vault-setup-dialog")).toBeNull();
    expect($("vault-code")).toBeNull();
  });

  it("Cancel in the choose window brings the setup back, without a message", async () => {
    await open();
    await click("vault-setup-submit");
    await until(() => !!$("pass-cancel"));
    await click("pass-cancel");
    await until(() => !!$("vault-setup-dialog"));
    expect(h.toast).not.toHaveBeenCalled();
    expect(h.setup).not.toHaveBeenCalled();
  });

  it("the setup window speaks, and the sheet says beside Done what Done waits for", async () => {
    await mount();
    let result!: Promise<boolean>;
    await act(async () => { result = openVaultSetup(); });
    const dlg = $("vault-setup-dialog")!;
    expect(dlg.textContent).toContain(en.vault_setup_h2);
    expect(dlg.textContent).toContain(en.vault_setup_intro);
    expect($("vault-setup-submit")!.textContent).toBe(en.vault_setup_btn);
    expect($("vault-setup-later")!.textContent).toBe(en.vault_setup_later);
    expect($("vault-setup-remember")!.closest("label")!.textContent).toContain(en.vault_remember);
    h.setup.mockResolvedValue({ recoveryCode: CODE });
    await click("vault-setup-submit");
    await answer(PASS);
    await until(() => message() === en.bk_pass2);
    await answer(PASS);
    await until(() => !!$("vault-code"));
    await expect(result).resolves.toBe(true);
    expect($("vault-setup-dialog")).toBeNull();

    // The sheet: the code shown once, Done disabled until "I have saved it" is ticked, and a line beside it that says so.
    const sheet = $("vault-sheet-dialog")!;
    expect(sheet.textContent).toContain(en.vault_sheet_h2);
    expect(sheet.textContent).toContain(en.vault_sheet_intro);
    expect($("vault-code")!.textContent).toBe(CODE);
    expect($("vault-sheet-download")!.textContent).toBe(en.vault_sheet_download);
    const done = $("vault-sheet-done") as HTMLButtonElement;
    expect(done.textContent).toBe(en.vault_sheet_done);
    expect(done.disabled).toBe(true);
    expect($("vault-sheet-hint")!.textContent).toBe(en.vault_sheet_hint);
    expect(done.getAttribute("aria-describedby")).toBe("vault-sheet-hint");
    // Escape does not dismiss the sheet before it is saved.
    await act(async () => { document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect($("vault-code")).not.toBeNull();
    expect($("vault-sheet-saved")!.closest("label")!.textContent).toContain(en.vault_sheet_saved);
    await click("vault-sheet-saved");
    expect(($("vault-sheet-done") as HTMLButtonElement).disabled).toBe(false);
    expect($("vault-sheet-hint")).toBeNull();
    await click("vault-sheet-done");
    await until(() => !$("vault-sheet-dialog"));
    // The code is gone from the page once Done is pressed, and nothing here sent it anywhere.
    expect(document.body.textContent).not.toContain(CODE);
    expect(h.api).not.toHaveBeenCalled();
  });

  it("Not now closes the setup without setting anything up", async () => {
    await mount();
    let result!: Promise<boolean>;
    await act(async () => { result = openVaultSetup(); });
    await click("vault-setup-later");
    await expect(result).resolves.toBe(false);
    expect($("vault-setup-dialog")).toBeNull();
    expect($("pass-dialog")).toBeNull();
    expect(h.setup).not.toHaveBeenCalled();
  });

  it("the recovery sheet file is named appuscholar-recovery.txt and contains the code", async () => {
    await toSheet();
    await click("vault-sheet-download");
    expect(h.dl).toHaveBeenCalledTimes(1);
    const [name, blob] = h.dl.mock.calls[0] as [string, Blob];
    expect(name).toBe("appuscholar-recovery.txt");
    expect(blob.type).toMatch(/^text\/plain/);
    const text = await readBlob(blob);
    expect(text).toContain(CODE);
    expect(text).toContain("asha@example.edu");
    const d = new Date();
    expect(text).toContain(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    expect(text).toContain(en.vault_sheet_intro);
    // Downloading is not the same as confirming: Done still waits for the checkbox.
    expect(($("vault-sheet-done") as HTMLButtonElement).disabled).toBe(true);
    expect(h.api).not.toHaveBeenCalled();
  });
});
