"use client";
import { tHtml, useT } from "@/lib/i18n";
import { DESIGN_OPTIONS, setResearch, type ResearchState } from "@/lib/research/useSearch";
import { Button } from "@/components/ui/button";

/**
 * The search form (v1 952-963), in v1's order: the topic, "💡 Suggest related terms" and the kind of study, the related terms (#rsTerms,
 * rsTermsRender 8264-8268), "Rank by fit to my question" (disabled and busy while its stored choice opens, W8; no text), the two sources, the Reading shelf button and "🔎 Find relevant papers".
 */
export function SearchForm({ s, rank, rankLoading, onRank, onSuggest, onFind, onShelf }: {
  s: ResearchState; rank: boolean; /** W8: the stored rank choice is being read and opened. */ rankLoading: boolean; onRank(on: boolean): void; onSuggest(): void; onFind(): void; onShelf(): void;
}) {
  const t = useT();
  const { terms } = s;
  return (
    <>
      <div className="field">
        <label htmlFor="rsTopic">{t("research_topic_label")}</label>
        <input className="input" type="text" id="rsTopic" data-testid="rs-topic" value={s.topic} placeholder={t("rs2_topic_placeholder")} onChange={(e) => setResearch({ topic: e.target.value })} />
      </div>
      <div className="rs-line">
        <Button variant="ghost" size="sm" type="button" id="rsTermsBtn" data-testid="rs-terms-btn" onClick={onSuggest}>{t("rs2_terms_btn")}</Button>
        <label>{t("rs2_kind_of_study")}{" "}
          <select className="input rs-select" id="rsDesign" data-testid="rs-design" value={s.design} onChange={(e) => setResearch({ design: e.target.value })}>
            {DESIGN_OPTIONS.map(([v, k]) => <option key={v} value={v}>{t(k)}</option>)}
          </select>
        </label>
      </div>
      <div id="rsTerms" data-testid="rs-terms">
        {s.termsBox === "thinking" && <span className="desc">{t("rs2_thinking_of_other_ways")}</span>}
        {s.termsBox === "none" && <span className="desc">{t("rs2_no_useful_related_terms")}</span>}
        {s.termsBox === "list" && terms.terms.length > 0 && (
          <>
            <div className="rs-terms-note">{tHtml(t("rs2_also_search_for_untick"))}</div>
            <div className="rs-line rs-terms-list">
              {terms.terms.map((term, i) => (
                <label key={i} data-testid="rs-term">
                  <input type="checkbox" data-rsterm={i} checked={!!terms.picked[i]} onChange={(e) => {
                    const on = e.target.checked;
                    setResearch((st) => ({ terms: { ...st.terms, picked: st.terms.picked.map((x, k) => (k === i ? on : x)) } }));
                  }} />{term}
                </label>
              ))}
            </div>
          </>
        )}
      </div>
      <label className="rs-check rs-rank" data-testid="rs-rank">
        <input type="checkbox" id="rsRank" checked={rank} disabled={rankLoading} aria-busy={rankLoading || undefined} onChange={(e) => onRank(e.target.checked)} /><span>{t("rs2_rank_by_fit_to")}</span>
      </label>
      <div className="rs-line rs-sources">
        <label className="rs-check" data-testid="rs-src-oa"><input type="checkbox" id="rsSrcOA" checked={s.oa} onChange={(e) => setResearch({ oa: e.target.checked })} /><span>{t("research_src_openalex")}</span></label>
        <label className="rs-check" data-testid="rs-src-pm"><input type="checkbox" id="rsSrcPubmed" checked={s.pm} onChange={(e) => setResearch({ pm: e.target.checked })} /><span>{t("research_src_pubmed")}</span></label>
      </div>
      <div className="rs-row"><Button variant="ghost" className="flex-1" data-testid="rs-shelf" onClick={onShelf}>{t("rs2_reading_shelf_your_own")}</Button></div>
      <div className="rs-row"><Button variant="primary" className="flex-1" data-testid="rs-find" onClick={onFind}>{t("research_find_btn")}</Button></div>
    </>
  );
}
