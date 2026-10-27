// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCoachPrompt, buildIdeaPromptV2, classifyAiUse, fieldLabel } from "@appuscholar/core";
import en from "../messages/en.json";

type Intake = { topic: string; resources: string; timeframe: string; constraints: string; who?: string; how?: string; unsure?: string[]; coach?: Record<string, { text: string; at: string }>; read?: { text: string; at: string } };
type Blob = { value: Intake | null; loading: boolean; locked: boolean; broken?: boolean; set: ReturnType<typeof vi.fn>; flush: ReturnType<typeof vi.fn> };
const h = vi.hoisted(() => ({
  // The held-value test runs the real blob hook over a fake API; the others drive the hook's state by hand.
  real: false,
  blob: null as unknown as Blob,
  blobArgs: [] as unknown[],
  projectId: "p-9" as string | null,
  openConnect: vi.fn(async () => ({ result: "closed", provider: "groq" })), toast: vi.fn(), api: vi.fn(), ask: vi.fn(),
  callAI: vi.fn(),
  hasKey: true,
  put: vi.fn(), requestInsert: vi.fn(),
  sug: {} as Record<string, unknown>
}));
vi.mock("@/lib/blobs/useProjectBlob", async (orig) => {
  const real = await orig<typeof import("../lib/blobs/useProjectBlob")>();
  return { ...real, useProjectBlob: (...a: Parameters<typeof real.useProjectBlob>) => (h.real ? real.useProjectBlob(...a) : ((h.blobArgs = a), h.blob)) };
});
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/components/workspace/dialogs/Passphrase", async () => (await import("./support/passphraseMock")).passphraseMock(h.ask));
vi.mock("@/lib/ai/useCallAI", () => ({ useCallAI: () => h.callAI }));
vi.mock("@/lib/ai/useKeys", () => ({ useKeys: () => ({ hasKey: () => h.hasKey }) }));
vi.mock("@/lib/ai/suggestion", () => ({ useSuggestion: () => h.sug }));
vi.mock("@/lib/editor/insert", () => ({ putAiInDocument: h.put }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", scratchProjectId: "scratch-1" }, settings: { field: "  nursing " } }) }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ projectId: h.projectId, openConnect: h.openConnect, requestInsert: h.requestInsert }) }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));

import { ApiError } from "../lib/api";
import { VaultProvider } from "../lib/vault/useVault";
import { BLOB_SAVE_DEBOUNCE_MS } from "../lib/blobs/useProjectBlob";
import { heldBlobs } from "../lib/blobs/held";
import { IDEA_NEED_TOPIC } from "../lib/ai/actions";
import { ShapeStudy } from "../components/places/ShapeStudy";
import { coachPlan, feasibilityFields } from "../lib/frame/shapeStudy";
import { AiPane } from "../components/tools/AiPane";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const E = en as Record<string, string>;
/*
 * Shape your study, the Idea place (start-a-study spec, OJ 2026-10-27): six parts one per screen on the project's idea_intake (v1's four boxes keep their
 * keys), an optional coach that never grades, and the summary with Dr. Sharma's feasibility check as an optional outside opinion.
 */
const text = (id: string) => $(`[data-testid="${id}"]`)?.textContent ?? null;
const STORED: Intake = { topic: "Does sleep quality predict exam performance in college students at my university over one term?", resources: "120 first-years", timeframe: "one semester", constraints: "no budget" };
const FIVE = [
  "Clear question: High. Specific change and a measurable outcome.",
  "Reaching people: Medium. One college limits how far results generalise.",
  "Time: High. A semester is enough for a one-week routine.",
  "Resources: Medium. A paper questionnaire works; plan the analysis early.",
  "Ethics: Medium. Monthly committee: book the date before anything else.",
  "Verdict: Go ahead, with two changes."
].join("\n");
const AT = "2026-10-21T09:00:00.000Z";
const roots: Root[] = [];
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => [...document.body.querySelectorAll<HTMLElement>(sel)];
const field = (id: string) => $("#" + id) as HTMLTextAreaElement | HTMLInputElement;
function mount(node: React.ReactNode = <ShapeStudy />) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  act(() => { root.render(node); });
  return root;
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
/** The update the last set() was given, applied to `prev`. */
const lastUpdate = (prev: Intake | null) => (h.blob.set.mock.calls.at(-1)![0] as (p: Intake | null) => Intake)(prev);

beforeEach(() => {
  h.real = false;
  h.blob = { value: null, loading: false, locked: false, set: vi.fn(), flush: vi.fn(async () => true) };
  h.blobArgs = [];
  h.projectId = "p-9";
  h.hasKey = true;
  h.openConnect.mockReset().mockResolvedValue({ result: "closed", provider: "groq" }); h.toast.mockReset(); h.put.mockReset().mockResolvedValue(true); h.requestInsert.mockReset(); h.api.mockReset(); h.ask.mockReset();
  h.callAI.mockReset().mockResolvedValue(FIVE);
  h.sug = { editor: { isDestroyed: false }, text: null, note: null, status: "idle", statusLabel: null, accept: vi.fn(), copy: vi.fn(), clear: vi.fn() };
  heldBlobs.clear();
});
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });


describe("Shape your study: the parts", () => {
  it("a new plan opens at part 1 of 6: the question to reflect on, three things to think about, an example, the answer, Not sure yet and the way on", () => {
    mount();
    expect(h.blobArgs).toEqual(["idea_intake", "p-9"]);
    expect(text("shape-progress")).toBe("Part 1 of 6");
    expect(text("shape-lead")).toBe(E.shape_lead);
    expect(text("shape-title")).toBe("Your question");
    expect(text("shape-question")).toBe("What do you want to find out? Write it roughly, in your own words.");
    expect($$(".shape-guide li").map((li) => li.textContent)).toEqual(["What made you curious about this?", "Is it one question, or several?", "Could someone answer it with evidence?"]);
    expect(text("shape-example")).toBe("For example: Does poor sleep make exam stress worse for college students?");
    expect(field("shapeAnswer").value).toBe("");
    expect(text("shape-help")).toBe("Help me think");
    expect(text("shape-help-note") ?? $(".shape-note")!.textContent).toBe(E.shape_help_note);
    // Nothing is required: Skip for now and Next both go on; Finish later goes home; no Back on the first part.
    expect($('[data-testid="shape-back"]')).toBeNull();
    expect(text("shape-skip")).toBe("Skip for now");
    expect(text("shape-next")).toBe("Next");
    expect($('[data-testid="shape-later"]')!.getAttribute("href")).toBe("/p/p-9");
    // No grading anywhere on a part.
    expect(document.body.textContent).not.toMatch(/doable|feasib|Low|High|verdict/i);
  });

  it("each part's answer is saved, as typed, in its own key (v1's four boxes keep theirs), as an update of the current value", () => {
    mount();
    const keys: Array<[number, keyof Intake]> = [[0, "topic"], [1, "who"], [2, "how"], [3, "timeframe"], [4, "resources"], [5, "constraints"]];
    for (const [i, key] of keys) {
      if (i > 0) act(() => { $('[data-testid="shape-next"]')!.click(); });
      expect(text("shape-progress")).toBe(`Part ${i + 1} of 6`);
      h.blob.set.mockClear();
      type("shapeAnswer", "typed " + key);
      expect(h.blob.set).toHaveBeenCalledTimes(1);
      expect(lastUpdate(STORED)).toEqual({ ...STORED, [key]: "typed " + key });
      expect(lastUpdate({ ...STORED, read: { text: "r", at: AT } })).toEqual({ ...STORED, read: { text: "r", at: AT }, [key]: "typed " + key });
      expect(lastUpdate(null)).toEqual({ topic: "", resources: "", timeframe: "", constraints: "", [key]: "typed " + key });
    }
    expect($$(".shape-part h2").map((e) => e.textContent)).toEqual(["Ethics"]);
  });

  it("Back, Skip for now, Next and the dots move between parts; the last part's Next says See my plan and opens the summary", () => {
    mount();
    act(() => { $('[data-testid="shape-skip"]')!.click(); });
    expect(text("shape-title")).toBe("Who or what you'd study");
    act(() => { $('[data-testid="shape-back"]')!.click(); });
    expect(text("shape-title")).toBe("Your question");
    act(() => { $('[data-testid="shape-dot-time"]')!.click(); });
    expect(text("shape-title")).toBe("Time");
    expect($('[data-testid="shape-dot-time"]')!.getAttribute("aria-current")).toBe("step");
    act(() => { $('[data-testid="shape-dot-ethics"]')!.click(); });
    expect(text("shape-next")).toBe("See my plan");
    act(() => { $('[data-testid="shape-next"]')!.click(); });
    expect(text("shape-summary")).toContain("Your study so far");
  });

  it("Not sure yet marks the part as a known gap: it counts as answered, Skip goes, and unticking takes it back", () => {
    h.blob.value = { topic: "", resources: "", timeframe: "", constraints: "" };
    const root = mount();
    act(() => { $('[data-testid="shape-dot-how"]')!.click(); });
    act(() => { ($('[data-testid="shape-unsure"]') as HTMLInputElement).click(); });
    const marked = lastUpdate(h.blob.value);
    expect(marked.unsure).toEqual(["how"]);
    h.blob = { ...h.blob, value: marked };
    act(() => { root.render(<ShapeStudy />); });
    expect(($('[data-testid="shape-unsure"]') as HTMLInputElement).checked).toBe(true);
    expect($('[data-testid="shape-skip"]')).toBeNull();
    expect($('[data-testid="shape-dot-how"]')!.hasAttribute("data-done")).toBe(true);
    act(() => { ($('[data-testid="shape-unsure"]') as HTMLInputElement).click(); });
    expect(lastUpdate(marked).unsure).toEqual([]);
  });

  it("Help me think coaches the part on screen with the study's field and the whole plan, never grades, and keeps its reply with the part, marked as the AI's", async () => {
    const plan = { ...STORED, who: "120 first-years", unsure: ["how"] };
    h.blob.value = plan;
    h.callAI.mockResolvedValue("Questions to ask yourself:\nWhich exams?");
    mount();
    act(() => { $('[data-testid="shape-edit-how"]')!.click(); });
    await click("shape-help");
    const built = buildCoachPrompt(fieldLabel("  nursing "), "how", coachPlan(plan as never));
    expect(h.callAI).toHaveBeenCalledWith(built.prompt, { temp: 0.5, max: 700 });
    expect(built.prompt).toContain("never give a verdict or a score");
    expect(classifyAiUse(built.prompt)?.k).toBe("thinking through my study plan");
    const next = lastUpdate(plan);
    expect(next.coach!.how).toEqual({ text: "Questions to ask yourself:\nWhich exams?", at: expect.any(String) });
    expect(next.topic).toBe(plan.topic);
  });

  it("a coach reply kept with a part is shown under it as AI suggestions", () => {
    h.blob.value = { ...STORED, coach: { question: { text: "Options to consider:\nNarrow to one exam.", at: AT } } };
    mount();
    act(() => { $('[data-testid="shape-edit-question"]')!.click(); });
    const panel = $('[data-testid="shape-coach"]')!;
    expect(panel.classList.contains("ai-read")).toBe(true);
    expect(panel.querySelector(".ai-read-label")!.textContent).toBe("AI suggestions. Use what helps; you decide.");
    expect(panel.textContent).toContain("Narrow to one exam.");
    act(() => { $('[data-testid="shape-next"]')!.click(); });
    expect($('[data-testid="shape-coach"]')).toBeNull();
  });

  it("a coach call that fails toasts its message and keeps nothing", async () => {
    h.blob.value = STORED;
    h.callAI.mockRejectedValue(new Error("Could not reach the AI."));
    mount();
    act(() => { $('[data-testid="shape-edit-question"]')!.click(); });
    await click("shape-help");
    expect(h.toast).toHaveBeenCalledWith("Could not reach the AI.");
    expect(h.blob.set).not.toHaveBeenCalled();
  });
});

describe("Shape your study: the summary", () => {
  it("a plan with something in it opens at Your study so far: the six parts with the answer, Not sure yet or Not answered yet, and Edit", () => {
    h.blob.value = { ...STORED, unsure: ["how"] };
    mount();
    expect($("h2")!.textContent).toBe("Your study so far");
    const items = $$('[data-testid="shape-item"]');
    expect(items.map((i) => i.querySelector("dt")!.textContent)).toEqual(["Your question", "Who or what you'd study", "How you'd find out", "Time", "What you have", "Ethics"]);
    expect(items.map((i) => i.querySelector("dd")!.textContent)).toEqual([STORED.topic, "Not answered yet", "Not sure yet", STORED.timeframe, STORED.resources, STORED.constraints]);
    expect($('[data-testid="shape-edit-time"]')!.getAttribute("aria-label")).toBe("Edit Time");
    act(() => { $('[data-testid="shape-edit-time"]')!.click(); });
    expect(text("shape-title")).toBe("Time");
    expect(field("shapeAnswer").value).toBe(STORED.timeframe);
  });

  it("Go to my study is the main way on; the feasibility check is optional, labelled as an outside opinion, and only runs when pressed", () => {
    h.blob.value = STORED;
    mount();
    expect($('[data-testid="shape-go-study"]')!.getAttribute("href")).toBe("/p/p-9");
    expect(text("idea-check")).toBe("Check if it's doable");
    expect(text("shape-doable-note")).toBe("Optional. An outside opinion from the AI on whether the plan is realistic. It will not approve your topic. Your supervisor does that.");
    expect(h.callAI).not.toHaveBeenCalled();
  });

  it("Check if it's doable sends v1's prompt, unchanged, with who and how under the question, and keeps the read", async () => {
    const plan = { ...STORED, who: "120 first-years", how: "A sleep diary for a week" };
    h.blob.value = plan;
    mount();
    await click("idea-check");
    const fields = feasibilityFields(plan as never);
    expect(fields.topic).toBe(STORED.topic + "\nWho would take part: 120 first-years\nHow the evidence would be collected: A sleep diary for a week");
    const built = buildIdeaPromptV2(fieldLabel("  nursing "), fields);
    expect(h.callAI).toHaveBeenCalledWith(built.prompt, { temp: 0.3, max: 1200, provider: "gemini" });
    expect(classifyAiUse(built.prompt)?.k).toBe("checking whether my project idea is realistic");
    expect(lastUpdate(plan)).toEqual({ ...plan, read: { text: FIVE, at: expect.any(String) } });
  });

  it("with no question yet the check says v1's sentence and calls nothing", async () => {
    h.blob.value = { ...STORED, topic: "   " };
    mount();
    await click("idea-check");
    expect(h.toast).toHaveBeenCalledWith(IDEA_NEED_TOPIC);
    expect(h.callAI).not.toHaveBeenCalled();
  });

  it("with no AI key the check opens Connect AI and sends nothing", async () => {
    h.hasKey = false;
    h.blob.value = STORED;
    mount();
    await click("idea-check");
    expect(h.openConnect).toHaveBeenCalledWith({ provider: "gemini", offerSave: false });
    expect(h.callAI).not.toHaveBeenCalled();
    expect(h.blob.set).not.toHaveBeenCalled();
  });

  it("a five-line read shows each area with its rating, then the verdict, in a gold-edged panel with its label, and Put in my document", () => {
    h.blob.value = { ...STORED, read: { text: FIVE, at: AT } };
    mount();
    const panel = $('[data-testid="idea-read"]')!;
    expect(panel.classList.contains("ai-read")).toBe(true);
    expect(panel.querySelector(".ai-read-label")!.textContent).toBe("AI read of your idea. Check it against your own judgement.");
    const rows = $$('[data-testid="idea-read-line"]');
    expect(rows.map((r) => r.querySelector('[data-testid="idea-read-area"]')?.textContent)).toEqual(["Clear question", "Reaching people", "Time", "Resources", "Ethics"]);
    expect(rows.map((r) => r.querySelector('[data-testid="idea-read-rating"]')!.textContent)).toEqual(["High", "Medium", "High", "Medium", "Medium"]);
    expect($('[data-testid="idea-read-verdict"]')!.textContent).toBe("Go ahead, with two changes.");
    expect($('[data-testid="idea-insert"]')!.textContent).toBe("Put in my document");
  });

  it("a read whose lines begin with the literal word Area shows each line without the word Area as a heading (R15)", () => {
    const read = ["Area: High. The research question is specific.", "Area: Medium. Access depends on one school's head.", "Area: Low. Six weeks is short for interviews.", "Verdict: Proceed with these modifications."].join("\n");
    h.blob.value = { ...STORED, read: { text: read, at: AT } };
    mount();
    const rows = $$('[data-testid="idea-read-line"]');
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.querySelector('[data-testid="idea-read-area"]'))).toEqual([null, null, null]);
    expect(rows.every((r) => !/\bArea\b/.test(r.textContent ?? ""))).toBe(true);
  });

  it("an unparsable read is shown as it came", () => {
    const read = "This looks doable.\nTalk to your supervisor about ethics first.";
    h.blob.value = { ...STORED, read: { text: read, at: AT } };
    mount();
    expect($$('[data-testid="idea-read-line"]')).toHaveLength(0);
    expect($('[data-testid="idea-read-raw"]')!.textContent).toBe(read);
  });

  it("Put in my document goes through requestInsert and says Inserted only once it went in", async () => {
    h.blob.value = { ...STORED, read: { text: FIVE, at: AT } };
    mount();
    await click("idea-insert");
    expect(h.put).toHaveBeenCalledWith(h.requestInsert, FIVE);
    expect(h.toast).toHaveBeenCalledWith(E.idea_inserted);
    h.toast.mockClear(); h.put.mockResolvedValue(false);
    await click("idea-insert");
    expect(h.toast).not.toHaveBeenCalledWith(E.idea_inserted);
  });
});

describe("Shape your study: loading and locked", () => {
  it("shows the loading sign, not an empty part, before /me answers and while the plan is read (W8)", () => {
    h.projectId = null;
    mount();
    expect($('[data-testid="panel-loading"]')!.getAttribute("role")).toBe("status");
    expect($("#shapeAnswer")).toBeNull();
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    document.body.innerHTML = "";
    h.projectId = "p-9";
    h.blob.loading = true;
    const root = mount();
    expect($('[data-testid="panel-loading"]')!.textContent).toBe(E.blob_loading);
    h.blob = { ...h.blob, value: STORED, loading: false };
    act(() => { root.render(<ShapeStudy />); });
    expect($('[data-testid="panel-loading"]')).toBeNull();
    expect($('[data-testid="shape-summary"]')).not.toBeNull();
  });

  it("a locked vault keeps its own sentence, once, and no loading sign (W8)", () => {
    h.blob.locked = true;
    h.blob.loading = true;
    mount();
    expect($('[data-testid="panel-loading"]')).toBeNull();
    expect($$('[data-testid="idea-locked"]').map((e) => e.textContent)).toEqual([E.vault_idea_locked]);
    expect($("#shapeAnswer")).toBeNull();
  });
});

/** The idea_intake blob route with versions (If-Match), vault off. */
let stored: { body: string; version: number };
let puts: Array<{ ifMatch: string | undefined; body: string }>;
function fakeApi(path: string, init: RequestInit = {}) {
  const method = init.method ?? "GET";
  if (path === "/me/vault") return Promise.reject(new ApiError(404, "no-vault"));
  if (path !== "/projects/p1/blobs/idea_intake") return Promise.reject(new ApiError(404, "not-found"));
  if (method === "GET") return Promise.resolve({ kind: "idea_intake", body: stored.body, keyVersion: 0, deks: [], updatedAt: "2026-10-19T00:00:00.000Z", version: stored.version });
  const ifMatch = (init.headers as Record<string, string> | undefined)?.["if-match"];
  const body = (JSON.parse(String(init.body)) as { body: string }).body;
  puts.push({ ifMatch, body });
  if (ifMatch !== undefined && Number(/\d+/.exec(ifMatch)![0]) !== stored.version) return Promise.reject(new ApiError(409, "version-conflict"));
  stored = { body, version: stored.version + 1 };
  return Promise.resolve({ kind: "idea_intake", body, keyVersion: 0, deks: [], updatedAt: "2026-10-19T00:00:00.000Z", version: stored.version });
}
const settle = (ms = 30) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

describe("Shape your study: a conflicted save held for an unreadable blob", () => {
  it("keeps showing the student's text while a conflicted save is held for an unreadable blob", async () => {
    const HELD = { topic: "sleep and memory", resources: "school survey", timeframe: "six months", constraints: "no lab" };
    h.real = true;
    h.projectId = "p1";
    stored = { body: JSON.stringify(HELD), version: 1 };
    puts = [];
    h.api.mockImplementation(fakeApi);
    const answer = () => field("shapeAnswer").value;
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    roots.push(root);
    await act(async () => { root.render(<VaultProvider><ShapeStudy /></VaultProvider>); });
    await settle();
    expect($$('[data-testid="shape-item-answer"]').map((d) => d.textContent)).toEqual([HELD.topic, "Not answered yet", "Not answered yet", HELD.timeframe, HELD.resources, HELD.constraints]);
    act(() => { $('[data-testid="shape-edit-time"]')!.click(); });
    expect(answer()).toBe(HELD.timeframe);
    // Another window leaves a body this build cannot read; the next save loses the race and its re-read cannot open it.
    stored = { body: "{not json", version: 2 };
    type("shapeAnswer", "one year");
    await settle(BLOB_SAVE_DEBOUNCE_MS + 150);
    expect(puts.map((p) => p.ifMatch)).toEqual(['"1"']);
    expect(answer()).toBe("one year");
    expect($('[data-testid="idea-broken"]')!.textContent).toBe(E.vault_idea_broken);
    // One more character keeps the other fields (the held value, not the blank, is the base), and nothing replaces the unreadable blob.
    type("shapeAnswer", "one year!");
    await settle(BLOB_SAVE_DEBOUNCE_MS + 150);
    act(() => { $('[data-testid="shape-dot-question"]')!.click(); });
    expect(answer()).toBe(HELD.topic);
    type("shapeAnswer", "sleep and memory, again");
    await settle(BLOB_SAVE_DEBOUNCE_MS + 150);
    act(() => { $('[data-testid="shape-dot-time"]')!.click(); });
    expect(answer()).toBe("one year!");
    act(() => { $('[data-testid="shape-dot-have"]')!.click(); });
    expect(answer()).toBe(HELD.resources);
    expect(puts).toHaveLength(1);
    expect(stored.body).toBe("{not json");
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
