import { randomUUID } from "node:crypto";
import type { Page, Response } from "@playwright/test";
import { MARK } from "../fixtures/common";
import { shelfPdfs } from "../fixtures/pdfs";
import { PROGRESS_MS } from "../support/budgets";
import { dictionary, T, type Lang } from "../support/dict";
import { QA_API_ORIGIN } from "../support/origins";
import { serverRows } from "../support/server";
import {
  answerPassphrase, apiGet, catchDownload, docText, forgetOnThisComputer, goOffline, goOnline, lockByReload, newStudent, OFFLINE_CONSOLE, openUnlockWindow, recordToasts,
  sameAccountElsewhere, slowApi, toPlace, typeInDoc, unlock, vaultRemembered, type Student
} from "../support/student";
import { expect, notChecked, test } from "../support/test";

/**
 * S10, "I keep my work private and safe" (docs/walkthroughs/phase-3a.md rows 1 to 8; apps/web/e2e/phase3a-vault.spec.ts walks the same rows).
 *
 * Seven cases: the vault from its set-up to its recovery (S10-01, the story's plain run), the pill after the network returns (S10-02, F2), Remember after Forget on this
 * computer (S10-03, O23), the passphrase asked once (S10-04, O18), a slow network (S10-05), a phone in Hindi (S10-06) and what the server holds (S10-07).
 * The sheet's passphrases are for people; every case makes its own (newStudent's generated one, or `fresh()` below). Row 9 (Delete my account) is S9's.
 *
 * The words come from the dictionaries (dict.ts). Where the sheet and the app differ, the app's dictionary is what is asserted, and the report says so: the sheet's pill "Vault on"
 * is the app's `vault_pill_yours`, "Vault unlocked" (the dictionary's `vault_pill_on` is not shown anywhere).
 */
const SHEET = "phase-3a.md";
const E2E = "e2e/phase3a-vault.spec.ts";
/**
 * The folders a fix for these cases starts in: the vault and its windows; plus, for a fault, where it sits: Q1 the header (AppHeader.tsx), Q2 the project's home (ProjectHome.tsx),
 * Q3 and Q4 the windows' tick rows (the dialogs folder), Q5 the passphrase field (ui/secret-input.tsx, and the `.input` rule in app/globals.css that outranks its `pr-11`).
 */
const CODE = ["apps/web/lib/vault", "apps/web/components/workspace/dialogs", "apps/web/components/workspace/VaultPill.tsx"];
const CODE_FIELD = ["apps/web/components/ui/secret-input.tsx", "apps/web/app/globals.css"];

const RECOVERY_CODE = /^[A-HJ-NP-Z2-9]{5}(-[A-HJ-NP-Z2-9]{5}){3}$/;
/** A sealed title or body (lib/vault's AES-GCM output: a 16-character IV, a dot, the ciphertext, base64url). */
const CIPHERTEXT = /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/;
/** The scratch space's own title: the api writes it as a constant, in clear, with key version 0 (wave-b1.md row 7). */
const SCRATCH_TITLE = "Scratch space";

const SENTENCE_1 = "Procrastination delays important work.";
const SENTENCE_2 = "Students often start essays late.";
/** Typed in a second tab that still believes there is no vault. */
const SENTENCE_3 = "Deadlines feel far away.";
const PROJECT = { name: "Procrastination study", idea: "Why do first-year students start their essays late?" };

/** A passphrase for a step that changes it (newStudent makes the first). At least 10 characters, as the vault asks. */
const fresh = () => `qa-pass-${randomUUID().replace(/-/g, "").slice(0, 12)}`;

const pill = (page: Page) => page.getByTestId("vault-pill");
const isDocPut = (r: Response) => r.request().method() === "PUT" && /\/documents\/[0-9a-f-]+$/.test(r.url());

/** The open document has all three sentences of the walk. */
async function expectAllSentences(page: Page): Promise<void> {
  const text = await docText(page);
  for (const sentence of [SENTENCE_1, SENTENCE_2, SENTENCE_3]) expect(text).toContain(sentence);
}

/**
 * Each passphrase field keeps room at its right edge for its eye: the field's computed padding-right is at least the eye button's width (components/ui/secret-input.tsx reserves it with
 * `pr-11`; the `.input` rule in app/globals.css, outside any layer, outranks it, so today the padding is 10 px and the eye lies over what is typed: Q5). The eye's test id is the field's and "-toggle".
 */
async function expectEyeRoom(page: Page, fields: string[]): Promise<void> {
  const rooms = await page.evaluate(
    (ids) =>
      ids.map((id) => {
        const input = document.querySelector(`[data-testid="${id}"]`);
        const eye = document.querySelector(`[data-testid="${id}-toggle"]`);
        return { id, padding: input ? parseFloat(getComputedStyle(input).paddingRight) : NaN, eye: eye ? eye.getBoundingClientRect().width : NaN };
      }),
    fields
  );
  const missing = rooms.filter((r) => Number.isNaN(r.padding) || Number.isNaN(r.eye)).map((r) => r.id);
  expect(missing, "passphrase fields (or their eyes) not on the screen").toEqual([]);
  expect(rooms.filter((r) => r.padding < r.eye).map((r) => `${r.id}: padding-right ${r.padding} px, eye ${r.eye} px wide`), "fields whose padding is narrower than their eye").toEqual([]);
}
const EYE_SOURCE = "components/ui/secret-input.tsx (the field keeps 44 px for its eye: pr-11); spec section 8, layout rules (no two controls on top of each other)";

/** The saved versions of a document as the server lists them, each read whole. */
async function revisionsOf(page: Page, docId: string): Promise<Array<{ seq: number; keyVersion: number; bodyHtml: string }>> {
  const list = await apiGet<Array<{ seq: number; keyVersion: number }>>(page, `/documents/${docId}/revisions`);
  return Promise.all(list.map(async (r) => apiGet<{ seq: number; keyVersion: number; bodyHtml: string }>(page, `/documents/${docId}/revisions/${r.seq}`)));
}

// ---- S10-01 -----------------------------------------------------------------------------------------------------------------------------------------------

test("S10-01 I set up my vault, and my words stay mine in a second tab, a fresh browser, a changed passphrase and a recovery", { tag: ["@slice"] }, async ({ page, context, browser, qa }) => {
  qa.begin({
    story: "S10",
    id: "S10-01",
    goal: "I lock my work in a vault, and it stays readable to me only: in a second tab, after a reload, in a fresh browser, after I change the passphrase and after I recover with my sheet; and I can take it out",
    situation: { vault: "open", network: "fine", screen: "desktop", lang: "en", data: "realistic" },
    steps: [
      "sign in and write two sentences", "open a second tab", "set up the vault", "type in the second tab while it is locked", "wrong passphrase, then the right one", "reload locked",
      "open a fresh browser", "a fresh browser", "change the passphrase", "recover with the sheet", "export all my work"
    ],
    code: [...CODE, ...CODE_FIELD, "apps/web/components/frame/AppHeader.tsx"]
  });
  let s!: Student;
  let docId = "";
  // The second tab is opened before the vault exists: it keeps believing there is none (the sheet's row 2b and 4a).
  const stale = await context.newPage();
  // The 409s the second tab is answered for its refused plaintext save: what the case excuses below must be these and no others.
  const refusedForStale: string[] = [];
  stale.on("response", (r) => {
    if (r.request().method() === "PUT" && r.status() === 409 && /\/documents\/[0-9a-f-]+$/.test(r.url())) refusedForStale.push(r.url());
  });

  await qa.step("sign in and write two sentences", async () => {
    s = await newStudent(page, qa, { key: "none", project: PROJECT });
    await qa.check("data", "a new account's pill reads Vault off", async () => {
      await expect(pill(page)).toHaveText(T("vault_pill_off"));
    }, { source: `${SHEET} row 1` });
    await toPlace(page, s.projectId!, "writing");
    await qa.check("data", "Writing opens an empty document: 0 words, and the badge says Auto-save on", async () => {
      await expect(page.getByTestId("word-count")).toHaveText("0 words");
      await expect(page.getByTestId("save-status")).toHaveText(T("autosave_on"));
    }, { source: `${SHEET} row 1 ("an empty document") and row 2a` });
    // The save that carries both sentences (an earlier one may go out mid-typing, after the debounce).
    const saved = page.waitForResponse((r) => isDocPut(r) && r.ok() && (r.request().postData() ?? "").includes(SENTENCE_2), { timeout: 30_000 });
    saved.catch(() => undefined);
    await typeInDoc(page, `${SENTENCE_1} ${SENTENCE_2}`);
    await qa.check("data", "the word count under the document says 9 words, and the badge says Auto-save on", async () => {
      await expect(page.getByTestId("word-count")).toHaveText("9 words");
      await expect(page.getByTestId("save-status")).toHaveText(T("autosave_on"));
    }, { source: `${SHEET} row 2a` });
    const response = await saved;
    docId = /\/documents\/([0-9a-f-]+)$/.exec(response.url())![1]!;
    await qa.check("data", "before the vault, the server is sent the text itself (key version 0): this is what the set-up has to lock away", async () => {
      const sent = response.request().postDataJSON() as { bodyHtml: string; keyVersion: number };
      expect(sent.keyVersion).toBe(0);
      expect(sent.bodyHtml).toContain(SENTENCE_1);
    }, { source: `${E2E} step 2a` });
  });

  await qa.step("open a second tab", async () => {
    // `/` opens the active project's home; its Writing row opens the document.
    await stale.goto("/");
    await expect(stale.getByTestId("project-home")).toBeVisible();
    await stale.getByTestId("home-open-writing").click();
    await qa.check("data", "the second tab shows the same two sentences, and its pill reads Vault off", async () => {
      await expect(stale.locator(".ProseMirror")).toContainText(SENTENCE_2);
      expect(await docText(stale)).toContain(SENTENCE_1);
      await expect(pill(stale)).toHaveText(T("vault_pill_off"));
    }, { source: `${SHEET} row 2b` });
  }, { page: stale });

  await qa.step("set up the vault", async () => {
    await page.bringToFront();
    s.passphrase = fresh();
    const toasts = await recordToasts(page);
    await pill(page).click();
    await expect(page.getByTestId("vault-setup-dialog")).toBeVisible();
    await qa.check("data", "Remember on this computer starts unticked", async () => {
      await expect(page.getByTestId("vault-setup-remember")).not.toBeChecked();
    }, { source: `${SHEET} row 3` });
    await page.getByTestId("vault-setup-submit").click();
    await expect(page.getByTestId("pass-message")).toHaveText(T("vault_setup_intro"));
    await answerPassphrase(page, s.passphrase!);
    await expect(page.getByTestId("pass-message")).toHaveText(T("bk_pass2"));
    await answerPassphrase(page, s.passphrase!);
    await expect(page.getByTestId("vault-sheet-dialog")).toBeVisible();
    s.recoveryCode = (await page.getByTestId("vault-code").innerText()).trim();
    await qa.check("data", "the recovery sheet shows a code of four groups of five (XXXXX-XXXXX-XXXXX-XXXXX)", async () => {
      expect(s.recoveryCode).toMatch(RECOVERY_CODE);
    }, { source: `${SHEET} row 3` });
    await qa.check("data", "Done stays disabled until \"I have saved it\" is ticked", async () => {
      await expect(page.getByTestId("vault-sheet-done")).toBeDisabled();
    }, { source: `${SHEET} row 3` });
    await page.getByTestId("vault-sheet-saved").check();
    await qa.check("data", "ticking \"I have saved it\" enables Done", async () => {
      await expect(page.getByTestId("vault-sheet-done")).toBeEnabled();
    }, { source: `${SHEET} row 3` });
    await qa.checkpoint("the recovery sheet");
    await page.getByTestId("vault-sheet-done").click();
    await expect(page.getByTestId("vault-sheet-dialog")).toBeHidden();
    await qa.check("data", "the toast says all the documents are locked in the vault, and the pill reads Vault unlocked", async () => {
      await expect.poll(toasts).toContain(T("vault_migrated"));
      await expect(pill(page)).toHaveText(T("vault_pill_yours"));
      await expect(pill(page)).toHaveAttribute("data-status", "unlocked");
    }, { source: `${SHEET} row 3 (the sheet says "Vault on"; the app's pill for an open vault is "Vault unlocked", as ${E2E} asserts)` });
    await qa.check("data", "every saved version of the document is now sealed on the server: key version 1, no tag and none of the words", async () => {
      const revisions = await revisionsOf(page, docId);
      // Every save keeps a version (phase-3a.md, "Not yet in this phase": thinning old versions is not built; the api's PUT /documents/:id always appends one), and this case saw its saves answered ok:
      // a document with no saved version is lost work, so an empty list is a failure here, not a check that measured nothing.
      expect(revisions.length, "saved versions the server lists for the document").toBeGreaterThan(0);
      for (const r of revisions) {
        expect(r.keyVersion, `version ${r.seq}`).toBe(1);
        expect(r.bodyHtml, `version ${r.seq}`).toMatch(CIPHERTEXT);
        expect(r.bodyHtml).not.toContain("Procrastination");
      }
    }, { source: `${E2E} step 3` });
  });

  await qa.step("type in the second tab while it is locked", async () => {
    // The tab still believes there is no vault and sends the text as it is; the api refuses a plaintext write once a vault exists (409 vault-required), and the tab
    // reads the vault and asks for its passphrase before it saves.
    qa.allow({
      responses: [{ method: "PUT", path: /^\/documents\/[0-9a-f-]+$/, status: 409, reason: "the second tab was opened before the vault: its plaintext save is refused (apps/api docWrite.ts, vault-required), and it then asks for the passphrase" }]
    });
    await stale.bringToFront();
    await typeInDoc(stale, " " + SENTENCE_3);
    await qa.check("data", "typing in a tab that was opened before the vault asks for the passphrase, and its pill reads Vault locked", async () => {
      await expect(stale.getByTestId("pass-dialog")).toBeVisible();
      await expect(stale.getByTestId("pass-message")).toHaveText(T("vault_unlock_hint"));
      await expect(pill(stale)).toHaveText(T("vault_pill_locked"));
    }, { source: `${SHEET} row 4a` });
    await qa.check("visual", "the passphrase field keeps room for its eye, so a long passphrase does not run under it", () => expectEyeRoom(stale, ["pass-input"]), { source: EYE_SOURCE, known: "Q5" });
    await qa.checkpoint("the second tab asks for the passphrase");
    await stale.getByTestId("pass-cancel").click();
    await expect(stale.getByTestId("pass-dialog")).toBeHidden();
    await qa.check("data", "after Cancel the badge says Unlock your vault to save your changes, and the new sentence stays in the document", async () => {
      await expect(stale.getByTestId("save-status")).toHaveText(T("vault_save_locked"));
      expect(await docText(stale)).toContain(SENTENCE_3);
    }, { source: `${SHEET} row 4a` });
    await qa.check("visual", "the badge is amber (the design's flag colour), not the green of Auto-save on", async () => {
      const colours = await stale.getByTestId("save-status").evaluate((badge) => {
        const probe = document.createElement("span");
        probe.style.backgroundColor = "var(--flag-bg)";
        document.body.appendChild(probe);
        const flag = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return { badge: getComputedStyle(badge).backgroundColor, flag };
      });
      expect(colours.flag, "the design's --flag-bg colour could not be read").not.toBe("rgba(0, 0, 0, 0)");
      expect(colours.badge).toBe(colours.flag);
    }, { source: `${SHEET} row 4a ("the badge above the document turns amber"); DESIGN-SYSTEM.md: amber flags what needs attention` });
    await qa.checkpoint("the second tab, locked, with its sentence kept");
  }, { page: stale });

  await qa.step("wrong passphrase, then the right one", async () => {
    const toasts = await recordToasts(stale);
    await openUnlockWindow(stale);
    const saved = stale.waitForResponse((r) => isDocPut(r) && r.ok(), { timeout: 30_000 });
    saved.catch(() => undefined);
    await answerPassphrase(stale, s.passphrase! + "-wrong");
    await qa.check("data", "a wrong passphrase gives the verdict inside the window, and as a toast, and the window stays open", async () => {
      await expect(stale.getByTestId("pass-verdict")).toHaveText(T("vault_wrong"));
      await expect.poll(toasts).toContain(T("vault_wrong"));
      await expect(stale.getByTestId("pass-dialog")).toBeVisible();
    }, { source: `${SHEET} row 4b; O9 ("show it inside the window")` });
    await qa.checkpoint("the unlock window with the wrong-passphrase verdict");
    await answerPassphrase(stale, s.passphrase!);
    await expect(stale.getByTestId("pass-dialog")).toBeHidden();
    const sent = (await saved).request().postDataJSON() as { bodyHtml: string; keyVersion: number };
    await qa.check("data", "the right passphrase saves the held sentence, sealed (key version 1, not in clear), and the badge says Auto-save on", async () => {
      expect(sent.keyVersion).toBe(1);
      expect(sent.bodyHtml).not.toContain("Deadlines");
      await expect(stale.getByTestId("save-status")).toHaveText(T("autosave_on"));
    }, { source: `${SHEET} row 4b` });
    await qa.check("data", "the pill reads Vault unlocked, and all three sentences are there", async () => {
      await expect(pill(stale)).toHaveText(T("vault_pill_yours"));
      await expectAllSentences(stale);
    }, { source: `${SHEET} row 4b` });
    await stale.close();
  }, { page: stale });

  await qa.step("reload locked", async () => {
    await page.bringToFront();
    const asks = await lockByReload(page, s);
    await qa.check("data", "after a reload the pill reads Vault locked and the unlock window opened before the document", async () => {
      await expect(pill(page)).toHaveText(T("vault_pill_locked"));
      expect(asks, "passphrase windows the page opened").toBeGreaterThanOrEqual(1);
    }, { source: `${SHEET} row 4c` });
    await qa.check("data", "after Cancel the document reads \"This document is locked\", with no editor and never an empty page", async () => {
      await expect(page.getByTestId("doc-unreadable")).toHaveText(T("vault_doc_locked"));
      await expect(page.locator(".ProseMirror")).toHaveCount(0);
    }, { source: `${SHEET} row 4c` });
    await qa.check("data", "while locked, the project's name reads Locked title, never the sealed text", async () => {
      await expect(page.getByTestId("project-switcher")).toContainText(T("title_locked"));
      await expect(page.getByTestId("place-home")).toHaveText(T("title_locked"));
    }, { source: `${E2E} step 4c (wave B1, D-S2-40)` });
    await qa.checkpoint("the locked document");
    await unlock(page, s);
    await qa.check("data", "the passphrase brings all three sentences back, the pill reads Vault unlocked and the project's name returns", async () => {
      await expectAllSentences(page);
      await expect(pill(page)).toHaveText(T("vault_pill_yours"));
      await expect(page.getByTestId("project-switcher")).toContainText(PROJECT.name);
    }, { source: `${SHEET} row 4c` });
  });

  const other = await qa.step("open a fresh browser", () => sameAccountElsewhere(browser, page, qa));
  try {
    await qa.step("a fresh browser", async () => {
      await other.page.goto("/");
      await qa.check("data", "a fresh browser signed in as the same account reads Vault locked, and no document is open before the passphrase", async () => {
        await expect(pill(other.page)).toHaveText(T("vault_pill_locked"));
        await expect(other.page.locator(".ProseMirror")).toHaveCount(0);
      }, { source: `${SHEET} row 5` });
      // `unlock` presses the pill when the page has not asked, which would hide a page that never asks: the page must open the window itself, as a student who just opens it sees.
      await qa.check("data", "the page asks for the passphrase by itself, before any press (the document it opens is sealed)", async () => {
        await expect(other.page.getByTestId("pass-dialog")).toBeVisible();
        await expect(other.page.getByTestId("pass-message")).toHaveText(T("vault_unlock_hint"));
      }, { source: `${SHEET} row 5 ("the unlock window asks for the passphrase before the document opens")` });
      await unlock(other.page, s);
      await expect(other.page.getByTestId("project-home")).toBeVisible();
      await other.page.getByTestId("home-open-writing").click();
      await qa.check("data", "the passphrase opens all three sentences, the project's name and the pill reads Vault unlocked", async () => {
        await expect(other.page.getByTestId("project-switcher")).toContainText(PROJECT.name);
        await expect(other.page.locator(".ProseMirror")).toContainText(SENTENCE_3);
        await expectAllSentences(other.page);
        await expect(pill(other.page)).toHaveText(T("vault_pill_yours"));
      }, { source: `${SHEET} row 5` });
    }, { page: other.page });
  } finally {
    await other.context.close();
  }

  await qa.step("change the passphrase", async () => {
    await page.bringToFront();
    const next = fresh();
    const toasts = await recordToasts(page);
    await page.getByTestId("help-btn").click();
    await page.getByTestId("help-change-pass").click();
    await expect(page.getByTestId("vault-change-dialog")).toBeVisible();
    await qa.check("visual", "the passphrase fields keep room for their eyes, so a long passphrase does not run under them", () => expectEyeRoom(page, ["vault-change-old", "vault-change-new", "vault-change-again"]), { source: EYE_SOURCE, known: "Q5" });
    await qa.checkpoint("the change passphrase window");
    await page.getByTestId("vault-change-old").fill(s.passphrase!);
    await page.getByTestId("vault-change-new").fill(next);
    await page.getByTestId("vault-change-again").fill(next);
    await page.getByTestId("vault-change-submit").click();
    await qa.check("data", "the toast says Passphrase changed and the window closes", async () => {
      await expect(page.getByTestId("vault-change-dialog")).toBeHidden();
      await expect.poll(toasts).toContain(T("vault_changed"));
    }, { source: `${SHEET} row 6` });
    const old = s.passphrase!;
    s.passphrase = next;
    await lockByReload(page, s);
    await openUnlockWindow(page);
    await answerPassphrase(page, old);
    await qa.check("data", "after a reload the old passphrase is refused (the verdict shows and the window stays), and the new one opens the document with all three sentences", async () => {
      await expect(page.getByTestId("pass-verdict")).toHaveText(T("vault_wrong"));
      await expect(page.getByTestId("pass-dialog")).toBeVisible();
      await answerPassphrase(page, next);
      await expect(page.getByTestId("pass-dialog")).toBeHidden();
      await expect(pill(page)).toHaveText(T("vault_pill_yours"));
      await expectAllSentences(page);
    }, { source: `${SHEET} row 6` });
  });

  await qa.step("recover with the sheet", async () => {
    const firstCode = s.recoveryCode!;
    // 7a: the sheet's code and a new passphrase open the vault and show a new sheet.
    await lockByReload(page, s);
    await openUnlockWindow(page);
    await page.getByTestId("vault-forgot").click();
    await expect(page.getByTestId("pass-dialog")).toBeHidden();
    await expect(page.getByTestId("vault-recover-dialog")).toBeVisible();
    await qa.check("visual", "the passphrase fields keep room for their eyes, so a long passphrase does not run under them", () => expectEyeRoom(page, ["recover-pass", "recover-pass2"]), { source: EYE_SOURCE, known: "Q5" });
    await qa.checkpoint("the recovery window");
    const toasts = await recordToasts(page);
    const third = fresh();
    await page.getByTestId("recover-code").fill(firstCode);
    await page.getByTestId("recover-pass").fill(third);
    await page.getByTestId("recover-pass2").fill(third);
    await page.getByTestId("recover-submit").click();
    await expect(page.getByTestId("vault-recover-dialog")).toBeHidden();
    await expect(page.getByTestId("vault-sheet-dialog")).toBeVisible();
    const secondCode = (await page.getByTestId("vault-code").innerText()).trim();
    await qa.check("data", "the toast says the vault is recovered, and a new recovery sheet shows a different code", async () => {
      await expect.poll(toasts).toContain(T("vault_recovered"));
      expect(secondCode).toMatch(RECOVERY_CODE);
      expect(secondCode).not.toBe(firstCode);
    }, { source: `${SHEET} row 7a` });
    await page.getByTestId("vault-sheet-saved").check();
    await page.getByTestId("vault-sheet-done").click();
    await expect(page.getByTestId("vault-sheet-dialog")).toBeHidden();
    s.passphrase = third;
    s.recoveryCode = secondCode;
    await qa.check("data", "the recovery opened the vault, and the document opens with all three sentences", async () => {
      await expectAllSentences(page);
      await expect(pill(page)).toHaveText(T("vault_pill_yours"));
    }, { source: `${SHEET} row 7a` });

    // 7b: the passphrase set by the recovery opens the vault after a reload.
    await lockByReload(page, s);
    await unlock(page, s);
    await qa.check("data", "after a reload the passphrase set by the recovery opens all three sentences", async () => {
      await expectAllSentences(page);
    }, { source: `${SHEET} row 7b` });

    // 7c: the old code no longer works, and nothing changed.
    await lockByReload(page, s);
    await openUnlockWindow(page);
    await page.getByTestId("vault-forgot").click();
    await expect(page.getByTestId("vault-recover-dialog")).toBeVisible();
    await page.getByTestId("recover-code").fill(firstCode);
    const fourth = fresh();
    await page.getByTestId("recover-pass").fill(fourth);
    await page.getByTestId("recover-pass2").fill(fourth);
    await page.getByTestId("recover-submit").click();
    await qa.check("data", "the old code is refused with \"That code did not match\" inside the window, and the window stays open", async () => {
      await expect(page.getByTestId("recover-verdict")).toHaveText(T("vault_recover_bad"));
      await expect(page.getByTestId("vault-recover-dialog")).toBeVisible();
    }, { source: `${SHEET} row 7c; O9 (inline too)` });
    await qa.checkpoint("the recovery window with the old code refused");
    await page.getByTestId("recover-cancel").click();
    await expect(page.getByTestId("vault-recover-dialog")).toBeHidden();
    await qa.check("data", "after Cancel the document reads \"This document is locked\", and the passphrase set by the recovery still opens it", async () => {
      await expect(page.getByTestId("doc-unreadable")).toHaveText(T("vault_doc_locked"));
      await unlock(page, s);
      await expectAllSentences(page);
    }, { source: `${SHEET} row 7c` });
  });

  await qa.step("export all my work", async () => {
    const toasts = await recordToasts(page);
    await page.getByTestId("help-btn").click();
    const file = await catchDownload(page, () => page.getByTestId("help-export").click());
    const files = await file.zip();
    await qa.check("data", "the file is appuscholar-export-<date>.zip, and the toast says Export ready", async () => {
      expect(file.name).toMatch(/^appuscholar-export-\d{4}-\d{2}-\d{2}\.zip$/);
      await expect.poll(toasts).toContain(T("export_done"));
    }, { source: `${SHEET} row 8` });
    await qa.check("data", "the zip holds index.json and writing-process-record.txt", async () => {
      // The download came and the toast said Export ready: a zip with no file in it is an export that lost the student's work, a failure.
      expect(files.size, "files in the export zip").toBeGreaterThan(0);
      const names = [...files.keys()];
      expect(names.filter((n) => /(^|\/)index\.json$/.test(n))).toHaveLength(1);
      expect(names.filter((n) => /(^|\/)writing-process-record\.txt$/.test(n))).toHaveLength(1);
    }, { source: `${SHEET} row 8` });
    await qa.check("data", "one .html and one .doc hold the three sentences in readable text", async () => {
      // The download came and the toast said Export ready: a zip with no file in it is an export that lost the student's work, a failure.
      expect(files.size, "files in the export zip").toBeGreaterThan(0);
      const text = (name: string) => files.get(name)!.toString("utf8");
      const pages = [...files.keys()].filter((n) => n.endsWith(".html")).map(text);
      expect(pages.filter((h) => h.includes(SENTENCE_1) && h.includes(SENTENCE_2) && h.includes(SENTENCE_3))).toHaveLength(1);
      const words = [...files.keys()].filter((n) => n.endsWith(".doc")).map(text);
      expect(words.filter((w) => w.includes(SENTENCE_1) && w.includes(SENTENCE_2) && w.includes(SENTENCE_3))).toHaveLength(1);
    }, { source: `${SHEET} row 8` });
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("help-dialog")).toBeHidden();
    await qa.check("data", "the one answer the case excused, a 409 on a save, was the second tab's refused save, and no other page was refused", async () => {
      const excused = (qa.result().allowed ?? []).find((a) => a.kind === "response" && !a.builtIn)?.count ?? 0;
      expect(refusedForStale.length, "saves of the second tab the api refused").toBeGreaterThanOrEqual(1);
      expect(excused, "409 answers excused (every one must be the second tab's)").toBe(refusedForStale.length);
    }, { source: `${E2E} step 4a (the plaintext save is refused once a vault exists)` });
  });
});

// ---- S10-02 [F2] ------------------------------------------------------------------------------------------------------------------------------------------

test("S10-02 [F2] the pill and the titles stay unlocked when the network returns", { tag: ["@slice"] }, async ({ page, context, qa }) => {
  qa.begin({
    story: "S10",
    id: "S10-02 [F2]",
    goal: "My vault is open and the network drops and comes back: the pill still says unlocked, my titles stay readable, and pressing the pill works",
    situation: { vault: "open", network: "drop", screen: "desktop", lang: "en", data: "realistic" },
    steps: ["new student", "network off and back on", "the pill after the network returns"],
    code: CODE
  });
  qa.allow({ consoleErrors: [OFFLINE_CONSOLE] });
  const doc = "Essay draft";
  let s!: Student;

  await qa.step("new student", async () => {
    s = await newStudent(page, qa, { key: "none", vault: "on", project: PROJECT });
    await toPlace(page, s.projectId!, "writing");
    await page.getByTestId("doc-rename").click();
    await page.getByTestId("doc-name-input").fill(doc);
    await page.getByTestId("doc-name-ok").click();
    await expect(page.getByTestId("doc-name-dialog")).toBeHidden();
    await qa.check("data", "before the network drops: the pill reads Vault unlocked, and the project's and the document's names are readable", async () => {
      await expect(pill(page)).toHaveText(T("vault_pill_yours"));
      await expect(page.getByTestId("project-switcher")).toContainText(PROJECT.name);
      await expect(page.getByTestId("doc-select").locator("option:checked")).toHaveText(doc);
    }, { source: `${SHEET} row 3` });
  });

  await qa.step("network off and back on", async () => {
    await goOffline(context);
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
    // Coming back online makes the app read the vault record again (lib/vault/useVault.tsx): F2 was what it did with the answer.
    const reread = page.waitForResponse((r) => r.request().method() === "GET" && r.url() === `${QA_API_ORIGIN}/me/vault`, { timeout: 15_000 });
    reread.catch(() => undefined);
    await goOnline(context);
    await qa.check("data", "coming back online, the app reads the vault record again", async () => {
      expect((await reread).ok()).toBe(true);
    }, { source: "docs/walkthroughs/notes/2026-10-23-tools-walk.md, F2" });
  });

  await qa.step("the pill after the network returns", async () => {
    // F2: within 6 s the header became "Locked title | Vault locked" while the key was still in memory. Looked at for 10 s, every quarter of a second.
    const seen: string[] = [];
    await qa.check("data", "for 10 s after the network returns, the pill stays Vault unlocked and the titles stay readable (never Locked title)", async () => {
      const started = Date.now();
      while (Date.now() - started < 10_000) {
        const now = await page.evaluate(() => ({
          status: document.querySelector('[data-testid="vault-pill"]')?.getAttribute("data-status") ?? "(no pill)",
          pill: document.querySelector('[data-testid="vault-pill"]')?.textContent?.trim() ?? "",
          project: document.querySelector('[data-testid="project-switcher"]')?.textContent?.trim() ?? "",
          doc: (document.querySelector('[data-testid="doc-select"]') as HTMLSelectElement | null)?.selectedOptions[0]?.textContent?.trim() ?? ""
        }));
        const bad = now.status !== "unlocked" || now.pill !== T("vault_pill_yours") || !now.project.includes(PROJECT.name) || now.doc !== doc;
        if (bad) seen.push(`${((Date.now() - started) / 1000).toFixed(1)} s: pill "${now.pill}" (${now.status}), project "${now.project}", document "${now.doc}"`);
        // The sampling period of a watch that lasts a fixed 10 s on purpose (F2 flipped the header within 6 s): what is checked is that nothing changes in that time, so the loop is bounded by it.
        await page.waitForTimeout(250);
      }
      expect(seen, "the first moment the header was not as it was").toEqual([]);
    }, { source: "docs/walkthroughs/notes/2026-10-23-tools-walk.md, F2 (fixed in #25); known.json F2", known: "F2" });
    await qa.check("data", "pressing the pill opens its menu (Change passphrase), not the passphrase window, and it still reads Vault unlocked", async () => {
      await pill(page).click();
      await expect(page.getByTestId("vault-menu")).toBeVisible();
      await expect(page.getByTestId("vault-menu-change")).toBeVisible();
      await expect(page.getByTestId("pass-dialog")).toBeHidden();
      await expect(pill(page)).toHaveText(T("vault_pill_yours"));
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("vault-menu")).toBeHidden();
    }, { source: "docs/walkthroughs/notes/2026-10-23-tools-walk.md, F2 ('a press does nothing'); known.json F2", known: "F2" });
  });
});

// ---- S10-03 [O23] -----------------------------------------------------------------------------------------------------------------------------------------

test("S10-03 [O23] Remember on this computer works again after Forget on this computer", { tag: ["@slice"] }, async ({ page, qa }) => {
  qa.begin({
    story: "S10",
    id: "S10-03 [O23]",
    goal: "I forget the vault on this computer, unlock it again with Remember ticked, and the next reload does not ask for the passphrase",
    situation: { vault: "forgotten", network: "fine", screen: "desktop", lang: "en", data: "realistic" },
    steps: ["new student", "remember on this computer", "forget on this computer", "unlock with Remember ticked", "reload"],
    code: CODE
  });
  let s!: Student;

  await qa.step("new student", async () => {
    s = await newStudent(page, qa, { key: "none", vault: "on", project: PROJECT });
  });

  await qa.step("remember on this computer", async () => {
    await lockByReload(page, s);
    // The helper waits until this browser has written the record.
    await unlock(page, s, { remember: true });
    await qa.check("data", "this browser remembers the vault after the first unlock with Remember ticked", async () => {
      expect(await vaultRemembered(page, s.uid)).toBe(true);
    }, { source: "docs/walkthroughs/notes/2026-10-23-tools-walk.md, O23 ('an earlier unlock with Remember did save one')" });
  });

  await qa.step("forget on this computer", async () => {
    await forgetOnThisComputer(page);
    await qa.check("data", "after Forget on this computer nothing is remembered, and a reload leaves the vault locked", async () => {
      expect(await vaultRemembered(page, s.uid)).toBe(false);
      await lockByReload(page, s);
      await expect(pill(page)).toHaveText(T("vault_pill_locked"));
    }, { source: "docs/walkthroughs/notes/2026-10-23-tools-walk.md, O23" });
  });

  await qa.step("unlock with Remember ticked", async () => {
    await openUnlockWindow(page);
    await page.getByTestId("pass-input").fill(s.passphrase!);
    await page.getByTestId("pass-remember").check();
    await page.getByTestId("pass-ok").click();
    await expect(page.getByTestId("pass-dialog")).toBeHidden();
    await expect(pill(page)).toHaveAttribute("data-status", "unlocked");
    await qa.check("data", "this browser remembers the vault again once it is unlocked with Remember ticked", async () => {
      await expect.poll(() => vaultRemembered(page, s.uid), { timeout: 10_000, message: "this browser did not write the remembered vault" }).toBe(true);
    }, { source: "docs/walkthroughs/notes/2026-10-23-tools-walk.md, O23 ('no remembered key was stored (the appu_vault store stayed empty 6 s later)')" });
  });

  await qa.step("reload", async () => {
    await page.reload();
    await qa.check("data", "after the reload the vault is open and no passphrase is asked", async () => {
      await expect(pill(page)).toHaveAttribute("data-status", "unlocked");
      // A page that has to ask does so once its reads are done. The home shows its stages only after it has read its sealed work, so with the stages on the screen every read that
      // could have asked has been made: that is the condition to wait for, not a time.
      await expect(page.getByTestId("home-stages")).toBeVisible();
      await expect(page.getByTestId("pass-dialog")).toBeHidden();
      await expect(pill(page)).toHaveAttribute("data-status", "unlocked");
    }, { source: "docs/walkthroughs/notes/2026-10-23-tools-walk.md, O23; spec section 9 ('the next reload does not ask')" });
  });
});

// ---- S10-04 [O18] -----------------------------------------------------------------------------------------------------------------------------------------

test("S10-04 [O18] a locked vault asks for the passphrase once when Closeness opens", { tag: ["@slice"] }, async ({ page, qa }) => {
  qa.begin({
    story: "S10",
    id: "S10-04 [O18]",
    goal: "My project has a shelf, codes and design data and my vault is locked: opening Closeness asks for my passphrase once, not once for each sealed thing it reads",
    situation: { vault: "locked", network: "fine", screen: "desktop", lang: "en", data: "realistic" },
    steps: ["new student", "a shelf, codes and design data", "lock on Closeness"],
    code: [...CODE, "apps/web/lib/blobs", "apps/web/components/tools/close"]
  });
  let s!: Student;
  const code = "Exam anxiety";

  await qa.step("new student", async () => {
    s = await newStudent(page, qa, { key: "none", vault: "on", project: PROJECT });
  });

  await qa.step("a shelf, codes and design data", async () => {
    const put = (kind: RegExp) => page.waitForResponse((r) => r.request().method() === "PUT" && kind.test(r.url()) && r.ok(), { timeout: 30_000 });
    // The shelf: a paper added to the Reading shelf (its text and its index are two blobs).
    await toPlace(page, s.projectId!, "literature", "reading");
    const paper = (await shelfPdfs(1))[0]!;
    const shelfSaved = Promise.all([put(/\/blobs\/shelf_paper%3A[A-Za-z0-9_-]+$/), put(/\/blobs\/shelf_index$/)]);
    shelfSaved.catch(() => undefined);
    await page.getByTestId("sh-file").setInputFiles({ name: paper.name, mimeType: "application/pdf", buffer: paper.bytes });
    await expect(page.getByTestId("sh-paper")).toHaveCount(1);
    await shelfSaved;
    // Codes: one code in the Coding tab.
    await toPlace(page, s.projectId!, "collect", "coding");
    const codesSaved = put(/\/blobs\/qual_codes$/);
    codesSaved.catch(() => undefined);
    await page.getByTestId("qual-add-top").click();
    await page.getByTestId("qual-name-input").fill(code);
    await page.getByTestId("qual-name-submit").click();
    await expect(page.getByTestId("qual-name-field")).toHaveCount(0);
    await codesSaved;
    // Design data: an amount in the Budget tab.
    await toPlace(page, s.projectId!, "design", "budget");
    const budgetSaved = put(/\/blobs\/design_budget$/);
    budgetSaved.catch(() => undefined);
    await page.getByTestId("budget-amount-0").fill("1500");
    await budgetSaved;
    await qa.check("data", "the work is saved: the shelf, the code and the budget each reached the server", async () => {
      const rows = await serverRows(s.uid);
      const kinds = rows.blobs.map((b) => b.kind);
      expect(kinds.some((k) => k.startsWith("shelf_paper:"))).toBe(true);
      expect(kinds).toEqual(expect.arrayContaining(["shelf_index", "qual_codes", "design_budget"]));
    }, { source: "e2e/stage2-idea-literature.spec.ts step 7 (the shelf's blobs), e2e/tools-c.spec.ts (a code), e2e/tools-a.spec.ts step 5c (a budget amount): the reload has something sealed to read only once each is on the server" });
  });

  await qa.step("lock on Closeness", async () => {
    await toPlace(page, s.projectId!, "review", "closeness");
    await expect(page.getByTestId("place-review-closeness")).toBeVisible();
    // The page is reloaded on Closeness with the vault locked; lockByReload cancels the passphrase window each time the page asks again, and counts them.
    const asks = await lockByReload(page, s);
    await qa.check("conceptual", "opening Closeness with a locked vault asks for the passphrase at most once", async () => {
      expect(asks, "passphrase windows the page opened, one after each Cancel (docs/walkthroughs/notes/2026-10-23-tools-walk.md, O18: four on opening Closeness)").toBeLessThanOrEqual(1);
    }, { source: "docs/walkthroughs/notes/2026-10-23-tools-walk.md, O18; spec section 9 ('once per opening, not once per sealed item'); known.json O18", known: "O18" });
    await qa.check("data", "after the Cancels the pill still reads Vault locked, and nothing is asked", async () => {
      await expect(pill(page)).toHaveText(T("vault_pill_locked"));
      await expect(page.getByTestId("pass-dialog")).toBeHidden();
    }, { source: `${SHEET} row 4c` });
  });
});

// ---- S10-05 -----------------------------------------------------------------------------------------------------------------------------------------------

test("S10-05 unlocking on a slow network shows a sign of progress, and a second press does not unlock twice", async ({ page, context, qa }) => {
  qa.begin({
    story: "S10",
    id: "S10-05",
    goal: "My vault is locked and every answer from the server takes 3 s: pressing OK on the passphrase shows that something is happening within a second, and pressing again opens no second passphrase window",
    situation: { vault: "locked", network: "slow", screen: "desktop", lang: "en", data: "realistic" },
    steps: ["new student", "lock", "unlock on a slow network"],
    code: [...CODE, "apps/web/components/frame/ProjectHome.tsx"]
  });
  let s!: Student;

  await qa.step("new student", async () => {
    s = await newStudent(page, qa, { key: "none", vault: "on", project: PROJECT });
  });

  await qa.step("lock", async () => {
    await lockByReload(page, s);
    await expect(pill(page)).toHaveText(T("vault_pill_locked"));
  });

  await qa.step("unlock on a slow network", async () => {
    // Every request to the api waits 3 s from here on.
    const undo = await slowApi(context, 3_000);
    try {
      await openUnlockWindow(page);
      await page.getByTestId("pass-input").fill(s.passphrase!);
      // From the moment OK is pressed, in the page itself (so that no wait of the test's own is in the numbers): the passphrase windows the page opens (a second unlock would open a second one);
      // how long the home goes on saying "This project is locked" (its `home-locked` card); and a second press, 300 ms into the wait, a synthetic click on the one button the page offers for the
      // same thing, the home's "Unlock", which it shows while it reads the project again.
      await page.evaluate(() => {
        const w = window as unknown as { __asks: number; __second: boolean | null; __lockedGoneAt: number | null };
        w.__asks = 0;
        w.__second = null;
        w.__lockedGoneAt = null;
        new MutationObserver((records) => {
          for (const r of records) for (const n of r.addedNodes) if (n instanceof Element && (n.matches('[data-testid="pass-dialog"]') || n.querySelector('[data-testid="pass-dialog"]'))) w.__asks++;
        }).observe(document.body, { childList: true, subtree: true });
        document.querySelector('[data-testid="pass-ok"]')!.addEventListener(
          "click",
          () => {
            const pressed = performance.now();
            const watch = setInterval(() => {
              const t = performance.now() - pressed;
              if (!document.querySelector('[data-testid="home-locked"]')) {
                w.__lockedGoneAt = t;
                clearInterval(watch);
              } else if (t > 20_000) clearInterval(watch);
            }, 50);
            setTimeout(() => {
              const again = document.querySelector<HTMLElement>('[data-testid="home-unlock"]');
              w.__second = again !== null;
              again?.click();
            }, 300);
          },
          { once: true }
        );
      });
      // The sign: the page says it is opening ("Opening your saved work…"), or it is open. What it must not do is wait without a word.
      const sign = page.getByTestId("home-loading").or(page.getByTestId("home-stages"));
      await qa.timed(
        "a sign that the project is opening, after OK on the passphrase window",
        PROGRESS_MS,
        async () => {
          await page.getByTestId("pass-ok").click();
          await sign.first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
        },
        { source: "spec section 8 (a sign of progress within 1 s of any press that takes longer)", known: "Q2" }
      );
      await qa.check("conceptual", "within 1 s of OK the home no longer says \"This project is locked\" (the pill reads Vault unlocked by then, and the page must not contradict it)", async () => {
        await expect.poll(() => page.evaluate(() => (window as unknown as { __lockedGoneAt: number | null }).__lockedGoneAt), { timeout: 20_000, message: "the home's locked card never went" }).not.toBeNull();
        const goneAt = await page.evaluate(() => (window as unknown as { __lockedGoneAt: number | null }).__lockedGoneAt);
        expect(goneAt, "ms from OK until the home stopped saying the project is locked").toBeLessThanOrEqual(PROGRESS_MS);
      }, { source: "spec section 8 (a sign of progress within 1 s of any press that takes longer); the header's own \"Vault unlocked\" at the same moment", known: "Q2" });
      // The end of the wait is the stages on the screen, a condition, not a time: a window a second unlock would open shows up before then.
      await expect(page.getByTestId("home-stages")).toBeVisible({ timeout: 30_000 });
      // "No second unlock" is proved as "no second passphrase window": a second unlock would have to ask again, and the app's one ask is the window. The press is a synthetic click from the page (above).
      await qa.check("data", "a second press on the page's own Unlock button during the wait opens no second passphrase window (so none is asked for a second unlock)", async () => {
        const second = await page.evaluate(() => (window as unknown as { __second: boolean | null }).__second);
        if (second !== true) notChecked("the page offered no button to press a second time during the wait, so a second press was not made");
        await expect(page.getByTestId("pass-dialog")).toBeHidden();
        expect(await page.evaluate(() => (window as unknown as { __asks: number }).__asks), "passphrase windows opened after OK").toBe(0);
      }, { source: "plan S10-05: a second press during the wait makes no second unlock" });
      await qa.check("data", "when the wait ends the vault is open: the pill reads Vault unlocked, the project's work shows and nothing was asked again", async () => {
        await expect(pill(page)).toHaveText(T("vault_pill_yours"));
        await expect(page.getByTestId("home-stages")).toBeVisible();
        await expect(page.getByTestId("pass-dialog")).toBeHidden();
        expect(await page.evaluate(() => (window as unknown as { __asks: number }).__asks), "passphrase windows opened after OK").toBe(0);
      }, { source: `${SHEET} row 4c` });
    } finally {
      await undo();
    }
  });
});

// ---- S10-06 -----------------------------------------------------------------------------------------------------------------------------------------------

test("S10-06 on a phone in Hindi, the vault's set-up, unlock and recovery windows fit the screen and speak Hindi", { tag: ["@phone"] }, async ({ page, qa }) => {
  qa.begin({
    story: "S10",
    id: "S10-06",
    goal: "On my phone, in Hindi, I set up my vault, unlock it and recover it with my sheet, and every window fits the screen and speaks Hindi",
    situation: { vault: "open", network: "fine", screen: "phone", lang: "hi", data: "realistic" },
    steps: ["new student in Hindi", "set up the vault", "unlock", "recover with the sheet"],
    code: [...CODE, ...CODE_FIELD]
  });
  const hi: Lang = "hi";
  let s!: Student;
  /** A check that the window shows the Hindi sentence of `key`, and that the Hindi dictionary has one (a key without it would be shown in English, and the check would pass on English). */
  const inHindi = (label: string, find: () => ReturnType<Page["getByTestId"]>, key: string, source: string) =>
    qa.check("data", label, async () => {
      expect(key in dictionary(hi), `${key} has no Hindi sentence in messages/hi.json`).toBe(true);
      await expect(find()).toHaveText(T(key, {}, hi));
    }, { source });
  const dialogText = (testId: string, key: string) => (page: Page) => page.getByTestId(testId).getByText(T(key, {}, hi), { exact: false }).first();

  await qa.step("new student in Hindi", async () => {
    s = await newStudent(page, qa, { key: "none", lang: "hi", project: PROJECT });
    await qa.check("data", "the page is in Hindi, and the vault pill says so", async () => {
      await expect(page.locator("html")).toHaveAttribute("lang", "hi");
      await expect(pill(page)).toHaveText(T("vault_pill_off", {}, hi));
    }, { source: "spec section 6 (phone + Hindi)" });
  });

  await qa.step("set up the vault", async () => {
    s.passphrase = fresh();
    await pill(page).click();
    await expect(page.getByTestId("vault-setup-dialog")).toBeVisible();
    await qa.check("data", "the set-up window speaks Hindi: its title, its explanation, Remember on this computer and its two buttons", async () => {
      for (const key of ["vault_setup_h2", "vault_setup_intro", "vault_remember", "vault_setup_later", "vault_setup_btn"]) {
        expect(key in dictionary(hi), `${key} has no Hindi sentence in messages/hi.json`).toBe(true);
        await expect(dialogText("vault-setup-dialog", key)(page), key).toBeVisible();
      }
    }, { source: `${SHEET} row 3; spec section 6 (the windows' words in Hindi)` });
    await qa.checkpoint("the set-up window, on a phone, in Hindi");
    await page.getByTestId("vault-setup-submit").click();
    await inHindi("the passphrase window explains the vault in Hindi", () => page.getByTestId("pass-message"), "vault_setup_intro", `${SHEET} row 3`);
    await qa.check("visual", "the passphrase field keeps room for its eye, so a long passphrase does not run under it", () => expectEyeRoom(page, ["pass-input"]), { source: EYE_SOURCE, known: "Q5" });
    await qa.checkpoint("the passphrase window of the set-up, on a phone, in Hindi");
    await answerPassphrase(page, s.passphrase!);
    await inHindi("asked again, it says so in Hindi", () => page.getByTestId("pass-message"), "bk_pass2", `${SHEET} row 3`);
    await answerPassphrase(page, s.passphrase!);
    await expect(page.getByTestId("vault-sheet-dialog")).toBeVisible();
    s.recoveryCode = (await page.getByTestId("vault-code").innerText()).trim();
    await qa.check("data", "the recovery sheet speaks Hindi (title, explanation, the download, \"I have saved it\", Done) and shows a code of four groups of five", async () => {
      expect(s.recoveryCode).toMatch(RECOVERY_CODE);
      for (const key of ["vault_sheet_h2", "vault_sheet_intro", "vault_sheet_download", "vault_sheet_saved", "vault_sheet_done"]) {
        expect(key in dictionary(hi), `${key} has no Hindi sentence in messages/hi.json`).toBe(true);
        await expect(dialogText("vault-sheet-dialog", key)(page), key).toBeVisible();
      }
    }, { source: `${SHEET} row 3` });
    await qa.checkpoint("the recovery sheet, on a phone, in Hindi");
    await page.getByTestId("vault-sheet-saved").check();
    await page.getByTestId("vault-sheet-done").click();
    await expect(page.getByTestId("vault-sheet-dialog")).toBeHidden();
    await qa.check("data", "the pill says in Hindi that the vault is open", async () => {
      await expect(pill(page)).toHaveText(T("vault_pill_yours", {}, hi));
    }, { source: `${SHEET} row 3` });
  });

  await qa.step("unlock", async () => {
    await lockByReload(page, s);
    await qa.check("data", "after a reload the pill says in Hindi that the vault is locked", async () => {
      await expect(pill(page)).toHaveText(T("vault_pill_locked", {}, hi));
    }, { source: `${SHEET} row 4c` });
    await qa.checkpoint("the locked project, on a phone, in Hindi");
    await openUnlockWindow(page, hi);
    await qa.check("data", "the unlock window speaks Hindi: its title, its hint, Remember on this computer, the recovery link and Cancel", async () => {
      for (const key of ["vault_unlock_h2", "vault_unlock_hint", "vault_remember", "vault_forgot", "bk_cancel"]) {
        expect(key in dictionary(hi), `${key} has no Hindi sentence in messages/hi.json`).toBe(true);
        await expect(dialogText("pass-dialog", key)(page), key).toBeVisible();
      }
    }, { source: `${SHEET} row 4c; spec section 6 (the windows' words in Hindi)` });
    await qa.check("visual", "the passphrase field keeps room for its eye, so a long passphrase does not run under it", () => expectEyeRoom(page, ["pass-input"]), { source: EYE_SOURCE, known: "Q5" });
    await qa.checkpoint("the unlock window, on a phone, in Hindi");
    await answerPassphrase(page, s.passphrase! + "-wrong");
    await inHindi("a wrong passphrase gives its verdict in Hindi, inside the window", () => page.getByTestId("pass-verdict"), "vault_wrong", `${SHEET} row 4b; O9`);
    await qa.checkpoint("the unlock window with the verdict, on a phone, in Hindi");
    await answerPassphrase(page, s.passphrase!);
    await qa.check("data", "the right passphrase opens the vault, and the pill says so in Hindi", async () => {
      await expect(page.getByTestId("pass-dialog")).toBeHidden();
      await expect(pill(page)).toHaveText(T("vault_pill_yours", {}, hi));
    }, { source: `${SHEET} row 4b` });
  });

  await qa.step("recover with the sheet", async () => {
    await lockByReload(page, s);
    await openUnlockWindow(page, hi);
    await page.getByTestId("vault-forgot").click();
    await expect(page.getByTestId("vault-recover-dialog")).toBeVisible();
    await qa.check("data", "the recovery window speaks Hindi: its title, its three fields, Cancel and its button", async () => {
      for (const key of ["vault_recover_h2", "vault_recover_code", "vault_recover_new", "bk_pass2", "bk_cancel", "vault_recover_btn"]) {
        expect(key in dictionary(hi), `${key} has no Hindi sentence in messages/hi.json`).toBe(true);
        await expect(dialogText("vault-recover-dialog", key)(page), key).toBeVisible();
      }
    }, { source: `${SHEET} row 7a; spec section 6 (the windows' words in Hindi)` });
    await qa.check("visual", "the passphrase fields keep room for their eyes, so a long passphrase does not run under them", () => expectEyeRoom(page, ["recover-pass", "recover-pass2"]), { source: EYE_SOURCE, known: "Q5" });
    await qa.checkpoint("the recovery window, on a phone, in Hindi");
    // A code that is not the sheet's is refused first: the verdict, in Hindi, inside the window (the alphabet is the sheet's: no 0, 1, I or O).
    const next = fresh();
    await page.getByTestId("recover-code").fill("AAAAA-BBBBB-CCCCC-DDDDD");
    await page.getByTestId("recover-pass").fill(next);
    await page.getByTestId("recover-pass2").fill(next);
    await page.getByTestId("recover-submit").click();
    await inHindi("a code that does not match gives its verdict in Hindi, inside the window", () => page.getByTestId("recover-verdict"), "vault_recover_bad", `${SHEET} row 7c; O9`);
    await qa.checkpoint("the recovery window with the verdict, on a phone, in Hindi");
    await page.getByTestId("recover-code").fill(s.recoveryCode!);
    await page.getByTestId("recover-submit").click();
    await expect(page.getByTestId("vault-recover-dialog")).toBeHidden();
    await expect(page.getByTestId("vault-sheet-dialog")).toBeVisible();
    const newCode = (await page.getByTestId("vault-code").innerText()).trim();
    await qa.check("data", "the new recovery sheet shows a different code, and its words are Hindi", async () => {
      expect(newCode).toMatch(RECOVERY_CODE);
      expect(newCode).not.toBe(s.recoveryCode);
      await expect(dialogText("vault-sheet-dialog", "vault_sheet_h2")(page)).toBeVisible();
    }, { source: `${SHEET} row 7a` });
    await qa.checkpoint("the new recovery sheet, on a phone, in Hindi");
    await page.getByTestId("vault-sheet-saved").check();
    await page.getByTestId("vault-sheet-done").click();
    await expect(page.getByTestId("vault-sheet-dialog")).toBeHidden();
    await qa.check("data", "the recovery opened the vault: the pill says so in Hindi", async () => {
      await expect(pill(page)).toHaveText(T("vault_pill_yours", {}, hi));
    }, { source: `${SHEET} row 7a` });
  });
});

// ---- S10-07 -----------------------------------------------------------------------------------------------------------------------------------------------

test("S10-07 the server holds none of my words in clear: no title, no blob, no saved version", async ({ page, qa }) => {
  qa.begin({
    story: "S10",
    id: "S10-07",
    goal: "I work with the vault on, and what the server stores of it is sealed: the marker, my idea, my document and a code name are in none of its blobs, titles or saved versions",
    situation: { vault: "open", network: "fine", screen: "desktop", lang: "en", data: "realistic" },
    steps: ["new student with the marker in the names", "write, name, shelve and code", "what the server holds"],
    code: CODE
  });
  const project = { name: `${MARK} Bedtime study`, idea: `Does a fixed bedtime routine for one week lower exam anxiety in first-year college students? ${MARK}` };
  const docTitle = `Essay ${MARK}`;
  const sentence = `A fixed bedtime routine may lower exam anxiety ${MARK}.`;
  const code = `Exam anxiety ${MARK}`;
  let s!: Student;
  let docId = "";
  // Everything the browser sends our api in a write: the server cannot hold what it was never sent.
  const sent: string[] = [];
  page.on("request", (r) => {
    if (r.url().startsWith(QA_API_ORIGIN) && r.method() !== "GET") sent.push(`${r.method()} ${new URL(r.url()).pathname} ${r.postData() ?? ""}`);
  });

  await qa.step("new student with the marker in the names", async () => {
    s = await newStudent(page, qa, { key: "none", vault: "on", project });
    await qa.check("data", "the app shows the project's name as typed", async () => {
      await expect(page.getByTestId("project-switcher")).toContainText(project.name);
    }, { source: "docs/walkthroughs/wave-b1.md row 7 ('The app shows the names')" });
  });

  await qa.step("write, name, shelve and code", async () => {
    const put = (kind: RegExp) => page.waitForResponse((r) => r.request().method() === "PUT" && kind.test(r.url()) && r.ok(), { timeout: 30_000 });
    await toPlace(page, s.projectId!, "writing");
    await page.getByTestId("doc-rename").click();
    await page.getByTestId("doc-name-input").fill(docTitle);
    await page.getByTestId("doc-name-ok").click();
    await expect(page.getByTestId("doc-name-dialog")).toBeHidden();
    // The save that carries the whole sentence: the body is sealed, so the word count it carries says which save it is.
    const words = sentence.split(/\s+/).length;
    const saved = page.waitForResponse((r) => isDocPut(r) && r.ok() && (JSON.parse(r.request().postData() ?? "{}") as { wordCount?: number }).wordCount === words, { timeout: 30_000 });
    saved.catch(() => undefined);
    await typeInDoc(page, sentence);
    docId = /\/documents\/([0-9a-f-]+)$/.exec((await saved).url())![1]!;
    await toPlace(page, s.projectId!, "literature", "reading");
    const paper = (await shelfPdfs(1))[0]!;
    const shelfSaved = Promise.all([put(/\/blobs\/shelf_paper%3A[A-Za-z0-9_-]+$/), put(/\/blobs\/shelf_index$/)]);
    shelfSaved.catch(() => undefined);
    await page.getByTestId("sh-file").setInputFiles({ name: paper.name, mimeType: "application/pdf", buffer: paper.bytes });
    await expect(page.getByTestId("sh-paper")).toHaveCount(1);
    await shelfSaved;
    await toPlace(page, s.projectId!, "collect", "coding");
    const codesSaved = put(/\/blobs\/qual_codes$/);
    codesSaved.catch(() => undefined);
    await page.getByTestId("qual-add-top").click();
    await page.getByTestId("qual-name-input").fill(code);
    await page.getByTestId("qual-name-submit").click();
    await expect(page.getByTestId("qual-name-field")).toHaveCount(0);
    await codesSaved;
    // The title of the document is sealed by its rename; the idea intake by the project's first save. A moment for the title pass after the unlock.
    await toPlace(page, s.projectId!, "idea");
    await expect(page.getByTestId("project-switcher")).toContainText(project.name);
  });

  await qa.step("what the server holds", async () => {
    const rows = await serverRows(s.uid);
    const leaks = [MARK, project.idea.replace(` ${MARK}`, ""), "bedtime routine", sentence, code, "Exam anxiety", docTitle];
    await qa.check("data", "no blob body holds the marker, the idea, a code name or the document's words, and every blob is sealed", async () => {
      // The case saw its idea, shelf paper and code saved (each PUT answered ok): no blob on the server is data lost, not a check that measured nothing.
      expect(rows.blobs.length, "blobs the server holds for the account").toBeGreaterThan(0);
      const kinds = rows.blobs.map((b) => b.kind);
      expect(kinds, "the blobs the case made").toEqual(expect.arrayContaining(["idea_intake", "qual_codes", "shelf_index"]));
      for (const b of rows.blobs) {
        expect(b.body, b.kind).toMatch(CIPHERTEXT);
        for (const plain of leaks) expect(b.body, b.kind).not.toContain(plain);
      }
    }, { source: "docs/walkthroughs/stage-2.md row 12 ('bodies of ciphertext only; none holds the idea, a title or a highlight in readable text')" });
    await qa.check("data", "no project title or document title holds the marker or the names, and every title is sealed (the scratch space's own is the one title in clear)", async () => {
      // The project was created and the document renamed (both answered ok): no title on the server is a failure, not a check that measured nothing.
      expect(rows.titles.length, "titles the server holds for the account").toBeGreaterThan(0);
      for (const t of rows.titles) {
        if (t === SCRATCH_TITLE) continue;
        expect(t).toMatch(CIPHERTEXT);
        for (const plain of [MARK, project.name, "Bedtime study", docTitle]) expect(t).not.toContain(plain);
      }
      expect(rows.titles.filter((t) => t !== SCRATCH_TITLE).length, "the project's and the document's titles").toBeGreaterThanOrEqual(2);
    }, { source: "docs/walkthroughs/wave-b1.md row 7" });
    await qa.check("data", "the project, its documents and its saved versions carry their key version: titles 1 or more, versions 1 or more", async () => {
      const projects = await apiGet<Array<{ id: string; title: string; titleKeyVersion: number }>>(page, "/projects");
      const mine = projects.find((p) => p.id === s.projectId);
      expect(mine, "the project in GET /projects").toBeTruthy();
      expect(mine!.titleKeyVersion).toBeGreaterThanOrEqual(1);
      expect(mine!.title).toMatch(CIPHERTEXT);
      const docs = await apiGet<Array<{ id: string; title: string; titleKeyVersion: number }>>(page, `/projects/${s.projectId}/documents?includeDeleted=1`);
      expect(docs.length).toBeGreaterThanOrEqual(1);
      for (const d of docs) {
        expect(d.titleKeyVersion, `document ${d.id}`).toBeGreaterThanOrEqual(1);
        expect(d.title).toMatch(CIPHERTEXT);
      }
      const revisions = await revisionsOf(page, docId);
      // Every save keeps a version (phase-3a.md, "Not yet in this phase": thinning old versions is not built; the api's PUT /documents/:id always appends one), and this case saw its saves answered ok:
      // a document with no saved version is lost work, so an empty list is a failure here, not a check that measured nothing.
      expect(revisions.length, "saved versions the server lists for the document").toBeGreaterThan(0);
      for (const r of revisions) {
        expect(r.keyVersion, `version ${r.seq}`).toBeGreaterThanOrEqual(1);
        expect(r.bodyHtml, `version ${r.seq}`).toMatch(CIPHERTEXT);
        for (const plain of [MARK, "bedtime routine"]) expect(r.bodyHtml).not.toContain(plain);
      }
    }, { source: "docs/walkthroughs/wave-b1.md row 7 (title_key_version 1 or more); docs/walkthroughs/stage-2.md row 12 (key_version 1 or more)" });
    await qa.check("data", "nothing the browser sent our api in a write held the marker, the idea or a code name in clear", async () => {
      // The account, the project, the document and the blobs were all written from this page: no write seen means the recorder is broken, which must not read as a pass.
      expect(sent.length, "writes to the api the page made").toBeGreaterThan(0);
      for (const plain of [MARK, "bedtime routine", "Exam anxiety"]) expect(sent.filter((w) => w.includes(plain)).map((w) => w.slice(0, 120))).toEqual([]);
    }, { source: "docs/walkthroughs/wave-b1.md row 7; spec section 4 (the server's stored copies are ciphertext)" });
  });
});
