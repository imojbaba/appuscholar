/** Mirrors the API's Settings type (apps/api/src/store/types.ts) key for key. */
export type Settings = {
  lang?: "en" | "hi"; provider?: string; draftFirst?: boolean; aiFallback?: boolean; field?: string;
  contentLang?: "en" | "hi"; orcid?: string; toolTab?: string; sidebarCollapsed?: boolean;
  stageGroupsCollapsed?: string[]; fmtMore?: boolean; dockW?: number; aiLogOff?: boolean; seenWelcome?: boolean;
};

export type Me = {
  id: string; email: string; locale: string; settings: Settings;
  activeProjectId: string | null; scratchProjectId: string;
  termsAcceptedAt: string | null; ageConfirmed: boolean;
};

/** Shallow merge, same rule as the API store: keys that are undefined in the patch are ignored, arrays replace. */
export function mergeSettings(prev: Settings, patch: Settings): Settings {
  const out: Record<string, unknown> = { ...prev };
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) out[k] = v;
  return out as Settings;
}
