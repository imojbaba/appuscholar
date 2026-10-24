// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { citFmt, type CitationEntry } from "@appuscholar/core";
import { editorExtensions } from "../lib/editorExtensions";
import en from "../messages/en.json";
import { FakeChannel } from "./support/fakeChannel";

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  api: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  path: "/",
  editor: null as unknown,
  ws: null as unknown,
  me: { id: "u1", activeProjectId: null as string | null, scratchProjectId: "scratch", termsAcceptedAt: "2999-01-01T00:00:00Z" },
  download: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push, replace: h.replace }), usePathname: () => h.path }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: h.me, settings: { seenWelcome: true }, update: vi.fn(), reload: vi.fn() }) }));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => ({ status: "off", known: async () => "off", ensureUnlocked: async () => true, decryptBody: async (d: { bodyHtml: string }) => d.bodyHtml }) }));
vi.mock("@/lib/export/download", async (orig) => ({ ...(await orig<typeof import("../lib/export/download")>()), downloadBlob: h.download }));
// The suggestion provider is real in the pop-out (its editor stays null); the probes read the editor this test gives.
vi.mock("@/lib/ai/suggestion", () => ({
  SuggestionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSuggestion: () => ({ editor: h.editor })
}));
vi.mock("@/lib/cite/useLibrary", async (orig) => ({ ...(await orig<typeof import("../lib/cite/useLibrary")>()), CiteLibraryProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
// The paper-id migration (wave B, Task 17) needs the real library provider; this file stands the provider in, and is about something else.
vi.mock("@/components/frame/PaperIdsRunner", () => ({ PaperIdsRunner: () => null }));
vi.mock("@/components/frame/FullTextRunner", () => ({ FullTextRunner: () => null }));
vi.mock("@/components/workspace/ChromeDialogs", () => ({ ChromeDialogs: () => <div data-testid="chrome-dialogs" /> }));
vi.mock("@/components/workspace/dialogs/ImportOrigin", () => ({ ImportOrigin: () => null }));
vi.mock("@/components/workspace/dialogs/MyWriting", () => ({ MyWriting: () => null }));
vi.mock("@/components/workspace/dialogs/ImportV1Dialog", () => ({ ImportV1Dialog: () => null }));
vi.mock("@/components/workspace/VaultPill", () => ({ VaultPill: () => <span data-testid="vault-pill" /> }));
vi.mock("@/components/frame/AppHeader", () => ({ AppHeader: () => <header data-testid="app-header"><span data-testid="switcher" /><span data-testid="account-menu" /></header> }));
vi.mock("@/components/tools/AiPane", () => ({ AiPane: () => <div data-testid="ai-pane" /> }));
// The document card, as a stub that says it is there (a pop-out must never mount it).
vi.mock("@/components/document/DocumentCard", () => ({ DocumentCard: () => <div data-testid="doc-card" /> }));

import { ProjectShell } from "../components/frame/ProjectShell";
import { PlaceHeader } from "../components/frame/PlaceHeader";
import { ProjectProvider, useProject, type ProjectValue } from "../components/frame/ProjectContext";
import OldPopoutPage from "../app/(app)/popout/page";
import { InsertReferenceList } from "../components/literature/CitationsTab";
import { NotBuilt } from "../components/places/NotBuilt";
import { ExportLink } from "../components/export/ExportLink";
import { EXPORT_PARTS } from "../lib/export/projectExport";
import { heldBlobs } from "../lib/blobs/held";
import { ApiError } from "../lib/api";
import { citeUseLib, CITATION_INSERTED } from "../lib/cite/actions";
import type { Library } from "../lib/cite/useLibrary";
import { blobWritable, isPopout, setSyncChannel, useInsertTarget, useSyncReceiver, type InsertTarget } from "../lib/popout/sync";
import { markCursorPlaced, putAiInDocument } from "../lib/editor/insert";

// Every tool module is pinned to its unbuilt stub (no Panel, no DocumentLayer), so a tool session's real module never adds its own reads or listeners here (session C, 2026-10-21).
vi.mock("@/components/tools/design", () => ({ built: false }));
vi.mock("@/components/tools/stats", () => ({ built: false }));
vi.mock("@/components/tools/qual", () => ({ built: false }));
vi.mock("@/components/tools/style", () => ({ built: false }));
vi.mock("@/components/tools/words", () => ({ built: false }));
vi.mock("@/components/tools/close", () => ({ built: false }));
vi.mock("@/components/tools/slides", () => ({ built: false }));
vi.mock("@/components/tools/viva", () => ({ built: false }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const E = en as Record<string, string>;
const t = (k: string) => E[k] ?? k;
const BANDURA: CitationEntry = { type: "Book", author: "Bandura, Albert", year: "1977", title: "Social learning theory", source: "Prentice Hall" };
const MILLER: CitationEntry = { type: "Journal article", author: "Miller, George A.", year: "1956", title: "The magical number seven", source: "Psychological Review", volume: "63", issue: "2", pages: "81-97" };

let ch: FakeChannel;
const roots: Root[] = [];
const editors: Editor[] = [];
const tid = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
function render(node: React.ReactNode) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  act(() => { root.render(node); });
}
async function until(pred: () => boolean) {
  for (let i = 0; i < 200; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); }
  throw new Error("condition not reached");
}
const toasts = () => h.toast.mock.calls.map((c) => c[0]);
/** The address of a place's own window (and the path the router reports). */
const at = (url: string) => { window.history.replaceState(null, "", url); h.path = url.split("?")[0]!; };
const popoutAt = (url = "/p/p1/lit/citations?window=1") => at(url);
/** The shell's requestInsert as these tests need it: the editor the test gives, run at once; false with none (the document did not open). */
const direct = (editor: Editor | null): ProjectValue["requestInsert"] => async (run) => { if (!editor || editor.isDestroyed) return false; run(editor); return true; };
/** A panel inside the project shell, whose requestInsert puts inserts into h.editor. */
const inShell = (node: React.ReactNode) => <ProjectProvider value={{ requestInsert: (run: (e: Editor) => void) => direct(h.editor as Editor | null)(run) } as unknown as ProjectValue}>{node}</ProjectProvider>;

beforeEach(() => {
  h.toast.mockReset();
  h.api.mockReset();
  h.push.mockReset();
  h.replace.mockReset();
  h.download.mockReset();
  h.editor = null;
  h.ws = null;
  h.me = { id: "u1", activeProjectId: null, scratchProjectId: "scratch", termsAcceptedAt: "2999-01-01T00:00:00Z" };
  ch = new FakeChannel();
  setSyncChannel(ch);
  at("/");
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  for (const e of editors.splice(0)) e.destroy();
  document.body.innerHTML = "";
  setSyncChannel(undefined);
  vi.restoreAllMocks();
  at("/");
});

describe("a place in its own window (register row D-S2-43)", () => {
  const P1 = { id: "p1", title: "Sleep and memory", titleKeyVersion: 0, deks: [], field: "", stage: "idea", status: "active", contentLang: "en", kind: "research", stageMarks: {} };
  const DOCS = [
    { id: "d2", projectId: "p1", title: "B", titleKeyVersion: 0, deks: [], kind: "own", currentSeq: 1, wordCount: 0, createdAt: "2026-10-02", updatedAt: "2026-10-02" },
    { id: "d1", projectId: "p1", title: "A", titleKeyVersion: 0, deks: [], kind: "own", currentSeq: 1, wordCount: 0, createdAt: "2026-10-01", updatedAt: "2026-10-03" }
  ];
  const api = (docs: unknown[] = DOCS) => h.api.mockImplementation(async (path: string, init?: RequestInit) => {
    if (init?.method && init.method !== "GET") throw new Error("the pop-out wrote " + path);
    if (path === "/projects") return [P1];
    if (path === "/projects/p1/documents") return docs;
    throw new Error("unexpected " + path);
  });
  function Child() { h.ws = useProject(); return <div data-testid="place-content" />; }
  const shell = () => <ProjectShell projectId="p1"><Child /></ProjectShell>;
  async function mountShell() {
    render(shell());
    await until(() => !!tid("place-content"));
  }
  const ws = () => h.ws as ProjectValue;

  it("a pop-out never shows the document", async () => {
    for (const url of ["/p/p1/lit/citations?window=1", "/p/p1/writing?window=1"]) {
      popoutAt(url);
      api();
      await mountShell();
      expect(tid("doc-card")).toBeNull();
      expect(tid("frame-doc")).toBeNull();
      expect(tid("ai-pane")).toBeNull();
      // Its documents are listed (Cited in) but none is opened: no body is read, and an empty project gets no first document from here.
      expect(ws().documents.map((d) => d.id)).toEqual(["d1", "d2"]);
      expect(ws().currentDoc).toBeNull();
      let shown: boolean | undefined;
      await act(async () => { shown = await ws().selectDoc("d1"); });
      expect(shown).toBe(false);
      expect(h.api.mock.calls.map(([p]) => p)).not.toContain("/documents/d1");
      expect(h.api.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
      act(() => { for (const r of roots.splice(0)) r.unmount(); });
      document.body.innerHTML = "";
      h.api.mockReset();
    }
    popoutAt("/p/p1/lit/find?window=1");
    api([]);
    await mountShell();
    expect(ws().documents).toEqual([]);
    expect(h.api.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  });

  it("a pop-out never shows Open my document, and opening the document there changes nothing", async () => {
    const openDocument = vi.fn();
    const value = { project: P1, projectId: "p1", docOpen: false, openDocument } as unknown as ProjectValue;
    const both = () => render(<ProjectProvider value={value}><PlaceHeader stage="lit" tab="compare" /><NotBuilt /></ProjectProvider>);
    // The writing window offers it, in the place's header and on a stage not built yet.
    at("/p/p1/lit/compare");
    both();
    expect(tid("place-open-doc")).not.toBeNull();
    expect(tid("not-built-open")).not.toBeNull();
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    popoutAt("/p/p1/lit/compare?window=1");
    both();
    expect(tid("place-header")).not.toBeNull();
    expect(tid("not-built")).not.toBeNull();
    expect(tid("place-open-doc")).toBeNull();
    expect(tid("not-built-open")).toBeNull();
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    // The shell's own openDocument does nothing there: no document beside the place, and no docBeside stored.
    api();
    await mountShell();
    act(() => { ws().openDocument(); });
    expect(ws().docOpen).toBe(false);
    expect(tid("frame-doc")).toBeNull();
    expect(h.api.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  });

  it("an insert from a pop-out goes over the channel to the writing window, at once, never into an editor here", async () => {
    popoutAt("/p/p1/idea?window=1");
    api();
    await mountShell();
    const run = vi.fn();
    let ok!: boolean;
    await act(async () => { ok = await ws().requestInsert(run, { type: "insert", text: " (Bandura, 1977)" }); });
    expect(ok).toBe(true);
    expect(run).not.toHaveBeenCalled();
    // "Put in my document" (putAiInDocument) the same way: the AI text as it is, for the writing window to mark.
    await act(async () => { ok = await putAiInDocument(ws().requestInsert, "A read of the idea."); });
    expect(ok).toBe(true);
    expect(ch.sent).toEqual([{ type: "insert", text: " (Bandura, 1977)" }, { type: "insert", ai: "A read of the idea." }]);
    expect(toasts()).toEqual([E.pop_sent, E.pop_sent]);
    // Nothing to send: nothing goes in, and the student is told.
    await act(async () => { ok = await ws().requestInsert(run); });
    expect(ok).toBe(false);
    expect(ch.sent).toHaveLength(2);
    expect(toasts()).toEqual([E.pop_sent, E.pop_sent, E.insert_doc_closed]);
    expect(ws().docOpen).toBe(false);
  });

  it("the window shows the place under a slim header: the project and the place, and Close; no project switcher or account menu", async () => {
    popoutAt("/p/p1/lit/citations?window=1");
    api();
    await mountShell();
    expect(tid("app-header")).toBeNull();
    expect(tid("switcher")).toBeNull();
    expect(tid("account-menu")).toBeNull();
    expect(tid("window-where")!.textContent).toBe("Sleep and memory / " + E.stage_name_lit);
    expect(tid("vault-pill")).not.toBeNull();
    const close = vi.spyOn(window, "close").mockImplementation(() => {});
    act(() => { tid("window-close")!.click(); });
    expect(close).toHaveBeenCalledTimes(1);
    expect(tid("window-close")!.textContent).toBe(E.window_close);
  });

  it("a tool's Export link in a pop-out opens the export place there, over the window's project, and the export only reads", async () => {
    popoutAt("/p/p1/lit/citations?window=1");
    const LIB = [{ author: "Bandura, Albert", year: "1977", title: "Self-efficacy", source: "Psychological Review", type: "Journal article" }];
    h.api.mockImplementation(async (path: string, init?: RequestInit) => {
      // The download's one audit row is the only call that is not a read.
      if (path === "/me/export-audit" && init?.method === "POST") return undefined;
      if (init?.method && init.method !== "GET") throw new Error("the pop-out wrote " + path);
      if (path === "/projects") return [P1];
      if (path === "/projects/p1/documents") return DOCS;
      if (path === "/projects/p1/blobs/citations") return { kind: "citations", body: JSON.stringify(LIB), keyVersion: 0, deks: [], updatedAt: "2026-10-21T00:00:00Z", version: 1 };
      if (path.startsWith("/projects/p1/blobs/")) throw new ApiError(404, "not-found");
      throw new Error("unexpected " + path);
    });
    // A value held from a panel that went away: the writing window would send it before the zip; a pop-out leaves it alone.
    const sent = vi.fn(async () => []);
    heldBlobs.put("held-elsewhere", [{ value: 1 }], sent);
    render(<ProjectShell projectId="p1"><ExportLink part="citations" testId="cite-export" /></ProjectShell>);
    await until(() => !!tid("cite-export"));
    await act(async () => { tid("cite-export")!.click(); });
    await until(() => !!tid("export-dialog"));
    expect(EXPORT_PARTS.filter((p) => (tid("exp-part-" + p) as HTMLInputElement | null)?.checked)).toEqual(["citations"]);
    expect(document.querySelector("#exp-h")!.textContent).toBe("Export: Sleep and memory");
    await act(async () => { tid("exp-download")!.click(); });
    await until(() => h.download.mock.calls.length === 1);
    expect(h.download.mock.calls[0]![0]).toMatch(/^appuscholar-Sleep and memory-\d{4}-\d{2}-\d{2}\.zip$/);
    expect(sent).not.toHaveBeenCalled();
    const writes = h.api.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method && (init as RequestInit).method !== "GET").map(([p]) => p);
    expect(writes).toEqual(["/me/export-audit"]);
    // What is still held is not in the zip, and the dialog says so.
    await until(() => !!tid("exp-unsaved"));
    expect(tid("exp-unsaved")!.textContent).toBe(E.exp_unsaved);
    heldBlobs.clear();
  });

  it("a move inside the window stays in the window: go keeps ?window=1, and an address that lost it gets it back", async () => {
    popoutAt("/p/p1/lit/citations?window=1");
    api();
    await mountShell();
    await act(async () => { await ws().go("/p/p1/lit/reading"); });
    expect(h.push).toHaveBeenLastCalledWith("/p/p1/lit/reading?window=1");
    // A tab's link moved the window without the query: it is still a pop-out, and its address gets ?window=1 back.
    at("/p/p1/lit/find");
    expect(isPopout()).toBe(true);
    expect(blobWritable("idea_intake")).toBe(false);
    act(() => { roots[0]!.render(shell()); });
    await until(() => window.location.search === "?window=1");
    expect(window.location.pathname).toBe("/p/p1/lit/find");
  });

  it("the writing window is not a pop-out: the header, the document and the receiver are there", async () => {
    at("/p/p1/lit/find");
    h.api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/projects") return [P1];
      if (path === "/projects/p1/documents") return DOCS;
      if (path === "/documents/d2") return { ...DOCS[0], keyVersion: 0, bodyHtml: "<p>x</p>" };
      if (path === "/me/active-project" && init?.method === "PATCH") return undefined;
      throw new Error("unexpected " + path);
    });
    await mountShell();
    await until(() => !!tid("doc-card"));
    expect(tid("app-header")).not.toBeNull();
    expect(tid("window-where")).toBeNull();
    // The insert receiver, and the tools' document access answering a pop-out (Task G4, lib/editor/docAccess).
    expect(ch.listening).toBe(2);
  });

  it("Open in a new window opens the place with ?window=1; a pop-out and the Writing place have none", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue({ focus: () => {} } as unknown as Window);
    const value = { project: P1, projectId: "p1" } as unknown as ProjectValue;
    const header = (stage: "lit" | "idea" | "writing", tab: string | null) => render(<ProjectProvider value={value}><PlaceHeader stage={stage} tab={tab} /></ProjectProvider>);
    at("/p/p1/lit/compare");
    header("lit", "compare");
    expect(tid("place-new-window")!.textContent).toBe(E.place_new_window);
    act(() => { tid("place-new-window")!.click(); });
    expect(open).toHaveBeenCalledWith("/p/p1/lit/compare?window=1", "appu_pop_lit", "popup=yes,width=540,height=820");
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    header("idea", null);
    act(() => { tid("place-new-window")!.click(); });
    expect(open).toHaveBeenLastCalledWith("/p/p1/idea?window=1", "appu_pop_idea", "popup=yes,width=540,height=820");
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    header("writing", null);
    expect(tid("place-new-window")).toBeNull();
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    popoutAt("/p/p1/lit/compare?window=1");
    header("lit", "compare");
    expect(tid("place-header")).not.toBeNull();
    expect(tid("place-new-window")).toBeNull();
  });

  it("old pop-out links land on the matching tab in a new-window place", async () => {
    h.me = { ...h.me, activeProjectId: "p1" };
    at("/popout?tool=cite");
    render(<OldPopoutPage />);
    await until(() => h.replace.mock.calls.length > 0);
    expect(h.replace).toHaveBeenLastCalledWith("/p/p1/lit/citations?window=1");
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    // No active project: the scratch space's.
    h.me = { ...h.me, activeProjectId: null };
    at("/popout?tool=research");
    render(<OldPopoutPage />);
    await until(() => h.replace.mock.calls.length > 1);
    expect(h.replace).toHaveBeenLastCalledWith("/p/scratch/lit/find?window=1");
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    at("/popout?tool=chat");
    render(<OldPopoutPage />);
    await until(() => h.replace.mock.calls.length > 2);
    expect(h.replace).toHaveBeenLastCalledWith("/projects");
    expect(h.api).not.toHaveBeenCalled();
  });
});

describe("inserts: the pop-out sends them to the writing window", () => {
  const box: { t: InsertTarget | null } = { t: null };
  function Inner() { box.t = useInsertTarget(); return null; }
  const Probe = () => inShell(<Inner />);

  it("in the pop-out every insert goes over appu_sync (no editor here), with pop_sent", async () => {
    popoutAt();
    render(<Probe />);
    await expect(box.t!.citation(citFmt(BANDURA, 0, "apa"))).resolves.toBe(true);
    await expect(box.t!.text("“A quote.” ")).resolves.toBe(true);
    await expect(box.t!.block("<p>References</p>")).resolves.toBe(true);
    expect(ch.sent).toEqual([{ type: "insert", text: " (Bandura, 1977)" }, { type: "insert", text: "“A quote.” " }, { type: "insert", html: "<p>References</p>" }]);
    expect(toasts()).toEqual([E.pop_sent, E.pop_sent, E.pop_sent]);
  });

  it("AMA in the pop-out sends the number as [n] text, not a superscript (v1 7501: f.sup&&!POPOUT)", () => {
    popoutAt();
    render(<Probe />);
    const f = citFmt(MILLER, 3, "ama");
    expect(f.sup).toBe(true);
    void box.t!.citation(f);
    expect(ch.sent).toEqual([{ type: "insert", text: " [3]" }]);
  });

  it("a library card's Insert: pop_sent, then citUseLib's own toast over it, as v1 shows them one after the other", async () => {
    popoutAt();
    render(<Probe />);
    await citeUseLib(0, { lib: [BANDURA], style: "apa", toast: h.toast, t, insert: (f) => box.t!.citation(f) });
    expect(ch.sent).toEqual([{ type: "insert", text: " (Bandura, 1977)" }]);
    expect(toasts()).toEqual([E.pop_sent, CITATION_INSERTED]);
  });

  it("a post that fails says pop_nowin", () => {
    popoutAt();
    ch.throwOnPost = true;
    render(<Probe />);
    void box.t!.citation(citFmt(BANDURA, 0, "apa"));
    expect(toasts()).toEqual([E.pop_nowin]);
  });

  it("Insert reference list is enabled in the pop-out and sends the list as one HTML block", async () => {
    popoutAt();
    const lib = { lib: [BANDURA], style: "apa", ready: true, update: () => true } as unknown as Library;
    render(inShell(<InsertReferenceList library={lib} />));
    const btn = tid("cite-insertbib") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    act(() => { btn.click(); });
    await until(() => toasts().length === 2);
    expect(ch.sent).toHaveLength(1);
    const m = ch.sent[0] as { type: string; html: string };
    expect(m.type).toBe("insert");
    expect(m.html).toContain("Bandura, A. (1977). <i>Social learning theory</i>. Prentice Hall.");
    expect(toasts()).toEqual([E.pop_sent, E.cite_bib_fmt]);
  });

  it("in the writing window the inserts go through the shell's requestInsert into the editor: nothing is posted, and false when the document did not open", async () => {
    render(<Probe />);
    await expect(box.t!.citation(citFmt(BANDURA, 0, "apa"))).resolves.toBe(false);
    const ed = new Editor({ extensions: editorExtensions, content: "<p>Learning is social.</p>" });
    editors.push(ed);
    h.editor = ed;
    render(<Probe />);
    await expect(box.t!.citation(citFmt(BANDURA, 0, "apa"))).resolves.toBe(true);
    expect(ed.getText()).toContain("(Bandura, 1977)");
    expect(ch.sent).toEqual([]);
    expect(toasts()).toEqual([]);
  });
});

describe("the writing window's receiver (v1 popChan.onmessage 7604-7611)", () => {
  function Receiver({ editor }: { editor: Editor | null }) { useSyncReceiver(direct(editor)); return null; }
  /** The receiver's insert answers after a microtask: the toast follows it. */
  const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

  it("inserts a citation at the cursor and says Citation inserted ✓", async () => {
    const ed = new Editor({ extensions: editorExtensions, content: "<p>Learning is social.</p>" });
    editors.push(ed);
    markCursorPlaced(ed);
    ed.commands.setTextSelection(1 + "Learning is social".length);
    render(<Receiver editor={ed} />);
    act(() => { ch.deliver({ type: "insert", text: " (Bandura, 1977)" }); });
    await settle();
    expect(ed.getHTML()).toBe("<p>Learning is social (Bandura, 1977).</p>");
    expect(toasts()).toEqual(["Citation inserted ✓"]);
  });

  it("with no cursor placed the text goes at the end on a new line (insertIntoEditor's placeCaretAtEnd)", async () => {
    const ed = new Editor({ extensions: editorExtensions, content: "<p>Learning is social.</p>" });
    editors.push(ed);
    render(<Receiver editor={ed} />);
    act(() => { ch.deliver({ type: "insert", text: " [3]" }); });
    await settle();
    expect(ed.getHTML()).toBe("<p>Learning is social.<br> [3]</p>");
  });

  it("AI text from a pop-out's Put in my document goes in at the end, marked as AI text", async () => {
    const ed = new Editor({ extensions: editorExtensions, content: "<p>Body.</p>" });
    editors.push(ed);
    render(<Receiver editor={ed} />);
    act(() => { ch.deliver({ type: "insert", ai: "A <read>." }); });
    await settle();
    expect(ed.getHTML()).toMatch(/^<p>Body\.<\/p><p><span class="ai-ins" data-h="[^"]+">A &lt;read&gt;\.<\/span><\/p>$/);
    expect(toasts()).toEqual([E.idea_inserted]);
  });

  it("an HTML block (the reference list) goes in as markup", async () => {
    const ed = new Editor({ extensions: editorExtensions, content: "<p>Body.</p>" });
    editors.push(ed);
    render(<Receiver editor={ed} />);
    act(() => { ch.deliver({ type: "insert", html: '<p><b>References</b></p><p>Bandura, A. (1977). <i>Social learning theory</i>.</p>' }); });
    await settle();
    expect(ed.getHTML()).toContain("<strong>References</strong>");
    expect(ed.getHTML()).toContain("<em>Social learning theory</em>");
    expect(toasts()).toEqual(["Citation inserted ✓"]);
  });

  it("ignores anything else, a missing editor, and messages while it is itself a pop-out", async () => {
    const ed = new Editor({ extensions: editorExtensions, content: "<p>Body.</p>" });
    editors.push(ed);
    render(<Receiver editor={ed} />);
    act(() => { ch.deliver({ type: "other", text: "x" }); ch.deliver({ type: "insert", text: 5 }); ch.deliver(null); });
    expect(ed.getHTML()).toBe("<p>Body.</p>");
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    render(<Receiver editor={null} />);
    act(() => { ch.deliver({ type: "insert", text: "x" }); });
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    popoutAt();
    render(<Receiver editor={ed} />);
    act(() => { ch.deliver({ type: "insert", text: "x" }); });
    await settle();
    expect(ed.getHTML()).toBe("<p>Body.</p>");
    expect(toasts()).toEqual([]);
  });

  it("stops listening when it unmounts", () => {
    const ed = new Editor({ extensions: editorExtensions, content: "<p>Body.</p>" });
    editors.push(ed);
    render(<Receiver editor={ed} />);
    expect(ch.listening).toBe(1);
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    expect(ch.listening).toBe(0);
  });
});
