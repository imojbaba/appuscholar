// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import hi from "../messages/hi.json";
import samplesEn from "../messages/tools/samples.en.json";
import samplesHi from "../messages/tools/samples.hi.json";

/*
 * The writing-sample capture block of the Settings dialog (v1 1196-1206, 3966-3973, 4162-4167, Task 12, ruling P2): a checkbox that is off until
 * the student ticks it, the new honest description (v1's says nothing is uploaded), the open project's count, and Clear with an inline question
 * (no browser confirm) that deletes the blob of every project that has one and the scratch space's.
 */

type Entry = { title: string; text: string; words: number; updated: number };
const h = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  update: vi.fn(async () => {}),
  blob: { value: null, loading: false, locked: false, broken: false } as { value: Record<string, Entry> | null; loading: boolean; locked: boolean; broken: boolean },
  opened: [] as Array<[string, string | null, unknown]>,
  vaultStatus: "off" as string,
  api: vi.fn(), toast: vi.fn(), announce: vi.fn(),
  ws: { dialog: "settings", closeDialog: vi.fn(), project: null, projectId: "p1", reloadProject: vi.fn(), openTerms: vi.fn(), settingsProvider: null }
}));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", scratchProjectId: "s1" }, settings: h.settings, update: h.update }) }));
// Like the real hook, what it answers is read when the panel mounts: only a new mount sees a changed blob.
vi.mock("@/lib/blobs/useProjectBlob", async (orig) => {
  const { useState } = await import("react");
  return {
    ...(await orig<typeof import("../lib/blobs/useProjectBlob")>()),
    useProjectBlob: (kind: string, id: string | null, opts: unknown) => {
      h.opened.push([kind, id, opts]);
      const [read] = useState(() => ({ ...h.blob }));
      return { ...read, set: () => {}, flush: async () => true, readOnly: true };
    }
  };
});
vi.mock("@/lib/vault/useVault", async (orig) => ({
  ...(await orig<typeof import("../lib/vault/useVault")>()),
  useVault: () => ({ status: h.vaultStatus, known: async () => h.vaultStatus, ensureUnlocked: async () => true, wrapSecret: async (s: string) => s, unwrapSecret: async (s: string) => s })
}));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/popout/channel", async (orig) => ({ ...(await orig<typeof import("../lib/popout/channel")>()), announceBlob: h.announce }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => h.ws }));

import { ApiError } from "../lib/api";
import { KeysProvider } from "../lib/ai/useKeys";
import { SettingsWritingSamples } from "../components/workspace/dialogs/SettingsWritingSamples";
import { ProviderKey } from "../components/workspace/dialogs/ProviderKey";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = en as Record<string, string>;
const roots: Root[] = [];
const $ = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k]));
async function until(pred: () => boolean) {
  for (let i = 0; i < 400; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); }
  throw new Error("condition not reached");
}
async function mount(node: React.ReactElement = <SettingsWritingSamples />) {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  roots.push(root);
  await act(async () => { root.render(node); });
}
const click = async (el: Element | null) => { await act(async () => { (el as HTMLElement).click(); }); };
const entry = (words: number): Entry => ({ title: "T", text: "x", words, updated: 1 });

type Call = { path: string; method: string };
let calls: Call[];
/** The projects `GET /projects?include=work` lists, by the kinds their blobs have; DELETE answers per project. */
let work: Array<{ id: string; kinds: string[] }>;
let deleteAnswer: Record<string, "ok" | "404" | "fail">;
beforeEach(() => {
  h.settings = {};
  h.blob = { value: null, loading: false, locked: false, broken: false };
  h.opened = [];
  h.vaultStatus = "off";
  h.update.mockClear(); h.toast.mockReset(); h.announce.mockReset();
  calls = [];
  work = [{ id: "p1", kinds: ["citations", "writing_samples"] }, { id: "p2", kinds: ["citations"] }, { id: "p3", kinds: ["writing_samples"] }];
  deleteAnswer = {};
  h.api.mockReset().mockImplementation((path: string, init?: { method?: string }) => {
    const method = init?.method ?? "GET";
    calls.push({ path, method });
    if (path === "/projects?include=work") return Promise.resolve(work.map((p) => ({ id: p.id, blobs: p.kinds.map((kind) => ({ kind, updatedAt: "2026-10-20T00:00:00Z", version: 1 })) })));
    const del = /^\/projects\/([^/]+)\/blobs\/writing_samples$/.exec(path);
    if (del && method === "DELETE") {
      const a = deleteAnswer[del[1]!] ?? "ok";
      if (a === "ok") return Promise.resolve(undefined);
      return Promise.reject(a === "404" ? new ApiError(404, "not-found") : new ApiError(500, "server"));
    }
    if (path === "/me/credentials") return Promise.resolve([]);
    return Promise.reject(new ApiError(404, "not-found"));
  });
});
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; vi.restoreAllMocks(); });
const deletes = () => calls.filter((c) => c.method === "DELETE").map((c) => c.path);

describe("the writing-sample block of Settings", () => {
  it("is off until ticked, with v1's label, the new description and the off status", async () => {
    await mount();
    const box = $("wsamp-toggle") as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(box.closest("label")!.textContent).toBe(E.writingsample_label);
    expect($("wsamp-desc")!.textContent).toBe(samplesEn.wsamp_desc);
    expect($("wsamp-desc")!.textContent).not.toBe(E.writingsample_desc);
    expect($("wsamp-status")!.textContent).toBe(E.writingsample_status_off);
    expect($("wsamp-clear")!.textContent).toBe(E.writingsample_clear_btn);
  });

  it("is on only for true: the status then counts instead of saying off", async () => {
    h.settings = { writingSampleCapture: true };
    await mount();
    expect(($("wsamp-toggle") as HTMLInputElement).checked).toBe(true);
    expect($("wsamp-status")!.textContent).not.toBe(E.writingsample_status_off);
  });

  it("ticking writes writingSampleCapture true and says so; unticking writes false", async () => {
    await mount();
    await click($("wsamp-toggle"));
    expect(h.update).toHaveBeenLastCalledWith({ writingSampleCapture: true });
    expect(h.toast).toHaveBeenLastCalledWith(samplesEn.wsamp_on_toast);
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    document.body.innerHTML = "";
    h.settings = { writingSampleCapture: true };
    await mount();
    await click($("wsamp-toggle"));
    expect(h.update).toHaveBeenLastCalledWith({ writingSampleCapture: false });
    expect(h.toast).toHaveBeenLastCalledWith(samplesEn.wsamp_off_toast);
  });

  it("shows the open project's documents and their words", async () => {
    h.settings = { writingSampleCapture: true };
    h.blob.value = { D1: entry(40), D2: entry(35) };
    await mount();
    expect($("wsamp-status")!.textContent).toBe(fill(E.writingsample_status_fmt!, { n: 2, w: 75 }));
    expect(h.opened.at(-1)).toEqual(["writing_samples", "p1", { readOnly: true }]);
  });

  it("shows none yet for a project without a blob", async () => {
    h.settings = { writingSampleCapture: true };
    await mount();
    expect($("wsamp-status")!.textContent).toBe(fill(E.writingsample_status_fmt!, { n: 0, w: 0 }));
  });

  it("says nothing of the count while the blob is loading, locked or unreadable", async () => {
    h.settings = { writingSampleCapture: true };
    for (const state of [{ loading: true }, { locked: true }, { broken: true }]) {
      h.blob = { value: null, loading: false, locked: false, broken: false, ...state };
      await mount();
      expect($("wsamp-status")!.textContent).toBe("");
      act(() => { for (const r of roots.splice(0)) r.unmount(); });
      document.body.innerHTML = "";
    }
  });

  it("opening Settings with a locked vault reads no blob, so it never asks for the passphrase", async () => {
    h.settings = { writingSampleCapture: true };
    h.vaultStatus = "locked";
    await mount();
    expect(h.opened.at(-1)![1]).toBeNull();
    expect($("wsamp-status")!.textContent).toBe("");
    h.vaultStatus = "unlocked";
    await mount();
    expect(h.opened.at(-1)![1]).toBe("p1");
  });

  it("off reads no blob either", async () => {
    await mount();
    expect(h.opened).toEqual([]);
  });

  describe("Clear", () => {
    it("asks inline, with v1's question and two buttons, and does not use the browser's confirm", async () => {
      const confirm = vi.spyOn(window, "confirm").mockImplementation(() => { throw new Error("no browser confirm"); });
      await mount();
      expect($("wsamp-ask")).toBeNull();
      await click($("wsamp-clear"));
      expect($("wsamp-ask")!.textContent).toContain(E.writingsample_clear_confirm);
      expect($("wsamp-clear-yes")!.textContent).toBe(samplesEn.wsamp_clear_yes);
      expect($("wsamp-clear-no")!.textContent).toBe(E.sap_cancel_btn);
      expect($("wsamp-clear")).toBeNull();
      expect(confirm).not.toHaveBeenCalled();
      expect(calls).toEqual([]);
    });

    it("Cancel does nothing", async () => {
      await mount();
      await click($("wsamp-clear"));
      await click($("wsamp-clear-no"));
      expect($("wsamp-ask")).toBeNull();
      expect($("wsamp-clear")).not.toBeNull();
      expect(calls).toEqual([]);
      expect(h.toast).not.toHaveBeenCalled();
    });

    it("Confirm deletes the blob of each project that has one, and the scratch space's, then says it is cleared", async () => {
      await mount();
      await click($("wsamp-clear"));
      await click($("wsamp-clear-yes"));
      await until(() => h.toast.mock.calls.length > 0);
      expect(calls[0]).toEqual({ path: "/projects?include=work", method: "GET" });
      expect(deletes().sort()).toEqual(["/projects/p1/blobs/writing_samples", "/projects/p3/blobs/writing_samples", "/projects/s1/blobs/writing_samples"]);
      expect(h.toast).toHaveBeenCalledWith(E.writingsample_cleared);
      // The question is closed, the button is back, and the other windows are told.
      expect($("wsamp-ask")).toBeNull();
      expect($("wsamp-clear")).not.toBeNull();
      expect(h.announce.mock.calls.map((c) => c[0]).sort()).toEqual(["blob:p1:writing_samples", "blob:p3:writing_samples", "blob:s1:writing_samples"]);
    });

    it("a project that has no blob answering 404 is as good as cleared", async () => {
      deleteAnswer = { s1: "404", p3: "404" };
      await mount();
      await click($("wsamp-clear"));
      await click($("wsamp-clear-yes"));
      await until(() => h.toast.mock.calls.length > 0);
      expect(h.toast).toHaveBeenCalledWith(E.writingsample_cleared);
      expect(h.toast).not.toHaveBeenCalledWith(samplesEn.wsamp_clear_fail);
    });

    it("the scratch space is cleared once even when the list names it", async () => {
      work.push({ id: "s1", kinds: ["writing_samples"] });
      await mount();
      await click($("wsamp-clear"));
      await click($("wsamp-clear-yes"));
      await until(() => h.toast.mock.calls.length > 0);
      expect(deletes().filter((p) => p.startsWith("/projects/s1/"))).toHaveLength(1);
    });

    it("a failed delete says so and is not reported as cleared", async () => {
      deleteAnswer = { p3: "fail" };
      await mount();
      await click($("wsamp-clear"));
      await click($("wsamp-clear-yes"));
      await until(() => h.toast.mock.calls.length > 0);
      expect(h.toast).toHaveBeenCalledWith(samplesEn.wsamp_clear_fail);
      expect(h.toast).not.toHaveBeenCalledWith(E.writingsample_cleared);
      // The others went all the same; only the one that was cleared is announced.
      expect(h.announce.mock.calls.map((c) => c[0]).sort()).toEqual(["blob:p1:writing_samples", "blob:s1:writing_samples"]);
    });

    it("a list that cannot be read says so and deletes nothing", async () => {
      h.api.mockImplementation((path: string) => (path === "/projects?include=work" ? Promise.reject(new ApiError(500, "server")) : Promise.resolve(undefined)));
      await mount();
      await click($("wsamp-clear"));
      await click($("wsamp-clear-yes"));
      await until(() => h.toast.mock.calls.length > 0);
      expect(h.toast).toHaveBeenCalledWith(samplesEn.wsamp_clear_fail);
      expect(h.api.mock.calls.filter(([, i]) => (i as { method?: string } | undefined)?.method === "DELETE")).toEqual([]);
    });

    it("reads the open project's blob again afterwards, so the count is not the old one", async () => {
      h.settings = { writingSampleCapture: true };
      h.blob.value = { D1: entry(40) };
      await mount();
      const before = h.opened.length;
      h.blob.value = null;
      await click($("wsamp-clear"));
      await click($("wsamp-clear-yes"));
      await until(() => h.toast.mock.calls.length > 0);
      expect(h.opened.length).toBeGreaterThan(before);
      expect($("wsamp-status")!.textContent).toBe(fill(E.writingsample_status_fmt!, { n: 0, w: 0 }));
    });
  });

  it("is mounted in the Settings dialog, after the ORCID field and before the AI fallback", async () => {
    await mount(<KeysProvider><ProviderKey /></KeysProvider>);
    await until(() => !!$("wsamp-toggle"));
    const orcid = $("orcid-input")!, block = $("wsamp")!, fallback = $("ai-fallback")!;
    expect(orcid.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(block.compareDocumentPosition(fallback) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("the copy", () => {
  const keys = Object.keys(samplesEn) as Array<keyof typeof samplesEn>;
  it("the new description is honest: it says the copy is on the server, and does not say it stays on this computer or that nothing is uploaded", () => {
    const d = samplesEn.wsamp_desc;
    expect(d).toMatch(/server/);
    expect(d).toMatch(/not on this computer/);
    expect(d).not.toMatch(/nothing is uploaded|nothing leaves|never leaves/i);
    expect(d).not.toMatch(/nothing is shared/i);
    expect(d).toMatch(/30/);
  });
  it("has a Hindi draft for every key, and no key English lacks", () => {
    const h2 = samplesHi as Record<string, string>;
    for (const k of keys) expect(h2[k], k).toBeTruthy();
    expect(Object.keys(h2).filter((k) => !k.startsWith("$") && !(k in samplesEn))).toEqual([]);
  });
  it("does not redefine a v1 key", () => {
    for (const k of keys) { expect(k.startsWith("wsamp_")).toBe(true); expect(k in en).toBe(false); expect(k in hi).toBe(false); }
  });
  it("uses plain words: no emoji, no em-dash, no en-dash", () => {
    for (const v of [...Object.values(samplesEn), ...Object.values(samplesHi)]) expect(v).not.toMatch(/[–—]|\p{Extended_Pictographic}/u);
  });
});
