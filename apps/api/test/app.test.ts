import { describe, it, expect, beforeEach, vi } from "vitest";
import { SignJWT } from "jose";
import { createApp } from "../src/app";
import { MemoryStore } from "../src/store/memory";
import { readFileSync } from "node:fs";
import { parseV1Backup } from "@appuscholar/core";

const SECRET = "test-secret-test-secret-test-secret-1234";
const key = new TextEncoder().encode(SECRET);
async function token(sub: string, ttl = 900) {
  return new SignJWT({ email: sub + "@x.org" }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1000) + ttl).sign(key);
}
const v1fixture = readFileSync(new URL("../../../packages/core/test/fixtures/v1-backup-small.json", import.meta.url), "utf8");

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
    expect(rec.sources).toEqual([{ title: "Paper", words: 4 }]);
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
    const doc = await store.createDocument("u1", proj.id, "Legacy", "draft", { bodyHtml: "<p>one two three</p>", authorKind: "web", authorLabel: "x", wordCount: 3 });
    const rec = await (await legacyApp.request(`/projects/${proj.id}/writing-record`, { headers: auth })).json() as { docs: { id: string; stats: { typed: number } }[]; weekly: { typed: number }[] };
    expect(rec.docs[0]).toMatchObject({ id: doc!.id, stats: { typed: 3, ai: 0 } });
    expect(rec.weekly).toMatchObject([{ typed: 3, ai: 0 }]);
  });

  it("every revision writer stores originStats: restore, v1 import and a new empty document", async () => {
    const { d } = await makeDoc();
    const put = (bodyHtml: string) => app.request(`/documents/${d.id}`, { method: "PUT", headers: auth, body: JSON.stringify({ bodyHtml }) });
    const stats = async (docId: string, seq: number) => ((await (await app.request(`/documents/${docId}/revisions/${seq}`, { headers: auth })).json()) as { originStats: unknown }).originStats;
    expect(await stats(d.id, 1)).toEqual({ typed: 0, ai: 0, passages: 0, kept: 0, edited: 0, unknown: 0 });
    await put('<p>mine <span class="ai-ins" data-h="x">theirs too</span></p>');
    await put("<p>other</p>");
    const restored = await (await app.request(`/documents/${d.id}/restore/2`, { method: "POST", headers: auth })).json() as { revision: { seq: number; originStats: unknown } };
    expect(restored.revision.originStats).toEqual({ typed: 1, ai: 2, passages: 1, kept: 0, edited: 1, unknown: 0 });
    expect(await stats(d.id, restored.revision.seq)).toEqual(restored.revision.originStats);
    const imp = await (await app.request("/import/v1", { method: "POST", headers: auth, body: JSON.stringify({ exported: "2026-10-01T00:00:00Z", projectTitle: "Imported", documents: [{ title: "Old", bodyHtml: "<p>one two three</p>" }] }) })).json() as { projectId: string };
    const [od] = await (await app.request(`/projects/${imp.projectId}/documents`, { headers: auth })).json() as { id: string }[];
    expect(await stats(od!.id, 1)).toMatchObject({ typed: 3, ai: 0 });
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

  function importBody(bundleText: string, extra: Record<string, unknown> = {}) {
    const parsed = parseV1Backup(bundleText);
    if (!parsed.ok) throw new Error(parsed.reason);
    return JSON.stringify({ exported: parsed.backup.exported, projectTitle: "Sleep and memory (imported from v1)", documents: parsed.backup.documents.map(d => ({ title: d.title, bodyHtml: d.bodyHtml })), ...extra });
  }

  it("imports parsed v1 documents into a new project", async () => {
    const r = await app.request("/import/v1", { method: "POST", headers: auth, body: importBody(v1fixture) });
    expect(r.status).toBe(201);
    const { projectId, imported } = await r.json() as { projectId: string; imported: number };
    expect(imported).toBe(2);
    const projects = await (await app.request("/projects", { headers: auth })).json() as { id: string; title: string }[];
    expect(projects.find(p => p.id === projectId)?.title).toBe("Sleep and memory (imported from v1)");
    const docs = await (await app.request(`/projects/${projectId}/documents`, { headers: auth })).json() as { id: string; title: string }[];
    expect(docs.map(x => x.title).sort()).toEqual(["Literature review", "Plain notes"]);
    const revs = await (await app.request(`/documents/${docs[0]!.id}/revisions`, { headers: auth })).json() as { authorKind: string; authorLabel: string }[];
    expect(revs[0]).toMatchObject({ authorKind: "import", authorLabel: "v1 backup 2026-10-12" });
  });

  it("rejects malformed import bodies, including the old bundleText shape", async () => {
    for (const body of ["nope", JSON.stringify({ bundleText: v1fixture }), JSON.stringify({ exported: "", projectTitle: "x", documents: [] })]) {
      const bad = await app.request("/import/v1", { method: "POST", headers: auth, body });
      expect(bad.status).toBe(400);
      expect(await bad.json()).toEqual({ error: "invalid" });
    }
  });

  it("adds later batches to the project created by the first, and only to my own project", async () => {
    const one = (title: string) => JSON.stringify({ exported: "2026-10-12T09:30:00.000Z", projectTitle: "Batch", documents: [{ title, bodyHtml: `<p>${title}</p>` }] });
    const first = await (await app.request("/import/v1", { method: "POST", headers: auth, body: one("A") })).json() as { projectId: string };
    const second = await app.request("/import/v1", { method: "POST", headers: auth, body: JSON.stringify({ ...JSON.parse(one("B")), projectId: first.projectId }) });
    expect(second.status).toBe(201);
    expect(await second.json()).toEqual({ projectId: first.projectId, imported: 1 });
    expect((await (await app.request("/projects", { headers: auth })).json() as unknown[]).length).toBe(1);
    const docs = await (await app.request(`/projects/${first.projectId}/documents`, { headers: auth })).json() as { title: string }[];
    expect(docs.map(d => d.title).sort()).toEqual(["A", "B"]);
    const other = { authorization: "Bearer " + (await token("u2")), "content-type": "application/json" };
    const stolen = await app.request("/import/v1", { method: "POST", headers: other, body: JSON.stringify({ ...JSON.parse(one("C")), projectId: first.projectId }) });
    expect(stolen.status).toBe(404);
    expect((await (await app.request(`/projects/${first.projectId}/documents`, { headers: auth })).json() as unknown[]).length).toBe(2);
  });

  it("rejects an import request above the size limit with 413", async () => {
    const small = createApp({ store: new MemoryStore(), jwtSecret: SECRET, maxImportBytes: 1024 });
    const body = JSON.stringify({ exported: "", projectTitle: "Big", documents: [{ title: "x", bodyHtml: "<p>" + "x".repeat(2048) + "</p>" }] });
    const r = await small.request("/import/v1", { method: "POST", headers: auth, body });
    expect(r.status).toBe(413);
    expect(await r.json()).toEqual({ error: "too-large" });
    expect(await (await small.request("/projects", { headers: auth })).json()).toEqual([]);
  });

  it("sanitises imported bodies", async () => {
    const body = JSON.stringify({ exported: "2026-10-01T00:00:00.000Z", projectTitle: "Hostile", documents: [{ title: "Hostile", bodyHtml: '<p>ok</p><img src="x" onerror="fetch(1)"><script>alert(1)</script>' }] });
    const r = await app.request("/import/v1", { method: "POST", headers: auth, body });
    expect(r.status).toBe(201);
    const { projectId } = await r.json() as { projectId: string };
    const docs = await (await app.request(`/projects/${projectId}/documents`, { headers: auth })).json() as { id: string }[];
    expect(docs).toHaveLength(1);
    const doc = await (await app.request(`/documents/${docs[0]!.id}`, { headers: auth })).json() as { bodyHtml: string };
    expect(doc.bodyHtml).toContain("<p>ok</p>");
    expect(doc.bodyHtml).not.toContain("onerror");
    expect(doc.bodyHtml).not.toContain("<script");
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
  const post = (path: string, body: unknown, headers = auth) => app.request(path, { method: "POST", headers, body: JSON.stringify(body) });
  beforeEach(async () => {
    status = 200; sent.length = 0;
    store = new MemoryStore();
    app = createApp({ store, jwtSecret: SECRET, ai: { fetch: fakeFetch } });
    auth = { authorization: "Bearer " + (await token("u1")), "content-type": "application/json" };
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

  it("keeps one student's log out of another's", async () => {
    await post("/ai/complete", { provider: "groq", apiKey: "k", prompt: "Improve this text", day: "2026-10-15" });
    const other = { authorization: "Bearer " + (await token("u2")), "content-type": "application/json" };
    expect(await (await app.request("/ai/log", { headers: other })).json()).toEqual([]);
  });
});
