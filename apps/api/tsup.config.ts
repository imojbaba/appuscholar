import { defineConfig } from "tsup";

// One self-contained ESM file for Node 22. Workspace packages (@appuscholar/*) ship TypeScript sources, so they are
// bundled in; npm dependencies stay external and are resolved from apps/api/node_modules at runtime.
export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: false,
  noExternal: [/^@appuscholar\//]
});
