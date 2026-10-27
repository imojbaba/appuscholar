/**
 * Phase 2, Task 21: the student's journey from sign-in to export, with the AI gateway mocked.
 * docs/walkthroughs/phase-2.md is the same journey for a human on the live site with a real Groq key; keep the two in step.
 *
 * Run it with the recipe in phase2-responsive.spec.ts's header (pglite Postgres for the web server, API on its in-memory store):
 *   pnpm --filter @appuscholar/web exec playwright test e2e/phase2-walkthrough.spec.ts
 *
 * /ai/test and /ai/complete are answered in the browser (page.route), so no provider is called and no key leaves the page.
 * Wave B1: a new account starts at first run; the project is saved from it (no check needed) and opens on its home, and the writing steps run
 * in the Writing place, which the home's row opens. The Pop out button gave way to "Open in a new window" on any place but Writing.
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import { test, expect, type Page, type Route } from "@playwright/test";
import { e2eEmail, signIn } from "./support/signin";
import { recordToasts } from "./support/toasts";
import { connectAI } from "./support/connect";
import { makeStudy } from "./support/study";
import { WEB_ORIGIN } from "./support/origins";
import * as editorAt from "./support/editor";

/** The vault passphrase (at least 10 characters). Since Phase 3A "Protect with a passphrase" locks the key under the vault, so this one passphrase opens both. */
const PASS = "secret passphrase 1";
const RECOVERY_CODE = /^[A-HJ-NP-Z2-9]{5}(-[A-HJ-NP-Z2-9]{5}){3}$/;
const SENTENCE_1 = "Procrastination delays important work.";
const SENTENCE_2 = "Students often start essays late.";
/** One number the student's sentence does not have, so the accuracy note is amber. */
const IMPROVED = "Procrastination delays important work, and a delay of 3 weeks is common.";
const CONTINUATION = "Deadlines that feel far away are the easiest to postpone.";
const CHAT_REPLY = "Name the habit you study, then say who it affects and why that matters.";
const EMAIL_LINE = "Write to asha@uni.ac.in about the survey.";
const PROJECT = "Thesis on academic procrastination";
const TOPIC = "Does a weekly planning session reduce essay procrastination in second-year students?";
const fixture = (name: string) => path.join(__dirname, "fixtures", name);
const HI = JSON.parse(readFileSync(path.join(__dirname, "../messages/hi.json"), "utf8")) as Record<string, string>;

const CORS = { "access-control-allow-origin": WEB_ORIGIN, "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS" };
const json = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: "application/json", headers: CORS, body: JSON.stringify(body) });

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

// Set in the editor's own state (support/editor.ts says why a DOM range placed after focus can be lost).
/** Puts the cursor at the very end of the document. */
const cursorToEnd = (page: Page) => editorAt.cursorToEnd(page.locator(".ProseMirror"));
/** Selects the whole block of the editor that contains `text`, and waits for the selection bubble (again after a Cancel: R45). */
const selectBlockWith = (page: Page, text: string) => editorAt.selectBlockForBubble(page.locator(".ProseMirror"), text);

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
    await signIn(page, { prefix: "w" });
    await expect(page.getByTestId("terms-dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("terms-dialog")).toBeVisible();
    await expect(page.getByTestId("terms-need")).toHaveText("Tick both boxes to continue.");
    await page.getByTestId("terms-age").check();
    await page.getByTestId("terms-agree").check();
    await page.getByTestId("terms-continue").click();
    await expect(page.getByTestId("terms-dialog")).toBeHidden();
    // After the terms the dashboard (start-a-study spec, OJ 2026-10-27), with nothing over it; AI is connected when it is first needed.
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByTestId("project-list")).toBeVisible();
    await expect(page.getByTestId("connect-dialog")).toBeHidden();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  await test.step("2. Connect AI from the AI pill: Groq, a passphrase (chosen and confirmed in the window, then its recovery sheet); the AI connection's Test", async () => {
    await expect(page.getByTestId("ai-pill")).toHaveText("Connect AI");
    await expect(page.getByTestId("vault-pill")).toHaveText("🔓 Protect my work");
    const toasts = await recordToasts(page);
    // The key is saved under the vault. First run has no document yet, so nothing is migrated (phase3a-vault.spec.ts step 3 migrates a written one).
    const code = await connectAI(page, { keep: "pass", passphrase: PASS });
    expect(code).toMatch(RECOVERY_CODE);
    await expect.poll(toasts).toEqual(expect.arrayContaining(["AI connected.", "All your work is now locked with your passphrase ✓"]));
    await expect(page.getByTestId("vault-pill")).toHaveText("🔓 Unlocked");

    // The AI pill names the company; it opens the AI connection, whose Test asks the provider.
    await expect(page.getByTestId("ai-pill")).toHaveText("AI: Groq");
    await page.getByTestId("ai-pill").click();
    await expect(page.getByTestId("connect-dialog")).toHaveAttribute("data-screen", "manage");
    await page.getByTestId("connect-test").click();
    await expect(page.getByTestId("connect-status")).toHaveText("Groq answered. Your key works.");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("connect-dialog")).toBeHidden();
  });

  await test.step("3. Start a new study, its question in Shape your study (no check needed), Finish later; the home's six stages; Writing opens the study's empty document", async () => {
    await page.getByTestId("help-btn").click();
    await expect(page.getByTestId("app-version")).toHaveText(/^Version \S+$/);
    await page.keyboard.press("Escape");
    await makeStudy(page, { name: PROJECT, question: TOPIC });
    await expect(page).toHaveURL(/\/p\/[0-9a-f-]+$/);
    await expect(page.getByTestId("project-switcher")).toContainText(PROJECT);
    await expect(page.getByTestId("home-q-text")).toHaveText(TOPIC);
    await expect(page.getByTestId("home-shape-count")).toHaveText("Shape your study: 1 of 6 parts answered.");
    // The feasibility check is optional: the card shows no verdict and asks for none.
    await expect(page.getByTestId("home-q-verdict")).toHaveCount(0);
    for (const [s, state] of [["idea", "In progress"], ["lit", "Not started"], ["design", "Not started"], ["collect", "Not started"], ["writing", "Not started"], ["review", "Not started"]]) {
      await expect(page.getByTestId("home-state-" + s)).toHaveText(state);
    }
    await page.getByTestId("home-open-writing").click();
    await expect(page).toHaveURL(/\/p\/[0-9a-f-]+\/writing$/);
    await expect(page.getByTestId("place-name")).toHaveText("Writing");
    await expect(page.getByTestId("word-count")).toHaveText("0 words");
  });

  await test.step("4. write two sentences, autosave (encrypted: the vault is on), reload: the passphrase opens the document, the text, the place and the project's name are back", async () => {
    await expect(page.getByTestId("save-status")).toHaveText("Auto-save on");
    const editor = page.locator(".ProseMirror");
    await editor.click();
    const saved = page.waitForResponse((r) => r.request().method() === "PUT" && /\/documents\/[0-9a-f-]+$/.test(r.url()) && r.ok());
    await editor.pressSequentially(`${SENTENCE_1} ${SENTENCE_2}`);
    const sent = (await saved).request().postDataJSON() as { bodyHtml: string; keyVersion: number; wordCount: number };
    // The server receives ciphertext and the counts, never the text.
    expect(sent.keyVersion).toBeGreaterThanOrEqual(1);
    expect(sent.bodyHtml).not.toContain("<p>");
    expect(sent.wordCount).toBeGreaterThan(0);
    await expect(page.getByTestId("save-status")).toHaveText("Auto-save on");
    const at = page.url();
    await page.reload();
    // After a reload the vault is locked: the document asks for its passphrase before the editor opens.
    await expect(page.getByTestId("pass-dialog")).toBeVisible();
    await expect(page.getByTestId("pass-message")).toHaveText("Type the passphrase that protects your documents.");
    await page.getByTestId("pass-input").fill(PASS);
    await page.getByTestId("pass-ok").click();
    await expect(page.locator(".ProseMirror")).toContainText(SENTENCE_1);
    await expect(page.locator(".ProseMirror")).toContainText(SENTENCE_2);
    expect(page.url()).toBe(at);
    await expect(page.getByTestId("project-switcher")).toContainText(PROJECT);
    await expect(page.getByTestId("place-home")).toHaveText(PROJECT);
    await expect(page.getByTestId("place-name")).toHaveText("Writing");
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

  await test.step("6. select a sentence, Improve from the bubble: polishing, result, amber note (the vault opened with the document, so the key needs no second passphrase)", async () => {
    await selectInEditor(page, SENTENCE_1);
    await expect(page.getByTestId("sel-bubble")).toBeVisible();
    await page.getByTestId("sel-improve").click();
    await expect(page.getByTestId("pass-dialog")).toBeHidden();
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
    // No ORCID iD is set: the LaTeX export asks for one here, optional (first-run build spec: it waits until it is needed); Export goes on without it.
    await page.getByTestId("download-latex").click();
    await expect(page.getByTestId("latex-orcid-dialog")).toBeVisible();
    const [tex] = await Promise.all([page.waitForEvent("download"), page.getByTestId("latex-orcid-go").click()]);
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
    // Chat is folded above the document in Writing.
    await page.getByTestId("writing-aside").locator("summary").first().click();
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

  await test.step("17. Open in a new window: not in Writing; Literature's Citations opens in a window of its own; the old /popout?tool=cite link leads there too", async () => {
    await expect(page.getByTestId("place-new-window")).toHaveCount(0);
    await page.getByTestId("place-home").click();
    await page.getByTestId("home-open-lit").click();
    await page.getByTestId("place-tab-citations").click();
    await expect(page.getByTestId("panel-cite")).toBeVisible();
    const projectPath = new URL(page.url()).pathname;
    expect(projectPath).toMatch(/^\/p\/[0-9a-f-]+\/lit\/citations$/);
    const opened = page.waitForEvent("popup");
    await page.getByTestId("place-new-window").click();
    const popup = await opened;
    // The window shows Citations (an empty library, so nothing to unlock there), with no document and no switcher.
    await expect(popup.getByTestId("panel-cite")).toBeVisible();
    await expect(popup.getByTestId("cite-count")).toHaveText("0");
    expect(new URL(popup.url()).pathname + new URL(popup.url()).search).toBe(projectPath + "?window=1");
    // Nothing in the window needed the vault yet, so it is locked there: the project's name reads "Locked title" until its pill opens it.
    await expect(popup.getByTestId("window-where")).toHaveText("Locked title / Literature");
    await expect(popup.getByTestId("vault-pill")).toHaveText("🔒 Locked");
    await popup.getByTestId("vault-pill").click();
    await popup.getByTestId("pass-input").fill(PASS);
    await popup.getByTestId("pass-ok").click();
    await expect(popup.getByTestId("window-where")).toHaveText(PROJECT + " / Literature");
    await expect(popup.getByTestId("project-switcher")).toHaveCount(0);
    await expect(popup.locator(".ProseMirror")).toHaveCount(0);
    // A link to the old pop-out page opens the active project's Citations in a window of its own.
    await popup.goto("/popout?tool=cite");
    await expect(popup).toHaveURL(new RegExp(projectPath.replace(/\//g, "\\/") + "\\?window=1$"));
    await popup.close();
    await page.getByTestId("place-home").click();
    await page.getByTestId("home-open-writing").click();
    await expect(page.locator(".ProseMirror")).toContainText(SENTENCE_2);
  });

  await test.step("18. Hindi chrome and back", async () => {
    await page.getByTestId("lang-toggle").click();
    await expect(page.getByTestId("place-name")).toHaveText(HI.stage_name_writing!);
    await expect(page.getByTestId("help-btn")).toContainText(HI.hdr_help!);
    await page.getByTestId("lang-toggle").click();
    await expect(page.getByTestId("place-name")).toHaveText("Writing");
  });

  await test.step("19. reload, then a wrong passphrase when the document opens: refused and asked again, then cancelled: the document stays locked, the Doc list works, nothing sent; the pill opens it", async () => {
    const before = completeCalls;
    await page.reload();
    await expect(page.getByTestId("pass-dialog")).toBeVisible();
    await page.getByTestId("pass-input").fill("not-the-passphrase");
    await page.getByTestId("pass-ok").click();
    await expect(page.getByTestId("toast")).toHaveText("Wrong passphrase — nothing was unlocked. Try again.");
    await expect(page.getByTestId("pass-dialog")).toBeVisible();
    await page.getByTestId("pass-cancel").click();
    await expect(page.getByTestId("pass-dialog")).toBeHidden();
    // Never an empty editor in place of the text: the card says the document is locked, and no AI action is offered on it.
    await expect(page.getByTestId("doc-unreadable")).toHaveText("This document is locked. Unlock your vault to read it.");
    await expect(page.locator(".ProseMirror")).toHaveCount(0);
    await expect(page.getByTestId("act-continue")).toHaveCount(0);
    await expect(page.getByTestId("doc-select")).toBeEnabled();
    expect(completeCalls).toBe(before);
    // The vault pill opens the vault, and the document with it.
    await page.getByTestId("vault-pill").click();
    await expect(page.getByTestId("pass-dialog")).toBeVisible();
    await page.getByTestId("pass-input").fill(PASS);
    await page.getByTestId("pass-ok").click();
    await expect(page.locator(".ProseMirror")).toContainText(SENTENCE_2);
    await expect(page.getByTestId("doc-unreadable")).toHaveCount(0);
  });
});

test("sign-out asks whether to forget the AI keys remembered on this computer (kept per account)", async ({ page }) => {
  test.setTimeout(120_000);
  const email = e2eEmail("k");
  const remembered = () => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("appu_key_")));
  const signInAs = () => signIn(page, { email });
  await signInAs();
  await page.getByTestId("terms-age").check();
  await page.getByTestId("terms-agree").check();
  await page.getByTestId("terms-continue").click();
  await connectAI(page, { key: "gsk_remembered", keep: "plain" });
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
