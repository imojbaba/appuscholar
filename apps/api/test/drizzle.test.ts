import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { SignJWT } from "jose";
import { sql, type SQL } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { db, users, accounts, sessions, verificationTokens, projects, documents, documentRevisions, credentials, aiUseLog, vaultKeys, auditLog, projectBlobs, type Db } from "@appuscholar/db";
import * as schema from "../../../packages/db/src/schema";
import { storeContract } from "./store.contract";
import { DrizzleStore, isUniqueViolation } from "../src/store/drizzle";
import { VersionConflictError } from "../src/store/types";
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

/** Both drivers (pglite here, node-postgres with DATABASE_URL) answer a raw query with { rows }. */
const rawRows = async <T,>(d: Db, q: SQL) => ((await d.execute(q)) as unknown as { rows: T[] }).rows;
type Column = { table_schema: string; table_name: string; column_name: string };
/** Every column of every table, in every schema but the system ones. */
const allColumns = (d: Db) => rawRows<Column>(d, sql`
  select c.table_schema, c.table_name, c.column_name from information_schema.columns c
  join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
  where c.table_schema not in ('pg_catalog', 'information_schema')
  order by 1, 2, 3`);
const quoteId = (id: string) => '"' + id.replaceAll('"', '""') + '"';
/** For each column, read as text, how many rows contain any of the needles; only columns with a hit are listed, as "table.column". */
async function hitCounts(d: Db, cols: Column[], needles: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const c of cols) {
    const any = sql.join(needles.map((n) => sql`strpos(${sql.raw(quoteId(c.column_name))}::text, ${n}) > 0`), sql` or `);
    const [r] = await rawRows<{ n: number }>(d, sql`select count(*)::int as n from ${sql.raw(quoteId(c.table_schema) + "." + quoteId(c.table_name))} where ${any}`);
    if (r!.n > 0) out[`${c.table_name}.${c.column_name}`] = r!.n;
  }
  return out;
}
const USER_TABLES = ["users", "accounts", "sessions", "verification_tokens", "projects", "documents", "document_revisions", "credentials", "ai_use_log", "vault_keys", "audit_log", "project_blobs"];

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

    it("deleting a project removes its blob rows by cascade", async () => {
      const { d, store, users: u } = await makeEnv();
      const p = await store.createProject(u.a, "Sleep");
      const keep = await store.createProject(u.a, "Keep");
      await store.putBlob(u.a, p.id, "idea_intake", { body: "{}", keyVersion: 0 });
      await store.putBlob(u.a, p.id, "shelf_paper:x1", { body: "{}", keyVersion: 0 });
      await store.putBlob(u.a, keep.id, "idea_intake", { body: "{}", keyVersion: 0 });
      expect(await d.select().from(projectBlobs)).toHaveLength(3);
      expect(await store.deleteProject(u.a, p.id)).toBe(true);
      expect((await d.select().from(projectBlobs)).map((r) => r.projectId)).toEqual([keep.id]);
    });

    it("two concurrent puts with the same expectedVersion: exactly one succeeds", async () => {
      const { store, users: u } = await makeEnv();
      const p = await store.createProject(u.a, "Sleep");
      await store.putBlob(u.a, p.id, "citations", { body: "[0]", keyVersion: 0 });
      for (const expectedVersion of [1, 2]) {
        const results = await Promise.allSettled(["[a]", "[b]"].map((body) => store.putBlob(u.a, p.id, "citations", { body, keyVersion: 0, expectedVersion })));
        const won = results.filter((r) => r.status === "fulfilled");
        const lost = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
        expect(won).toHaveLength(1);
        expect(lost).toHaveLength(1);
        expect(lost[0]!.reason).toBeInstanceOf(VersionConflictError);
        expect((lost[0]!.reason as VersionConflictError).current).toBe(expectedVersion + 1);
        const stored = (await store.getBlob(u.a, p.id, "citations"))!;
        expect(stored.version).toBe(expectedVersion + 1);
        expect(stored.body).toBe((won[0] as PromiseFulfilledResult<{ body: string }>).value.body);
      }
      // Two concurrent creates of a missing kind: one inserts, the other conflicts.
      const creates = await Promise.allSettled(["[x]", "[y]"].map((body) => store.putBlob(u.a, p.id, "shelf_index", { body, keyVersion: 0, expectedVersion: 0 })));
      expect(creates.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(creates.filter((r) => r.status === "rejected" && r.reason instanceof VersionConflictError)).toHaveLength(1);
    });

    it("a row from before the version column reads as version 0 and takes a create-style save", async () => {
      const { d, store, users: u } = await makeEnv();
      const p = await store.createProject(u.a, "Sleep");
      await d.execute(sql`insert into project_blobs (id, project_id, kind, body) values (${crypto.randomUUID()}, ${p.id}, 'idea_intake', '{}')`);
      expect((await store.getBlob(u.a, p.id, "idea_intake"))!.version).toBe(0);
      await expect(store.putBlob(u.a, p.id, "idea_intake", { body: "x", keyVersion: 0, expectedVersion: 1 })).rejects.toBeInstanceOf(VersionConflictError);
      expect((await store.putBlob(u.a, p.id, "idea_intake", { body: '{"q":1}', keyVersion: 0, expectedVersion: 0 }))!.version).toBe(1);
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
        checkWrapped: await seal(vk, new TextEncoder().encode("appuscholar-vault-check")),
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

      // A stage blob (the idea intake, say) sealed the same way, under its own key: the server stores it as it came.
      const blobDek = await aesKey();
      const blobBody = await seal(blobDek, new TextEncoder().encode(JSON.stringify({ question: SENTENCE })));
      const blobWrapped = await seal(vk, new Uint8Array(await crypto.subtle.exportKey("raw", blobDek)));
      const blobPut = await req("PUT", `/projects/${project.id}/blobs/idea_intake`, { body: blobBody, keyVersion: 1, dek: { v: 1, wrapped: blobWrapped } });
      expect(blobPut.status).toBe(200);

      // Every column of every table, read as text.
      const cols = await allColumns(d);
      const hitsFor = async (needle: string) => Object.keys(await hitCounts(d, cols, [needle]));
      const tables = new Set(cols.map((c) => c.table_name));
      for (const t of USER_TABLES) expect(tables, t).toContain(t);

      expect(await hitsFor("Procrastination")).toEqual([]);
      // The scan does read the stored body: the ciphertext itself is found where it was written, and nowhere else.
      expect(await hitsFor(body)).toEqual(["document_revisions.body_html"]);
      expect(await hitsFor(wrapped)).toEqual(["documents.deks"]);
      expect(await hitsFor(blobBody)).toEqual(["project_blobs.body"]);
      expect(await hitsFor(blobWrapped)).toEqual(["project_blobs.deks"]);

      const revisions = await d.select().from(documentRevisions).orderBy(documentRevisions.seq);
      expect(revisions.map((r) => ({ documentId: r.documentId, seq: r.seq, keyVersion: r.keyVersion, bodyHtml: r.bodyHtml, wordCount: r.wordCount }))).toEqual([
        { documentId: doc.id, seq: 1, keyVersion: 0, bodyHtml: "", wordCount: 0 },
        { documentId: doc.id, seq: 2, keyVersion: 1, bodyHtml: body, wordCount: 4 }
      ]);
    });
  });
}

if (!url) {
  describe("account erasure is complete", () => {
    /** One of everything that names a user: auth rows, sign-in tokens, work, keys, the AI-use log, the vault and the audit log. */
    async function seed(d: Db, store: DrizzleStore, id: string) {
      const email = `${id}@contract.local`;
      await d.insert(accounts).values({ userId: id, type: "oauth", provider: "google", providerAccountId: "g-" + id, access_token: "at-" + id });
      await d.insert(sessions).values({ sessionToken: "s-" + id, userId: id, expires: new Date(Date.now() + 86_400_000) });
      await d.insert(verificationTokens).values({ identifier: email, token: "vt-" + id, expires: new Date(Date.now() + 86_400_000) });
      const p = await store.createProject(id, "Thesis of " + id);
      const doc = (await store.createDocument(id, p.id, "Draft", "draft", { bodyHtml: "<p>words</p>", authorKind: "web", authorLabel: email, wordCount: 1, keyVersion: 0 }))!;
      await store.appendRevision(id, doc.id, { bodyHtml: "<p>more words</p>", authorKind: "web", authorLabel: email, wordCount: 2, keyVersion: 0 });
      await store.getScratchProject(id);
      await store.putCredential(id, "groq", "s.i.c");
      await store.appendAiUse(id, p.id, { d: "2026-10-16", p: "groq", m: "llama", k: "rewrite", g: "text" });
      await store.putVault(id, { passWrapped: "s.i.p", recoveryWrapped: "s.i.r", checkWrapped: "i.c", publicKey: null, privateKeyWrapped: null });
      await store.putBlob(id, p.id, "idea_intake", { body: "{}", keyVersion: 0 });
      await store.appendAudit(id, "export");
      // Every user-identifying value of this user: its id and email, and the ids of the rows that hang off it.
      return [id, email, p.id, doc.id];
    }

    it("leaves no row that names the erased user outside audit_log, and leaves the other user's rows as they were", async () => {
      const { d, store, users: u } = await makeEnv();
      const needlesA = await seed(d, store, u.a);
      const needlesB = await seed(d, store, u.b);
      const cols = await allColumns(d);
      const tablesOf = (hits: Record<string, number>) => [...new Set(Object.keys(hits).map((k) => k.split(".")[0]!))].sort();

      // The seed reaches every table that can name a user (so the walk below would see a leftover anywhere).
      const beforeA = await hitCounts(d, cols, needlesA);
      expect(tablesOf(beforeA)).toEqual([...USER_TABLES].sort());
      const beforeB = await hitCounts(d, cols, needlesB);
      expect(tablesOf(beforeB)).toEqual([...USER_TABLES].sort());
      // The tables the seed wrote straight are the auth adapter's; the store wrote the rest.
      expect(await d.select().from(verificationTokens)).toEqual(expect.arrayContaining([expect.objectContaining({ identifier: `${u.a}@contract.local` })]));

      expect(await store.eraseUser(u.a)).toBe(true);

      const afterA = await hitCounts(d, cols, needlesA);
      expect(Object.keys(afterA)).toEqual(["audit_log.user_id"]);
      expect(afterA["audit_log.user_id"]).toBe(2); // the export before, and the account-erased row
      expect((await store.listAudit(u.a)).map((e) => e.action)).toEqual(["export", "account-erased"]);
      expect(await hitCounts(d, cols, needlesB)).toEqual(beforeB);
      // And row for row, b keeps every table's rows.
      for (const t of [users, accounts, sessions, projects, credentials, aiUseLog, vaultKeys, auditLog]) {
        const owner = "userId" in t ? t.userId : (t as typeof users).id;
        expect((await d.select().from(t).where(sql`${owner} = ${u.b}`)).length, String(t)).toBeGreaterThan(0);
      }
      expect(await d.select().from(documents)).not.toHaveLength(0);
      expect(await d.select().from(documentRevisions)).not.toHaveLength(0);
      expect(await d.select().from(projectBlobs)).toHaveLength(1);
    });
  });
}
