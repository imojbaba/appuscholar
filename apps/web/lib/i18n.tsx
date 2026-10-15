"use client";
import { createContext, useCallback, useContext, useMemo } from "react";
import en from "@/messages/en.json";
import hi from "@/messages/hi.json";
export type Lang = "en" | "hi";
type Dict = Record<string, string>;
const DICTS: Record<Lang, Dict> = { en: en as Dict, hi: hi as Dict };

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
  const parts = s.split(/(<kbd>.*?<\/kbd>|<b>.*?<\/b>)/g);
  return parts.map((p, i) => p.startsWith("<kbd>") ? <kbd key={i}>{p.slice(5, -6)}</kbd> : p.startsWith("<b>") ? <b key={i}>{p.slice(3, -4)}</b> : p);
}
