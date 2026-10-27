/**
 * Stages 3 to 6, Session A: the Design and ethics place, all eight tabs, walked by a student. docs/walkthroughs/tools-a.md is the same walk for a human
 * on the live site; its rows carry this test's step numbers. Keep the two in step.
 *
 * One sign-in and one project, one test. The steps:
 *   1. the place opens with its eight tabs, and the Overview reads "0 of 6 ready";
 *   2. Pathway: the four answers, Check pathway; core's lines, the warning and "Only your committee can say that, in writing."; "exempt" appears nowhere;
 *      the Overview reads "1 of 6 ready";
 *   3. Protocol: two sections, Save ("Saved"), the document opened beside, Generate protocol document (once, at the end; "Inserted");
 *   4. Ethics and consent: a document ticked, minors "yes" shows core's minors note, the ethics statement is in the document, at its end;
 *   5. Registration exports ctri-readiness-<date>.md; Investigator refuses an empty CV inline and downloads nothing, then exports pi-cv-<date>.txt;
 *      Budget shows the total and exports trial-budget-<date>.md;
 *   6. AI-use statement, with a log of three requests (GET /ai/log?projectId= answered in the browser): everything unticked is refused with core's
 *      "Tick them, or change the dates" sentence; ticked, the statement is core's; Insert puts it in the document;
 *   7. after a reload the Overview still reads the number of ready items (the six blobs were saved and read again);
 *   8. at 375 px the tab row can be scrolled to the last tab, and the Budget and AI-use tabs fit with no sideways scroll on the page.
 * The texts asserted are core's own output (regPathway, REG_WARN, ecMinorsNoteV2, ethicsStatement, protocolMarkdown, ctriMarkdown, piCvText, budgetRows and
 * budgetTotalText, budgetMarkdown, aiuBuildV2) or the dictionaries' (T). What is typed here is only: the two toast words "Saved" and "Inserted" (the
 * only two toasts this place makes), the committee sentence of rule 9, and the file-name patterns. The AI is
 * never called: this group has no AI step, and the only network answer made up here is the AI-use log.
 *
 * Run it with the recipe in e2e/support/pglite-postgres.mjs's header, for example on free ports:
 *   PGLITE_PORT=5451 node e2e/support/pglite-postgres.mjs &
 *   E2E_API_PORT=8951 E2E_WEB_PORT=3151 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5451/postgres \
 *     pnpm --filter @appuscholar/web exec playwright test e2e/tools-a.spec.ts
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import { test, expect, type Locator, type Page, type Route } from "@playwright/test";
import {
  BUDGET_DEFAULTS, CTRI_FIELDS, PROVIDERS, REG_WARN, aiuBuildV2, budgetMarkdown, budgetRows, budgetTotalText, ctriMarkdown, ecMinorsNoteV2, ethicsStatement, piCvText,
  protocolMarkdown, regPathway, type AiuEntry
} from "@appuscholar/core";
import { signIn } from "./support/signin";
import { recordToasts } from "./support/toasts";
import { API_ORIGIN, WEB_ORIGIN } from "./support/origins";

// ---- Copy: every sentence asserted is read from the dictionaries (or is core's own output) -----------------------------------------------------------

const MESSAGES = path.join(__dirname, "../messages");
const EN = { ...JSON.parse(readFileSync(path.join(MESSAGES, "en.json"), "utf8")), ...JSON.parse(readFileSync(path.join(MESSAGES, "tools/design.en.json"), "utf8")) } as Record<string, string>;
/** t() as lib/i18n.tsx's tFormat does it: the English sentence with its {vars} filled in. */
function T(key: string, vars?: Record<string, string | number>): string {
  const raw = EN[key];
  if (raw === undefined) throw new Error("no such key in the dictionaries: " + key);
  return vars ? raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : raw;
}

const TABS = ["overview", "pathway", "protocol", "ethics", "registration", "investigator", "budget", "aiuse"] as const;
type Tab = (typeof TABS)[number];
/** "N of 6 ready", from the message the Overview uses. */
const READY = (done: number) => T("design_home_ready", { done, total: 6 });
/** core's statement for the log's two kinds of help, with `keep` of them ticked and the rest of the page as it starts (v1's defaults). */
const statement = (keep: Record<string, 1>) => aiuBuildV2({
  list: LOG, keep, other: "", fmt: "course",
  ticks: { own: true, reword: false, cite: false, facts: false, noData: false }, style: { on: false, decl: "", samples: 0 }, providers: PROVIDERS
});
/** The Budget rows once 1500 and 2500 are typed into the first two lines. */
const BUDGET_AFTER = BUDGET_DEFAULTS.map((label, i) => ({ label, amount: i === 0 ? "1500" : i === 1 ? "2500" : "" }));
const PHONE = { width: 375, height: 812 };
/** The version of the log's answer: three requests on two days, two kinds of help (the rows the statement is built from). */
const LOG: AiuEntry[] = [
  { d: "2026-10-20", p: "groq", m: "llama-3.3-70b-versatile", k: "rewrite", g: "text" },
  { d: "2026-10-21", p: "groq", m: "llama-3.3-70b-versatile", k: "rewrite", g: "text" },
  { d: "2026-10-21", p: "groq", m: "llama-3.3-70b-versatile", k: "feedback", g: "feedback" }
];
const CORS_APP = { "access-control-allow-origin": WEB_ORIGIN, "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS" };

test.describe.configure({ timeout: 300_000 });
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });

/** First run's "Save as my project" with a typed idea; the new project's home opens. Returns the project's id. */
async function newProject(page: Page): Promise<string> {
  await signIn(page, { prefix: "a", newAccount: true, ready: ["first-run"] });
  await page.locator("#ideaTopic").fill("Does a fixed bedtime routine lower exam anxiety in first-year students?");
  // The three questions are folded away, optional ("Add details for better feedback").
  await page.getByTestId("idea-details-toggle").click();
  await page.locator("#ideaRes").fill("About 60 first-years");
  await page.getByTestId("idea-save").click();
  await expect(page.getByTestId("project-home")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("home-stages")).toBeVisible();
  const id = /\/p\/([^/?#]+)/.exec(page.url())?.[1];
  if (!id) throw new Error("no project id in " + page.url());
  return id;
}

/** Opens one tab of the place by its link and waits for its page. */
async function openTab(page: Page, id: string, tab: Tab) {
  await page.getByTestId("place-tab-" + tab).click();
  await expect(page).toHaveURL(new RegExp(`/p/${id}/design/${tab}$`));
  await expect(page.getByTestId("place-tab-" + tab)).toHaveAttribute("aria-current", "true");
  await expect(page.getByTestId("panel-design-" + tab)).toBeVisible();
}

/** Opens the document beside the place ("Open my document"), unless it is open already. */
async function openDoc(page: Page) {
  if (await page.getByTestId("place-open-doc").isVisible()) await page.getByTestId("place-open-doc").click();
  await expect(page.getByTestId("frame-doc")).toBeVisible();
  await expect(page.locator(".ProseMirror")).toBeVisible();
}

/** The text of the open document, line breaks as the student sees them. */
const docText = (page: Page) => page.locator(".ProseMirror").evaluate((el) => (el as HTMLElement).innerText);

/** Rule 9: no page of this place says "exempt", whatever it computed. */
async function neverExempt(page: Page) {
  expect(await page.locator("body").innerText()).not.toMatch(/exempt/i);
}

/** The tabs as the student reads them: [test id, text] in page order. */
const tabsOf = (page: Page) => page.getByTestId("place-tabs").locator("a").evaluateAll((els) =>
  els.map((a) => [a.getAttribute("data-testid"), (a.textContent ?? "").trim()] as [string | null, string]));

test("Design and ethics: eight tabs, the tools, the files, the AI-use statement, a reload and a phone", async ({ page }) => {
  const id = await newProject(page);

  // Every design blob save the page makes (PUT /projects/:id/blobs/design_*): a step that changes something waits for them to settle before the next
  // one moves away or the page reloads (a save is sent 800 ms after the last change).
  let inFlight = 0;
  let lastPut = 0;
  page.on("request", (r) => { if (r.method() === "PUT" && /\/blobs\/design_/.test(r.url())) inFlight++; });
  const done = (r: { request(): { method(): string; url(): string } }) => { const q = r.request(); if (q.method() === "PUT" && /\/blobs\/design_/.test(q.url())) { inFlight--; lastPut = Date.now(); } };
  page.on("response", done);
  page.on("requestfailed", (r) => { if (r.method() === "PUT" && /\/blobs\/design_/.test(r.url())) { inFlight--; lastPut = Date.now(); } });
  const settled = async () => {
    await page.waitForTimeout(1_100);
    await expect.poll(() => inFlight === 0 && Date.now() - lastPut > 300, { timeout: 30_000 }).toBe(true);
  };

  // The AI-use log: the api's own answer is replaced in the browser (the only network answer made up here), and what it was asked is kept.
  const logAsked: string[] = [];
  await page.route((url) => url.origin === API_ORIGIN && url.pathname === "/ai/log", async (route: Route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS_APP });
    logAsked.push(new URL(route.request().url()).searchParams.get("projectId") ?? "");
    return route.fulfill({ status: 200, contentType: "application/json", headers: CORS_APP, body: JSON.stringify(LOG) });
  });
  // Nothing in this place calls the AI.
  let aiCalls = 0;
  page.on("request", (r) => { if (r.url().startsWith(API_ORIGIN + "/ai/complete")) aiCalls++; });
  const toasts = await recordToasts(page);
  // The files the place makes.
  const downloads: Array<{ name: string; body: string }> = [];
  page.on("download", (d) => { void d.path().then((p) => downloads.push({ name: d.suggestedFilename(), body: readFileSync(p!, "utf8") })); });
  const download = async (click: Locator) => {
    const before = downloads.length;
    const [d] = await Promise.all([page.waitForEvent("download"), click.click()]);
    await expect.poll(() => downloads.length).toBe(before + 1);
    expect(downloads[before]!.name).toBe(d.suggestedFilename());
    return downloads[before]!;
  };

  // ---- 1. the place and its tabs, the document closed ---------------------------------------------------------------------------------------------
  await test.step("1. the place opens with eight tabs; the Overview reads 0 of 6 ready", async () => {
    await page.getByTestId("home-open-design").click();
    await expect(page).toHaveURL(new RegExp(`/p/${id}/design(/overview)?$`));
    await expect(page.getByTestId("place-name")).toHaveText(T("stage_name_design"));
    await expect.poll(() => tabsOf(page)).toEqual(TABS.map((tab) => ["place-tab-" + tab, T("tab_name_" + tab)]));
    await expect(page.getByTestId("place-tab-overview")).toHaveAttribute("aria-current", "true");
    await expect(page.getByTestId("panel-design-overview")).toBeVisible();
    await expect(page.getByTestId("design-count")).toHaveText(READY(0));
    // Six pieces and the AI-use statement, each a link to its own tab; the document is closed.
    await expect(page.getByTestId("design-rows").locator("a")).toHaveCount(7);
    await expect(page.getByTestId("frame-doc")).toBeHidden();
    await neverExempt(page);
  });

  // ---- 2. Pathway ---------------------------------------------------------------------------------------------------------------------------------
  await test.step("2. Pathway: four answers, Check pathway, core's lines, the warning, the committee note; never 'exempt'; the Overview reads 1 of 6", async () => {
    await openTab(page, id, "pathway");
    await expect(page.getByTestId("reg-result")).toHaveCount(0);
    const answers = { type: "drug", pop: "minors", bio: true, multi: true };
    await page.getByTestId("reg-type").selectOption(answers.type);
    await page.getByTestId("reg-pop").selectOption(answers.pop);
    await page.getByTestId("reg-bio").check();
    await page.getByTestId("reg-multi").check();
    await page.getByTestId("reg-check").click();
    await expect(page.getByTestId("reg-result")).toBeVisible();
    const lines = regPathway(answers).lines;
    await expect(page.getByTestId("reg-lines").locator("li")).toHaveText(lines);
    // The warning is core's REG_WARN with its emoji left off (an icon stands in its place).
    await expect(page.getByTestId("reg-warn")).toContainText(REG_WARN.replace(/^\P{L}+/u, ""));
    await expect(page.getByTestId("reg-committee")).toHaveText("Only your committee can say that, in writing.");
    await expect(page.getByTestId("reg-committee")).toHaveText(T("design_reg_committee"));
    await neverExempt(page);
    await settled();
    await openTab(page, id, "overview");
    await expect(page.getByTestId("design-count")).toHaveText(READY(1));
    await neverExempt(page);
  });

  // ---- 3. Protocol --------------------------------------------------------------------------------------------------------------------------------
  await test.step("3. Protocol: two sections, Save, Generate puts the document once at the end of the open document", async () => {
    await openTab(page, id, "protocol");
    const bg = "Exam anxiety is common in first-year students and sleep is a cause worth testing.";
    const obj = "To test whether a fixed bedtime routine lowers exam anxiety over one week.";
    await page.getByTestId("proto-bg").fill(bg);
    await page.getByTestId("proto-obj").fill(obj);
    await page.getByTestId("proto-save").click();
    await expect.poll(toasts).toContain("Saved");
    await expect.poll(toasts).toContain(T("design_saved"));
    // The document opens beside the place; the generated text goes in at its end.
    await openDoc(page);
    await page.getByTestId("proto-generate").click();
    await expect.poll(toasts).toContain("Inserted");
    await expect.poll(toasts).toContain(T("design_inserted"));
    const doc = protocolMarkdown({ bg, obj, design: "", part: "", sample: "", proc: "", risk: "", dmp: "" })!;
    await expect(page.locator(".ProseMirror")).toContainText(doc.split("\n")[0]!);
    const text = await docText(page);
    expect(text.split("# Research protocol / synopsis").length - 1, "the protocol is in the document once").toBe(1);
    expect(text.trimEnd().endsWith("[add citations from the Citation Manager]"), "and it is at the end").toBe(true);
    expect(text).toContain(bg);
    expect(text).toContain(obj);
    expect(text).toContain("[not filled in]");
    await expect(page.getByTestId("proto-msg")).toHaveText("");
    await settled();
  });

  // ---- 4. Ethics and consent ----------------------------------------------------------------------------------------------------------------------
  await test.step("4. Ethics and consent: a document ticked, minors 'yes' shows the note, the ethics statement is inserted", async () => {
    await openTab(page, id, "ethics");
    await expect(page.getByTestId("ec-minors-note")).toHaveCount(0);
    await page.getByTestId("ec-doc-0").check();
    await page.getByTestId("ec-status").selectOption("approved");
    await page.getByTestId("ec-committee").fill("Institutional Ethics Committee, Department of Psychology");
    await page.getByTestId("ec-minors").selectOption("yes");
    await expect(page.getByTestId("ec-minors-note")).toHaveText(ecMinorsNoteV2("yes"));
    const st = ethicsStatement({ status: "approved", committee: "Institutional Ethics Committee, Department of Psychology", apprNo: "", apprDate: "", consentMode: "", minors: "yes" });
    if ("error" in st) throw new Error("core refused a statement with a status: " + st.error);
    await page.getByTestId("ec-statement").click();
    await expect(page.getByTestId("ec-statement-reminder")).toHaveText(T("design_ec_check_true"));
    await expect(page.getByTestId("ec-statement-msg")).toHaveText("");
    await expect(page.locator(".ProseMirror")).toContainText(st.text);
    expect(await docText(page)).toContain(st.heading);
    // The statement is added after the protocol: it is the end of the document now.
    expect((await docText(page)).trimEnd().endsWith(st.text.trim())).toBe(true);
    await neverExempt(page);
    await settled();
  });

  // ---- 5. Registration, Investigator, Budget ------------------------------------------------------------------------------------------------------
  await test.step("5a. Registration: tick items, Export readiness report downloads ctri-readiness-<date>.md", async () => {
    await openTab(page, id, "registration");
    await expect(page.getByTestId("ctri-never")).toHaveText(T("design_ctri_never"));
    await page.getByTestId("ctri-field-0").check();
    await page.getByTestId("ctri-field-1").check();
    const f = await download(page.getByTestId("ctri-export"));
    expect(f.name).toMatch(/^ctri-readiness-\d{4}-\d{2}-\d{2}\.md$/);
    expect(f.body.startsWith(ctriMarkdown({}).split("\n")[0]!)).toBe(true);
    expect(f.body).toBe(ctriMarkdown({ 0: true, 1: true }));
    expect(f.body).toContain(`2 of ${CTRI_FIELDS.length} fields ready`);
    await expect(page.getByTestId("ctri-msg")).toHaveText(T("design_exported", { name: f.name }));
    await settled();
  });
  await test.step("5b. Investigator: an empty CV is refused inline and nothing downloads; with a CV, pi-cv-<date>.txt", async () => {
    await openTab(page, id, "investigator");
    await page.getByTestId("pi-item-0").check();
    const before = downloads.length;
    await page.getByTestId("pi-export").click();
    await expect(page.getByTestId("pi-msg")).toHaveText((piCvText("") as { error: string }).error);
    await page.waitForTimeout(800);
    expect(downloads.length, "nothing was downloaded").toBe(before);
    const cv = "Dr A. Student, MA Psychology, first-year research methods tutor, GCP certificate 2026.";
    await page.getByTestId("pi-cv").fill(cv);
    const f = await download(page.getByTestId("pi-export"));
    expect(f.name).toMatch(/^pi-cv-\d{4}-\d{2}-\d{2}\.txt$/);
    expect(f.body).toBe(cv);
    await expect(page.getByTestId("pi-msg")).toHaveText(T("design_exported", { name: f.name }));
    await settled();
  });
  await test.step("5c. Budget: an amount shows in the total line; Export downloads trial-budget-<date>.md", async () => {
    await openTab(page, id, "budget");
    await expect(page.getByTestId("budget-total")).toHaveText(budgetTotalText(budgetRows(undefined)));
    await page.getByTestId("budget-amount-0").fill("1500");
    await page.getByTestId("budget-amount-1").fill("2500");
    await expect(page.getByTestId("budget-total")).toHaveText(budgetTotalText(BUDGET_AFTER));
    const f = await download(page.getByTestId("budget-export"));
    expect(f.name).toMatch(/^trial-budget-\d{4}-\d{2}-\d{2}\.md$/);
    expect(f.body).toBe(budgetMarkdown(BUDGET_AFTER));
    expect(f.body.startsWith("# Trial budget estimate")).toBe(true);
    await expect(page.getByTestId("budget-msg")).toHaveText(T("design_exported", { name: f.name }));
    await settled();
  });

  // ---- 6. AI-use statement ------------------------------------------------------------------------------------------------------------------------
  await test.step("6. AI-use statement: unticked is refused, ticked is core's text, Insert puts it in the document", async () => {
    await openTab(page, id, "aiuse");
    await expect(page.getByTestId("aiu-count")).toHaveText(T("design_aiu_count", { all: LOG.length, n: LOG.length }));
    expect(logAsked.length).toBeGreaterThan(0);
    expect(new Set(logAsked), "the log is read for this project only").toEqual(new Set([id]));
    await expect(page.getByTestId("aiu-scope")).toHaveText(T("design_aiu_scope"));
    await expect(page.getByTestId("aiu-rows").locator("input")).toHaveCount(2);
    await expect(page.getByTestId("aiu-build")).toBeEnabled();

    // Everything unticked, with a log that has rows: refused (rule 3, never "no AI" against a log with rows).
    await page.getByTestId("aiu-row-0").uncheck();
    await page.getByTestId("aiu-row-1").uncheck();
    await page.getByTestId("aiu-build").click();
    const refused = statement({});
    if (!("refuse" in refused)) throw new Error("core built a statement with every kind unticked");
    await expect(page.getByTestId("aiu-refuse")).toHaveText(refused.refuse);
    expect(refused.refuse).toContain("Tick them, or change the dates");
    await expect(page.getByTestId("aiu-out")).toHaveValue("");
    await expect(page.getByTestId("aiu-insert")).toBeDisabled();

    // Ticked: the statement is core's, from the same rows, and it does not say that no AI was used.
    await page.getByTestId("aiu-row-0").check();
    await page.getByTestId("aiu-row-1").check();
    await page.getByTestId("aiu-build").click();
    const want = statement({ rewrite: 1, feedback: 1 });
    if ("refuse" in want) throw new Error("core refused rows that are ticked: " + want.refuse);
    await expect(page.getByTestId("aiu-refuse")).toHaveText("");
    await expect(page.getByTestId("aiu-out")).toHaveValue(want.text);
    expect(want.text).not.toMatch(/did not use AI/i);
    await expect(page.getByTestId("aiu-out")).not.toHaveValue(/did not use AI/i);

    // Insert: plain text at the end of the open document.
    await page.getByTestId("aiu-insert").click();
    const first = want.text.split("\n").filter((l) => l.trim() !== "").slice(0, 2);
    for (const line of first) await expect(page.locator(".ProseMirror")).toContainText(line);
    // It went in at the end of the document, after the protocol and the ethics statement (whitespace as the editor shows it).
    const flat = (x: string) => x.replace(/\s+/g, " ").trim();
    await expect.poll(async () => flat(await docText(page)).endsWith(flat(want.text))).toBe(true);
    await expect(page.getByTestId("aiu-action-msg")).toHaveText("");
    await neverExempt(page);
  });

  // The toasts of the whole walk: the two this place makes, and no other.
  await test.step("toasts: only Saved and Inserted; the AI was never called", async () => {
    const all = await toasts();
    expect(all.length).toBeGreaterThan(0);
    for (const m of all) expect(["Saved", "Inserted"], `toast "${m}"`).toContain(m);
    expect(all).toContain("Saved");
    expect(all).toContain("Inserted");
    expect(aiCalls).toBe(0);
  });

  // ---- 7. Reload ----------------------------------------------------------------------------------------------------------------------------------
  await test.step("7. reload: the Overview still reads the six ready items", async () => {
    await openTab(page, id, "overview");
    await expect(page.getByTestId("design-count")).toHaveText(READY(6));
    await settled();
    await page.goto(`/p/${id}/design/overview`);
    await expect(page.getByTestId("panel-design-overview")).toBeVisible();
    await expect(page.getByTestId("design-count")).toHaveText(READY(6));
    // Each tab reads what was saved: the Budget total and the CTRI ticks.
    await openTab(page, id, "budget");
    await expect(page.getByTestId("budget-total")).toHaveText(budgetTotalText(BUDGET_AFTER));
    await openTab(page, id, "registration");
    await expect(page.getByTestId("ctri-field-0")).toBeChecked();
    await expect(page.getByTestId("ctri-field-1")).toBeChecked();
    await expect(page.getByTestId("ctri-field-2")).not.toBeChecked();
    await openTab(page, id, "pathway");
    await expect(page.getByTestId("reg-result")).toBeVisible();
  });

  // ---- 8. The phone -------------------------------------------------------------------------------------------------------------------------------
  await test.step("8. at 375 px the tab row is reachable and Budget and AI-use fit without a sideways scroll", async () => {
    await page.setViewportSize(PHONE);
    for (const tab of ["budget", "aiuse"] as const) {
      await page.goto(`/p/${id}/design/${tab}`);
      // The document was opened beside the place earlier and stays open: on a phone it fills the screen, and Back returns to the place.
      const back = page.getByTestId("doc-back");
      await expect(async () => {
        if (await back.isVisible()) await back.click();
        await expect(back).toBeHidden({ timeout: 2_000 });
        await expect(page.getByTestId("panel-design-" + tab)).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 30_000 });
      const bar = page.getByTestId("place-tabs");
      await expect(bar).toBeVisible();
      expect(await bar.evaluate((el) => getComputedStyle(el).overflowX), tab).toBe("auto");
      // Eight tabs are wider than the screen: the row scrolls, and the last tab can be reached.
      expect(await bar.evaluate((el) => el.scrollWidth > el.clientWidth), tab).toBe(true);
      const last = page.getByTestId("place-tab-aiuse");
      await last.scrollIntoViewIfNeeded();
      const box = (await last.boundingBox())!;
      expect(box.x, tab).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, tab).toBeLessThanOrEqual(PHONE.width);
      const current = page.getByTestId("place-tab-" + tab);
      await current.scrollIntoViewIfNeeded();
      await expect(current).toHaveAttribute("aria-current", "true");
      // The page itself does not scroll sideways.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), tab).toBe(true);
    }
  });
});
