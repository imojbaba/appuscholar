import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { SignJWT } from "jose";
import { sql, type SQL } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { db, users, documents, documentRevisions, type Db } from "@appuscholar/db";
import * as schema from "../../../packages/db/src/schema";
import { storeContract } from "./store.contract";
import { DrizzleStore, isUniqueViolation } from "../src/store/drizzle";
import { createApp } from "../src/app";

const migrationsFolder = fileURLToPath(new URL("../../../packages/db/migrations", import.meta.url));
const url = process.env.DATABASE_URL;

async function makeDb(): Promise<Db> {
  if (url) return db(url);
  const d = drizzle(new PGlite(), { schema });
  await migrate(d, { migrationsFolder });
  return d;
}

async function makeEnv() {
  const d = await makeDb();
  const a = "u-" + crypto.randomUUID();
  const b = "u-" + crypto.randomUUID();
  await d.insert(users).values([{ id: a, email: `${a}@contract.local` }, { id: b, email: `${b}@contract.local` }]);
  return { d, store: new DrizzleStore(d), users: { a, b } };
}

storeContract("drizzle", async () => {
  const { store, users: u } = await makeEnv();
  return { store, users: u };
});

if (!url) {
  describe("DrizzleStore concurrency guard", () => {
    it("rejects a duplicate (document_id, seq) and keeps appending from the max seq", async () => {
      const { d, store, users: u } = await makeEnv();
      const p = await store.createProject(u.a, "Sleep");
      const doc = (await store.createDocument(u.a, p.id, "Draft", "draft", { bodyHtml: "", authorKind: "web", authorLabel: u.a, wordCount: 0, keyVersion: 0 }))!;
      const dup = await d.insert(documentRevisions).values({ documentId: doc.id, seq: 1, bodyHtml: "dup", authorKind: "web", authorLabel: u.a, wordCount: 0 }).then(() => null, (e: unknown) => e);
      expect(dup).toBeInstanceOf(Error);
      expect(isUniqueViolation(dup)).toBe(true);
      const next = await store.appendRevision(u.a, doc.id, { bodyHtml: "<p>a</p>", authorKind: "web", authorLabel: u.a, wordCount: 1, keyVersion: 0 });
      expect(next?.seq).toBe(2);
    });

    it("retries an append that loses the (document_id, seq) race", async () => {
      const { d, store, users: u } = await makeEnv();
      const p = await store.createProject(u.a, "Sleep");
      const doc = (await store.createDocument(u.a, p.id, "Draft", "draft", { bodyHtml: "", authorKind: "web", authorLabel: u.a, wordCount: 0, keyVersion: 0 }))!;
      const realInsert = d.insert.bind(d);
      let raced = 0;
      // Simulate a concurrent writer: the first insert attempt fails like Postgres does when another append took the seq.
      (d as { insert: unknown }).insert = ((table: Parameters<typeof realInsert>[0]) => {
        if (table === documentRevisions && raced++ === 0) throw new Error("Failed query", { cause: Object.assign(new Error("duplicate key"), { code: "23505" }) });
        return realInsert(table);
      }) as typeof realInsert;
      const next = await store.appendRevision(u.a, doc.id, { bodyHtml: "<p>a</p>", authorKind: "web", authorLabel: u.a, wordCount: 1, keyVersion: 0 });
      expect(raced).toBe(2);
      expect(next?.seq).toBe(2);
      (d as { insert: unknown }).insert = realInsert;
    });

    it("does not retry other database errors", async () => {
      const { d, store, users: u } = await makeEnv();
      const p = await store.createProject(u.a, "Sleep");
      const doc = (await store.createDocument(u.a, p.id, "Draft", "draft", { bodyHtml: "", authorKind: "web", authorLabel: u.a, wordCount: 0, keyVersion: 0 }))!;
      const realInsert = d.insert.bind(d);
      let calls = 0;
      (d as { insert: unknown }).insert = ((table: Parameters<typeof realInsert>[0]) => {
        if (table === documentRevisions) { calls++; throw Object.assign(new Error("boom"), { code: "57014" }); }
        return realInsert(table);
      }) as typeof realInsert;
      await expect(store.appendRevision(u.a, doc.id, { bodyHtml: "<p>a</p>", authorKind: "web", authorLabel: u.a, wordCount: 1, keyVersion: 0 })).rejects.toThrow("boom");
      expect(calls).toBe(1);
      (d as { insert: unknown }).insert = realInsert;
    });

    it("recognises wrapped and unwrapped unique violations", () => {
      expect(isUniqueViolation(Object.assign(new Error("x"), { code: "23505" }))).toBe(true);
      expect(isUniqueViolation(new Error("Failed query", { cause: { code: "23505" } }))).toBe(true);
      expect(isUniqueViolation(new Error("x"))).toBe(false);
      expect(isUniqueViolation(null)).toBe(false);
    });

    it("tolerates an orphan document without revisions", async () => {
      const { d, store, users: u } = await makeEnv();
      const p = await store.createProject(u.a, "Sleep");
      const good = (await store.createDocument(u.a, p.id, "Draft", "draft", { bodyHtml: "", authorKind: "web", authorLabel: u.a, wordCount: 0, keyVersion: 0 }))!;
      const [orphan] = await d.insert(documents).values({ projectId: p.id, title: "Orphan" }).returning();
      expect((await store.listDocuments(u.a, p.id))?.map(x => x.id)).toEqual([good.id]);
      expect(await store.getDocument(u.a, orphan!.id)).toBeNull();
    });
  });
}

if (!url) {
  describe("server blindness", () => {
    const SECRET = "test-secret-test-secret-test-secret-1234";
    const SENTENCE = "Procrastination delays important work.";
    const b64 = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString("base64url");
    /** AES-GCM under `key`, as the browser seals a body: base64url iv "." base64url ciphertext. */
    async function seal(key: CryptoKey, bytes: Uint8Array<ArrayBuffer>): Promise<string> {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      return b64(iv) + "." + b64(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes));
    }
    const aesKey = () => crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);

    it("after an encrypted save no table holds the plaintext sentence", async () => {
      const d = await makeDb();
      const app = createApp({ store: new DrizzleStore(d), jwtSecret: SECRET });
      const sub = "u-" + crypto.randomUUID();
      const token = await new SignJWT({ email: sub + "@blind.local" }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setIssuedAt()
        .setExpirationTime(Math.floor(Date.now() / 1000) + 900).sign(new TextEncoder().encode(SECRET));
      const req = (method: string, path: string, body?: unknown) =>
        app.request(path, { method, headers: { authorization: "Bearer " + token, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

      // The user (GET /me makes the row, as the web app's first call does), a project and its document: an empty plaintext first revision.
      expect((await req("GET", "/me")).status).toBe(200);
      const project = (await (await req("POST", "/projects", { title: "Thesis" })).json()) as { id: string };
      const created = await req("POST", `/projects/${project.id}/documents`, { title: "Draft" });
      expect(created.status).toBe(201);
      const doc = (await created.json()) as { id: string };

      // The vault, as the browser makes it: a vault key wrapped twice, a public key and the private key wrapped under the vault key.
      const vk = await aesKey();
      const rawVk = new Uint8Array(await crypto.subtle.exportKey("raw", vk));
      const kp = (await crypto.subtle.generateKey({ name: "X25519" }, true, ["deriveBits"])) as CryptoKeyPair;
      const vault = {
        passWrapped: "salt." + (await seal(await aesKey(), rawVk)),
        recoveryWrapped: "salt." + (await seal(await aesKey(), rawVk)),
        publicKey: b64(await crypto.subtle.exportKey("raw", kp.publicKey)),
        privateKeyWrapped: await seal(vk, new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey)))
      };
      expect((await req("PUT", "/me/vault", vault)).status).toBe(201);

      // The document's key under the vault key, and the sentence under the document's key. The server never holds either key.
      const dek = await aesKey();
      const body = await seal(dek, new TextEncoder().encode(`<p>${SENTENCE}</p>`));
      const wrapped = await seal(vk, new Uint8Array(await crypto.subtle.exportKey("raw", dek)));
      const stats = { typed: 4, ai: 0, passages: 0, kept: 0, edited: 0, unknown: 0 };
      const put = await req("PUT", `/documents/${doc.id}`, { bodyHtml: body, keyVersion: 1, wordCount: 4, originStats: stats, dek: { v: 1, wrapped } });
      expect(put.status).toBe(200);

      // Both drivers (pglite here, node-postgres with DATABASE_URL) answer a raw query with { rows }.
      const rows = async <T,>(q: SQL) => ((await d.execute(q)) as unknown as { rows: T[] }).rows;
      // Every column of every table, in every schema but the system ones, read as text.
      const cols = await rows<{ table_schema: string; table_name: string; column_name: string }>(sql`
        select c.table_schema, c.table_name, c.column_name from information_schema.columns c
        join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
        where c.table_schema not in ('pg_catalog', 'information_schema')
        order by 1, 2, 3`);
      const q = (id: string) => '"' + id.replaceAll('"', '""') + '"';
      const hitsFor = async (needle: string) => {
        const hits: string[] = [];
        for (const c of cols) {
          const [r] = await rows<{ n: number }>(sql`select count(*)::int as n from ${sql.raw(q(c.table_schema) + "." + q(c.table_name))} where strpos(${sql.raw(q(c.column_name))}::text, ${needle}) > 0`);
          if (r!.n > 0) hits.push(`${c.table_name}.${c.column_name}`);
        }
        return hits;
      };
      const tables = new Set(cols.map((c) => c.table_name));
      for (const t of ["users", "accounts", "sessions", "verification_tokens", "projects", "documents", "document_revisions", "credentials", "ai_use_log", "vault_keys", "audit_log"]) {
        expect(tables, t).toContain(t);
      }

      expect(await hitsFor("Procrastination")).toEqual([]);
      // The scan does read the stored body: the ciphertext itself is found where it was written, and nowhere else.
      expect(await hitsFor(body)).toEqual(["document_revisions.body_html"]);
      expect(await hitsFor(wrapped)).toEqual(["documents.deks"]);

      const revisions = await d.select().from(documentRevisions).orderBy(documentRevisions.seq);
      expect(revisions.map((r) => ({ documentId: r.documentId, seq: r.seq, keyVersion: r.keyVersion, bodyHtml: r.bodyHtml, wordCount: r.wordCount }))).toEqual([
        { documentId: doc.id, seq: 1, keyVersion: 0, bodyHtml: "", wordCount: 0 },
        { documentId: doc.id, seq: 2, keyVersion: 1, bodyHtml: body, wordCount: 4 }
      ]);
    });
  });
}
