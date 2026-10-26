/**
 * Phase 3A, Task 11: the researcher's vault from first setup to account erasure.
 * docs/walkthroughs/phase-3a.md is the same journey for a human on the live site; its numbered moments are this test's steps.
 *
 * Run it with the recipe in e2e/support/pglite-postgres.mjs's header (api and web server on the one pglite Postgres):
 *   pnpm --filter @appuscholar/web exec playwright test e2e/phase3a-vault.spec.ts
 *
 * No AI provider is involved: the vault is set up from its header pill, not from the key dialog.
 * Wave B1 (Task 5, register D-S2-40): titles are locked too. The project is saved from first run with the vault off, so its title (and its first
 * document's) goes to the server in plaintext; the vault's setup seals both, and a locked vault shows "Locked title" in the header and the
 * project list (whose six stage bars still show), never ciphertext, until the passphrase brings the names back.
 */
import { test, expect, type Page, type Request, type Response, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { signIn } from "./support/signin";
import { recordToasts } from "./support/toasts";
import { API_ORIGIN, WEB_ORIGIN } from "./support/origins";

const APP = WEB_ORIGIN + "/";
const API = API_ORIGIN;
const PASS_1 = "correct horse";
const PASS_2 = "battery staple";
const PASS_3 = "third pass";
const RECOVERY_CODE = /^[A-HJ-NP-Z2-9]{5}(-[A-HJ-NP-Z2-9]{5}){3}$/;
const SENTENCE_1 = "Procrastination delays important work.";
const SENTENCE_2 = "Students often start essays late.";
/** Typed in a second tab that still believes there is no vault. */
const SENTENCE_3 = "Deadlines feel far away.";
const PROJECT = "Procrastination study";
const TOPIC = "Why do first-year students start their essays late?";
/** A sealed title or body (lib/vault's AES-GCM output: a 16-character IV, a dot, the ciphertext, base64url). */
const CIPHERTEXT = /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/;
const LOCKED_TITLE = "Locked title";

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

  let projectId = "";
  await test.step("1. sign in with a new account, accept the terms, skip the welcome tour; first run saves the project (its title in plaintext: the vault is off); Writing opens its document", async () => {
    await signIn(page, { prefix: "v", newAccount: true, ready: ["first-run"] });
    await expect(page.getByTestId("vault-pill")).toHaveText("Vault off");
    await page.locator("#ideaTopic").fill(TOPIC);
    await page.getByTestId("idea-save-title").fill(PROJECT);
    const created = page.waitForResponse((r) => r.request().method() === "POST" && r.url() === API + "/projects" && r.ok());
    await page.getByTestId("idea-save").click();
    const body = (await created).request().postDataJSON() as { title: string; titleKeyVersion?: number };
    expect(body.title).toBe(PROJECT);
    expect(body.titleKeyVersion ?? 0).toBe(0);
    await expect(page.getByTestId("project-home")).toBeVisible();
    projectId = /\/p\/([0-9a-f-]+)$/.exec(page.url())![1]!;
    await page.getByTestId("home-open-writing").click();
    await expect(page.getByTestId("doc-select")).toBeVisible();
    await expect(page.getByTestId("project-switcher")).toContainText(PROJECT);
  });

  await test.step("2a. write two sentences: 9 words, saved in plaintext while the vault is off", async () => {
    await expect(page.getByTestId("save-status")).toHaveText("Auto-save on");
    // The save that carries the whole text (an earlier one may go out mid-typing, after the debounce).
    const saved = page.waitForResponse((r) => isDocPut(r) && r.ok() && (r.request().postData() ?? "").includes(SENTENCE_2));
    await page.locator(".ProseMirror").click();
    await page.locator(".ProseMirror").pressSequentially(`${SENTENCE_1} ${SENTENCE_2}`);
    await expect(page.getByTestId("word-count")).toHaveText("9 words");
    const res = await saved;
    const sent = res.request().postDataJSON() as SentBody;
    docId = /\/documents\/([0-9a-f-]+)$/.exec(res.url())![1]!;
    // Before the vault, the server is sent the text itself (keyVersion 0): this is what the migration has to lock away.
    expect(sent.keyVersion).toBe(0);
    expect(sent.bodyHtml).toContain(SENTENCE_1);
    expect(sent.bodyHtml).toContain(SENTENCE_2);
    await expect(page.getByTestId("save-status")).toHaveText("Auto-save on");
  });

  // A second tab of the same browser, opened before the vault exists: it keeps believing the vault is off (moment 4's held save).
  const stale = await page.context().newPage();
  await test.step("2b. a second tab opens the same document and is left open", async () => {
    // `/` opens the active project's home; its Writing row opens the document.
    await stale.goto(APP);
    await expect(stale.getByTestId("project-home")).toBeVisible();
    await stale.getByTestId("home-open-writing").click();
    await expect(stale.locator(".ProseMirror")).toContainText(SENTENCE_2);
    await expect(stale.getByTestId("vault-pill")).toHaveText("Vault off");
  });

  await test.step("3. the Vault off pill opens the setup: passphrase twice, Remember unticked, the recovery sheet, Done; the document is migrated", async () => {
    await page.bringToFront();
    const toasts = await recordToasts(page);
    await page.getByTestId("vault-pill").click();
    await expect(page.getByTestId("vault-setup-dialog")).toBeVisible();
    await expect(page.getByTestId("vault-setup-remember")).not.toBeChecked();
    // Every rewrite the migration sends, until its toast.
    const rewrites: Request[] = [];
    const onRequest = (r: Request) => { if (r.method() === "PUT" && /\/documents\/[0-9a-f-]+\/revisions\/\d+\/rewrite$/.test(r.url())) rewrites.push(r); };
    page.on("request", onRequest);
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
    await expect.poll(toasts).toContain("All your documents are now locked in your vault ✓");
    page.off("request", onRequest);
    // Every plaintext revision (the empty seed and the one with the two sentences) was rewritten in place as ciphertext.
    expect(rewrites.length).toBeGreaterThanOrEqual(2);
    for (const r of rewrites) {
      const body = r.postDataJSON() as SentBody;
      expect(body.keyVersion).toBe(1);
      expect(body.bodyHtml).not.toContain("<");
      expect(body.bodyHtml).not.toContain("Procrastination");
    }
    const bearer = { authorization: (await rewrites[0]!.allHeaders()).authorization! };
    const revisions = (await (await page.request.get(`${API}/documents/${docId}/revisions`, { headers: bearer })).json()) as { seq: number; keyVersion: number }[];
    expect(revisions.length).toBeGreaterThanOrEqual(2);
    expect(revisions.map((r) => r.keyVersion)).toEqual(revisions.map(() => 1));
    const rewrittenSeqs = rewrites.map((r) => /\/documents\/([0-9a-f-]+)\/revisions\/(\d+)\/rewrite$/.exec(r.url())!).filter((m) => m[1] === docId).map((m) => Number(m[2]));
    expect([...new Set(rewrittenSeqs)].sort((a, b) => a - b)).toEqual(revisions.map((r) => r.seq).sort((a, b) => a - b));
    await expect(page.getByTestId("vault-sheet-done")).toBeDisabled();
    await page.getByTestId("vault-sheet-saved").check();
    await page.getByTestId("vault-sheet-done").click();
    await expect(page.getByTestId("vault-sheet-dialog")).toBeHidden();
    await expect(page.getByTestId("vault-pill")).toHaveText("Vault unlocked");
    // The titles are sealed after the unlock: the project's and its document's, on the server as ciphertext with a key version; the app shows the name.
    const sealed = async () => {
      const list = (await (await page.request.get(`${API}/projects`, { headers: bearer })).json()) as Array<{ id: string; title: string; titleKeyVersion: number }>;
      const docs = (await (await page.request.get(`${API}/projects/${projectId}/documents?includeDeleted=1`, { headers: bearer })).json()) as Array<{ title: string; titleKeyVersion: number }>;
      return [list.find((x) => x.id === projectId)!, ...docs].every((x) => x.titleKeyVersion >= 1 && CIPHERTEXT.test(x.title) && !x.title.includes(PROJECT));
    };
    await expect.poll(sealed, { timeout: 20_000 }).toBe(true);
    await expect(page.getByTestId("project-switcher")).toContainText(PROJECT);
    await expect(page.getByTestId("place-home")).toHaveText(PROJECT);
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
    // O9: the verdict is inside the window too, under the field, where a student looking at the modal sees it.
    await expect(stale.getByTestId("pass-verdict")).toHaveText(WRONG);
    // O14: the eye shows what was typed (hidden by default), so a refused passphrase can be checked against the sheet.
    await expect(stale.getByTestId("pass-input")).toHaveAttribute("type", "password");
    await stale.getByTestId("pass-input").fill(PASS_1);
    await stale.getByTestId("pass-input-toggle").click();
    await expect(stale.getByTestId("pass-input")).toHaveAttribute("type", "text");
    await expect(stale.getByTestId("pass-input")).toHaveValue(PASS_1);
    await stale.getByTestId("pass-input-toggle").click();
    await expect(stale.getByTestId("pass-input")).toHaveAttribute("type", "password");
    await unlockWith(stale, PASS_1);
    await expect(stale.getByTestId("pass-dialog")).toBeHidden();
    const sent = (await saved).request().postDataJSON() as SentBody;
    expect(sent.keyVersion).toBe(1);
    expect(sent.bodyHtml).not.toContain("Deadlines");
    await expect(stale.getByTestId("save-status")).toHaveText("Auto-save on");
    await expect(stale.getByTestId("vault-pill")).toHaveText("Vault unlocked");
    await expectAllSentences(stale);
    await stale.close();
  });

  await test.step("4c. the first tab, reloaded: the document asks as it opens; Cancel leaves it locked (never empty) and every title reads Locked title; the pill opens it", async () => {
    await page.bringToFront();
    await reloadLocked(page);
    await page.getByTestId("pass-cancel").click();
    await expect(page.getByTestId("doc-unreadable")).toHaveText(DOC_LOCKED);
    await expect(page.locator(".ProseMirror")).toHaveCount(0);
    await expect(page.getByTestId("project-switcher")).toContainText(LOCKED_TITLE);
    await expect(page.getByTestId("place-home")).toHaveText(LOCKED_TITLE);
    await page.getByTestId("vault-pill").click();
    await unlockWith(page, PASS_1);
    await expectAllSentences(page);
    await expect(page.getByTestId("vault-pill")).toHaveText("Vault unlocked");
    await expect(page.getByTestId("project-switcher")).toContainText(PROJECT);
  });

  await test.step("4d. the project list with the vault locked: Locked title, the six stage bars, no ciphertext; Unlock brings the name back", async () => {
    await page.goto(WEB_ORIGIN + "/projects");
    await expect(page.getByTestId("vault-pill")).toHaveText("Vault locked");
    // The list needs nothing opened to show the states, so nothing asks; its line offers the unlock.
    await expect(page.getByTestId("list-vault-line")).toHaveText("Titles are locked. Enter your passphrase to see them.");
    const row = page.getByTestId("project-row");
    await expect(row).toHaveCount(1);
    await expect(row.getByTestId("project-row-title")).toHaveText(LOCKED_TITLE);
    await expect(row.getByTestId("stage-bar")).toHaveCount(6);
    // Idea has the first run's topic; Writing has the three sentences.
    expect(await row.getByTestId("stage-bar").evaluateAll((els) => els.map((e) => e.getAttribute("data-state")))).toEqual(["in-progress", "not-started", "not-started", "not-started", "in-progress", "not-started"]);
    const text = await page.getByTestId("project-list").innerText();
    expect(text).not.toMatch(/[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{8,}/);
    expect(text).not.toContain(PROJECT);
    await page.getByTestId("list-unlock").click();
    await unlockWith(page, PASS_1);
    await expect(row.getByTestId("project-row-title")).toHaveText(PROJECT);
    await expect(page.getByTestId("list-vault-line")).toHaveText("Unlocked. Titles are locked to you.");
    // Back to the document through the row and the home.
    await row.getByTestId("project-open").click();
    await page.getByTestId("home-open-writing").click();
    await expectAllSentences(page);
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
      // `/` opens the active project's home, which loads the document: the passphrase is asked there.
      await unlockWith(p2, PASS_1);
      await expect(p2.getByTestId("project-home")).toBeVisible();
      await expect(p2.getByTestId("project-switcher")).toContainText(PROJECT);
      await p2.getByTestId("home-open-writing").click();
      await expectAllSentences(p2);
      await expect(p2.getByTestId("vault-pill")).toHaveText("Vault unlocked");
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
    // The recovery opened the vault, and with it the document the unlock ask (left by the Forgot link) had kept closed.
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
    await expect(page.getByTestId("recover-verdict")).toHaveText("That code did not match. Check the sheet and try again."); // O9: inline too
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
 * Moment 9b, the last half of moment 9: the same address signs in again and meets a fresh account. The api and the web server run on the
 * one DATABASE_URL (recipe in e2e/support/pglite-postgres.mjs), as in production: the erasure deletes the users row Auth.js made, so the
 * next sign-in is issued a new id (the account-erased tombstone, Task 3 ruling, answers 401 only to the old id's token).
 */
test("vault journey, 9b: after Delete my account the same address signs in to a fresh account", async ({ page }) => {
  const email = await signIn(page, { prefix: "x", newAccount: true, ready: ["first-run"] });
  // Writing without a project: the scratch space, from the project list.
  await page.goto("/projects");
  await page.getByTestId("scratch-space").click();
  await expect(page.getByTestId("doc-select")).toBeVisible();
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
  // No project: first run; the scratch space holds an empty first document.
  await expect(page.getByTestId("first-run")).toBeVisible();
  await page.goto("/projects");
  await expect(page.getByTestId("projects-empty")).toBeVisible();
  await page.getByTestId("scratch-space").click();
  await expect(page.getByTestId("word-count")).toHaveText("0 words");
  await expect(page.locator(".ProseMirror")).not.toContainText("Procrastination");
});

// ---- First run (2026-10-26): a new student can never get stuck at the passphrase ----------------------------------------------------------------------------

const EN = JSON.parse(readFileSync(path.join(__dirname, "../messages/en.json"), "utf8")) as Record<string, string>;
/** t() as lib/i18n.tsx's tFormat does it: the English sentence with its {vars} filled in. */
function T(key: string, vars?: Record<string, string | number>): string {
  const raw = EN[key];
  if (raw === undefined) throw new Error("no such key in en.json: " + key);
  return vars ? raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : raw;
}
/** The first-run passphrase: long enough (10 characters or more). A test value only. */
const FIRST_PASS = "first run passphrase";

/** Counts every passphrase window the page opens, from the next load on (window.__asks), so a quick ask and cancel is never missed. */
async function countAsks(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __asks: number };
    w.__asks = 0;
    const watch = () => new MutationObserver((records) => {
      for (const r of records) for (const n of r.addedNodes) if (n instanceof Element && (n.matches('[data-testid="pass-dialog"]') || n.querySelector('[data-testid="pass-dialog"]'))) w.__asks++;
    }).observe(document.body, { childList: true, subtree: true });
    if (document.body) watch(); else document.addEventListener("DOMContentLoaded", watch);
  });
}
const asks = (page: Page) => page.evaluate(() => (window as unknown as { __asks: number }).__asks);

/** The terms, then "Set up my key" on the welcome: the key window, as a new student meets it. */
async function toKeyWindow(page: Page) {
  await signIn(page, { prefix: "fr" });
  await page.getByTestId("terms-age").check();
  await page.getByTestId("terms-agree").check();
  await page.getByTestId("terms-continue").click();
  await page.getByTestId("welcome-setup").click();
  await expect(page.getByTestId("provider-dialog")).toBeVisible();
}

test("first run: the key is saved without a vault; the setup says its rule and every refusal inside its window; the sheet says what Done needs; one ask per unlock; the home shows it is opening", async ({ page }) => {
  test.setTimeout(240_000);
  await countAsks(page);
  let projectId = "";

  await test.step("1. the key window starts at Remember on this computer, says the key can be locked later, and Save does not open the vault setup", async () => {
    await toKeyWindow(page);
    await expect(page.getByTestId("key-mode-plain")).toBeChecked();
    await expect(page.getByTestId("key-mode-later")).toHaveText(T("settings_keymode_later"));
    await page.getByTestId("prov-select").selectOption("groq");
    await page.getByTestId("key-input").fill("gsk_test");
    await page.getByTestId("key-save").click();
    await expect(page.getByTestId("provider-dialog")).toBeHidden();
    await expect(page.getByTestId("vault-setup-dialog")).toBeHidden();
    await expect(page.getByTestId("pass-dialog")).toBeHidden();
    await expect(page.getByTestId("vault-pill")).toHaveText(T("vault_pill_off"));
    await expect(page.getByTestId("first-run")).toBeVisible();
    await page.locator("#ideaTopic").fill(TOPIC);
    await page.getByTestId("idea-save").click();
    await expect(page.getByTestId("project-home")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("home-stages")).toBeVisible();
    projectId = /\/p\/([0-9a-f-]+)$/.exec(page.url())![1]!;
  });

  await test.step("2. the setup: the rule before typing; too short and two entries apart are said inside the window, under the field, and asked again there", async () => {
    await page.getByTestId("vault-pill").click();
    await expect(page.getByTestId("vault-setup-dialog")).toBeVisible();
    await expect(page.getByTestId("vault-setup-remember")).not.toBeChecked();
    await page.getByTestId("vault-setup-submit").click();
    await expect(page.getByTestId("pass-message")).toHaveText(T("vault_setup_intro"));
    await expect(page.getByTestId("pass-rule")).toHaveText(T("vault_pass_rule", { n: 10 }));
    await page.getByTestId("pass-input").fill("short");
    await page.getByTestId("pass-ok").click();
    await expect(page.getByTestId("pass-verdict")).toHaveText(T("vault_err_short", { n: 10 }));
    await expect(page.getByTestId("pass-message")).toHaveText(T("vault_setup_intro"));
    await expect(page.getByTestId("vault-setup-dialog")).toBeHidden();
    await page.getByTestId("pass-input").fill(FIRST_PASS);
    await page.getByTestId("pass-ok").click();
    await expect(page.getByTestId("pass-message")).toHaveText(T("bk_pass2"));
    await expect(page.getByTestId("pass-verdict")).toBeHidden();
    await page.getByTestId("pass-input").fill(FIRST_PASS + " typo");
    await page.getByTestId("pass-ok").click();
    await expect(page.getByTestId("pass-verdict")).toHaveText(T("vault_err_match"));
    await expect(page.getByTestId("pass-message")).toHaveText(T("vault_setup_intro"));
    await expect(page.getByTestId("vault-setup-dialog")).toBeHidden();
  });

  await test.step("3. a setup that fails (no network) is said inside the confirm window; OK there tries again and the recovery sheet comes", async () => {
    await page.getByTestId("pass-input").fill(FIRST_PASS);
    await page.getByTestId("pass-ok").click();
    await expect(page.getByTestId("pass-message")).toHaveText(T("bk_pass2"));
    const refuse = (route: Route) => (route.request().method() === "PUT" ? route.abort("internetdisconnected") : route.fallback());
    await page.route(API + "/me/vault", refuse);
    await page.getByTestId("pass-input").fill(FIRST_PASS);
    await page.getByTestId("pass-ok").click();
    await expect(page.getByTestId("pass-verdict")).toHaveText(T("vault_setup_fail"));
    await expect(page.getByTestId("pass-message")).toHaveText(T("bk_pass2"));
    await expect(page.getByTestId("vault-sheet-dialog")).toBeHidden();
    await page.unroute(API + "/me/vault", refuse);
    await page.getByTestId("pass-ok").click();
    await expect(page.getByTestId("vault-sheet-dialog")).toBeVisible();
    await expect(page.getByTestId("vault-code")).toHaveText(RECOVERY_CODE);
  });

  await test.step("4. the recovery sheet: Done waits for the tick and the line beside it says so; ticked, Done closes it", async () => {
    await expect(page.getByTestId("vault-sheet-done")).toBeDisabled();
    await expect(page.getByTestId("vault-sheet-hint")).toHaveText(T("vault_sheet_hint"));
    await page.getByTestId("vault-sheet-saved").check();
    await expect(page.getByTestId("vault-sheet-hint")).toBeHidden();
    await page.getByTestId("vault-sheet-done").click();
    await expect(page.getByTestId("vault-sheet-dialog")).toBeHidden();
    // The project's saved work is sealed by the one-off migration before the vault reads unlocked.
    await expect(page.getByTestId("vault-pill")).toHaveText(T("vault_pill_yours"), { timeout: 30_000 });
  });

  await test.step("5. a locked vault asks once as a page opens; after Cancel it asks no more, there or in the next place the student opens", async () => {
    // Literature opened with the vault locked: the document and the place's saved work all wait on one ask.
    await page.goto(`/p/${projectId}/lit`);
    await expect(page.getByTestId("vault-pill")).toHaveText(T("vault_pill_locked"));
    await expect(page.getByTestId("pass-dialog")).toBeVisible();
    await page.getByTestId("pass-cancel").click();
    await expect(page.getByTestId("pass-dialog")).toBeHidden();
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(2_000);
    expect(await asks(page), "passphrase windows as Literature opened").toBe(1);
    // The project's home reads its own saved work: it says the project is locked, and asks nothing.
    await page.getByTestId("place-home").click();
    await expect(page.getByTestId("home-locked")).toBeVisible();
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(2_000);
    expect(await asks(page), "passphrase windows after the Cancel").toBe(1);
    await expect(page.getByTestId("pass-dialog")).toBeHidden();
  });

  await test.step("6. the pill asks again (the student's own press); after the right passphrase the home says it is opening at once, never that the project is locked", async () => {
    // Every read of the project's saved work takes 2 s from here (a slow network), so the opening state has time to be seen.
    const slow = async (route: Route) => { if (route.request().method() === "GET") await new Promise((r) => setTimeout(r, 2_000)); await route.fallback(); };
    await page.route(/\/projects\/[^/]+\/blobs\//, slow);
    await page.getByTestId("vault-pill").click();
    await expect(page.getByTestId("pass-dialog")).toBeVisible();
    expect(await asks(page)).toBe(2);
    await page.getByTestId("pass-input").fill(FIRST_PASS);
    await page.getByTestId("pass-ok").click();
    await expect(page.getByTestId("vault-pill")).toHaveText(T("vault_pill_yours"));
    await expect(page.getByTestId("home-locked")).toBeHidden({ timeout: 1_000 });
    await expect(page.getByTestId("home-loading").or(page.getByTestId("home-stages")).first()).toBeVisible({ timeout: 1_000 });
    await expect(page.getByTestId("home-stages")).toBeVisible({ timeout: 30_000 });
    await page.unroute(/\/projects\/[^/]+\/blobs\//, slow);
    expect(await asks(page), "no further ask after the unlock").toBe(2);
  });
});

test.describe("first run on a phone (375 px)", () => {
  test.use({ viewport: { width: 375, height: 740 }, hasTouch: true, isMobile: true });

  /** The element's box inside the 375 px window, and at least 44 px tall. */
  async function fitsAndTall(page: Page, testId: string, row = false) {
    const el = row ? page.getByTestId(testId).locator("xpath=ancestor::label[1]") : page.getByTestId(testId);
    const box = (await el.boundingBox())!;
    expect(box, testId).not.toBeNull();
    expect(box.x, testId + " left edge").toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, testId + " right edge").toBeLessThanOrEqual(375 + 0.5);
    expect(box.height, testId + " height").toBeGreaterThanOrEqual(44 - 0.5);
  }
  const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

  test("the terms and the key window fit the screen, every tick row and choice is 44 px tall, and the keyboard can scroll the terms", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, { prefix: "frt" });
    await expect(page.getByTestId("terms-dialog")).toBeVisible();
    // Q6: the terms text takes focus, and a key scrolls it.
    const body = page.getByTestId("terms-body");
    await body.focus();
    await expect(body).toBeFocused();
    const before = await body.evaluate((el) => el.scrollTop);
    await page.keyboard.press("PageDown");
    await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(before);
    // Q7: the two tick rows.
    await fitsAndTall(page, "terms-age", true);
    await fitsAndTall(page, "terms-agree", true);
    expect(await noSidewaysScroll(page)).toBe(true);
    await page.getByTestId("terms-age").check();
    await page.getByTestId("terms-agree").check();
    await page.getByTestId("terms-continue").click();
    await page.getByTestId("welcome-setup").click();
    await expect(page.getByTestId("provider-dialog")).toBeVisible();
    // Q8: the three key modes, the two option ticks and the ORCID link.
    for (const id of ["key-mode-pass", "key-mode-plain", "key-mode-session", "ai-fallback", "ai-log"]) {
      await page.getByTestId(id).scrollIntoViewIfNeeded();
      await fitsAndTall(page, id, true);
    }
    const orcid = page.getByTestId("provider-dialog").getByRole("link", { name: T("settings_orcid_link") });
    await orcid.scrollIntoViewIfNeeded();
    expect((await orcid.boundingBox())!.height).toBeGreaterThanOrEqual(44 - 0.5);
    expect(await noSidewaysScroll(page)).toBe(true);
  });

  test("the vault setup and the recovery sheet fit the screen, their tick rows are 44 px tall, the eye leaves room, and the sheet says what Done needs", async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, { prefix: "frp", newAccount: true, ready: ["first-run"] });
    await page.getByTestId("vault-pill").click();
    await expect(page.getByTestId("vault-setup-dialog")).toBeVisible();
    await fitsAndTall(page, "vault-setup-remember", true);
    expect(await noSidewaysScroll(page)).toBe(true);
    await page.getByTestId("vault-setup-submit").click();
    await expect(page.getByTestId("pass-rule")).toHaveText(T("vault_pass_rule", { n: 10 }));
    // The eye keeps its 44 px: the field's text stops before it (Q5).
    const padding = await page.getByTestId("pass-input").evaluate((el) => parseFloat(getComputedStyle(el).paddingRight));
    expect(padding).toBeGreaterThanOrEqual(44);
    await page.getByTestId("pass-input").fill("short");
    await page.getByTestId("pass-ok").click();
    await expect(page.getByTestId("pass-verdict")).toHaveText(T("vault_err_short", { n: 10 }));
    await expect(page.getByTestId("pass-verdict")).toBeInViewport();
    await page.getByTestId("pass-input").fill(FIRST_PASS);
    await page.getByTestId("pass-ok").click();
    await expect(page.getByTestId("pass-message")).toHaveText(T("bk_pass2"));
    await page.getByTestId("pass-input").fill(FIRST_PASS);
    await page.getByTestId("pass-ok").click();
    await expect(page.getByTestId("vault-sheet-dialog")).toBeVisible();
    await fitsAndTall(page, "vault-sheet-saved", true);
    await expect(page.getByTestId("vault-sheet-hint")).toHaveText(T("vault_sheet_hint"));
    await expect(page.getByTestId("vault-sheet-hint")).toBeInViewport();
    await expect(page.getByTestId("vault-sheet-done")).toBeDisabled();
    expect(await noSidewaysScroll(page)).toBe(true);
    // A thumb on the tick row's words (not the 13 px box) ticks it.
    await page.getByTestId("vault-sheet-saved").locator("xpath=ancestor::label[1]").getByText(T("vault_sheet_saved")).tap();
    await expect(page.getByTestId("vault-sheet-saved")).toBeChecked();
    await expect(page.getByTestId("vault-sheet-hint")).toBeHidden();
    await page.getByTestId("vault-sheet-done").tap();
    await expect(page.getByTestId("vault-sheet-dialog")).toBeHidden();
    await expect(page.getByTestId("vault-pill")).toHaveText(T("vault_pill_yours"), { timeout: 30_000 });
  });
});
