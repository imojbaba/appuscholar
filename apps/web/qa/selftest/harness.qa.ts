import { decodeJwt } from "jose";
import { signInAs } from "../support/session";
import { expect, notChecked, test } from "../support/test";

/**
 * The harness itself, on the production build (`next build` + `next start`, the api's tsup bundle): the QA sign-in works where the e2e provider is off,
 * the signed-in student meets the terms gate, the web server can mint the api token, the CSP is the production one and the build carries the commit.
 * It is a case like any other, so the watcher also looks at every request it makes.
 */
test("harness: production build, test sign-in, version", { tag: ["@selftest", "@slice"] }, async ({ page, context, qa }) => {
  qa.begin({
    story: "S0",
    id: "SELF-HARNESS",
    goal: "The QA harness signs a new student in on the production build",
    situation: {},
    steps: ["sign in", "open the app", "ask for the api token", "accept the terms", "read the version"]
  });

  // A new account has no vault yet, and the api says so with a 404 on GET /me/vault. That answer is on the watcher's built-in list of expected answers, with its reason.

  let uid = "";
  let email = "";
  await qa.step("sign in", async () => {
    ({ uid, email } = await signInAs(context));
    await qa.check("data", "the test sign-in makes a new account with a QA address", async () => {
      expect(uid).toMatch(/^[0-9a-f-]{36}$/);
      expect(email).toMatch(/^qa-[0-9a-f]{8}@qa\.test$/);
    }, { source: "qa/support/session.ts" });
  });

  let csp = "";
  await qa.step("open the app", async () => {
    // A new account meets the terms gate first.
    const home = await page.goto("/");
    csp = home?.headers()["content-security-policy"] ?? "";
    await qa.check("data", "a new account meets the terms gate", async () => {
      await expect(page.getByTestId("terms-age")).toBeVisible();
    }, { source: "e2e: terms gate" });
    // The production build: next dev would add 'unsafe-eval' to script-src (apps/web/proxy.ts).
    await qa.check("data", "the page carries the production content-security-policy, without 'unsafe-eval'", async () => {
      expect(csp).toContain("script-src");
      expect(csp).not.toContain("'unsafe-eval'");
    }, { source: "apps/web/proxy.ts" });
  });

  await qa.step("ask for the api token", async () => {
    // The session cookie is read as a session: the web server answers the api token with the uid we minted.
    await qa.check("data", "the web server mints the api token for the signed-in uid", async () => {
      const token = await page.request.get("/api/token");
      expect(token.status()).toBe(200);
      const body = (await token.json()) as { token: string; expiresAt: number };
      expect(decodeJwt(body.token).sub).toBe(uid);
    }, { source: "apps/web/auth.ts" });
  });

  await qa.step("accept the terms", async () => {
    // Accepting the terms goes through the api (POST /me/terms), so this also proves the web, the api and the database are wired to one another.
    await page.getByTestId("terms-age").check();
    await page.getByTestId("terms-agree").check();
    await page.getByTestId("terms-continue").click();
    await page.getByTestId("welcome-later").click();
    await qa.check("data", "the terms are accepted through the api and the welcome window goes", async () => {
      await expect(page.getByTestId("welcome-dialog")).toBeHidden();
    }, { source: "e2e: terms gate" });
  });

  await qa.step("read the version", async () => {
    // Help shows the build's commit: qa:build passes GITHUB_SHA (run-local.mjs sets it to `git rev-parse HEAD` unless it is already set).
    const sha = process.env.GITHUB_SHA;
    await qa.check("data", "Help shows the commit the build was made from", async () => {
      // A check that measured nothing is not a pass.
      if (!sha) notChecked("version: GITHUB_SHA is not set, so the build carries no commit to compare");
      await page.getByTestId("help-btn").click();
      await expect(page.getByTestId("help-dialog")).toBeVisible();
      await expect(page.getByTestId("app-version")).toHaveText("Version " + sha!.slice(0, 7));
    }, { source: "qa/run-local.mjs" });
  });
});
