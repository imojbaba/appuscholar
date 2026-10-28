import { DICTATION_LANGS, defaultDictationLang } from "./dictate";

/*
 * What dictation remembers (v1 appu_dictlang and appu_dict_ack, index.html 4254 and 4293), per device and per account (wave D ruling P5): the
 * first-use notice is about this browser's speech service (Chrome sends audio to Google, Edge to Microsoft), so an acknowledgement on one device
 * must not cover another, and it is not an account setting. Keys carry the user id as lib/ai/keys.ts does, so a shared computer never hands one
 * student's choice to the next. With no signed-in account nothing is read or written. Every access is in try/catch: storage can be blocked.
 */
type UserId = string | null | undefined;
const langKey = (userId: string) => "appu_dictlang_" + userId;
const ackKey = (userId: string) => "appu_dict_ack_" + userId;

function get(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; /* storage blocked */ }
}
function set(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* storage blocked or full: nothing is remembered */ }
}

/** The saved dictation language, or null when none is saved or the saved value is not one of the four. */
export function readDictPrefs(userId: UserId): { lang: string | null } {
  const saved = userId ? get(langKey(userId)) : null;
  return { lang: DICTATION_LANGS.some((l) => l.code === saved) ? saved : null };
}

export function writeDictLang(userId: UserId, lang: string): void {
  if (userId && DICTATION_LANGS.some((l) => l.code === lang)) set(langKey(userId), lang);
}

/** v1 dictLang (4254): the saved language, else Hindi for a Hindi project and English (India) otherwise. */
export function dictLangFor(userId: UserId, contentLang: string | undefined): string {
  return readDictPrefs(userId).lang ?? defaultDictationLang(contentLang);
}

export function hasAcked(userId: UserId): boolean {
  return !!userId && get(ackKey(userId)) === "1";
}

export function ack(userId: UserId): void {
  if (userId) set(ackKey(userId), "1");
}
