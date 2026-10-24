import { describe, expect, it, vi, type Mock } from "vitest";
import { buildDevilPrompt, buildHelperPrompt, DEVIL_MIN_WORDS, fieldLabel, HELPER_MIN_CHARS, HELPER_TEMPS, type HelperKind } from "@appuscholar/core";
import {
  HELPER_CASE_ACK_KEY, HELPER_CASE_CONFIRM, HELPER_LONG_DOC, HELPER_NEED_TEXT, HELPER_THINKING,
  runDevil, runHelper, type HelperDeps
} from "../lib/ai/actions";
import { apiMsg } from "../lib/ai/callAI";
import en from "../messages/en.json";

const E = en as Record<string, string>;
/** t() with its {name} fill-ins, as the app's own. */
const fmt = (k: string, vars?: Record<string, string | number>) => (E[k] ?? k).replace(/\{(\w+)\}/g, (m, n: string) => (vars && n in vars ? String(vars[n]) : m));
const PASSAGE = "Sleep quality predicted exam scores in a sample of 120 first-year students (r = .41, p < .001).";

type Mocked = { [K in keyof HelperDeps]: Mock<Extract<HelperDeps[K], (...a: never[]) => unknown>> };
function deps(over: Partial<HelperDeps> & { store?: Map<string, string> } = {}) {
  const log: string[] = [];
  const store = over.store ?? new Map<string, string>();
  const d: HelperDeps & Record<string, unknown> = {
    callAI: vi.fn(async () => { log.push("call"); return "Aim: ..."; }),
    hasSelection: vi.fn(() => true),
    selectionText: vi.fn(() => PASSAGE),
    docText: vi.fn(() => "the whole document " + PASSAGE),
    setThinking: vi.fn((s: string, _range?: unknown, label?: string) => { log.push(`thinking:${s}:${label}`); return 7; }),
    isCurrent: vi.fn(() => true),
    set: vi.fn<HelperDeps["set"]>(() => void log.push("set")),
    setFeedback: vi.fn<HelperDeps["setFeedback"]>(() => void log.push("feedback")),
    clear: vi.fn(() => void log.push("clear")),
    toast: vi.fn((m: string) => void log.push("toast:" + m)),
    t: vi.fn(fmt),
    confirm: vi.fn(() => { log.push("confirm"); return true; }),
    session: { get: vi.fn((k: string) => store.get(k) ?? null), set: vi.fn((k: string, v: string) => void store.set(k, v)) },
    field: fieldLabel("psychology"),
    ...over
  };
  return { d: d as HelperDeps, m: d as unknown as Mocked, log, store };
}
const KINDS: HelperKind[] = ["paper", "case", "litrev", "explain", "stats"];

describe("runHelper (v1 psychTool 8600-8615)", () => {
  it("v1's script sentences, byte for byte", () => {
    expect(HELPER_NEED_TEXT).toBe("Write or select some text first, then tap the tool");
    expect(HELPER_LONG_DOC).toBe("Long document — analyzing the first 12,000 characters. Select a section for a sharper answer.");
    expect(E.rs2_ready_press_tab_in).toBe("Ready — press Tab in the editor to insert");
    expect(HELPER_THINKING).toBe("\u{1F49C} Thinking…");
    expect(HELPER_CASE_CONFIRM).toBe("This text will be sent to your AI provider.\n\nRemove names, dates of birth, addresses and any other identifying details before you continue (APA Ethics 4.07).\n\nContinue?");
    expect(HELPER_CASE_ACK_KEY).toBe("appu_case_ack");
  });

  it("a trimmed text of 39 characters toasts v1's sentence and sends nothing; 40 is sent", async () => {
    expect(HELPER_MIN_CHARS).toBe(40);
    const short = deps({ selectionText: vi.fn(() => "  " + "a".repeat(39) + " \n") });
    await runHelper("paper", short.d);
    expect(short.m.toast).toHaveBeenCalledWith("Write or select some text first, then tap the tool");
    expect(short.m.callAI).not.toHaveBeenCalled();
    expect(short.m.setThinking).not.toHaveBeenCalled();
    const ok = deps({ selectionText: vi.fn(() => "  " + "a".repeat(40) + " \n") });
    await runHelper("paper", ok.d);
    expect(ok.m.callAI).toHaveBeenCalledTimes(1);
    expect(ok.m.toast).not.toHaveBeenCalledWith(HELPER_NEED_TEXT);
  });

  it("the selection when there is one, the whole document otherwise", async () => {
    const sel = deps();
    await runHelper("explain", sel.d);
    expect(sel.m.docText).not.toHaveBeenCalled();
    expect(sel.m.callAI.mock.calls[0]![0]).toBe(buildHelperPrompt("explain", "psychology", PASSAGE).prompt);
    const whole = deps({ hasSelection: vi.fn(() => false) });
    await runHelper("explain", whole.d);
    expect(whole.m.selectionText).not.toHaveBeenCalled();
    expect(whole.m.callAI.mock.calls[0]![0]).toBe(buildHelperPrompt("explain", "psychology", "the whole document " + PASSAGE).prompt);
  });

  it.each(KINDS)("%s sends buildHelperPrompt(kind, field, text) with HELPER_TEMPS[kind] and max 2500", async (kind) => {
    const { d, m } = deps({ field: fieldLabel("  nursing ") });
    await runHelper(kind, d);
    const built = buildHelperPrompt(kind, "nursing", PASSAGE);
    expect(built.temp).toBe(HELPER_TEMPS[kind]);
    expect(built.max).toBe(2500);
    expect(m.callAI).toHaveBeenCalledWith(built.prompt, { temp: HELPER_TEMPS[kind], max: 2500 });
    expect((m.callAI.mock.calls[0]![0] as string).endsWith("\n\nText:\n" + PASSAGE)).toBe(true);
  });

  it("a whole document over 12,000 characters toasts the long-document notice and sends its first 12,000", async () => {
    const doc = "w".repeat(12000) + "TAIL";
    const { d, m, log } = deps({ hasSelection: vi.fn(() => false), docText: vi.fn(() => doc) });
    await runHelper("paper", d);
    expect(m.toast).toHaveBeenCalledWith(HELPER_LONG_DOC);
    const sent = m.callAI.mock.calls[0]![0] as string;
    expect(sent.endsWith("\n\nText:\n" + "w".repeat(12000))).toBe(true);
    expect(sent).not.toContain("TAIL");
    expect(log.indexOf("toast:" + HELPER_LONG_DOC)).toBeLessThan(log.indexOf("call"));
  });

  it("a whole document of exactly 12,000 characters gets no notice", async () => {
    const { d, m } = deps({ hasSelection: vi.fn(() => false), docText: vi.fn(() => "w".repeat(12000)) });
    await runHelper("paper", d);
    expect(m.toast).not.toHaveBeenCalledWith(HELPER_LONG_DOC);
  });

  it("a selection over 12,000 characters is cut the same way, with no notice", async () => {
    const { d, m } = deps({ selectionText: vi.fn(() => "s".repeat(12000) + "TAIL") });
    await runHelper("stats", d);
    expect(m.toast).not.toHaveBeenCalledWith(HELPER_LONG_DOC);
    expect((m.callAI.mock.calls[0]![0] as string).endsWith("\n\nText:\n" + "s".repeat(12000))).toBe(true);
  });

  it("the pane says v1's sentence while it thinks, then holds the answer as an insertable suggestion, then toasts", async () => {
    const { d, m, log } = deps();
    await runHelper("litrev", d);
    expect(m.setThinking).toHaveBeenCalledWith("custom", null, "\u{1F49C} Thinking…");
    // The fourth argument names what the answer is, for the label beside the document (Task 32).
    expect(m.set).toHaveBeenCalledWith("Aim: ...", null, 7, { title: "Literature review helper", scope: `On your selection (${PASSAGE.length} characters)` });
    expect(m.setFeedback).not.toHaveBeenCalled();
    expect(log).toEqual(["thinking:custom:\u{1F49C} Thinking…", "call", "set", "toast:Ready — press Tab in the editor to insert"]);
  });

  it("the case tool asks v1's APA 4.07 confirm once per session; the yes is kept under appu_case_ack", async () => {
    const store = new Map<string, string>();
    const first = deps({ store });
    await runHelper("case", first.d);
    expect(first.m.confirm).toHaveBeenCalledWith(HELPER_CASE_CONFIRM);
    expect(store.get("appu_case_ack")).toBe("1");
    expect(first.m.callAI).toHaveBeenCalledTimes(1);
    const second = deps({ store });
    await runHelper("case", second.d);
    expect(second.m.confirm).not.toHaveBeenCalled();
    expect(second.m.callAI).toHaveBeenCalledTimes(1);
  });

  it("a declined confirm sends nothing, keeps nothing, and asks again next time", async () => {
    const store = new Map<string, string>();
    const no = deps({ store, confirm: vi.fn(() => false) });
    await runHelper("case", no.d);
    expect(no.m.callAI).not.toHaveBeenCalled();
    expect(no.m.setThinking).not.toHaveBeenCalled();
    expect(store.has("appu_case_ack")).toBe(false);
    const again = deps({ store });
    await runHelper("case", again.d);
    expect(again.m.confirm).toHaveBeenCalledTimes(1);
  });

  it("the confirm comes after the size guard and before the long-document notice (v1's order)", async () => {
    const short = deps({ selectionText: vi.fn(() => "too short") });
    await runHelper("case", short.d);
    expect(short.m.confirm).not.toHaveBeenCalled();
    const long = deps({ hasSelection: vi.fn(() => false), docText: vi.fn(() => "c".repeat(12001)) });
    await runHelper("case", long.d);
    expect(long.log.slice(0, 2)).toEqual(["confirm", "toast:" + HELPER_LONG_DOC]);
    const declined = deps({ hasSelection: vi.fn(() => false), docText: vi.fn(() => "c".repeat(12001)), confirm: vi.fn(() => false) });
    await runHelper("case", declined.d);
    expect(declined.m.toast).not.toHaveBeenCalled();
  });

  it("the other four tools never confirm", async () => {
    for (const kind of KINDS.filter((k) => k !== "case")) {
      const { d, m } = deps();
      await runHelper(kind, d);
      expect(m.confirm).not.toHaveBeenCalled();
    }
  });

  it("a failure goes through the writing actions' error path; a superseded request is dropped", async () => {
    const bad = deps({ callAI: vi.fn(async () => { throw new Error(apiMsg("network")); }) });
    await runHelper("paper", bad.d);
    expect(bad.m.clear).toHaveBeenCalledWith(apiMsg("network"));
    expect(bad.m.toast).toHaveBeenCalledWith(apiMsg("network"));
    expect(bad.m.set).not.toHaveBeenCalled();
    const stale = deps({ isCurrent: vi.fn(() => false) });
    await runHelper("paper", stale.d);
    expect(stale.m.set).not.toHaveBeenCalled();
    expect(stale.m.toast).not.toHaveBeenCalled();
  });
});

describe("runDevil (v1 devilTool 8619-8630)", () => {
  const words = (n: number) => Array.from({ length: n }, (_, i) => "w" + i).join(" \n ");

  it("24 words toasts devil_need and sends nothing; 25 is sent with buildDevilPrompt, temp 0.5, max 1800", async () => {
    expect(DEVIL_MIN_WORDS).toBe(25);
    const short = deps({ selectionText: vi.fn(() => "  " + words(24) + "  ") });
    await runDevil(short.d);
    expect(short.m.toast).toHaveBeenCalledWith(E.devil_need);
    expect(short.m.callAI).not.toHaveBeenCalled();
    expect(short.m.setThinking).not.toHaveBeenCalled();
    const ok = deps({ selectionText: vi.fn(() => "  " + words(25) + "  ") });
    await runDevil(ok.d);
    const built = buildDevilPrompt(words(25));
    expect(built.temp).toBe(0.5);
    expect(built.max).toBe(1800);
    expect(ok.m.callAI).toHaveBeenCalledWith(built.prompt, { temp: 0.5, max: 1800 });
  });

  it("the selection when there is one, the whole document otherwise; the builder cuts at 6,000", async () => {
    const long = words(30) + " " + "x".repeat(7000);
    const whole = deps({ hasSelection: vi.fn(() => false), docText: vi.fn(() => long) });
    await runDevil(whole.d);
    expect(whole.m.selectionText).not.toHaveBeenCalled();
    const sent = whole.m.callAI.mock.calls[0]![0] as string;
    expect(sent).toBe(buildDevilPrompt(long).prompt);
    expect(sent.endsWith("\n\nPASSAGE:\n" + long.slice(0, 6000))).toBe(true);
    expect(whole.m.toast).not.toHaveBeenCalledWith(HELPER_LONG_DOC);
  });

  it("the answer is feedback (never insertable), labelled devil_label, with devil_thinking while it waits and devil_ready after", async () => {
    const { d, m, log } = deps({ selectionText: vi.fn(() => words(40)), callAI: vi.fn(async () => { log.push("call"); return "1. ..."; }) });
    await runDevil(d);
    expect(m.setThinking).toHaveBeenCalledWith("custom", null, E.devil_thinking);
    expect(m.setFeedback).toHaveBeenCalledWith(E.devil_label + "\n\n1. ...", 7, { title: "Challenge my argument", scope: `On your selection (${words(40).trim().length} characters)` });
    expect(m.set).not.toHaveBeenCalled();
    expect(log).toEqual([`thinking:custom:${E.devil_thinking}`, "call", "feedback", "toast:" + E.devil_ready]);
  });

  it("a failure goes through the shared error path; a superseded request is dropped", async () => {
    const bad = deps({ selectionText: vi.fn(() => words(40)), callAI: vi.fn(async () => { throw new Error("boom"); }) });
    await runDevil(bad.d);
    expect(bad.m.clear).toHaveBeenCalledWith("boom");
    expect(bad.m.toast).toHaveBeenCalledWith("boom");
    expect(bad.m.setFeedback).not.toHaveBeenCalled();
    const stale = deps({ selectionText: vi.fn(() => words(40)), isCurrent: vi.fn(() => false) });
    await runDevil(stale.d);
    expect(stale.m.setFeedback).not.toHaveBeenCalled();
    expect(stale.m.toast).not.toHaveBeenCalled();
  });
});

describe("the helpers read the held selection through helperScope (Task 32)", () => {
  it("the answer is labelled with the helper and the text it read: the whole document with nothing held", async () => {
    const { d, m } = deps({ hasSelection: vi.fn(() => false) });
    await runHelper("paper", d);
    expect(m.set).toHaveBeenCalledWith("Aim: ...", null, 7, { title: "Paper helper", scope: "On the whole document" });
    const devil = deps({ hasSelection: vi.fn(() => false), docText: vi.fn(() => "word ".repeat(30)) });
    await runDevil(devil.d);
    expect(devil.m.setFeedback).toHaveBeenCalledWith(E.devil_label + "\n\nAim: ...", 7, { title: "Challenge my argument", scope: "On the whole document" });
  });

  it("a held selection of 3,000 characters is counted with its thousands separator", async () => {
    const { d, m } = deps({ selectionText: vi.fn(() => "x".repeat(3000)) });
    await runHelper("explain", d);
    expect(m.set.mock.calls[0]![3]).toEqual({ title: "Explain the statistics", scope: "On your selection (3,000 characters)" });
  });

  it("a held selection of white space only is read as the whole document, as the menu says", async () => {
    const { d, m } = deps({ selectionText: vi.fn(() => " \n \n "), docText: vi.fn(() => "the whole document " + PASSAGE) });
    await runHelper("litrev", d);
    expect(m.docText).toHaveBeenCalled();
    expect(m.callAI.mock.calls[0]![0]).toBe(buildHelperPrompt("litrev", "psychology", "the whole document " + PASSAGE).prompt);
    expect(m.set.mock.calls[0]![3]).toEqual({ title: "Literature review helper", scope: "On the whole document" });
  });

  it("the long-document notice is for a whole document only: a held selection of any length is cut by the builder without it", async () => {
    const { d, m } = deps({ selectionText: vi.fn(() => "s".repeat(20000)) });
    await runHelper("paper", d);
    expect(m.toast).not.toHaveBeenCalledWith(HELPER_LONG_DOC);
    expect((m.callAI.mock.calls[0]![0] as string).endsWith("\n\nText:\n" + "s".repeat(12000))).toBe(true);
  });

  it("a text longer than the builder keeps says so in the label: 12,000 for a helper, 6,000 for the devil's advocate", async () => {
    const long = deps({ selectionText: vi.fn(() => "s".repeat(20000)) });
    await runHelper("paper", long.d);
    expect(long.m.set.mock.calls[0]![3]).toEqual({ title: "Paper helper", scope: "On your selection (20,000 characters)", cut: "Only the first 12,000 characters were sent." });
    const exact = deps({ selectionText: vi.fn(() => "s".repeat(12000)) });
    await runHelper("paper", exact.d);
    expect(exact.m.set.mock.calls[0]![3]).toEqual({ title: "Paper helper", scope: "On your selection (12,000 characters)" });
    const devil = deps({ hasSelection: vi.fn(() => false), docText: vi.fn(() => ("word ".repeat(1500)).trim()) });
    await runDevil(devil.d);
    expect(devil.m.setFeedback.mock.calls[0]![2]).toEqual({ title: "Challenge my argument", scope: "On the whole document", cut: "Only the first 6,000 characters were sent." });
  });

  it("the stale-token and error paths carry no label", async () => {
    const bad = deps({ callAI: vi.fn(async () => { throw new Error("boom"); }) });
    await runHelper("paper", bad.d);
    expect(bad.m.set).not.toHaveBeenCalled();
    expect(bad.m.clear).toHaveBeenCalledWith("boom");
  });
});
