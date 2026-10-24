"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fieldLabel, rsFoldIndex, type Formatted, type RsPaper } from "@appuscholar/core";
import { MagnifyingGlass, Plus, X } from "@phosphor-icons/react";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { quickRead, type QuickDeps } from "@/lib/ai/actions";
import { useCallAI } from "@/lib/ai/useCallAI";
import { useProjectBlob } from "@/lib/blobs/useProjectBlob";
import type { Library } from "@/lib/cite/useLibrary";
import { retrCacheSet } from "@/lib/cite/checks";
import { paperMatch } from "@/lib/papers/ids";
import { keepResult, libraryKnown, type KeepResult, type KeepResultDeps } from "@/lib/papers/keep";
import { useKeep } from "@/lib/papers/useKeep";
import { analysePaper, loadConnected, openExternal } from "@/lib/research/extras";
import { insertResult } from "@/lib/research/library";
import { useInsertTarget } from "@/lib/popout/sync";
import { applyQuick, getResearch, setResearch, shownResults, SORT_OPTIONS, useSearch, type SortMode } from "@/lib/research/useSearch";
import { placeHref } from "@/lib/frame/places";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { useProject } from "@/components/frame/ProjectContext";
import { ExportLink } from "@/components/export/ExportLink";
import { Connected } from "@/components/tools/research/Connected";
import { FindFilters } from "./FindFilters";
import { FindResult, type ResultActions } from "./FindResult";
import { PasteBox } from "./PasteBox";

/** The newest "Papers connected to this one" request: an older one that answers later writes nothing (kept for the tab, as the box is). */
let connectedGen = 0;

type T = (key: string, vars?: Record<string, string | number>) => string;

/** The count above the results. One paper, and one that matches, take their singular ("1 paper", "that matches"); none, or two or more, "that match". */
function countLine(t: T, total: number, shown: number): string {
  if (total === 1) return t(shown === 1 ? "find_count_one" : "find_count_one_none");
  return t(shown === 1 ? "find_count_shown_one" : "find_count", { total, shown });
}

/**
 * Find (canvas Find; wave B Task 18, register row D-S2-123): the first tab of the Literature place. It replaces the Research panel: the same search, related terms, filters,
 * sort and Export (lib/research/*, unchanged), laid out as the canvas draws it. The topic box and its Search button, then the AI's related terms as chips; the filters
 * aside "Narrow the results" beside the results (above them on a phone); and above the results the count, the Sort select and Export together. Each result has one
 * primary action, Keep (the paper joins the library and the reading list, lib/papers/keep.ts), and a More menu for the rest. The results live in this tab's memory
 * (useSearch); the rank box is the project's `rs_prefs` blob; kept papers are the project's `citations` blob, sealed under the vault. A Keep made while the library is
 * loading or locked waits for it to be read (useKeep): the button is busy, and nothing is decided on a library that has not been read. A paper in the library reads Kept
 * whenever the library is known, also after a save failed (the keep is held for a retry); a Keep that went through is said once, in a polite live region, since the button
 * keeps focus and shows no toast.
 */
export function FindTab() {
  const t = useT();
  const { project, pendingSearch, setPendingSearch, setPendingAnalyse, go } = useProject();
  const { me, settings } = useSettings();
  const callAI = useCallAI();
  const projectId = project?.id ?? me?.scratchProjectId ?? null;
  const prefs = useProjectBlob("rs_prefs", projectId);
  const { library, keepWhenRead } = useKeep();
  const retr = useProjectBlob("retraction_cache", library.projectId);
  // The open document's editor, or the writing window when this is a pop-out.
  const target = useInsertTarget();
  // The papers whose Keep, or whose citation, is being done (waiting for the library to be read counts).
  const [busy, setBusy] = useState<ReadonlySet<RsPaper>>(new Set());
  // What the live region says: "Kept: {title}" after a Keep went through.
  const [announced, setAnnounced] = useState("");
  const mark = useCallback((p: RsPaper, on: boolean) => setBusy((prev) => { const next = new Set(prev); if (on) next.add(p); else next.delete(p); return next; }), []);

  // v1 stores the box at each search (8306). Stored only when it changed, and never while the vault is locked: a search asks for no passphrase.
  const prefsRef = useRef(prefs);
  useEffect(() => { prefsRef.current = prefs; });
  const persistRank = useCallback((rank: boolean) => {
    const p = prefsRef.current;
    if (p.locked || (p.value?.rank ?? false) === rank) return;
    p.set((prev) => ({ ...(prev ?? {}), rank }));
  }, []);
  const { state: s, rank, search, suggest, oaKey } = useSearch({ rankStored: prefs.value?.rank ?? false, persistRank });

  // The selection bubble's "Find papers" (selFind 7651-7657): its text is the topic, searched at once (once the stored rank box is known).
  useEffect(() => {
    if (pendingSearch == null || prefs.loading) return;
    const q = pendingSearch;
    setPendingSearch(null);
    setResearch({ topic: q });
    void search(q);
  }, [pendingSearch, prefs.loading, setPendingSearch, search]);

  // rsApplySort (8354-8374): the papers the filters let through (core's rsFilterPass), in the chosen order.
  const { list: results } = useMemo(() => shownResults(s.original, s.sort, s.filter), [s.original, s.sort, s.filter]);
  const fold = rsFoldIndex(results, s.sort);
  const field = fieldLabel(settings.field);

  const keepDeps = (l: Library): KeepResultDeps => ({
    ...l,
    fetch: (input, init) => fetch(input, init),
    seedRetraction: (doi, flag) => retrCacheSet(retr.set, doi, flag, Date.now())
  });
  const quickDeps = (): QuickDeps => ({ callAI, field, t, toast, apply: applyQuick });
  const failed = () => { toast(t("list_action_fail")); };

  /** Keeps `p` once the library has been read; null when it cannot be (nothing was kept). A retracted paper kept says so. */
  const keep = async (p: RsPaper): Promise<KeepResult | null> => {
    mark(p, true);
    try {
      const r = await keepWhenRead((l) => keepResult(p, keepDeps(l)));
      if (r?.state === "kept" && p.retracted) toast(t("retr_added_warn"));
      return r;
    } finally { mark(p, false); }
  };
  /** The Keep button: kept or already kept once the library has been read, and said aloud; nothing is said when nothing was kept. */
  const pressKeep = (p: RsPaper) => {
    void keep(p).then((r) => { if (r) setAnnounced(t("find_kept_announce", { title: p.title })); }).catch(failed);
  };
  const connected = (p: RsPaper) => {
    const gen = ++connectedGen;
    const f: typeof fetch = (input, init) => fetch(input, init);
    setResearch((st) => ({ details: { ...st.details, connected: true } }));
    void loadConnected(p, { fetch: f, oaKey, setBox: (box) => setResearch({ connected: box }), isCurrent: () => gen === connectedGen });
  };
  const actionsFor = (p: RsPaper): ResultActions => ({
    cite: () => {
      mark(p, true);
      void keepWhenRead((l) => insertResult(p, { ...keepDeps(l), insert: (f: Formatted) => target.citation(f), toast, t })).catch(failed).finally(() => mark(p, false));
    },
    connected: () => connected(p),
    quick: () => { void quickRead(p, quickDeps()); },
    // The reader comes in B3 (ruling B2-R14): until then the abstract goes to Analyse a paper, as "Analyse this paper" sent it, once the paper is kept.
    read: () => {
      void keep(p).then((r) => {
        if (r) analysePaper(p, { keep: setPendingAnalyse, showTool: () => { void go(placeHref(projectId ?? "", "lit", "reading")); }, toast, t });
      }).catch(failed);
    }
  });
  const isKept = (p: RsPaper) => libraryKnown(library) && library.lib.some((e) => paperMatch({ doi: p.doi, title: p.title, year: String(p.year ?? "") }, e));

  const cards = results.map((p) => (
    <FindResult key={s.original.indexOf(p)} p={p} kept={isKept(p)} busy={busy.has(p)} keepOff={library.broken}
      onKeep={() => { pressKeep(p); }} actions={actionsFor(p)} />
  ));
  const { terms } = s;

  return (
    <div className="find" data-testid="panel-find">
      <form className="find-search" onSubmit={(e) => { e.preventDefault(); void search(); }}>
        <label htmlFor="rsTopic" className="find-search-label">{t("find_searching_on")}</label>
        <div className="find-search-row">
          <input className="input find-topic" type="text" id="rsTopic" data-testid="rs-topic" value={s.topic} placeholder={t("find_topic_ph")} onChange={(e) => setResearch({ topic: e.target.value })} />
          <Button variant="primary" type="submit" className="find-go" data-testid="rs-find"><MagnifyingGlass size={16} aria-hidden="true" />{t("find_search_btn")}</Button>
        </div>
        <div className="find-terms" id="rsTerms" data-testid="rs-terms">
          <Button variant="ghost" size="sm" type="button" id="rsTermsBtn" data-testid="rs-terms-btn" onClick={() => { void suggest(); }}>{t("find_suggest_terms")}</Button>
          {s.termsBox === "thinking" && <span className="find-note">{t("find_terms_thinking")}</span>}
          {s.termsBox === "none" && <span className="find-note">{t("find_terms_none")}</span>}
          {s.termsBox === "list" && terms.terms.length > 0 && (
            <>
              <span className="find-terms-label" data-testid="find-terms-label">{t("find_terms_label")}</span>
              {terms.terms.map((term, i) => (
                <label key={i} className="find-chip" data-picked={terms.picked[i] || undefined} data-testid="rs-term">
                  <input type="checkbox" data-rsterm={i} checked={!!terms.picked[i]} onChange={(e) => {
                    const on = e.target.checked;
                    setResearch((st) => ({ terms: { ...st.terms, picked: st.terms.picked.map((x, k) => (k === i ? on : x)) } }));
                  }} />
                  {term}
                  {terms.picked[i] ? <X size={12} weight="bold" aria-hidden="true" /> : <Plus size={12} weight="bold" aria-hidden="true" />}
                </label>
              ))}
            </>
          )}
        </div>
      </form>
      <PasteBox />
      <div className="find-grid">
        <FindFilters s={s} rank={rank} rankLoading={prefs.loading && !prefs.locked} onRank={(on) => setResearch({ rank: on })}
          onScholar={() => openExternal("scholar", getResearch().topic, { open: (url) => { window.open(url, "_blank", "noopener,noreferrer"); }, toast, t })} />
        <div className="find-main">
          <p className="find-status" id="rsStatus" data-testid="rs-status" role="status">{s.status}</p>
          {library.locked && <p className="find-lib" role="status" data-testid="find-locked">{t("vault_cite_locked")}</p>}
          {library.broken && <p className="find-lib" role="status" data-testid="find-broken">{t("vault_cite_broken")}</p>}
          {library.error && !library.broken && <p className="find-lib" role="status" data-testid="find-error">{t("find_library_error")}</p>}
          {/* One polite live region for every Keep (the buttons keep focus and the toast is gone): in the page before it speaks, empty until a Keep goes through. */}
          <p className="sr-only" role="status" aria-live="polite" data-testid="find-announce">{announced}</p>
          {s.original.length > 0 && (
            <div className="find-head" id="rsSortRow" data-testid="rs-sort-row">
              <p className="find-count" data-testid="find-papers">{countLine(t, s.original.length, results.length)}</p>
              <div className="find-head-tools">
                <label htmlFor="rsSort">{t("find_sort")}</label>
                <select className="input find-select" id="rsSort" value={s.sort} onChange={(e) => setResearch({ sort: e.target.value as SortMode })}>
                  {SORT_OPTIONS.map(([v, k]) => <option key={v} value={v}>{t(k)}</option>)}
                </select>
                {/* The list's CSV is in the project's export place (Task 12): Export opens it with the search lists ticked (W11). */}
                <ExportLink part="search" id="rsCsvBtn" testId="rs-csv" />
              </div>
            </div>
          )}
          {s.connected && <Connected box={s.connected} />}
          <div className="find-results" id="rsResults" data-testid="rs-results">
            {fold > 0 ? (
              <>
                {cards.slice(0, fold)}
                <details className="find-fold" data-testid="rs-fold">
                  <summary>{t("find_fold", { n: cards.length - fold })}</summary>
                  {cards.slice(fold)}
                </details>
              </>
            ) : cards}
          </div>
        </div>
      </div>
    </div>
  );
}
