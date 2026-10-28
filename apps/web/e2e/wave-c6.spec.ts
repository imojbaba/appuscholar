/**
 * Wave C, Task C6: the locked backup and "Check a backup file", from Help.
 *
 * Run it with the recipe in e2e/support/pglite-postgres.mjs's header (api and web server on one pglite Postgres), on this task's ports:
 *   PGLITE_PORT=5488 node e2e/support/pglite-postgres.mjs &
 *   E2E_API_PORT=8888 E2E_WEB_PORT=3088 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5488/postgres \
 *     pnpm --filter @appuscholar/web exec playwright test e2e/wave-c6.spec.ts
 *
 * A new account writes one sentence, then makes a locked backup from Help (a short passphrase and a mismatch are refused inside the window; the
 * download is captured), and checks it through the real file chooser: a wrong passphrase says so, the right one shows what the file holds. The
 * plain zip from Export all my work and a file that is not a backup are checked too. The check must not call the api. Every sentence asserted is
 * read from the dictionary, so it is byte-equal to what the dialog shows.
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { test, expect, type Page, type Request } from "@playwright/test";
import { signIn } from "./support/signin";
import { makeStudy } from "./support/study";
import { API_ORIGIN } from "./support/origins";

const dict = (f: string) => JSON.parse(readFileSync(path.join(__dirname, f), "utf8")) as Record<string, string>;
const EN = { ...dict("../messages/en.json"), ...dict("../messages/tools/help-backup.en.json") };
/** t() as lib/i18n.tsx's tFormat does it: the English sentence with its {vars} filled in. */
function T(key: string, vars?: Record<string, string | number>): string {
  const raw = EN[key];
  if (raw === undefined) throw new Error("no such key: " + key);
  return vars ? raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : raw;
}

/** A message as a pattern: its text exact, each {hole} the pattern given for it (a group to capture it). */
function RX(key: string, holes: Record<string, string>): RegExp {
  const parts = T(key).split(/(\{\w+\})/);
  return new RegExp("^" + parts.map((p) => { const m = /^\{(\w+)\}$/.exec(p); return m ? holes[m[1]!]! : p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("") + "$");
}
const FOUND = { n: "1", w: "(\\d+)", d: "\\d{4}-\\d{2}-\\d{2}" };

const PROJECT = "Sleep and memory study";
const TOPIC = "Does a good night of sleep help first-year students remember what they read?";
const SENTENCE = "Sleep helps students remember what they read.";
const PASS = "tea and toast at dawn";
const WRONG = "tea and toast at dusk";

const isDocPut = (r: { request(): Request; url(): string }) => r.request().method() === "PUT" && /\/documents\/[0-9a-f-]+$/.test(r.url());

// A stuck step fails in seconds with its own message instead of eating the whole test timeout.
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });

/** Chooses `file` in the check dialog through the browser's own file chooser. */
async function choose(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer }) {
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByTestId("bk-check-file").click()]);
  await chooser.setFiles(file);
}

test("locked backup and check: make it, open it with the wrong passphrase and the right one, check the plain zip and a stranger", async ({ page }) => {
  test.setTimeout(180_000);
  let lockedPath = "";
  let plainPath = "";
  let lockedWords = -1;

  await test.step("1. sign in with a new account, start a study, write one sentence", async () => {
    await signIn(page, { prefix: "c6", newAccount: true, ready: ["project-list"] });
    await makeStudy(page, { name: PROJECT, question: TOPIC });
    await page.getByTestId("home-open-writing").click();
    await expect(page.getByTestId("doc-select")).toBeVisible();
    const saved = page.waitForResponse((r) => isDocPut(r) && r.ok() && (r.request().postData() ?? "").includes(SENTENCE));
    await page.locator(".ProseMirror").click();
    await page.locator(".ProseMirror").pressSequentially(SENTENCE);
    await saved;
  });

  await test.step("2. Help, Locked backup: a short passphrase and a mismatch are refused inside the window, nothing is downloaded", async () => {
    await page.getByTestId("help-btn").click();
    await expect(page.getByTestId("help-dialog")).toBeVisible();
    await page.getByTestId("help-locked-backup").click();
    await expect(page.getByTestId("locked-backup-dialog")).toBeVisible();
    await expect(page.getByTestId("locked-backup-dialog")).toContainText(T("bk_m_create"));
    let downloads = 0;
    page.on("download", () => { downloads++; });
    await page.getByTestId("bk-pass1").fill("too short");
    await page.getByTestId("bk-pass2").fill("too short");
    await page.getByTestId("bk-lock-go").click();
    await expect(page.getByTestId("bk-lock-verdict")).toHaveText(T("bk_err_short"));
    await page.getByTestId("bk-pass1").fill(PASS);
    await page.getByTestId("bk-pass2").fill(PASS + "!");
    await page.getByTestId("bk-lock-go").click();
    await expect(page.getByTestId("bk-lock-verdict")).toHaveText(T("bk_err_match"));
    expect(downloads).toBe(0);
  });

  await test.step("3. the matching passphrase makes appuscholar-backup-<date>.locked: magic bytes, 600,000 rounds, no plain text, the export is audited, the backup is stamped", async () => {
    await page.getByTestId("bk-pass2").fill(PASS);
    const audited = page.waitForResponse((r) => r.request().method() === "POST" && r.url() === API_ORIGIN + "/me/export-audit" && r.ok());
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("bk-lock-go").click()]);
    expect(download.suggestedFilename()).toMatch(/^appuscholar-backup-\d{4}-\d{2}-\d{2}\.locked$/);
    await audited;
    await expect(page.getByTestId("bk-lock-verdict")).toHaveText(T("wc_bk_done"));
    lockedPath = await download.path();
    const bytes = readFileSync(lockedPath);
    expect(bytes.subarray(0, 9).toString("latin1")).toBe("APPULOCK2");
    const headLen = bytes.readUInt32BE(9);
    expect(JSON.parse(bytes.subarray(13, 13 + headLen).toString("utf8"))).toMatchObject({ kdf: "PBKDF2-SHA256", iter: 600_000 });
    // A plain zip would show the project's folder name and the file names in the clear.
    expect(bytes.toString("latin1")).not.toContain(PROJECT);
    expect(bytes.toString("latin1")).not.toContain("index.json");
    // The form has gone and the passphrase is nowhere on the page or in this device's storage.
    await expect(page.getByTestId("bk-pass1")).toHaveCount(0);
    await expect(page.getByTestId("bk-lock-cancel")).toHaveText(T("close_btn"));
    // The stamp is this student's (appu_last_backup_<id>), never the old device-wide key.
    const stored = await page.evaluate(() => ({ keys: Object.keys(localStorage).filter((k) => k.startsWith("appu_last_backup")), all: JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) }));
    expect(stored.keys).toHaveLength(1);
    expect(stored.keys[0]).toMatch(/^appu_last_backup_.+/);
    expect(Number(await page.evaluate((k) => localStorage.getItem(k), stored.keys[0]!))).toBeGreaterThan(0);
    expect(stored.all).not.toContain(PASS);
    expect(await page.content()).not.toContain(PASS);
    await page.getByTestId("bk-lock-cancel").click();
    await expect(page.getByTestId("locked-backup-dialog")).toHaveCount(0);
  });

  await test.step("4. Help, Export all my work, for a plain file to check", async () => {
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("help-export").click()]);
    expect(download.suggestedFilename()).toMatch(/^appuscholar-export-\d{4}-\d{2}-\d{2}\.zip$/);
    plainPath = await download.path();
    const zip = await JSZip.loadAsync(readFileSync(plainPath));
    expect(Object.keys(zip.files)).toEqual(expect.arrayContaining(["index.json", "writing-process-record.txt"]));
  });

  await test.step("5. Check a backup file: the locked file asks for its passphrase; a wrong one is refused inside the window", async () => {
    await page.getByTestId("help-check-backup").click();
    await expect(page.getByTestId("check-backup-dialog")).toBeVisible();
    await expect(page.getByTestId("bk-last-verify")).toHaveText(T("bk_never_verify"));
    await expect(page.getByTestId("bk-check-pass")).toHaveCount(0);
    await choose(page, lockedPath);
    await expect(page.getByTestId("bk-check-pass")).toBeVisible();
    await expect(page.getByTestId("bk-check-go")).toBeDisabled();
    await page.getByTestId("bk-check-pass").fill(WRONG);
    await page.getByTestId("bk-check-go").click();
    await expect(page.getByTestId("bk-check-error")).toHaveText(T("bk_err_wrong"));
    await expect(page.getByTestId("bk-check-result")).toHaveCount(0);
    await expect(page.getByTestId("bk-last-verify")).toHaveText(T("bk_never_verify"));
  });

  await test.step("6. the right passphrase shows what the file holds, and the check calls no api", async () => {
    const api: string[] = [];
    const onRequest = (r: Request) => { if (r.url().startsWith(API_ORIGIN)) api.push(r.method() + " " + r.url()); };
    page.on("request", onRequest);
    await page.getByTestId("bk-check-pass").fill(PASS);
    await page.getByTestId("bk-check-go").click();
    await expect(page.getByTestId("bk-check-summary")).toBeVisible();
    page.off("request", onRequest);
    const summary = (await page.getByTestId("bk-check-summary").innerText()).trim();
    // One written document, about so many words (v1's sentence).
    const found = RX("wc_bk_check_ok_locked", FOUND).exec(summary);
    expect(found, summary).not.toBeNull();
    lockedWords = Number(found![1]);
    expect(lockedWords).toBeGreaterThanOrEqual(0);
    await expect(page.getByTestId("bk-check-error")).toHaveCount(0);
    await expect(page.getByTestId("bk-check-problems")).toHaveCount(0);
    await expect(page.getByTestId("bk-last-verify")).toHaveText(/Last time you checked a backup file: \d{4}-\d{2}-\d{2}\./);
    expect(api).toEqual([]);
    const verified = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("appu_last_verify")));
    expect(verified).toHaveLength(1);
    expect(verified[0]).toMatch(/^appu_last_verify_.+/);
    expect(Number(await page.evaluate((k) => localStorage.getItem(k), verified[0]!))).toBeGreaterThan(0);
  });

  await test.step("7. the plain zip needs no passphrase and reads the same counts; a file that is not a backup is refused", async () => {
    await choose(page, plainPath);
    await expect(page.getByTestId("bk-check-pass")).toHaveCount(0);
    await page.getByTestId("bk-check-go").click();
    await expect(page.getByTestId("bk-check-summary")).toBeVisible();
    const plain = RX("bk_verify_ok", FOUND).exec((await page.getByTestId("bk-check-summary").innerText()).trim());
    expect(plain).not.toBeNull();
    expect(Number(plain![1])).toBe(lockedWords);
    await choose(page, { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("just some words") });
    await page.getByTestId("bk-check-go").click();
    await expect(page.getByTestId("bk-check-error")).toHaveText(T("bk_verify_bad"));
    await expect(page.getByTestId("bk-check-result")).toHaveCount(0);
    await page.getByTestId("bk-check-close").click();
    await expect(page.getByTestId("check-backup-dialog")).toHaveCount(0);
  });
});
