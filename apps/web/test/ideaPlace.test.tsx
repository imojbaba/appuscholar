// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildIdeaPromptV2, classifyAiUse, fieldLabel } from "@appuscholar/core";
import en from "../messages/en.json";

type Intake = { topic: string; resources: string; timeframe: string; constraints: string; read?: { text: string; at: string } };
type Blob = { value: Intake | null; loading: boolean; locked: boolean; broken?: boolean; set: ReturnType<typeof vi.fn>; flush: ReturnType<typeof vi.fn> };
const h = vi.hoisted(() => ({
  // The held-value test runs the real blob hook over a fake API; the others drive the hook's state by hand.
  real: false,
  blob: null as unknown as Blob,
  blobArgs: [] as unknown[],
  projectId: "p-9" as string | null,
  openSettings: vi.fn(), toast: vi.fn(), api: vi.fn(), ask: vi.fn(),
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
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ projectId: h.projectId, openSettings: h.openSettings, requestInsert: h.requestInsert }) }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));

import { ApiError } from "../lib/api";
import { VaultProvider } from "../lib/vault/useVault";
import { BLOB_SAVE_DEBOUNCE_MS } from "../lib/blobs/useProjectBlob";
import { heldBlobs } from "../lib/blobs/held";
import { IDEA_NEED_TOPIC } from "../lib/ai/actions";
import { IdeaPlace } from "../components/places/IdeaPlace";
import { AiPane } from "../components/tools/AiPane";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const E = en as Record<string, string>;
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
const ids = ["ideaTopic", "ideaRes", "ideaTime", "ideaCons"] as const;
function mount(node: React.ReactNode = <IdeaPlace />) {
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
  h.openSettings.mockReset(); h.toast.mockReset(); h.put.mockReset().mockResolvedValue(true); h.requestInsert.mockReset(); h.api.mockReset(); h.ask.mockReset();
  h.callAI.mockReset().mockResolvedValue(FIVE);
  h.sug = { editor: { isDestroyed: false }, text: null, note: null, status: "idle", statusLabel: null, accept: vi.fn(), copy: vi.fn(), clear: vi.fn() };
  heldBlobs.clear();
});
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });

describe("The Idea place: the form on the project's idea_intake", () => {
  it("the four fields are v1's idea_intake keys and the prompt is buildIdeaPromptV2's", async () => {
    h.blob.value = STORED;
    mount();
    expect(h.blobArgs).toEqual(["idea_intake", "p-9"]);
    expect($("h2")!.textContent).toBe(E.idea_h);
    expect(["ideaTopic", "ideaRes", "ideaTime", "ideaCons"].map((id) => $(`label[for="${id}"]`)!.textContent))
      .toEqual([E.idea_topic_lbl, E.idea_resources_lbl, E.idea_timeframe_lbl, E.idea_constraints_lbl]);
    expect([E.idea_topic_lbl, E.idea_resources_lbl, E.idea_timeframe_lbl, E.idea_constraints_lbl])
      .toEqual(["Your idea", "Who would you study, and what can you use?", "How much time do you have?", "What limits you: approvals, rules, anything else?"]);
    expect($('[data-testid="idea-check"]')!.textContent).toBe("Check if it is doable");
    expect($('[data-testid="idea-check-note"]')!.textContent).toBe("Uses your AI key. Takes about 10 seconds.");
    await click("idea-check");
    const built = buildIdeaPromptV2(fieldLabel("  nursing "), STORED);
    expect(h.callAI).toHaveBeenCalledWith(built.prompt, { temp: 0.3, max: 1200 });
    expect(classifyAiUse(built.prompt)?.k).toBe("checking whether my project idea is realistic");
    // The read is kept with the idea, as an update of the stored intake.
    const next = lastUpdate(STORED);
    expect(next).toEqual({ ...STORED, read: { text: FIVE, at: expect.any(String) } });
    expect(Number.isNaN(Date.parse(next.read!.at))).toBe(false);
  });

  it("a loaded intake fills the four fields", () => {
    h.blob.value = STORED;
    mount();
    expect(ids.map((id) => field(id).value)).toEqual([STORED.topic, STORED.resources, STORED.timeframe, STORED.constraints]);
    expect(ids.map((id) => field(id).disabled)).toEqual([false, false, false, false]);
  });

  it("the Idea place shows the loading sign, not empty boxes, before /me answers", () => {
    h.projectId = null;
    mount();
    expect($('[data-testid="panel-loading"]')!.getAttribute("role")).toBe("status");
    expect(ids.map((id) => $("#" + id))).toEqual([null, null, null, null]);
    expect(($('[data-testid="idea-check"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it("Idea shows the loading sign, not its empty boxes, until its data is read (W8)", () => {
    h.blob.loading = true;
    const root = mount();
    const sign = $('[data-testid="panel-loading"]')!;
    expect(sign.getAttribute("aria-busy")).toBe("true");
    expect(sign.textContent).toBe(E.blob_loading);
    expect(ids.map((id) => $("#" + id))).toEqual([null, null, null, null]);
    expect(($('[data-testid="idea-check"]') as HTMLButtonElement).disabled).toBe(true);
    h.blob = { ...h.blob, value: STORED, loading: false };
    act(() => { root.render(<IdeaPlace />); });
    expect($('[data-testid="panel-loading"]')).toBeNull();
    expect(ids.map((id) => field(id).value)).toEqual([STORED.topic, STORED.resources, STORED.timeframe, STORED.constraints]);
  });

  it("a locked vault keeps its own sentence, once, and no loading sign (W8)", () => {
    h.blob.locked = true;
    h.blob.loading = true;
    mount();
    expect($('[data-testid="panel-loading"]')).toBeNull();
    expect($$('[data-testid="idea-locked"]').map((e) => e.textContent)).toEqual([E.vault_idea_locked]);
  });

  it("typing a field saves the intake as an update of the current value (a late load cannot lose a keystroke, nor the read)", () => {
    h.blob.value = { ...STORED, read: { text: FIVE, at: AT } };
    mount();
    const cases: Array<[string, keyof Intake]> = [["ideaTopic", "topic"], ["ideaRes", "resources"], ["ideaTime", "timeframe"], ["ideaCons", "constraints"]];
    for (const [id, key] of cases) {
      h.blob.set.mockClear();
      type(id, "typed " + key);
      expect(h.blob.set).toHaveBeenCalledTimes(1);
      expect(lastUpdate(STORED)).toEqual({ ...STORED, [key]: "typed " + key });
      expect(lastUpdate({ ...STORED, read: { text: "r", at: AT } })).toEqual({ ...STORED, read: { text: "r", at: AT }, [key]: "typed " + key });
      expect(lastUpdate(null)).toEqual({ topic: "", resources: "", timeframe: "", constraints: "", [key]: "typed " + key });
    }
  });
});

describe("The Idea place: checking the idea", () => {
  it("an empty working idea toasts v1's sentence and calls nothing", async () => {
    h.blob.value = { ...STORED, topic: "   " };
    mount();
    await click("idea-check");
    expect(h.toast).toHaveBeenCalledWith(IDEA_NEED_TOPIC);
    expect(h.callAI).not.toHaveBeenCalled();
  });

  it("with no AI key the button opens the key dialog and sends nothing", async () => {
    h.hasKey = false;
    h.blob.value = STORED;
    mount();
    await click("idea-check");
    expect(h.openSettings).toHaveBeenCalledWith("gemini");
    expect(h.callAI).not.toHaveBeenCalled();
    expect(h.blob.set).not.toHaveBeenCalled();
  });

  it("a failed check toasts its message and keeps the read there was", async () => {
    h.blob.value = { ...STORED, read: { text: FIVE, at: AT } };
    h.callAI.mockRejectedValue(new Error("Could not reach the AI."));
    mount();
    await click("idea-again");
    expect(h.toast).toHaveBeenCalledWith("Could not reach the AI.");
    expect(h.blob.set).not.toHaveBeenCalled();
  });

  it("a five-line read shows each area with its rating, then the verdict, in a gold-edged panel with its label", () => {
    h.blob.value = { ...STORED, read: { text: FIVE, at: AT } };
    mount();
    const panel = $('[data-testid="idea-read"]')!;
    expect(panel.classList.contains("ai-read")).toBe(true);
    expect(panel.querySelector(".ai-read-label")!.textContent).toBe("AI read of your idea. Check it against your own judgement.");
    const rows = $$('[data-testid="idea-read-line"]');
    expect(rows.map((r) => r.querySelector('[data-testid="idea-read-area"]')?.textContent)).toEqual(["Clear question", "Reaching people", "Time", "Resources", "Ethics"]);
    expect(rows.map((r) => r.querySelector('[data-testid="idea-read-rating"]')!.textContent)).toEqual(["High", "Medium", "High", "Medium", "Medium"]);
    expect(rows[2]!.querySelector('[data-testid="idea-read-why"]')!.textContent).toBe("A semester is enough for a one-week routine.");
    expect($('[data-testid="idea-read-verdict"]')!.textContent).toBe("Go ahead, with two changes.");
    // In the Idea place: Put in my document and Check again; saving a project belongs to first run.
    expect($('[data-testid="idea-insert"]')!.textContent).toBe("Put in my document");
    expect($('[data-testid="idea-again"]')!.textContent).toBe("Check again");
    expect($('[data-testid="idea-save"]')).toBeNull();
  });

  it("a read whose lines begin with the literal word Area shows each line without the word Area as a heading (R15)", () => {
    const text = [
      "Area: High. The research question is specific.",
      "Area: Medium. Access depends on one school's head.",
      "Area: Low. Six weeks is short for interviews.",
      "Verdict: Proceed with these modifications."
    ].join("\n");
    h.blob.value = { ...STORED, read: { text, at: AT } };
    mount();
    const rows = $$('[data-testid="idea-read-line"]');
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.querySelector('[data-testid="idea-read-area"]'))).toEqual([null, null, null]);
    expect(rows.map((r) => r.querySelector('[data-testid="idea-read-why"]')!.textContent)).toEqual([
      "The research question is specific.", "Access depends on one school's head.", "Six weeks is short for interviews."
    ]);
    expect(rows.map((r) => r.querySelector('[data-testid="idea-read-rating"]')!.textContent)).toEqual(["High", "Medium", "Low"]);
    expect(rows.every((r) => !/\bArea\b/.test(r.textContent ?? ""))).toBe(true);
    expect($$('[data-testid="idea-read"] strong').filter((s) => s.textContent === "Area")).toHaveLength(0);
  });

  it("an unparsable read is shown as it came", () => {
    const text = "This looks doable.\nTalk to your supervisor about ethics first.";
    h.blob.value = { ...STORED, read: { text, at: AT } };
    mount();
    expect($$('[data-testid="idea-read-line"]')).toHaveLength(0);
    expect($('[data-testid="idea-read-raw"]')!.textContent).toBe(text);
  });

  it("Put in my document puts the read in through the shell's requestInsert (putAiInDocument) and says Inserted once it went in", async () => {
    h.blob.value = { ...STORED, read: { text: FIVE, at: AT } };
    mount();
    await click("idea-insert");
    expect(h.put).toHaveBeenCalledTimes(1);
    expect(h.put).toHaveBeenCalledWith(h.requestInsert, FIVE);
    expect(h.toast).toHaveBeenCalledWith(E.idea_inserted);
  });

  it("Put in my document when the document did not open claims nothing (requestInsert has said why)", async () => {
    h.put.mockResolvedValue(false);
    h.blob.value = { ...STORED, read: { text: FIVE, at: AT } };
    mount();
    await click("idea-insert");
    expect(h.put).toHaveBeenCalledWith(h.requestInsert, FIVE);
    expect(h.toast).not.toHaveBeenCalledWith(E.idea_inserted);
  });

  it("Check again reads the idea again and keeps the new read", async () => {
    h.blob.value = { ...STORED, read: { text: "old", at: AT } };
    mount();
    await click("idea-again");
    expect(h.callAI).toHaveBeenCalledTimes(1);
    expect(lastUpdate(h.blob.value).read!.text).toBe(FIVE);
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

describe("The Idea place: a conflicted save held for an unreadable blob", () => {
  it("keeps showing the student's text while a conflicted save is held for an unreadable blob", async () => {
    const HELD = { topic: "sleep and memory", resources: "school survey", timeframe: "six months", constraints: "no lab" };
    h.real = true;
    h.projectId = "p1";
    stored = { body: JSON.stringify(HELD), version: 1 };
    puts = [];
    h.api.mockImplementation(fakeApi);
    const values = () => ids.map((id) => field(id).value);
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    roots.push(root);
    await act(async () => { root.render(<VaultProvider><IdeaPlace /></VaultProvider>); });
    await settle();
    expect(values()).toEqual(Object.values(HELD));
    // Another window leaves a body this build cannot read; the next save loses the race and its re-read cannot open it.
    stored = { body: "{not json", version: 2 };
    type("ideaTime", "one year");
    await settle(BLOB_SAVE_DEBOUNCE_MS + 150);
    expect(puts.map((p) => p.ifMatch)).toEqual(['"1"']);
    expect(values()).toEqual([HELD.topic, HELD.resources, "one year", HELD.constraints]);
    expect($('[data-testid="idea-broken"]')!.textContent).toBe(E.vault_idea_broken);
    // One more character keeps the other fields (the held value, not the blank, is the base), and nothing replaces the unreadable blob.
    type("ideaTime", "one year!");
    await settle(BLOB_SAVE_DEBOUNCE_MS + 150);
    type("ideaTopic", "sleep and memory, again");
    await settle(BLOB_SAVE_DEBOUNCE_MS + 150);
    expect(values()).toEqual(["sleep and memory, again", HELD.resources, "one year!", HELD.constraints]);
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
