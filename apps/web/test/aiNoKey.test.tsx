// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * First-run build spec (OJ 2026-10-27): any AI button pressed with no key opens Connect AI, not Settings; and the AI writing language, never set, follows
 * the page's language. The real useCallAI and callAI run; the workspace's dialogs are spies.
 */

const h = vi.hoisted(() => ({ openConnect: vi.fn(async () => ({ result: "closed", provider: "gemini" })), openSettings: vi.fn(), api: vi.fn() }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ project: null, openConnect: h.openConnect, openSettings: h.openSettings }) }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ settings: { provider: "groq" } }) }));
vi.mock("@/lib/ai/useKeys", () => ({ useKeys: () => ({ blobs: {}, hasKey: () => false, getUnlocked: async () => null }) }));
vi.mock("@/components/workspace/dialogs/Passphrase", () => ({ askPassphrase: vi.fn(async () => null) }));
vi.mock("@/components/workspace/dialogs/RateLimit", () => ({ showRateLimit: vi.fn() }));
vi.mock("@/lib/ai/pdDialog", () => ({ askPd: vi.fn() }));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => ({ status: "off" }) }));

import { keyStore } from "../lib/ai/keys";
import { useCallAI } from "../lib/ai/useCallAI";
import { contentLangOf } from "../lib/ai/contentLang";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); });
beforeEach(() => { h.openConnect.mockClear(); h.openSettings.mockClear(); h.api.mockReset(); keyStore.clearSession(); });

describe("an AI button with no key", () => {
  it("opens Connect AI for the chosen company, not Settings, and sends nothing", async () => {
    const box: { call: ReturnType<typeof useCallAI> | null } = { call: null };
    function Probe() { box.call = useCallAI(); return null; }
    const root = createRoot(document.createElement("div"));
    roots.push(root);
    await act(async () => { root.render(<Probe />); });
    await expect(box.call!("Improve this text: hello", { noScan: true })).rejects.toMatchObject({ code: "no-key", message: "Connect AI first: press Connect AI at the top of the page." });
    expect(h.openConnect).toHaveBeenCalledWith({ provider: "groq" });
    expect(h.openSettings).not.toHaveBeenCalled();
    expect(h.api).not.toHaveBeenCalled();
  });
});

describe("the AI writing language", () => {
  it("follows the page's language until it is set; a project's own language wins", () => {
    expect(contentLangOf(null, {})).toBe("en");
    expect(contentLangOf(null, { lang: "hi" })).toBe("hi");
    expect(contentLangOf(null, { lang: "en" })).toBe("en");
    expect(contentLangOf(null, { lang: "hi", contentLang: "en" })).toBe("en");
    expect(contentLangOf(null, { lang: "en", contentLang: "hi" })).toBe("hi");
    expect(contentLangOf({ contentLang: "en" }, { lang: "hi" })).toBe("en");
    expect(contentLangOf({ contentLang: "hi" }, { lang: "en" })).toBe("hi");
  });
});
