import { defineConfig } from "tsup";

// Two self-contained ESM bundles for Node 22:
//   dist/index.js   the Node server (Docker, `pnpm start`), also exports `app`
//   dist/vercel.js  the Vercel function handlers (GET/POST/...), imported by api/index.js
// Everything is bundled in, workspace packages and npm dependencies alike, except jsdom (it reads files relative to
// __dirname at runtime, so it must stay a real package) and optional native modules that are never installed.
export default defineConfig({
  entry: { index: "src/index.ts", vercel: "src/vercel.ts" },
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: false,
  noExternal: [/^(?!(jsdom|pg-native|canvas|bufferutil|utf-8-validate|@electric-sql\/pglite)($|\/))/],
  external: ["jsdom", "pg-native", "canvas", "bufferutil", "utf-8-validate", "@electric-sql/pglite"],
  banner: { js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' }
});
