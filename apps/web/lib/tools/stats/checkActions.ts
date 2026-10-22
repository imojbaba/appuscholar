"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { useProjectBlob } from "@/lib/blobs/useProjectBlob";
import type { StatsRuns } from "@/lib/blobs/kinds/stats";
import { useDocAccess } from "@/lib/editor/docAccess";
import { useSuggestion } from "@/lib/ai/suggestion";
import { useProject } from "@/components/frame/ProjectContext";
import { getLab, NO_GATE, patchLab, useLab } from "./lab";
import { blockedBy, flipped, scanProject, tagText, withTagText, type ResultItem } from "./checkResults";
import { useStatsSets } from "./StatsSets";
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
  const sets = useStatsSets();
  const { editor } = useSuggestion();
  const { currentDoc, documents } = useProject();
  const live = useRef({ t, access, runs, sets, editor, currentDocId: currentDoc?.id ?? null, documents });
  useEffect(() => { live.current = { t, access, runs, sets, editor, currentDocId: currentDoc?.id ?? null, documents }; });
  // A table the lab holds that the project has not recorded is recorded by StatsSetsHost (the Panel) under whichever tab is open; until it is, nothing is compared.
  const lab = useLab(projectId);
  const unrecorded = !!lab.data && lab.registered !== lab.data;
  /** The runs as last set here until the hook shows them (a set shows at once, but a render may not have happened by the time the next step reads it). */
  const mine = useRef<StatsRuns | null>(null);
  useEffect(() => { mine.current = null; }, [runs.value]);
  const words = useCallback((key: string, vars?: Record<string, string | number>) => live.current.t(key, vars), []);

  const [items, setItems] = useState<ResultItem[] | null>(null);
  const [scanning, setScanning] = useState(false);

  /** Why results cannot be compared yet, or "" when they can (lists locked, still being read, unreadable, or the lab's table not yet recorded). */
  const waiting = blockedBy({ runs, sets }, unrecorded);
  /** The documents of the project the last scan could not read (a locked vault, or one that does not decrypt): their results were not checked. */
  const [unread, setUnread] = useState(0);

  const currentRuns = useCallback((): StatsRuns => mine.current ?? live.current.runs.value ?? {}, []);

  /** v1 rtOpen (12287): every document of the project read, its tagged results listed with their status. */
  const scan = useCallback(async (): Promise<ResultItem[]> => {
    setScanning(true);
    try {
      const docs = await live.current.access.allDocuments();
      const read = new Set(docs.map((d) => d.id));
      setUnread(live.current.documents.filter((d) => !read.has(d.id)).length);
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
    // The lists are written only when they are known, open and not broken (R16: a list that does not open is never set over without asking, and this tab does not ask).
    if (blockedBy({ runs: L.runs, sets: L.sets }, false)) return { kind: "failed", msg: words("stats_check_rt_" + blockedBy({ runs: L.runs, sets: L.sets }, false)) };
    const run = currentRuns()[item.id];
    if (!run) return { kind: "failed", msg: words("rt_why_norec") };
    const doc = (await L.access.allDocuments()).find((d) => d.id === item.docId);
    if (!doc) return { kind: "failed", msg: words("stats_check_gone") };
    const prep = prepareRerun(getLab(projectId), run, L.sets.value ?? {}, words, Date.now());
    if (!prep.ok) return { kind: "failed", msg: prep.msg };
    // Everything from here to the write is synchronous: the open document is read from its editor at this moment, not from what the scan or allDocuments() read earlier,
    // so words typed since are in the HTML that is written back. Another document is written from what was read just now (its text cannot change under the student's hands).
    const ed = L.editor && !L.editor.isDestroyed && L.currentDocId === doc.id ? L.editor : null;
    const base = ed ? ed.getHTML() : doc.html;
    const there = tagText(base, item.id, item.nth);
    const html = there === null ? null : withTagText(base, item.id, item.nth, prep.sentence);
    if (html === null || there === null) return { kind: "failed", msg: words("stats_check_gone") };
    if (there !== run.sentence && !window.confirm(words("rt_edit_warn"))) return { kind: "skipped" };
    patchLab(projectId, { test: prep.test, form: prep.form, gate: NO_GATE });
    // A confirm is synchronous too, but typing after it cannot be told apart from typing before it: read once more when the editor is live and has moved on.
    const final = ed && ed.getHTML() !== base ? withTagText(ed.getHTML(), item.id, item.nth, prep.sentence) : html;
    if (final === null) return { kind: "failed", msg: words("stats_check_gone") };
    if (!(await L.access.rewriteDocument(doc.id, final))) return { kind: "failed", msg: words("stats_check_nowrite", { title: doc.title }) };
    mine.current = { ...currentRuns(), [item.id]: prep.record };
    // An update of what is stored, as the Data tab's Insert does it, so a run saved meanwhile is kept.
    live.current.runs.set((prev) => ({ ...(prev ?? {}), [item.id]: prep.record }));
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
  return { items, scanning, waiting, unread, scan, rerunOne, rerunAll, readOnly: runs.readOnly, runs: mine.current ?? runs.value };
}
export type CheckActions = ReturnType<typeof useCheckActions>;
