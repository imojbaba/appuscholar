import tseslint from "typescript-eslint";
export default tseslint.config(...tseslint.configs.recommended, {
  files: ["src/**/*.ts"],
  rules: {
    "no-restricted-imports": ["error", { "patterns": ["react", "react/*", "next", "next/*", "hono", "hono/*", "node:*", "drizzle-orm", "drizzle-orm/*"] }],
    "no-restricted-globals": ["error", "document", "window", "localStorage", "sessionStorage", "navigator", "location"]
  }
});
