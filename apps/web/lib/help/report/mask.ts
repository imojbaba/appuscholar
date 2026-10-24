import { maskText } from "@appuscholar/core";

/**
 * What an error message may keep when it goes into a problem report. The report must carry no document text, source, data, key or
 * personal data (plan Review Focus 4), and an engine message often quotes its input: `JSON.parse` on a pasted paragraph says
 * `Unexpected token 'P', "Participan"... is not valid JSON`. So these masks are stricter than v1's `pdMask` (D-C-63).
 */

/** How much of a message is looked at before masking; the masks below are quadratic in the worst case, so a long message is cut first. */
export const HEAD = 400;

const WORD = /[\p{L}\p{M}\p{N}]/u;
const QUOTES = "\"“”„«»`";
const APOSTROPHES = "'‘’";

/** A mark that opens or closes quoted text; an apostrophe inside a word ("can't", "Meera's") is not one. */
function isQuote(s: string, i: number): boolean {
  const c = s[i]!;
  if (QUOTES.includes(c)) return true;
  if (!APOSTROPHES.includes(c)) return false;
  return !(i > 0 && WORD.test(s[i - 1]!) && i + 1 < s.length && WORD.test(s[i + 1]!));
}

/**
 * Everything from the first quote mark to the last becomes `[text]`. Pairing quotes one by one is not enough: the engine puts the document's
 * own text inside its quotes unescaped, so a quote mark in the document ends a pair early and leaves the next words showing. An odd number of
 * marks means one never closed (or the message was cut inside it), so the rest of the message goes too.
 */
export function maskQuoted(s: string): string {
  let first = -1, last = -1, n = 0;
  for (let i = 0; i < s.length; i++) if (isQuote(s, i)) { if (first < 0) first = i; last = i; n++; }
  if (first < 0) return s;
  return s.slice(0, first) + "[text]" + (n % 2 === 0 ? s.slice(last + 1) : "");
}

/** `Invalid regular expression: /(Meera said/gi: ...` quotes the pattern with slashes, not quote marks. */
export function maskPattern(s: string): string {
  return s.replace(/(Invalid regular expression: )\/.*\/[a-z]*(?=: |$)/, "$1[text]");
}

/** A web address keeps its path; its query and fragment go (a key rides in a query, the capture bookmarklet's text in a fragment). */
export function maskUrls(s: string): string {
  return s
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/[^\s?#]*)[?#]\S*/gi, "$1?[query]")
    .replace(/([\w/.~%-])\?[\w.%-]+=\S*/g, "$1?[query]");
}

/** The makes of AI key the app handles, a bearer token, and any long unbroken run of key characters (a run of 24 or more is not a word). */
export function maskKeys(s: string): string {
  return s
    .replace(/\bBearer\s+\S+/g, "Bearer [key]")
    .replace(/\b(?:AIza|sk-|gsk_)[\w-]{8,}/g, "[key]")
    .replace(/[A-Za-z0-9_-]{24,}/g, "[key]");
}

/**
 * v1's personal-data patterns as build 2026.10.24a has them (`PD_SEND`, index.html 10554): a phone with a leading 0 or 00 91, written with
 * hyphens or as a landline, and an ID number with hyphens. Core's `maskText` is from an older build and core is not edited in wave C, so
 * these run first and core's run after them for anything they leave (core also takes a twelve-digit number that starts with 0 or 1).
 */
const V1_NOW: Array<[RegExp, string, boolean]> = [
  [/([^\s@<>"']+@[^\s@<>"']+\.[A-Za-z]{2,})/g, "[email]", false],
  [/(^|\D)((?:(?:\+|00)?91[\s-]?|0)?(?:[6-9]\d{4}[\s-]?\d{5}|[6-9]\d{2}[\s-]\d{3}[\s-]\d{4})|0\d{2,4}[\s-]\d{6,8})(?!\d)/g, "[phone]", true],
  [/(^|[^\d-])([2-9]\d{3}[\s-]\d{4}[\s-]\d{4}|[2-9]\d{11}|[A-Z]{5}\d{4}[A-Z])(?![A-Za-z0-9-])/g, "[id number]", true]
];

export function maskPersonal(s: string): string {
  let o = s;
  for (const [re, mask, keep] of V1_NOW) o = o.replace(re, (_m, a: string) => (keep ? a + mask : mask));
  return maskText(o);
}

/**
 * The first `HEAD` characters of a flattened message. When the cut falls inside a word that word goes, and so do the digit groups before
 * it, so an address or number split by the cut cannot slip past the masks as a fragment.
 */
export function messageHead(flat: string): string {
  if (flat.length <= HEAD) return flat;
  let h = flat.slice(0, HEAD);
  if (!/\s/.test(flat[HEAD]!)) { const sp = h.lastIndexOf(" "); if (sp > 0) h = h.slice(0, sp); }
  return h.replace(/[\d\s+-]+$/, "");
}

/** All the masks, in the order that keeps each from hiding text from the next. */
export function maskMessage(flat: string): string {
  return maskPersonal(maskKeys(maskUrls(maskQuoted(maskPattern(messageHead(flat))))));
}
