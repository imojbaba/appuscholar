"use client";
import { useCallback, useSyncExternalStore } from "react";
import { fieldLabel, oaSearch, pmSearch, rsDedupe, rsFilterPass, rsSortResults, type RsBrief, type RsFilter, type RsPaper, type RsQuick } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { pickedTerms, rankPapers, suggestTerms, type ResearchAiDeps, type RsTerms, type RsTermsBox } from "@/lib/ai/actions";
import { useCallAI } from "@/lib/ai/useCallAI";
import { toast } from "@/components/ui/toast";
import { useOpenAlexKey } from "./oaKey";
import { failedSource, rankFailedNote, rankingStatus, rankNote, statusLine } from "./status";

/*
 * The Research search (v1 researchSearch 8283-8330, rsApplySort 8347-8375): the pure orchestration `runSearch`, and the panel's state, held for
 * the tab's life outside React so the results survive the dock switching to the AI tab and back (v1's results stay in the page). Nothing here is
 * stored: results, ticks, related terms and the status are in memory only; the one stored thing, "Rank by fit to my question", goes to the
 * project's `rs_prefs` blob through the panel.
 */

/** v1 8286: a longer topic is refused. */
export const TOPIC_MAX = 600;

/** #rsDesign's options (956): the value and its label's key. */
export const DESIGN_OPTIONS: ReadonlyArray<readonly [string, string]> = [
  ["any", "rs2_any"], ["rct", "rs2_randomised_trial"], ["sr", "rs2_systematic_review_or_meta"], ["review", "rs2_review_article_openalex_type"],
  ["qual", "rs2_qualitative_study_words_in"], ["survey", "rs2_survey_or_questionnaire_study"]
];
/** #rsSort's options (968-973): the value and its label's key. */
export const SORT_OPTIONS: ReadonlyArray<readonly [SortMode, string]> = [
  ["relevance", "research_sort_relevance"], ["citations", "research_sort_citations"], ["year", "research_sort_year"], ["fit", "rs2_fit_to_my_question"]
];
export type SortMode = "relevance" | "citations" | "year" | "fit";

export type SearchInput = {
  /** #rsTopic as typed (trimmed here, 8284). */
  topic: string;
  oa: boolean;
  pm: boolean;
  design: string;
  /** The design's option label, as the select shows it. */
  designLabel: string;
  rank: boolean;
  /** rsPickedTerms(q): the ticked related terms for this topic. */
  terms: string[];
};
export type SearchDeps = ResearchAiDeps & {
  fetch: typeof fetch;
  /** The student's OpenAlex key (credential `openalex`), or null. */
  oaKey: string | null;
  toast(msg: string): void;
  setStatus(text: string): void;
  /** The search has started: the old results and the ticked papers' actions go (8293-8294). From here on it is the current search. */
  begin(): void;
  /** False once a newer search has begun: this one then writes nothing more and stops ranking (no further AI call). */
  isCurrent?(): boolean;
  /** 8306: the rank box is remembered at each search. */
  persistRank(rank: boolean): void;
};
/** What a search leaves: the merged, de-duplicated (and maybe ranked) papers, the sort it sets (8322) and the final status line. */
export type SearchOutcome = { papers: RsPaper[]; sort: SortMode; status: string };

/**
 * researchSearch (8283-8330). Refusals first, with v1's toasts and status sentences; then both sources at once (OpenAlex then PubMed, v1's job
 * order), 25 and 15 papers when ranking, else 8 and 6, with the ticked related terms; a source that fails is named in the status, the other's
 * papers are kept; the two lists are merged in job order and de-duplicated by core; ticked "Rank by fit" ranks them (rankPapers). Null when refused,
 * and null (with nothing written after it) when a newer search began meanwhile.
 */
export async function runSearch(input: SearchInput, d: SearchDeps): Promise<SearchOutcome | null> {
  const q = input.topic.trim();
  if (!q) { d.toast(d.t("rs2_type_a_topic_or")); return null; }
  if (q.length > TOPIC_MAX) { d.setStatus(d.t("rs2_that_search_is_too")); return null; }
  if (!/[\p{L}\p{N}]/u.test(q)) { d.setStatus(d.t("rs2_use_some_words_or")); return null; }
  if (!input.oa && !input.pm) { d.toast(d.t("rs2_pick_at_least_one")); return null; }
  d.begin();
  const live = () => !d.isCurrent || d.isCurrent();
  d.setStatus(d.t("rs2_searching"));
  const { design, terms, rank } = input;
  d.persistRank(rank);
  const jobs: Array<Promise<{ source: string; papers: RsPaper[]; error?: string; fellBack?: true }>> = [];
  if (input.oa) jobs.push(oaSearch(d.fetch, { q, terms, design, perPage: rank ? 25 : 8, key: d.oaKey ?? undefined }).then((r) => ({ source: "OpenAlex", ...r })));
  if (input.pm) jobs.push(pmSearch(d.fetch, { q, terms, design, retmax: rank ? 15 : 6 }).then((r) => ({ source: "PubMed", ...r })));
  const outcomes = await Promise.all(jobs);
  if (!live()) return null;
  let merged: RsPaper[] = [];
  const failed: string[] = [];
  // v1 shares one fellBack flag between the two sources (8296).
  let fellBack = false;
  for (const o of outcomes) {
    if (o.fellBack) fellBack = true;
    if (o.error !== undefined) failed.push(failedSource(d.t, o.source, o.error)); else merged = merged.concat(o.papers);
  }
  merged = rsDedupe(merged);
  let papers = merged, note = "";
  if (rank && merged.length) {
    d.setStatus(rankingStatus(d.t, merged.length));
    // v1 shows the error's message (8320); here it is callAI's sentence for the student (register D-S2-12).
    try { const rr = await rankPapers(merged, q, { ...d, isCurrent: live }); papers = rr.papers; note = rankNote(d.t, rr, merged.length); }
    catch (e) { note = rankFailedNote(d.t, (e instanceof Error && e.message) || "error"); }
    if (!live()) return null;
  }
  const sort: SortMode = rank && papers.some((x) => x.rel) ? "fit" : "relevance";
  const status = statusLine(d.t, { count: merged.length, termsCount: terms.length, fellBack, design, designLabel: input.designLabel, rankNote: note, failed });
  return { papers, sort, status };
}

/** rsApplySort's list (8350-8365, without the filters): the results in the chosen order, by core. */
export const sortedResults = (original: RsPaper[], mode: SortMode): RsPaper[] => rsSortResults(original, mode);

/** The filter boxes (#rsFYear, #rsFOA, #rsFRet, #rsFDes, #rsFN, 976-987) as typed. */
export type FilterForm = { year: string; oa: boolean; ret: boolean; des: string; n: string };
/** As the page starts, and as "Clear filters" leaves them (rsFilterClear 8347-8352). */
export const FILTER_EMPTY: FilterForm = { year: "", oa: false, ret: false, des: "", n: "" };
/** rsFilterVals (8332-8335): the boxes read as v1 reads them. */
export const filterVals = (f: FilterForm): RsFilter => ({ year: parseInt(f.year, 10) || 0, oa: !!f.oa, ret: !!f.ret, des: f.des || "", n: parseInt(f.n, 10) || 0 });
/** rsFilterActive (8353). */
export const filterActive = (F: RsFilter): boolean => !!(F.year || F.oa || F.ret || F.des || F.n);

/**
 * rsApplySort's list (8357-8364): the results that pass core's rsFilterPass, in the chosen order (core's rsSortResults), and how many were hidden
 * only for want of a quick read (needQ). Filters hide, never delete: `original` is untouched.
 */
export function shownResults(original: RsPaper[], mode: SortMode, form: FilterForm): { list: RsPaper[]; needQ: number } {
  const F = filterVals(form);
  let needQ = 0;
  const kept = original.filter((p) => { const r = rsFilterPass(p, F); if (r.needsQuick) needQ++; return r.ok; });
  return { list: rsSortResults(kept, mode), needQ };
}
/** rsToggleActions (8420-8423) after rsApplySort(true) (8374): the actions block shows while a paper shown is ticked. */
const anyShownTicked = (st: Pick<ResearchState, "original" | "sort" | "filter" | "ticked">) => shownResults(st.original, st.sort, st.filter).list.some((p) => st.ticked.has(p));

// ---------------------------------------------------------------------------------------------------------------- the panel's state

export type ResearchState = {
  topic: string;
  design: string;
  oa: boolean;
  pm: boolean;
  /** The rank box once the student has touched it in this tab; null shows the stored preference. */
  rank: boolean | null;
  terms: RsTerms;
  termsBox: RsTermsBox;
  status: string;
  /** rsResultsOriginal (8026): the merged list of the last search. */
  original: RsPaper[];
  sort: SortMode;
  /** The ticked papers, by identity (v1 keeps a ticked box ticked across a re-render, 8381, 8405). */
  ticked: ReadonlySet<RsPaper>;
  /** #rsActions (8420-8422): shown while a box is ticked, hidden by a new sort or search. */
  actions: boolean;
  /** The abstracts opened with "Show more / less". */
  open: ReadonlySet<RsPaper>;
  /** The filter boxes (976-987): they stay across searches, as the page's boxes do. */
  filter: FilterForm;
  /** #rsConnected (1029, rsConnected 8498-8523): nothing yet, the loading line, the two lists, or the failure sentence. */
  connected: ConnectedBox;
  /** The manual add's five boxes (1014-1021), as typed. */
  manual: ManualForm;
  /** The <details> the student opened (filters, external, manual, connected), kept while the dock shows the AI tab. */
  details: Readonly<Record<string, boolean>>;
};
export type ConnectedBox = null | { kind: "loading"; title: string } | { kind: "done"; title: string; cites: RsBrief[]; citedBy: RsBrief[] } | { kind: "failed" };
export type ManualForm = { title: string; author: string; year: string; source: string; doi: string };
export const MANUAL_EMPTY: ManualForm = { title: "", author: "", year: "", source: "", doi: "" };
const INITIAL: ResearchState = {
  topic: "", design: "any", oa: true, pm: true, rank: null, terms: { base: "", terms: [], picked: [] }, termsBox: "idle", status: "",
  original: [], sort: "relevance", ticked: new Set(), actions: false, open: new Set(), filter: FILTER_EMPTY, connected: null, manual: MANUAL_EMPTY, details: {}
};
let state: ResearchState = INITIAL;
/** The newest search's number: a search that is not the newest writes nothing more. */
let searchGen = 0;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const read = () => state;
export function setResearch(next: Partial<ResearchState> | ((s: ResearchState) => Partial<ResearchState>)): void {
  state = { ...state, ...(typeof next === "function" ? next(state) : next) };
  for (const l of listeners) l();
}
export const getResearch = (): ResearchState => state;
/**
 * The filter boxes changed or were cleared: rsApplySort(true) (8354-8374), so the list is drawn again and the actions block follows the papers
 * shown and ticked (rsToggleActions). A ticked paper that a filter hides stays ticked.
 */
export function setFilter(next: Partial<FilterForm> | null): void {
  setResearch((st) => {
    const filter = next ? { ...st.filter, ...next } : FILTER_EMPTY;
    return { filter, actions: anyShownTicked({ ...st, filter }) };
  });
}
/**
 * A quick read's results written on their papers (rsQuickP's `p.quick=r`, 8180), then rsApplySort(true) (8180, 8188). The papers are replaced by
 * copies, in the list, the ticked set and the opened set alike; a paper no longer in the list (a newer search began) is left alone.
 */
export function applyQuick(updates: ReadonlyArray<readonly [RsPaper, RsQuick]>): void {
  setResearch((st) => {
    // One copy per paper, so the list and the two sets hold the same new object.
    const copies = new Map<RsPaper, RsPaper>(updates.map(([p, q]) => [p, { ...p, quick: q }]));
    const swap = (p: RsPaper): RsPaper => copies.get(p) ?? p;
    const next = { ...st, original: st.original.map(swap), ticked: new Set([...st.ticked].map(swap)), open: new Set([...st.open].map(swap)) };
    return { original: next.original, ticked: next.ticked, open: next.open, actions: anyShownTicked(next) };
  });
}
/** As a reload leaves it (tests). */
export function resetResearch(): void { state = INITIAL; for (const l of listeners) l(); }

/** The Research panel's state for this tab. */
export function useResearchState(): ResearchState {
  return useSyncExternalStore(subscribe, read, read);
}

/**
 * The Research search for the panel: the state above, runSearch with the workspace's AI (useCallAI), field, copy, OpenAlex key and the page's
 * fetch, and "Suggest related terms". `rankStored` is the stored preference (rs_prefs, restored on mount as v1's fieldInit 2511 restores the
 * box); `persistRank` stores it.
 */
export function useSearch(opts: { rankStored: boolean; persistRank(rank: boolean): void }) {
  const t = useT();
  const callAI = useCallAI();
  const { settings } = useSettings();
  const oaKey = useOpenAlexKey();
  const s = useResearchState();
  const rank = s.rank ?? opts.rankStored;
  const field = fieldLabel(settings.field);
  const { persistRank } = opts;

  /** researchSearch, on the topic in the box (or `topic`, the selection bubble's text, 7655). */
  const search = useCallback(async (topic?: string) => {
    // This search's turn: taken when it begins (a refused press does not stop the one running).
    let gen = -1;
    const cur = getResearch();
    const q = (topic ?? cur.topic).trim();
    const design = cur.design;
    const label = t(DESIGN_OPTIONS.find(([v]) => v === design)?.[1] ?? "rs2_any");
    const f: typeof fetch = (input, init) => fetch(input, init);
    const out = await runSearch(
      { topic: topic ?? cur.topic, oa: cur.oa, pm: cur.pm, design, designLabel: label, rank: cur.rank ?? opts.rankStored, terms: pickedTerms(cur.terms, q) },
      {
        callAI, field, t, toast, fetch: f, oaKey, persistRank,
        setStatus: (status) => setResearch({ status }),
        begin: () => { gen = ++searchGen; setResearch({ original: [], ticked: new Set(), actions: false, open: new Set() }); },
        isCurrent: () => gen === searchGen
      }
    );
    if (out && gen === searchGen) setResearch({ original: out.papers, sort: out.sort, status: out.status, ticked: new Set(), actions: false, open: new Set() });
  }, [callAI, field, t, oaKey, persistRank, opts.rankStored]);

  const suggest = useCallback(() => suggestTerms(getResearch().topic, {
    callAI, field, t, toast, setBox: (termsBox) => setResearch({ termsBox }), setTerms: (terms) => setResearch({ terms })
  }), [callAI, field, t]);

  // The OpenAlex key too: connected papers send it (one hook, so a stored key is opened once).
  return { state: s, rank, search, suggest, oaKey };
}
