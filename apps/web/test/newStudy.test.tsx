// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../messages/en.json";

/*
 * Start a new study (start-a-study spec, OJ 2026-10-27): only the name, the type and the field are required; the study is made with them (its name sealed
 * as before) and opens on Shape your study. Nothing about the idea is asked or stored here.
 */

type Call = { path: string; method: string; body: unknown };
const h = vi.hoisted(() => ({
  api: vi.fn(), toast: vi.fn(), openProject: vi.fn(),
  settings: { field: "psychology" } as Record<string, unknown>,
  vault: null as unknown as Record<string, unknown>
}));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/vault/useVault", async (orig) => ({ ...(await orig<typeof import("../lib/vault/useVault")>()), useVault: () => h.vault }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", scratchProjectId: "s1" }, settings: h.settings }) }));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/components/frame/ProjectContext", () => ({ useProject: () => ({ project: null, projectId: null, openProject: h.openProject }) }));

import { ApiError } from "../lib/api";
import { NewStudy } from "../components/frame/NewStudy";
import { clearJustMade, readJustMade } from "../lib/frame/justMade";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const E = en as Record<string, string>;
const doc = (id: string) => ({ id, projectId: "pNew", title: "t", titleKeyVersion: 0, deks: [], kind: "draft", currentSeq: 0, wordCount: 0, createdAt: "2026-10-27T00:00:00Z", updatedAt: "2026-10-27T00:00:00Z", bodyHtml: "", keyVersion: 0 });
let calls: Call[];
let docs: ReturnType<typeof doc>[];
let failPost = 0;
const roots: Root[] = [];
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel);
const tid = (id: string) => $(`[data-testid="${id}"]`);
const sent = (method: string, path: string) => calls.filter((c) => c.method === method && c.path === path);

function vault(status: "off" | "unlocked" | "locked", unlocks = true) {
  return {
    status,
    known: vi.fn(async () => status),
    ensureUnlocked: vi.fn(async () => unlocks),
    encryptBody: vi.fn(async (d: { id: string; deks: unknown[] }, html: string) => ({ bodyHtml: `sealed[${d.id}]` + html, keyVersion: 1, ...(d.deks.length ? {} : { dek: { v: 1, wrapped: "dek-" + d.id } }) })),
    decryptBody: vi.fn()
  };
}
function fakeApi(path: string, init: RequestInit = {}) {
  const method = init.method ?? "GET";
  const body = init.body ? JSON.parse(String(init.body)) : undefined;
  calls.push({ path, method, body });
  if (path === "/projects" && method === "POST") {
    if (failPost > 0) { failPost--; return Promise.reject(new ApiError(500, "error")); }
    return Promise.resolve({ id: "pNew", title: "x", titleKeyVersion: 0, deks: [], field: body.field, type: body.type, stage: "idea", status: "active", contentLang: "en", kind: "research" });
  }
  if (path === "/projects/pNew" && method === "PATCH") return Promise.resolve({});
  if (path === "/projects/pNew/documents" && method === "GET") return Promise.resolve(docs);
  if (path === "/projects/pNew/documents" && method === "POST") { docs = [doc("Dfirst")]; return Promise.resolve(docs[0]); }
  return Promise.reject(new ApiError(404, "not-found"));
}
async function render() {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  roots.push(root);
  await act(async () => { root.render(<NewStudy />); });
}
async function type(id: string, value: string) {
  const el = $("#" + id) as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function choose(value: string) {
  const el = tid("new-field") as HTMLSelectElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function click(id: string) {
  await act(async () => { tid(id)!.click(); await new Promise((r) => setTimeout(r, 0)); });
}
async function until(pred: () => boolean) {
  for (let i = 0; i < 400; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); }
  throw new Error("condition not reached");
}

beforeEach(() => {
  calls = []; docs = []; failPost = 0;
  h.vault = vault("unlocked");
  h.settings = { field: "psychology" };
  h.api.mockReset().mockImplementation(fakeApi);
  h.toast.mockReset();
  h.openProject.mockReset().mockResolvedValue(true);
  clearJustMade();
});
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });

describe("Start a new study", () => {
  it("asks only for a name, one of the six types and a field (the account's to begin with), and says they can change later", async () => {
    await render();
    expect($("h1")!.textContent).toBe("Start a new study");
    expect(tid("new-study")!.textContent).toContain(E.new_lead);
    expect($('label[for="newName"]')!.textContent).toBe("Name");
    expect([...document.querySelectorAll(".new-type span")].map((s) => s.textContent)).toEqual([
      "Undergraduate project or thesis", "Master's dissertation", "PhD thesis", "Course assignment or term paper", "Journal article", "Other"
    ]);
    expect((tid("new-field") as HTMLSelectElement).value).toBe("psychology");
    expect(document.querySelectorAll("textarea")).toHaveLength(0);
    expect(tid("new-cancel")!.getAttribute("href")).toBe("/projects");
  });

  it("each required thing missing is said in the form, in turn, and nothing is sent", async () => {
    await render();
    await click("new-create");
    expect(tid("new-error")!.textContent).toBe("Give your study a name.");
    await type("newName", "Sleep and exam stress");
    await click("new-create");
    expect(tid("new-error")!.textContent).toBe("Choose a type.");
    await click("new-type-masters");
    await choose("__other");
    await click("new-create");
    expect(tid("new-error")!.textContent).toBe("Choose a field, or write your own.");
    expect(sent("POST", "/projects")).toHaveLength(0);
  });

  it("makes the study with its sealed name, type and field, a first document and no idea, then opens Shape your study", async () => {
    await render();
    await type("newName", "Sleep and exam stress");
    await click("new-type-masters");
    await choose("education");
    await click("new-create");
    await until(() => h.openProject.mock.calls.length > 0);
    const post = sent("POST", "/projects")[0]!.body as Record<string, unknown>;
    expect(post).toMatchObject({ type: "masters", field: "education", titleKeyVersion: 1 });
    // Sealed under the new study's key id (the test's vault marks what it seals).
    expect(String(post.title)).toMatch(/^sealed\[project:new:/);
    expect(sent("POST", "/projects/pNew/documents")).toHaveLength(1);
    expect(calls.some((c) => c.path.includes("/blobs/"))).toBe(false);
    expect(h.openProject).toHaveBeenCalledWith("pNew", { place: "idea" });
    expect(readJustMade("pNew")).toEqual({ id: "pNew", checked: false });
  });

  it("a field of the student's own words is sent cleaned, as Settings keeps one", async () => {
    h.vault = vault("off");
    await render();
    await type("newName", "Rural clinics");
    await click("new-type-phd");
    await choose("__other");
    const custom = tid("new-field-custom") as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(custom, "Public health <rural>");
      custom.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click("new-create");
    await until(() => h.openProject.mock.calls.length > 0);
    expect(sent("POST", "/projects")[0]!.body).toMatchObject({ title: "Rural clinics", titleKeyVersion: 0, type: "phd", field: "Public health rural" });
  });

  it("a study made on a Hindi page writes in Hindi", async () => {
    h.settings = { field: "psychology", lang: "hi" };
    await render();
    await type("newName", "नींद");
    await click("new-type-ug");
    await click("new-create");
    await until(() => h.openProject.mock.calls.length > 0);
    expect(sent("PATCH", "/projects/pNew").map((c) => c.body)).toEqual([{ contentLang: "hi" }]);
  });

  it("a locked vault asks once; cancelling makes nothing", async () => {
    h.vault = vault("locked", false);
    await render();
    await type("newName", "Sleep");
    await click("new-type-course");
    await click("new-create");
    await until(() => h.toast.mock.calls.length > 0);
    expect(h.toast).toHaveBeenCalledWith(E.vault_save_locked);
    expect(sent("POST", "/projects")).toHaveLength(0);
    expect(h.openProject).not.toHaveBeenCalled();
  });

  it("a failure says so and keeps the form; Create again makes one study, not two", async () => {
    failPost = 1;
    await render();
    await type("newName", "Sleep");
    await click("new-type-article");
    await click("new-create");
    await until(() => h.toast.mock.calls.length > 0);
    expect(h.toast).toHaveBeenCalledWith(E.start_fail);
    expect((tid("new-create") as HTMLButtonElement).disabled).toBe(false);
    await click("new-create");
    await until(() => h.openProject.mock.calls.length > 0);
    expect(sent("POST", "/projects")).toHaveLength(2); // the first was refused; one study exists
    h.openProject.mockClear();
    await click("new-create");
    await until(() => h.openProject.mock.calls.length > 0);
    expect(sent("POST", "/projects")).toHaveLength(2);
  });

  it("every new-study and study-type sentence has Hindi", async () => {
    const hi = (await import("../messages/hi.json")).default as Record<string, string>;
    for (const k of Object.keys(E).filter((k) => /^(new_|study_type_|dash_|shape_)/.test(k))) {
      expect(hi[k], k).toBeTruthy();
      expect(hi[k], k).not.toBe(E[k]);
    }
  });
});
