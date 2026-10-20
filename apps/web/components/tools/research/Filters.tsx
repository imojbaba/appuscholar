"use client";
import { RS_DESIGNS } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { setFilter, type FilterForm } from "@/lib/research/useSearch";
import { Button } from "@/components/ui/button";
import { RsDetails } from "./RsDetails";

/**
 * "Filter these results" (v1 976-987), in v1's order: Published from (a year), Open access only, Hide papers flagged as retracted; Kind of study
 * (confirmed), with Any and core's RS_DESIGNS (rsFilterInit 8331), Sample at least (confirmed), Clear filters; v1's note. Each change draws the list
 * again (rsApplySort(true)); the filtering is core's rsFilterPass. Filters hide, never delete.
 */
export function Filters({ f }: { f: FilterForm }) {
  const t = useT();
  return (
    <RsDetails name="filters" id="rsFilters" className="rs-filters" testid="rs-filters" summary={t("rs2_filter_these_results")}>
      <div className="rs-line rs-filter-row">
        <label>{t("rs2_published_from")}{" "}
          <input type="number" className="input rs-num" id="rsFYear" min="1900" max="2100" placeholder={t("rs2_f_year_placeholder")} value={f.year} onChange={(e) => setFilter({ year: e.target.value })} />
        </label>
        <label className="rs-check"><input type="checkbox" id="rsFOA" checked={f.oa} onChange={(e) => setFilter({ oa: e.target.checked })} />{t("rs2_open_access_only")}</label>
        <label className="rs-check"><input type="checkbox" id="rsFRet" checked={f.ret} onChange={(e) => setFilter({ ret: e.target.checked })} />{t("rs2_hide_papers_flagged_as")}</label>
      </div>
      <div className="rs-line rs-filter-row">
        <label>{t("rs2_kind_of_study_confirmed")}{" "}
          <select className="input rs-select" id="rsFDes" value={f.des} onChange={(e) => setFilter({ des: e.target.value })}>
            <option value="">{t("rs2_any")}</option>
            {RS_DESIGNS.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        {/* placeholder 'n' is v1's (985) */}
        <label>{t("rs2_sample_at_least_confirmed")}{" "}
          <input type="number" className="input rs-num" id="rsFN" min="1" placeholder="n" value={f.n} onChange={(e) => setFilter({ n: e.target.value })} />
        </label>
        <Button variant="ghost" size="xs" type="button" data-testid="rs-filter-clear" onClick={() => setFilter(null)}>{t("rs2_clear_filters")}</Button>
      </div>
      <div className="rs-filter-note">{t("rs2_filters_only_hide_papers")}</div>
    </RsDetails>
  );
}
