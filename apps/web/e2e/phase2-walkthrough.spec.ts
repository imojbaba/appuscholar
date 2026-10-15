/**
 * Phase 2, Task 21: the student's journey from sign-in to export, with the AI gateway mocked.
 * docs/walkthroughs/phase-2.md is the same journey for a human on the live site with a real Groq key; keep the two in step.
 *
 * Run it with the recipe in phase2-responsive.spec.ts's header (pglite Postgres for the web server, API on its in-memory store):
 *   pnpm --filter @appuscholar/web exec playwright test e2e/phase2-walkthrough.spec.ts
 *
 * /ai/test and /ai/complete are answered in the browser (page.route), so no provider is called and no key leaves the page.
 */
import { test, expect, type Page, type Route } from "@playwright/test";

const API_ORIGIN = "http://localhost:8788";
const PASS = "secret1";
const SENTENCE_1 = "Procrastination delays important work.";
const SENTENCE_2 = "Students often start essays late.";
/** One number the student's sentence does not have, so the accuracy note is amber. */
const IMPROVED = "Procrastination delays important work, and a delay of 3 weeks is common.";
const CONTINUATION = "Deadlines that feel far away are the easiest to postpone.";

const CORS = { "access-control-allow-origin": "http://localhost:3000", "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS" };
const json = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: "application/json", headers: CORS, body: JSON.stringify(body) });

async function signIn(page: Page) {
  await page.goto("/signin");
  await page.getByTestId("e2e-email").fill(`w${Date.now()}${Math.random().toString(36).slice(2, 7)}@e2e.local`);
  await page.getByTestId("e2e-submit").click();
  await expect(page).toHaveURL(/localhost:3000\/$/);
}

/** Selects `text` inside the editor the way a drag would (the browser selection, which ProseMirror then adopts). */
async function selectInEditor(page: Page, text: string) {
  await page.locator(".ProseMirror").focus();
  await page.evaluate((needle) => {
    const walker = document.createTreeWalker(document.querySelector(".ProseMirror")!, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const at = n.textContent?.indexOf(needle) ?? -1;
      if (at >= 0) {
        // A template goes at the end and the card scrolls down with it: a student selects text they can see, so bring it into view first.
        n.parentElement!.scrollIntoView({ block: "center" });
        const sel = window.getSelection()!;
        sel.setBaseAndExtent(n, at, n, at + needle.length);
        return;
      }
    }
    throw new Error("text not found in the editor: " + needle);
  }, text);
}

// A stuck step fails in seconds with its own message instead of eating the whole test timeout.
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });

test("the Phase 2 journey: terms, key, project, writing, AI help, My writing, export, Hindi, locked key", async ({ page }) => {
  test.setTimeout(240_000);
  let completeCalls = 0; // the first call is the Improve; later calls are Continue
  await page.route("**/ai/test", (route) => (route.request().method() === "OPTIONS" ? route.fulfill({ status: 204, headers: CORS }) : json(route, { ok: true, reply: "OK" })));
  await page.route("**/ai/complete", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    completeCalls++;
    const call = completeCalls;
    await new Promise((r) => setTimeout(r, 700)); // long enough to see "Polishing…"
    return json(route, { text: call === 1 ? IMPROVED : CONTINUATION, model: "mock" });
  });

  await test.step("1. sign in: the terms block the workspace; Escape asks for both ticks", async () => {
    await signIn(page);
    await expect(page.getByTestId("terms-dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("terms-dialog")).toBeVisible();
    await expect(page.getByTestId("terms-need")).toHaveText("Tick both boxes to continue.");
    await page.getByTestId("terms-age").check();
    await page.getByTestId("terms-agree").check();
    await page.getByTestId("terms-continue").click();
    await expect(page.getByTestId("terms-dialog")).toBeHidden();
  });

  await test.step("2. Welcome, then Set up my key: Groq, a passphrase, Save, Test", async () => {
    await expect(page.getByTestId("welcome-dialog")).toBeVisible();
    await page.getByTestId("welcome-setup").click();
    await expect(page.getByTestId("provider-dialog")).toBeVisible();
    await page.getByTestId("prov-select").selectOption("groq");
    await page.getByTestId("key-input").fill("gsk_test");
    await page.getByTestId("key-mode-pass").check();
    await page.getByTestId("key-save").click();
    await expect(page.getByTestId("pass-dialog")).toBeVisible();
    await page.getByTestId("pass-input").fill(PASS);
    await page.getByTestId("pass-ok").click();
    await expect(page.getByTestId("pass-message")).toContainText("once more");
    await page.getByTestId("pass-input").fill(PASS);
    await page.getByTestId("pass-ok").click();
    await expect(page.getByTestId("toast")).toHaveText("Groq connected ✓ and encrypted 🔒");
    await expect(page.getByTestId("provider-dialog")).toBeHidden();

    await page.getByTestId("provider-key-btn").click();
    await page.getByTestId("key-test").click();
    await expect(page.getByTestId("key-test-out")).toContainText("Working ✓ Provider: Groq. The AI replied: OK");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("provider-dialog")).toBeHidden();
  });

  await test.step("3. New project, the stage intro, Start with Idea & Feasibility", async () => {
    await expect(page.getByTestId("app-version")).toHaveText(/^Version \S+$/);
    await page.getByTestId("new-project").click();
    await page.getByTestId("sap-name").fill("Thesis on academic procrastination");
    await page.getByTestId("sap-save").click();
    await expect(page.getByTestId("stage-intro")).toBeVisible();
    await page.getByTestId("stage-intro-start").click();
    await expect(page.getByTestId("stage-intro")).toBeHidden();
    await expect(page.getByTestId("stage-idea")).toHaveClass(/current/);
    await expect(page.getByTestId("stage-counter")).toContainText("Stage 1 of 6");
    await expect(page.getByTestId("stage-counter")).toContainText("Idea & Feasibility");
  });

  await test.step("4. write two sentences, autosave, reload: the text, the project bar and the badge are back", async () => {
    await expect(page.getByTestId("save-status")).toHaveText("Auto-save on");
    const editor = page.locator(".ProseMirror");
    await editor.click();
    const saved = page.waitForResponse((r) => r.request().method() === "PUT" && /\/documents\/[0-9a-f-]+$/.test(r.url()) && r.ok());
    await editor.pressSequentially(`${SENTENCE_1} ${SENTENCE_2}`);
    await saved;
    await expect(page.getByTestId("save-status")).toHaveText("Auto-save on");
    await page.reload();
    await expect(page.locator(".ProseMirror")).toContainText(SENTENCE_1);
    await expect(page.locator(".ProseMirror")).toContainText(SENTENCE_2);
    await expect(page.getByTestId("project-bar-label")).toContainText("Thesis on academic procrastination");
    await expect(page.getByTestId("project-bar-label")).toContainText("Idea & Feasibility");
  });

  await test.step("5. Template: Essay inserts its headings", async () => {
    await page.getByTestId("act-template").click();
    await expect(page.getByTestId("template-dialog")).toBeVisible();
    await page.getByTestId("template-essay").check();
    await page.getByTestId("template-insert").click();
    await expect(page.getByTestId("template-dialog")).toBeHidden();
    const headings = page.locator(".ProseMirror h2");
    await expect(headings.filter({ hasText: "Introduction" })).toHaveCount(1);
    await expect(headings.filter({ hasText: "Conclusion" })).toHaveCount(1);
    await expect(headings.filter({ hasText: "References" })).toHaveCount(1);
  });

  await test.step("6. select a sentence, Improve from the bubble: polishing, result, amber note (the key is locked after the reload, so the passphrase is asked once)", async () => {
    await selectInEditor(page, SENTENCE_1);
    await expect(page.getByTestId("sel-bubble")).toBeVisible();
    await page.getByTestId("sel-improve").click();
    await expect(page.getByTestId("pass-dialog")).toBeVisible();
    await expect(page.getByTestId("pass-message")).toContainText("Passphrase to unlock your Groq key");
    await page.getByTestId("pass-input").fill(PASS);
    await page.getByTestId("pass-ok").click();
    await expect(page.getByTestId("ai-status")).toHaveText("💜 Polishing…");
    await expect(page.getByTestId("ai-out")).toHaveText(IMPROVED);
    const note = page.getByTestId("ai-note");
    await expect(note).toContainText("New in the result and not in your text");
    await expect(note).toHaveClass(/flag/);
    expect(completeCalls).toBe(1);
  });

  await test.step("7. Tab accepts: the sentence is replaced inside span.ai-ins", async () => {
    await page.locator(".ProseMirror").focus();
    await page.keyboard.press("Tab");
    const inserted = page.locator(".ProseMirror span.ai-ins");
    await expect(inserted).toHaveCount(1);
    await expect(inserted).toHaveText(IMPROVED);
    await expect(page.locator(".ProseMirror")).not.toContainText(SENTENCE_1 + " ");
    await expect(page.locator(".ProseMirror")).toContainText(SENTENCE_2);
  });

  await test.step("8. AI text: the wash shows on the inserted passage, and the share is below 100% yours", async () => {
    const bg = () => page.locator(".ProseMirror .ai-ins").evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(await bg()).toBe("rgba(0, 0, 0, 0)");
    await page.getByTestId("act-ai-text").click();
    await expect(page.locator(".highlight-ai .ai-ins")).toHaveCount(1);
    expect(await page.locator(".highlight-ai .ai-ins").evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
    await expect.poll(async () => {
      const m = /^(\d+)% yours$/.exec((await page.getByTestId("origin-badge").textContent())?.trim() ?? "");
      return m ? Number(m[1]) : 100;
    }).toBeLessThan(100);
  });

  await test.step("9. My writing: one AI passage, and the process record downloads", async () => {
    await page.getByTestId("origin-badge").click();
    await expect(page.getByTestId("my-writing")).toBeVisible();
    await expect(page.getByTestId("my-writing-docs")).toContainText("AI passages: 1");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("record-download").click()]);
    expect(download.suggestedFilename()).toBe("writing-process-record.txt");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("my-writing")).toBeHidden();
  });

  await test.step("10. Draft first on: Continue shows feedback, Accept inserts nothing; then off", async () => {
    await page.getByTestId("act-draft-first").click();
    await expect(page.getByTestId("act-draft-first")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("act-continue").click();
    await expect(page.getByTestId("ai-out")).toContainText("Feedback on your draft. Nothing here is meant to be pasted in");
    const aiBefore = await page.locator(".ProseMirror span.ai-ins").count();
    await page.getByTestId("ai-accept").click();
    await expect(page.getByTestId("toast")).toHaveText("No suggestion to accept yet");
    expect(await page.locator(".ProseMirror span.ai-ins").count()).toBe(aiBefore);
    await page.getByTestId("act-draft-first").click();
    await expect(page.getByTestId("act-draft-first")).toHaveAttribute("aria-pressed", "false");
  });

  await test.step("11. export: Word and LaTeX files are named after the document", async () => {
    const title = (await page.locator("#doc-select option:checked").innerText()).trim();
    expect(title.length).toBeGreaterThan(0);
    const stem = title.replace(/[^\w\- ]+/g, "").trim() || "appuscholar-document";
    const [word] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-word").click()]);
    expect(word.suggestedFilename()).toBe(stem + ".doc");
    const [tex] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-latex").click()]);
    expect(tex.suggestedFilename()).toBe(stem + ".tex");
  });

  await test.step("12. Hindi chrome and back", async () => {
    await page.getByTestId("lang-toggle").click();
    await expect(page.getByTestId("tool-idea")).toContainText("विचार और व्यवहार्यता");
    await page.getByTestId("lang-toggle").click();
    await expect(page.getByTestId("tool-idea")).toContainText("Idea & Feasibility");
  });

  await test.step("13. reload, then a wrong passphrase on the first AI use: refused, nothing sent", async () => {
    await page.reload();
    await expect(page.locator(".ProseMirror")).toContainText(SENTENCE_2);
    await expect(page.getByTestId("act-continue")).toBeVisible();
    const before = completeCalls;
    await page.getByTestId("act-continue").click();
    await expect(page.getByTestId("pass-dialog")).toBeVisible();
    await page.getByTestId("pass-input").fill("not-the-passphrase");
    await page.getByTestId("pass-ok").click();
    await expect(page.getByTestId("ai-out")).toHaveText("Wrong passphrase — nothing was unlocked. Try again.");
    expect(completeCalls).toBe(before);
  });
});
