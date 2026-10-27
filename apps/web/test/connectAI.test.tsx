// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetRemembered } from "../lib/vault/remember";
import en from "../messages/en.json";
import hi from "../messages/hi.json";

/*
 * Connect AI (first-run build spec, OJ 2026-10-27, step 4): the question, getting a free key, pasting and testing it, how it is kept, the passphrase
 * and the recovery sheet, in one window; and the AI connection once a key exists. The vault and the keys are the real providers on a fake api.
 */

const h = vi.hoisted(() => ({
  api: vi.fn(), ask: vi.fn(), toast: vi.fn(), update: vi.fn(async () => {}),
  test: { fail: 0, code: "key-rejected" as string },
  ws: { connect: null as null | { id: number; provider: string | null; offerSave: boolean }, finishConnect: vi.fn() }
}));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1" }, settings: {}, update: h.update }) }));
vi.mock("@/lib/session", () => ({ useSession: () => ({ email: "student@example.invalid" }) }));
vi.mock("@/components/workspace/dialogs/Passphrase", async () => ({ ...(await import("./support/passphraseMock")).passphraseMock(h.ask), VAULT_MIN_PASS: 10 }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => h.ws }));

import { ApiError } from "../lib/api";
import { keyStore } from "../lib/ai/keys";
import { KeysProvider, useKeys, type KeysValue } from "../lib/ai/useKeys";
import { useVault, VaultProvider, type VaultValue } from "../lib/vault/useVault";
import { ConnectAI } from "../components/workspace/dialogs/ConnectAI";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const E = en as Record<string, string>;
const H = hi as Record<string, string>;
const PASS = "a long first passphrase";
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k]));

type Call = { path: string; method: string; body?: Record<string, unknown> };
let server: { vault: Record<string, unknown> | null; creds: Record<string, string>; calls: Call[] };
function fakeApi(path: string, init: RequestInit = {}) {
  const method = init.method ?? "GET";
  const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
  server.calls.push({ path, method, body });
  if (path === "/ai/test") {
    if (h.test.fail > 0) { h.test.fail--; return Promise.reject(new ApiError(400, h.test.code)); }
    return Promise.resolve({ ok: true, reply: "OK" });
  }
  if (path === "/me/vault" && method === "GET") return server.vault ? Promise.resolve({ ...server.vault }) : Promise.reject(new ApiError(404, "no-vault"));
  if (path === "/me/vault" && method === "PUT") { server.vault = { ...body, complete: false, updatedAt: new Date().toISOString() }; return Promise.resolve({ ...server.vault }); }
  if (path === "/me/vault/complete" || path.startsWith("/me/vault")) return Promise.resolve({ ...(server.vault ?? {}), complete: true });
  if (path === "/me/credentials" && method === "GET") return Promise.resolve(Object.entries(server.creds).map(([provider, encryptedKey]) => ({ provider, encryptedKey })));
  const m = /^\/me\/credentials\/(\w+)$/.exec(path);
  if (m && method === "PUT") { server.creds[m[1]!] = String(body?.encryptedKey ?? ""); return Promise.resolve(undefined); }
  if (m && method === "DELETE") { delete server.creds[m[1]!]; return Promise.resolve(undefined); }
  // The vault's migration after setup lists projects and documents: none here.
  if (path === "/projects" || path.endsWith("/documents?includeDeleted=1") || path.startsWith("/projects")) return Promise.resolve([]);
  return Promise.reject(new ApiError(404, "not-found"));
}

const roots: Root[] = [];
const $ = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const screen = () => $("connect-dialog")?.getAttribute("data-screen") ?? null;
async function until(pred: () => boolean) {
  for (let i = 0; i < 600; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); }
  throw new Error("condition not reached");
}
let box: { keys: KeysValue | null; vault: VaultValue | null; root: Root | null };
async function mount(offerSave = true) {
  box = { keys: null, vault: null, root: null };
  function Probe() { box.keys = useKeys(); box.vault = useVault(); return null; }
  const el = document.body.appendChild(document.createElement("div"));
  const root = createRoot(el);
  roots.push(root);
  box.root = root;
  h.ws.connect = { id: 1, provider: null, offerSave };
  const render = () => root.render(<VaultProvider><KeysProvider><Probe /><ConnectAI /></KeysProvider></VaultProvider>);
  await act(async () => { render(); });
  await until(() => box.vault!.status !== "loading" && box.keys!.loaded);
  return { rerender: () => act(async () => { render(); }) };
}
async function click(id: string) {
  await act(async () => { $(id)!.click(); await new Promise((r) => setTimeout(r, 0)); });
}
function typeInto(id: string, value: string) {
  const input = $(id) as HTMLInputElement;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function escape() {
  await act(async () => { document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });
}
const ended = () => h.ws.finishConnect.mock.calls.map((c) => (c[0] as { result: string }).result);
const credPuts = () => server.calls.filter((c) => c.path.startsWith("/me/credentials/") && c.method === "PUT");

beforeEach(async () => {
  server = { vault: null, creds: {}, calls: [] };
  h.api.mockReset().mockImplementation(fakeApi);
  h.ask.mockReset(); h.toast.mockReset(); h.update.mockClear(); h.ws.finishConnect.mockReset();
  h.test = { fail: 0, code: "key-rejected" };
  localStorage.clear();
  keyStore.clearSession();
  await forgetRemembered("u1");
});
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });

describe("Connect AI: a new student with a key", () => {
  it("Yes → paste → Connect tests the key at once → Remember on this computer: the key is kept here, AI connected, and nothing is saved before 4d is answered", async () => {
    await mount();
    expect(screen()).toBe("ask");
    expect($("connect-dialog")!.textContent).toContain(E.connect_h);
    expect($("connect-dialog")!.textContent).toContain(E.connect_intro);
    expect($("connect-later")!.textContent).toBe(E.connect_later);
    await click("connect-yes");
    expect(screen()).toBe("paste");
    expect($("connect-from")!.textContent).toContain("From Google Gemini.");
    expect($("connect-other")!.textContent).toBe(E.connect_other);
    expect($("connect-provider")).toBeNull();
    typeInto("connect-key", "AIza-test-key");
    await click("connect-go");
    await until(() => screen() === "keep");
    expect(server.calls.filter((c) => c.path === "/ai/test")).toEqual([{ path: "/ai/test", method: "POST", body: { provider: "gemini", apiKey: "AIza-test-key" } }]);
    // Tested, not yet saved.
    expect(keyStore.getUnlocked("gemini")).toBeNull();
    expect(credPuts()).toHaveLength(0);
    await click("connect-keep-plain");
    await until(() => ended().length === 1);
    expect(ended()).toEqual(["connected"]);
    expect(h.ws.finishConnect).toHaveBeenCalledWith({ result: "connected", provider: "gemini" });
    expect(keyStore.isPlain("gemini")).toBe(true);
    expect(keyStore.getUnlocked("gemini")).toBe("AIza-test-key");
    expect(credPuts()).toHaveLength(0);
    expect(h.update).toHaveBeenCalledWith({ provider: "gemini" });
    expect(h.toast).toHaveBeenCalledWith("AI connected.");
  }, 30_000);

  it("\"Using a different AI company?\" shows the company list, and the key is tested and saved for the one chosen", async () => {
    await mount();
    await click("connect-yes");
    await click("connect-other");
    const select = $("connect-provider") as HTMLSelectElement;
    act(() => { select.value = "groq"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect($("connect-from")!.textContent).toContain("From Groq.");
    typeInto("connect-key", "gsk_test");
    await click("connect-go");
    await until(() => screen() === "keep");
    expect(server.calls.find((c) => c.path === "/ai/test")!.body).toEqual({ provider: "groq", apiKey: "gsk_test" });
    await click("connect-keep-plain");
    await until(() => ended().length === 1);
    expect(h.ws.finishConnect).toHaveBeenCalledWith({ result: "connected", provider: "groq" });
    expect(keyStore.getUnlocked("groq")).toBe("gsk_test");
  }, 30_000);
});

describe("Connect AI: a new student with no key, who chooses a passphrase", () => {
  it("No → the five steps and Open Google AI Studio → I have my key → paste → Connect → Protect with a passphrase → set and confirm (live checks) → recovery sheet → Done: the key is saved locked", async () => {
    await mount();
    await click("connect-no");
    expect(screen()).toBe("get");
    const steps = [...$("connect-get-steps")!.querySelectorAll("li")].map((li) => li.textContent);
    expect(steps).toEqual([1, 2, 3, 4, 5].map((n) => E["connect_get_" + n]));
    const studio = $("connect-open-studio") as HTMLAnchorElement;
    expect(studio.href).toBe("https://aistudio.google.com/apikey");
    expect(studio.target).toBe("_blank");
    expect($("connect-free-note")!.textContent).toBe(E.connect_free_note);
    await click("connect-have-key");
    expect(screen()).toBe("paste");
    typeInto("connect-key", "AIza-free-key");
    await click("connect-go");
    await until(() => screen() === "keep");
    await click("connect-keep-pass");
    expect(screen()).toBe("pass");
    const go = () => $("new-pass-go") as HTMLButtonElement;
    expect(go().disabled).toBe(true);
    expect($("new-pass-len")!.getAttribute("data-ok")).toBe("false");
    expect($("new-pass-len")!.textContent).toContain("At least 10 characters");
    typeInto("new-pass", "short");
    expect($("new-pass-len")!.getAttribute("data-ok")).toBe("false");
    typeInto("new-pass", PASS);
    expect($("new-pass-len")!.getAttribute("data-ok")).toBe("true");
    expect($("new-pass-same")!.getAttribute("data-ok")).toBe("false");
    typeInto("new-pass2", PASS + "x");
    expect($("new-pass-same")!.getAttribute("data-ok")).toBe("false");
    expect(go().disabled).toBe(true);
    typeInto("new-pass2", PASS);
    expect($("new-pass-same")!.getAttribute("data-ok")).toBe("true");
    expect(go().disabled).toBe(false);
    await click("new-pass-go");
    await until(() => !!$("vault-sheet-dialog"));
    // The sheet replaces the window; Done waits for "I have saved it" (#37).
    expect($("connect-dialog")).toBeNull();
    expect(($("vault-sheet-done") as HTMLButtonElement).disabled).toBe(true);
    expect(server.vault).not.toBeNull();
    const blob = server.creds.gemini!;
    expect(blob.startsWith("v2.")).toBe(true);
    expect(blob).not.toContain("AIza-free-key");
    expect(ended()).toEqual([]);
    await act(async () => { ($("vault-sheet-saved") as HTMLInputElement).click(); });
    await click("vault-sheet-done");
    expect(ended()).toEqual(["connected"]);
    expect(h.toast).toHaveBeenCalledWith("AI connected.");
    expect(keyStore.isPlain("gemini")).toBe(false);
  }, 30_000);
});

describe("Connect AI: a key that does not connect", () => {
  it("says so inside the window in plain words, with what to fix; Try again works; Save my idea without feedback ends with save", async () => {
    h.test.fail = 1;
    await mount();
    await click("connect-yes");
    typeInto("connect-key", "AIza-typo");
    await click("connect-go");
    await until(() => !!$("connect-error"));
    expect(screen()).toBe("paste");
    expect($("connect-error")!.textContent).toBe(fill(E.connect_fail_key!, { p: "Google Gemini" }));
    expect($("connect-error")!.textContent).toBe("Google Gemini did not accept this key. Check that you copied all of it, with no spaces, then try again.");
    expect($("connect-go")!.textContent).toBe("Try again");
    expect($("connect-fail-save")!.textContent).toBe("Save my idea without feedback");
    expect(keyStore.getUnlocked("gemini")).toBeNull();
    // Try again (the key fixed): it connects.
    typeInto("connect-key", "AIza-right");
    await click("connect-go");
    await until(() => screen() === "keep");
    expect($("connect-error")).toBeNull();
  }, 30_000);

  it("Save my idea without feedback, after a failed key, ends with save and keeps no key", async () => {
    h.test.fail = 1;
    await mount();
    await click("connect-yes");
    typeInto("connect-key", "AIza-typo");
    await click("connect-go");
    await until(() => !!$("connect-fail-save"));
    await click("connect-fail-save");
    expect(ended()).toEqual(["save"]);
    expect(keyStore.getUnlocked("gemini")).toBeNull();
  }, 30_000);

  it("a connection that does not reach the company says to check the internet", async () => {
    h.api.mockImplementation((path: string, init?: RequestInit) => path === "/ai/test" ? Promise.reject(new TypeError("Failed to fetch")) : fakeApi(path, init));
    await mount();
    await click("connect-yes");
    typeInto("connect-key", "AIza-x");
    await click("connect-go");
    await until(() => !!$("connect-error"));
    expect($("connect-error")!.textContent).toBe(fill(E.connect_fail_network!, { p: "Google Gemini" }));
  }, 30_000);
});

describe("Connect AI: the question and closing", () => {
  it("4a's Save my idea without feedback ends with save; without a save to offer it says Not now", async () => {
    await mount();
    expect($("connect-save")!.textContent).toBe("Save my idea without feedback");
    await click("connect-save");
    expect(ended()).toEqual(["save"]);
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    h.ws.finishConnect.mockReset();
    await mount(false);
    expect($("connect-save")).toBeNull();
    await click("connect-not-now");
    expect(ended()).toEqual(["closed"]);
  }, 30_000);

  for (const at of ["ask", "get", "paste", "keep"] as const) {
    it(`closing at ${at} ends with closed and saves no key${at === "keep" ? ", and says the key was not saved" : ""}`, async () => {
      await mount();
      if (at === "get") await click("connect-no");
      if (at === "paste" || at === "keep") { await click("connect-yes"); typeInto("connect-key", "AIza-k"); }
      if (at === "keep") { await click("connect-go"); await until(() => screen() === "keep"); }
      expect(screen()).toBe(at);
      await escape();
      expect(ended()).toEqual(["closed"]);
      expect(keyStore.getUnlocked("gemini")).toBeNull();
      expect(credPuts()).toHaveLength(0);
      if (at === "keep") expect(h.toast).toHaveBeenCalledWith("Your key was not saved.");
      else expect(h.toast).not.toHaveBeenCalledWith("Your key was not saved.");
    }, 30_000);
  }

  it("closing at the passphrase saves no key and sets no vault up", async () => {
    await mount();
    await click("connect-yes");
    typeInto("connect-key", "AIza-k");
    await click("connect-go");
    await until(() => screen() === "keep");
    await click("connect-keep-pass");
    typeInto("new-pass", PASS);
    await escape();
    expect(ended()).toEqual(["closed"]);
    expect(server.vault).toBeNull();
    expect(credPuts()).toHaveLength(0);
    expect(h.toast).toHaveBeenCalledWith("Your key was not saved.");
  }, 30_000);

  it("Back goes to the screen before", async () => {
    await mount();
    await click("connect-no");
    await click("connect-have-key");
    expect(screen()).toBe("paste");
    await click("connect-back");
    expect(screen()).toBe("get");
    await click("connect-back");
    expect(screen()).toBe("ask");
    expect($("connect-back")).toBeNull();
  }, 30_000);
});

describe("Connect AI: a student who already has a vault", () => {
  it("skips 4d: after the test the key is saved locked under the vault (its passphrase asked once)", async () => {
    // A vault set up before (another session), now locked in this tab.
    await mount();
    await act(async () => { await box.vault!.setup(PASS, false); });
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    h.ws.finishConnect.mockReset();
    await mount();
    expect(box.vault!.status).toBe("locked");
    h.ask.mockResolvedValue(PASS);
    await click("connect-yes");
    typeInto("connect-key", "AIza-vault-key");
    await click("connect-go");
    await until(() => ended().length === 1);
    expect(ended()).toEqual(["connected"]);
    expect(h.ask).toHaveBeenCalledWith(expect.objectContaining({ kind: "vault-unlock" }));
    expect(server.creds.gemini!.startsWith("v2.")).toBe(true);
    expect(keyStore.isPlain("gemini")).toBe(false);
  }, 30_000);

  it("cancelling the passphrase ask saves nothing, and says so in the window", async () => {
    await mount();
    await act(async () => { await box.vault!.setup(PASS, false); });
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    await mount();
    h.ask.mockResolvedValue(null);
    await click("connect-yes");
    typeInto("connect-key", "AIza-vault-key");
    await click("connect-go");
    await until(() => !!$("connect-error"));
    expect($("connect-error")!.textContent).toBe(E.connect_locked_cancelled);
    expect(server.creds.gemini).toBeUndefined();
    expect(ended()).toEqual([]);
  }, 30_000);
});

describe("AI connection, once a key exists", () => {
  it("shows the company with Test, Change key and Remove key, and how the key is kept (two choices)", async () => {
    localStorage.setItem("appu_key_u1_gemini", "AIza-saved");
    await mount();
    expect(screen()).toBe("manage");
    expect($("connect-connected")!.textContent).toBe("Connected to Google Gemini.");
    expect(($("connect-kept-plain") as HTMLInputElement).checked).toBe(true);
    expect(($("connect-kept-pass") as HTMLInputElement).checked).toBe(false);
    expect(document.querySelectorAll('input[name="connect-kept"]')).toHaveLength(2);
    await click("connect-test");
    await until(() => $("connect-status")!.textContent === "Google Gemini answered. Your key works.");
    await click("connect-change");
    expect(screen()).toBe("paste");
    await click("connect-back");
    await click("connect-remove");
    expect(screen()).toBe("ask");
    expect(keyStore.getUnlocked("gemini")).toBeNull();
    expect(h.toast).toHaveBeenCalledWith("Key removed.");
  }, 30_000);
});

/** Every component and lib file, as text. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? sources(p) : /\.(tsx?|css)$/.test(p) ? [readFileSync(p, "utf8")] : [];
  });
}

describe("what was removed", () => {
  it("\"This tab only\" appears nowhere: not in either dictionary, and no component offers a tab-only key mode", () => {
    for (const d of [E, H]) for (const [k, v] of Object.entries(d)) expect(/this tab only|keymode_session/i.test(k + " " + v), k).toBe(false);
    expect(E.settings_keymode_later).toBeUndefined();
    const root = join(__dirname, "..");
    for (const src of [...sources(join(root, "components")), ...sources(join(root, "lib"))]) {
      expect(src).not.toContain("key-mode-session");
      expect(src).not.toContain("settings_keymode_session");
    }
  });

  it("every Connect AI sentence has Hindi", () => {
    const keys = Object.keys(E).filter((k) => k.startsWith("connect_"));
    expect(keys.length).toBeGreaterThan(40);
    for (const k of keys) expect(H[k], k).toBeTruthy();
  });

  it("the words a \"later\" line names are the labels on the screen", () => {
    // Connect AI, at the top of the page: the AI pill (and the phone Menu's item) with no key.
    expect(E.connect_later).toContain(E.ai_pill_nokey);
    expect(H.connect_later).toContain(H.ai_pill_nokey);
    // AI connection, in the account menu.
    expect(E.connect_keep_later).toContain(E.acct_ai);
    expect(H.connect_keep_later).toContain(H.acct_ai);
  });
});
