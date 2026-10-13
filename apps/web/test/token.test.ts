import { describe, it, expect } from "vitest";
import { jwtVerify } from "jose";
import { signApiToken } from "../lib/token";

describe("signApiToken", () => {
  it("signs an HS256 token the api can verify", async () => {
    const secret = "s".repeat(32);
    const { token, expiresAt } = await signApiToken({ id: "user-1", email: "a@b.org" }, secret);
    const { payload, protectedHeader } = await jwtVerify(token, new TextEncoder().encode(secret));
    expect(protectedHeader.alg).toBe("HS256");
    expect(payload.sub).toBe("user-1");
    expect(payload.email).toBe("a@b.org");
    expect(expiresAt - Math.floor(Date.now() / 1000)).toBeGreaterThan(800);
  });
});
