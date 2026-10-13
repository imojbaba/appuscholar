type Env = Record<string, string | undefined>;

/**
 * The password-less E2E credentials provider signs anyone in as an @e2e.local user. It must never be reachable in
 * production, even if E2E_AUTH=1 leaks into a production environment by mistake.
 */
export function e2eAuthEnabled(env: Env = process.env): boolean {
  return env.E2E_AUTH === "1" && env.VERCEL_ENV !== "production" && env.NODE_ENV !== "production";
}
