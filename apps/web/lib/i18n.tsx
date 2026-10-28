"use client";
import { createContext, useCallback, useContext, useMemo } from "react";
import en from "@/messages/en.json";
import hi from "@/messages/hi.json";
import { TOOL_MESSAGE_FILES } from "@/messages/tools";
export type Lang = "en" | "hi";
type Dict = Record<string, string>;

/**
 * The base dictionary of `lang` with each tool file of that language (`<tool>.<lang>.json`) added (Task G4, ruling R13): keys starting with `$`
 * are markers and skipped; a key the base dictionary or an earlier tool file already has throws, naming both files, so two tools can never
 * answer one key with different copy. The base dictionary is not changed.
 */
export function mergeToolMessages(base: Dict, lang: Lang, files: Readonly<Record<string, Dict>>): Dict {
  const out: Dict = { ...base };
  const from = new Map<string, string>();
  for (const [name, dict] of Object.entries(files)) {
    if (!name.endsWith(`.${lang}.json`)) continue;
    for (const [k, v] of Object.entries(dict)) {
      if (k.startsWith("$")) continue;
      if (k in out) throw new Error(`messages/tools/${name}: key "${k}" is already in ${from.get(k) ? "messages/tools/" + from.get(k) : `messages/${lang}.json`}`);
      out[k] = v;
      from.set(k, name);
    }
  }
  return out;
}

/** What t() reads: v1's dictionaries (en.json, hi.json) with the tools' own files merged in. */
export const DICTS: Readonly<Record<Lang, Dict>> = {
  en: mergeToolMessages(en as Dict, "en", TOOL_MESSAGE_FILES),
  hi: mergeToolMessages(hi as Dict, "hi", TOOL_MESSAGE_FILES)
};

export function tFormat(enDict: Dict, hiDict: Dict, key: string, lang: Lang, vars?: Record<string, string | number>): string {
  const raw = (lang === "hi" ? hiDict[key] : undefined) ?? enDict[key] ?? key;
  return vars ? raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : raw;
}
const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: "en", setLang: () => {} });
export function LangProvider({ lang, onChange, children }: { lang: Lang; onChange: (l: Lang) => void; children: React.ReactNode }) {
  const value = useMemo(() => ({ lang, setLang: onChange }), [lang, onChange]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useLang() { return useContext(Ctx); }
export function useT() {
  const { lang } = useContext(Ctx);
  return useCallback((key: string, vars?: Record<string, string | number>) => tFormat(DICTS.en, DICTS.hi, key, lang, vars), [lang]);
}
/** Some v1 strings carry <kbd> and <b> markup (ai_pane_desc, psych_panel_note). Render those with this, never with raw innerHTML of user data. */
export function tHtml(s: string): React.ReactNode {
  // `<b lang="en">`: a word kept in English on purpose (a button on an English website), marked as English for screen readers and the QA Hindi check.
  const parts = s.split(/(<kbd>.*?<\/kbd>|<b(?: lang="en")?>.*?<\/b>)/g);
  return parts.map((p, i) => p.startsWith("<kbd>") ? <kbd key={i}>{p.slice(5, -6)}</kbd>
    : p.startsWith('<b lang="en">') ? <b key={i} lang="en">{p.slice(13, -4)}</b>
    : p.startsWith("<b>") ? <b key={i}>{p.slice(3, -4)}</b> : p);
}
/** A few v1 labels (tab_idea, tab_design, tab_stats) carry an &amp; entity because v1 wrote them with innerHTML. React escapes text, so decode it for display. */
export function plain(s: string): string { return s.replace(/&amp;/g, "&"); }
/** Like plain(), also dropping the leading emoji, for aria-labels (the emoji is decorative). */
export function plainText(s: string): string { return plain(s).replace(/^[^\p{L}\p{N}]+/u, ""); }
/** Splits a v1 tool label ("💡 Idea & Feasibility") into its leading emoji and the text, for the icon-only sidebar rail. */
export function splitEmoji(label: string): { emoji: string; text: string } {
  const i = label.indexOf(" ");
  return i < 0 ? { emoji: label, text: "" } : { emoji: label.slice(0, i), text: label.slice(i + 1) };
}
