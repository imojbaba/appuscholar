import { expect, type Page } from "@playwright/test";

/** Study types as the new-study form offers them (start-a-study spec). */
export type StudyTypeId = "ug" | "masters" | "phd" | "course" | "article" | "other";

/** Waits for the next save of the open study's idea_intake (Shape your study saves as it is typed, after a short debounce). */
export const ideaSaved = (page: Page) => page.waitForResponse((r) => r.request().method() === "PUT" && /\/blobs\/idea_intake$/.test(r.url()) && r.ok(), { timeout: 20_000 });

/**
 * Starts a new study from a signed-in page (Start a new study: name, type, field) and lands on Shape your study's first part; then writes the question and
 * what the student has when given, and, unless `stay`, goes to the study's home with Finish later. Returns the study's id.
 */
export async function makeStudy(page: Page, o: { name?: string; type?: StudyTypeId; question?: string; have?: string; stay?: boolean } = {}): Promise<string> {
  // In the app, as a student does: the dashboard's Start a new study (a page load would lock an open vault and ask for the passphrase again).
  if (!(await page.getByTestId("new-project").isVisible())) {
    await page.getByTestId("wordmark").click();
    await expect(page.getByTestId("project-list")).toBeVisible();
  }
  await page.getByTestId("new-project").click();
  await expect(page.getByTestId("new-study")).toBeVisible();
  await page.getByTestId("new-name").fill(o.name ?? "Bedtime and exam anxiety");
  await page.getByTestId("new-type-" + (o.type ?? "masters")).check();
  await page.getByTestId("new-create").click();
  await expect(page.getByTestId("shape-part")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("shape-title")).toBeVisible();
  const id = /\/p\/([^/?#]+)\/idea/.exec(page.url())?.[1];
  if (!id) throw new Error("no study id in " + page.url());
  if (o.question) {
    const saved = ideaSaved(page);
    await page.getByTestId("shape-answer").fill(o.question);
    await saved;
  }
  if (o.have) {
    await page.getByTestId("shape-dot-have").click();
    await expect(page.getByTestId("shape-part")).toHaveAttribute("data-part", "have");
    const saved = ideaSaved(page);
    await page.getByTestId("shape-answer").fill(o.have);
    await saved;
  }
  if (!o.stay) {
    await page.getByTestId("shape-later").click();
    await expect(page.getByTestId("project-home")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("home-stages")).toBeVisible();
  }
  return id;
}
