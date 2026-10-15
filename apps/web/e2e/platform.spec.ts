import { test, expect } from "@playwright/test";
import path from "node:path";

const fixture = path.resolve(__dirname, "../../../packages/core/test/fixtures/v1-backup-small.json");
const richFixture = path.resolve(__dirname, "../../../packages/core/test/fixtures/v1-backup-rich.json");

test("sign in, write with revisions, restore, import v1", async ({ page }) => {
  await page.goto("/signin");
  await page.getByTestId("e2e-email").fill(`t${Date.now()}@e2e.local`);
  await page.getByTestId("e2e-submit").click();
  await expect(page).toHaveURL(/\/projects$/);

  await page.getByTestId("project-title").fill("Sleep and memory");
  await page.getByTestId("project-create").click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+/);
  await expect(page.getByTestId("stage-intro")).toBeVisible();
  await expect(page.getByTestId("stage-intro")).toContainText("Shape your question");
  await page.getByTestId("stage-intro-start").click();
  await expect(page.getByTestId("stage-counter")).toHaveText("Stage 1 of 6");
  await page.getByTestId("stage-next").click();
  await expect(page.getByTestId("stage-counter")).toHaveText("Stage 2 of 6");
  await page.reload();
  await expect(page.getByTestId("stage-counter")).toHaveText("Stage 2 of 6");
  await expect(page.getByTestId("stage-chip-lit")).toHaveAttribute("aria-current", "step");
  await page.getByTestId("stage-chip-review").click();
  await expect(page.getByTestId("stage-final")).toBeVisible();
  await page.getByTestId("stage-chip-idea").click();
  await expect(page.getByTestId("stage-counter")).toHaveText("Stage 1 of 6");
  await page.goto("/projects");

  // a failed rename shows an error that does not leak into the next dialog open
  await page.route("**/projects/*", async route => {
    if (route.request().method() === "PATCH") await route.abort();
    else await route.continue();
  });
  await page.getByTestId("project-actions").first().click();
  await page.getByTestId("project-rename").click();
  await page.getByTestId("rename-input").fill("Will not save");
  await page.getByTestId("rename-save").click();
  await expect(page.getByTestId("error-msg")).toHaveText("That did not save. Try again.");
  await page.keyboard.press("Escape");
  await page.unroute("**/projects/*");
  await page.getByTestId("project-actions").first().click();
  await page.getByTestId("project-rename").click();
  await expect(page.getByTestId("error-msg")).toHaveCount(0);
  await page.keyboard.press("Escape");

  // rename via the card menu
  await page.getByTestId("project-actions").first().click();
  await page.getByTestId("project-rename").click();
  await page.getByTestId("rename-input").fill("Sleep and memory, renamed");
  await page.getByTestId("rename-save").click();
  await expect(page.getByTestId("project-link").first()).toHaveText("Sleep and memory, renamed");
  await expect(page.getByTestId("project-card").first()).toContainText("No documents yet");
  await page.getByTestId("project-actions").first().click();
  await page.getByTestId("project-complete").click();
  await expect(page.getByTestId("project-complete-badge").first()).toHaveText("Complete");
  await page.getByTestId("project-actions").first().click();
  await page.getByTestId("project-reopen").click();
  await expect(page.getByTestId("project-complete-badge")).toHaveCount(0);
  await page.getByTestId("project-link").first().click();

  await page.getByTestId("doc-title").fill("Draft");
  await page.getByTestId("doc-create").click();
  await page.getByTestId("doc-link").first().click();

  // renaming does not create a revision
  await page.getByTestId("doc-title-field").fill("Draft, renamed");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Draft, renamed");
  const renamedDocId = page.url().split("/").pop()!;
  const afterRename = await page.evaluate(async (id) => {
    const { token } = await (await fetch("/api/token", { cache: "no-store" })).json() as { token: string };
    const r = await fetch(`http://localhost:8788/documents/${id}`, { headers: { authorization: "Bearer " + token } });
    return (await r.json() as { title: string; currentSeq: number });
  }, renamedDocId);
  expect(afterRename.currentSeq).toBe(1);
  expect(afterRename.title).toBe("Draft, renamed");

  const editor = page.locator(".ProseMirror");
  await editor.click();
  await editor.type("First sentence here.");
  await expect(page.getByTestId("save-status")).toHaveText(/revision 2/, { timeout: 10_000 });
  await expect(page.getByTestId("word-count")).toHaveText("3 words");
  await page.getByTestId("tb-bold").click();
  await editor.type(" Bold bit.");
  await expect(page.getByTestId("save-status")).toHaveText(/revision 3/, { timeout: 10_000 });
  await expect(page.getByTestId("word-count")).toHaveText("5 words");
  await editor.type(" Second sentence here.");
  await expect(page.getByTestId("save-status")).toHaveText(/revision 4/, { timeout: 10_000 });

  // history can be collapsed and reopened
  await page.getByTestId("history-toggle").click();
  await expect(page.getByTestId("revision-list")).toBeHidden();
  await page.getByTestId("history-toggle").click();
  await expect(page.getByTestId("revision-list")).toBeVisible();

  page.once("dialog", d => d.accept());
  await page.getByTestId("restore-2").click();
  await expect(page.getByTestId("save-status")).toHaveText(/revision 5/, { timeout: 10_000 });
  await expect(editor).toHaveText("First sentence here.");

  // renaming while typing never reverts the writing: type, rename at once (autosave still pending), keep typing
  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Typed before rename.");
  await page.getByTestId("doc-title-field").fill("Draft, renamed mid-sentence");
  await page.keyboard.press("Enter");
  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Typed after rename.");
  await expect(page.getByTestId("save-status")).toHaveText(/^Saved/, { timeout: 10_000 });
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Draft, renamed mid-sentence");
  const raced = await page.evaluate(async (id) => {
    const { token } = await (await fetch("/api/token", { cache: "no-store" })).json() as { token: string };
    const r = await fetch(`http://localhost:8788/documents/${id}`, { headers: { authorization: "Bearer " + token } });
    return (await r.json() as { title: string; bodyHtml: string });
  }, renamedDocId);
  expect(raced.title).toBe("Draft, renamed mid-sentence");
  expect(raced.bodyHtml).toContain("Typed before rename.");
  expect(raced.bodyHtml).toContain("Typed after rename.");

  await page.goto("/import");
  page.once("dialog", d => d.accept());
  await page.getByTestId("import-file").setInputFiles(fixture);
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/, { timeout: 15_000 });
  await expect(page.getByTestId("doc-link")).toHaveCount(2);
  await page.getByTestId("doc-link").filter({ hasText: "Literature review" }).click();
  await expect(page.locator(".ProseMirror")).toContainText("Attachment theory matters");
  expect(await page.locator("[onerror],[onload]").count()).toBe(0);

  // A v1 document with a table, an inline image and an AI-insertion span must survive the first keystroke.
  await page.goto("/import");
  page.once("dialog", d => d.accept());
  await page.getByTestId("import-file").setInputFiles(richFixture);
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/, { timeout: 15_000 });
  await page.getByTestId("doc-link").filter({ hasText: "Results with table" }).click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]+$/);
  const docId = page.url().split("/").pop()!;
  const rich = page.locator(".ProseMirror");
  await expect(rich.locator("table")).toHaveCount(1);
  await rich.getByText("End of results.").click();
  await page.keyboard.press("End");
  await page.keyboard.type("!");
  await expect(page.getByTestId("save-status")).toHaveText(/revision 2/, { timeout: 10_000 });
  const saved = await page.evaluate(async (id) => {
    const { token } = await (await fetch("/api/token", { cache: "no-store" })).json() as { token: string };
    const r = await fetch(`http://localhost:8788/documents/${id}`, { headers: { authorization: "Bearer " + token } });
    return (await r.json() as { bodyHtml: string; currentSeq: number });
  }, docId);
  expect(saved.currentSeq).toBe(2);
  expect(saved.bodyHtml).toContain("<table");
  expect(saved.bodyHtml).toContain("Control");
  expect(saved.bodyHtml).toContain("data:image/png;base64,");
  expect(saved.bodyHtml).toMatch(/<span class="ai-ins" data-h="abc123">/);
  expect(saved.bodyHtml).toContain("End of results.!");

  await page.goto("/projects");
  await expect(page.getByTestId("project-card").first()).toBeVisible();
  const before = await page.getByTestId("project-card").count();
  await page.getByTestId("project-actions").first().click();
  await page.getByTestId("project-delete").click();
  await page.getByTestId("delete-confirm").click();
  await expect(page.getByTestId("project-card")).toHaveCount(before - 1);
});
