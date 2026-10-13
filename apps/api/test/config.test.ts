import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config";

describe("loadConfig", () => {
  it("requires API_JWT_SECRET everywhere", () => {
    expect(() => loadConfig({})).toThrow(/API_JWT_SECRET/);
  });
  it("allows the in-memory store and a localhost origin in development", () => {
    expect(loadConfig({ API_JWT_SECRET: "s" })).toEqual({ jwtSecret: "s", databaseUrl: null, corsOrigin: "http://localhost:3000" });
  });
  it("refuses to start on Vercel without DATABASE_URL and WEB_ORIGIN", () => {
    expect(() => loadConfig({ API_JWT_SECRET: "s", VERCEL: "1" })).toThrow(/DATABASE_URL and WEB_ORIGIN/);
    expect(() => loadConfig({ API_JWT_SECRET: "s", VERCEL: "1", DATABASE_URL: "postgres://x/y" })).toThrow(/WEB_ORIGIN/);
    expect(() => loadConfig({ API_JWT_SECRET: "s", VERCEL: "1", WEB_ORIGIN: "https://app.example" })).toThrow(/DATABASE_URL/);
  });
  it("refuses to start with NODE_ENV=production without DATABASE_URL", () => {
    expect(() => loadConfig({ API_JWT_SECRET: "s", NODE_ENV: "production", WEB_ORIGIN: "https://app.example", DATABASE_URL: "" })).toThrow(/DATABASE_URL/);
  });
  it("accepts a complete production environment", () => {
    expect(loadConfig({ API_JWT_SECRET: "s", NODE_ENV: "production", DATABASE_URL: "postgres://x/y", WEB_ORIGIN: "https://app.example" }))
      .toEqual({ jwtSecret: "s", databaseUrl: "postgres://x/y", corsOrigin: "https://app.example" });
  });
});
