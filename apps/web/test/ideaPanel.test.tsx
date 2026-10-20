// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildIdeaPrompt, fieldLabel } from "@appuscholar/core";
import en from "../messages/en.json";

type Intake = { topic: string; resources: string; timeframe: string; constraints: string };
type Blob = { value: Intake | null; loading: boolean; locked: boolean; broken?: boolean; set: ReturnType<typeof vi.fn>; flush: ReturnType<typeof vi.fn> };
const h = vi.hoisted(() => ({
  blob: null as unknown as Blob,
  blobArgs: [] as unknown[],
  project: null as { id: string } | null,
  openSaveAs: vi.fn(), dockShow: vi.fn(), toast: vi.fn(),
  callAI: vi.fn(),
  sug: {} as Record<string, unknown>
}));
vi.mock("@/lib/blobs/useProjectBlob", () => ({ useProjectBlob: (...a: unknown[]) => { h.blobArgs = a; return h.blob; } }));
vi.mock("@/lib/ai/useCallAI", () => ({ useCallAI: () => h.callAI }));
vi.mock("@/lib/ai/suggestion", () => ({ useSuggestion: () => h.sug }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", scratchProjectId: "scratch-1" }, settings: { field: "  nursing " } }) }));
vi.mock("@/components/workspace/WorkspaceContext", () => ({ useWorkspace: () => ({ project: h.project, openSaveAs: h.openSaveAs, dockShow: h.dockShow }) }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));

import { IdeaPanel } from "../components/tools/IdeaPanel";
import { AiPane } from "../components/tools/AiPane";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const E = en as Record<string, string>;
const STORED: Intake = { topic: "Does sleep quality predict exam performance in college students at my university over one term?", resources: "120 first-years", timeframe: "one semester", constraints: "no budget" };
const roots: Root[] = [];
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel);
const field = (id: string) => $("#" + id) as HTMLTextAreaElement | HTMLInputElement;
const ids = ["ideaTopic", "ideaRes", "ideaTime", "ideaCons"] as const;
function mount(node: React.ReactNode = <IdeaPanel />) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  act(() => { root.render(node); });
}
function type(id: string, value: string) {
  const el = field(id);
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function click(testid: string) {
  const el = $(`[data-testid="${testid}"]`)!;
  await act(async () => { el.click(); await new Promise((r) => setTimeout(r, 0)); });
}

beforeEach(() => {
  h.blob = { value: null, loading: false, locked: false, set: vi.fn(), flush: vi.fn(async () => true) };
  h.blobArgs = [];
  h.project = null;
  h.openSaveAs.mockReset(); h.dockShow.mockReset(); h.toast.mockReset();
  h.callAI.mockReset().mockResolvedValue("Topic clarity and researchability: High. ...");
  let token = 0;
  h.sug = {
    setThinking: vi.fn(() => ++token), isCurrent: vi.fn(() => true), set: vi.fn(), clear: vi.fn(),
    text: null, note: null, status: "idle", statusLabel: null, accept: vi.fn(), copy: vi.fn()
  };
});
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });

describe("Idea & Feasibility: the intake is the project's idea_intake blob", () => {
  it("reads the scratch project's intake when no project is open, and the open project's otherwise", () => {
    mount();
    expect(h.blobArgs).toEqual(["idea_intake", "scratch-1"]);
    h.project = { id: "p-9" };
    mount();
    expect(h.blobArgs).toEqual(["idea_intake", "p-9"]);
  });

  it("a loaded intake fills the four fields", () => {
    h.blob.value = STORED;
    mount();
    expect(ids.map((id) => field(id).value)).toEqual([STORED.topic, STORED.resources, STORED.timeframe, STORED.constraints]);
    expect(ids.map((id) => field(id).disabled)).toEqual([false, false, false, false]);
  });

  it("while the intake loads the fields are disabled, not blank and editable", () => {
    h.blob.loading = true;
    mount();
    expect(ids.map((id) => field(id).disabled)).toEqual([true, true, true, true]);
    expect(($('[data-testid="idea-assess"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it("typing a field saves the intake as an update of the current value (a late load cannot lose a keystroke)", () => {
    h.blob.value = STORED;
    mount();
    const cases: Array<[string, keyof Intake]> = [["ideaTopic", "topic"], ["ideaRes", "resources"], ["ideaTime", "timeframe"], ["ideaCons", "constraints"]];
    for (const [id, key] of cases) {
      h.blob.set.mockClear();
      type(id, "typed " + key);
      expect(h.blob.set).toHaveBeenCalledTimes(1);
      const up = h.blob.set.mock.calls[0]![0] as (prev: Intake | null) => Intake;
      expect(typeof up).toBe("function");
      expect(up(STORED)).toEqual({ ...STORED, [key]: "typed " + key });
      expect(up(null)).toEqual({ topic: "", resources: "", timeframe: "", constraints: "", [key]: "typed " + key });
    }
  });

  it("a locked vault shows one line saying so", () => {
    h.blob.locked = true;
    mount();
    expect($('[data-testid="idea-locked"]')?.textContent).toBe(E.vault_idea_locked);
    h.blob.locked = false;
    mount();
    expect(document.body.querySelectorAll('[data-testid="idea-locked"]')).toHaveLength(1);
  });
});

describe("Idea & Feasibility: Assess feasibility", () => {
  it("an empty working idea toasts v1's sentence and calls nothing", async () => {
    h.blob.value = { ...STORED, topic: "   " };
    mount();
    await click("idea-assess");
    expect(h.toast).toHaveBeenCalledWith("Describe your working idea first");
    expect(h.callAI).not.toHaveBeenCalled();
  });

  it("sends v1's prompt for the four fields and the student's field, with temp 0.3 and max 1200, and lands in the suggestion pane", async () => {
    h.blob.value = STORED;
    mount();
    await click("idea-assess");
    const built = buildIdeaPrompt(fieldLabel("  nursing "), STORED);
    expect(h.callAI).toHaveBeenCalledWith(built.prompt, { temp: 0.3, max: 1200 });
    expect(h.sug.setThinking).toHaveBeenCalledWith("custom", null, "💜 Thinking this through…");
    expect(h.sug.set).toHaveBeenCalledWith("Topic clarity and researchability: High. ...", null, 1);
    expect(h.dockShow).toHaveBeenCalledWith("ai");
    expect(h.toast).toHaveBeenCalledWith("Ready — press Tab in the editor to insert");
  });

  it("Save this idea as a project opens Save-as-project with the first 80 characters of the idea", async () => {
    h.blob.value = { ...STORED, topic: "  " + STORED.topic };
    mount();
    await click("idea-save-project");
    expect(h.openSaveAs).toHaveBeenCalledWith("new", STORED.topic.slice(0, 80));
  });
});

describe("AI pane status text", () => {
  it("shows the label of a request while it runs, and the status's own text when there is none", () => {
    h.sug.status = "custom";
    h.sug.statusLabel = "💜 Thinking this through…";
    mount(<AiPane />);
    expect($('[data-testid="ai-status"]')?.textContent).toBe("💜 Thinking this through…");
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    document.body.innerHTML = "";
    h.sug.status = "polishing";
    h.sug.statusLabel = null;
    mount(<AiPane />);
    expect($('[data-testid="ai-status"]')?.textContent).toBe("💜 Polishing…");
  });
});
