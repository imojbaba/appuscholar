// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ dialog: "welcome" as string | null, openSettings: vi.fn(), closeDialog: vi.fn(), update: vi.fn(async () => undefined) }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1" }, settings: {}, update: h.update, reload: async () => undefined }) }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ dialog: h.dialog, closeDialog: h.closeDialog, openSettings: h.openSettings }) }));

import { Welcome, WELCOME_GUARD_MS } from "../components/workspace/dialogs/Welcome";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
const $ = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
function mount() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  act(() => { root.render(<Welcome />); });
}
beforeEach(() => { vi.useFakeTimers(); h.dialog = "welcome"; h.openSettings.mockReset(); h.closeDialog.mockReset(); h.update.mockClear(); });
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; vi.useRealTimers(); });

/**
 * O11 (Phase 3A walk): on a new account the provider window opened straight after Continue on the terms, and the welcome's "Later" was
 * never seen. The welcome's primary button sits where Continue was and took focus as the window opened, so a second click or an Enter
 * meant for the terms landed on "Set up my key". The welcome now opens with its buttons disarmed for a moment and no button focused.
 */
describe("Welcome (first-run order)", () => {
  it("opens with both buttons disarmed, and a click in that moment opens nothing", () => {
    mount();
    expect($("welcome-dialog")).not.toBeNull();
    expect(($("welcome-setup") as HTMLButtonElement).disabled).toBe(true);
    expect(($("welcome-later") as HTMLButtonElement).disabled).toBe(true);
    act(() => { $("welcome-setup")!.click(); });
    expect(h.openSettings).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
    expect($("welcome-dialog")).not.toBeNull();
  });

  it("does not put focus on a button as it opens, so a stray Enter does nothing", () => {
    mount();
    const a = document.activeElement;
    expect(a === null || a === document.body || a === $("welcome-dialog")).toBe(true);
  });

  it("arms the buttons after the guard; Later marks the tour seen and closes, Set up my key opens the key window", () => {
    mount();
    act(() => { vi.advanceTimersByTime(WELCOME_GUARD_MS); });
    expect(($("welcome-setup") as HTMLButtonElement).disabled).toBe(false);
    expect(($("welcome-later") as HTMLButtonElement).disabled).toBe(false);
    act(() => { $("welcome-later")!.click(); });
    expect(h.update).toHaveBeenCalledWith({ seenWelcome: true });
    expect(h.closeDialog).toHaveBeenCalledTimes(1);
    expect(h.openSettings).not.toHaveBeenCalled();
    act(() => { $("welcome-setup")!.click(); });
    expect(h.openSettings).toHaveBeenCalledTimes(1);
  });
});
