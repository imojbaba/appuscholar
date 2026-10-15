// Vercel function entry (bundled by tsup into dist/vercel.js). Everything, including hono and jsdom, is bundled in so
// the serverless function has no external package resolution at runtime.
import { handle } from "hono/vercel";
import { app } from "./index";

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
export const OPTIONS = handle(app);
