// Vercel function entry. `pnpm run build` (vercel.json buildCommand) produces ../dist/vercel.js, a fully bundled file with
// no external package imports, before Vercel builds the function. This file intentionally imports nothing else.
export { GET, POST, PUT, PATCH, DELETE, OPTIONS } from "../dist/vercel.js";
