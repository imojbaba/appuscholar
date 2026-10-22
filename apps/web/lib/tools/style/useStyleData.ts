"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { styleProfileSave, styleSamplesKeep, type StyleLevel, type StyleSample } from "@appuscholar/core";
import { useProjectBlob } from "@/lib/blobs/useProjectBlob";
import type { StyleMeta, StyleProfile } from "@/lib/blobs/kinds/style";
import { addSampleTo, newSampleId, todayIso, type LearnEnv } from "./learn";
import { setCurrentStyle, clearCurrentStyle } from "./current";

/*
 * My style's three blobs in one place (v1's five localStorage keys, ruling R8): `style_profile` {profile, on}, `style_samples` (features only) and
 * `style_meta` {decl, live, fb, livePassage, vocab_level}. All three are guarded kinds (R16): when one does not open the panel says so and asks
 * before it writes over it (`guard`), and while the vault is locked or the blobs are still being read it writes nothing (`ready`), so a measured line
 * is never composed over a list that has not been read.
 */

type Kind = "profile" | "samples" | "meta";
const NO_PROFILE: StyleProfile = { profile: "", on: false };

export type StyleData = {
  hasProject: boolean;
  loading: boolean;
  locked: boolean;
  broken: boolean;
  /** Read and writable: a project is open, the three blobs are read and the vault is open. */
  ready: boolean;
  profile: string;
  on: boolean;
  samples: StyleSample[];
  meta: StyleMeta;
  level: StyleLevel | null;
  /** Runs `run` now, or asks first (`asking`) when a blob it writes does not open. */
  guard(kinds: Kind[], run: () => void): void;
  asking: boolean;
  approve(): void;
  decline(): void;
  saveProfile(text: string): void;
  setOn(on: boolean): void;
  patchMeta(patch: Partial<StyleMeta>): void;
  /** Ticks or clears the declaration: today's date, or none (v1 styleDeclToggle 6421-6425). */
  setDeclared(declared: boolean): void;
  removeSample(id: string): void;
  /** v1 styleResetAll (6434-6437): profile, "Use my style", samples, declaration, checks and vocabulary result, all emptied. */
  eraseAll(): void;
  /** The store half of a LearnEnv: samples added as features only, the learned profile saved with "Use my style" on. */
  learnStore(): Pick<LearnEnv, "addSample" | "saveProfile">;
};

export function useStyleData(projectId: string | null): StyleData {
  const profileB = useProjectBlob("style_profile", projectId);
  const samplesB = useProjectBlob("style_samples", projectId);
  const metaB = useProjectBlob("style_meta", projectId);
  const hasProject = projectId !== null;
  const loading = hasProject && (profileB.loading || samplesB.loading || metaB.loading);
  const locked = hasProject && (profileB.locked || samplesB.locked || metaB.locked);
  const broken = !!(profileB.broken || samplesB.broken || metaB.broken);
  const ready = hasProject && !loading && !locked;
  const profile = profileB.value?.profile ?? "";
  const on = profileB.value?.on ?? false;
  const samples = useMemo(() => samplesB.value ?? [], [samplesB.value]);
  const meta = useMemo<StyleMeta>(() => metaB.value ?? {}, [metaB.value]);
  const level = (meta.vocab_level as StyleLevel | undefined) ?? null;

  // Samples as the flow has added them, ahead of the render that shows them.
  const mirror = useRef<StyleSample[]>(samples);
  useEffect(() => { mirror.current = samples; }, [samples]);

  const brokenBy: Record<Kind, boolean> = { profile: !!profileB.broken, samples: !!samplesB.broken, meta: !!metaB.broken };
  const [pending, setPending] = useState<(() => void) | null>(null);
  const guard = useCallback((kinds: Kind[], run: () => void) => {
    if (kinds.some((k) => brokenBy[k])) setPending(() => run); else run();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- brokenBy is rebuilt from the three flags below
  }, [profileB.broken, samplesB.broken, metaB.broken]);
  const approve = useCallback(() => { const run = pending; setPending(null); run?.(); }, [pending]);
  const decline = useCallback(() => setPending(null), []);

  const { set: setProfile } = profileB;
  const { set: setSamples } = samplesB;
  const { set: setMeta } = metaB;
  const saveProfile = useCallback((text: string) => setProfile((p) => ({ ...(p ?? NO_PROFILE), profile: styleProfileSave(text) })), [setProfile]);
  const setOn = useCallback((v: boolean) => setProfile((p) => ({ ...(p ?? NO_PROFILE), on: v })), [setProfile]);
  const patchMeta = useCallback((patch: Partial<StyleMeta>) => setMeta((m) => ({ ...(m ?? {}), ...patch })), [setMeta]);
  const setDeclared = useCallback((v: boolean) => setMeta((m) => {
    const { decl: _gone, ...rest } = m ?? {};
    void _gone;
    return v ? { ...rest, decl: todayIso() } : rest;
  }), [setMeta]);
  const removeSample = useCallback((id: string) => {
    mirror.current = mirror.current.filter((x) => x.id !== id);
    setSamples((a) => (a ?? []).filter((x) => x.id !== id));
  }, [setSamples]);
  const eraseAll = useCallback(() => {
    mirror.current = [];
    setProfile(() => ({ ...NO_PROFILE }));
    setSamples(() => []);
    setMeta(() => ({}));
  }, [setProfile, setSamples, setMeta]);

  const learnStore = useCallback((): Pick<LearnEnv, "addSample" | "saveProfile"> => ({
    addSample: (name, text) => {
      const r = addSampleTo(mirror.current, name, text, newSampleId(), todayIso());
      if (r.status === "added") {
        const rec = r.samples[r.samples.length - 1]!;
        mirror.current = r.samples;
        // The record only (features), never the text, is what the update carries.
        setSamples((a) => {
          const list = a ?? [];
          return list.some((x) => x.id === rec.id || (x.name === rec.name && x.n === rec.n)) ? list : styleSamplesKeep([...list, rec]);
        });
      }
      return r;
    },
    saveProfile: (text) => setProfile((p) => ({ ...(p ?? NO_PROFILE), profile: styleProfileSave(text), on: true }))
  }), [setSamples, setProfile]);

  // What Continue, Improve and Extend read (ruling R3). The module's layer keeps it too; the open panel is fresher than the layer's own read of the blobs.
  useEffect(() => {
    if (projectId === null) return;
    if (!ready || broken) { clearCurrentStyle(projectId); return; }
    setCurrentStyle({ projectId, profile, on, level, samples });
  }, [projectId, ready, broken, profile, on, level, samples]);

  return {
    hasProject, loading, locked, broken, ready, profile, on, samples, meta, level,
    guard, asking: pending !== null, approve, decline,
    saveProfile, setOn, patchMeta, setDeclared, removeSample, eraseAll, learnStore
  };
}
