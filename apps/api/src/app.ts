import { Hono } from "hono";
import { cors } from "hono/cors";
import { apiAuth, type AuthEnv } from "./auth";
import type { Store } from "./store/types";
import { projectRoutes } from "./routes/projects";
import { documentRoutes } from "./routes/documents";
import { blobRoutes } from "./routes/blobs";
import { meRoutes } from "./routes/me";
import { vaultRoutes } from "./routes/vault";
import { aiRoutes } from "./routes/ai";
import type { AnthropicFactory } from "./ai/types";
import type { QuotaLimits } from "./ai/quota";

export type AppOptions = { store: Store; jwtSecret: string; maxBodyBytes?: number; corsOrigin?: string; ai?: { fetch?: typeof fetch; anthropic?: AnthropicFactory }; quota?: { now?: () => Date; limits?: QuotaLimits } };

/**
 * The most a document write may carry. Ciphertext is 4/3 the size of its HTML (base64), so this leaves room for a ~2.1 MB document,
 * and stays under the 4.5 MB request limit of Vercel functions.
 */
export const DEFAULT_MAX_BODY_BYTES = 2.8 * 1024 * 1024;

const HEALTH_DB_TIMEOUT_MS = 5000;
const SAFE_TOKEN = /^[A-Za-z0-9_.-]{1,64}$/;
class PingTimeout extends Error { constructor() { super("timeout"); this.name = "Timeout"; } }

/** Rejects with PingTimeout when the ping has not answered in `ms`; the timer is always cleared. */
async function pingWithin(store: Store, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([store.ping(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new PingTimeout()), ms); })]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Only the error's name and code, each a short token or "other". Drizzle wraps driver errors (name "Error", no code), so when the top-level error
 * has no string code the real one is looked for on `cause`, at most 3 levels down. Never reads a message or a stack.
 */
function nameAndCode(e: unknown): [string, string] {
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const safe = (v: string) => (SAFE_TOKEN.test(v) ? v : "other");
  let node: unknown = e;
  let found: { name?: unknown; code?: unknown } | undefined;
  for (let depth = 0; depth <= 3 && node && typeof node === "object"; depth++) {
    const n = node as { name?: unknown; code?: unknown; cause?: unknown };
    if (str(n.code) !== undefined) { found = n; break; }
    node = n.cause;
  }
  const top = (e && typeof e === "object" ? e : {}) as { name?: unknown };
  const src = found ?? top;
  const name = str(src.name), code = str(found?.code);
  return [name === undefined ? "unknown" : safe(name), code === undefined ? "none" : safe(code)];
}

export function createApp(o: AppOptions) {
  const app = new Hono<AuthEnv>();
  const maxBodyBytes = o.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  app.use("*", cors({ origin: o.corsOrigin ?? "*", allowHeaders: ["authorization", "content-type", "if-match"] }));
  app.get("/health", (c) => c.json({ ok: true }));
  // No auth, no store data: one `select 1`. The answer and the log carry only the error's name and code, never its message or stack (a message may print a connection string).
  app.get("/health/db", async (c) => {
    c.header("Cache-Control", "no-store");
    try {
      await pingWithin(o.store, HEALTH_DB_TIMEOUT_MS);
      return c.json({ ok: true });
    } catch (e) {
      const [name, code] = nameAndCode(e);
      console.error("health/db failed", name, code);
      return c.json({ ok: false }, 503);
    }
  });
  app.use("/projects/*", apiAuth(o.jwtSecret, o.store));
  app.use("/projects", apiAuth(o.jwtSecret, o.store));
  app.use("/documents/*", apiAuth(o.jwtSecret, o.store));
  app.use("/me/*", apiAuth(o.jwtSecret, o.store));
  app.use("/me", apiAuth(o.jwtSecret, o.store));
  app.use("/ai/*", apiAuth(o.jwtSecret, o.store));
  app.route("/projects", projectRoutes(o.store, maxBodyBytes));
  app.route("/projects", blobRoutes(o.store, maxBodyBytes));
  app.route("/documents", documentRoutes(o.store, maxBodyBytes));
  app.route("/me/vault", vaultRoutes(o.store));
  app.route("/me", meRoutes(o.store));
  app.route("/ai", aiRoutes(o.store, { fetch: o.ai?.fetch ?? fetch, anthropic: o.ai?.anthropic }, o.quota));
  app.onError((err, c) => { console.error(err); return c.json({ error: "server" }, 500); });
  return app;
}
