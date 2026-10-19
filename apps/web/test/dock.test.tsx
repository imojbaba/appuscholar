// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ ws: { activeTool: "psych", dock: "tools", dockShow: () => {}, aiWaiting: false } as Record<string, unknown> }));
vi.mock("@/components/workspace/WorkspaceContext", () => ({ useWorkspace: () => h.ws }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ settings: {}, update: vi.fn() }) }));
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));
vi.mock("@/components/workspace/StageGuide", () => ({ StageGuide: () => null }));
vi.mock("@/components/tools/AiPane", () => ({ AiPane: () => <div data-testid="ai-pane" /> }));
vi.mock("@/components/tools/IdeaPanel", () => ({ IdeaPanel: () => <div data-testid="panel-idea" /> }));
vi.mock("@/components/tools/HelpersPanel", () => ({ HelpersPanel: () => <div data-testid="panel-psych" /> }));
vi.mock("@/components/tools/ChatPanel", () => ({ ChatPanel: () => <div data-testid="panel-chat" />, useChatLog: () => ({}) }));
vi.mock("@/components/tools/cite/CitePanel", () => ({ CitePanel: () => <div data-testid="panel-cite" /> }));
vi.mock("@/components/tools/research/ResearchPanel", () => ({ ResearchPanel: () => <div data-testid="panel-research" /> }));
vi.mock("@/components/tools/analyse/AnalysePanel", () => ({ AnalysePanel: () => <div data-testid="panel-analyse" /> }));
vi.mock("@/components/tools/StubPanel", () => ({ StubPanel: ({ id }: { id: string }) => <div data-testid={"stub-" + id} /> }));

import { Dock } from "../components/workspace/Dock";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
function render(activeTool: string) {
  h.ws = { ...h.ws, activeTool };
  const el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  act(() => { root!.render(<Dock />); });
  return [...document.body.querySelectorAll<HTMLElement>('.dock [data-testid]')].map((e) => e.dataset.testid);
}
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; });

describe("Dock: which panel a tool mounts", () => {
  it.each([
    ["psych", "panel-psych"], ["idea", "panel-idea"], ["chat", "panel-chat"], ["cite", "panel-cite"], ["research", "panel-research"], ["analyse", "panel-analyse"], ["design", "stub-design"]
  ])("%s mounts %s", (tool, testid) => {
    expect(render(tool)).toEqual([testid]);
  });
});
