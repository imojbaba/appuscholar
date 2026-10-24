"use client";
import { useT } from "@/lib/i18n";
import { DESIGN_OPTIONS, setFilter, setResearch, type ResearchState } from "@/lib/research/useSearch";

/**
 * The aside "Narrow the results" (canvas Find), in the canvas's order: Kind of study, Published from, Free full text only, Hide retracted papers, Rank by fit to my question
 * (AI), then the sources and the Google Scholar link. Kind of study and Rank by fit shape the next search (v1's #rsDesign and #rsRank); the year, free full text and retracted
 * boxes filter the papers already found (v1's #rsFYear, #rsFOA and #rsFRet, core's rsFilterPass): they hide, never delete. The two filters that needed a Quick read (a
 * confirmed kind of study and sample) and the two source boxes are not in the canvas and are not offered. The AI cost of Rank by fit is said under its box, as v1's label said it.
 */
export function FindFilters({ s, rank, rankLoading, onRank, onScholar }: {
  s: ResearchState; rank: boolean; /** W8: the stored rank choice is being read and opened. */ rankLoading: boolean; onRank(on: boolean): void; onScholar(): void;
}) {
  const t = useT();
  const f = s.filter;
  return (
    <aside className="find-filters" aria-label={t("find_filters_h")} data-testid="find-filters">
      <h2>{t("find_filters_h")}</h2>
      <div className="find-field">
        <label htmlFor="rsDesign">{t("find_kind_label")}</label>
        <select className="input" id="rsDesign" data-testid="rs-design" value={s.design} onChange={(e) => setResearch({ design: e.target.value })}>
          {DESIGN_OPTIONS.map(([v, k]) => <option key={v} value={v}>{t(k)}</option>)}
        </select>
        <p className="find-hint" data-testid="find-design-hint">{t("find_design_hint")}</p>
      </div>
      <div className="find-field">
        <label htmlFor="rsFYear">{t("find_year_label")}</label>
        <input type="number" className="input" id="rsFYear" min="1900" max="2100" placeholder={t("find_year_ph")} value={f.year} onChange={(e) => setFilter({ year: e.target.value })} />
      </div>
      <label className="find-check"><input type="checkbox" id="rsFOA" checked={f.oa} onChange={(e) => setFilter({ oa: e.target.checked })} /><span>{t("find_free_only")}</span></label>
      <label className="find-check"><input type="checkbox" id="rsFRet" checked={f.ret} onChange={(e) => setFilter({ ret: e.target.checked })} /><span>{t("find_hide_retracted")}</span></label>
      <div className="find-field">
        <label className="find-check" data-testid="rs-rank">
          <input type="checkbox" id="rsRank" checked={rank} disabled={rankLoading} aria-busy={rankLoading || undefined} onChange={(e) => onRank(e.target.checked)} /><span>{t("find_rank_label")}</span>
        </label>
        <p className="find-hint" data-testid="find-rank-hint">{t("find_rank_hint")}</p>
      </div>
      <p className="find-sources" data-testid="find-sources">
        {t("find_sources")} <button type="button" className="find-link" data-testid="find-scholar" onClick={onScholar}>{t("find_scholar")}</button>
      </p>
    </aside>
  );
}
