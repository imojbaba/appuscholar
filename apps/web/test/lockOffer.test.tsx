// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";

/*
 * The offer to lock the work (first-run build spec, OJ 2026-10-27: "offer this once, the first time participant data is saved"): a note at the top of the tool's
 * panel once participant data is saved there, only while no passphrase is set, answered once per account on this computer; Lock my work runs the vault setup.
 */

const h = vi.hoisted(() => ({
  me: { id: "u-lock" } as { id: string } | null,
  setup: vi.fn(async () => true)
}));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: h.me, settings: {} }) }));
vi.mock("@/components/workspace/dialogs/VaultSetup", () => ({ openVaultSetup: h.setup }));

import { LockOfferNote } from "../components/workspace/LockOfferNote";
import { publishVaultStatus } from "../lib/vault/statusStore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = en as Record<string, string>;
const roots: Root[] = [];
const $ = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
function mount(node: React.ReactNode) {
  const el = document.body.appendChild(document.createElement("div"));
  const root = createRoot(el);
  roots.push(root);
  act(() => { root.render(node); });
  return root;
}
beforeEach(() => { h.me = { id: "u-lock" }; h.setup.mockClear(); localStorage.clear(); publishVaultStatus("off"); });
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; publishVaultStatus("loading"); });

describe("the offer to lock the work", () => {
  it("shows once data is saved with no passphrase set: says this is data about real people, what locking does and where to do it later", () => {
    mount(<LockOfferNote saved />);
    const note = $("lock-offer")!;
    expect(note).not.toBeNull();
    expect(note.textContent).toContain(E.lock_offer_h);
    expect(note.textContent).toContain(E.lock_offer);
    expect(note.textContent).toContain("You can do this later: Lock my work with a passphrase, in the account menu.");
    // The "later" line names the account menu's own item.
    expect(E.lock_offer_later).toContain(E.acct_lock);
  });

  it("Lock my work runs the setup and the note does not come back", () => {
    const r = mount(<LockOfferNote saved />);
    act(() => { $("lock-offer-go")!.click(); });
    expect(h.setup).toHaveBeenCalledTimes(1);
    expect($("lock-offer")).toBeNull();
    act(() => { r.unmount(); });
    mount(<LockOfferNote saved />);
    expect($("lock-offer")).toBeNull();
  });

  it("Not now puts it away for good for this account on this computer, without the setup", () => {
    const r = mount(<LockOfferNote saved />);
    act(() => { $("lock-offer-not-now")!.click(); });
    expect($("lock-offer")).toBeNull();
    act(() => { r.unmount(); });
    mount(<LockOfferNote saved />);
    expect($("lock-offer")).toBeNull();
    expect(h.setup).not.toHaveBeenCalled();
    // Another account on the same computer is still offered it.
    h.me = { id: "u-other" };
    mount(<LockOfferNote saved />);
    expect($("lock-offer")).not.toBeNull();
  });

  it("is not shown before anything is saved, while a passphrase is set (locked or open), while the vault is not known, nor before the account is known", () => {
    mount(<LockOfferNote saved={false} />);
    expect($("lock-offer")).toBeNull();
    for (const status of ["locked", "unlocked", "loading"] as const) {
      act(() => { publishVaultStatus(status); });
      const r = mount(<LockOfferNote saved />);
      expect($("lock-offer"), status).toBeNull();
      act(() => { r.unmount(); });
    }
    act(() => { publishVaultStatus("off"); });
    h.me = null;
    mount(<LockOfferNote saved />);
    expect($("lock-offer")).toBeNull();
  });

  it("follows the vault: appears when it is known to be off, goes when a passphrase is set", () => {
    publishVaultStatus("loading");
    mount(<LockOfferNote saved />);
    expect($("lock-offer")).toBeNull();
    act(() => { publishVaultStatus("off"); });
    expect($("lock-offer")).not.toBeNull();
    act(() => { publishVaultStatus("unlocked"); });
    expect($("lock-offer")).toBeNull();
  });
});
