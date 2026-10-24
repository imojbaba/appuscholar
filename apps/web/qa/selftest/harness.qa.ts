import { expect, test } from "@playwright/test";
import { decodeJwt } from "jose";
import { signInAs } from "../support/session";

/**
 * The harness itself, on the production build (`next build` + `next start`, the api's tsup bundle): the QA sign-in works where the e2e provider is off,
 * the signed-in student meets the terms gate, the web server can mint the api token, the CSP is the production one and the build carries the commit.
 */
test("harness: production build, test sign-in, version", { tag: ["@selftest", "@slice"] }, async ({ page, context }) => {
  const { uid, email } = await signInAs(context);
  expect(uid).toMatch(/^[0-9a-f-]{36}$/);
  expect(email).toMatch(/^qa-[0-9a-f]{8}@qa\.test$/);

  // A new account meets the terms gate first.
  const home = await page.goto("/");
  await expect(page.getByTestId("terms-age")).toBeVisible();

  // The session cookie is read as a session: the web server answers the api token with the uid we minted.
  const token = await page.request.get("/api/token");
  expect(token.status()).toBe(200);
  const body = (await token.json()) as { token: string; expiresAt: number };
  expect(decodeJwt(body.token).sub).toBe(uid);

  // The production build: next dev would add 'unsafe-eval' to script-src (apps/web/proxy.ts).
  const csp = home?.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("script-src");
  expect(csp).not.toContain("'unsafe-eval'");

  // Accepting the terms goes through the api (POST /me/terms), so this also proves the web, the api and the database are wired to one another.
  await page.getByTestId("terms-age").check();
  await page.getByTestId("terms-agree").check();
  await page.getByTestId("terms-continue").click();
  await page.getByTestId("welcome-later").click();
  await expect(page.getByTestId("welcome-dialog")).toBeHidden();

  // Help shows the build's commit: qa:build passes GITHUB_SHA (run-local.mjs sets it to `git rev-parse HEAD` unless it is already set).
  const sha = process.env.GITHUB_SHA;
  if (sha) {
    await page.getByTestId("help-btn").click();
    await expect(page.getByTestId("help-dialog")).toBeVisible();
    await expect(page.getByTestId("app-version")).toHaveText("Version " + sha.slice(0, 7));
  } else {
    // A check that measured nothing is not a pass.
    test.info().annotations.push({ type: "NOT CHECKED", description: "version: GITHUB_SHA is not set, so the build carries no commit to compare" });
  }
});
