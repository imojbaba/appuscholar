// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";

const h = vi.hoisted(() => ({ ask: vi.fn(), toast: vi.fn(), dl: vi.fn(), setup: vi.fn(), api: vi.fn() }));
vi.mock("@/components/workspace/dialogs/Passphrase", () => ({ askPassphrase: h.ask }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/export/download", () => ({ downloadBlob: h.dl }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/session", () => ({ useSession: () => ({ email: "asha@example.edu", signOutAction: async () => {} }) }));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => ({ status: "off", setup: h.setup }) }));

import { openVaultSetup, VaultSetupHost } from "../components/workspace/dialogs/VaultSetup";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CODE = "ABCDE-FGHJK-LMNPQ-RSTUV";
const PASS = "correct horse battery";
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
async function mount() {
  const box = document.createElement("div");
  document.body.appendChild(box);
  const root = createRoot(box);
  roots.push(root);
  await act(async () => { root.render(<VaultSetupHost />); });
}
function readBlob(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsText(b); });
}
/** Opens the setup and goes through to the recovery sheet with matching passphrases. */
async function toSheet(): Promise<Promise<boolean>> {
  await mount();
  let result!: Promise<boolean>;
  await act(async () => { result = openVaultSetup(); });
  h.ask.mockResolvedValueOnce(PASS).mockResolvedValueOnce(PASS);
  h.setup.mockResolvedValue({ recoveryCode: CODE });
  await click("vault-setup-submit");
  await until(() => !!$("vault-code"));
  return result;
}

beforeEach(() => { h.ask.mockReset(); h.toast.mockReset(); h.dl.mockReset(); h.setup.mockReset(); h.api.mockReset(); });
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });

describe("VaultSetup and the recovery sheet", () => {
  it("VaultSetup requires matching passphrases, then shows the sheet and enables Done after the checkbox", async () => {
    await mount();
    let result!: Promise<boolean>;
    await act(async () => { result = openVaultSetup(); });
    const dlg = $("vault-setup-dialog")!;
    expect(dlg.textContent).toContain(en.vault_setup_h2);
    expect(dlg.textContent).toContain(en.vault_setup_intro);
    expect($("vault-setup-submit")!.textContent).toBe(en.vault_setup_btn);
    expect($("vault-setup-later")!.textContent).toBe(en.vault_setup_later);
    expect($("vault-setup-remember")!.closest("label")!.textContent).toContain(en.vault_remember);

    // Two different entries: nothing is set up, the student is told, and the setup stays open.
    h.ask.mockResolvedValueOnce(PASS).mockResolvedValueOnce(PASS + "x");
    await click("vault-setup-submit");
    await until(() => h.toast.mock.calls.length === 1);
    expect(h.ask).toHaveBeenNthCalledWith(1, { kind: "vault-choose" });
    expect(h.ask).toHaveBeenNthCalledWith(2, { kind: "vault-confirm" });
    expect(h.toast).toHaveBeenCalledWith(en.bk_err_match);
    expect(h.setup).not.toHaveBeenCalled();
    await until(() => !!$("vault-setup-dialog"));

    // Too short: refused before the confirm step.
    h.ask.mockResolvedValueOnce("short");
    await click("vault-setup-submit");
    await until(() => h.toast.mock.calls.length === 2);
    expect(h.toast).toHaveBeenLastCalledWith(en.bk_err_short);
    expect(h.ask).toHaveBeenCalledTimes(3);
    expect(h.setup).not.toHaveBeenCalled();

    // Cancelling the first prompt returns to the setup without a message.
    h.ask.mockResolvedValueOnce(null);
    await click("vault-setup-submit");
    await until(() => !!$("vault-setup-dialog"));
    expect(h.toast).toHaveBeenCalledTimes(2);

    // Matching, with "Remember on this computer" ticked.
    await click("vault-setup-remember");
    h.ask.mockResolvedValueOnce(PASS).mockResolvedValueOnce(PASS);
    h.setup.mockResolvedValue({ recoveryCode: CODE });
    await click("vault-setup-submit");
    await until(() => !!$("vault-code"));
    expect(h.setup).toHaveBeenCalledTimes(1);
    expect(h.setup).toHaveBeenCalledWith(PASS, true);
    await expect(result).resolves.toBe(true);
    expect($("vault-setup-dialog")).toBeNull();

    // The sheet: the code shown once, Done disabled until "I have saved it" is ticked.
    const sheet = $("vault-sheet-dialog")!;
    expect(sheet.textContent).toContain(en.vault_sheet_h2);
    expect(sheet.textContent).toContain(en.vault_sheet_intro);
    expect($("vault-code")!.textContent).toBe(CODE);
    expect($("vault-sheet-download")!.textContent).toBe(en.vault_sheet_download);
    const done = $("vault-sheet-done") as HTMLButtonElement;
    expect(done.textContent).toBe(en.vault_sheet_done);
    expect(done.disabled).toBe(true);
    // Escape does not dismiss the sheet before it is saved.
    await act(async () => { document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect($("vault-code")).not.toBeNull();
    expect($("vault-sheet-saved")!.closest("label")!.textContent).toContain(en.vault_sheet_saved);
    await click("vault-sheet-saved");
    expect(($("vault-sheet-done") as HTMLButtonElement).disabled).toBe(false);
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
    expect(h.ask).not.toHaveBeenCalled();
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
