/**
 * Wave C, Task C5: the welcome-back recap after a gap.
 *
 * One sign-in and one study. The steps:
 *   1. a student whose last visit was eight days ago loads the app and, a moment after the project has loaded, meets the recap: the days away,
 *      the project, what the account can count, the three questions and the switch in its footer;
 *   2. they answer, press Save my answers, and the recap goes with "Saved"; the answers sit on this device under this account's key;
 *   3. a reload shows no recap (the check ran, and the visit is stamped again);
 *   4. eight days later again, the recap shows the earlier answer; the switch writes this account's off key; Skip closes and stamps.
 * The last visit is set from the page once and the page reloaded, never by an init script, which would put the old stamp back on every reload.
 *
 * Run it with the recipe in e2e/support/pglite-postgres.mjs's header, for example on free ports:
 *   PGLITE_PORT=5487 node e2e/support/pglite-postgres.mjs &
 *   E2E_API_PORT=8887 E2E_WEB_PORT=3087 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5487/postgres \
 *     pnpm --filter @appuscholar/web exec playwright test e2e/wave-c5.spec.ts
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { signIn } from "./support/signin";
import { makeStudy } from "./support/study";

const EN = JSON.parse(readFileSync(path.join(__dirname, "../messages/en.json"), "utf8")) as Record<string, string>;
const RECAP = JSON.parse(readFileSync(path.join(__dirname, "../messages/tools/help-recap.en.json"), "utf8")) as Record<string, string>;
const T = (key: string): string => {
  const raw = RECAP[key] ?? EN[key];
  if (raw === undefined) throw new Error("no such key: " + key);
  return raw;
};

const DAY = 86_400_000;
test.describe.configure({ timeout: 120_000 });

/** A new account makes its first study (Start a new study, then Shape your study's question and what it has); the study's home opens. */
async function newProject(page: Page): Promise<void> {
  await signIn(page, { prefix: "r", newAccount: true, ready: ["project-list"] });
  await makeStudy(page, { question: "Does a fixed bedtime routine lower exam anxiety in first-year students?", have: "About 60 first-years" });
}

/** The account's keys on this device, read off the page: the app names them `appu_<what>_<account id>`, so the spec learns the id from the key. */
const keysOf = (page: Page, prefix: string) => page.evaluate((p) => Object.keys(localStorage).filter((k) => k.startsWith(p)), prefix);
const lastActiveKey = async (page: Page): Promise<string> => {
  await expect.poll(async () => (await keysOf(page, "appu_last_active_")).length).toBe(1);
  return (await keysOf(page, "appu_last_active_"))[0]!;
};
const read = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);

/**
 * Says the last visit was `days` days ago, then loads the page again. An init script puts the stamp there before the app starts (so the page being
 * left cannot stamp over it), once per call: the flag in sessionStorage stops it putting the old stamp back on the reloads after.
 */
async function awayFor(page: Page, key: string, days: number): Promise<void> {
  await page.addInitScript(([k, ms, flag]) => {
    try {
      if (sessionStorage.getItem(flag!)) return;
      sessionStorage.setItem(flag!, "1");
      localStorage.setItem(k!, String(Date.now() - Number(ms)));
    } catch { /* storage blocked: the test fails on the missing recap */ }
  }, [key, String(days * DAY), "c5-away-" + days]);
  await page.reload();
  await expect(page.getByTestId("project-home")).toBeVisible();
}

test("a student back after eight days meets the recap once, answers it, and is not asked again", async ({ page }) => {
  await newProject(page);

  // The first visit stamps the account's own key, once the check has run; nothing is kept under v1's device-wide names.
  const key = await lastActiveKey(page);
  const id = key.slice("appu_last_active_".length);
  expect(id.length).toBeGreaterThan(8);
  expect(await page.evaluate(() => ["appu_last_active", "appu_recap_off", "appu_recap_answers", "appu_gap_days"].filter((k) => localStorage.getItem(k) !== null))).toEqual([]);
  await expect(page.getByTestId("recap-dialog")).toHaveCount(0);

  // 1. Eight days away: the recap shows after the delay.
  await awayFor(page, key, 8);
  const dialog = page.getByTestId("recap-dialog");
  await expect(dialog).toBeVisible();
  const facts = page.getByTestId("recap-facts");
  await expect(facts).toContainText("You have been away 8 days.");
  await expect(facts).toContainText(/Study: .+\./);
  await expect(facts).toContainText(/new document\(s\)/);
  await expect(dialog).toContainText(T("wc_recap_intro"));
  await expect(dialog).not.toContainText("this computer");
  await expect(page.getByTestId("recap-off")).toBeChecked();

  // 2. Answer two of the three and save.
  await page.getByTestId("recap-q1").fill("Does a fixed bedtime routine lower exam anxiety?");
  await page.getByTestId("recap-q2").fill("Write the method section.");
  await page.getByTestId("recap-save").click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("toast")).toContainText(T("wc_recap_saved"));
  const answersKey = "appu_recap_answers_" + id;
  const kept = JSON.parse((await read(page, answersKey)) ?? "[]") as Array<{ a1: string; a2: string; a3: string }>;
  expect(kept.map((x) => [x.a1, x.a2, x.a3])).toEqual([["Does a fixed bedtime routine lower exam anxiety?", "Write the method section.", ""]]);
  expect(await keysOf(page, "appu_recap_answers")).toEqual([answersKey]);
  const stampedBySave = Number(await read(page, key));
  expect(Date.now() - stampedBySave).toBeLessThan(60_000);

  // 3. Reload: the check runs again (it stamps the visit once more), finds the visit is fresh and shows nothing.
  await page.reload();
  await expect(page.getByTestId("project-home")).toBeVisible();
  await expect.poll(async () => Number(await read(page, key))).toBeGreaterThan(stampedBySave);
  await expect(dialog).toHaveCount(0);

  // 4. Away again: the earlier first answer is shown, the switch writes this account's key, and Skip closes and stamps.
  await awayFor(page, key, 9);
  await expect(dialog).toBeVisible();
  await expect(facts).toContainText("You have been away 9 days.");
  await expect(page.getByTestId("recap-prev")).toContainText("Does a fixed bedtime routine lower exam anxiety?");
  const offKey = "appu_recap_off_" + id;
  await page.getByTestId("recap-off").uncheck();
  expect(await read(page, offKey)).toBe("1");
  await page.getByTestId("recap-off").check();
  expect(await read(page, offKey)).toBe("0");
  await page.getByTestId("recap-skip").click();
  await expect(dialog).toBeHidden();
  expect(Date.now() - Number(await read(page, key))).toBeLessThan(60_000);
  expect(await keysOf(page, "appu_recap_off")).toEqual([offKey]);
  // The Skip saved no new answers.
  expect((JSON.parse((await read(page, answersKey)) ?? "[]") as unknown[]).length).toBe(1);
});
