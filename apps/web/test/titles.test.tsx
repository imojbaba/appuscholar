// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { generateVaultKey, sealVaultCheck, wrapWithPassphrase } from "../lib/vault/crypto";
import { forgetRemembered } from "../lib/vault/remember";

const h = vi.hoisted(() => ({ api: vi.fn(), ask: vi.fn(), toast: vi.fn() }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiFetch: h.api }));
vi.mock("@/lib/settings", () => ({ useSettings: () => ({ me: { id: "u1", scratchProjectId: "scratch" } }) }));
vi.mock("@/components/workspace/dialogs/Passphrase", async () => (await import("./support/passphraseMock")).passphraseMock(h.ask));
vi.mock("@/components/ui/toast", () => ({ toast: h.toast }));

import { ApiError } from "../lib/api";
import { newDocumentBody } from "../lib/useAutosave";
import { useVault, VaultProvider, type VaultValue, type WrappedDek } from "../lib/vault/useVault";
import { newProjectKeyId, openTitle, projectKeyId, sealPlainTitles, sealTitle, useTitle, type Titled } from "../lib/vault/titles";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The api's sealed-title shape (routes/docWrite.ts CIPHERTEXT). */
const CIPHERTEXT = /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/;

type Row = Titled & { projectId?: string; deletedAt?: string | null };
let server: { vault: Record<string, unknown> | null; projects: Row[]; docs: Row[]; bodies: string[] };
let record: Record<string, unknown>;

/**
 * The title rules of the api (routes/docWrite.ts checkTitle): a sealed title has the ciphertext shape and its version is one of the entity's
 * deks once `dek` is added; another wrap for a known version is 409 dek-exists; a plain title (no titleKeyVersion) is key version 0.
 */
function applyTitle(row: Row, b: { title: string; titleKeyVersion?: number; dek?: WrappedDek }) {
  const v = b.titleKeyVersion ?? 0;
  if (b.dek && row.deks.some((k) => k.v === b.dek!.v && k.wrapped !== b.dek!.wrapped)) throw new ApiError(409, "dek-exists");
  const deks = b.dek && !row.deks.some((k) => k.v === b.dek!.v) ? [...row.deks, b.dek] : row.deks;
  if (v > 0 && (!CIPHERTEXT.test(b.title) || !deks.some((k) => k.v === v))) throw new ApiError(400, "unknown-key-version");
  Object.assign(row, { title: b.title, titleKeyVersion: v, deks });
}

let next = 0;
function fakeApi(path: string, init: RequestInit = {}): Promise<unknown> {
  const method = init.method ?? "GET";
  if (init.body) server.bodies.push(String(init.body));
  const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
  const copy = (r: Row) => ({ ...r, deks: [...r.deks] });
  try {
    if (path === "/me/vault" && method === "GET") return server.vault ? Promise.resolve({ ...server.vault }) : Promise.reject(new ApiError(404, "no-vault"));
    if (path === "/projects" && method === "GET") return Promise.resolve(server.projects.filter((p) => p.id !== "scratch").map(copy));
    if (path === "/projects" && method === "POST") {
      const p: Row = { id: "p" + ++next, title: "", titleKeyVersion: 0, deks: [] };
      applyTitle(p, body as { title: string });
      server.projects.push(p);
      return Promise.resolve(copy(p));
    }
    let m = /^\/projects\/([^/]+)$/.exec(path);
    if (m && method === "PATCH") { const p = server.projects.find((x) => x.id === m![1])!; applyTitle(p, body as { title: string }); return Promise.resolve(copy(p)); }
    m = /^\/projects\/([^/]+)\/documents(?:\?includeDeleted=1)?$/.exec(path);
    if (m && method === "GET") return Promise.resolve(server.docs.filter((d) => d.projectId === m![1]).map(copy));
    if (m && method === "POST") {
      // The body's dek is the document's only one: a sealed title must be under it.
      const d: Row = { id: "d" + ++next, projectId: m[1], title: "", titleKeyVersion: 0, deks: body.dek ? [body.dek as WrappedDek] : [] };
      applyTitle(d, { title: body.title as string, titleKeyVersion: body.titleKeyVersion as number | undefined });
      server.docs.push(d);
      return Promise.resolve(copy(d));
    }
    m = /^\/documents\/([^/]+)$/.exec(path);
    if (m && method === "PATCH") { const d = server.docs.find((x) => x.id === m![1])!; applyTitle(d, body as { title: string }); return Promise.resolve(copy(d)); }
  } catch (e) { return Promise.reject(e); }
  return Promise.reject(new ApiError(404, "not-found"));
}

const roots: Root[] = [];
/** The vault, and a list of titles shown through useTitle. */
async function mount(items: { t: Titled; kind: "project" | "document" }[] = []) {
  const box: { v: VaultValue | null; items: typeof items } = { v: null, items };
  function Probe() { box.v = useVault(); return null; }
  function Shown({ t, kind }: { t: Titled; kind: "project" | "document" }) { const s = useTitle(t, kind); return <li data-state={s.state}>{s.text}</li>; }
  const el = document.createElement("div");
  const root = createRoot(el);
  roots.push(root);
  const render = () => root.render(<VaultProvider><Probe /><ul>{box.items.map((x) => <Shown key={x.t.id + x.t.title} t={x.t} kind={x.kind} />)}</ul></VaultProvider>);
  await act(async () => { render(); });
  return {
    get v(): VaultValue { return box.v!; },
    shown: () => Array.from(el.querySelectorAll("li")).map((li) => li.textContent),
    show: async (list: typeof items) => { box.items = list; await act(async () => { render(); }); }
  };
}
async function until(pred: () => boolean) {
  for (let i = 0; i < 400; i++) { if (pred()) return; await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); }
  throw new Error("condition not reached");
}
async function unlocked() {
  const s = await mount();
  await until(() => s.v.status === "locked");
  await act(async () => { await s.v.unlock("pw", false); });
  return s;
}
const titledProject = (id: string): Titled => { const p = server.projects.find((x) => x.id === id)!; return { id: p.id, title: p.title, titleKeyVersion: p.titleKeyVersion, deks: [...p.deks] }; };
const titledDoc = (id: string): Titled => { const d = server.docs.find((x) => x.id === id)!; return { id: d.id, title: d.title, titleKeyVersion: d.titleKeyVersion, deks: [...d.deks] }; };
/** sealPlainTitles against the fake api, as the workspace runs it. */
const pass = (vault: VaultValue) => sealPlainTitles({
  vault,
  listProjects: () => h.api("/projects") as Promise<Titled[]>,
  listDocuments: (id) => h.api(`/projects/${id}/documents?includeDeleted=1`) as Promise<Titled[]>,
  patchProject: async (id, body) => { await h.api(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(body) }); },
  patchDocument: async (id, body) => { await h.api(`/documents/${id}`, { method: "PATCH", body: JSON.stringify(body) }); },
  scratchId: "scratch"
});

beforeAll(async () => {
  // One complete vault record for every test (PBKDF2 is slow); a public key, so no keypair is added on unlock.
  const vk = await generateVaultKey();
  record = { passWrapped: await wrapWithPassphrase(vk, "pw"), recoveryWrapped: "x.y.z", checkWrapped: await sealVaultCheck(vk), publicKey: "pk", privateKeyWrapped: "w", complete: true, updatedAt: "2026-10-21T10:00:00.000Z" };
});
beforeEach(async () => {
  server = { vault: { ...record }, projects: [], docs: [], bodies: [] };
  next = 0;
  h.api.mockReset().mockImplementation(fakeApi);
  h.ask.mockReset();
  h.toast.mockReset();
  await forgetRemembered("u1");
});
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); });

describe("titles in the vault", () => {
  it("with the vault off a title is sent and shown as typed", async () => {
    server.vault = null;
    const s = await mount();
    await until(() => s.v.status === "off");
    const made = await sealTitle(s.v, newProjectKeyId(), [], "Sleep and exam anxiety");
    expect(made).toEqual({ title: "Sleep and exam anxiety", titleKeyVersion: 0 });
    expect(await newDocumentBody(s.v, "Chapter one")).toEqual({ keyVersion: 0, title: "Chapter one", titleKeyVersion: 0 });
    await s.show([{ t: { id: "p1", ...made, deks: [] }, kind: "project" }]);
    expect(s.shown()).toEqual(["Sleep and exam anxiety"]);
  });

  it("a sealed title opens to the typed text and the api only ever receives ciphertext", async () => {
    const s = await unlocked();
    const p = (await h.api("/projects", { method: "POST", body: JSON.stringify(await sealTitle(s.v, newProjectKeyId(), [], "Sleep and exam anxiety")) })) as Titled;
    const d = (await h.api(`/projects/${p.id}/documents`, { method: "POST", body: JSON.stringify(await newDocumentBody(s.v, "Chapter one")) })) as Titled;
    expect(p.titleKeyVersion).toBe(1);
    expect(p.title).toMatch(CIPHERTEXT);
    expect(d.titleKeyVersion).toBe(1);
    // One dek per document: the title is under the body's.
    expect(titledDoc(d.id).deks).toHaveLength(1);
    await s.show([{ t: titledProject(p.id), kind: "project" }, { t: titledDoc(d.id), kind: "document" }]);
    await until(() => s.shown().every((x) => x !== "Locked title"));
    expect(s.shown()).toEqual(["Sleep and exam anxiety", "Chapter one"]);
    expect(server.bodies.join("\n")).not.toContain("Sleep and exam anxiety");
    expect(server.bodies.join("\n")).not.toContain("Chapter one");
  });

  // Ruling R12: sealed under "project:new:<uuid>" (no id yet), posted with its dek, opened under "project:<id>": the vault binds no id into
  // the ciphertext, and the dek cache keyed by the temporary id does not get in the way, in this session or after a lock and unlock.
  it("a new project's title sealed under a placeholder key id opens under its real id, also after a lock and unlock", async () => {
    const s = await unlocked();
    const sealed = await sealTitle(s.v, newProjectKeyId(), [], "Sleep and exam anxiety");
    expect(sealed.dek).toMatchObject({ v: 1 });
    const p = (await h.api("/projects", { method: "POST", body: JSON.stringify(sealed) })) as Titled;
    expect(await openTitle(s.v, titledProject(p.id), projectKeyId(p.id))).toEqual({ state: "open", text: "Sleep and exam anxiety" });
    await act(async () => { s.v.lock(); });
    expect(await openTitle(s.v, titledProject(p.id), projectKeyId(p.id))).toEqual({ state: "locked" });
    await act(async () => { await s.v.unlock("pw", false); });
    expect(await openTitle(s.v, titledProject(p.id), projectKeyId(p.id))).toEqual({ state: "open", text: "Sleep and exam anxiety" });
    // A rename seals under the project's stored key (no new dek).
    const renamed = await sealTitle(s.v, projectKeyId(p.id), titledProject(p.id).deks, "Sleep, memory and exams");
    expect(renamed.dek).toBeUndefined();
    await h.api(`/projects/${p.id}`, { method: "PATCH", body: JSON.stringify(renamed) });
    expect(await openTitle(s.v, titledProject(p.id), projectKeyId(p.id))).toEqual({ state: "open", text: "Sleep, memory and exams" });
  });

  it("a 200-character Hindi title seals and opens", async () => {
    const s = await unlocked();
    const hindi = "नींद और परीक्षा की चिंता पर एक अध्ययन ".repeat(6).slice(0, 200);
    expect(hindi).toHaveLength(200);
    const d = (await h.api("/projects/p0/documents", { method: "POST", body: JSON.stringify(await newDocumentBody(s.v, hindi)) })) as Titled;
    const stored = titledDoc(d.id);
    // Within the api's limit for a sealed title.
    expect(stored.title.length).toBeLessThanOrEqual(4096);
    expect(await openTitle(s.v, stored, d.id)).toEqual({ state: "open", text: hindi });
  });

  it("a locked vault shows Locked title, never ciphertext (Review Focus 1)", async () => {
    const s = await unlocked();
    const p = (await h.api("/projects", { method: "POST", body: JSON.stringify(await sealTitle(s.v, newProjectKeyId(), [], "Sleep and exam anxiety")) })) as Titled;
    const d = (await h.api(`/projects/${p.id}/documents`, { method: "POST", body: JSON.stringify(await newDocumentBody(s.v, "Chapter one")) })) as Titled;
    await s.show([{ t: titledProject(p.id), kind: "project" }, { t: titledDoc(d.id), kind: "document" }]);
    await until(() => s.shown()[0] === "Sleep and exam anxiety");
    await act(async () => { s.v.lock(); });
    expect(s.shown()).toEqual(["Locked title", "Locked title"]);
    // A tab opened while the passphrase prompt is cancelled: still locked, and nothing opened earlier is shown.
    const again = await mount([{ t: titledProject(p.id), kind: "project" }, { t: titledDoc(d.id), kind: "document" }]);
    await until(() => again.v.status === "locked");
    expect(again.shown()).toEqual(["Locked title", "Locked title"]);
    for (const text of [...s.shown(), ...again.shown()]) expect(text).not.toMatch(/[A-Za-z0-9_-]{16}\./);
  });

  it("a title under an unknown key shows This title cannot be opened", async () => {
    const s = await unlocked();
    const d = (await h.api("/projects/p0/documents", { method: "POST", body: JSON.stringify(await newDocumentBody(s.v, "Chapter one")) })) as Titled;
    const stored = titledDoc(d.id);
    await s.show([
      { t: { ...stored, titleKeyVersion: 2 }, kind: "document" },
      // A key that is not this vault's (wrapped elsewhere) does not open either.
      { t: { ...stored, id: "d-other", deks: [{ v: 1, wrapped: "AAAAAAAAAAAAAAAA.AAAA" }] }, kind: "document" }
    ]);
    await until(() => s.shown().every((x) => x !== "Locked title"));
    expect(s.shown()).toEqual(["This title cannot be opened", "This title cannot be opened"]);
  });

  it("sealPlainTitles seals every plain project and document title once; a second run patches nothing", async () => {
    server.projects.push({ id: "pa", title: "Sleep and exam anxiety", titleKeyVersion: 0, deks: [] }, { id: "scratch", title: "Scratch space", titleKeyVersion: 0, deks: [] });
    const s = await unlocked();
    // Documents as the vault migration left them: sealed bodies under their first dek, plain titles.
    for (const [projectId, title] of [["pa", "Chapter one"], ["scratch", "Loose notes"]] as const) {
      const body = (await newDocumentBody(s.v))!;
      server.docs.push({ id: "d-" + projectId, projectId, title, titleKeyVersion: 0, deks: [body.dek!] });
    }
    // A soft-deleted document is listed (includeDeleted=1) but left alone: PATCH cannot reach it until it is brought back.
    server.docs.push({ id: "d-gone", projectId: "pa", title: "Deleted draft", titleKeyVersion: 0, deks: server.docs[0]!.deks, deletedAt: "2026-10-20T10:00:00.000Z" });
    server.bodies = [];
    expect(await pass(s.v)).toEqual({ sealed: 3 });
    expect(server.docs.find((d) => d.id === "d-gone")).toMatchObject({ title: "Deleted draft", titleKeyVersion: 0 });
    expect(server.projects.find((p) => p.id === "scratch")).toMatchObject({ title: "Scratch space", titleKeyVersion: 0 });
    expect(await openTitle(s.v, titledProject("pa"), projectKeyId("pa"))).toEqual({ state: "open", text: "Sleep and exam anxiety" });
    expect(await openTitle(s.v, titledDoc("d-pa"), "d-pa")).toEqual({ state: "open", text: "Chapter one" });
    expect(await openTitle(s.v, titledDoc("d-scratch"), "d-scratch")).toEqual({ state: "open", text: "Loose notes" });
    // A document's title is sealed under its own dek: none is added.
    expect(titledDoc("d-pa").deks).toHaveLength(1);
    expect(server.bodies.join("\n")).not.toMatch(/Sleep and exam anxiety|Chapter one|Loose notes/);
    const patches = () => h.api.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "PATCH").length;
    const before = patches();
    expect(await pass(s.v)).toEqual({ sealed: 0 });
    expect(patches()).toBe(before);
    // Locked, or a vault not yet complete: it does not run.
    expect(await sealPlainTitles({ vault: { ...s.v, status: "locked" }, listProjects: async () => { throw new Error("listed"); }, listDocuments: async () => [], patchProject: async () => {}, patchDocument: async () => {} })).toEqual({ sealed: 0 });
    expect(await sealPlainTitles({ vault: { ...s.v, complete: false }, listProjects: async () => { throw new Error("listed"); }, listDocuments: async () => [], patchProject: async () => {}, patchDocument: async () => {} })).toEqual({ sealed: 0 });
  });

  it("a plain title written later by an older tab is sealed on the next pass (Review Focus 2)", async () => {
    const s = await unlocked();
    const p = (await h.api("/projects", { method: "POST", body: JSON.stringify(await sealTitle(s.v, newProjectKeyId(), [], "Sleep and exam anxiety")) })) as Titled;
    const d = (await h.api(`/projects/${p.id}/documents`, { method: "POST", body: JSON.stringify(await newDocumentBody(s.v, "Chapter one")) })) as Titled;
    // A tab on the fix-wave-a build renames both and creates a document: plain titles, no titleKeyVersion.
    await h.api(`/projects/${p.id}`, { method: "PATCH", body: JSON.stringify({ title: "Exam stress" }) });
    await h.api(`/documents/${d.id}`, { method: "PATCH", body: JSON.stringify({ title: "Chapter 1" }) });
    server.docs.push({ id: "old", projectId: p.id, title: "From the old tab", titleKeyVersion: 0, deks: titledDoc(d.id).deks });
    // Accepted, and shown as it is by this build.
    await s.show([{ t: titledProject(p.id), kind: "project" }, { t: titledDoc(d.id), kind: "document" }, { t: titledDoc("old"), kind: "document" }]);
    expect(s.shown()).toEqual(["Exam stress", "Chapter 1", "From the old tab"]);
    expect(await pass(s.v)).toEqual({ sealed: 3 });
    expect([titledProject(p.id), titledDoc(d.id), titledDoc("old")].map((x) => x.titleKeyVersion)).toEqual([1, 1, 1]);
    // The project already had its key: the plain rename kept it, and the new seal reuses it.
    expect(titledProject(p.id).deks).toHaveLength(1);
    await s.show([{ t: titledProject(p.id), kind: "project" }, { t: titledDoc(d.id), kind: "document" }, { t: titledDoc("old"), kind: "document" }]);
    await until(() => s.shown().every((x) => x !== "Locked title"));
    expect(s.shown()).toEqual(["Exam stress", "Chapter 1", "From the old tab"]);
  });
});
