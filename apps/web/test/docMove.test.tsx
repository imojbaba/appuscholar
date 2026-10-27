// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";

const h = vi.hoisted(() => ({ api: vi.fn(), toast: vi.fn(), ws: null as unknown }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u-move", scratchProjectId: "s1" }, settings: {} }) }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/ai/useCallAI", () => ({ useCallAI: () => vi.fn() }));
vi.mock("@/lib/ai/useKeys", () => ({ useKeys: () => ({ hasKey: () => false }) }));
vi.mock("@/lib/ai/suggestion", () => ({ useSuggestion: () => ({ editor: null }) }));
vi.mock("@/components/frame/ProjectContext", async (orig) => ({ ...(await orig<typeof import("../components/frame/ProjectContext")>()), useProject: () => h.ws }));

import { ApiError } from "../lib/api";
import { VaultProvider } from "../lib/vault/useVault";
import { DocBar } from "../components/document/DocBar";
import { NewStudy } from "../components/frame/NewStudy";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });
async function until(pred: () => boolean) {
  for (let i = 0; i < 400; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); }
  throw new Error("condition not reached");
}
const project = (id: string, status = "active") => ({ id, title: "Project " + id, titleKeyVersion: 0, deks: [], field: "", stage: "idea", status, contentLang: "en", kind: "research" });
const doc = { id: "D1", projectId: "s1", title: "Scratch notes", titleKeyVersion: 0, deks: [], kind: "draft", currentSeq: 1, wordCount: 2, createdAt: "2026-10-21T00:00:00Z", updatedAt: "2026-10-21T00:00:00Z", bodyHtml: "<p>x</p>", keyVersion: 0 };
const moves = () => h.api.mock.calls.filter(([p]) => String(p).endsWith("/move"));

async function render(node: React.ReactNode) {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  roots.push(root);
  await act(async () => { root.render(<VaultProvider>{node}</VaultProvider>); });
  return host;
}
const click = async (el: Element | null) => { await act(async () => { (el as HTMLElement).click(); }); };

let moved: typeof doc | null = null;
beforeEach(() => {
  moved = null;
  h.toast.mockReset();
  h.api.mockReset().mockImplementation((path: string, init?: { method?: string; body?: string }) => {
    if (path === "/me/vault") return Promise.reject(new ApiError(404, "not-found"));
    if (path === "/projects" && init?.method === "POST") return Promise.resolve(project("pNew"));
    if (path === "/projects") return Promise.resolve([project("p1"), project("p2", "complete")]);
    if (path === "/documents/D1/move") { moved = { ...doc, projectId: JSON.parse(init!.body!).projectId }; return Promise.resolve(moved); }
    // First run keeps the idea with the project it creates, then lists its documents (the moved one).
    if (path === "/projects/pNew/blobs/idea_intake" && init?.method === "PUT") return Promise.resolve({ kind: "idea_intake", body: JSON.parse(init.body!).body, keyVersion: 0, deks: [], updatedAt: "", version: 1 });
    if (path === "/projects/pNew/documents" && !init?.method) return Promise.resolve(moved ? [moved] : []);
    return Promise.reject(new ApiError(404, "not-found"));
  });
  h.ws = { project: null, documents: [doc], currentDoc: doc, selectDoc: vi.fn(), reloadDocs: vi.fn(), startImport: vi.fn(), restoreDocument: vi.fn(), patchDoc: vi.fn(), registerFlush: vi.fn(), flushOpen: vi.fn(async () => true), openProject: vi.fn(async () => true), go: vi.fn(async () => true) };
});

describe("Move to project", () => {
  it("moving a scratch document into a project calls the move route and opens it there", async () => {
    await render(<DocBar />);
    await click(document.querySelector('[data-testid="doc-move"]'));
    await until(() => document.querySelectorAll('[data-testid="doc-move-project"]').length > 0);
    const items = [...document.querySelectorAll('[data-testid="doc-move-project"]')];
    // Open projects only, under their opened titles.
    expect(items.map((b) => b.textContent)).toEqual(["Project p1"]);
    await click(items[0]!);
    await until(() => (h.ws as { openProject: ReturnType<typeof vi.fn> }).openProject.mock.calls.length > 0);
    expect(moves().map(([p, i]) => [p, JSON.parse((i as { body: string }).body)])).toEqual([["/documents/D1/move", { projectId: "p1" }]]);
    expect((h.ws as { openProject: ReturnType<typeof vi.fn> }).openProject).toHaveBeenCalledWith("p1", { docId: "D1" });
  });

  it("New study goes to Start a new study carrying the document, which moves it into the study it creates", async () => {
    await render(<DocBar />);
    await click(document.querySelector('[data-testid="doc-move"]'));
    await until(() => !!document.querySelector('[data-testid="doc-move-new"]'));
    await click(document.querySelector('[data-testid="doc-move-new"]'));
    expect((h.ws as { go: ReturnType<typeof vi.fn> }).go).toHaveBeenCalledWith("/start?move=D1");

    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    document.body.innerHTML = "";
    await render(<NewStudy moveDocId="D1" />);
    expect(document.body.textContent).toContain(en.start_move_note);
    const input = document.querySelector("#newName") as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Sleep");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(document.querySelector('[data-testid="new-type-masters"]'));
    await click(document.querySelector('[data-testid="new-create"]'));
    await until(() => (h.ws as { openProject: ReturnType<typeof vi.fn> }).openProject.mock.calls.length > 0);
    expect(moves().map(([p, i]) => [p, JSON.parse((i as { body: string }).body)])).toEqual([["/documents/D1/move", { projectId: "pNew" }]]);
    expect((h.ws as { openProject: ReturnType<typeof vi.fn> }).openProject).toHaveBeenCalledWith("pNew", { docId: "D1" });
  });
});
