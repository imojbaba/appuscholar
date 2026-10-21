"use client";
import { useCallback, useEffect, useRef } from "react";
import { fieldLabel } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { useProjectBlob } from "@/lib/blobs/useProjectBlob";
import { useDocAccess } from "@/lib/editor/docAccess";
import { useCallAI } from "@/lib/ai/useCallAI";
import { AiCallError } from "@/lib/ai/callAI";
import { toast } from "@/components/ui/toast";
import { buildStatsExplainPrompt, statsExplainText } from "./explain";
import { getLab, patchLab } from "./lab";
import { addRun, newRunId, runRecord, sentenceHtml } from "./run";
import { checkChoice, chooseDesign, requestRun, runNow, setExplain, setField, setTest, switchTest, tickColumn } from "./runLab";
import type { LabActions } from "./useLabActions";

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
    if (!live.current.runs.broken) return true;
    if (decided.current?.pid !== projectId) decided.current = { pid: projectId, yes: window.confirm(live.current.t("stats_res_runs_confirm")) };
    return decided.current.yes;
  }, [projectId]);

  /**
   * v1 statsInsert (12010-12025). The sentence goes in at the end of the document as a paragraph tagged with the run's id when the run is recorded, which it is
   * only when the table was registered under a name (a table whose registration has not happened, or was declined, is inserted untagged, as v1's demo runs were).
   * The record is saved once the document took the sentence; a vault that is locked or a save held keeps it (the blob hook queues it and sends it once it can).
   */
  const insert = useCallback(async () => {
    const lab = getLab(projectId);
    const lr = lab.lastRun;
    if (!lr || lr.outcome.kind !== "ok") return;
    const sentence = lr.outcome.res.apa;
    const now = Date.now();
    const registered = lab.registered === lr.data;
    const rec = registered ? runRecord(lr.data, lr.test, lr.form, lab.regName, sentence, now) : null;
    const id = rec && pid !== null && mayRecord() ? newRunId(now) : null;
    const ok = await live.current.access.insertBlock(sentenceHtml(sentence, id));
    if (!ok) return;
    if (id && rec) {
      live.current.runs.set((prev) => addRun(prev, id, rec));
      void live.current.runs.flush();
    }
    toast(live.current.t("stats_res_inserted"));
  }, [projectId, pid, mayRecord]);

  /**
   * v1 statsExplain (12027-12036), after the personal-data scan (callAI scans the whole request before anything leaves; the student chooses to mask, send as it is
   * or cancel). The request is the field of study, the result's tables as text and the sentence: no data row (R1). The answer is shown apart from the sentence
   * (v1 appended it to the sentence and so to what Insert put in the document: register row D-S2-69), labelled as the machine's.
   */
  const explain = useCallback(async () => {
    const lr = getLab(projectId).lastRun;
    if (!lr || lr.outcome.kind !== "ok") return;
    const forRun = lr.outcome;
    setExplain(projectId, forRun, { status: "busy" });
    const built = buildStatsExplainPrompt(fieldLabel(live.current.field), statsExplainText(forRun.res.blocks), forRun.res.apa);
    try {
      const text = await live.current.callAI(built.prompt, { temp: built.temp, max: built.max });
      setExplain(projectId, forRun, { status: "done", text: text.trim() });
    } catch (e) {
      setExplain(projectId, forRun, { status: "failed", message: e instanceof AiCallError ? e.message : live.current.t("stats_res_explain_failed") });
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
