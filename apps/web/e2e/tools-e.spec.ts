/**
 * Stages 3 to 6, Session E (Task E5): Review's three tabs, Closeness, Make PPT and Viva, used as a student uses them. docs/walkthroughs/tools-e.md is
 * the same walk for a human on the live site; its rows say which of this spec's steps they repeat. Keep the two in step.
 *
 * One sign-in, one project, one document that each step rewrites. The steps:
 *   1. the three tabs are drawn (no "Not built yet");
 *   2. Closeness: a pasted passage that shares a run of words with the document, "Check my document" (the real Web Worker runs), "close to" wording,
 *      both texts, the download closeness-check.txt (header CLOSENESS CHECK, no "copied"); a passage that matches nothing says so and never says safe;
 *   3. Slides: a document with a Heading 1, a paragraph, a list, a table and a picture gives "Slide 1" ..., and the downloaded .pptx unzips to a deck
 *      with ppt/presentation.xml and the title in a slide; a document with no headings is one slide titled with the document's name;
 *   4. Viva: a selection of 30 or more words, the toolbar's Viva button, "Get a question" (an AI question with its label, nothing to insert, the
 *      document unchanged), an answer saved, the count reads 1 and still reads 1 after a reload; under 25 words says so and sends no AI request.
 *
 * Nothing leaves the browser for a third party: the AI gateway (/ai/complete) is answered in the browser with one recorded reply for the viva prompt
 * (any other prompt fails the test), and every address outside localhost is answered 599 and fails the test if it was asked for.
 *
 * The page runs against `next dev` (playwright.config.ts), whose Content-Security-Policy (proxy.ts) carries the same worker-src as production
 * ('self' blob:); only script-src differs ('unsafe-eval' in development). Step 2 asserts that the worker-src is in force and that a Worker really
 * answered (a Worker wrapper counts its messages and errors), because the panel falls back to the main thread silently when the Worker fails.
 *
 * Run it with the recipe in e2e/support/pglite-postgres.mjs's header, for example on free ports:
 *   PGLITE_PORT=5471 node e2e/support/pglite-postgres.mjs &
 *   E2E_API_PORT=8971 E2E_WEB_PORT=3171 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5471/postgres \
 *     pnpm --filter @appuscholar/web exec playwright test e2e/tools-e.spec.ts --workers=1
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { signIn } from "./support/signin";
import { API_ORIGIN, WEB_ORIGIN } from "./support/origins";
import { tabBuilt } from "./support/builtTools";

// ---- Copy: every sentence asserted is read from the dictionary ---------------------------------------------------------------------------------------

const MSG = path.join(__dirname, "../messages");
const readJson = (f: string) => JSON.parse(readFileSync(path.join(MSG, f), "utf8")) as Record<string, string>;
const EN: Record<string, string> = { ...readJson("en.json"), ...readJson("tools/close.en.json"), ...readJson("tools/slides.en.json"), ...readJson("tools/viva.en.json") };
function T(key: string, vars?: Record<string, string | number>): string {
  const raw = EN[key];
  if (raw === undefined) throw new Error("no such key in the dictionary: " + key);
  return vars ? raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : raw;
}

// ---- The documents and the recorded reply -----------------------------------------------------------------------------------------------------------

const DOC_TITLE = "Sleep and memory essay";
/** A run of 20 words that the document and the pasted passage share (the panel's default minimum passage is 8 words, its word group 6). */
const SHARED = "the reliability of the measure was established using cronbach alpha across all three waves of data collection in the study";
const SHARED_WORDS = SHARED.split(" ").length;
/** About 120 words in all, the shared run in the middle; no quotation marks and no reference list, which the engine leaves out. */
const CLOSE_DOC = [
  "Sleep is often treated as a private matter, yet students at university plan their weeks around deadlines that leave little room for rest.",
  "In this essay I describe a small survey of first year students and the questions it was meant to answer about bedtime routines and exam worry.",
  "I explain how the questionnaire was prepared and why a short form was chosen for use in crowded lecture halls.",
  SHARED + ".",
  "After that I turn to the results, which are mixed, and I say plainly what a survey of this size can and cannot show.",
  "I finish with advice for a larger study that follows the same students from the first week of term to the last exam."
].join(" ");
/** The passage pasted in as "a source": other words around the shared run. */
const SOURCE_PASTE = `Chapter four describes the instruments. Before data were collected, ${SHARED}. Later chapters turn to the findings and their limits.`;
/** A passage that shares no run of 8 words with the document. */
const OTHER_PASTE = "Rivers carry sediment from mountain slopes to the sea, building deltas where the current slows and the land is flat, and farmers have settled these fertile plains for thousands of years.";

/** A one pixel PNG (a data URI, as the editor keeps a picture). */
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const SLIDE_TITLE = "Sleep and memory";
const SLIDE_PARA = "Students who sleep well remember more of what they read.";
const SLIDE_LIST = ["Keep a fixed bedtime", "Avoid screens late at night"];
const SLIDES_DOC = `<h1>${SLIDE_TITLE}</h1><p>${SLIDE_PARA}</p><ul>${SLIDE_LIST.map((x) => `<li><p>${x}</p></li>`).join("")}</ul>` +
  `<table><tbody><tr><th><p>Group</p></th><th><p>Score</p></th></tr><tr><td><p>Routine</p></td><td><p>72</p></td></tr></tbody></table><p><img src="${PNG}"></p>`;
const NO_HEADINGS_DOC = "<p>This document has only paragraphs, with no heading at all.</p><p>It says a little more in a second paragraph.</p>";

/** The viva passage (selected, 36 words), a short sentence (12 words) and a last paragraph that must not reach the prompt. */
const VIVA_P1 = "We chose a sample of one hundred and twenty first year students because the college could not release more volunteers during term, and we balanced the two groups by age, course and gender before any routine began.";
const VIVA_P2 = "A short note follows here with only a few words in it.";
const VIVA_P3 = "ZEBRA unrelated closing paragraph about the budget, the timetable and the room bookings for the autumn meetings.";
const VIVA_QUESTION = "Why did you balance the two groups by age, course and gender, and what would an unbalanced sample have done to your result?";
const wordsOf = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

// ---- The network outside the app, and the recorded AI -------------------------------------------------------------------------------------------------

const CORS_APP = { "access-control-allow-origin": WEB_ORIGIN, "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS" };
type Net = { unexpected: string[]; unknownPrompts: string[]; prompts: string[] };
async function stubNetwork(ctx: BrowserContext): Promise<Net> {
  const net: Net = { unexpected: [], unknownPrompts: [], prompts: [] };
  // Registered first, so it is matched last: anything outside localhost that no route below answers.
  await ctx.route((url) => !/^(localhost|127\.0\.0\.1)$/.test(url.hostname), (route) => {
    net.unexpected.push(route.request().url());
    return route.fulfill({ status: 599, body: "not recorded" });
  });
  await ctx.route(API_ORIGIN + "/ai/complete", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS_APP });
    const prompt = String((route.request().postDataJSON() as { prompt?: unknown }).prompt ?? "");
    net.prompts.push(prompt);
    // The viva prompt (core's buildVivaPrompt, for an examiner) is the only one this spec makes.
    if (!prompt.startsWith("You are an external examiner at the student's viva")) {
      net.unknownPrompts.push(prompt.slice(0, 160));
      return route.fulfill({ status: 599, headers: CORS_APP, body: "{}" });
    }
    await new Promise((r) => setTimeout(r, 300)); // long enough to see the reading line
    return route.fulfill({ status: 200, contentType: "application/json", headers: CORS_APP, body: JSON.stringify({ text: VIVA_QUESTION, model: "mock" }) });
  });
  return net;
}

// ---- Helpers --------------------------------------------------------------------------------------------------------------------------------------------

test.describe.configure({ mode: "serial", timeout: 240_000 });
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });

let context: BrowserContext;
let page: Page;
let net: Net;
let projectId = "";
/** What the page's Worker wrapper saw (installed before any script runs). */
const workerInfo = () => page.evaluate(() => (window as unknown as { __w: { made: number; messages: number; errors: number } }).__w);

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ acceptDownloads: true });
  net = await stubNetwork(context);
  // Counts the Workers the page makes, the messages they send back and their errors: the Closeness panel falls back to the main thread without a word.
  await context.addInitScript(() => {
    const w = { made: 0, messages: 0, errors: 0 };
    (window as unknown as { __w: typeof w }).__w = w;
    const Real = window.Worker;
    window.Worker = class extends Real {
      constructor(url: string | URL, opts?: WorkerOptions) {
        super(url, opts);
        w.made++;
        this.addEventListener("message", () => { w.messages++; });
        this.addEventListener("error", () => { w.errors++; });
      }
    } as typeof Worker;
  });
  page = await context.newPage();
});
test.afterAll(async () => { await context?.close(); });

/** Selects all of the editor's content and pastes `html` over it (a clipboard event ProseMirror handles as a paste from another page). */
async function setDocument(html: string) {
  await expect(page.locator(".ProseMirror")).toBeVisible();
  await page.locator(".ProseMirror").click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.evaluate((h) => {
    const dt = new DataTransfer();
    dt.setData("text/html", h);
    const tmp = document.createElement("div");
    tmp.innerHTML = h;
    dt.setData("text/plain", tmp.innerText);
    document.querySelector(".ProseMirror")!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, html);
}
/** The document is saved on the server: its autosave has answered since `mark`. */
async function saved(act: () => Promise<void>) {
  const put = page.waitForResponse((r) => r.request().method() === "PUT" && /\/documents\/[0-9a-f-]+$/.test(r.url()) && r.ok());
  await act();
  await put;
}
/** Selects the whole editor block that contains `text`. */
async function selectBlockWith(text: string) {
  await page.locator(".ProseMirror").focus();
  await page.evaluate((needle) => {
    const block = [...document.querySelectorAll(".ProseMirror p")].find((p) => p.textContent?.includes(needle));
    if (!block) throw new Error("block not found in the editor: " + needle);
    block.scrollIntoView({ block: "center" });
    const range = document.createRange();
    range.selectNodeContents(block);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
  }, text);
}
/** The project's Writing place, from wherever the student is: the header's project name, then the home's row (client-side, so the open document stays). */
async function toWriting() {
  if (!/\/writing$/.test(new URL(page.url()).pathname)) {
    if (!/^\/p\/[^/]+$/.test(new URL(page.url()).pathname)) await page.getByTestId("place-home").click();
    await expect(page.getByTestId("home-stages")).toBeVisible();
    await page.getByTestId("home-open-writing").click();
  }
  await expect(page.getByTestId("place-name")).toHaveText(T("stage_name_writing"));
  await expect(page.locator(".ProseMirror")).toBeVisible();
}
/** A Review tab, by the place's tab link (client-side). */
async function toReview(tab: "closeness" | "viva" | "slides") {
  if (!/\/review(\/|$)/.test(new URL(page.url()).pathname)) {
    if (!/^\/p\/[^/]+$/.test(new URL(page.url()).pathname)) await page.getByTestId("place-home").click();
    await expect(page.getByTestId("home-stages")).toBeVisible();
    await page.getByTestId("home-open-review").click();
  }
  await expect(page.getByTestId("place-name")).toHaveText(T("stage_name_review"));
  await page.getByTestId("place-tab-" + tab).click();
  await expect(page).toHaveURL(new RegExp(`/p/${projectId}/review/${tab}$`));
  await expect(page.getByTestId(`place-review-${tab}`)).toBeVisible();
}
const editorText = () => page.locator(".ProseMirror").evaluate((el) => el.textContent ?? "");

// ---- The steps --------------------------------------------------------------------------------------------------------------------------------------------

test("0. sign in, an AI key on this device, a project, a named document", async () => {
  await signIn(page, { prefix: "e", newAccount: false });
  await expect(page).toHaveURL(/\/start$/);
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
  await page.locator("#ideaTopic").fill("Does a fixed bedtime routine lower exam anxiety in first-year students?");
  await page.locator("#ideaRes").fill("About 60 first-years");
  await page.getByTestId("idea-save").click();
  await expect(page.getByTestId("project-home")).toBeVisible({ timeout: 20_000 });
  projectId = /\/p\/([^/?#]+)/.exec(page.url())?.[1] ?? "";
  expect(projectId).not.toBe("");
  await page.getByTestId("home-open-writing").click();
  await expect(page.getByTestId("place-name")).toHaveText(T("stage_name_writing"));
  await expect(page.locator(".ProseMirror")).toBeVisible();
  // The document's name is what a deck with no headings is titled with (step 3).
  await page.getByTestId("doc-rename").click();
  await expect(page.getByTestId("doc-name-dialog")).toBeVisible();
  await page.getByTestId("doc-name-dialog").locator("input").fill(DOC_TITLE);
  await page.getByTestId("doc-name-ok").click();
  await expect(page.getByTestId("doc-select").locator("option:checked")).toHaveText(DOC_TITLE);
});

test("1. the three Review tabs are built: Closeness, Viva and Make PPT draw their tools, not Not built yet", async () => {
  // The registry reads each module's own `export const built = true` (e2e/support/builtTools.ts reads the same line from source).
  const PANEL = { closeness: "panel-close", viva: "panel-viva", slides: "panel-slides" } as const;
  for (const tab of ["closeness", "viva", "slides"] as const) {
    expect(tabBuilt("review", tab), `${tab} module turned on`).toBe(true);
    await toReview(tab);
    const body = page.getByTestId(`place-review-${tab}`);
    await expect(body.getByTestId("not-built"), tab).toHaveCount(0);
    await expect(body, tab).not.toContainText(T("place_not_built"));
    await expect(body.getByTestId(PANEL[tab]), tab).toBeVisible();
  }
});

test("2. Closeness: a pasted passage close to the document is found by the real Worker, marked, downloadable; no match never says safe", async () => {
  await toWriting();
  await saved(() => setDocument(`<p>${CLOSE_DOC}</p>`));
  expect(wordsOf(await editorText())).toBeGreaterThanOrEqual(100);
  expect(wordsOf(CLOSE_DOC)).toBeLessThanOrEqual(140);
  await toReview("closeness");

  // The page's own CSP lets a worker run ('self' and blob:), as production's does (proxy.ts).
  const csp = (await page.request.get(page.url())).headers()["content-security-policy"] ?? "";
  expect(csp).toContain("worker-src 'self' blob:");
  const consoleErrors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  const before = await workerInfo();

  await page.getByTestId("close-paste").fill(SOURCE_PASTE);
  await page.getByTestId("close-run").click();
  const result = page.getByTestId("close-result");
  await expect(result).toBeVisible();

  // The Worker really ran (not the main-thread fallback), and nothing was refused by the policy.
  const after = await workerInfo();
  expect(after.made).toBeGreaterThan(before.made);
  expect(after.messages).toBeGreaterThan(before.messages);
  expect(after.errors).toBe(0);
  expect(consoleErrors.filter((e) => /content security policy|worker/i.test(e))).toEqual([]);

  // "Close to" wording, a passage with both texts, the shared words marked in the student's text.
  const passage = page.getByTestId("close-passage");
  await expect(passage).toHaveCount(1);
  await expect(passage).toContainText(T("close_passage_head", { words: SHARED_WORDS, name: "Pasted passage" }));
  await expect(passage).toContainText(T("close_yours"));
  await expect(passage).toContainText(T("close_theirs"));
  const mine = passage.locator("span", { hasText: T("close_yours") }).first();
  const theirs = passage.locator("span", { hasText: T("close_theirs") }).first();
  await expect(mine).toContainText(SHARED.slice(0, 60));
  await expect(theirs).toContainText(SHARED.slice(0, 60));
  await expect(page.getByTestId("close-marked").locator("mark")).toContainText(SHARED.slice(0, 60));
  const panelText = (await page.getByTestId("panel-close").textContent()) ?? "";
  expect(panelText).toMatch(/close to/);
  expect(panelText).not.toMatch(/\bcopied\b|\bplagiari[sz]ed\b/i);
  expect(panelText).not.toMatch(/\bsafe\b/i);

  // The download: closeness-check.txt, the report's header, and never the word "copied".
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("close-download").click()]);
  expect(dl.suggestedFilename()).toBe("closeness-check.txt");
  const report = readFileSync((await dl.path())!, "utf8");
  expect(report).toContain("CLOSENESS CHECK");
  expect(report).toContain("Pasted passage");
  expect(report).toContain(SHARED.slice(0, 60));
  expect(report).not.toMatch(/copied/i);

  // A passage that matches nothing: the sentence for it, no passage, no download, and never "safe".
  const minRun = Number(await page.getByTestId("close-min").inputValue()); // the default (8): the panel's own setting, not a number typed here
  expect(minRun).toBeLessThanOrEqual(SHARED_WORDS);
  await page.getByTestId("close-paste").fill(OTHER_PASTE);
  await page.getByTestId("close-run").click();
  await expect(page.getByTestId("close-passage")).toHaveCount(0);
  await expect(page.getByTestId("close-result")).toContainText(T("close_none", { minRun }));
  await expect(page.getByTestId("close-result")).toContainText("A low number is not a clean bill.");
  await expect(page.getByTestId("close-download")).toHaveCount(0);
  const none = (await page.getByTestId("close-result").textContent()) ?? "";
  expect(none).not.toMatch(/\bsafe\b|\boriginal\b|\ball clear\b|no problem/i);
  expect(net.unexpected).toEqual([]);
});

test("3. Slides: headings, a paragraph, a list, a table and a picture make a deck that unzips; no headings is one slide titled with the document's name", async () => {
  await toWriting();
  await saved(() => setDocument(SLIDES_DOC));
  const ed = page.locator(".ProseMirror");
  await expect(ed.locator("h1")).toHaveText(SLIDE_TITLE);
  await expect(ed.locator("table")).toHaveCount(1);
  await expect(ed.locator(`img[src^="data:image/png"]`)).toHaveCount(1); // not ProseMirror's own separator images
  await toReview("slides");

  await page.getByTestId("slides-generate").click();
  const cards = page.getByTestId("slides-card");
  await expect(cards).toHaveCount(1);
  await expect(page.getByTestId("slides-num").first()).toHaveText(T("slides_card_num", { n: 1 }));
  await expect(cards.first().locator("h4")).toHaveText(SLIDE_TITLE);
  await expect(cards.first()).toContainText(SLIDE_PARA);
  for (const li of SLIDE_LIST) await expect(cards.first().locator("li", { hasText: li })).toHaveCount(1);
  await expect(cards.first().locator("li", { hasText: "Table: Group | Score" })).toHaveCount(1);
  await expect(cards.first().locator("img")).toHaveCount(1);
  await expect(page.getByTestId("slides-no-headings")).toHaveCount(0);

  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("slides-download").click()]);
  expect(dl.suggestedFilename()).toBe(DOC_TITLE + ".pptx");
  const zip = await JSZip.loadAsync(readFileSync((await dl.path())!));
  expect(zip.file("ppt/presentation.xml"), "ppt/presentation.xml").not.toBeNull();
  const slideFiles = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  expect(slideFiles).toHaveLength(1);
  const slideXml = await zip.file(slideFiles[0]!)!.async("string");
  expect(slideXml).toContain(SLIDE_TITLE);
  expect(slideXml).toContain(SLIDE_PARA);
  expect(slideXml).toContain("5B21B6");
  expect(slideXml).toContain("Georgia");
  expect(Object.keys(zip.files).filter((f) => /^ppt\/media\/.+\.png$/.test(f)).length, "the picture is in the file").toBeGreaterThanOrEqual(1);

  // No heading: one slide, titled with the document's name, and the note says so.
  await toWriting();
  await saved(() => setDocument(NO_HEADINGS_DOC));
  await expect(page.locator(".ProseMirror h1")).toHaveCount(0);
  await toReview("slides");
  await page.getByTestId("slides-generate").click();
  await expect(page.getByTestId("slides-card")).toHaveCount(1);
  await expect(page.getByTestId("slides-card").first().locator("h4")).toHaveText(DOC_TITLE);
  await expect(page.getByTestId("slides-no-headings")).toHaveText(T("slides_no_headings"));
  const [dl2] = await Promise.all([page.waitForEvent("download"), page.getByTestId("slides-download").click()]);
  const zip2 = await JSZip.loadAsync(readFileSync((await dl2.path())!));
  expect(zip2.file("ppt/presentation.xml")).not.toBeNull();
  const xml2 = await zip2.file("ppt/slides/slide1.xml")!.async("string");
  expect(xml2).toContain(DOC_TITLE);
  expect(net.unexpected).toEqual([]);
});

test("4. Viva: the toolbar button carries the selection to Review; an AI question with its label, nothing to insert, the document unchanged; an answer saved and counted; under 25 words sends nothing", async () => {
  await toWriting();
  await saved(() => setDocument(`<p>${VIVA_P1}</p><p>${VIVA_P2}</p><p>${VIVA_P3}</p>`));
  const docBefore = await editorText();
  expect(wordsOf(VIVA_P1)).toBeGreaterThanOrEqual(30);
  expect(wordsOf(VIVA_P2)).toBeLessThan(25);

  // Under 25 words: the viva_need message, and no AI request.
  const asked = net.prompts.length;
  await selectBlockWith(VIVA_P2);
  await page.getByTestId("act-viva").click();
  await expect(page).toHaveURL(new RegExp(`/p/${projectId}/review/viva$`));
  await expect(page.getByTestId("panel-viva")).toBeVisible();
  await page.getByTestId("viva-get").click();
  await expect(page.getByTestId("viva-note")).toHaveText(T("viva_need"));
  await expect(page.getByTestId("viva-question")).toHaveCount(0);
  expect(net.prompts.length, "no AI request for a passage under 25 words").toBe(asked);

  // 30 or more words selected: the toolbar button lands on Review > Viva; the question is about that selection (the prompt carries it, not the rest).
  await toWriting();
  await selectBlockWith(VIVA_P1);
  await page.getByTestId("act-viva").click();
  await expect(page).toHaveURL(new RegExp(`/p/${projectId}/review/viva$`));
  await expect(page.getByTestId("viva-get")).toHaveText(T("viva_get"));
  await page.getByTestId("viva-get").click();
  const q = page.getByTestId("viva-question");
  await expect(q).toBeVisible();
  await expect(page.getByTestId("viva-q-text")).toHaveText(VIVA_QUESTION);
  expect(net.prompts.length).toBe(asked + 1);
  const prompt = net.prompts[net.prompts.length - 1]!;
  expect(prompt).toContain(VIVA_P1);
  expect(prompt).not.toContain("ZEBRA");
  expect(prompt).not.toContain(VIVA_P2);
  // Labelled as AI, with what to check (the frame's gold edge and label).
  await expect(q).toHaveClass(/ai-read/);
  await expect(q).toContainText(T("viva_label"));
  await expect(page.getByTestId("viva-get")).toHaveText(T("viva_another"));

  // Never insertable: no insert, accept or add control; the document's text is what it was, and the question is not in it.
  const buttons = (await page.getByTestId("panel-viva").locator("button").allTextContents()).map((s) => s.trim());
  expect(buttons).toEqual([T("viva_another"), T("viva_save")]);
  await expect(page.getByTestId("panel-viva").getByRole("button", { name: /insert|accept|add to/i })).toHaveCount(0);
  expect(await editorText()).toBe(docBefore);
  await expect(page.locator(".ProseMirror span.ai-ins")).toHaveCount(0);
  expect(await editorText()).not.toContain("balance the two groups by age, course and gender, and what would");

  // An answer typed from one's own head, saved: the count line reads 1; the answer box is cleared and the question gone.
  await page.getByTestId("viva-answer").fill("Because the groups had to be comparable before the routine began, or the difference could be age.");
  const put = page.waitForResponse((r) => r.request().method() === "PUT" && /\/blobs\/viva_log$/.test(r.url()) && r.ok());
  await page.getByTestId("viva-save").click();
  await put;
  await expect(page.getByTestId("viva-count")).toHaveText(T("viva_count", { n: 1 }));
  await expect(page.getByTestId("viva-question")).toHaveCount(0);

  // The answers belong to the project (viva_log blob): a reload still counts 1.
  await page.reload();
  await expect(page.getByTestId("panel-viva")).toBeVisible();
  await expect(page.getByTestId("viva-count")).toHaveText(T("viva_count", { n: 1 }));
  expect(net.unknownPrompts).toEqual([]);
  expect(net.unexpected).toEqual([]);
});
