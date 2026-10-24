import type { BrowserContext } from "@playwright/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

/** origins.ts reads process.env when it is loaded, so each case loads a fresh copy. */
async function origins() {
  vi.stubEnv("DATABASE_URL", ""); // origins.ts refuses a database that is not on this machine, whatever the shell has
  vi.resetModules();
  return import("../../qa/support/origins");
}

describe("the QA secrets (qa/support/origins.ts)", () => {
  it("are CI's dummy values when nothing is set", async () => {
    vi.stubEnv("QA_AUTH_SECRET", "");
    vi.stubEnv("QA_JWT_SECRET", "");
    const o = await origins();
    expect(o.QA_AUTH_SECRET).toBe("e2e-auth-secret-e2e-auth-secret-1234");
    expect(o.QA_JWT_SECRET).toBe("e2e-secret-e2e-secret-e2e-secret-12");
  });

  it("are overridden by QA_AUTH_SECRET and QA_JWT_SECRET", async () => {
    vi.stubEnv("QA_AUTH_SECRET", "qa-auth-secret-from-the-test-0123456789");
    vi.stubEnv("QA_JWT_SECRET", "qa-jwt-secret-from-the-test-0123456789");
    const o = await origins();
    expect(o.QA_AUTH_SECRET).toBe("qa-auth-secret-from-the-test-0123456789");
    expect(o.QA_JWT_SECRET).toBe("qa-jwt-secret-from-the-test-0123456789");
  });

  it("are never taken from the shell's AUTH_SECRET or API_JWT_SECRET (those may be a real deployment's)", async () => {
    vi.stubEnv("QA_AUTH_SECRET", "");
    vi.stubEnv("QA_JWT_SECRET", "");
    vi.stubEnv("AUTH_SECRET", "a-real-looking-auth-secret-from-the-shell");
    vi.stubEnv("API_JWT_SECRET", "a-real-looking-jwt-secret-from-the-shell");
    const o = await origins();
    expect(o.QA_AUTH_SECRET).not.toContain("shell");
    expect(o.QA_JWT_SECRET).not.toContain("shell");
    expect(o.QA_AUTH_SECRET).toBe("e2e-auth-secret-e2e-auth-secret-1234");
    expect(o.QA_JWT_SECRET).toBe("e2e-secret-e2e-secret-e2e-secret-12");
  });
});

describe("signInAs (qa/support/session.ts)", () => {
  // The refusal comes before the database or the browser is touched, so neither is needed. The database address is one nothing listens on, so that if
  // the refusal were ever lost the case would fail on the connection and could not write a row into a QA database that happens to be running.
  const context = {} as BrowserContext;
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgres://postgres:postgres@127.0.0.1:1/postgres");
    vi.resetModules();
  });

  it.each(["student@example.com", "qa-1234abcd@qa.test.example.com", "qa.test", "someone@gmail.com", ""])("refuses %j: a QA run writes accounts and sends nothing to real addresses", async (email) => {
    const { signInAs } = await import("../../qa/support/session");
    await expect(signInAs(context, { email })).rejects.toThrow(/@qa\.test/);
  });
});
