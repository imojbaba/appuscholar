// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { editorExtensions } from "../lib/editorExtensions";

/*
 * Writing samples, review round: nothing left behind. These run the real blob hook against a fake server that enforces If-Match, because the
 * failures are between this window's own capture client (it computes its value at once and sends it 800 ms later) and the second client that
 * takes a document's entry out (forgetSample), and between that client and a vault that is locked or a server that does not answer.
 */

const h = vi.hoisted(() => ({
  api: vi.fn(), toast: vi.fn(), ws: null as unknown,
  settings: { writingSampleCapture: true } as Record<string, unknown>
}));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ settings: h.settings, me: { id: "u1", scratchProjectId: "s1" }, update: vi.fn() }) }));
vi.mock("@/lib/vault/titles", async (orig) => ({ ...(await orig<typeof import("../lib/vault/titles")>()), useTitle: (t: { title: string } | null) => ({ state: "open", text: t?.title ?? "" }) }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/components/frame/ProjectContext", async (orig) => ({ ...(await orig<typeof import("../components/frame/ProjectContext")>()), useProject: () => h.ws }));

import { ApiError } from "../lib/api";
import { blobId } from "../lib/blobs/kinds";
import { heldBlobs } from "../lib/blobs/held";
import { VaultProvider } from "../lib/vault/useVault";
import { fullSamples } from "../lib/writingSamples/captureSample";
import { forgetSample, resumeSample, WritingSampleCapture } from "../lib/writingSamples/useWritingSampleCapture";
import { DocBar } from "../components/document/DocBar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
const editors: Editor[] = [];
const sleep = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
async function until(pred: () => boolean) {
  for (let i = 0; i < 600; i++) { if (pred()) return; await sleep(5); }
  throw new Error("condition not reached");
}
const words = (n: number, p = "w") => Array.from({ length: n }, (_, i) => p + i).join(" ");
const para = (n: number, p = "w") => `<p>${words(n, p)}</p>`;
const doc = (id: string, projectId: string, over: Record<string, unknown> = {}) => ({ id, projectId, title: "Doc " + id, titleKeyVersion: 0, deks: [], kind: "draft", currentSeq: 1, wordCount: 2, createdAt: "2026-10-21T00:00:00Z", updatedAt: "2026-10-21T00:00:00Z", bodyHtml: "<p>x</p>", keyVersion: 0, ...over });
type Doc = ReturnType<typeof doc>;
const entry = (n: number) => ({ title: "T", text: words(n), words: n, updated: 1 });

/** What the server holds per project, and what was asked of it. */
type Stored = { body: string; version: number; keyVersion: number };
let server: { blobs: Record<string, Stored>; log: Array<{ method: string; project: string; ifMatch?: string }>; down: boolean; putMs: number; getMs: number };
const entries = (p: string): Record<string, unknown> => JSON.parse((server.blobs[p]?.body ?? "{}").replace(/^sealed:/, "")) as Record<string, unknown>;
const puts = (p?: string) => server.log.filter((l) => l.method === "PUT" && (p === undefined || l.project === p));

beforeEach(() => {
  h.settings = { writingSampleCapture: true };
  server = { blobs: {}, log: [], down: false, putMs: 0, getMs: 0 };
  heldBlobs.clear();
  h.toast.mockReset();
  h.api.mockReset().mockImplementation((path: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) => {
    const method = init?.method ?? "GET";
    if (path === "/me/vault") return Promise.reject(new ApiError(404, "not-found"));
    if (path === "/documents/D1" && method === "PATCH") return Promise.resolve({ ...doc("D1", "p1"), kind: "source" });
    if (path === "/documents/D1" && method === "DELETE") return Promise.resolve(undefined);
    if (path === "/documents/D1/move" && method === "POST") return Promise.resolve(doc("D1", JSON.parse(init!.body!).projectId));
    if (path === "/projects" && method === "GET") return Promise.resolve([{ id: "p1", title: "One", titleKeyVersion: 0, deks: [], field: "", stage: "idea", status: "active", contentLang: "en", kind: "research" }, { id: "p2", title: "Two", titleKeyVersion: 0, deks: [], field: "", stage: "idea", status: "active", contentLang: "en", kind: "research" }]);
    const m = /^\/projects\/([^/]+)\/blobs\/writing_samples$/.exec(path);
    if (!m) return Promise.reject(new ApiError(404, "not-found"));
    const p = m[1]!;
    server.log.push({ method, project: p, ifMatch: init?.headers?.["if-match"] });
    if (server.down) return Promise.reject(new ApiError(500, "server"));
    const cur = server.blobs[p];
    const wire = (b: Stored) => ({ kind: "writing_samples", body: b.body, keyVersion: b.keyVersion, deks: [], updatedAt: "2026-10-24T09:00:00Z", version: b.version });
    if (method === "GET") {
      return (async () => {
        if (server.getMs) await new Promise((r) => setTimeout(r, server.getMs));
        const at = server.blobs[p];
        if (!at) throw new ApiError(404, "not-found");
        return wire(at);
      })();
    }
    if (method === "DELETE") { if (!cur) return Promise.reject(new ApiError(404, "not-found")); delete server.blobs[p]; return Promise.resolve(undefined); }
    if (method === "PUT") {
      // A save is on its way for putMs: what the server holds changes when it lands.
      return (async () => {
        if (server.putMs) await new Promise((r) => setTimeout(r, server.putMs));
        const at = server.blobs[p];
        const want = init?.headers?.["if-match"];
        if (want !== undefined && Number(want.replace(/"/g, "")) !== (at?.version ?? 0)) throw new ApiError(409, "version-conflict");
        const b = JSON.parse(init!.body!) as { body: string; keyVersion: number };
        server.blobs[p] = { body: b.body, keyVersion: b.keyVersion, version: (at?.version ?? 0) + 1 };
        return wire(server.blobs[p]!);
      })();
    }
    return Promise.reject(new ApiError(404, "not-found"));
  });
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  // forgetSample keeps a document out of the capture for the rest of the tab's life.
  for (const p of ["p1", "p2"]) resumeSample(p, "D1");
  fullSamples.clear();
  for (const e of editors.splice(0)) e.destroy();
  document.body.innerHTML = "";
  heldBlobs.clear();
});

const vaultOff = { status: "off" as const, known: async () => "off" as const, ensureUnlocked: async () => true, encryptBody: async () => { throw new Error("unused"); }, decryptBody: async (d: { bodyHtml: string }) => d.bodyHtml };

function newEditor(): Editor {
  const e = new Editor({ extensions: editorExtensions, content: "<p></p>" });
  editors.push(e);
  return e;
}
const type = (e: Editor, html: string) => act(() => { e.commands.setContent(html, { emitUpdate: true }); });
function mountRoot(node: React.ReactElement): Root {
  const r = createRoot(document.body.appendChild(document.createElement("div")));
  roots.push(r);
  act(() => { r.render(<VaultProvider>{node}</VaultProvider>); });
  return r;
}
/** The capture's blob is read when its document opens; a student types after that. */
const opened = () => sleep(80);
const capture = (e: Editor, d: Doc) => <WritingSampleCapture editor={e} doc={d as never} />;
const click = async (testId: string) => { await act(async () => { document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!.click(); }); };
function setWs(over: Record<string, unknown> = {}) {
  const d1 = doc("D1", "p1"), d2 = doc("D2", "p1");
  h.ws = {
    project: { id: "p1" }, documents: [d1, d2], currentDoc: d1, selectDoc: vi.fn(), reloadDocs: vi.fn(async () => undefined), startImport: vi.fn(), restoreDocument: vi.fn(async () => true),
    patchDoc: vi.fn(), registerFlush: vi.fn(), flushOpen: vi.fn(async () => true), openProject: vi.fn(async () => true), go: vi.fn(async () => true), ...over
  };
}

describe("taking an entry out while this window's own capture is still on its way", () => {
  it("forgetSample sends the capture first, then removes it on the newer version: no entry is left", async () => {
    const e = newEditor();
    mountRoot(capture(e, doc("D1", "p1")));
    await opened();
    type(e, para(40));
    await sleep(20);
    // The capture's set() has run; its save goes out 800 ms from now. The student marks the document as a source now.
    expect(server.blobs.p1).toBeUndefined();
    await act(async () => { await forgetSample("p1", "D1", () => vaultOff); });
    await sleep(1200);
    expect(entries("p1")).not.toHaveProperty("D1");
    // The capture went out once and the removal rode on its version.
    expect(puts("p1").map((l) => l.ifMatch)).toEqual(['"0"', '"1"']);
  });

  it("marking the open document as a source inside that window leaves nothing behind", async () => {
    setWs();
    server.putMs = 600;
    const e = newEditor();
    mountRoot(capture(e, doc("D1", "p1")));
    mountRoot(<DocBar />);
    await opened();
    type(e, para(40));
    await sleep(20);
    await click("doc-origin");
    await until(() => puts("p1").length >= 2 && !!server.blobs.p1 && server.blobs.p1.version >= 2);
    await sleep(1500);
    expect(entries("p1")).not.toHaveProperty("D1");
  });

  it("deleting the open document inside that window leaves nothing behind, though the editor goes after the removal started", async () => {
    setWs();
    server.putMs = 600;
    const e = newEditor();
    const cap = mountRoot(capture(e, doc("D1", "p1")));
    // The shell reloads the list after the delete (a request), and the editor goes when the list has come.
    (h.ws as { reloadDocs: unknown }).reloadDocs = vi.fn(async () => { await new Promise((r) => setTimeout(r, 300)); act(() => cap.unmount()); });
    mountRoot(<DocBar />);
    await opened();
    // The question is on screen before the student types, so Delete follows the typing at once.
    await click("doc-delete");
    await until(() => !!document.querySelector('[data-testid="doc-delete-confirm"]'));
    type(e, para(40));
    await sleep(20);
    type(e, para(46));
    await click("doc-delete-confirm");
    await until(() => (h.ws as { reloadDocs: { mock: { calls: unknown[] } } }).reloadDocs.mock.calls.length > 0);
    await sleep(2200);
    expect(entries("p1")).not.toHaveProperty("D1");
  });

  it("another document's entry in the same project is untouched", async () => {
    server.blobs.p1 = { body: JSON.stringify({ D2: entry(35) }), version: 4, keyVersion: 0 };
    const e = newEditor();
    mountRoot(capture(e, doc("D1", "p1")));
    await opened();
    type(e, para(40));
    await sleep(20);
    await act(async () => { await forgetSample("p1", "D1", () => vaultOff); });
    await sleep(1200);
    expect(Object.keys(entries("p1"))).toEqual(["D2"]);
  });
});

describe("moving a document to another project", () => {
  it("takes its copy out of the old project and goes on capturing in the new one", async () => {
    setWs();
    server.putMs = 600;
    server.blobs.p1 = { body: JSON.stringify({ D1: entry(40), D2: entry(35) }), version: 2, keyVersion: 0 };
    const e = newEditor();
    const cap = mountRoot(capture(e, doc("D1", "p1")));
    // openProject re-files the open document under the target, as the shell does once the move is stored.
    (h.ws as { openProject: unknown }).openProject = vi.fn(async (id: string) => { act(() => cap.render(<VaultProvider>{capture(e, doc("D1", id))}</VaultProvider>)); return true; });
    mountRoot(<DocBar />);
    await opened();
    type(e, para(41));
    await sleep(20);
    await click("doc-move");
    await until(() => document.querySelectorAll('[data-testid="doc-move-project"]').length > 0);
    await click("doc-move-project");
    await until(() => (h.ws as { openProject: { mock: { calls: unknown[] } } }).openProject.mock.calls.length > 0);
    await sleep(1500);
    // The old project keeps its other documents and loses this one, though a capture of it was on its way when the move was made.
    expect(Object.keys(entries("p1"))).toEqual(["D2"]);
    // The text typed after the move is captured in the project the document is in now.
    type(e, para(44));
    await sleep(1800);
    expect(Object.keys(entries("p2"))).toEqual(["D1"]);
    expect((entries("p2").D1 as { words: number }).words).toBe(44);
    expect(Object.keys(entries("p1"))).toEqual(["D2"]);
  });
});

describe("when the entry cannot be looked up", () => {
  it("a server that does not answer: the removal is held and goes out when it does, and then the entry is gone", async () => {
    server.blobs.p1 = { body: JSON.stringify({ D1: entry(40), D2: entry(35) }), version: 2, keyVersion: 0 };
    server.down = true;
    await act(async () => { await forgetSample("p1", "D1", () => vaultOff); });
    expect(heldBlobs.has(blobId("p1", "writing_samples"))).toBe(true);
    server.down = false;
    await act(async () => { await heldBlobs.drain(); });
    expect(Object.keys(entries("p1"))).toEqual(["D2"]);
    expect(heldBlobs.has(blobId("p1", "writing_samples"))).toBe(false);
  });

  it("the same held removal over a project that has no blob creates none", async () => {
    server.down = true;
    await act(async () => { await forgetSample("p1", "D1", () => vaultOff); });
    server.down = false;
    await act(async () => { await heldBlobs.drain(); });
    expect(server.blobs.p1).toBeUndefined();
    expect(puts()).toEqual([]);
  });

  it("the same held removal over a blob without that entry changes nothing that matters", async () => {
    server.blobs.p1 = { body: JSON.stringify({ D2: entry(35) }), version: 2, keyVersion: 0 };
    server.down = true;
    await act(async () => { await forgetSample("p1", "D1", () => vaultOff); });
    server.down = false;
    await act(async () => { await heldBlobs.drain(); });
    expect(Object.keys(entries("p1"))).toEqual(["D2"]);
  });
});

describe("with the vault locked", () => {
  /** A vault that is locked until ensureUnlocked says yes (or the student cancels). */
  function lockedVault(cancel: boolean) {
    const v = {
      unlocked: false, prompts: 0, status: "locked" as const,
      known: async () => (v.unlocked ? ("unlocked" as const) : ("locked" as const)),
      ensureUnlocked: async () => { v.prompts++; if (cancel) return false; v.unlocked = true; return true; },
      decryptBody: async (d: { bodyHtml: string }) => { if (!v.unlocked) throw new Error("vault-locked"); return d.bodyHtml.replace(/^sealed:/, ""); },
      encryptBody: async (_d: unknown, html: string) => { if (!v.unlocked) throw new Error("vault-locked"); return { bodyHtml: "sealed:" + html, keyVersion: 1 }; }
    };
    return v;
  }
  const sealed = (o: object): Stored => ({ body: "sealed:" + JSON.stringify(o), version: 3, keyVersion: 1 });

  it("asks for the passphrase once, not once to read and again to write", async () => {
    server.blobs.p1 = sealed({ D1: entry(40), D2: entry(35) });
    const v = lockedVault(true);
    await act(async () => { await forgetSample("p1", "D1", () => v); });
    expect(v.prompts).toBe(1);
    // Cancelled: the removal is held, and goes out once the vault is open.
    expect(heldBlobs.has(blobId("p1", "writing_samples"))).toBe(true);
    v.unlocked = true;
    await act(async () => { await heldBlobs.drain(); });
    expect(Object.keys(entries("p1"))).toEqual(["D2"]);
  });

  it("an accepted prompt removes the entry on that one prompt", async () => {
    server.blobs.p1 = sealed({ D1: entry(40), D2: entry(35) });
    const v = lockedVault(false);
    await act(async () => { await forgetSample("p1", "D1", () => v); });
    expect(v.prompts).toBe(1);
    expect(Object.keys(entries("p1"))).toEqual(["D2"]);
  });

  it("a project with no blob asks for nothing and writes nothing", async () => {
    const v = lockedVault(true);
    await act(async () => { await forgetSample("p1", "D1", () => v); });
    expect(v.prompts).toBe(0);
    expect(puts()).toEqual([]);
    expect(heldBlobs.has(blobId("p1", "writing_samples"))).toBe(false);
  });
});

describe("Undo of a delete", () => {
  /** Deletes D1 from the bar and presses Undo on the toast; the restore answers as `restore` does. */
  async function deleteThenUndo(restore: () => Promise<boolean>) {
    setWs({ restoreDocument: vi.fn(restore) });
    mountRoot(<DocBar />);
    await click("doc-delete");
    await until(() => !!document.querySelector('[data-testid="doc-delete-confirm"]'));
    await click("doc-delete-confirm");
    await until(() => h.toast.mock.calls.some((c) => (c[1] as { action?: unknown } | undefined)?.action));
    const action = (h.toast.mock.calls.find((c) => (c[1] as { action?: unknown } | undefined)?.action)![1] as { action: { onClick(): void } }).action;
    await act(async () => { action.onClick(); await sleep(20); });
    expect((h.ws as { restoreDocument: { mock: { calls: unknown[] } } }).restoreDocument.mock.calls).toHaveLength(1);
  }
  /** The restored document is opened again with a new editor; the student types 40 words. */
  async function typeInRestored() {
    const e = newEditor();
    mountRoot(capture(e, doc("D1", "p1")));
    await opened();
    type(e, para(40));
    await sleep(1500);
  }

  it("a restored document is captured again, though the student declined the switch to it", async () => {
    // restoreDocument answers false when the switch was declined; the document is back all the same.
    await deleteThenUndo(async () => false);
    await typeInRestored();
    expect(Object.keys(entries("p1"))).toEqual(["D1"]);
  });

  it("a restored and shown document is captured again", async () => {
    await deleteThenUndo(async () => true);
    await typeInRestored();
    expect(Object.keys(entries("p1"))).toEqual(["D1"]);
  });

  it("a restore that failed leaves the document out", async () => {
    await deleteThenUndo(async () => { throw new Error("offline"); });
    await typeInRestored();
    expect(server.blobs.p1).toBeUndefined();
    expect(h.toast).toHaveBeenCalledWith("Could not bring the document back.");
  });
});

describe("Clear leaves nothing of what was typed before it", () => {
  /** The Settings block over the same fake server; the work list names the projects whose blob the server holds. */
  async function openSettings() {
    const { SettingsWritingSamples } = await import("../components/workspace/dialogs/SettingsWritingSamples");
    h.ws = { ...(h.ws as object), projectId: "p1" };
    const base = h.api.getMockImplementation()!;
    h.api.mockImplementation((path: string, init?: { method?: string }) => {
      if (path === "/projects?include=work") return Promise.resolve(["p1", "p2"].map((id) => ({ id, blobs: server.blobs[id] ? [{ kind: "writing_samples", updatedAt: "2026-10-24T09:00:00Z", version: server.blobs[id]!.version }] : [] })));
      return base(path, init);
    });
    mountRoot(<SettingsWritingSamples />);
  }
  const clearAll = async () => {
    await click("wsamp-clear");
    await click("wsamp-clear-yes");
    await until(() => h.toast.mock.calls.length > 0);
  };

  it("a capture that is on its way is sent first, so the clear finds it and deletes it", async () => {
    h.ws = { projectId: "p1" };
    const e = newEditor();
    mountRoot(capture(e, doc("D1", "p1")));
    await openSettings();
    await opened();
    type(e, para(40));
    await sleep(20);
    expect(server.blobs.p1).toBeUndefined();
    await clearAll();
    await sleep(1500);
    expect(server.blobs.p1).toBeUndefined();
  });

  it("a change the student made before Clear is not written when the document is left after it", async () => {
    h.ws = { projectId: "p1" };
    const e = newEditor();
    const cap = mountRoot(capture(e, doc("D1", "p1")));
    await openSettings();
    await opened();
    type(e, para(40));
    await sleep(20);
    type(e, para(46));
    await clearAll();
    act(() => cap.unmount());
    await sleep(1500);
    expect(server.blobs.p1).toBeUndefined();
  });

  it("a change typed while the blob was still being read, before Clear, is not written when the document is left after it", async () => {
    h.ws = { projectId: "p1" };
    server.getMs = 400;
    const e = newEditor();
    const cap = mountRoot(capture(e, doc("D1", "p1")));
    await openSettings();
    // The blob is still being read: the change waits (nothing is set), and the copy does not exist on the server.
    type(e, para(40));
    await clearAll();
    expect(server.blobs.p1).toBeUndefined();
    act(() => cap.unmount());
    await sleep(1500);
    expect(server.blobs.p1).toBeUndefined();
  });

  it("typing after Clear is captured again", async () => {
    h.ws = { projectId: "p1" };
    const e = newEditor();
    mountRoot(capture(e, doc("D1", "p1")));
    await openSettings();
    await opened();
    await clearAll();
    await sleep(20);
    type(e, para(47));
    await sleep(1500);
    expect(Object.keys(entries("p1"))).toEqual(["D1"]);
    expect((entries("p1").D1 as { words: number }).words).toBe(47);
  });
});
