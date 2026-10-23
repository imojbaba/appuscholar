"use client";
import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { rtSetRecord } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { useProjectBlob } from "@/lib/blobs/useProjectBlob";
import { getLab, patchLab, useLab } from "./lab";
import { UNTITLED } from "./useLabActions";

/*
 * The one client of `stats_sets` the Statistics tabs share, and the one place a parsed table is recorded in it (v1 rtRegister 9380: name, hash, time and row count, never a
 * row). The stats Panel mounts StatsSetsHost around whichever tab is open, so a table is recorded whenever ANY tab is open: the Data tab parsed it, a file or a scale scoring
 * made it while another tab was shown, or its recording was waiting for a locked vault. A tab that needs the stored list (the Check tab) reads it with useStatsSets();
 * no tab holds a second client of the same blob, and the Data tab no longer registers (useLabActions.ts).
 */
type SetsBlob = ReturnType<typeof useProjectBlob<"stats_sets">>;
const Ctx = createContext<SetsBlob | null>(null);

/** The shared `stats_sets` client. Only inside StatsSetsHost (the stats Panel). */
export function useStatsSets(): SetsBlob {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStatsSets must be used inside the stats Panel");
  return v;
}

/**
 * Records the table the lab holds whenever it has not been recorded. Gates: not before the stored list is known (a failed read says loading:false, locked:false, error:true,
 * value:null, and the update would replay over whatever a retry finds), not while the vault is locked (it would raise the passphrase prompt from a mount), and a list that
 * does not open is replaced only after the student says yes, once per project while it stays broken (the answer lives in the lab store, lab.ts `setsDecided`: the Panel mounts again on every tab; R16, kinds/stats.ts). Done here and not by the click that parsed the table: a big table is
 * read in slices and may finish after the student left the tab. (rtSetRecord keeps a set that is already recorded as it was.) The name is kept with the marker: a run is
 * recorded under the name its table was registered under (v1 `_statsDsName`).
 */
function useRegisterLab(projectId: string, sets: SetsBlob): void {
  const t = useT();
  const pid = projectId || null;
  const setsRef = useRef(sets);
  const tRef = useRef(t);
  useEffect(() => { setsRef.current = sets; tRef.current = t; });
  const mayRegister = useCallback((): boolean => {
    if (!setsRef.current.broken) return true;
    const kept = getLab(projectId).setsDecided;
    if (kept !== null) return kept;
    const yes = window.confirm(tRef.current("stats_data_sets_confirm"));
    patchLab(projectId, { setsDecided: yes });
    return yes;
  }, [projectId]);
  const { data, registered } = useLab(projectId);
  const { loading: setsLoading, locked: setsLocked, error: setsError, broken: setsBroken } = sets;
  // The list reads fine now: the old answer is no longer about anything, a later broken list asks again.
  const decided = useLab(projectId).setsDecided;
  useEffect(() => {
    if (decided !== null && !setsBroken && !setsLoading && !setsLocked && !setsError) patchLab(projectId, { setsDecided: null });
  }, [decided, setsBroken, setsLoading, setsLocked, setsError, projectId]);
  useEffect(() => {
    if (!data || registered === data || pid === null || setsLoading || setsLocked || setsError || !mayRegister()) return;
    const ds = getLab(projectId).lockedName ?? (getLab(projectId).name.trim() || UNTITLED);
    setsRef.current.set((prev) => rtSetRecord(data, ds, prev ?? {}, Date.now()));
    patchLab(projectId, { registered: data, regName: ds, lockedName: null });
  }, [data, registered, pid, projectId, mayRegister, setsLoading, setsLocked, setsError]);
}

/** Holds the shared client, records the lab's table, and gives the client to the tabs below. */
export function StatsSetsHost({ projectId, children }: { projectId: string; children: ReactNode }) {
  const sets = useProjectBlob("stats_sets", projectId || null);
  useRegisterLab(projectId, sets);
  return <Ctx.Provider value={sets}>{children}</Ctx.Provider>;
}
