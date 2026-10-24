import { describe, expect, it } from "vitest";
import { buildSha } from "../lib/buildSha";

describe("buildSha", () => {
  it("takes Vercel's commit, then GitHub's, else empty", () => {
    expect(buildSha({ VERCEL_GIT_COMMIT_SHA: "abc1234def", GITHUB_SHA: "zzz" })).toBe("abc1234def");
    expect(buildSha({ GITHUB_SHA: "6c38396aa" })).toBe("6c38396aa");
    expect(buildSha({})).toBe("");
  });
  it("a production build with no commit refuses to build (W9)", () => {
    expect(() => buildSha({ VERCEL_ENV: "production" })).toThrow(/No commit SHA for a production build/);
  });
  it("a production build with a commit, and a preview build without one, both build", () => {
    expect(buildSha({ VERCEL_ENV: "production", GITHUB_SHA: "6c38396aa" })).toBe("6c38396aa");
    expect(buildSha({ VERCEL_ENV: "preview" })).toBe("");
  });
});
