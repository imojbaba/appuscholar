import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, type Browser, type BrowserContext, type BrowserContextOptions, type Page, type Route } from "@playwright/test";
import JSZip from "jszip";
import { FAILURE_MODES } from "../provider-shim/core.mjs";
import { T, type Lang } from "./dict";
import { QA_API_ORIGIN, QA_WEB_ORIGIN } from "./origins";
import { readProviderLog, type ShimLogEntry } from "./providerLog";
import type { Qa } from "./qa";
import { signInAs } from "./session";
import type { ConsoleAllowance } from "./watcher";

/**
 * The student's helpers, which every story case uses (spec section 6, "How each situation is made"): a new account through the UI, the vault locked, unlocked and
 * forgotten, the network off, on and slow, places, language, the document, downloads, and the fake AI provider's log. They drive the app as a student does, by the test ids the
 * e2e suite uses (apps/web/e2e/*.spec.ts is the model), and read words from the dictionaries (dict.ts) in the page's language: the pages run in Hindi too.
 *
 * None of them is a qa step or a qa check: a case calls them inside its own steps, and a helper that cannot do what it is asked fails there, saying what it was waiting for.
 */

// ---- AI keys ------------------------------------------------------------------------------------------------------------------------------------------

export type AiMode = "ok" | "fail429" | "fail401" | "fail500" | "nonet" | "empty" | "failonce" | `slow${number}`;

/**
 * A key of its own for the fake AI provider (provider-shim/core.mjs): `gsk_qa_<mode>_<random>`. The mode says what the provider does with it (ok answers; fail429, fail401,
 * fail500, nonet and empty fail; slow<ms> answers after that many ms; failonce fails the first request and answers the rest), and the random part keeps it apart from every
 * other case's, so a failonce count or a provider log line is never shared. Test values only.
 */
export function qaKey(mode: AiMode = "ok"): string {
  if (mode !== "ok" && !FAILURE_MODES.has(mode) && !/^slow\d+$/.test(mode)) {
    throw new Error(`QA qaKey: ${JSON.stringify(mode)} is not a mode of the fake AI provider (ok, fail429, fail401, fail500, nonet, empty, failonce, slow<ms>).`);
  }
  return `gsk_qa_${mode}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

/** The requests the fake AI provider received with this key, oldest first (the provider's log, QA_PROVIDER_LOG: complete lines only). */
export async function providerCalls(key: string): Promise<ShimLogEntry[]> {
  return readProviderLog().filter((e) => e.key === key);
}

// ---- The student ----------------------------------------------------------------------------------------------------------------------------------------

/** A student the case made: the account, and what `newStudent` set up for it. `passphrase` and `recoveryCode` are there when the vault is on. */
export type Student = { uid: string; email: string; key?: string; passphrase?: string; recoveryCode?: string; projectId?: string };

/** The project `newStudent` makes when the case does not say otherwise. */
export const DEFAULT_PROJECT = {
  name: "QA test project",
  idea: "Does a fixed bedtime routine for one week lower exam anxiety in first-year college students?"
} as const;

const newPassphrase = () => `qa-pass-${randomUUID().replace(/-/g, "").slice(0, 12)}`;

/** The page's language: the interface language the dictionaries are read in (the page sets <html lang> from the student's setting). */
async function pageLang(page: Page): Promise<Lang> {
  return (await page.evaluate(() => document.documentElement.lang)) === "hi" ? "hi" : "en";
}

const vaultPill = (page: Page) => page.getByTestId("vault-pill");

/**
 * From the vault set-up window (`vault-setup-dialog`, open) to its end: the window, the passphrase asked twice, the recovery sheet read, ticked and closed with Done.
 * Returns the recovery code. The set-up opens from the vault pill ("Vault off") or from the key window's "Protect with a passphrase" (stage2-idea-literature.spec.ts, step 1).
 */
async function setUpVault(page: Page, passphrase: string): Promise<string> {
  const lang = await pageLang(page);
  await expect(page.getByTestId("vault-setup-dialog")).toBeVisible();
  await page.getByTestId("vault-setup-submit").click();
  await expect(page.getByTestId("pass-message")).toHaveText(T("vault_setup_intro", {}, lang));
  await page.getByTestId("pass-input").fill(passphrase);
  await page.getByTestId("pass-ok").click();
  await expect(page.getByTestId("pass-message")).toHaveText(T("bk_pass2", {}, lang));
  await page.getByTestId("pass-input").fill(passphrase);
  await page.getByTestId("pass-ok").click();
  await expect(page.getByTestId("vault-sheet-dialog")).toBeVisible();
  const code = (await page.getByTestId("vault-code").innerText()).trim();
  await page.getByTestId("vault-sheet-saved").check();
  await page.getByTestId("vault-sheet-done").click();
  await expect(page.getByTestId("vault-sheet-dialog")).toBeHidden();
  return code;
}

/**
 * A new student, through the UI as the e2e `newProject` helpers do it: a new account signed in (support/session.ts), the terms, the welcome window, the AI key in the provider
 * window, the vault set up with a generated passphrase, and first run's "Save as my project". Ends on the project's home (`project: false`: on first run, with no project).
 *
 *  - `key`: the fake provider's mode for the key (default "ok"), or "none" for a student with no key (the welcome window is skipped with "Later"). The key goes in as Groq, chosen
 *    in the provider window and asserted: Gemini is the app's default and the fake provider refuses it. The key is given to `qa.useKey`, so the case's teardown reads its log.
 *  - `keyMode`: "plain" (default; the key stays in the browser) or "passphrase" (the key is locked under the vault, so the vault is set up through the key window).
 *  - `vault`: "off" (default) or "on" (a passphrase made up for the student, set up before the project is saved, so every title and blob goes to the server sealed).
 *  - `project`: `{ name, idea }` (default DEFAULT_PROJECT), or false.
 *  - `lang`: the interface language, set before the project is saved (phone cases run in "hi").
 *
 * It excuses nothing itself. The answers a new account and its project meet that are errors are the two on the watcher's built-in list (watcher.ts): GET /me/vault 404 (no
 * vault yet) and GET /projects/:id/blobs/:kind 404 (stage data not saved yet, which the project's home meets for every kind it reads).
 */
export async function newStudent(
  page: Page,
  qa: Qa,
  o: { key?: AiMode | "none"; keyMode?: "plain" | "passphrase"; vault?: "off" | "on"; project?: { name: string; idea?: string } | false; lang?: "en" | "hi" } = {}
): Promise<Student> {
  const keyMode = o.keyMode ?? "plain";
  const aiMode = o.key ?? "ok";
  const withKey = aiMode !== "none";
  if (o.keyMode === "passphrase" && !withKey) throw new Error('QA newStudent: keyMode "passphrase" locks a key under the vault, and key is "none".');
  if (o.keyMode === "passphrase" && o.vault === "off") throw new Error('QA newStudent: keyMode "passphrase" needs the vault, and vault is "off".');
  const withVault = (o.vault ?? (keyMode === "passphrase" && withKey ? "on" : "off")) === "on";
  const project = o.project === undefined ? DEFAULT_PROJECT : o.project;

  const { uid, email } = await signInAs(page.context());
  const student: Student = { uid, email };
  if (aiMode !== "none") {
    student.key = qaKey(aiMode);
    qa.useKey(student.key);
  }

  // A new account meets the terms gate, then the welcome window.
  await page.goto("/");
  await page.getByTestId("terms-age").check();
  await page.getByTestId("terms-agree").check();
  await page.getByTestId("terms-continue").click();
  if (!student.key) {
    await page.getByTestId("welcome-later").click();
    await expect(page.getByTestId("welcome-dialog")).toBeHidden();
  } else {
    await page.getByTestId("welcome-setup").click();
    await expect(page.getByTestId("provider-dialog")).toBeVisible();
    await page.getByTestId("prov-select").selectOption("groq");
    await expect(page.getByTestId("prov-select"), "newStudent must save the key as Groq: the fake AI provider refuses the default, Gemini").toHaveValue("groq");
    await page.getByTestId("key-input").fill(student.key);
    await page.getByTestId(keyMode === "plain" ? "key-mode-plain" : "key-mode-pass").check();
    await page.getByTestId("key-save").click();
    if (keyMode === "passphrase") {
      // "Protect with a passphrase" sets the vault up first, and its passphrase is the key's.
      student.passphrase = newPassphrase();
      student.recoveryCode = await setUpVault(page, student.passphrase);
    }
    await expect(page.getByTestId("provider-dialog")).toBeHidden();
  }
  if (withVault && !student.passphrase) {
    student.passphrase = newPassphrase();
    await expect(vaultPill(page)).toHaveAttribute("data-status", "off");
    await vaultPill(page).click();
    student.recoveryCode = await setUpVault(page, student.passphrase);
  }
  await expect(vaultPill(page)).toHaveAttribute("data-status", withVault ? "unlocked" : "off");
  await expect(page.getByTestId("first-run")).toBeVisible();
  if (o.lang) await setLang(page, o.lang);

  if (project === false) return student;
  await page.locator("#ideaTopic").fill(project.idea ?? DEFAULT_PROJECT.idea);
  await page.getByTestId("idea-save-title").fill(project.name);
  await page.getByTestId("idea-save").click();
  await expect(page.getByTestId("project-home")).toBeVisible({ timeout: 20_000 });
  const id = /^\/p\/([^/?#]+)/.exec(new URL(page.url()).pathname)?.[1];
  if (!id) throw new Error(`QA newStudent: the project was saved but the page is not on its home (${page.url()}).`);
  student.projectId = id;
  return student;
}

// ---- The vault ------------------------------------------------------------------------------------------------------------------------------------------

/**
 * Whether this browser remembers the student's vault ("Remember on this computer"): the record the app keeps in IndexedDB (lib/vault/remember.ts), read without creating the
 * database if it is not there.
 */
export async function vaultRemembered(page: Page, uid: string): Promise<boolean> {
  return page.evaluate(async (id) => {
    if (!(await indexedDB.databases()).some((d) => d.name === "appuscholar")) return false;
    const opened = await new Promise<IDBDatabase | null>((resolve) => {
      const req = indexedDB.open("appuscholar");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
    if (!opened) return false;
    try {
      if (!opened.objectStoreNames.contains("appu_vault")) return false;
      return await new Promise<boolean>((resolve) => {
        const req = opened.transaction("appu_vault", "readonly").objectStore("appu_vault").count(id);
        req.onsuccess = () => resolve(req.result > 0);
        req.onerror = () => resolve(false);
      });
    } finally {
      opened.close();
    }
  }, uid);
}

/**
 * Reloads the page, so that the vault is locked again (nothing is kept in memory across a reload), and leaves it locked: the pill reads locked, and if the page asked for the
 * passphrase by itself (a page that opens a document does) the ask is cancelled. This is how the spec makes "locked" (section 6). A vault this browser remembers opens again by
 * itself on the reload, so the pill never reads locked: the helper fails saying so (forget it first with forgetOnThisComputer).
 */
export async function lockByReload(page: Page, s: Student): Promise<void> {
  if (!s.passphrase) throw new Error("QA lockByReload: this student has no vault to lock (newStudent was not given vault: on).");
  // A page that holds changes it has not saved yet asks "Leave site?" (beforeunload); the watcher dismisses a dialog nobody announced, and the reload then never finishes.
  await page.reload({ timeout: 30_000 }).catch((e: unknown) => {
    throw new Error(
      "QA lockByReload: the page did not reload within 30 s. If it asked 'Leave site?' (a beforeunload dialog the watcher dismissed) it holds changes that are not saved yet: wait for the save first, or announce the dialog with qa.expectDialog('beforeunload', true).",
      { cause: e }
    );
  });
  await expect(vaultPill(page), "the vault did not read locked after the reload (is it remembered on this computer? forgetOnThisComputer first)").toHaveAttribute("data-status", "locked");
  // Pages that open sealed things ask for the passphrase as they load, a moment after the pill reads locked, and some ask again after a cancel (O18); a page that does not ask has
  // nothing to cancel. Each ask is cancelled until none comes for a second.
  const dialog = page.getByTestId("pass-dialog");
  let wait = 2_500;
  for (let cancelled = 0; ; cancelled++) {
    const asked = await dialog.waitFor({ state: "visible", timeout: wait }).then(() => true, () => false);
    if (!asked) break;
    if (cancelled === 10) throw new Error("QA lockByReload: the page asked for the passphrase again after each of ten cancels.");
    // A window that is already closing (its exit animation) has no Cancel left to press: that is not a failure, and the next wait sees it gone.
    await page.getByTestId("pass-cancel").click({ timeout: 2_000 }).catch(() => {});
    wait = 1_000;
  }
  await expect(vaultPill(page)).toHaveAttribute("data-status", "locked");
}

/**
 * Unlocks the vault with the student's passphrase: answers the passphrase window if the page has opened it, else presses the pill ("Vault locked") to open it. `remember` ticks
 * "Remember on this computer", and the helper waits until this browser has written the record (it is written a moment after the vault opens), so a reload straight after finds it.
 */
export async function unlock(page: Page, s: Student, o: { remember?: boolean } = {}): Promise<void> {
  if (!s.passphrase) throw new Error("QA unlock: this student has no vault (newStudent was not given vault: on).");
  const lang = await pageLang(page);
  const dialog = page.getByTestId("pass-dialog");
  // A page that has just loaded sealed things asks by itself a moment after the pill reads locked: that window is the one to answer.
  const asked = await dialog.waitFor({ state: "visible", timeout: 1_000 }).then(() => true, () => false);
  if (!asked) {
    await expect(vaultPill(page)).toHaveAttribute("data-status", "locked");
    // The page may ask while the pill is pressed; its window then covers the pill, and is the window wanted.
    await vaultPill(page).click({ timeout: 5_000 }).catch(async (e: unknown) => {
      if (!(await dialog.isVisible())) throw e;
    });
  }
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("pass-message")).toHaveText(T("vault_unlock_hint", {}, lang));
  await page.getByTestId("pass-input").fill(s.passphrase);
  if (o.remember) await page.getByTestId("pass-remember").check();
  await page.getByTestId("pass-ok").click();
  await expect(dialog).toBeHidden();
  await expect(vaultPill(page)).toHaveAttribute("data-status", "unlocked");
  if (o.remember) await expect.poll(() => vaultRemembered(page, s.uid), { message: "this browser did not write the remembered vault" }).toBe(true);
}

/** "Forget on this computer", from the unlocked vault pill's menu (offered only when this browser remembers the vault). Returns when the app says it has forgotten. */
export async function forgetOnThisComputer(page: Page): Promise<void> {
  const lang = await pageLang(page);
  await expect(vaultPill(page)).toHaveAttribute("data-status", "unlocked");
  await vaultPill(page).click();
  const item = page.getByTestId("vault-menu-forget");
  await expect(item, "the menu offers no 'Forget on this computer': this browser does not remember the vault (unlock with remember: true first)").toBeVisible();
  await item.click();
  await expect(page.getByTestId("toast")).toContainText(T("vault_forgotten", {}, lang));
}

// ---- The network ----------------------------------------------------------------------------------------------------------------------------------------

/**
 * The console error the browser prints for a request the app makes while the network is off, for `qa.allow({ consoleErrors: [OFFLINE_CONSOLE] })` in a case that calls goOffline:
 * the watcher counts console errors, and this one is the case's own doing.
 */
export const OFFLINE_CONSOLE: ConsoleAllowance = {
  match: /^Failed to load resource: net::ERR_INTERNET_DISCONNECTED/,
  reason: "the case switched the network off on purpose (goOffline): a request the app makes meanwhile fails, and the browser prints this"
};

/** The network is off (Playwright's offline switch, which also fires the browser's `offline` event). */
export async function goOffline(context: BrowserContext): Promise<void> {
  await context.setOffline(true);
}

/** The network is back (the browser's `online` event fires). */
export async function goOnline(context: BrowserContext): Promise<void> {
  await context.setOffline(false);
}

/**
 * Delays every request to the api by `ms` before it is sent on (a slow network, spec section 6). Returns the function that ends the delay. A request already waiting still waits.
 * A CORS preflight (the browser's own OPTIONS) is not delayed, so that a call takes `ms` and not twice that.
 */
export async function slowApi(context: BrowserContext, ms: number): Promise<() => Promise<void>> {
  const pattern = `${QA_API_ORIGIN}/**`;
  const delay = async (route: Route) => {
    if (route.request().method() !== "OPTIONS") await new Promise((resolve) => setTimeout(resolve, ms));
    // The page may be gone by now.
    await route.fallback().catch(() => {});
  };
  await context.route(pattern, delay);
  return () => context.unroute(pattern, delay);
}

// ---- A second browser -----------------------------------------------------------------------------------------------------------------------------------

/**
 * The same account in another browser: a new browser context signed in with this one's session cookie (and nothing else, so it remembers nothing and a vault is locked there),
 * watched by the case from before it opens a page (`qa.watch`), with one page open. The case closes the context when it is done. `o` are context options; the web address and the
 * window size of `from` are the default.
 */
export async function sameAccountElsewhere(browser: Browser, from: Page | BrowserContext, qa: Qa, o: BrowserContextOptions = {}): Promise<{ context: BrowserContext; page: Page }> {
  const source = "newPage" in from ? from : from.context();
  const open = "newPage" in from ? from.pages()[0] : from;
  const viewport = open?.viewportSize() ?? undefined;
  const { cookies } = await source.storageState();
  const context = await browser.newContext({ baseURL: QA_WEB_ORIGIN, ...(viewport ? { viewport } : {}), ...o, storageState: { cookies, origins: [] } });
  await qa.watch(context);
  return { context, page: await context.newPage() };
}

// ---- Places and language --------------------------------------------------------------------------------------------------------------------------------

export type PlaceName = "idea" | "literature" | "design" | "collect" | "writing" | "review";
/** The stage keys the addresses and test ids use (lib/stages.ts); Literature's is `lit`. */
const STAGE_KEY: Record<PlaceName, string> = { idea: "idea", literature: "lit", design: "design", collect: "collect", writing: "writing", review: "review" };

/**
 * Opens a place of the project (and `tab` of it, as `place-tab-<tab>` names it: "data", "find", "document"...), the way a student moves inside a project: from the project's
 * home or from another place, by the home's row for the stage, with no page load, so an open vault stays open. From anywhere else in the app (the project list, first run) it
 * loads the place's address, which locks a vault that this browser does not remember. Returns when the place's name is on the page.
 */
export async function toPlace(page: Page, projectId: string, place: PlaceName, tab?: string): Promise<void> {
  const stage = STAGE_KEY[place];
  const lang = await pageLang(page);
  const [, p, id, here] = new URL(page.url()).pathname.split("/");
  if (p === "p" && id === projectId) {
    // On a phone an open document fills the screen; Back returns to the place.
    const back = page.getByTestId("doc-back");
    if (await back.isVisible()) await back.click();
    if (here !== stage) {
      if (here !== undefined) await page.getByTestId("place-home").click();
      await page.getByTestId("home-open-" + stage).click();
    }
  } else {
    await page.goto(`/p/${projectId}/${stage}`);
  }
  await expect(page.getByTestId("place-name")).toHaveText(T("stage_name_" + stage, {}, lang));
  if (tab) {
    const link = page.getByTestId("place-tab-" + tab);
    await link.scrollIntoViewIfNeeded();
    if ((await link.getAttribute("aria-current")) !== "true") await link.click();
    await expect(link).toHaveAttribute("aria-current", "true");
  }
}

/** The interface language, as the language button in the header (the phone's Menu holds it there) switches it. Does nothing when the page is in `lang` already; saved when it returns. */
export async function setLang(page: Page, lang: "en" | "hi"): Promise<void> {
  if ((await pageLang(page)) === lang) return;
  await expect(page.getByTestId("app-header")).toBeVisible();
  const saved = page.waitForResponse((r) => r.request().method() === "PATCH" && r.url() === `${QA_API_ORIGIN}/me/settings`, { timeout: 15_000 });
  saved.catch(() => {}); // awaited below; if a step before it fails, its timeout is not an unhandled rejection
  const toggle = page.getByTestId("lang-toggle");
  if (await toggle.isVisible()) await toggle.click();
  else {
    await page.getByTestId("phone-menu").click();
    await page.getByTestId("menu-lang").click();
  }
  await expect(page.locator("html")).toHaveAttribute("lang", lang);
  expect((await saved).ok(), "the language was not saved").toBe(true);
}

// ---- The document ---------------------------------------------------------------------------------------------------------------------------------------

async function editor(page: Page) {
  const loc = page.locator(".ProseMirror").first();
  await expect(loc, "no document is open on the page").toBeVisible();
  return loc;
}

/** The open document's text, as the student sees it (blocks on separate lines). */
export async function docText(page: Page): Promise<string> {
  return (await editor(page)).innerText();
}

/**
 * Types `text` into the open document with the keyboard (a "\n" is Enter, so a new paragraph). `at: "end"` (default) puts the caret at the end of the document first;
 * `"cursor"` types where the caret or selection is (selectInDoc), so the text replaces a selection.
 */
export async function typeInDoc(page: Page, text: string, o: { at?: "end" | "cursor" } = {}): Promise<void> {
  const doc = await editor(page);
  if (o.at === "cursor") {
    if (!(await doc.evaluate((el) => el.contains(document.activeElement)))) await doc.focus();
  } else {
    await doc.focus();
    await doc.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el.lastElementChild ?? el);
      range.collapse(false);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
    });
  }
  await page.keyboard.type(text);
}

/**
 * Selects the first occurrence of `needle` in the open document, with the DOM selection as a drag would make it (tools-b.spec.ts `cursorInParagraph`), and leaves the focus in
 * the document. It may cross formatting inside a paragraph. Throws when the document does not contain it.
 */
export async function selectInDoc(page: Page, needle: string): Promise<void> {
  if (!needle) throw new Error("QA selectInDoc: needs the text to select.");
  const doc = await editor(page);
  await doc.focus();
  const found = await doc.evaluate((root, text) => {
    const nodes: Text[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
    const at = nodes.map((n) => n.data).join("").indexOf(text);
    if (at < 0) return false;
    const locate = (offset: number, atEnd: boolean) => {
      let passed = 0;
      for (const node of nodes) {
        const end = passed + node.data.length;
        if (atEnd ? offset <= end : offset < end) return { node, offset: offset - passed };
        passed = end;
      }
      return null;
    };
    const from = locate(at, false);
    const to = locate(at + text.length, true);
    if (!from || !to) return false;
    const range = document.createRange();
    range.setStart(from.node, from.offset);
    range.setEnd(to.node, to.offset);
    from.node.parentElement?.scrollIntoView({ block: "center" });
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  }, needle);
  if (!found) throw new Error(`QA selectInDoc: the document does not contain ${JSON.stringify(needle.length > 80 ? needle.slice(0, 80) + "…" : needle)}.`);
}

// ---- Downloads --------------------------------------------------------------------------------------------------------------------------------------------

export type Downloaded = { name: string; bytes: Buffer; text(): string; zip(): Promise<Map<string, Buffer>> };

/**
 * Runs `click` (the action that starts a download) and returns the file the page saved: its name, its bytes, its text, and (for a zip) its files by path, folders left out.
 * Fails if no download starts within 30 s, or the download fails.
 */
export async function catchDownload(page: Page, click: () => Promise<void>): Promise<Downloaded> {
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30_000 }), click()]);
  const name = download.suggestedFilename();
  const failure = await download.failure();
  if (failure) throw new Error(`QA catchDownload: the download of ${name} failed: ${failure}`);
  const bytes = readFileSync(await download.path());
  return {
    name,
    bytes,
    text: () => bytes.toString("utf8"),
    zip: async () => {
      const zip = await JSZip.loadAsync(bytes);
      const files = new Map<string, Buffer>();
      for (const entry of Object.values(zip.files)) if (!entry.dir) files.set(entry.name, await entry.async("nodebuffer"));
      return files;
    }
  };
}
