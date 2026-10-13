import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { db, users, type Db } from "@appuscholar/db";
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

storeContract("drizzle", async () => {
  const d = await makeDb();
  await d.insert(users).values([{ id: "u1", email: "u1@x.org" }, { id: "u2", email: "u2@x.org" }]).onConflictDoNothing();
  return new DrizzleStore(d);
});
