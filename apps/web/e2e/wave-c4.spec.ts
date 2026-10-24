/**
 * Wave C, Task C4: the problem report, the tool counts and the "page looks broken" FAQ entry, walked by a student.
 *   1. a project is made and two places of it are opened, so there is something to count;
 *   2. Help opens; the FAQ entry "The page looks broken" is there and opens to its answer;
 *   3. "Report a problem" opens; the student types a description; the preview shows what the app adds (build, tool, language, browser, screen,
 *      online, AI provider) and three earlier script errors whose messages carry an email address, a key and the engine's own quotation of a
 *      document ("Participan..."): none of that text is in the preview;
 *   4. "Copy the report" puts the description, the divider and the facts on the (mocked) clipboard, and the dialog says "Report copied" (no toast);
 *   5. ticking the counts box adds them to the preview, and they name the two places opened; "Clear the counts" empties them.
 * With no NEXT_PUBLIC_SUPPORT_EMAIL (the e2e server has none) there is no mail button and Help's "direct contact" line shows.
 * Copy is read from the dictionaries. Nothing is sent anywhere: the AI is never called. The errors are announced to the page as error events
 * with no error object, which the report hears and Next's development overlay ignores, so nothing covers the page.
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

  // 1. A project, and two of its places.
  await page.locator("#ideaTopic").fill("Does a fixed bedtime routine lower exam anxiety in first-year students?");
  await page.locator("#ideaRes").fill("About 60 first-years");
  await page.getByTestId("idea-save").click();
  await expect(page.getByTestId("project-home")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("home-open-lit").click();
  await expect(page).toHaveURL(/\/lit$/);
  await page.getByTestId("place-tab-compare").click();
  await expect(page).toHaveURL(/\/lit\/compare$/);

  // 2. The FAQ entry.
  await page.getByTestId("help-btn").click();
  await expect(page.getByTestId("help-dialog")).toBeVisible();
  const faq = page.getByTestId("faq-broken");
  await expect(faq).toBeVisible();
  await expect(faq.locator("summary")).toContainText(T("faq_q_broken"));
  await faq.locator("summary").click();
  await expect(faq).toHaveAttribute("open", "");
  await expect(faq.locator("p")).toContainText(T("faq_a_broken"));
  await expect(page.getByTestId("help-contact-unset")).toBeVisible();

  // Errors on the page before the report is opened: an address, a key in a web address, and the engine's own words on a pasted paragraph.
  await page.evaluate(() => {
    let parse = "";
    try { JSON.parse("Participant Meera said the hostel food was cold"); } catch (e) { parse = (e as Error).message; }
    const fail = (message: string, lineno: number) => window.dispatchEvent(new ErrorEvent("error", { message, filename: "http://localhost/_next/static/chunks/app.js?v=ZZ9", lineno }));
    fail("Could not load for student.name@example.com", 4);
    fail("Request failed: https://api.example/v1/models?key=AIzaSyDUMMYDUMMYDUMMYDUMMY12345 returned 400", 5);
    fail(parse, 6);
  });

  // 3. The report.
  await page.getByTestId("help-report").click();
  const dlg = page.getByTestId("report-dialog");
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText(T("wc_rep_desc"));
  await page.getByTestId("report-text").fill("I pressed Parse and the page showed an error.");
  const facts = page.getByTestId("report-facts");
  for (const label of ["Appuscholar build:", "Tool open: lit/compare", "Interface language: en", "Browser:", "Screen:", "Online: yes", "AI provider chosen:", "Recent errors:"]) await expect(facts).toContainText(label);
  await expect(facts).toContainText("[email]");
  await expect(facts).toContainText("returned 400");
  await expect(facts).toContainText("is not valid JSON");
  await expect(facts).toContainText("app.js:6");
  const shown = (await facts.textContent()) ?? "";
  for (const secret of ["student.name", "AIza", "DUMMY", "ZZ9", "Participan", "Meera", "hostel"]) expect(shown, secret).not.toContain(secret);
  expect(shown).not.toContain("/p/"); // the address of the project is not in it
  await expect(page.getByTestId("report-mail")).toHaveCount(0);

  // 4. Copy the report.
  await page.getByTestId("report-copy").click();
  await expect(page.getByTestId("report-status")).toHaveText(T("wc_rep_copied"));
  const clip = await page.evaluate(() => (window as unknown as { __clip: string[] }).__clip);
  expect(clip).toHaveLength(1);
  expect(clip[0]!.startsWith("I pressed Parse and the page showed an error.\n\n--- Added by the app ---\nAppuscholar build: ")).toBe(true);
  expect(clip[0]!.endsWith(shown)).toBe(true);
  expect(clip[0]).toContain("[email]");
  for (const secret of ["student.name", "AIza", "Participan", "Meera"]) expect(clip[0]!, secret).not.toContain(secret);
  await expect(page.getByTestId("toast")).toHaveCount(0);

  // 5. The counts.
  await expect(facts).not.toContainText("Tool opens:");
  await page.getByTestId("report-usage").check();
  await expect(facts).toContainText("Tool opens:");
  const local = page.getByTestId("report-local");
  await expect(local).toContainText("lit 1");
  await expect(local).toContainText("lit/compare 1");
  await expect(local).toContainText("Errors by tool: lit/compare 3");
  await page.getByTestId("report-clear").click();
  await expect(page.getByTestId("report-status")).toHaveText(T("wc_rep_cleared"));
  await expect(local).toContainText("Tool opens: nothing yet");
  await expect(facts).toContainText("Recent errors: none");
  expect(await page.evaluate(() => localStorage.getItem("appu_usage"))).toBeNull();
});
