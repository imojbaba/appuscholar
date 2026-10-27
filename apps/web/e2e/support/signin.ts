import { expect, type Page } from "@playwright/test";
import { APP_URL } from "./origins";

/** A fresh @e2e.local address (the e2e provider signs anyone in under that domain); `prefix` tells the specs' accounts apart. */
export function e2eEmail(prefix: string): string {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 7)}@e2e.local`;
}

export type SignInOptions = {
  /** The account's address; default a fresh one from `e2eEmail(prefix)`. */
  email?: string;
  /** Default "u". */
  prefix?: string;
  /** A new account: tick the terms and continue (first run's idea screen is then in front, with nothing over it). */
  newAccount?: boolean;
  /** Test ids that must be visible before the workspace counts as ready. */
  ready?: string[];
};

/** Signs in through the e2e form (`e2e-email` / `e2e-submit`) and waits for the app (`/` forwards to first run, the list or a project). Returns the address used. */
export async function signIn(page: Page, opts: SignInOptions = {}): Promise<string> {
  const email = opts.email ?? e2eEmail(opts.prefix ?? "u");
  await page.goto("/signin");
  await page.getByTestId("e2e-email").fill(email);
  await page.getByTestId("e2e-submit").click();
  await expect(page).toHaveURL(APP_URL);
  if (opts.newAccount) {
    // A new account meets the terms gate; after it, nothing else opens over the page.
    await page.getByTestId("terms-age").check();
    await page.getByTestId("terms-agree").check();
    await page.getByTestId("terms-continue").click();
    await expect(page.getByTestId("terms-dialog")).toBeHidden();
  }
  for (const id of opts.ready ?? []) await expect(page.getByTestId(id)).toBeVisible();
  return email;
}
