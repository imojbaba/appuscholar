// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ api: vi.fn(), ask: vi.fn(), toast: vi.fn() }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", scratchProjectId: "scratch-1" }, settings: { field: "nursing" } }) }));
vi.mock("@/components/workspace/dialogs/Passphrase", async () => (await import("./support/passphraseMock")).passphraseMock(h.ask));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/ai/useCallAI", () => ({ useCallAI: () => vi.fn() }));
vi.mock("@/lib/ai/suggestion", () => ({ useSuggestion: () => ({ setThinking: vi.fn(), isCurrent: vi.fn(), set: vi.fn(), clear: vi.fn() }) }));
vi.mock("@/components/workspace/WorkspaceContext", () => ({ useWorkspace: () => ({ project: { id: "p1" }, openSaveAs: h.toast, dockShow: vi.fn() }) }));

import { ApiError } from "../lib/api";
import { VaultProvider } from "../lib/vault/useVault";
import { BLOB_SAVE_DEBOUNCE_MS } from "../lib/blobs/useProjectBlob";
import { heldBlobs } from "../lib/blobs/held";
import { IdeaPanel } from "../components/tools/IdeaPanel";
import en from "../messages/en.json";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const E = en as Record<string, string>;
const STORED = { topic: "sleep and memory", resources: "school survey", timeframe: "six months", constraints: "no lab" };
const ids = ["ideaTopic", "ideaRes", "ideaTime", "ideaCons"] as const;
let stored: { body: string; version: number };
let puts: Array<{ ifMatch: string | undefined; body: string }>;
const roots: Root[] = [];
const field = (id: string) => document.body.querySelector("#" + id) as HTMLTextAreaElement | HTMLInputElement;
const values = () => ids.map((id) => field(id).value);
const settle = (ms = 30) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
function type(id: string, value: string) {
  const el = field(id);
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => { Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); });
}

/** The idea_intake blob route with versions (If-Match), vault off. */
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

beforeEach(() => {
  stored = { body: JSON.stringify(STORED), version: 1 };
  puts = [];
  h.api.mockReset().mockImplementation(fakeApi);
  h.toast.mockReset();
  heldBlobs.clear();
});
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });

describe("Idea & Feasibility: a conflicted save held for an unreadable blob", () => {
  it("the Idea panel keeps showing the student's text while a conflicted save is held for an unreadable blob", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    roots.push(root);
    await act(async () => { root.render(<VaultProvider><IdeaPanel /></VaultProvider>); });
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(values()).toEqual(Object.values(STORED));
    // Another window leaves a body this build cannot read; the next save loses the race and its re-read cannot open it.
    stored = { body: "{not json", version: 2 };
    type("ideaTime", "one year");
    await settle(BLOB_SAVE_DEBOUNCE_MS + 150);
    expect(puts.map((p) => p.ifMatch)).toEqual(['"1"']);
    // The four boxes still show what the student typed and the rest of the intake: nothing went blank.
    expect(values()).toEqual([STORED.topic, STORED.resources, "one year", STORED.constraints]);
    expect(document.body.querySelector('[data-testid="idea-broken"]')!.textContent).toBe(E.vault_idea_broken);
    // One more character keeps the other fields (the held value, not the blank, is the base), and nothing replaces the unreadable blob.
    type("ideaTime", "one year!");
    await settle(BLOB_SAVE_DEBOUNCE_MS + 150);
    expect(values()).toEqual([STORED.topic, STORED.resources, "one year!", STORED.constraints]);
    type("ideaTopic", "sleep and memory, again");
    await settle(BLOB_SAVE_DEBOUNCE_MS + 150);
    expect(values()).toEqual(["sleep and memory, again", STORED.resources, "one year!", STORED.constraints]);
    expect(puts).toHaveLength(1);
    expect(stored.body).toBe("{not json");
  });
});
