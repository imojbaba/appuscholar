// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROV_ORDER, PROVIDERS } from "@appuscholar/core";
import en from "../messages/en.json";
import aipill from "../messages/tools/aipill.en.json";

/*
 * Quick provider switch on the AI pill (wave D Task 10, v1 renderProvTabs / toggleProvMenu / switchProv 5141-5169, ruling P6): the pill still opens
 * Settings; a caret beside it opens a menu of the six providers. A provider with a key becomes the chosen one; one without opens Settings on it.
 */

const h = vi.hoisted(() => ({
  update: vi.fn(async () => {}), openSettings: vi.fn(), toast: vi.fn(),
  settings: {} as { provider?: string }, keys: new Set<string>()
}));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", scratchProjectId: "s1" }, settings: h.settings, update: h.update }) }));
vi.mock("@/lib/ai/useKeys", () => ({ useKeys: () => ({ hasKey: (p: string) => h.keys.has(p) }) }));
vi.mock("@/lib/vault/titles", () => ({ useTitle: (t: { title: string } | null) => ({ state: "open", text: t?.title ?? "" }) }));
vi.mock("@/components/ui/toast", () => ({ toast: (m: string) => h.toast(m) }));
vi.mock("@/components/workspace/VaultPill", () => ({ VaultPill: () => null }));
vi.mock("@/components/workspace/dialogs/Help", () => ({
  useAccount: () => ({ exportWork: async () => {}, exporting: false, startSignOut: async () => {}, hasVault: false, openChange: () => {}, openErase: () => {}, dialogs: null })
}));

import { AppHeader } from "../components/frame/AppHeader";
import { ProjectProvider, type ProjectValue } from "../components/frame/ProjectContext";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = { ...(en as Record<string, string>), ...(aipill as Record<string, string>) };
const roots: Root[] = [];
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });
beforeEach(() => { h.update.mockClear(); h.openSettings.mockClear(); h.toast.mockClear(); h.settings = {}; h.keys = new Set(); });
const tid = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);

function mount() {
  const value = { project: null, projectId: null, openExport: () => {}, openSettings: h.openSettings, openHelp: () => {}, go: async () => true, openProject: async () => {} } as unknown as ProjectValue;
  const el = document.body.appendChild(document.createElement("div"));
  const root = createRoot(el);
  roots.push(root);
  act(() => { root.render(<ProjectProvider value={value}><AppHeader /></ProjectProvider>); });
}
/** Radix opens a menu from its trigger on Enter. */
async function openSwitch() {
  await act(async () => { tid("ai-pill-menu")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
  expect(tid("ai-pill-list")).not.toBeNull();
}
const pick = async (id: string) => { await act(async () => { tid(id)!.click(); }); };
const items = () => [...document.body.querySelectorAll<HTMLElement>('[data-testid^="ai-switch-"]')].filter((e) => e.getAttribute("role")?.startsWith("menuitem"));

describe("the AI pill's provider switch", () => {
  it("keeps the pill: its text is unchanged and a click still opens Settings with no provider", async () => {
    h.settings = { provider: "groq" };
    h.keys = new Set(["groq"]);
    mount();
    expect(tid("ai-pill")!.textContent).toBe("AI: Groq, your key");
    await pick("ai-pill");
    expect(h.openSettings).toHaveBeenCalledTimes(1);
    expect(h.openSettings.mock.calls[0]).toEqual([]);
    expect(tid("ai-pill-list")).toBeNull();
  });

  it("puts the caret beside the pill, not inside it, with a name a screen reader can use", () => {
    mount();
    const caret = tid("ai-pill-menu")!;
    expect(caret.tagName).toBe("BUTTON");
    expect(tid("ai-pill")!.contains(caret)).toBe(false);
    expect(caret.getAttribute("aria-label")).toBe("Switch AI provider");
    expect(caret.getAttribute("aria-label")).toBe(E.aipill_title);
    expect(caret.getAttribute("title")).toBe(E.aipill_title);
  });

  it("lists the six providers in PROV_ORDER, named from PROVIDERS", async () => {
    mount();
    await openSwitch();
    expect(items().map((e) => e.getAttribute("data-testid"))).toEqual(PROV_ORDER.map((p) => `ai-switch-${p}`));
    expect(items().map((e) => e.textContent)).toEqual(PROV_ORDER.map((p) => PROVIDERS[p].name));
  });

  it("marks the chosen provider: bold, checked and with a check mark; the others are not", async () => {
    h.settings = { provider: "deepseek" };
    mount();
    await openSwitch();
    for (const p of PROV_ORDER) {
      const el = tid(`ai-switch-${p}`)!;
      const on = p === "deepseek";
      expect(el.getAttribute("aria-checked"), p).toBe(on ? "true" : "false");
      expect(el.classList.contains("font-semibold"), p).toBe(on);
      expect(el.querySelector("svg"), p).toSatisfy((svg: Element | null) => (svg !== null) === on);
    }
  });

  it("is Gemini that is marked when no provider has been chosen", async () => {
    mount();
    await openSwitch();
    expect(tid("ai-switch-gemini")!.getAttribute("aria-checked")).toBe("true");
  });

  it("tells which providers have a key: a green dot and a title", async () => {
    h.keys = new Set(["groq"]);
    mount();
    await openSwitch();
    expect(tid("ai-switch-groq")!.getAttribute("title")).toBe("Key saved, click to use");
    expect(tid("ai-switch-groq")!.getAttribute("title")).toBe(E.aipill_key_saved);
    expect(tid("ai-switch-claude")!.getAttribute("title")).toBe("No key yet, click to add");
    expect(tid("ai-switch-claude")!.getAttribute("title")).toBe(E.aipill_no_key);
    expect(tid("ai-switch-groq")!.querySelector("[data-key]")!.getAttribute("data-key")).toBe("saved");
    expect(tid("ai-switch-claude")!.querySelector("[data-key]")!.getAttribute("data-key")).toBe("none");
  });

  it("a provider with a key becomes the chosen one and says so", async () => {
    h.keys = new Set(["openai"]);
    mount();
    await openSwitch();
    await pick("ai-switch-openai");
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update.mock.calls[0]).toEqual([{ provider: "openai" }]);
    expect(h.openSettings).not.toHaveBeenCalled();
    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(h.toast).toHaveBeenCalledWith("Now using ChatGPT (OpenAI). Your next AI request goes to ChatGPT.");
    expect(tid("ai-pill-list")).toBeNull();
  });

  it("a provider without a key opens Settings on it and asks for the key", async () => {
    h.keys = new Set(["groq"]);
    h.settings = { provider: "groq" };
    mount();
    await openSwitch();
    await pick("ai-switch-claude");
    expect(h.openSettings).toHaveBeenCalledTimes(1);
    expect(h.openSettings.mock.calls[0]).toEqual(["claude"]);
    expect(h.update).not.toHaveBeenCalled();
    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(h.toast).toHaveBeenCalledWith("Paste your Claude key to enable it.");
  });

  it("its new strings are plain words: no emoji, no dashes, no placeholder left over", () => {
    for (const k of ["aipill_title", "aipill_now", "aipill_paste", "aipill_key_saved", "aipill_no_key"]) {
      expect(E[k], k).toBeTruthy();
      expect(E[k], k).not.toMatch(/[–—✓✔\u{1F300}-\u{1FAFF}]/u);
    }
  });
});
