// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";
import wcEn from "../messages/tools/help-backup.en.json";

const h = vi.hoisted(() => ({
  api: vi.fn(),
  vault: { known: vi.fn(async () => "off"), ensureUnlocked: vi.fn(async () => true), encryptBody: vi.fn() }
}));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: (...a: unknown[]) => h.api(...a) }));
vi.mock("@/lib/vault/useVault", () => ({ useVault: () => h.vault }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", scratchProjectId: "s1" } }) }));

import { BackupSlot } from "../components/help/slots/BackupSlot";
import { lockBackup } from "../lib/help/backup/lockedBackup";
import { apiError, fakeServer, fixtureZip } from "./wc7Support";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = { ...en, ...wcEn } as Record<string, string>;
const say = (key: string, vars: Record<string, string | number> = {}) => E[key]!.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k]));
const PASS = "a long enough passphrase";
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
/** A File whose bytes read back (jsdom's has no arrayBuffer()). */
const asFile = (bytes: Uint8Array, name: string) => { const f = new File([bytes as BlobPart], name); (f as unknown as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer; return f; };
async function choose(bytes: Uint8Array, name = "backup.zip") {
  await act(async () => {
    const el = $("bk-restore-file") as HTMLInputElement;
    Object.defineProperty(el, "files", { value: [asFile(bytes, name)], configurable: true });
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
function mount() {
  const el = document.body.appendChild(document.createElement("div"));
  const root = createRoot(el);
  roots.push(root);
  act(() => { root.render(<BackupSlot />); });
}
function serve(o: Parameters<typeof fakeServer>[0] = {}) { const s = fakeServer(o); h.api.mockReset(); h.api.mockImplementation(s.apiFetch); return s; }
const open = async () => { mount(); await click("help-restore-backup"); };

beforeEach(() => {
  localStorage.clear();
  h.api.mockReset();
  h.vault.known.mockReset(); h.vault.known.mockResolvedValue("off");
  h.vault.ensureUnlocked.mockReset(); h.vault.ensureUnlocked.mockResolvedValue(true);
});
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });

describe("Restore from backup, in Help (Task C7)", () => {
  it("is the third backup button, with v1's words", () => {
    mount();
    expect($("help-restore-backup")!.textContent).toBe("Restore from backup");
    expect($("help-restore-backup")!.textContent).toBe(E.wc_bk_restore_btn);
    expect($("help-locked-backup")).not.toBeNull();
    expect($("help-check-backup")).not.toBeNull();
  });

  it("reads the file first and says what will happen before anything is added: new projects named (restored), nothing now changed", async () => {
    const s = serve();
    await open();
    expect($("restore-backup-dialog")!.textContent).toContain(E.wc_bk_rs_intro);
    expect(($("bk-restore-file") as HTMLInputElement).accept).toBe(".locked,.zip,application/zip,application/octet-stream");
    expect(($("bk-restore-read") as HTMLButtonElement).disabled).toBe(true);
    await choose(await fixtureZip());
    expect($("bk-restore-pass")).toBeNull();
    await click("bk-restore-read");
    await until(() => !!$("bk-restore-confirm"));
    const text = $("bk-restore-confirm")!.textContent!;
    expect(text).toContain(say("wc_bk_rs_confirm", { n: 3, w: 9, d: "????-??-??", suffix: "(restored)" }).replace("????-??-??", text.match(/saved (\d{4}-\d{2}-\d{2})/)![1]!));
    expect(text).toContain("(restored)");
    expect(text).toContain("Nothing you have now is changed or replaced");
    expect(text).toContain(E.wc_bk_rs_note);
    expect(s.calls).toEqual([]);
  });

  it("Restore adds the projects and lists them with their document counts; nothing else is touched", async () => {
    const s = serve();
    await open();
    await choose(await fixtureZip());
    await click("bk-restore-read");
    await until(() => !!$("bk-restore-go"));
    await click("bk-restore-go");
    await until(() => !!$("bk-restore-result"));
    expect($("bk-restore-result")!.textContent).toContain(E.wc_bk_rs_ok);
    expect([...$("bk-restore-made")!.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      say("wc_bk_rs_made", { name: "Sleep study (restored)", n: 2 }),
      say("wc_bk_rs_made", { name: "Reading log (restored)", n: 1 })
    ]);
    expect($("bk-restore-failed")).toBeNull();
    expect($("bk-restore-error")).toBeNull();
    expect(s.calls.every((c) => c.method === "POST" || c.method === "PUT")).toBe(true);
    // Done: the only button left is Close; restoring does not stamp a backup or a check.
    expect($("bk-restore-go")).toBeNull();
    expect($("bk-restore-close")!.textContent).toBe(E.close_btn);
    expect(Object.keys(localStorage)).toEqual([]);
    await click("bk-restore-close");
    expect($("restore-backup-dialog")).toBeNull();
  });

  it("shows a busy line while it writes, and the dialog cannot be closed then", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const s = serve();
    h.api.mockImplementation(async (path: string, init?: RequestInit) => { if (path === "/projects") await gate; return s.apiFetch(path, init); });
    await open();
    await choose(await fixtureZip());
    await click("bk-restore-read");
    await until(() => !!$("bk-restore-go"));
    await click("bk-restore-go");
    expect($("bk-restore-busy")!.textContent).toBe(E.wc_bk_rs_busy);
    expect(($("bk-restore-close") as HTMLButtonElement).disabled).toBe(true);
    release();
    await until(() => !!$("bk-restore-result"));
    expect($("bk-restore-busy")).toBeNull();
  });

  it("a locked file asks for its passphrase in the window; a wrong one is v1's line, writes nothing and is cleared", async () => {
    const s = serve();
    await open();
    await choose(await lockBackup(await fixtureZip(), PASS), "backup.locked");
    expect($("bk-restore-pass")).not.toBeNull();
    expect(($("bk-restore-read") as HTMLButtonElement).disabled).toBe(true);
    await type("bk-restore-pass", "not the passphrase!!");
    await click("bk-restore-read");
    await until(() => !!$("bk-restore-error"));
    expect($("bk-restore-error")!.textContent).toBe(E.bk_err_wrong);
    expect(($("bk-restore-pass") as HTMLInputElement).value).toBe("");
    expect($("bk-restore-confirm")).toBeNull();
    expect(s.calls).toEqual([]);
    expect(h.vault.ensureUnlocked).not.toHaveBeenCalled();
  });

  it("the right passphrase opens it; the passphrase is never stored and is gone from the window once the file is read", async () => {
    const s = serve();
    await open();
    await choose(await lockBackup(await fixtureZip(), PASS), "backup.locked");
    await type("bk-restore-pass", PASS);
    await click("bk-restore-read");
    await until(() => !!$("bk-restore-go"));
    expect($("bk-restore-pass")).toBeNull();
    expect(document.body.innerHTML).not.toContain(PASS);
    await click("bk-restore-go");
    await until(() => !!$("bk-restore-result"));
    expect(s.made).toHaveLength(2);
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain(PASS);
    expect(JSON.stringify(s.calls)).not.toContain(PASS);
    expect(document.body.innerHTML).not.toContain(PASS);
  });

  it("a file that is not a backup says so, and a file from the old app says where it goes", async () => {
    const s = serve();
    await open();
    await choose(new TextEncoder().encode("just some words"), "notes.txt");
    await click("bk-restore-read");
    await until(() => !!$("bk-restore-error"));
    expect($("bk-restore-error")!.textContent).toBe(E.restore_bad);
    await choose(new TextEncoder().encode('{"app":"appuscholar","v":1}'), "old.json");
    await click("bk-restore-read");
    await until(() => $("bk-restore-error")?.textContent === E.wc_bk_rs_v1);
    expect(s.calls).toEqual([]);
  });

  it("a part that could not be restored is listed, with a warning that restoring again adds a copy", async () => {
    serve({ fail: (c) => (c.path.endsWith("/documents") && c.body?.title === "Draft two" ? apiError(413, "too-large") : undefined) });
    await open();
    await choose(await fixtureZip());
    await click("bk-restore-read");
    await until(() => !!$("bk-restore-go"));
    await click("bk-restore-go");
    await until(() => !!$("bk-restore-result"));
    expect($("bk-restore-result")!.textContent).toContain(E.wc_bk_rs_partial);
    expect([...$("bk-restore-failed")!.querySelectorAll("li")].map((li) => li.textContent)).toEqual([say("wc_bk_rs_f_doc", { name: "Sleep study/Draft two" })]);
    expect($("bk-restore-made")!.textContent).toContain(say("wc_bk_rs_made", { name: "Sleep study (restored)", n: 1 }));
    expect($("bk-restore-result")!.textContent).toContain(E.wc_bk_rs_again);
  });

  it("a vault that stays locked: nothing is added, it says so, and the student can try again", async () => {
    const s = serve();
    h.vault.known.mockResolvedValue("locked");
    h.vault.ensureUnlocked.mockResolvedValue(false);
    await open();
    await choose(await fixtureZip());
    await click("bk-restore-read");
    await until(() => !!$("bk-restore-go"));
    await click("bk-restore-go");
    await until(() => $("bk-restore-error")?.textContent === E.wc_bk_rs_cancelled);
    expect(s.calls).toEqual([]);
    expect($("bk-restore-go")).not.toBeNull();
  });

  it("a file with problems of its own lists them before the student confirms", async () => {
    serve();
    await open();
    const JSZip = (await import("jszip")).default;
    const z = await JSZip.loadAsync(await fixtureZip());
    z.remove("Sleep study/Draft two.html");
    await choose(new Uint8Array(await z.generateAsync({ type: "arraybuffer" })));
    await click("bk-restore-read");
    await until(() => !!$("bk-restore-problems"));
    expect($("bk-restore-confirm")!.textContent).toContain(E.wc_bk_rs_problems);
    expect($("bk-restore-problems")!.textContent).toBe(say("wc_bk_prob_missing", { name: "Sleep study/Draft two.html" }));
    expect($("bk-restore-go")).not.toBeNull();
  });

  it("Choose another file goes back to the file box with nothing kept", async () => {
    serve();
    await open();
    await choose(await fixtureZip());
    await click("bk-restore-read");
    await until(() => !!$("bk-restore-go"));
    await click("bk-restore-back");
    expect($("bk-restore-file")).not.toBeNull();
    expect(($("bk-restore-read") as HTMLButtonElement).disabled).toBe(true);
  });
});
