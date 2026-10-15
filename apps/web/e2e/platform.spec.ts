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
  if (await page.getByTestId("stage-intro-start").count()) await page.getByTestId("stage-intro-start").click();
  await page.goto("/projects");

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

  const editor = page.locator(".ProseMirror");
  await editor.click();
  await editor.type("First sentence here.");
  await expect(page.getByTestId("save-status")).toHaveText(/revision 2/, { timeout: 10_000 });
  await editor.type(" Second sentence here.");
  await expect(page.getByTestId("save-status")).toHaveText(/revision 3/, { timeout: 10_000 });

  page.once("dialog", d => d.accept());
  await page.getByTestId("restore-2").click();
  await expect(page.getByTestId("save-status")).toHaveText(/revision 4/, { timeout: 10_000 });
  await expect(editor).toHaveText("First sentence here.");

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
