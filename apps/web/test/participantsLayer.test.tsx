// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildMatcher } from "@appuscholar/core";

/*
 * Task 9: the participants module's DocumentLayer (spec 2026-10-24-participants-design.md §8.2, call C9; rulings R1 and R19). It draws nothing of its own in the page; it reads the
 * list through useParticipants (which publishes it to the store), and, while the list is open and readable, paints the open editor's text with the CSS Custom Highlight API: names on
 * the list in purple (`pp-sure`), the ones to ask about and the ones that might be names in amber (`pp-maybe`). Nothing is stored. jsdom has no `CSS.highlights`, so the registry
 * and `Highlight` are stand-ins that record what is set and deleted; the ranges themselves are computed by a pure function (rangesFor, docNames.ts) that is tested on its own.
 */

const h = vi.hoisted(() => ({
  store: {} as Record<string, unknown>,
  flags: {} as Record<string, { loading?: boolean; locked?: boolean; broken?: boolean; error?: boolean }>,
  listeners: new Set<() => void>(),
  asked: [] as string[],
  status: "unlocked" as string,
  editor: {} as object | null,
  toast: vi.fn()
}));
vi.mock("@/lib/blobs/useProjectBlob", async () => {
  const React = await import("react");
  return {
    useProjectBlob: (kind: string, id: string | null) => {
      const [, bump] = React.useState(0);
      React.useEffect(() => { const l = () => bump((n) => n + 1); h.listeners.add(l); return () => { h.listeners.delete(l); }; }, []);
      const set = React.useCallback(() => {}, []);
      const flush = React.useCallback(async () => true, []);
      if (id === null) return { value: null, loading: false, locked: false, set, flush, readOnly: false };
      if (!h.asked.includes(kind)) h.asked.push(kind);
      const f = h.flags[kind] ?? {};
      return { value: f.locked || f.loading ? null : (h.store[kind] ?? null), loading: !!f.loading, locked: !!f.locked, broken: f.broken, error: f.error, version: 1, set, flush, readOnly: false };
    }
  };
});
vi.mock("@/lib/vault/useVault", async () => {
  const React = await import("react");
  return {
    useVault: () => {
      const [, bump] = React.useState(0);
      React.useEffect(() => { const l = () => bump((n) => n + 1); h.listeners.add(l); return () => { h.listeners.delete(l); }; }, []);
      return { status: h.status };
    }
  };
});
vi.mock("@/lib/ai/suggestion", async () => {
  const React = await import("react");
  return {
    useSuggestion: () => {
      const [, bump] = React.useState(0);
      React.useEffect(() => { const l = () => bump((n) => n + 1); h.listeners.add(l); return () => { h.listeners.delete(l); }; }, []);
      return { editor: h.editor };
    }
  };
});
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));

import { DocumentLayer } from "../components/tools/participants/DocumentLayer";
import * as participants from "../components/tools/participants";
import { rangesFor } from "../lib/tools/participants/docNames";
import { toMatchPeople } from "../lib/tools/participants/list";
import { listFor, publishList, resetLists } from "../lib/tools/participants/store";
import type { Participant, ParticipantList } from "../lib/blobs/kinds/participants";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---- The highlight registry's stand-in ----------------------------------------------------------------------------------------------------------------

class FakeHighlight { ranges: Range[]; constructor(...ranges: Range[]) { this.ranges = ranges; } }
const registry = new Map<string, FakeHighlight>();
const fakeRegistry = {
  set: vi.fn((k: string, v: FakeHighlight) => { registry.set(k, v); }),
  delete: vi.fn((k: string) => registry.delete(k)),
  has: (k: string) => registry.has(k),
  get: (k: string) => registry.get(k)
};
const strings = (name: string) => (registry.get(name)?.ranges ?? []).map((r) => r.toString());
const paints = (name: string) => fakeRegistry.set.mock.calls.filter((c) => c[0] === name).length;

// ---- Helpers ------------------------------------------------------------------------------------------------------------------------------------------

const roots: Root[] = [];
const notify = () => act(() => { for (const l of h.listeners) l(); });
const micro = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

const person = (o: Partial<Participant> & { code: string; name: string }): Participant => ({ id: "id-" + o.code, spellings: [], everyday: [], joined: "2026-10-02", about: {}, ...o });
const FIVE: Participant[] = [
  person({ code: "P001", name: "Priya Sharma", spellings: ["Priya", "प्रिया"] }),
  person({ code: "P002", name: "Rahul Verma", spellings: ["Rahul"] }),
  person({ code: "P003", name: "Asha Kumari", spellings: ["Asha"], everyday: ["Asha"] })
];
const list = (people: Participant[] = FIVE, extra: Partial<ParticipantList> = {}): ParticipantList => ({ v: 1, next: people.length + 1, people, notNames: [], ...extra });

/** The open editor, as the page has it: `.editor .ProseMirror` with its paragraphs. */
function editor(html: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "editor";
  const pm = document.createElement("div");
  pm.className = "ProseMirror";
  pm.innerHTML = html;
  wrap.appendChild(pm);
  document.body.appendChild(wrap);
  return pm;
}
const DOC = "<p><strong>Priya:</strong> Hard. Rahul said so.</p><p>Meena didi did. And the ASHA worker came. प्रिया की माँ</p>";

async function mount(): Promise<void> {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(<DocumentLayer projectId="p1" />); });
}

beforeEach(() => {
  h.store = {};
  h.flags = {};
  h.asked = [];
  h.status = "unlocked";
  h.editor = {};
  h.toast.mockClear();
  registry.clear();
  fakeRegistry.set.mockClear();
  fakeRegistry.delete.mockClear();
  resetLists();
  vi.stubGlobal("CSS", { highlights: fakeRegistry });
  vi.stubGlobal("Highlight", FakeHighlight);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
});
afterEach(async () => {
  expect(h.toast).not.toHaveBeenCalled();
  for (const r of roots.splice(0)) await act(async () => { r.unmount(); });
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

// ---- The module ---------------------------------------------------------------------------------------------------------------------------------------

describe("the module", () => {
  it("declares a DocumentLayer, next to its Panel", () => {
    expect(typeof participants.DocumentLayer).toBe("function");
    expect(typeof participants.Panel).toBe("function");
  });
});

// ---- The ranges ---------------------------------------------------------------------------------------------------------------------------------------

describe("rangesFor: where the names are in the editor's text", () => {
  const m = () => buildMatcher(toMatchPeople(list(), false));
  const textOf = (s: { startNode: Text; startOffset: number; endNode: Text; endOffset: number }) => {
    const r = document.createRange();
    r.setStart(s.startNode, s.startOffset);
    r.setEnd(s.endNode, s.endOffset);
    return r.toString();
  };

  it("names on the list are sure, the ones to ask about and the ones that might be names are maybe; each is a start and an end in the editor's text nodes", () => {
    const root = editor(DOC);
    const { sure, maybe } = rangesFor(root, m(), []);
    expect(sure.map(textOf)).toEqual(["Priya", "Rahul", "प्रिया"]);
    expect(maybe.map(textOf)).toEqual(["Meena", "ASHA"]);
    // Plain text nodes of the editor.
    expect(sure[0]!.startNode.nodeType).toBe(Node.TEXT_NODE);
    expect(root.contains(sure[0]!.startNode)).toBe(true);
    expect(sure[0]).toMatchObject({ startOffset: 0, endOffset: 5 });
  });

  it("a name split by inline marks inside one block is one range, spanning the nodes", () => {
    const root = editor("<p>Hello <b>Pri</b>ya said hi</p>");
    const { sure } = rangesFor(root, m(), []);
    expect(sure).toHaveLength(1);
    const s = sure[0]!;
    expect(s.startNode.data).toBe("Pri");
    expect(s.endNode.data).toBe("ya said hi");
    expect([s.startOffset, s.endOffset]).toEqual([0, 2]);
    expect(textOf(s)).toBe("Priya");
  });

  it("finds never cross blocks: a name over two paragraphs, two list items or a line break is not found", () => {
    // A name that is no first name on the built-in list, so nothing is suggested either.
    const zed = buildMatcher(toMatchPeople(list([person({ code: "P001", name: "Zanzibar Quill" })]), false));
    expect(rangesFor(editor("<p>Zanzibar</p><p>Quill</p><ul><li>Zanzibar</li><li>Quill</li></ul><p>Zanzibar<br>Quill</p>"), zed, [])).toEqual({ sure: [], maybe: [] });
    expect(rangesFor(editor("<p>Zanzibar Quill</p>"), zed, []).sure).toHaveLength(1);
  });

  it("a speaker label after a line break in one paragraph is found as a line start", () => {
    const { maybe } = rangesFor(editor("<p>Interviewer: Hello.<br>Sunita: Hi there.</p>"), m(), []);
    expect(maybe.map(textOf)).toEqual(["Sunita"]);
  });

  it("a word the student said is not a name is left out", () => {
    const { maybe } = rangesFor(editor("<p>Meena didi did.</p>"), m(), ["meena"]);
    expect(maybe).toEqual([]);
  });

  it("an editor with no text gives no ranges", () => {
    expect(rangesFor(editor("<p></p>"), m(), [])).toEqual({ sure: [], maybe: [] });
  });
});

// ---- The layer ----------------------------------------------------------------------------------------------------------------------------------------

describe("DocumentLayer", () => {
  it("paints the names of the open document: purple for the list, amber for the rest, from the editor's own text", async () => {
    h.store.participants = list();
    editor(DOC);
    await mount();
    expect(strings("pp-sure")).toEqual(["Priya", "Rahul", "प्रिया"]);
    expect(strings("pp-maybe")).toEqual(["Meena", "ASHA"]);
    // Highlight objects, built from ranges, set by name.
    expect(registry.get("pp-sure")).toBeInstanceOf(FakeHighlight);
  });

  it("draws the styles that colour them: purple with a solid underline, amber with a dashed one, via ::highlight", async () => {
    h.store.participants = list();
    editor(DOC);
    await mount();
    const css = document.body.querySelector<HTMLElement>('[data-testid="pp-highlight-style"]')!.textContent!;
    expect(css).toMatch(/::highlight\(pp-sure\)\s*\{[^}]*background-color:\s*#ede9fe/);
    expect(css).toMatch(/::highlight\(pp-sure\)\s*\{[^}]*text-decoration:[^;}]*#7c3aed/);
    expect(css).toMatch(/::highlight\(pp-maybe\)\s*\{[^}]*background-color:\s*#fef3c7/);
    expect(css).toMatch(/::highlight\(pp-maybe\)\s*\{[^}]*text-decoration:[^;}]*dashed[^;}]*#d97706|::highlight\(pp-maybe\)\s*\{[^}]*text-decoration:[^;}]*#d97706[^;}]*dashed/);
    // Nothing else of its own in the page.
    expect(document.body.querySelectorAll('[data-testid^="pp-"]')).toHaveLength(1);
  });

  it("publishes the list it reads to the store, for the other places that need it", async () => {
    h.store.participants = list();
    await mount();
    expect(listFor("p1")?.people).toHaveLength(3);
  });

  it("paints nothing when the switch is off (highlight false), and takes down what was painted when the switch is turned off", async () => {
    h.store.participants = list(FIVE, { highlight: false });
    editor(DOC);
    await mount();
    expect(paints("pp-sure")).toBe(0);
    expect(registry.size).toBe(0);
    expect(document.body.querySelector('[data-testid="pp-highlight-style"]')).toBeNull();
    // Turned on (absent means on), then off again.
    h.store.participants = list();
    await notify();
    expect(strings("pp-sure")).toHaveLength(3);
    h.store.participants = list(FIVE, { highlight: false });
    await notify();
    expect(registry.size).toBe(0);
  });

  it.each([
    ["the list is still being read", { loading: true }],
    ["the vault is locked", { locked: true }],
    ["the list does not open", { broken: true }]
  ])("paints nothing when %s", async (_, flags) => {
    h.store.participants = list();
    h.flags.participants = flags;
    editor(DOC);
    await mount();
    expect(registry.size).toBe(0);
  });

  it("paints nothing when the read failed (nothing is read, so there is no list)", async () => {
    h.flags.participants = { error: true };
    editor(DOC);
    await mount();
    expect(registry.size).toBe(0);
  });

  it("paints nothing with the vault off or locked, and does not ask for the list (no passphrase prompt of its own)", async () => {
    h.store.participants = list();
    editor(DOC);
    h.status = "locked";
    await mount();
    expect(registry.size).toBe(0);
    expect(h.asked).toEqual([]);
    h.status = "off";
    await notify();
    expect(registry.size).toBe(0);
  });

  it("paints nothing for a list with nobody on it (not yet started, or destroyed): matching has nothing to do", async () => {
    h.store.participants = list([]);
    editor(DOC);
    await mount();
    expect(registry.size).toBe(0);
    h.store.participants = list(FIVE, { destroyedAt: "2026-10-20" });
    await notify();
    expect(registry.size).toBe(0);
  });

  it("paints nothing when no editor is mounted, and paints once one is", async () => {
    h.store.participants = list();
    h.editor = null;
    await mount();
    expect(registry.size).toBe(0);
    editor(DOC);
    h.editor = {};
    await notify();
    expect(strings("pp-sure")).toEqual(["Priya", "Rahul", "प्रिया"]);
  });

  it("when the vault locks the highlights are taken down and the store is cleared (R19)", async () => {
    h.store.participants = list();
    editor(DOC);
    await mount();
    expect(registry.size).toBe(2);
    expect(listFor("p1")).not.toBeNull();
    h.status = "locked";
    await notify();
    expect(registry.size).toBe(0);
    expect(listFor("p1")).toBeNull();
  });

  it("when the list goes away (does not open) the highlights go and the store is cleared (R1)", async () => {
    h.store.participants = list();
    editor(DOC);
    await mount();
    h.flags.participants = { broken: true };
    await notify();
    expect(registry.size).toBe(0);
    expect(listFor("p1")).toBeNull();
  });

  it("on unmount it removes both highlights and clears the store", async () => {
    h.store.participants = list();
    editor(DOC);
    await mount();
    expect(registry.size).toBe(2);
    await act(async () => { roots.splice(0).forEach((r) => r.unmount()); });
    expect(registry.size).toBe(0);
    expect(fakeRegistry.delete).toHaveBeenCalledWith("pp-sure");
    expect(fakeRegistry.delete).toHaveBeenCalledWith("pp-maybe");
    expect(listFor("p1")).toBeNull();
  });

  it("repaints at once when the list changes: a person added on the tab (published to the store) is painted without waiting", async () => {
    h.store.participants = list(FIVE.slice(0, 1));
    editor(DOC);
    await mount();
    expect(strings("pp-sure")).toEqual(["Priya", "प्रिया"]);
    const before = paints("pp-sure");
    // The tab's save reaches the store, not the layer's own blob.
    await act(async () => { publishList("p1", list(FIVE), 2); });
    expect(paints("pp-sure")).toBe(before + 1);
    expect(strings("pp-sure")).toEqual(["Priya", "Rahul", "प्रिया"]);
    expect(strings("pp-maybe")).toEqual(["Meena", "ASHA"]);
  });

  it("debouncesRepaint: ten edits within 100 ms cause one repaint, 500 ms after the first", async () => {
    h.store.participants = list();
    const pm = editor(DOC);
    await mount();
    const first = paints("pp-sure");
    expect(first).toBe(1);
    const node = pm.querySelector("p")!.lastChild as Text;
    for (let i = 0; i < 10; i++) {
      node.data = node.data + ".";
      await micro();
      act(() => { vi.advanceTimersByTime(10); });
    }
    expect(paints("pp-sure")).toBe(first);
    act(() => { vi.advanceTimersByTime(300); });
    expect(paints("pp-sure")).toBe(first);
    act(() => { vi.advanceTimersByTime(200); });
    expect(paints("pp-sure")).toBe(first + 1);
    // Quiet: no more repaints.
    act(() => { vi.advanceTimersByTime(5000); });
    expect(paints("pp-sure")).toBe(first + 1);
  });

  it("an edit later makes a repaint of its own, and the new text is painted (a name typed in)", async () => {
    h.store.participants = list();
    const pm = editor("<p>Nothing here.</p>");
    await mount();
    expect(strings("pp-sure")).toEqual([]);
    pm.querySelector("p")!.appendChild(document.createTextNode(" Rahul came."));
    await micro();
    act(() => { vi.advanceTimersByTime(500); });
    expect(strings("pp-sure")).toEqual(["Rahul"]);
  });

  it("follows the editor when its DOM is replaced (another document opens): the old root no longer repaints", async () => {
    h.store.participants = list();
    const first = editor("<p>Priya.</p>");
    await mount();
    expect(strings("pp-sure")).toEqual(["Priya"]);
    first.parentElement!.remove();
    const second = editor("<p>Rahul and Priya.</p>");
    h.editor = {};
    await notify();
    expect(strings("pp-sure")).toEqual(["Rahul", "Priya"]);
    const count = paints("pp-sure");
    // An edit in the old (detached) root does nothing; one in the new root repaints.
    (first.firstChild!.firstChild as Text).data = "Rahul.";
    await micro();
    act(() => { vi.advanceTimersByTime(600); });
    expect(paints("pp-sure")).toBe(count);
    (second.firstChild!.firstChild as Text).data = "Rahul and Priya and Rahul.";
    await micro();
    act(() => { vi.advanceTimersByTime(600); });
    expect(strings("pp-sure")).toEqual(["Rahul", "Priya", "Rahul"]);
  });

  it("a made-up name is not painted amber as a name that is not on the list (R34)", async () => {
    h.store.participants = list(FIVE.map((p) => (p.code === "P001" ? { ...p, pseudonym: "Neha" } : p)));
    editor("<p>Neha said so. Meena too.</p>");
    await mount();
    // Neha is on the built-in first names and is P001's made-up name; Meena is nobody's.
    expect(strings("pp-maybe")).toEqual(["Meena"]);
    expect(strings("pp-sure")).toEqual([]);
  });

  it("a word is still painted amber when it is on the first names and nobody's made-up name", async () => {
    h.store.participants = list();
    editor("<p>Neha said so.</p>");
    await mount();
    expect(strings("pp-maybe")).toEqual(["Neha"]);
  });

  it("stops looking for the editor after 20 tries when none is in the page, and starts again on the next list or editor change", async () => {
    h.store.participants = list();
    h.editor = {};
    const spy = vi.spyOn(document, "querySelector");
    const looks = () => spy.mock.calls.filter((c) => c[0] === ".editor .ProseMirror").length;
    await mount();
    expect(looks()).toBe(1);
    act(() => { vi.advanceTimersByTime(500 * 40); });
    // The first look and twenty more.
    expect(looks()).toBe(21);
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(looks()).toBe(21);
    // A list change looks again, and tries again from the start.
    h.store.participants = list(FIVE, { notNames: ["x"] });
    await notify();
    expect(looks()).toBe(22);
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(looks()).toBe(42);
    // An editor that is there now is found at once when the editor changes.
    editor(DOC);
    h.editor = {};
    await notify();
    expect(strings("pp-sure")).toEqual(["Priya", "Rahul", "प्रिया"]);
    spy.mockRestore();
  });

  it("an editor that is in the page is watched without any limit: edits keep repainting", async () => {
    h.store.participants = list();
    const pm = editor("<p>Nothing.</p>");
    await mount();
    const node = pm.querySelector("p")!.firstChild as Text;
    for (let i = 0; i < 30; i++) {
      node.data = node.data + " Rahul";
      await micro();
      act(() => { vi.advanceTimersByTime(600); });
    }
    expect(strings("pp-sure")).toHaveLength(30);
  });

  it("a browser without CSS.highlights: the layer renders, throws nothing, paints nothing and draws no styles", async () => {
    vi.stubGlobal("CSS", {});
    h.store.participants = list();
    const pm = editor(DOC);
    await mount();
    pm.querySelector("p")!.appendChild(document.createTextNode(" more"));
    await micro();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(registry.size).toBe(0);
    expect(fakeRegistry.set).not.toHaveBeenCalled();
    expect(document.body.querySelector('[data-testid="pp-highlight-style"]')).toBeNull();
    // The list is still published for the other readers.
    expect(listFor("p1")?.people).toHaveLength(3);
  });

  it("without the CSS global at all (an older environment) it also does nothing", async () => {
    vi.stubGlobal("CSS", undefined);
    vi.stubGlobal("Highlight", undefined);
    h.store.participants = list();
    editor(DOC);
    await mount();
    expect(registry.size).toBe(0);
  });

  it("writes nothing to the editor's DOM: the text and the nodes are as they were", async () => {
    h.store.participants = list();
    const pm = editor(DOC);
    const before = pm.innerHTML;
    await mount();
    act(() => { vi.advanceTimersByTime(2000); });
    expect(pm.innerHTML).toBe(before);
  });
});
