import { describe, it, expect, beforeEach } from "vitest";
import { SignJWT } from "jose";
import { createApp } from "../src/app";
import { MemoryStore } from "../src/store/memory";

const SECRET = "test-secret-test-secret-test-secret-1234";
const key = new TextEncoder().encode(SECRET);
const ZERO_STATS = { typed: 0, ai: 0, passages: 0, kept: 0, edited: 0, unknown: 0 };
const VAULT = { passWrapped: "s.i.c", recoveryWrapped: "s.i.r", publicKey: "pk", privateKeyWrapped: "i.p" };

async function token(sub: string) {
  return new SignJWT({ email: sub + "@x.org" }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1000) + 900).sign(key);
}

describe("vault routes", () => {
  let store: MemoryStore;
  let app: ReturnType<typeof createApp>;
  let tokens: Record<string, string>;
  beforeEach(async () => {
    store = new MemoryStore();
    app = createApp({ store, jwtSecret: SECRET, maxBodyBytes: 2 * 1024 * 1024 });
    tokens = { u1: await token("u1"), u2: await token("u2") };
  });
  const as = (u: string, method: string, path: string, body?: unknown) =>
    app.request(path, { method, headers: { authorization: "Bearer " + tokens[u], "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const req = (method: string, path: string, body?: unknown) => as("u1", method, path, body);
  const json = async <T = any>(r: Response) => (await r.json()) as T; // eslint-disable-line @typescript-eslint/no-explicit-any

  async function makeDoc(u = "u1") {
    const p = await json<{ id: string }>(await as(u, "POST", "/projects", { title: "Sleep" }));
    return await json<{ id: string }>(await as(u, "POST", `/projects/${p.id}/documents`, { title: "Draft" }));
  }

  it("creates once, patches wraps with a reason, completes, and audits each", async () => {
    expect((await req("GET", "/me/vault")).status).toBe(404);
    expect(await json(await req("GET", "/me/vault"))).toEqual({ error: "no-vault" });
    const made = await req("PUT", "/me/vault", VAULT);
    expect(made.status).toBe(201);
    expect(await json(made)).toMatchObject({ ...VAULT, complete: false });
    expect((await req("PUT", "/me/vault", { passWrapped: "a", recoveryWrapped: "b", publicKey: "c", privateKeyWrapped: "d" })).status).toBe(409);
    expect(await json(await req("PUT", "/me/vault", VAULT))).toEqual({ error: "vault-exists" });
    const patched = await req("PATCH", "/me/vault/wraps", { passWrapped: "n.e.w", reason: "passphrase-changed" });
    expect(patched.status).toBe(200);
    expect(await json(patched)).toMatchObject({ passWrapped: "n.e.w", recoveryWrapped: "s.i.r" });
    expect((await req("POST", "/me/vault/complete")).status).toBe(204);
    expect((await json(await req("GET", "/me/vault"))).complete).toBe(true);
    const audit = await json(await req("GET", "/me/audit"));
    expect(audit.entries.map((e: { action: string }) => e.action)).toEqual(["vault-setup", "passphrase-changed", "migration-complete"]);
  });

  it("audits a recovery-used patch, and rejects bad vault bodies and reasons", async () => {
    expect((await req("PATCH", "/me/vault/wraps", { passWrapped: "x", reason: "passphrase-changed" })).status).toBe(404);
    expect((await req("PUT", "/me/vault", { passWrapped: "a" })).status).toBe(400);
    await req("PUT", "/me/vault", VAULT);
    expect((await req("PATCH", "/me/vault/wraps", { passWrapped: "x", reason: "because" })).status).toBe(400);
    expect((await req("PATCH", "/me/vault/wraps", { passWrapped: "x" })).status).toBe(400);
    expect((await req("PATCH", "/me/vault/wraps", { reason: "recovery-used" })).status).toBe(400);
    expect((await req("PATCH", "/me/vault/wraps", { passWrapped: "p2", recoveryWrapped: "r2", reason: "recovery-used" })).status).toBe(200);
    const audit = await json(await req("GET", "/me/audit"));
    expect(audit.entries.map((e: { action: string }) => e.action)).toEqual(["vault-setup", "recovery-used"]);
  });

  it("complete answers 404 without a vault, and vaults are per user", async () => {
    expect((await req("POST", "/me/vault/complete")).status).toBe(404);
    await req("PUT", "/me/vault", VAULT);
    expect((await as("u2", "GET", "/me/vault")).status).toBe(404);
    expect((await json(await as("u2", "GET", "/me/audit"))).entries).toEqual([]);
  });

  it("requires a bearer token on every vault route", async () => {
    for (const [m, p] of [["GET", "/me/vault"], ["PUT", "/me/vault"], ["PATCH", "/me/vault/wraps"], ["POST", "/me/vault/complete"], ["GET", "/me/audit"], ["POST", "/me/export-audit"], ["DELETE", "/me"]] as const)
      expect((await app.request(p, { method: m })).status, `${m} ${p}`).toBe(401);
  });

  it("export-audit appends an export entry", async () => {
    expect((await req("POST", "/me/export-audit")).status).toBe(204);
    const audit = await json(await req("GET", "/me/audit"));
    expect(audit.entries.map((e: { action: string }) => e.action)).toEqual(["export"]);
    expect(typeof audit.entries[0].at).toBe("string");
  });

  it("refuses plaintext after completion and accepts ciphertext with a known key version", async () => {
    const doc = await makeDoc();
    await req("PUT", "/me/vault", VAULT);
    const enc = await req("PUT", `/documents/${doc.id}`, { bodyHtml: "aA.bB", keyVersion: 1, wordCount: 3, originStats: ZERO_STATS, dek: { v: 1, wrapped: "i.k" } });
    expect(enc.status).toBe(200);
    const got = await json(await req("GET", `/documents/${doc.id}`));
    expect(got).toMatchObject({ bodyHtml: "aA.bB", keyVersion: 1, wordCount: 3, deks: [{ v: 1, wrapped: "i.k" }] });
    expect((await json(await req("GET", `/documents/${doc.id}/revisions/2`))).keyVersion).toBe(1);
    const unknown = await req("PUT", `/documents/${doc.id}`, { bodyHtml: "cC.dD", keyVersion: 2, wordCount: 1, originStats: ZERO_STATS });
    expect(unknown.status).toBe(400);
    expect(await json(unknown)).toEqual({ error: "unknown-key-version" });
    expect((await json(await req("GET", `/documents/${doc.id}`))).bodyHtml).toBe("aA.bB");
    await req("POST", "/me/vault/complete");
    const plain = await req("PUT", `/documents/${doc.id}`, { bodyHtml: "<p>plain</p>", keyVersion: 0 });
    expect(plain.status).toBe(409);
    expect(await json(plain)).toEqual({ error: "vault-required" });
    const closed = await req("PUT", `/documents/${doc.id}/revisions/1/rewrite`, { bodyHtml: "x.y", keyVersion: 1 });
    expect(closed.status).toBe(409);
    expect(await json(closed)).toEqual({ error: "migration-closed" });
    expect((await json(await req("GET", `/documents/${doc.id}/revisions/1`))).bodyHtml).toBe("");
  });

  it("stores ciphertext untouched (no sanitising) and requires wordCount and originStats", async () => {
    const doc = await makeDoc();
    const body = "<script>x</script>aA.bB";
    expect((await req("PUT", `/documents/${doc.id}`, { bodyHtml: body, keyVersion: 1, originStats: ZERO_STATS, dek: { v: 1, wrapped: "k" } })).status).toBe(400);
    expect((await req("PUT", `/documents/${doc.id}`, { bodyHtml: body, keyVersion: 1, wordCount: 2, dek: { v: 1, wrapped: "k" } })).status).toBe(400);
    expect((await json(await req("GET", `/documents/${doc.id}`))).deks).toEqual([]);
    const ok = await json(await req("PUT", `/documents/${doc.id}`, { bodyHtml: body, keyVersion: 1, wordCount: 2, originStats: { ...ZERO_STATS, typed: 2 }, dek: { v: 1, wrapped: "k" } }));
    expect(ok.created).toBe(true);
    expect(ok.revision).toMatchObject({ bodyHtml: body, keyVersion: 1, wordCount: 2, originStats: { ...ZERO_STATS, typed: 2 } });
  });

  it("an unknown key version with a dek for another version adds nothing", async () => {
    const doc = await makeDoc();
    const r = await req("PUT", `/documents/${doc.id}`, { bodyHtml: "a.b", keyVersion: 2, wordCount: 1, originStats: ZERO_STATS, dek: { v: 1, wrapped: "k" } });
    expect(r.status).toBe(400);
    expect((await json(await req("GET", `/documents/${doc.id}`))).deks).toEqual([]);
  });

  it("a ciphertext write retried with the same dek is idempotent, a different wrapped dek for that v is refused", async () => {
    const doc = await makeDoc();
    const w = { bodyHtml: "a.b", keyVersion: 1, wordCount: 1, originStats: ZERO_STATS, dek: { v: 1, wrapped: "k" } };
    expect((await req("PUT", `/documents/${doc.id}`, w)).status).toBe(200);
    const again = await req("PUT", `/documents/${doc.id}`, { ...w, bodyHtml: "c.d" });
    expect(again.status).toBe(200);
    expect((await json(await req("GET", `/documents/${doc.id}`))).deks).toEqual([{ v: 1, wrapped: "k" }]);
    const clash = await req("PUT", `/documents/${doc.id}`, { ...w, bodyHtml: "e.f", dek: { v: 1, wrapped: "other" } });
    expect(clash.status).toBe(409);
    expect(await json(clash)).toEqual({ error: "dek-exists" });
  });

  it("an identical ciphertext write does not create a revision", async () => {
    const doc = await makeDoc();
    const w = { bodyHtml: "a.b", keyVersion: 1, wordCount: 1, originStats: ZERO_STATS, dek: { v: 1, wrapped: "k" } };
    expect((await json(await req("PUT", `/documents/${doc.id}`, w))).created).toBe(true);
    expect((await json(await req("PUT", `/documents/${doc.id}`, w))).created).toBe(false);
  });

  it("creates a document from ciphertext with the same body shape, and refuses an unknown key version", async () => {
    const p = await json<{ id: string }>(await req("POST", "/projects", { title: "T" }));
    const bad = await req("POST", `/projects/${p.id}/documents`, { title: "Enc", keyVersion: 1, bodyHtml: "a.b", wordCount: 1, originStats: ZERO_STATS });
    expect(bad.status).toBe(400);
    expect(await json(bad)).toEqual({ error: "unknown-key-version" });
    const made = await req("POST", `/projects/${p.id}/documents`, { title: "Enc", keyVersion: 1, bodyHtml: "a.b", wordCount: 1, originStats: ZERO_STATS, dek: { v: 1, wrapped: "k" } });
    expect(made.status).toBe(201);
    const d = await json(made);
    expect(d).toMatchObject({ title: "Enc", bodyHtml: "a.b", keyVersion: 1, wordCount: 1, deks: [{ v: 1, wrapped: "k" }] });
    expect((await json(await req("GET", `/documents/${d.id}`))).bodyHtml).toBe("a.b");
    // a plain create still works while the vault is incomplete
    expect((await req("POST", `/projects/${p.id}/documents`, { title: "Plain" })).status).toBe(201);
  });

  it("refuses a plaintext create after completion", async () => {
    const p = await json<{ id: string }>(await req("POST", "/projects", { title: "T" }));
    await req("PUT", "/me/vault", VAULT);
    await req("POST", "/me/vault/complete");
    const r = await req("POST", `/projects/${p.id}/documents`, { title: "Plain" });
    expect(r.status).toBe(409);
    expect(await json(r)).toEqual({ error: "vault-required" });
  });

  it("adds a dek, answers 409 dek-exists for a duplicate v, and 404 for a foreign document", async () => {
    const doc = await makeDoc();
    const add = await req("POST", `/documents/${doc.id}/deks`, { v: 1, wrapped: "i.k" });
    expect(add.status).toBe(200);
    expect(await json(add)).toMatchObject({ id: doc.id, deks: [{ v: 1, wrapped: "i.k" }] });
    const dup = await req("POST", `/documents/${doc.id}/deks`, { v: 1, wrapped: "other" });
    expect(dup.status).toBe(409);
    expect(await json(dup)).toEqual({ error: "dek-exists" });
    expect((await json(await req("GET", `/documents/${doc.id}`))).deks).toEqual([{ v: 1, wrapped: "i.k" }]);
    expect((await req("POST", `/documents/${doc.id}/deks`, { v: 0, wrapped: "x" })).status).toBe(400);
    expect((await req("POST", `/documents/${doc.id}/deks`, { v: 2 })).status).toBe(400);
    expect((await as("u2", "POST", `/documents/${doc.id}/deks`, { v: 2, wrapped: "x" })).status).toBe(404);
  });

  it("rewrite keeps seq and created_at and is scoped to the owner", async () => {
    const doc = await makeDoc();
    const put = await json(await req("PUT", `/documents/${doc.id}`, { bodyHtml: "<p>hello there</p>", keyVersion: 0 }));
    expect(put.revision.seq).toBe(2);
    await req("POST", `/documents/${doc.id}/deks`, { v: 1, wrapped: "i.k" });
    const before = await json(await req("GET", `/documents/${doc.id}/revisions/2`));
    const rw = await req("PUT", `/documents/${doc.id}/revisions/2/rewrite`, { bodyHtml: "cT.dU", keyVersion: 1 });
    expect(rw.status).toBe(200);
    const sum = await json(rw);
    expect(sum).toMatchObject({ seq: 2, keyVersion: 1, createdAt: before.createdAt, wordCount: before.wordCount, originStats: before.originStats });
    expect(sum.bodyHtml).toBeUndefined();
    const after = await json(await req("GET", `/documents/${doc.id}/revisions/2`));
    expect(after).toMatchObject({ seq: 2, bodyHtml: "cT.dU", keyVersion: 1, createdAt: before.createdAt, id: before.id });
    expect((await json(await req("GET", `/documents/${doc.id}`))).currentSeq).toBe(2);
    expect((await json(await req("GET", `/documents/${doc.id}/revisions`))).length).toBe(2);
    expect((await as("u2", "PUT", `/documents/${doc.id}/revisions/2/rewrite`, { bodyHtml: "no.no", keyVersion: 1 })).status).toBe(404);
    expect((await json(await req("GET", `/documents/${doc.id}/revisions/2`))).bodyHtml).toBe("cT.dU");
  });

  it("rewrite requires a key version in the document's deks, and an existing revision", async () => {
    const doc = await makeDoc();
    const r = await req("PUT", `/documents/${doc.id}/revisions/1/rewrite`, { bodyHtml: "a.b", keyVersion: 1 });
    expect(r.status).toBe(400);
    expect(await json(r)).toEqual({ error: "unknown-key-version" });
    await req("POST", `/documents/${doc.id}/deks`, { v: 1, wrapped: "k" });
    expect((await req("PUT", `/documents/${doc.id}/revisions/9/rewrite`, { bodyHtml: "a.b", keyVersion: 1 })).status).toBe(404);
    expect((await req("PUT", `/documents/${doc.id}/revisions/1/rewrite`, { bodyHtml: "a.b", keyVersion: 0 })).status).toBe(400);
    expect((await req("PUT", `/documents/${doc.id}/revisions/x/rewrite`, { bodyHtml: "a.b", keyVersion: 1 })).status).toBe(400);
  });

  it("restore copies the old revision's body and key version without sanitising", async () => {
    const doc = await makeDoc();
    const body = "<script>x</script>aA.bB";
    await req("PUT", `/documents/${doc.id}`, { bodyHtml: body, keyVersion: 1, wordCount: 4, originStats: ZERO_STATS, dek: { v: 1, wrapped: "k" } });
    await req("PUT", `/documents/${doc.id}`, { bodyHtml: "<p>later</p>", keyVersion: 0 });
    const res = await req("POST", `/documents/${doc.id}/restore/2`);
    expect(res.status).toBe(200);
    const out = await json(res);
    expect(out.revision).toMatchObject({ seq: 4, bodyHtml: body, keyVersion: 1, wordCount: 4, authorKind: "restore" });
    expect(out.document).toMatchObject({ bodyHtml: body, keyVersion: 1 });
  });

  it("DELETE /me erases, the token stops working, and the stale token does not recreate the user", async () => {
    const doc = await makeDoc();
    await req("PUT", "/me/vault", VAULT);
    expect((await req("GET", "/me")).status).toBe(200);
    expect((await req("DELETE", "/me")).status).toBe(204);
    expect(await store.getUser("u1")).toBeNull();
    for (const [m, p] of [["GET", "/me"], ["GET", "/me/vault"], ["GET", "/projects"], ["GET", `/documents/${doc.id}`], ["POST", "/projects"]] as const) {
      const r = await req(m, p, m === "POST" ? { title: "again" } : undefined);
      expect(r.status, `${m} ${p}`).toBe(401);
    }
    expect(await store.getUser("u1")).toBeNull();
    expect((await store.listProjects("u1"))).toEqual([]);
    expect((await store.getVault("u1"))).toBeNull();
    // exactly one account-erased row, appended by the store and not by the route
    const actions = (await store.listAudit("u1")).map((e) => e.action);
    expect(actions.filter((a) => a === "account-erased")).toEqual(["account-erased"]);
    // other users are unaffected and a user who never existed is still created on first /me
    expect((await as("u2", "GET", "/me")).status).toBe(200);
  });

  it("takes deks and rewrites for a soft-deleted document (the migration reaches it), and stays owner-scoped", async () => {
    const p = await json<{ id: string }>(await req("POST", "/projects", { title: "T" }));
    await req("POST", `/projects/${p.id}/documents`, { title: "Keep" });
    const gone = await json<{ id: string }>(await req("POST", `/projects/${p.id}/documents`, { title: "Gone" }));
    await req("PUT", `/documents/${gone.id}`, { bodyHtml: "<p>old words</p>", keyVersion: 0 });
    expect((await req("DELETE", `/documents/${gone.id}`)).status).toBe(204);
    expect((await req("GET", `/documents/${gone.id}`)).status).toBe(404);
    const add = await req("POST", `/documents/${gone.id}/deks`, { v: 1, wrapped: "i.k" });
    expect(add.status).toBe(200);
    expect(await json(add)).toMatchObject({ id: gone.id, deks: [{ v: 1, wrapped: "i.k" }] });
    for (const seq of [1, 2]) {
      const rw = await req("PUT", `/documents/${gone.id}/revisions/${seq}/rewrite`, { bodyHtml: `c${seq}.d`, keyVersion: 1 });
      expect(rw.status).toBe(200);
      expect(await json(rw)).toMatchObject({ seq, keyVersion: 1 });
    }
    expect((await as("u2", "PUT", `/documents/${gone.id}/revisions/1/rewrite`, { bodyHtml: "no.no", keyVersion: 1 })).status).toBe(404);
    expect((await as("u2", "POST", `/documents/${gone.id}/deks`, { v: 2, wrapped: "x" })).status).toBe(404);
    // restoring brings the migrated revisions back as they are
    expect((await req("POST", `/documents/${gone.id}/restore-deleted`)).status).toBe(200);
    expect(await json(await req("GET", `/documents/${gone.id}/revisions/2`))).toMatchObject({ bodyHtml: "c2.d", keyVersion: 1 });
  });

  it("the first request of a fresh user can be PUT /me/vault (the user row is ensured)", async () => {
    const fresh = await token("fresh");
    expect(await store.getUser("fresh")).toBeNull();
    const r = await app.request("/me/vault", { method: "PUT", headers: { authorization: "Bearer " + fresh, "content-type": "application/json" }, body: JSON.stringify(VAULT) });
    expect(r.status).toBe(201);
    expect((await store.getUser("fresh"))!.email).toBe("fresh@x.org");
    expect((await store.getVault("fresh"))!.passWrapped).toBe(VAULT.passWrapped);
  });

  it("a dek for another version than the write's key version is refused and not stored", async () => {
    const doc = await makeDoc();
    await req("POST", `/documents/${doc.id}/deks`, { v: 1, wrapped: "k1" });
    const r = await req("PUT", `/documents/${doc.id}`, { bodyHtml: "a.b", keyVersion: 1, wordCount: 1, originStats: ZERO_STATS, dek: { v: 2, wrapped: "k2" } });
    expect(r.status).toBe(400);
    expect(await json(r)).toEqual({ error: "invalid" });
    const got = await json(await req("GET", `/documents/${doc.id}`));
    expect(got.deks).toEqual([{ v: 1, wrapped: "k1" }]);
    expect(got.currentSeq).toBe(1);
  });

  it("ciphertext document creation hands its dek to createDocument in one step, so no key-less revision can be left behind", async () => {
    const failing = new MemoryStore();
    const calls: unknown[][] = [];
    const orig = failing.createDocument.bind(failing);
    failing.createDocument = (...a: Parameters<MemoryStore["createDocument"]>) => { calls.push(a); return orig(...a); };
    failing.addDek = async () => { throw new Error("addDek must not be needed on create"); };
    const app2 = createApp({ store: failing, jwtSecret: SECRET });
    const h = { authorization: "Bearer " + tokens.u1, "content-type": "application/json" };
    const p = await (await app2.request("/projects", { method: "POST", headers: h, body: JSON.stringify({ title: "T" }) })).json() as { id: string };
    const r = await app2.request(`/projects/${p.id}/documents`, { method: "POST", headers: h, body: JSON.stringify({ title: "Enc", keyVersion: 1, bodyHtml: "a.b", wordCount: 1, originStats: ZERO_STATS, dek: { v: 1, wrapped: "k" } }) });
    expect(r.status).toBe(201);
    expect(((await r.json()) as { deks: unknown }).deks).toEqual([{ v: 1, wrapped: "k" }]);
    expect(calls).toHaveLength(1);
    expect(calls[0]![5]).toEqual([{ v: 1, wrapped: "k" }]);
    // the store refusing the create (foreign project) leaves nothing behind
    const miss = await app2.request(`/projects/nope/documents`, { method: "POST", headers: h, body: JSON.stringify({ title: "Enc", keyVersion: 1, bodyHtml: "a.b", wordCount: 1, originStats: ZERO_STATS, dek: { v: 1, wrapped: "k" } }) });
    expect(miss.status).toBe(404);
  });
});
