import { test, expect } from "@playwright/test";
import path from "node:path";

const fixture = path.resolve(__dirname, "../../../packages/core/test/fixtures/v1-backup-small.json");

test("sign in, write with revisions, restore, import v1", async ({ page }) => {
  await page.goto("/signin");
  await page.getByTestId("e2e-email").fill(`t${Date.now()}@e2e.local`);
  await page.getByTestId("e2e-submit").click();
  await expect(page).toHaveURL(/\/projects$/);

  await page.getByTestId("project-title").fill("Sleep and memory");
  await page.getByTestId("project-create").click();
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
});
