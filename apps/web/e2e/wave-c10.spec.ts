/**
 * Wave C, Task C10: "Erase the log" on the AI-use tab, walked by a student.
 *
 * One sign-in, one project, one test. GET /ai/log is answered in the browser with two rows of invented sample log (the only network answer made up
 * here); DELETE /ai/log goes to the real api (the account's log is empty there, so it answers 204), and once it has answered the made-up GET answers
 * an empty list, as the api would. The steps:
 *   1. the AI-use tab lists the two rows; a statement is built into the box;
 *   2. Erase the log opens a confirm that says "all your projects"; Cancel sends nothing and the rows stay;
 *   3. Erase the log, then the confirm's button: exactly one DELETE /ai/log, the tab shows the empty-log message and the erased line, the statement
 *      built in step 1 is still in its box;
 *   4. a reload reads the log again and it is empty.
 * The texts asserted are the dictionaries' (T). The AI is never called.
 *
 * Run it on its own ports (task 10), as e2e/support/pglite-postgres.mjs describes:
 *   PGLITE_PORT=5492 node e2e/support/pglite-postgres.mjs &
 *   E2E_API_PORT=8892 E2E_WEB_PORT=3092 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5492/postgres \
 *     pnpm --filter @appuscholar/web exec playwright test e2e/wave-c10.spec.ts
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import { test, expect, type Page, type Route } from "@playwright/test";
import type { AiuEntry } from "@appuscholar/core";
import { signIn } from "./support/signin";
import { API_ORIGIN, WEB_ORIGIN } from "./support/origins";

const MESSAGES = path.join(__dirname, "../messages");
const EN = { ...JSON.parse(readFileSync(path.join(MESSAGES, "en.json"), "utf8")), ...JSON.parse(readFileSync(path.join(MESSAGES, "tools/design.en.json"), "utf8")) } as Record<string, string>;
/** t() as lib/i18n.tsx's tFormat does it: the English sentence with its {vars} filled in. */
function T(key: string, vars?: Record<string, string | number>): string {
  const raw = EN[key];
  if (raw === undefined) throw new Error("no such key in the dictionaries: " + key);
  return vars ? raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : raw;
}

/** Two invented requests on two days, two kinds of help. */
const LOG: AiuEntry[] = [
  { d: "2026-10-20", p: "groq", m: "llama-3.3-70b-versatile", k: "rewrite", g: "text" },
  { d: "2026-10-21", p: "groq", m: "llama-3.3-70b-versatile", k: "feedback", g: "feedback" }
];
const CORS_APP = { "access-control-allow-origin": WEB_ORIGIN, "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS" };

test.describe.configure({ timeout: 300_000 });
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });

/** First run's "Save as my project" with a typed idea; the new project's home opens. Returns the project's id. */
async function newProject(page: Page): Promise<string> {
  await signIn(page, { prefix: "c10", newAccount: true, ready: ["first-run"] });
  await page.locator("#ideaTopic").fill("Does a fixed bedtime routine lower exam anxiety in first-year students?");
  await page.locator("#ideaRes").fill("About 60 first-years");
  await page.getByTestId("idea-save").click();
  await expect(page.getByTestId("project-home")).toBeVisible({ timeout: 20_000 });
  const id = /\/p\/([^/?#]+)/.exec(page.url())?.[1];
  if (!id) throw new Error("no project id in " + page.url());
  return id;
}

test("AI-use tab: Erase the log asks first, erases once, shows the empty log and keeps the statement", async ({ page }) => {
  const id = await newProject(page);

  // The log: made up while it has not been erased, empty after the api has answered the DELETE.
  let erased = false;
  const deletes: string[] = [];
  await page.route((url) => url.origin === API_ORIGIN && url.pathname === "/ai/log", async (route: Route) => {
    const method = route.request().method();
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: CORS_APP });
    if (method === "DELETE") return route.continue();
    return route.fulfill({ status: 200, contentType: "application/json", headers: CORS_APP, body: JSON.stringify(erased ? [] : LOG) });
  });
  page.on("response", (r) => {
    if (r.request().method() === "DELETE" && new URL(r.url()).pathname === "/ai/log") { deletes.push(String(r.status())); if (r.status() === 204) erased = true; }
  });

  await page.getByTestId("home-open-design").click();
  await page.getByTestId("place-tab-aiuse").click();
  await expect(page).toHaveURL(new RegExp(`/p/${id}/design/aiuse$`));
  await expect(page.getByTestId("panel-design-aiuse")).toBeVisible();

  await test.step("1. the two rows are listed and a statement is built", async () => {
    await expect(page.getByTestId("aiu-count")).toHaveText(T("design_aiu_count", { all: LOG.length, n: LOG.length }));
    await expect(page.getByTestId("aiu-rows").locator("input")).toHaveCount(2);
    await page.getByTestId("aiu-build").click();
    await expect(page.getByTestId("aiu-out")).toHaveValue(/I used Appuscholar/);
  });
  const built = await page.getByTestId("aiu-out").inputValue();

  await test.step("2. the confirm names all your projects; Cancel sends nothing", async () => {
    await page.getByTestId("aiu-erase").click();
    const box = page.getByTestId("aiu-erase-confirm");
    await expect(box).toBeVisible();
    await expect(box).toContainText("all your projects");
    await expect(box).toContainText(T("design_aiu_erase_desc"));
    await page.getByTestId("aiu-erase-cancel").click();
    await expect(box).toBeHidden();
    expect(deletes).toEqual([]);
    await expect(page.getByTestId("aiu-rows").locator("input")).toHaveCount(2);
  });

  await test.step("3. Erase: one delete, the empty-log message, the statement stays", async () => {
    await page.getByTestId("aiu-erase").click();
    await page.getByTestId("aiu-erase-yes").click();
    await expect(page.getByTestId("aiu-erase-confirm")).toBeHidden();
    await expect(page.getByTestId("aiu-erase-msg")).toHaveText(T("design_aiu_erased"));
    await expect(page.getByTestId("aiu-count")).toHaveText(T("design_aiu_empty"));
    await expect(page.getByTestId("aiu-rows").locator("input")).toHaveCount(0);
    expect(deletes).toEqual(["204"]);
    await expect(page.getByTestId("aiu-out")).toHaveValue(built);
  });

  await test.step("4. after a reload the log is read again and is empty", async () => {
    await page.reload();
    await expect(page.getByTestId("panel-design-aiuse")).toBeVisible();
    await expect(page.getByTestId("aiu-count")).toHaveText(T("design_aiu_empty"));
    await expect(page.getByTestId("aiu-erase-msg")).toHaveText("");
  });
});
