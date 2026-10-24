/**
 * Wave C, Task C9: the dark theme, walked by a student whose device itself prefers dark.
 *
 * One sign-in and one project per test. The steps:
 *   1. the device prefers dark and the student has chosen nothing: the app opens light (v1 2610), and the header button offers dark;
 *   2. the button switches to dark at once and offers light; the choice is on this device (appu_theme);
 *   3. a reload comes back dark before anything is drawn: the document's own <head> carries the CSP-nonced script, blocking the parser before the body
 *      is read, and <html> says dark at DOMContentLoaded, before the app has started; the button still offers light;
 *   4. the button switches back; a reload stays light.
 * The second test is the Review Focus 5 walk: at 1440 and at 375 px, in dark, the project home, the Writing place with a document (the paper is white
 * and keeps its text and highlight readable), the toast that offers Undo, the header's menus, Help and each dialog wave C built (Guide, problem report,
 * backup check, locked backup, recap, erase the log), the AI key dialog in each tone, the gold buttons and the simulator's chart are drawn, saved as
 * screenshots (C9_SHOTS_DIR, outside the repo) and checked for text under 4.5:1 as Chromium drew it (support/contrast.ts). The third visits every tab of
 * every place, the lists and the sign-in page; the fourth the participant list, its dialogs and the offline bar; the last checks the audit itself on
 * made-up pages. The AI is never called.
 *
 * Run it on its own ports (task 9), as e2e/support/pglite-postgres.mjs describes:
 *   PGLITE_PORT=5491 node e2e/support/pglite-postgres.mjs &
 *   E2E_API_PORT=8891 E2E_WEB_PORT=3091 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5491/postgres \
 *     C9_SHOTS_DIR=/some/folder pnpm --filter @appuscholar/web exec playwright test e2e/wave-c9.spec.ts
 */
import os from "node:os";
import path from "node:path";
import { mkdirSync, readFileSync } from "node:fs";
import { test, expect, type Page, type Route } from "@playwright/test";
import { signIn } from "./support/signin";
import { lowContrast } from "./support/contrast";
import { API_ORIGIN, WEB_ORIGIN } from "./support/origins";

const MESSAGES = path.join(__dirname, "../messages");
const EN = { ...JSON.parse(readFileSync(path.join(MESSAGES, "en.json"), "utf8")), ...JSON.parse(readFileSync(path.join(MESSAGES, "tools/help-theme.en.json"), "utf8")) } as Record<string, string>;
const T = (key: string): string => {
  const raw = EN[key];
  if (raw === undefined) throw new Error("no such key in the dictionaries: " + key);
  return raw;
};

/** Where the screenshots go: not the repo. */
const SHOTS = process.env.C9_SHOTS_DIR ?? path.join(os.tmpdir(), "appuscholar-c9-shots");
mkdirSync(SHOTS, { recursive: true });

const DAY = 86_400_000;
const LIGHT_BG = "rgb(251, 250, 249)", DARK_BG = "rgb(26, 22, 40)", WHITE = "rgb(255, 255, 255)", LIGHT_INK = "rgb(42, 36, 56)";

test.describe.configure({ timeout: 480_000 });
// The student's device prefers dark throughout: the app must still open light, and the light theme must not borrow the device's dark styles.
test.use({ colorScheme: "dark", actionTimeout: 15_000, navigationTimeout: 30_000 });

/** First run's "Save as my project" with a typed idea; the new project's home opens. Returns the project's id. */
async function newProject(page: Page): Promise<string> {
  await signIn(page, { prefix: "c9", newAccount: true, ready: ["first-run"] });
  await page.locator("#ideaTopic").fill("Does a fixed bedtime routine lower exam anxiety in first-year students?");
  await page.locator("#ideaRes").fill("About 60 first-years");
  await page.getByTestId("idea-save").click();
  await expect(page.getByTestId("project-home")).toBeVisible({ timeout: 20_000 });
  const id = /\/p\/([^/?#]+)/.exec(page.url())?.[1];
  if (!id) throw new Error("no project id in " + page.url());
  return id;
}

const theme = (page: Page) => page.evaluate(() => document.documentElement.getAttribute("data-theme"));
const bodyBg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const stored = (page: Page) => page.evaluate(() => localStorage.getItem("appu_theme"));

test("a device that prefers dark opens light; the button switches, is remembered across a reload, and switches back", async ({ page }) => {
  await newProject(page);
  const toggle = page.getByTestId("theme-toggle");

  await test.step("1. no choice made: light, whatever the device prefers; the button offers dark", async () => {
    expect(await page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches)).toBe(true);
    expect(await theme(page)).toBe("light");
    expect(await bodyBg(page)).toBe(LIGHT_BG);
    expect(await stored(page)).toBeNull();
    await expect(toggle).toHaveAttribute("aria-label", T("wc_theme_to_dark"));
  });

  await test.step("2. the button makes it dark at once and offers light; the choice is on this device", async () => {
    await toggle.click();
    expect(await theme(page)).toBe("dark");
    expect(await bodyBg(page)).toBe(DARK_BG);
    expect(await stored(page)).toBe("dark");
    await expect(toggle).toHaveAttribute("aria-label", T("wc_theme_to_light"));
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("dark");
  });

  await test.step("3. a reload is dark before the app starts: the nonced script blocks the parser in <head>, and <html> is dark at DOMContentLoaded", async () => {
    // The document the server sends: the script is inline in <head>, blocking (no async, defer or module), and carries the response's CSP nonce.
    const res = await page.request.get(page.url());
    const html = await res.text();
    const nonce = /'nonce-([^']+)'/.exec(res.headers()["content-security-policy"] ?? "")?.[1];
    expect(nonce, "the response's CSP names a nonce").toBeTruthy();
    const head = html.slice(html.indexOf("<head"), html.indexOf("</head>"));
    const script = /<script\b[^>]*>[^<]*data-theme[^<]*<\/script>/.exec(head);
    expect(script, "an inline script that sets data-theme is in <head>").toBeTruthy();
    expect(script![0]).toContain(`nonce="${nonce}"`);
    expect(script![0]).not.toMatch(/\b(async|defer|type="module")\b/);

    await page.reload({ waitUntil: "domcontentloaded" });
    expect(await theme(page)).toBe("dark");
    expect(await bodyBg(page)).toBe(DARK_BG);
    await expect(page.getByTestId("project-home")).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-label", T("wc_theme_to_light"));
  });

  await test.step("4. the button switches back; a reload stays light", async () => {
    await toggle.click();
    expect(await theme(page)).toBe("light");
    expect(await bodyBg(page)).toBe(LIGHT_BG);
    expect(await stored(page)).toBe("light");
    await expect(toggle).toHaveAttribute("aria-label", T("wc_theme_to_dark"));
    await page.reload({ waitUntil: "domcontentloaded" });
    expect(await theme(page)).toBe("light");
    await expect(page.getByTestId("project-home")).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-label", T("wc_theme_to_dark"));
  });
});

// ---- The walk ---------------------------------------------------------------------------------------------------------------------------------

const SIZES = [{ name: "1440", width: 1440, height: 900 }, { name: "375", width: 375, height: 812 }];

/** The account's last-active key on this device (`appu_last_active_<id>`), found once the check has stamped it. */
async function lastActiveKey(page: Page): Promise<string> {
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("appu_last_active_")).length)).toBe(1);
  return (await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("appu_last_active_"))[0]))!;
}

test("dark at 1440 and 375 px: home, the Writing place with a document, Help and its dialogs are readable", async ({ page }) => {
  const id = await newProject(page);
  const key = await lastActiveKey(page);
  await page.getByTestId("theme-toggle").click();
  expect(await theme(page)).toBe("dark");

  // Two rows of invented AI-use log, so the erase confirm has something to erase.
  const CORS = { "access-control-allow-origin": WEB_ORIGIN, "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS" };
  const LOG = [{ d: "2026-10-20", p: "groq", m: "llama-3.3-70b-versatile", k: "rewrite", g: "text" }, { d: "2026-10-21", p: "groq", m: "llama-3.3-70b-versatile", k: "feedback", g: "feedback" }];
  const isLog = (url: URL) => url.origin === API_ORIGIN && url.pathname === "/ai/log";
  await page.route(isLog, async (route: Route) => {
    const method = route.request().method();
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    if (method === "DELETE") return route.fulfill({ status: 204, headers: CORS });
    return route.fulfill({ status: 200, contentType: "application/json", headers: CORS, body: JSON.stringify(LOG) });
  });

  /**
   * Saves a screenshot and returns the text under 4.5:1 inside `root`. `.text-muted` is left out: Tailwind's text-muted is the chip colour (components
   * say text-muted meaning muted-foreground), so that text is as faint in the light theme; the controller deferred it (the review's note 13).
   */
  const look = async (name: string, size: string, root: string, fullPage = false) => {
    await page.screenshot({ path: path.join(SHOTS, `${name}-${size}.png`) });
    if (fullPage) await page.screenshot({ path: path.join(SHOTS, `${name}-${size}-full.png`), fullPage: true });
    return lowContrast(page, root, ".text-muted");
  };
  const awayFor = async (days: number, flag: string) => {
    await page.addInitScript(([k, ms, f]) => {
      try { if (sessionStorage.getItem(f!)) return; sessionStorage.setItem(f!, "1"); localStorage.setItem(k!, String(Date.now() - Number(ms))); } catch { /* storage blocked */ }
    }, [key, String(days * DAY), flag]);
    await page.reload();
  };

  for (const size of SIZES) {
    const phone = size.width < 701;
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto(`/p/${id}`);
    await expect(page.getByTestId("project-home")).toBeVisible();

    await test.step(`${size.name}: the project home`, async () => {
      expect(await theme(page)).toBe("dark");
      await expect(page.getByTestId("theme-toggle")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(await look("home", size.name, "body", true)).toEqual([]);
    });

    await test.step(`${size.name}: the Writing place with a document; the paper stays white`, async () => {
      await page.goto(`/p/${id}/writing`);
      await expect(page.getByTestId("word-count")).toBeVisible();
      const editor = page.locator(".ProseMirror");
      await editor.click();
      await editor.press("ControlOrMeta+a");
      await editor.press("Delete");
      if (!(await page.getByTestId("format-bar-more").isVisible())) await page.getByTestId("fmt-more").click();
      await expect(page.getByTestId("format-bar-more")).toBeVisible();
      // A highlighted sentence (the picker needs a colour other than its starting one to fire), a plain one, a paragraph in the blue of a Word heading and one in plain black: colours a student picks or pastes.
      await editor.pressSequentially("The highlighted sentence says what the study asks.");
      await editor.press("Shift+Home");
      await page.getByTestId("fmt-highlight").fill("#bbf7d0");
      await editor.press("End");
      await editor.pressSequentially(" This plain sentence follows it.");
      await editor.press("Enter");
      await editor.pressSequentially("A paragraph in a heading blue pasted from another document.");
      await editor.press("Shift+Home");
      await page.getByTestId("fmt-color").fill("#2f5496");
      await editor.press("End");
      await editor.press("Enter");
      await editor.pressSequentially("A paragraph in plain black.");
      await editor.press("Shift+Home");
      await page.getByTestId("fmt-color").fill("#000000");
      await editor.press("End");
      await expect(page.locator(".ProseMirror mark").first()).toBeVisible();

      // The paper is the light page: white, the light ink, and the highlight read in the light theme's own colours.
      const paper = await page.evaluate(() => {
        const ed = document.querySelector(".editor")!;
        const pm = ed.querySelector(".ProseMirror")!;
        const mark = ed.querySelector("mark")!;
        return { bg: getComputedStyle(ed).backgroundColor, ink: getComputedStyle(pm).color, scheme: getComputedStyle(ed).colorScheme, markBg: getComputedStyle(mark).backgroundColor, markInk: getComputedStyle(mark).color };
      });
      expect(paper).toEqual({ bg: WHITE, ink: LIGHT_INK, scheme: "light", markBg: "rgb(187, 247, 208)", markInk: LIGHT_INK });
      expect(await lowContrast(page, ".editor")).toEqual([]);
      expect(await look("writing", size.name, "body", true)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });

    await test.step(`${size.name}: the toast that offers Undo, on its light slab`, async () => {
      await page.getByTestId("doc-new").click();
      await page.getByTestId("doc-name-ok").click();
      await expect(page.getByTestId("doc-select").locator("option")).toHaveCount(2);
      await page.getByTestId("doc-delete").click();
      await page.getByTestId("doc-delete-confirm").click();
      await expect(page.getByTestId("undo-delete")).toBeVisible();
      expect(await look("toast", size.name, "[data-testid=toast]")).toEqual([]);
      const undo = await page.getByTestId("undo-delete").evaluate((el) => ({ ink: getComputedStyle(el).color, slab: getComputedStyle(el.parentElement!).backgroundColor }));
      expect(undo).toEqual({ ink: "rgb(122, 84, 18)", slab: "rgb(234, 230, 243)" });
      await page.getByTestId("undo-delete").click();
      await expect(page.getByTestId("doc-select").locator("option")).toHaveCount(2);
    });

    await test.step(`${size.name}: the header's menus (the red Delete my account item included)`, async () => {
      await page.goto(`/p/${id}`);
      await expect(page.getByTestId("project-home")).toBeVisible();
      if (phone) {
        await page.getByTestId("phone-menu").click();
        await expect(page.getByTestId("phone-menu-list")).toBeVisible();
        expect(await look("menu", size.name, "[data-testid=phone-menu-list]")).toEqual([]);
      } else {
        await page.getByTestId("account-menu-btn").click();
        await expect(page.getByTestId("acct-erase")).toBeVisible();
        expect(await look("menu-account", size.name, "[role=menu]")).toEqual([]);
        await page.keyboard.press("Escape");
        await page.getByTestId("project-switcher").click();
        await expect(page.getByTestId("switcher-menu")).toBeVisible();
        expect(await look("menu-switcher", size.name, "[data-testid=switcher-menu]")).toEqual([]);
      }
      await page.keyboard.press("Escape");
    });

    /** Opens Help from wherever the header keeps it. */
    const openHelp = async () => {
      if (phone) { await page.getByTestId("phone-menu").click(); await page.getByTestId("menu-help").click(); } else await page.getByTestId("help-btn").click();
      await expect(page.getByTestId("help-dialog")).toBeVisible();
    };
    await page.goto(`/p/${id}`);
    await expect(page.getByTestId("project-home")).toBeVisible();

    await test.step(`${size.name}: Help, and the Guide on top of it`, async () => {
      await openHelp();
      expect(await look("help", size.name, "[data-testid=help-dialog]")).toEqual([]);
      await page.getByTestId("help-guide").click();
      await expect(page.getByTestId("guide-dialog")).toBeVisible();
      await page.locator("[data-testid^=guide-section-]").first().locator("summary").click();
      expect(await look("guide", size.name, "[data-testid=guide-dialog]")).toEqual([]);
      await page.getByTestId("guide-close").click();
      await expect(page.getByTestId("guide-dialog")).toBeHidden();
    });

    await test.step(`${size.name}: the problem report and the two backup dialogs`, async () => {
      await page.getByTestId("help-report").click();
      await expect(page.getByTestId("report-dialog")).toBeVisible();
      await page.getByTestId("report-text").fill("The page jumped when I pressed Save.");
      expect(await look("report", size.name, "[data-testid=report-dialog]")).toEqual([]);
      await page.getByTestId("report-close").click();
      await page.getByTestId("help-check-backup").click();
      await expect(page.getByTestId("check-backup-dialog")).toBeVisible();
      expect(await look("backup-check", size.name, "[data-testid=check-backup-dialog]")).toEqual([]);
      await page.getByTestId("bk-check-close").click();
      await page.getByTestId("help-locked-backup").click();
      await expect(page.getByTestId("locked-backup-dialog")).toBeVisible();
      await page.getByTestId("bk-pass1").fill("one passphrase");
      await page.getByTestId("bk-pass2").fill("another passphrase");
      await page.getByTestId("bk-lock-go").click();
      expect(await look("backup-locked", size.name, "[data-testid=locked-backup-dialog]")).toEqual([]);
      await page.getByTestId("bk-lock-cancel").click();
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("help-dialog")).toBeHidden();
    });

    await test.step(`${size.name}: the AI key dialog, in each tone of its test line`, async () => {
      const KEY_CORS = { "access-control-allow-origin": WEB_ORIGIN, "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS" };
      let answer: "ok" | "fail" = "ok";
      const test = async (route: Route) => {
        if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: KEY_CORS });
        return answer === "ok"
          ? route.fulfill({ status: 200, contentType: "application/json", headers: KEY_CORS, body: JSON.stringify({ ok: true, reply: "Hello from the test" }) })
          : route.fulfill({ status: 500, contentType: "application/json", headers: KEY_CORS, body: JSON.stringify({ error: "upstream" }) });
      };
      await page.route((url) => url.origin === API_ORIGIN && url.pathname === "/ai/test", test);
      if (phone) { await page.getByTestId("phone-menu").click(); await page.getByTestId("menu-ai").click(); } else await page.getByTestId("ai-pill").click();
      await expect(page.getByTestId("provider-dialog")).toBeVisible();
      await page.getByTestId("key-test").click();
      await expect(page.getByTestId("key-test-out")).toContainText("no key yet");
      expect(await look("key-warn", size.name, "[data-testid=provider-dialog]")).toEqual([]);
      await page.getByTestId("key-input").fill("AIzaSyInventedKeyForTheTest0123456789");
      await page.getByTestId("key-test").click();
      await expect(page.getByTestId("key-test-out")).toContainText("Hello from the test");
      expect(await look("key-ok", size.name, "[data-testid=provider-dialog]")).toEqual([]);
      answer = "fail";
      await page.getByTestId("key-test").click();
      await expect(page.getByTestId("key-test-out")).toContainText("Not working");
      expect(await look("key-fail", size.name, "[data-testid=provider-dialog]")).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("provider-dialog")).toBeHidden();
    });

    await test.step(`${size.name}: the gold buttons (Ethics) and the simulator's chart (Power)`, async () => {
      await page.goto(`/p/${id}/design/ethics`);
      const gold = page.getByTestId("ec-statement");
      await expect(gold).toBeVisible();
      const pair = () => gold.evaluate((el) => ({ ink: getComputedStyle(el).color, fill: getComputedStyle(el).backgroundColor }));
      expect(await pair()).toEqual({ ink: LIGHT_INK, fill: "rgb(201, 147, 46)" });
      await gold.hover();
      await expect.poll(pair).toEqual({ ink: LIGHT_INK, fill: "rgb(240, 173, 63)" });
      expect(await look("ethics", size.name, "body", true)).toEqual([]);

      await page.goto(`/p/${id}/collect/power`);
      await page.getByTestId("power-sim-toggle").click();
      await page.getByTestId("power-sim-run").click();
      const chart = page.getByTestId("power-sim").locator("svg");
      await expect(chart).toBeVisible();
      const drawn = await chart.evaluate((svg) => {
        const bar = svg.querySelector('rect[fill="#6d28d9"]');
        return { line: getComputedStyle(svg.querySelector("line")!).stroke, bar: bar ? getComputedStyle(bar).fill : null, grey: getComputedStyle(svg.querySelector('rect[fill="#b8b3c9"]')!).fill };
      });
      // the dashed true-effect line follows the page's ink, the powered bars are the darker purple, the others the grey
      expect(drawn).toEqual({ line: "rgb(234, 230, 243)", bar: "rgb(139, 92, 246)", grey: "rgb(184, 179, 201)" });
      expect(await look("power", size.name, "body", true)).toEqual([]);
    });

    await test.step(`${size.name}: erase the log`, async () => {
      await page.goto(`/p/${id}/design/aiuse`);
      await expect(page.getByTestId("panel-design-aiuse")).toBeVisible();
      await expect(page.getByTestId("aiu-rows").locator("input")).toHaveCount(2);
      expect(await look("aiuse", size.name, "body", true)).toEqual([]);
      await page.getByTestId("aiu-erase").click();
      await expect(page.getByTestId("aiu-erase-confirm")).toBeVisible();
      expect(await look("aiuse-erase", size.name, "[data-testid=aiu-erase-confirm]")).toEqual([]);
      await page.getByTestId("aiu-erase-cancel").click();
    });

    await test.step(`${size.name}: the welcome-back recap`, async () => {
      await page.goto(`/p/${id}`);
      await expect(page.getByTestId("project-home")).toBeVisible();
      await awayFor(8, "c9-away-" + size.name);
      await expect(page.getByTestId("recap-dialog")).toBeVisible();
      await page.getByTestId("recap-q1").fill("I was reading about sleep and exams.");
      expect(await look("recap", size.name, "[data-testid=recap-dialog]")).toEqual([]);
      await page.getByTestId("recap-skip").click();
      await expect(page.getByTestId("recap-dialog")).toBeHidden();
    });
  }
});

// ---- Every place and tab ----------------------------------------------------------------------------------------------------------------------

/** The places and their tabs (the first tab is the place's own address). */
const PLACES: Array<[string, string[]]> = [
  ["idea", [""]],
  ["lit", ["find", "reading", "compare", "citations"]],
  ["design", ["overview", "pathway", "protocol", "ethics", "registration", "investigator", "budget", "aiuse"]],
  ["collect", ["participants", "data", "power", "charts", "check", "scales", "coding"]],
  ["writing", ["document", "style", "words"]],
  ["review", ["closeness", "viva", "slides"]]
];

test("dark: every tab of every place has no faint text, and the lists and the sign-in page too", async ({ page }) => {
  const id = await newProject(page);
  await page.getByTestId("theme-toggle").click();
  expect(await theme(page)).toBe("dark");
  const faint: string[] = [];
  const check = async (where: string) => {
    await expect(page.locator("main, [data-testid=place-body], form").first()).toBeVisible();
    for (const f of await lowContrast(page, "body", ".text-muted")) faint.push(`${where}: ${f.where} "${f.text}" ${f.fg} on ${f.bg} is ${f.ratio}`);
  };
  for (const [stage, tabs] of PLACES) {
    for (const tab of tabs) {
      await page.goto(`/p/${id}/${stage}${tab ? "/" + tab : ""}`);
      await expect(page.getByTestId("app-header")).toBeVisible();
      if (stage !== "idea") await expect(page.getByTestId("place-tabs")).toBeVisible();
      await page.waitForLoadState("networkidle");
      await check(`${stage}/${tab || "(first)"}`);
    }
  }
  for (const url of ["/projects", "/start"]) { await page.goto(url); await page.waitForLoadState("networkidle"); await check(url); }
  // The sign-in page is drawn before anyone is signed in, in the theme this device chose.
  await page.context().clearCookies();
  await page.goto("/signin");
  await expect(page.getByTestId("e2e-email")).toBeVisible();
  expect(await theme(page)).toBe("dark");
  await page.screenshot({ path: path.join(SHOTS, "signin-1440.png") });
  for (const f of await lowContrast(page, "body", ".text-muted")) faint.push(`/signin: ${f.where} "${f.text}" ${f.fg} on ${f.bg} is ${f.ratio}`);
  expect(faint).toEqual([]);
});

// ---- The participant list and the offline bar -------------------------------------------------------------------------------------------------

test("dark: the participant list and its dialogs, and the offline bar", async ({ page, context }) => {
  const id = await newProject(page);
  await page.getByTestId("theme-toggle").click();
  expect(await theme(page)).toBe("dark");
  const look = async (name: string, root: string) => {
    await page.screenshot({ path: path.join(SHOTS, `${name}-1440.png`) });
    return lowContrast(page, root, ".text-muted");
  };
  const PASS = "correct horse battery";

  await page.goto(`/p/${id}/collect/participants`);
  await expect(page.getByTestId("pp-panel")).toBeVisible();
  await expect(page.getByTestId("pp-off")).toBeVisible();
  expect(await look("participants-off", "body")).toEqual([]);

  // The list is sealed by the vault: turn it on from the header pill, through the recovery sheet.
  await page.getByTestId("vault-pill").click();
  await expect(page.getByTestId("vault-setup-dialog")).toBeVisible();
  expect(await look("vault-setup", "[data-testid=vault-setup-dialog]")).toEqual([]);
  await page.getByTestId("vault-setup-submit").click();
  await page.getByTestId("pass-input").fill(PASS);
  await page.getByTestId("pass-ok").click();
  await page.getByTestId("pass-input").fill(PASS);
  await page.getByTestId("pass-ok").click();
  await expect(page.getByTestId("vault-sheet-dialog")).toBeVisible();
  expect(await look("vault-sheet", "[data-testid=vault-sheet-dialog]")).toEqual([]);
  await page.getByTestId("vault-sheet-saved").check();
  await page.getByTestId("vault-sheet-done").click();
  await expect(page.getByTestId("vault-sheet-dialog")).toBeHidden();

  await expect(page.getByTestId("pp-add")).toBeVisible();
  expect(await look("participants-empty", "body")).toEqual([]);
  await page.getByTestId("pp-add").click();
  await expect(page.getByTestId("pp-form")).toBeVisible();
  await page.getByTestId("pp-form-name").fill("Priya Sharma");
  expect(await look("participants-form", "[data-testid=pp-form]")).toEqual([]);
  await page.getByTestId("pp-form-save").click();
  await expect(page.getByTestId("pp-form")).toBeHidden();
  await page.getByTestId("pp-paste").click();
  await expect(page.getByTestId("pp-paste-box")).toBeVisible();
  await page.getByTestId("pp-paste-box").fill("Kavya Nair\nImran Khan");
  expect(await look("participants-paste", "[data-testid=pp-paste-panel]")).toEqual([]);
  await page.getByTestId("pp-paste-go").click();
  await expect(page.getByTestId("pp-table")).toBeVisible();
  expect(await look("participants-list", "body")).toEqual([]);
  await page.getByTestId("pp-find").click();
  await expect(page.getByTestId("pp-find-close")).toBeVisible();
  expect(await look("participants-find", "[role=dialog]")).toEqual([]);
  await page.getByTestId("pp-find-close").click();
  await page.getByTestId("pp-destroy").click();
  await expect(page.getByTestId("pp-destroy-dialog")).toBeVisible();
  expect(await look("participants-destroy", "[data-testid=pp-destroy-dialog]")).toEqual([]);
  await page.getByTestId("pp-destroy-cancel").click();

  // The offline bar (a light-purple page would hide its white words): the context goes offline, the bar shows, and it is read.
  await context.setOffline(true);
  await expect(page.getByTestId("offline-bar")).toBeVisible();
  expect(await look("offline-bar", "[data-testid=offline-region]")).toEqual([]);
  const bar = await page.getByTestId("offline-bar").evaluate((el) => ({ ink: getComputedStyle(el).color, fill: getComputedStyle(el).backgroundColor }));
  expect(bar).toEqual({ ink: "rgb(255, 255, 255)", fill: "rgb(109, 40, 217)" });
  await context.setOffline(false);
  await expect(page.getByTestId("offline-bar")).toBeHidden();
});

test("the contrast audit sees faint text, text on a tint, and a colour written with color-mix", async ({ page }) => {
  await page.setContent(`<body style="margin:0;background:#241e38;color:#eae6f3">
    <p id="faint" style="color:#4a3f66">faint</p>
    <p id="fine" style="color:#eae6f3">fine</p>
    <p id="mixed" style="color:color-mix(in oklab, #eae6f3 20%, transparent)">mixed</p>
    <p id="tinted" style="background:rgba(220,38,38,.2);color:#000">black on a red tint over the dark page</p>
    <p id="disabled-parent"><button disabled style="color:#4a3f66">disabled</button></p>
    <p id="decor" aria-hidden="true" style="color:#4a3f66">/</p>
    <p id="skipped" class="skip" style="color:#4a3f66">skipped</p></body>`);
  const found = (await lowContrast(page, "body", ".skip")).map((f) => f.text).sort();
  expect(found).toEqual(["black on a red tint over the dark page", "faint", "mixed"]);
});
