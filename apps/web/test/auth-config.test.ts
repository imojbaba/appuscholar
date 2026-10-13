import { describe, it, expect } from "vitest";
import { e2eAuthEnabled } from "../lib/e2eAuth";
import { signinErrorMessage } from "../lib/signinError";

describe("e2eAuthEnabled", () => {
  it("is on only with E2E_AUTH=1 outside production", () => {
    expect(e2eAuthEnabled({ E2E_AUTH: "1", NODE_ENV: "development" })).toBe(true);
    expect(e2eAuthEnabled({ E2E_AUTH: "0", NODE_ENV: "development" })).toBe(false);
    expect(e2eAuthEnabled({ NODE_ENV: "development" })).toBe(false);
  });
  it("is off in production even when E2E_AUTH=1", () => {
    expect(e2eAuthEnabled({ E2E_AUTH: "1", NODE_ENV: "production" })).toBe(false);
    expect(e2eAuthEnabled({ E2E_AUTH: "1", VERCEL_ENV: "production", NODE_ENV: "development" })).toBe(false);
    expect(e2eAuthEnabled({ E2E_AUTH: "1", VERCEL_ENV: "preview", NODE_ENV: "development" })).toBe(true);
  });
});

describe("signinErrorMessage", () => {
  it("maps known Auth.js codes and falls back for unknown ones", () => {
    expect(signinErrorMessage(undefined)).toBeNull();
    expect(signinErrorMessage("OAuthAccountNotLinked")).toMatch(/already linked/);
    expect(signinErrorMessage(["Verification", "x"])).toMatch(/expired/);
    expect(signinErrorMessage("<script>alert(1)</script>")).toBe("Sign-in did not work. Try again.");
  });
});
