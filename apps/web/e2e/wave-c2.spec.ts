/**
 * Wave C, Task C2: the Guide dialog (search, contents, print) opened from Help.
 *
 * In this task's own branch the Guide's content (Task C1) is not merged, so the Guide holds no sections; the steps assert what holds either way:
 *   1. Help has a Guide button; it opens the dialog over Help, with the English-only banner, the search box with its placeholder and the counter;
 *   2. typing a query changes the counter to the "of N sections match" form and clearing it brings the total back; a query nothing matches
 *      shows the empty line (and no section rows); with sections, a word from the first title narrows the list to a count that includes it,
 *      and one to three matches are open;
 *   3. Print or save as PDF opens a window (stubbed here) holding "Appuscholar guide" and the build line, without script;
 *   4. Escape closes only the Guide, Help is still there and the Guide button has focus again;
 *   5. at 375 px the dialog fits the screen, has no sideways scroll, and its contents scroll while the Close button stays on screen;
 *   6. once C1 is merged there are at least 26 contents rows (asserted only when the Guide has sections).
 * Every sentence asserted is read from the message file.
 *
 * Run it with the recipe in e2e/support/pglite-postgres.mjs's header, on this task's ports (3084, 8884, database 5484):
 *   PGLITE_PORT=5484 node e2e/support/pglite-postgres.mjs &
 *   E2E_WEB_PORT=3084 E2E_API_PORT=8884 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5484/postgres \
 *     pnpm --filter @appuscholar/web exec playwright test e2e/wave-c2.spec.ts
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { signIn } from "./support/signin";

const EN = JSON.parse(readFileSync(path.join(__dirname, "../messages/tools/help-guide.en.json"), "utf8")) as Record<string, string>;
const NEW_ACCOUNT = { prefix: "c2", newAccount: true, ready: ["first-run"] };

test.describe.configure({ timeout: 120_000 });

/** Print opens a window: stub it and keep what is written to it. */
async function stubPrintWindow(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __printed: string[]; __printCalls: number };
    w.__printed = [];
    w.__printCalls = 0;
    window.open = () => ({ document: { write: (h: string) => { w.__printed.push(h); }, close: () => {} }, focus: () => {}, print: () => { w.__printCalls++; } }) as unknown as Window;
  });
}

const counterAll = (total: number) => EN.wc_guide_count_all.replace("{total}", String(total));
const counterMatch = (h: number | string, total: number) => EN.wc_guide_count_match.replace("{h}", String(h)).replace("{total}", String(total));

test("Help opens the Guide: banner, search, counter, empty line, print, Escape", async ({ page }) => {
  await stubPrintWindow(page);
  await signIn(page, NEW_ACCOUNT);

  await page.getByTestId("help-btn").click();
  await expect(page.getByTestId("help-dialog")).toBeVisible();
  await page.getByTestId("help-guide").click();
  const dialog = page.getByTestId("guide-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(EN.wc_guide_english_only);

  const box = page.getByTestId("guide-search");
  await expect(box).toHaveAttribute("placeholder", EN.wc_guide_search_ph);
  const count = page.getByTestId("guide-count");
  const rows = page.locator("[data-testid^=guide-section-]");
  const total = await rows.count();
  await expect(count).toHaveText(counterAll(total));
  if (total) expect(total).toBeGreaterThanOrEqual(26);

  // A query nothing matches: the counter takes the "match" form and the empty line shows.
  await box.fill("zzzzqqqq");
  await expect(count).toHaveText(counterMatch(0, total));
  await expect(page.getByTestId("guide-empty")).toHaveText(EN.wc_guide_empty);
  await expect(rows).toHaveCount(0);

  // With sections: a word from the first title narrows the list, and one to three matches are open.
  if (total) {
    await box.fill("");
    const first = rows.first();
    const id = (await first.getAttribute("data-testid"))!;
    const title = (await first.locator("summary").innerText()).toLowerCase();
    const word = title.split(/[^a-z]+/).filter((w) => w.length >= 4).sort((a, b) => b.length - a.length)[0];
    expect(word, "the first title has a word of four letters or more").toBeTruthy();
    await box.fill(word);
    await expect(count).toHaveText(new RegExp("^\\d+ of " + total + " sections match$"));
    await expect(page.getByTestId(id)).toBeVisible();
    const n = await rows.count();
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(total);
    expect(await rows.evaluateAll((els) => els.map((e) => (e as HTMLDetailsElement).open))).toEqual(Array(n).fill(n <= 3));
  }

  // Cleared, the whole list is back.
  await box.fill("");
  await expect(count).toHaveText(counterAll(total));
  await expect(rows).toHaveCount(total);

  // Print: a document with the guide's title and the build, no script.
  await page.getByTestId("guide-print").click();
  const printed = await page.evaluate(() => (window as unknown as { __printed: string[] }).__printed);
  expect(printed).toHaveLength(1);
  expect(printed[0]).toContain("<title>Appuscholar guide</title>");
  expect(printed[0]).toMatch(/Printed from the app\. Build \w+\./);
  expect(printed[0]).not.toMatch(/<script/i);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __printCalls: number }).__printCalls)).toBe(1);

  // Escape ends only the Guide: Help is still open and the Guide button has focus again.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("help-dialog")).toBeVisible();
  await expect(page.getByTestId("help-guide")).toBeFocused();

  // Opened again it starts with an empty search; the Close button ends it, Help stays.
  await page.getByTestId("help-guide").click();
  await expect(dialog).toBeVisible();
  await expect(box).toHaveValue("");
  await page.getByTestId("guide-close").click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("help-dialog")).toBeVisible();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("the Guide fits 375 px wide and its contents scroll", async ({ page }) => {
    await signIn(page, NEW_ACCOUNT);
    await page.getByTestId("phone-menu").click();
    await page.getByTestId("menu-help").click();
    await expect(page.getByTestId("help-dialog")).toBeVisible();
    await page.getByTestId("help-guide").click();
    const dialog = page.getByTestId("guide-dialog");
    await expect(dialog).toBeVisible();

    // On the screen, with the search box, Print and Close all reachable.
    const fits = async () => {
      const b = (await dialog.boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(375);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y + b.height).toBeLessThanOrEqual(812);
      expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    };
    await fits();
    for (const id of ["guide-search", "guide-print", "guide-close"]) await expect(page.getByTestId(id)).toBeInViewport();

    const rows = page.locator("[data-testid^=guide-section-]");
    const total = await rows.count();
    if (total) {
      // Every row is a touch target of 44 px, and the list (not the dialog) is what scrolls.
      expect(await page.evaluate(() => Array.from(document.querySelectorAll("[data-testid=guide-list] summary")).filter((s) => s.getBoundingClientRect().height < 44).length)).toBe(0);
      const list = page.getByTestId("guide-list");
      expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
      await list.evaluate((el) => { el.scrollTop = el.scrollHeight; });
      await expect(rows.last()).toBeInViewport();
      await expect(page.getByTestId("guide-close")).toBeInViewport();
      // An opened section does not push the dialog sideways.
      await rows.last().locator("summary").click();
      await fits();
    }

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("help-dialog")).toBeVisible();
  });
});
