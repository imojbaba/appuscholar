import { Hono } from "hono";
import { cors } from "hono/cors";
import { apiAuth, type AuthEnv } from "./auth";
import type { Store } from "./store/types";
import { projectRoutes } from "./routes/projects";
import { documentRoutes } from "./routes/documents";
import { meRoutes } from "./routes/me";
import { vaultRoutes } from "./routes/vault";
import { aiRoutes } from "./routes/ai";
import type { AnthropicFactory } from "./ai/types";

export type AppOptions = { store: Store; jwtSecret: string; maxBodyBytes?: number; corsOrigin?: string; ai?: { fetch?: typeof fetch; anthropic?: AnthropicFactory } };

/**
 * The most a document write may carry. Ciphertext is 4/3 the size of its HTML (base64), so this leaves room for a ~2.1 MB document,
 * and stays under the 4.5 MB request limit of Vercel functions.
 */
export const DEFAULT_MAX_BODY_BYTES = 2.8 * 1024 * 1024;

export function createApp(o: AppOptions) {
  const app = new Hono<AuthEnv>();
  const maxBodyBytes = o.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  app.use("*", cors({ origin: o.corsOrigin ?? "*", allowHeaders: ["authorization", "content-type"] }));
  app.get("/health", (c) => c.json({ ok: true }));
  app.use("/projects/*", apiAuth(o.jwtSecret, o.store));
  app.use("/projects", apiAuth(o.jwtSecret, o.store));
  app.use("/documents/*", apiAuth(o.jwtSecret, o.store));
  app.use("/me/*", apiAuth(o.jwtSecret, o.store));
  app.use("/me", apiAuth(o.jwtSecret, o.store));
  app.use("/ai/*", apiAuth(o.jwtSecret, o.store));
  app.route("/projects", projectRoutes(o.store, maxBodyBytes));
  app.route("/documents", documentRoutes(o.store, maxBodyBytes));
  app.route("/me/vault", vaultRoutes(o.store));
  app.route("/me", meRoutes(o.store));
  app.route("/ai", aiRoutes(o.store, { fetch: o.ai?.fetch ?? fetch, anthropic: o.ai?.anthropic }));
  app.onError((err, c) => { console.error(err); return c.json({ error: "server" }, 500); });
  return app;
}
