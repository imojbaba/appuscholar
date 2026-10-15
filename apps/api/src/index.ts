import { serve } from "@hono/node-server";
import { db } from "@appuscholar/db";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { MemoryStore } from "./store/memory";
import { DrizzleStore } from "./store/drizzle";

const config = loadConfig(process.env);
const store = config.databaseUrl ? new DrizzleStore(db(config.databaseUrl)) : new MemoryStore();
if (!config.databaseUrl) console.warn("DATABASE_URL is not set: using the in-memory store (development only, data is lost on restart).");
export const app = createApp({ store, jwtSecret: config.jwtSecret, corsOrigin: config.corsOrigin });

if (process.env.VERCEL !== "1") {
  serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 8788) }, (i) => console.log(`api on http://localhost:${i.port}`));
}
