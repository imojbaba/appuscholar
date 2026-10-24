// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { editorExtensions } from "../lib/editorExtensions";

/*
 * Writing-sample capture (v1 3925-3973, Task 12, ruling P2): opt-in, the typed words of each document into the project's `writing_samples` blob,
 * at most once a minute per document, flushed when the document is left; and the entry removed when the document is marked as a source (v1 3172)
 * or deleted. The blob hook is the stand-in of styleLayer.test.tsx (its `set` is a spy); the editor is a real one.
 */

type Entry = { title: string; text: string; words: number; updated: number };
type Samples = Record<string, Entry>;
type B = { value: Samples | null; loading: boolean; locked: boolean; broken: boolean };
const h = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  blob: { value: null, loading: false, locked: false, broken: false } as unknown as B,
  set: vi.fn(),
  opened: [] as Array<[string, string | null]>,
  api: vi.fn(),
  toast: vi.fn(),
  ws: null as unknown
}));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ settings: h.settings, me: { id: "u1", scratchProjectId: "s1" }, update: vi.fn() }) }));
vi.mock("@/lib/blobs/useProjectBlob", async (orig) => ({
  ...(await orig<typeof import("../lib/blobs/useProjectBlob")>()),
  useProjectBlob: (kind: string, id: string | null) => {
    h.opened.push([kind, id]);
    return { ...h.blob, set: h.set, flush: async () => true, readOnly: false };
  }
}));
// The title is plain here (titles.test pins sealed ones).
vi.mock("@/lib/vault/titles", async (orig) => ({ ...(await orig<typeof import("../lib/vault/titles")>()), useTitle: (t: { title: string } | null) => ({ state: "open", text: t?.title ?? "" }) }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/components/frame/ProjectContext", async (orig) => ({ ...(await orig<typeof import("../components/frame/ProjectContext")>()), useProject: () => h.ws }));

import { ApiError } from "../lib/api";
import { UNTITLED } from "../lib/vault/titles";
import { VaultProvider } from "../lib/vault/useVault";
import { forgetSample, resumeSample, WritingSampleCapture } from "../lib/writingSamples/useWritingSampleCapture";
import { SAMPLE_THROTTLE_MS, SAMPLES_MAX_CHARS, sampleOf, sampleStats, withSample, withoutSample } from "../lib/writingSamples/captureSample";
import { DocBar } from "../components/document/DocBar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
const editors: Editor[] = [];

const words = (n: number, p = "w") => Array.from({ length: n }, (_, i) => p + i).join(" ");
const para = (n: number, p = "w") => `<p>${words(n, p)}</p>`;
const doc = (id: string, over: Record<string, unknown> = {}) => ({ id, projectId: "p1", title: "Doc " + id, titleKeyVersion: 0, deks: [], kind: "draft", currentSeq: 1, wordCount: 2, createdAt: "2026-10-21T00:00:00Z", updatedAt: "2026-10-21T00:00:00Z", bodyHtml: "<p>x</p>", keyVersion: 0, ...over });
type Doc = ReturnType<typeof doc>;

function newEditor(html = "<p></p>"): Editor {
  const e = new Editor({ extensions: editorExtensions, content: html });
  editors.push(e);
  return e;
}
const type = (e: Editor, html: string) => act(() => { e.commands.setContent(html, { emitUpdate: true }); });
const tick = (ms: number) => act(async () => { vi.advanceTimersByTime(ms); });
function mount(el: React.ReactElement): Root {
  const host = document.body.appendChild(document.createElement("div"));
  const r = createRoot(host);
  roots.push(r);
  act(() => { r.render(el); });
  return r;
}
const capture = (editor: Editor | null, d: Doc | null) => <WritingSampleCapture editor={editor} doc={d as never} />;
/** The entry a set() call writes: its update applied to `prev`. */
const written = (n = 0, prev: Samples | null = null): Samples => (h.set.mock.calls[n]![0] as (p: Samples | null) => Samples)(prev);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-24T09:00:00Z"));
  h.settings = { writingSampleCapture: true };
  h.blob = { value: null, loading: false, locked: false, broken: false };
  h.set.mockReset();
  h.opened = [];
  window.history.replaceState({}, "", "/");
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  for (const e of editors.splice(0)) e.destroy();
  document.body.innerHTML = "";
  vi.useRealTimers();
  window.history.replaceState({}, "", "/");
});

describe("the pure part", () => {
  it("sampleOf keeps the typed words of 30 or more, with the title and the time", () => {
    expect(sampleOf(para(29), "T", 5)).toBeNull();
    expect(sampleOf(para(30), "T", 5)).toEqual({ title: "T", text: words(30), words: 30, updated: 5 });
    expect(sampleOf(`<p>${words(20)} <span class="ai-ins">${words(20, "ai")}</span></p>`, "T", 5)).toBeNull();
  });
  it("withSample sets one entry and keeps the others; withoutSample drops one", () => {
    const e = (t: string): Entry => ({ title: t, text: t, words: 1, updated: 1 });
    expect(withSample(null, "a", e("A"))).toEqual({ a: e("A") });
    expect(withSample({ b: e("B") }, "a", e("A"))).toEqual({ b: e("B"), a: e("A") });
    expect(withSample({ a: e("old") }, "a", e("new"))).toEqual({ a: e("new") });
    expect(withoutSample({ a: e("A"), b: e("B") }, "a")).toEqual({ b: e("B") });
    expect(withoutSample(null, "a")).toEqual({});
  });
  it("sampleStats counts the documents and sums their words (v1 writingSampleStats)", () => {
    expect(sampleStats(null)).toEqual({ count: 0, words: 0 });
    expect(sampleStats({ a: { title: "A", text: "", words: 40, updated: 1 }, b: { title: "B", text: "", words: 35, updated: 1 } })).toEqual({ count: 2, words: 75 });
  });
});

describe("the capture hook", () => {
  it("reads and writes the open document's project, under the kind writing_samples", () => {
    mount(capture(newEditor(), doc("D1")));
    expect(h.opened.at(-1)).toEqual(["writing_samples", "p1"]);
  });

  it("off reads no blob at all", () => {
    h.settings = {};
    mount(capture(newEditor(), doc("D1")));
    expect(h.opened.at(-1)).toEqual(["writing_samples", null]);
  });

  it("writes the typed words of an open document: title, text, words, time, as an update of the stored value", async () => {
    const e = newEditor();
    mount(capture(e, doc("D1")));
    type(e, para(40));
    await tick(1);
    expect(h.set).toHaveBeenCalledTimes(1);
    const other: Entry = { title: "Other", text: "kept", words: 31, updated: 1 };
    // The update form puts the entry on top of whatever is stored, so another document's entry (or one from another window) is not clobbered.
    const at = new Date("2026-10-24T09:00:00Z").getTime();
    expect(written(0, { D2: other })).toEqual({ D2: other, D1: { title: "Doc D1", text: words(40), words: 40, updated: at } });
    expect(written(0, null)).toEqual({ D1: { title: "Doc D1", text: words(40), words: 40, updated: at } });
  });

  it("an empty title is stored under the shared untitled name, never a literal of its own", async () => {
    const e = newEditor();
    mount(capture(e, doc("D1", { title: "" })));
    type(e, para(40));
    await tick(1);
    expect(written().D1!.title).toBe(UNTITLED);
  });

  it("off writes nothing: absent, false", async () => {
    for (const settings of [{}, { writingSampleCapture: false }, { writingSampleCapture: undefined }]) {
      h.settings = settings;
      const e = newEditor();
      const r = mount(capture(e, doc("D1")));
      type(e, para(60));
      await tick(SAMPLE_THROTTLE_MS * 2);
      act(() => r.unmount());
      expect(h.set).not.toHaveBeenCalled();
    }
  });

  it("turning it off while a change waits writes nothing, not even when the document is left", async () => {
    const e = newEditor();
    const r = mount(capture(e, doc("D1")));
    type(e, para(40));
    await tick(1);
    type(e, para(41));
    h.settings = { writingSampleCapture: false };
    act(() => { r.render(capture(e, doc("D1"))); });
    await tick(SAMPLE_THROTTLE_MS * 2);
    act(() => r.unmount());
    expect(h.set).toHaveBeenCalledTimes(1);
  });

  it("skips a document marked as a source", async () => {
    const e = newEditor();
    mount(capture(e, doc("D1", { kind: "source" })));
    type(e, para(60));
    await tick(SAMPLE_THROTTLE_MS * 2);
    expect(h.set).not.toHaveBeenCalled();
  });

  it("a document marked as a source while it is open is no longer captured, nor flushed when it is left", async () => {
    const e = newEditor();
    const r = mount(capture(e, doc("D1")));
    type(e, para(40));
    await tick(1);
    type(e, para(45));
    act(() => { r.render(capture(e, doc("D1", { kind: "source" }))); });
    await tick(SAMPLE_THROTTLE_MS * 2);
    act(() => r.unmount());
    expect(h.set).toHaveBeenCalledTimes(1);
  });

  it("skips fewer than 30 typed words, and writes at 30", async () => {
    const e = newEditor();
    mount(capture(e, doc("D1")));
    type(e, para(29));
    await tick(1);
    expect(h.set).not.toHaveBeenCalled();
    type(e, para(30));
    await tick(SAMPLE_THROTTLE_MS);
    expect(h.set).toHaveBeenCalledTimes(1);
    expect(written().D1!.words).toBe(30);
  });

  it("counts the typed words only: 20 typed and 20 from an AI suggestion is too few", async () => {
    const e = newEditor();
    mount(capture(e, doc("D1")));
    type(e, `<p>${words(20)} <span class="ai-ins" data-h="x">${words(20, "ai")}</span></p>`);
    await tick(SAMPLE_THROTTLE_MS);
    expect(h.set).not.toHaveBeenCalled();
  });

  it("the AI text is absent from the written text", async () => {
    const e = newEditor();
    mount(capture(e, doc("D1")));
    type(e, `<p>${words(35)} <span class="ai-ins" data-h="x">robot one robot two</span> and mine again</p><p>second block</p>`);
    await tick(1);
    const entry = written().D1!;
    expect(entry.text).not.toContain("robot");
    expect(entry.text).toBe(words(35) + " and mine again second block");
    expect(entry.words).toBe(35 + 5);
  });

  it("a second write inside 60 s is skipped, and goes out when the minute is over", async () => {
    const e = newEditor();
    mount(capture(e, doc("D1")));
    type(e, para(40));
    await tick(1);
    expect(h.set).toHaveBeenCalledTimes(1);
    await tick(10_000);
    type(e, para(41));
    await tick(1);
    await tick(48_000);
    expect(h.set).toHaveBeenCalledTimes(1);
    await tick(2_000);
    expect(h.set).toHaveBeenCalledTimes(2);
    expect(written(1).D1!.words).toBe(41);
    // Several changes in the minute are one write, of the newest text.
    type(e, para(42));
    type(e, para(43));
    await tick(SAMPLE_THROTTLE_MS);
    expect(h.set).toHaveBeenCalledTimes(3);
    expect(written(2).D1!.words).toBe(43);
  });

  it("writes nothing when the text did not change since what is stored", async () => {
    const e = newEditor();
    h.blob.value = { D1: { title: "Doc D1", text: words(40), words: 40, updated: 1 } };
    mount(capture(e, doc("D1")));
    type(e, para(40));
    await tick(SAMPLE_THROTTLE_MS);
    expect(h.set).not.toHaveBeenCalled();
  });

  it("leaving the document flushes the change that was waiting, for the document it was typed in", async () => {
    const e = newEditor();
    const r = mount(capture(e, doc("D1")));
    type(e, para(40));
    await tick(1);
    await tick(5_000);
    type(e, para(45));
    await tick(1);
    expect(h.set).toHaveBeenCalledTimes(1);
    // The next document's editor takes its place; the old one goes away with its change still waiting.
    act(() => r.unmount());
    expect(h.set).toHaveBeenCalledTimes(2);
    expect(Object.keys(written(1))).toEqual(["D1"]);
    expect(written(1).D1!.words).toBe(45);
  });

  it("a change of document in the same card flushes the old document's change first", async () => {
    const e = newEditor();
    const r = mount(capture(e, doc("D1")));
    type(e, para(40));
    await tick(1);
    type(e, para(46));
    act(() => { r.render(capture(e, doc("D2"))); });
    expect(h.set).toHaveBeenCalledTimes(2);
    expect(Object.keys(written(1))).toEqual(["D1"]);
    expect(written(1).D1!.words).toBe(46);
  });

  it("unmounting with nothing waiting writes nothing more", async () => {
    const e = newEditor();
    const r = mount(capture(e, doc("D1")));
    type(e, para(40));
    await tick(1);
    act(() => r.unmount());
    expect(h.set).toHaveBeenCalledTimes(1);
  });

  it("does nothing in a pop-out", async () => {
    window.history.replaceState({}, "", "/p/p1/writing?window=1");
    const e = newEditor();
    const r = mount(capture(e, doc("D1")));
    type(e, para(60));
    await tick(SAMPLE_THROTTLE_MS * 2);
    act(() => r.unmount());
    expect(h.set).not.toHaveBeenCalled();
  });

  it.each([["still loading", { loading: true }], ["locked", { locked: true }], ["unreadable", { broken: true }]])("writes nothing while the blob is %s", async (_n, state) => {
    h.blob = { ...h.blob, ...state } as B;
    const e = newEditor();
    const r = mount(capture(e, doc("D1")));
    type(e, para(40));
    await tick(SAMPLE_THROTTLE_MS * 5);
    act(() => r.unmount());
    expect(h.set).not.toHaveBeenCalled();
  });

  it("a text typed while the blob was loading is written once it has opened, without another keystroke", async () => {
    h.blob = { ...h.blob, loading: true };
    const e = newEditor();
    const r = mount(capture(e, doc("D1")));
    type(e, para(40));
    await tick(1);
    expect(h.set).not.toHaveBeenCalled();
    h.blob = { ...h.blob, loading: false };
    act(() => { r.render(capture(e, doc("D1"))); });
    await tick(SAMPLE_THROTTLE_MS);
    expect(h.set).toHaveBeenCalledTimes(1);
    expect(written().D1!.words).toBe(40);
  });

  it("an unreadable blob is never set over, not even when the document is left", async () => {
    h.blob = { ...h.blob, broken: true };
    const e = newEditor();
    const r = mount(capture(e, doc("D1")));
    type(e, para(40));
    await tick(1);
    act(() => r.unmount());
    expect(h.set).not.toHaveBeenCalled();
  });

  describe("a document the student took out of the samples", () => {
    const vaultOff = { known: async () => "off" as const, ensureUnlocked: async () => true, encryptBody: async () => { throw new Error("unused"); }, decryptBody: async (d: { bodyHtml: string }) => d.bodyHtml };
    beforeEach(() => { h.api.mockReset().mockRejectedValue(new ApiError(404, "not-found")); });
    afterEach(() => { resumeSample("D1"); });

    it("is not written by the change that was waiting when the editor goes away", async () => {
      const e = newEditor();
      const r = mount(capture(e, doc("D1")));
      type(e, para(40));
      await tick(1);
      type(e, para(46));
      await act(async () => { await forgetSample("p1", "D1", () => vaultOff); });
      act(() => r.unmount());
      expect(h.set).toHaveBeenCalledTimes(1);
    });

    it("an entry already set for it is not put back when the save is replayed", async () => {
      const e = newEditor();
      mount(capture(e, doc("D1")));
      type(e, para(40));
      await tick(1);
      await act(async () => { await forgetSample("p1", "D1", () => vaultOff); });
      const other: Entry = { title: "Other", text: "kept", words: 31, updated: 1 };
      expect(written(0, { D2: other })).toEqual({ D2: other });
    });

    it("is captured again once it is the student's own again, or the deletion is undone", async () => {
      const e = newEditor();
      mount(capture(e, doc("D1")));
      await act(async () => { await forgetSample("p1", "D1", () => vaultOff); });
      type(e, para(40));
      await tick(SAMPLE_THROTTLE_MS);
      expect(h.set).not.toHaveBeenCalled();
      resumeSample("D1");
      type(e, para(41));
      await tick(SAMPLE_THROTTLE_MS);
      expect(h.set).toHaveBeenCalledTimes(1);
    });
  });

  it("adds nothing once the blob is as large as the api takes", async () => {
    h.blob.value = { big: { title: "B", text: "x".repeat(SAMPLES_MAX_CHARS), words: 9, updated: 1 } };
    const e = newEditor();
    mount(capture(e, doc("D1")));
    type(e, para(40));
    await tick(SAMPLE_THROTTLE_MS);
    expect(h.set).not.toHaveBeenCalled();
  });
});

describe("a document leaving the samples", () => {
  const stored = { D1: { title: "One", text: words(40), words: 40, updated: 1 }, D2: { title: "Two", text: words(35), words: 35, updated: 2 } };
  type Call = { path: string; method: string; body?: { body: string }; ifMatch?: string };
  let calls: Call[];
  let server: { blob: { body: string; version: number } | null };

  beforeEach(() => {
    vi.useRealTimers();
    calls = [];
    server = { blob: { body: JSON.stringify(stored), version: 3 } };
    const d1 = doc("D1", { projectId: "p1" }), d2 = doc("D2", { projectId: "p1" });
    h.ws = {
      project: { id: "p1" }, documents: [d1, d2], currentDoc: d1, selectDoc: vi.fn(), reloadDocs: vi.fn(async () => undefined), startImport: vi.fn(), restoreDocument: vi.fn(),
      patchDoc: vi.fn(), registerFlush: vi.fn(), flushOpen: vi.fn(async () => true), openProject: vi.fn(async () => true), go: vi.fn(async () => true)
    };
    h.api.mockReset().mockImplementation((path: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) => {
      const method = init?.method ?? "GET";
      calls.push({ path, method, body: init?.body ? JSON.parse(init.body) : undefined, ifMatch: init?.headers?.["if-match"] });
      if (path === "/me/vault") return Promise.reject(new ApiError(404, "not-found"));
      if (path === "/documents/D1" && method === "PATCH") return Promise.resolve({ ...doc("D1"), kind: "source" });
      if (path === "/documents/D1" && method === "DELETE") return Promise.resolve(undefined);
      if (path === "/projects/p1/blobs/writing_samples" && method === "GET") {
        return server.blob ? Promise.resolve({ kind: "writing_samples", body: server.blob.body, keyVersion: 0, deks: [], updatedAt: "2026-10-24T09:00:00Z", version: server.blob.version }) : Promise.reject(new ApiError(404, "not-found"));
      }
      if (path === "/projects/p1/blobs/writing_samples" && method === "PUT") {
        server.blob = { body: JSON.parse(init!.body!).body, version: (server.blob?.version ?? 0) + 1 };
        return Promise.resolve({ kind: "writing_samples", body: server.blob.body, keyVersion: 0, deks: [], updatedAt: "2026-10-24T09:00:01Z", version: server.blob.version });
      }
      return Promise.reject(new ApiError(404, "not-found"));
    });
  });
  async function until(pred: () => boolean) {
    for (let i = 0; i < 400; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); }
    throw new Error("condition not reached");
  }
  async function render() {
    const host = document.body.appendChild(document.createElement("div"));
    const root = createRoot(host);
    roots.push(root);
    await act(async () => { root.render(<VaultProvider><DocBar /></VaultProvider>); });
  }
  const click = async (testId: string) => { await act(async () => { document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!.click(); }); };
  const puts = () => calls.filter((c) => c.path === "/projects/p1/blobs/writing_samples" && c.method === "PUT");
  const gets = () => calls.filter((c) => c.path === "/projects/p1/blobs/writing_samples" && c.method === "GET");
  const stillStored = () => JSON.parse(server.blob!.body) as Samples;

  it("marking the document as a source takes its entry out of the blob and leaves the other documents' entries", async () => {
    await render();
    await click("doc-origin");
    await until(() => puts().length > 0);
    expect(Object.keys(stillStored())).toEqual(["D2"]);
    expect(puts()[0]!.ifMatch).toBe('"3"');
  });

  it("marking it as source when the project has no samples writes nothing (no empty blob is made)", async () => {
    server.blob = null;
    await render();
    await click("doc-origin");
    await until(() => gets().length > 0);
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    expect(puts()).toEqual([]);
  });

  it("marking it as source when it has no entry writes nothing", async () => {
    server.blob = { body: JSON.stringify({ D2: stored.D2 }), version: 3 };
    await render();
    await click("doc-origin");
    await until(() => gets().length > 0);
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    expect(puts()).toEqual([]);
  });

  it("marking a source back as the student's own does not touch the blob", async () => {
    (h.ws as { currentDoc: Doc }).currentDoc = doc("D1", { kind: "source" });
    await render();
    await click("doc-origin");
    await until(() => calls.some((c) => c.path === "/documents/D1" && c.method === "PATCH"));
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    expect(gets()).toEqual([]);
  });

  it("deleting the document takes its entry out of the blob", async () => {
    await render();
    await click("doc-delete");
    await until(() => !!document.querySelector('[data-testid="doc-delete-confirm"]'));
    await click("doc-delete-confirm");
    await until(() => puts().length > 0);
    expect(calls.some((c) => c.path === "/documents/D1" && c.method === "DELETE")).toBe(true);
    expect(Object.keys(stillStored())).toEqual(["D2"]);
  });

  it("a delete that failed leaves the entry", async () => {
    h.api.mockImplementation((path: string, init?: { method?: string }) => {
      const method = init?.method ?? "GET";
      calls.push({ path, method });
      if (path === "/me/vault") return Promise.reject(new ApiError(404, "not-found"));
      if (path === "/documents/D1" && method === "DELETE") return Promise.reject(new ApiError(500, "server"));
      return Promise.reject(new ApiError(404, "not-found"));
    });
    await render();
    await click("doc-delete");
    await until(() => !!document.querySelector('[data-testid="doc-delete-confirm"]'));
    await click("doc-delete-confirm");
    await until(() => calls.some((c) => c.method === "DELETE"));
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    expect(gets()).toEqual([]);
    expect(puts()).toEqual([]);
  });
});
