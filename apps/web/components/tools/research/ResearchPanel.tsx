"use client";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { rsFoldIndex, type Formatted, type RsPaper } from "@appuscholar/core";
import { plain, useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { useSuggestion } from "@/lib/ai/suggestion";
import { useProjectBlob } from "@/lib/blobs/useProjectBlob";
import { retrCacheSet } from "@/lib/cite/checks";
import { useLibrary } from "@/lib/cite/useLibrary";
import { insertCitation } from "@/lib/editor/insert";
import { addResult, insertResult, type AddDeps } from "@/lib/research/library";
import { setResearch, SORT_OPTIONS, sortedResults, useSearch, type SortMode } from "@/lib/research/useSearch";
import { toast } from "@/components/ui/toast";
import { useWorkspace } from "@/components/workspace/WorkspaceContext";
import { ResultCard, type CardActions } from "./ResultCard";
import { SearchForm } from "./SearchForm";

/** Placeholders for what Task 10 (Quick read, Connected papers, Analyse this paper) and Task 11 (the Reading shelf) build next. */
const NEXT_TASK = "This arrives in the next task.";
const SHELF_NEXT = "Reading shelf arrives in the next task.";

/**
 * 🔬 Research (v1 950-1034), part 1. In v1's order: the heading and description, the form (SearchForm), the status line (#rsStatus), the sort row,
 * [Task 10: the filters <details> and #rsFStat], the results with the fold of "probably not relevant" papers, [Task 10: the CSV row], the ticked
 * papers' actions block (#rsActions, filled by Task 10), [Task 10: the external search, manual add and connected papers <details>].
 * The results live in this tab's memory (useSearch); the rank box is the project's `rs_prefs` blob; "+ Citation library" and "Insert citation"
 * save to the open project's citations, sealed under the vault.
 */
export function ResearchPanel() {
  const t = useT();
  const { project, pendingSearch, setPendingSearch } = useWorkspace();
  const { me } = useSettings();
  const projectId = project?.id ?? me?.scratchProjectId ?? null;
  const prefs = useProjectBlob("rs_prefs", projectId);
  const library = useLibrary();
  const retr = useProjectBlob("retraction_cache", library.projectId);
  const { editor } = useSuggestion();
  const insertReady = !!editor && !editor.isDestroyed;

  // v1 stores the box at each search (8306). Stored only when it changed, and never while the vault is locked: a search asks for no passphrase.
  const prefsRef = useRef(prefs);
  useEffect(() => { prefsRef.current = prefs; });
  const persistRank = useCallback((rank: boolean) => {
    const p = prefsRef.current;
    if (p.locked || (p.value?.rank ?? false) === rank) return;
    p.set((prev) => ({ ...(prev ?? {}), rank }));
  }, []);
  const { state: s, rank, search, suggest } = useSearch({ rankStored: prefs.value?.rank ?? false, persistRank });

  // The selection bubble's "🔎 Find papers" (selFind 7651-7657): its text is the topic, searched at once (once the stored rank box is known).
  useEffect(() => {
    if (pendingSearch == null || prefs.loading) return;
    const q = pendingSearch;
    setPendingSearch(null);
    setResearch({ topic: q });
    void search(q);
  }, [pendingSearch, prefs.loading, setPendingSearch, search]);

  const results = useMemo(() => sortedResults(s.original, s.sort), [s.original, s.sort]);
  const fold = rsFoldIndex(results, s.sort);

  const addDeps = (): AddDeps => ({
    lib: library.lib, style: library.style, update: library.update, toast, t,
    known: !library.loading && !library.locked, whenRead: library.flush,
    seedRetraction: (doi, flag) => retrCacheSet(retr.set, doi, flag, Date.now())
  });
  const actionsFor = (p: RsPaper): CardActions => ({
    add: () => { addResult(p, addDeps()); },
    insert: () => { insertResult(p, { ...addDeps(), insert: (f: Formatted) => { if (editor && !editor.isDestroyed) insertCitation(editor, f); } }); },
    connected: () => toast(NEXT_TASK),
    quick: () => toast(NEXT_TASK),
    analyse: () => toast(NEXT_TASK)
  });
  // rsToggleActions (8420-8422): the actions block shows while a shown paper is ticked.
  const onTick = (p: RsPaper, on: boolean) => setResearch((st) => {
    const ticked = new Set(st.ticked);
    if (on) ticked.add(p); else ticked.delete(p);
    return { ticked, actions: results.some((x) => ticked.has(x)) };
  });
  const toggleAbstract = (p: RsPaper) => setResearch((st) => {
    const open = new Set(st.open);
    if (open.has(p)) open.delete(p); else open.add(p);
    return { open };
  });
  const cards = results.map((p, i) => (
    <ResultCard key={s.original.indexOf(p)} p={p} i={i} ticked={s.ticked.has(p)} open={s.open.has(p)} insertReady={insertReady}
      onTick={(on) => onTick(p, on)} onToggleAbstract={() => toggleAbstract(p)} actions={actionsFor(p)} />
  ));

  return (
    <div className="panel" data-testid="panel-research">
      <h3>{plain(t("tab_research"))}</h3>
      <p className="desc">{t("research_panel_desc")}</p>
      <SearchForm s={s} rank={rank} onRank={(on) => setResearch({ rank: on })} onSuggest={() => { void suggest(); }} onFind={() => { void search(); }} onShelf={() => toast(SHELF_NEXT)} />
      <p className="desc rs-status" id="rsStatus" data-testid="rs-status" role="status">{s.status}</p>
      {s.original.length > 0 && (
        <div className="rs-line rs-sort-row" id="rsSortRow" data-testid="rs-sort-row">
          <label htmlFor="rsSort">{t("research_sort_label")}</label>
          {/* rsApplySort() (8347): a new order hides the actions block (8374), the ticks stay. */}
          <select className="input rs-select" id="rsSort" value={s.sort} onChange={(e) => setResearch({ sort: e.target.value as SortMode, actions: false })}>
            {SORT_OPTIONS.map(([v, k]) => <option key={v} value={v}>{t(k)}</option>)}
          </select>
        </div>
      )}
      {/* Task 10: the filters <details id="rsFilters"> (976-987), then #rsFStat (988). */}
      <div id="rsResults" data-testid="rs-results">
        {fold > 0 ? (
          <>
            {cards.slice(0, fold)}
            <details className="rs-fold" data-testid="rs-fold">
              <summary>{cards.length - fold + " " + t("rs2_probably_not_relevant_fit")}</summary>
              {cards.slice(fold)}
            </details>
          </>
        ) : cards}
      </div>
      {/* Task 10: the CSV row (#rsCsvRow, 990). */}
      <div id="rsActions" data-testid="rs-actions" hidden={!s.actions}>
        {/* Task 10: Quick read the ticked papers, the literature review, the research gap and the grounded note (993-996). */}
      </div>
      {/* Task 10: the external search (999-1009), the manual add (1011-1024) and the connected papers (1026-1030) <details>. */}
    </div>
  );
}
