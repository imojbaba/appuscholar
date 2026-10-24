import { randomInt } from "node:crypto";

/**
 * What every fixture file shares (spec section 11).
 *
 * MARK is the run's marker: "QAMK" and six random letters, made once when this module is loaded (each Playwright worker loads it for itself, so the cases of one worker share one
 * and a case reads the same MARK from every fixture). Every fixture carries it, so that a later check can look for it in what the server stored: the MARK in a name, a title or
 * a blob that should have been sealed or never sent is a leak, and a MARK that is not there proves nothing was read (the check is then NOT CHECKED, never a pass).
 */
const LETTERS = "abcdefghijklmnopqrstuvwxyz";
export const MARK: string = "QAMK" + Array.from({ length: 6 }, () => LETTERS[randomInt(LETTERS.length)]).join("");

/** A seeded generator (mulberry32): numbers in [0, 1), the same every time for one seed, so the invented data is the same file from one run to the next apart from the MARK. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One of `items`, chosen by the generator. */
export function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)]!;
}

/** Text made safe to put between tags (the fixtures' HTML is built from plain sentences). */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
