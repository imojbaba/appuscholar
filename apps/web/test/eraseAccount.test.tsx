// @vitest-environment jsdom
import JSZip from "jszip";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import pp from "../messages/tools/participants.en.json";

type FakeVault = { status: string; lock: ReturnType<typeof vi.fn>; forgetThisComputer: ReturnType<typeof vi.fn>; known: ReturnType<typeof vi.fn>; ensureUnlocked: ReturnType<typeof vi.fn>; decryptBody: ReturnType<typeof vi.fn>; changePassphrase: ReturnType<typeof vi.fn> };
const h = vi.hoisted(() => ({
  api: vi.fn(), toast: vi.fn(), remembered: vi.fn(), signOut: vi.fn(async () => {}), download: vi.fn(), v: null as unknown as FakeVault, order: [] as string[],
  ws: { dialog: "help", closeDialog: vi.fn(), openWelcome: vi.fn(), openTerms: vi.fn(), openImportV1: vi.fn() }
}));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => h.ws }));
vi.mock("@/lib/session", () => ({ useSession: () => ({ email: "asha@example.edu", signOutAction: h.signOut }) }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", scratchProjectId: "scratch1" } }) }));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => h.v }));
vi.mock("@/lib/vault/remember", () => ({ hasRemembered: h.remembered }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/export/download", async (orig) => ({ ...(await orig<typeof import("../lib/export/download")>()), downloadBlob: h.download }));

import { ApiError } from "../lib/api";
import { keyStore } from "../lib/ai/keys";
import { Help } from "../components/workspace/dialogs/Help";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
const $ = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
async function until(pred: () => boolean) {
  for (let i = 0; i < 200; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 2)); }); }
  throw new Error("condition not reached");
}
async function render() {
  const box = document.createElement("div");
  document.body.appendChild(box);
  const root = createRoot(box);
  roots.push(root);
  await act(async () => { root.render(<Help />); });
}
async function click(id: string) {
  const el = $(id);
  if (!el) throw new Error("no element " + id);
  await act(async () => { el.click(); await new Promise((r) => setTimeout(r, 0)); });
}
function type(id: string, value: string) {
  const el = $(id) as HTMLInputElement;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const calls = () => h.api.mock.calls.map(([path, init]) => [((init as RequestInit | undefined)?.method ?? "GET"), path as string]);

beforeEach(() => {
  localStorage.clear();
  keyStore.setUser("u1");
  keyStore.clearSession();
  h.order = [];
  h.v = {
    status: "unlocked",
    lock: vi.fn(() => { h.order.push("lock"); }),
    forgetThisComputer: vi.fn(async () => { h.order.push("forget"); }),
    known: vi.fn(async () => h.v.status),
    ensureUnlocked: vi.fn(async () => true),
    decryptBody: vi.fn(async (d: { bodyHtml: string }) => d.bodyHtml.replace("ct:", "")),
    changePassphrase: vi.fn(async () => {})
  };
  h.api.mockReset().mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === "/me" && init?.method === "DELETE") { h.order.push("delete"); return undefined; }
    return undefined;
  });
  h.toast.mockReset();
  h.signOut.mockReset().mockImplementation(async () => { h.order.push("signOut"); });
  h.remembered.mockReset().mockResolvedValue(false);
  h.download.mockReset();
});
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });

describe("Help: account erasure", () => {
  it("erase needs the word DELETE, then calls DELETE /me and signs out", async () => {
    keyStore.setPlain("gemini", "AIza-1");
    const forgetPlain = vi.spyOn(keyStore, "forgetPlainKeys");
    const clearSession = vi.spyOn(keyStore, "clearSession");
    await render();
    expect($("help-erase")!.textContent).toBe(en.help_erase_btn);
    await click("help-erase");
    await until(() => !!$("erase-dialog"));
    expect($("erase-dialog")!.textContent).toContain(en.erase_intro);
    expect($("erase-dialog")!.textContent).toContain(en.erase_type.replace("{word}", en.erase_confirm_word));
    const confirm = () => $("erase-confirm") as HTMLButtonElement;
    expect(confirm().textContent).toBe(en.erase_btn);
    expect(confirm().disabled).toBe(true);
    type("erase-word", "delete");
    expect(confirm().disabled).toBe(true); // the exact word, capitals and all
    type("erase-word", "DELETE ");
    expect(confirm().disabled).toBe(true);
    await click("erase-confirm");
    expect(h.api).not.toHaveBeenCalled();
    type("erase-word", en.erase_confirm_word);
    expect(confirm().disabled).toBe(false);
    await click("erase-confirm");
    await until(() => h.signOut.mock.calls.length === 1);
    expect(calls()).toEqual([["DELETE", "/me"]]);
    expect(h.toast).toHaveBeenCalledWith(en.erased);
    // The same forget path as "Forget and sign out": AI keys, the session keys and the vault on this computer, then the sign-out.
    expect(forgetPlain).toHaveBeenCalledWith("u1");
    expect(keyStore.hasPlain()).toBe(false);
    expect(clearSession).toHaveBeenCalled();
    expect(h.order).toEqual(["delete", "lock", "forget", "signOut"]);
    forgetPlain.mockRestore();
    clearSession.mockRestore();
  });

  it("a failed erase keeps the student signed in and says so", async () => {
    h.api.mockImplementation(async () => { throw new ApiError(500, "server"); });
    await render();
    await click("help-erase");
    type("erase-word", en.erase_confirm_word);
    await click("erase-confirm");
    await until(() => h.toast.mock.calls.length > 0);
    expect(h.toast).toHaveBeenCalledWith(en.erase_fail);
    expect(h.signOut).not.toHaveBeenCalled();
    expect(h.v.lock).not.toHaveBeenCalled();
    expect($("erase-dialog")).not.toBeNull();
  });

  it("if the sign-out itself fails after the erase, the dialog is not stuck: the word is cleared and Cancel closes it", async () => {
    h.signOut.mockImplementation(async () => { h.order.push("signOut"); throw new Error("offline"); });
    await render();
    await click("help-erase");
    type("erase-word", en.erase_confirm_word);
    await click("erase-confirm");
    await until(() => h.signOut.mock.calls.length === 1);
    await until(() => (($("erase-word") as HTMLInputElement | null)?.value ?? "") === "");
    expect(h.toast).toHaveBeenCalledWith(en.erased);
    expect(h.order).toEqual(["delete", "lock", "forget", "signOut"]);
    expect(($("erase-confirm") as HTMLButtonElement).disabled).toBe(true); // cannot erase twice
    expect(($("erase-cancel") as HTMLButtonElement).disabled).toBe(false);
    await click("erase-cancel");
    await until(() => !$("erase-dialog"));
  });
});

describe("Help: export, change passphrase", () => {
  it("export builds the zip in the browser, records the export, then downloads it", async () => {
    h.api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/projects?include=work") return [{ id: "p1", title: "Thesis", titleKeyVersion: 0, deks: [], stageMarks: {}, draftWords: 0, draftEditedAt: null, createdAt: "2026-09-01T00:00:00.000Z" }];
      if (path === "/projects/p1/documents") return [{ id: "d1", projectId: "p1", title: "Ch 1", kind: "draft", createdAt: "x", updatedAt: "y", deletedAt: null, wordCount: 2 }];
      if (path === "/projects/scratch1/documents") return [{ id: "d2", projectId: "scratch1", title: "Notes", kind: "draft", createdAt: "x", updatedAt: "y", deletedAt: null, wordCount: 1 }];
      if (path === "/projects/p1/blobs") return [{ kind: "idea_intake", keyVersion: 1, updatedAt: "2026-09-08T00:00:00.000Z" }, { kind: "shelf_paper:a b", keyVersion: 1, updatedAt: "2026-09-08T00:00:00.000Z" }];
      if (path === "/projects/scratch1/blobs") return [];
      if (path === "/projects/p1/blobs/idea_intake") return { kind: "idea_intake", body: 'ct:{"topic":"Sleep"}', keyVersion: 1, deks: [{ v: 1, wrapped: "w" }], updatedAt: "2026-09-08T00:00:00.000Z", version: 3 };
      if (path === "/projects/p1/blobs/shelf_paper%3Aa%20b") return { kind: "shelf_paper:a b", body: 'ct:{"id":"a b"}', keyVersion: 1, deks: [{ v: 1, wrapped: "w" }], updatedAt: "2026-09-08T00:00:00.000Z", version: 1 };
      if (path === "/documents/d1") return { id: "d1", title: "Ch 1", bodyHtml: "ct:<p>Hello thesis.</p>", keyVersion: 1, deks: [] };
      if (path === "/documents/d2") return { id: "d2", title: "Notes", bodyHtml: "ct:<p>Scratch note.</p>", keyVersion: 1, deks: [] };
      if (path.endsWith("/writing-record")) return { docs: [], sources: [], weekly: [], aiLog: { byKind: { "grammar and polish": 2 }, byService: { "Google Gemini": 2 }, total: 2, firstAt: "2026-10-01", lastAt: "2026-10-02", loggingOff: false } };
      if (path === "/me/export-audit" && init?.method === "POST") { h.order.push("audit"); return undefined; }
      throw new ApiError(404, "not-found");
    });
    h.download.mockImplementation(() => { h.order.push("download"); });
    await render();
    expect($("help-export")!.textContent).toBe(en.help_export_btn);
    await click("help-export");
    await until(() => h.toast.mock.calls.length > 0);
    expect(h.toast).toHaveBeenCalledWith(en.export_done);
    expect(h.v.ensureUnlocked).toHaveBeenCalled();
    expect(h.order).toEqual(["audit", "download"]); // logged once built, before it is saved
    const [name, blob] = h.download.mock.calls[0] as [string, Blob];
    expect(name).toMatch(/^appuscholar-export-\d{4}-\d{2}-\d{2}\.zip$/);
    const zip = await JSZip.loadAsync(blob); // jsdom's Blob has no arrayBuffer(); JSZip reads it with FileReader
    expect(await zip.file("Thesis/Ch 1.html")!.async("string")).toContain("Hello thesis.");
    expect(await zip.file(en.export_scratch + "/Notes.html")!.async("string")).toContain("Scratch note.");
    // Every stage's data, opened with the blob's own id (blob:<projectId>:<kind>) and key.
    expect(JSON.parse(await zip.file("Thesis/stage-data/idea_intake.json")!.async("string"))).toEqual({ topic: "Sleep" });
    expect(JSON.parse(await zip.file("Thesis/stage-data/shelf_paper-a b.json")!.async("string"))).toEqual({ id: "a b" });
    expect(h.v.decryptBody).toHaveBeenCalledWith({ id: "blob:p1:idea_intake", deks: [{ v: 1, wrapped: "w" }], bodyHtml: 'ct:{"topic":"Sleep"}', keyVersion: 1 });
    expect(h.v.decryptBody).toHaveBeenCalledWith(expect.objectContaining({ id: "blob:p1:shelf_paper:a b" }));
    // One record: each project's words under its title, the account-wide AI-use log once.
    const record = await zip.file("writing-process-record.txt")!.async("string");
    expect(record.match(/WRITING-PROCESS RECORD/g)).toHaveLength(1);
    expect(record.match(/AI-USE LOG/g)).toHaveLength(1);
    expect(record.match(/WORDS BY ORIGIN/g)).toHaveLength(2);
    expect(record).toContain("Thesis\n======\n");
    expect(record).toContain(en.export_scratch + "\n");
    // Nothing decrypted goes back to the server: the only write is the audit row.
    expect(calls().filter(([m]) => m !== "GET")).toEqual([["POST", "/me/export-audit"]]);
    // No project has a participant list, so the export did not stop to ask (C10).
    expect($("export-names-dialog")).toBeNull();
  });

  /** Two projects, the first (Thesis) with a stored participant list when `lists` has "p1", the second (Pilot) when it has "p2"; the scratch space has none. */
  function twoProjects(lists: string[]) {
    const listing = (id: string) => [{ kind: "idea_intake", keyVersion: 1, updatedAt: "2026-09-08T00:00:00.000Z" }, ...(lists.includes(id) ? [{ kind: "participants", keyVersion: 1, updatedAt: "2026-10-20T00:00:00.000Z" }] : [])];
    h.api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/projects?include=work") return ["p1", "p2"].map((id, i) => ({ id, title: ["Thesis", "Pilot"][i], titleKeyVersion: 0, deks: [], stageMarks: {}, draftWords: 0, draftEditedAt: null, createdAt: "2026-09-01T00:00:00.000Z" }));
      if (/^\/projects\/(p1|p2|scratch1)\/documents$/.test(path)) return [];
      if (path === "/projects/p1/blobs" || path === "/projects/p2/blobs") return listing(path.split("/")[2]!);
      if (path === "/projects/scratch1/blobs") return [];
      if (/^\/projects\/(p1|p2)\/blobs\/idea_intake$/.test(path)) return { kind: "idea_intake", body: 'ct:{"topic":"Sleep"}', keyVersion: 1, deks: [{ v: 1, wrapped: "w" }], updatedAt: "2026-09-08T00:00:00.000Z", version: 1 };
      if (/^\/projects\/(p1|p2)\/blobs\/participants$/.test(path)) return { kind: "participants", body: 'ct:{"v":1,"next":2,"people":[{"id":"a","code":"P001","name":"Priya Sharma","spellings":[],"joined":"2026-10-01"}],"notNames":[]}', keyVersion: 1, deks: [{ v: 1, wrapped: "w" }], updatedAt: "2026-10-20T00:00:00.000Z", version: 2 };
      if (path.endsWith("/writing-record")) return { docs: [], sources: [], weekly: [], aiLog: { byKind: {}, byService: {}, total: 0, firstAt: null, lastAt: null, loggingOff: false } };
      if (path === "/me/export-audit" && init?.method === "POST") { h.order.push("audit"); return undefined; }
      throw new ApiError(404, "not-found");
    });
    h.download.mockImplementation(() => { h.order.push("download"); });
  }
  const listingCalls = () => calls().filter(([m, p]) => m === "GET" && /^\/projects\/[^/]+\/blobs$/.test(p!));

  it("a project with a participant list: the export says the file has names, and makes nothing until the student agrees (C10)", async () => {
    twoProjects(["p2"]);
    await render();
    await click("help-export");
    await until(() => !!$("export-names-dialog"));
    // A destroyed list is still a participants blob, with nobody on it: the sentence does not claim names the list no longer holds (R54a).
    expect($("export-names-dialog")!.textContent).toContain("This file includes your participant lists, with any names they still hold. Keep it apart from your data.");
    expect($("export-names-dialog")!.textContent).not.toContain("lists, with names");
    expect($("export-names-dialog")!.textContent).toContain(pp.pp_export_names);
    // Nothing is built, logged or saved while the question is open; the button is held.
    expect(h.download).not.toHaveBeenCalled();
    expect(calls().filter(([m]) => m !== "GET")).toEqual([]);
    expect(($("help-export") as HTMLButtonElement).disabled).toBe(true);
    await click("export-names-go");
    await until(() => h.toast.mock.calls.length > 0);
    expect(h.toast).toHaveBeenCalledWith(en.export_done);
    expect(h.order).toEqual(["audit", "download"]);
    // The list goes in the file as every kind does: the student's own backup.
    const zip = await JSZip.loadAsync((h.download.mock.calls[0] as [string, Blob])[1]);
    expect(JSON.parse(await zip.file("Pilot/stage-data/participants.json")!.async("string")).people[0].name).toBe("Priya Sharma");
    expect(zip.file("Thesis/stage-data/participants.json")).toBeNull();
    // Cheap: each project's listing was read once, for the question and for the export together.
    expect(listingCalls().map(([, p]) => p).sort()).toEqual(["/projects/p1/blobs", "/projects/p2/blobs", "/projects/scratch1/blobs"]);
    expect($("export-names-dialog")).toBeNull();
  });

  it("Cancel on that question exports nothing, logs nothing, and the button is free again", async () => {
    twoProjects(["p1"]);
    await render();
    await click("help-export");
    await until(() => !!$("export-names-dialog"));
    await click("export-names-cancel");
    await until(() => !$("export-names-dialog"));
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(h.download).not.toHaveBeenCalled();
    expect(h.toast).not.toHaveBeenCalled();
    expect(calls().filter(([m]) => m !== "GET")).toEqual([]);
    expect(($("help-export") as HTMLButtonElement).disabled).toBe(false);
    // Asking again asks again.
    await click("help-export");
    await until(() => !!$("export-names-dialog"));
    await click("export-names-go");
    await until(() => h.toast.mock.calls.length > 0);
    expect(h.download).toHaveBeenCalledTimes(1);
  });

  it("projects with no participant list make no question", async () => {
    twoProjects([]);
    await render();
    await click("help-export");
    await until(() => h.toast.mock.calls.length > 0);
    expect($("export-names-dialog")).toBeNull();
    expect(h.download).toHaveBeenCalledTimes(1);
    expect(h.order).toEqual(["audit", "download"]);
  });

  it("a second click while that question is open makes no second export", async () => {
    twoProjects(["p1"]);
    await render();
    await click("help-export");
    await until(() => !!$("export-names-dialog"));
    await act(async () => { $("help-export")!.click(); $("help-export")!.click(); await new Promise((r) => setTimeout(r, 0)); });
    await click("export-names-go");
    await until(() => h.toast.mock.calls.length > 0);
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(h.download).toHaveBeenCalledTimes(1);
    expect(calls().filter(([m, p]) => m === "POST" && p === "/me/export-audit")).toHaveLength(1);
  });

  it("a second click while the first export waits on the unlock ask makes no second export", async () => {
    let release!: (ok: boolean) => void;
    h.v.ensureUnlocked.mockImplementation(() => new Promise<boolean>((r) => { release = r; }));
    h.api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/projects?include=work") return [];
      if (path.endsWith("/documents") || path.endsWith("/blobs")) return [];
      if (path.endsWith("/writing-record")) return { docs: [], sources: [], weekly: [], aiLog: { byKind: {}, byService: {}, total: 0, firstAt: null, lastAt: null, loggingOff: false } };
      if (path === "/me/export-audit" && init?.method === "POST") return undefined;
      throw new ApiError(404, "not-found");
    });
    await render();
    await click("help-export");
    await until(() => h.v.ensureUnlocked.mock.calls.length === 1);
    await act(async () => { $("help-export")!.click(); $("help-export")!.click(); await new Promise((r) => setTimeout(r, 0)); });
    await act(async () => { release(true); await new Promise((r) => setTimeout(r, 0)); });
    await until(() => h.toast.mock.calls.length > 0);
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(h.v.ensureUnlocked).toHaveBeenCalledTimes(1);
    expect(h.download).toHaveBeenCalledTimes(1);
    expect(calls().filter(([m, p]) => m === "POST" && p === "/me/export-audit")).toHaveLength(1);
    expect(($("help-export") as HTMLButtonElement).disabled).toBe(false); // free again afterwards
  });

  it("a locked vault that stays locked exports nothing", async () => {
    h.v.status = "locked";
    h.v.ensureUnlocked.mockResolvedValue(false);
    await render();
    await click("help-export");
    await until(() => h.v.ensureUnlocked.mock.calls.length === 1);
    await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
    expect(h.download).not.toHaveBeenCalled();
    expect(h.api).not.toHaveBeenCalled();
  });

  it("Change passphrase shows only when the vault exists, and opens the same dialog as the pill", async () => {
    h.v.status = "off";
    await render();
    expect($("help-change-pass")).toBeNull();
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    document.body.innerHTML = "";
    h.v.status = "locked";
    await render();
    expect($("help-change-pass")!.textContent).toBe(en.vault_change_h2);
    await click("help-change-pass");
    await until(() => !!$("vault-change-dialog"));
  });
});
