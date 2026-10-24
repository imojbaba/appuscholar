// Removing a secret (the live-AI key) from text. Shared by the fixture (which cuts messages, console lines and page text to a length) and the reporter, so that a secret is
// taken out BEFORE any cut: cut first and a prefix of the key is left behind that no later search for the whole key can find.

/** What replaces a secret. */
export const REDACTED = "[redacted]";

/** Html text and double-quoted attribute values (every attribute in the report is double-quoted, so the apostrophe stays as it is). */
export const htmlEscape = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Each secret as it can appear in text: as written, in a URL, inside a JSON string, and in html. Longest first, so a longer form is not left half done. */
export function secretForms(secrets: ReadonlyArray<string | undefined>): string[] {
  const forms = new Set<string>();
  for (const s of secrets) {
    if (!s) continue;
    for (const f of [s, encodeURIComponent(s), JSON.stringify(s).slice(1, -1), htmlEscape(s)]) if (f) forms.add(f);
  }
  return [...forms].sort((a, b) => b.length - a.length);
}

/** `s` with every form of the secrets written as [redacted]. An empty list leaves it as it is. */
export const redactText = (s: string, forms: string[]): string => forms.reduce((t, f) => t.split(f).join(REDACTED), s);

let cached: { key: string | undefined; forms: string[] } | undefined;
/** The forms of the live-AI key (QA_LIVE_AI_KEY), read when asked, so a run that sets it late is covered; none when it is not set. */
export function liveKeyForms(): string[] {
  const key = process.env.QA_LIVE_AI_KEY;
  if (!cached || cached.key !== key) cached = { key, forms: secretForms([key]) };
  return cached.forms;
}

/** `s` without the live-AI key. A no-op when QA_LIVE_AI_KEY is not set. Call it before cutting `s` to a length. */
export const redactLiveKey = (s: string): string => redactText(s, liveKeyForms());
