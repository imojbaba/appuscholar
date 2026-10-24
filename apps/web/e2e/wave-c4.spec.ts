/**
 * Wave C, Task C4: the problem report and the "page looks broken" FAQ entry, walked by a student.
 *   1. Help opens; the FAQ entry "The page looks broken" is there and opens to its answer;
 *   2. "Report a problem" opens; the student types a description; the preview shows what the app adds (build, tool, language, browser, screen,
 *      online, AI provider) and an earlier script error with its email address masked;
 *   3. "Copy the report" puts the description, the divider and the facts on the (mocked) clipboard, and the dialog says "Report copied" (no toast);
 *   4. ticking the counts box adds them to the preview; "Clear the counts" empties them.
 * With no NEXT_PUBLIC_SUPPORT_EMAIL (the e2e server has none) there is no mail button and Help's "direct contact" line shows.
 * Copy is read from the dictionaries. Nothing is sent anywhere: the AI is never called.
 *
 *   PGLITE_PORT=5486 node e2e/support/pglite-postgres.mjs &
 *   E2E_API_PORT=8886 E2E_WEB_PORT=3086 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5486/postgres \
 *     pnpm --filter @appuscholar/web exec playwright test e2e/wave-c4.spec.ts
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { signIn } from "./support/signin";

const MESSAGES = path.join(__dirname, "../messages");
const EN = { ...JSON.parse(readFileSync(path.join(MESSAGES, "en.json"), "utf8")), ...JSON.parse(readFileSync(path.join(MESSAGES, "tools/help-report.en.json"), "utf8")) } as Record<string, string>;
const T = (key: string): string => { const v = EN[key]; if (v === undefined) throw new Error("no such key: " + key); return v; };

test.describe.configure({ timeout: 180_000 });
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });

test("Help shows the 'page looks broken' entry and the problem report copies a masked, text-free report", async ({ page }) => {
  // A clipboard the test can read, set up before any page script runs.
  await page.addInitScript(() => {
    const w = window as unknown as { __clip: string[] };
    w.__clip = [];
    Object.defineProperty(navigator, "clipboard", { value: { writeText: (s: string) => { w.__clip.push(s); return Promise.resolve(); } }, configurable: true });
  });
  await signIn(page, { prefix: "c4", newAccount: true, ready: ["first-run"] });

  // 1. The FAQ entry.
  await page.getByTestId("help-btn").click();
  await expect(page.getByTestId("help-dialog")).toBeVisible();
  const faq = page.getByTestId("faq-broken");
  await expect(faq).toBeVisible();
  await expect(faq.locator("summary")).toContainText("The page looks broken");
  await faq.locator("summary").click();
  await expect(faq).toHaveAttribute("open", "");
  await expect(faq.locator("p")).toContainText("hard refresh");
  await expect(page.getByTestId("help-contact-unset")).toBeVisible();

  // An error on the page before the report is opened (as a script failure would be), with an address in its message.
  await page.evaluate(() => { setTimeout(() => { throw new Error("Could not load for student.name@example.com"); }, 0); });
  await page.waitForTimeout(300);

  // 2. The report.
  await page.getByTestId("help-report").click();
  const dlg = page.getByTestId("report-dialog");
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText(T("wc_rep_desc"));
  await page.getByTestId("report-text").fill("I pressed Parse and the page showed an error.");
  const facts = page.getByTestId("report-facts");
  for (const label of ["Appuscholar build:", "Tool open:", "Interface language: en", "Browser:", "Screen:", "Online: yes", "AI provider chosen:", "Recent errors:"]) await expect(facts).toContainText(label);
  await expect(facts).toContainText("[email]");
  await expect(facts).not.toContainText("student.name");
  await expect(page.getByTestId("report-mail")).toHaveCount(0);

  // 3. Copy the report.
  await page.getByTestId("report-copy").click();
  await expect(page.getByTestId("report-status")).toHaveText(T("wc_rep_copied"));
  const clip = await page.evaluate(() => (window as unknown as { __clip: string[] }).__clip);
  expect(clip).toHaveLength(1);
  expect(clip[0]!.startsWith("I pressed Parse and the page showed an error.\n\n--- Added by the app ---\nAppuscholar build: ")).toBe(true);
  expect(clip[0]).toContain("[email]");
  expect(clip[0]).not.toContain("student.name");
  await expect(page.getByTestId("toast")).toHaveCount(0);

  // 4. The counts.
  await expect(facts).not.toContainText("Tool opens:");
  await page.getByTestId("report-usage").check();
  await expect(facts).toContainText("Tool opens:");
  await page.getByTestId("report-clear").click();
  await expect(page.getByTestId("report-status")).toHaveText(T("wc_rep_cleared"));
  await expect(page.getByTestId("report-local")).toContainText("Tool opens: nothing yet");
  expect(await page.evaluate(() => localStorage.getItem("appu_usage"))).toBeNull();
});
