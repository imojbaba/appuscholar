import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  webServer: [
    { command: "pnpm --filter @appuscholar/api dev", port: 8788, reuseExistingServer: true, env: { API_JWT_SECRET: process.env.API_JWT_SECRET ?? "e2e-secret-e2e-secret-e2e-secret-12", DATABASE_URL: process.env.DATABASE_URL ?? "", WEB_ORIGIN: "http://localhost:3000" } },
    { command: "pnpm --filter @appuscholar/web dev", port: 3000, reuseExistingServer: true, env: { E2E_AUTH: "1", AUTH_TRUST_HOST: "true", API_JWT_SECRET: process.env.API_JWT_SECRET ?? "e2e-secret-e2e-secret-e2e-secret-12", AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-auth-secret-e2e-auth-secret-1234", NEXT_PUBLIC_API_URL: "http://localhost:8788", DATABASE_URL: process.env.DATABASE_URL ?? "" } }
  ]
});
