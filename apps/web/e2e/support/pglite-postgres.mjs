// The local e2e recipe (CI uses a Postgres service container the same way; see .github/workflows/ci.yml):
//  1. From apps/web, `node e2e/support/pglite-postgres.mjs` (@electric-sql/pglite and pglite-socket are web devDependencies). It serves an
//     in-memory Postgres on 127.0.0.1:5433 with packages/db/migrations applied. Set MIGRATIONS_DIR to use another migrations folder.
//  2. In another shell: `export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres` then `pnpm --filter @appuscholar/web e2e`.
//     playwright.config.ts starts the api AND the web server on that one DATABASE_URL, as in production, where both share one database:
//     sign-in (Auth.js, web) and the api (projects, documents, the vault, account erasure) then see the same users row. Nothing else to start;
//     if an api or web server is already on 8788 / 3000 it is reused, so make sure a leftover one is not on another store.
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
