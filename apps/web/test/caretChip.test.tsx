// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import type { CitationEntry } from "@appuscholar/core";
import { editorExtensions } from "../lib/editorExtensions";
import en from "../messages/en.json";

type Lib = CitationEntry[];
const h = vi.hoisted(() => ({
  lib: [] as unknown[],
  go: vi.fn(),
  editor: null as unknown
}));
const idle = () => ({ value: null, loading: false, locked: false, set: vi.fn(), flush: vi.fn(async () => true) });
vi.mock("@/lib/blobs/useProjectBlob", () => ({
  useProjectBlob: (kind: string) => (kind === "citations" ? { value: h.lib, loading: false, locked: false, set: vi.fn(), flush: vi.fn(async () => true) } : idle())
}));
// The quote box calls the AI through useCallAI (Task 8b); these tests make no call.
vi.mock("@/lib/ai/useCallAI", async (orig) => ({ ...(await orig<typeof import("../lib/ai/useCallAI")>()), useCallAI: () => async () => "" }));
vi.mock("@/lib/ai/suggestion", () => ({ useSuggestion: () => ({ editor: h.editor }) }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", scratchProjectId: "scratch-1" }, settings: {} }) }));
vi.mock("@/components/frame/ProjectContext", () => ({
  useProject: () => ({ project: null, documents: [], currentDoc: null, selectDoc: vi.fn(), go: h.go, projectId: "p1" })
}));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => ({ status: "off", decryptBody: async () => "" }) }));
vi.mock("@/lib/api", () => ({ apiFetch: async () => { throw new Error("no documents here"); } }));
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));

import { CaretChip } from "../components/document/CaretChip";
import { CitePanel } from "../components/tools/cite/CitePanel";
import { getCiteActive, resetCiteActive } from "../lib/cite/active";
import { resetCheckBusy } from "../lib/cite/checks";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = en as Record<string, string>;

const LEE: CitationEntry = { author: "Lee, Kim", year: "2018", title: "Homework" };
const SMITH: CitationEntry = { author: "Smith, John", year: "2020", title: "Sleep and memory" };
const TEXT = "Sleep consolidates memory (Smith, 2020). Homework helps little (Lee, 2018). Nothing else is cited here at all.";

const roots: Root[] = [];
const editors: Editor[] = [];
const tid = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
function make(): Editor {
  const e = new Editor({ extensions: editorExtensions, content: `<p>${TEXT}</p>` });
  editors.push(e);
  h.editor = e;
  return e;
}
function mount(node: React.ReactNode) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  act(() => { root.render(node); });
}
/** Puts the caret `k` characters after the start of `word` in the paragraph, then lets the chip's 120 ms timer run. */
async function caretAt(e: Editor, word: string, k = 1) {
  await act(async () => {
    e.commands.setTextSelection(1 + TEXT.indexOf(word) + k);
    await new Promise((r) => setTimeout(r, 160));
  });
}

beforeEach(() => {
  h.lib = [LEE, SMITH] as Lib;
  h.go.mockReset();
  resetCiteActive();
  resetCheckBusy();
  vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  for (const e of editors.splice(0)) e.destroy();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("the caret chip (v1 618, 7668-7727)", () => {
  it("appears when the caret touches (Smith, 2020) of a library entry: cit_caret_chip with {c} = \"Smith, 2020\"", async () => {
    const e = make();
    mount(<CaretChip editor={e} />);
    expect(tid("cit-caret-chip")).toBeNull();
    await caretAt(e, "(Smith", 3);
    expect(tid("cit-caret-chip")!.textContent).toBe(E.cit_caret_chip!.replace("{c}", "Smith, 2020"));
    expect(tid("cit-caret-chip")!.textContent).toBe("📚 Smith, 2020 — show in Citation Manager");
    // Right after the closing bracket still touches it (v1's one-character margin).
    await caretAt(e, "). Homework", 1);
    expect(tid("cit-caret-chip")!.textContent).toBe("📚 Smith, 2020 — show in Citation Manager");
  });

  it("no chip elsewhere in the text, nor for a citation that is not in the library", async () => {
    const e = make();
    mount(<CaretChip editor={e} />);
    await caretAt(e, "(Smith", 3);
    expect(tid("cit-caret-chip")).not.toBeNull();
    await caretAt(e, "Nothing else", 3);
    expect(tid("cit-caret-chip")).toBeNull();
    h.lib = [LEE];
    act(() => { for (const r of roots) r.render(<CaretChip editor={e} />); });
    await caretAt(e, "(Smith", 3);
    expect(tid("cit-caret-chip")).toBeNull();
  });

  it("a click opens the Citation Manager and highlights that card", async () => {
    const e = make();
    mount(<CaretChip editor={e} />);
    await caretAt(e, "(Smith", 3);
    await act(async () => { tid("cit-caret-chip")!.click(); });
    expect(h.go).toHaveBeenCalledWith("/p/p1/lit/citations");
    expect(getCiteActive()).toMatchObject({ index: 1, jump: true });
    // The manager then opens with that card lit.
    mount(<CitePanel />);
    const cards = document.body.querySelectorAll('[data-testid="cite-card"]');
    expect(cards[1]!.classList.contains("cit-active")).toBe(true);
    expect(cards[0]!.classList.contains("cit-active")).toBe(false);
  });

  it("with the manager open, the card lights as the cursor moves, and goes dark off a citation", async () => {
    const e = make();
    mount(<><CaretChip editor={e} /><CitePanel /></>);
    const lit = () => [...document.body.querySelectorAll('[data-testid="cite-card"]')].map((c) => c.classList.contains("cit-active"));
    expect(lit()).toEqual([false, false]);
    await caretAt(e, "(Smith", 3);
    expect(lit()).toEqual([false, true]);
    await caretAt(e, "(Lee", 2);
    expect(lit()).toEqual([true, false]);
    expect(getCiteActive()).toMatchObject({ index: 0, jump: false });
    await caretAt(e, "Nothing else", 3);
    expect(lit()).toEqual([false, false]);
  });

  it("with the manager closed, moving the cursor lights nothing", async () => {
    const e = make();
    mount(<CaretChip editor={e} />);
    await caretAt(e, "(Lee", 2);
    expect(tid("cit-caret-chip")!.textContent).toBe("📚 Lee, 2018 — show in Citation Manager");
    expect(getCiteActive().index).toBe(-1);
  });
});
