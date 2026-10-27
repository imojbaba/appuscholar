/**
 * Stages 3 to 6, Task G5: the four later stages as places with their tabs (Design and ethics, Collection and analysis, Writing, Review), before any
 * tool is built. docs/walkthroughs/tools-g.md is the same walk for a human on the live site; its rows carry this test's step numbers. Keep the two in step.
 *
 * One sign-in and one project. The steps:
 *   1. each stage 3 to 6 place opens with its tabs in order, each labelled from the dictionary (Writing's first tab is the document);
 *   2. each tool tab reads "Not built yet" with its own line, "Open my document" while the document is closed (not in Writing, which shows it), and
 *      its "Suggested next" line last;
 *   3. Writing keeps the document first and adds My style and Words;
 *   4. at 375 px the tabs scroll sideways and the last one can be reached;
 *   5. the home's rows for Design and ethics, Collection and analysis and Review still read "Not built yet. You can plan it in your document.".
 *
 * Run it with the recipe in e2e/support/pglite-postgres.mjs's header, for example on free ports:
 *   PGLITE_PORT=5441 node e2e/support/pglite-postgres.mjs &
 *   E2E_API_PORT=8941 E2E_WEB_PORT=3141 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5441/postgres \
 *     pnpm --filter @appuscholar/web exec playwright test e2e/tools-g.spec.ts
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { makeStudy } from "./support/study";
import { signIn } from "./support/signin";
import { stageBuilt, tabBuilt } from "./support/builtTools";

// ---- Copy: every sentence asserted is read from the dictionary ---------------------------------------------------------------------------------------

const EN = JSON.parse(readFileSync(path.join(__dirname, "../messages/en.json"), "utf8")) as Record<string, string>;
function T(key: string): string {
  const raw = EN[key];
  if (raw === undefined) throw new Error("no such key in en.json: " + key);
  return raw;
}

// ---- The places, as the plan fixes them (the tab ids sessions A to E build against) -----------------------------------------------------------------------

type StageId = "design" | "collect" | "writing" | "review";
const PLACES: Array<{ stage: StageId; tabs: string[] }> = [
  { stage: "design", tabs: ["overview", "pathway", "protocol", "ethics", "registration", "investigator", "budget", "aiuse"] },
  { stage: "collect", tabs: ["participants", "data", "power", "charts", "check", "scales", "coding"] },
  { stage: "writing", tabs: ["document", "style", "words"] },
  { stage: "review", tabs: ["closeness", "viva", "slides"] }
];
/** The stages whose home row still says it is not built (Writing's is built: the document). */
const HOME_NOT_BUILT: StageId[] = (["design", "collect", "review"] as StageId[]).filter((s) => !stageBuilt(s));
const PHONE = { width: 375, height: 812 };

test.describe.configure({ timeout: 180_000 });

/** First run's "Save as my project" with a typed idea; the new project's home opens. Returns the project's id. */
async function newProject(page: Page): Promise<string> {
  await signIn(page, { prefix: "g", newAccount: true, ready: ["project-list"] });
  await makeStudy(page, { question: "Does a fixed bedtime routine lower exam anxiety in first-year students?", have: "About 60 first-years" });
  await expect(page.getByTestId("project-home")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("home-stages")).toBeVisible();
  const id = /\/p\/([^/?#]+)/.exec(page.url())?.[1];
  if (!id) throw new Error("no project id in " + page.url());
  return id;
}

/** The place's tabs as the student reads them: [test id, text] in page order. */
const tabsOf = (page: Page) => page.getByTestId("place-tabs").locator("a").evaluateAll((els) =>
  els.map((a) => [a.getAttribute("data-testid"), (a.textContent ?? "").trim()] as [string | null, string]));

test("the stage 3 to 6 places, their tabs, and Not built yet", async ({ page }) => {
  const id = await newProject(page);

  // 5. The home's rows (checked first, on the home we are on): the three unbuilt stages say so in words; each row opens its place.
  for (const stage of HOME_NOT_BUILT) await expect(page.getByTestId("home-detail-" + stage), stage).toHaveText(T("detail_not_built"));

  for (const { stage, tabs } of PLACES) {
    // 1. The place opens from the home's row, on its first tab, with every tab in order and labelled.
    await page.goto(`/p/${id}`);
    await expect(page.getByTestId("home-stages")).toBeVisible();
    await page.getByTestId("home-open-" + stage).click();
    await expect(page).toHaveURL(new RegExp(`/p/${id}/${stage}(/${tabs[0]})?$`));
    await expect(page.getByTestId("place-name")).toHaveText(T("stage_name_" + stage));
    expect(await tabsOf(page), stage).toEqual(tabs.map((tab) => ["place-tab-" + tab, T("tab_name_" + tab)]));
    await expect(page.getByTestId("place-tab-" + tabs[0]), stage).toHaveAttribute("aria-current", "true");

    // 3. Writing keeps the document first: it is the first tab, and the document is shown under the place.
    if (stage === "writing") {
      expect(tabs[0]).toBe("document");
      await expect(page.getByTestId("frame-doc")).toBeVisible();
    }

    // 2. Each tool tab: "Not built yet" and its own line, the document button while the document is closed, the next line last.
    for (const tab of tabs.filter((x) => x !== "document")) {
      await page.getByTestId("place-tab-" + tab).click();
      await expect(page).toHaveURL(new RegExp(`/p/${id}/${stage}/${tab}$`));
      await expect(page.getByTestId("place-tab-" + tab)).toHaveAttribute("aria-current", "true");
      const body = page.getByTestId(`place-${stage}-${tab}`);
      await expect(body, tab).toBeVisible();
      // A tab whose tool session has shipped draws its tool instead; it is checked by that session's own spec.
      if (tabBuilt(stage, tab)) {
        await expect(body.getByTestId("not-built"), tab).toHaveCount(0);
      } else {
      await expect(body.getByTestId("not-built"), tab).toHaveText(`${T("place_not_built")} ${T("not_built_tab_body")}`);
      if (stage === "writing") {
        // The document is shown under Writing's place, so there is nothing to open.
        await expect(body.getByTestId("not-built-open"), tab).toHaveCount(0);
        await expect(page.getByTestId("frame-doc")).toBeVisible();
      } else {
        await expect(body.getByTestId("not-built-open"), tab).toHaveText(T("not_built_open_doc"));
      }
      }
      const next = body.getByTestId(stage + "-next");
      await expect(next, tab).toHaveText(T(`${stage}_next_${tab}`));
      // The next line is the last thing in the tab's body.
      expect(await body.evaluate((el, tid) => el.lastElementChild?.getAttribute("data-testid") === tid, stage + "-next"), tab).toBe(true);
    }
  }

  // 4. The phone: the tabs scroll sideways, and the last tab can be reached by scrolling.
  await page.setViewportSize(PHONE);
  for (const { stage, tabs } of PLACES) {
    await page.goto(`/p/${id}/${stage}/${tabs[tabs.length - 1]}`);
    const bar = page.getByTestId("place-tabs");
    await expect(bar).toBeVisible();
    expect(await bar.evaluate((el) => getComputedStyle(el).overflowX), stage).toBe("auto");
    // Design (eight tabs) and Collection (seven) are wider than the screen; Writing and Review (three) may fit.
    if (stage === "design" || stage === "collect") {
      expect(await bar.evaluate((el) => el.scrollWidth > el.clientWidth), stage).toBe(true);
    }
    const last = page.getByTestId("place-tab-" + tabs[tabs.length - 1]);
    await last.scrollIntoViewIfNeeded();
    const box = (await last.boundingBox())!;
    expect(box.x, stage).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, stage).toBeLessThanOrEqual(PHONE.width);
    await expect(last).toHaveAttribute("aria-current", "true");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), stage).toBe(true);
  }
});
