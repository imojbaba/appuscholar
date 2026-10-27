// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";

/*
 * The header on a phone (Task 14, canvas Phone): the wordmark, the vault pill and Menu, which holds the projects, the AI key, Help, the language and
 * the account. In a file of its own: run after the account-menu tests of accountMenuExport.test.tsx, the phone Menu was now and then closed again
 * as it opened (about one run in eight; alone it passed every run), by menu state those tests leave in the shared Radix modules.
 */

const h = vi.hoisted(() => ({ exportWork: vi.fn(async () => {}), openExport: vi.fn(), openHelp: vi.fn(), openSettings: vi.fn(), openConnect: vi.fn(async () => ({ result: "closed", provider: "gemini" })), noVault: true }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", scratchProjectId: "s1" }, settings: {} }) }));
vi.mock("@/lib/ai/useKeys", () => ({ useKeys: () => ({ hasKey: () => false }) }));
vi.mock("@/lib/vault/titles", () => ({ useTitle: (t: { title: string } | null) => ({ state: "open", text: t?.title ?? "" }) }));
vi.mock("@/components/workspace/VaultPill", () => ({ VaultPill: () => null }));
vi.mock("@/components/workspace/dialogs/Help", () => ({
  useAccount: () => ({ exportWork: h.exportWork, exporting: false, startSignOut: async () => {}, hasVault: false, noVault: h.noVault, openChange: () => {}, openErase: () => {}, dialogs: null })
}));

import { AppHeader } from "../components/frame/AppHeader";
import { ProjectProvider, type ProjectValue } from "../components/frame/ProjectContext";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = en as Record<string, string>;
const roots: Root[] = [];
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });
beforeEach(() => { h.exportWork.mockClear(); h.openExport.mockClear(); h.openHelp.mockClear(); h.openSettings.mockClear(); h.openConnect.mockClear(); h.noVault = true; });
const tid = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const project = { id: "p1", title: "Sleep and exam anxiety", titleKeyVersion: 0, deks: [] };

function mount(projectId: string | null) {
  const value = { project: projectId ? project : null, projectId, openExport: h.openExport, openSettings: h.openSettings, openConnect: h.openConnect, openHelp: h.openHelp, go: async () => true, openProject: async () => {} } as unknown as ProjectValue;
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
const pick = async (id: string) => { await act(async () => { tid(id)!.click(); }); };


/** A phone (PHONE_QUERY matches), until the test ends. */
function phone() {
  const was = window.matchMedia;
  window.matchMedia = ((q: string) => ({ matches: q === "(max-width: 700px)", media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  return () => { window.matchMedia = was; };
}

describe("the header on a phone (Task 14, canvas Phone)", () => {
  it("is the wordmark, the vault pill and Menu; Menu holds the projects, the AI key, Help, the language and the account", async () => {
    const undo = phone();
    try {
      mount("p1");
      expect(tid("wordmark")).not.toBeNull();
      expect(tid("phone-menu")!.getAttribute("aria-label")).toBe(E.hdr_menu);
      for (const id of ["project-switcher", "ai-pill", "help-btn", "lang-toggle", "account-menu-btn"]) expect(tid(id), id).toBeNull();
      await openMenu("phone-menu", "phone-menu-list");
      for (const id of ["switcher-scratch", "switcher-all", "menu-ai", "menu-help", "menu-lang", "acct-export-project", "acct-export", "acct-settings", "acct-lock", "acct-sign-out", "acct-erase"]) expect(tid(id), id).not.toBeNull();
      // One way to the AI connection: the menu's own item says whether AI is connected, as the AI pill does; Help is the menu's own item too.
      expect(tid("acct-ai")).toBeNull();
      expect(tid("acct-help")).toBeNull();
      expect(tid("menu-ai")!.textContent).toBe("Connect AI");
      expect(tid("acct-settings")!.textContent).toBe("Settings");
      expect(tid("acct-lock")!.textContent).toBe("Lock my work with a passphrase");
      expect(tid("menu-lang")!.textContent).toBe(E.menu_lang_other);
      await pick("menu-help");
      expect(h.openHelp).toHaveBeenCalledTimes(1);
      await openMenu("phone-menu", "phone-menu-list");
      await pick("acct-export-project");
      expect(h.openExport).toHaveBeenCalledTimes(1);
      await openMenu("phone-menu", "phone-menu-list");
      await pick("menu-ai");
      expect(h.openConnect).toHaveBeenCalledTimes(1);
      expect(h.openSettings).not.toHaveBeenCalled();
      await openMenu("phone-menu", "phone-menu-list");
      await pick("acct-settings");
      expect(h.openSettings).toHaveBeenCalledTimes(1);
    } finally { undo(); }
  });

  it("the account menu: AI connection opens Connect AI, Settings opens Settings, Help is there, and Lock my work only while no vault exists", async () => {
    mount("p1");
    await act(async () => { tid("ai-pill")!.click(); });
    expect(h.openConnect).toHaveBeenCalledTimes(1);
    await openMenu();
    expect(tid("acct-ai")!.textContent).toBe("AI connection");
    expect(tid("acct-help")!.textContent).toBe(E.hdr_help);
    expect(tid("acct-lock")).not.toBeNull();
    await pick("acct-ai");
    expect(h.openConnect).toHaveBeenCalledTimes(2);
    expect(h.openSettings).not.toHaveBeenCalled();
    await openMenu();
    await pick("acct-settings");
    expect(h.openSettings).toHaveBeenCalledTimes(1);
  });

  it("offers no Lock my work once a vault exists", async () => {
    h.noVault = false;
    mount("p1");
    await openMenu();
    expect(tid("acct-lock")).toBeNull();
  });

  it("is the full header above the phone's width", () => {
    mount("p1");
    expect(tid("phone-menu")).toBeNull();
    for (const id of ["project-switcher", "ai-pill", "help-btn", "lang-toggle", "account-menu-btn"]) expect(tid(id), id).not.toBeNull();
  });
});
