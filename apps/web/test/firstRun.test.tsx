// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildIdeaPromptV2, fieldLabel } from "@appuscholar/core";
import en from "../messages/en.json";

type Call = { path: string; method: string; body: unknown; headers?: Record<string, string> };
const h = vi.hoisted(() => ({
  api: vi.fn(), toast: vi.fn(), callAI: vi.fn(), openProject: vi.fn(), openSettings: vi.fn(),
  hasKey: true,
  vault: null as unknown as Record<string, unknown>
}));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/vault/useVault", async (orig) => ({ ...(await orig<typeof import("../lib/vault/useVault")>()), useVault: () => h.vault }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", scratchProjectId: "s1" }, settings: { field: "psychology", provider: "groq" } }) }));
vi.mock("@/lib/ai/useCallAI", () => ({ useCallAI: () => h.callAI }));
vi.mock("@/lib/ai/useKeys", () => ({ useKeys: () => ({ hasKey: () => h.hasKey }) }));
vi.mock("@/lib/ai/suggestion", () => ({ useSuggestion: () => ({ editor: null }) }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ project: null, projectId: null, openProject: h.openProject, openSettings: h.openSettings }) }));

import { ApiError } from "../lib/api";
import { ideaTitle } from "../lib/frame/ideaRead";
import { FirstRun } from "../components/frame/FirstRun";
import { clearJustMade, readJustMade } from "../lib/frame/justMade";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const E = en as Record<string, string>;
const TOPIC = "Does a fixed bedtime routine for one week lower exam anxiety in first-year college students?";
const FIVE = [
  "Clear question: High. Specific change and a measurable outcome.",
  "Reaching people: Medium. One college limits how far results generalise.",
  "Time: High. A semester is enough for a one-week routine.",
  "Resources: Medium. A paper questionnaire works; plan the analysis early.",
  "Ethics: Medium. Monthly committee: book the date before anything else.",
  "Verdict: Go ahead, with two changes."
].join("\n");
const project = { id: "pNew", title: "x", titleKeyVersion: 1, deks: [], field: "", stage: "idea", status: "active", contentLang: "en", kind: "research" };
const doc = (id: string, projectId: string) => ({ id, projectId, title: "t", titleKeyVersion: 0, deks: [], kind: "draft", currentSeq: 0, wordCount: 0, createdAt: "2026-10-21T00:00:00Z", updatedAt: "2026-10-21T00:00:00Z", bodyHtml: "", keyVersion: 0 });
let calls: Call[];
let docs: Record<string, ReturnType<typeof doc>[]>;
const roots: Root[] = [];
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel);
const sent = (method: string, path: string) => calls.filter((c) => c.method === method && c.path === path);

/** Vault on and open: a sealed value is "sealed[<key id>]" + its text, and a first seal makes the entity's dek. */
function vaultOn() {
  return {
    status: "unlocked",
    known: vi.fn(async () => "unlocked"),
    ensureUnlocked: vi.fn(async () => true),
    encryptBody: vi.fn(async (d: { id: string; deks: unknown[] }, html: string) => ({ bodyHtml: `sealed[${d.id}]` + html, keyVersion: 1, ...(d.deks.length ? {} : { dek: { v: 1, wrapped: "dek-" + d.id } }) })),
    decryptBody: vi.fn()
  };
}

function fakeApi(path: string, init: RequestInit = {}) {
  const method = init.method ?? "GET";
  const body = init.body ? JSON.parse(String(init.body)) : undefined;
  calls.push({ path, method, body, headers: init.headers as Record<string, string> | undefined });
  if (path === "/projects" && method === "POST") return Promise.resolve(project);
  if (path === "/projects/pNew/blobs/idea_intake") {
    if (method === "GET") return Promise.reject(new ApiError(404, "not-found"));
    return Promise.resolve({ kind: "idea_intake", body: body.body, keyVersion: body.keyVersion, deks: [], updatedAt: "2026-10-21T00:00:00Z", version: 1 });
  }
  if (path === "/projects/pNew/documents" && method === "GET") return Promise.resolve(docs.pNew ?? []);
  if (path === "/projects/pNew/documents" && method === "POST") { const made = doc("Dfirst", "pNew"); docs.pNew = [made]; return Promise.resolve(made); }
  if (path === "/projects/pNew/ai-use/claim" && method === "POST") return Promise.resolve({ claimed: 1 });
  if (path === "/documents/D1/move") { docs.pNew = [doc("D1", body.projectId)]; return Promise.resolve(docs.pNew[0]); }
  return Promise.reject(new ApiError(404, "not-found"));
}

async function render(node: React.ReactNode = <FirstRun />) {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  roots.push(root);
  await act(async () => { root.render(node); });
}
async function type(id: string, value: string) {
  const el = $("#" + id) as HTMLTextAreaElement | HTMLInputElement;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function click(testid: string) {
  await act(async () => { $(`[data-testid="${testid}"]`)!.click(); await new Promise((r) => setTimeout(r, 0)); });
}
async function until(pred: () => boolean) {
  for (let i = 0; i < 400; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); }
  throw new Error("condition not reached");
}

beforeEach(() => {
  calls = [];
  docs = {};
  h.vault = vaultOn();
  h.hasKey = true;
  h.api.mockReset().mockImplementation(fakeApi);
  h.toast.mockReset(); h.openSettings.mockReset();
  h.openProject.mockReset().mockResolvedValue(true);
  h.callAI.mockReset().mockResolvedValue(FIVE);
});
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });

describe("First run", () => {
  it("asks what the student wants to study, in the canvas's words", async () => {
    await render();
    expect($("h1")!.textContent).toBe("What do you want to study?");
    expect($('[data-testid="idea-hint"]')!.textContent).toBe("Write it roughly, in your own words. We will sharpen it together into a question you can actually answer.");
    expect($("h2")!.textContent).toBe(E.idea_sharpen_h);
    expect($('label[for="ideaTopic"]')!.textContent).toBe("Your idea");
    expect($('[data-testid="idea-read"]')).toBeNull();
  });

  it("the read comes back with Save as my project and Edit the question, and the name is the idea's first 60 characters cut at a word", async () => {
    await render();
    await type("ideaTopic", TOPIC);
    await click("idea-check");
    expect(h.callAI).toHaveBeenCalledWith(buildIdeaPromptV2(fieldLabel("psychology"), { topic: TOPIC, resources: "", timeframe: "", constraints: "" }).prompt, { temp: 0.3, max: 1200 });
    const panel = $('[data-testid="idea-read"]')!;
    expect(panel.querySelector(".ai-read-label")!.textContent).toBe(E.idea_read_label);
    expect(panel.querySelectorAll('[data-testid="idea-read-line"]')).toHaveLength(5);
    expect(panel.querySelector('[data-testid="idea-save"]')!.textContent).toBe("Save as my project");
    expect(panel.querySelector('[data-testid="idea-edit"]')!.textContent).toBe("Edit the question");
    expect(panel.querySelector('[data-testid="idea-insert"]')).toBeNull();
    expect(($('[data-testid="idea-save-title"]') as HTMLInputElement).value).toBe(ideaTitle(TOPIC));
    expect(ideaTitle(TOPIC)).toBe("Does a fixed bedtime routine for one week lower exam anxiety");
    expect($('[data-testid="idea-save-after"]')!.textContent).toBe("After saving, every stage of your project is open. Most people find papers next.");
    await click("idea-edit");
    expect(document.activeElement).toBe($("#ideaTopic"));
  });

  it("Save as my project creates the project, its intake with the read and a first document, then opens home", async () => {
    await render();
    await type("ideaTopic", TOPIC);
    await type("ideaRes", "60 volunteers");
    await click("idea-check");
    await type("ideaTime", "one semester");
    await click("idea-save");
    await until(() => h.openProject.mock.calls.length > 0);
    // The title is sealed under a new project's key id, and its dek travels with the create.
    const [create] = sent("POST", "/projects");
    const keyId = /^sealed\[(project:new:[0-9a-f-]{36})\]/.exec((create!.body as { title: string }).title)![1]!;
    expect(create!.body).toEqual({ title: `sealed[${keyId}]` + ideaTitle(TOPIC), titleKeyVersion: 1, dek: { v: 1, wrapped: "dek-" + keyId } });
    // The intake as typed, with the read and its time, sealed under the new project's blob key.
    const [put] = sent("PUT", "/projects/pNew/blobs/idea_intake");
    const body = (put!.body as { body: string; keyVersion: number }).body;
    expect(body.startsWith("sealed[blob:pNew:idea_intake]")).toBe(true);
    const intake = JSON.parse(body.slice("sealed[blob:pNew:idea_intake]".length));
    expect(intake).toEqual({ topic: TOPIC, resources: "60 volunteers", timeframe: "one semester", constraints: "", read: { text: FIVE, at: expect.any(String) } });
    // A first document, then the project opens (recorded as active, its home shown).
    expect(sent("POST", "/projects/pNew/documents")).toHaveLength(1);
    expect(h.openProject).toHaveBeenCalledWith("pNew", {});
    const order = calls.map((c) => c.method + " " + c.path);
    expect(order.indexOf("POST /projects")).toBeLessThan(order.indexOf("PUT /projects/pNew/blobs/idea_intake"));
    expect(order.indexOf("PUT /projects/pNew/blobs/idea_intake")).toBeLessThan(order.indexOf("POST /projects/pNew/documents"));
  });

  it("O3: while the project is being made, the button and a status line say so (not only a dimmed button)", async () => {
    await render();
    await type("ideaTopic", TOPIC);
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    h.api.mockImplementation(async (path: string, init?: RequestInit) => { if (path === "/projects" && init?.method === "POST") await held; return fakeApi(path, init); });
    expect($('[data-testid="idea-save-progress"]')!.textContent).toBe("");
    await click("idea-save");
    const button = $('[data-testid="idea-save"]') as HTMLButtonElement;
    expect(button.textContent).toBe(E.idea_save_busy);
    expect(button.disabled).toBe(true);
    expect($('[data-testid="idea-save-progress"]')!.getAttribute("role")).toBe("status");
    expect($('[data-testid="idea-save-progress"]')!.textContent).toBe(E.idea_save_busy_note);
    await act(async () => { release(); });
    await until(() => h.openProject.mock.calls.length > 0);
    await until(() => $('[data-testid="idea-save-progress"]')!.textContent === "");
  });

  it("the new project is marked as just made, with whether its idea was checked, so its home can say once what was saved", async () => {
    clearJustMade();
    await render();
    await type("ideaTopic", TOPIC);
    await click("idea-check");
    await click("idea-save");
    await until(() => h.openProject.mock.calls.length > 0);
    expect(readJustMade("pNew")).toEqual({ id: "pNew", checked: true });
    expect(readJustMade("another")).toBeNull();
    clearJustMade();
  });

  it("after a check, saving claims the check's AI-use rows for the new project, so its AI-use statement counts them", async () => {
    await render();
    await type("ideaTopic", TOPIC);
    await click("idea-check");
    await click("idea-save");
    await until(() => h.openProject.mock.calls.length > 0);
    const [claim] = sent("POST", "/projects/pNew/ai-use/claim");
    // How long ago the first check began, by this tab's own clock, with a minute's margin for the request's way to the server.
    const ago = (claim!.body as { secondsAgo: number }).secondsAgo;
    expect(ago).toBeGreaterThanOrEqual(60);
    expect(ago).toBeLessThan(120);
    const order = calls.map((c) => c.method + " " + c.path);
    expect(order.indexOf("POST /projects")).toBeLessThan(order.indexOf("POST /projects/pNew/ai-use/claim"));
  });

  it("a save with no check claims nothing", async () => {
    await render();
    await type("ideaTopic", "Sleep and exam stress");
    await click("idea-save");
    await until(() => h.openProject.mock.calls.length > 0);
    expect(sent("POST", "/projects/pNew/ai-use/claim")).toHaveLength(0);
  });

  it("with ?move= the document moves into the new project, which opens on it, and no other document is made", async () => {
    await render(<FirstRun moveDocId="D1" />);
    expect($('[data-testid="start-move-note"]')!.textContent).toBe(E.start_move_note);
    await type("ideaTopic", "Sleep and exam stress");
    await click("idea-check");
    await click("idea-save");
    await until(() => h.openProject.mock.calls.length > 0);
    expect(sent("POST", "/documents/D1/move").map((c) => c.body)).toEqual([{ projectId: "pNew" }]);
    expect(sent("POST", "/projects/pNew/documents")).toHaveLength(0);
    expect(h.openProject).toHaveBeenCalledWith("pNew", { docId: "D1" });
  });

  it("a project can be saved without a check (no AI key yet), and the check is done later in the Idea place", async () => {
    h.hasKey = false;
    await render();
    await type("ideaTopic", "Sleep and exam stress");
    expect(($('[data-testid="idea-save-title"]') as HTMLInputElement).value).toBe("Sleep and exam stress");
    await click("idea-save");
    await until(() => h.openProject.mock.calls.length > 0);
    const intake = JSON.parse(((sent("PUT", "/projects/pNew/blobs/idea_intake")[0]!.body as { body: string }).body).replace(/^sealed\[[^\]]+\]/, ""));
    expect(intake).toEqual({ topic: "Sleep and exam stress", resources: "", timeframe: "", constraints: "" });
    expect(h.callAI).not.toHaveBeenCalled();
  });

  it("a project saved with a name and no idea stores no idea_intake, so its Idea stage stays not started", async () => {
    await render();
    await type("ideaSaveTitle", "Second project");
    await click("idea-save");
    await until(() => h.openProject.mock.calls.length > 0);
    expect(sent("POST", "/projects")).toHaveLength(1);
    expect(calls.filter((c) => c.path === "/projects/pNew/blobs/idea_intake")).toEqual([]);
    expect(sent("POST", "/projects/pNew/documents")).toHaveLength(1);
    expect(h.openProject).toHaveBeenCalledWith("pNew", {});
  });

  it("with no AI key the button opens the key dialog and sends nothing", async () => {
    h.hasKey = false;
    await render();
    await type("ideaTopic", TOPIC);
    await click("idea-check");
    expect(h.openSettings).toHaveBeenCalledWith("groq");
    expect(h.callAI).not.toHaveBeenCalled();
    expect($('[data-testid="idea-read"]')).toBeNull();
  });

  it("an unparsable read is shown as it came", async () => {
    h.callAI.mockResolvedValue("It is doable.\nAsk your supervisor about ethics.");
    await render();
    await type("ideaTopic", TOPIC);
    await click("idea-check");
    expect($('[data-testid="idea-read-raw"]')!.textContent).toBe("It is doable.\nAsk your supervisor about ethics.");
  });

  it("a cancelled unlock creates nothing; an empty name asks for one", async () => {
    h.vault = { ...vaultOn(), known: vi.fn(async () => "locked"), ensureUnlocked: vi.fn(async () => false) };
    await render();
    await type("ideaTopic", TOPIC);
    await click("idea-save");
    expect(h.toast).toHaveBeenCalledWith(E.vault_save_locked);
    await type("ideaSaveTitle", "  ");
    await click("idea-save");
    expect(h.toast).toHaveBeenLastCalledWith(E.start_name_first);
    expect(sent("POST", "/projects")).toHaveLength(0);
    expect(h.openProject).not.toHaveBeenCalled();
  });

  it("with the vault off the name and the intake go as typed", async () => {
    h.vault = { ...vaultOn(), known: vi.fn(async () => "off") };
    await render();
    await type("ideaTopic", "Sleep");
    await click("idea-save");
    await until(() => h.openProject.mock.calls.length > 0);
    expect(sent("POST", "/projects")[0]!.body).toEqual({ title: "Sleep", titleKeyVersion: 0 });
    expect(sent("PUT", "/projects/pNew/blobs/idea_intake")[0]!.body).toMatchObject({ keyVersion: 0, body: JSON.stringify({ topic: "Sleep", resources: "", timeframe: "", constraints: "" }) });
  });
});
