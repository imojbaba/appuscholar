"use client";
import { citExtractDoi, citExtractPmid } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { citeAdd, citeInsert, citeLookup, FORM_CLEARED, type CiteDeps } from "@/lib/cite/actions";
import {
  CITE_DEGREE_OPTIONS, CITE_LANG_OPTIONS, CITE_MONTH_OPTIONS, CITE_ONLY, CITE_TYPE_OPTIONS,
  citeFieldOf, citOnlyShown, clearedForm, filledForm, getCiteForm, readForm, setCiteForm, useCiteForm
} from "@/lib/cite/form";
import type { Library } from "@/lib/cite/useLibrary";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/**
 * The form of "Add a source by hand" in the Citations tab (v1 876-912), in v1's order: type, source language, the fields with the type-specific `cit-only` groups,
 * DOI, the link box (a paste with a DOI or PubMed ID looks it up, 7970-7976), the lookup button, Insert citation / + Library, Clear form. v1's style select (with
 * citStyleNote) is the tab's own now, above the sources, and the form reads the style from the library as it did.
 */
export function CiteForm({ library, deps }: { library: Library; deps: () => CiteDeps }) {
  const t = useT();
  const f = useCiteForm();
  // Every input carries v1's id; the key it fills is read from the id (CITE_FIELD_IDS, citReadForm's reads).
  const edit = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const k = citeFieldOf(e.target.id), v = e.target.value;
    if (k) setCiteForm((p) => ({ ...p, [k]: v }));
  };
  const lookup = () => {
    const cur = getCiteForm();
    // A DOI or PubMed ID in the link box is the newest ask: the DOI box may still hold the last fill's, which v1's order would look up again.
    const asked = citExtractDoi(cur.url) || citExtractPmid(cur.url);
    void citeLookup({
      fetch: (input, init) => fetch(input, init),
      form: asked ? { doi: "", url: cur.url, title: "" } : { doi: cur.doi, url: cur.url, title: cur.title },
      fill: (entry) => setCiteForm((p) => filledForm(p, entry)),
      toast, t
    });
  };
  // citAutoLookupOnPaste 7970-7975: only a paste holding a DOI or a PubMed ID, once the pasted text is in the box.
  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const txt = e.clipboardData?.getData("text") ?? "";
    if (!citExtractDoi(txt) && !citExtractPmid(txt)) return;
    const el = e.currentTarget;
    setTimeout(() => { if (String(el.value || "").trim()) lookup(); }, 60);
  };
  const only = (k: keyof typeof CITE_ONLY) => !citOnlyShown(f.type, CITE_ONLY[k]);
  return (
    <>
      <div className="field">
        <label htmlFor="citType">{t("cite_type_label")}</label>
        <select className="input" id="citType" value={f.type} onChange={edit}>
          {CITE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{t(o.key)}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="citSourceLang">{t("cite_sourcelang_label")}</label>
        <select className="input" id="citSourceLang" value={f.lang} onChange={edit}>
          {CITE_LANG_OPTIONS.map((o) => <option key={o.value} value={o.value}>{t(o.key)}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="citAuthor">{t("cite_author_label")}</label>
        <input className="input" id="citAuthor" value={f.author} onChange={edit} placeholder="Miller, George A.; Smith, Jane B." />
      </div>
      <div className="cite-row">
        <div className="field" style={{ flex: 1 }}><label htmlFor="citYear">{t("cite_year_label")}</label><input className="input" id="citYear" value={f.year} onChange={edit} placeholder="1956" /></div>
        <div className="field" style={{ flex: 2 }}><label htmlFor="citTitle">{t("cite_title_label")}</label><input className="input" id="citTitle" value={f.title} onChange={edit} onPaste={onPaste} placeholder="Title of work" /></div>
      </div>
      <div className="cite-row">
        <div className="field" style={{ flex: 2 }}>
          <label htmlFor="citMonth">{t("cite_month_label")}</label>
          <select className="input" id="citMonth" value={f.month} onChange={edit}>
            {CITE_MONTH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}><label htmlFor="citDay">{t("cite_day_label")}</label><input className="input" id="citDay" inputMode="numeric" maxLength={2} value={f.day} onChange={edit} placeholder="5" /></div>
        <div className="field" style={{ flex: 2 }}><label htmlFor="citAccessed">{t("cite_accessed_label")}</label><input className="input" id="citAccessed" type="date" value={f.accessed} onChange={edit} /></div>
      </div>
      <div className="field" data-testid="cite-only-container" hidden={only("container")}>
        <label htmlFor="citContainer">{t("cite_container_label")}</label>
        <input className="input" id="citContainer" value={f.container} onChange={edit} placeholder="e.g. Handbook of child psychology" />
      </div>
      <div className="field" data-testid="cite-only-editors" hidden={only("editors")}>
        <label htmlFor="citEditors">{t("cite_editors_label")}</label>
        <input className="input" id="citEditors" value={f.editors} onChange={edit} placeholder="Damon, William; Lerner, Richard M." />
      </div>
      <div className="field" data-testid="cite-only-number" hidden={only("number")}>
        <label htmlFor="citNumber">{t("cite_number_label")}</label>
        <input className="input" id="citNumber" value={f.number} onChange={edit} placeholder="e.g. 14" />
      </div>
      <div className="field" data-testid="cite-only-degree" hidden={only("degree")}>
        <label htmlFor="citDegree">{t("cite_degree_label")}</label>
        <select className="input" id="citDegree" value={f.degree} onChange={edit}>
          {CITE_DEGREE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="citSource">{t("cite_source_label")}</label>
        <input className="input" id="citSource" value={f.source} onChange={edit} placeholder="e.g. Psychological Review" />
      </div>
      <div className="cite-row">
        <div className="field" style={{ flex: 1 }}><label htmlFor="citVol">{t("cite_vol_label")}</label><input className="input" id="citVol" value={f.volume} onChange={edit} placeholder="63" /></div>
        <div className="field" style={{ flex: 1 }}><label htmlFor="citIssue">{t("cite_issue_label")}</label><input className="input" id="citIssue" value={f.issue} onChange={edit} placeholder="2" /></div>
        <div className="field" style={{ flex: 2 }}><label htmlFor="citPages">{t("cite_pages_label")}</label><input className="input" id="citPages" value={f.pages} onChange={edit} placeholder="81–97" /></div>
      </div>
      <div className="field">
        {/* v1 905: the DOI label has no data-i18n key. */}
        <label htmlFor="citDOI">DOI</label>
        <input className="input" id="citDOI" value={f.doi} onChange={edit} onPaste={onPaste} placeholder="10.1037/h0043158" />
      </div>
      <div className="field">
        <label htmlFor="citURL">{t("cite_url_label")}</label>
        <input className="input" id="citURL" value={f.url} onChange={edit} onPaste={onPaste} placeholder="https://… or 10.xxxx/… or a full reference" />
      </div>
      <div className="stack">
        <Button variant="ghost" className="w-full" data-testid="cite-lookup" onClick={lookup}>{t("cite_lookup_btn")}</Button>
        <div className="cite-row">
          <Button variant="primary" className="flex-1" data-testid="cite-insert" onClick={() => void citeInsert(readForm(getCiteForm(), library.style), deps())}>{t("cite_insert_btn")}</Button>
          <Button variant="ghost" className="flex-1" data-testid="cite-add" disabled={!library.ready} onClick={() => citeAdd(readForm(getCiteForm(), library.style), library.add, toast)}>{t("cite_addlib_btn")}</Button>
        </div>
        <Button variant="ghost" className="w-full" data-testid="cite-clear" onClick={() => { setCiteForm(clearedForm); toast(FORM_CLEARED); }}>{t("cite_clear_btn")}</Button>
      </div>
    </>
  );
}
