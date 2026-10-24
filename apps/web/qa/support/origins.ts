import path from "node:path";

/**
 * The ports, origins, secrets and database the QA layer runs on. They differ from the e2e suite's (8788 / 3000 / 5433) so a QA run never meets, and
 * never adopts, a server another checkout or session left on those ports. `run-local.mjs` repeats the three port defaults (it is plain Node and cannot
 * import this file): change them in both places.
 */
export const QA_API_PORT = Number(process.env.QA_API_PORT || 8798);
export const QA_WEB_PORT = Number(process.env.QA_WEB_PORT || 3010);
/** The Postgres the QA servers share (pglite from `e2e/support/pglite-postgres.mjs` on a Mac, a service container in CI). */
export const QA_PG_PORT = Number(process.env.QA_PG_PORT || 5443);
/** The api, as the web build is told it (NEXT_PUBLIC_API_URL is inlined at `next build`). */
export const QA_API_ORIGIN = `http://localhost:${QA_API_PORT}`;
/** The web app, Playwright's baseURL. */
export const QA_WEB_ORIGIN = `http://localhost:${QA_WEB_PORT}`;

/**
 * CI's dummy secrets (.github/workflows/ci.yml, e2e job): test values only, never a real secret. Only QA_AUTH_SECRET and QA_JWT_SECRET override them. The shell's
 * AUTH_SECRET and API_JWT_SECRET are never read: on a machine that also runs the app they may be the real ones, and a QA run would put them in test sessions.
 * The config hands these two values to both servers, so the cookie `signInAs` mints and the servers that read it always agree.
 */
export const QA_AUTH_SECRET = process.env.QA_AUTH_SECRET || "e2e-auth-secret-e2e-auth-secret-1234";
export const QA_JWT_SECRET = process.env.QA_JWT_SECRET || "e2e-secret-e2e-secret-e2e-secret-12";

/**
 * Where the fake AI provider (provider-shim/shim.mjs, inside the api) appends one JSON line for each request it answers, and where the cases read them back.
 * It sits in `qa-results/`, which Playwright empties when a run starts (the api may already be up), so the shim opens the file anew for every write and makes the folder if it is gone.
 */
export const QA_PROVIDER_LOG = process.env.QA_PROVIDER_LOG || path.resolve(__dirname, "..", "..", "qa-results", "provider-calls.jsonl");

/** Both QA servers and the test sign-in write to this one database. It must be on this machine: a QA run creates accounts and never cleans them up. */
export const QA_DATABASE_URL = process.env.DATABASE_URL || `postgres://postgres:postgres@127.0.0.1:${QA_PG_PORT}/postgres`;
const dbHost = (() => {
  try {
    return new URL(QA_DATABASE_URL).hostname;
  } catch {
    return "";
  }
})();
if (!["localhost", "127.0.0.1", "[::1]"].includes(dbHost)) {
  throw new Error("QA: DATABASE_URL must point at localhost, 127.0.0.1 or [::1]. A QA run writes test accounts and must never touch a shared or production database.");
}
