import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SignJWT } from "jose";
import { createApp } from "../src/app";
import { MemoryStore } from "../src/store/memory";

const SECRET = "test-secret-test-secret-test-secret-1234";
const key = new TextEncoder().encode(SECRET);
const VAULT = { passWrapped: "s.i.c", recoveryWrapped: "s.i.r", checkWrapped: "i.chk", publicKey: "pk", privateKeyWrapped: "i.p" };
/** A body in the shape the browser seals (16-character IV "." ciphertext, base64url): the api checks the shape, never the content. */
const ct = (tag: string, len = 0) => { const [iv, rest] = tag.split("."); return iv!.padEnd(16, "A") + "." + rest!.padEnd(len - 17, "B"); };
const STATS = { typed: 2, ai: 0, passages: 0, kept: 0, edited: 0, unknown: 0 };
const DEK1 = { v: 1, wrapped: "i.k1" }, DEK2 = { v: 2, wrapped: "i.k2" };

async function token(sub: string, ttl = 900) {
  return new SignJWT({ email: sub + "@x.org" }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1000) + ttl).sign(key);
}

describe("project routes (wave B)", () => {
  let store: MemoryStore;
  let app: ReturnType<typeof createApp>;
  let tokens: Record<string, string>;
  beforeEach(async () => {
    store = new MemoryStore();
    app = createApp({ store, jwtSecret: SECRET, maxBodyBytes: 64 * 1024 });
    tokens = { u1: await token("u1"), u2: await token("u2") };
  });
  afterEach(() => { vi.useRealTimers(); });
  const as = (u: string, method: string, path: string, body?: unknown) =>
    app.request(path, { method, headers: { authorization: "Bearer " + tokens[u], "content-type": "application/json" }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  const req = (method: string, path: string, body?: unknown) => as("u1", method, path, body);
  const post = (path: string, body?: unknown) => req("POST", path, body);
  const json = async <T = any>(r: Response) => (await r.json()) as T; // eslint-disable-line @typescript-eslint/no-explicit-any
  const project = async (body: unknown = { title: "Sleep" }) => (await json<{ id: string }>(await post("/projects", body))).id;
  const sealedDoc = async (pid: string, title: unknown = { title: ct("tA.tB"), titleKeyVersion: 1 }) =>
    req("POST", `/projects/${pid}/documents`, { ...(title as object), bodyHtml: ct("bA.bB"), keyVersion: 1, wordCount: 2, originStats: STATS, dek: DEK1 });

  it("a study is made with its type and field (start-a-study spec), returned on read and in the list, and both can be changed", async () => {
    const r = await post("/projects", { title: "Sleep", type: "masters", field: " psychology " });
    expect(r.status).toBe(201);
    const made = await json(r);
    expect(made).toMatchObject({ title: "Sleep", type: "masters", field: "psychology" });
    expect((await json<Array<{ id: string; type: string; field: string }>>(await req("GET", "/projects"))).find((p) => p.id === made.id)).toMatchObject({ type: "masters", field: "psychology" });
    const changed = await json(await req("PATCH", `/projects/${made.id}`, { type: "phd", field: "Public health in rural Bihar" }));
    expect(changed).toMatchObject({ type: "phd", field: "Public health in rural Bihar" });
  });

  it("a study made without a type or field has neither (null), not a default field", async () => {
    expect(await json(await post("/projects", { title: "Old style" }))).toMatchObject({ type: null, field: null });
  });

  it("refuses a type outside the six, and an empty or over-long field", async () => {
    expect((await post("/projects", { title: "S", type: "postdoc" })).status).toBe(400);
    expect((await post("/projects", { title: "S", field: "   " })).status).toBe(400);
    expect((await post("/projects", { title: "S", field: "x".repeat(61) })).status).toBe(400);
    const id = await project();
    expect((await req("PATCH", `/projects/${id}`, { type: "postdoc" })).status).toBe(400);
  });

  it("ai-use/claim attaches the first run's idea check, logged before the project existed, to the new project", async () => {
    const check = { d: "2026-10-21", p: "openai", m: "gpt-4o-mini", k: "checking whether my project idea is realistic", g: "feedback" } as const;
    await store.appendAiUse("u1", null, check);
    const id = await project();
    // The client says how long ago its first check began, so a device clock that is off never decides which rows are claimed.
    const r = await post(`/projects/${id}/ai-use/claim`, { secondsAgo: 5 });
    expect(r.status).toBe(200);
    expect(await json(r)).toEqual({ claimed: 1 });
    expect(await store.listAiUse("u1", undefined, undefined, id)).toEqual([check]);
  });

  it("ai-use/claim refuses another user's project, a bad body and more than a day back", async () => {
    const id = await project();
    expect((await as("u2", "POST", `/projects/${id}/ai-use/claim`, { secondsAgo: 5 })).status).toBe(404);
    expect((await post(`/projects/${id}/ai-use/claim`, { secondsAgo: "five" })).status).toBe(400);
    expect((await post(`/projects/${id}/ai-use/claim`, { secondsAgo: -1 })).status).toBe(400);
    expect((await post(`/projects/${id}/ai-use/claim`, { secondsAgo: 25 * 3600 })).status).toBe(400);
  });

  it("include=work answers each project's blobs and draft words", async () => {
    const id = await project();
    const d = await json<{ id: string }>(await post(`/projects/${id}/documents`, { title: "Draft" }));
    await req("PUT", `/documents/${d.id}`, { bodyHtml: "<p>one two three</p>" });
    await req("PUT", `/projects/${id}/blobs/citations`, { body: "[]", keyVersion: 0 });
    await req("PUT", `/projects/${id}/blobs/citations`, { body: "[1]", keyVersion: 0 });
    const r = await req("GET", "/projects?include=work");
    expect(r.status).toBe(200);
    const [w] = await json<Array<Record<string, unknown>>>(r);
    expect(w).toMatchObject({ id, title: "Sleep", stageMarks: {}, deks: [], titleKeyVersion: 0, draftWords: 3, draftEditedAt: expect.any(String) });
    expect(w!.blobs).toEqual([{ kind: "citations", updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/), version: 2 }]);
    // Without include the list is as before, plus the new fields, and no work.
    const [plain] = await json<Array<Record<string, unknown>>>(await req("GET", "/projects"));
    expect(plain).toMatchObject({ id, documentCount: 1, stageMarks: {}, deks: [], titleKeyVersion: 0 });
    expect(plain).not.toHaveProperty("blobs");
    expect(await json(await as("u2", "GET", "/projects?include=work"))).toEqual([]);
  });

  it("Ready is stamped with the server's clock (Review Focus 5)", async () => {
    const id = await project();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-21T10:00:00Z"));
    // Tokens minted on the moved clock, valid for a day of it.
    tokens = { u1: await token("u1", 86_400), u2: await token("u2", 86_400) };
    const r = await post(`/projects/${id}/stages/lit/ready`, { readyAt: "2030-01-01T00:00:00Z" });
    expect(r.status).toBe(200);
    expect((await json(r)).stageMarks.lit.readyAt).toBe("2026-10-21T10:00:00.000Z");
    // No body at all, or one that is not JSON, is the same request.
    vi.setSystemTime(new Date("2026-10-21T11:00:00Z"));
    expect((await json(await post(`/projects/${id}/stages/idea/ready`))).stageMarks).toEqual({ lit: { readyAt: "2026-10-21T10:00:00.000Z" }, idea: { readyAt: "2026-10-21T11:00:00.000Z" } });
    expect((await post(`/projects/${id}/stages/writing/ready`, "not json")).status).toBe(200);
    const del = await req("DELETE", `/projects/${id}/stages/lit/ready`);
    expect(del.status).toBe(200);
    expect((await json(del)).stageMarks).toEqual({ idea: { readyAt: "2026-10-21T11:00:00.000Z" }, writing: { readyAt: "2026-10-21T11:00:00.000Z" } });
    expect((await json(await req("GET", "/projects?include=work")))[0].stageMarks.idea).toEqual({ readyAt: "2026-10-21T11:00:00.000Z" });
    // Another user's project, or a missing one, is 404.
    expect((await as("u2", "POST", `/projects/${id}/stages/lit/ready`)).status).toBe(404);
    expect((await as("u2", "DELETE", `/projects/${id}/stages/idea/ready`)).status).toBe(404);
    expect((await post(`/projects/nope/stages/lit/ready`)).status).toBe(404);
  });

  it("an unknown stage is 400 invalid", async () => {
    const id = await project();
    for (const s of ["nope", "LIT", "stage", "lit2"]) {
      for (const m of ["POST", "DELETE"]) {
        const r = await req(m, `/projects/${id}/stages/${s}/ready`);
        expect(r.status, `${m} ${s}`).toBe(400);
        expect(await json(r)).toEqual({ error: "invalid" });
      }
    }
  });

  it("a sealed project title of 820 characters is accepted; a plain one of 201 is 400", async () => {
    const long = ct("tA.tB", 820);
    expect(long).toHaveLength(820);
    const r = await post("/projects", { title: long, titleKeyVersion: 1, dek: DEK1 });
    expect(r.status).toBe(201);
    expect(await json(r)).toMatchObject({ title: long, titleKeyVersion: 1, deks: [DEK1] });
    expect((await post("/projects", { title: "x".repeat(201) })).status).toBe(400);
    expect((await post("/projects", { title: "x".repeat(200) })).status).toBe(201);
    // A sealed title must have the sealed shape and stay under 4096 characters; a plain title that claims a key version is not plain.
    expect((await post("/projects", { title: "Sleep", titleKeyVersion: 1, dek: DEK1 })).status).toBe(400);
    expect((await post("/projects", { title: ct("tA.tB", 4097), titleKeyVersion: 1, dek: DEK1 })).status).toBe(400);
    // The same rules on PATCH, for projects and documents.
    const id = await project();
    const p = await req("PATCH", `/projects/${id}`, { title: long, titleKeyVersion: 1, dek: DEK1 });
    expect(p.status).toBe(200);
    expect(await json(p)).toMatchObject({ title: long, titleKeyVersion: 1, deks: [DEK1] });
    expect((await req("PATCH", `/projects/${id}`, { title: "x".repeat(201) })).status).toBe(400);
    const d = await json<{ id: string }>(await sealedDoc(id));
    const dp = await req("PATCH", `/documents/${d.id}`, { title: long, titleKeyVersion: 1 });
    expect(dp.status).toBe(200);
    expect(await json(dp)).toMatchObject({ title: long, titleKeyVersion: 1 });
    expect((await req("PATCH", `/documents/${d.id}`, { title: "x".repeat(201) })).status).toBe(400);
  });

  it("a sealed title with an unknown key version is 400 unknown-key-version", async () => {
    // A new project's sealed title must bring its dek.
    const noDek = await post("/projects", { title: ct("tA.tB"), titleKeyVersion: 1 });
    expect(noDek.status).toBe(400);
    expect(await json(noDek)).toEqual({ error: "unknown-key-version" });
    const id = await json<{ id: string }>(await post("/projects", { title: ct("tA.tB"), titleKeyVersion: 1, dek: DEK1 })).then((p) => p.id);
    const unknown = await req("PATCH", `/projects/${id}`, { title: ct("tC.tD"), titleKeyVersion: 2 });
    expect(unknown.status).toBe(400);
    expect(await json(unknown)).toEqual({ error: "unknown-key-version" });
    // A new key arriving with the title is accepted; another wrap for a known v is 409; a dek for another v is invalid.
    expect(await json(await req("PATCH", `/projects/${id}`, { title: ct("tC.tD"), titleKeyVersion: 2, dek: DEK2 }))).toMatchObject({ titleKeyVersion: 2, deks: [DEK1, DEK2] });
    expect((await req("PATCH", `/projects/${id}`, { title: ct("tE.tF"), titleKeyVersion: 1, dek: { v: 1, wrapped: "other" } })).status).toBe(409);
    expect((await req("PATCH", `/projects/${id}`, { title: ct("tE.tF"), titleKeyVersion: 1, dek: DEK2 })).status).toBe(400);
    // A key version or a dek never travels without its title.
    expect((await req("PATCH", `/projects/${id}`, { titleKeyVersion: 1 })).status).toBe(400);
    expect((await req("PATCH", `/projects/${id}`, { status: "complete", titleKeyVersion: 1 })).status).toBe(400);
    expect(await json(await req("GET", "/projects"))).toMatchObject([{ id, titleKeyVersion: 2, status: "active" }]);

    // Documents: the title's key must be one of the document's deks, after the body's dek is added.
    const bad = await sealedDoc(id, { title: ct("tA.tB"), titleKeyVersion: 2 });
    expect(bad.status).toBe(400);
    expect(await json(bad)).toEqual({ error: "unknown-key-version" });
    expect(await json(await req("GET", `/projects/${id}/documents`))).toEqual([]);
    const d = await json<{ id: string; titleKeyVersion: number; deks: unknown }>(await sealedDoc(id));
    expect([d.titleKeyVersion, d.deks]).toEqual([1, [DEK1]]);
    const dp = await req("PATCH", `/documents/${d.id}`, { title: ct("tC.tD"), titleKeyVersion: 2 });
    expect(dp.status).toBe(400);
    expect(await json(dp)).toEqual({ error: "unknown-key-version" });
    const put = await req("PUT", `/documents/${d.id}`, { bodyHtml: ct("bA.bB"), keyVersion: 1, wordCount: 2, originStats: STATS, title: ct("tC.tD"), titleKeyVersion: 2 });
    expect(put.status).toBe(400);
    expect(await json(put)).toEqual({ error: "unknown-key-version" });
    expect((await req("PATCH", `/documents/${d.id}`, { titleKeyVersion: 1 })).status).toBe(400);
    expect(await json(await req("GET", `/documents/${d.id}`))).toMatchObject({ title: ct("tA.tB"), titleKeyVersion: 1, currentSeq: 1 });
    // A rename that brings the new key adds it.
    expect(await json(await req("PATCH", `/documents/${d.id}`, { title: ct("tC.tD"), titleKeyVersion: 2, dek: DEK2 }))).toMatchObject({ titleKeyVersion: 2, deks: [DEK1, DEK2] });
  });

  it("PATCH ?includeDeleted=1 seals a soft-deleted document's title, and nothing else", async () => {
    const id = await project();
    await sealedDoc(id);
    const d = await json<{ id: string }>(await post(`/projects/${id}/documents`, { title: "Deleted draft", bodyHtml: ct("bA.bB"), keyVersion: 1, wordCount: 2, originStats: STATS, dek: DEK1 }));
    expect((await req("DELETE", `/documents/${d.id}`)).status).toBe(204);
    // Without the flag a deleted document answers as before.
    expect((await req("PATCH", `/documents/${d.id}`, { title: ct("tA.tB"), titleKeyVersion: 1 })).status).toBe(404);
    // A plain title with the flag is refused as before: only a sealed title reaches a deleted document.
    expect((await req("PATCH", `/documents/${d.id}?includeDeleted=1`, { title: "Renamed" })).status).toBe(404);
    expect((await req("PATCH", `/documents/${d.id}?includeDeleted=1`, { title: "Renamed", titleKeyVersion: 0 })).status).toBe(404);
    // The key rules hold for it too, and another user cannot reach it.
    expect((await req("PATCH", `/documents/${d.id}?includeDeleted=1`, { title: ct("tA.tB"), titleKeyVersion: 2 })).status).toBe(400);
    expect((await as("u2", "PATCH", `/documents/${d.id}?includeDeleted=1`, { title: ct("tA.tB"), titleKeyVersion: 1 })).status).toBe(404);
    const r = await req("PATCH", `/documents/${d.id}?includeDeleted=1`, { title: ct("tA.tB"), titleKeyVersion: 1 });
    expect(r.status).toBe(200);
    expect(await json(r)).toMatchObject({ id: d.id, title: ct("tA.tB"), titleKeyVersion: 1 });
    // Renamed, still deleted.
    expect((await req("GET", `/documents/${d.id}`)).status).toBe(404);
    expect(await json(await req("GET", `/projects/${id}/documents?includeDeleted=1`))).toEqual(expect.arrayContaining([expect.objectContaining({ id: d.id, title: ct("tA.tB"), titleKeyVersion: 1 })]));
    // On a live document the flag changes nothing.
    const live = await json<{ id: string }>(await sealedDoc(id));
    expect(await json(await req("PATCH", `/documents/${live.id}?includeDeleted=1`, { title: "Plain" }))).toMatchObject({ title: "Plain", titleKeyVersion: 0 });
  });

  it("a PUT that changes only the title's key version renames the document", async () => {
    const id = await project();
    const d = await json<{ id: string }>(await sealedDoc(id));
    expect((await post(`/documents/${d.id}/deks`, DEK2)).status).toBe(200);
    const body = { bodyHtml: ct("bA.bB"), keyVersion: 1, wordCount: 2, originStats: STATS };
    // The same title text under a new key version (a re-seal under v2): the body is unchanged, so no revision, but the title moves.
    const r = await req("PUT", `/documents/${d.id}`, { ...body, title: ct("tA.tB"), titleKeyVersion: 2 });
    expect(r.status).toBe(200);
    const out = await json(r);
    expect(out.created).toBe(false);
    expect(out.document).toMatchObject({ title: ct("tA.tB"), titleKeyVersion: 2 });
    expect(await json(await req("GET", `/documents/${d.id}`))).toMatchObject({ title: ct("tA.tB"), titleKeyVersion: 2, currentSeq: 1 });
    // A title whose key arrives with the body's new dek, in the same PUT.
    const v3 = { v: 3, wrapped: "i.k3" };
    const r3 = await json(await req("PUT", `/documents/${d.id}`, { bodyHtml: ct("bC.bD"), keyVersion: 3, wordCount: 2, originStats: STATS, dek: v3, title: ct("tA.tB"), titleKeyVersion: 3 }));
    expect(r3.document).toMatchObject({ titleKeyVersion: 3, deks: [DEK1, DEK2, v3] });
    // A PUT with no title leaves the title alone.
    expect((await json(await req("PUT", `/documents/${d.id}`, { ...body }))).document).toMatchObject({ title: ct("tA.tB"), titleKeyVersion: 3 });
  });

  it("a plain title from a tab that sends no titleKeyVersion is still accepted on a vault account", async () => {
    const id = await project({ title: ct("tA.tB"), titleKeyVersion: 1, dek: DEK1 });
    await req("PUT", "/me/vault", VAULT);
    // Create (with stage, as the fix-wave-a web sends it), rename and document titles, all plain.
    const p = await post("/projects", { title: "Memory", stage: "lit" });
    expect(p.status).toBe(201);
    expect(await json(p)).toMatchObject({ title: "Memory", stage: "lit", titleKeyVersion: 0 });
    const r = await req("PATCH", `/projects/${id}`, { title: "  Sleep  " });
    expect(r.status).toBe(200);
    expect(await json(r)).toMatchObject({ title: "Sleep", titleKeyVersion: 0, deks: [DEK1] });
    const d = await sealedDoc(id, { title: "Draft" });
    expect(d.status).toBe(201);
    const doc = await json<{ id: string }>(d);
    expect(doc).toMatchObject({ title: "Draft", titleKeyVersion: 0 });
    const put = await req("PUT", `/documents/${doc.id}`, { bodyHtml: ct("bA.bB"), keyVersion: 1, wordCount: 2, originStats: STATS, title: "Chapter one" });
    expect((await json(put)).document).toMatchObject({ title: "Chapter one", titleKeyVersion: 0 });
    expect(await json(await req("PATCH", `/documents/${doc.id}`, { title: "Chapter two", titleKeyVersion: 0 }))).toMatchObject({ title: "Chapter two", titleKeyVersion: 0 });
  });

  it("a plain title that looks like ciphertext is refused on every route, so an old tab's unchanged Rename never stores a sealed title as plain", async () => {
    const id = await project({ title: ct("tA.tB"), titleKeyVersion: 1, dek: DEK1 });
    await req("PUT", "/me/vault", VAULT);
    const sealed = await json<{ id: string }>(await sealedDoc(id));
    const looks = ct("tA.tB");
    const refused = [
      await post("/projects", { title: looks, stage: "lit" }),
      await post("/projects", { title: looks, titleKeyVersion: 0 }),
      await req("PATCH", `/projects/${id}`, { title: looks }),
      await sealedDoc(id, { title: looks }),
      await req("PUT", `/documents/${sealed.id}`, { bodyHtml: ct("bA.bB"), keyVersion: 1, wordCount: 2, originStats: STATS, title: looks }),
      await req("PATCH", `/documents/${sealed.id}`, { title: looks }),
      await req("PATCH", `/documents/${sealed.id}`, { title: "  " + looks + "  ", titleKeyVersion: 0 })
    ];
    for (const r of refused) { expect(r.status).toBe(400); expect(await json(r)).toEqual({ error: "invalid" }); }
    // Nothing was written: the sealed titles stand, and a normal plain title is still accepted.
    expect(await json(await req("GET", `/documents/${sealed.id}`))).toMatchObject({ title: looks, titleKeyVersion: 1 });
    expect(await json(await req("PATCH", `/projects/${id}`, { title: "Sleep. Memory" }))).toMatchObject({ title: "Sleep. Memory", titleKeyVersion: 0 });
    expect(await json(await req("PATCH", `/documents/${sealed.id}`, { title: "Chapter one" }))).toMatchObject({ title: "Chapter one", titleKeyVersion: 0 });
  });

  it("writing-record items carry id, titleKeyVersion and deks", async () => {
    const id = await project();
    const d = await json<{ id: string }>(await sealedDoc(id));
    const s = await json<{ id: string }>(await sealedDoc(id, { title: "Paper" }));
    await req("PATCH", `/documents/${s.id}`, { kind: "source" });
    const rec = await json(await req("GET", `/projects/${id}/writing-record`));
    expect(rec.docs).toEqual([{ id: d.id, title: ct("tA.tB"), titleKeyVersion: 1, deks: [DEK1], kind: "draft", stats: STATS }]);
    expect(rec.sources).toEqual([{ id: s.id, title: "Paper", titleKeyVersion: 0, deks: [DEK1], words: 2 }]);
  });
});
