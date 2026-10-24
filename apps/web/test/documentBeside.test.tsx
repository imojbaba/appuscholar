// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { editorExtensions } from "../lib/editorExtensions";
import { encryptText, generateDek, generateKeypair, generateVaultKey, sealVaultCheck, wrapKey, wrapPrivateKey, wrapWithPassphrase, wrapWithRecovery } from "../lib/vault/crypto";
import en from "../messages/en.json";
import { FakeChannel } from "./support/fakeChannel";

const h = vi.hoisted(() => ({
  api: vi.fn(), ask: vi.fn(), toast: vi.fn(), push: vi.fn(), update: vi.fn(), path: "/p/p1/lit/compare", ws: null as unknown, sug: null as unknown, editor: null as unknown, stub: () => null,
  settings: { seenWelcome: true } as Record<string, unknown>,
  me: { id: "u-db", activeProjectId: "p1" as string | null, scratchProjectId: "s1", termsAcceptedAt: "2999-01-01T00:00:00Z" }
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push, replace: h.push }), usePathname: () => h.path }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: h.me, settings: h.settings, update: h.update, reload: async () => undefined }) }));
vi.mock("@/components/workspace/dialogs/Passphrase", async () => (await import("./support/passphraseMock")).passphraseMock(h.ask));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/components/frame/AppHeader", () => ({ AppHeader: h.stub }));
vi.mock("@/components/workspace/ChromeDialogs", () => ({ ChromeDialogs: h.stub }));
vi.mock("@/components/workspace/dialogs/ImportOrigin", () => ({ ImportOrigin: h.stub }));
vi.mock("@/components/workspace/dialogs/MyWriting", () => ({ MyWriting: h.stub }));
vi.mock("@/components/workspace/dialogs/ImportV1Dialog", () => ({ ImportV1Dialog: h.stub }));
vi.mock("@/lib/cite/useLibrary", () => ({ CiteLibraryProvider: ({ children }: { children: React.ReactNode }) => children }));
// The paper-id migration (wave B, Task 17) needs the real library provider; this file stands the provider in, and is about something else.
vi.mock("@/components/frame/PaperIdsRunner", () => ({ PaperIdsRunner: () => null }));
vi.mock("@/components/frame/FullTextRunner", () => ({ FullTextRunner: () => null }));
vi.mock("@/lib/cite/capture", () => ({ CaptureHash: h.stub }));
// The suggestion provider is the real one. The document card is a stand-in with a real editor on the open document, registered as the card registers it.
vi.mock("@/components/document/DocumentCard", async () => {
  const { useProject } = await import("../components/frame/ProjectContext");
  const { useSuggestion } = await import("../lib/ai/suggestion");
  return {
    DocumentCard: () => {
      const ws = useProject();
      const sug = useSuggestion();
      h.ws = ws; h.sug = sug;
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
import { putAiInDocument } from "../lib/editor/insert";
import type { SuggestionValue } from "../lib/ai/suggestion";
import { VaultProvider } from "../lib/vault/useVault";
import { ProjectShell } from "../components/frame/ProjectShell";
import type { ProjectValue } from "../components/frame/ProjectContext";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no scrolling: the full-screen document's scroll to the top is a no-op here, not a "Not implemented" log.
window.scrollTo = (() => {}) as typeof window.scrollTo;
const E = en as Record<string, string>;
const PASS = "right passphrase";
const roots: Root[] = [];
let ch: FakeChannel;
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; setSyncChannel(undefined); vi.useRealTimers(); });
async function until(pred: () => boolean) {
  for (let i = 0; i < 600; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); }
  throw new Error("condition not reached");
}
const ws = () => h.ws as ProjectValue;
const sug = () => h.sug as SuggestionValue;
const editor = () => h.editor as Editor;
const frameDoc = () => document.querySelector<HTMLElement>('[data-testid="frame-doc"]')!;
const shown = () => document.querySelector('[data-testid="shown"]')?.textContent;
const toasts = () => h.toast.mock.calls.map((c) => c[0]);

const project = (id: string) => ({ id, title: "Project " + id, titleKeyVersion: 0, deks: [], field: "psychology", stage: "idea", status: "active", contentLang: "en", kind: "research", stageMarks: {} });
const plainDoc = (id: string) => ({ id, projectId: "p1", title: id, titleKeyVersion: 0, deks: [], kind: "draft", currentSeq: 1, wordCount: 2, createdAt: "2026-10-16T00:00:01Z", updatedAt: "2026-10-16T00:00:00Z", keyVersion: 0, bodyHtml: "<p>Mine.</p>" });

function plainApi() {
  h.api.mockImplementation((path: string, init?: { method?: string }) => {
    if (path === "/me/vault") return Promise.reject(new ApiError(404, "not-found"));
    if (path === "/projects") return Promise.resolve([project("p1")]);
    if (path === "/me/active-project" && init?.method === "PATCH") return Promise.resolve(undefined);
    if (path === "/projects/p1/documents") return Promise.resolve([plainDoc("D1")]);
    if (path === "/documents/D1") return Promise.resolve(plainDoc("D1"));
    return Promise.reject(new ApiError(404, "not-found"));
  });
}

/**
 * A complete vault and one sealed document in the scratch space; `reread` answers the document's second and later reads (the one after an unlock).
 * With `withB`, a second, plaintext document B sits beside it.
 */
async function vaultApi(reread?: () => Promise<unknown>, withB = false) {
  const vk = await generateVaultKey();
  const kp = await generateKeypair();
  const record = { passWrapped: await wrapWithPassphrase(vk, PASS), recoveryWrapped: await wrapWithRecovery(vk, "AAAAA-BBBBB-CCCCC-DDDDD"), checkWrapped: await sealVaultCheck(vk), publicKey: kp.publicKeyB64, privateKeyWrapped: await wrapPrivateKey(kp.privateKey, vk), complete: true, updatedAt: new Date().toISOString() };
  const dek = await generateDek();
  const doc = { id: "A", projectId: "s1", title: "A", titleKeyVersion: 0, kind: "draft", currentSeq: 1, wordCount: 1, createdAt: "2026-10-16T00:00:01Z", updatedAt: "2026-10-16T00:00:00Z", keyVersion: 1, deks: [{ v: 1, wrapped: await wrapKey(dek, vk) }], bodyHtml: await encryptText("<p>Mine.</p>", dek) };
  const b = { ...plainDoc("B"), projectId: "s1", createdAt: "2026-10-16T00:00:02Z" };
  let reads = 0;
  h.api.mockImplementation((path: string) => {
    if (path === "/me/vault") return Promise.resolve({ ...record });
    if (path === "/projects") return Promise.resolve([]);
    if (path === "/projects/s1/documents") return Promise.resolve(withB ? [doc, b] : [doc]);
    if (path === "/documents/B" && withB) return Promise.resolve({ ...b });
    if (path === "/documents/A") return ++reads > 1 && reread ? reread() : Promise.resolve({ ...doc });
    return Promise.reject(new ApiError(404, "not-found"));
  });
}

async function mount(projectId: string, place: React.ReactNode = <div data-testid="place-content" />) {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  roots.push(root);
  await act(async () => { root.render(<VaultProvider><ProjectShell projectId={projectId}>{place}</ProjectShell></VaultProvider>); });
  return host;
}

beforeEach(() => {
  h.api.mockReset(); h.toast.mockReset(); h.push.mockReset(); h.ask.mockReset(); h.update.mockReset().mockResolvedValue(undefined);
  h.path = "/p/p1/lit/compare"; h.ws = null; h.sug = null; h.editor = null; h.settings = { seenWelcome: true };
  h.me = { ...h.me, activeProjectId: "p1" };
  ch = new FakeChannel();
  setSyncChannel(ch);
});

describe("the document beside any stage", () => {
  it("Put in my document with the document closed opens it and inserts once", async () => {
    plainApi();
    await mount("p1");
    await until(() => !!h.editor);
    expect(ws().docOpen).toBe(false);
    expect(frameDoc().hidden).toBe(true);
    const run = vi.fn((e: Editor) => { e.commands.insertContentAt(e.state.doc.content.size, "<p>Compared.</p>"); });
    let ok!: boolean;
    await act(async () => { ok = await ws().requestInsert(run); });
    expect(ok).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(editor().getHTML()).toBe("<p>Mine.</p><p>Compared.</p>");
    expect(ws().docOpen).toBe(true);
    expect(frameDoc().hidden).toBe(false);
    // Opened beside the place: the place stays where it is, and the choice is remembered.
    expect(document.querySelector('[data-testid="place-content"]')).not.toBeNull();
    expect(h.push).not.toHaveBeenCalled();
    expect(h.update).toHaveBeenCalledWith({ docBeside: true });
    expect(toasts()).toEqual([]);
  });

  it("the helper for AI text goes through requestInsert, marked as AI text at the end", async () => {
    plainApi();
    await mount("p1");
    await until(() => !!h.editor);
    let ok!: boolean;
    await act(async () => { ok = await putAiInDocument(ws().requestInsert, "A read of the idea."); });
    expect(ok).toBe(true);
    expect(editor().getHTML()).toMatch(/^<p>Mine\.<\/p><p><span class="ai-ins" data-h="[^"]+">A read of the idea\.<\/span><\/p>$/);
    expect(ws().docOpen).toBe(true);
  });

  it("a cancelled unlock inserts nothing and says so (Review Focus 4)", async () => {
    h.path = "/p/s1/lit/compare";
    h.me = { ...h.me, activeProjectId: null };
    await vaultApi();
    // The project opens with the vault locked: the student cancels, and the document stays locked and closed.
    h.ask.mockResolvedValueOnce(null);
    await mount("s1");
    await until(() => shown() === "A:locked");
    expect(h.ask).toHaveBeenCalledTimes(1);

    // Put in my document: the passphrase is asked once; cancelled, nothing goes in and the student is told.
    h.ask.mockResolvedValueOnce(null);
    const run = vi.fn();
    let ok!: boolean;
    await act(async () => { ok = await ws().requestInsert(run); });
    expect(ok).toBe(false);
    expect(h.ask).toHaveBeenCalledTimes(2);
    expect(run).not.toHaveBeenCalled();
    expect(toasts()).toEqual([E.insert_doc_closed]);
    expect(E.insert_doc_closed).toBe("Your document did not open, so nothing was inserted.");

    // Again, and this time the passphrase is typed: asked once more, the document opens and the text goes in once.
    h.ask.mockResolvedValueOnce(PASS);
    const put = vi.fn((e: Editor) => { e.commands.insertContentAt(e.state.doc.content.size, "<p>Compared.</p>"); });
    let second!: Promise<boolean>;
    act(() => { second = ws().requestInsert(put); });
    let done: boolean | null = null;
    void second.then((v) => { done = v; });
    await until(() => done !== null);
    expect(done).toBe(true);
    expect(h.ask).toHaveBeenCalledTimes(3);
    expect(put).toHaveBeenCalledTimes(1);
    expect(shown()).toBe("A:open");
    expect(editor().getHTML()).toBe("<p>Mine.</p><p>Compared.</p>");
    expect(ws().docOpen).toBe(true);
    expect(toasts()).toEqual([E.insert_doc_closed]);
  }, 30_000);

  it("a document that does not open within 10 seconds of the unlock inserts nothing and says so", async () => {
    h.path = "/p/s1/lit/compare";
    h.me = { ...h.me, activeProjectId: null };
    // After the unlock the document's read never answers (a dead connection).
    await vaultApi(() => new Promise(() => {}));
    h.ask.mockResolvedValueOnce(null);
    await mount("s1");
    await until(() => shown() === "A:locked");
    h.ask.mockResolvedValueOnce(PASS);
    // The clock is the test's from here; it still runs on its own, so the unlock's work goes on.
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout"] });
    const run = vi.fn();
    let done: boolean | null = null;
    act(() => { void ws().requestInsert(run).then((v) => { done = v; }); });
    // The unlock takes its own time (the key derivation): the wait starts after it, once the document is asked for again.
    await until(() => h.api.mock.calls.filter(([p]) => p === "/documents/A").length >= 2);
    await act(async () => { await vi.advanceTimersByTimeAsync(9_000); });
    expect(done).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(1_100); });
    await until(() => done !== null);
    expect(done).toBe(false);
    expect(run).not.toHaveBeenCalled();
    expect(toasts()).toEqual([E.insert_doc_closed]);
  }, 40_000);

  it("an insert waiting for locked document A never lands in document B, opened meanwhile", async () => {
    h.path = "/p/s1/lit/compare";
    h.me = { ...h.me, activeProjectId: null };
    await vaultApi(undefined, true);
    h.ask.mockResolvedValueOnce(null);
    await mount("s1");
    await until(() => shown() === "A:locked");
    // The passphrase prompt for the insert stays open while the student opens B.
    let typed!: (p: string | null) => void;
    h.ask.mockImplementationOnce(() => new Promise<string | null>((r) => { typed = r; }));
    const run = vi.fn();
    let done: boolean | null = null;
    act(() => { void ws().requestInsert(run).then((v) => { done = v; }); });
    await until(() => h.ask.mock.calls.length === 2);
    await act(async () => { await ws().selectDoc("B"); });
    await until(() => shown() === "B:open" && !!h.editor);
    await act(async () => { typed(PASS); });
    await until(() => done !== null);
    expect(done).toBe(false);
    expect(run).not.toHaveBeenCalled();
    expect(editor().getHTML()).toBe("<p>Mine.</p>");
    expect(toasts()).toEqual([E.insert_doc_closed]);
  }, 30_000);

  it("on the project's home, which shows no document, an insert takes the student to Writing and goes in there", async () => {
    plainApi();
    h.path = "/p/p1";
    await mount("p1");
    await until(() => !!h.editor);
    const run = vi.fn((e: Editor) => { e.commands.insertContent("<p>Ref.</p>"); });
    let ok!: boolean;
    await act(async () => { ok = await ws().requestInsert(run); });
    expect(h.push).toHaveBeenCalledWith("/p/p1/writing");
    expect(ok).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(toasts()).toEqual([]);
  });

  it("closing the document saves first; a failed save asks Close anyway?", async () => {
    plainApi();
    h.settings = { seenWelcome: true, docBeside: true };
    await mount("p1");
    await until(() => !!h.editor);
    expect(ws().docOpen).toBe(true);
    expect(frameDoc().hidden).toBe(false);

    // A save that succeeds: the document closes without a question.
    const flush = vi.fn(async () => true);
    act(() => { ws().registerFlush(flush); });
    let closed!: boolean;
    await act(async () => { closed = await ws().closeDocument(); });
    expect(flush).toHaveBeenCalledTimes(1);
    expect(closed).toBe(true);
    expect(ws().docOpen).toBe(false);
    expect(frameDoc().hidden).toBe(true);
    expect(h.update).toHaveBeenLastCalledWith({ docBeside: false });
    expect(document.querySelector('[data-testid="close-dialog"]')).toBeNull();

    // The last save failed: the student is asked; Stay keeps it open.
    act(() => { ws().openDocument(); });
    act(() => { ws().registerFlush(async () => false); });
    let first!: Promise<boolean>;
    await act(async () => { first = ws().closeDocument(); });
    await until(() => !!document.querySelector('[data-testid="close-dialog"]'));
    const dialog = document.querySelector('[data-testid="close-dialog"]')!;
    expect(dialog.textContent).toContain(E.doc_close_title);
    expect(dialog.textContent).toContain("Your last changes to D1 are not saved yet.");
    await act(async () => { (document.querySelector('[data-testid="close-stay"]') as HTMLButtonElement).click(); });
    expect(await first).toBe(false);
    expect(ws().docOpen).toBe(true);

    // Close anyway closes it.
    let second!: Promise<boolean>;
    await act(async () => { second = ws().closeDocument(); });
    await until(() => !!document.querySelector('[data-testid="close-anyway"]'));
    await act(async () => { (document.querySelector('[data-testid="close-anyway"]') as HTMLButtonElement).click(); });
    expect(await second).toBe(true);
    expect(ws().docOpen).toBe(false);
  });

  it("a pop-out's insert lands in the main window's document even when it is closed there", async () => {
    plainApi();
    await mount("p1");
    await until(() => !!h.editor);
    expect(ws().docOpen).toBe(false);
    act(() => { ch.deliver({ type: "insert", text: " (Bandura, 1977)" }); });
    await until(() => toasts().length > 0);
    expect(editor().getText()).toContain("(Bandura, 1977)");
    expect(toasts()).toEqual(["Citation inserted ✓"]);
    expect(ws().docOpen).toBe(true);
    expect(h.push).not.toHaveBeenCalled();
  });

  it("the place the student is in does not change when an AI suggestion arrives", async () => {
    plainApi();
    h.path = "/p/p1/idea";
    await mount("p1");
    await until(() => !!h.editor);
    expect(ws().docOpen).toBe(false);
    let token = 0;
    act(() => { token = sug().setThinking("custom", null, "Thinking this through"); });
    // A request alone does not open it: the answer (or an error) does.
    expect(ws().docOpen).toBe(false);
    act(() => { sug().set("The read.", null, token); });
    expect(sug().sug).toBe("The read.");
    // The suggestion shows in the AI pane beside the document, which opens beside the place: nothing navigates.
    expect(h.push).not.toHaveBeenCalled();
    expect(ws().place).toEqual({ stage: "idea", tab: null });
    expect(document.querySelector('[data-testid="place-content"]')).not.toBeNull();
    expect(ws().docOpen).toBe(true);
    // An error shown in the pane opens it too; Dismiss leaves the document open where it is.
    act(() => { sug().clear(); });
    expect(ws().docOpen).toBe(true);
    expect(h.push).not.toHaveBeenCalled();
  });

  it("the Writing place always shows the document; Open and Close beside apply to the other places", async () => {
    plainApi();
    h.path = "/p/p1/writing";
    await mount("p1");
    await until(() => !!h.editor);
    expect(ws().docOpen).toBe(false);
    expect(frameDoc().hidden).toBe(false);
    expect(frameDoc().classList.contains("beside")).toBe(false);
  });

  it("on a phone the document opens full screen over the place, and Back to {place} returns to the same place and tab (Task 14)", async () => {
    const was = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q === "(max-width: 700px)", media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    try {
      plainApi();
      await mount("p1");
      await until(() => !!h.editor);
      const place = () => document.querySelector<HTMLElement>(".frame-place")!;
      const back = () => document.querySelector<HTMLButtonElement>('[data-testid="doc-back"]');
      expect(back()).toBeNull();
      expect(place().hidden).toBe(false);
      await act(async () => { ws().openDocument(); });
      expect(frameDoc().hidden).toBe(false);
      expect(frameDoc().classList.contains("full")).toBe(true);
      // The place stays mounted, out of sight; no resize handle on a phone.
      expect(place().hidden).toBe(true);
      expect(document.querySelector('[data-testid="place-content"]')).not.toBeNull();
      expect(document.querySelector('[data-testid="doc-resize"]')).toBeNull();
      expect(back()!.textContent).toBe(E.doc_back!.replace("{place}", E.stage_name_lit!));
      await act(async () => { back()!.click(); });
      await until(() => !ws().docOpen);
      expect(frameDoc().hidden).toBe(true);
      expect(place().hidden).toBe(false);
      // The address never changed: the place is there on its tab.
      expect(h.push).not.toHaveBeenCalled();
    } finally { window.matchMedia = was; }
  });

  it("on a phone focus goes to Back when the document opens, and back to Open my document (or the place's first control) when it closes (Task 14)", async () => {
    const was = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q === "(max-width: 700px)", media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    const back = () => document.querySelector<HTMLButtonElement>('[data-testid="doc-back"]')!;
    const active = () => (document.activeElement as HTMLElement | null)?.dataset.testid;
    try {
      plainApi();
      await mount("p1", <div><a href="#x" data-testid="place-first">Tab</a><button type="button" data-testid="place-open-doc">Open</button></div>);
      await until(() => !!h.editor);
      const open = document.querySelector<HTMLButtonElement>('[data-testid="place-open-doc"]')!;
      open.focus();
      await act(async () => { ws().openDocument(); });
      expect(active()).toBe("doc-back");
      await act(async () => { back().click(); });
      await until(() => !ws().docOpen);
      expect(active()).toBe("place-open-doc");

      // A failed save and Stay: the document stays open, and focus stays where it was.
      await act(async () => { ws().openDocument(); });
      expect(active()).toBe("doc-back");
      act(() => { ws().registerFlush(async () => false); });
      await act(async () => { back().click(); });
      await until(() => !!document.querySelector('[data-testid="close-stay"]'));
      await act(async () => { (document.querySelector('[data-testid="close-stay"]') as HTMLButtonElement).click(); });
      expect(ws().docOpen).toBe(true);
      expect(active()).not.toBe("place-open-doc");
    } finally { window.matchMedia = was; }
  });

  it("on a phone without Open my document, closing the document focuses the place's first control (Task 14)", async () => {
    const was = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q === "(max-width: 700px)", media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    try {
      plainApi();
      await mount("p1", <div><p>Text</p><button type="button" disabled>Off</button><a href="#x" data-testid="place-first">Tab</a></div>);
      await until(() => !!h.editor);
      await act(async () => { ws().openDocument(); });
      expect((document.activeElement as HTMLElement).dataset.testid).toBe("doc-back");
      await act(async () => { document.querySelector<HTMLButtonElement>('[data-testid="doc-back"]')!.click(); });
      await until(() => !ws().docOpen);
      expect((document.activeElement as HTMLElement).dataset.testid).toBe("place-first");
    } finally { window.matchMedia = was; }
  });
});
