// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, afterEach } from "vitest";
import { originCount } from "@appuscholar/core";
import { generateKeypair, generateVaultKey, sealVaultCheck, wrapPrivateKey, wrapWithPassphrase, wrapWithRecovery } from "../lib/vault/crypto";

const h = vi.hoisted(() => ({ api: vi.fn(), ask: vi.fn(), toast: vi.fn() }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u-autosave" } }) }));
vi.mock("@/components/workspace/dialogs/Passphrase", async () => (await import("./support/passphraseMock")).passphraseMock(h.ask));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));

import { ApiError } from "../lib/api";
import { createAutosaver, heldDocs, newDocumentBody, shouldWarnOnUnload, RETRY_DELAYS_MS, useAutosave, type SaveBody } from "../lib/useAutosave";
import { useVault, VaultProvider, type VaultValue, type WrappedDek } from "../lib/vault/useVault";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The body a save sends with the vault off: the old request shape plus keyVersion 0. */
const plain = (html: string): SaveBody => ({ bodyHtml: html, keyVersion: 0 });
const vaultLocked = () => new Error("vault-locked");

describe("createAutosaver", () => {
  afterEach(() => { vi.useRealTimers(); });
  it("debounces and skips unchanged bodies", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (b: SaveBody) => ({ seq: b.bodyHtml.length, created: true }));
    const a = createAutosaver({ initialHtml: "<p>a</p>", save, delayMs: 1500 });
    a.onChange("<p>ab</p>");
    a.onChange("<p>abc</p>");
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1500);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(plain("<p>abc</p>"));
    a.onChange("<p>abc</p>");
    await vi.advanceTimersByTimeAsync(1500);
    expect(save).toHaveBeenCalledTimes(1);
    expect(a.getStatus()).toBe("saved");
  });
  it("reports error and retries on the next change", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockRejectedValueOnce(new Error("net")).mockResolvedValueOnce({ seq: 2, created: true });
    const a = createAutosaver({ initialHtml: "", save, delayMs: 100 });
    a.onChange("<p>x</p>");
    await vi.advanceTimersByTimeAsync(100);
    expect(a.getStatus()).toBe("error");
    a.onChange("<p>xy</p>");
    await vi.advanceTimersByTimeAsync(100);
    expect(a.getStatus()).toBe("saved");
  });
  it("cancel() drops the pending save", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => ({ seq: 1, created: true }));
    const a = createAutosaver({ initialHtml: "", save, delayMs: 100 });
    a.onChange("<p>x</p>");
    a.cancel();
    await vi.advanceTimersByTimeAsync(500);
    expect(save).not.toHaveBeenCalled();
  });
  it("flushNow() saves immediately without waiting for the timer", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => ({ seq: 3, created: true }));
    const a = createAutosaver({ initialHtml: "", save, delayMs: 1500 });
    a.onChange("<p>x</p>");
    await a.flushNow();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(plain("<p>x</p>"));
    expect(a.getStatus()).toBe("saved");
    await vi.advanceTimersByTimeAsync(3000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("retries a failed save with backoff (2s, 4s, …) without further typing", async () => {
    vi.useFakeTimers();
    const save = vi.fn()
      .mockRejectedValueOnce(new Error("net"))
      .mockRejectedValueOnce(new Error("net"))
      .mockResolvedValueOnce({ seq: 2, created: true });
    const a = createAutosaver({ initialHtml: "", save, delayMs: 100 });
    a.onChange("<p>x</p>");
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(1);
    expect(a.getStatus()).toBe("error");
    await vi.advanceTimersByTimeAsync(1999);
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(2);
    expect(a.getStatus()).toBe("error");
    await vi.advanceTimersByTimeAsync(3999);
    expect(save).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(3);
    expect(save).toHaveBeenLastCalledWith(plain("<p>x</p>"));
    expect(a.getStatus()).toBe("saved");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(save).toHaveBeenCalledTimes(3);
  });
  it("caps the backoff at 30s", () => {
    expect(RETRY_DELAYS_MS[0]).toBe(2000);
    expect(Math.max(...RETRY_DELAYS_MS)).toBe(30000);
  });
  it("stops retrying once deactivated (unmount)", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockRejectedValue(new Error("net"));
    const a = createAutosaver({ initialHtml: "", save, delayMs: 100 });
    a.onChange("<p>x</p>");
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(1);
    a.setActive(false);
    expect(await a.flushNow()).toBe(false);
    expect(save).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(save).toHaveBeenCalledTimes(2);
  });
  it("warns before unload while dirty, saving or after an error, not when saved", () => {
    expect(shouldWarnOnUnload("dirty")).toBe(true);
    expect(shouldWarnOnUnload("saving")).toBe(true);
    expect(shouldWarnOnUnload("error")).toBe(true);
    expect(shouldWarnOnUnload("saved")).toBe(false);
  });
  it("reports dirty, not saved, when text changed while the save was in flight", async () => {
    vi.useFakeTimers();
    let resolve!: (r: { seq: number; created: boolean }) => void;
    const save = vi.fn()
      .mockImplementationOnce(() => new Promise(r => { resolve = r; }))
      .mockResolvedValueOnce({ seq: 3, created: true });
    const statuses: string[] = [];
    const a = createAutosaver({ initialHtml: "", save, delayMs: 100, onStatus: s => statuses.push(s) });
    a.onChange("<p>x</p>");
    await vi.advanceTimersByTimeAsync(100);
    expect(a.getStatus()).toBe("saving");
    a.onChange("<p>xy</p>");
    resolve({ seq: 2, created: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(a.getStatus()).toBe("dirty");
    expect(statuses).not.toContain("saved");
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenLastCalledWith(plain("<p>xy</p>"));
    expect(a.getStatus()).toBe("saved");
  });
  it("keeps newer text typed during a failed save instead of overwriting it with the failed body", async () => {
    vi.useFakeTimers();
    let reject!: (e: Error) => void;
    const save = vi.fn()
      .mockImplementationOnce(() => new Promise((_, rj) => { reject = rj; }))
      .mockResolvedValue({ seq: 2, created: true });
    const a = createAutosaver({ initialHtml: "", save, delayMs: 100 });
    a.onChange("<p>old</p>");
    await vi.advanceTimersByTimeAsync(100);
    a.onChange("<p>newer</p>");
    reject(new Error("net"));
    await vi.advanceTimersByTimeAsync(0);
    expect(a.getStatus()).toBe("error");
    expect(await a.flushNow()).toBe(true);
    expect(save).toHaveBeenLastCalledWith(plain("<p>newer</p>"));
    expect(save.mock.calls.map(c => (c[0] as SaveBody).bodyHtml)).toEqual(["<p>old</p>", "<p>newer</p>"]);
  });
  it("flushNow() resolves false when the save fails and true when there is nothing to save", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockRejectedValueOnce(new Error("net")).mockResolvedValueOnce({ seq: 2, created: true });
    const a = createAutosaver({ initialHtml: "", save, delayMs: 1500 });
    expect(await a.flushNow()).toBe(true);
    a.onChange("<p>x</p>");
    expect(await a.flushNow()).toBe(false);
    expect(a.getStatus()).toBe("error");
    expect(await a.flushNow()).toBe(true);
    expect(a.getStatus()).toBe("saved");
  });
});

describe("createAutosaver with the vault", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("autosave with the vault locked keeps the text, prompts once, saves after unlock", async () => {
    vi.useFakeTimers();
    const sealed: SaveBody = { bodyHtml: "iv.ct", keyVersion: 1, wordCount: 1, originStats: originCount("<p>x</p>") };
    const encrypt = vi.fn().mockRejectedValueOnce(vaultLocked()).mockResolvedValue(sealed);
    let answer!: (ok: boolean) => void;
    const ensureUnlocked = vi.fn(() => new Promise<boolean>((r) => { answer = r; }));
    const save = vi.fn(async () => ({ seq: 2, created: true }));
    const statuses: string[] = [];
    const a = createAutosaver({ initialHtml: "", save, encrypt, ensureUnlocked, delayMs: 100, onStatus: (s) => statuses.push(s) });
    a.onChange("<p>x</p>");
    await vi.advanceTimersByTimeAsync(100);
    expect(a.getStatus()).toBe("locked");
    expect(ensureUnlocked).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    // The prompt is open: however long the student takes, this is not an outage.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(a.getStatus()).toBe("locked");
    answer(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(ensureUnlocked).toHaveBeenCalledTimes(1);
    expect(encrypt).toHaveBeenCalledTimes(2);
    expect(encrypt).toHaveBeenLastCalledWith("<p>x</p>");
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(sealed);
    expect(statuses).toEqual(["dirty", "locked", "saving", "saved"]);
  });

  it("autosave with the vault locked and the prompt cancelled stays dirty and warns on unload", async () => {
    vi.useFakeTimers();
    let open = false;
    const encrypt = vi.fn(async (html: string): Promise<SaveBody> => { if (!open) throw vaultLocked(); return { bodyHtml: "ct:" + html.length, keyVersion: 1, wordCount: 1, originStats: originCount(html) }; });
    const ensureUnlocked = vi.fn(async () => false);
    const save = vi.fn(async () => ({ seq: 2, created: true }));
    const a = createAutosaver({ initialHtml: "", save, encrypt, ensureUnlocked, delayMs: 100 });
    a.onChange("<p>x</p>");
    await vi.advanceTimersByTimeAsync(100);
    expect(a.getStatus()).toBe("locked");
    expect(shouldWarnOnUnload("locked")).toBe(true);
    expect(shouldWarnOnUnload(a.getStatus())).toBe(true);
    // More typing and an explicit flush neither prompt again nor send anything, nor retry on a timer.
    a.onChange("<p>xy</p>");
    expect(a.getStatus()).toBe("locked");
    await vi.advanceTimersByTimeAsync(120_000);
    expect(await a.flushNow()).toBe(false);
    expect(ensureUnlocked).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    expect(a.getStatus()).toBe("locked");
    // The vault opens elsewhere (the header pill): the held text, the newest of it, is saved.
    open = true;
    a.resume();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(1);
    expect(encrypt).toHaveBeenLastCalledWith("<p>xy</p>");
    expect(a.getStatus()).toBe("saved");
  });

  it("a 409 vault-required reloads the document, re-encrypts and retries once", async () => {
    vi.useFakeTimers();
    const first: SaveBody = plain("<p>x</p>");
    const second: SaveBody = { bodyHtml: "iv.ct", keyVersion: 1, wordCount: 1, originStats: originCount("<p>x</p>") };
    const encrypt = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const reload = vi.fn(async () => undefined);
    const save = vi.fn().mockRejectedValueOnce(new ApiError(409, "vault-required")).mockResolvedValueOnce({ seq: 2, created: true });
    const a = createAutosaver({ initialHtml: "", save, encrypt, reload, ensureUnlocked: async () => true, delayMs: 100 });
    a.onChange("<p>x</p>");
    expect(await a.flushNow()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(encrypt).toHaveBeenCalledTimes(2);
    expect(save.mock.calls.map((c) => c[0])).toEqual([first, second]);
    // The reload happened between the refused save and the re-encryption.
    expect(reload.mock.invocationCallOrder[0]!).toBeLessThan(encrypt.mock.invocationCallOrder[1]!);
    expect(a.getStatus()).toBe("saved");
  });

  it("a 409 dek-exists (the first key reached the server, its answer did not) re-reads the keys and retries once", async () => {
    vi.useFakeTimers();
    const withDek: SaveBody = { bodyHtml: "a.b", keyVersion: 1, wordCount: 1, originStats: originCount("<p>x</p>"), dek: { v: 1, wrapped: "new" } };
    const withoutDek: SaveBody = { bodyHtml: "c.d", keyVersion: 1, wordCount: 1, originStats: originCount("<p>x</p>") };
    const encrypt = vi.fn().mockResolvedValueOnce(withDek).mockResolvedValueOnce(withoutDek);
    const reload = vi.fn(async () => undefined);
    const save = vi.fn().mockRejectedValueOnce(new ApiError(409, "dek-exists")).mockResolvedValueOnce({ seq: 2, created: true });
    const a = createAutosaver({ initialHtml: "", save, encrypt, reload, delayMs: 100 });
    a.onChange("<p>x</p>");
    expect(await a.flushNow()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(save.mock.calls.map((c) => c[0])).toEqual([withDek, withoutDek]);
    // Any other refusal is an ordinary failure: no re-read.
    const other = vi.fn().mockRejectedValue(new ApiError(400, "invalid"));
    const b = createAutosaver({ initialHtml: "", save: other, encrypt: async (html) => plain(html), reload, delayMs: 100 });
    b.onChange("<p>y</p>");
    expect(await b.flushNow()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(other).toHaveBeenCalledTimes(1);
  });

  it("a second 409 after the retry surfaces the error badge", async () => {
    vi.useFakeTimers();
    const encrypt = vi.fn(async (html: string) => plain(html));
    const reload = vi.fn(async () => undefined);
    const save = vi.fn().mockRejectedValue(new ApiError(409, "vault-required"));
    const a = createAutosaver({ initialHtml: "", save, encrypt, reload, delayMs: 100 });
    a.onChange("<p>x</p>");
    expect(await a.flushNow()).toBe(false);
    expect(save).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(a.getStatus()).toBe("error");
  });

  it("an encryption still waiting for the vault record after the first retry step reads as an outage, then saves", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const encrypt = vi.fn((html: string) => new Promise<SaveBody>((r) => { release = () => r(plain(html)); }));
    const save = vi.fn(async () => ({ seq: 2, created: true }));
    const a = createAutosaver({ initialHtml: "", save, encrypt, delayMs: 100 });
    a.onChange("<p>x</p>");
    await vi.advanceTimersByTimeAsync(100);
    expect(a.getStatus()).toBe("dirty");
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]! - 1);
    expect(a.getStatus()).toBe("dirty");
    await vi.advanceTimersByTimeAsync(1);
    expect(a.getStatus()).toBe("error");
    expect(save).not.toHaveBeenCalled();
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledWith(plain("<p>x</p>"));
    expect(a.getStatus()).toBe("saved");
  });
});

// ---- useAutosave against a real vault (WebCrypto) and a fake api ----

type Rec = { passWrapped: string; recoveryWrapped: string; checkWrapped: string; publicKey: string | null; privateKeyWrapped: string | null; complete: boolean; updatedAt: string };
async function vaultWith(pass: string): Promise<Rec> {
  const vk = await generateVaultKey();
  const kp = await generateKeypair();
  return { passWrapped: await wrapWithPassphrase(vk, pass), recoveryWrapped: await wrapWithRecovery(vk, "AAAAA-BBBBB-CCCCC-DDDDD"), checkWrapped: await sealVaultCheck(vk), publicKey: kp.publicKeyB64, privateKeyWrapped: await wrapPrivateKey(kp.privateKey, vk), complete: false, updatedAt: new Date().toISOString() };
}
const roots: Root[] = [];
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); });
async function until(pred: () => boolean) {
  for (let i = 0; i < 400; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); }
  throw new Error("condition not reached");
}
async function mountAutosave(vault: Rec | null, deks: WrappedDek[] = []) {
  const puts: Record<string, unknown>[] = [];
  h.api.mockReset().mockImplementation((path: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    if (path === "/me/vault" && method === "GET") return vault ? Promise.resolve({ ...vault }) : Promise.reject(new ApiError(404, "no-vault"));
    if (path === "/documents/d1" && method === "PUT") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      puts.push(body);
      return Promise.resolve({ document: { id: "d1", deks: body.dek ? [body.dek] : deks }, revision: { seq: puts.length + 1 }, created: true });
    }
    return Promise.reject(new ApiError(404, "not-found"));
  });
  const box: { v: VaultValue | null; save: ReturnType<typeof useAutosave> | null } = { v: null, save: null };
  function Probe() { box.v = useVault(); box.save = useAutosave("d1", "", 1, { deks }); return null; }
  const root = createRoot(document.createElement("div"));
  roots.push(root);
  await act(async () => { root.render(createElement(VaultProvider, null, createElement(Probe))); });
  return { box, puts };
}

describe("useAutosave", () => {
  const SENTENCE = "<p>My thesis studies how students delay their writing tasks.</p>"; // nine words

  it("autosave sends ciphertext with counts and a first dek when the vault is unlocked", async () => {
    const { box, puts } = await mountAutosave(await vaultWith("right passphrase"));
    await until(() => box.v!.status === "locked");
    await act(async () => { await box.v!.unlock("right passphrase", false); });
    expect(box.v!.status).toBe("unlocked");
    let ok = false;
    await act(async () => { box.save!.onChange(SENTENCE); ok = await box.save!.flushNow(); });
    expect(ok).toBe(true);
    expect(puts).toHaveLength(1);
    const body = puts[0] as { bodyHtml: string; keyVersion: number; wordCount: number; originStats: unknown; dek: WrappedDek };
    expect(body.keyVersion).toBe(1);
    expect(body.wordCount).toBe(9);
    expect(body.originStats).toEqual(originCount(SENTENCE));
    expect(body.dek.v).toBe(1);
    expect(body.dek.wrapped.length).toBeGreaterThan(0);
    expect(body.bodyHtml).not.toContain("thesis");
    expect(body.bodyHtml).not.toContain("<p>");
    // It opens again under the dek it carried, to the exact text typed.
    expect(await box.v!.decryptBody({ id: "d1", deks: [body.dek], bodyHtml: body.bodyHtml, keyVersion: 1 })).toBe(SENTENCE);
    // The next save uses the dek the server now has, and does not send it again.
    await act(async () => { box.save!.onChange(SENTENCE + "<p>More.</p>"); await box.save!.flushNow(); });
    expect(puts).toHaveLength(2);
    expect(puts[1]!.keyVersion).toBe(1);
    expect(puts[1]!.dek).toBeUndefined();
    expect(puts[1]!.wordCount).toBe(10);
    expect(box.save!.status).toBe("saved");
  }, 30_000);

  it("with the vault off the PUT body is the old plaintext request plus keyVersion 0", async () => {
    const { box, puts } = await mountAutosave(null);
    await until(() => box.v!.status === "off");
    await act(async () => { box.save!.onChange(SENTENCE); await box.save!.flushNow(); });
    expect(puts).toEqual([{ bodyHtml: SENTENCE, keyVersion: 0 }]);
  });

  it("with the vault locked the hook sends nothing until the passphrase is given, then ciphertext", async () => {
    h.ask.mockReset().mockResolvedValueOnce("right passphrase");
    const { box, puts } = await mountAutosave(await vaultWith("right passphrase"));
    await until(() => box.v!.status === "locked");
    await act(async () => { box.save!.onChange(SENTENCE); await box.save!.flushNow(); });
    expect(h.ask).toHaveBeenCalledTimes(1);
    expect(puts).toHaveLength(1);
    expect(puts[0]!.keyVersion).toBe(1);
    expect(String(puts[0]!.bodyHtml)).not.toContain("thesis");
  }, 30_000);
});

describe("leaving a document with unsaved text (the browser's Back, a project switch)", () => {
  const SENTENCE = "<p>Typed just before Back.</p>";
  afterEach(() => { heldDocs.clear(); });
  /** The hook for d1 with the vault off, unmounted and mounted again at will; PUT fails while `server.down`. */
  function host() {
    const server = { down: false, puts: [] as string[] };
    h.api.mockReset().mockImplementation((path: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      if (path === "/me/vault" && method === "GET") return Promise.reject(new ApiError(404, "no-vault"));
      if (path === "/documents/d1" && method === "PUT") {
        if (server.down) return Promise.reject(new Error("offline"));
        server.puts.push(String((JSON.parse(String(init.body)) as { bodyHtml: string }).bodyHtml));
        return Promise.resolve({ document: { id: "d1", deks: [] }, revision: { seq: server.puts.length + 1 }, created: true });
      }
      return Promise.reject(new ApiError(404, "not-found"));
    });
    const box: { v: VaultValue | null; save: ReturnType<typeof useAutosave> | null } = { v: null, save: null };
    const deks: WrappedDek[] = [];
    function Probe() { box.v = useVault(); box.save = useAutosave("d1", "<p>Saved before.</p>", 1, { deks }); return null; }
    let root: Root | null = null;
    return {
      box, server,
      mount: async () => {
        root = createRoot(document.createElement("div"));
        await act(async () => { root!.render(createElement(VaultProvider, null, createElement(Probe))); });
        await until(() => box.v!.status === "off");
      },
      unmount: async () => { await act(async () => { root!.unmount(); }); root = null; await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); }
    };
  }
  const unloadWarns = () => { const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; };

  it("a failed final save on unmount keeps the text in memory, and leaving the page warns", async () => {
    const x = host();
    await x.mount();
    x.server.down = true;
    await act(async () => { x.box.save!.onChange(SENTENCE); });
    await x.unmount();
    expect(x.server.puts).toEqual([]);
    expect(heldDocs.html("d1")).toBe(SENTENCE);
    expect(shouldWarnOnUnload("saved")).toBe(true);
    expect(unloadWarns()).toBe(true);
  });

  it("reopening the document restores the held text, saves it with retries and says so", async () => {
    const x = host();
    await x.mount();
    x.server.down = true;
    await act(async () => { x.box.save!.onChange(SENTENCE); });
    await x.unmount();
    h.toast.mockReset();
    // Still offline on reopen: the first try fails, the normal retries carry on.
    await x.mount();
    expect(x.box.save!.restored).toBe(SENTENCE);
    for (let i = 0; i < 60 && x.box.save!.status !== "error"; i++) await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(x.box.save!.status).toBe("error");
    expect(heldDocs.has("d1")).toBe(false);
    expect(h.toast).not.toHaveBeenCalled();
    x.server.down = false;
    // The first retry comes 2 s after the failure.
    for (let i = 0; i < 100 && x.box.save!.status !== "saved"; i++) await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(x.server.puts).toEqual([SENTENCE]);
    expect(h.toast).toHaveBeenCalledWith("Your unsaved changes were kept and saved.");
    expect(shouldWarnOnUnload("saved")).toBe(false);
    expect(unloadWarns()).toBe(false);
    await x.unmount();
  }, 15_000);

  it("a final save that succeeds leaves nothing held", async () => {
    const x = host();
    await x.mount();
    await act(async () => { x.box.save!.onChange(SENTENCE); });
    await x.unmount();
    expect(x.server.puts).toEqual([SENTENCE]);
    expect(heldDocs.has("d1")).toBe(false);
    expect(shouldWarnOnUnload("saved")).toBe(false);
    await x.mount();
    expect(x.box.save!.restored).toBeNull();
    await x.unmount();
  });
});

describe("newDocumentBody", () => {
  it("is the old create request plus keyVersion 0 with the vault off, and asks nothing", async () => {
    const { box } = await mountAutosave(null);
    h.ask.mockReset();
    expect(await newDocumentBody(box.v!)).toEqual({ keyVersion: 0 });
    expect(h.ask).not.toHaveBeenCalled();
  });

  it("with a locked vault opens it first and encrypts the empty body under a first dek; a cancel creates nothing", async () => {
    h.ask.mockReset().mockResolvedValueOnce(null).mockResolvedValueOnce("right passphrase");
    const { box } = await mountAutosave(await vaultWith("right passphrase"));
    await until(() => box.v!.status === "locked");
    let cancelled: unknown = "unset";
    await act(async () => { cancelled = await newDocumentBody(box.v!); });
    expect(cancelled).toBeNull();
    let made!: Awaited<ReturnType<typeof newDocumentBody>>;
    await act(async () => { made = await newDocumentBody(box.v!); });
    expect(h.ask).toHaveBeenCalledTimes(2);
    expect(made!.keyVersion).toBe(1);
    expect(made!.dek?.v).toBe(1);
    expect(made!.wordCount).toBe(0);
    expect(made!.originStats).toEqual(originCount(""));
    expect(made!.bodyHtml).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(await box.v!.decryptBody({ id: "any", deks: [made!.dek!], bodyHtml: made!.bodyHtml!, keyVersion: 1 })).toBe("");
  }, 30_000);
});
