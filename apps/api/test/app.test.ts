import { describe, it, expect, beforeEach, vi } from "vitest";
import { SignJWT } from "jose";
import { createApp } from "../src/app";
import { MemoryStore } from "../src/store/memory";
import { AP_STAGES, apBuild, buildAskPrompt, buildHelperPrompt, buildLessonAskPrompt, buildWalkPrompt } from "@appuscholar/core";

const SECRET = "test-secret-test-secret-test-secret-1234";
const key = new TextEncoder().encode(SECRET);
async function token(sub: string, ttl = 900) {
  return new SignJWT({ email: sub + "@x.org" }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1000) + ttl).sign(key);
}

describe("api routes", () => {
  let app: ReturnType<typeof createApp>;
  let auth: Record<string, string>;
  beforeEach(async () => {
    app = createApp({ store: new MemoryStore(), jwtSecret: SECRET, maxBodyBytes: 2 * 1024 * 1024 });
    auth = { authorization: "Bearer " + (await token("u1")), "content-type": "application/json" };
  });

  it("health is public", async () => {
    const r = await app.request("/health");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });

  it("CORS preflight allows If-Match", async () => {
    const r = await app.request("/projects/p/blobs/citations", { method: "OPTIONS", headers: { origin: "https://app.example", "access-control-request-method": "PUT", "access-control-request-headers": "authorization, content-type, if-match" } });
    expect(r.status).toBe(204);
    const allowed = (r.headers.get("access-control-allow-headers") ?? "").toLowerCase().split(",").map((h) => h.trim());
    expect(allowed).toEqual(expect.arrayContaining(["authorization", "content-type", "if-match"]));
  });

  it("rejects missing and expired tokens with 401", async () => {
    expect((await app.request("/projects")).status).toBe(401);
    const expired = await token("u1", -10);
    const r = await app.request("/projects", { headers: { authorization: "Bearer " + expired } });
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: "unauthorized" });
  });

  async function makeDoc() {
    const p = await (await app.request("/projects", { method: "POST", headers: auth, body: JSON.stringify({ title: "Sleep" }) })).json() as { id: string };
    const d = await (await app.request(`/projects/${p.id}/documents`, { method: "POST", headers: auth, body: JSON.stringify({ title: "Draft" }) })).json() as { id: string; currentSeq: number };
    return { p, d };
  }

  it("marks a document as a source and back", async () => {
    const { d } = await makeDoc();
    const r = await app.request(`/documents/${d.id}`, { method: "PATCH", headers: auth, body: JSON.stringify({ kind: "source" }) });
    expect(((await r.json()) as { kind: string }).kind).toBe("source");
    expect((await app.request(`/documents/${d.id}`, { method: "PATCH", headers: auth, body: JSON.stringify({ kind: "weird" }) })).status).toBe(400);
  });

  it("refuses to delete the only document, soft-deletes otherwise, and restores", async () => {
    const { p, d } = await makeDoc();
    expect((await app.request(`/documents/${d.id}`, { method: "DELETE", headers: auth })).status).toBe(409);
    const d2 = await (await app.request(`/projects/${p.id}/documents`, { method: "POST", headers: auth, body: JSON.stringify({ title: "Two" }) })).json() as { id: string };
    expect((await app.request(`/documents/${d.id}`, { method: "DELETE", headers: auth })).status).toBe(204);
    expect(((await (await app.request(`/projects/${p.id}/documents`, { headers: auth })).json()) as { id: string }[]).map(x => x.id)).toEqual([d2.id]);
    expect((await app.request(`/documents/${d.id}/restore-deleted`, { method: "POST", headers: auth })).status).toBe(200);
  });

  it("hides a document from other users on PATCH, DELETE and restore-deleted, and rejects an empty or unknown PATCH body", async () => {
    const { d } = await makeDoc();
    const other = { authorization: "Bearer " + (await token("u2")), "content-type": "application/json" };
    expect((await app.request(`/documents/${d.id}`, { method: "PATCH", headers: other, body: JSON.stringify({ title: "Mine now" }) })).status).toBe(404);
    expect((await app.request(`/documents/${d.id}`, { method: "PATCH", headers: other, body: JSON.stringify({ kind: "source" }) })).status).toBe(404);
    expect((await app.request(`/documents/${d.id}`, { method: "DELETE", headers: other })).status).toBe(404);
    expect((await app.request(`/documents/${d.id}/restore-deleted`, { method: "POST", headers: other })).status).toBe(404);
    expect((await app.request(`/documents/${d.id}`, { method: "PATCH", headers: auth, body: JSON.stringify({}) })).status).toBe(400);
    expect((await app.request(`/documents/${d.id}`, { method: "PATCH", headers: auth, body: JSON.stringify({ title: "Ok", bodyHtml: "<p>x</p>" }) })).status).toBe(400);
    expect((await app.request(`/documents/${d.id}`, { headers: auth })).status).toBe(200);
  });

  it("moves a document between the user's projects and refuses foreign ones", async () => {
    const me = await (await app.request("/me", { headers: auth })).json() as { scratchProjectId: string };
    const d = await (await app.request(`/projects/${me.scratchProjectId}/documents`, { method: "POST", headers: auth, body: JSON.stringify({ title: "Draft" }) })).json() as { id: string };
    const p = await (await app.request("/projects", { method: "POST", headers: auth, body: JSON.stringify({ title: "Thesis" }) })).json() as { id: string };
    const r = await app.request(`/documents/${d.id}/move`, { method: "POST", headers: auth, body: JSON.stringify({ projectId: p.id }) });
    expect(r.status).toBe(200); expect(((await r.json()) as { projectId: string }).projectId).toBe(p.id);
    expect((await app.request(`/documents/${d.id}/move`, { method: "POST", headers: auth, body: JSON.stringify({ projectId: "nope" }) })).status).toBe(404);
  });

  it("POST /projects accepts an optional stage and rejects an unknown one", async () => {
    const r = await app.request("/projects", { method: "POST", headers: auth, body: JSON.stringify({ title: "Lit", stage: "lit" }) });
    expect(r.status).toBe(201); expect(((await r.json()) as { stage: string }).stage).toBe("lit");
    expect((await app.request("/projects", { method: "POST", headers: auth, body: JSON.stringify({ title: "X", stage: "nope" }) })).status).toBe(400);
  });

  it("PATCH /projects/:id accepts contentLang", async () => {
    const p = await (await app.request("/projects", { method: "POST", headers: auth, body: JSON.stringify({ title: "Hindi" }) })).json() as { id: string };
    const r = await app.request(`/projects/${p.id}`, { method: "PATCH", headers: auth, body: JSON.stringify({ contentLang: "hi" }) });
    expect(r.status).toBe(200); expect(((await r.json()) as { contentLang: string }).contentLang).toBe("hi");
  });

  it("creates project and document, document starts at revision 1", async () => {
    const { d } = await makeDoc();
    expect(d.currentSeq).toBe(1);
  });

  it("PUT creates a revision only when the body changed, and sanitises", async () => {
    const { d } = await makeDoc();
    const r1 = await (await app.request(`/documents/${d.id}`, { method: "PUT", headers: auth, body: JSON.stringify({ bodyHtml: '<p>hi</p><img src="x" onerror="a()">' }) })).json() as { created: boolean; revision: { seq: number; bodyHtml: string } };
    expect(r1.created).toBe(true);
    expect(r1.revision.seq).toBe(2);
    expect(r1.revision.bodyHtml).not.toContain("onerror");
    const r2 = await (await app.request(`/documents/${d.id}`, { method: "PUT", headers: auth, body: JSON.stringify({ bodyHtml: '<p>hi</p><img src="x" onerror="a()">' }) })).json() as { created: boolean; revision: { seq: number } };
    expect(r2.created).toBe(false);
    expect(r2.revision.seq).toBe(2);
  });

  it("GET /projects/:id/writing-record counts typed versus AI words per revision, and keeps source documents out of docs", async () => {
    const { p, d } = await makeDoc();
    const put = (id: string, bodyHtml: string) => app.request(`/documents/${id}`, { method: "PUT", headers: auth, body: JSON.stringify({ bodyHtml }) });
    await put(d.id, "<p>mine</p>");
    await put(d.id, '<p>mine <span class="ai-ins" data-h="x">theirs too</span></p>');
    const src = await (await app.request(`/projects/${p.id}/documents`, { method: "POST", headers: auth, body: JSON.stringify({ title: "Paper" }) })).json() as { id: string };
    await put(src.id, "<p>one two three four</p>");
    await app.request(`/documents/${src.id}`, { method: "PATCH", headers: auth, body: JSON.stringify({ kind: "source" }) });
    const rec = await (await app.request(`/projects/${p.id}/writing-record`, { headers: auth })).json() as { docs: { id: string; title: string; kind: string; stats: unknown }[]; sources: { title: string; words: number }[]; weekly: { weekStart: string; typed: number; ai: number }[]; aiLog: unknown };
    expect(rec.docs).toHaveLength(1);
    expect(rec.docs[0]).toMatchObject({ id: d.id, title: "Draft", kind: "draft", stats: { typed: 1, ai: 2, passages: 1, kept: 0, edited: 1, unknown: 0 } });
    expect(rec.sources).toEqual([{ id: src.id, title: "Paper", titleKeyVersion: 0, deks: [], words: 4 }]);
    expect(rec.weekly).toHaveLength(1);
    expect(rec.weekly[0]).toMatchObject({ typed: 1, ai: 2 });
    expect(rec.weekly[0]?.weekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(rec.aiLog).toEqual({ byKind: {}, byService: {}, total: 0, firstAt: null, lastAt: null, loggingOff: false });
    await app.request("/me/settings", { method: "PATCH", headers: auth, body: JSON.stringify({ aiLogOff: true }) });
    const off = await (await app.request(`/projects/${p.id}/writing-record`, { headers: auth })).json() as { aiLog: { loggingOff: boolean } };
    expect(off.aiLog.loggingOff).toBe(true);
    const other = { authorization: "Bearer " + (await token("u2")), "content-type": "application/json" };
    expect((await app.request(`/projects/${p.id}/writing-record`, { headers: other })).status).toBe(404);
  });

  it("the writing record counts a legacy revision without stats from its text", async () => {
    const store = new MemoryStore();
    const legacyApp = createApp({ store, jwtSecret: SECRET, maxBodyBytes: 2 * 1024 * 1024 });
    const proj = await store.createProject("u1", "Old");
    const doc = await store.createDocument("u1", proj.id, "Legacy", "draft", { bodyHtml: "<p>one two three</p>", authorKind: "web", authorLabel: "x", wordCount: 3, keyVersion: 0 });
    const rec = await (await legacyApp.request(`/projects/${proj.id}/writing-record`, { headers: auth })).json() as { docs: { id: string; stats: { typed: number } }[]; weekly: { typed: number }[] };
    expect(rec.docs[0]).toMatchObject({ id: doc!.id, stats: { typed: 3, ai: 0 } });
    expect(rec.weekly).toMatchObject([{ typed: 3, ai: 0 }]);
  });

  it("every revision writer stores originStats: restore and a new empty document", async () => {
    const { d } = await makeDoc();
    const put = (bodyHtml: string) => app.request(`/documents/${d.id}`, { method: "PUT", headers: auth, body: JSON.stringify({ bodyHtml }) });
    const stats = async (docId: string, seq: number) => ((await (await app.request(`/documents/${docId}/revisions/${seq}`, { headers: auth })).json()) as { originStats: unknown }).originStats;
    expect(await stats(d.id, 1)).toEqual({ typed: 0, ai: 0, passages: 0, kept: 0, edited: 0, unknown: 0 });
    await put('<p>mine <span class="ai-ins" data-h="x">theirs too</span></p>');
    await put("<p>other</p>");
    const restored = await (await app.request(`/documents/${d.id}/restore/2`, { method: "POST", headers: auth })).json() as { revision: { seq: number; originStats: unknown } };
    expect(restored.revision.originStats).toEqual({ typed: 1, ai: 2, passages: 1, kept: 0, edited: 1, unknown: 0 });
    expect(await stats(d.id, restored.revision.seq)).toEqual(restored.revision.originStats);
  });

  it("rejects bodies over the limit with 413 and keeps the last revision", async () => {
    const { d } = await makeDoc();
    await app.request(`/documents/${d.id}`, { method: "PUT", headers: auth, body: JSON.stringify({ bodyHtml: "<p>keep</p>" }) });
    const big = "<p>" + "x".repeat(2 * 1024 * 1024 + 10) + "</p>";
    const r = await app.request(`/documents/${d.id}`, { method: "PUT", headers: auth, body: JSON.stringify({ bodyHtml: big }) });
    expect(r.status).toBe(413);
    const got = await (await app.request(`/documents/${d.id}`, { headers: auth })).json() as { bodyHtml: string; currentSeq: number };
    expect(got.bodyHtml).toBe("<p>keep</p>");
    expect(got.currentSeq).toBe(2);
  });

  it("restore creates a new revision with the old body", async () => {
    const { d } = await makeDoc();
    for (const t of ["a", "b", "c"]) await app.request(`/documents/${d.id}`, { method: "PUT", headers: auth, body: JSON.stringify({ bodyHtml: `<p>${t}</p>` }) });
    const r = await (await app.request(`/documents/${d.id}/restore/2`, { method: "POST", headers: auth })).json() as { revision: { seq: number; bodyHtml: string; authorKind: string } };
    expect(r.revision.seq).toBe(5);
    expect(r.revision.bodyHtml).toBe("<p>a</p>");
    expect(r.revision.authorKind).toBe("restore");
    const list = await (await app.request(`/documents/${d.id}/revisions`, { headers: auth })).json() as { seq: number }[];
    expect(list.map(x => x.seq)).toEqual([5, 4, 3, 2, 1]);
  });

  it("other users get 404 on my document", async () => {
    const { d } = await makeDoc();
    const other = { authorization: "Bearer " + (await token("u2")) };
    expect((await app.request(`/documents/${d.id}`, { headers: other })).status).toBe(404);
  });

  it("has no server-side v1 import: the backup is parsed and encrypted in the browser", async () => {
    for (const path of ["/import/v1", "/import"]) {
      const r = await app.request(path, { method: "POST", headers: auth, body: JSON.stringify({ exported: "2026-10-01T00:00:00Z", projectTitle: "Imported", documents: [{ title: "Old", bodyHtml: "<p>one</p>" }] }) });
      expect(r.status).toBe(404);
    }
    expect(await (await app.request("/projects", { headers: auth })).json()).toEqual([]);
  });

  describe("who a created document names as its author", () => {
    const create = async (extra: Record<string, unknown>) => {
      const proj = await (await app.request("/projects", { method: "POST", headers: auth, body: JSON.stringify({ title: "P" }) })).json() as { id: string };
      const r = await app.request(`/projects/${proj.id}/documents`, { method: "POST", headers: auth, body: JSON.stringify({ title: "Old", bodyHtml: "<p>one two three</p>", ...extra }) });
      const d = r.status === 201 ? await r.json() as { id: string } : null;
      const revs = d ? await (await app.request(`/documents/${d.id}/revisions`, { headers: auth })).json() as { authorKind: string; authorLabel: string; originStats: unknown }[] : [];
      return { status: r.status, revs, projectId: proj.id };
    };

    it("an import names itself: authorKind import and the label the client gives (default 'v1 backup')", async () => {
      const a = await create({ authorKind: "import", authorLabel: "v1 backup 2026-10-12" });
      expect(a.status).toBe(201);
      expect(a.revs[0]).toMatchObject({ authorKind: "import", authorLabel: "v1 backup 2026-10-12", originStats: { typed: 3, ai: 0 } });
      const b = await create({ authorKind: "import" });
      expect(b.revs[0]).toMatchObject({ authorKind: "import", authorLabel: "v1 backup" });
    });

    it("without authorKind the author is the web user's email; a label alone changes nothing", async () => {
      const a = await create({});
      expect(a.revs[0]).toMatchObject({ authorKind: "web", authorLabel: "u1@x.org" });
      const b = await create({ authorLabel: "spoofed" });
      expect(b.revs[0]).toMatchObject({ authorKind: "web", authorLabel: "u1@x.org" });
    });

    it("a client cannot set any other authorKind (copilot, restore, web): 400 and nothing created", async () => {
      for (const authorKind of ["copilot", "restore", "web", "ai"]) {
        const r = await create({ authorKind, authorLabel: "x" });
        expect(r.status).toBe(400);
        expect(await (await app.request(`/projects/${r.projectId}/documents`, { headers: auth })).json()).toEqual([]);
      }
    });
  });

  describe("document body limit (2.8 MB by default: ciphertext is 4/3 the HTML, Vercel stops at 4.5 MB)", () => {
    const MB = 1024 * 1024;
    it("accepts a 2.5 MB body on PUT and on create, and refuses above 2.8 MB with 413 on both, storing nothing", async () => {
      const dflt = createApp({ store: new MemoryStore(), jwtSecret: SECRET });
      const proj = await (await dflt.request("/projects", { method: "POST", headers: auth, body: JSON.stringify({ title: "P" }) })).json() as { id: string };
      const fits = JSON.stringify({ title: "Fits", bodyHtml: "<p>" + "x".repeat(2.5 * MB) + "</p>" });
      const made = await dflt.request(`/projects/${proj.id}/documents`, { method: "POST", headers: auth, body: fits });
      expect(made.status).toBe(201);
      const d = await made.json() as { id: string };
      const put = await dflt.request(`/documents/${d.id}`, { method: "PUT", headers: auth, body: JSON.stringify({ bodyHtml: "<p>" + "y".repeat(2.5 * MB) + "</p>" }) });
      expect(put.status).toBe(200);

      const big = "<p>" + "x".repeat(2.8 * MB + 10) + "</p>";
      const refusedCreate = await dflt.request(`/projects/${proj.id}/documents`, { method: "POST", headers: auth, body: JSON.stringify({ title: "Big", bodyHtml: big }) });
      expect(refusedCreate.status).toBe(413);
      expect(await refusedCreate.json()).toEqual({ error: "too-large" });
      const refusedPut = await dflt.request(`/documents/${d.id}`, { method: "PUT", headers: auth, body: JSON.stringify({ bodyHtml: big }) });
      expect(refusedPut.status).toBe(413);
      const docs = await (await dflt.request(`/projects/${proj.id}/documents`, { headers: auth })).json() as { title: string }[];
      expect(docs.map((x) => x.title)).toEqual(["Fits"]);
    });

    it("applies the configured limit to document creation too, and a non-JSON create body is still 400", async () => {
      const small = createApp({ store: new MemoryStore(), jwtSecret: SECRET, maxBodyBytes: 1024 });
      const proj = await (await small.request("/projects", { method: "POST", headers: auth, body: JSON.stringify({ title: "P" }) })).json() as { id: string };
      const r = await small.request(`/projects/${proj.id}/documents`, { method: "POST", headers: auth, body: JSON.stringify({ title: "T", bodyHtml: "<p>" + "x".repeat(2048) + "</p>" }) });
      expect(r.status).toBe(413);
      expect((await small.request(`/projects/${proj.id}/documents`, { method: "POST", headers: auth, body: "nope" })).status).toBe(400);
    });
  });

  it("lists projects with documentCount and lastEditedAt", async () => {
    const { p, d } = await makeDoc();
    await app.request(`/documents/${d.id}`, { method: "PUT", headers: auth, body: JSON.stringify({ bodyHtml: "<p>a</p>" }) });
    const list = await (await app.request("/projects", { headers: auth })).json() as { id: string; documentCount: number; lastEditedAt: string | null }[];
    const mine = list.find(x => x.id === p.id)!;
    expect(mine.documentCount).toBe(1);
    expect(typeof mine.lastEditedAt).toBe("string");
  });

  it("PATCH updates title and stage and validates", async () => {
    const { p } = await makeDoc();
    const ok = await app.request(`/projects/${p.id}`, { method: "PATCH", headers: auth, body: JSON.stringify({ title: "Renamed", stage: "lit" }) });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ title: "Renamed", stage: "lit" });
    expect((await app.request(`/projects/${p.id}`, { method: "PATCH", headers: auth, body: JSON.stringify({ stage: "nope" }) })).status).toBe(400);
    expect((await app.request(`/projects/${p.id}`, { method: "PATCH", headers: auth, body: JSON.stringify({ status: "done" }) })).status).toBe(400);
    const done = await app.request(`/projects/${p.id}`, { method: "PATCH", headers: auth, body: JSON.stringify({ status: "complete" }) });
    expect(await done.json()).toMatchObject({ status: "complete" });
    expect((await app.request(`/projects/${p.id}`, { method: "PATCH", headers: auth, body: JSON.stringify({ title: "" }) })).status).toBe(400);
    expect((await app.request(`/projects/${p.id}`, { method: "PATCH", headers: auth, body: JSON.stringify({ title: "x".repeat(201) }) })).status).toBe(400);
    const other = { authorization: "Bearer " + (await token("u2")), "content-type": "application/json" };
    expect((await app.request(`/projects/${p.id}`, { method: "PATCH", headers: other, body: JSON.stringify({ title: "Hijack" }) })).status).toBe(404);
  });

  it("PATCH /documents/:id renames without creating a revision, validates, and refuses other users", async () => {
    const { d } = await makeDoc();
    await app.request(`/documents/${d.id}`, { method: "PUT", headers: auth, body: JSON.stringify({ bodyHtml: "<p>latest</p>" }) });
    const ok = await app.request(`/documents/${d.id}`, { method: "PATCH", headers: auth, body: JSON.stringify({ title: "  Chapter one  " }) });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ id: d.id, title: "Chapter one", currentSeq: 2 });
    const doc = await (await app.request(`/documents/${d.id}`, { headers: auth })).json() as { title: string; bodyHtml: string; currentSeq: number };
    expect(doc).toMatchObject({ title: "Chapter one", bodyHtml: "<p>latest</p>", currentSeq: 2 });
    const revs = await (await app.request(`/documents/${d.id}/revisions`, { headers: auth })).json() as unknown[];
    expect(revs).toHaveLength(2);
    expect((await app.request(`/documents/${d.id}`, { method: "PATCH", headers: auth, body: JSON.stringify({ title: "   " }) })).status).toBe(400);
    expect((await app.request(`/documents/${d.id}`, { method: "PATCH", headers: auth, body: JSON.stringify({ title: "x".repeat(201) }) })).status).toBe(400);
    expect((await app.request(`/documents/${d.id}`, { method: "PATCH", headers: auth, body: JSON.stringify({}) })).status).toBe(400);
    expect((await app.request(`/documents/${d.id}`, { method: "PATCH", headers: auth, body: "not json" })).status).toBe(400);
    const other = { authorization: "Bearer " + (await token("u2")), "content-type": "application/json" };
    expect((await app.request(`/documents/${d.id}`, { method: "PATCH", headers: other, body: JSON.stringify({ title: "Hijack" }) })).status).toBe(404);
    expect((await app.request(`/documents/does-not-exist`, { method: "PATCH", headers: auth, body: JSON.stringify({ title: "x" }) })).status).toBe(404);
  });

  it("DELETE removes the project and its documents", async () => {
    const { p, d } = await makeDoc();
    const other = { authorization: "Bearer " + (await token("u2")) };
    expect((await app.request(`/projects/${p.id}`, { method: "DELETE", headers: other })).status).toBe(404);
    expect((await app.request(`/projects/${p.id}`, { method: "DELETE", headers: auth })).status).toBe(204);
    expect((await app.request(`/documents/${d.id}`, { headers: auth })).status).toBe(404);
    expect((await app.request(`/projects/${p.id}`, { method: "DELETE", headers: auth })).status).toBe(404);
  });

  it("GET /me creates the user row and the scratch project once", async () => {
    const a = await (await app.request("/me", { headers: auth })).json() as { scratchProjectId: string; settings: object };
    const b = await (await app.request("/me", { headers: auth })).json() as { scratchProjectId: string };
    expect(a.scratchProjectId).toBe(b.scratchProjectId);
    expect(a.settings).toEqual({});
  });

  it("PATCH /me/settings merges and rejects unknown keys", async () => {
    await app.request("/me", { headers: auth });
    const r = await app.request("/me/settings", { method: "PATCH", headers: auth, body: JSON.stringify({ lang: "hi", draftFirst: true }) });
    expect(await r.json()).toEqual({ lang: "hi", draftFirst: true });
    expect((await app.request("/me/settings", { method: "PATCH", headers: auth, body: JSON.stringify({ evil: 1 }) })).status).toBe(400);
  });

  it("PATCH /me/settings keeps the phone sheet height between 40 and 85 percent", async () => {
    await app.request("/me", { headers: auth });
    const patch = (sheetPct: unknown) => app.request("/me/settings", { method: "PATCH", headers: auth, body: JSON.stringify({ sheetPct }) });
    expect(await (await patch(62)).json()).toEqual({ sheetPct: 62 });
    for (const bad of [39, 86, 50.5, "50"]) expect((await patch(bad)).status, String(bad)).toBe(400);
    expect(await (await app.request("/me", { headers: auth })).json()).toMatchObject({ settings: { sheetPct: 62 } });
  });

  it("settings accept docBeside and docW from 360 to 900; 359 is 400", async () => {
    await app.request("/me", { headers: auth });
    const patch = (body: unknown) => app.request("/me/settings", { method: "PATCH", headers: auth, body: JSON.stringify(body) });
    expect(await (await patch({ docBeside: true, docW: 360 })).json()).toEqual({ docBeside: true, docW: 360 });
    expect(await (await patch({ docW: 900 })).json()).toEqual({ docBeside: true, docW: 900 });
    for (const bad of [{ docW: 359 }, { docW: 901 }, { docW: 520.5 }, { docBeside: "yes" }]) expect((await patch(bad)).status, JSON.stringify(bad)).toBe(400);
    expect(await (await app.request("/me", { headers: auth })).json()).toMatchObject({ settings: { docBeside: true, docW: 900 } });
  });

  it("credentials accept only the blob shape and never return to another user", async () => {
    await app.request("/me", { headers: auth });
    expect((await app.request("/me/credentials/gemini", { method: "PUT", headers: auth, body: JSON.stringify({ encryptedKey: "plain-key" }) })).status).toBe(400);
    expect((await app.request("/me/credentials/gemini", { method: "PUT", headers: auth, body: JSON.stringify({ encryptedKey: "c2FsdA.aXY.Y3Q" }) })).status).toBe(204);
    const other = { authorization: "Bearer " + (await token("u2")), "content-type": "application/json" };
    await app.request("/me", { headers: other });
    expect(await (await app.request("/me/credentials", { headers: other })).json()).toEqual([]);
  });

  it("POST /me/terms records acceptance", async () => {
    await app.request("/me", { headers: auth });
    expect((await app.request("/me/terms", { method: "POST", headers: auth })).status).toBe(204);
    const me = await (await app.request("/me", { headers: auth })).json() as { ageConfirmed: boolean; termsAcceptedAt: string };
    expect(me.ageConfirmed).toBe(true); expect(me.termsAcceptedAt).toBeTruthy();
  });

  it("active project: 404 for a foreign project, and GET /me clears one that was deleted", async () => {
    const p = await (await app.request("/projects", { method: "POST", headers: auth, body: JSON.stringify({ title: "Sleep" }) })).json() as { id: string };
    expect((await app.request("/me/active-project", { method: "PATCH", headers: auth, body: JSON.stringify({ projectId: "nope" }) })).status).toBe(404);
    expect((await app.request("/me/active-project", { method: "PATCH", headers: auth, body: JSON.stringify({ projectId: p.id }) })).status).toBe(204);
    expect((await (await app.request("/me", { headers: auth })).json() as { activeProjectId: string }).activeProjectId).toBe(p.id);
    await app.request(`/projects/${p.id}`, { method: "DELETE", headers: auth });
    expect((await (await app.request("/me", { headers: auth })).json() as { activeProjectId: string | null }).activeProjectId).toBeNull();
  });
});

describe("ai routes", () => {
  let app: ReturnType<typeof createApp>;
  let auth: Record<string, string>;
  let store: MemoryStore;
  let status: number;
  const sent: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    sent.push({ url, headers: init.headers as Record<string, string>, body: String(init.body) });
    if (status !== 200) return new Response("{}", { status });
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.parse(String(init.body)).messages[0].content.includes("single word OK") ? "OK" : "generated" } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const acceptTerms = async (h: Record<string, string>) => { await app.request("/me", { headers: h }); await app.request("/me/terms", { method: "POST", headers: h }); };
  const post = (path: string, body: unknown, headers = auth) => app.request(path, { method: "POST", headers, body: JSON.stringify(body) });
  beforeEach(async () => {
    status = 200; sent.length = 0;
    store = new MemoryStore();
    app = createApp({ store, jwtSecret: SECRET, ai: { fetch: fakeFetch } });
    auth = { authorization: "Bearer " + (await token("u1")), "content-type": "application/json" };
    await acceptTerms(auth);
  });

  it("first run's idea check, logged with no project, is in the project's log once its save claims it (B1 walk row 12)", async () => {
    const check = await post("/ai/complete", { provider: "groq", apiKey: "gsk_x", prompt: "You are an experienced research-methods advisor. Please judge whether a project idea is realistic.", day: "2026-10-21" });
    expect(check.status).toBe(200);
    const created = await (await post("/projects", { title: "Sleep" })).json() as { id: string };
    const projectLog = async () => (await app.request(`/ai/log?projectId=${created.id}`, { headers: auth })).json();
    expect(await projectLog()).toEqual([]);
    expect(await (await post(`/projects/${created.id}/ai-use/claim`, { secondsAgo: 70 })).json()).toEqual({ claimed: 1 });
    expect(await projectLog()).toEqual([{ d: "2026-10-21", p: "groq", m: "openai/gpt-oss-120b", k: "checking whether my project idea is realistic", g: "feedback" }]);
  });

  it("logs the three kinds Task Q3 labels (OJ's yes, decision 7): a question about a paper, a walk-through stage and a lesson question; the statistics helper keeps v1's label (B3-R3)", async () => {
    const doc = apBuild("Practice paper", ["Abstract\nWe studied 120 students.\n\nMethod\nSurvey of students in Delhi.\n\nResults\nSleep predicted recall."], "pdf");
    const step = { k: "procedure", title: "Consent", said: "Participants consented.", flaw: "No consent form is shown." };
    const prompts = [
      buildAskPrompt("psychology", doc, "What was the sample?").prompt,
      buildWalkPrompt("psychology", doc, AP_STAGES[0]!, "my first try").prompt,
      buildHelperPrompt("stats", "psychology", "t(58) = 2.36, p = .022").prompt,
      buildLessonAskPrompt({ teacher: "tara", field: "psychology", lang: "en", step, doc, question: "why does this matter?" }).prompt,
      "Improve this text"
    ];
    for (const prompt of prompts) expect((await post("/ai/complete", { provider: "groq", apiKey: "gsk_x", prompt, day: "2026-10-22" })).status).toBe(200);
    const log = await (await app.request("/ai/log", { headers: auth })).json() as Array<{ k: string; g: string }>;
    expect(log.map((x) => [x.k, x.g])).toEqual([
      ["asking questions about a paper", "explain"],
      ["working through a paper section by section", "feedback"],
      ["formatting statistics output in APA style", "text"],
      ["a guided lesson on a paper", "explain"],
      ["grammar and polish", "text"]
    ]);
    expect(JSON.stringify(log)).not.toContain("What was the sample");
  });

  it("an entry logged before Task Q3 keeps the label it was stored with; nothing rewrites the log", async () => {
    await app.request("/me", { headers: auth });
    const me = await (await app.request("/me", { headers: auth })).json() as { id: string };
    await store.appendAiUse(me.id, null, { d: "2026-10-01", p: "groq", m: "openai/gpt-oss-120b", k: "other help", g: "other" });
    const doc = apBuild("Practice paper", ["Abstract\nWe studied 120 students."], "pdf");
    await post("/ai/complete", { provider: "groq", apiKey: "gsk_x", prompt: buildAskPrompt("psychology", doc, "What was the sample?").prompt, day: "2026-10-22" });
    const log = await (await app.request("/ai/log", { headers: auth })).json() as Array<{ d: string; k: string }>;
    expect(log.map((x) => [x.d, x.k])).toEqual([["2026-10-01", "other help"], ["2026-10-22", "asking questions about a paper"]]);
  });

  it("POST /ai/complete refuses unmasked personal data unless pdAccepted, logs provider, model and kind only", async () => {
    await app.request("/me", { headers: auth });
    const body = { provider: "groq", apiKey: "gsk_x", prompt: "Continue this writing in the same register, about 120 words. ... mail asha@uni.ac.in", day: "2026-10-15" };
    const refused = await post("/ai/complete", body);
    expect(refused.status).toBe(400); expect(await refused.json()).toEqual({ error: "personal-data", detail: "Found: 1 email address." });
    expect(sent).toHaveLength(0);
    const ok = await post("/ai/complete", { ...body, pdAccepted: true });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ text: "generated", model: "openai/gpt-oss-120b" });
    const log = await (await app.request("/ai/log", { headers: auth })).json() as Array<Record<string, string>>;
    expect(log).toEqual([{ d: "2026-10-15", p: "groq", m: "openai/gpt-oss-120b", k: "continuing my draft", g: "text" }]);
    expect(JSON.stringify(log)).not.toContain("asha@");
  });

  it("builds the v1 Found sentence with plurals and appends the content-language suffix unless noLang", async () => {
    const prompt = "Improve this text a@b.org c@d.org call 9876543210";
    const r = await post("/ai/complete", { provider: "groq", apiKey: "k", prompt, day: "2026-10-15" });
    expect(await r.json()).toEqual({ error: "personal-data", detail: "Found: 2 email addresses, 1 phone number." });
    await post("/ai/complete", { provider: "groq", apiKey: "k", prompt: "Improve this text", day: "2026-10-15", contentLang: "hi" });
    await post("/ai/complete", { provider: "groq", apiKey: "k", prompt: "Improve this text", day: "2026-10-15", contentLang: "hi", noLang: true });
    expect(JSON.parse(sent[0]!.body).messages[0].content).toContain("formal Hindi");
    expect(JSON.parse(sent[1]!.body).messages[0].content).toBe("Improve this text");
  });

  it("requires auth, a valid body and a YYYY-MM-DD day", async () => {
    expect((await post("/ai/complete", { provider: "groq", apiKey: "k", prompt: "p", day: "2026-10-15" }, { "content-type": "application/json" })).status).toBe(401);
    expect((await post("/ai/complete", { provider: "nope", apiKey: "k", prompt: "p", day: "2026-10-15" })).status).toBe(400);
    expect((await post("/ai/complete", { provider: "groq", apiKey: "k", prompt: "p" })).status).toBe(400);
    expect((await post("/ai/complete", { provider: "groq", apiKey: "k", prompt: "p", day: "15-10-2026" })).status).toBe(400);
    expect((await post("/ai/complete", { provider: "groq", apiKey: "k".repeat(401), prompt: "p", day: "2026-10-15" })).status).toBe(400);
    expect((await post("/ai/complete", { provider: "groq", apiKey: "k", prompt: "p".repeat(60001), day: "2026-10-15" })).status).toBe(400);
  });

  it("maps AiError codes to statuses and writes no log row on failure", async () => {
    const run = async (s: number) => { status = s; const r = await post("/ai/complete", { provider: "groq", apiKey: "k", prompt: "p", day: "2026-10-15" }); return [r.status, ((await r.json()) as { error: string }).error] as const; };
    expect(await run(401)).toEqual([401, "key-rejected"]);
    expect(await run(404)).toEqual([404, "model-gone"]);
    expect(await run(429)).toEqual([429, "rate-limit"]);
    expect((await post("/ai/complete", { provider: "groq", apiKey: "  ", prompt: "p", day: "2026-10-15" })).status).toBe(400);
    expect(await (await app.request("/ai/log", { headers: auth })).json()).toEqual([]);
  });

  it("does not log the Appu help assistant or when aiLogOff is set", async () => {
    await post("/ai/complete", { provider: "groq", apiKey: "k", prompt: "You are Appu, the help assistant. Hi", day: "2026-10-15" });
    await app.request("/me/settings", { method: "PATCH", headers: auth, body: JSON.stringify({ aiLogOff: true }) });
    await post("/ai/complete", { provider: "groq", apiKey: "k", prompt: "Improve this text", day: "2026-10-15" });
    expect(await (await app.request("/ai/log", { headers: auth })).json()).toEqual([]);
  });

  it("never writes the key or the prompt to the console on failure", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    status = 503;
    const r = await post("/ai/complete", { provider: "groq", apiKey: "gsk_secret", prompt: "SECRET PROMPT", day: "2026-10-15" });
    expect(r.status).toBe(502);
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/gsk_secret|SECRET PROMPT/);
    spy.mockRestore();
  });

  it("an unexpected error answers 502 provider-error and logs only its name", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = createApp({ store, jwtSecret: SECRET, ai: { anthropic: (() => ({ messages: { create: async () => { throw new RangeError("gsk_secret SECRET PROMPT"); } } })) as never } });
    const r = await boom.request("/ai/complete", { method: "POST", headers: auth, body: JSON.stringify({ provider: "claude", apiKey: "gsk_secret", prompt: "SECRET PROMPT", day: "2026-10-15" }) });
    expect(r.status).toBe(502);
    expect(await r.json()).toEqual({ error: "provider-error", detail: "unexpected" });
    expect(spy).toHaveBeenCalled();
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/gsk_secret|SECRET PROMPT/);
    spy.mockRestore();
  });

  it("POST /ai/test sends the OK probe and does not log", async () => {
    const r = await post("/ai/test", { provider: "groq", apiKey: "gsk_x" });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, reply: "OK" });
    expect(JSON.parse(sent[0]!.body)).toEqual({ model: "openai/gpt-oss-120b", messages: [{ role: "user", content: "Reply with the single word OK." }], temperature: 0, max_tokens: 20 });
    expect(await (await app.request("/ai/log", { headers: auth })).json()).toEqual([]);
    status = 401;
    const bad = await post("/ai/test", { provider: "groq", apiKey: "gsk_x" });
    expect(bad.status).toBe(401);
    expect(await bad.json()).toMatchObject({ error: "key-rejected" });
  });

  it("serves the log with a range, a summary, and erases it", async () => {
    for (const day of ["2026-10-14", "2026-10-15"]) await post("/ai/complete", { provider: "groq", apiKey: "k", prompt: "Improve this text", day });
    await post("/ai/complete", { provider: "groq", apiKey: "k", prompt: "Continue this writing", day: "2026-10-15" });
    const ranged = await (await app.request("/ai/log?from=2026-10-15&to=2026-10-15", { headers: auth })).json() as unknown[];
    expect(ranged).toHaveLength(2);
    expect(await (await app.request("/ai/log/summary", { headers: auth })).json()).toEqual({ byKind: { "grammar and polish": 2, "continuing my draft": 1 }, byProvider: { groq: 3 }, total: 3 });
    expect((await app.request("/ai/log?from=bad", { headers: auth })).status).toBe(400);
    expect((await app.request("/ai/log", { method: "DELETE", headers: auth })).status).toBe(204);
    expect(await (await app.request("/ai/log", { headers: auth })).json()).toEqual([]);
  });

  it("serves one project's log with ?projectId and the whole log without it", async () => {
    const p = await (await app.request("/projects", { method: "POST", headers: auth, body: JSON.stringify({ title: "Sleep" }) })).json() as { id: string };
    const q = await (await app.request("/projects", { method: "POST", headers: auth, body: JSON.stringify({ title: "Diet" }) })).json() as { id: string };
    await post("/ai/complete", { provider: "groq", apiKey: "k", prompt: "Improve this text", day: "2026-10-14", projectId: p.id });
    await post("/ai/complete", { provider: "groq", apiKey: "k", prompt: "Continue this writing", day: "2026-10-15", projectId: q.id });
    await post("/ai/complete", { provider: "groq", apiKey: "k", prompt: "Improve this text", day: "2026-10-16" });
    const mine = await (await app.request(`/ai/log?projectId=${p.id}`, { headers: auth })).json() as Array<{ d: string; k: string }>;
    expect(mine.map((e) => [e.d, e.k])).toEqual([["2026-10-14", "grammar and polish"]]);
    expect(await (await app.request(`/ai/log?projectId=${q.id}&from=2026-10-16`, { headers: auth })).json()).toEqual([]);
    expect(((await (await app.request("/ai/log", { headers: auth })).json()) as unknown[])).toHaveLength(3);
    expect((await app.request("/ai/log?projectId=", { headers: auth })).status).toBe(400);
  });

  it("keeps one student's log out of another's", async () => {
    await post("/ai/complete", { provider: "groq", apiKey: "k", prompt: "Improve this text", day: "2026-10-15" });
    const other = { authorization: "Bearer " + (await token("u2")), "content-type": "application/json" };
    await acceptTerms(other);
    expect(await (await app.request("/ai/log", { headers: other })).json()).toEqual([]);
  });

  it("answers 403 { error: \"terms\" } on every /ai route until the terms are accepted, then works", async () => {
    const fresh = { authorization: "Bearer " + (await token("u9")), "content-type": "application/json" };
    const complete = { provider: "groq", apiKey: "gsk_x", prompt: "Improve this text", day: "2026-10-15" };
    for (const [path, body] of [["/ai/complete", complete], ["/ai/test", { provider: "groq", apiKey: "gsk_x" }]] as const) {
      const r = await post(path, body, fresh);
      expect(r.status).toBe(403); expect(await r.json()).toEqual({ error: "terms" });
    }
    for (const path of ["/ai/log", "/ai/log/summary"]) expect((await app.request(path, { headers: fresh })).status).toBe(403);
    expect((await app.request("/ai/log", { method: "DELETE", headers: fresh })).status).toBe(403);
    expect(sent).toHaveLength(0);
    expect((await app.request("/me/terms", { method: "POST", headers: fresh })).status).toBe(204);
    expect((await post("/ai/complete", complete, fresh)).status).toBe(200);
    expect((await post("/ai/test", { provider: "groq", apiKey: "gsk_x" }, fresh)).status).toBe(200);
    expect((await app.request("/ai/log", { headers: fresh })).status).toBe(200);
  });
});
