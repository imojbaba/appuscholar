/**
 * Platform e2e: sign in, land on the workspace, write, reload, import a v1 backup.
 *
 * Run it with the recipe in phase2-responsive.spec.ts's header (pglite Postgres for the web server, API on its in-memory store):
 *   pnpm --filter @appuscholar/web exec playwright test e2e/platform.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { readFileSync } from "node:fs";

const fixture = path.resolve(__dirname, "../../../packages/core/test/fixtures/v1-backup-small.json");

async function signIn(page: Page) {
  await page.goto("/signin");
  await page.getByTestId("e2e-email").fill(`t${Date.now()}${Math.random().toString(36).slice(2, 7)}@e2e.local`);
  await page.getByTestId("e2e-submit").click();
  await expect(page).toHaveURL(/localhost:3000\/$/);
  // A new account meets the terms gate, then the welcome tour.
  await page.getByTestId("terms-age").check();
  await page.getByTestId("terms-agree").check();
  await page.getByTestId("terms-continue").click();
  await page.getByTestId("welcome-later").click();
  await expect(page.getByTestId("welcome-dialog")).toBeHidden();
  await expect(page.getByTestId("doc-select")).toBeVisible();
}

test("sign in, write, reload, import a v1 backup", async ({ page }) => {
  await signIn(page);

  // The old Research Projects screen redirects to the workspace.
  await page.goto("/projects");
  await expect(page).toHaveURL(/localhost:3000\/$/);
  await expect(page.getByTestId("doc-select")).toBeVisible();

  // Write: the text is stored by autosave and is there after a reload.
  const editor = page.locator(".ProseMirror");
  await expect(page.getByTestId("save-status")).toHaveText("Auto-save on");
  await editor.click();
  const saved = page.waitForResponse((r) => r.request().method() === "PUT" && /\/documents\/[0-9a-f-]+$/.test(r.url()) && r.ok());
  await editor.type("First sentence here.");
  await saved;
  await expect(page.getByTestId("save-status")).toHaveText("Auto-save on");
  await page.reload();
  await expect(page.locator(".ProseMirror")).toContainText("First sentence here.");

  // Import a v1 backup: the Help dialog opens it, the new project opens, and its documents fill the Doc select.
  await page.getByTestId("help-btn").click();
  await page.getByTestId("help-import-v1").click();
  await expect(page.getByTestId("import-v1-dialog")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("import-file").setInputFiles(fixture);
  await expect(page.getByTestId("import-v1-dialog")).toBeHidden({ timeout: 15_000 });
  const select = page.getByTestId("doc-select");
  await expect(select.locator("option")).toHaveText(["Literature review", "Plain notes"], { timeout: 15_000 });
  await select.selectOption({ label: "Literature review" });
  await expect(page.locator(".ProseMirror")).toContainText("Attachment theory matters");
  expect(await page.locator("[onerror],[onload]").count()).toBe(0);
});

test("/import opens the backup import inside the workspace; the drop zone takes a dropped file", async ({ page }) => {
  await signIn(page);
  await page.goto("/import");
  await expect(page).toHaveURL(/localhost:3000\/\?import=1$/);
  await expect(page.getByTestId("import-v1-dialog")).toBeVisible();
  await expect(page.getByTestId("help-btn")).toBeVisible();

  page.once("dialog", (d) => d.accept());
  const dropped = await page.evaluateHandle((text) => {
    const dt = new DataTransfer();
    dt.items.add(new File([text], "backup.json", { type: "application/json" }));
    return dt;
  }, readFileSync(fixture, "utf8"));
  await page.getByTestId("import-dropzone").dispatchEvent("dragover", { dataTransfer: dropped });
  await page.getByTestId("import-dropzone").dispatchEvent("drop", { dataTransfer: dropped });
  await expect(page.getByTestId("import-v1-dialog")).toBeHidden({ timeout: 15_000 });
  await expect(page.getByTestId("doc-select").locator("option")).toHaveText(["Literature review", "Plain notes"], { timeout: 15_000 });
});
