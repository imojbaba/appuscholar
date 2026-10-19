// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptText, generateDek, generateKeypair, generateVaultKey, sealVaultCheck, wrapKey, wrapPrivateKey, wrapWithPassphrase, wrapWithRecovery } from "../lib/vault/crypto";

/**
 * The workspace's shared citation library (CiteLibraryProvider, fix round 1 of Task 8a): it waits for the project the workspace loads (never the
 * scratch project's blob while the active project is loading), and it never asks for the passphrase on its own: the document's unlock comes
 * first, a cancelled one is not asked again, and after an unlock the library is read without another prompt.
 */

const h = vi.hoisted(() => ({ api: vi.fn(), ask: vi.fn(), stub: () => null, libs: [] as unknown[][] }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/settings", () => ({
  useSettings: () => ({ me: { id: "u-lib", activeProjectId: "p2", scratchProjectId: "p1", termsAcceptedAt: "2999-01-01T00:00:00Z" }, settings: { seenWelcome: true }, update: async () => undefined, reload: async () => undefined })
}));
vi.mock("@/components/workspace/dialogs/Passphrase", async () => (await import("./support/passphraseMock")).passphraseMock(h.ask));
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));
vi.mock("@/lib/useMedia", () => ({ PHONE_QUERY: "p", MID_QUERY: "m", useMedia: () => false }));
vi.mock("@/components/workspace/Header", () => ({ Header: h.stub, ChromeDialogs: h.stub }));
vi.mock("@/components/workspace/Subbar", () => ({ Subbar: h.stub }));
vi.mock("@/components/workspace/ProjectBar", () => ({ ProjectBar: h.stub }));
vi.mock("@/components/workspace/Sidebar", () => ({ Sidebar: h.stub }));
vi.mock("@/components/workspace/SidebarDrawer", () => ({ SidebarDrawer: h.stub }));
vi.mock("@/components/workspace/Dock", () => ({ Dock: h.stub }));
vi.mock("@/components/workspace/dialogs/SaveAsProject", () => ({ SaveAsProject: h.stub }));
vi.mock("@/components/workspace/dialogs/Projects", () => ({ Projects: h.stub }));
vi.mock("@/components/workspace/dialogs/StageIntro", () => ({ StageIntro: h.stub }));
vi.mock("@/components/workspace/dialogs/ImportOrigin", () => ({ ImportOrigin: h.stub }));
vi.mock("@/components/workspace/dialogs/MyWriting", () => ({ MyWriting: h.stub }));
vi.mock("@/components/workspace/dialogs/ImportV1Dialog", () => ({ ImportV1Dialog: h.stub }));
vi.mock("@/lib/ai/suggestion", () => ({ SuggestionProvider: ({ children }: { children: React.ReactNode }) => children, useSuggestion: () => ({ editor: null }) }));
// The document card stands in for the caret chip: it reads the workspace's library passively, as the chip does.
vi.mock("@/components/document/DocumentCard", async () => {
  const { useWorkspace } = await import("../components/workspace/WorkspaceContext");
  const { useLibrary } = await import("../lib/cite/useLibrary");
  return {
    DocumentCard: () => {
      const ws = useWorkspace();
      const { lib } = useLibrary({ passive: true });
      h.libs.push(lib);
      const d = ws.currentDoc;
      return <div data-testid="shown">{d ? d.id + ":" + (d.unreadable ?? d.bodyHtml) : "none"}</div>;
    }
  };
});

import { ApiError } from "../lib/api";
import { VaultProvider } from "../lib/vault/useVault";
import { Workspace } from "../components/workspace/Workspace";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const PASS = "right passphrase";
const SMITH = { author: "Smith, John", year: "2020", title: "Sleep and memory" };
const P2 = { id: "p2", title: "Thesis", field: "psychology", stage: "lit", status: "active", contentLang: "en", kind: "research" };
const roots: Root[] = [];
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });
beforeEach(() => { h.api.mockReset(); h.ask.mockReset(); h.libs = []; });
async function until(pred: () => boolean) {
  for (let i = 0; i < 600; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); }
  throw new Error("condition not reached");
}
async function settle(ms = 150) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }
const paths = () => h.api.mock.calls.map((c) => String(c[0]));
const docRow = (over: Record<string, unknown>) => ({ id: "A", projectId: "p2", title: "A", kind: "draft", currentSeq: 1, wordCount: 2, createdAt: "2026-10-16T00:00:01Z", updatedAt: "2026-10-16T00:00:00Z", ...over });
async function mount() {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  roots.push(root);
  await act(async () => { root.render(<VaultProvider><Workspace /></VaultProvider>); });
  return () => host.querySelector('[data-testid="shown"]')?.textContent;
}

describe("the workspace's shared citation library", () => {
  it("with an active project, only that project's citations blob is read, never the scratch project's", async () => {
    const doc = docRow({ keyVersion: 0, deks: [], bodyHtml: "<p>open text</p>" });
    h.api.mockImplementation((path: string) => {
      if (path === "/projects") return Promise.resolve([P2]);
      if (path === "/projects/p2/documents") return Promise.resolve([doc]);
      if (path === "/documents/A") return Promise.resolve({ ...doc });
      if (path === "/projects/p2/blobs/citations") return Promise.resolve({ kind: "citations", body: JSON.stringify([SMITH]), keyVersion: 0, deks: [], updatedAt: "2026-10-19T00:00:00Z" });
      return Promise.reject(new ApiError(404, "not-found")); // /me/vault: no vault
    });
    const shown = await mount();
    await until(() => shown() === "A:<p>open text</p>");
    await until(() => h.libs.some((l) => l.length === 1));
    expect(paths().filter((p) => p.includes("/blobs/"))).toEqual(["/projects/p2/blobs/citations"]);
    expect(paths().some((p) => p.startsWith("/projects/p1/"))).toBe(false);
    expect(h.libs.at(-1)).toEqual([SMITH]);
  }, 30_000);

  describe("with a locked vault", () => {
    async function sealedSetup() {
      const vk = await generateVaultKey();
      const kp = await generateKeypair();
      const record = { passWrapped: await wrapWithPassphrase(vk, PASS), recoveryWrapped: await wrapWithRecovery(vk, "AAAAA-BBBBB-CCCCC-DDDDD"), checkWrapped: await sealVaultCheck(vk), publicKey: kp.publicKeyB64, privateKeyWrapped: await wrapPrivateKey(kp.privateKey, vk), complete: true, updatedAt: new Date().toISOString() };
      const seal = async (text: string) => { const dek = await generateDek(); return { keyVersion: 1, deks: [{ v: 1, wrapped: await wrapKey(dek, vk) }], body: await encryptText(text, dek) }; };
      const d = await seal("<p>sealed text</p>");
      const doc = docRow({ keyVersion: d.keyVersion, deks: d.deks, bodyHtml: d.body });
      const b = await seal(JSON.stringify([SMITH]));
      h.api.mockImplementation((path: string) => {
        if (path === "/me/vault") return Promise.resolve({ ...record });
        if (path === "/projects") return Promise.resolve([P2]);
        if (path === "/projects/p2/documents") return Promise.resolve([doc]);
        if (path === "/documents/A") return Promise.resolve({ ...doc });
        if (path === "/projects/p2/blobs/citations") return Promise.resolve({ kind: "citations", body: b.body, keyVersion: 1, deks: b.deks, updatedAt: "2026-10-19T00:00:00Z" });
        return Promise.reject(new ApiError(404, "not-found"));
      });
    }

    it("the document asks first; a cancel is not asked again by the library, which stays unread", async () => {
      await sealedSetup();
      h.ask.mockResolvedValue(null);
      const shown = await mount();
      await until(() => shown() === "A:locked");
      await settle(300);
      expect(h.ask).toHaveBeenCalledTimes(1);
      expect(paths().some((p) => p.includes("/blobs/"))).toBe(false);
      expect(h.libs.every((l) => l.length === 0)).toBe(true);
    }, 30_000);

    it("an unlock at the document's ask opens the library too, with no second ask, read after the document", async () => {
      await sealedSetup();
      h.ask.mockResolvedValueOnce(PASS);
      const shown = await mount();
      await until(() => shown() === "A:<p>sealed text</p>");
      await until(() => h.libs.some((l) => l.length === 1));
      expect(h.ask).toHaveBeenCalledTimes(1);
      const p = paths();
      expect(p.filter((x) => x.includes("/blobs/"))).toEqual(["/projects/p2/blobs/citations"]);
      expect(p.indexOf("/projects/p2/blobs/citations")).toBeGreaterThan(p.indexOf("/documents/A"));
      expect(h.libs.at(-1)).toEqual([SMITH]);
    }, 30_000);
  });
});
