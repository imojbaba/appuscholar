// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";

/*
 * The account menu's two exports (wave B Task 12, register D-S2-42): inside a project, "Export this project" opens that project's export place
 * with the default parts ticked; "Export all my work" stays the account's zip of every project (the leave-Appuscholar export).
 */

const h = vi.hoisted(() => ({ exportWork: vi.fn(async () => {}), openExport: vi.fn(), openHelp: vi.fn(), openSettings: vi.fn() }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", scratchProjectId: "s1" }, settings: {} }) }));
vi.mock("@/lib/ai/useKeys", () => ({ useKeys: () => ({ hasKey: () => false }) }));
vi.mock("@/lib/vault/titles", () => ({ useTitle: (t: { title: string } | null) => ({ state: "open", text: t?.title ?? "" }) }));
vi.mock("@/components/workspace/VaultPill", () => ({ VaultPill: () => null }));
vi.mock("@/components/workspace/dialogs/Help", () => ({
  useAccount: () => ({ exportWork: h.exportWork, exporting: false, startSignOut: async () => {}, hasVault: false, openChange: () => {}, openErase: () => {}, dialogs: null })
}));

import { AppHeader } from "../components/frame/AppHeader";
import { ProjectProvider, type ProjectValue } from "../components/frame/ProjectContext";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = en as Record<string, string>;
const roots: Root[] = [];
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });
beforeEach(() => { h.exportWork.mockClear(); h.openExport.mockClear(); h.openHelp.mockClear(); h.openSettings.mockClear(); });
const tid = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const project = { id: "p1", title: "Sleep and exam anxiety", titleKeyVersion: 0, deks: [] };

function mount(projectId: string | null) {
  const value = { project: projectId ? project : null, projectId, openExport: h.openExport, openSettings: h.openSettings, openConnect: vi.fn(), openHelp: h.openHelp, go: async () => true, openProject: async () => {} } as unknown as ProjectValue;
  const el = document.body.appendChild(document.createElement("div"));
  const root = createRoot(el);
  roots.push(root);
  act(() => { root.render(<ProjectProvider value={value}><AppHeader /></ProjectProvider>); });
}
/** Radix opens a menu from its trigger on Enter. */
async function openMenu(trigger = "account-menu-btn", menu = "account-menu") {
  await act(async () => { tid(trigger)!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
  expect(tid(menu)).not.toBeNull();
}
/**
 * Picks an item, then lets the menu finish closing. Radix's FocusScope hands focus back to the trigger in a setTimeout(0) once the menu
 * unmounts, and `await act` resolves on a setImmediate, so that timer could still be pending when the next line reopened the menu: it then
 * focused the trigger, outside the new menu, whose DismissableLayer closed it (the phone test's second Menu, about 1 run in 8). A timer set
 * after Radix's runs after it.
 */
const pick = async (id: string) => {
  await act(async () => { tid(id)!.click(); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};

describe("the account menu's exports", () => {
  it("inside a project, Export this project opens its export place with the default parts", async () => {
    mount("p1");
    await openMenu();
    expect(tid("acct-export-project")!.textContent).toBe(E.acct_export_project);
    await pick("acct-export-project");
    expect(h.openExport).toHaveBeenCalledTimes(1);
    expect(h.openExport.mock.calls[0]).toEqual([]);
    expect(h.exportWork).not.toHaveBeenCalled();
  });

  it("Export all my work makes the account's zip, inside a project and outside one", async () => {
    mount("p1");
    await openMenu();
    expect(tid("acct-export")!.textContent).toBe(E.acct_export);
    await pick("acct-export");
    expect(h.exportWork).toHaveBeenCalledTimes(1);
    expect(h.openExport).not.toHaveBeenCalled();
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    document.body.innerHTML = "";
    // Outside a project there is no project to export: only the account's zip is offered.
    mount(null);
    await openMenu();
    expect(tid("acct-export-project")).toBeNull();
    await pick("acct-export");
    expect(h.exportWork).toHaveBeenCalledTimes(2);
  });
});
