// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";

/*
 * Task G2: the tool registry drives the stage 3 to 6 places, the home's built stages and BUILT_IN. Here one module (stats) is turned on by
 * mocking its index, as a tool session turns it on by setting `built` and exporting a Panel; every other module is the stub G2 ships.
 */

// A Panel is a component (ruling R33): this one is a memo with state, not a plain function.
vi.mock("@/components/tools/stats", async () => {
  const { memo, useState } = await import("react");
  return {
    built: true,
    Panel: memo(function StatsPanel({ tab, projectId }: { tab: string; projectId: string }) {
      const [where] = useState(() => tab + " in " + projectId);
      return <div data-testid="panel-stats">{where}</div>;
    })
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/p/p1" }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", scratchProjectId: "s1" }, settings: { field: "psychology" } }) }));
vi.mock("@/lib/vault/titles", () => ({ useTitle: () => ({ state: "open", text: "Sleep and exam anxiety" }) }));
vi.mock("@/components/frame/ProjectContext", () => ({
  useProject: () => ({ project: { id: "p1", title: "Sleep and exam anxiety", titleKeyVersion: 0 }, projectId: "p1", go: vi.fn(), docOpen: false, openDocument: vi.fn() })
}));
vi.mock("@/lib/blobs/useProjectBlob", () => ({ useProjectBlob: () => ({ value: null, loading: false, locked: false, set: () => {}, flush: async () => true }) }));

import { StagedPlace } from "../components/places/StagedPlace";
import { StageRows } from "../components/frame/StageRows";
import { BUILT_IN, TOOL_TABS, toolModule } from "../lib/tools/registry";
import { STAGE_ORDER, type StageKey } from "../lib/tools";
import type { StageState } from "../lib/frame/stages";
import type { HomeFacts } from "../lib/frame/homeFacts";

// Every tool module this file does not turn on is pinned to its unbuilt stub, so a tool session turning its own module on never changes
// what this file sees (session C, 2026-10-21).
vi.mock("@/components/tools/design", () => ({ built: false }));
vi.mock("@/components/tools/participants", () => ({ built: false }));
vi.mock("@/components/tools/qual", () => ({ built: false }));
vi.mock("@/components/tools/style", () => ({ built: false }));
vi.mock("@/components/tools/words", () => ({ built: false }));
vi.mock("@/components/tools/close", () => ({ built: false }));
vi.mock("@/components/tools/slides", () => ({ built: false }));
vi.mock("@/components/tools/viva", () => ({ built: false }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = en as Record<string, string>;
const roots: Root[] = [];
const tid = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
async function render(node: React.ReactNode) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(node); });
}
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });

describe("the tool registry (Task G2)", () => {
  it("turning one module's built on shows its Panel and leaves the others Not built", async () => {
    expect(toolModule("stats").built).toBe(true);
    for (const tool of ["design", "participants", "qual", "style", "words", "close", "slides", "viva"] as const) expect(toolModule(tool).built, tool).toBe(false);
    for (const { stage, tab, tool, nextKey } of TOOL_TABS) {
      await render(<StagedPlace stage={stage} tab={tab} />);
      const where = stage + "/" + tab;
      const body = tid("place-" + stage + "-" + tab)!;
      if (tool === "stats") {
        // The Panel is told its tab and the project; nothing says Not built.
        expect(body.querySelector('[data-testid="panel-stats"]')!.textContent, where).toBe(tab + " in p1");
        expect(tid("not-built"), where).toBeNull();
      } else {
        expect(tid("panel-stats"), where).toBeNull();
        expect(body.querySelector('[data-testid="not-built"]'), where).not.toBeNull();
      }
      // Built or not, the tab ends with its suggested next line.
      expect(body.lastElementChild!.textContent, where).toBe(E[nextKey]);
      act(() => { for (const r of roots.splice(0)) r.unmount(); });
      document.body.innerHTML = "";
    }
    // Statistics' five tabs show its Panel; Coding (qual) stays Not built in the same place.
    expect(TOOL_TABS.filter((x) => x.tool === "stats").map((x) => x.tab)).toEqual(["data", "power", "charts", "check", "scales"]);
    // The participant list is Collection and analysis' first tab, its own module (Task 5), Not built until its panel ships (Task 6).
    expect(TOOL_TABS.filter((x) => x.stage === "collect").map((x) => x.tab + ":" + x.tool)).toEqual([
      "participants:participants", "data:stats", "power:stats", "charts:stats", "check:stats", "scales:stats", "coding:qual"
    ]);
    expect(TOOL_TABS.find((x) => x.tab === "participants")).toMatchObject({ stage: "collect", tool: "participants", labelKey: "tab_name_participants", nextKey: "collect_next_participants" });
  });

  it("BUILT_IN and the home's built stages follow the registry", async () => {
    // Chat and the six stage-2 tools as before, and stats now that its module is built; never qual, whose module is not, nor viva (not a ToolId).
    expect([...BUILT_IN].sort()).toEqual(["analyse", "chat", "cite", "idea", "psych", "research", "stats"]);
    const states = Object.fromEntries(STAGE_ORDER.map((s) => [s, "not-started"])) as Record<StageKey, StageState>;
    const facts: HomeFacts = { question: "", people: "", time: "", limits: "", field: "", verdict: null, checked: false, readText: "", kept: 0, read: 0, highlights: 0, cards: 0, draftWords: 0 };
    await render(<StageRows states={states} facts={facts} onOpen={() => {}} onMark={() => {}} />);
    const detail = (s: StageKey) => tid("home-detail-" + s)!.textContent;
    // Collection and analysis is built (one of its modules is); its facts come with Task G3, so it says nothing it does not know.
    expect(detail("collect")).toBe("");
    expect(detail("design")).toBe(E.detail_not_built);
    expect(detail("review")).toBe(E.detail_not_built);
    // Idea, Literature and Writing read as they did.
    expect(detail("idea")).toBe(E.detail_idea_none);
    expect(detail("lit")).not.toBe(E.detail_not_built);
    expect(detail("writing")).toBe(E.detail_writing!.replace("{words}", "0"));
  });
});
