/**
 * Phase 2, Task 21: the student's journey from sign-in to export, with the AI gateway mocked.
 * docs/walkthroughs/phase-2.md is the same journey for a human on the live site with a real Groq key; keep the two in step.
 *
 * Run it with the recipe in phase2-responsive.spec.ts's header (pglite Postgres for the web server, API on its in-memory store):
 *   pnpm --filter @appuscholar/web exec playwright test e2e/phase2-walkthrough.spec.ts
 *
 * /ai/test and /ai/complete are answered in the browser (page.route), so no provider is called and no key leaves the page.
 */
import path from "node:path";
import { test, expect, type Page, type Route } from "@playwright/test";

const API_ORIGIN = "http://localhost:8788";
const PASS = "secret1";
const SENTENCE_1 = "Procrastination delays important work.";
const SENTENCE_2 = "Students often start essays late.";
/** One number the student's sentence does not have, so the accuracy note is amber. */
const IMPROVED = "Procrastination delays important work, and a delay of 3 weeks is common.";
const CONTINUATION = "Deadlines that feel far away are the easiest to postpone.";
const CHAT_REPLY = "Name the habit you study, then say who it affects and why that matters.";
const EMAIL_LINE = "Write to asha@uni.ac.in about the survey.";
const fixture = (name: string) => path.join(__dirname, "fixtures", name);

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

/** Puts the cursor at the very end of the document (the same on every platform, unlike an End key chord). */
async function cursorToEnd(page: Page) {
  await page.locator(".ProseMirror").focus();
  await page.evaluate(() => {
    const last = document.querySelector(".ProseMirror")!.lastElementChild!;
    last.scrollIntoView({ block: "center" });
    const range = document.createRange();
    range.selectNodeContents(last);
    range.collapse(false);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
  });
}

/** Selects the whole block of the editor that contains `text`. */
async function selectBlockWith(page: Page, text: string) {
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

// A stuck step fails in seconds with its own message instead of eating the whole test timeout.
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });

test("the Phase 2 journey: terms, key, project, writing, AI help, My writing, export, Hindi, locked key", async ({ page }) => {
  test.setTimeout(240_000);
  let completeCalls = 0; // every /ai/complete that reaches the (mocked) provider
  const prompts: string[] = [];
  await page.route("**/ai/test", (route) => (route.request().method() === "OPTIONS" ? route.fulfill({ status: 204, headers: CORS }) : json(route, { ok: true, reply: "OK" })));
  await page.route("**/ai/complete", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    completeCalls++;
    const prompt = String((route.request().postDataJSON() as { prompt?: unknown }).prompt ?? "");
    prompts.push(prompt);
    await new Promise((r) => setTimeout(r, 700)); // long enough to see "Polishing…"
    // The answer follows the question: Improve, the chat coach, and (Continue and Draft first) the continuation.
    const text = prompt.startsWith("Improve this text") ? IMPROVED : prompt.startsWith("You are Appuscholar, a scholarly writing coach") ? CHAT_REPLY : CONTINUATION;
    return json(route, { text, model: "mock" });
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

  let originalDocId = "";
  const docSelect = () => page.getByTestId("doc-select");
  await test.step("12. import a .docx and a .txt: asked whose writing they are; My own writing puts both in the Doc list (the .docx keeps its heading and picture)", async () => {
    originalDocId = await docSelect().inputValue();
    const before = await docSelect().locator("option").count();
    await page.getByTestId("doc-import-input").setInputFiles([fixture("sample-essay.docx"), fixture("sample-notes.txt")]);
    await expect(page.getByTestId("import-origin")).toBeVisible();
    await expect(page.getByTestId("import-origin")).toContainText("Whose writing is this?");
    await expect(page.getByTestId("import-origin-files")).toHaveText("Importing 2 file(s): sample-essay.docx, sample-notes.txt.");
    await page.getByTestId("import-origin-own").click();
    await expect(page.getByTestId("import-origin")).toBeHidden();
    await expect(docSelect().locator("option")).toHaveCount(before + 2);
    await expect(docSelect().locator("option", { hasText: "sample-essay" })).toHaveCount(1);
    await expect(docSelect().locator("option", { hasText: "sample-notes" })).toHaveCount(1);
    await docSelect().selectOption({ label: "sample-essay" });
    await expect(page.locator(".ProseMirror :is(h1, h2)").filter({ hasText: "Imported essay heading" })).toHaveCount(1);
    await expect(page.locator('.ProseMirror img[src^="data:image/png"]')).toHaveCount(1);
    await expect(page.getByTestId("doc-source-badge")).toBeHidden();
  });

  await test.step("13. import a .pdf: no question, a source paper, with the 📄 prefix in the Doc list", async () => {
    await page.getByTestId("doc-import-input").setInputFiles(fixture("sample-paper.pdf"));
    await expect(docSelect().locator("option", { hasText: "📄 sample-paper" })).toHaveCount(1, { timeout: 30_000 });
    await expect(page.getByTestId("import-origin")).toBeHidden();
    await expect(page.getByTestId("doc-source-badge")).toHaveText("📄 source paper");
    await expect(page.locator(".ProseMirror")).toContainText("Sleep and memory in university students.");
  });

  await test.step("14. Mark as source: the badge says 📄 source paper, and My writing leaves the source papers out of the counts", async () => {
    await docSelect().selectOption({ label: "sample-notes" });
    await expect(page.locator(".ProseMirror")).toContainText("Notes from the lab meeting.");
    await expect(page.getByTestId("doc-source-badge")).toBeHidden();
    await page.getByTestId("doc-origin").click();
    await expect(page.getByTestId("toast")).toHaveText("Marked as a source paper. It no longer counts as your writing.");
    await expect(page.getByTestId("doc-source-badge")).toHaveText("📄 source paper");
    await expect(page.getByTestId("origin-badge")).toHaveText("📄 source paper");
    await page.getByTestId("origin-badge").click();
    await expect(page.getByTestId("my-writing")).toBeVisible();
    await expect(page.getByTestId("my-writing-sources")).toContainText(/words in 2 source paper\(s\) are left out of these counts\./);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("my-writing")).toBeHidden();
    await docSelect().selectOption(originalDocId);
    await expect(page.locator(".ProseMirror")).toContainText(SENTENCE_2);
  });

  await test.step("15. personal details: Cancel sends nothing; Mask them and send sends [email]", async () => {
    const editor = page.locator(".ProseMirror");
    await cursorToEnd(page);
    await page.keyboard.press("Enter");
    await page.keyboard.type(EMAIL_LINE);
    await expect(editor.locator("p").filter({ hasText: EMAIL_LINE })).toHaveCount(1);
    const sentBefore = completeCalls;
    await selectBlockWith(page, "asha@uni.ac.in");
    await expect(page.getByTestId("sel-bubble")).toBeVisible();
    await page.getByTestId("sel-improve").click();
    await expect(page.getByTestId("pd-dialog")).toBeVisible();
    await expect(page.getByTestId("pd-dialog")).toContainText("Personal details in this text");
    await expect(page.getByTestId("pd-found")).toHaveText("Found: 1 email address.");
    await page.getByTestId("pd-cancel").click();
    await expect(page.getByTestId("pd-dialog")).toBeHidden();
    await expect(page.getByTestId("ai-out")).toHaveText("Cancelled. Nothing was sent to the AI provider.");
    expect(completeCalls).toBe(sentBefore); // the mock was not hit

    await selectBlockWith(page, "asha@uni.ac.in");
    await expect(page.getByTestId("sel-bubble")).toBeVisible();
    await page.getByTestId("sel-improve").click();
    await expect(page.getByTestId("pd-found")).toHaveText("Found: 1 email address.");
    await page.getByTestId("pd-mask").click();
    await expect(page.getByTestId("ai-out")).toHaveText(IMPROVED);
    expect(completeCalls).toBe(sentBefore + 1);
    const sent = prompts[prompts.length - 1]!;
    expect(sent).toContain("[email]");
    expect(sent).not.toContain("asha@uni.ac.in");
    await page.getByTestId("ai-dismiss").click();
    // Take the address out again, so the later Continue steps are not stopped by the personal-data check.
    await selectBlockWith(page, "asha@uni.ac.in");
    await page.keyboard.press("Backspace");
    await expect(page.locator(".ProseMirror")).not.toContainText("asha@uni.ac.in");
  });

  await test.step("16. Ask Appuscholar: a question, a reply, + Insert into document puts it at the end as AI text", async () => {
    await page.getByTestId("tool-chat").click();
    await expect(page.getByTestId("chat-panel")).toBeVisible();
    await page.getByTestId("chat-input").fill("Give me a way to start my introduction");
    await page.getByTestId("chat-send").click();
    await expect(page.getByTestId("chat-user")).toHaveText("Give me a way to start my introduction");
    await expect(page.getByTestId("chat-ai")).toContainText(CHAT_REPLY);
    await page.getByTestId("chat-insert").click();
    await expect(page.getByTestId("toast")).toHaveText("Inserted into your document ✓ — Ctrl+Z to undo");
    const last = page.locator(".ProseMirror > *").last();
    await expect(last.locator("span.ai-ins")).toHaveText(CHAT_REPLY);
  });

  await test.step("17. Pop out says it comes later (Citations), and keeps the old notice for the other tools", async () => {
    await page.getByTestId("pop-out").click();
    await expect(page.getByTestId("toast")).toHaveText("Only Citations and Research can open in their own window.");
    await expect(page.getByTestId("toast")).toBeHidden({ timeout: 15_000 });
    await page.getByTestId("tool-cite").click();
    await expect(page.getByTestId("dock-tab-tools")).toContainText("Citation Manager");
    await page.getByTestId("pop-out").click();
    await expect(page.getByTestId("toast")).toHaveText("Pop out arrives in a later phase.");
  });

  await test.step("18. Hindi chrome and back", async () => {
    await page.getByTestId("lang-toggle").click();
    await expect(page.getByTestId("tool-idea")).toContainText("विचार और व्यवहार्यता");
    await page.getByTestId("lang-toggle").click();
    await expect(page.getByTestId("tool-idea")).toContainText("Idea & Feasibility");
  });

  await test.step("19. reload, then a wrong passphrase on the first AI use: refused, nothing sent", async () => {
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

test("sign-out asks whether to forget the AI keys remembered on this computer (kept per account)", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `k${Date.now()}${Math.random().toString(36).slice(2, 7)}@e2e.local`;
  const remembered = () => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("appu_key_")));
  async function signInAs() {
    await page.goto("/signin");
    await page.getByTestId("e2e-email").fill(email);
    await page.getByTestId("e2e-submit").click();
    await expect(page).toHaveURL(/localhost:3000\/$/);
  }
  await signInAs();
  await page.getByTestId("terms-age").check();
  await page.getByTestId("terms-agree").check();
  await page.getByTestId("terms-continue").click();
  await page.getByTestId("welcome-setup").click();
  await page.getByTestId("prov-select").selectOption("groq");
  await page.getByTestId("key-input").fill("gsk_remembered");
  await page.getByTestId("key-mode-plain").check();
  await page.getByTestId("key-save").click();
  await expect(page.getByTestId("provider-dialog")).toBeHidden();
  // The key is filed under this account, never under the bare provider name.
  const keys = await remembered();
  expect(keys).toHaveLength(1);
  expect(keys[0]).toMatch(/^appu_key_.+_groq$/);
  expect(keys[0]).not.toBe("appu_key_groq");

  // Keep and sign out: the key stays for the next sign-in on this computer.
  await page.getByTestId("help-btn").click();
  await page.getByTestId("sign-out").click();
  await expect(page.getByTestId("forget-keys-confirm")).toContainText("Forget the AI keys remembered on this computer?");
  await page.getByRole("button", { name: "Keep and sign out" }).click();
  await expect(page).toHaveURL(/signin/);
  expect(await remembered()).toEqual(keys);

  // Forget and sign out: this account's remembered keys are removed.
  await signInAs();
  await page.getByTestId("help-btn").click();
  await page.getByTestId("sign-out").click();
  await page.getByRole("button", { name: "Forget and sign out" }).click();
  await expect(page).toHaveURL(/signin/);
  expect(await remembered()).toEqual([]);
});
