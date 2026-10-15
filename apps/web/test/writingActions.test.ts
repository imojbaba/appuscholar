import { describe, expect, it, vi, type Mock } from "vitest";
import { accCheck, buildDraftFirstPrompt, buildWritingPrompt } from "@appuscholar/core";
import { runDraftFirst, runWritingAction, type ActionDeps } from "../lib/ai/actions";
import { apiMsg } from "../lib/ai/callAI";
import en from "../messages/en.json";

const t = (k: string) => (en as Record<string, string>)[k] ?? k;
const TAIL = "Sleep matters. ".repeat(12) + "Around 40 students took part.";

type Mocked = { [K in keyof ActionDeps]: Mock<Extract<ActionDeps[K], (...a: never[]) => unknown>> };
function deps(over: Partial<ActionDeps> & { selection?: string } = {}) {
  const log: string[] = [];
  const d: ActionDeps & Record<string, unknown> = {
    callAI: vi.fn(async () => "Reply with 25% more."),
    hasSelection: vi.fn(() => !!over.selection),
    selectionText: vi.fn(() => over.selection ?? ""),
    selectionRange: vi.fn(() => (over.selection ? { from: 5, to: 5 + over.selection.length, text: over.selection } : null)),
    tailText: vi.fn(() => TAIL),
    setThinking: vi.fn((s: string, _range?: unknown) => { log.push("thinking:" + s); return 1; }),
    isCurrent: vi.fn(() => true),
    set: vi.fn<ActionDeps["set"]>(() => void log.push("set")),
    setFeedback: vi.fn(() => void log.push("feedback")),
    clear: vi.fn(() => void log.push("clear")),
    dockShow: vi.fn(),
    toast: vi.fn(),
    t,
    draftFirst: false,
    ...over
  };
  return { d: d as ActionDeps, m: d as unknown as Mocked, log };
}

describe("runWritingAction", () => {
  it("Improve with no selection toasts and makes no call", async () => {
    const { d, m } = deps();
    await runWritingAction("improve", d);
    expect(m.toast).toHaveBeenCalledWith("Select the text you want to improve first");
    expect(m.callAI).not.toHaveBeenCalled();
    expect(m.setThinking).not.toHaveBeenCalled();
  });
  it("Extend with no selection toasts the expand sentence", async () => {
    const { d, m } = deps();
    await runWritingAction("expand", d);
    expect(m.toast).toHaveBeenCalledWith("Select the text you want to expand first");
    expect(m.callAI).not.toHaveBeenCalled();
  });
  it("Continue sends the tail in the Continue prompt, then stores the result with its accuracy note", async () => {
    const { d, m, log } = deps();
    await runWritingAction("continue", d);
    const built = buildWritingPrompt("continue", TAIL);
    expect(m.callAI).toHaveBeenCalledWith(built.prompt, { temp: built.temp, max: built.max });
    expect(log[0]).toBe("thinking:thinking");
    expect(m.setThinking).toHaveBeenCalledWith("thinking", null);
    expect(m.set).toHaveBeenCalledWith("Reply with 25% more.", { msg: accCheck(TAIL, "Reply with 25% more.", "continue").msg, warn: true }, 1);
    expect(m.set.mock.calls[0]![1]!.msg).toContain("25%");
    expect(m.toast).toHaveBeenCalledWith("Suggestion ready — press Tab in the editor to accept");
    expect(m.dockShow).toHaveBeenCalledWith("ai");
  });
  it("Improve works on the selection, remembers that it replaces, and toasts the replace sentence", async () => {
    const { d, m } = deps({ selection: "Around 40 students took part." });
    await runWritingAction("improve", d);
    const built = buildWritingPrompt("improve", "Around 40 students took part.");
    expect(m.callAI).toHaveBeenCalledWith(built.prompt, { temp: built.temp, max: built.max });
    // The range is handed over when the request starts, so edits made while the AI thinks are mapped.
    expect(m.setThinking).toHaveBeenCalledWith("polishing", { from: 5, to: 5 + "Around 40 students took part.".length, text: "Around 40 students took part." });
    expect(m.set).toHaveBeenCalledWith("Reply with 25% more.", expect.objectContaining({ warn: true }), 1);
    expect(m.toast).toHaveBeenCalledWith("Ready — press Tab to replace your selection");
  });
  it("Extend uses the expanding status", async () => {
    const { d, m } = deps({ selection: "Short text." });
    await runWritingAction("expand", d);
    expect(m.setThinking).toHaveBeenCalledWith("expanding", expect.objectContaining({ text: "Short text." }));
    expect(m.toast).toHaveBeenCalledWith("Ready — press Tab to replace your selection");
  });
  it("a clean result has a note that is not a warning", async () => {
    const { d, m } = deps({ callAI: vi.fn(async () => "Nothing numeric here.") });
    await runWritingAction("continue", d);
    expect(m.set.mock.calls[0]![1]).toEqual({ msg: accCheck(TAIL, "Nothing numeric here.", "continue").msg, warn: false });
  });
  it("an error from callAI clears with the message and toasts it", async () => {
    const { d, m } = deps({ callAI: vi.fn(async () => { throw new Error(apiMsg("network")); }) });
    await runWritingAction("continue", d);
    expect(m.clear).toHaveBeenCalledWith(apiMsg("network"));
    expect(m.toast).toHaveBeenCalledWith(apiMsg("network"));
    expect(m.set).not.toHaveBeenCalled();
    expect(m.dockShow).toHaveBeenCalledWith("ai");
  });
  it("with Draft first on, Continue delegates to the supervisor", async () => {
    const { d, m } = deps({ draftFirst: true });
    await runWritingAction("continue", d);
    const built = buildDraftFirstPrompt("tail", TAIL);
    expect(m.callAI).toHaveBeenCalledWith(built.prompt, { temp: built.temp, max: built.max });
    expect(m.set).not.toHaveBeenCalled();
  });
});

describe("runDraftFirst", () => {
  it("shows the label and the reply, keeps nothing insertable, and toasts df_ready", async () => {
    const { d, m } = deps({ draftFirst: true });
    await runDraftFirst("tail", d);
    expect(m.setFeedback).toHaveBeenCalledWith(t("df_label") + "\n\n" + "Reply with 25% more.", 1);
    expect(m.set).not.toHaveBeenCalled();
    expect(m.toast).toHaveBeenCalledWith(t("df_ready"));
    expect(m.setThinking).toHaveBeenCalledWith("reading");
  });
  it("needs about 25 words for the tail", async () => {
    const { d, m } = deps({ tailText: vi.fn(() => "one two three four five six seven eight nine ten") });
    await runDraftFirst("tail", d);
    expect(m.toast).toHaveBeenCalledWith(t("df_need_text"));
    expect(m.callAI).not.toHaveBeenCalled();
  });
  it("Improve and Extend need a selection", async () => {
    const { d, m } = deps();
    await runDraftFirst("improve", d);
    await runDraftFirst("expand", d);
    expect(m.toast).toHaveBeenCalledTimes(2);
    expect(m.toast).toHaveBeenCalledWith(t("df_need_sel"));
    expect(m.callAI).not.toHaveBeenCalled();
  });
  it("Improve with a selection sends the selection to the improve supervisor prompt", async () => {
    const { d, m } = deps({ selection: "Some selected words." });
    await runDraftFirst("improve", d);
    const built = buildDraftFirstPrompt("improve", "Some selected words.");
    expect(m.callAI).toHaveBeenCalledWith(built.prompt, { temp: built.temp, max: built.max });
  });
  it("an error clears with the message and toasts it", async () => {
    const { d, m } = deps({ callAI: vi.fn(async () => { throw new Error("boom"); }) });
    await runDraftFirst("tail", d);
    expect(m.clear).toHaveBeenCalledWith("boom");
    expect(m.toast).toHaveBeenCalledWith("boom");
  });
  it("with Draft first on, Improve and Extend delegate with the matching kind", async () => {
    const { d, m } = deps({ draftFirst: true, selection: "Chosen." });
    await runWritingAction("improve", d);
    await runWritingAction("expand", d);
    expect(m.callAI).toHaveBeenNthCalledWith(1, buildDraftFirstPrompt("improve", "Chosen.").prompt, expect.anything());
    expect(m.callAI).toHaveBeenNthCalledWith(2, buildDraftFirstPrompt("expand", "Chosen.").prompt, expect.anything());
  });
});

describe("a request that is no longer current", () => {
  it("is ignored when the document was switched or the pane dismissed while it was in flight", async () => {
    let current = 1;
    let resolve!: (v: string) => void;
    const { d, m } = deps({
      isCurrent: vi.fn((tok: number) => tok === current),
      callAI: vi.fn(() => new Promise<string>((r) => { resolve = r; }))
    });
    const run = runWritingAction("continue", d);
    current = 2; // switch editor or Dismiss bumps the token
    resolve("Late answer with 99%.");
    await run;
    expect(m.set).not.toHaveBeenCalled();
    expect(m.toast).not.toHaveBeenCalled();
    expect(m.clear).not.toHaveBeenCalled();
  });
  it("a late Draft first answer is ignored too", async () => {
    let current = 1;
    let resolve!: (v: string) => void;
    const { d, m } = deps({
      isCurrent: vi.fn((tok: number) => tok === current),
      callAI: vi.fn(() => new Promise<string>((r) => { resolve = r; }))
    });
    const run = runDraftFirst("tail", d);
    current = 2;
    resolve("late");
    await run;
    expect(m.setFeedback).not.toHaveBeenCalled();
    expect(m.toast).not.toHaveBeenCalled();
  });
  it("a late error is ignored too", async () => {
    let current = 1;
    let reject!: (e: Error) => void;
    const { d, m } = deps({
      isCurrent: vi.fn((tok: number) => tok === current),
      callAI: vi.fn(() => new Promise<string>((_r, j) => { reject = j; }))
    });
    const run = runWritingAction("continue", d);
    current = 2;
    reject(new Error("boom"));
    await run;
    expect(m.clear).not.toHaveBeenCalled();
    expect(m.toast).not.toHaveBeenCalled();
  });
});
