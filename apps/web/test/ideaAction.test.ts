import { describe, expect, it, vi, type Mock } from "vitest";
import { buildIdeaPromptV2, classifyAiUse, fieldLabel } from "@appuscholar/core";
import { assessIdea, IDEA_NEED_TOPIC, IDEA_THINKING, type IdeaDeps } from "../lib/ai/actions";
import { apiMsg } from "../lib/ai/callAI";
import en from "../messages/en.json";

const INTAKE = { topic: "  Does sleep quality predict exam performance?  ", resources: "120 first-years", timeframe: "one semester", constraints: "" };

type Mocked = { [K in keyof IdeaDeps]: Mock<Extract<IdeaDeps[K], (...a: never[]) => unknown>> };
function deps(over: Partial<IdeaDeps> = {}) {
  const log: string[] = [];
  const d: IdeaDeps & Record<string, unknown> = {
    callAI: vi.fn(async () => { log.push("call"); return "Topic clarity: High. ..."; }),
    setThinking: vi.fn((s: string, _range?: unknown, label?: string) => { log.push(`thinking:${s}:${label}`); return 7; }),
    isCurrent: vi.fn(() => true),
    set: vi.fn<IdeaDeps["set"]>(() => void log.push("set")),
    clear: vi.fn(() => void log.push("clear")),
    toast: vi.fn((m: string) => void log.push("toast:" + m)),
    t: vi.fn((k: string) => (en as Record<string, string>)[k] ?? k),
    field: fieldLabel("psychology"),
    intake: INTAKE,
    ...over
  };
  return { d: d as IdeaDeps, m: d as unknown as Mocked, log };
}

describe("assessIdea (v1 ideaAssess 8568-8580)", () => {
  it("an empty working idea (spaces only) toasts v1's sentence and sends nothing", async () => {
    const { d, m } = deps({ intake: { ...INTAKE, topic: "   \n " } });
    await assessIdea(d);
    expect(IDEA_NEED_TOPIC).toBe("Describe your working idea first");
    expect(m.toast).toHaveBeenCalledWith("Describe your working idea first");
    expect(m.callAI).not.toHaveBeenCalled();
    expect(m.setThinking).not.toHaveBeenCalled();
  });

  it("sends buildIdeaPromptV2(field, intake) with v1's temp 0.3 and max 1200, the prompt is logged as checking an idea", async () => {
    const { d, m } = deps({ field: fieldLabel("  nursing  ") });
    await assessIdea(d);
    const built = buildIdeaPromptV2("nursing", INTAKE);
    expect(built.temp).toBe(0.3);
    expect(built.max).toBe(1200);
    expect(m.callAI).toHaveBeenCalledWith(built.prompt, { temp: 0.3, max: 1200 });
    const sent = m.callAI.mock.calls[0]![0] as string;
    expect(sent).toContain("The student studies nursing.");
    expect(sent).toContain("\n\nWorking idea: Does sleep quality predict exam performance?\nWhat they have access to: 120 first-years\nTimeframe: one semester\nOther constraints: (none given)");
    expect(classifyAiUse(sent)).toEqual({ k: "checking whether my project idea is realistic", g: "feedback" });
  });

  it("the builder's cuts apply: 2,000 characters of the idea, 1,000 of access and of constraints, the timeframe whole", async () => {
    const long = { topic: "t".repeat(2500), resources: "r".repeat(1500), timeframe: "f".repeat(1200), constraints: "c".repeat(1500) };
    const { d, m } = deps({ intake: long });
    await assessIdea(d);
    const sent = m.callAI.mock.calls[0]![0] as string;
    expect(sent).toContain("Working idea: " + "t".repeat(2000) + "\n");
    expect(sent).toContain("What they have access to: " + "r".repeat(1000) + "\n");
    expect(sent).toContain("Timeframe: " + "f".repeat(1200) + "\n");
    expect(sent.endsWith("Other constraints: " + "c".repeat(1000))).toBe(true);
  });

  it("the pane says v1's sentence while it thinks, then holds the answer as an insertable suggestion with no accuracy note, then toasts", async () => {
    const { d, m, log } = deps();
    await assessIdea(d);
    expect(IDEA_THINKING).toBe("💜 Thinking this through…");
    expect(m.setThinking).toHaveBeenCalledWith("custom", null, "💜 Thinking this through…");
    expect(m.set).toHaveBeenCalledWith("Topic clarity: High. ...", null, 7);
    expect(m.t).toHaveBeenCalledWith("rs2_ready_press_tab_in");
    expect(log).toEqual(["thinking:custom:💜 Thinking this through…", "call", "set", "toast:Ready — press Tab in the editor to insert"]);
  });

  it("a failure goes through the writing actions' error path (pane message, toast)", async () => {
    const { d, m } = deps({ callAI: vi.fn(async () => { throw new Error(apiMsg("network")); }) });
    await assessIdea(d);
    expect(m.clear).toHaveBeenCalledWith(apiMsg("network"));
    expect(m.toast).toHaveBeenCalledWith(apiMsg("network"));
    expect(m.set).not.toHaveBeenCalled();
  });

  it("an answer or error for a superseded request is dropped", async () => {
    const ok = deps({ isCurrent: vi.fn(() => false) });
    await assessIdea(ok.d);
    expect(ok.m.set).not.toHaveBeenCalled();
    expect(ok.m.toast).not.toHaveBeenCalled();
    const bad = deps({ isCurrent: vi.fn(() => false), callAI: vi.fn(async () => { throw new Error("boom"); }) });
    await assessIdea(bad.d);
    expect(bad.m.clear).not.toHaveBeenCalled();
    expect(bad.m.toast).not.toHaveBeenCalled();
  });
});
