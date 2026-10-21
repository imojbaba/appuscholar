"use client";
import { useCallback, useEffect, useRef } from "react";
import { fieldLabel } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { useProjectBlob } from "@/lib/blobs/useProjectBlob";
import { useDocAccess } from "@/lib/editor/docAccess";
import { useCallAI } from "@/lib/ai/useCallAI";
import { AiCallError, apiMsg } from "@/lib/ai/callAI";
import { askPd } from "@/lib/ai/pdDialog";
import type { StatsRuns } from "@/lib/blobs/kinds/stats";
import { toast } from "@/components/ui/toast";
import { buildStatsExplainPrompt, statsExplainText } from "./explain";
import { codesFor, flaggedCounts, flaggedInText, maskLabels } from "./explainGuard";
import { getLab, patchLab, useLab } from "./lab";
import { addRun, newRunId, runRecord, sentenceHtml } from "./run";
import { checkChoice, chooseDesign, requestRun, runNow, setExplain, setField, setTest, switchTest, tickColumn } from "./runLab";
import { UNTITLED, type LabActions } from "./useLabActions";

/**
 * What the Run test area does with the world (Task B2): the practice gate's switch in `stats_prefs`, "Insert into document" through the document access (v1
 * statsInsert 12010-12025), the run record in `stats_runs`, and "Explain in plain language" through the AI call (v1 statsExplain 12027-12036). The lab changes
 * themselves are runLab.ts. `labActions` is the Data tab's shared instance, so `stats_prefs` is one client, not two.
 */
export function useRunActions(projectId: string, labActions: LabActions) {
  const t = useT();
  const { settings } = useSettings();
  const access = useDocAccess();
  const callAI = useCallAI();
  const pid = projectId || null;
  const runs = useProjectBlob("stats_runs", pid);
  const prefs = labActions.prefs;
  const live = useRef({ t, runs, prefs, access, callAI, field: settings.field });
  useEffect(() => { live.current = { t, runs, prefs, access, callAI, field: settings.field }; });
  const words = useCallback((key: string, vars?: Record<string, string | number>) => live.current.t(key, vars), []);

  /** The practice gate (v1 appu_gen_first, 12574): in `stats_prefs.gen_first`, off until the student turns it on. */
  const genFirst = prefs.value?.gen_first === true;
  const toggleGen = useCallback((on: boolean) => {
    live.current.prefs.set((prev) => ({ ...(prev ?? {}), gen_first: on }));
    patchLab(projectId, { gate: { open: false, design: "", verdict: null, switched: false } });
  }, [projectId]);

  const run = useCallback(() => requestRun(projectId, live.current.prefs.value?.gen_first === true, words), [projectId, words]);
  const runChosen = useCallback(() => runNow(projectId, words), [projectId, words]);

  // R16 (kinds/stats.ts): a saved list that does not open is replaced only when the student says so, once for this visit.
  const decided = useRef<{ pid: string; yes: boolean } | null>(null);
  const mayRecord = useCallback((): boolean => {
    if (decided.current?.pid !== projectId) decided.current = { pid: projectId, yes: window.confirm(live.current.t("stats_res_runs_confirm")) };
    return decided.current.yes;
  }, [projectId]);

  /**
   * v1 statsInsert (12010-12025). The sentence goes in at the end of the document as a paragraph tagged with a new run id: any run on the lab's real table is tagged, under
   * the name the table was registered under, or the name in the box ("Untitled data" when empty) when the registration has not happened yet (a locked vault or a list still
   * being read); the registration effect of useLabActions registers the set once it can. The record is not written here: it is put in the lab's pending list, and the effect
   * below writes it once `stats_runs` is known, unlocked and not broken (R16: asks once if it is broken). So a locked vault or a slow read loses neither the tag nor the record.
   */
  const insert = useCallback(async () => {
    const lab = getLab(projectId);
    const lr = lab.lastRun;
    if (!lr || lr.outcome.kind !== "ok") return;
    const sentence = lr.outcome.res.apa;
    const now = Date.now();
    const ds = lab.registered === lr.data ? lab.regName : lab.name.trim() || UNTITLED;
    const rec = runRecord(lr.data, lr.test, lr.form, ds, sentence, now);
    const id = rec ? newRunId(now) : null;
    const ok = await live.current.access.insertBlock(sentenceHtml(sentence, id));
    if (!ok) return;
    if (id && rec) patchLab(projectId, { pendingRuns: [...getLab(projectId).pendingRuns, { id, rec }] });
    toast(live.current.t("stats_res_inserted"));
  }, [projectId]);

  const { pendingRuns } = useLab(projectId);
  const { loading: runsLoading, locked: runsLocked, broken: runsBroken } = runs;
  useEffect(() => {
    // Not before the stored list is known (the hook would queue the update and replay it onto whatever the read finds, a list that does not open included), and not
    // while the vault is locked (that would raise the passphrase prompt from a mount).
    if (!pendingRuns.length || pid === null || runsLoading || runsLocked) return;
    const batch = pendingRuns;
    patchLab(projectId, { pendingRuns: getLab(projectId).pendingRuns.filter((p) => !batch.includes(p)) });
    if (runsBroken && !mayRecord()) return; // the student kept the list that cannot be opened: the sentences stay tagged, with no record
    live.current.runs.set((prev) => batch.reduce<StatsRuns>((acc, p) => addRun(acc, p.id, p.rec), prev ?? {}));
  }, [pendingRuns, pid, projectId, runsLoading, runsLocked, runsBroken, mayRecord]);

  /**
   * v1 statsExplain (12027-12036), after the personal-data scan. Two steps: this file asks first about the values of flagged columns that are written in the request (a
   * participant's name used as a group label; core's scanText cannot see names; D-S2-70), then callAI scans for e-mail addresses, phone numbers and ID numbers as for every
   * request. The student chooses mask, send as it is, or cancel. The request is the field of study, the result's tables as text and the sentence: no data row (R1). The
   * answer is shown apart from the sentence (v1 appended it to the sentence and so to what Insert put in the document: D-S2-69), labelled as the machine's.
   */
  const explain = useCallback(async () => {
    const lab = getLab(projectId);
    const lr = lab.lastRun;
    if (!lr || lr.outcome.kind !== "ok") return;
    const forRun = lr.outcome;
    setExplain(projectId, forRun, { status: "busy" });
    let tables = statsExplainText(forRun.res.blocks), apa = forRun.res.apa;
    const found = flaggedInText(lr.data, lab.scan, [tables, apa]);
    if (found.length) {
      const sig = found.map((f) => f.kind + f.value).join("||");
      const answer = await askPd({ counts: flaggedCounts(found), total: found.length, sig });
      if (answer === "cancel") { setExplain(projectId, forRun, { status: "cancelled", message: apiMsg("cancelled") }); return; }
      if (answer === "mask") { const codes = codesFor(found); tables = maskLabels(tables, found, codes); apa = maskLabels(apa, found, codes); }
    }
    const built = buildStatsExplainPrompt(fieldLabel(live.current.field), tables, apa);
    try {
      const text = await live.current.callAI(built.prompt, { temp: built.temp, max: built.max });
      setExplain(projectId, forRun, { status: "done", text: text.trim() });
    } catch (e) {
      if (e instanceof AiCallError && e.code === "cancelled") setExplain(projectId, forRun, { status: "cancelled", message: e.message });
      else setExplain(projectId, forRun, { status: "failed", message: e instanceof AiCallError ? e.message : live.current.t("stats_res_explain_failed") });
    }
  }, [projectId]);

  return {
    genFirst, toggleGen, run, runChosen, insert, explain,
    setTest: useCallback((k: Parameters<typeof setTest>[1]) => setTest(projectId, k), [projectId]),
    setField: useCallback((id: string, v: string) => setField(projectId, id, v), [projectId]),
    tick: useCallback((id: string, col: number, on: boolean) => tickColumn(projectId, id, col, on), [projectId]),
    chooseDesign: useCallback((d: string) => chooseDesign(projectId, d), [projectId]),
    check: useCallback(() => checkChoice(projectId), [projectId]),
    switchTo: useCallback((k: Parameters<typeof switchTest>[1]) => switchTest(projectId, k), [projectId])
  };
}
export type RunActions = ReturnType<typeof useRunActions>;
