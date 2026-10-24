// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateVaultKey, sealVaultCheck, wrapWithPassphrase } from "../lib/vault/crypto";

const h = vi.hoisted(() => ({ api: vi.fn(), ask: vi.fn(), toast: vi.fn(), ws: null as unknown }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u-list", scratchProjectId: "scratch1" }, settings: {} }) }));
vi.mock("@/components/workspace/dialogs/Passphrase", async () => (await import("./support/passphraseMock")).passphraseMock(h.ask));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));
vi.mock("@/components/frame/ProjectContext", async (orig) => ({ ...(await orig<typeof import("../components/frame/ProjectContext")>()), useProject: () => h.ws }));

import { ApiError } from "../lib/api";
import { useVault, VaultProvider, type VaultValue } from "../lib/vault/useVault";
import { projectKeyId } from "../lib/vault/titles";
import { stageStates } from "../lib/frame/stages";
import { stateSummary } from "../lib/frame/stateSummary";
import type { ProjectWork } from "../lib/frame/useProjectWork";
import { STAGE_ORDER } from "../lib/tools";
import { ProjectList } from "../components/frame/ProjectList";
import en from "../messages/en.json";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const E = en as Record<string, string>;
const t = (key: string, vars?: Record<string, string | number>) => (E[key] ?? key).replace(/\{(\w+)\}/g, (m, k: string) => (vars && k in vars ? String(vars[k]) : m));

const PASS = "right passphrase";
const NOW = new Date().toISOString();
const project = (id: string, over: Partial<ProjectWork> = {}): ProjectWork => ({
  id, userId: "u-list", title: "Project " + id, titleKeyVersion: 0, deks: [], field: "Education", stage: "idea", status: "active", contentLang: "en", kind: "project",
  createdAt: "2026-03-05T10:00:00.000Z", stageMarks: {}, documentCount: 1, lastEditedAt: null, blobs: [], draftWords: 0, draftEditedAt: null, ...over
});

let record: Record<string, unknown> | null;
let work: ProjectWork[];
beforeEach(async () => {
  record = null;
  work = [];
  h.api.mockReset().mockImplementation((path: string) => {
    if (path === "/me/vault") return record ? Promise.resolve({ ...record }) : Promise.reject(new ApiError(404, "not-found"));
    if (path === "/projects?include=work") return Promise.resolve(work);
    return Promise.reject(new ApiError(404, "not-found"));
  });
  h.ask.mockReset();
  h.ws = { openProject: vi.fn(async () => true), go: vi.fn(async () => true) };
});
const roots: Root[] = [];
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });
async function until(pred: () => boolean) {
  for (let i = 0; i < 400; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); }
  throw new Error("condition not reached");
}
async function withVault(): Promise<VaultValue> {
  const vk = await generateVaultKey();
  record = { passWrapped: await wrapWithPassphrase(vk, PASS), recoveryWrapped: "x.y.z", checkWrapped: await sealVaultCheck(vk), publicKey: "pk", privateKeyWrapped: "w", complete: true, updatedAt: NOW };
  const box: { v: VaultValue | null } = { v: null };
  function Probe() { box.v = useVault(); return null; }
  const root = createRoot(document.createElement("div"));
  roots.push(root);
  await act(async () => { root.render(<VaultProvider><Probe /></VaultProvider>); });
  await until(() => box.v?.status === "locked");
  await act(async () => { await box.v!.unlock(PASS, false); });
  return box.v!;
}
/** The project with its title sealed under its project key, as Task 5 stores it. */
async function sealed(v: VaultValue, p: ProjectWork): Promise<ProjectWork> {
  const s = await v.encryptBody({ id: projectKeyId(p.id), deks: [] }, p.title);
  return { ...p, title: s.bodyHtml, titleKeyVersion: s.keyVersion, deks: [s.dek!] };
}
async function render(): Promise<{ host: HTMLElement; vault: () => VaultValue }> {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  roots.push(root);
  const box: { v: VaultValue | null } = { v: null };
  function Probe() { box.v = useVault(); return null; }
  await act(async () => { root.render(<VaultProvider><Probe /><ProjectList /></VaultProvider>); });
  await until(() => !!host.querySelector('[data-testid="scratch-row"]') && box.v?.status !== "loading");
  return { host, vault: () => box.v! };
}
const rows = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>('[data-testid="project-row"]')];
const titles = (host: HTMLElement) => rows(host).map((r) => r.querySelector('[data-testid="project-row-title"]')!.textContent);
const bars = (row: HTMLElement) => [...row.querySelectorAll<HTMLElement>('[data-testid="stage-bar"]')].map((b) => b.dataset.state);

describe("ProjectList", () => {
  it("twenty projects make one request", async () => {
    work = Array.from({ length: 20 }, (_, i) => project("p" + i, { blobs: [{ kind: "idea_intake", updatedAt: NOW, version: 1 }] }));
    const { host } = await render();
    expect(rows(host)).toHaveLength(20);
    const paths = h.api.mock.calls.map(([p]) => String(p));
    expect(paths.filter((p) => p === "/projects?include=work")).toHaveLength(1);
    expect(paths.filter((p) => p.startsWith("/projects") && p !== "/projects?include=work")).toHaveLength(0);
    // Off: the header line says the titles are readable on the server.
    expect(host.querySelector('[data-testid="list-vault-line"]')!.textContent).toBe("Vault off. Titles are readable on the server.");
  });

  it("each row's bars and spoken summary follow stageStates", async () => {
    const a = project("a", {
      stageMarks: { idea: { readyAt: "2026-10-10T00:00:00.000Z" } },
      blobs: [{ kind: "idea_intake", updatedAt: "2026-10-09T00:00:00.000Z", version: 2 }, { kind: "citations", updatedAt: "2026-10-11T00:00:00.000Z", version: 1 }, { kind: "rs_prefs", updatedAt: "2026-10-14T20:00:00.000Z", version: 1 }],
      draftWords: 120, draftEditedAt: "2026-10-12T12:00:00.000Z"
    });
    const b = project("b", { blobs: [{ kind: "shelf_paper:x1", updatedAt: "2026-10-02T00:00:00.000Z", version: 1 }] });
    const c = project("c", { stageMarks: { idea: { readyAt: "2026-10-01T00:00:00.000Z" } }, blobs: [{ kind: "idea_intake", updatedAt: "2026-10-03T00:00:00.000Z", version: 3 }] });
    const d = project("d");
    work = [a, b, c, d];
    const { host } = await render();
    const r = rows(host);
    for (const [i, p] of work.entries()) {
      const s = stageStates(p);
      expect(bars(r[i]!)).toEqual(STAGE_ORDER.map((k) => s[k]));
      expect(r[i]!.querySelector('[data-testid="stage-bars"]')!.getAttribute("aria-label")).toBe(stateSummary(s, t));
    }
    expect(r[0]!.querySelector('[data-testid="stage-bars"]')!.getAttribute("aria-label")).toBe("Idea ready; literature and writing in progress");
    expect(r[1]!.querySelector('[data-testid="stage-bars"]')!.getAttribute("aria-label")).toBe("Literature started early");
    expect(r[2]!.querySelector('[data-testid="stage-bars"]')!.getAttribute("aria-label")).toBe("Idea reopened");
    expect(r[3]!.querySelector('[data-testid="stage-bars"]')!.getAttribute("aria-label")).toBe("Nothing started yet");
    // The short names, as on the canvas.
    expect([...r[0]!.querySelectorAll(".plist-stage-name")].map((n) => n.textContent)).toEqual(["Idea", "Literature", "Design", "Analysis", "Writing", "Review"]);
    // "{field}. Edited {date}.": the newest of the draft, the work blobs and the creation (R9); a preference is not work.
    expect(r[3]!.querySelector('[data-testid="project-row-meta"]')!.textContent).toBe("Education. Edited 5 Mar 2026.");
    expect(r[0]!.querySelector('[data-testid="project-row-meta"]')!.textContent).toBe("Education. Edited 12 Oct 2026.");
    // The legend.
    expect(host.querySelector('[data-testid="list-legend"]')!.textContent).toBe("ReadyIn progressStarted early or reopenedNot started");
  });

  it("an edit today says today, and a project with no field leaves it out", async () => {
    work = [project("a", { field: "", draftWords: 3, draftEditedAt: NOW })];
    const { host } = await render();
    expect(rows(host)[0]!.querySelector('[data-testid="project-row-meta"]')!.textContent).toBe("Edited today.");
  });

  it("finished projects come last, marked Finished, and the scratch space is the last row", async () => {
    work = [project("done", { status: "complete" }), project("open1"), project("open2")];
    const { host } = await render();
    expect(titles(host)).toEqual(["Project open1", "Project open2", "Project done"]);
    expect(rows(host)[2]!.textContent).toContain("Finished");
    expect(rows(host)[0]!.textContent).not.toContain("Finished");
    const items = [...host.querySelectorAll('[role="list"] > li')];
    expect(items[items.length - 1]!.getAttribute("data-testid")).toBe("scratch-row");
    const scratch = host.querySelector<HTMLAnchorElement>('[data-testid="scratch-space"]')!;
    expect(scratch.textContent).toContain("Documents not in a project");
    expect(scratch.getAttribute("href")).toBe("/p/scratch1/writing");
    await act(async () => { scratch.click(); });
    expect((h.ws as { openProject: ReturnType<typeof vi.fn> }).openProject).toHaveBeenCalledWith(null);
    const open = rows(host)[0]!.querySelector<HTMLAnchorElement>('[data-testid="project-open"]')!;
    expect(open.getAttribute("href")).toBe("/p/open1");
    await act(async () => { open.click(); });
    expect((h.ws as { openProject: ReturnType<typeof vi.fn> }).openProject).toHaveBeenCalledWith("open1");
  });

  it("a locked vault lists the projects with Locked title and their states (Review Focus 1)", async () => {
    const v = await withVault();
    const p1 = project("s1", { title: "Sleep and exam anxiety", stageMarks: { idea: { readyAt: "2026-10-10T00:00:00.000Z" } }, blobs: [{ kind: "idea_intake", updatedAt: "2026-10-09T00:00:00.000Z", version: 1 }] });
    const p2 = project("s2", { title: "Reading habits", blobs: [{ kind: "citations", updatedAt: "2026-10-11T00:00:00.000Z", version: 1 }] });
    work = [await sealed(v, p1), await sealed(v, p2)];
    act(() => { v.lock(); });
    const { host, vault } = await render();
    expect(vault().status).toBe("locked");
    expect(titles(host)).toEqual(["Locked title", "Locked title"]);
    for (const r of rows(host)) {
      expect(r.textContent).not.toContain(work[0]!.title);
      expect(r.textContent).not.toMatch(/Untitled/i);
    }
    expect(bars(rows(host)[0]!)).toEqual(STAGE_ORDER.map((k) => stageStates(p1)[k]));
    expect(rows(host)[0]!.querySelector('[data-testid="stage-bars"]')!.getAttribute("aria-label")).toBe("Idea ready");
    expect(rows(host)[1]!.querySelector('[data-testid="stage-bars"]')!.getAttribute("aria-label")).toBe("Literature started early");
    // The delete button names the project by what is shown.
    expect(rows(host)[0]!.querySelector('[data-testid="project-delete"]')!.getAttribute("aria-label")).toBe("Delete Locked title");
    expect(host.querySelector('[data-testid="list-vault-line"]')!.textContent).toBe("Titles are locked. Enter your passphrase to see them.");

    // Unlock asks for the passphrase; then the titles open and the line says so.
    h.ask.mockResolvedValue(PASS);
    await act(async () => { host.querySelector<HTMLButtonElement>('[data-testid="list-unlock"]')!.click(); });
    await until(() => titles(host)[0] === "Sleep and exam anxiety");
    expect(titles(host)).toEqual(["Sleep and exam anxiety", "Reading habits"]);
    expect(host.querySelector('[data-testid="list-vault-line"]')!.textContent).toBe("Unlocked. Titles are locked to you.");
    expect(host.querySelector('[data-testid="list-unlock"]')).toBeNull();
  });

  it("New project opens first run", async () => {
    const { host } = await render();
    const a = host.querySelector<HTMLAnchorElement>('[data-testid="new-project"]')!;
    expect(a.textContent).toBe("New project");
    expect(a.getAttribute("href")).toBe("/start");
    expect(host.querySelector('[data-testid="projects-empty"]')!.textContent).toBe("No projects yet.");
  });

  it("delete asks first, names the project, then deletes it and reads the list again", async () => {
    work = [project("a"), project("b")];
    const { host } = await render();
    const del = rows(host)[0]!.querySelector<HTMLButtonElement>('[data-testid="project-delete"]')!;
    expect(del.getAttribute("aria-label")).toBe("Delete Project a");
    await act(async () => { del.click(); });
    await until(() => !!document.querySelector('[data-testid="project-delete-confirm"]'));
    expect(document.querySelector('[data-testid="project-delete-confirm"]')!.textContent).toContain("Project a");
    h.api.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/projects/a" && init?.method === "DELETE") { work = [project("b")]; return Promise.resolve({}); }
      if (path === "/me/vault") return Promise.reject(new ApiError(404, "not-found"));
      if (path === "/projects?include=work") return Promise.resolve(work);
      return Promise.reject(new ApiError(404, "not-found"));
    });
    await act(async () => { document.querySelector<HTMLButtonElement>('[data-testid="project-delete-yes"]')!.click(); });
    await until(() => rows(host).length === 1);
    expect(titles(host)).toEqual(["Project b"]);
  });
});
