// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encryptText, generateDek, generateKeypair, generateVaultKey, wrapKey, wrapPrivateKey, wrapWithPassphrase, wrapWithRecovery } from "../lib/vault/crypto";

const h = vi.hoisted(() => ({ api: vi.fn(), ask: vi.fn(), ws: null as unknown, stub: () => null }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/settings", () => ({
  useSettings: () => ({ me: { id: "u-ws", activeProjectId: null, scratchProjectId: "p1", termsAcceptedAt: "2999-01-01T00:00:00Z" }, settings: { seenWelcome: true }, update: async () => undefined, reload: async () => undefined })
}));
vi.mock("@/components/workspace/dialogs/Passphrase", () => ({ askPassphrase: h.ask }));
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));
vi.mock("@/lib/useMedia", () => ({ PHONE_QUERY: "p", MID_QUERY: "m", useMedia: () => false }));
// The workspace's chrome is not under test: every child is a stub, the document card shows which document is open and how.
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
vi.mock("@/lib/ai/suggestion", () => ({ SuggestionProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/document/DocumentCard", async () => {
  const { useWorkspace } = await import("../components/workspace/WorkspaceContext");
  return {
    DocumentCard: () => {
      const ws = useWorkspace();
      h.ws = ws;
      const d = ws.currentDoc;
      return <div data-testid="shown">{d ? d.id + ":" + (d.unreadable ?? d.bodyHtml) : "none"}</div>;
    }
  };
});

import { ApiError } from "../lib/api";
import { VaultProvider } from "../lib/vault/useVault";
import { Workspace } from "../components/workspace/Workspace";
import type { WorkspaceValue } from "../components/workspace/WorkspaceContext";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const PASS = "right passphrase";
const roots: Root[] = [];
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });
async function until(pred: () => boolean) {
  for (let i = 0; i < 600; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); }
  throw new Error("condition not reached");
}

describe("Workspace document switching with the vault", () => {
  it("cancel on A, select B, unlock: B is shown, not A", async () => {
    const vk = await generateVaultKey();
    const kp = await generateKeypair();
    const record = { passWrapped: await wrapWithPassphrase(vk, PASS), recoveryWrapped: await wrapWithRecovery(vk, "AAAAA-BBBBB-CCCCC-DDDDD"), publicKey: kp.publicKeyB64, privateKeyWrapped: await wrapPrivateKey(kp.privateKey, vk), complete: true, updatedAt: new Date().toISOString() };
    const sealed = async (id: string, html: string) => {
      const dek = await generateDek();
      return { id, projectId: "p1", title: id, kind: "draft", currentSeq: 1, wordCount: 2, createdAt: "2026-10-16T00:00:0" + (id === "A" ? "1" : "2") + "Z", updatedAt: "2026-10-16T00:00:00Z", keyVersion: 1, deks: [{ v: 1, wrapped: await wrapKey(dek, vk) }], bodyHtml: await encryptText(html, dek) };
    };
    const docs = { A: await sealed("A", "<p>text of A</p>"), B: await sealed("B", "<p>text of B</p>") };
    h.api.mockImplementation((path: string) => {
      if (path === "/me/vault") return Promise.resolve({ ...record });
      if (path === "/projects/p1/documents") return Promise.resolve([docs.A, docs.B]);
      const m = /^\/documents\/([AB])$/.exec(path);
      if (m) return Promise.resolve({ ...docs[m[1] as "A" | "B"] });
      return Promise.reject(new ApiError(404, "not-found"));
    });
    let answerB!: (p: string | null) => void;
    h.ask.mockReset()
      .mockResolvedValueOnce(null) // A opens: the student cancels
      .mockImplementationOnce(() => new Promise<string | null>((r) => { answerB = r; })); // B opens: answered below
    const host = document.body.appendChild(document.createElement("div"));
    const root = createRoot(host);
    roots.push(root);
    await act(async () => { root.render(<VaultProvider><Workspace /></VaultProvider>); });
    const shown = () => host.querySelector('[data-testid="shown"]')?.textContent;
    await until(() => shown() === "A:locked");
    let switched!: Promise<boolean>;
    await act(async () => { switched = (h.ws as WorkspaceValue).selectDoc("B"); });
    await until(() => h.ask.mock.calls.length === 2);
    // Unlocking for B opens the vault, which would also reopen the locked A: B must win.
    // Decryption that takes longer than a render (a long document): the vault's "unlocked" render lands while B is still decrypting.
    const realDecrypt = crypto.subtle.decrypt.bind(crypto.subtle);
    const slow = vi.spyOn(crypto.subtle, "decrypt").mockImplementation(async (...a: Parameters<SubtleCrypto["decrypt"]>) => {
      await new Promise((r) => setTimeout(r, 50));
      return realDecrypt(...a);
    });
    // Renders run in small ticks while the unlock and B's decrypt are under way, as in the browser (one big act would batch them away).
    let done = false;
    void switched.then((ok) => { done = ok; });
    answerB(PASS);
    await until(() => done);
    await until(() => shown() !== "A:locked");
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    expect(shown()).toBe("B:<p>text of B</p>");
    slow.mockRestore();
  }, 30_000);
});
