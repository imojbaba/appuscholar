/**
 * Wave B Task 14: the frame on a phone (canvas Phone), at 375x812. Replaces phase2-responsive.spec.ts, whose sheet, drawer and sidebar are gone.
 *
 * Run with the recipe in the header of e2e/support/pglite-postgres.mjs:
 *   pnpm --filter @appuscholar/web exec playwright test e2e/frame-responsive.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { signIn } from "./support/signin";

const PHONE = { width: 375, height: 812 };

test.use({ viewport: PHONE });

/** A new account past the terms gate and the welcome tour, on first run. */
const NEW_ACCOUNT = { prefix: "f", newAccount: true, ready: ["first-run"] };

const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
/** What reaches past the screen's right edge (outside a sideways scroller), named for the failure message. */
const tooWide = (page: Page) => page.evaluate(() => {
  const out: string[] = [];
  document.querySelectorAll("body *").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.right <= window.innerWidth + 0.5) return;
    for (let p = el.parentElement; p; p = p.parentElement) if (["auto", "scroll", "hidden"].includes(getComputedStyle(p).overflowX)) return;
    out.push(`${el.tagName.toLowerCase()}.${el.className} ${el.getAttribute("data-testid") ?? ""} ${Math.round(r.right)}`);
  });
  return out.slice(0, 8);
});

/** Every visible button and link under `root` shorter than 44px, by test id or text. */
const smallTargets = (page: Page, root: string) => page.evaluate((sel) => {
  const out: string[] = [];
  document.querySelectorAll(`${sel} button, ${sel} a, ${sel} summary`).forEach((b) => {
    const r = b.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    if (r.height < 44) out.push(`${b.getAttribute("data-testid") ?? b.textContent?.trim()} ${Math.round(r.height)}`);
  });
  return out;
}, root);

/** Every visible element whose right edge passes the 16px gutter. */
const pastGutter = (page: Page, root: string) => page.evaluate((sel) => {
  const out: string[] = [];
  const max = window.innerWidth - 16 + 0.5;
  document.querySelectorAll(`${sel} > *`).forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0) return;
    if (r.left < 15.5 || r.right > max) out.push(`${el.getAttribute("data-testid") ?? el.className} ${Math.round(r.left)}-${Math.round(r.right)}`);
  });
  return out;
}, root);

/** First run's "Save as my project" with a typed idea; the new project's home opens. */
async function newProject(page: Page) {
  await signIn(page, NEW_ACCOUNT);
  await page.locator("#ideaTopic").fill("Does a fixed bedtime routine lower exam anxiety in first-year students?");
  // The three questions are folded away, optional ("Add details for better feedback").
  await page.getByTestId("idea-details-toggle").click();
  await page.locator("#ideaRes").fill("About 60 first-years");
  await page.getByTestId("idea-save").click();
  await expect(page.getByTestId("project-home")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("home-stages")).toBeVisible();
}

test("the home has no horizontal scroll", async ({ page }) => {
  await newProject(page);
  // The header: the wordmark, the vault pill and Menu; the switcher, the AI pill, Help and the account live in the menu.
  const header = page.getByTestId("app-header");
  await expect(header.getByTestId("wordmark")).toBeVisible();
  await expect(header.getByTestId("vault-pill")).toBeVisible();
  await expect(header.getByTestId("phone-menu")).toBeVisible();
  for (const id of ["project-switcher", "ai-pill", "help-btn", "account-menu-btn", "lang-toggle"]) await expect(header.getByTestId(id)).toHaveCount(0);
  const hdr = (await header.boundingBox())!;
  expect(hdr.height).toBeLessThan(80);

  // The home in the canvas's order, the question closed.
  const PARTS = ["home-project-btn", "home-q-fold", "home-next", "home-stages", "home-export"];
  const order = await page.getByTestId("home-phone").evaluate((el, ids) =>
    [...el.querySelectorAll("[data-testid]")].map((p) => p.getAttribute("data-testid")).filter((id) => ids.includes(id!)), PARTS);
  expect(order).toEqual(PARTS);
  await expect(page.getByTestId("home-q-fold")).not.toHaveAttribute("open");
  await expect(page.getByTestId("home-project-btn")).toContainText("Does a fixed bedtime routine");
  // Each stage row: its name, what it holds and its state.
  const idea = page.getByTestId("home-stage-idea");
  await expect(idea).toContainText("Idea");
  await expect(page.getByTestId("home-state-idea")).toBeVisible();
  await expect(page.getByTestId("home-detail-lit")).toBeVisible();

  expect(await noHorizontalScroll(page)).toBe(true);
  expect(await pastGutter(page, "[data-testid=home-phone]")).toEqual([]);
  expect(await smallTargets(page, "[data-testid=app-header]")).toEqual([]);
  expect(await smallTargets(page, "[data-testid=project-home]")).toEqual([]);

  // Opened, the question shows the topic; still no horizontal scroll.
  await page.getByTestId("home-q-fold").locator("summary").click();
  await expect(page.getByTestId("home-q-text")).toContainText("bedtime routine");
  expect(await noHorizontalScroll(page)).toBe(true);

  // The menu holds the projects, the AI key, Help and the account items.
  await page.getByTestId("phone-menu").click();
  const menu = page.getByTestId("phone-menu-list");
  await expect(menu).toBeVisible();
  for (const id of ["switcher-all", "switcher-scratch", "menu-ai", "menu-help", "menu-lang", "acct-export-project", "acct-export", "acct-sign-out", "acct-erase"]) await expect(menu.getByTestId(id)).toBeVisible();
  expect(await smallTargets(page, "[data-testid=phone-menu-list]")).toEqual([]);
  expect(await noHorizontalScroll(page)).toBe(true);
  await menu.getByTestId("menu-help").click();
  await expect(page.getByTestId("help-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("help-dialog")).toBeHidden();
});

test("the place tabs are all reachable", async ({ page }) => {
  await newProject(page);
  await page.getByTestId("home-open-lit").click();
  await expect(page).toHaveURL(/\/lit$/);
  const bar = page.getByTestId("place-tabs");
  await expect(bar).toBeVisible();
  expect(await bar.evaluate((el) => getComputedStyle(el).overflowX)).toBe("auto");
  for (const tab of ["find", "reading", "compare", "citations"]) {
    const link = page.getByTestId("place-tab-" + tab);
    await link.scrollIntoViewIfNeeded();
    const box = (await link.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/lit/${tab}$`));
    await expect(page.getByTestId("place-lit-" + tab)).toBeVisible();
    expect(await tooWide(page), tab).toEqual([]);
    expect(await noHorizontalScroll(page)).toBe(true);
  }
});

test("the document opens full screen and Back returns to the same tab", async ({ page }) => {
  await newProject(page);
  await page.getByTestId("home-open-lit").click();
  await page.getByTestId("place-tab-compare").scrollIntoViewIfNeeded();
  await page.getByTestId("place-tab-compare").click();
  await expect(page).toHaveURL(/\/lit\/compare$/);
  await page.getByTestId("place-open-doc").click();

  // Full screen: the place is out of sight, the document takes the width, and Back names the place.
  const doc = page.getByTestId("frame-doc");
  await expect(doc).toBeVisible();
  await expect(page.locator(".ProseMirror")).toBeVisible();
  await expect(page.getByTestId("place-header")).toBeHidden();
  await expect(page.getByTestId("place-lit-compare")).toBeHidden();
  const back = page.getByTestId("doc-back");
  await expect(back).toHaveText("Back to Literature");
  // "Open my document" is out of sight now: focus is on Back.
  await expect(back).toBeFocused();
  const box = (await doc.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(PHONE.width - 1);
  expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await noHorizontalScroll(page)).toBe(true);
  await expect(page).toHaveURL(/\/lit\/compare$/);

  await back.click();
  await expect(doc).toBeHidden();
  await expect(page).toHaveURL(/\/lit\/compare$/);
  await expect(page.getByTestId("place-lit-compare")).toBeVisible();
  await expect(page.getByTestId("place-tab-compare")).toHaveAttribute("aria-current", "true");
  // Back has gone with the document: focus returns to "Open my document".
  await expect(page.getByTestId("place-open-doc")).toBeFocused();
});

test("first run and the project list fit the width", async ({ page }) => {
  await signIn(page, NEW_ACCOUNT);
  await expect(page).toHaveURL(/\/start$/);
  expect(await noHorizontalScroll(page)).toBe(true);
  expect(await pastGutter(page, "[data-testid=first-run]")).toEqual([]);
  expect(await smallTargets(page, "[data-testid=first-run]")).toEqual([]);
  expect(await smallTargets(page, "[data-testid=app-header]")).toEqual([]);

  await page.goto("/projects");
  await expect(page.getByTestId("project-list")).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);
  expect(await smallTargets(page, "[data-testid=project-list]")).toEqual([]);

  // With a project in it, its row and six bars fit too.
  await page.goto("/start");
  await page.locator("#ideaTopic").fill("Screen time and sleep in teenagers across one school term in Pune");
  await page.getByTestId("idea-save").click();
  await expect(page.getByTestId("project-home")).toBeVisible({ timeout: 20_000 });
  await page.goto("/projects");
  await expect(page.getByTestId("project-list")).toBeVisible();
  await expect(page.locator(".plist-row", { hasText: "Screen time and sleep" })).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);
  expect(await pastGutter(page, "[data-testid=project-list]")).toEqual([]);
  expect(await smallTargets(page, "[data-testid=project-list]")).toEqual([]);
});
