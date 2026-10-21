import { describe, it, expect, vi } from "vitest";
import { TOOL_TO_STAGE, TOOLS_BY_STAGE } from "../lib/tools";
import { BUILT_IN } from "../lib/tools/registry";

// Every tool module this file does not turn on is pinned to its unbuilt stub, so a tool session turning its own module on never changes
// what this file sees (session C, 2026-10-21).
vi.mock("@/components/tools/design", () => ({ built: false }));
vi.mock("@/components/tools/stats", () => ({ built: false }));
vi.mock("@/components/tools/qual", () => ({ built: false }));
vi.mock("@/components/tools/style", () => ({ built: false }));
vi.mock("@/components/tools/words", () => ({ built: false }));
vi.mock("@/components/tools/close", () => ({ built: false }));
vi.mock("@/components/tools/slides", () => ({ built: false }));
vi.mock("@/components/tools/viva", () => ({ built: false }));
describe("v1 tool registry", () => {
  it("maps every tool to one stage and lists them in v1 sidebar order", () => {
    expect(TOOLS_BY_STAGE).toEqual({ idea:["idea"], lit:["research","psych","analyse"], design:["design"], collect:["stats","qual"], writing:["style","words","cite","chat"], review:["close","slides"] });
    for (const [tool, stage] of Object.entries(TOOL_TO_STAGE)) expect(TOOLS_BY_STAGE[stage as keyof typeof TOOLS_BY_STAGE]).toContain(tool);
  });
  it("BUILT_IN is chat and the six stage-2 tools, each a registered tool", () => {
    expect([...BUILT_IN].sort()).toEqual(["analyse", "chat", "cite", "idea", "psych", "research"]);
    for (const id of BUILT_IN) expect(TOOL_TO_STAGE[id]).toBeDefined();
  });
});
