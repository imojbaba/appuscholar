/**
 * Wave C Task C8: install as an app, the offline bar and the service worker's files (Chromium).
 *   1. the page links a manifest that is valid JSON with the app's name, standalone display and icons that load;
 *   2. /sw.js, /offline.html and the icons are served as files (no sign-in redirect), and the worker file never mentions the app's pages;
 *      the page's favicon and touch icon (app/icon.png, app/apple-icon.png) load through the proxy and its CSP;
 *   3. Help shows the install button or the browser-menu line (Chromium may or may not have made an install offer), and a synthetic
 *      beforeinstallprompt event makes the button appear and a press runs its prompt;
 *   4. with the context set offline the bar appears, with the context back online it goes. (A full offline reload is not asserted.);
 *   5. /offline.html shows its words in English and Hindi, and its "Try again" link points at the page's own address.
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
const HI = JSON.parse(readFileSync(path.join(MESSAGES, "tools/help-install.hi.json"), "utf8")) as Record<string, string>;

test("install, offline bar and the worker's files", async ({ page, context, request }) => {
  await signIn(page, { prefix: "c8", newAccount: true, ready: ["project-list"] });

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
  // the favicon and the touch icon the page's head links (Next's icon file convention), served as images with the page's own CSP
  for (const rel of ["icon", "apple-touch-icon"]) {
    const icon = await page.locator(`link[rel=${rel}]`).first().getAttribute("href");
    expect(icon, rel).toBeTruthy();
    const img = await request.get(icon!, { maxRedirects: 0 });
    expect(img.status(), rel).toBe(200);
    expect(img.headers()["content-type"], rel).toBe("image/png");
  }

  // 3. Help: either the install button (Chromium made an offer) or the browser-menu line, never both; then a synthetic offer shows the button
  await page.getByTestId("help-btn").click();
  const hint = page.getByTestId("install-hint");
  const button = page.getByTestId("install-app");
  await expect(hint.or(button)).toHaveCount(1);
  if (await hint.count()) await expect(hint).toHaveText(EN.wc_install_menu);
  else await expect(button).toHaveText(EN.wc_install_btn);
  await page.evaluate(() => {
    const w = window as unknown as { __prompted: number };
    w.__prompted = 0;
    const ev = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: async () => { w.__prompted++; },
      userChoice: Promise.resolve({ outcome: "dismissed" })
    });
    window.dispatchEvent(ev);
  });
  await expect(button).toHaveText(EN.wc_install_btn);
  await expect(hint).toHaveCount(0);
  await button.click();
  expect(await page.evaluate(() => (window as unknown as { __prompted: number }).__prompted)).toBe(1);
  await expect(button).toHaveCount(0);
  await page.keyboard.press("Escape");

  // 4. the offline bar
  await expect(page.getByTestId("offline-region")).toHaveAttribute("role", "status");
  await expect(page.getByTestId("offline-bar")).toHaveCount(0);
  await context.setOffline(true);
  await expect(page.getByTestId("offline-bar")).toHaveText(EN.wc_offline_bar);
  await context.setOffline(false);
  await expect(page.getByTestId("offline-bar")).toHaveCount(0);

  // 5. the offline page: both languages, and "Try again" reloads the address it was asked for
  await page.goto("/offline.html?from=%2Fp%2F1");
  await expect(page.locator("main")).toContainText(EN.wc_offpage_body);
  await expect(page.locator("main")).toContainText(HI.wc_offpage_body);
  await expect(page.locator("a")).toHaveCount(1);
  expect(await page.locator("a").evaluate((a) => (a as HTMLAnchorElement).href === location.href)).toBe(true);
});
