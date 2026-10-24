/**
 * Wave C, Task C2: the Guide dialog (search, contents, print) opened from Help.
 *
 * In this task's own branch the Guide's content (Task C1) is not merged, so the Guide holds no sections; the steps assert what holds either way:
 *   1. Help has a Guide button; it opens the dialog with the English-only banner, the search box with its placeholder and the counter;
 *   2. typing a query changes the counter to the "of N sections match" form and clearing it brings the total back; a query nothing matches
 *      shows the empty line (and, with sections present, no section rows);
 *   3. Print or save as PDF opens a window (stubbed here) holding "Appuscholar guide" and the build line, without script;
 *   4. once C1 is merged there are at least 26 contents rows (asserted only when the Guide has sections).
 * Every sentence asserted is read from the message file.
 *
 * Run it with the recipe in e2e/support/pglite-postgres.mjs's header, on this task's ports (3084, 8884, database 5484):
 *   PGLITE_PORT=5484 node e2e/support/pglite-postgres.mjs &
 *   E2E_WEB_PORT=3084 E2E_API_PORT=8884 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5484/postgres \
 *     pnpm --filter @appuscholar/web exec playwright test e2e/wave-c2.spec.ts
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { signIn } from "./support/signin";

const EN = JSON.parse(readFileSync(path.join(__dirname, "../messages/tools/help-guide.en.json"), "utf8")) as Record<string, string>;
const NEW_ACCOUNT = { prefix: "c2", newAccount: true, ready: ["first-run"] };

test.describe.configure({ timeout: 120_000 });

test("Help opens the Guide: banner, search, counter, empty line, print", async ({ page }) => {
  // Print opens a window: stub it and keep what is written to it.
  await page.addInitScript(() => {
    const w = window as unknown as { __printed: string[]; __printCalls: number };
    w.__printed = [];
    w.__printCalls = 0;
    window.open = () => ({ document: { write: (h: string) => { w.__printed.push(h); }, close: () => {} }, focus: () => {}, print: () => { w.__printCalls++; } }) as unknown as Window;
  });
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
  await expect(count).toHaveText(EN.wc_guide_count_all.replace("{total}", String(total)));
  if (total) expect(total).toBeGreaterThanOrEqual(26);

  // A query nothing matches: the counter takes the "match" form and the empty line shows.
  await box.fill("zzzzqqqq");
  await expect(count).toHaveText(EN.wc_guide_count_match.replace("{h}", "0").replace("{total}", String(total)));
  await expect(page.getByTestId("guide-empty")).toHaveText(EN.wc_guide_empty);
  await expect(rows).toHaveCount(0);

  // Cleared, the whole list is back.
  await box.fill("");
  await expect(count).toHaveText(EN.wc_guide_count_all.replace("{total}", String(total)));
  await expect(rows).toHaveCount(total);

  // Print: a document with the guide's title and the build, no script.
  await page.getByTestId("guide-print").click();
  const printed = await page.evaluate(() => (window as unknown as { __printed: string[] }).__printed);
  expect(printed).toHaveLength(1);
  expect(printed[0]).toContain("<title>Appuscholar guide</title>");
  expect(printed[0]).toMatch(/Printed from the app\. Build \w+\./);
  expect(printed[0]).not.toMatch(/<script/i);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __printCalls: number }).__printCalls)).toBe(1);

  await page.getByTestId("guide-close").click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("help-dialog")).toBeVisible();
});
