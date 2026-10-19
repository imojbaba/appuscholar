// @vitest-environment jsdom
import { createElement, act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { provHash } from "@appuscholar/core";
import { editorExtensions } from "../lib/editorExtensions";
import { selectionRange } from "../lib/editor/insert";

const ws = vi.hoisted(() => ({ dockShow: vi.fn(), setAiWaiting: vi.fn() }));
vi.mock("@/components/workspace/WorkspaceContext", () => ({ useWorkspace: () => ws }));
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));

import { SuggestionProvider, useSuggestion, type SuggestionValue } from "../lib/ai/suggestion";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The latest value the provider handed out (its callbacks are stable, so this is always current).
const seen: { value: SuggestionValue | null } = { value: null };
const api = new Proxy({} as SuggestionValue, { get: (_t, k) => (seen.value as unknown as Record<string | symbol, unknown>)[k] });
function Probe() { const v = useSuggestion(); useEffect(() => { seen.value = v; }); return null; }
let root: Root, host: HTMLElement;
beforeEach(() => {
  host = document.createElement("div");
  root = createRoot(host);
  act(() => root.render(createElement(SuggestionProvider, null, createElement(Probe))));
});
afterEach(() => { act(() => root.unmount()); });

const make = (content: string) => new Editor({ extensions: editorExtensions, content });

describe("SuggestionProvider", () => {
  it("keeps the range the request was made for through edits made while the AI thinks", () => {
    const ed = make("<p>aaa keep this drop this zzz</p>");
    act(() => api.setEditor(ed));
    ed.commands.setTextSelection({ from: 15, to: 24 });
    const range = selectionRange(ed)!;
    expect(range.text).toBe("drop this");
    let token = 0;
    act(() => { token = api.setThinking("polishing", range); });
    ed.commands.insertContentAt(1, "XX "); // typing at the top while the AI is thinking
    ed.commands.setTextSelection(1);        // and the cursor is somewhere else
    act(() => api.set("new", { msg: "ok", warn: false }, token));
    expect(api.sug).toBe("new");
    expect(api.selectionAtRequest).toBe(true);
    act(() => api.accept());
    expect(ed.getHTML()).toBe(`<p>XX aaa keep this <span class="ai-ins" data-h="${provHash("new")}">new</span> zzz</p>`);
    expect(api.sug).toBeNull();
    ed.destroy();
  });

  it("Continue has no range: the suggestion is appended at the end", () => {
    const ed = make("<p>mine</p>");
    act(() => api.setEditor(ed));
    let token = 0;
    act(() => { token = api.setThinking("thinking", null); });
    act(() => api.set("more", null, token));
    expect(api.selectionAtRequest).toBe(false);
    act(() => api.accept());
    expect(ed.getHTML()).toBe(`<p>mine</p><p><span class="ai-ins" data-h="${provHash("more")}">more</span></p>`);
    ed.destroy();
  });

  it("a document switch makes a late set ignored", () => {
    const a = make("<p>one</p>"), b = make("<p>two</p>");
    act(() => api.setEditor(a));
    let token = 0;
    act(() => { token = api.setThinking("thinking"); });
    act(() => api.setEditor(b));
    expect(api.status).toBe("idle");
    act(() => api.set("late", null, token));
    expect(api.sug).toBeNull();
    expect(api.text).toBeNull();
    expect(api.tab()).toBe(false);
    a.destroy(); b.destroy();
  });

  it("clear (Dismiss) makes a late set ignored", () => {
    const ed = make("<p>one</p>");
    act(() => api.setEditor(ed));
    let token = 0;
    act(() => { token = api.setThinking("polishing", null); });
    act(() => api.clear());
    act(() => api.set("late", null, token));
    expect(api.sug).toBeNull();
    expect(api.status).toBe("idle");
    expect(api.isCurrent(token)).toBe(false);
    ed.destroy();
  });

  it("a label given to setThinking is the pane's text while it thinks; set, setFeedback and clear drop it", () => {
    const ed = make("<p>one</p>");
    act(() => api.setEditor(ed));
    let token = 0;
    act(() => { token = api.setThinking("polishing"); });
    expect(api.statusLabel).toBeNull();
    act(() => { token = api.setThinking("custom", null, "💜 Thinking this through…"); });
    expect(api.status).toBe("custom");
    expect(api.statusLabel).toBe("💜 Thinking this through…");
    act(() => api.set("the read", null, token));
    expect(api.statusLabel).toBeNull();
    expect(api.sug).toBe("the read");
    expect(api.note).toBeNull();
    act(() => { token = api.setThinking("custom", null, "💜 Thinking this through…"); });
    act(() => api.setFeedback("questions", token));
    expect(api.statusLabel).toBeNull();
    act(() => { api.setThinking("custom", null, "💜 Thinking this through…"); });
    act(() => api.clear("Network error"));
    expect(api.statusLabel).toBeNull();
    expect(api.status).toBe("idle");
    ed.destroy();
  });

  it("feedback resets selectionAtRequest and is never insertable", () => {
    const ed = make("<p>one two</p>");
    act(() => api.setEditor(ed));
    let token = 0;
    act(() => { token = api.setThinking("polishing", { from: 1, to: 4, text: "one" }); });
    act(() => { token = api.setThinking("reading"); });
    act(() => api.setFeedback("questions", token));
    expect(api.selectionAtRequest).toBe(false);
    expect(api.sug).toBeNull();
    expect(api.tab()).toBe(false);
    ed.destroy();
  });
});
