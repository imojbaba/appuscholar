import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "@playwright/test";
import { QA_API_ORIGIN, QA_API_PORT, QA_AUTH_SECRET, QA_DATABASE_URL, QA_JWT_SECRET, QA_PROVIDER_LOG, QA_WEB_ORIGIN, QA_WEB_PORT } from "./support/origins";

/**
 * The QA layer's Playwright config: the PRODUCTION builds (`pnpm --filter @appuscholar/web qa:build`), not `next dev`, on their own ports, on one database.
 * `qa:local` (run-local.mjs) is the one command on a Mac: it starts pglite, builds, then runs this. Sign-in is `signInAs` (support/session.ts): the production
 * build has no test sign-in provider, so the session cookie is minted. `reuseExistingServer` is false everywhere: a server left over from another run
 * would be tested instead of the build (a port that is taken stops the run). NODE_ENV is set to production explicitly: Playwright's own process may carry
 * another value into the servers, and the CSP (no 'unsafe-eval') and the api's startup checks depend on it.
 */
const WEB_DIR = path.resolve(__dirname, "..");
// QA_LIVE_AI=1 runs the api against the real providers (live-ai project, Task 17): no fake provider, so the shim is not loaded.
const LIVE_AI = process.env.QA_LIVE_AI === "1";
// The fake provider is loaded into the api with `node --import`. Always, except under QA_LIVE_AI=1: an api that started without it would send the test keys
// (gsk_qa_*) to the real providers, so a missing file stops the run here rather than falling back to starting the api without it.
const SHIM = "./qa/provider-shim/shim.mjs";
if (!LIVE_AI && !existsSync(path.join(WEB_DIR, SHIM))) {
  throw new Error(`QA: the fake AI provider is missing (${path.join(WEB_DIR, SHIM)}). Without it the api would send the test keys to the real providers. Restore the file, or set QA_LIVE_AI=1 to run against the real ones.`);
}

export default defineConfig({
  testDir: ".",
  testMatch: /\.qa\.ts$/,
  outputDir: path.join(WEB_DIR, "qa-results"),
  fullyParallel: true,
  workers: Number(process.env.QA_WORKERS || 2),
  retries: process.env.CI ? 1 : 0,
  timeout: 600_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  // A stuck click or navigation fails in seconds with its own message instead of taking the whole test timeout (Playwright's default for both is none): ruling R16.
  use: { baseURL: QA_WEB_ORIGIN, trace: "retain-on-failure", actionTimeout: 20_000, navigationTimeout: 45_000 },
  projects: [
    { name: "desktop", grepInvert: /@phone/, use: { viewport: { width: 1440, height: 900 } } },
    // Phone cases (tagged @phone) run in Hindi at 375 x 812 on a touch device. The live-ai project is added with Task 17.
    { name: "phone", grep: /@phone/, use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } }
  ],
  // QA_NO_SERVERS: the servers are already running (started by hand, on these ports, from the same builds).
  webServer: process.env.QA_NO_SERVERS ? undefined : [
    {
      command: `node ${LIVE_AI ? "" : `--import ${SHIM} `}../api/dist/index.js`,
      cwd: WEB_DIR,
      url: `${QA_API_ORIGIN}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { NODE_ENV: "production", PORT: String(QA_API_PORT), DATABASE_URL: QA_DATABASE_URL, API_JWT_SECRET: QA_JWT_SECRET, WEB_ORIGIN: QA_WEB_ORIGIN, QA_PROVIDER_LOG }
    },
    {
      command: `pnpm exec next start -p ${QA_WEB_PORT}`,
      cwd: WEB_DIR,
      url: `${QA_WEB_ORIGIN}/api/auth/providers`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { NODE_ENV: "production", AUTH_SECRET: QA_AUTH_SECRET, API_JWT_SECRET: QA_JWT_SECRET, AUTH_TRUST_HOST: "true", DATABASE_URL: QA_DATABASE_URL, NEXT_PUBLIC_API_URL: QA_API_ORIGIN }
    }
  ]
});
