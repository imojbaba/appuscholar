// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import type { QualCode } from "@appuscholar/core";
import { editorExtensions } from "../lib/editorExtensions";
import { decryptText, encryptText, generateDek, generateKeypair, generateVaultKey, sealVaultCheck, wrapKey, wrapPrivateKey, wrapWithPassphrase, wrapWithRecovery } from "../lib/vault/crypto";
import { FakeChannel } from "./support/fakeChannel";

/*
 * Task C2, Review Focus 3: deleting a code strips its spans from every document of the project, sealed ones included, with the real document access over the real vault.
 * Documents of one project (the scratch space with the vault on): A is open in the editor, B and C are sealed and closed, E is sealed and has none of the codes.
 * Only the two qual blobs are replaced (the codes are not what is tested here); everything else is the app's own code.
 */

const h = vi.hoisted(() => ({
  api: vi.fn(), ask: vi.fn(), toast: vi.fn(), push: vi.fn(), update: vi.fn(), path: "/p/s1/collect/coding", editor: null as unknown, stub: () => null,
  codes: [] as unknown[], prefs: null as unknown,
  me: { id: "u-del", activeProjectId: null as string | null, scratchProjectId: "s1", termsAcceptedAt: "2999-01-01T00:00:00Z" }
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push, replace: h.push }), usePathname: () => h.path }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: h.me, settings: { seenWelcome: true }, update: h.update, reload: async () => undefined }) }));
vi.mock("@/components/workspace/dialogs/Passphrase", async () => (await import("./support/passphraseMock")).passphraseMock(h.ask));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/components/frame/AppHeader", () => ({ AppHeader: h.stub }));
vi.mock("@/components/frame/WindowHeader", () => ({ WindowHeader: h.stub }));
vi.mock("@/components/workspace/ChromeDialogs", () => ({ ChromeDialogs: h.stub }));
vi.mock("@/components/workspace/dialogs/ImportOrigin", () => ({ ImportOrigin: h.stub }));
vi.mock("@/components/workspace/dialogs/MyWriting", () => ({ MyWriting: h.stub }));
vi.mock("@/components/workspace/dialogs/ImportV1Dialog", () => ({ ImportV1Dialog: h.stub }));
vi.mock("@/lib/cite/useLibrary", () => ({ CiteLibraryProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/lib/cite/capture", () => ({ CaptureHash: h.stub }));
vi.mock("@/lib/blobs/useProjectBlob", async (orig) => {
  const real = await orig<typeof import("../lib/blobs/useProjectBlob")>();
  return {
    ...real,
    useProjectBlob: (kind: string, projectId: string | null, opts?: unknown) => {
      if (kind !== "qual_codes" && kind !== "qual_prefs") return real.useProjectBlob(kind as never, projectId, opts as never);
      const value = kind === "qual_codes" ? h.codes : h.prefs;
      const set = (next: unknown) => { const v = typeof next === "function" ? (next as (p: unknown) => unknown)(value) : next; if (kind === "qual_codes") h.codes = v as unknown[]; else h.prefs = v; };
      return { value, loading: false, locked: false, set, flush: async () => true, readOnly: false };
    }
  };
});
vi.mock("@/components/document/DocumentCard", async () => {
  const { useProject } = await import("../components/frame/ProjectContext");
  const { useSuggestion } = await import("../lib/ai/suggestion");
  return {
    DocumentCard: () => {
      const ws = useProject();
      const sug = useSuggestion();
      const d = ws.currentDoc;
      const readable = d && !d.unreadable ? d : null;
      const { registerEditor } = ws, { setEditor } = sug;
      useEffect(() => {
        if (!readable) return;
        const ed = new Editor({ extensions: editorExtensions, content: readable.bodyHtml });
        h.editor = ed;
        registerEditor(ed); setEditor(ed);
        return () => { registerEditor(null); setEditor(null); ed.destroy(); };
      }, [readable, registerEditor, setEditor]);
      return <div data-testid="shown">{d ? d.id + ":" + (d.unreadable ?? "open") : "none"}</div>;
    }
  };
});

import { ApiError } from "../lib/api";
import { setSyncChannel } from "../lib/popout/sync";
import { VaultProvider } from "../lib/vault/useVault";
import { ProjectShell } from "../components/frame/ProjectShell";
import { Panel } from "../components/tools/qual/Panel";
import { heldDocs } from "../lib/useAutosave";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = (() => {}) as typeof window.scrollTo;
const PASS = "right passphrase";
const roots: Root[] = [];
afterEach(() => {
  act(() => { for (const r of roots.splice(0)) r.unmount(); });
  document.body.innerHTML = ""; setSyncChannel(undefined); heldDocs.clear();
  window.history.replaceState(null, "", "/");
});
async function until(pred: () => boolean) {
  for (let i = 0; i < 1200; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); }
  throw new Error("condition not reached");
}
const editor = () => h.editor as Editor;
const tid = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const status = () => tid("qual-status")?.textContent;

const C = (id: string, name: string, parentId: string | null): QualCode => ({ id, name, parentId, color: "#f59e0b" });
const tag = (id: string, text: string) => `<span class="qual-tag" data-qcode="${id}" title="t">${text}</span>`;
const BODIES = {
  A: `<p>One ${tag("qa", "coping")} and ${tag("qc", "support")}.</p>`,
  B: `<p>She ${tag("qc", "said")} <strong>yes</strong>.</p><p>Then ${tag("qa", "no")}.</p>`,
  C: `<ul><li><p>${tag("qa", `x ${tag("qc", "y")}`)}</p></li></ul>`,
  E: `<p>${tag("qb", "barrier")} stays.</p>`
};
const STRIPPED = {
  A: "<p>One coping and support.</p>",
  B: "<p>She said <strong>yes</strong>.</p><p>Then no.</p>",
  C: "<ul><li><p>x y</p></li></ul>"
};

/** The scratch project s1 with the vault on: A (opened first), B, C and E, all sealed with their titles. Every PUT is recorded; `dek` opens them. */
async function vaultApi() {
  const vk = await generateVaultKey();
  const kp = await generateKeypair();
  const record = { passWrapped: await wrapWithPassphrase(vk, PASS), recoveryWrapped: await wrapWithRecovery(vk, "AAAAA-BBBBB-CCCCC-DDDDD"), checkWrapped: await sealVaultCheck(vk), publicKey: kp.publicKeyB64, privateKeyWrapped: await wrapPrivateKey(kp.privateKey, vk), complete: true, updatedAt: new Date().toISOString() };
  const dek = await generateDek();
  const deks = [{ v: 1, wrapped: await wrapKey(dek, vk) }];
  const sealed = async (id: string, title: string, body: string, createdAt: string) => ({
    id, projectId: "s1", title: await encryptText(title, dek), titleKeyVersion: 1, kind: "draft", currentSeq: 1, wordCount: 1, createdAt, updatedAt: createdAt, deletedAt: null,
    keyVersion: 1, deks, bodyHtml: await encryptText(body, dek)
  });
  const docs = {
    A: await sealed("A", "Chapter one", BODIES.A, "2026-10-16T00:00:04Z"),
    B: await sealed("B", "Interview two", BODIES.B, "2026-10-16T00:00:01Z"),
    C: await sealed("C", "Interview three", BODIES.C, "2026-10-16T00:00:02Z"),
    E: await sealed("E", "Notes", BODIES.E, "2026-10-16T00:00:03Z")
  };
  const puts: Array<{ path: string; body: { bodyHtml: string } }> = [];
  h.api.mockImplementation((path: string, init?: { method?: string; body?: string }) => {
    if (path === "/me/vault") return Promise.resolve({ ...record });
    if (path === "/projects") return Promise.resolve([]);
    // The api answers most recently updated first; the shell opens the first.
    if (path === "/projects/s1/documents") return Promise.resolve([docs.A, docs.E, docs.C, docs.B]);
    if (init?.method === "PUT") {
      const body = JSON.parse(init.body!) as { bodyHtml: string };
      puts.push({ path, body });
      // The api keeps the new revision: a later read of that document returns it.
      const k = path.slice(-1) as keyof typeof docs;
      docs[k] = { ...docs[k], bodyHtml: body.bodyHtml };
      return Promise.resolve({ document: { deks }, revision: { seq: 2 }, created: true }); }
    const m = /^\/documents\/([ABCE])$/.exec(path);
    if (m) return Promise.resolve({ ...docs[m[1] as keyof typeof docs] });
    return Promise.reject(new ApiError(404, "not-found"));
  });
  return { puts, dek };
}

async function mountPanel() {
  const v = await vaultApi();
  h.ask.mockResolvedValue(PASS);
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  roots.push(root);
  await act(async () => { root.render(<VaultProvider><ProjectShell projectId="s1"><Panel tab="coding" projectId="s1" /></ProjectShell></VaultProvider>); });
  await until(() => tid("shown")?.textContent === "A:open" && !!h.editor && !!tid("qual-delete-qa"));
  return v;
}
async function deleteQa() {
  await act(async () => { tid("qual-delete-qa")!.click(); });
  await act(async () => { tid("qual-delete-confirm-yes")!.click(); });
}

beforeEach(() => {
  h.api.mockReset(); h.toast.mockReset(); h.push.mockReset(); h.ask.mockReset(); h.update.mockReset().mockResolvedValue(undefined);
  h.path = "/p/s1/collect/coding"; h.editor = null; h.prefs = null;
  h.codes = [C("qa", "Coping", null), C("qb", "Barriers", null), C("qc", "Social support", "qa")];
  heldDocs.clear();
  setSyncChannel(new FakeChannel());
});

describe("deleting a code over the real document access", () => {
  it("deleting a code strips it from all three documents, sealed", async () => {
    const { puts, dek } = await mountPanel();
    await deleteQa();
    await until(() => status() === "Deleted");
    // The open document: rewritten in its editor, text as it was, every span of the code and its sub-code gone.
    expect(editor().getHTML()).toBe(STRIPPED.A);
    expect(editor().getText()).toBe("One coping and support.");
    // The two sealed ones: one new revision each, sealed under their key, nothing else written; E has none of the codes and gets none.
    expect(puts.map((p) => p.path).sort()).toEqual(["/documents/B", "/documents/C"]);
    for (const p of puts) {
      const html = await decryptText(p.body.bodyHtml, dek);
      expect(html).toBe(STRIPPED[p.path.slice(-1) as "B" | "C"]);
      expect(html).not.toContain("qual-tag");
    }
    // The code list is updated.
    expect((h.codes as QualCode[]).map((c) => c.id)).toEqual(["qb"]);
  }, 30_000);

  it("a document whose text this tab holds unsaved is not overwritten: the codes stay and the document is named", async () => {
    const { puts, dek } = await mountPanel();
    heldDocs.put("B", "<p>Typed, not yet saved.</p>");
    await deleteQa();
    await until(() => (status() ?? "").startsWith("Not deleted"));
    expect(status()).toContain("Interview two");
    expect(status()).not.toContain("Interview three");
    expect((h.codes as QualCode[]).map((c) => c.id)).toEqual(["qa", "qb", "qc"]);
    // A and C were done before the stop; B and E were not written.
    expect(editor().getHTML()).toBe(STRIPPED.A);
    expect(puts.map((p) => p.path)).toEqual(["/documents/C"]);
    // The held text is saved; the same delete again finishes: only B changes now (A and C are already stripped).
    heldDocs.drop("B");
    await deleteQa();
    await until(() => status() === "Deleted");
    expect(puts.map((p) => p.path)).toEqual(["/documents/C", "/documents/B"]);
    expect(await decryptText(puts[1]!.body.bodyHtml, dek)).toBe(STRIPPED.B);
    expect((h.codes as QualCode[]).map((c) => c.id)).toEqual(["qb"]);
  }, 30_000);
});
