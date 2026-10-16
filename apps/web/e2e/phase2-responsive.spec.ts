/**
 * Phase 2, Task 19: phone layout, keyboard and screen-reader pass.
 *
 * Run:  pnpm --filter @appuscholar/web exec playwright test e2e/phase2-responsive.spec.ts
 *
 * Sign-in goes through the e2e form (`e2e-email` / `e2e-submit`), which writes the Auth.js `users` row, so both servers need a
 * DATABASE_URL whose schema has the repo migrations. Recipe (the header of e2e/support/pglite-postgres.mjs): serve the pglite Postgres,
 * export DATABASE_URL, run Playwright; playwright.config.ts starts the api and the web server on that one database, as in production.
 *
 * Third-party axe findings that cannot be fixed in the chrome are listed in AXE_ACCEPTED below with the rule id and the reason.
 */
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./support/signin";

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 768, height: 1024 };
const DESKTOP = { width: 1440, height: 900 };

/** Rule ids accepted for a third-party primitive we do not own. Empty means every serious or critical finding fails the test. */
const AXE_ACCEPTED: string[] = [];

/** A new account past the terms gate and the welcome tour, with the dock and the stage counter on screen. */
const NEW_ACCOUNT = { prefix: "r", newAccount: true, ready: ["dock-tab-tools", "stage-counter"] };

const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const sheetRatio = async (page: Page) => {
  const box = await page.getByTestId("phone-sheet").boundingBox();
  const vh = page.viewportSize()!.height;
  return box!.height / vh;
};

async function axeSerious(page: Page) {
  const r = await new AxeBuilder({ page }).analyze();
  return r.violations
    .filter((v) => (v.impact === "serious" || v.impact === "critical") && !AXE_ACCEPTED.includes(v.id))
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 4).map((n) => n.target.join(" ")).join(" | ")}`);
}

for (const [name, viewport] of [["phone 390", PHONE], ["tablet 768", TABLET], ["desktop 1440", DESKTOP]] as const) {
  test.describe(name, () => {
    test.use({ viewport });

    test("no horizontal scroll, with a tool open and with the AI pane open", async ({ page }) => {
      await signIn(page, NEW_ACCOUNT);
      expect(await noHorizontalScroll(page)).toBe(true);
      await page.getByTestId("dock-tab-ai").click();
      await expect(page.getByTestId("ai-pane")).toBeVisible();
      expect(await noHorizontalScroll(page)).toBe(true);
    });

    test("axe: no serious or critical violation with a tool open and with the AI pane open", async ({ page }) => {
      await signIn(page, NEW_ACCOUNT);
      expect(await axeSerious(page), "tool open").toEqual([]);
      await page.getByTestId("dock-tab-ai").click();
      await expect(page.getByTestId("ai-pane")).toBeVisible();
      expect(await axeSerious(page), "AI pane open").toEqual([]);
    });
  });
}

test.describe("phone 390: sheet, drawer and hit targets", () => {
  test.use({ viewport: PHONE });

  test("the sheet shows both tabs and the stage guide, and its handle resizes between 40% and 85% and persists", async ({ page }) => {
    await signIn(page, NEW_ACCOUNT);
    const sheet = page.getByTestId("phone-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId("dock-tab-tools")).toBeVisible();
    await expect(sheet.getByTestId("dock-tab-ai")).toBeVisible();
    await expect(sheet.getByRole("navigation", { name: "Stage guide" })).toBeVisible();
    await expect(sheet.getByTestId("stage-counter")).toBeVisible();
    // pinned to the bottom edge, 46% tall by default
    const box = (await sheet.boundingBox())!;
    expect(Math.round(box.y + box.height)).toBe(PHONE.height);
    expect(Math.abs((await sheetRatio(page)) - 0.46)).toBeLessThan(0.01);

    const drag = async (toY: number) => {
      const h = (await page.getByTestId("sheet-handle").boundingBox())!;
      await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
      await page.mouse.down();
      await page.mouse.move(h.x + h.width / 2, (h.y + toY) / 2, { steps: 4 });
      await page.mouse.move(h.x + h.width / 2, toY, { steps: 4 });
      await page.mouse.up();
    };
    const saved = () => page.waitForResponse((r) => r.url().endsWith("/me/settings") && r.request().method() === "PATCH");

    let patch = saved();
    await drag(PHONE.height * 0.3);
    await patch;
    const mid = await sheetRatio(page);
    expect(mid).toBeGreaterThan(0.6);
    expect(mid).toBeLessThan(0.8);

    patch = saved();
    await drag(2); // as far up as the finger goes: clamped to 85%
    await patch;
    expect(await sheetRatio(page)).toBeCloseTo(0.85, 1);

    patch = saved();
    await drag(PHONE.height - 2); // as far down as it goes: clamped to 40%
    await patch;
    const low = await sheetRatio(page);
    expect(low).toBeCloseTo(0.4, 1);

    patch = saved();
    await drag(PHONE.height * 0.3);
    await patch;
    const kept = await sheetRatio(page);
    await page.reload();
    await expect(page.getByTestId("phone-sheet")).toBeVisible();
    expect(await sheetRatio(page)).toBeCloseTo(kept, 2);
    // the document can still be scrolled clear of the sheet: the page reserves the sheet's height at its bottom
    expect(await noHorizontalScroll(page)).toBe(true);
  });

  test("the handle also moves with the arrow keys and is announced as a separator with its value", async ({ page }) => {
    await signIn(page, NEW_ACCOUNT);
    const handle = page.getByTestId("sheet-handle");
    await expect(handle).toHaveAttribute("role", "separator");
    await expect(handle).toHaveAttribute("aria-valuemin", "40");
    await expect(handle).toHaveAttribute("aria-valuemax", "85");
    await expect(handle).toHaveAttribute("aria-valuenow", "46");
    await handle.focus();
    await page.keyboard.press("ArrowUp");
    await expect(handle).toHaveAttribute("aria-valuenow", "51");
    await page.keyboard.press("End");
    await expect(handle).toHaveAttribute("aria-valuenow", "85");
    await page.keyboard.press("Home");
    await expect(handle).toHaveAttribute("aria-valuenow", "40");
  });

  test("the menu button opens the tool drawer with focus inside; Escape closes it and focus returns; picking a tool closes it", async ({ page }) => {
    await signIn(page, NEW_ACCOUNT);
    const menu = page.getByTestId("phone-menu");
    await expect(page.getByTestId("sidebar")).toHaveCount(0); // one copy of the tool list at a time
    await menu.click();
    const drawer = page.getByTestId("sidebar-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute("aria-label", "Writing tools");
    expect(await page.evaluate(() => !!document.activeElement?.closest("[data-testid=sidebar-drawer]"))).toBe(true);
    // focus is trapped: tabbing never leaves the drawer
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest("[data-testid=sidebar-drawer]"))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(menu).toBeFocused();

    await menu.click();
    await expect(drawer).toBeVisible();
    await drawer.getByTestId("tool-chat").click();
    await expect(drawer).toBeHidden();
    await expect(page.getByTestId("dock-tab-tools")).toContainText("Ask Appuscholar");
  });

  test("New Research Project from the drawer closes it and hands focus to the dialog", async ({ page }) => {
    await signIn(page, NEW_ACCOUNT);
    await page.getByTestId("phone-menu").click();
    await page.getByTestId("new-project-tab").click();
    await expect(page.getByTestId("sidebar-drawer")).toBeHidden();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest("[role=dialog]"))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("axe: no serious or critical violation with the drawer open or with a dialog open", async ({ page }) => {
    await signIn(page, NEW_ACCOUNT);
    await page.getByTestId("phone-menu").click();
    await expect(page.getByTestId("sidebar-drawer")).toBeVisible();
    expect(await axeSerious(page), "drawer open").toEqual([]);
    await page.keyboard.press("Escape");
    await page.getByTestId("help-btn").click();
    await expect(page.getByTestId("help-dialog")).toBeVisible();
    expect(await axeSerious(page), "help dialog open").toEqual([]);
  });

  test("every button in the header, project bar, action row, format bar, sheet and drawer is at least 44px tall", async ({ page }) => {
    await signIn(page, NEW_ACCOUNT);
    const sweep = () => page.evaluate((roots) => {
      const out: string[] = [];
      for (const sel of roots) {
        document.querySelectorAll(`${sel} button`).forEach((b) => {
          const r = b.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) return; // not rendered
          if (b.classList.contains("bub-insert")) return; // chat's inline Insert link
          if (r.height < 44) out.push(`${sel} ${b.getAttribute("data-testid") ?? b.textContent?.trim()} ${r.height}`);
        });
      }
      return out;
    }, ["[role=dialog]", ".hdr", "[data-testid=project-bar]", "[data-testid=action-row]", "[data-testid=format-bar]", ".dock-wrap", ".toast"]);
    expect(await sweep()).toEqual([]);
    expect(await page.locator(".hdr button:visible").count()).toBeGreaterThanOrEqual(4);
    expect(await page.locator("[data-testid=action-row] button").count()).toBeGreaterThanOrEqual(5);
    expect(await page.locator("[data-testid=format-bar] button:visible").count()).toBeGreaterThanOrEqual(5);
    // the AI tab of the sheet
    await page.getByTestId("dock-tab-ai").click();
    expect(await sweep()).toEqual([]);
    // the drawer
    await page.getByTestId("phone-menu").click();
    await expect(page.getByTestId("sidebar-drawer")).toBeVisible();
    expect(await sweep()).toEqual([]);
    await page.keyboard.press("Escape");
    // an open dialog (Help), its close X included
    await page.getByTestId("help-btn").click();
    await expect(page.getByTestId("help-dialog")).toBeVisible();
    expect(await sweep()).toEqual([]);
    const x = (await page.getByTestId("help-dialog").locator("[data-slot=dialog-close]").boundingBox())!;
    expect(x.width).toBeGreaterThanOrEqual(44);
    expect(x.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press("Escape");
  });

  test("a dialog opened from the drawer gives focus back to the menu button", async ({ page }) => {
    await signIn(page, NEW_ACCOUNT);
    const menu = page.getByTestId("phone-menu");
    await menu.click();
    await page.getByTestId("projects-tab").click();
    await expect(page.getByTestId("sidebar-drawer")).toBeHidden();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(menu).toBeFocused();
  });

  test("the width splitter is out of the accessibility tree on a phone", async ({ page }) => {
    await signIn(page, NEW_ACCOUNT);
    await expect(page.getByTestId("dock-splitter")).toBeHidden();
    await expect(page.getByRole("separator", { name: "Resize side panel" })).toHaveCount(0);
  });

  test("the header is two rows and does not overlap the provider pill or project bar; the bar's buttons scroll sideways", async ({ page }) => {
    await signIn(page, NEW_ACCOUNT);
    const rect = async (sel: string) => (await page.locator(sel).first().boundingBox())!;
    const hdr = await rect(".hdr");
    const sub = await rect(".subbar");
    const bar = await rect("[data-testid=project-bar]");
    expect(hdr.y + hdr.height).toBeLessThanOrEqual(sub.y + 1);
    expect(sub.y + sub.height).toBeLessThanOrEqual(bar.y + 1);
    const ver = await rect("[data-testid=app-version]");
    const h1 = await rect(".brand h1");
    expect(ver.y).toBeGreaterThanOrEqual(h1.y + h1.height - 1); // the version pill sits under the wordmark
    const scroller = page.locator("[data-testid=project-bar] .btns");
    expect(await scroller.evaluate((el) => getComputedStyle(el).overflowX)).toBe("auto");
    await expect(page.getByTestId("project-bar-status")).toBeHidden();
  });
});

test.describe("keyboard and screen reader", () => {
  test.use({ viewport: DESKTOP });

  test("Tab order runs header, provider pill, project bar, sidebar, document, dock", async ({ page }) => {
    await signIn(page, NEW_ACCOUNT);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.locator(".hdr .brand").evaluate((el) => (el as HTMLElement).setAttribute("tabindex", "-1"));
    await page.locator(".hdr .brand").focus();
    const seen: string[] = [];
    for (let i = 0; i < 160; i++) {
      await page.keyboard.press("Tab");
      const region = await page.evaluate(() => {
        const a = document.activeElement;
        if (!a) return "none";
        if (a.closest(".hdr")) return "header";
        if (a.closest(".subbar")) return "provider";
        if (a.closest("[data-testid=project-bar]")) return "project-bar";
        if (a.closest(".sidebar")) return "sidebar";
        if (a.closest(".doc")) return "document";
        if (a.closest(".dock-wrap")) return "dock";
        return "other";
      });
      if (seen[seen.length - 1] !== region) seen.push(region);
      if (region === "other" || region === "none") break;
      if (seen.includes("dock") && region !== "dock") break;
    }
    expect(seen.slice(0, 6)).toEqual(["header", "provider", "project-bar", "sidebar", "document", "dock"]);
  });

  test("a dialog traps focus and gives it back to its opener", async ({ page }) => {
    await signIn(page, NEW_ACCOUNT);
    const help = page.getByTestId("help-btn");
    await help.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest("[role=dialog]"))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(help).toBeFocused();
  });

  test("the terms gate keeps focus inside and Escape does not dismiss it", async ({ page }) => {
    await page.goto("/signin");
    await page.getByTestId("e2e-email").fill(`g${Date.now()}@e2e.local`);
    await page.getByTestId("e2e-submit").click();
    const gate = page.getByTestId("terms-dialog");
    await expect(gate).toBeVisible();
    expect(await page.evaluate(() => !!document.activeElement?.closest("[data-testid=terms-dialog]"))).toBe(true);
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest("[data-testid=terms-dialog]"))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(gate).toBeVisible();
    expect(await page.evaluate(() => !!document.activeElement?.closest("[data-testid=terms-dialog]"))).toBe(true);
  });

  test("the toast host and the AI note are polite live regions", async ({ page }) => {
    await signIn(page, NEW_ACCOUNT);
    // the host exists before any toast, so the first message is announced
    await expect(page.getByTestId("toast-host")).toHaveAttribute("aria-live", "polite");
    await expect(page.getByTestId("toast-host")).toHaveAttribute("role", "status");
    await page.getByTestId("dock-tab-ai").click();
    await expect(page.getByTestId("ai-out")).toHaveAttribute("aria-live", "polite");
  });
});
