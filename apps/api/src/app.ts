import { Hono } from "hono";
import { cors } from "hono/cors";
import { apiAuth, type AuthEnv } from "./auth";
import type { Store } from "./store/types";
import { projectRoutes } from "./routes/projects";
import { documentRoutes } from "./routes/documents";
import { importRoutes } from "./routes/import";

export type AppOptions = { store: Store; jwtSecret: string; maxBodyBytes?: number; maxImportBytes?: number; corsOrigin?: string };

export function createApp(o: AppOptions) {
  const app = new Hono<AuthEnv>();
  app.use("*", cors({ origin: o.corsOrigin ?? "*", allowHeaders: ["authorization", "content-type"] }));
  app.get("/health", (c) => c.json({ ok: true }));
  app.use("/projects/*", apiAuth(o.jwtSecret));
  app.use("/projects", apiAuth(o.jwtSecret));
  app.use("/documents/*", apiAuth(o.jwtSecret));
  app.use("/import/*", apiAuth(o.jwtSecret));
  app.route("/projects", projectRoutes(o.store));
  app.route("/documents", documentRoutes(o.store, o.maxBodyBytes ?? 2 * 1024 * 1024));
  app.route("/import", importRoutes(o.store, o.maxImportBytes));
  app.onError((err, c) => { console.error(err); return c.json({ error: "server" }, 500); });
  return app;
}
