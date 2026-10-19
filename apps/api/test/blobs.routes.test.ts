import { describe, it, expect, beforeEach } from "vitest";
import { SignJWT } from "jose";
import { createApp } from "../src/app";
import { MemoryStore } from "../src/store/memory";
import { BLOB_KINDS, isBlobKind } from "../src/routes/blobWrite";

const SECRET = "test-secret-test-secret-test-secret-1234";
const key = new TextEncoder().encode(SECRET);
const VAULT = { passWrapped: "s.i.c", recoveryWrapped: "s.i.r", checkWrapped: "i.chk", publicKey: "pk", privateKeyWrapped: "i.p" };
/** A body in the shape the browser seals (16-character IV "." ciphertext, base64url): the api checks the shape, never the content. */
const ct = (tag: string) => { const [iv, rest] = tag.split("."); return iv!.padEnd(16, "A") + "." + rest!; };
const MAX = 64 * 1024;

async function token(sub: string) {
  return new SignJWT({ email: sub + "@x.org" }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1000) + 900).sign(key);
}

describe("blob routes", () => {
  let store: MemoryStore;
  let app: ReturnType<typeof createApp>;
  let tokens: Record<string, string>;
  let pid: string;
  beforeEach(async () => {
    store = new MemoryStore();
    app = createApp({ store, jwtSecret: SECRET, maxBodyBytes: MAX });
    tokens = { u1: await token("u1"), u2: await token("u2") };
    pid = (await json<{ id: string }>(await req("POST", "/projects", { title: "Sleep" }))).id;
  });
  const as = (u: string, method: string, path: string, body?: unknown) =>
    app.request(path, { method, headers: { authorization: "Bearer " + tokens[u], "content-type": "application/json" }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  const req = (method: string, path: string, body?: unknown) => as("u1", method, path, body);
  const json = async <T = any>(r: Response) => (await r.json()) as T; // eslint-disable-line @typescript-eslint/no-explicit-any
  const blob = (kind: string, p = pid) => `/projects/${p}/blobs/${kind}`;

  it("kinds: the fixed list, and shelf_paper:<id> with a 1-64 character [A-Za-z0-9_-] id", () => {
    expect(BLOB_KINDS).toEqual(["idea_intake", "citations", "retraction_cache", "refcheck_cache", "shelf_index", "ap_notes", "ap_cols", "rs_prefs"]);
    for (const k of [...BLOB_KINDS, "shelf_paper:a", "shelf_paper:" + "x".repeat(64), "shelf_paper:A-b_9"]) expect(isBlobKind(k), k).toBe(true);
    for (const k of ["", "notes", "IDEA_INTAKE", "shelf_paper:", "shelf_paper:" + "x".repeat(65), "shelf_paper:a.b", "shelf_paper:a b", "shelf_paper:a/b", "shelf_paper", "idea_intake:x"]) expect(isBlobKind(k), k).toBe(false);
  });

  it("puts, gets and lists a plaintext blob while no vault exists; a second put replaces it", async () => {
    expect((await req("GET", blob("idea_intake"))).status).toBe(404);
    expect(await json(await req("GET", `/projects/${pid}/blobs`))).toEqual([]);
    const put = await req("PUT", blob("idea_intake"), { body: '{"q":"<b>sleep</b>"}', keyVersion: 0 });
    expect(put.status).toBe(200);
    const got = await json(put);
    // Stored as given: a blob body is JSON, never sanitised as HTML.
    expect(got).toEqual({ kind: "idea_intake", body: '{"q":"<b>sleep</b>"}', keyVersion: 0, deks: [], updatedAt: expect.any(String) });
    expect(await json(await req("GET", blob("idea_intake")))).toEqual(got);
    const again = await json(await req("PUT", blob("idea_intake"), { body: "{}", keyVersion: 0 }));
    expect(again.body).toBe("{}");
    const list = await json(await req("GET", `/projects/${pid}/blobs`));
    expect(list).toEqual([{ kind: "idea_intake", keyVersion: 0, updatedAt: again.updatedAt }]);
  });

  it("answers 404 for another user's project or a missing one, on every blob route", async () => {
    await req("PUT", blob("citations"), { body: "[]", keyVersion: 0 });
    for (const [m, path, body] of [
      ["GET", `/projects/${pid}/blobs`, undefined],
      ["GET", blob("citations"), undefined],
      ["PUT", blob("citations"), { body: "[]", keyVersion: 0 }],
      ["PUT", blob("citations") + "/rewrite", { body: ct("a.b"), keyVersion: 1, dek: { v: 1, wrapped: "k" } }]
    ] as const) {
      const r = await as("u2", m, path, body);
      expect(r.status, `${m} ${path}`).toBe(404);
      expect(await json(r)).toEqual({ error: "not-found" });
    }
    expect((await req("GET", blob("citations", "nope"))).status).toBe(404);
    expect((await json(await req("GET", blob("citations")))).body).toBe("[]");
  });

  it("requires a bearer token", async () => {
    for (const [m, p] of [["GET", `/projects/${pid}/blobs`], ["GET", blob("citations")], ["PUT", blob("citations")], ["PUT", blob("citations") + "/rewrite"]] as const)
      expect((await app.request(p, { method: m })).status, `${m} ${p}`).toBe(401);
  });

  it("refuses a bad kind or a bad body with 400 invalid", async () => {
    for (const k of ["notes", "shelf_paper:", "shelf_paper:a.b", encodeURIComponent("shelf_paper:" + "x".repeat(65))]) {
      for (const [m, path, body] of [["GET", blob(k), undefined], ["PUT", blob(k), { body: "{}", keyVersion: 0 }], ["PUT", blob(k) + "/rewrite", { body: ct("a.b"), keyVersion: 1 }]] as const) {
        const r = await req(m, path, body);
        expect(r.status, `${m} ${k}`).toBe(400);
        expect(await json(r)).toEqual({ error: "invalid" });
      }
    }
    for (const body of ["not json", { body: "{}" }, { keyVersion: 0 }, { body: 3, keyVersion: 0 }, { body: "{}", keyVersion: -1 }, { body: "{}", keyVersion: 0, extra: 1 }, { body: ct("a.b"), keyVersion: 1, dek: { v: 1 } }])
      expect((await req("PUT", blob("citations"), body)).status, JSON.stringify(body)).toBe(400);
  });

  it("a shelf_paper:<id> kind round-trips, raw or percent-encoded in the path", async () => {
    expect((await req("PUT", blob("shelf_paper:10-1000_x"), { body: '{"t":"text"}', keyVersion: 0 })).status).toBe(200);
    expect(await json(await req("GET", blob(encodeURIComponent("shelf_paper:10-1000_x"))))).toMatchObject({ kind: "shelf_paper:10-1000_x", body: '{"t":"text"}' });
    expect((await json(await req("GET", `/projects/${pid}/blobs`))).map((x: { kind: string }) => x.kind)).toEqual(["shelf_paper:10-1000_x"]);
  });

  it("works on the scratch project", async () => {
    const scratch = await store.getScratchProject("u1");
    expect((await req("PUT", blob("rs_prefs", scratch.id), { body: "{}", keyVersion: 0 })).status).toBe(200);
    expect((await json(await req("GET", blob("rs_prefs", scratch.id)))).body).toBe("{}");
  });

  it("refuses keyVersion 0 with 409 vault-required once a vault exists, complete or not", async () => {
    await req("PUT", blob("citations"), { body: "[]", keyVersion: 0 });
    await req("PUT", "/me/vault", VAULT);
    const r = await req("PUT", blob("citations"), { body: "[1]", keyVersion: 0 });
    expect(r.status).toBe(409);
    expect(await json(r)).toEqual({ error: "vault-required" });
    expect((await req("PUT", blob("idea_intake"), { body: "{}", keyVersion: 0 })).status).toBe(409);
    expect((await json(await req("GET", blob("citations")))).body).toBe("[]");
    // Ciphertext still goes in.
    expect((await req("PUT", blob("idea_intake"), { body: ct("a.b"), keyVersion: 1, dek: { v: 1, wrapped: "k" } })).status).toBe(200);
    // Another user without a vault still writes plaintext.
    const other = (await json<{ id: string }>(await as("u2", "POST", "/projects", { title: "T" }))).id;
    expect((await as("u2", "PUT", blob("citations", other), { body: "[]", keyVersion: 0 })).status).toBe(200);
  });

  it("ciphertext: the body must have the sealed shape, and the dek rules are the documents'", async () => {
    // A key version claimed for a body that is not ciphertext-shaped.
    const notSealed = await req("PUT", blob("citations"), { body: '{"plain":"text"}', keyVersion: 1, dek: { v: 1, wrapped: "k" } });
    expect(notSealed.status).toBe(400);
    expect(await json(notSealed)).toEqual({ error: "invalid" });
    // No dek for an unknown version.
    const unknown = await req("PUT", blob("citations"), { body: ct("a.b"), keyVersion: 1 });
    expect(unknown.status).toBe(400);
    expect(await json(unknown)).toEqual({ error: "unknown-key-version" });
    // A dek for another version than the body's.
    expect(await json(await req("PUT", blob("citations"), { body: ct("a.b"), keyVersion: 2, dek: { v: 1, wrapped: "k" } }))).toEqual({ error: "invalid" });
    expect((await req("GET", blob("citations"))).status).toBe(404);
    // The first sealed write brings its dek; the same wrap retried is fine; a known version needs none.
    const first = await json(await req("PUT", blob("citations"), { body: ct("a.b"), keyVersion: 1, dek: { v: 1, wrapped: "k" } }));
    expect(first).toMatchObject({ body: ct("a.b"), keyVersion: 1, deks: [{ v: 1, wrapped: "k" }] });
    expect((await req("PUT", blob("citations"), { body: ct("c.d"), keyVersion: 1, dek: { v: 1, wrapped: "k" } })).status).toBe(200);
    expect((await req("PUT", blob("citations"), { body: ct("e.f"), keyVersion: 1 })).status).toBe(200);
    const clash = await req("PUT", blob("citations"), { body: ct("g.h"), keyVersion: 1, dek: { v: 1, wrapped: "other" } });
    expect(clash.status).toBe(409);
    expect(await json(clash)).toEqual({ error: "dek-exists" });
    expect(await json(await req("GET", blob("citations")))).toMatchObject({ body: ct("e.f"), deks: [{ v: 1, wrapped: "k" }] });
  });

  it("answers 413 too-large over the body limit", async () => {
    const big = { body: "x".repeat(MAX), keyVersion: 0 };
    const r = await req("PUT", blob("shelf_paper:p1"), big);
    expect(r.status).toBe(413);
    expect(await json(r)).toEqual({ error: "too-large" });
    await req("PUT", blob("shelf_paper:p1"), { body: "{}", keyVersion: 0 });
    expect((await req("PUT", blob("shelf_paper:p1") + "/rewrite", { body: ct("a." + "b".repeat(MAX)), keyVersion: 1, dek: { v: 1, wrapped: "k" } })).status).toBe(413);
  });

  it("the default limit is the documents' 2.8 MB", async () => {
    const def = createApp({ store, jwtSecret: SECRET });
    const put = (n: number) => def.request(blob("shelf_paper:big"), { method: "PUT", headers: { authorization: "Bearer " + tokens.u1, "content-type": "application/json" }, body: JSON.stringify({ body: "x".repeat(n), keyVersion: 0 }) });
    const overhead = JSON.stringify({ body: "", keyVersion: 0 }).length;
    expect((await put(2.8 * 1024 * 1024 - overhead - 1)).status).toBe(200);
    expect((await put(2.8 * 1024 * 1024 - overhead + 1)).status).toBe(413);
  });

  it("rewrite seals a plaintext blob with its dek in one request, then counts no plaintext; closed once the vault is complete", async () => {
    await req("PUT", blob("idea_intake"), { body: '{"q":"sleep"}', keyVersion: 0 });
    await req("PUT", "/me/vault", VAULT);
    const early = await req("POST", "/me/vault/complete");
    expect(early.status).toBe(409);
    expect(await json(early)).toEqual({ error: "plaintext-remains", count: 1 });
    // The rewrite route checks the shape and the dek rules too.
    expect((await req("PUT", blob("idea_intake") + "/rewrite", { body: "{}", keyVersion: 1, dek: { v: 1, wrapped: "k" } })).status).toBe(400);
    expect((await req("PUT", blob("idea_intake") + "/rewrite", { body: ct("a.b"), keyVersion: 0 })).status).toBe(400);
    expect(await json(await req("PUT", blob("idea_intake") + "/rewrite", { body: ct("a.b"), keyVersion: 1 }))).toEqual({ error: "unknown-key-version" });
    expect(await json(await req("PUT", blob("idea_intake") + "/rewrite", { body: ct("a.b"), keyVersion: 1, dek: { v: 2, wrapped: "k" } }))).toEqual({ error: "invalid" });
    expect(await json(await req("PUT", blob("citations") + "/rewrite", { body: ct("a.b"), keyVersion: 1, dek: { v: 1, wrapped: "k" } }))).toEqual({ error: "not-found" });
    const sealed = await req("PUT", blob("idea_intake") + "/rewrite", { body: ct("a.b"), keyVersion: 1, dek: { v: 1, wrapped: "k" } });
    expect(sealed.status).toBe(200);
    expect(await json(sealed)).toEqual({ kind: "idea_intake", body: ct("a.b"), keyVersion: 1, deks: [{ v: 1, wrapped: "k" }], updatedAt: expect.any(String) });
    // Retried: the same wrap is fine, another wrap for v1 is refused.
    expect((await req("PUT", blob("idea_intake") + "/rewrite", { body: ct("a.b"), keyVersion: 1, dek: { v: 1, wrapped: "k" } })).status).toBe(200);
    expect(await json(await req("PUT", blob("idea_intake") + "/rewrite", { body: ct("c.d"), keyVersion: 1, dek: { v: 1, wrapped: "x" } }))).toEqual({ error: "dek-exists" });
    expect((await req("POST", "/me/vault/complete")).status).toBe(204);
    const closed = await req("PUT", blob("idea_intake") + "/rewrite", { body: ct("e.f"), keyVersion: 1 });
    expect(closed.status).toBe(409);
    expect(await json(closed)).toEqual({ error: "migration-closed" });
    expect((await json(await req("GET", blob("idea_intake")))).body).toBe(ct("a.b"));
    // After completion the ordinary write path still takes ciphertext.
    expect((await req("PUT", blob("idea_intake"), { body: ct("g.h"), keyVersion: 1 })).status).toBe(200);
  });

  it("deleting the project takes its blobs", async () => {
    await req("PUT", blob("ap_cols"), { body: "[]", keyVersion: 0 });
    expect((await req("DELETE", `/projects/${pid}`)).status).toBe(204);
    expect((await req("GET", blob("ap_cols"))).status).toBe(404);
    expect(await store.countPlaintextRevisions("u1")).toBe(0);
  });
});
