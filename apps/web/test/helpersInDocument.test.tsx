// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/react";
import { buildDevilPrompt, buildHelperPrompt, classifyAiUse, docInnerText, type HelperKind } from "@appuscholar/core";
import { editorExtensions } from "../lib/editorExtensions";
import { selBubbleVisible } from "../lib/editor/selectionBubble";
import en from "../messages/en.json";

const h = vi.hoisted(() => ({
  callAI: vi.fn(), toast: vi.fn(), openDocument: vi.fn(), go: vi.fn(), setPendingSearch: vi.fn(), field: "psychology"
}));
vi.mock("@/lib/ai/useCallAI", () => ({ useCallAI: () => h.callAI }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1" }, settings: { field: h.field }, update: async () => undefined }) }));
vi.mock("@/components/frame/ProjectContext", () => ({
  useProject: () => ({ openDocument: h.openDocument, go: h.go, projectId: "p1", setPendingSearch: h.setPendingSearch })
}));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
// TipTap's bubble menu shows only for a focused document and floats; here its buttons are drawn in place.
vi.mock("@tiptap/react/menus", () => ({ BubbleMenu: ({ children, ...p }: { children: React.ReactNode; "data-testid"?: string }) => <div data-testid={p["data-testid"]}>{children}</div> }));

import { SuggestionProvider, useSuggestion, type SuggestionValue } from "../lib/ai/suggestion";
import { resetHelperSession } from "../lib/ai/useHelperRun";
import { HelpButton, HelpMenu } from "../components/document/HelpMenu";
import { DocAside } from "../components/document/DocAside";
import { FormatBar } from "../components/document/FormatBar";
import { SelectionBubble } from "../components/document/SelectionBubble";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const E = en as Record<string, string>;
/** 3,000 characters in one paragraph: well past the bubble's 800, under the helpers' 12,000. */
const SELECTED = "abcdefghi ".repeat(299) + "abcdefghi.";
const OTHER = "A second paragraph that the student did not select.";
const ITEMS: { id: string; testid: string; kind: HelperKind | "devil" }[] = [
  { id: "paper", testid: "help-paper", kind: "paper" }, { id: "case", testid: "help-case", kind: "case" },
  { id: "litrev", testid: "help-litrev", kind: "litrev" }, { id: "explain", testid: "help-explain", kind: "explain" },
  { id: "stats", testid: "help-stats", kind: "stats" }, { id: "devil", testid: "help-devil", kind: "devil" }
];

const roots: Root[] = [];
let editor: Editor;
const box: { sug: SuggestionValue | null } = { sug: null };
// The latest value the provider handed out.
const sugNow = () => box.sug!;
const $ = (testid: string) => document.body.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
const settle = () => new Promise((r) => setTimeout(r, 0));
async function click(testid: string) {
  await act(async () => { $(testid)!.click(); await settle(); await settle(); });
}

/** The document's side of the card: the provider, the editor registered with it, the toolbar button, the menu and the aside. */
function Harness({ withBar = false }: { withBar?: boolean }) {
  const s = useSuggestion();
  useEffect(() => { box.sug = s; });
  useEffect(() => { s.setEditor(editor); return () => s.setEditor(null); }, [s.setEditor]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      {withBar ? <FormatBar editor={editor} /> : <HelpButton editor={editor} />}
      <HelpMenu editor={editor} />
      <DocAside />
    </>
  );
}
function mount(withBar = false) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  act(() => { root.render(<SuggestionProvider><Harness withBar={withBar} /></SuggestionProvider>); });
}
const select = (from: number, to: number) => act(() => { editor.commands.setTextSelection({ from, to }); });
const open = async () => { await click("help-with-text"); expect($("help-menu")).not.toBeNull(); };

beforeEach(() => {
  h.callAI.mockReset().mockResolvedValue("Aim: to test it.");
  h.toast.mockReset(); h.openDocument.mockReset(); h.go.mockReset(); h.setPendingSearch.mockReset();
  h.field = "psychology";
  resetHelperSession();
  editor = new Editor({ extensions: editorExtensions, content: `<p>${SELECTED}</p><p>${OTHER}</p>` });
});
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  document.body.innerHTML = "";
  editor.destroy();
  vi.restoreAllMocks();
});

describe("Research helpers in the document (Task 32)", () => {
  it("a 3,000-character selection reaches the helper though the bubble does not show", async () => {
    mount();
    select(1, 3001);
    // The bubble keeps its 8 to 800 characters.
    expect(selBubbleVisible({ empty: false, text: SELECTED })).toBe(false);
    await open();
    expect($("help-scope")!.textContent).toBe("On your selection (3,000 characters)");
    await click("help-litrev");
    const built = buildHelperPrompt("litrev", "psychology", SELECTED);
    expect(h.callAI).toHaveBeenCalledTimes(1);
    expect(h.callAI).toHaveBeenCalledWith(built.prompt, { temp: built.temp, max: built.max });
    // The builder cuts the text at 12,000 characters; a 3,000-character selection goes whole.
    expect((h.callAI.mock.calls[0]![0] as string).endsWith("\n\nText:\n" + SELECTED)).toBe(true);
  });

  it("the held selection still reaches the helper after the menu took the focus", async () => {
    mount();
    select(1, 3001);
    // What taking the focus does to a phone's live selection: it collapses while the document is not the one choosing.
    act(() => { editor.view.dom.dispatchEvent(new FocusEvent("blur")); editor.commands.setTextSelection(40); });
    await open();
    expect($("help-scope")!.textContent).toBe("On your selection (3,000 characters)");
    await click("help-paper");
    expect(h.callAI.mock.calls[0]![0]).toBe(buildHelperPrompt("paper", "psychology", SELECTED).prompt);
  });

  it("with nothing selected the helper reads the whole document", async () => {
    mount();
    await open();
    expect($("help-scope")!.textContent).toBe("On the whole document");
    await click("help-paper");
    const whole = docInnerText(editor.getHTML());
    expect(whole).toContain(OTHER);
    expect(h.callAI.mock.calls[0]![0]).toBe(buildHelperPrompt("paper", "psychology", whole).prompt);
  });

  it("a whole document over 12,000 characters says so and sends its first 12,000, as v1", async () => {
    act(() => { editor.commands.setContent(`<p>${"w".repeat(12000)}TAIL</p>`); });
    mount();
    await open();
    await click("help-paper");
    expect(h.toast).toHaveBeenCalledWith("Long document — analyzing the first 12,000 characters. Select a section for a sharper answer.");
    const sent = h.callAI.mock.calls[0]![0] as string;
    expect(sent.endsWith("\n\nText:\n" + "w".repeat(12000))).toBe(true);
    expect(sent).not.toContain("TAIL");
  });

  it("the menu lists the helpers in v1's order with what each one does, in plain words", async () => {
    mount();
    await open();
    const names = ITEMS.map((i) => $(i.testid)!.querySelector(".help-item-name")!.textContent);
    expect(names).toEqual(["Paper helper", "Explain a case", "Literature review helper", "Explain the statistics", "Format results in APA", "Challenge my argument"]);
    expect([...$("help-menu")!.querySelectorAll("button.help-item")].map((b) => b.getAttribute("data-testid"))).toEqual(ITEMS.map((i) => i.testid));
    for (const i of ITEMS) expect($(i.testid)!.querySelector(".help-item-what")!.textContent!.length).toBeGreaterThan(20);
    expect($("help-menu")!.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("after a helper runs the menu is one click away and the result is beside the document (W25)", async () => {
    mount();
    select(1, 3001);
    await open();
    await click("help-litrev");
    // The menu closes; the toolbar button is still there, and so is the place: nothing navigated.
    expect($("help-menu")).toBeNull();
    expect($("help-with-text")).not.toBeNull();
    expect(h.go).not.toHaveBeenCalled();
    // The answer is in the pane beside the document, gold-edged and labelled with what it is and what to check.
    expect(h.openDocument).toHaveBeenCalled();
    const aside = $("doc-aside")!;
    expect(aside.querySelector('[data-testid="ai-out"]')!.textContent).toBe("Aim: to test it.");
    expect($("ai-out")!.classList.contains("ai-answer")).toBe(true);
    expect($("ai-source")!.textContent).toContain("Literature review helper");
    expect($("ai-source")!.textContent).toContain("On your selection (3,000 characters)");
    expect($("ai-check")!.textContent).toBe(E.help_check);
    // Tab and Accept still insert it; one more click reopens the menu on the same selection.
    expect($("ai-accept")).not.toBeNull();
    await open();
    expect($("help-scope")!.textContent).toBe("On your selection (3,000 characters)");
  });

  it("the gold edge is in the stylesheet", () => {
    const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
    expect(css).toMatch(/\.ai-out\.ai-answer\s*\{[^}]*var\(--gold\)/);
  });

  it("Challenge my argument is never inserted", async () => {
    h.callAI.mockResolvedValue("1. You write that students sleep badly, but you give no counts.");
    mount();
    await open();
    await click("help-devil");
    const built = buildDevilPrompt(docInnerText(editor.getHTML()));
    expect(h.callAI).toHaveBeenCalledWith(built.prompt, { temp: 0.5, max: 1800 });
    expect($("ai-out")!.textContent).toBe(E.devil_label + "\n\n1. You write that students sleep badly, but you give no counts.");
    expect($("ai-source")!.textContent).toContain("Challenge my argument");
    expect($("ai-source")!.textContent).toContain("On the whole document");
    // Nothing to accept: no button for it, Tab is not taken, and the document is as it was.
    expect(sugNow().sug).toBeNull();
    expect($("ai-accept")).toBeNull();
    expect(sugNow().tab()).toBe(false);
    expect(editor.getHTML()).not.toContain("ai-ins");
    expect(editor.getHTML()).toBe(`<p>${SELECTED}</p><p>${OTHER}</p>`);
    // Dismiss stays; there is nothing to copy either (v1: "Nothing to copy yet").
    expect($("ai-copy")).toBeNull();
    expect($("ai-dismiss")).not.toBeNull();
  });

  it("a helper's answer is inserted by Tab as AI text", async () => {
    mount();
    await open();
    await click("help-paper");
    expect(sugNow().sug).toBe("Aim: to test it.");
    act(() => { expect(sugNow().tab()).toBe(true); });
    expect(editor.getHTML()).toContain('class="ai-ins"');
    expect(editor.getText()).toContain("Aim: to test it.");
  });

  it("the prompts and their AI-use labels are unchanged", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const LABELS: Record<string, string> = {
      paper: "summarising a paper", case: "analysing a case description", litrev: "advice on building a literature review",
      explain: "explaining a concept", stats: "formatting statistics output in APA style", devil: "counter-arguments to my passage"
    };
    mount();
    select(1, 3001);
    for (const { testid, kind } of ITEMS) {
      h.callAI.mockClear();
      await open();
      await click(testid);
      expect(h.callAI, kind).toHaveBeenCalledTimes(1);
      const built = kind === "devil" ? buildDevilPrompt(SELECTED) : buildHelperPrompt(kind, "psychology", SELECTED);
      expect(h.callAI, kind).toHaveBeenCalledWith(built.prompt, { temp: built.temp, max: built.max });
      expect(classifyAiUse(h.callAI.mock.calls[0]![0] as string)?.k, kind).toBe(LABELS[kind]);
    }
  });

  it("the case helper asks the APA 4.07 question once for the tab, through the browser's confirm", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    mount();
    await open();
    await click("help-case");
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0]![0]).toContain("APA Ethics 4.07");
    await open();
    await click("help-case");
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(h.callAI).toHaveBeenCalledTimes(2);
    expect(setItem).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
    // Leaving the document and coming back in the same tab keeps the yes; a reload (the reset) asks again.
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    mount();
    await open();
    await click("help-case");
    expect(confirm).toHaveBeenCalledTimes(1);
    resetHelperSession();
    await open();
    await click("help-case");
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("a declined case question sends nothing and keeps the menu closed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    mount();
    await open();
    await click("help-case");
    expect(h.callAI).not.toHaveBeenCalled();
    expect($("doc-aside")).toBeNull();
  });

  it("text that is too short toasts v1's sentence and sends nothing", async () => {
    act(() => { editor.commands.setContent("<p>Too short.</p>"); });
    mount();
    await open();
    await click("help-paper");
    expect(h.toast).toHaveBeenCalledWith("Write or select some text first, then tap the tool");
    expect(h.callAI).not.toHaveBeenCalled();
  });

  it("a failed answer shows its message in the pane and keeps the menu one click away", async () => {
    h.callAI.mockRejectedValue(new Error("The AI is busy. Try again."));
    mount();
    await open();
    await click("help-paper");
    expect($("ai-out")!.textContent).toBe("The AI is busy. Try again.");
    expect($("ai-out")!.classList.contains("ai-answer")).toBe(false);
    expect($("ai-source")).toBeNull();
    await open();
  });

  it("the menu reaches the field of study", async () => {
    h.field = "  nursing ";
    mount();
    await open();
    await click("help-paper");
    expect(h.callAI.mock.calls[0]![0]).toBe(buildHelperPrompt("paper", "nursing", docInnerText(editor.getHTML())).prompt);
  });
});

describe("where the menu is opened from", () => {
  it("the format bar has Help with this text first, on a phone too, and it opens the menu", async () => {
    mount(true);
    const bar = $("format-bar")!;
    const first = bar.querySelector("button")!;
    expect(first.getAttribute("data-testid")).toBe("help-with-text");
    expect(first.textContent).toBe("Help with this text");
    await open();
    expect($("help-menu")!.querySelector("[role=dialog], [data-slot=dialog-title]")).not.toBeNull();
  });

  it("the toolbar button does not take the focus from the document", () => {
    mount();
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    $("help-with-text")!.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
  });

  it("the selection bubble adds More help, which opens the same menu on the same selection", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    roots.push(root);
    act(() => { root.render(<SuggestionProvider><Harness /><SelectionBubble editor={editor} /></SuggestionProvider>); });
    select(1, 500);
    const more = $("sel-more")!;
    expect(more.textContent).toBe("More help");
    expect([...$("sel-bubble")!.querySelectorAll("button")].map((b) => b.getAttribute("data-testid"))).toEqual(["sel-find", "sel-cite", "sel-improve", "sel-more"]);
    await click("sel-more");
    expect($("help-menu")).not.toBeNull();
    expect($("help-scope")!.textContent).toBe("On your selection (499 characters)");
  });
});
