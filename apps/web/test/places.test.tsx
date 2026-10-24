// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AP_SAMPLE } from "@appuscholar/core";
import en from "../messages/en.json";

/*
 * The places of wave B Task 10: Literature with its four tabs (each a link, with the kept counts) and its suggested next line, Writing with Chat and
 * Research helpers beside the document, and the stages not built yet. Walk fault W23: nothing that is not built is offered in any place. The tools'
 * panels are stubs, except Analyse a paper (its lectures and lesson are under test) and the shelf shown inline. Task G2: the stage 3 to 6 places and
 * Writing's My style and Words tabs, from the tool registry, with no tool module built (test/toolRegistry.test.tsx turns one on).
 */

const h = vi.hoisted(() => ({
  go: vi.fn(async (_href: string) => true),
  openDocument: vi.fn(),
  docOpen: false,
  toast: vi.fn(),
  shelfIndex: null as null | Array<{ id: string }>,
  lib: [] as unknown[],
  libLoading: false,
  paperIds: undefined as undefined | string,
  /** The notes store the Reading tab gave the list, and the one it gave the reader, and the paper the reader was opened on (Task 21a fix round, Task 27). */
  readingNotes: undefined as unknown,
  readerNotes: undefined as unknown,
  readerPid: undefined as unknown
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/p/p1", useSearchParams: () => new URLSearchParams("") }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", scratchProjectId: "s1" }, settings: { field: "psychology" } }) }));
vi.mock("@/lib/vault/titles", () => ({ useTitle: () => ({ state: "open", text: "Sleep and exam anxiety" }) }));
vi.mock("@/components/frame/ProjectContext", () => ({
  useProject: () => ({ project: { id: "p1", title: "Sleep and exam anxiety", titleKeyVersion: 0 }, projectId: "p1", go: h.go,
    docOpen: h.docOpen, openDocument: h.openDocument, requestInsert: async () => false, paperIds: h.paperIds })
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
vi.mock("@/components/literature/FindTab", () => ({ FindTab: () => <div data-testid="panel-find" /> }));
vi.mock("@/components/literature/ReadingList", () => ({ ReadingList: (p: { notes?: unknown }) => { h.readingNotes = p.notes; return <div data-testid="reading-list" />; } }));
// The reader, seen through the paper and the store the tab gives it: the real one on the practice paper (it needs no stored data), a stub on a kept paper (the reader's own tests are test/reader.test.tsx).
vi.mock("@/components/reader/Reader", async (orig) => {
  const m = await orig<typeof import("../components/reader/Reader")>();
  return { ...m, Reader: (p: { pid: string; notes?: unknown }) => { h.readerPid = p.pid; h.readerNotes = p.notes; return p.pid === "sample" ? <m.Reader {...(p as never)} /> : <div data-testid="reader-stub" />; } };
});
vi.mock("@/components/literature/CitationsTab", () => ({ CitationsTab: () => <div data-testid="panel-citations" /> }));
vi.mock("@/components/literature/CompareTab", () => ({ CompareTab: () => <div data-testid="compare-tab" /> }));
vi.mock("@/components/tools/ChatPanel", () => ({ useChatLog: () => ({ log: [], ask: () => {} }), ChatPanel: () => <div data-testid="chat-panel" /> }));
vi.mock("@/components/tools/HelpersPanel", () => ({ HelpersPanel: () => <div data-testid="panel-psych" /> }));

import { StagePlace } from "../components/frame/StagePlace";
import { resetAp } from "../lib/analyse/useApDoc";
import { STAGE_ORDER, type StageKey } from "../lib/tools";
import { PLACE_TABS, parsePlace } from "../lib/frame/places";
import { TOOL_TABS } from "../lib/tools/registry";

// Every tool module this file does not turn on is pinned to its unbuilt stub, so a tool session turning its own module on never changes
// what this file sees (session C, 2026-10-21).
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
const roots: Root[] = [];
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel);
const tid = (id: string) => $(`[data-testid="${id}"]`);
async function mount(stage: StageKey, tab: string | null = null, paper?: string) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(<StagePlace stage={stage} tab={tab} paper={paper} />); });
}
function unmountAll() { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; }

beforeEach(() => {
  resetAp();
  h.go.mockClear(); h.toast.mockReset(); h.openDocument.mockClear(); h.docOpen = false;
  // Four kept papers: the library's k1 (with a PDF) and k2, and two PDFs no kept paper took; k3 is in the library only (rl false) and is not on the reading list.
  h.shelfIndex = [{ id: "a", pid: "k1" }, { id: "b", pid: "k8" }, { id: "c", pid: "k9" }];
  h.lib = [{ pid: "k1" }, { pid: "k2" }, { pid: "k3", rl: false }];
  h.libLoading = false;
  h.paperIds = undefined;
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
    // Reading list counts the kept papers (ruling B2-R23: papersOf), Citations the library's entries.
    expect(tabs.map((a) => a.textContent)).toEqual(["Find", "Reading list (4)", "Compare", "Citations (3)"]);
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
      find: ["panel-find"],
      reading: ["reading-list"],
      compare: ["compare-tab"],
      citations: ["panel-citations"]
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

  it("the Reading list is the page's own list, not a dialog, and Analyse a paper is not under it any more", async () => {
    await mount("lit", "reading");
    expect($('[role="dialog"]')).toBeNull();
    expect(tid("shelf-dialog")).toBeNull();
    expect(tid("reading-list")).not.toBeNull();
    expect(tid("read-a-paper")).toBeNull();
    expect(tid("panel-analyse")).toBeNull();
    expect(tid("reader")).toBeNull();
  });

  it("a paper named after the Reading tab opens the reader on it in place of the list, with the store of notes the list would have had", async () => {
    h.readingNotes = undefined; h.readerNotes = undefined; h.readerPid = undefined;
    await mount("lit", "reading");
    expect(h.readingNotes).toMatchObject({ all: {}, unread: false, loading: false });
    expect(h.readerPid).toBeUndefined();
    unmountAll();
    await mount("lit", "reading", "ka");
    expect(h.readerPid).toBe("ka");
    expect(h.readerNotes).toMatchObject({ all: {}, unread: false, loading: false });
    expect(tid("reading-list")).toBeNull();
    // The Reading list tab stays the open one, and the place's suggested next line is still last.
    expect(tid("place-tab-reading")!.getAttribute("aria-selected")).toBe("true");
    expect(tid("place-lit-reading")!.lastElementChild).toBe(tid("lit-next"));
  });

  it("the practice paper is the pid sample", async () => {
    await mount("lit", "reading", "sample");
    expect(h.readerPid).toBe("sample");
    expect(tid("reader-title")!.textContent).toBe(AP_SAMPLE[0]!.split("\n")[0]);
  });
});

describe("Literature waits for the paper ids (wave B, Task 17, ruling B2-R6)", () => {
  const rerender = (stage: StageKey, tab: string) => act(async () => { roots.at(-1)!.render(<StagePlace stage={stage} tab={tab} />); });

  it("a tab's body shows the loading sign while the migration runs, and the tab itself is there", async () => {
    h.paperIds = "running";
    await mount("lit", "find");
    expect(tid("panel-loading")).not.toBeNull();
    expect(tid("panel-find")).toBeNull();
    expect(tid("place-tabs")).not.toBeNull();
    expect(tid("lit-next")).not.toBeNull();
  });

  it.each(["done", "busy", "broken", "locked"])("the body renders when the migration answers %s", async (answer) => {
    h.paperIds = "running";
    await mount("lit", "citations");
    expect(tid("panel-citations")).toBeNull();
    h.paperIds = answer;
    await rerender("lit", "citations");
    expect(tid("panel-citations")).not.toBeNull();
    expect(tid("panel-loading")).toBeNull();
  });

  it("a body that is showing stays when the migration runs again (after a lock and an unlock)", async () => {
    h.paperIds = "done";
    await mount("lit", "find");
    expect(tid("panel-find")).not.toBeNull();
    h.paperIds = "running";
    await rerender("lit", "find");
    expect(tid("panel-find")).not.toBeNull();
    expect(tid("panel-loading")).toBeNull();
  });

  it("a place whose context has no answer (older callers) renders at once", async () => {
    h.paperIds = undefined;
    await mount("lit", "find");
    expect(tid("panel-find")).not.toBeNull();
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
      expect(tid("not-built")!.textContent).toBe("Not built yet. This tool comes in a later release. You can plan it in your document now.");
      const open = tid("not-built-open")!;
      expect(open.textContent).toBe("Open my document");
      await act(async () => { open.click(); });
      // The document opens beside this place (Task 11): the place stays.
      unmountAll();
    }
    expect(h.openDocument).toHaveBeenCalledTimes(3);
    expect(h.go).not.toHaveBeenCalled();
    // Once the document is open beside the place, the line stays and the button goes.
    h.docOpen = true;
    await mount("design");
    expect(tid("not-built")).not.toBeNull();
    expect(tid("not-built-open")).toBeNull();
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
    // The practice paper is open, so the reader shows its tabs (v1 offered the lesson for the practice paper only).
    const stubs = ["style", "words", "design", "stats", "qual", "close", "slides"];
    const banned = [E.ap2_lib_open_btn!, E.ap2_lesson_on_this_paper!, E.ap2_short_talks_on_reading!, E.backup_btn!, "All lectures", "Lesson on this paper", "arrive in a later phase", "This tool arrives in a later phase"];
    const places: Array<[StageKey, string | null]> = STAGE_ORDER.flatMap((s) => (PLACE_TABS[s].length ? PLACE_TABS[s].map((x) => [s, x] as [StageKey, string]) : [[s, null] as [StageKey, null]]));
    // Idea, Literature's four tabs, Design and ethics' eight, Collection and analysis' six, Writing's three and Review's three.
    expect(places).toHaveLength(25);
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
    // The reader on the practice paper draws its tabs, without the lesson.
    await mount("lit", "reading", "sample");
    expect(tid("reader-tabs")).not.toBeNull();
    expect(tid("reader-tab-card")).not.toBeNull();
    expect(tid("reader-tab-lesson")).toBeNull();
    for (const b of banned) expect(document.body.textContent).not.toContain(b);
  });
});

/** Each stage 3 to 6 place's tabs as the student reads them, in order (v1's own names in plain words). */
const STAGED_LABELS: Record<"design" | "collect" | "writing" | "review", string[]> = {
  design: ["Overview", "Pathway", "Protocol", "Ethics and consent", "Registration", "Investigator", "Budget", "AI-use statement"],
  collect: ["Statistics", "Sample size", "Charts", "Check numbers", "Scales", "Coding"],
  writing: ["Document", "My style", "Words"],
  review: ["Closeness", "Viva", "Make PPT"]
};

describe("the stage 3 to 6 places (Task G2)", () => {
  it("every stage 3 to 6 tab appears in order with its label", async () => {
    // The registry's tabs, in the plan's order and ids; Writing's document tab is the frame's, not a tool's (ruling R2).
    expect(TOOL_TABS.map((x) => x.stage + "/" + x.tab)).toEqual([
      "design/overview", "design/pathway", "design/protocol", "design/ethics", "design/registration", "design/investigator", "design/budget", "design/aiuse",
      "collect/data", "collect/power", "collect/charts", "collect/check", "collect/scales", "collect/coding",
      "writing/style", "writing/words",
      "review/closeness", "review/viva", "review/slides"
    ]);
    for (const x of TOOL_TABS) {
      expect(x.labelKey).toBe("tab_name_" + x.tab);
      expect(x.nextKey).toBe(x.stage + "_next_" + x.tab);
      expect(E[x.nextKey], x.nextKey).toMatch(/^Next: [^—]+\.$/);
    }
    for (const [stage, labels] of Object.entries(STAGED_LABELS) as Array<[keyof typeof STAGED_LABELS, string[]]>) {
      expect(PLACE_TABS[stage].map((x) => E["tab_name_" + x])).toEqual(labels);
      for (const tab of PLACE_TABS[stage]) {
        await mount(stage, tab);
        const links = [...tid("place-tabs")!.querySelectorAll<HTMLAnchorElement>("a")];
        const where = stage + "/" + tab;
        expect(links.map((a) => a.textContent), where).toEqual(labels);
        expect(links.map((a) => a.getAttribute("data-testid")), where).toEqual(PLACE_TABS[stage].map((x) => "place-tab-" + x));
        expect(links.map((a) => a.getAttribute("href")), where).toEqual(PLACE_TABS[stage].map((x) => `/p/p1/${stage}/${x}`));
        expect(links.map((a) => a.getAttribute("aria-current")), where).toEqual(PLACE_TABS[stage].map((x) => (x === tab ? "true" : null)));
        unmountAll();
      }
    }
  });

  it("a tab whose module is not built shows Not built yet with Open my document", async () => {
    for (const { stage, tab, nextKey } of TOOL_TABS) {
      await mount(stage, tab);
      const where = stage + "/" + tab;
      const body = tid("place-" + stage + "-" + tab)!;
      expect(body, where).not.toBeNull();
      expect(body.querySelector('[data-testid="not-built"]')!.textContent, where).toBe(E.place_not_built + " " + E.not_built_tab_body);
      const open = body.querySelector<HTMLElement>('[data-testid="not-built-open"]');
      if (stage === "writing") {
        // Writing shows the document already, under the place: no button that would do nothing.
        expect(open, where).toBeNull();
      } else {
        expect(open!.textContent, where).toBe("Open my document");
        await act(async () => { open!.click(); });
      }
      // The tab's suggested next line comes last, as Literature's does.
      const next = tid(stage + "-next")!;
      expect(next.textContent, where).toBe(E[nextKey]);
      expect(next.getAttribute("aria-label"), where).toBe("Suggested next");
      expect(body.lastElementChild, where).toBe(next);
      unmountAll();
    }
    expect(h.openDocument).toHaveBeenCalledTimes(TOOL_TABS.filter((x) => x.stage !== "writing").length);
    // A stage opened without a tab opens on its first.
    await mount("design");
    expect(tid("place-design-overview")).not.toBeNull();
    expect(tid("place-tab-overview")!.getAttribute("aria-current")).toBe("true");
  });

  it("Writing keeps the document as its first tab and adds My style and Words", async () => {
    expect(PLACE_TABS.writing).toEqual(["document", "style", "words"]);
    // /p/<id>/writing opens on the document.
    expect(parsePlace("writing", undefined)).toEqual({ stage: "writing", tab: "document", rest: [] });
    expect(parsePlace("writing", ["words"])).toEqual({ stage: "writing", tab: "words", rest: [] });
    for (const tab of [null, "document"]) {
      await mount("writing", tab);
      // The document tab is today's Writing: the helpers aside (the shell shows the document at full width), nothing that is not built.
      expect(tid("writing-aside")).not.toBeNull();
      expect(tid("not-built")).toBeNull();
      expect(tid("writing-next")).toBeNull();
      expect(tid("place-tab-document")!.getAttribute("aria-current")).toBe("true");
      unmountAll();
    }
    for (const tab of ["style", "words"]) {
      await mount("writing", tab);
      expect(tid("writing-aside"), tab).toBeNull();
      expect(tid("place-writing-" + tab)!.querySelector('[data-testid="not-built"]'), tab).not.toBeNull();
      expect(tid("place-tab-" + tab)!.getAttribute("aria-current"), tab).toBe("true");
      // Writing has no Open my document and no window of its own, on every tab.
      expect(tid("place-open-doc"), tab).toBeNull();
      expect(tid("place-new-window"), tab).toBeNull();
      unmountAll();
    }
  });
});
