/**
 * Wave C, Task C7: restore your own backup, and the backup reminder.
 *
 * Run it with the recipe in e2e/support/pglite-postgres.mjs's header (api and web server on one pglite Postgres), on this task's ports:
 *   PGLITE_PORT=5489 node e2e/support/pglite-postgres.mjs &
 *   E2E_API_PORT=8889 E2E_WEB_PORT=3089 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5489/postgres \
 *     pnpm --filter @appuscholar/web exec playwright test e2e/wave-c7.spec.ts
 *
 * A new account saves a project and writes one sentence, then makes the account export from Help (the download is captured; it stamps a backup for
 * this student) and restores that file through the real file chooser: the dialog reads it, says what will happen, and adds "<project> (restored)"
 * with its document. Every request the restore makes is a POST of a new project or a write under a new id; none touches the first project. The new
 * project opens with the same sentence in its document. Then the stamp is cleared and 200 words are written, and after a reload the reminder
 * appears as a strip under the header once the 4 seconds are up; at 1280 and 375 px it lies below the header, fits the width, and no button, link
 * or field of the header or the page is under it; moving to the project list keeps it on screen at once (decided once per page load); Later hides
 * it, stores a 3-day snooze for this student, and a reload brings nothing back.
 * Every sentence asserted is read from the dictionaries, so it is byte-equal to what the dialog shows. The AI is never called.
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { test, expect, type Page, type Request } from "@playwright/test";
import { signIn } from "./support/signin";
import { makeStudy } from "./support/study";
import { API_ORIGIN } from "./support/origins";
import { cursorToEnd } from "./support/editor";

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

const PROJECT = "Sleep and memory study";
const SUFFIX = T("wc_bk_rs_suffix");
const RESTORED = PROJECT + " " + SUFFIX;
const TOPIC = "Does a good night of sleep help first-year students remember what they read?";
const SENTENCE = "Sleep helps students remember what they read.";
const LONG = Array.from({ length: 20 }, () => "Students who sleep well remember more of what they read.").join(" ");

const isDocPut = (r: { request(): Request; url(): string }) => r.request().method() === "PUT" && /\/documents\/[0-9a-f-]+$/.test(r.url());

// A stuck step fails in seconds with its own message instead of eating the whole test timeout.
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });

const nudge = (page: Page) => page.getByTestId("backup-nudge");
const stampKeys = (page: Page, base: string) => page.evaluate((b) => Object.keys(localStorage).filter((k) => k.startsWith(b)), base);

test("restore adds the backup as new projects and leaves the first alone; the reminder shows after 4 s and Later snoozes it", async ({ page }) => {
  test.setTimeout(240_000);
  let zipPath = "";
  let firstId = "";

  await test.step("1. sign in with a new account, start a study, write one sentence", async () => {
    await signIn(page, { prefix: "c7", newAccount: true, ready: ["project-list"] });
    firstId = await makeStudy(page, { name: PROJECT, question: TOPIC });
    expect(firstId).not.toBe("");
    await page.getByTestId("home-open-writing").click();
    await expect(page.getByTestId("doc-select")).toBeVisible();
    const saved = page.waitForResponse((r) => isDocPut(r) && r.ok() && (r.request().postData() ?? "").includes(SENTENCE));
    await page.locator(".ProseMirror").click();
    await page.locator(".ProseMirror").pressSequentially(SENTENCE);
    await saved;
  });

  await test.step("2. Help, Export all my work: the zip is downloaded and a backup is stamped for this student", async () => {
    await page.getByTestId("help-btn").click();
    await expect(page.getByTestId("help-dialog")).toBeVisible();
    expect(await stampKeys(page, "appu_last_backup")).toEqual([]);
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("help-export").click()]);
    expect(download.suggestedFilename()).toMatch(/^appuscholar-export-\d{4}-\d{2}-\d{2}\.zip$/);
    zipPath = await download.path();
    const zip = await JSZip.loadAsync(readFileSync(zipPath));
    expect(Object.keys(zip.files)).toEqual(expect.arrayContaining(["index.json", "writing-process-record.txt"]));
    await expect.poll(() => stampKeys(page, "appu_last_backup")).toHaveLength(1);
    const keys = await stampKeys(page, "appu_last_backup");
    expect(keys[0]).toMatch(/^appu_last_backup_.+/);
    expect(Number(await page.evaluate((k) => localStorage.getItem(k), keys[0]!))).toBeGreaterThan(0);
  });

  await test.step("3. Restore from backup: the dialog reads the file and says what will happen before it adds anything", async () => {
    const writes: string[] = [];
    page.on("request", (r) => { if (r.url().startsWith(API_ORIGIN) && r.method() !== "GET" && r.method() !== "OPTIONS") writes.push(r.method() + " " + r.url().slice(API_ORIGIN.length)); });
    await expect(page.getByTestId("help-restore-backup")).toHaveText(T("wc_bk_restore_btn"));
    await page.getByTestId("help-restore-backup").click();
    await expect(page.getByTestId("restore-backup-dialog")).toBeVisible();
    await expect(page.getByTestId("restore-backup-dialog")).toContainText(T("wc_bk_rs_intro"));
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByTestId("bk-restore-file").click()]);
    await chooser.setFiles(zipPath);
    await expect(page.getByTestId("bk-restore-pass")).toHaveCount(0);
    await page.getByTestId("bk-restore-read").click();
    const confirm = page.getByTestId("bk-restore-confirm");
    await expect(confirm).toBeVisible();
    // The confirm's sentence, its holes (counts, the day) as patterns, anywhere in the box.
    const sentence = RX("wc_bk_rs_confirm", { n: "\\d+", w: "\\d+", d: "[\\d-]+", suffix: SUFFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") });
    await expect(confirm).toContainText(new RegExp(sentence.source.slice(1, -1)));
    await expect(confirm).toContainText(T("wc_bk_rs_note"));
    // Nothing has been written yet.
    expect(writes).toEqual([]);

    await page.getByTestId("bk-restore-go").click();
    await expect(page.getByTestId("bk-restore-result")).toBeVisible();
    await expect(page.getByTestId("bk-restore-result")).toContainText(T("wc_bk_rs_ok"));
    await expect(page.getByTestId("bk-restore-made").locator("li")).toHaveText([T("wc_bk_rs_made", { name: RESTORED, n: 1 })]);
    await expect(page.getByTestId("bk-restore-failed")).toHaveCount(0);
    await expect(page.getByTestId("bk-restore-error")).toHaveCount(0);

    // Only new things were made: a project, its document, its stage data (if the first project had any); never a write on the first project.
    const mine = writes.filter((w) => !w.includes("/me/"));
    expect(mine.length).toBeGreaterThanOrEqual(2);
    expect(mine[0]).toBe("POST /projects");
    for (const w of mine) {
      const ok = w === "POST /projects" || /^POST \/projects\/[0-9a-f-]+\/documents$/.test(w) || /^PUT \/projects\/[0-9a-f-]+\/blobs\/[^/]+$/.test(w);
      expect(ok, w).toBe(true);
      expect(w, w).not.toContain(firstId);
    }
    // Restoring does not count as a new backup.
    expect(await stampKeys(page, "appu_last_backup")).toHaveLength(1);
    await page.getByTestId("bk-restore-close").click();
    await expect(page.getByTestId("restore-backup-dialog")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("help-dialog")).toHaveCount(0);
  });

  await test.step("4. the project list now holds both; the restored project opens with the same sentence in its document", async () => {
    await page.goto("/projects");
    await expect(page.getByTestId("project-list")).toBeVisible();
    await expect(page.getByTestId("project-row-title")).toHaveText([RESTORED, PROJECT]);
    await page.getByTestId("project-row").filter({ hasText: RESTORED }).getByTestId("project-open").click();
    await expect(page.getByTestId("project-home")).toBeVisible();
    expect(/\/p\/([^/?#]+)/.exec(page.url())?.[1]).not.toBe(firstId);
    await page.getByTestId("home-open-writing").click();
    await expect(page.getByTestId("doc-select")).toBeVisible();
    await expect(page.locator(".ProseMirror")).toContainText(SENTENCE);
  });

  await test.step("5. with no backup stamp and 200 words written, a reload brings the reminder as a strip under the header after the 4 seconds", async () => {
    const saved = page.waitForResponse((r) => isDocPut(r) && r.ok() && (r.request().postData() ?? "").includes("Students who sleep well"));
    await page.locator(".ProseMirror").click();
    await cursorToEnd(page.locator(".ProseMirror"));
    await page.keyboard.insertText(" " + LONG);
    await saved;
    await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("appu_last_backup")) localStorage.removeItem(k); });
    await page.reload();
    await expect(page.getByTestId("doc-select")).toBeVisible();
    await expect(nudge(page)).toBeVisible({ timeout: 20_000 });
    const text = (await page.getByTestId("backup-nudge-text").innerText()).trim();
    const m = RX("wc_bk_nudge_new", { w: "(\\d+)" }).exec(text);
    expect(m, text).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(150);
    await expect(page.getByTestId("backup-nudge-now")).toHaveText(T("backup_now"));
    await expect(page.getByTestId("backup-nudge-later")).toHaveText(T("backup_later"));
    // A strip in the page, not a dialog: it is announced from a polite status region, takes no focus and is not positioned over the page.
    await expect(page.locator("[role=dialog]")).toHaveCount(0);
    await expect(page.locator('[role="status"][aria-live="polite"]').filter({ has: nudge(page) })).toHaveCount(1);
    expect(await nudge(page).evaluate((el) => getComputedStyle(el).position)).toBe("static");
    for (const size of [{ width: 1280, height: 720 }, { width: 375, height: 667 }]) {
      await page.setViewportSize(size);
      await expect(nudge(page)).toBeVisible();
      // It lies below the header, inside the width, and nothing the page offers is under it.
      const fit = await page.evaluate(() => {
        const n = document.querySelector('[data-testid="backup-nudge"]')!;
        const nr = n.getBoundingClientRect();
        const header = document.querySelector("header")?.getBoundingClientRect();
        const under: string[] = [];
        for (const el of Array.from(document.querySelectorAll("button, a[href], input, select, textarea, summary, [role=tab], .ProseMirror"))) {
          if (n.contains(el)) continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const ix = Math.min(r.right, nr.right) - Math.max(r.left, nr.left), iy = Math.min(r.bottom, nr.bottom) - Math.max(r.top, nr.top);
          if (ix > 1 && iy > 1) under.push((el.getAttribute("data-testid") ?? el.tagName) + " " + Math.round(ix) + "x" + Math.round(iy));
        }
        return { left: nr.left, right: nr.right, top: nr.top, headerBottom: header ? header.bottom : null, width: window.innerWidth, scrollW: document.documentElement.scrollWidth, under };
      });
      expect(fit.left, "left edge at " + size.width).toBeGreaterThanOrEqual(0);
      expect(fit.right, "right edge at " + size.width).toBeLessThanOrEqual(fit.width);
      expect(fit.scrollW, "no sideways scroll at " + size.width).toBeLessThanOrEqual(fit.width);
      expect(fit.headerBottom, "a header at " + size.width).not.toBeNull();
      expect(fit.top, "below the header at " + size.width).toBeGreaterThanOrEqual(fit.headerBottom! - 1);
      expect(fit.under, "under the strip at " + size.width).toEqual([]);
      for (const id of ["backup-nudge-now", "backup-nudge-later"]) {
        const box = (await page.getByTestId(id).boundingBox())!;
        if (size.width <= 700) expect(box.height, id + " is 44 px on a phone").toBeGreaterThanOrEqual(43.5);
        const hit = await page.getByTestId(id).evaluate((el) => { const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return el === top || el.contains(top); });
        expect(hit, id + " at " + size.width).toBe(true);
      }
    }
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  await test.step("6. it is decided once per page load: going to the project list keeps it on screen at once, without the 4 seconds again", async () => {
    await page.getByTestId("wordmark").click();
    await expect(page.getByTestId("project-list")).toBeVisible();
    await expect(nudge(page)).toBeVisible({ timeout: 1500 });
    await expect(page.getByTestId("backup-nudge-text")).toHaveText(RX("wc_bk_nudge_new", { w: "\\d+" }));
    // Nobody answered it: no snooze, no backup stamp.
    expect(await stampKeys(page, "appu_backup_snooze")).toEqual([]);
    expect(await stampKeys(page, "appu_last_backup")).toEqual([]);
  });

  await test.step("7. Later hides it and snoozes it for 3 days, for this student; a reload brings nothing back", async () => {
    await page.getByTestId("backup-nudge-later").click();
    await expect(nudge(page)).toHaveCount(0);
    await expect.poll(() => stampKeys(page, "appu_backup_snooze")).toHaveLength(1);
    const keys = await stampKeys(page, "appu_backup_snooze");
    expect(keys[0]).toMatch(/^appu_backup_snooze_.+/);
    const until = Number(await page.evaluate((k) => localStorage.getItem(k), keys[0]!));
    const days = (until - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(2.99);
    expect(days).toBeLessThanOrEqual(3);
    await page.reload();
    await expect(page.getByTestId("project-list")).toBeVisible();
    await page.waitForTimeout(7000);
    await expect(nudge(page)).toHaveCount(0);
  });
});
