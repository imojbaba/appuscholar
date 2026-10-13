import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { MemoryStore } from "./store/memory";

const secret = process.env.API_JWT_SECRET;
if (!secret) throw new Error("API_JWT_SECRET is required");
const app = createApp({ store: new MemoryStore(), jwtSecret: secret, corsOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000" });
serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 8788) }, (i) => console.log(`api on http://localhost:${i.port}`));
