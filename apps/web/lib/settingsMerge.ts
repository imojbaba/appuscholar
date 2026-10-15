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

type Bag = Record<string, unknown>;

/** The keys a patch actually sets (undefined values are ignored, as in mergeSettings). */
export function patchKeys(patch: Settings): string[] {
  return Object.entries(patch).filter(([, v]) => v !== undefined).map(([k]) => k);
}

/** A PATCH succeeded: apply the server's value for only the given keys (the ones this request still owns), never the whole object. */
export function applyPatchResult(current: Settings, keys: readonly string[], saved: Settings): Settings {
  const out: Bag = { ...current };
  for (const k of keys) { const v = (saved as Bag)[k]; if (v !== undefined) out[k] = v; }
  return out as Settings;
}

/** A PATCH failed: put back the previous value of only the given keys; other keys (e.g. a newer overlapping update) are untouched. */
export function revertPatch(current: Settings, keys: readonly string[], before: Settings): Settings {
  const out: Bag = { ...current };
  for (const k of keys) { const v = (before as Bag)[k]; if (v === undefined) delete out[k]; else out[k] = v; }
  return out as Settings;
}

/** A /me load finished: take the server settings, but keep the local value of any key changed locally in the meantime. */
export function mergeLoaded(fresh: Settings, current: Settings, dirty: ReadonlySet<string>): Settings {
  const out: Bag = { ...fresh };
  for (const k of dirty) { const v = (current as Bag)[k]; if (v === undefined) delete out[k]; else out[k] = v; }
  return out as Settings;
}
