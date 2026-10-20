import { defineConfig } from "@playwright/test";
import { API_ORIGIN, API_PORT, WEB_ORIGIN, WEB_PORT } from "./e2e/support/origins";
// Both servers run on the one DATABASE_URL (recipe: e2e/support/pglite-postgres.mjs), as in production, so the api's account erasure removes the
// users row sign-in made. Omit the key when unset: an empty DATABASE_URL makes the web layout answer 500 and the api fail to start.
const DB_ENV: Record<string, string> = process.env.DATABASE_URL ? { DATABASE_URL: process.env.DATABASE_URL } : {};
// The ports: 8788 and 3000 unless E2E_API_PORT / E2E_WEB_PORT say otherwise (e2e/support/origins.ts). The api reads PORT (apps/api/src/index.ts).
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  // The GitHub runner compiles each Next route on first hit; the sign-in redirect alone can take more than Playwright's 5 s expect default.
  expect: { timeout: 20_000 },
  use: { baseURL: WEB_ORIGIN, trace: "retain-on-failure" },
  webServer: [
    { command: "pnpm --filter @appuscholar/api dev", port: API_PORT, reuseExistingServer: true, env: { PORT: String(API_PORT), API_JWT_SECRET: process.env.API_JWT_SECRET ?? "e2e-secret-e2e-secret-e2e-secret-12", ...DB_ENV, WEB_ORIGIN } },
    { command: `pnpm --filter @appuscholar/web dev -p ${WEB_PORT}`, port: WEB_PORT, reuseExistingServer: true, env: { E2E_AUTH: "1", AUTH_TRUST_HOST: "true", API_JWT_SECRET: process.env.API_JWT_SECRET ?? "e2e-secret-e2e-secret-e2e-secret-12", AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-auth-secret-e2e-auth-secret-1234", NEXT_PUBLIC_API_URL: API_ORIGIN, ...DB_ENV } }
  ]
});
