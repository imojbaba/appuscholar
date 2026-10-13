import { describe, it, expect, beforeEach } from "vitest";
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
});
