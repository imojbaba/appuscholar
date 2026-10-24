/**
 * Stages 3 to 6, Session B (Statistics), Task B8: one student's journey through Collection and analysis, in the browser.
 * docs/walkthroughs/tools-b.md is the same journey for a human on the live site; its rows carry this test's step numbers. Keep the two in step.
 *
 * One sign-in, one project, a plain (not vault-sealed) AI key so that every blob goes to the api as readable JSON and the "no data row in any blob"
 * check is a real one. The steps:
 *   1. Data: a semicolon file offers "Split on semicolons" (used once); the columns show as chips; a student name column raises the personal-data
 *      box (replace by a code, keep the village), Apply downloads the key file and rewrites the paste box.
 *   2. Run: Welch t (the "Independent-samples t-test"), fields, Run; the sentence and the chart show; Insert into document; reload; the sentence is
 *      still in the document and the Check tab lists it Current.
 *   3. Explain: the mask / send / cancel choice appears before any request (no AI request until the student chooses), the reply shows apart from the
 *      sentence under its machine label.
 *   4. Check: one number of the pasted data is edited and parsed again; the result is Out of date; Re-run replaces the sentence (the confirm is shown
 *      because the sentence was edited in the document).
 *   5. Guide: the questions lead to Welch's t; "Use this test" selects it; the demo says its numbers are invented and leaves the paste box alone.
 *   6. Power: a recorded v1 case (the power golden's "ind-n"), Calculate: the sentence and the footer note.
 *   7. Charts: the quick bar chart for values 95 to 99 has a y axis starting at 0; Chart Studio's Insert adds "Figure 1" as a PNG; a bar chart
 *      whose axis starts above 0 carries the warning.
 *   8. Phone width (375 px): the Data and Charts tabs have no sideways page scroll.
 *   9. Scales: RSES scored on a small table (the scales golden's "rses-by-name-clean"): the new total column is in the paste box.
 *  10. No blob write of the project holds a name or a score (a set is a hash, a time and a row count); nothing outside localhost was asked for.
 *
 * The AI gateway (/ai/complete) is answered in the browser with a recorded reply chosen by the prompt's opening words; every other address outside
 * localhost is answered 599 and noted, and the test fails if one was asked for.
 *
 * Run it with the recipe in e2e/support/pglite-postgres.mjs's header, for example on free ports:
 *   PGLITE_PORT=5441 node e2e/support/pglite-postgres.mjs &
 *   E2E_API_PORT=8941 E2E_WEB_PORT=3141 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5441/postgres \
 *     pnpm --filter @appuscholar/web exec playwright test e2e/tools-b.spec.ts
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import { test, expect, type Page, type Request } from "@playwright/test";
import { signIn } from "./support/signin";
import { API_ORIGIN, WEB_ORIGIN } from "./support/origins";
import * as editorAt from "./support/editor";
import { POWER_FOOTER_NOTE } from "@appuscholar/core";

// ---- Copy: every sentence asserted is read from the dictionaries -------------------------------------------------------------------------------------

const read = (rel: string) => JSON.parse(readFileSync(path.join(__dirname, rel), "utf8")) as Record<string, string>;
const EN = { ...read("../messages/en.json"), ...read("../messages/tools/stats.en.json") };
/** t() as lib/i18n.tsx's tFormat does it: the English sentence with its {vars} filled in. */
function T(key: string, vars?: Record<string, string | number>): string {
  const raw = EN[key];
  if (raw === undefined) throw new Error("no such key in the dictionaries: " + key);
  return vars ? raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : raw;
}

// ---- v1's own numbers, read from the core goldens, not retyped --------------------------------------------------------------------------------------

type PowerGold = { id: string; input: Record<string, string>; error: string | null; sentence: string };
const POWER = JSON.parse(readFileSync(path.join(__dirname, "../../../packages/core/test/golden/power/cases.json"), "utf8")) as { cases: PowerGold[] };
const POWER_CASE = POWER.cases.find((c) => c.id === "ind-n")!;
type ScoreRun = { id: string; scale: string; csv: string; idx: number[]; coding: number; text: string; paste: string };
const SCALES_GOLD = JSON.parse(readFileSync(path.join(__dirname, "../../../packages/core/test/golden/scales/cases.json"), "utf8")) as { runs: ScoreRun[] };
const SCALE_RUN = SCALES_GOLD.runs.find((r) => r.id === "rses-by-name-clean")!;

// ---- The student's table: invented, with distinctive cells so that a leak to a blob can be found ----------------------------------------------------

const DATA_NAME = "Reading scores";
const NAMES = ["Sara Khan", "Ravi Kumar", "Meena Iyer", "John Mathew", "Anita Das", "Vijay Rao", "Lata Shah", "Omar Ali", "Neha Jain", "Karan Mehta", "Ira Bose", "Dev Patel"];
const VILLAGES = ["Rampur", "Sundarpur"];
/** Three decimals: a mean in a sentence has two, so one of these in a request body is a data row. */
const SCORES = ["71.214", "68.402", "74.935", "70.318", "66.871", "72.146", "59.727", "61.388", "63.809", "58.263", "60.954", "62.415"];
const ROWS = NAMES.map((n, i) => [n, VILLAGES[i < 6 ? 0 : 1]!, SCORES[i]!]);
const HEAD = ["student name", "village", "score"];
const SEMICOLON_TEXT = [HEAD.join(";"), ...ROWS.map((r) => r.join(";"))].join("\n");
/** The one number the student edits later (a score in the second village), and what it becomes. */
const EDIT = { from: "59.727", to: "79.727" };
const PHONE = { width: 375, height: 812 };
const QUICK = "A,95\nB,99\nC,97\nD,96\nE,98";

// ---- The AI provider, as the gateway answers it ---------------------------------------------------------------------------------------------------

const EXPLAIN_REPLY = "The two villages' reading scores differ by more than chance would usually produce, so the result is statistically significant at .05. That says nothing yet about whether the gap matters in practice.";
const FIRST_RUN_IDEA = "Does a village reading circle raise reading scores in primary pupils?";

type Net = { unexpected: string[]; prompts: string[]; unknown: string[]; blobWrites: Array<{ kind: string; body: string }> };
const CORS_APP = { "access-control-allow-origin": WEB_ORIGIN, "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS" };

/** Everything the page asks for that leaves the machine is answered here: the AI gateway with a recording, anything else outside localhost with 599. */
async function stubNetwork(page: Page): Promise<Net> {
  const net: Net = { unexpected: [], prompts: [], unknown: [], blobWrites: [] };
  const ctx = page.context();
  await ctx.route((url) => !/^(localhost|127\.0\.0\.1)$/.test(url.hostname), (route) => {
    net.unexpected.push(route.request().url());
    return route.fulfill({ status: 599, body: "not recorded" });
  });
  await ctx.route(API_ORIGIN + "/ai/test", (route) => (route.request().method() === "OPTIONS"
    ? route.fulfill({ status: 204, headers: CORS_APP })
    : route.fulfill({ status: 200, contentType: "application/json", headers: CORS_APP, body: JSON.stringify({ ok: true, reply: "OK" }) })));
  await ctx.route(API_ORIGIN + "/ai/complete", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS_APP });
    const prompt = String((route.request().postDataJSON() as { prompt?: unknown }).prompt ?? "");
    net.prompts.push(prompt);
    if (!prompt.startsWith("You are a statistics tutor")) { net.unknown.push(prompt.slice(0, 160)); return route.fulfill({ status: 599, headers: CORS_APP, body: "{}" }); }
    await new Promise((r) => setTimeout(r, 300)); // long enough to see the thinking line
    return route.fulfill({ status: 200, contentType: "application/json", headers: CORS_APP, body: JSON.stringify({ text: EXPLAIN_REPLY, model: "mock" }) });
  });
  // Every write to the project's blobs, with what was sent (rule R1: no data row in any of them).
  page.on("request", (r: Request) => {
    const m = /\/projects\/[0-9a-f-]+\/blobs\/([^/?]+)$/.exec(r.url());
    if (m && r.url().startsWith(API_ORIGIN) && r.method() !== "GET" && r.method() !== "OPTIONS") net.blobWrites.push({ kind: decodeURIComponent(m[1]!), body: r.postData() ?? "" });
  });
  return net;
}

// ---- Page helpers -----------------------------------------------------------------------------------------------------------------------------------

test.describe.configure({ timeout: 420_000 });
test.use({ actionTimeout: 20_000, navigationTimeout: 45_000 });

/** A new account with a plain (unprotected) Groq key, then first run's "Save as my project". Returns the project's id. */
async function newProject(page: Page): Promise<string> {
  await signIn(page, { prefix: "b" });
  await page.getByTestId("terms-age").check();
  await page.getByTestId("terms-agree").check();
  await page.getByTestId("terms-continue").click();
  await page.getByTestId("welcome-setup").click();
  await page.getByTestId("prov-select").selectOption("groq");
  await page.getByTestId("key-input").fill("gsk_test");
  await page.getByTestId("key-mode-plain").check();
  await page.getByTestId("key-save").click();
  await expect(page.getByTestId("provider-dialog")).toBeHidden();
  await expect(page.getByTestId("first-run")).toBeVisible();
  await page.locator("#ideaTopic").fill(FIRST_RUN_IDEA);
  await page.locator("#ideaRes").fill("About 60 pupils in two villages");
  await page.getByTestId("idea-save").click();
  await expect(page.getByTestId("project-home")).toBeVisible({ timeout: 20_000 });
  const id = /\/p\/([^/?#]+)/.exec(page.url())?.[1];
  if (!id) throw new Error("no project id in " + page.url());
  return id;
}

/** A tab of the Collection and analysis place, by its tab (client-side, so the lab's table stays). */
async function toTab(page: Page, tab: "data" | "power" | "charts" | "check" | "scales") {
  // On a phone an open document fills the screen; Back returns to the place (frame-responsive.spec.ts).
  const back = page.getByTestId("doc-back");
  if (await back.isVisible()) await back.click();
  const link = page.getByTestId("place-tab-" + tab);
  await link.scrollIntoViewIfNeeded();
  await link.click();
  await expect(page.getByTestId("place-tab-" + tab)).toHaveAttribute("aria-current", "true");
  await expect(page.getByTestId({ data: "stats-lab", power: "power-tab", charts: "charts-tab", check: "stats-check", scales: "scales-tab" }[tab])).toBeVisible();
}

/** The text of an svg data URL (an <img src>), decoded. */
const svgOf = (src: string) => decodeURIComponent(src.replace(/^data:image\/svg\+xml[^,]*,/, ""));

/** Puts the cursor `offset` characters into the first text node of the editor paragraph holding `needle`, in the editor's own state (support/editor.ts). */
const cursorInParagraph = (page: Page, needle: string, offset: number) => editorAt.cursorInParagraph(page.locator(".ProseMirror"), needle, offset);

test("Collection and analysis: data, a test inserted and checked, explain, guide, power, charts, scales, phone", async ({ page }) => {
  const net = await stubNetwork(page);
  const id = await newProject(page);
  await page.goto(`/p/${id}/collect/data`);
  await expect(page.getByTestId("stats-lab")).toBeVisible();

  // The text the paste box holds once the student's names are replaced by codes (read in step 1, pasted again after the reload).
  let cleaned = "";
  let sentence = "";

  await test.step("1. Data: a semicolon file, the offer to split it once, the columns, the personal-data box, Apply and the key file", async () => {
    await page.getByTestId("stats-name").fill(DATA_NAME);
    await page.getByTestId("stats-paste").fill(SEMICOLON_TEXT);
    await page.getByTestId("stats-parse").click();
    // One column of semicolons: the offer is shown, in words, and nothing else is claimed yet.
    await expect(page.getByTestId("stats-semicolon")).toBeVisible();
    await expect(page.getByTestId("stats-semicolon")).toContainText(T("stats_data_semicolon"));
    await page.getByTestId("stats-semicolon-btn").click();
    await expect(page.getByTestId("stats-semicolon")).toHaveCount(0);
    await expect(page.getByTestId("stats-rows")).toHaveText(T("stats_data_rows_found", { n: ROWS.length }));
    const chips = page.getByTestId("stats-chip");
    await expect(chips).toHaveCount(3);
    await expect(chips.nth(0)).toHaveText(T("stats_data_chip_categorical", { name: "student name", n: ROWS.length }));
    await expect(chips.nth(2)).toHaveText(T("stats_data_chip_numeric", { name: "score", n: ROWS.length }));

    // The personal-data box: the student column and the village column are flagged; neither is called safe or clear.
    await expect(page.getByTestId("pd-found")).toBeVisible();
    await expect(page.getByTestId("pd-sel-0")).toHaveValue("code");
    await expect(page.getByTestId("pd-sel-1")).toHaveValue("remove");
    await expect(page.getByTestId("pd-none")).toHaveCount(0);
    await expect(page.getByTestId("pd-box")).not.toContainText(/\bsafe\b/i);
    // The village is what the groups are, so it is kept; the names are replaced by codes (and a key file is offered).
    await page.getByTestId("pd-sel-1").selectOption("keep");
    const download = page.waitForEvent("download");
    await page.getByTestId("pd-apply").click();
    const key = await download;
    expect(key.suggestedFilename()).toBe("appuscholar_key_keep_separate.csv");
    const keyText = readFileSync((await key.path())!, "utf8");
    expect(keyText).toContain("ParticipantCode");
    expect(keyText).toContain("P001");
    expect(keyText).toContain("Sara Khan");
    await expect(page.getByTestId("pd-result")).toContainText(T("stats_pd_done"));
    await expect(page.getByTestId("pd-result")).toContainText(T("stats_pd_keyed"));

    // The paste box now holds the table without names.
    cleaned = await page.getByTestId("stats-paste").inputValue();
    for (const n of NAMES) expect(cleaned).not.toContain(n);
    expect(cleaned).toContain("ParticipantCode");
    expect(cleaned).toContain(VILLAGES[0]!);
    await expect(chips).toHaveCount(3);
    await expect(chips.nth(0)).toContainText("ParticipantCode");
  });

  await test.step("2. Run: Welch's t, the fields, Run; the sentence and the chart; Insert into document; reload; Check lists it Current", async () => {
    await page.getByTestId("stats-test").selectOption("ttestInd");
    await expect(page.getByTestId("stats-field-dv")).toBeVisible();
    await page.getByTestId("stats-field-dv").selectOption({ label: "score" });
    await page.getByTestId("stats-field-iv").selectOption({ label: "village" });
    await page.getByTestId("stats-run-btn").click();
    await expect(page.getByTestId("stats-results")).toBeVisible();
    sentence = (await page.getByTestId("stats-sentence").innerText()).trim();
    expect(sentence).toMatch(/\(\d+(\.\d+)?\)/);
    expect(sentence.length).toBeGreaterThan(40);
    await expect(page.getByTestId("stats-chart")).toBeVisible();
    await expect(page.getByTestId("stats-results-html")).toContainText(VILLAGES[0]!);

    // Insert: the document opens beside the place and carries the sentence; it is saved before the page is reloaded.
    const saved = page.waitForResponse((r) => r.request().method() === "PUT" && /\/documents\/[0-9a-f-]+$/.test(r.url()) && r.ok(), { timeout: 30_000 });
    await page.getByTestId("stats-insert").click();
    await expect(page.locator(".ProseMirror")).toContainText(sentence);
    await expect(page.locator('.ProseMirror span.stat-tag[data-run]')).toHaveCount(1);
    await saved;
    // The record of the run is a blob too; wait for its write so the reload below does not race it.
    await expect.poll(() => net.blobWrites.filter((w) => w.kind === "stats_runs").length).toBeGreaterThan(0);
    await expect.poll(() => net.blobWrites.filter((w) => w.kind === "stats_sets").length).toBeGreaterThan(0);

    await page.reload();
    await expect(page.locator(".ProseMirror")).toContainText(sentence);
    await expect(page.locator('.ProseMirror span.stat-tag[data-run]')).toHaveCount(1);
    await toTab(page, "check");
    await page.getByTestId("check-rt-run").click();
    await expect(page.getByTestId("check-rt-card")).toHaveCount(1);
    await expect(page.getByTestId("check-rt-card")).toHaveAttribute("data-status", "cur");
    await expect(page.getByTestId("check-rt-label")).toHaveText(T("rt_cur"));
    await expect(page.getByTestId("check-rt-text")).toContainText(sentence.slice(0, 40));
    await expect(page.getByTestId("check-rt-meta")).toContainText(DATA_NAME);
    // "Current" is not offered as a check that the words still fit the number.
    await expect(page.getByTestId("check-rt-note")).toHaveText(T("rt_note"));
  });

  await test.step("3. Explain: the choice comes before any request; the reply is shown apart from the sentence, labelled as the machine's", async () => {
    await toTab(page, "data");
    // The lab is empty after the reload: the same table is pasted and parsed again, and the same test run.
    await expect(page.getByTestId("stats-name")).toHaveValue(DATA_NAME);
    await page.getByTestId("stats-paste").fill(cleaned);
    await page.getByTestId("stats-parse").click();
    await expect(page.getByTestId("stats-chip")).toHaveCount(3);
    // Its village column is flagged again; the student leaves it as it is (it is the groups) and does not Apply.
    await expect(page.getByTestId("pd-found")).toBeVisible();
    await page.getByTestId("stats-test").selectOption("ttestInd");
    await page.getByTestId("stats-field-dv").selectOption({ label: "score" });
    await page.getByTestId("stats-field-iv").selectOption({ label: "village" });
    await page.getByTestId("stats-run-btn").click();
    await expect(page.getByTestId("stats-sentence")).toHaveText(sentence);

    // Nothing has gone to the AI so far in the whole journey.
    expect(net.prompts).toEqual([]);
    const before = net.prompts.length;
    await page.getByTestId("stats-explain").click();
    // The dialog asks first; no request has gone out while it is open.
    const dialog = page.getByTestId("pd-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("pd-mask")).toBeVisible();
    await expect(dialog.getByTestId("pd-send")).toBeVisible();
    await expect(dialog.getByTestId("pd-cancel")).toBeVisible();
    await expect(dialog.getByTestId("pd-found")).toContainText("2 address");
    await page.waitForTimeout(600);
    expect(net.prompts.length).toBe(before);

    // Cancel first: still no request, and the page says so in words (not as an error).
    await dialog.getByTestId("pd-cancel").click();
    await expect(page.getByTestId("stats-explain-cancelled")).toBeVisible();
    expect(net.prompts.length).toBe(before);
    await expect(page.getByTestId("stats-explain-out")).toHaveCount(0);

    // Then mask and send: one request, with the village names replaced by codes; the reply sits under the machine's label.
    await page.getByTestId("stats-explain").click();
    await expect(dialog).toBeVisible();
    expect(net.prompts.length).toBe(before);
    await dialog.getByTestId("pd-mask").click();
    await expect(page.getByTestId("stats-explain-out")).toContainText(EXPLAIN_REPLY);
    await expect(page.getByTestId("stats-explain-out").locator(".ai-read-label")).toHaveText(T("stats_res_explain_label"));
    expect(net.prompts.length).toBe(before + 1);
    const prompt = net.prompts[before]!;
    for (const v of VILLAGES) expect(prompt).not.toContain(v);
    expect(prompt).toContain("[address 1]");
    for (const s of SCORES) expect(prompt).not.toContain(s);
    // The explanation is not part of the sentence that Insert would put in the document.
    await expect(page.getByTestId("stats-sentence")).toHaveText(sentence);
  });

  await test.step("4. Check: one number edited and parsed again; the result is Out of date; Re-run replaces the sentence (the confirm is shown)", async () => {
    expect(cleaned).toContain(EDIT.from);
    await page.getByTestId("stats-paste").fill(cleaned.replace(EDIT.from, EDIT.to));
    await page.getByTestId("stats-parse").click();
    await expect(page.getByTestId("stats-chip")).toHaveCount(3);
    // The student also touches the inserted sentence in the document, so the re-run has something of theirs to ask about.
    await cursorInParagraph(page, sentence.slice(0, 30), 3);
    await page.keyboard.type("X");
    await expect(page.locator(".ProseMirror")).toContainText("X");

    await toTab(page, "check");
    await page.getByTestId("check-rt-run").click();
    await expect(page.getByTestId("check-rt-card")).toHaveCount(1);
    await expect(page.getByTestId("check-rt-card")).toHaveAttribute("data-status", "stale");
    await expect(page.getByTestId("check-rt-label")).toHaveText(T("rt_stale"));
    await expect(page.getByTestId("check-rt-edited")).toBeVisible();
    await expect(page.getByTestId("check-rt-rerun")).toBeVisible();

    const asked: string[] = [];
    page.once("dialog", (d) => { asked.push(d.message()); void d.accept(); });
    const saved = page.waitForResponse((r) => r.request().method() === "PUT" && /\/documents\/[0-9a-f-]+$/.test(r.url()) && r.ok(), { timeout: 30_000 });
    await page.getByTestId("check-rt-rerun").click();
    await expect(page.getByTestId("check-rt-msg")).toContainText(T("rt_done"));
    expect(asked).toEqual([T("rt_edit_warn")]);
    // The edited number changes the conclusion at .05, and the page says so in words.
    await expect(page.getByTestId("check-rt-flip")).toHaveText(T("rt_sig_flip"));
    await saved;
    // The sentence in the document is the new one (from the changed number), and the list reads Current again.
    await expect(page.locator(".ProseMirror span.stat-tag[data-run]")).toHaveCount(1);
    const now = (await page.locator(".ProseMirror span.stat-tag[data-run]").innerText()).trim();
    expect(now).not.toBe(sentence);
    expect(now).not.toContain("X");
    await expect(page.getByTestId("check-rt-card")).toHaveAttribute("data-status", "cur");
  });

  await test.step("5. Guide: the questions lead to Welch's t; Use this test selects it; the demo is invented and leaves the paste box alone", async () => {
    await toTab(page, "data");
    await page.getByTestId("stats-test").selectOption("desc");
    await page.getByTestId("stats-guide-toggle").click();
    const answer = async (ask: string, value: string) => {
      await expect(page.getByTestId("stats-guide-question")).toHaveAttribute("data-ask", ask);
      await page.getByTestId("stats-guide-opt").and(page.locator(`[data-value="${value}"]`)).click();
    };
    await answer("goal", "compare");
    await answer("cmpOut", "scale");
    await answer("cmpDes", "two");
    await answer("smp", "ind");
    const result = page.getByTestId("stats-guide-result");
    await expect(result).toHaveAttribute("data-result", "ttestInd");
    await expect(page.getByTestId("stats-guide-name")).toHaveText("Welch's independent-samples t-test");
    await page.getByTestId("stats-guide-use").click();
    await expect(page.getByTestId("stats-guide-use-msg")).toContainText("Independent-samples t-test");
    await expect(page.getByTestId("stats-test")).toHaveValue("ttestInd");

    // The demo: asks for a prediction first, then runs on invented numbers; the student's own paste box is not touched.
    const paste = await page.getByTestId("stats-paste").inputValue();
    await expect(page.getByTestId("stats-guide-demo")).toContainText(T("stats_guide_demo_invented"));
    await page.getByTestId("stats-guide-demo-run").click();
    await expect(page.getByTestId("stats-guide-demo-msg")).toHaveText(T("stats_guide_demo_need_pred"));
    await page.getByTestId("stats-guide-pred-yes").check();
    await page.getByTestId("stats-guide-demo-run").click();
    await expect(page.getByTestId("stats-guide-demo-out")).toBeVisible();
    await expect(page.getByTestId("stats-guide-demo-sentence")).toHaveText(/\S/);
    await expect(page.getByTestId("stats-guide-demo-apart")).toHaveText(T("stats_guide_demo_apart"));
    expect(await page.getByTestId("stats-paste").inputValue()).toBe(paste);
    await page.getByTestId("stats-guide-demo-back").click();
    expect(await page.getByTestId("stats-paste").inputValue()).toBe(paste);
  });

  await test.step("6. Power: a recorded v1 case gives its sentence and the footer note", async () => {
    await toTab(page, "power");
    await page.getByTestId("power-test").selectOption(POWER_CASE.input.test!);
    await page.getByTestId("power-solve").selectOption(POWER_CASE.input.mode!);
    await page.getByTestId("power-effect").fill(POWER_CASE.input.effect!);
    await page.getByTestId("power-power").fill(POWER_CASE.input.power!);
    await page.getByTestId("power-alpha").fill(POWER_CASE.input.alpha!);
    await page.getByTestId("power-tails").selectOption(POWER_CASE.input.tails!);
    await page.getByTestId("power-calc").click();
    await expect(page.getByTestId("power-results")).toBeVisible();
    expect(POWER_CASE.error).toBeNull();
    await expect(page.getByTestId("power-sentence")).toHaveText(POWER_CASE.sentence);
    await expect(page.getByTestId("power-footer")).toContainText(POWER_FOOTER_NOTE.caveat);
    await expect(page.getByTestId("power-caveat")).toHaveText(POWER_FOOTER_NOTE.caveat);
    // Power needs no data and writes nothing the student typed anywhere.
    await expect(page.getByTestId("power-insert")).toHaveCount(0);
  });

  await test.step("7. Charts: the quick bar chart starts at 0; Chart Studio inserts Figure 1 as a PNG", async () => {
    await toTab(page, "charts");
    await page.getByTestId("quick-type").selectOption("bar");
    await page.getByTestId("quick-data").fill(QUICK);
    await page.getByTestId("quick-make").click();
    await expect(page.getByTestId("quick-result")).toBeVisible();
    const svg = svgOf((await page.getByTestId("quick-img").getAttribute("src"))!);
    const ticks = [...svg.matchAll(/<text\b[^>]*text-anchor="end"[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]!.trim());
    expect(ticks).toContain("0");
    expect(Math.min(...ticks.map(parseFloat))).toBe(0);

    // Chart Studio, from the table the Data tab holds.
    await page.getByTestId("chart-use-lab").click();
    await expect(page.getByTestId("chart-source")).toBeVisible();
    await expect(page.getByTestId("chart-result")).toBeVisible();
    await expect(page.getByTestId("chart-img")).toBeVisible();
    // The groups are the villages (the picker starts on the first category column, the codes).
    await page.getByTestId("chart-g").selectOption({ label: "village" });
    await expect(page.getByTestId("chart-table")).toContainText(VILLAGES[1]!);
    const saved = page.waitForResponse((r) => r.request().method() === "PUT" && /\/documents\/[0-9a-f-]+$/.test(r.url()) && r.ok(), { timeout: 30_000 });
    await page.getByTestId("chart-insert").click();
    await expect(page.locator(".ProseMirror")).toContainText("Figure 1");
    await expect(page.locator('.ProseMirror img[src^="data:image/png"]')).toHaveCount(1);
    await saved;
    // Rule 14: an axis that starts above zero on a bar chart is warned about in words (the chart is still drawn; the choice is the student's).
    await page.getByTestId("chart-type").selectOption("bar");
    await expect(page.getByTestId("chart-warn")).toHaveCount(0);
    await page.getByTestId("chart-ymin").fill("90");
    await expect(page.getByTestId("chart-warn")).toHaveText(T("vz_bar_zero"));
    await expect(page.getByTestId("chart-img")).toBeVisible();
  });

  await test.step("8. Phone width: the Data and Charts tabs do not scroll the page sideways", async () => {
    await page.setViewportSize(PHONE);
    for (const tab of ["data", "charts"] as const) {
      await toTab(page, tab);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), tab).toBe(true);
    }
    // With a result and the guide open on the Data tab (the widest things it draws).
    await toTab(page, "data");
    await page.getByTestId("stats-field-dv").selectOption({ label: "score" });
    await page.getByTestId("stats-field-iv").selectOption({ label: "village" });
    await page.getByTestId("stats-run-btn").click();
    await expect(page.getByTestId("stats-results")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "data with a result").toBe(true);
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  await test.step("9. Scales: RSES scored on a small table; the new total column is in the paste box", async () => {
    // A different table, under its own name: the Data tab takes it (the golden run's csv).
    await toTab(page, "data");
    await page.getByTestId("stats-name").fill("Self-esteem");
    await page.getByTestId("stats-paste").fill(SCALE_RUN.csv);
    await page.getByTestId("stats-parse").click();
    await expect(page.getByTestId("stats-chip")).toHaveCount(SCALE_RUN.csv.split("\n")[0]!.split(",").length);
    await toTab(page, "scales");
    await page.getByTestId("scale-pick-" + SCALE_RUN.scale).click();
    await expect(page.getByTestId("scale-view")).toBeVisible();
    await page.getByTestId("scale-score-open").click();
    await expect(page.getByTestId("scale-score")).toBeVisible();
    // The columns were guessed from the headings (RSES_01 to RSES_10).
    for (let i = 0; i < SCALE_RUN.idx.length; i++) await expect(page.getByTestId("scale-map-" + i)).toHaveValue(String(SCALE_RUN.idx[i]));
    await page.getByTestId("scale-run").click();
    await expect(page.getByTestId("scale-out")).toHaveText(SCALE_RUN.text);
    await toTab(page, "data");
    expect(await page.getByTestId("stats-paste").inputValue()).toBe(SCALE_RUN.paste);
    expect(await page.getByTestId("stats-paste").inputValue()).toContain("RSES_total");
    await expect(page.getByTestId("stats-chip").last()).toContainText("RSES_total");
  });

  await test.step("10. No data row left the browser: no blob write holds a name or a score; nothing outside localhost was asked for", async () => {
    const kinds = new Set(net.blobWrites.map((w) => w.kind));
    // The writes that did happen are the ones this tool owns, so the check is not vacuous.
    for (const k of ["stats_sets", "stats_runs"]) expect(kinds, k).toContain(k);
    for (const w of net.blobWrites) {
      for (const n of NAMES) expect(w.body, w.kind + " holds " + n).not.toContain(n);
      for (const s of SCORES) expect(w.body, w.kind + " holds " + s).not.toContain(s);
      expect(w.body, w.kind).not.toContain("ParticipantCode");
      expect(w.body, w.kind).not.toContain("RSES_01");
    }
    // A set is a hash, a time and a row count, nothing else.
    for (const w of net.blobWrites.filter((x) => x.kind === "stats_sets")) {
      const sets = JSON.parse(JSON.parse(w.body).body as string) as Record<string, Record<string, unknown>>;
      for (const rec of Object.values(sets)) expect(Object.keys(rec).sort()).toEqual(["hash", "n", "ts"]);
    }
    // The one AI request carried the field of study, the tables as text and the sentence (the data was masked).
    expect(net.unknown).toEqual([]);
    expect(net.unexpected).toEqual([]);
  });
});
