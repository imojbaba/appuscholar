import tseslint from "typescript-eslint";
export default tseslint.config(...tseslint.configs.recommended, {
  rules: {
    "no-restricted-imports": ["error", { "patterns": ["react", "react/*", "next", "next/*", "hono", "hono/*", "node:*", "drizzle-orm", "drizzle-orm/*"] }]
  }
});
