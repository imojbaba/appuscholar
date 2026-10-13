import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { MemoryStore } from "./store/memory";
import { DrizzleStore } from "./store/drizzle";
import { db } from "@appuscholar/db";

const secret = process.env.API_JWT_SECRET;
if (!secret) throw new Error("API_JWT_SECRET is required");
const store = process.env.DATABASE_URL ? new DrizzleStore(db(process.env.DATABASE_URL)) : new MemoryStore();
export const app = createApp({ store, jwtSecret: secret, corsOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000" });

if (process.env.VERCEL !== "1") {
  serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 8788) }, (i) => console.log(`api on http://localhost:${i.port}`));
}
