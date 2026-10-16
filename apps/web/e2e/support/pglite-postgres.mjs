// Usage: from apps/web, `node e2e/support/pglite-postgres.mjs` (@electric-sql/pglite and pglite-socket are web devDependencies). Set MIGRATIONS_DIR to use another migrations folder.
// Serves an in-memory Postgres on 127.0.0.1:5433 with packages/db/migrations applied: DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = process.env.MIGRATIONS_DIR ?? fileURLToPath(new URL("../../../../packages/db/migrations/", import.meta.url));
const d = new PGlite();
for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
  for (const s of readFileSync(dir + f, "utf8").split("--> statement-breakpoint")) if (s.trim()) await d.exec(s);
}
await new PGLiteSocketServer({ db: d, port: Number(process.env.PGLITE_PORT ?? 5433), host: "127.0.0.1", maxConnections: 20 }).start();
console.log("pglite postgres ready");
