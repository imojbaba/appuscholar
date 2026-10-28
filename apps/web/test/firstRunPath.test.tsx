// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import hi from "../messages/hi.json";

/*
 * The first-run path's last known faults (2026-10-26, after Dr. Sharma's first login): the terms window (Q6, Q7), the language button (Q1),
 * the AI pill after a reload (O6), and the key window's words on a Hindi page (Q9). The 44 px heights themselves are measured at 375 px by
 * e2e/phase3a-vault.spec.ts and the QA layout rule; jsdom has no layout.
 */

const h = vi.hoisted(() => ({
  me: null as null | { id: string; scratchProjectId: string; termsAcceptedAt: string | null },
  keysLoaded: false,
  hasKey: false,
  closeDialog: vi.fn()
}));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: h.me, settings: { provider: "groq" }, reload: async () => {}, update: async () => {} }) }));
vi.mock("@/lib/ai/useKeys", () => ({ useKeys: () => ({ hasKey: () => h.hasKey, loaded: h.keysLoaded }) }));
vi.mock("@/lib/vault/titles", () => ({ useTitle: (t: { title: string } | null) => ({ state: "open", text: t?.title ?? "" }) }));
vi.mock("@/components/workspace/VaultPill", () => ({ VaultPill: () => null }));
vi.mock("@/components/workspace/dialogs/Help", () => ({
  useAccount: () => ({ exportWork: async () => {}, exporting: false, startSignOut: async () => {}, hasVault: false, openChange: () => {}, openErase: () => {}, dialogs: null })
}));

import { AppHeader } from "../components/frame/AppHeader";
import { Terms } from "../components/workspace/dialogs/Terms";
import { ProjectProvider, type ProjectValue } from "../components/frame/ProjectContext";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = en as Record<string, string>;
const H = hi as Record<string, string>;
const roots: Root[] = [];
const tid = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? "");

/** Mounts `make()`; the function returned renders it again (a fresh element and context value, as a provider's change would). */
function mount(make: () => React.ReactNode) {
  const value = () => ({ project: null, projectId: null, dialog: null, closeDialog: h.closeDialog, openSettings: () => {}, openHelp: () => {}, go: async () => true, openProject: async () => {} }) as unknown as ProjectValue;
  const el = document.body.appendChild(document.createElement("div"));
  const root = createRoot(el);
  roots.push(root);
  act(() => { root.render(<ProjectProvider value={value()}>{make()}</ProjectProvider>); });
  return () => act(() => { root.render(<ProjectProvider value={value()}>{make()}</ProjectProvider>); });
}

beforeEach(() => { h.me = null; h.keysLoaded = false; h.hasKey = false; h.closeDialog.mockReset(); });
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });

describe("the header on the first-run path", () => {
  it("O6: the AI pill claims nothing until the account and its keys are read, and never says 'add your key' to a student who has one", () => {
    const rerender = mount(() => <AppHeader />);
    expect(tid("ai-pill")!.textContent).toBe(E.ai_pill_wait);
    // The account is read, its server keys not yet: still nothing claimed.
    h.me = { id: "u1", scratchProjectId: "s1", termsAcceptedAt: "2026-10-01T00:00:00Z" };
    rerender();
    expect(tid("ai-pill")!.textContent).toBe(E.ai_pill_wait);
    h.keysLoaded = true;
    h.hasKey = true;
    rerender();
    expect(tid("ai-pill")!.textContent).toBe(fill(E.ai_pill_key!, { provider: "Groq" }));
    // Once both are known, a student with no key is told to add one.
    h.hasKey = false;
    rerender();
    expect(tid("ai-pill")!.textContent).toBe("Connect AI");
  });

  it("Q1: the language button's accessible name starts with the text it shows", () => {
    h.me = { id: "u1", scratchProjectId: "s1", termsAcceptedAt: "2026-10-01T00:00:00Z" };
    mount(() => <AppHeader />);
    const button = tid("lang-toggle")!;
    const shown = button.textContent!.trim();
    expect(shown).toBe("हि");
    expect(button.getAttribute("aria-label")!.startsWith(shown)).toBe(true);
    expect(button.getAttribute("aria-label")).toContain(E.lang_switch_to_hi);
  });
});

describe("the terms window", () => {
  it("Q6, Q7: the terms text takes keyboard focus, as a named region, and the two tick rows are 44 px rows", () => {
    h.me = { id: "u1", scratchProjectId: "s1", termsAcceptedAt: null };
    mount(() => <Terms />);
    const body = tid("terms-body")!;
    expect(body.tabIndex).toBe(0);
    expect(body.getAttribute("role")).toBe("region");
    expect(body.getAttribute("aria-label")).toBe(E.terms_h);
    for (const id of ["terms-age", "terms-agree"]) expect(tid(id)!.closest("label")!.className.split(" "), id).toContain("min-h-11");
  });
});

describe("the key window's words", () => {
  it("Q9: every sentence of the key window has Hindi (a provider's own name and its English button names apart)", () => {
    const keys = Object.keys(E).filter((k) => /^settings_(opt|steps|keymode_hint|key|test|field|fallback|log|contentlang_set|contentlang_fail|open_link)_?/.test(k));
    expect(keys.length).toBeGreaterThan(50);
    for (const k of keys) {
      expect(H[k], k).toBeTruthy();
      expect(H[k], k).not.toBe(E[k]);
    }
    // The providers' button names stay in English and are marked so (the QA Hindi rule skips lang="en").
    expect(H.settings_steps_groq).toContain('<b lang="en">API Keys</b>');
  });
});
