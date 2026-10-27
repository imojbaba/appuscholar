import { expect, type Page, type Route } from "@playwright/test";
import { WEB_ORIGIN } from "./origins";

const CORS = { "access-control-allow-origin": WEB_ORIGIN, "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS" };

/**
 * Answers the key test (/ai/test) in the browser, "OK", as a provider does for a good key: the e2e runs call no provider, and Connect AI tests a key before it keeps it.
 * Registered last, it answers before any /ai/test route the spec set itself (Playwright runs the newest matching route first); both say OK.
 */
export async function answerKeyTests(page: Page): Promise<void> {
  await page.route("**/ai/test", (route: Route) => route.request().method() === "OPTIONS"
    ? route.fulfill({ status: 204, headers: CORS })
    : route.fulfill({ status: 200, contentType: "application/json", headers: CORS, body: JSON.stringify({ ok: true, reply: "OK" }) }));
}

export type ConnectOptions = {
  /** The key typed (default a Groq test value: no provider is called). */
  key?: string;
  /** The AI company (default "groq", chosen through "Using a different AI company?"). */
  provider?: "gemini" | "groq";
  /** How the key is kept (4d): "plain" (Remember on this computer) or "pass" (Protect with a passphrase, which sets the vault up). With a vault already there, 4d is skipped: pass "vault". */
  keep: "plain" | "pass" | "vault";
  /** The new passphrase, for keep "pass". */
  passphrase?: string;
  /** Open Connect AI from the AI pill first (default true); false when it is already open (the idea screen's feedback button opened it). */
  open?: boolean;
};

/**
 * Connect AI as a student walks it (first-run build spec, OJ 2026-10-27): Yes, I have a key; the company; the key; Connect (tested at once); then how it is kept.
 * For "pass", the passphrase is chosen and confirmed in the same window and the recovery sheet is read, ticked and closed with Done; its code is returned.
 */
export async function connectAI(page: Page, o: ConnectOptions): Promise<string | null> {
  await answerKeyTests(page);
  const dialog = page.getByTestId("connect-dialog");
  if (o.open ?? true) await page.getByTestId("ai-pill").click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("data-screen", "ask");
  await page.getByTestId("connect-yes").click();
  const provider = o.provider ?? "groq";
  if (provider !== "gemini") {
    await page.getByTestId("connect-other").click();
    await page.getByTestId("connect-provider").selectOption(provider);
    await expect(page.getByTestId("connect-provider")).toHaveValue(provider);
  }
  await page.getByTestId("connect-key").fill(o.key ?? "gsk_test");
  await page.getByTestId("connect-go").click();
  if (o.keep === "vault") {
    await expect(dialog).toBeHidden();
    return null;
  }
  await expect(dialog).toHaveAttribute("data-screen", "keep");
  if (o.keep === "plain") {
    await page.getByTestId("connect-keep-plain").click();
    await expect(dialog).toBeHidden();
    return null;
  }
  if (!o.passphrase) throw new Error("connectAI: keep \"pass\" needs a passphrase");
  await page.getByTestId("connect-keep-pass").click();
  await expect(dialog).toHaveAttribute("data-screen", "pass");
  await page.getByTestId("new-pass").fill(o.passphrase);
  await page.getByTestId("new-pass2").fill(o.passphrase);
  await expect(page.getByTestId("new-pass-same")).toHaveAttribute("data-ok", "true");
  await page.getByTestId("new-pass-go").click();
  await expect(page.getByTestId("vault-sheet-dialog")).toBeVisible();
  const code = (await page.getByTestId("vault-code").innerText()).trim();
  await page.getByTestId("vault-sheet-saved").check();
  await page.getByTestId("vault-sheet-done").click();
  await expect(page.getByTestId("vault-sheet-dialog")).toBeHidden();
  await expect(dialog).toBeHidden();
  return code;
}
