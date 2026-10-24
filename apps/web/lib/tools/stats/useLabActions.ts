"use client";
import { useCallback, useEffect, useRef } from "react";
import { useProjectBlob } from "@/lib/blobs/useProjectBlob";
import { downloadBlob } from "@/lib/export/download";
import { todayIso } from "@/lib/tools/participants/dates";
import { planOf } from "@/lib/tools/participants/plan";
import { useParticipants } from "@/lib/tools/participants/useParticipants";
import { nameFromFile } from "./intake";
import { applyPd, getLab, parse, patchLab, setName, setPdContext, setText, splitOnSemicolons, useLab } from "./lab";
import { NO_CONTEXT } from "./pdList";

/** v1 rtDsName (9378): the name a set is registered under when the box is empty. It is a stored key, not a word the student reads, so it is not translated. */
export const UNTITLED = "Untitled data";
/** v1 pdDownload (9507): the key file's name. */
export const KEY_FILE = "appuscholar_key_keep_separate.csv";

/**
 * What the Data tab does with the lab (lib/tools/stats/lab.ts): each action changes the lab (the table's fingerprint is recorded in `stats_sets` by StatsSetsHost, which
 * the stats Panel mounts under every tab: v1 rtRegister 9380) and, for the personal-data box, downloads the key file. The dataset name is
 * remembered in `stats_prefs.statsname` (v1 rtNameChanged 9379). One instance is shared by the intake and the personal-data box.
 *
 * It also reads the participant list and the identification plan (`design_ec`) for as long as the tab is open, and hands them to the lab, which scans the table against the list;
 * Apply adds the people the table names through the list's `saveNow` before it codes the table (R35). Nothing of the list stays in the lab once the tab closes.
 */
export function useLabActions(projectId: string) {
  const pid = projectId || null;
  const prefs = useProjectBlob("stats_prefs", pid);
  const prefsRef = useRef(prefs);
  useEffect(() => { prefsRef.current = prefs; });

  /** The remembered name fills the box once, when the tab opens and the name box is still empty (v1 filled it at boot). */
  const seeded = useRef<string | null>(null);
  useEffect(() => {
    if (prefs.loading || prefs.locked || seeded.current === projectId) return;
    seeded.current = projectId;
    const remembered = prefs.value?.statsname;
    if (remembered && !getLab(projectId).name) setName(projectId, remembered);
  }, [prefs.loading, prefs.locked, prefs.value, projectId]);

  const { name } = useLab(projectId);

  // The participant list and the plan, for the personal-details box. The lab keeps no copy once the tab is gone.
  const participants = useParticipants(projectId);
  const ec = useProjectBlob("design_ec", pid);
  const mode = planOf(ec.value).mode;
  useEffect(() => {
    setPdContext(projectId, { list: participants.list, state: participants.state, mode, saveFailed: participants.saveFailed });
  }, [projectId, participants.list, participants.state, participants.saveFailed, mode]);
  useEffect(() => () => setPdContext(projectId, NO_CONTEXT), [projectId]);
  const saveNowRef = useRef(participants.saveNow);
  useEffect(() => { saveNowRef.current = participants.saveNow; });

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
    const r = await applyPd(projectId, {}, { saveNow: (update) => saveNowRef.current(update), today: todayIso });
    if (r?.keyCsv) downloadBlob(KEY_FILE, new Blob(["\uFEFF" + r.keyCsv], { type: "text/csv;charset=utf-8" }));
  }, [projectId]);

  /** Sends the list again after a save that did not land (the box says the list has changes not saved yet, R38). */
  const retryList = useCallback(() => { void saveNowRef.current((prev) => prev); }, []);

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

  return { rename, parseNow, split, apply, upload, retryList, prefs };
}
export type LabActions = ReturnType<typeof useLabActions>;
