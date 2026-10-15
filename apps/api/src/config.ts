export type ApiConfig = { jwtSecret: string; databaseUrl: string | null; corsOrigin: string };

type Env = Record<string, string | undefined>;

/** True on Vercel and in any NODE_ENV=production process (the Docker image sets it). */
export function isProduction(env: Env): boolean {
  return env.VERCEL === "1" || env.NODE_ENV === "production";
}

/**
 * Reads the api's environment. In production a missing DATABASE_URL or WEB_ORIGIN is a hard error:
 * falling back to the in-memory store there would accept writes and silently lose them on the next cold start.
 */
export function loadConfig(env: Env): ApiConfig {
  const jwtSecret = env.API_JWT_SECRET;
  if (!jwtSecret) throw new Error("API_JWT_SECRET is required");
  const databaseUrl = env.DATABASE_URL || null;
  const webOrigin = env.WEB_ORIGIN || null;
  if (isProduction(env)) {
    const missing = [databaseUrl ? null : "DATABASE_URL", webOrigin ? null : "WEB_ORIGIN"].filter(Boolean);
    if (missing.length) throw new Error(`Refusing to start in production without ${missing.join(" and ")}. Set ${missing.length > 1 ? "them" : "it"} in the deployment environment; the in-memory store is for local development only.`);
  }
  return { jwtSecret, databaseUrl, corsOrigin: webOrigin ?? "http://localhost:3000" };
}
