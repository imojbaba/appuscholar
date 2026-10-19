// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { docInnerText } from "@appuscholar/core";
import { editorExtensions } from "../lib/editorExtensions";
import en from "../messages/en.json";

const h = vi.hoisted(() => ({
  runHelper: vi.fn(async (_kind: string, _deps: unknown) => {}), runDevil: vi.fn(async (_deps: unknown) => {}),
  dockShow: vi.fn(), toast: vi.fn(), callAI: vi.fn(),
  sug: {} as Record<string, unknown>
}));
vi.mock("@/lib/ai/actions", async (orig) => ({ ...(await orig<typeof import("../lib/ai/actions")>()), runHelper: h.runHelper, runDevil: h.runDevil }));
vi.mock("@/lib/ai/useCallAI", () => ({ useCallAI: () => h.callAI }));
vi.mock("@/lib/ai/suggestion", () => ({ useSuggestion: () => h.sug }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1" }, settings: { field: "  nursing " } }) }));
vi.mock("@/components/workspace/WorkspaceContext", () => ({ useWorkspace: () => ({ dockShow: h.dockShow }) }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));

import { HelpersPanel, resetHelperSession } from "../components/tools/HelpersPanel";
import type { HelperDeps } from "../lib/ai/actions";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const E = en as Record<string, string>;
const roots: Root[] = [];
let editor: Editor | null = null;
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel);
function mount() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  act(() => { root.render(<HelpersPanel />); });
}
async function click(testid: string) {
  await act(async () => { $(`[data-testid="${testid}"]`)!.click(); await new Promise((r) => setTimeout(r, 0)); });
}
const lastDeps = (fn: typeof h.runHelper | typeof h.runDevil) => (fn.mock.calls.at(-1) as unknown[]).at(-1) as HelperDeps;

beforeEach(() => {
  h.runHelper.mockClear(); h.runDevil.mockClear(); h.dockShow.mockReset(); h.toast.mockReset(); h.callAI.mockReset();
  editor = new Editor({ extensions: editorExtensions, content: "<p>First paragraph of the essay.</p><p>Second paragraph here.</p>" });
  h.sug = {
    setThinking: vi.fn(), isCurrent: vi.fn(), set: vi.fn(), setFeedback: vi.fn(), clear: vi.fn(),
    editor
  };
  resetHelperSession();
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  document.body.innerHTML = "";
  editor?.destroy();
  editor = null;
});

describe("Research helpers panel (v1 728-738)", () => {
  it("shows v1's heading, description, six buttons in v1's order and the closing note with its <b>", () => {
    mount();
    expect($('[data-testid="panel-psych"] h3')!.textContent).toBe(E.tab_psych);
    expect($('[data-testid="panel-psych"] .desc')!.textContent).toBe(E.psych_panel_desc);
    const buttons = [...document.body.querySelectorAll<HTMLButtonElement>('[data-testid="panel-psych"] button')];
    expect(buttons.map((b) => b.dataset.testid)).toEqual(["helper-paper", "helper-case", "helper-litrev", "helper-explain", "helper-stats", "helper-devil"]);
    expect(buttons.map((b) => b.textContent)).toEqual([E.psych_btn_summarize, E.psych_btn_case, E.psych_btn_litrev, E.psych_btn_explain, E.psych_btn_apa, E.devil_btn]);
    expect(buttons[5]!.title).toBe(E.devil_btn_title);
    // five purple (primary) buttons, then the ghost one
    expect(buttons.slice(0, 5).every((b) => b.dataset.variant === "primary")).toBe(true);
    expect(buttons[5]!.dataset.variant).toBe("ghost");
    const note = $('[data-testid="helpers-note"]')!;
    expect(note.textContent).toBe(E.psych_panel_note!.replace(/<\/?b>/g, ""));
    expect(note.querySelector("b")!.textContent).toBe("Format results in APA");
  });

  it.each([
    ["helper-paper", "paper"], ["helper-case", "case"], ["helper-litrev", "litrev"], ["helper-explain", "explain"], ["helper-stats", "stats"]
  ])("%s runs runHelper(%s) with the field of study", async (testid, kind) => {
    mount();
    await click(testid);
    expect(h.runHelper).toHaveBeenCalledTimes(1);
    expect(h.runHelper.mock.calls[0]![0]).toBe(kind);
    expect(lastDeps(h.runHelper).field).toBe("nursing");
    expect(h.runDevil).not.toHaveBeenCalled();
  });

  it("the devil button runs runDevil", async () => {
    mount();
    await click("helper-devil");
    expect(h.runDevil).toHaveBeenCalledTimes(1);
    expect(h.runHelper).not.toHaveBeenCalled();
  });

  it("the text comes from the open document's editor: the selection, or the whole document read as v1's innerText", async () => {
    mount();
    await click("helper-paper");
    const d = lastDeps(h.runHelper);
    expect(d.hasSelection()).toBe(false);
    expect(d.docText()).toBe(docInnerText(editor!.getHTML()));
    expect(d.docText()).toBe("First paragraph of the essay.\n\nSecond paragraph here.");
    editor!.commands.setTextSelection({ from: 1, to: 6 });
    expect(d.hasSelection()).toBe(true);
    expect(d.selectionText()).toBe("First");
  });

  it("with no editor open there is no selection and no text", async () => {
    h.sug.editor = null;
    mount();
    await click("helper-devil");
    const d = lastDeps(h.runDevil);
    expect(d.hasSelection()).toBe(false);
    expect(d.docText()).toBe("");
  });

  it("the case confirm is the browser's confirm; the acknowledgement is kept in memory for the tab, never in sessionStorage (v1 sessionKeys)", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    mount();
    await click("helper-case");
    const d = lastDeps(h.runHelper);
    expect(d.confirm("Continue?")).toBe(true);
    expect(confirm).toHaveBeenCalledWith("Continue?");
    expect(d.session.get("appu_case_ack")).toBeNull();
    d.session.set("appu_case_ack", "1");
    expect(d.session.get("appu_case_ack")).toBe("1");
    expect(setItem).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("appu_case_ack")).toBeNull();
    expect(sessionStorage.length).toBe(0);
    // A second mount in the same tab (leaving the panel and coming back) still has the yes.
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    mount();
    await click("helper-case");
    expect(lastDeps(h.runHelper).session.get("appu_case_ack")).toBe("1");
    // A reload starts with a fresh module, which resetHelperSession stands in for.
    resetHelperSession();
    expect(lastDeps(h.runHelper).session.get("appu_case_ack")).toBeNull();
    setItem.mockRestore();
    confirm.mockRestore();
  });
});
