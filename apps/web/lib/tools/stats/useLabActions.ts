"use client";
import { useCallback, useEffect, useRef } from "react";
import { rtSetRecord } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { useProjectBlob } from "@/lib/blobs/useProjectBlob";
import { downloadBlob } from "@/lib/export/download";
import { nameFromFile } from "./intake";
import { applyPd, getLab, parse, patchLab, setName, setText, splitOnSemicolons, useLab } from "./lab";

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

  const lab = useLab(projectId);
  const { data, registered, name } = lab;
  const { loading: setsLoading, locked: setsLocked, error: setsError } = sets;

  /**
   * v1 rtRegister (9380) after every parse: the set's name, hash, time and row count in `stats_sets`. It is done here, whenever the lab holds a table
   * that has not been recorded, and not by the click that parsed it: a big table is read in slices and may finish after the student left the tab, and a
   * hook that is gone saves nothing. The next time the tab opens it records the table under the name the lab holds. (rtSetRecord keeps a set that is
   * already recorded as it was.)
   */
  useEffect(() => {
    // Not before the stored list is known (a failed read says loading:false, locked:false, error:true, value:null, and the update would replay over whatever the retry finds): the hook would queue the update and replay it onto whatever the read finds, a list that does not open
    // included (R16 asks first, and mayRegister cannot know it is broken yet), and a locked vault would raise the passphrase prompt at mount.
    if (!data || registered === data || pid === null || setsLoading || setsLocked || setsError || !mayRegister()) return;
    const ds = getLab(projectId).lockedName ?? (getLab(projectId).name.trim() || UNTITLED);
    setsRef.current.set((prev) => rtSetRecord(data, ds, prev ?? {}, Date.now()));
    // The name is kept with the marker: a run is recorded under the name its table was registered under (v1 `_statsDsName`, set by rtRegister).
    patchLab(projectId, { registered: data, regName: ds, lockedName: null });
  }, [data, registered, pid, projectId, mayRegister, setsLoading, setsLocked, setsError]);

  /** A name that reached the lab while the tab was not open (a file's name seeds an empty box) is remembered when it opens again. */
  useEffect(() => {
    if (prefs.loading || prefs.locked || pid === null || !name || prefs.value?.statsname === name) return;
    if (seeded.current !== projectId) return; // the remembered name is read first
    prefsRef.current.set((prev) => ({ ...(prev ?? {}), statsname: name.slice(0, 60) }));
  }, [prefs.loading, prefs.locked, prefs.value, name, pid, projectId]);

  const rename = useCallback((value: string) => {
    setName(projectId, value);
    prefsRef.current.set((prev) => ({ ...(prev ?? {}), statsname: value.slice(0, 60) }));
  }, [projectId]);

  const parseNow = useCallback(async () => { await parse(projectId); }, [projectId]);
  const split = useCallback(async () => { await splitOnSemicolons(projectId); }, [projectId]);
  const apply = useCallback(async () => {
    const r = await applyPd(projectId);
    if (r?.keyCsv) downloadBlob(KEY_FILE, new Blob(["\uFEFF" + r.keyCsv], { type: "text/csv;charset=utf-8" }));
  }, [projectId]);

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

  return { rename, parseNow, split, apply, upload, prefs };
}
export type LabActions = ReturnType<typeof useLabActions>;
