// Vercel function entry. `pnpm run build` (vercel.json buildCommand) produces ../dist/index.js before functions are
// built, so this file imports the same bundle the Node server and the Docker image run. It is plain JS on purpose:
// it must not depend on TypeScript sources from workspace packages, which Vercel's function bundler does not compile.
import { handle } from "hono/vercel";
import { app } from "../dist/index.js";

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
export const OPTIONS = handle(app);
