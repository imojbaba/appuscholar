"use client";
import { useT } from "@/lib/i18n";
import { addManual, type ManualDeps } from "@/lib/research/library";
import { getResearch, MANUAL_EMPTY, setResearch, type ManualForm } from "@/lib/research/useSearch";
import { Button } from "@/components/ui/button";
import { RsDetails } from "./RsDetails";

/** The five boxes (v1 1014-1021), in v1's order: the form's field, its id, its label's key and its placeholder (a key, or v1's literal '2026', 1016). */
const FIELDS: Record<keyof ManualForm, { id: string; label: string; ph: string | null }> = {
  title: { id: "rsManTitle", label: "research_man_title_label", ph: "rs2_man_title_placeholder" },
  author: { id: "rsManAuthor", label: "research_man_author_label", ph: "rs2_man_author_placeholder" },
  year: { id: "rsManYear", label: "research_man_year_label", ph: null },
  source: { id: "rsManSource", label: "research_man_source_label", ph: "rs2_man_source_placeholder" },
  doi: { id: "rsManDoi", label: "research_man_doi_label", ph: "rs2_man_doi_placeholder" }
};
const ORDER = Object.keys(FIELDS) as Array<keyof ManualForm>;

/** "➕ Add a paper you found elsewhere" (v1 1011-1024): title, authors and year, journal and DOI or URL, then "Add to citation library" (rsAddManual). */
export function ManualAdd({ m, deps }: { m: ManualForm; deps(): Omit<ManualDeps, "clear"> }) {
  const t = useT();
  const box = (i: number) => {
    const k = ORDER[i]!;
    const { id, label, ph } = FIELDS[k];
    return (
      <div className="field" key={id} style={i === 1 ? { flex: 2 } : i > 1 ? { flex: 1 } : undefined}>
        <label htmlFor={id}>{t(label)}</label>
        <input className="input" type="text" id={id} placeholder={ph ? t(ph) : "2026"} value={m[k]} onChange={(e) => { const v = e.target.value; setResearch((st) => ({ manual: { ...st.manual, [k]: v } })); }} />
      </div>
    );
  };
  return (
    <RsDetails name="manual" className="rs-more-box" testid="rs-manual" summary={t("research_manual_summary")}>
      <p className="desc">{t("research_manual_desc")}</p>
      {box(0)}
      <div className="rs-fields">{box(1)}{box(2)}</div>
      <div className="rs-fields">{box(3)}{box(4)}</div>
      <div className="rs-row">
        <Button variant="primary" className="flex-1" type="button" data-testid="rs-man-add"
          onClick={() => addManual(getResearch().manual, { ...deps(), clear: () => setResearch({ manual: MANUAL_EMPTY }) })}>{t("research_man_add_btn")}</Button>
      </div>
    </RsDetails>
  );
}
