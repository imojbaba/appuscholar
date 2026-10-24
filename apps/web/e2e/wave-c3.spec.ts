/**
 * Wave C, Task C3: Ask Appu in the Guide, opened from Help.
 *
 *   1. With no AI key, an English question that matches nothing gets v1's line and sends nothing; a question that matches lists those
 *      sections in the Guide (open, under "N sections match your question"), says why there is no answer, and sends nothing; a link in the
 *      line searches for that section and opens it;
 *   2. With a key (saved in the key window) and the AI answered from a recording: the button waits while Appu reads, the request is v1's prompt
 *      (Appu's opening words, the best sections, the open tool, the question last) at temperature 0.2 and 700 tokens without the language
 *      line, the answer is drawn as text (its markup is not), "From the guide" links open the section, and a refused call (the free limit)
 *      shows the provider's sentence and the links;
 *   3. At 375 px a long answer scrolls inside its own box: the Guide's list keeps room, the dialog fits the screen and Close stays reachable.
 * The Guide holds its 26 sections (Task C1); the steps read the titles from the content. That Appu's own questions leave no row in the AI-use log
 * is pinned where the log is written: apps/api/test/app.test.ts ("does not log an Ask Appu question as the Guide sends it") and, for the prompt's
 * opening words, apps/web/test/wc3AppuLib.test.ts. Here the AI gateway is answered in the browser, so nothing reaches a provider.
 *
 * Run it with the recipe in e2e/support/pglite-postgres.mjs's header, on this task's ports (3085, 8885, database 5485):
 *   PGLITE_PORT=5485 node e2e/support/pglite-postgres.mjs &
 *   E2E_WEB_PORT=3085 E2E_API_PORT=8885 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5485/postgres \
 *     pnpm --filter @appuscholar/web exec playwright test e2e/wave-c3.spec.ts
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import { test, expect, type Page, type Route } from "@playwright/test";
import { signIn } from "./support/signin";
import { API_ORIGIN, WEB_ORIGIN } from "./support/origins";
import { GUIDE } from "../lib/help/guide/content";

const EN = JSON.parse(readFileSync(path.join(__dirname, "../messages/tools/help-guide.en.json"), "utf8")) as Record<string, string>;
const NEW_ACCOUNT = { prefix: "c3", newAccount: true, ready: ["first-run"] };
const QUESTION = "how do I reverse-score items?";
const SCALES = GUIDE.find((s) => s.id === "scales")!;
/** v1's answer shape: plain words, and here with markup in it to show the page does not draw it. */
const REPLY = "Flip each negative item so a high score always means more of the trait (on a 1 to 5 scale, 5 becomes 1). See <b>the scale library</b> for the steps.\nAppu can be wrong.";
const CORS = { "access-control-allow-origin": WEB_ORIGIN, "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS" };

test.describe.configure({ timeout: 120_000 });

type Sent = { provider: string; prompt: string; temperature?: number; maxTokens?: number; noLang?: boolean };

/** Answers /ai/complete in the browser: a recorded reply, or the free-limit refusal for a question that mentions "alpha"; keeps what was sent. */
async function answerAi(page: Page, reply: string, delayMs = 500): Promise<Sent[]> {
  const sent: Sent[] = [];
  await page.route(API_ORIGIN + "/ai/complete", async (route: Route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const body = route.request().postDataJSON() as Sent;
    sent.push(body);
    await new Promise((r) => setTimeout(r, delayMs));
    if (/STUDENT QUESTION:\n.*alpha/.test(body.prompt)) return route.fulfill({ status: 429, contentType: "application/json", headers: CORS, body: JSON.stringify({ error: "rate-limit" }) });
    return route.fulfill({ status: 200, contentType: "application/json", headers: CORS, body: JSON.stringify({ text: reply, model: "mock" }) });
  });
  return sent;
}

/** Saves a Groq key remembered in this browser: from the header's AI pill, or from the phone's menu. */
async function saveKey(page: Page): Promise<void> {
  if ((page.viewportSize()?.width ?? 1280) < 700) {
    await page.getByTestId("phone-menu").click();
    await page.getByTestId("menu-ai").click();
  } else {
    await page.getByTestId("ai-pill").click();
  }
  await expect(page.getByTestId("provider-dialog")).toBeVisible();
  await page.getByTestId("prov-select").selectOption("groq");
  await page.getByTestId("key-input").fill("gsk_test");
  await page.getByTestId("key-mode-plain").check();
  await page.getByTestId("key-save").click();
  await expect(page.getByTestId("provider-dialog")).toBeHidden();
}

async function openGuide(page: Page): Promise<void> {
  if ((page.viewportSize()?.width ?? 1280) < 700) {
    await page.getByTestId("phone-menu").click();
    await page.getByTestId("menu-help").click();
  } else {
    await page.getByTestId("help-btn").click();
  }
  await expect(page.getByTestId("help-dialog")).toBeVisible();
  await page.getByTestId("help-guide").click();
  await expect(page.getByTestId("guide-dialog")).toBeVisible();
}

const counterAsked = (h: number) => (h === 1 ? EN.wc_guide_count_asked_one : EN.wc_guide_count_asked.replace("{h}", String(h)));

test("with no AI key Appu lists the matching sections and sends nothing", async ({ page }) => {
  let aiCalls = 0;
  page.on("request", (r) => { if (r.url().startsWith(API_ORIGIN + "/ai/")) aiCalls++; });
  await signIn(page, NEW_ACCOUNT);
  await openGuide(page);

  // v1's box: label, example, button and the note.
  const box = page.getByTestId("appu-box");
  await expect(box).toContainText(EN.wc_appu_label);
  await expect(page.getByTestId("appu-q")).toHaveAttribute("placeholder", EN.wc_appu_ph);
  await expect(page.getByTestId("appu-go")).toHaveText(EN.wc_appu_go);
  await expect(page.getByTestId("appu-note")).toHaveText(EN.wc_appu_note);
  const rows = page.locator("[data-testid^=guide-section-]");
  await expect(rows).toHaveCount(GUIDE.length);

  // Nothing in the guide matches: v1's line, the list as it was.
  await page.getByTestId("appu-q").fill("zzzzqqqq");
  await page.getByTestId("appu-go").click();
  await expect(page.getByTestId("appu-answer")).toHaveText(EN.wc_appu_none);
  await expect(rows).toHaveCount(GUIDE.length);

  // A question the guide covers: the matching sections only, open, the search box empty, the line and its links.
  await page.getByTestId("appu-q").fill(QUESTION);
  await page.getByTestId("appu-go").click();
  const links = page.locator("[data-testid^=appu-link-]");
  const n = await links.count();
  expect(n).toBeGreaterThanOrEqual(1);
  expect(n).toBeLessThanOrEqual(3);
  await expect(page.getByTestId("appu-link-scales")).toHaveText(SCALES.title);
  await expect(page.getByTestId("appu-answer")).toContainText(EN.wc_appu_nokey.split("{links}")[0]!);
  await expect(page.getByTestId("appu-answer")).toContainText(EN.wc_appu_nokey.split("{links}")[1]!.replace(/^\./, "").trim());
  await expect(rows).toHaveCount(n);
  expect(await rows.evaluateAll((els) => els.map((e) => (e as HTMLDetailsElement).open))).toEqual(Array(n).fill(true));
  await expect(page.getByTestId("guide-count")).toHaveText(counterAsked(n));
  await expect(page.getByTestId("guide-search")).toHaveValue("");

  // A link in the line searches for that section and shows it open; typing goes back to the Guide's own search.
  await page.getByTestId("appu-link-scales").click();
  await expect(page.getByTestId("guide-search")).toHaveValue(SCALES.title);
  await expect(page.getByTestId("guide-section-scales")).toBeVisible();
  expect(await page.getByTestId("guide-section-scales").evaluate((e) => (e as HTMLDetailsElement).open)).toBe(true);
  await page.getByTestId("guide-search").fill("");
  await expect(rows).toHaveCount(GUIDE.length);

  expect(aiCalls, "no request to the AI gateway").toBe(0);
});

test("with a key and the AI answered from a recording: the answer as text, the guide's links, and a refused call", async ({ page }) => {
  const sent = await answerAi(page, REPLY);
  await signIn(page, NEW_ACCOUNT);
  await saveKey(page);
  await openGuide(page);

  await page.getByTestId("appu-q").fill(QUESTION);
  await page.getByTestId("appu-go").click();
  // While Appu reads: the line, and the button is off.
  await expect(page.getByTestId("appu-answer")).toHaveText(EN.wc_appu_busy);
  await expect(page.getByTestId("appu-go")).toBeDisabled();
  await expect(page.getByTestId("appu-text")).toBeVisible();
  await expect(page.getByTestId("appu-go")).toBeEnabled();

  // The answer is the recording, as text: the markup in it is shown, not drawn.
  await expect(page.getByTestId("appu-text")).toHaveText(REPLY);
  await expect(page.getByTestId("appu-answer").locator("b")).toHaveCount(0);
  const from = page.getByTestId("appu-from");
  await expect(from).toContainText("From the guide:");
  await expect(from).toContainText("Appu can be wrong. Check the section.");
  await expect(from.getByTestId("appu-link-scales")).toHaveText(SCALES.title);

  // What was sent: v1's prompt, the question last, no language line, the numbers v1 used, and no document.
  expect(sent).toHaveLength(1);
  const call = sent[0]!;
  expect(call.provider).toBe("groq");
  expect(call.temperature).toBe(0.2);
  expect(call.maxTokens).toBe(700);
  expect(call.noLang).toBe(true);
  expect(call.prompt.startsWith("You are Appu, the help assistant inside Appuscholar")).toBe(true);
  expect(call.prompt).toContain("Tool currently open in the app: none\n");
  expect(call.prompt).toContain("SECTION 1: " + SCALES.title + "\n");
  expect(call.prompt.endsWith("STUDENT QUESTION:\n" + QUESTION)).toBe(true);
  expect(call.prompt.length).toBeLessThan(30_000);

  // A link opens the section in the Guide; the answer stays.
  await from.getByTestId("appu-link-scales").click();
  await expect(page.getByTestId("guide-search")).toHaveValue(SCALES.title);
  expect(await page.getByTestId("guide-section-scales").evaluate((e) => (e as HTMLDetailsElement).open)).toBe(true);
  await expect(page.getByTestId("appu-text")).toHaveText(REPLY);

  // The provider refuses (the free limit): its sentence, then the sections, and the button works again.
  await page.getByTestId("appu-q").fill("what is alpha");
  await page.getByTestId("appu-go").click();
  await expect(page.getByTestId("appu-answer")).toContainText("Free limit reached for now.");
  await expect(page.getByTestId("appu-answer")).toContainText(EN.wc_appu_error.split("{links}")[0]!.replace("{message} ", ""));
  await expect(page.locator("[data-testid=appu-answer] [data-testid^=appu-link-]").first()).toBeVisible();
  await expect(page.getByTestId("appu-text")).toHaveCount(0);
  await expect(page.getByTestId("appu-go")).toBeEnabled();
  expect(sent).toHaveLength(2);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("a long answer scrolls in its own box and the Guide keeps its list and its Close button", async ({ page }) => {
    const longReply = Array.from({ length: 30 }, (_, i) => `Point ${i + 1}: flip each negative item so a high score always means more of the trait.`).join("\n");
    await answerAi(page, longReply, 200);
    await signIn(page, NEW_ACCOUNT);
    await saveKey(page);
    await openGuide(page);

    const dialog = page.getByTestId("guide-dialog");
    await page.getByTestId("appu-q").fill(QUESTION);
    await page.getByTestId("appu-go").click();
    await expect(page.getByTestId("appu-text")).toBeVisible();

    const answer = page.getByTestId("appu-answer");
    expect(await answer.evaluate((el) => el.scrollHeight > el.clientHeight), "the long answer scrolls in its box").toBe(true);
    // The dialog fits the screen, no sideways scroll, and the list is still a usable height.
    const b = (await dialog.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(375);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.y + b.height).toBeLessThanOrEqual(812);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const list = (await page.getByTestId("guide-list").boundingBox())!;
    // With the answer and the note showing, about a heading and one row (without the cap it was squeezed to 22 px).
    expect(list.height, "the Guide's list keeps room beside a long answer").toBeGreaterThanOrEqual(70);
    for (const id of ["appu-q", "appu-go", "guide-search", "guide-close"]) await expect(page.getByTestId(id)).toBeInViewport();

    await page.getByTestId("guide-close").click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("help-dialog")).toBeVisible();
  });
});
