/**
 * v1 dictation (index.html 4246-4321): the browser's speech recognition (Chrome and Edge), no key and no server of ours.
 * This file is the pure part and the recogniser wrapper. It returns error codes and message keys, not sentences (the toolbar calls t()).
 */
type Alt = { transcript: string };
type Result = { isFinal: boolean; 0: Alt; length: number };
type SREvent = { resultIndex: number; results: { length: number; [i: number]: Result } };
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((e: SREvent) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null;
  start(): void; stop(): void;
};
type Ctor = new () => Recognition;

// v1's words (4292). The toolbar still imports this until Task 14 shows t("dict_unsupported") instead; then it goes.
export const UNSUPPORTED_MESSAGE = "Dictation works in Chrome and Edge. This browser does not offer it.";
/** v1 DICT_LANGS (4251), in v1 order. */
export const DICTATION_LANGS = [
  { code: "en-IN", label: "English (India)" },
  { code: "hi-IN", label: "Hindi" },
  { code: "en-GB", label: "English (UK)" },
  { code: "en-US", label: "English (US)" }
] as const;

/** hi-IN when the content language is Hindi, else en-IN. */
export function defaultDictationLang(contentLang: string | undefined): string {
  return contentLang === "hi" ? "hi-IN" : "en-IN";
}

/**
 * Spoken punctuation, v1 dictFormat (4257-4264). The phrase is trimmed and a space put in front, so a command at the start matches too; every
 * pattern needs that leading space, removes it and leaves the words after it. Applied in this order. English has `\b` after the command (so
 * "full stopper" is left alone and "semicolon" is not read as "colon"); Hindi has none. Not covered, as in v1: period, dot, quotes, brackets.
 */
const EN_COMMANDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/ (full stop)\b/gi, "."], [/ comma\b/gi, ","], [/ question mark\b/gi, "?"], [/ exclamation (mark|point)\b/gi, "!"],
  [/ colon\b/gi, ":"], [/ semicolon\b/gi, ";"], [/ new paragraph\b/gi, "\n\n"], [/ new line\b/gi, "\n"]
];
const HI_COMMANDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/ पूर्ण ?विराम/g, "।"], [/ अल्प ?विराम/g, ","], [/ प्रश्न ?चिह्न/g, "?"], [/ नई पंक्ति/g, "\n"]
];

export function formatSpoken(raw: string, lang: string): string {
  let t = " " + String(raw || "").trim();
  for (const [re, to] of /^hi/.test(lang) ? HI_COMMANDS : EN_COMMANDS) t = t.replace(re, to);
  return t.replace(/\n[ \t]+/g, "\n").replace(/^[ \t]+|[ \t]+$/g, "");
}

/**
 * Capitals and the space in front of a formatted phrase, v1 dictInsert (4265-4277). `before` is the text before the caret. Not Hindi: the first
 * character after any line breaks is capitalised at the start, after a full stop, question mark or exclamation mark, or when the phrase starts
 * with a line break. A space goes first only when there is text before, it does not already end in white space, and the phrase does not start
 * with closing punctuation or a line break. Nothing is added after the phrase.
 */
export function placeSpoken(text: string, before: string, lang: string): { text: string; leadSpace: boolean } {
  let t = text;
  if (!t) return { text: t, leadSpace: false };
  if (!/^hi/.test(lang)) {
    const lead = (t.match(/^\n*/) ?? [""])[0].length;
    if (!before || /[.?!]\s*$/.test(before) || lead > 0) t = t.slice(0, lead) + t.charAt(lead).toUpperCase() + t.slice(lead + 1);
  }
  return { text: t, leadSpace: !!before && !/\s$/.test(before) && !/^[.,?!:;।\n)]/.test(t) };
}

/** v1's error sentences (4303-4309) by browser error code; the sentences are in messages/tools/dictation.*.json. */
const ERROR_KEYS = new Map([
  ["not-allowed", "dict_err_not_allowed"], ["service-not-allowed", "dict_err_service"], ["network", "dict_err_network"],
  ["audio-capture", "dict_err_audio"], ["language-not-supported", "dict_err_lang"]
]);
/** The message key for an error code; any code v1 has no sentence for gets the generic one, which takes `{code}`. */
export function dictErrorKey(code: string): string { return ERROR_KEYS.get(code) ?? "dict_err_other"; }
/** The sentence for `code`, through the caller's t(). */
export function dictErrorMessage(code: string, t: (key: string, vars?: Record<string, string | number>) => string): string {
  return t(dictErrorKey(code), { code: code || "unknown" });
}

function ctor(): Ctor | null {
  const w = globalThis as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function dictationSupported(): boolean { return ctor() !== null; }

export type Dictation = { stop(): void };
export type DictationOptions = {
  lang: string;
  /** The words still being recognised ("" when there are none). */
  onInterim(text: string): void;
  /** Each finished phrase, once, raw (run it through formatSpoken). */
  onFinal(text: string): void;
  /** Listening has stopped for good: the user, an error, giving up, or a restart that failed. Fires once. */
  onEnd(): void;
  /** The browser's error code ("not-allowed", "network" ...) for anything but no-speech and aborted; listening stops after it. */
  onError?(code: string): void;
  /** Three runs in a row ended within 1200 ms of starting: the microphone is not working. onEnd follows. */
  onGiveUp?(): void;
};

/** v1 4310-4315: a run that ends within 1200 ms is a fail; the third fail in a row gives up. */
export const FAST_RUN_MS = 1200;
export const MAX_FAST_RUNS = 3;

/**
 * Starts listening. The browser ends a continuous session now and then (silence, a network blip), so while the user has not stopped it the
 * session is started again. Returns null when the browser has no speech recognition or will not start.
 */
export function startDictation(opts: DictationOptions): Dictation | null {
  const C = ctor();
  if (!C) return null;
  const rec = new C();
  rec.lang = opts.lang;
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  let on = true;
  let fast = 0;
  let startedAt = Date.now();
  /** Stops for good, once. A phrase the browser still delivers after this is passed on: it is the student's own words. */
  function finish() {
    if (!on) return;
    on = false;
    rec.onend = null;
    try { rec.stop(); } catch { /* already stopped */ }
    opts.onInterim("");
    opts.onEnd();
  }
  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (!r) continue;
      if (r.isFinal) { fast = 0; opts.onFinal(r[0].transcript); }
      else interim += r[0].transcript;
    }
    opts.onInterim(interim);
  };
  rec.onerror = (e) => {
    const code = e.error;
    if (code === "no-speech" || code === "aborted") return;
    opts.onError?.(code || "unknown");
    finish();
  };
  rec.onend = () => {
    if (!on) return;
    fast = Date.now() - startedAt < FAST_RUN_MS ? fast + 1 : 0;
    if (fast >= MAX_FAST_RUNS) { opts.onGiveUp?.(); finish(); return; }
    opts.onInterim("");
    try { startedAt = Date.now(); rec.start(); } catch { finish(); }
  };
  try { rec.start(); } catch { return null; }
  return { stop: finish };
}
