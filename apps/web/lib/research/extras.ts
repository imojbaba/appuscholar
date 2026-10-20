import { oaConnected, QUICK_READ_MIN_CHARS, rsCsvText, type RsFilter, type RsPaper } from "@appuscholar/core";
import type { PendingAnalyse } from "@/components/workspace/WorkspaceContext";
import { filterActive, type ConnectedBox } from "./useSearch";

/*
 * The Research panel's smaller steps (v1 index.html): "📄 Analyse this paper" (rsAnalyse 8407-8419), the external search buttons (rsOpenExternal
 * 8424-8434), the CSV (rsCsvDownload 8196 through pdDownload 9507-9511), the filters' count (rsApplySort 8366-8373) and connected papers (rsConnected
 * 8498-8523, the requests and their parsing are core's oaConnected). Orchestration and v1's sentences only: the CSV is core's rsCsvText, the
 * filtering core's rsFilterPass (useSearch.shownResults), the lists core's oaConnected.
 */

type T = (key: string, vars?: Record<string, string | number>) => string;

/**
 * rsAnalyse (8407-8419): the abstract with v1's head (title, authors, year, venue, then "Abstract") is kept for Analyse a paper as an
 * abstract-only load (v1's apLoad(title, [head+ab], 'abstract', false)); the tool opens and v1's toast says what kind of read it is. With no
 * abstract, one of v1's two sentences (a free PDF or not) and nothing is kept.
 */
export function analysePaper(p: RsPaper, d: { keep(v: PendingAnalyse): void; showTool(id: "analyse"): void; toast(msg: string): void; t: T }): boolean {
  const ab = String(p.abstract || "").trim();
  if (ab.replace(/\s+/g, "").length < QUICK_READ_MIN_CHARS) { d.toast(p.oaUrl ? d.t("rs2_no_abstract_came_with") : d.t("rs2_no_abstract_came_with_2")); return false; }
  // v1 8411, as written: 'Abstract' is the head's last line (a literal of v1's script, kept in English as v1 does in every language).
  const head = p.title + "\n" + (p.authors || "") + (p.year ? " (" + p.year + ")" : "") + (p.venue ? ". " + p.venue : "") + "\nAbstract\n";
  d.keep({ title: p.title, pages: [head + ab], src: "abstract" });
  d.showTool("analyse");
  d.toast(d.t("rs2_abstract_loaded_this_is"));
  return true;
}

/** The four buttons of "🌐 Not finding it?" (1003-1008), in v1's order: the site, its label's key, its title's key. */
export const EXTERNAL: ReadonlyArray<{ site: "scholar" | "jstor" | "sciencedirect" | "base"; label: string; title: string }> = [
  { site: "scholar", label: "research_ext_scholar", title: "rs2_opens_scholar_google_com_title" },
  { site: "jstor", label: "research_ext_jstor", title: "rs2_opens_jstor_org_with_title" },
  { site: "sciencedirect", label: "research_ext_sciencedirect", title: "rs2_opens_sciencedirect_com_with_title" },
  { site: "base", label: "research_ext_base", title: "rs2_opens_base_bielefeld_academic_title" }
];

/** rsOpenExternal (8424-8434): the site's search with the topic typed in, in a new tab (`open` is window.open with '_blank' and 'noopener'). */
export function openExternal(site: string, topic: string, d: { open(url: string): void; toast(msg: string): void; t: T }): void {
  const q = encodeURIComponent(topic.trim());
  if (!q) { d.toast(d.t("rs2_type_a_search_topic")); return; }
  const urls: Record<string, string> = {
    scholar: "https://scholar.google.com/scholar?q=" + q,
    jstor: "https://www.jstor.org/action/doBasicSearch?Query=" + q,
    sciencedirect: "https://www.sciencedirect.com/search?qs=" + q,
    base: "https://www.base-search.net/Search/Results?lookfor=" + q
  };
  const url = urls[site];
  if (url) d.open(url);
}

/** rsCsvDownload's file name (8196). */
export const CSV_NAME = "search-results.csv";

/** rsCsvDownload (8196): the papers shown, as core's rsCsvText, saved as v1's pdDownload saves it (a byte-order mark, then the text, as text/csv). */
export function downloadCsv(shown: RsPaper[], d: { download(name: string, file: Blob): void; toast(msg: string): void; t: T }): void {
  if (!shown.length) { d.toast(d.t("rs2_nothing_to_download_yet")); return; }
  d.download(CSV_NAME, new Blob(["﻿" + rsCsvText(shown)], { type: "text/csv;charset=utf-8" }));
}

/**
 * #rsFStat (8366-8373): v1's sentence while a filter is set and there are results, else nothing. `needQ` is how many were hidden only for want of a
 * quick read.
 */
export function filterStat(t: T, F: RsFilter, shown: number, total: number, needQ: number): string {
  if (!filterActive(F) || !total) return "";
  return t("rs2_showing_of_papers", { listCount: shown, rsResultsOriginalCount: total }) + " " + (total - shown) + " " + t("rs2_hidden_by_your_filters") +
    (needQ ? " " + t("rs2_of_those_are_hidden", { needQ }) : "") + (!shown ? " " + t("rs2_clear_a_filter_to") : "");
}

/** An OpenAlex result as rsFetchOpenAlex builds it: what rsConnected reads (8499, 8503, 8509). */
type OaFields = { oaId?: string; referencedWorks?: string[]; citedByApiUrl?: string };

/**
 * rsConnected (8498-8523): the loading line, then core's oaConnected (what the paper cites, what cites it, 8 each, with the OpenAlex key), then the
 * two lists; anything that throws shows v1's failure sentence. `isCurrent` is false once another paper's connected papers were asked for: this one
 * then writes nothing more.
 */
export async function loadConnected(p: RsPaper, d: { fetch: typeof fetch; oaKey: string | null; setBox(box: ConnectedBox): void; isCurrent(): boolean }): Promise<void> {
  const o = p as RsPaper & OaFields;
  if (!o.oaId) return;
  d.setBox({ kind: "loading", title: p.title });
  try {
    const { cites, citedBy } = await oaConnected(d.fetch, { referencedWorks: o.referencedWorks || [], citedByApiUrl: o.citedByApiUrl || "", oaId: o.oaId, key: d.oaKey ?? undefined });
    if (d.isCurrent()) d.setBox({ kind: "done", title: p.title, cites, citedBy });
  } catch {
    if (d.isCurrent()) d.setBox({ kind: "failed" });
  }
}
