/**
 * Wave C Task C8: install as an app, the offline bar and the service worker's files (Chromium).
 *   1. the page links a manifest that is valid JSON with the app's name, standalone display and icons that load;
 *   2. /sw.js, /offline.html and the icons are served as files (no sign-in redirect), and the worker file never mentions the app's pages;
 *   3. Help shows the browser-menu line for installing (the browser has made no install offer here);
 *   4. with the context set offline the bar appears, with the context back online it goes. (A full offline reload is not asserted.)
 *
 * Run it on its own ports (see e2e/support/pglite-postgres.mjs):
 *   PGLITE_PORT=5490 node e2e/support/pglite-postgres.mjs &
 *   E2E_WEB_PORT=3090 E2E_API_PORT=8890 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5490/postgres \
 *     pnpm --filter @appuscholar/web exec playwright test e2e/wave-c8.spec.ts
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { signIn } from "./support/signin";

const MESSAGES = path.join(__dirname, "../messages");
const EN = JSON.parse(readFileSync(path.join(MESSAGES, "tools/help-install.en.json"), "utf8")) as Record<string, string>;

test("install, offline bar and the worker's files", async ({ page, context, request }) => {
  await signIn(page, { prefix: "c8", newAccount: true, ready: ["first-run"] });

  // 1. the manifest
  const href = await page.locator("link[rel=manifest]").getAttribute("href");
  expect(href).toBeTruthy();
  const res = await request.get(href!);
  expect(res.ok()).toBe(true);
  const manifest = JSON.parse(await res.text());
  expect(manifest.name).toBe("Appuscholar");
  expect(manifest.display).toBe("standalone");
  expect(manifest.theme_color).toBe("#4c1d95");
  for (const icon of manifest.icons as { src: string }[]) expect((await request.get(icon.src)).ok()).toBe(true);

  // 2. the files the worker needs are plain files
  const sw = await request.get("/sw.js", { maxRedirects: 0 });
  expect(sw.status()).toBe(200);
  expect(sw.headers()["content-type"]).toMatch(/javascript/);
  const swText = await sw.text();
  expect(swText).not.toMatch(/index\.html|\/projects|\/start/);
  const offline = await request.get("/offline.html", { maxRedirects: 0 });
  expect(offline.status()).toBe(200);
  expect(await offline.text()).toMatch(/You are offline/);

  // 3. Help: the browser has made no install offer here, so the line points at the browser menu
  await page.getByTestId("help-btn").click();
  await expect(page.getByTestId("install-hint")).toHaveText(EN.wc_install_menu);
  await expect(page.getByTestId("install-app")).toHaveCount(0);
  await page.keyboard.press("Escape");

  // 4. the offline bar
  await expect(page.getByTestId("offline-bar")).toHaveCount(0);
  await context.setOffline(true);
  await expect(page.getByTestId("offline-bar")).toHaveText(EN.wc_offline_bar);
  await context.setOffline(false);
  await expect(page.getByTestId("offline-bar")).toHaveCount(0);
});
