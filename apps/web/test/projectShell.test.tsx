// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptText, generateDek, generateKeypair, generateVaultKey, sealVaultCheck, wrapKey, wrapPrivateKey, wrapWithPassphrase, wrapWithRecovery } from "../lib/vault/crypto";
import en from "../messages/en.json";

const h = vi.hoisted(() => ({
  api: vi.fn(), ask: vi.fn(), toast: vi.fn(), push: vi.fn(), reload: vi.fn(), path: "/p/p1", ws: null as unknown, stub: () => null, header: false,
  me: { id: "u-ws", activeProjectId: "p1" as string | null, scratchProjectId: "s1", termsAcceptedAt: "2999-01-01T00:00:00Z" }
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push, replace: h.push }),
  usePathname: () => h.path,
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); }
}));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/settings", () => ({
  useSettings: () => ({ me: h.me, settings: { seenWelcome: true }, update: async () => undefined, reload: h.reload })
}));
vi.mock("@/components/workspace/dialogs/Passphrase", async () => (await import("./support/passphraseMock")).passphraseMock(h.ask));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
// The frame's chrome and the panels are not under test: every one is a stub, the document card shows which document is open and how.
// The real header only where a test asks for it (`h.header`): the wordmark's way out of the project.
vi.mock("@/components/frame/AppHeader", async (orig) => {
  const real = await orig<typeof import("../components/frame/AppHeader")>();
  return { AppHeader: () => (h.header ? <real.AppHeader /> : null) };
});
vi.mock("@/lib/ai/useKeys", () => ({ useKeys: () => ({ hasKey: () => false }) }));
vi.mock("@/components/workspace/ChromeDialogs", () => ({ ChromeDialogs: h.stub }));
vi.mock("@/components/workspace/dialogs/ImportOrigin", () => ({ ImportOrigin: h.stub }));
vi.mock("@/components/workspace/dialogs/MyWriting", () => ({ MyWriting: h.stub }));
vi.mock("@/components/workspace/dialogs/ImportV1Dialog", () => ({ ImportV1Dialog: h.stub }));
vi.mock("@/lib/cite/useLibrary", () => ({ CiteLibraryProvider: ({ children }: { children: React.ReactNode }) => children, useLibrary: () => ({ lib: [], loading: false, locked: false }) }));
// Literature's tab counts (Task 10).
vi.mock("@/lib/shelf/useShelf", () => ({ useShelf: () => ({ index: null }) }));
vi.mock("@/lib/cite/capture", () => ({ CaptureHash: h.stub }));
vi.mock("@/lib/ai/suggestion", () => ({ SuggestionProvider: ({ children }: { children: React.ReactNode }) => children, useSuggestion: () => ({ editor: null }) }));
vi.mock("@/components/literature/FindTab", () => ({ FindTab: () => <div data-testid="panel-find" /> }));
vi.mock("@/components/places/IdeaPlace", () => ({ IdeaPlace: () => <div data-testid="panel-idea" /> }));
vi.mock("@/components/tools/cite/CitePanel", () => ({ CitePanel: () => <div data-testid="panel-cite" /> }));
vi.mock("@/components/tools/analyse/AnalysePanel", () => ({ AnalysePanel: () => <div data-testid="panel-analyse" /> }));
vi.mock("@/components/tools/analyse/Across", () => ({ Across: () => <div data-testid="ap-across" /> }));
vi.mock("@/components/tools/shelf/ShelfDialog", () => ({ ShelfDialog: h.stub, ShelfMatrix: () => <div data-testid="shelf-matrix" /> }));
vi.mock("@/components/document/DocumentCard", async () => {
  const { useProject } = await import("../components/frame/ProjectContext");
  return {
    DocumentCard: () => {
      const ws = useProject();
      h.ws = ws;
      const d = ws.currentDoc;
      return <div data-testid="shown">{d ? d.id + ":" + (d.unreadable ?? d.bodyHtml) : "none"}</div>;
    }
  };
});

import { ApiError } from "../lib/api";
import { heldBlobs } from "../lib/blobs/held";
import { VaultProvider } from "../lib/vault/useVault";
import { ProjectShell } from "../components/frame/ProjectShell";
import { resetPaperIdsRun } from "../components/frame/PaperIdsRunner";
import PlacePage from "../app/(app)/p/[projectId]/[stage]/[[...tab]]/page";
import { useProject, type ProjectValue } from "../components/frame/ProjectContext";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const PASS = "right passphrase";
const roots: Root[] = [];
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; heldBlobs.clear(); });
async function until(pred: () => boolean) {
  for (let i = 0; i < 600; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); }
  throw new Error("condition not reached");
}

const project = (id: string) => ({ id, title: "Project " + id, titleKeyVersion: 0, deks: [], field: "psychology", stage: "idea", status: "active", contentLang: "en", kind: "research", stageMarks: {} });
const plainDoc = (id: string, projectId: string) => ({ id, projectId, title: id, titleKeyVersion: 0, deks: [], kind: "draft", currentSeq: 1, wordCount: 2, createdAt: "2026-10-16T00:00:01Z", updatedAt: "2026-10-16T00:00:00Z", keyVersion: 0, bodyHtml: "<p>text of " + id + "</p>" });

/** A vault-off account with projects p1 and p2, one plain document each. */
function plainApi() {
  h.api.mockImplementation((path: string, init?: { method?: string }) => {
    if (path === "/me/vault") return Promise.reject(new ApiError(404, "not-found"));
    if (path === "/projects") return Promise.resolve([project("p1"), project("p2")]);
    if (path === "/me/active-project" && init?.method === "PATCH") return Promise.resolve(undefined);
    const list = /^\/projects\/(p1|p2)\/documents$/.exec(path);
    if (list) return Promise.resolve([plainDoc("D" + list[1], list[1]!)]);
    const one = /^\/documents\/D(p1|p2)$/.exec(path);
    if (one) return Promise.resolve(plainDoc("D" + one[1], one[1]!));
    if (path === "/documents/X/restore-deleted" && init?.method === "POST") return Promise.resolve(plainDoc("X", "p1"));
    return Promise.reject(new ApiError(404, "not-found"));
  });
}

async function mount(projectId: string, children: React.ReactNode = null) {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  roots.push(root);
  await act(async () => { root.render(<VaultProvider><ProjectShell projectId={projectId}>{children}</ProjectShell></VaultProvider>); });
  return host;
}
const ws = () => h.ws as ProjectValue;
/** What a place sees of the shell: the context, kept where ws() reads it (a place's own window draws no document, so the document card never does). */
function Probe() {
  const project = useProject();
  useEffect(() => { h.ws = project; });
  return null;
}
const patches = () => h.api.mock.calls.filter(([p, i]) => p === "/me/active-project" && (i as { method?: string } | undefined)?.method === "PATCH");

beforeEach(() => {
  h.api.mockReset(); h.toast.mockReset(); h.push.mockReset(); h.ask.mockReset(); h.reload.mockReset().mockResolvedValue(undefined);
  h.path = "/p/p1"; h.ws = null; h.header = false; h.me = { ...h.me, activeProjectId: "p1" };
});

describe("ProjectShell", () => {
  it("a reload on /p/<id>/lit/find opens that place", async () => {
    plainApi();
    h.path = "/p/p1/lit/find";
    const page = await PlacePage({ params: Promise.resolve({ projectId: "p1", stage: "lit", tab: ["find"] }) });
    const host = await mount("p1", page);
    await until(() => !!host.querySelector('[data-testid="panel-find"]'));
    expect(ws().place).toEqual({ stage: "lit", tab: "find" });
    expect(ws().projectId).toBe("p1");
    // The place keeps its address: nothing navigates away on load.
    expect(h.push).not.toHaveBeenCalled();
    // An unknown tab is not a place.
    await expect(PlacePage({ params: Promise.resolve({ projectId: "p1", stage: "lit", tab: ["matrix"] }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("opening a project records it as active, then goes to its home", async () => {
    plainApi();
    await mount("p1");
    await until(() => ws()?.currentDoc?.id === "Dp1");
    let shown!: boolean;
    await act(async () => { shown = await ws().openProject("p2"); });
    expect(shown).toBe(true);
    expect(patches().map(([, i]) => JSON.parse((i as { body: string }).body))).toEqual([{ projectId: "p2" }]);
    expect(h.push).toHaveBeenCalledWith("/p/p2");
  });

  it("switching project with an unsaved document asks Switch anyway?", async () => {
    plainApi();
    const host = await mount("p1");
    await until(() => ws()?.currentDoc?.id === "Dp1");
    // The editor's last save failed: its text is not stored.
    act(() => { ws().registerFlush(async () => false); });
    let first!: Promise<boolean>;
    await act(async () => { first = ws().openProject("p2"); });
    await until(() => !!document.querySelector('[data-testid="switch-dialog"]'));
    expect(document.querySelector('[data-testid="switch-dialog"]')!.textContent).toContain('Unsaved changes in "Dp1" may be lost.');
    await act(async () => { (document.querySelector('[data-testid="switch-stay"]') as HTMLButtonElement).click(); });
    expect(await first).toBe(false);
    expect(patches()).toHaveLength(0);
    expect(h.push).not.toHaveBeenCalled();

    let second!: Promise<boolean>;
    await act(async () => { second = ws().openProject("p2"); });
    await until(() => !!document.querySelector('[data-testid="switch-anyway"]'));
    await act(async () => { (document.querySelector('[data-testid="switch-anyway"]') as HTMLButtonElement).click(); });
    expect(await second).toBe(true);
    expect(h.push).toHaveBeenCalledWith("/p/p2");
    expect(host).toBeTruthy();
  });

  it("switching project with a held blob value keeps it and says so", async () => {
    plainApi();
    await mount("p1");
    await until(() => ws()?.currentDoc?.id === "Dp1");
    // An idea typed while the vault was locked, held for this tab when its panel went away.
    heldBlobs.put("p1:idea_intake", [{ value: { topic: "Sleep" } }], async (ops) => ops);
    await act(async () => { await ws().openProject("p2"); });
    expect(h.toast).toHaveBeenCalledWith(en.blob_switch_held);
    expect(heldBlobs.has("p1:idea_intake")).toBe(true);
    expect(h.push).toHaveBeenCalledWith("/p/p2");
  });

  it("the wordmark with an unsaved document asks Switch anyway?; Stay keeps the address", async () => {
    plainApi();
    h.header = true;
    const host = await mount("p1");
    await until(() => ws()?.currentDoc?.id === "Dp1");
    act(() => { ws().registerFlush(async () => false); });
    await act(async () => { (host.querySelector('[data-testid="wordmark"]') as HTMLAnchorElement).click(); });
    await until(() => !!document.querySelector('[data-testid="switch-dialog"]'));
    await act(async () => { (document.querySelector('[data-testid="switch-stay"]') as HTMLButtonElement).click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(h.push).not.toHaveBeenCalled();

    // Switch anyway leaves for the list; a held stage value is announced as on a switch.
    heldBlobs.put("p1:idea_intake", [{ value: { topic: "Sleep" } }], async (ops) => ops);
    await act(async () => { (host.querySelector('[data-testid="wordmark"]') as HTMLAnchorElement).click(); });
    await until(() => !!document.querySelector('[data-testid="switch-anyway"]'));
    await act(async () => { (document.querySelector('[data-testid="switch-anyway"]') as HTMLButtonElement).click(); });
    await until(() => h.push.mock.calls.length > 0);
    expect(h.push).toHaveBeenCalledWith("/projects");
    expect(h.toast).toHaveBeenCalledWith(en.blob_switch_held);
  });

  it("a move within the project asks nothing", async () => {
    plainApi();
    await mount("p1");
    await until(() => ws()?.currentDoc?.id === "Dp1");
    act(() => { ws().registerFlush(async () => false); });
    await act(async () => { await ws().go("/p/p1/lit/find"); });
    expect(document.querySelector('[data-testid="switch-dialog"]')).toBeNull();
    expect(h.push).toHaveBeenCalledWith("/p/p1/lit/find");
  });

  it("a switch writes the active project once: the old shell does not write its own back", async () => {
    plainApi();
    h.reload.mockImplementation(async () => { h.me = { ...h.me, activeProjectId: "p2" }; });
    await mount("p1");
    await until(() => ws()?.currentDoc?.id === "Dp1");
    await act(async () => { await ws().openProject("p2"); });
    // A render of the old shell after the reload (before the new address mounts its own).
    act(() => { ws().openDocument(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(patches().map(([, i]) => JSON.parse((i as { body: string }).body))).toEqual([{ projectId: "p2" }]);
  });

  it("Undo after a switch restores through the shell mounted now, which opens the document's project", async () => {
    plainApi();
    await mount("p1");
    await until(() => ws()?.currentDoc?.id === "Dp1");
    // The toast's Undo holds the first shell's restoreDocument; that shell then goes away with the switch.
    const undo = ws().restoreDocument;
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    h.path = "/p/p2"; h.me = { ...h.me, activeProjectId: "p2" };
    await mount("p2");
    await until(() => ws()?.currentDoc?.id === "Dp2");
    let shown!: boolean;
    await act(async () => { shown = await undo("X", "p1"); });
    expect(shown).toBe(true);
    expect(h.push).toHaveBeenCalledWith("/p/p1");
    expect(patches().map(([, i]) => JSON.parse((i as { body: string }).body))).toEqual([{ projectId: "p1" }]);
  });

  it("the scratch space opens at its writing place, recorded as no active project", async () => {
    plainApi();
    await mount("p1");
    await until(() => ws()?.currentDoc?.id === "Dp1");
    await act(async () => { await ws().openProject(null); });
    expect(patches().map(([, i]) => JSON.parse((i as { body: string }).body))).toEqual([{ projectId: null }]);
    expect(h.push).toHaveBeenCalledWith("/p/s1/writing");
  });
});

describe("ProjectShell document switching with the vault", () => {
  it("starts the paper-id migration once the project has loaded, and tells the places when it is done (Task 17)", async () => {
    resetPaperIdsRun();
    plainApi();
    await mount("p1");
    await until(() => ws().paperIds === "done");
    // Nothing is stored in this account, so there was nothing to write: no PUT, and the blobs it looked at are the library's, the reading list's and the notes'.
    const sent = h.api.mock.calls.filter(([, i]) => (i as { method?: string } | undefined)?.method === "PUT").map(([p]) => p);
    expect(sent).toEqual([]);
    expect(h.api.mock.calls.some(([p]) => String(p).includes("rewrite"))).toBe(false);
  });

  it("a place's own window does not start the migration and does not wait for it", async () => {
    resetPaperIdsRun();
    plainApi();
    window.history.replaceState(null, "", "/p/p1/lit/find?window=1");
    try {
      await mount("p1", <Probe />);
      await until(() => h.ws !== null && ws().projectId === "p1");
      expect(ws().paperIds).toBe("busy");
      expect(h.api.mock.calls.some(([p]) => String(p).includes("/blobs/shelf_index"))).toBe(false);
    } finally { window.history.replaceState(null, "", "/"); }
  });

  it("cancel on A, select B, unlock: B is shown, not A", async () => {
    h.me = { ...h.me, activeProjectId: null };
    h.path = "/p/s1/writing";
    const vk = await generateVaultKey();
    const kp = await generateKeypair();
    const record = { passWrapped: await wrapWithPassphrase(vk, PASS), recoveryWrapped: await wrapWithRecovery(vk, "AAAAA-BBBBB-CCCCC-DDDDD"), checkWrapped: await sealVaultCheck(vk), publicKey: kp.publicKeyB64, privateKeyWrapped: await wrapPrivateKey(kp.privateKey, vk), complete: true, updatedAt: new Date().toISOString() };
    const sealed = async (id: string, html: string) => {
      const dek = await generateDek();
      return { id, projectId: "s1", title: id, titleKeyVersion: 0, kind: "draft", currentSeq: 1, wordCount: 2, createdAt: "2026-10-16T00:00:0" + (id === "A" ? "1" : "2") + "Z", updatedAt: "2026-10-16T00:00:00Z", keyVersion: 1, deks: [{ v: 1, wrapped: await wrapKey(dek, vk) }], bodyHtml: await encryptText(html, dek) };
    };
    const docs = { A: await sealed("A", "<p>text of A</p>"), B: await sealed("B", "<p>text of B</p>") };
    h.api.mockImplementation((path: string) => {
      if (path === "/me/vault") return Promise.resolve({ ...record });
      if (path === "/projects") return Promise.resolve([]);
      if (path === "/projects/s1/documents") return Promise.resolve([docs.A, docs.B]);
      const m = /^\/documents\/([AB])$/.exec(path);
      if (m) return Promise.resolve({ ...docs[m[1] as "A" | "B"] });
      return Promise.reject(new ApiError(404, "not-found"));
    });
    let answerB!: (p: string | null) => void;
    h.ask.mockReset()
      .mockResolvedValueOnce(null) // A opens: the student cancels
      .mockImplementationOnce(() => new Promise<string | null>((r) => { answerB = r; })); // B opens: answered below
    const host = await mount("s1");
    const shown = () => host.querySelector('[data-testid="shown"]')?.textContent;
    await until(() => shown() === "A:locked");
    let switched!: Promise<boolean>;
    await act(async () => { switched = ws().selectDoc("B"); });
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
