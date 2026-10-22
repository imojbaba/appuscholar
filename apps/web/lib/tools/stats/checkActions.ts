"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { useProjectBlob } from "@/lib/blobs/useProjectBlob";
import type { StatsRuns } from "@/lib/blobs/kinds/stats";
import { useDocAccess } from "@/lib/editor/docAccess";
import { getLab, NO_GATE, patchLab } from "./lab";
import { flipped, scanProject, tagText, withTagText, type ResultItem } from "./checkResults";
import { prepareRerun } from "./rerun";

/*
 * What the Check tab's results list does with the world (Task B6): reads the project's documents and its two stored lists (`stats_runs`, `stats_sets`), re-runs a
 * result on the data in the lab (v1 rtRerun 12331-12339, rtRerunAll 12340-12349) and puts the new sentence in its document through the document access.
 */

/** What one re-run came to. `skipped`: the student declined to replace text they had edited. */
export type RerunOutcome = { kind: "done"; flip: boolean; sentence: string } | { kind: "failed"; msg: string } | { kind: "skipped" };
/** What "Re-run every out-of-date result" came to. */
export type RerunAll = { n: number; done: number; flips: number; skipped: number; failed: number; msg: string };

export function useCheckActions(projectId: string) {
  const t = useT();
  const access = useDocAccess();
  const runs = useProjectBlob("stats_runs", projectId || null);
  const sets = useProjectBlob("stats_sets", projectId || null);
  const live = useRef({ t, access, runs, sets });
  useEffect(() => { live.current = { t, access, runs, sets }; });
  /** The runs as last set here until the hook shows them (a set shows at once, but a render may not have happened by the time the next step reads it). */
  const mine = useRef<StatsRuns | null>(null);
  useEffect(() => { mine.current = null; }, [runs.value]);
  const words = useCallback((key: string, vars?: Record<string, string | number>) => live.current.t(key, vars), []);

  const [items, setItems] = useState<ResultItem[] | null>(null);
  const [scanning, setScanning] = useState(false);

  /** Why the lists cannot be compared yet, or "" when they can. */
  const waiting: "" | "loading" | "locked" | "unreadable" =
    runs.locked || sets.locked ? "locked" : runs.loading || sets.loading ? "loading" : runs.broken || sets.broken || runs.error || sets.error ? "unreadable" : "";

  const currentRuns = useCallback((): StatsRuns => mine.current ?? live.current.runs.value ?? {}, []);

  /** v1 rtOpen (12287): every document of the project read, its tagged results listed with their status. */
  const scan = useCallback(async (): Promise<ResultItem[]> => {
    setScanning(true);
    try {
      const docs = await live.current.access.allDocuments();
      const found = scanProject(docs, currentRuns(), live.current.sets.value ?? {});
      setItems(found);
      return found;
    } finally { setScanning(false); }
  }, [currentRuns]);

  /**
   * v1 rtRerunOne (12313-12330) for the project. The document is read again first (the student may have typed since the scan), so the span replaced is the one that
   * is there now. The test is run on the loaded data before anything is touched; when the text there is not what was inserted the student is asked; the lab's form
   * is set to the run's; the document is rewritten with only that span's text changed; and only then is the run record updated, so a document that cannot be
   * changed (deleted, or holding text that is not saved yet) leaves the record as it was.
   */
  const rerunOne = useCallback(async (item: ResultItem): Promise<RerunOutcome> => {
    const L = live.current;
    const run = currentRuns()[item.id];
    if (!run) return { kind: "failed", msg: words("rt_why_norec") };
    const doc = (await L.access.allDocuments()).find((d) => d.id === item.docId);
    const there = doc ? tagText(doc.html, item.id, item.nth) : null;
    if (!doc || there === null) return { kind: "failed", msg: words("stats_check_gone") };
    const prep = prepareRerun(getLab(projectId), run, L.sets.value ?? {}, words, Date.now());
    if (!prep.ok) return { kind: "failed", msg: prep.msg };
    const html = withTagText(doc.html, item.id, item.nth, prep.sentence);
    if (html === null) return { kind: "failed", msg: words("stats_check_gone") };
    if (there !== run.sentence && !window.confirm(words("rt_edit_warn"))) return { kind: "skipped" };
    patchLab(projectId, { test: prep.test, form: prep.form, gate: NO_GATE });
    if (!(await L.access.rewriteDocument(doc.id, html))) return { kind: "failed", msg: words("stats_check_nowrite", { title: doc.title }) };
    const next: StatsRuns = { ...currentRuns(), [item.id]: prep.record };
    mine.current = next;
    live.current.runs.set(next);
    return { kind: "done", flip: flipped(run.sentence, prep.sentence), sentence: prep.sentence };
  }, [currentRuns, projectId, words]);

  /** v1 rtRerunAll (12340-12349): the out-of-date results one after the other, each read fresh; one that cannot be re-run is counted and the rest go on. */
  const rerunAll = useCallback(async (list: ResultItem[]): Promise<RerunAll> => {
    const out: RerunAll = { n: list.length, done: 0, flips: 0, skipped: 0, failed: 0, msg: "" };
    for (const item of list) {
      const r = await rerunOne(item);
      if (r.kind === "done") { out.done++; if (r.flip) out.flips++; }
      else if (r.kind === "skipped") out.skipped++;
      else { out.failed++; out.msg = out.msg || r.msg; }
    }
    return out;
  }, [rerunOne]);

  // eslint-disable-next-line react-hooks/refs -- the ref only holds what was set a moment ago, for a render that has not happened yet
  return { items, scanning, waiting, scan, rerunOne, rerunAll, readOnly: runs.readOnly, runs: mine.current ?? runs.value };
}
export type CheckActions = ReturnType<typeof useCheckActions>;
