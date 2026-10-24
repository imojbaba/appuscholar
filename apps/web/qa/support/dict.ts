import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * The app's words, for cases to assert against (global constraint: a sentence a case expects is read from the dictionaries, never retyped).
 *
 * It reads what the app reads (lib/i18n.tsx): `messages/<lang>.json` with each tool's file `messages/tools/<tool>.<lang>.json` merged in, keys that start with `$`
 * (the Hindi files' draft marker) skipped, and a key that two files both give refused. `messages/v1-panels.manifest.json` is not a dictionary (it maps keys to v1's line
 * numbers) and is not read. `T` fills `{vars}` as the app's `tFormat` does, and in Hindi falls back to the English sentence where the Hindi file lacks the key, as the app does.
 */
export type Lang = "en" | "hi";
type Dict = Record<string, string>;

const MESSAGES = path.resolve(__dirname, "..", "..", "messages");
let loaded: Record<Lang, Dict> | undefined;

function read(file: string): Dict {
  return JSON.parse(readFileSync(file, "utf8")) as Dict;
}

function load(lang: Lang): Dict {
  const out: Dict = { ...read(path.join(MESSAGES, `${lang}.json`)) };
  const from = new Map<string, string>();
  const tools = path.join(MESSAGES, "tools");
  for (const name of readdirSync(tools).filter((f) => f.endsWith(`.${lang}.json`)).sort()) {
    for (const [key, value] of Object.entries(read(path.join(tools, name)))) {
      if (key.startsWith("$")) continue;
      if (key in out) throw new Error(`QA dict: messages/tools/${name} gives the key "${key}", which ${from.get(key) ? `messages/tools/${from.get(key)}` : `messages/${lang}.json`} already has.`);
      out[key] = value;
      from.set(key, name);
    }
  }
  return out;
}

function dictionaries(): Record<Lang, Dict> {
  return (loaded ??= { en: load("en"), hi: load("hi") });
}

/** The sentence for `key` in `lang` (English by default), with `{name}` filled from `vars`; a `{name}` that `vars` does not give is left as it is. A key no dictionary has throws. */
export function T(key: string, vars?: Record<string, string | number>, lang: Lang = "en"): string {
  const d = dictionaries();
  const raw = (lang === "hi" ? d.hi[key] : undefined) ?? d.en[key];
  if (raw === undefined) throw new Error(`QA dict: no such key in the dictionaries: ${key}`);
  return vars ? raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : raw;
}
