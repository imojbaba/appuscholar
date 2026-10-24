import type { Page } from "@playwright/test";

/**
 * Every toast message shown from now on, in order. One toast replaces another, so two that arrive close together (the key's and the
 * vault migration's) are read from this record rather than from the toast on screen. The record lives in the page: set it up again
 * after a reload.
 */
export async function recordToasts(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const w = window as unknown as { __toasts: string[] };
    w.__toasts = [];
    const host = document.querySelector('[data-testid="toast-host"]')!;
    new MutationObserver(() => {
      const text = host.querySelector('[data-testid="toast"] span')?.textContent;
      if (text && w.__toasts[w.__toasts.length - 1] !== text) w.__toasts.push(text);
    }).observe(host, { childList: true, subtree: true, characterData: true });
  });
  return () => page.evaluate(() => (window as unknown as { __toasts: string[] }).__toasts);
}
