"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { LangProvider, type Lang } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";
import { mergeSettings, type Me, type Settings } from "@/lib/settingsMerge";

export { mergeSettings } from "@/lib/settingsMerge";
export type { Me, Settings } from "@/lib/settingsMerge";

type SettingsValue = { me: Me | null; settings: Settings; update(patch: Settings): Promise<void>; reload(): Promise<void> };
const Ctx = createContext<SettingsValue>({ me: null, settings: {}, update: async () => {}, reload: async () => {} });

export function SettingsProvider({ initialLang = "en", children }: { initialLang?: Lang; children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [settings, setSettings] = useState<Settings>({ lang: initialLang });
  const current = useRef(settings);
  useEffect(() => { current.current = settings; }, [settings]);

  const reload = useCallback(async () => {
    const fresh = await apiFetch<Me>("/me");
    setMe(fresh);
    setSettings(fresh.settings);
  }, []);
  useEffect(() => {
    let live = true;
    apiFetch<Me>("/me").then((fresh) => { if (live) { setMe(fresh); setSettings(fresh.settings); } }, () => { /* signed-out or API down: keep defaults */ });
    return () => { live = false; };
  }, []);

  const update = useCallback(async (patch: Settings) => {
    const before = current.current;
    const next = mergeSettings(before, patch);
    current.current = next;
    setSettings(next);
    try {
      const saved = await apiFetch<Settings>("/me/settings", { method: "PATCH", body: JSON.stringify(patch) });
      setSettings(saved);
      setMe((m) => (m ? { ...m, settings: saved } : m));
    } catch {
      current.current = before;
      setSettings(before);
      toast("Could not save your settings. Try again.");
    }
  }, []);

  const lang: Lang = settings.lang ?? "en";
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const onLang = useCallback((l: Lang) => { void update({ lang: l }); }, [update]);

  const value = useMemo(() => ({ me, settings, update, reload }), [me, settings, update, reload]);
  return (
    <Ctx.Provider value={value}>
      <LangProvider lang={lang} onChange={onLang}>{children}</LangProvider>
    </Ctx.Provider>
  );
}

export function useSettings() { return useContext(Ctx); }
