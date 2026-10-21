// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateVaultKey, sealVaultCheck, wrapWithPassphrase } from "../lib/vault/crypto";
import en from "../messages/en.json";

const h = vi.hoisted(() => ({ api: vi.fn(), ask: vi.fn(), toast: vi.fn(), ws: null as unknown, downloads: [] as string[] }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u-titles", scratchProjectId: "p1" }, settings: {} }) }));
vi.mock("@/components/workspace/dialogs/Passphrase", async () => (await import("./support/passphraseMock")).passphraseMock(h.ask));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/ai/useKeys", () => ({ useKeys: () => ({ hasKey: () => false }) }));
vi.mock("@/lib/ai/suggestion", async (orig) => ({ ...(await orig<typeof import("../lib/ai/suggestion")>()), useSuggestion: () => ({ setEditor: () => {}, tab: () => false }) }));
vi.mock("@/components/frame/ProjectContext", async (orig) => ({ ...(await orig<typeof import("../components/frame/ProjectContext")>()), useProject: () => h.ws }));
vi.mock("@/lib/export/download", async (orig) => ({ ...(await orig<typeof import("../lib/export/download")>()), downloadBlob: (name: string) => { h.downloads.push(name); } }));
// The real editor needs a layout engine: the stub hands the card an editor that only answers its HTML, so the downloads are enabled.
vi.mock("@/components/editor/Editor", async () => {
  const { useEffect } = await import("react");
  return {
    Editor: ({ initialHtml, onEditor }: { initialHtml: string; onEditor: (e: unknown) => void }) => {
      // Once per editor, as the real one reports its instance.
      useEffect(() => { onEditor({ instanceId: 1, getHTML: () => initialHtml }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
      return <div data-testid="editor-stub">{initialHtml}</div>;
    }
  };
});
vi.mock("../components/document/FormatBar", () => ({ FormatBar: () => null }));
vi.mock("../components/document/SelectionBubble", () => ({ SelectionBubble: () => null }));
vi.mock("../components/document/ActionRow", () => ({ ActionRow: () => null }));

import { ApiError } from "../lib/api";
import { useVault, VaultProvider, type VaultValue } from "../lib/vault/useVault";
import { DocumentCard } from "../components/document/DocumentCard";
import type { DocumentWithBody } from "../components/frame/ProjectContext";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PASS = "right passphrase";
const TITLE = "Chapter one on procrastination";
let record: Record<string, unknown>;
beforeEach(async () => {
  const vk = await generateVaultKey();
  record = { passWrapped: await wrapWithPassphrase(vk, PASS), recoveryWrapped: "x.y.z", checkWrapped: await sealVaultCheck(vk), publicKey: "pk", privateKeyWrapped: "w", complete: true, updatedAt: new Date().toISOString() };
  h.api.mockReset().mockImplementation((path: string) => (path === "/me/vault" ? Promise.resolve({ ...record }) : Promise.reject(new ApiError(404, "not-found"))));
  h.ask.mockReset();
  h.downloads = [];
});
const roots: Root[] = [];
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });
async function until(pred: () => boolean) {
  for (let i = 0; i < 400; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); }
  throw new Error("condition not reached");
}
/** A document whose title is sealed under its own dek (sealed with a second provider of the same vault, then locked again). */
async function sealedDoc(id: string, keyVersion = 1): Promise<DocumentWithBody> {
  const box: { v: VaultValue | null } = { v: null };
  function Probe() { box.v = useVault(); return null; }
  const root = createRoot(document.createElement("div"));
  roots.push(root);
  await act(async () => { root.render(<VaultProvider><Probe /></VaultProvider>); });
  await until(() => box.v?.status === "locked");
  await act(async () => { await box.v!.unlock(PASS, false); });
  const s = await box.v!.encryptBody({ id, deks: [] }, TITLE);
  act(() => { box.v!.lock(); });
  // The body is plain (it opens without the vault), so the editor and the downloads are there while the title stays locked.
  return { id, projectId: "p1", title: s.bodyHtml, titleKeyVersion: keyVersion, kind: "draft", currentSeq: 1, wordCount: 3, createdAt: "2026-10-21T00:00:00Z", updatedAt: "2026-10-21T00:00:00Z", bodyHtml: "<p>my own words</p>", keyVersion: 0, deks: [s.dek!] };
}
async function renderCard(current: DocumentWithBody) {
  // A second, plain document: delete asks nothing for the only one.
  const other = { ...current, id: "d-notes", title: "Notes", titleKeyVersion: 0, deks: [] };
  h.ws = { project: null, documents: [current, other], currentDoc: current, selectDoc: vi.fn(async () => true), reloadDocs: vi.fn(), startImport: vi.fn(), restoreDocument: vi.fn(), patchDoc: vi.fn(), registerFlush: vi.fn(), registerEditor: vi.fn(), flushOpen: vi.fn(async () => true), setWordCount: vi.fn() };
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  roots.push(root);
  const box: { v: VaultValue | null } = { v: null };
  function Probe() { box.v = useVault(); return null; }
  await act(async () => { root.render(<VaultProvider><Probe /><DocumentCard /></VaultProvider>); });
  await until(() => box.v?.status === "locked" && !!host.querySelector('[data-testid="editor-stub"]'));
  const q = <T extends Element = HTMLElement>(id: string) => host.querySelector<T>(`[data-testid="${id}"]`);
  return { host, q, vault: box };
}
const click = async (el: Element | null) => { await act(async () => { (el as HTMLElement).click(); }); };

describe("the document's title readers, with the vault locked", () => {
  it("DocBar and DocumentCard show Locked title, never the ciphertext, and a Word download is named untitled.doc", async () => {
    const d = await sealedDoc("d1");
    const { host, q } = await renderCard(d);
    const options = Array.from(q<HTMLSelectElement>("doc-select")!.options).map((o) => o.textContent);
    expect(options).toEqual([en.title_locked, "Notes"]);
    expect(host.textContent).not.toContain(d.title);
    expect(document.body.innerHTML).not.toContain(d.title);
    // The delete question names it the same way.
    await click(q("doc-delete"));
    expect(document.body.textContent).toContain(`Delete "${en.title_locked}" permanently?`);
    expect(document.body.innerHTML).not.toContain(d.title);
    await click(document.querySelector('[data-testid="doc-delete-cancel"]'));
    // The downloads take the opened-title rule: "untitled" while it is locked.
    await click(q("download-word"));
    await click(q("download-latex"));
    expect(h.downloads).toEqual(["untitled.doc", "untitled.tex"]);
    expect(h.ask).not.toHaveBeenCalled();
  }, 30_000);

  it("a title that does not open shows This title cannot be opened, and downloads as untitled.doc", async () => {
    // Its key version is not among the document's deks: it never opens, even unlocked.
    const d = await sealedDoc("d1", 2);
    const { q, vault } = await renderCard(d);
    await act(async () => { await vault.v!.unlock(PASS, false); });
    await until(() => q<HTMLSelectElement>("doc-select")!.options[0]!.textContent === en.title_unreadable);
    expect(document.body.innerHTML).not.toContain(d.title);
    await click(q("download-word"));
    expect(h.downloads).toEqual(["untitled.doc"]);
  }, 30_000);

  it("Rename asks for the passphrase first and opens with the opened name; a cancelled ask opens nothing", async () => {
    const d = await sealedDoc("d1");
    const { q } = await renderCard(d);
    h.ask.mockResolvedValueOnce(null);
    await click(q("doc-rename"));
    await until(() => h.ask.mock.calls.length === 1);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(document.querySelector('[data-testid="doc-name-dialog"]')).toBeNull();
    h.ask.mockResolvedValueOnce(PASS);
    await click(q("doc-rename"));
    await until(() => !!document.querySelector('[data-testid="doc-name-input"]'));
    expect(h.ask).toHaveBeenCalledTimes(2);
    expect(document.querySelector<HTMLInputElement>('[data-testid="doc-name-input"]')!.value).toBe(TITLE);
  }, 30_000);
});
