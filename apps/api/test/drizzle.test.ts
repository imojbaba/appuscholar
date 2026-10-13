import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { db, users, documents, documentRevisions, type Db } from "@appuscholar/db";
import * as schema from "../../../packages/db/src/schema";
import { storeContract } from "./store.contract";
import { DrizzleStore } from "../src/store/drizzle";

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
      await expect(
        d.insert(documentRevisions).values({ documentId: doc.id, seq: 1, bodyHtml: "dup", authorKind: "web", authorLabel: u.a, wordCount: 0 })
      ).rejects.toThrow();
      const next = await store.appendRevision(u.a, doc.id, { bodyHtml: "<p>a</p>", authorKind: "web", authorLabel: u.a, wordCount: 1 });
      expect(next?.seq).toBe(2);
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
