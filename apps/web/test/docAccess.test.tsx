// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { sanitizeHtml } from "@appuscholar/core";
import { editorExtensions } from "../lib/editorExtensions";
import { decryptText, encryptText, generateDek, generateKeypair, generateVaultKey, sealVaultCheck, wrapKey, wrapPrivateKey, wrapWithPassphrase, wrapWithRecovery } from "../lib/vault/crypto";
import en from "../messages/en.json";
import { FakeChannel } from "./support/fakeChannel";

const h = vi.hoisted(() => ({
  api: vi.fn(), ask: vi.fn(), toast: vi.fn(), push: vi.fn(), update: vi.fn(), path: "/p/p1/lit/compare", ws: null as unknown, access: null as unknown, editor: null as unknown, stub: () => null,
  settings: { seenWelcome: true } as Record<string, unknown>,
  me: { id: "u-da", activeProjectId: "p1" as string | null, scratchProjectId: "s1", termsAcceptedAt: "2999-01-01T00:00:00Z" }
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push, replace: h.push }), usePathname: () => h.path }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: h.me, settings: h.settings, update: h.update, reload: async () => undefined }) }));
vi.mock("@/components/workspace/dialogs/Passphrase", async () => (await import("./support/passphraseMock")).passphraseMock(h.ask));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/components/frame/AppHeader", () => ({ AppHeader: h.stub }));
vi.mock("@/components/frame/WindowHeader", () => ({ WindowHeader: h.stub }));
vi.mock("@/components/workspace/ChromeDialogs", () => ({ ChromeDialogs: h.stub }));
vi.mock("@/components/workspace/dialogs/ImportOrigin", () => ({ ImportOrigin: h.stub }));
vi.mock("@/components/workspace/dialogs/MyWriting", () => ({ MyWriting: h.stub }));
vi.mock("@/components/workspace/dialogs/ImportV1Dialog", () => ({ ImportV1Dialog: h.stub }));
vi.mock("@/lib/cite/useLibrary", () => ({ CiteLibraryProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/lib/cite/capture", () => ({ CaptureHash: h.stub }));
// The suggestion provider is the real one. The document card is a stand-in with a real editor on the open document, registered as the card registers it.
vi.mock("@/components/document/DocumentCard", async () => {
  const { useProject } = await import("../components/frame/ProjectContext");
  const { useSuggestion } = await import("../lib/ai/suggestion");
  return {
    DocumentCard: () => {
      const ws = useProject();
      const sug = useSuggestion();
      h.ws = ws;
      const d = ws.currentDoc;
      const readable = d && !d.unreadable ? d : null;
      const { registerEditor } = ws, { setEditor } = sug;
      useEffect(() => {
        if (!readable) return;
        const ed = new Editor({ extensions: editorExtensions, content: readable.bodyHtml });
        h.editor = ed;
        registerEditor(ed); setEditor(ed);
        return () => { registerEditor(null); setEditor(null); ed.destroy(); };
      }, [readable, registerEditor, setEditor]);
      return <div data-testid="shown">{d ? d.id + ":" + (d.unreadable ?? "open") : "none"}</div>;
    }
  };
});

import { ApiError } from "../lib/api";
import { setSyncChannel } from "../lib/popout/sync";
import { VaultProvider } from "../lib/vault/useVault";
import { ProjectShell } from "../components/frame/ProjectShell";
import { useProject, type ProjectValue } from "../components/frame/ProjectContext";
import { DOC_REPLY_WAIT_MS, useDocAccess, type DocAccess } from "../lib/editor/docAccess";
import { markCursorPlaced } from "../lib/editor/insert";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = (() => {}) as typeof window.scrollTo;
const E = en as Record<string, string>;
const PASS = "right passphrase";
const roots: Root[] = [];
let ch: FakeChannel;
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  document.body.innerHTML = ""; setSyncChannel(undefined); vi.useRealTimers();
  window.history.replaceState(null, "", "/");
});
async function until(pred: () => boolean) {
  for (let i = 0; i < 600; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); }
  throw new Error("condition not reached");
}
const ws = () => h.ws as ProjectValue;
const access = () => h.access as DocAccess;
const editor = () => h.editor as Editor;
const frameDoc = () => document.querySelector<HTMLElement>('[data-testid="frame-doc"]')!;
const shown = () => document.querySelector('[data-testid="shown"]')?.textContent;
const toasts = () => h.toast.mock.calls.map((c) => c[0]);
/** Runs one of the hook's calls inside act and answers its result. */
async function call<T>(fn: () => Promise<T>): Promise<T> {
  let out!: T;
  await act(async () => { out = await fn(); });
  return out;
}

const project = (id: string) => ({ id, title: "Project " + id, titleKeyVersion: 0, deks: [], field: "psychology", stage: "idea", status: "active", contentLang: "en", kind: "research", stageMarks: {} });
const plainDoc = (id: string, bodyHtml = "<p>Mine.</p>", createdAt = "2026-10-16T00:00:01Z") => ({ id, projectId: "p1", title: "Title " + id, titleKeyVersion: 0, deks: [], kind: "draft", currentSeq: 1, wordCount: 2, createdAt, updatedAt: "2026-10-16T00:00:00Z", keyVersion: 0, bodyHtml });

/** Project p1 with documents D1 (open first) and D2, plaintext; every PUT is recorded. */
function plainApi(d1 = "<p>Mine.</p>", d2 = "<p>Other.</p>") {
  const puts: Array<{ path: string; body: Record<string, unknown> }> = [];
  h.api.mockImplementation((path: string, init?: { method?: string; body?: string }) => {
    if (path === "/me/vault") return Promise.reject(new ApiError(404, "not-found"));
    if (path === "/projects") return Promise.resolve([project("p1")]);
    if (path === "/me/active-project" && init?.method === "PATCH") return Promise.resolve(undefined);
    if (path === "/projects/p1/documents") return Promise.resolve([plainDoc("D1", d1), plainDoc("D2", d2, "2026-10-16T00:00:02Z")]);
    if (init?.method === "PUT") { puts.push({ path, body: JSON.parse(init.body!) }); return Promise.resolve({ document: {}, revision: { seq: 2 }, created: true }); }
    if (path === "/documents/D1") return Promise.resolve(plainDoc("D1", d1));
    if (path === "/documents/D2") return Promise.resolve(plainDoc("D2", d2, "2026-10-16T00:00:02Z"));
    return Promise.reject(new ApiError(404, "not-found"));
  });
  return puts;
}

/**
 * A complete vault and the scratch project s1 holding A (sealed, its title too, opened first), B (sealed, created before A) and C (deleted). Every PUT is
 * recorded; `dek` opens A's and B's bodies.
 */
async function vaultApi() {
  const vk = await generateVaultKey();
  const kp = await generateKeypair();
  const record = { passWrapped: await wrapWithPassphrase(vk, PASS), recoveryWrapped: await wrapWithRecovery(vk, "AAAAA-BBBBB-CCCCC-DDDDD"), checkWrapped: await sealVaultCheck(vk), publicKey: kp.publicKeyB64, privateKeyWrapped: await wrapPrivateKey(kp.privateKey, vk), complete: true, updatedAt: new Date().toISOString() };
  const dek = await generateDek();
  const deks = [{ v: 1, wrapped: await wrapKey(dek, vk) }];
  const sealed = async (id: string, title: string, body: string, createdAt: string, deletedAt: string | null = null) => ({
    id, projectId: "s1", title: await encryptText(title, dek), titleKeyVersion: 1, kind: "draft", currentSeq: 1, wordCount: 1, createdAt, updatedAt: createdAt, deletedAt,
    keyVersion: 1, deks, bodyHtml: await encryptText(body, dek)
  });
  const a = await sealed("A", "Chapter one", "<p>Mine.</p>", "2026-10-16T00:00:02Z");
  const b = await sealed("B", "Interview two", "<p>She said <b>yes</b>.</p><p>Then no.</p>", "2026-10-16T00:00:01Z");
  const c = await sealed("C", "Gone", "<p>Deleted.</p>", "2026-10-16T00:00:03Z", "2026-10-17T00:00:00Z");
  const puts: Array<{ path: string; body: Record<string, unknown> }> = [];
  h.api.mockImplementation((path: string, init?: { method?: string; body?: string }) => {
    if (path === "/me/vault") return Promise.resolve({ ...record });
    if (path === "/projects") return Promise.resolve([]);
    // The api answers most recently updated first; the shell opens the first.
    if (path === "/projects/s1/documents") return Promise.resolve([a, c, b]);
    if (init?.method === "PUT") { puts.push({ path, body: JSON.parse(init.body!) }); return Promise.resolve({ document: { deks }, revision: { seq: 2 }, created: true }); }
    if (path === "/documents/A") return Promise.resolve({ ...a });
    if (path === "/documents/B") return Promise.resolve({ ...b });
    if (path === "/documents/C") return Promise.resolve({ ...c });
    return Promise.reject(new ApiError(404, "not-found"));
  });
  return { puts, dek };
}

function Probe() {
  const access = useDocAccess();
  const project = useProject();
  useEffect(() => { h.access = access; h.ws = project; });
  return <div data-testid="place-content" />;
}
async function mount(projectId: string) {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  roots.push(root);
  await act(async () => { root.render(<VaultProvider><ProjectShell projectId={projectId}><Probe /></ProjectShell></VaultProvider>); });
  return host;
}
/** The scratch space with the vault: the student types the passphrase when it opens, and document A shows. */
async function mountVault() {
  h.path = "/p/s1/lit/compare";
  h.me = { ...h.me, activeProjectId: null };
  const v = await vaultApi();
  h.ask.mockResolvedValue(PASS);
  await mount("s1");
  await until(() => shown() === "A:open" && !!h.editor);
  return v;
}
/** Selects document text by its positions. */
const select = (from: number, to = from) => act(() => { editor().commands.setTextSelection({ from, to }); });

beforeEach(() => {
  h.api.mockReset(); h.toast.mockReset(); h.push.mockReset(); h.ask.mockReset(); h.update.mockReset().mockResolvedValue(undefined);
  h.path = "/p/p1/lit/compare"; h.ws = null; h.access = null; h.editor = null; h.settings = { seenWelcome: true };
  h.me = { ...h.me, activeProjectId: "p1" };
  ch = new FakeChannel();
  setSyncChannel(ch);
});

describe("useDocAccess in the writing window", () => {
  it("insertBlock opens the document when closed and inserts once at the end", async () => {
    plainApi();
    await mount("p1");
    await until(() => !!h.editor && !!h.access);
    expect(ws().docOpen).toBe(false);
    expect(frameDoc().hidden).toBe(true);
    const ok = await call(() => access().insertBlock("<p>Block.</p>"));
    expect(ok).toBe(true);
    expect(editor().getHTML()).toBe("<p>Mine.</p><p>Block.</p>");
    expect(ws().docOpen).toBe(true);
    expect(frameDoc().hidden).toBe(false);
    expect(toasts()).toEqual([]);
  });

  it("wrapSelection refuses a selection across two paragraphs", async () => {
    plainApi("<p>One two.</p><p>Three.</p>");
    await mount("p1");
    await until(() => !!h.editor && !!h.access);
    const before = editor().getHTML();
    // "two." and "Three": the selection crosses from the first paragraph into the second.
    select(5, 14);
    expect(await call(() => access().wrapSelection("qual-tag", { "data-qcode": "q1" }))).toBe("crosses-paragraph");
    expect(editor().getHTML()).toBe(before);
    // Nothing selected: nothing to tag.
    select(3);
    expect(await call(() => access().wrapSelection("qual-tag", { "data-qcode": "q1" }))).toBe("no-selection");
    expect(editor().getHTML()).toBe(before);
    // "two" alone, inside one paragraph: tagged, the title kept, anything else the mark cannot keep dropped.
    select(5, 8);
    expect(await call(() => access().wrapSelection("qual-tag", { "data-qcode": "q1", title: "Coping", style: "color:red" }))).toBe("done");
    expect(editor().getHTML()).toBe('<p>One <span class="qual-tag" data-qcode="q1" title="Coping">two</span>.</p><p>Three.</p>');
    // The cursor ends after the passage (v1 6258-6259), and the tag is one undoable step.
    expect(editor().state.selection.empty).toBe(true);
    expect(editor().state.selection.from).toBe(8);
    act(() => { editor().commands.undo(); });
    expect(editor().getHTML()).toBe(before);
  });

  it("wrapSelection keeps a stat-tag's data-run, and a second code on the same passage nests", async () => {
    plainApi("<p>t(28) = 2.10, p = .04</p>");
    await mount("p1");
    await until(() => !!h.editor && !!h.access);
    select(1, 13);
    expect(await call(() => access().wrapSelection("stat-tag", { "data-run": "rabc123" }))).toBe("done");
    select(1, 13);
    expect(await call(() => access().wrapSelection("qual-tag", { "data-qcode": "q2" }))).toBe("done");
    const html = editor().getHTML();
    expect(html).toContain('class="stat-tag" data-run="rabc123"');
    expect(html).toContain('class="qual-tag" data-qcode="q2"');
    expect(sanitizeHtml(html)).toBe(html);
  });

  it("text() is the whole document as v1's getEditorText, selection() the selection else empty", async () => {
    plainApi("<p>One two.</p><p>Three <b>four</b>.</p>");
    await mount("p1");
    await until(() => !!h.editor && !!h.access);
    expect(access().text()).toBe("One two.\n\nThree four.");
    select(3);
    expect(access().selection()).toBe("");
    select(5, 16);
    expect(access().selection()).toBe("two.\nThree");
  });

  it("insertText puts plain text at the placed cursor, escaped", async () => {
    plainApi("<p>One two.</p>");
    await mount("p1");
    await until(() => !!h.editor && !!h.access);
    // The student has put the cursor before "two" (v1's savedRange; a detached editor gets no focus event here).
    act(() => { markCursorPlaced(editor()); editor().commands.setTextSelection(5); });
    expect(await call(() => access().insertText("<b>x</b> "))).toBe(true);
    expect(editor().getHTML()).toBe("<p>One &lt;b&gt;x&lt;/b&gt; two.</p>");
  });

  it("replaceInDocument replaces the first occurrence across inline marks, Ctrl+Z undoes it, and a missing original changes nothing", async () => {
    plainApi("<p>Their is a <b>big</b> cat. Their is.</p>");
    await mount("p1");
    await until(() => !!h.editor && !!h.access);
    const before = editor().getHTML();
    expect(await call(() => access().replaceInDocument("Their is", "There is"))).toBe(true);
    expect(editor().getHTML()).toBe("<p>There is a <strong>big</strong> cat. Their is.</p>");
    act(() => { editor().commands.undo(); });
    expect(editor().getHTML()).toBe(before);
    // Across a bold run, as v1's text walk finds it (6803-6806).
    expect(await call(() => access().replaceInDocument("a big cat", "a small dog"))).toBe(true);
    expect(editor().getHTML()).toBe("<p>Their is a small dog. Their is.</p>");
    expect(await call(() => access().replaceInDocument("not there", "x"))).toBe(false);
    expect(editor().getHTML()).toBe("<p>Their is a small dog. Their is.</p>");
  });

  it("rewriteDocument of the open document sets the editor's content in one undoable step, for its autosave to store", async () => {
    const puts = plainApi();
    await mount("p1");
    await until(() => !!h.editor && !!h.access);
    const updates = vi.fn();
    editor().on("update", updates);
    expect(await call(() => access().rewriteDocument("D1", '<p>New <span class="qual-tag" data-qcode="q1">text</span>.</p><img src="x" onerror="alert(1)">'))).toBe(true);
    expect(editor().getHTML()).toBe('<p>New <span class="qual-tag" data-qcode="q1">text</span>.</p>');
    // The editor's update event is what its autosave listens to; nothing is written around it.
    expect(updates).toHaveBeenCalled();
    expect(puts).toEqual([]);
    expect(ws().docOpen).toBe(true);
    act(() => { editor().commands.undo(); });
    expect(editor().getHTML()).toBe("<p>Mine.</p>");
  });

  it("rewriteDocument of another document seals it and writes it through the revision path, sanitised", async () => {
    const { puts, dek } = await mountVault();
    const before = editor().getHTML();
    expect(await call(() => access().rewriteDocument("B", '<p onclick="steal()">Tagged <span class="qual-tag" data-qcode="q9">yes</span>.</p>'))).toBe(true);
    expect(puts).toHaveLength(1);
    expect(puts[0]!.path).toBe("/documents/B");
    const body = puts[0]!.body as { bodyHtml: string; keyVersion: number; wordCount: number };
    expect(body.keyVersion).toBe(1);
    // Counted in the browser as the editor's autosave counts (core's wordCount: tags read as spaces).
    expect(body.wordCount).toBe(3);
    expect(await decryptText(body.bodyHtml, dek)).toBe('<p>Tagged <span class="qual-tag" data-qcode="q9">yes</span>.</p>');
    // The open document is untouched.
    expect(editor().getHTML()).toBe(before);
    // A document of another project, or one that is not there, is not written.
    expect(await call(() => access().rewriteDocument("nope", "<p>x</p>"))).toBe(false);
    expect(puts).toHaveLength(1);
  }, 30_000);

  it("allDocuments returns decrypted text of every live document in the project", async () => {
    await mountVault();
    // The open document's words not yet saved count: it is read from the editor, as v1 read the open document.
    act(() => { editor().commands.insertContentAt(editor().state.doc.content.size, "<p>Live.</p>"); });
    const docs = await call(() => access().allDocuments());
    // In creation order, as v1 listed documents; the deleted one left out.
    expect(docs).toEqual([
      { id: "B", title: "Interview two", html: "<p>She said <b>yes</b>.</p><p>Then no.</p>", text: "She said yes.\n\nThen no." },
      { id: "A", title: "Chapter one", html: "<p>Mine.</p><p>Live.</p>", text: "Mine.\n\nLive." }
    ]);
  }, 30_000);
});

describe("the editor keeps the tags' data attributes (ruling R11)", () => {
  it("a document holding a stat-tag and a qual-tag round-trips through the editor and the sanitiser", () => {
    const html = '<p>We found <span class="stat-tag" data-run="rk2x9">t(28) = 2.10, p = .04</span> and <span class="qual-tag" data-qcode="c1" title="Coping">I just kept going</span>.</p>';
    const first = new Editor({ extensions: editorExtensions, content: html });
    const saved = sanitizeHtml(first.getHTML());
    expect(saved).toBe(html);
    const second = new Editor({ extensions: editorExtensions, content: saved });
    expect(second.getHTML()).toBe(html);
    first.destroy(); second.destroy();
  });
});

describe("useDocAccess in a place's own window (ruling R10)", () => {
  const popout = () => { window.history.replaceState(null, "", "/p/p1/lit/compare?window=1"); h.path = "/p/p1/lit/compare"; };
  const requests = () => ch.sent.filter((m) => (m as { type?: string }).type === "doc-request") as Array<{ id: string; projectId: string; op: string; args: unknown[] }>;

  it("says hello, mirrors the writing window's snapshot for text() and selection(), and ignores another project's", async () => {
    popout();
    plainApi();
    await mount("p1");
    await until(() => !!h.access && ch.sent.some((m) => (m as { type?: string }).type === "doc-hello"));
    expect(h.editor).toBeNull();
    expect(access().text()).toBe("");
    expect(access().selection()).toBe("");
    act(() => { ch.deliver({ type: "doc-snapshot", projectId: "p1", docId: "D1", text: "Mine.\n\nMore.", selection: "More" }); });
    expect(access().text()).toBe("Mine.\n\nMore.");
    expect(access().selection()).toBe("More");
    act(() => { ch.deliver({ type: "doc-snapshot", projectId: "p9", docId: "X", text: "Elsewhere.", selection: "" }); });
    expect(access().text()).toBe("Mine.\n\nMore.");
  });

  it("an insert is asked of the writing window, and its reply is the answer; the pop-out writes nothing itself", async () => {
    popout();
    plainApi();
    await mount("p1");
    await until(() => !!h.access);
    let done: boolean | null = null;
    act(() => { void access().insertBlock("<p>Block.</p>").then((v) => { done = v; }); });
    await until(() => requests().length === 1);
    const req = requests()[0]!;
    expect(req).toMatchObject({ projectId: "p1", op: "insertBlock", args: ["<p>Block.</p>"] });
    act(() => { ch.deliver({ type: "doc-reply", id: "another", result: false }); });
    expect(done).toBeNull();
    act(() => { ch.deliver({ type: "doc-reply", id: req.id, result: true }); });
    await until(() => done !== null);
    expect(done).toBe(true);
    expect(h.api.mock.calls.filter(([, init]) => (init as { method?: string } | undefined)?.method === "PUT")).toEqual([]);
    expect(toasts()).toEqual([]);
  });

  it("with no reply in 10 seconds each call answers its fallback and says pop_nowin", async () => {
    popout();
    plainApi();
    await mount("p1");
    await until(() => !!h.access);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const got: unknown[] = [];
    act(() => {
      void access().insertText("x").then((v) => got.push(v));
      void access().wrapSelection("qual-tag", { "data-qcode": "q1" }).then((v) => got.push(v));
      void access().allDocuments().then((v) => got.push(v));
      void access().rewriteDocument("D2", "<p>x</p>").then((v) => got.push(v));
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(DOC_REPLY_WAIT_MS - 1); });
    expect(got).toEqual([]);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(got).toEqual([false, "no-selection", [], false]);
    expect(DOC_REPLY_WAIT_MS).toBe(10_000);
    expect(toasts()).toEqual(Array(4).fill(E.pop_nowin));
  });
});

describe("the writing window answers a pop-out (ruling R10)", () => {
  const sent = (type: string) => ch.sent.filter((m) => (m as { type?: string }).type === type) as Array<Record<string, unknown>>;

  it("posts a snapshot when a pop-out says hello and after the document changes", async () => {
    plainApi("<p>One two.</p>");
    await mount("p1");
    await until(() => !!h.editor && !!h.access);
    ch.sent.length = 0;
    act(() => { ch.deliver({ type: "doc-hello" }); });
    expect(sent("doc-snapshot").at(-1)).toEqual({ type: "doc-snapshot", projectId: "p1", docId: "D1", text: "One two.", selection: "" });
    act(() => { editor().commands.setTextSelection({ from: 5, to: 8 }); });
    await until(() => sent("doc-snapshot").at(-1)?.selection === "two");
    expect(sent("doc-snapshot").at(-1)).toEqual({ type: "doc-snapshot", projectId: "p1", docId: "D1", text: "One two.", selection: "two" });
  });

  it("runs a pop-out's request on the open document and replies with the answer; another project's request is not its to answer", async () => {
    plainApi();
    await mount("p1");
    await until(() => !!h.editor && !!h.access);
    act(() => { ch.deliver({ type: "doc-request", id: "q1", projectId: "p1", op: "insertBlock", args: ["<p>From the window.</p>"] }); });
    await until(() => sent("doc-reply").length === 1);
    expect(sent("doc-reply")[0]).toEqual({ type: "doc-reply", id: "q1", result: true });
    expect(editor().getHTML()).toBe("<p>Mine.</p><p>From the window.</p>");
    expect(ws().docOpen).toBe(true);
    act(() => { ch.deliver({ type: "doc-request", id: "q2", projectId: "p1", op: "allDocuments", args: [] }); });
    await until(() => sent("doc-reply").length === 2);
    expect(sent("doc-reply")[1]).toEqual({ type: "doc-reply", id: "q2", result: [
      { id: "D1", title: "Title D1", html: "<p>Mine.</p><p>From the window.</p>", text: "Mine.\n\nFrom the window." },
      { id: "D2", title: "Title D2", html: "<p>Other.</p>", text: "Other." }
    ] });
    act(() => { ch.deliver({ type: "doc-request", id: "q3", projectId: "p9", op: "insertText", args: ["x"] }); });
    act(() => { ch.deliver({ type: "doc-request", id: "q4", projectId: "p1", op: "insertText", args: [42] }); });
    await until(() => sent("doc-reply").length === 3);
    expect(sent("doc-reply")[2]).toEqual({ type: "doc-reply", id: "q4", result: false });
    expect(editor().getHTML()).toBe("<p>Mine.</p><p>From the window.</p>");
  });
});
