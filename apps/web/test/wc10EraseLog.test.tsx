// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AiuEntry } from "@appuscholar/core";
import en from "../messages/en.json";
import designEn from "../messages/tools/design.en.json";
import designHi from "../messages/tools/design.hi.json";

/*
 * Task C10, "Erase the log" on the AI-use tab (v1 aiuClear 5487-5491, button 1909). The log is erased for the whole account (DELETE /ai/log), so the
 * confirm says "all your projects"; the statement already built stays in its box; a failure is said inline and changes nothing. The log is a fake
 * GET /ai/log, DELETE /ai/log is a fake that records its calls.
 */

const h = vi.hoisted(() => ({
  log: [] as unknown[],
  calls: [] as Array<{ path: string; method: string }>,
  deleteFails: false,
  deleteGate: null as Promise<void> | null,
  settings: {} as Record<string, unknown>,
  toast: vi.fn()
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/p/p1/design/aiuse" }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/export/download", () => ({ downloadBlob: () => undefined }));
vi.mock("@/lib/api", () => ({
  ApiError: class extends Error {},
  apiFetch: async (path: string, init?: { method?: string }) => {
    const method = init?.method ?? "GET";
    h.calls.push({ path, method });
    if (method === "DELETE") {
      if (h.deleteGate) await h.deleteGate;
      if (h.deleteFails) throw new Error("503");
      h.log = [];
      return undefined;
    }
    return h.log;
  }
}));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: null, settings: h.settings, update: vi.fn(async () => undefined), reload: async () => undefined }) }));
vi.mock("@/lib/editor/docAccess", () => ({ useDocAccess: () => ({ insertBlock: async () => true }) }));
vi.mock("@/lib/blobs/useProjectBlob", () => ({
  useProjectBlob: () => ({ value: null, loading: false, locked: false, broken: false, error: false, readOnly: false, set: () => undefined, flush: async () => true })
}));

import { AiUse } from "../components/tools/design/AiUse";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const E = { ...(en as Record<string, string>), ...(designEn as Record<string, string>) };
const e = (d: string, k: string, g: string): AiuEntry => ({ d, p: "groq", m: "openai/gpt-oss-120b", k, g });
const LOG: AiuEntry[] = [e("2026-10-01", "grammar and polish", "text"), e("2026-10-05", "feedback on my draft", "feedback")];

const roots: Root[] = [];
const $ = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const $$ = (sel: string) => [...document.body.querySelectorAll<HTMLElement>(sel)];
const text = (id: string) => $(id)?.textContent ?? null;
const deletes = () => h.calls.filter((c) => c.method === "DELETE");
async function render(): Promise<void> {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(<AiUse projectId="p1" />); });
}
const click = async (id: string) => { await act(async () => { $(id)!.click(); }); };
const rows = () => $$('[data-testid^="aiu-row-"]').map((r) => r.getAttribute("data-k"));

beforeEach(() => {
  h.log = LOG; h.calls.length = 0; h.deleteFails = false; h.deleteGate = null; h.settings = {}; h.toast.mockClear();
});
afterEach(async () => {
  for (const r of roots.splice(0)) await act(async () => { r.unmount(); });
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("Erase the log (Task C10)", () => {
  it("the button opens a confirm that names all your projects and says it cannot be undone; nothing is called yet", async () => {
    await render();
    expect($("aiu-erase-confirm")).toBeNull();
    await click("aiu-erase");
    const box = $("aiu-erase-confirm")!;
    expect(box).not.toBeNull();
    expect(box.textContent).toContain("all your projects");
    expect(box.textContent).toMatch(/cannot be undone/i);
    expect(box.textContent).toContain("stays in its box");
    expect(deletes()).toHaveLength(0);
  });

  it("Cancel closes the confirm and calls nothing; the rows are still there", async () => {
    await render();
    await click("aiu-erase");
    await click("aiu-erase-cancel");
    expect($("aiu-erase-confirm")).toBeNull();
    expect(deletes()).toHaveLength(0);
    expect(rows()).toEqual(["grammar and polish", "feedback on my draft"]);
    expect(text("aiu-erase-msg")).toBe("");
  });

  it("Confirm calls DELETE /ai/log once, and the tab shows the empty-log state and says the log is erased", async () => {
    await render();
    await click("aiu-erase");
    await click("aiu-erase-yes");
    expect(deletes()).toEqual([{ path: "/ai/log", method: "DELETE" }]);
    expect($("aiu-erase-confirm")).toBeNull();
    expect(rows()).toEqual([]);
    expect(text("aiu-count")).toBe(E.design_aiu_empty);
    expect(text("aiu-erase-msg")).toBe(E.design_aiu_erased);
    expect(E.design_aiu_erased).toContain("all your projects");
    expect(h.toast).not.toHaveBeenCalled();
    expect(h.calls.filter((c) => c.method === "GET")).toHaveLength(1);
  });

  it("while the erase is out the buttons are off, so a second click cannot send a second delete", async () => {
    let open!: () => void;
    h.deleteGate = new Promise<void>((r) => { open = r; });
    await render();
    await click("aiu-erase");
    await click("aiu-erase-yes");
    expect(($("aiu-erase-yes") as HTMLButtonElement).disabled).toBe(true);
    await click("aiu-erase-yes");
    expect(deletes()).toHaveLength(1);
    await act(async () => { open(); });
    expect(deletes()).toHaveLength(1);
    expect(rows()).toEqual([]);
  });

  it("a failed delete says so inline and keeps every row", async () => {
    h.deleteFails = true;
    await render();
    await click("aiu-erase");
    await click("aiu-erase-yes");
    expect(deletes()).toHaveLength(1);
    expect(text("aiu-erase-msg")).toBe(E.design_aiu_erase_failed);
    expect(rows()).toEqual(["grammar and polish", "feedback on my draft"]);
    expect(text("aiu-count")).toBe("Requests logged for this project: 2. In the dates below: 2.");
    expect(h.toast).not.toHaveBeenCalled();
    // A later success clears the failure line.
    h.deleteFails = false;
    await click("aiu-erase");
    await click("aiu-erase-yes");
    expect(text("aiu-erase-msg")).toBe(E.design_aiu_erased);
    expect(rows()).toEqual([]);
  });

  it("the statement already built stays in its box", async () => {
    await render();
    await click("aiu-build");
    const box = $("aiu-out") as HTMLTextAreaElement;
    const built = box.value;
    expect(built).toContain("I used Appuscholar");
    await click("aiu-erase");
    await click("aiu-erase-yes");
    expect(rows()).toEqual([]);
    expect((($("aiu-out")) as HTMLTextAreaElement).value).toBe(built);
  });

  it("the erase message is always mounted for screen readers (role=status)", async () => {
    await render();
    expect($("aiu-erase-msg")!.getAttribute("role")).toBe("status");
  });

  it("with logging off the empty state after an erase says nothing is being recorded", async () => {
    h.settings = { aiLogOff: true };
    await render();
    await click("aiu-erase");
    await click("aiu-erase-yes");
    expect(text("aiu-count")).toBe(E.design_aiu_off);
  });

  it("the new strings are plain: no em-dash, no emoji, none says the log is on this computer, each has a Hindi line", () => {
    const mine = Object.keys(designEn).filter((k) => k.startsWith("design_aiu_erase"));
    expect(mine.sort()).toEqual(["design_aiu_erase", "design_aiu_erase_desc", "design_aiu_erase_failed", "design_aiu_erase_title", "design_aiu_erase_working", "design_aiu_erase_yes", "design_aiu_erased"].sort());
    for (const k of [...mine, "design_aiu_erased"]) {
      const v = (designEn as Record<string, string>)[k]!;
      expect(v, k).not.toMatch(/—|\p{Extended_Pictographic}/u);
      expect(v, k).not.toMatch(/this (browser|computer|device)/i);
      const hv = (designHi as Record<string, string>)[k];
      expect(hv, k).toBeTruthy();
      expect(hv, k).not.toMatch(/—|\p{Extended_Pictographic}/u);
    }
  });
});
