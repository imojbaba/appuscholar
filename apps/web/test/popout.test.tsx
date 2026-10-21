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
  editor: null as unknown,
  me: { id: "u1", activeProjectId: null as string | null, scratchProjectId: "scratch" },
}));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: h.me, settings: {}, update: vi.fn(), reload: vi.fn() }) }));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => ({ status: "off" }) }));
// The suggestion provider is real in the pop-out (its editor stays null); the probes read the editor this test gives.
vi.mock("@/lib/ai/suggestion", () => ({
  SuggestionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSuggestion: () => ({ editor: h.editor })
}));
vi.mock("@/lib/cite/useLibrary", async (orig) => ({ ...(await orig<typeof import("../lib/cite/useLibrary")>()), CiteLibraryProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/workspace/ChromeDialogs", () => ({ ChromeDialogs: () => <div data-testid="chrome-dialogs" /> }));
// The two pop-out panels and Analyse a paper, as stubs that show what the pop-out's workspace gives them.
vi.mock("@/components/tools/cite/CitePanel", async () => {
  const { useProject } = await import("@/components/frame/ProjectContext");
  return { CitePanel: () => { const ws = useProject(); return <div className="panel" data-testid="panel-cite">{ws.projectId}|{ws.documents.map((d) => d.id).join(",")}</div>; } };
});
vi.mock("@/components/tools/research/ResearchPanel", async () => {
  const { useProject } = await import("@/components/frame/ProjectContext");
  return { ResearchPanel: () => { const ws = useProject(); return <div className="panel" data-testid="panel-research">{ws.projectId}<button type="button" data-testid="go-analyse" onClick={() => ws.go("/p/x/lit/reading")} /></div>; } };
});
vi.mock("@/components/tools/analyse/AnalysePanel", () => ({ AnalysePanel: () => <div className="panel" data-testid="panel-analyse" /> }));

import { Popout } from "../components/popout/Popout";
import { CiteShare } from "../components/tools/cite/CiteShare";
import { citeUseLib, CITATION_INSERTED } from "../lib/cite/actions";
import type { Library } from "../lib/cite/useLibrary";
import { openPopout, setSyncChannel, useInsertTarget, useSyncReceiver, type InsertTarget } from "../lib/popout/sync";
import { markCursorPlaced } from "../lib/editor/insert";

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
const popoutAt = (tool: string) => window.history.replaceState(null, "", "/popout?tool=" + tool);

beforeEach(() => {
  h.toast.mockReset();
  h.api.mockReset();
  h.editor = null;
  h.me = { id: "u1", activeProjectId: null, scratchProjectId: "scratch" };
  ch = new FakeChannel();
  setSyncChannel(ch);
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  for (const e of editors.splice(0)) e.destroy();
  document.body.innerHTML = "";
  setSyncChannel(undefined);
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("openPopout (v1 popOutTool; its button returns with Task 13)", () => {
  it.each(["cite", "research"] as const)("%s opens its pop-out window", (tool) => {
    const open = vi.spyOn(window, "open").mockReturnValue({ focus: () => {} } as unknown as Window);
    openPopout(tool, t);
    expect(open).toHaveBeenCalledWith("/popout?tool=" + tool, "appu_pop_" + tool, "popup=yes,width=540,height=820");
    expect(toasts()).toEqual([]);
  });
  it("a blocked window says so", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    openPopout("cite", t);
    expect(toasts()).toEqual([E.pop_blocked]);
  });
  it.each(["idea", "chat", "analyse"] as const)("%s keeps v1's notice", (tool) => {
    const open = vi.spyOn(window, "open");
    openPopout(tool, t);
    expect(open).not.toHaveBeenCalled();
    expect(toasts()).toEqual([E.pop_unsupported]);
  });
});

describe("the pop-out page renders the tool alone", () => {
  const api = (projects: Array<{ id: string }> = []) => h.api.mockImplementation(async (path: string, init?: RequestInit) => {
    if (init?.method && init.method !== "GET") throw new Error("the pop-out wrote " + path);
    if (path === "/projects") return projects.map((p) => ({ title: "P", field: "", stage: "idea", status: "active", contentLang: "en", kind: "research", ...p }));
    if (/^\/projects\/[^/]+\/documents$/.test(path)) return [
      { id: "d2", projectId: "x", title: "B", kind: "own", currentSeq: 1, wordCount: 0, createdAt: "2026-10-02", updatedAt: "2026-10-02" },
      { id: "d1", projectId: "x", title: "A", kind: "own", currentSeq: 1, wordCount: 0, createdAt: "2026-10-01", updatedAt: "2026-10-03" }
    ];
    throw new Error("unexpected " + path);
  });

  it("cite: the Citation Manager in its panel, on the scratch project, with no sidebar, dock, document or editor; no document is created", async () => {
    popoutAt("cite");
    api();
    render(<Popout tool="cite" />);
    await until(() => !!tid("panel-cite"));
    expect(tid("panel-cite")!.textContent).toBe("scratch|d1,d2");
    expect(tid("popout")!.querySelectorAll(".panel")).toHaveLength(1);
    for (const sel of [".ws", ".dock", ".dock-tabs", ".ProseMirror", "[data-testid=pop-out]", "[data-testid=doc-card]", "nav"]) expect(document.body.querySelector(sel)).toBeNull();
    expect(h.api.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  });

  it("research: the Research panel, on the student's active project", async () => {
    popoutAt("research");
    h.me = { ...h.me, activeProjectId: "p1" };
    api([{ id: "p0" }, { id: "p1" }]);
    render(<Popout tool="research" />);
    await until(() => !!tid("panel-research"));
    expect(tid("panel-research")!.textContent).toBe("p1");
    expect(tid("panel-cite")).toBeNull();
  });

  it("going to the reading list from inside the pop-out switches the pop-out's tool to Analyse a paper (v1 showTool there, rsAnalyse 8417)", async () => {
    popoutAt("research");
    api();
    render(<Popout tool="research" />);
    await until(() => !!tid("go-analyse"));
    act(() => { tid("go-analyse")!.click(); });
    expect(tid("panel-analyse")).not.toBeNull();
    expect(tid("panel-research")).toBeNull();
  });

  it.each([undefined, "", "chat", "photo", "CITE"])("tool=%s says pop_unsupported and loads nothing", (tool) => {
    popoutAt(String(tool ?? ""));
    render(<Popout tool={tool} />);
    expect(tid("popout-unsupported")!.textContent).toBe(E.pop_unsupported);
    expect(tid("panel-cite")).toBeNull();
    expect(h.api).not.toHaveBeenCalled();
  });
});

describe("inserts: the pop-out sends them to the writing window", () => {
  const box: { t: InsertTarget | null } = { t: null };
  function Probe() { box.t = useInsertTarget(); return null; }

  it("in the pop-out every insert is ready (no editor here) and goes over appu_sync, with pop_sent", () => {
    popoutAt("cite");
    render(<Probe />);
    expect(box.t!.ready).toBe(true);
    expect(box.t!.citation(citFmt(BANDURA, 0, "apa"))).toBe(true);
    expect(box.t!.text("“A quote.” ")).toBe(true);
    expect(box.t!.block("<p>References</p>")).toBe(true);
    expect(ch.sent).toEqual([{ type: "insert", text: " (Bandura, 1977)" }, { type: "insert", text: "“A quote.” " }, { type: "insert", html: "<p>References</p>" }]);
    expect(toasts()).toEqual([E.pop_sent, E.pop_sent, E.pop_sent]);
  });

  it("AMA in the pop-out sends the number as [n] text, not a superscript (v1 7501: f.sup&&!POPOUT)", () => {
    popoutAt("cite");
    render(<Probe />);
    const f = citFmt(MILLER, 3, "ama");
    expect(f.sup).toBe(true);
    box.t!.citation(f);
    expect(ch.sent).toEqual([{ type: "insert", text: " [3]" }]);
  });

  it("a library card's Insert: pop_sent, then citUseLib's own toast over it, as v1 shows them one after the other", () => {
    popoutAt("cite");
    render(<Probe />);
    citeUseLib(0, { lib: [BANDURA], style: "apa", toast: h.toast, t, insert: (f) => { box.t!.citation(f); } });
    expect(ch.sent).toEqual([{ type: "insert", text: " (Bandura, 1977)" }]);
    expect(toasts()).toEqual([E.pop_sent, CITATION_INSERTED]);
  });

  it("a post that fails says pop_nowin", () => {
    popoutAt("cite");
    ch.throwOnPost = true;
    render(<Probe />);
    box.t!.citation(citFmt(BANDURA, 0, "apa"));
    expect(toasts()).toEqual([E.pop_nowin]);
  });

  it("Insert reference list is enabled in the pop-out and sends the list as one HTML block", () => {
    popoutAt("cite");
    const lib = { lib: [BANDURA], style: "apa", ready: true, update: () => true } as unknown as Library;
    render(<CiteShare library={lib} insertReady={true} />);
    const btn = tid("cite-insertbib") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    act(() => { btn.click(); });
    expect(ch.sent).toHaveLength(1);
    const m = ch.sent[0] as { type: string; html: string };
    expect(m.type).toBe("insert");
    expect(m.html).toContain("Bandura, A. (1977). <i>Social learning theory</i>. Prentice Hall.");
    expect(toasts()).toEqual([E.pop_sent, E.cite_bib_fmt]);
  });

  it("in the writing window the target is the editor: nothing is posted, and nothing is ready without a document", () => {
    render(<Probe />);
    expect(box.t!.ready).toBe(false);
    expect(box.t!.citation(citFmt(BANDURA, 0, "apa"))).toBe(false);
    const ed = new Editor({ extensions: editorExtensions, content: "<p>Learning is social.</p>" });
    editors.push(ed);
    h.editor = ed;
    render(<Probe />);
    expect(box.t!.ready).toBe(true);
    box.t!.citation(citFmt(BANDURA, 0, "apa"));
    expect(ed.getText()).toContain("(Bandura, 1977)");
    expect(ch.sent).toEqual([]);
    expect(toasts()).toEqual([]);
  });
});

describe("the writing window's receiver (v1 popChan.onmessage 7604-7611)", () => {
  function Receiver({ editor }: { editor: Editor | null }) { useSyncReceiver(editor); return null; }

  it("inserts a citation at the cursor and says Citation inserted ✓", () => {
    const ed = new Editor({ extensions: editorExtensions, content: "<p>Learning is social.</p>" });
    editors.push(ed);
    markCursorPlaced(ed);
    ed.commands.setTextSelection(1 + "Learning is social".length);
    render(<Receiver editor={ed} />);
    act(() => { ch.deliver({ type: "insert", text: " (Bandura, 1977)" }); });
    expect(ed.getHTML()).toBe("<p>Learning is social (Bandura, 1977).</p>");
    expect(toasts()).toEqual(["Citation inserted ✓"]);
  });

  it("with no cursor placed the text goes at the end on a new line (insertIntoEditor's placeCaretAtEnd)", () => {
    const ed = new Editor({ extensions: editorExtensions, content: "<p>Learning is social.</p>" });
    editors.push(ed);
    render(<Receiver editor={ed} />);
    act(() => { ch.deliver({ type: "insert", text: " [3]" }); });
    expect(ed.getHTML()).toBe("<p>Learning is social.<br> [3]</p>");
  });

  it("an HTML block (the reference list) goes in as markup", () => {
    const ed = new Editor({ extensions: editorExtensions, content: "<p>Body.</p>" });
    editors.push(ed);
    render(<Receiver editor={ed} />);
    act(() => { ch.deliver({ type: "insert", html: '<p><b>References</b></p><p>Bandura, A. (1977). <i>Social learning theory</i>.</p>' }); });
    expect(ed.getHTML()).toContain("<strong>References</strong>");
    expect(ed.getHTML()).toContain("<em>Social learning theory</em>");
    expect(toasts()).toEqual(["Citation inserted ✓"]);
  });

  it("ignores anything else, a missing editor, and messages while it is itself a pop-out", () => {
    const ed = new Editor({ extensions: editorExtensions, content: "<p>Body.</p>" });
    editors.push(ed);
    render(<Receiver editor={ed} />);
    act(() => { ch.deliver({ type: "other", text: "x" }); ch.deliver({ type: "insert", text: 5 }); ch.deliver(null); });
    expect(ed.getHTML()).toBe("<p>Body.</p>");
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    render(<Receiver editor={null} />);
    act(() => { ch.deliver({ type: "insert", text: "x" }); });
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    popoutAt("cite");
    render(<Receiver editor={ed} />);
    act(() => { ch.deliver({ type: "insert", text: "x" }); });
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
