"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { LangProvider, type Lang } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";
import { applyPatchResult, mergeLoaded, mergeSettings, patchKeys, revertPatch, type Me, type Settings } from "@/lib/settingsMerge";

export { mergeSettings } from "@/lib/settingsMerge";
export type { Me, Settings } from "@/lib/settingsMerge";

type SettingsValue = { me: Me | null; settings: Settings; update(patch: Settings): Promise<void>; reload(): Promise<void> };
const Ctx = createContext<SettingsValue>({ me: null, settings: {}, update: async () => {}, reload: async () => {} });

export function SettingsProvider({ initialLang = "en", children }: { initialLang?: Lang; children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [settings, setSettings] = useState<Settings>({ lang: initialLang });
  // The ref is the source of truth for reconciliation; it is always written together with setSettings.
  const current = useRef<Settings>(settings);
  const commit = useCallback((next: Settings) => { current.current = next; setSettings(next); }, []);
  const seq = useRef(0);
  const owner = useRef(new Map<string, number>()); // key -> seq of the newest in-flight update for it
  const touched = useRef(new Set<string>()); // keys changed locally since mount

  const applyLoaded = useCallback((fresh: Me, dirty: ReadonlySet<string>) => {
    setMe(fresh);
    commit(mergeLoaded(fresh.settings, current.current, dirty));
  }, [commit]);

  const reload = useCallback(async () => {
    applyLoaded(await apiFetch<Me>("/me"), new Set(owner.current.keys()));
  }, [applyLoaded]);
  useEffect(() => {
    let live = true;
    apiFetch<Me>("/me").then((fresh) => { if (live) applyLoaded(fresh, touched.current); }, () => { /* signed-out or API down: keep defaults */ });
    return () => { live = false; };
  }, [applyLoaded]);

  const update = useCallback(async (patch: Settings) => {
    const mine = ++seq.current;
    const keys = patchKeys(patch);
    const before = current.current;
    for (const k of keys) { owner.current.set(k, mine); touched.current.add(k); }
    commit(mergeSettings(before, patch));
    // Only keys no newer update has taken over are ours to reconcile.
    const owned = () => keys.filter((k) => owner.current.get(k) === mine);
    try {
      const saved = await apiFetch<Settings>("/me/settings", { method: "PATCH", body: JSON.stringify(patch) });
      commit(applyPatchResult(current.current, owned(), saved));
      setMe((m) => (m ? { ...m, settings: applyPatchResult(m.settings, owned(), saved) } : m));
    } catch {
      commit(revertPatch(current.current, owned(), before));
      toast("Could not save your settings. Try again.");
    } finally {
      for (const k of owned()) owner.current.delete(k);
    }
  }, [commit]);

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
