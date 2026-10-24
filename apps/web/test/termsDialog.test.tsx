// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TERMS_SINCE } from "../lib/terms";
import en from "../messages/en.json";

/*
 * The workspace's terms dialog after its body was factored out for the adding screen (wave B Task 20 fix round, register row D-S2-125): the same words, the same gate and the same
 * answers as before. While the gate applies the dialog cannot be dismissed; the same text read from Help has a Close; the under-18 answer records nothing.
 */
const h = vi.hoisted(() => ({
  api: vi.fn(async (..._a: unknown[]) => undefined as unknown),
  reload: vi.fn(async () => {}),
  toast: vi.fn(),
  closeDialog: vi.fn(),
  me: { id: "u1", termsAcceptedAt: null as string | null },
  dialog: null as string | null
}));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: h.me, settings: {}, reload: h.reload }) }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ dialog: h.dialog, closeDialog: h.closeDialog }) }));

import { Terms } from "../components/workspace/dialogs/Terms";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const E = en as Record<string, string>;
const roots: Root[] = [];
const tid = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
async function mount() {
  const el = document.body.appendChild(document.createElement("div"));
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(<Terms />); });
}
async function click(el: HTMLElement | null) { await act(async () => { el!.click(); await Promise.resolve(); }); }

beforeEach(() => {
  h.api.mockReset().mockResolvedValue(undefined);
  h.reload.mockReset().mockResolvedValue(undefined);
  h.toast.mockReset();
  h.closeDialog.mockReset();
  h.me = { id: "u1", termsAcceptedAt: null };
  h.dialog = null;
});
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });

describe("the terms dialog while the gate applies", () => {
  it("opens by itself with the text, the version and the two ticks, and has no Close", async () => {
    await mount();
    expect(tid("terms-dialog")).not.toBeNull();
    expect(tid("terms-dialog")!.querySelector("h2")!.textContent).toBe(E.terms_h);
    expect(tid("terms-body")!.textContent).toContain(E.terms_d1);
    expect(tid("terms-body")!.textContent).toContain(E.terms_u4);
    expect(tid("terms-version")).not.toBeNull();
    expect(tid("terms-age")).not.toBeNull();
    expect(tid("terms-agree")).not.toBeNull();
    expect(tid("terms-close")).toBeNull();
  });

  it("Continue needs both ticks; with both it records the answer and reads /me again", async () => {
    await mount();
    await click(tid("terms-continue"));
    expect(tid("terms-need")!.textContent).toBe(E.terms_need);
    expect(h.api).not.toHaveBeenCalled();
    await click(tid("terms-age"));
    await click(tid("terms-agree"));
    expect(tid("terms-need")).toBeNull();
    await click(tid("terms-continue"));
    expect(h.api).toHaveBeenCalledWith("/me/terms", { method: "POST" });
    expect(h.reload).toHaveBeenCalledTimes(1);
  });

  it("a failed record says so and records nothing more", async () => {
    h.api.mockRejectedValue(new Error("offline"));
    await mount();
    await click(tid("terms-age"));
    await click(tid("terms-agree"));
    await click(tid("terms-continue"));
    expect(h.toast).toHaveBeenCalledWith("Could not save your answer. Try again.");
    expect(h.reload).not.toHaveBeenCalled();
    expect(tid("terms-dialog")).not.toBeNull();
  });

  it("under 18 shows its message with Back and records nothing", async () => {
    await mount();
    await click(tid("terms-under"));
    expect(tid("terms-under-msg")!.textContent).toBe(E.terms_under_msg);
    expect(tid("terms-continue")).toBeNull();
    await click(tid("terms-back"));
    expect(tid("terms-continue")).not.toBeNull();
    expect(h.api).not.toHaveBeenCalled();
  });

  it("Escape does not close it and shows the need line", async () => {
    await mount();
    await act(async () => { tid("terms-dialog")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await Promise.resolve(); });
    expect(tid("terms-dialog")).not.toBeNull();
    expect(tid("terms-need")!.textContent).toBe(E.terms_need);
  });
});

describe("the same text read from Help", () => {
  it("opens only when asked, has a Close and no ticks", async () => {
    h.me = { id: "u1", termsAcceptedAt: TERMS_SINCE };
    await mount();
    expect(tid("terms-dialog")).toBeNull();
    act(() => { roots.splice(0)[0]!.unmount(); });
    document.body.innerHTML = "";
    h.dialog = "terms";
    await mount();
    expect(tid("terms-body")!.textContent).toContain(E.terms_d1);
    expect(tid("terms-age")).toBeNull();
    await click(tid("terms-close"));
    expect(h.closeDialog).toHaveBeenCalledTimes(1);
  });
});
