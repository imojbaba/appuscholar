// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AiuEntry } from "@appuscholar/core";
import en from "../messages/en.json";
import designEn from "../messages/tools/design.en.json";
import designHi from "../messages/tools/design.hi.json";

/*
 * Task C10, "Erase the log" on the AI-use tab (v1 aiuClear 5995-5999, the button at 1988). The log is erased for the whole account (DELETE /ai/log:
 * every study's rows and the rows of AI used with no study open), so the confirm says "all your studies" and "no study open"; the statement
 * already built stays in its box; a failure is said inline and changes nothing. v1 asked nothing of an empty log and said so: here this project's rows
 * being empty is not the account's log being empty, so the whole log (GET /ai/log with no projectId) is read first. The api is a fake: GET with a
 * projectId answers this project's rows, GET without one the whole account's, DELETE empties both and records its call.
 */

const h = vi.hoisted(() => ({
  /** This project's rows (GET /ai/log?projectId=) and the whole account's (GET /ai/log). */
  log: [] as unknown[],
  account: [] as unknown[],
  calls: [] as Array<{ path: string; method: string }>,
  deleteFails: false,
  deleteGate: null as Promise<void> | null,
  accountFails: false,
  accountGate: null as Promise<void> | null,
  projectFails: false,
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
      h.account = [];
      return undefined;
    }
    if (path === "/ai/log") {
      if (h.accountGate) await h.accountGate;
      if (h.accountFails) throw new Error("503");
      return h.account;
    }
    if (h.projectFails) throw new Error("503");
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
/** The reads of the whole account's log: GET /ai/log with no projectId. */
const wholeReads = () => h.calls.filter((c) => c.method === "GET" && c.path === "/ai/log");
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
  h.log = LOG; h.account = LOG; h.calls.length = 0; h.deleteFails = false; h.deleteGate = null; h.accountFails = false; h.accountGate = null; h.projectFails = false;
  h.settings = {}; h.toast.mockClear();
});
afterEach(async () => {
  for (const r of roots.splice(0)) await act(async () => { r.unmount(); });
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

const escape = async () => { await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); }); };

describe("Erase the log (Task C10)", () => {
  it("the button opens a confirm that names all your projects and no project open, and says it cannot be undone; nothing is sent yet", async () => {
    await render();
    expect($("aiu-erase-confirm")).toBeNull();
    await click("aiu-erase");
    const box = $("aiu-erase-confirm")!;
    expect(box).not.toBeNull();
    expect(box.textContent).toContain("all your studies");
    expect(box.textContent).toContain("no study open");
    expect(box.textContent).toMatch(/cannot be undone/i);
    expect(box.textContent).toContain("stays in its box");
    expect(deletes()).toHaveLength(0);
    // This project has rows, so there is something to erase and the whole log need not be read first.
    expect(wholeReads()).toHaveLength(0);
  });

  it("Cancel closes the confirm and sends nothing; the rows are still there", async () => {
    await render();
    await click("aiu-erase");
    await click("aiu-erase-cancel");
    expect($("aiu-erase-confirm")).toBeNull();
    expect(deletes()).toHaveLength(0);
    expect(rows()).toEqual(["grammar and polish", "feedback on my draft"]);
    expect(text("aiu-erase-msg")).toBe("");
  });

  it("Confirm sends DELETE /ai/log once, and the tab shows the empty-log state and says the log is erased", async () => {
    await render();
    await click("aiu-erase");
    await click("aiu-erase-yes");
    expect(deletes()).toEqual([{ path: "/ai/log", method: "DELETE" }]);
    expect($("aiu-erase-confirm")).toBeNull();
    expect(rows()).toEqual([]);
    expect(text("aiu-count")).toBe(E.design_aiu_empty);
    expect(text("aiu-erase-msg")).toBe(E.wc_aiu_erased);
    expect(h.toast).not.toHaveBeenCalled();
    expect(h.calls.filter((c) => c.method === "GET")).toHaveLength(1);
  });

  it("while the erase is out the button says Erasing, every button is off, Escape cannot close the confirm and a second click sends no second delete", async () => {
    let open!: () => void;
    h.deleteGate = new Promise<void>((r) => { open = r; });
    await render();
    // Escape closes the confirm when nothing is out, so the check below is not vacuous.
    await click("aiu-erase");
    await escape();
    expect($("aiu-erase-confirm")).toBeNull();
    await click("aiu-erase");
    await click("aiu-erase-yes");
    expect($("aiu-erase-yes")!.textContent).toBe(E.wc_aiu_erase_working);
    expect(($("aiu-erase-yes") as HTMLButtonElement).disabled).toBe(true);
    expect(($("aiu-erase-cancel") as HTMLButtonElement).disabled).toBe(true);
    expect(($("aiu-erase") as HTMLButtonElement).disabled).toBe(true);
    await escape();
    expect($("aiu-erase-confirm")).not.toBeNull();
    await click("aiu-erase-yes");
    expect(deletes()).toHaveLength(1);
    await act(async () => { open(); });
    expect(deletes()).toHaveLength(1);
    expect($("aiu-erase-confirm")).toBeNull();
    expect(rows()).toEqual([]);
    expect(($("aiu-erase") as HTMLButtonElement).disabled).toBe(false);
  });

  it("a failed delete says so inline, asks to try again, and keeps every row", async () => {
    h.deleteFails = true;
    await render();
    await click("aiu-erase");
    await click("aiu-erase-yes");
    expect(deletes()).toHaveLength(1);
    expect(text("aiu-erase-msg")).toBe(E.wc_aiu_erase_failed);
    expect($("aiu-erase-confirm")).toBeNull();
    expect(rows()).toEqual(["grammar and polish", "feedback on my draft"]);
    expect(text("aiu-count")).toBe(E.design_aiu_count!.replace("{all}", "2").replace("{n}", "2"));
    expect(h.toast).not.toHaveBeenCalled();
    // A later success clears the failure line.
    h.deleteFails = false;
    await click("aiu-erase");
    expect(text("aiu-erase-msg")).toBe("");
    await click("aiu-erase-yes");
    expect(text("aiu-erase-msg")).toBe(E.wc_aiu_erased);
    expect(rows()).toEqual([]);
  });

  it("the statement already built stays in its box, and so do the ticks", async () => {
    await render();
    await click("aiu-build");
    const box = $("aiu-out") as HTMLTextAreaElement;
    const built = box.value;
    expect(built).toContain("I used Appuscholar");
    await act(async () => { $("aiu-reword")!.click(); });
    await click("aiu-erase");
    await click("aiu-erase-yes");
    expect(rows()).toEqual([]);
    expect((($("aiu-out")) as HTMLTextAreaElement).value).toBe(built);
    expect(($("aiu-reword") as HTMLInputElement).checked).toBe(true);
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

  it("a tab opened again after an erase reads the empty log from the api", async () => {
    await render();
    await click("aiu-erase");
    await click("aiu-erase-yes");
    for (const r of roots.splice(0)) await act(async () => { r.unmount(); });
    document.body.innerHTML = "";
    h.calls.length = 0;
    await render();
    expect(h.calls).toEqual([{ path: "/ai/log?projectId=p1", method: "GET" }]);
    expect(rows()).toEqual([]);
    expect(text("aiu-count")).toBe(E.design_aiu_empty);
    expect(text("aiu-erase-msg")).toBe("");
  });

  it("the button is there when the log is empty, and when logging is off", async () => {
    h.log = []; h.account = [];
    await render();
    expect(text("aiu-count")).toBe(E.design_aiu_empty);
    expect(($("aiu-erase") as HTMLButtonElement).disabled).toBe(false);
    expect($("aiu-erase")!.textContent).toBe(E.wc_aiu_erase);
    for (const r of roots.splice(0)) await act(async () => { r.unmount(); });
    document.body.innerHTML = "";
    h.settings = { aiLogOff: true };
    await render();
    expect(text("aiu-count")).toBe(E.design_aiu_off);
    expect(($("aiu-erase") as HTMLButtonElement).disabled).toBe(false);
  });

  it("the button is off while the log is still being read", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    roots.push(root);
    // Rendered without awaiting the read: the first paint is the loading state.
    act(() => { root.render(<AiUse projectId="p1" />); });
    expect(($("aiu-erase") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { /* let the read finish */ });
    expect(($("aiu-erase") as HTMLButtonElement).disabled).toBe(false);
  });

  describe("an empty log (v1 aiuClear: The log is already empty, no confirm)", () => {
    it("when this project and the whole account are empty, the press reads the whole log, says so inline, and opens no confirm and sends no delete", async () => {
      h.log = []; h.account = [];
      await render();
      await click("aiu-erase");
      expect(wholeReads()).toEqual([{ path: "/ai/log", method: "GET" }]);
      expect($("aiu-erase-confirm")).toBeNull();
      expect(text("aiu-erase-msg")).toBe(E.wc_aiu_erase_empty);
      expect(deletes()).toHaveLength(0);
      expect(h.toast).not.toHaveBeenCalled();
    });

    it("when only this project is empty but the account has rows, the confirm opens, and the earlier line is cleared", async () => {
      h.log = []; h.account = [];
      await render();
      await click("aiu-erase");
      expect(text("aiu-erase-msg")).toBe(E.wc_aiu_erase_empty);
      // Another tab used AI for another project in the meantime.
      h.account = LOG;
      await click("aiu-erase");
      expect(wholeReads()).toHaveLength(2);
      expect(text("aiu-erase-msg")).toBe("");
      expect($("aiu-erase-confirm")).not.toBeNull();
      await click("aiu-erase-yes");
      expect(deletes()).toHaveLength(1);
      expect(text("aiu-erase-msg")).toBe(E.wc_aiu_erased);
      expect(text("aiu-count")).toBe(E.design_aiu_empty);
    });

    it("when the whole log cannot be read, the confirm opens, so erasing is still possible", async () => {
      h.log = []; h.accountFails = true;
      await render();
      await click("aiu-erase");
      expect($("aiu-erase-confirm")).not.toBeNull();
      expect(text("aiu-erase-msg")).toBe("");
      expect(deletes()).toHaveLength(0);
    });

    it("the button is off while the whole log is being read, so a second press sends one read", async () => {
      let open!: () => void;
      h.accountGate = new Promise<void>((r) => { open = r; });
      h.log = []; h.account = [];
      await render();
      await click("aiu-erase");
      expect(($("aiu-erase") as HTMLButtonElement).disabled).toBe(true);
      await click("aiu-erase");
      expect(wholeReads()).toHaveLength(1);
      await act(async () => { open(); });
      expect(($("aiu-erase") as HTMLButtonElement).disabled).toBe(false);
      expect(text("aiu-erase-msg")).toBe(E.wc_aiu_erase_empty);
    });

    it("when this project's log cannot be read, the press opens the confirm without a second read", async () => {
      h.projectFails = true;
      await render();
      expect(text("aiu-log-msg")).toBe(E.design_aiu_read_failed);
      await click("aiu-erase");
      expect($("aiu-erase-confirm")).not.toBeNull();
      expect(wholeReads()).toHaveLength(0);
    });
  });

  it("the new strings are plain and true, each has a Hindi line, and the copy names every kind of row the erase removes", () => {
    const mine = Object.keys(designEn).filter((k) => k.startsWith("wc_aiu_"));
    expect(mine.sort()).toEqual(["wc_aiu_erase", "wc_aiu_erase_desc", "wc_aiu_erase_empty", "wc_aiu_erase_failed", "wc_aiu_erase_title", "wc_aiu_erase_working", "wc_aiu_erase_yes", "wc_aiu_erased"].sort());
    expect(Object.keys(designEn).filter((k) => /^design_aiu_erase/.test(k))).toEqual([]);
    for (const k of mine) {
      const v = (designEn as Record<string, string>)[k]!;
      expect(v, k).not.toMatch(/—|\p{Extended_Pictographic}/u);
      expect(v, k).not.toMatch(/this (browser|computer|device)/i);
      const hv = (designHi as Record<string, string>)[k];
      expect(hv, k).toBeTruthy();
      expect(hv, k).not.toMatch(/—|\p{Extended_Pictographic}/u);
    }
    for (const k of ["wc_aiu_erase_desc", "wc_aiu_erased"]) expect(E[k], k).toMatch(/all your studies.*no study open/);
    expect(E.wc_aiu_erase_title).toContain("whole AI-use log in your account");
    // The failure line cannot promise that nothing changed (the answer may have been lost on the way); it asks to try again.
    expect(E.wc_aiu_erase_failed).toContain("Please try again.");
    expect(E.wc_aiu_erase_failed).not.toMatch(/nothing was changed/i);
    expect(E.wc_aiu_erase_empty).toBe("The log is already empty.");
  });
});
