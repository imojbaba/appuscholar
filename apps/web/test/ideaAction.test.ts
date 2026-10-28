import { describe, expect, it, vi, type Mock } from "vitest";
import { buildIdeaPromptV2, classifyAiUse, fieldLabel } from "@appuscholar/core";
import { checkIdea, IDEA_NEED_TOPIC, type IdeaDeps } from "../lib/ai/actions";
import { apiMsg } from "../lib/ai/callAI";

const INTAKE = { topic: "  Does sleep quality predict exam performance?  ", resources: "120 first-years", timeframe: "one semester", constraints: "" };

type Mocked = { [K in keyof IdeaDeps]: Mock<Extract<IdeaDeps[K], (...a: never[]) => unknown>> };
function deps(over: Partial<IdeaDeps> = {}) {
  const d: IdeaDeps & Record<string, unknown> = {
    callAI: vi.fn(async () => "Topic clarity: High. ..."),
    toast: vi.fn(),
    field: fieldLabel("psychology"),
    intake: INTAKE,
    ...over
  };
  return { d: d as IdeaDeps, m: d as unknown as Mocked };
}

describe("checkIdea (v1 ideaAssess 8568-8580)", () => {
  it("an empty working idea (spaces only) toasts v1's sentence and sends nothing", async () => {
    const { d, m } = deps({ intake: { ...INTAKE, topic: "   \n " } });
    expect(await checkIdea(d)).toBeNull();
    expect(IDEA_NEED_TOPIC).toBe("Describe your working idea first");
    expect(m.toast).toHaveBeenCalledWith("Describe your working idea first");
    expect(m.callAI).not.toHaveBeenCalled();
  });

  it("sends buildIdeaPromptV2(field, intake) with v1's temp 0.3 and max 1200, the prompt is logged as checking an idea", async () => {
    const { d, m } = deps({ field: fieldLabel("  nursing  ") });
    await checkIdea(d);
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
    await checkIdea(d);
    const sent = m.callAI.mock.calls[0]![0] as string;
    expect(sent).toContain("Working idea: " + "t".repeat(2000) + "\n");
    expect(sent).toContain("What they have access to: " + "r".repeat(1000) + "\n");
    expect(sent).toContain("Timeframe: " + "f".repeat(1200) + "\n");
    expect(sent.endsWith("Other constraints: " + "c".repeat(1000))).toBe(true);
  });

  it("the read comes back as the engine wrote it, with no toast", async () => {
    const { d, m } = deps();
    expect(await checkIdea(d)).toBe("Topic clarity: High. ...");
    expect(m.toast).not.toHaveBeenCalled();
  });

  it("a failure toasts its message and reads nothing", async () => {
    const { d, m } = deps({ callAI: vi.fn(async () => { throw new Error(apiMsg("network")); }) });
    expect(await checkIdea(d)).toBeNull();
    expect(m.toast).toHaveBeenCalledWith(apiMsg("network"));
  });
});
