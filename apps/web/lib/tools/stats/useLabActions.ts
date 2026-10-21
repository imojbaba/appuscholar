"use client";
import { useCallback, useEffect, useRef } from "react";
import { rtSetRecord, type ParsedData } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { useProjectBlob } from "@/lib/blobs/useProjectBlob";
import { downloadBlob } from "@/lib/export/download";
import { nameFromFile } from "./intake";
import { applyPd, getData, getLab, parse, patchLab, setName, setText, splitOnSemicolons } from "./lab";

/** v1 rtDsName (9378): the name a set is registered under when the box is empty. It is a stored key, not a word the student reads, so it is not translated. */
export const UNTITLED = "Untitled data";
/** v1 pdDownload (9507): the key file's name. */
export const KEY_FILE = "appuscholar_key_keep_separate.csv";

/**
 * What the Data tab does with the lab (lib/tools/stats/lab.ts): each action changes the lab, then registers the table's fingerprint in `stats_sets`
 * (v1 rtRegister 9380: name, hash, time and row count, never a row) and, for the personal-data box, downloads the key file. The dataset name is
 * remembered in `stats_prefs.statsname` (v1 rtNameChanged 9379). One instance is shared by the intake and the personal-data box.
 */
export function useLabActions(projectId: string) {
  const t = useT();
  const pid = projectId || null;
  const sets = useProjectBlob("stats_sets", pid);
  const prefs = useProjectBlob("stats_prefs", pid);
  const setsRef = useRef(sets);
  const prefsRef = useRef(prefs);
  const tRef = useRef(t);
  useEffect(() => { setsRef.current = sets; prefsRef.current = prefs; tRef.current = t; });

  // R16 (kinds/stats.ts): a saved list that does not open is replaced only when the student says so, once for this visit.
  const decided = useRef<{ pid: string; yes: boolean } | null>(null);
  const mayRegister = useCallback((): boolean => {
    if (!setsRef.current.broken) return true;
    if (decided.current?.pid !== projectId) decided.current = { pid: projectId, yes: window.confirm(tRef.current("stats_data_sets_confirm")) };
    return decided.current.yes;
  }, [projectId]);

  /** The remembered name fills the box once, when the tab opens and the name box is still empty (v1 filled it at boot). */
  const seeded = useRef<string | null>(null);
  useEffect(() => {
    if (prefs.loading || prefs.locked || seeded.current === projectId) return;
    seeded.current = projectId;
    const remembered = prefs.value?.statsname;
    if (remembered && !getLab(projectId).name) setName(projectId, remembered);
  }, [prefs.loading, prefs.locked, prefs.value, projectId]);

  const register = useCallback((data: ParsedData | null) => {
    if (!data || pid === null || !mayRegister()) return;
    const name = getLab(projectId).name.trim() || UNTITLED;
    setsRef.current.set((prev) => rtSetRecord(data, name, prev ?? {}, Date.now()));
  }, [pid, projectId, mayRegister]);

  const rename = useCallback((value: string) => {
    setName(projectId, value);
    prefsRef.current.set((prev) => ({ ...(prev ?? {}), statsname: value.slice(0, 60) }));
  }, [projectId]);

  const parseNow = useCallback(async () => { register(await parse(projectId)); }, [projectId, register]);
  const split = useCallback(async () => { register(await splitOnSemicolons(projectId)); }, [projectId, register]);
  const apply = useCallback(async () => {
    const r = await applyPd(projectId);
    register(getData(projectId));
    if (r?.keyCsv) downloadBlob(KEY_FILE, new Blob(["﻿" + r.keyCsv], { type: "text/csv;charset=utf-8" }));
  }, [projectId, register]);

  /** v1 statsUpload (9403): the file's text into the paste box, its name into an empty name box, then parse. */
  const upload = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setText(projectId, String(reader.result ?? ""));
      if (!getLab(projectId).name.trim()) rename(nameFromFile(file.name));
      void parseNow();
    };
    reader.onerror = () => patchLab(projectId, { status: { kind: "read_failed" } });
    reader.readAsText(file);
  }, [projectId, rename, parseNow]);

  return { rename, parseNow, split, apply, upload };
}
export type LabActions = ReturnType<typeof useLabActions>;
