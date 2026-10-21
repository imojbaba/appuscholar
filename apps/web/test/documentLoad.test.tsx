// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeypair, generateVaultKey, sealVaultCheck, wrapPrivateKey, wrapWithPassphrase, wrapWithRecovery } from "../lib/vault/crypto";
import en from "../messages/en.json";

const h = vi.hoisted(() => ({ api: vi.fn(), ask: vi.fn(), toast: vi.fn(), ws: null as unknown, editors: [] as string[] }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u-load", scratchProjectId: "p1" }, settings: {} }) }));
vi.mock("@/components/workspace/dialogs/Passphrase", async () => (await import("./support/passphraseMock")).passphraseMock(h.ask));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/ai/useKeys", () => ({ useKeys: () => ({ hasKey: () => false }) }));
vi.mock("@/lib/ai/suggestion", async (orig) => ({ ...(await orig<typeof import("../lib/ai/suggestion")>()), useSuggestion: () => ({ setEditor: () => {}, tab: () => false }) }));
vi.mock("@/components/frame/ProjectContext", async (orig) => ({ ...(await orig<typeof import("../components/frame/ProjectContext")>()), useProject: () => h.ws }));
// The real editor needs a layout engine; the stub records which body it was opened with, once per editor (a re-render opens nothing).
vi.mock("@/components/editor/Editor", async () => {
  const { useState } = await import("react");
  return { Editor: ({ initialHtml }: { initialHtml: string }) => { useState(() => h.editors.push(initialHtml)); return <div data-testid="editor-stub">{initialHtml}</div>; } };
});

import { ApiError } from "../lib/api";
import { useVault, VaultProvider, type VaultValue } from "../lib/vault/useVault";
import { readableDoc } from "../components/frame/ProjectShell";
import { DocumentCard } from "../components/document/DocumentCard";
import type { DocumentWithBody } from "../components/frame/ProjectContext";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Rec = { passWrapped: string; recoveryWrapped: string; checkWrapped: string; publicKey: string | null; privateKeyWrapped: string | null; complete: boolean; updatedAt: string };
const PASS = "right passphrase";
let record: Rec;
beforeEach(async () => {
  const vk = await generateVaultKey();
  const kp = await generateKeypair();
  record = { passWrapped: await wrapWithPassphrase(vk, PASS), recoveryWrapped: await wrapWithRecovery(vk, "AAAAA-BBBBB-CCCCC-DDDDD"), checkWrapped: await sealVaultCheck(vk), publicKey: kp.publicKeyB64, privateKeyWrapped: await wrapPrivateKey(kp.privateKey, vk), complete: true, updatedAt: new Date().toISOString() };
  h.api.mockReset().mockImplementation((path: string) => (path === "/me/vault" ? Promise.resolve({ ...record }) : Promise.reject(new ApiError(404, "not-found"))));
  h.ask.mockReset();
  h.editors = [];
});
const roots: Root[] = [];
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });
async function until(pred: () => boolean) {
  for (let i = 0; i < 400; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); }
  throw new Error("condition not reached");
}
async function mountVault() {
  const box: { v: VaultValue | null } = { v: null };
  function Probe() { box.v = useVault(); return null; }
  const root = createRoot(document.createElement("div"));
  roots.push(root);
  await act(async () => { root.render(<VaultProvider><Probe /></VaultProvider>); });
  await until(() => box.v?.status === "locked");
  return box;
}
function doc(id: string, over: Partial<DocumentWithBody> = {}): DocumentWithBody {
  return { id, projectId: "p1", title: "Doc " + id, titleKeyVersion: 0, kind: "draft", currentSeq: 1, wordCount: 0, createdAt: "2026-10-16T00:00:00Z", updatedAt: "2026-10-16T00:00:00Z", bodyHtml: "", keyVersion: 0, deks: [], ...over };
}
async function renderCard(current: DocumentWithBody, documents: DocumentWithBody[]) {
  const selectDoc = vi.fn(async () => true);
  h.ws = { project: null, documents, currentDoc: current, selectDoc, reloadDocs: vi.fn(), startImport: vi.fn(), restoreDocument: vi.fn(), patchDoc: vi.fn(), registerFlush: vi.fn(), flushOpen: vi.fn(async () => true), setWordCount: vi.fn() };
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  roots.push(root);
  await act(async () => { root.render(<VaultProvider><DocumentCard /></VaultProvider>); });
  return { host, selectDoc };
}

describe("document load", () => {
  const HTML = "<p>The chapter on procrastination, in my own words.</p>";

  it("load decrypts keyVersion 1 and passes keyVersion 0 through", async () => {
    const vault = await mountVault();
    await act(async () => { await vault.v!.unlock(PASS, false); });
    const sealed = await vault.v!.encryptBody({ id: "d1", deks: [] }, HTML);
    const enc = doc("d1", { bodyHtml: sealed.bodyHtml, keyVersion: 1, deks: [sealed.dek!] });
    const opened = await readableDoc(vault.v!, enc);
    expect(opened.bodyHtml).toBe(HTML);
    expect(opened.unreadable).toBeUndefined();
    expect(opened.keyVersion).toBe(1);
    expect(opened.deks).toEqual([sealed.dek]);
    // Plaintext needs no key: it opens as it is even with the vault locked, and nothing is asked.
    act(() => { vault.v!.lock(); });
    const ensure = vi.spyOn(vault.v!, "ensureUnlocked");
    const old = doc("d0", { bodyHtml: "<p>written before the vault</p>" });
    const same = await readableDoc(vault.v!, old);
    expect(same.bodyHtml).toBe("<p>written before the vault</p>");
    expect(same.unreadable).toBeUndefined();
    expect(ensure).not.toHaveBeenCalled();
    expect(h.ask).not.toHaveBeenCalled();
  }, 30_000);

  it("a locked vault asks for the passphrase before the editor opens, and a cancel shows vault_doc_locked", async () => {
    const vault = await mountVault();
    await act(async () => { await vault.v!.unlock(PASS, false); });
    const sealed = await vault.v!.encryptBody({ id: "d1", deks: [] }, HTML);
    act(() => { vault.v!.lock(); });
    const enc = doc("d1", { bodyHtml: sealed.bodyHtml, keyVersion: 1, deks: [sealed.dek!] });
    h.ask.mockResolvedValueOnce(PASS);
    expect((await readableDoc(vault.v!, enc)).bodyHtml).toBe(HTML);
    expect(h.ask).toHaveBeenCalledTimes(1);
    act(() => { vault.v!.lock(); });
    h.ask.mockResolvedValueOnce(null);
    const shut = await readableDoc(vault.v!, enc);
    expect(shut.unreadable).toBe("locked");
    expect(shut.bodyHtml).toBe("");
    const { host } = await renderCard(shut, [shut, doc("d2")]);
    expect(host.querySelector('[data-testid="doc-unreadable"]')?.textContent).toBe(en.vault_doc_locked);
    expect(host.querySelector('[data-testid="editor-stub"]')).toBeNull();
    expect(h.editors).toEqual([]);
  }, 30_000);

  it("a corrupt body shows vault_doc_broken and keeps the Doc list", async () => {
    const vault = await mountVault();
    await act(async () => { await vault.v!.unlock(PASS, false); });
    const sealed = await vault.v!.encryptBody({ id: "d1", deks: [] }, HTML);
    // One character of the ciphertext changed on the server: AES-GCM refuses it.
    const [iv, ct] = sealed.bodyHtml.split(".");
    const tampered = iv + "." + (ct![0] === "A" ? "B" : "A") + ct!.slice(1);
    const bad = await readableDoc(vault.v!, doc("d1", { bodyHtml: tampered, keyVersion: 1, deks: [sealed.dek!] }));
    expect(bad.unreadable).toBe("broken");
    // A missing dek is the same case.
    expect((await readableDoc(vault.v!, doc("d3", { bodyHtml: sealed.bodyHtml, keyVersion: 2, deks: [sealed.dek!] }))).unreadable).toBe("broken");
    const other = doc("d2", { bodyHtml: "<p>fine</p>" });
    const { host, selectDoc } = await renderCard(bad, [bad, other]);
    expect(host.querySelector('[data-testid="doc-unreadable"]')?.textContent).toBe(en.vault_doc_broken);
    // Never an empty editor that could be saved over the document.
    expect(host.querySelector('[data-testid="editor-stub"]')).toBeNull();
    expect(h.editors).toEqual([]);
    // The Doc list still works: both documents are listed and choosing the other one asks the workspace to open it.
    const select = host.querySelector<HTMLSelectElement>('[data-testid="doc-select"]')!;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(["d1", "d2"]);
    await act(async () => { select.value = "d2"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(selectDoc).toHaveBeenCalledWith("d2");
    expect(host.querySelector<HTMLButtonElement>('[data-testid="doc-new"]')!.disabled).toBe(false);
  }, 30_000);

  it("a decrypted body is sanitised before it reaches the editor (the server cannot sanitise ciphertext)", async () => {
    const vault = await mountVault();
    await act(async () => { await vault.v!.unlock(PASS, false); });
    // Sealed straight through encryptBody, as a tampering client could: the script and the handler are inside the ciphertext.
    const sealed = await vault.v!.encryptBody({ id: "d1", deks: [] }, '<p>hello</p><script>alert(1)</script><img src="x" onerror="alert(2)">');
    const opened = await readableDoc(vault.v!, doc("d1", { bodyHtml: sealed.bodyHtml, keyVersion: 1, deks: [sealed.dek!] }));
    expect(opened.bodyHtml).toContain("<p>hello</p>");
    expect(opened.bodyHtml).not.toMatch(/<script|onerror|alert/i);
    await renderCard(opened, [opened]);
    expect(h.editors).toHaveLength(1);
    expect(h.editors[0]).toContain("<p>hello</p>");
    expect(h.editors[0]).not.toMatch(/<script|onerror|alert/i);
  }, 30_000);

  it("a readable document opens in the editor with its decrypted text", async () => {
    const { host } = await renderCard(doc("d2", { bodyHtml: "<p>fine</p>" }), [doc("d2")]);
    expect(host.querySelector('[data-testid="doc-unreadable"]')).toBeNull();
    expect(h.editors).toEqual(["<p>fine</p>"]);
  });
});
