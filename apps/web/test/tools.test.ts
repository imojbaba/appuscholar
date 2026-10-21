import { describe, it, expect } from "vitest";
import { TOOL_TO_STAGE, TOOLS_BY_STAGE, BUILT_IN, canPopOut } from "../lib/tools";
describe("v1 tool registry", () => {
  it("maps every tool to one stage and lists them in v1 sidebar order", () => {
    expect(TOOLS_BY_STAGE).toEqual({ idea:["idea"], lit:["research","psych","analyse"], design:["design"], collect:["stats","qual"], writing:["style","words","cite","chat"], review:["close","slides"] });
    for (const [tool, stage] of Object.entries(TOOL_TO_STAGE)) expect(TOOLS_BY_STAGE[stage as keyof typeof TOOLS_BY_STAGE]).toContain(tool);
  });
  it("only Citations and Research pop out", () => {
    expect(canPopOut("cite") && canPopOut("research") && !canPopOut("chat")).toBe(true);
  });
  it("BUILT_IN is chat and the six stage-2 tools, each a registered tool", () => {
    expect([...BUILT_IN].sort()).toEqual(["analyse", "chat", "cite", "idea", "psych", "research"]);
    for (const id of BUILT_IN) expect(TOOL_TO_STAGE[id]).toBeDefined();
  });
});
