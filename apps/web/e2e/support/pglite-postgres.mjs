// The local e2e recipe (CI uses a Postgres service container the same way; see .github/workflows/ci.yml):
//  1. From apps/web, `node e2e/support/pglite-postgres.mjs` (@electric-sql/pglite and pglite-socket are web devDependencies). It serves an
//     in-memory Postgres on 127.0.0.1:5433 (PGLITE_PORT to change it) with packages/db/migrations applied (every *.sql there, 0004_project_blobs.sql
//     included). Set MIGRATIONS_DIR to use another migrations folder.
//  2. In another shell: `export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres` then `pnpm --filter @appuscholar/web e2e`.
//     playwright.config.ts starts the api AND the web server on that one DATABASE_URL, as in production, where both share one database:
//     sign-in (Auth.js, web) and the api (projects, documents, the vault, the project blobs, account erasure) then see the same users row. Nothing
//     else to start. If an api or web server is already listening on the api / web port it is REUSED (reuseExistingServer), whatever checkout it
//     belongs to: check with `lsof -nP -iTCP:8788 -sTCP:LISTEN` (and 3000) first.
//  3. When another checkout's servers hold 8788 / 3000 (or another pglite holds 5433), pick free ports for all three; the specs read the same
//     variables (e2e/support/origins.ts):
//       PGLITE_PORT=5435 node e2e/support/pglite-postgres.mjs &
//       E2E_API_PORT=8790 E2E_WEB_PORT=3002 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5435/postgres pnpm --filter @appuscholar/web e2e
//     CI uses the defaults.
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
