/**
 * Phase 3A, Task 11: the researcher's vault from first setup to account erasure.
 * docs/walkthroughs/phase-3a.md is the same journey for a human on the live site; its numbered moments are this test's steps.
 *
 * Run it with the recipe in phase2-responsive.spec.ts's header (pglite Postgres for the web server, API on its in-memory store):
 *   pnpm --filter @appuscholar/web exec playwright test e2e/phase3a-vault.spec.ts
 *
 * No AI provider is involved: the vault is set up from its header pill, not from the key dialog.
 */
import { test, expect, type Page, type Response } from "@playwright/test";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { signIn } from "./support/signin";
import { recordToasts } from "./support/toasts";

const APP = "http://localhost:3000/";
const API = "http://localhost:8788";
const PASS_1 = "correct horse";
const PASS_2 = "battery staple";
const PASS_3 = "third pass";
const RECOVERY_CODE = /^[A-HJ-NP-Z2-9]{5}(-[A-HJ-NP-Z2-9]{5}){3}$/;
const SENTENCE_1 = "Procrastination delays important work.";
const SENTENCE_2 = "Students often start essays late.";
/** Typed in a second tab that still believes there is no vault. */
const SENTENCE_3 = "Deadlines feel far away.";

const WRONG = "Wrong passphrase — nothing was unlocked. Try again.";
const UNLOCK_HINT = "Type the passphrase that protects your documents.";
const DOC_LOCKED = "This document is locked. Unlock your vault to read it.";

const isDocPut = (r: Response) => r.request().method() === "PUT" && /\/documents\/[0-9a-f-]+$/.test(r.url());
type SentBody = { bodyHtml: string; keyVersion: number; wordCount?: number };

/** Answers the vault's unlock ask with `pass`. */
async function unlockWith(page: Page, pass: string) {
  await expect(page.getByTestId("pass-dialog")).toBeVisible();
  await expect(page.getByTestId("pass-message")).toHaveText(UNLOCK_HINT);
  await page.getByTestId("pass-input").fill(pass);
  await page.getByTestId("pass-ok").click();
}

/** Reloads; the vault is locked again (nothing was remembered), so the document asks for the passphrase as it opens. */
async function reloadLocked(page: Page) {
  await page.reload();
  await expect(page.getByTestId("vault-pill")).toHaveText("Vault locked");
  await expect(page.getByTestId("pass-dialog")).toBeVisible();
}

async function expectAllSentences(page: Page) {
  const editor = page.locator(".ProseMirror");
  await expect(editor).toContainText(SENTENCE_1);
  await expect(editor).toContainText(SENTENCE_2);
  await expect(editor).toContainText(SENTENCE_3);
}

// A stuck step fails in seconds with its own message instead of eating the whole test timeout.
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });

test("vault journey: setup, write, new browser context needs the passphrase, wrong passphrase, recovery, export, erase", async ({ browser, page }) => {
  test.setTimeout(300_000);
  let firstCode = "";
  let docId = "";

  await test.step("1. sign in with a new account, accept the terms, skip the welcome tour", async () => {
    await signIn(page, { prefix: "v", newAccount: true, ready: ["doc-select"] });
    await expect(page.getByTestId("vault-pill")).toHaveText("Vault off");
  });

  await test.step("2a. write two sentences: 9 words, saved in plaintext while the vault is off", async () => {
    await expect(page.getByTestId("save-status")).toHaveText("Auto-save on");
    const saved = page.waitForResponse((r) => isDocPut(r) && r.ok());
    await page.locator(".ProseMirror").click();
    await page.locator(".ProseMirror").pressSequentially(`${SENTENCE_1} ${SENTENCE_2}`);
    const sent = (await saved).request().postDataJSON() as SentBody;
    docId = /\/documents\/([0-9a-f-]+)$/.exec((await saved).url())![1]!;
    // Before the vault, the server is sent the text itself (keyVersion 0): this is what the migration has to lock away.
    expect(sent.keyVersion).toBe(0);
    expect(sent.bodyHtml).toContain(SENTENCE_1);
    await expect(page.getByTestId("word-count")).toHaveText("9 words");
    await expect(page.getByTestId("save-status")).toHaveText("Auto-save on");
  });

  // A second tab of the same browser, opened before the vault exists: it keeps believing the vault is off (moment 4's held save).
  const stale = await page.context().newPage();
  await test.step("2b. a second tab opens the same document and is left open", async () => {
    await stale.goto(APP);
    await expect(stale.locator(".ProseMirror")).toContainText(SENTENCE_2);
    await expect(stale.getByTestId("vault-pill")).toHaveText("Vault off");
  });

  await test.step("3. the Vault off pill opens the setup: passphrase twice, Remember unticked, the recovery sheet, Done; the document is migrated", async () => {
    await page.bringToFront();
    const toasts = await recordToasts(page);
    await page.getByTestId("vault-pill").click();
    await expect(page.getByTestId("vault-setup-dialog")).toBeVisible();
    await expect(page.getByTestId("vault-setup-remember")).not.toBeChecked();
    const rewrote = page.waitForResponse((r) => r.request().method() === "PUT" && new RegExp(`/documents/${docId}/revisions/\\d+/rewrite$`).test(r.url()) && r.ok());
    await page.getByTestId("vault-setup-submit").click();
    await expect(page.getByTestId("pass-message")).toContainText("only this passphrase opens them");
    await page.getByTestId("pass-input").fill(PASS_1);
    await page.getByTestId("pass-ok").click();
    await expect(page.getByTestId("pass-message")).toHaveText("Type it again");
    await page.getByTestId("pass-input").fill(PASS_1);
    await page.getByTestId("pass-ok").click();
    await expect(page.getByTestId("vault-sheet-dialog")).toBeVisible();
    await expect(page.getByTestId("vault-code")).toHaveText(RECOVERY_CODE);
    firstCode = (await page.getByTestId("vault-code").innerText()).trim();
    // The plaintext revision is rewritten in place as ciphertext.
    const rewritten = (await rewrote).request().postDataJSON() as SentBody;
    expect(rewritten.keyVersion).toBe(1);
    expect(rewritten.bodyHtml).not.toContain("Procrastination");
    expect(rewritten.bodyHtml).not.toContain("<");
    await expect.poll(toasts).toContain("All your documents are now locked in your vault ✓");
    await expect(page.getByTestId("vault-sheet-done")).toBeDisabled();
    await page.getByTestId("vault-sheet-saved").check();
    await page.getByTestId("vault-sheet-done").click();
    await expect(page.getByTestId("vault-sheet-dialog")).toBeHidden();
    await expect(page.getByTestId("vault-pill")).toHaveText("Vault on");
  });

  await test.step("4a. in the second tab, typing asks for the passphrase; Cancel holds the text: Unlock your vault to save your changes", async () => {
    await stale.bringToFront();
    const editor = stale.locator(".ProseMirror");
    await editor.click();
    await stale.keyboard.press("End");
    await editor.pressSequentially(" " + SENTENCE_3);
    // Its plaintext save is refused (a vault exists now); the tab reads the vault and asks for its passphrase before it saves.
    await expect(stale.getByTestId("pass-dialog")).toBeVisible();
    await expect(stale.getByTestId("pass-message")).toHaveText(UNLOCK_HINT);
    await expect(stale.getByTestId("vault-pill")).toHaveText("Vault locked");
    await stale.getByTestId("pass-cancel").click();
    await expect(stale.getByTestId("pass-dialog")).toBeHidden();
    await expect(stale.getByTestId("save-status")).toHaveText("Unlock your vault to save your changes.");
    await expect(editor).toContainText(SENTENCE_3);
  });

  await test.step("4b. the Vault locked pill: a wrong passphrase is refused and asked again; the right one saves the held text, encrypted", async () => {
    const toasts = await recordToasts(stale);
    await stale.getByTestId("vault-pill").click();
    const saved = stale.waitForResponse((r) => isDocPut(r) && r.ok());
    await unlockWith(stale, "wrong");
    await expect.poll(toasts).toContain(WRONG);
    await expect(stale.getByTestId("pass-dialog")).toBeVisible();
    await unlockWith(stale, PASS_1);
    await expect(stale.getByTestId("pass-dialog")).toBeHidden();
    const sent = (await saved).request().postDataJSON() as SentBody;
    expect(sent.keyVersion).toBe(1);
    expect(sent.bodyHtml).not.toContain("Deadlines");
    await expect(stale.getByTestId("save-status")).toHaveText("Auto-save on");
    await expect(stale.getByTestId("vault-pill")).toHaveText("Vault on");
    await expectAllSentences(stale);
    await stale.close();
  });

  await test.step("4c. the first tab, reloaded: the document asks as it opens; Cancel leaves it locked (never empty); the pill opens it", async () => {
    await page.bringToFront();
    await reloadLocked(page);
    await page.getByTestId("pass-cancel").click();
    await expect(page.getByTestId("doc-unreadable")).toHaveText(DOC_LOCKED);
    await expect(page.locator(".ProseMirror")).toHaveCount(0);
    await page.getByTestId("vault-pill").click();
    await unlockWith(page, PASS_1);
    await expectAllSentences(page);
    await expect(page.getByTestId("vault-pill")).toHaveText("Vault on");
  });

  await test.step("5. a new browser context with the same sign-in: the document asks for the passphrase and opens with it", async () => {
    const { cookies } = await page.context().storageState();
    // The session cookie only: nothing this browser stored (it remembers nothing anyway, Remember was unticked) goes along.
    const other = await browser.newContext({ storageState: { cookies, origins: [] } });
    try {
      const p2 = await other.newPage();
      await p2.goto(APP);
      await expect(p2.getByTestId("vault-pill")).toHaveText("Vault locked");
      await expect(p2.locator(".ProseMirror")).toHaveCount(0);
      await unlockWith(p2, PASS_1);
      await expectAllSentences(p2);
      await expect(p2.getByTestId("vault-pill")).toHaveText("Vault on");
    } finally {
      await other.close();
    }
  });

  await test.step("6. Help, Change passphrase: correct horse to battery staple; after a reload the old one is refused and the new one opens", async () => {
    await page.getByTestId("help-btn").click();
    await page.getByTestId("help-change-pass").click();
    await expect(page.getByTestId("vault-change-dialog")).toBeVisible();
    const toasts = await recordToasts(page);
    await page.getByTestId("vault-change-old").fill(PASS_1);
    await page.getByTestId("vault-change-new").fill(PASS_2);
    await page.getByTestId("vault-change-again").fill(PASS_2);
    await page.getByTestId("vault-change-submit").click();
    await expect(page.getByTestId("vault-change-dialog")).toBeHidden();
    await expect.poll(toasts).toContain("Passphrase changed ✓");
    await reloadLocked(page);
    const after = await recordToasts(page);
    await unlockWith(page, PASS_1);
    await expect.poll(after).toContain(WRONG);
    await unlockWith(page, PASS_2);
    await expectAllSentences(page);
  });

  await test.step("7a. Forgot it: the recovery sheet's code and a new passphrase open the vault and show a new sheet", async () => {
    await reloadLocked(page);
    await page.getByTestId("vault-forgot").click();
    await expect(page.getByTestId("pass-dialog")).toBeHidden();
    await expect(page.getByTestId("vault-recover-dialog")).toBeVisible();
    const toasts = await recordToasts(page);
    await page.getByTestId("recover-code").fill(firstCode);
    await expect(page.getByTestId("recover-code")).toHaveValue(firstCode);
    await page.getByTestId("recover-pass").fill(PASS_3);
    await page.getByTestId("recover-pass2").fill(PASS_3);
    await page.getByTestId("recover-submit").click();
    await expect(page.getByTestId("vault-recover-dialog")).toBeHidden();
    await expect.poll(toasts).toContain("Vault recovered ✓ — a new recovery sheet is ready");
    await expect(page.getByTestId("vault-sheet-dialog")).toBeVisible();
    await expect(page.getByTestId("vault-code")).toHaveText(RECOVERY_CODE);
    const secondCode = (await page.getByTestId("vault-code").innerText()).trim();
    expect(secondCode).not.toBe(firstCode);
    await page.getByTestId("vault-sheet-saved").check();
    await page.getByTestId("vault-sheet-done").click();
    await expect(page.getByTestId("vault-sheet-dialog")).toBeHidden();
    // The document the cancelled ask left locked opens with the vault.
    await expectAllSentences(page);
  });

  await test.step("7b. after a reload the passphrase set by the recovery opens the vault", async () => {
    await reloadLocked(page);
    await unlockWith(page, PASS_3);
    await expectAllSentences(page);
  });

  await test.step("7c. the old recovery code no longer works; the vault stays as it was", async () => {
    await reloadLocked(page);
    await page.getByTestId("vault-forgot").click();
    await expect(page.getByTestId("vault-recover-dialog")).toBeVisible();
    const refused = await recordToasts(page);
    await page.getByTestId("recover-code").fill(firstCode);
    await page.getByTestId("recover-pass").fill("fourth passphrase");
    await page.getByTestId("recover-pass2").fill("fourth passphrase");
    await page.getByTestId("recover-submit").click();
    await expect.poll(refused).toContain("That code did not match. Check the sheet and try again.");
    await expect(page.getByTestId("vault-recover-dialog")).toBeVisible();
    await page.getByTestId("recover-cancel").click();
    await expect(page.getByTestId("doc-unreadable")).toHaveText(DOC_LOCKED);
    // Nothing changed: the passphrase set by the recovery still opens the vault.
    await page.getByTestId("vault-pill").click();
    await unlockWith(page, PASS_3);
    await expectAllSentences(page);
  });

  await test.step("8. Help, Export all my work: appuscholar-export-<date>.zip with the document decrypted inside", async () => {
    await page.getByTestId("help-btn").click();
    const toasts = await recordToasts(page);
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("help-export").click()]);
    expect(download.suggestedFilename()).toMatch(/^appuscholar-export-\d{4}-\d{2}-\d{2}\.zip$/);
    await expect.poll(toasts).toContain("Export ready ✓");
    const zip = await JSZip.loadAsync(readFileSync(await download.path()));
    const pages = await Promise.all(Object.keys(zip.files).filter((n) => n.endsWith(".html")).map((n) => zip.file(n)!.async("string")));
    expect(pages.filter((h) => h.includes(SENTENCE_1) && h.includes(SENTENCE_2) && h.includes(SENTENCE_3))).toHaveLength(1);
    expect(Object.keys(zip.files)).toEqual(expect.arrayContaining(["index.json", "writing-process-record.txt"]));
    const words = await Promise.all(Object.keys(zip.files).filter((n) => n.endsWith(".doc")).map((n) => zip.file(n)!.async("string")));
    expect(words.filter((w) => w.includes(SENTENCE_3))).toHaveLength(1);
  });

  await test.step("9. Help, Delete my account: DELETE typed, the account is gone and the browser is signed out", async () => {
    // Every toast, also the one shown just before the sign-out navigates away.
    const seen: string[] = [];
    await page.exposeFunction("__onToast", (text: string) => { seen.push(text); });
    await page.evaluate(() => {
      const host = document.querySelector('[data-testid="toast-host"]')!;
      new MutationObserver(() => {
        const text = host.querySelector('[data-testid="toast"] span')?.textContent;
        if (text) void (window as unknown as { __onToast: (t: string) => Promise<void> }).__onToast(text);
      }).observe(host, { childList: true, subtree: true, characterData: true });
    });
    await page.getByTestId("help-erase").click();
    await expect(page.getByTestId("erase-dialog")).toBeVisible();
    await expect(page.getByTestId("erase-confirm")).toBeDisabled();
    await page.getByTestId("erase-word").fill("delete");
    await expect(page.getByTestId("erase-confirm")).toBeDisabled();
    await page.getByTestId("erase-word").fill("DELETE");
    const erased = page.waitForResponse((r) => r.request().method() === "DELETE" && /\/me$/.test(r.url()));
    await page.getByTestId("erase-confirm").click();
    const res = await erased;
    expect(res.status()).toBe(204);
    await expect(page).toHaveURL(/\/signin/);
    await expect.poll(() => seen).toContain("Your account has been deleted.");
    // The api token this browser held no longer opens anything: the account and its documents are gone on the server.
    const bearer = { authorization: (await res.request().allHeaders()).authorization! };
    expect((await page.request.get(`${API}/me`, { headers: bearer })).status()).toBe(401);
    expect((await page.request.get(`${API}/documents/${docId}`, { headers: bearer })).status()).toBe(401);
    // Back on /, the browser is signed out.
    await page.goto(APP);
    await expect(page).toHaveURL(/\/signin/);
  });
});

/*
 * Moment 9b, the last half of moment 9: the same address signs in again and meets a fresh account. It cannot pass on the e2e recipe: there the api
 * runs on its in-memory store while Auth.js's users table is in the web server's Postgres, so the erasure cannot delete the users row the
 * e2e provider re-uses; the same user id comes back and the api's account-erased tombstone (Task 3 ruling) answers 401. In production
 * both servers share one database: the erasure deletes the users row and the next sign-in is issued a new id. This body passes with
 * the api on the web's database (start the api with the same DATABASE_URL); enable it when the recipe shares the database.
 */
test.fixme("vault journey, 9b: after Delete my account the same address signs in to a fresh account", async ({ page }) => {
  const email = await signIn(page, { prefix: "x", newAccount: true, ready: ["doc-select"] });
  await page.locator(".ProseMirror").click();
  const saved = page.waitForResponse((r) => isDocPut(r) && r.ok());
  await page.locator(".ProseMirror").pressSequentially(SENTENCE_1);
  await saved;
  await page.getByTestId("help-btn").click();
  await page.getByTestId("help-erase").click();
  await page.getByTestId("erase-word").fill("DELETE");
  await page.getByTestId("erase-confirm").click();
  await expect(page).toHaveURL(/\/signin/);
  await signIn(page, { email });
  // A fresh account: the terms gate again, no vault, an empty first document.
  await expect(page.getByTestId("terms-dialog")).toBeVisible();
  await page.getByTestId("terms-age").check();
  await page.getByTestId("terms-agree").check();
  await page.getByTestId("terms-continue").click();
  await page.getByTestId("welcome-later").click();
  await expect(page.getByTestId("vault-pill")).toHaveText("Vault off");
  await expect(page.getByTestId("word-count")).toHaveText("0 words");
  await expect(page.locator(".ProseMirror")).not.toContainText("Procrastination");
});
