// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AP_SAMPLE } from "@appuscholar/core";
import en from "../messages/en.json";

/*
 * The places of wave B Task 10: Literature with its four tabs (each a link, with the kept counts) and its suggested next line, Writing with Chat and
 * Research helpers beside the document, and the stages not built yet. Walk fault W23: nothing that is not built is offered in any place. The tools'
 * panels are stubs, except Analyse a paper (its lectures and lesson are under test) and the shelf shown inline.
 */

const h = vi.hoisted(() => ({
  go: vi.fn(async (_href: string) => true),
  openDocument: vi.fn(),
  docOpen: false,
  toast: vi.fn(),
  shelfIndex: null as null | Array<{ id: string }>,
  lib: [] as unknown[],
  libLoading: false
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/p/p1" }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", scratchProjectId: "s1" }, settings: { field: "psychology" } }) }));
vi.mock("@/lib/vault/titles", () => ({ useTitle: () => ({ state: "open", text: "Sleep and exam anxiety" }) }));
vi.mock("@/components/frame/ProjectContext", () => ({
  useProject: () => ({ project: { id: "p1", title: "Sleep and exam anxiety", titleKeyVersion: 0 }, projectId: "p1", go: h.go, pendingAnalyse: null, setPendingAnalyse: () => {},
    docOpen: h.docOpen, openDocument: h.openDocument, requestInsert: async () => false })
}));
vi.mock("@/lib/shelf/useShelf", () => ({
  useShelf: () => ({ projectId: "p1", index: h.shelfIndex, loading: false, locked: false, broken: false, error: false, loadPaper: async () => null }),
  useShelfStore: () => ({
    projectId: "p1", index: { value: h.shelfIndex, loading: false, locked: false }, cols: { value: null, loading: false, locked: false }, papers: new Map(), items: [], ops: {}, setCols: () => true
  })
}));
vi.mock("@/lib/cite/useLibrary", () => ({ useLibrary: () => ({ lib: h.lib, loading: h.libLoading, locked: false }) }));
vi.mock("@/lib/blobs/useProjectBlob", () => ({ useProjectBlob: () => ({ value: null, loading: false, locked: false, set: () => {}, flush: async () => true }) }));
vi.mock("@/lib/ai/useCallAI", () => ({ useCallAI: () => vi.fn() }));
vi.mock("@/lib/ai/suggestion", () => ({ useSuggestion: () => ({ editor: null }) }));
vi.mock("@/lib/research/oaKey", () => ({ useOpenAlexKey: () => null }));
vi.mock("@/components/places/IdeaPlace", () => ({ IdeaPlace: () => <div data-testid="panel-idea" /> }));
vi.mock("@/components/tools/research/ResearchPanel", () => ({ ResearchPanel: () => <div data-testid="panel-research" /> }));
vi.mock("@/components/tools/cite/CitePanel", () => ({ CitePanel: () => <div data-testid="panel-cite" /> }));
vi.mock("@/components/tools/analyse/Across", () => ({ Across: () => <div data-testid="ap-across" /> }));
vi.mock("@/components/tools/ChatPanel", () => ({ useChatLog: () => ({ log: [], ask: () => {} }), ChatPanel: () => <div data-testid="chat-panel" /> }));
vi.mock("@/components/tools/HelpersPanel", () => ({ HelpersPanel: () => <div data-testid="panel-psych" /> }));

import { StagePlace } from "../components/frame/StagePlace";
import { loadPaper } from "../lib/analyse/intake";
import { resetAp } from "../lib/analyse/useApDoc";
import { STAGE_ORDER, type StageKey } from "../lib/tools";
import { PLACE_TABS } from "../lib/frame/places";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = en as Record<string, string>;
const roots: Root[] = [];
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel);
const tid = (id: string) => $(`[data-testid="${id}"]`);
async function mount(stage: StageKey, tab: string | null = null) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(<StagePlace stage={stage} tab={tab} />); });
}
function unmountAll() { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; }

beforeEach(() => {
  resetAp();
  h.go.mockClear(); h.toast.mockReset(); h.openDocument.mockClear(); h.docOpen = false;
  h.shelfIndex = [{ id: "a" }, { id: "b" }];
  h.lib = [{}, {}, {}];
  h.libLoading = false;
});
afterEach(unmountAll);

const NEXT: Record<string, string> = {
  find: "Next: open your reading list and read a paper you kept.",
  reading: "Next: compare the papers you have read.",
  compare: "Next: find the gap your papers leave open, then write.",
  citations: "Next: put your reference list in your document."
};

describe("Literature (Task 10)", () => {
  it("Literature has four tabs in the order Find, Reading list, Compare, Citations", async () => {
    await mount("lit", "reading");
    const list = $('[role="tablist"]')!;
    const tabs = [...list.querySelectorAll<HTMLAnchorElement>('[role="tab"]')];
    // Reading list counts the shelf's papers, Citations the library's entries.
    expect(tabs.map((a) => a.textContent)).toEqual(["Find", "Reading list (2)", "Compare", "Citations (3)"]);
    expect(tabs.every((a) => a.tagName === "A")).toBe(true);
    expect(tabs.map((a) => a.getAttribute("href"))).toEqual(["/p/p1/lit/find", "/p/p1/lit/reading", "/p/p1/lit/compare", "/p/p1/lit/citations"]);
    expect(tabs.map((a) => a.getAttribute("aria-selected"))).toEqual(["false", "true", "false", "false"]);
    expect(list.getAttribute("aria-label")).toBe("Literature");
    unmountAll();
    // A count not known yet (the shelf or the library still being read) is left out.
    h.shelfIndex = null; h.libLoading = true;
    await mount("lit", "find");
    expect([...document.querySelectorAll('[role="tab"]')].map((a) => a.textContent)).toEqual(["Find", "Reading list", "Compare", "Citations"]);
  });

  it("each Literature tab ends with its suggested next line", async () => {
    const content: Record<string, string[]> = {
      find: ["panel-research"],
      reading: ["sh-body", "read-a-paper", "panel-analyse"],
      compare: ["shelf-matrix", "ap-across"],
      citations: ["panel-cite"]
    };
    for (const tab of PLACE_TABS.lit) {
      await mount("lit", tab);
      const body = tid("place-lit-" + tab)!;
      const parts = [...content[tab]!.map((x) => body.querySelector(`[data-testid="${x}"]`)), tid("lit-next")];
      for (const p of parts) expect(p, tab).not.toBeNull();
      // The tab's content in order, then the line, last in the place.
      for (let i = 1; i < parts.length; i++) expect(parts[i - 1]!.compareDocumentPosition(parts[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(body.lastElementChild).toBe(tid("lit-next"));
      expect(tid("lit-next")!.textContent).toBe(NEXT[tab]);
      expect(tid("lit-next")!.getAttribute("aria-label")).toBe("Suggested next");
      unmountAll();
    }
  });

  it("the Reading list shows the shelf inline, not as a dialog, with Analyse a paper under Read a paper", async () => {
    await mount("lit", "reading");
    expect($('[role="dialog"]')).toBeNull();
    expect(tid("shelf-dialog")).toBeNull();
    expect(tid("sh-close")).toBeNull();
    expect(tid("sh-tab-papers")).not.toBeNull();
    expect(tid("read-a-paper")!.textContent).toBe("Read a paper");
  });
});

describe("Writing and the stages not built (Task 10)", () => {
  it("Writing has Chat and Research helpers above the document", async () => {
    await mount("writing");
    const aside = tid("writing-aside")!;
    expect(aside.tagName).toBe("ASIDE");
    // Both are entry points again (Task 6 had removed them with the dock); each opens on demand.
    const summaries = [...aside.querySelectorAll("summary")].map((s) => s.textContent);
    expect(summaries).toEqual(["Chat", "Research helpers"]);
    for (const d of aside.querySelectorAll("details")) act(() => { d.open = true; d.dispatchEvent(new Event("toggle")); });
    expect(aside.querySelector('[data-testid="chat-panel"]')).not.toBeNull();
    expect(aside.querySelector('[data-testid="panel-psych"]')).not.toBeNull();
  });

  it("Design and ethics says Not built yet and offers the document", async () => {
    for (const stage of ["design", "collect", "review"] as const) {
      await mount(stage);
      expect(tid("not-built")!.textContent).toBe("Not built yet. The tools for this stage come in a later release. You can plan it in your document now.");
      const open = tid("not-built-open")!;
      expect(open.textContent).toBe("Open my document");
      await act(async () => { open.click(); });
      // The document opens beside this place (Task 11): the place stays.
      unmountAll();
    }
    expect(h.openDocument).toHaveBeenCalledTimes(3);
    expect(h.go).not.toHaveBeenCalled();
  });

  it("every place but Writing offers Open my document in its header while the document is closed (Task 11)", async () => {
    for (const stage of ["idea", "lit", "design", "collect", "review"] as const) {
      await mount(stage);
      const open = tid("place-open-doc")!;
      expect(open.textContent).toBe(E.place_open_doc);
      await act(async () => { open.click(); });
      unmountAll();
    }
    expect(h.openDocument).toHaveBeenCalledTimes(5);
    await mount("writing");
    expect(tid("place-open-doc")).toBeNull();
    unmountAll();
    h.docOpen = true;
    await mount("design");
    expect(tid("place-open-doc")).toBeNull();
  });

  it("no lecture, lesson, backup or stub tool is rendered in any place (W23)", async () => {
    // The practice paper is open, so Analyse a paper shows its mode tabs (v1 offered the lesson for the practice paper only).
    const sample = AP_SAMPLE[0]!.split("\n")[0]!;
    act(() => { expect(loadPaper(sample, [...AP_SAMPLE], "pdf", true, { toast: () => {}, t: (k: string) => E[k] ?? k })).toBe(true); });
    const stubs = ["style", "words", "design", "stats", "qual", "close", "slides"];
    const banned = [E.ap2_lib_open_btn!, E.ap2_lesson_on_this_paper!, E.ap2_short_talks_on_reading!, E.backup_btn!, "All lectures", "Lesson on this paper", "arrive in a later phase", "This tool arrives in a later phase"];
    const places: Array<[StageKey, string | null]> = STAGE_ORDER.flatMap((s) => (PLACE_TABS[s].length ? PLACE_TABS[s].map((x) => [s, x] as [StageKey, string]) : [[s, null] as [StageKey, null]]));
    expect(places).toHaveLength(9);
    for (const [stage, tab] of places) {
      await mount(stage, tab);
      for (const d of document.querySelectorAll("details")) act(() => { d.open = true; d.dispatchEvent(new Event("toggle")); });
      const where = stage + "/" + tab;
      expect(tid("ap-lectures"), where).toBeNull();
      expect(tid("ap-tab-lesson"), where).toBeNull();
      expect(tid("backup-btn"), where).toBeNull();
      for (const s of stubs) expect(tid("panel-" + s), where).toBeNull();
      for (const b of banned) expect(document.body.textContent, where).not.toContain(b);
      unmountAll();
    }
    // The reading list did draw Analyse a paper's mode tabs, without the lesson.
    await mount("lit", "reading");
    expect(tid("ap-tabs")).not.toBeNull();
    expect(tid("ap-tab-card")).not.toBeNull();
  });
});
