// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  api: vi.fn(),
  toast: vi.fn(),
  settings: { me: null as unknown, settings: {} as Record<string, unknown> },
  vault: { status: "off" as string, decryptBody: vi.fn(), ensureUnlocked: vi.fn() }
}));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/settings", () => ({ useSettings: () => h.settings }));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => h.vault }));

import { ChromeExtras } from "../components/help/ChromeExtras";
import { ProjectProvider, type ProjectValue } from "../components/frame/ProjectContext";
import { RecapSlot } from "../components/help/slots/RecapSlot";
import { ApiError } from "../lib/api";
import { GAP_KEY, LAST_ACTIVE_KEY, OFF_KEY, ANSWERS_KEY, recapKey } from "../lib/help/recap/gap";
import { resetVisit } from "../lib/help/recap/visit";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 24, 12, 0, 0).getTime();
const ME = { id: "u1", email: "a@e2e.local", locale: "en", settings: { seenWelcome: true }, activeProjectId: null, scratchProjectId: "s1", termsAcceptedAt: "2026-10-20T00:00:00Z", ageConfirmed: true };
const iso = (ms: number) => new Date(ms).toISOString();
const row = (id: string, over: Record<string, unknown> = {}) => ({
  id, projectId: "p1", title: "Draft " + id, titleKeyVersion: 0, deks: [], kind: "draft", currentSeq: 1, wordCount: 100,
  createdAt: iso(NOW - 20 * DAY), updatedAt: iso(NOW - 9 * DAY), ...over
});
const shell = (over: Partial<ProjectValue> = {}): ProjectValue => ({
  dialog: null, projectId: "p1", wordCount: 420,
  project: { id: "p1", title: "Sleep and exams", titleKeyVersion: 0, deks: [], field: "psychology", stage: "writing", status: "active", contentLang: "en", kind: "research" },
  documents: [row("d1")], currentDoc: { ...row("d1"), bodyHtml: "<p>open</p>", keyVersion: 0 },
  ...over
} as unknown as ProjectValue);

const key = (base: string, uid = "u1") => recapKey(base, uid);
const plant = (daysAgo: number, uid = "u1") => localStorage.setItem(key(LAST_ACTIVE_KEY, uid), String(NOW - daysAgo * DAY));
const stored = (uid = "u1") => localStorage.getItem(key(LAST_ACTIVE_KEY, uid));
const dialog = () => document.body.querySelector<HTMLElement>('[data-testid="recap-dialog"]');
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

const roots: Root[] = [];
function mount(c: ProjectValue = shell()) {
  const box = document.createElement("div");
  document.body.appendChild(box);
  const root = createRoot(box);
  roots.push(root);
  const draw = (v: ProjectValue) => act(() => { root.render(<ProjectProvider value={v}><RecapSlot /></ProjectProvider>); });
  draw(c);
  return { draw, unmount: () => act(() => { root.unmount(); }) };
}

function defaultApi() {
  h.api.mockImplementation(async (path: string) => {
    if (path.startsWith("/ai/log")) return [];
    if (path.includes("/blobs/")) throw new ApiError(404, "not-found");
    if (path.startsWith("/documents/")) return { ...row("d1"), bodyHtml: "<p>Sleep and attention in first-years, a short study</p>", keyVersion: 0, deks: [] };
    throw new Error("unexpected " + path);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  resetVisit(NOW);
  h.api.mockReset();
  h.toast.mockReset();
  h.vault.status = "off";
  h.vault.decryptBody.mockReset().mockImplementation(async (d: { bodyHtml: string }) => d.bodyHtml);
  h.vault.ensureUnlocked.mockReset();
  h.settings.me = ME;
  h.settings.settings = { seenWelcome: true };
  defaultApi();
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("RecapSlot: the host (v1 recapCheck 3739-3750, touchActive 3696)", () => {
  it("shows the recap 2.5 s after load when the last visit was eight days ago, with the facts the account can state", async () => {
    plant(8);
    mount();
    await tick(2499);
    expect(dialog()).toBeNull();
    await tick(1);
    expect(dialog()).not.toBeNull();
    const text = dialog()!.textContent ?? "";
    expect(text).toContain("You have been away 8 days.");
    expect(text).toContain("Project: Sleep and exams.");
    expect(text).toContain("Open document: Draft d1, 420 words.");
    expect(text).toContain("Nothing was found to count since your last visit.");
    expect(text).toContain("Sleep and attention in first-years, a short study");
  });

  it("reads the last visit once at load: an activity stamp made before the timer fires does not hide the gap", async () => {
    plant(8);
    mount();
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" })); });
    expect(stored()).toBe(String(NOW));
    await tick(2500);
    expect(dialog()?.textContent).toContain("You have been away 8 days.");
  });

  it("stamps the visit when the check runs, before the gap test, and shows nothing when away less than five days", async () => {
    plant(4);
    mount();
    await tick(2500);
    expect(dialog()).toBeNull();
    expect(stored()).toBe(String(NOW + 2500));
  });

  it("a first visit (no stamp yet) shows nothing and stamps", async () => {
    mount();
    await tick(2500);
    expect(dialog()).toBeNull();
    expect(stored()).toBe(String(NOW + 2500));
  });

  it("uses the account's own gap in days when one is set", async () => {
    plant(8);
    localStorage.setItem(key(GAP_KEY), "10");
    mount();
    await tick(2500);
    expect(dialog()).toBeNull();
  });

  it("stamps on activity at most once a minute", async () => {
    mount();
    await tick(2500);
    const key1 = new KeyboardEvent("keydown", { key: "a" });
    act(() => { window.dispatchEvent(key1); });
    expect(stored()).toBe(String(NOW + 2500));
    await tick(30_000);
    act(() => { window.dispatchEvent(new Event("pointerdown")); });
    expect(stored()).toBe(String(NOW + 2500));
    await tick(31_000);
    act(() => { window.dispatchEvent(new Event("pointerdown")); });
    expect(stored()).toBe(String(NOW + 2500 + 61_000));
  });

  it("does nothing in a pop-out: no stamp, no touch, no recap", async () => {
    window.history.replaceState(null, "", "/p/p1/lit/citations?window=1");
    plant(8);
    mount();
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" })); });
    await tick(5000);
    expect(dialog()).toBeNull();
    expect(stored()).toBe(String(NOW - 8 * DAY));
  });

  it("does nothing when the account switched it off, and does not stamp (v1 returns before stamping)", async () => {
    plant(8);
    localStorage.setItem(key(OFF_KEY), "1");
    mount();
    await tick(2500);
    expect(dialog()).toBeNull();
    expect(stored()).toBe(String(NOW - 8 * DAY));
  });

  it("reads and writes nothing when no one is signed in", async () => {
    h.settings.me = null;
    localStorage.setItem("appu_last_active", String(NOW - 9 * DAY));
    const before = JSON.stringify({ ...localStorage });
    mount();
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" })); });
    await tick(5000);
    expect(dialog()).toBeNull();
    expect(JSON.stringify({ ...localStorage })).toBe(before);
    expect(h.api).not.toHaveBeenCalled();
  });

  it("keeps each account's visit, switch and answers apart on one device", async () => {
    plant(8, "u1");
    h.settings.me = { ...ME, id: "u2" };
    mount();
    await tick(2500);
    expect(dialog()).toBeNull();
    expect(stored("u1")).toBe(String(NOW - 8 * DAY));
    expect(stored("u2")).toBe(String(NOW + 2500));
    expect(localStorage.getItem(LAST_ACTIVE_KEY)).toBeNull();
  });

  it("does nothing outside a project shell: the chrome alone draws nothing and throws nothing", () => {
    const box = document.createElement("div");
    const root = createRoot(box);
    roots.push(root);
    act(() => { root.render(<ChromeExtras />); });
    expect(box.innerHTML).toBe("");
  });

  it("the timer is cleared when the shell goes away first", async () => {
    plant(8);
    const m = mount();
    await tick(1000);
    m.unmount();
    await tick(5000);
    expect(dialog()).toBeNull();
    expect(stored()).toBe(String(NOW - 8 * DAY));
    expect(h.api).not.toHaveBeenCalled();
  });

  it("a recap whose facts were still loading when the shell went away is not shown late, and the next shell offers it again", async () => {
    plant(8);
    let release: (v: unknown[]) => void = () => undefined;
    h.api.mockImplementation(async (path: string) => {
      if (path.startsWith("/ai/log")) return new Promise<unknown[]>((r) => { release = r; });
      throw new ApiError(404, "not-found");
    });
    const first = mount();
    await tick(2500);
    first.unmount();
    release([]);
    await tick(100);
    expect(dialog()).toBeNull();
    defaultApi();
    mount();
    await tick(2500);
    expect(dialog()?.textContent).toContain("You have been away 8 days.");
  });

  it("checks once per page load: moving to another page (a new shell) does not offer it again", async () => {
    plant(8);
    const first = mount();
    await tick(2500);
    expect(dialog()).not.toBeNull();
    first.unmount();
    document.body.innerHTML = "";
    plant(8);
    mount();
    await tick(5000);
    expect(dialog()).toBeNull();
  });

  it("does not start before the project has loaded (first run, the list), and starts when it has", async () => {
    plant(8);
    const m = mount(shell({ projectId: null }));
    await tick(6000);
    expect(dialog()).toBeNull();
    expect(stored()).toBe(String(NOW - 8 * DAY));
    m.draw(shell());
    await tick(2500);
    expect(dialog()?.textContent).toContain("You have been away 8 days.");
  });

  it("waits for the vault to say what it is before it looks at titles and documents", async () => {
    plant(8);
    h.vault.status = "loading";
    const m = mount();
    await tick(6000);
    expect(dialog()).toBeNull();
    h.vault.status = "off";
    m.draw(shell());
    await tick(2500);
    expect(dialog()).not.toBeNull();
  });

  describe("collision guards (v2 has more dialogs than v1's one)", () => {
    const blocked: Array<[string, () => ProjectValue, () => void]> = [
      ["the terms gate is open", () => shell(), () => { h.settings.me = { ...ME, termsAcceptedAt: null }; }],
      ["the terms were accepted before the current terms", () => shell(), () => { h.settings.me = { ...ME, termsAcceptedAt: "2026-10-01T00:00:00Z" }; }],
      ["the welcome tour has not been seen", () => shell(), () => { h.settings.settings = {}; }],
      ["the shell has a dialog open (Help)", () => shell({ dialog: "help" }), () => undefined],
      ["the shell has the welcome tour open", () => shell({ dialog: "welcome" }), () => undefined],
      ["a dialog is open in the page when the timer fires", () => shell(), () => {
        const d = document.createElement("div"); d.setAttribute("role", "dialog"); document.body.appendChild(d);
      }],
      ["an alert dialog is open in the page", () => shell(), () => {
        const d = document.createElement("div"); d.setAttribute("role", "alertdialog"); document.body.appendChild(d);
      }],
      ["a native dialog is open in the page", () => shell(), () => {
        const d = document.createElement("dialog"); d.setAttribute("open", ""); document.body.appendChild(d);
      }]
    ];
    for (const [name, make, setup] of blocked) {
      it(`shows nothing while ${name}`, async () => {
        plant(8);
        setup();
        mount(make());
        await tick(2500);
        expect(document.body.querySelector('[data-testid="recap-dialog"]')).toBeNull();
        expect(h.api).not.toHaveBeenCalled();
      });
    }

    it("a dialog that opens while the facts are loading is not covered by the recap", async () => {
      plant(8);
      let release: (v: unknown[]) => void = () => undefined;
      h.api.mockImplementation(async (path: string) => {
        if (path.startsWith("/ai/log")) return new Promise<unknown[]>((r) => { release = r; });
        throw new ApiError(404, "not-found");
      });
      mount();
      await tick(2500);
      const d = document.createElement("div");
      d.setAttribute("role", "dialog");
      document.body.appendChild(d);
      release([]);
      await tick(100);
      expect(dialog()).toBeNull();
    });
  });

  describe("the vault", () => {
    const sealed = () => shell({
      project: { id: "p1", title: "ct-project", titleKeyVersion: 1, deks: [{ v: 1, wrapped: "w" }], field: "psychology", stage: "writing", status: "active", contentLang: "en", kind: "research" },
      documents: [row("d1", { title: "ct-doc", titleKeyVersion: 1, deks: [{ v: 1, wrapped: "w" }] })],
      currentDoc: { ...row("d1", { title: "ct-doc", titleKeyVersion: 1, deks: [{ v: 1, wrapped: "w" }] }), bodyHtml: "", keyVersion: 1, unreadable: "locked" } as never
    });

    it("locked: the recap still shows what needs no key, fetches no document body and no stats record, never asks for the passphrase, and names no title", async () => {
      plant(8);
      h.vault.status = "locked";
      h.vault.decryptBody.mockRejectedValue(new Error("vault-locked"));
      mount(sealed());
      await tick(2500);
      expect(dialog()).not.toBeNull();
      const text = dialog()!.textContent ?? "";
      expect(text).toContain("You have been away 8 days.");
      expect(text).toContain("Locked title");
      expect(text).not.toContain("ct-project");
      expect(text).not.toContain("ct-doc");
      expect(text).not.toContain("Sleep and attention");
      const paths = h.api.mock.calls.map((c) => String(c[0]));
      expect(paths.filter((p) => p.startsWith("/documents"))).toEqual([]);
      expect(paths.filter((p) => p.includes("/blobs/"))).toEqual([]);
      expect(h.vault.ensureUnlocked).not.toHaveBeenCalled();
      // The test count cannot be read locked, so "nothing was found" is not said.
      expect(text).not.toContain("Nothing was found");
    });

    it("unlocked: titles are opened through the vault and the last document's first words are shown", async () => {
      plant(8);
      h.vault.status = "unlocked";
      h.vault.decryptBody.mockImplementation(async (d: { bodyHtml: string }) => "opened " + d.bodyHtml);
      h.api.mockImplementation(async (path: string) => {
        if (path.startsWith("/ai/log")) return [];
        if (path.includes("/blobs/")) throw new ApiError(404, "not-found");
        if (path.startsWith("/documents/")) return { ...row("d1"), bodyHtml: "<p>words</p>", keyVersion: 0, deks: [] };
        throw new Error("unexpected " + path);
      });
      mount(sealed());
      await tick(2500);
      const text = dialog()!.textContent ?? "";
      expect(text).toContain("Project: opened ct-project");
      expect(text).toContain("Open document: opened ct-doc");
      expect(text).toContain("words");
      expect(h.api.mock.calls.map((c) => String(c[0]))).toContain("/documents/d1");
      expect(h.vault.ensureUnlocked).not.toHaveBeenCalled();
    });
  });

  it("counts what the account holds since the last visit and shows only counts above zero", async () => {
    plant(8);
    const docs = [row("d1"), row("d2", { createdAt: iso(NOW - 4 * DAY) }), row("d3", { createdAt: iso(NOW - 2 * DAY) })];
    h.api.mockImplementation(async (path: string) => {
      if (path.startsWith("/ai/log")) return [{ d: "2026-10-20" }, { d: "2026-10-21" }];
      if (path.includes("/blobs/stats_runs")) return { kind: "stats_runs", body: JSON.stringify({ a: run(NOW - 3 * DAY), b: run(NOW - 20 * DAY) }), keyVersion: 0, deks: [], updatedAt: iso(NOW) };
      if (path.startsWith("/documents/")) return { ...docs[0], bodyHtml: "<p>x</p>", keyVersion: 0, deks: [] };
      throw new Error("unexpected " + path);
    });
    mount(shell({ documents: docs as never }));
    await tick(2500);
    const text = dialog()!.textContent ?? "";
    expect(text).toContain("Since your last visit:");
    expect(text).toContain("2 new document(s)");
    expect(text).toContain("2 AI help request(s) logged");
    expect(text).toContain("1 test result(s) inserted");
    expect(text).not.toMatch(/source\(s\)|passage\(s\)/);
    expect(h.api.mock.calls.map((c) => String(c[0]))).toContain(`/ai/log?from=2026-10-17&projectId=p1`);
  });

  it("Save my answers keeps them under this account's key, says Saved and closes; the next recap shows them", async () => {
    plant(8);
    mount();
    await tick(2500);
    const q1 = document.body.querySelector<HTMLTextAreaElement>('[data-testid="recap-q1"]')!;
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    act(() => { set.call(q1, "Does sleep help?"); q1.dispatchEvent(new Event("input", { bubbles: true })); });
    act(() => { document.body.querySelector<HTMLElement>('[data-testid="recap-save"]')!.click(); });
    await tick(0);
    expect(dialog()).toBeNull();
    expect(h.toast).toHaveBeenCalledWith("Saved");
    const list = JSON.parse(localStorage.getItem(key(ANSWERS_KEY))!) as Array<{ a1: string }>;
    expect(list.map((x) => x.a1)).toEqual(["Does sleep help?"]);
    expect(localStorage.getItem(ANSWERS_KEY)).toBeNull();
  });
});

const run = (ts: number) => ({ test: "t", label: "l", ds: "d", hash: "h", fields: {}, multi: {}, extra: {}, sentence: "s", ts });
