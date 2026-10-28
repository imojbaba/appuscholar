// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../lib/api";

/*
 * Ruling R33: a tool module may export a DocumentLayer, which the project shell mounts once in the writing window (never in a pop-out) for each
 * module that is built, whatever place or tab is open. Here stats is a built probe module with a layer, qual an unbuilt one with a layer, and
 * style a built module with a layer that is a plain function component, as a session writes one.
 */

const h = vi.hoisted(() => ({
  api: vi.fn(), push: vi.fn(), path: "/p/p1/lit/find", stub: () => null,
  me: { id: "u-dl", activeProjectId: "p1" as string | null, scratchProjectId: "s1", termsAcceptedAt: "2999-01-01T00:00:00Z" }
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push, replace: h.push }), usePathname: () => h.path }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: h.me, settings: { seenWelcome: true }, update: async () => undefined, reload: async () => undefined }) }));
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));
vi.mock("@/components/frame/AppHeader", () => ({ AppHeader: h.stub }));
vi.mock("@/components/frame/WindowHeader", () => ({ WindowHeader: h.stub }));
vi.mock("@/components/workspace/ChromeDialogs", () => ({ ChromeDialogs: h.stub }));
vi.mock("@/components/workspace/dialogs/ImportOrigin", () => ({ ImportOrigin: h.stub }));
vi.mock("@/components/workspace/dialogs/MyWriting", () => ({ MyWriting: h.stub }));
vi.mock("@/components/workspace/dialogs/ImportV1Dialog", () => ({ ImportV1Dialog: h.stub }));
vi.mock("@/lib/cite/useLibrary", () => ({ CiteLibraryProvider: ({ children }: { children: React.ReactNode }) => children, useLibrary: () => ({ lib: [], loading: false, locked: false }) }));
vi.mock("@/lib/cite/capture", () => ({ CaptureHash: h.stub }));
vi.mock("@/lib/ai/suggestion", () => ({ SuggestionProvider: ({ children }: { children: React.ReactNode }) => children, useSuggestion: () => ({ editor: null }) }));
vi.mock("@/components/document/DocumentCard", () => ({ DocumentCard: h.stub }));
vi.mock("@/components/tools/stats", () => ({
  built: true,
  DocumentLayer: ({ projectId }: { projectId: string }) => <i data-testid="layer-stats">{projectId}</i>
}));
vi.mock("@/components/tools/qual", () => ({
  built: false,
  DocumentLayer: () => <i data-testid="layer-qual" />
}));
vi.mock("@/components/tools/style", () => ({
  built: true,
  Panel: () => null,
  DocumentLayer: ({ projectId }: { projectId: string }) => <i data-testid="layer-style">{projectId}</i>
}));

import { VaultProvider } from "../lib/vault/useVault";
import { ProjectShell } from "../components/frame/ProjectShell";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; window.history.replaceState(null, "", "/"); });
async function until(pred: () => boolean) {
  for (let i = 0; i < 600; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); }
  throw new Error("condition not reached");
}
const tid = (id: string) => document.body.querySelectorAll(`[data-testid="${id}"]`);

beforeEach(() => {
  h.api.mockReset(); h.push.mockReset(); h.path = "/p/p1/lit/find";
  h.api.mockImplementation((path: string, init?: { method?: string }) => {
    if (path === "/me/vault") return Promise.reject(new ApiError(404, "not-found"));
    if (path === "/projects") return Promise.resolve([{ id: "p1", title: "P", titleKeyVersion: 0, deks: [], field: "psychology", stage: "idea", status: "active", contentLang: "en", kind: "research", stageMarks: {} }]);
    if (path === "/me/active-project" && init?.method === "PATCH") return Promise.resolve(undefined);
    if (path === "/projects/p1/documents") return Promise.resolve([{ id: "D1", projectId: "p1", title: "D1", titleKeyVersion: 0, deks: [], kind: "draft", currentSeq: 1, wordCount: 1, createdAt: "2026-10-16T00:00:01Z", updatedAt: "2026-10-16T00:00:00Z", keyVersion: 0, bodyHtml: "<p>x</p>" }]);
    return Promise.reject(new ApiError(404, "not-found"));
  });
});
async function mount() {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  roots.push(root);
  await act(async () => { root.render(<VaultProvider><ProjectShell projectId="p1" /></VaultProvider>); });
}

describe("a tool module's DocumentLayer (ruling R33)", () => {
  it("mounts once for each built module that declares one, in the writing window, whatever place is open", async () => {
    await mount();
    await until(() => tid("layer-stats").length > 0);
    expect(tid("layer-stats")).toHaveLength(1);
    expect(tid("layer-stats")[0]!.textContent).toBe("p1");
    expect(tid("layer-style")).toHaveLength(1);
  });

  it("does not mount for a module that is not built", async () => {
    await mount();
    await until(() => tid("layer-stats").length > 0);
    expect(tid("layer-qual")).toHaveLength(0);
  });

  it("does not mount in a pop-out", async () => {
    window.history.replaceState(null, "", "/p/p1/collect/data?window=1");
    h.path = "/p/p1/collect/data";
    await mount();
    // The pop-out's shell has loaded the project, and still draws no layer.
    await until(() => h.api.mock.calls.some(([p]) => p === "/projects/p1/documents"));
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(tid("layer-stats")).toHaveLength(0);
    expect(tid("layer-style")).toHaveLength(0);
  });
});
