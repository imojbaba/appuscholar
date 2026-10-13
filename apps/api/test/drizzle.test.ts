import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { db, users, documents, documentRevisions, type Db } from "@appuscholar/db";
import * as schema from "../../../packages/db/src/schema";
import { storeContract } from "./store.contract";
import { DrizzleStore, isUniqueViolation } from "../src/store/drizzle";

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
      const doc = (await store.createDocument(u.a, p.id, "Draft", "draft", { bodyHtml: "", authorKind: "web", authorLabel: u.a, wordCount: 0 }))!;
      const dup = await d.insert(documentRevisions).values({ documentId: doc.id, seq: 1, bodyHtml: "dup", authorKind: "web", authorLabel: u.a, wordCount: 0 }).then(() => null, (e: unknown) => e);
      expect(dup).toBeInstanceOf(Error);
      expect(isUniqueViolation(dup)).toBe(true);
      const next = await store.appendRevision(u.a, doc.id, { bodyHtml: "<p>a</p>", authorKind: "web", authorLabel: u.a, wordCount: 1 });
      expect(next?.seq).toBe(2);
    });

    it("retries an append that loses the (document_id, seq) race", async () => {
      const { d, store, users: u } = await makeEnv();
      const p = await store.createProject(u.a, "Sleep");
      const doc = (await store.createDocument(u.a, p.id, "Draft", "draft", { bodyHtml: "", authorKind: "web", authorLabel: u.a, wordCount: 0 }))!;
      const realInsert = d.insert.bind(d);
      let raced = 0;
      // Simulate a concurrent writer: the first insert attempt fails like Postgres does when another append took the seq.
      (d as { insert: unknown }).insert = ((table: Parameters<typeof realInsert>[0]) => {
        if (table === documentRevisions && raced++ === 0) throw new Error("Failed query", { cause: Object.assign(new Error("duplicate key"), { code: "23505" }) });
        return realInsert(table);
      }) as typeof realInsert;
      const next = await store.appendRevision(u.a, doc.id, { bodyHtml: "<p>a</p>", authorKind: "web", authorLabel: u.a, wordCount: 1 });
      expect(raced).toBe(2);
      expect(next?.seq).toBe(2);
      (d as { insert: unknown }).insert = realInsert;
    });

    it("does not retry other database errors", async () => {
      const { d, store, users: u } = await makeEnv();
      const p = await store.createProject(u.a, "Sleep");
      const doc = (await store.createDocument(u.a, p.id, "Draft", "draft", { bodyHtml: "", authorKind: "web", authorLabel: u.a, wordCount: 0 }))!;
      const realInsert = d.insert.bind(d);
      let calls = 0;
      (d as { insert: unknown }).insert = ((table: Parameters<typeof realInsert>[0]) => {
        if (table === documentRevisions) { calls++; throw Object.assign(new Error("boom"), { code: "57014" }); }
        return realInsert(table);
      }) as typeof realInsert;
      await expect(store.appendRevision(u.a, doc.id, { bodyHtml: "<p>a</p>", authorKind: "web", authorLabel: u.a, wordCount: 1 })).rejects.toThrow("boom");
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
      const good = (await store.createDocument(u.a, p.id, "Draft", "draft", { bodyHtml: "", authorKind: "web", authorLabel: u.a, wordCount: 0 }))!;
      const [orphan] = await d.insert(documents).values({ projectId: p.id, title: "Orphan" }).returning();
      expect((await store.listDocuments(u.a, p.id))?.map(x => x.id)).toEqual([good.id]);
      expect(await store.getDocument(u.a, orphan!.id)).toBeNull();
    });
  });
}
