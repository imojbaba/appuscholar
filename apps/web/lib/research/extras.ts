import { oaConnected, QUICK_READ_MIN_CHARS, type RsPaper } from "@appuscholar/core";
import type { ConnectedBox } from "./useSearch";

/*
 * The Find tab's smaller steps (v1 index.html): "Read it now" opens the reader on the kept paper's abstract, as "📄 Analyse this paper" did in Analyse a paper (rsAnalyse 8407-8419), the Google
 * Scholar link (rsOpenExternal 8424-8434) and connected papers (rsConnected 8498-8523, the requests and their parsing are core's oaConnected). Orchestration and
 * v1's sentences only: the lists are core's oaConnected. The list's CSV is the export place's (Task 12). The CSV download, the filters' count sentence and the
 * buttons of JSTOR, ScienceDirect and BASE left with the Research panel (register row D-S2-123): only Scholar has a button, so only it has an address here.
 */

type T = (key: string, vars?: Record<string, string | number>) => string;

/**
 * rsAnalyse (8407-8419), its refusal: a result with no abstract to read (under QUICK_READ_MIN_CHARS characters that are not white space) gets one of v1's two sentences (a free PDF or not) and nothing
 * opens. Otherwise `open` is called: since wave B Task 27 the paper has been kept first and the reader opens on its stored abstract (v1 handed the abstract to Analyse a paper and toasted "Abstract
 * loaded"; the reader says "Only the abstract is here" on the page instead, and v1's head of the abstract, title, authors, year, venue and "Abstract", is built from the kept entry: lib/analyse/intake.ts keptAbstractPages).
 */
export function readNow(p: RsPaper, d: { open(): void; toast(msg: string): void; t: T }): boolean {
  const ab = String(p.abstract || "").trim();
  if (ab.replace(/\s+/g, "").length < QUICK_READ_MIN_CHARS) { d.toast(p.oaUrl ? d.t("rs2_no_abstract_came_with") : d.t("rs2_no_abstract_came_with_2")); return false; }
  d.open();
  return true;
}

/** rsOpenExternal (8424-8434), for the one site Find links to: the site's search with the topic typed in, in a new tab (`open` is window.open with '_blank' and 'noopener'). */
export function openExternal(site: string, topic: string, d: { open(url: string): void; toast(msg: string): void; t: T }): void {
  const q = encodeURIComponent(topic.trim());
  if (!q) { d.toast(d.t("rs2_type_a_search_topic")); return; }
  const urls: Record<string, string> = { scholar: "https://scholar.google.com/scholar?q=" + q };
  const url = urls[site];
  if (url) d.open(url);
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
