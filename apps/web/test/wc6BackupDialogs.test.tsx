// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import JSZip from "jszip";
import { Blob as NodeBlob } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import wcEn from "../messages/tools/help-backup.en.json";

const h = vi.hoisted(() => ({
  zip: null as Blob | null, build: vi.fn(), audit: vi.fn(async () => {}), download: vi.fn(),
  vault: { known: async () => "off", ensureUnlocked: async () => true, decryptBody: async () => "" },
  me: { id: "u1", scratchProjectId: "s1" } as { id: string; scratchProjectId: string } | null
}));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => h.vault }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: h.me }) }));
vi.mock("@/lib/help/backup/buildZip", () => ({ buildBackupZip: h.build, logBackupExport: h.audit }));
vi.mock("@/lib/export/download", () => ({ downloadBlob: h.download }));
const apiSpy = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: apiSpy }));

import { BackupSlot } from "../components/help/slots/BackupSlot";
import { unlockBackup } from "../lib/help/backup/lockedBackup";
import { lastBackup, lastVerify } from "../lib/help/backup/stamp";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = { ...en, ...wcEn } as Record<string, string>;
/** A message with its {holes} filled, as t() fills them. */
const say = (key: string, vars: Record<string, string | number> = {}) => E[key]!.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k]));
const roots: Root[] = [];
const $ = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
async function until(pred: () => boolean) {
  for (let i = 0; i < 400; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); }
  throw new Error("condition not reached");
}
const click = async (id: string) => { await act(async () => { $(id)!.click(); }); };
async function type(id: string, value: string) {
  await act(async () => {
    const el = $(id) as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function choose(file: File) {
  await act(async () => {
    const el = $("bk-check-file") as HTMLInputElement;
    Object.defineProperty(el, "files", { value: [file], configurable: true });
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function zipBlob(opts: { dropFile?: string } = {}): Promise<Blob> {
  const z = new JSZip();
  z.file("Sleep study/Draft.html", "<p>An invented sentence.</p>");
  z.file("Sleep study/Draft.doc", "doc");
  z.file("writing-process-record.txt", "record");
  z.file("index.json", JSON.stringify({ format: 2, exportedAt: "2026-10-20T10:00:00.000Z", projects: [{ title: "Sleep study", documents: [{ title: "Draft", html: "Sleep study/Draft.html", doc: "Sleep study/Draft.doc" }], stageData: [] }] }));
  if (opts.dropFile) z.remove(opts.dropFile);
  // Node's Blob: jsdom's has no arrayBuffer().
  return new NodeBlob([await z.generateAsync({ type: "uint8array" })]) as unknown as Blob;
}
const asFile = (b: Blob, name: string) => { const f = new File([b], name); (f as unknown as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = () => b.arrayBuffer(); return f; };
function mount() {
  const el = document.body.appendChild(document.createElement("div"));
  const root = createRoot(el);
  roots.push(root);
  act(() => { root.render(<BackupSlot />); });
}

beforeEach(async () => {
  localStorage.clear();
  h.me = { id: "u1", scratchProjectId: "s1" };
  h.build.mockReset(); h.audit.mockClear(); h.download.mockReset(); apiSpy.mockReset();
  h.build.mockImplementation(async () => await zipBlob());
});
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });

describe("Help's backup buttons: the locked backup (Task C6)", () => {
  it("shows the two buttons with their words", () => {
    mount();
    expect($("help-locked-backup")!.textContent).toBe(E.wc_bk_locked_btn);
    expect($("help-check-backup")!.textContent).toBe(E.wc_bk_check_btn);
  });

  it("refuses a short passphrase and a mismatch inside the window, and builds nothing", async () => {
    mount();
    await click("help-locked-backup");
    await type("bk-pass1", "short");
    await type("bk-pass2", "short");
    await click("bk-lock-go");
    expect($("bk-lock-verdict")!.textContent).toBe(E.bk_err_short);
    await type("bk-pass1", "a long enough pass");
    await type("bk-pass2", "a long enough pasS");
    await click("bk-lock-go");
    expect($("bk-lock-verdict")!.textContent).toBe(E.bk_err_match);
    expect(h.build).not.toHaveBeenCalled();
    expect(h.download).not.toHaveBeenCalled();
  });

  it("makes a .locked file that opens only with the passphrase, audits, stamps the backup, and keeps the passphrase out of storage and the window", async () => {
    mount();
    await click("help-locked-backup");
    expect($("locked-backup-dialog")!.textContent).toContain(E.bk_m_create);
    await type("bk-pass1", "a long enough pass");
    await type("bk-pass2", "a long enough pass");
    await click("bk-lock-go");
    await until(() => h.download.mock.calls.length > 0);
    await until(() => $("bk-lock-verdict")?.textContent === E.wc_bk_done);
    const [name, blob] = h.download.mock.calls[0] as [string, Blob];
    expect(name).toMatch(/^appuscholar-backup-\d{4}-\d{2}-\d{2}\.locked$/);
    const bytes = await new Promise<Uint8Array>((res) => { const r = new FileReader(); r.onload = () => res(new Uint8Array(r.result as ArrayBuffer)); r.readAsArrayBuffer(blob); });
    expect(new TextDecoder().decode(bytes.subarray(0, 9))).toBe("APPULOCK2");
    const inner = await unlockBackup(bytes, "a long enough pass");
    expect(Object.keys((await JSZip.loadAsync(inner)).files)).toContain("index.json");
    expect(h.audit).toHaveBeenCalledTimes(1);
    expect(lastBackup("u1")).toBeGreaterThan(0);
    expect(JSON.stringify({ ...localStorage })).not.toContain("a long enough pass");
    // The form is gone once the file is made, so no passphrase stays on screen, and the only button left reads Close.
    expect($("bk-pass1")).toBeNull();
    expect($("bk-pass2")).toBeNull();
    expect($("bk-lock-go")).toBeNull();
    expect($("bk-lock-cancel")!.textContent).toBe(E.close_btn);
    expect(document.body.innerHTML).not.toContain("a long enough pass");
    expect(apiSpy).not.toHaveBeenCalled();
    await click("bk-lock-cancel");
    expect($("locked-backup-dialog")).toBeNull();
  });

  it("the audit is posted after the zip is built and before the file is saved, as Help's export does", async () => {
    const order: string[] = [];
    h.build.mockImplementation(async () => { order.push("build"); return await zipBlob(); });
    h.audit.mockImplementation(async () => { order.push("audit"); });
    h.download.mockImplementation(() => { order.push("download"); });
    mount();
    await click("help-locked-backup");
    await type("bk-pass1", "a long enough pass");
    await type("bk-pass2", "a long enough pass");
    await click("bk-lock-go");
    await until(() => order.includes("download"));
    expect(order).toEqual(["build", "audit", "download"]);
  });

  it("a failing audit saves no file and stamps no backup", async () => {
    h.audit.mockRejectedValueOnce(new Error("network"));
    mount();
    await click("help-locked-backup");
    await type("bk-pass1", "a long enough pass");
    await type("bk-pass2", "a long enough pass");
    await click("bk-lock-go");
    await until(() => $("bk-lock-verdict")?.textContent === E.wc_bk_fail);
    expect(h.download).not.toHaveBeenCalled();
    expect(lastBackup("u1")).toBe(0);
  });

  it("a browser without Web Crypto says so inside the window and builds nothing", async () => {
    mount();
    await click("help-locked-backup");
    await type("bk-pass1", "a long enough pass");
    await type("bk-pass2", "a long enough pass");
    vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
    try { await click("bk-lock-go"); } finally { vi.unstubAllGlobals(); }
    expect($("bk-lock-verdict")!.textContent).toBe(E.wc_bk_nocrypto);
    expect(h.build).not.toHaveBeenCalled();
  });

  it("the stamp is this student's: appu_last_backup_<id>, never the bare key, and another student on the computer has none", async () => {
    mount();
    await click("help-locked-backup");
    await type("bk-pass1", "a long enough pass");
    await type("bk-pass2", "a long enough pass");
    await click("bk-lock-go");
    await until(() => h.download.mock.calls.length > 0);
    await until(() => $("bk-lock-verdict")?.textContent === E.wc_bk_done);
    expect(Object.keys(localStorage)).toEqual(["appu_last_backup_u1"]);
    expect(lastBackup("u2")).toBe(0);
  });

  it("with nobody signed in the file is still made but nothing is stamped", async () => {
    h.me = null;
    mount();
    await click("help-locked-backup");
    await type("bk-pass1", "a long enough pass");
    await type("bk-pass2", "a long enough pass");
    await click("bk-lock-go");
    await until(() => h.download.mock.calls.length > 0);
    await until(() => $("bk-lock-verdict")?.textContent === E.wc_bk_done);
    expect(localStorage.length).toBe(0);
  });

  it("a vault that stays locked makes no file and says so", async () => {
    h.build.mockResolvedValue(null);
    mount();
    await click("help-locked-backup");
    await type("bk-pass1", "a long enough pass");
    await type("bk-pass2", "a long enough pass");
    await click("bk-lock-go");
    await until(() => $("bk-lock-verdict")?.textContent === E.wc_bk_need_unlock);
    expect(h.download).not.toHaveBeenCalled();
    expect(lastBackup("u1")).toBe(0);
  });

  it("a failing build says so and downloads nothing", async () => {
    h.build.mockRejectedValue(new Error("network"));
    mount();
    await click("help-locked-backup");
    await type("bk-pass1", "a long enough pass");
    await type("bk-pass2", "a long enough pass");
    await click("bk-lock-go");
    await until(() => $("bk-lock-verdict")?.textContent === E.wc_bk_fail);
    expect(h.download).not.toHaveBeenCalled();
    expect(lastBackup("u1")).toBe(0);
  });
});

describe("Help's backup buttons: check a backup file (Task C6)", () => {
  it("a plain file: shows the counts and the saved day, changes nothing, records the check", async () => {
    mount();
    await click("help-check-backup");
    expect($("bk-last-verify")!.textContent).toBe(E.bk_never_verify);
    await choose(asFile(await zipBlob(), "appuscholar-export.zip"));
    expect($("bk-check-pass")).toBeNull();
    await click("bk-check-go");
    await until(() => !!$("bk-check-summary"));
    expect($("bk-check-summary")!.textContent).toBe(say("wc_bk_check_ok", { p: 1, n: 1, d: "2026-10-20" }));
    expect(lastVerify("u1")).toBeGreaterThan(0);
    expect(Object.keys(localStorage)).toEqual(["appu_last_verify_u1"]);
    expect($("bk-last-verify")!.textContent).toContain(E.bk_last_verify!.split("{d}")[0]!);
    expect(apiSpy).not.toHaveBeenCalled();
  });

  it("another student's last check on this computer is not shown, and the old device-wide key is not read", async () => {
    localStorage.setItem("appu_last_verify_u2", String(Date.now()));
    localStorage.setItem("appu_last_verify", String(Date.now()));
    mount();
    await click("help-check-backup");
    expect($("bk-last-verify")!.textContent).toBe(E.bk_never_verify);
  });

  it("a file with a missing document says which one", async () => {
    mount();
    await click("help-check-backup");
    await choose(asFile(await zipBlob({ dropFile: "Sleep study/Draft.html" }), "x.zip"));
    await click("bk-check-go");
    await until(() => !!$("bk-check-problems"));
    expect($("bk-check-problems")!.textContent).toBe(say("wc_bk_prob_missing", { name: "Sleep study/Draft.html" }));
    expect($("bk-check-summary")!.textContent).toBe(say("wc_bk_check_bad", { p: 1, n: 1, d: "2026-10-20" }));
    expect(lastVerify("u1")).toBe(0);
  });

  it("a locked file asks for its passphrase: wrong shows the error, right shows the counts", async () => {
    const { lockBackup } = await import("../lib/help/backup/lockedBackup");
    const locked = await lockBackup(new Uint8Array(await (await zipBlob()).arrayBuffer()), "a long enough pass");
    mount();
    await click("help-check-backup");
    await choose(asFile(new NodeBlob([locked]) as unknown as Blob, "appuscholar-backup.locked"));
    expect($("bk-check-pass")).not.toBeNull();
    expect(($("bk-check-go") as HTMLButtonElement).disabled).toBe(true);
    await type("bk-check-pass", "not the right one");
    await click("bk-check-go");
    await until(() => !!$("bk-check-error"));
    expect($("bk-check-error")!.textContent).toBe(E.bk_err_wrong);
    expect($("bk-check-result")).toBeNull();
    await type("bk-check-pass", "a long enough pass");
    await click("bk-check-go");
    await until(() => !!$("bk-check-summary"));
    expect($("bk-check-summary")!.textContent).toBe(say("wc_bk_check_ok_locked", { p: 1, n: 1, d: "2026-10-20" }));
    expect($("bk-check-error")).toBeNull();
  });

  it("a file from the old app says where it goes, locked or not, and is not recorded as checked", async () => {
    mount();
    await click("help-check-backup");
    await choose(asFile(new NodeBlob(['{"app":"appuscholar","v":1,"exported":"2026-01-01T00:00:00.000Z","data":{}}']) as unknown as Blob, "appuscholar-backup-2026-01-01.json"));
    await click("bk-check-go");
    await until(() => !!$("bk-check-error"));
    expect($("bk-check-error")!.textContent).toBe(E.wc_bk_check_v1);
    expect(E.wc_bk_check_v1).toContain("Import a v1 backup");
    await choose(asFile(new NodeBlob(['{"app":"appuscholar","v":2,"locked":true,"enc":{},"ct":"AAAA"}']) as unknown as Blob, "appuscholar-backup-locked-2026-01-01.json"));
    expect($("bk-check-error")).toBeNull();
    await click("bk-check-go");
    await until(() => !!$("bk-check-error"));
    expect($("bk-check-error")!.textContent).toBe(E.wc_bk_check_v1);
    expect(lastVerify("u1")).toBe(0);
  });

  it("the file box takes the locked, zip and old .json files", async () => {
    mount();
    await click("help-check-backup");
    const accept = ($("bk-check-file") as HTMLInputElement).accept;
    for (const ext of [".locked", ".zip", ".json"]) expect(accept).toContain(ext);
  });

  it("a file that is not a backup says so", async () => {
    mount();
    await click("help-check-backup");
    await choose(asFile(new NodeBlob(["just some words"]) as unknown as Blob, "notes.txt"));
    await click("bk-check-go");
    await until(() => !!$("bk-check-error"));
    expect($("bk-check-error")!.textContent).toBe(E.bk_verify_bad);
  });
});
