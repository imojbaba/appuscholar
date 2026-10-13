import { describe, it, expect, beforeEach } from "vitest";
import { SignJWT } from "jose";
import { createApp } from "../src/app";
import { MemoryStore } from "../src/store/memory";
import { readFileSync } from "node:fs";

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

  it("imports a v1 backup into a new project", async () => {
    const r = await app.request("/import/v1", { method: "POST", headers: auth, body: JSON.stringify({ bundleText: v1fixture }) });
    expect(r.status).toBe(201);
    const { projectId, imported } = await r.json() as { projectId: string; imported: number };
    expect(imported).toBe(2);
    const docs = await (await app.request(`/projects/${projectId}/documents`, { headers: auth })).json() as { title: string }[];
    expect(docs.map(x => x.title).sort()).toEqual(["Literature review", "Plain notes"]);
    const bad = await app.request("/import/v1", { method: "POST", headers: auth, body: JSON.stringify({ bundleText: "nope" }) });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "not-json" });
  });
});
