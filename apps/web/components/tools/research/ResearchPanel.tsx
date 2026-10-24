"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fieldLabel, rsFoldIndex, type Formatted, type RsPaper } from "@appuscholar/core";
import { plain, useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { gapFinder, litReview, quickRead, quickReadTicked, type GeneratorDeps, type QuickDeps } from "@/lib/ai/actions";
import { useCallAI } from "@/lib/ai/useCallAI";
import { useLiterature } from "@/lib/ai/literature";
import { useSuggestion } from "@/lib/ai/suggestion";
import { useProjectBlob } from "@/lib/blobs/useProjectBlob";
import { retrCacheSet } from "@/lib/cite/checks";
import { useLibrary } from "@/lib/cite/useLibrary";
import { analysePaper, filterStat, loadConnected } from "@/lib/research/extras";
import { addResult, insertResult, type AddDeps } from "@/lib/research/library";
import { useInsertTarget } from "@/lib/popout/sync";
import { applyQuick, filterVals, getResearch, setResearch, shownResults, SORT_OPTIONS, useSearch, type SortMode } from "@/lib/research/useSearch";
import { toast } from "@/components/ui/toast";
import { useProject } from "@/components/frame/ProjectContext";
import { placeHref } from "@/lib/frame/places";
import { ShelfDialog } from "@/components/tools/shelf/ShelfDialog";
import { ExportLink } from "@/components/export/ExportLink";
import { Connected } from "./Connected";
import { External } from "./External";
import { Filters } from "./Filters";
import { Generators } from "./Generators";
import { ManualAdd } from "./ManualAdd";
import { ResultCard, type CardActions } from "./ResultCard";
import { SearchForm } from "./SearchForm";

/** The newest "🔗 Connected papers" request: an older one that answers later writes nothing (kept for the tab, as the box is). */
let connectedGen = 0;
/** The papers shown and ticked, in the order shown (rsCheckedPapers 8524), read when a button is pressed. */
function tickedShown(): RsPaper[] {
  const st = getResearch();
  return shownResults(st.original, st.sort, st.filter).list.filter((p) => st.ticked.has(p));
}

/**
 * 🔬 Research (v1 950-1034). In v1's order: the heading and description, the form (SearchForm), the status line (#rsStatus), the sort row, the
 * filters <details> and their count (#rsFStat), the results with the fold of "probably not relevant" papers, the CSV row, the ticked papers'
 * actions (#rsActions: Quick read the ticked, the literature review, the research gap), then the external search, the manual add and the
 * connected papers <details>. The results live in this tab's memory (useSearch); the rank box is the project's `rs_prefs` blob; "+ Citation
 * library", "Insert citation" and the manual add save to the open project's citations, sealed under the vault. "📄 Analyse this paper" keeps the
 * abstract in the workspace (pendingAnalyse) for Analyse a paper. "📚 Reading shelf (your own PDFs)" opens the Reading shelf dialog (components/tools/shelf).
 */
export function ResearchPanel() {
  const t = useT();
  const { project, pendingSearch, setPendingSearch, setPendingAnalyse, go } = useProject();
  const { me, settings } = useSettings();
  // Every request this panel makes is about papers found by the search (quick reads, the literature review, the gap finder): published text, so no name in it is a participant's to suggest (C13).
  const callAI = useLiterature(useCallAI());
  const projectId = project?.id ?? me?.scratchProjectId ?? null;
  const prefs = useProjectBlob("rs_prefs", projectId);
  const library = useLibrary();
  const retr = useProjectBlob("retraction_cache", library.projectId);
  const suggestion = useSuggestion();
  // The open document's editor, or the writing window when this is a pop-out.
  const target = useInsertTarget();
  // "📚 Reading shelf (your own PDFs)" opens the shelf (shOpen 11601).
  const [shelfOpen, setShelfOpen] = useState(false);

  // v1 stores the box at each search (8306). Stored only when it changed, and never while the vault is locked: a search asks for no passphrase.
  const prefsRef = useRef(prefs);
  useEffect(() => { prefsRef.current = prefs; });
  const persistRank = useCallback((rank: boolean) => {
    const p = prefsRef.current;
    if (p.locked || (p.value?.rank ?? false) === rank) return;
    p.set((prev) => ({ ...(prev ?? {}), rank }));
  }, []);
  const { state: s, rank, search, suggest, oaKey } = useSearch({ rankStored: prefs.value?.rank ?? false, persistRank });

  // The selection bubble's "🔎 Find papers" (selFind 7651-7657): its text is the topic, searched at once (once the stored rank box is known).
  useEffect(() => {
    if (pendingSearch == null || prefs.loading) return;
    const q = pendingSearch;
    setPendingSearch(null);
    setResearch({ topic: q });
    void search(q);
  }, [pendingSearch, prefs.loading, setPendingSearch, search]);

  // rsApplySort (8354-8374): the papers the filters let through (core's rsFilterPass), in the chosen order; rsFStat's sentence.
  const { list: results, needQ } = useMemo(() => shownResults(s.original, s.sort, s.filter), [s.original, s.sort, s.filter]);
  const fold = rsFoldIndex(results, s.sort);
  const fstat = filterStat(t, filterVals(s.filter), results.length, s.original.length, needQ);
  const field = fieldLabel(settings.field);

  const addDeps = (): AddDeps => ({
    lib: library.lib, style: library.style, update: library.update, toast, t,
    known: !library.loading && !library.locked, whenRead: library.flush,
    seedRetraction: (doi, flag) => retrCacheSet(retr.set, doi, flag, Date.now()),
    // W2: Crossref's volume, issue and pages for an OpenAlex paper, filled into the saved entry.
    fetch: (input, init) => fetch(input, init), fillEmpty: library.fillEmpty
  });
  const quickDeps = (): QuickDeps => ({ callAI, field, t, toast, apply: applyQuick });
  const genDeps = (): GeneratorDeps => ({
    callAI, field, t, toast, setThinking: suggestion.setThinking, isCurrent: suggestion.isCurrent, set: suggestion.set, clear: suggestion.clear
  });
  const connected = (p: RsPaper) => {
    const gen = ++connectedGen;
    const f: typeof fetch = (input, init) => fetch(input, init);
    void loadConnected(p, { fetch: f, oaKey, setBox: (connected) => setResearch({ connected }), isCurrent: () => gen === connectedGen });
  };
  const actionsFor = (p: RsPaper): CardActions => ({
    add: () => { addResult(p, addDeps()); },
    insert: () => { void insertResult(p, { ...addDeps(), insert: (f: Formatted) => target.citation(f) }); },
    connected: () => connected(p),
    quick: () => { void quickRead(p, quickDeps()); },
    analyse: () => { analysePaper(p, { keep: setPendingAnalyse, showTool: () => { void go(placeHref(projectId ?? "", "lit", "reading")); }, toast, t }); }
  });
  // rsToggleActions (8420-8423): the actions block shows while a paper shown is ticked.
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
    <ResultCard key={s.original.indexOf(p)} p={p} i={i} ticked={s.ticked.has(p)} open={s.open.has(p)}
      onTick={(on) => onTick(p, on)} onToggleAbstract={() => toggleAbstract(p)} actions={actionsFor(p)} />
  ));

  return (
    <div className="panel" data-testid="panel-research">
      <h3>{plain(t("tab_research"))}</h3>
      <p className="desc">{t("research_panel_desc")}</p>
      <SearchForm s={s} rank={rank} rankLoading={prefs.loading && !prefs.locked} onRank={(on) => setResearch({ rank: on })} onSuggest={() => { void suggest(); }} onFind={() => { void search(); }} onShelf={() => setShelfOpen(true)} />
      <ShelfDialog open={shelfOpen} onOpenChange={setShelfOpen} />
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
      <Filters f={s.filter} />
      <div className="rs-fstat" id="rsFStat" data-testid="rs-fstat">{fstat}</div>
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
      <div className="row rs-csv-row" id="rsCsvRow">
        {/* The list's CSV is in the project's export place now (Task 12): Export opens it with the search lists ticked. */}
        <ExportLink part="search" id="rsCsvBtn" testId="rs-csv" />
      </div>
      <div id="rsActions" className="rs-actions" data-testid="rs-actions" hidden={!s.actions}>
        <Generators onQuick={() => { void quickReadTicked(tickedShown(), quickDeps()); }} onLitReview={() => { void litReview(tickedShown(), genDeps()); }} onGapFinder={() => { void gapFinder(tickedShown(), genDeps()); }} />
      </div>
      <External />
      <ManualAdd m={s.manual} deps={() => ({ lib: library.lib, update: library.update, known: !library.loading && !library.locked, whenRead: library.flush, toast, t })} />
      <Connected box={s.connected} />
    </div>
  );
}
