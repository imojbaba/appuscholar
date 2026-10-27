// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";

/*
 * The specialty pack setting (v1 1171-1178, setPack 2677): a select of General research and Psychology in the Settings window, below the content
 * language. A pack not chosen yet reads as psychology (v1 getPack 2660, ruling P3), so nobody loses the Research helpers; picking one writes the account
 * setting `pack`. What the pack hides is tested in test/places.test.tsx; mergeSettings keeping the key is in test/settings.test.ts.
 */

const h = vi.hoisted(() => ({
  settings: {} as { pack?: "general" | "psychology" },
  update: vi.fn(async (_patch: Record<string, unknown>) => {}),
  toast: vi.fn(),
  ws: { dialog: "settings", closeDialog: vi.fn(), project: null, reloadProject: vi.fn(), openTerms: vi.fn() }
}));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1" }, settings: h.settings, update: h.update }) }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/components/workspace/dialogs/VaultSetup", () => ({ openVaultSetup: vi.fn() }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => h.ws }));

import { SettingsPack } from "../components/workspace/dialogs/SettingsPack";
import { SettingsWindow } from "../components/workspace/dialogs/Settings";
import { VaultProvider } from "../lib/vault/useVault";
import { KeysProvider } from "../lib/ai/useKeys";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = en as Record<string, string>;
const roots: Root[] = [];
const $ = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
function unmountAll() { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; }
const select = () => $("settings-pack") as HTMLSelectElement;
async function mount(node: React.ReactNode) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(node); });
}
async function choose(value: string) {
  await act(async () => {
    // React tracks the select's value: set it through the native setter so the change event is seen as a real change.
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select(), value);
    select().dispatchEvent(new Event("change", { bubbles: true }));
  });
}

beforeEach(() => { h.settings = {}; h.update.mockClear(); h.toast.mockClear(); });
afterEach(unmountAll);

describe("Specialty pack setting (Task 11)", () => {
  it("offers General research and Psychology with v1's words, and shows psychology when no pack was chosen", async () => {
    await mount(<SettingsPack />);
    expect([...select().options].map((o) => [o.value, o.textContent])).toEqual([["general", E.settings_pack_general], ["psychology", E.settings_pack_psychology]]);
    expect(select().value).toBe("psychology");
    expect(h.update).not.toHaveBeenCalled();
  });

  it("shows the saved pack", async () => {
    h.settings = { pack: "general" };
    await mount(<SettingsPack />);
    expect(select().value).toBe("general");
    unmountAll();
    h.settings = { pack: "psychology" };
    await mount(<SettingsPack />);
    expect(select().value).toBe("psychology");
  });

  it("changing it writes the pack, and nothing else", async () => {
    await mount(<SettingsPack />);
    await choose("general");
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update).toHaveBeenCalledWith({ pack: "general" });
    await choose("psychology");
    expect(h.update).toHaveBeenLastCalledWith({ pack: "psychology" });
    expect(h.update).toHaveBeenCalledTimes(2);
  });

  it("has a label tied to the select, and v1's description", async () => {
    await mount(<SettingsPack />);
    const label = document.body.querySelector("label")!;
    expect(label.textContent).toBe(E.settings_pack_label);
    expect(label.htmlFor).toBe(select().id);
    expect(select().id).not.toBe("");
    expect(document.body.textContent).toContain(E.settings_pack_desc);
  });

  it("sits in the Settings dialog right after the content language", async () => {
    await mount(<VaultProvider><KeysProvider><SettingsWindow /></KeysProvider></VaultProvider>);
    const lang = $("content-lang")!;
    expect(select()).not.toBeNull();
    expect(lang.compareDocumentPosition(select()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The next block is the ORCID field's: nothing sits between the two.
    expect(select().closest(".field")!.previousElementSibling).toBe(lang.closest(".field"));
    expect(select().closest(".field")!.nextElementSibling).toBe($("orcid-input")!.closest(".field"));
  });
});
