"use client";
import { useEffect, useMemo, useState } from "react";
import { DownloadSimple, Plus } from "@phosphor-icons/react";
import type { VzType } from "@appuscholar/core";
import { useLang, useT } from "@/lib/i18n";
import { useProjectBlob } from "@/lib/blobs/useProjectBlob";
import { useDocAccess } from "@/lib/editor/docAccess";
import { downloadBlob } from "@/lib/export/download";
import { useLab } from "@/lib/tools/stats/lab";
import {
  figureHtml, rememberStudio, settleColumns, studioColumns, studioData, studioDefaults, startStudio, studioView, vzTrFor, type ErrKind, type StudioForm
} from "@/lib/tools/stats/chartStudio";
import { dataUrlToBlob, PNG_URL, svgToPng } from "@/lib/tools/stats/png";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";

/* The look of v1's summary table under a chart (.stats-table), in the page's tokens; the markup itself is core's, sanitized. */
const TABLE_CSS = `
.chart-res table.stats-table { border-collapse: collapse; margin: 8px 0; font-size: 13px; max-width: 100%; display: block; overflow-x: auto; }
.chart-res .stats-table th, .chart-res .stats-table td { border: 1px solid var(--line); padding: 4px 10px; text-align: left; }
.chart-res .stats-table th { background: var(--soft); font-weight: 600; }
.chart-res p.desc { margin: 6px 0; font-size: 13px; line-height: 19px; color: var(--muted); }
`;
const TYPES: VzType[] = ["box", "bar", "hist", "qq"];
const ERRS: ErrKind[] = ["ci", "sd", "se", "none"];

/**
 * Chart Studio (v1 "Research figures", vzDlg 1651-1699, as the top of the Charts tab): a paste box or the Data tab's table, the chart, the score and group columns, the options, a
 * preview drawn by core with its summary table, and "Insert into my document" (the figure number and title above, the picture as PNG at 2x, the APA note below) and the two downloads.
 * What was typed is kept for the project while the app is open. The rows themselves are in memory only, never in a blob. The figure number comes from `stats_prefs.figno`.
 */
export function ChartStudio({ projectId }: { projectId: string }) {
  const t = useT();
  const { lang } = useLang();
  const tr = useMemo(() => vzTrFor(lang), [lang]);
  const lab = useLab(projectId);
  const access = useDocAccess();
  const prefs = useProjectBlob("stats_prefs", projectId || null);
  const [form, setFormState] = useState<StudioForm>(() => startStudio(projectId, lab.data));
  const [note, setNote] = useState<"no_lab" | "img_fail" | null>(null);
  const [busy, setBusy] = useState(false);
  // a change is built on the latest form (an update function), so one made while the PNG is being made (an await in Insert) is built on, not undone
  const set = (patch: Partial<StudioForm>) => { setFormState((prev) => ({ ...prev, ...patch })); setNote(null); };
  useEffect(() => { rememberStudio(projectId, form); }, [projectId, form]);

  const data = useMemo(() => studioData(form, lab.data), [form, lab.data]);
  const figFallback = String(prefs.value?.figno ?? 1);
  const view = useMemo(() => (data ? studioView(form, data, tr, figFallback) : null), [form, data, tr, figFallback]);
  const cols = data ? studioColumns(data) : null;
  const picked = data ? settleColumns(form, data) : null;
  const dflt = data ? studioDefaults(form, data, tr) : null;
  const ty = form.type;

  /** v1 vzImgHTML: the picture as a PNG at twice its size; false (and the line "Could not make the picture") when the browser cannot. */
  const png = async (svg: string): Promise<string | null> => {
    try {
      const url = await svgToPng(svg, 2);
      if (PNG_URL.test(url)) return url;
    } catch { /* said below */ }
    setNote("img_fail");
    return null;
  };
  const ok = view && view.kind === "ok" ? view : null;

  const insert = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try {
      const url = await png(ok.svg);
      if (!url) return;
      if (!(await access.insertBlock(figureHtml(ok.caption, url), { at: "cursor" }))) return;
      // v1 counted the figures in the document; the next number is kept in the project's preferences instead (stats_prefs.figno)
      const next = ok.caption.n + 1;
      set({ fig: String(next) });
      if (!prefs.loading && !prefs.locked && !prefs.error && !prefs.readOnly) prefs.set((prev) => ({ ...(prev ?? {}), figno: next }));
      toast(t("stats_res_inserted"));
    } finally { setBusy(false); }
  };
  const download = async (kind: "png" | "svg") => {
    if (!ok || busy) return;
    const name = "figure-" + ok.caption.n;
    if (kind === "svg") { downloadBlob(name + ".svg", new Blob([ok.svg], { type: "image/svg+xml" })); return; }
    setBusy(true);
    try {
      const url = await png(ok.svg);
      if (url) downloadBlob(name + ".png", dataUrlToBlob(url));
    } finally { setBusy(false); }
  };

  const text = (id: string, label: string, value: string, onChange: (v: string) => void, opts: { number?: boolean; ph?: string; min?: number } = {}) => (
    <div className="field" style={{ flex: "1 1 150px" }}>
      <label htmlFor={"chart_" + id}>{label}</label>
      <input className="input" id={"chart_" + id} data-testid={"chart-" + id} type={opts.number ? "number" : "text"} min={opts.min} placeholder={opts.ph} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
  const check = (id: string, label: string, value: boolean, onChange: (v: boolean) => void) => (
    <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer", fontSize: 13 }}>
      <input type="checkbox" data-testid={"chart-" + id} checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );

  return (
    <section className="chart-res" data-testid="chart-studio" aria-labelledby="chart_studio_h">
      <style>{TABLE_CSS}</style>
      <h4 id="chart_studio_h" style={{ margin: "0 0 4px", fontSize: 15 }}>{t("stats_ch_studio")}</h4>
      <p className="desc">{t("stats_ch_studio_intro")}</p>
      <div className="field">
        <label htmlFor="chart_paste">{t("vz_data")}</label>
        <textarea className="input" id="chart_paste" data-testid="chart-paste" rows={4} placeholder={t("stats_ch_paste_ph")} value={form.text} onChange={(e) => set({ text: e.target.value, source: "paste" })} />
      </div>
      <div className="ap-row ap-wrap">
        <Button variant="ghost" size="sm" data-testid="chart-use-lab" onClick={() => {
          if (!lab.data) { setNote("no_lab"); return; }
          set({ source: "lab" });
        }}>{t("stats_ch_use_lab")}</Button>
        {form.source === "lab" && <Button variant="ghost" size="sm" data-testid="chart-use-paste" onClick={() => set({ source: "paste" })}>{t("stats_ch_use_paste")}</Button>}
      </div>
      {note === "no_lab" && <p className="ap-small" role="status" data-testid="chart-note">{t("stats_ch_no_lab")}</p>}
      {form.source === "lab" && lab.data && <p className="ap-small" data-testid="chart-source">{t("stats_ch_from_lab", { n: lab.data.rows.length })}</p>}
      {form.source === "lab" && !lab.data && <p className="ap-small" role="status" data-testid="chart-note">{t("stats_ch_no_lab")}</p>}
      {!data && form.source === "paste" && form.text.trim() !== "" && <p className="ap-small" role="status" data-testid="chart-no-columns">{t("stats_ch_no_columns")}</p>}

      {data && cols && picked && dflt && (
        <div data-testid="chart-controls" style={{ marginTop: 10 }}>
          <div className="ap-row ap-wrap" style={{ alignItems: "flex-start" }}>
            <div className="field" style={{ flex: "1 1 170px" }}>
              <label htmlFor="chart_type">{t("vz_type")}</label>
              <select className="input" id="chart_type" data-testid="chart-type" value={ty} onChange={(e) => set({ type: e.target.value as VzType })}>
                {TYPES.map((k) => <option key={k} value={k}>{t("vz_t_" + k)}</option>)}
              </select>
            </div>
            <div className="field" style={{ flex: "1 1 170px" }}>
              <label htmlFor="chart_y">{t("vz_y")}</label>
              <select className="input" id="chart_y" data-testid="chart-y" value={picked.y ? String(picked.y.index) : ""} onChange={(e) => set({ y: e.target.value })}>
                {cols.num.map((c) => <option key={c.index} value={String(c.index)}>{c.name}</option>)}
              </select>
            </div>
            {(ty === "box" || ty === "bar") && (
              <div className="field" style={{ flex: "1 1 170px" }}>
                <label htmlFor="chart_g">{t("vz_g")}</label>
                <select className="input" id="chart_g" data-testid="chart-g" value={picked.g ? String(picked.g.index) : ""} onChange={(e) => set({ g: e.target.value })}>
                  <option value="">{t("vz_none")}</option>
                  {cols.cat.map((c) => <option key={c.index} value={String(c.index)}>{c.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="ap-row ap-wrap" style={{ alignItems: "flex-start" }}>
            {ty === "bar" && (
              <div className="field" style={{ flex: "1 1 150px" }}>
                <label htmlFor="chart_err">{t("vz_err")}</label>
                <select className="input" id="chart_err" data-testid="chart-err" value={form.err} onChange={(e) => set({ err: e.target.value as ErrKind })}>
                  {ERRS.map((k) => <option key={k} value={k}>{t("stats_ch_err_" + k)}</option>)}
                </select>
              </div>
            )}
            <div className="field" style={{ flex: "1 1 150px" }}>
              <label htmlFor="chart_pal">{t("vz_pal")}</label>
              <select className="input" id="chart_pal" data-testid="chart-pal" value={form.pal} onChange={(e) => set({ pal: e.target.value as "color" | "gray" })}>
                <option value="color">{t("vz_pal_c")}</option>
                <option value="gray">{t("vz_pal_g")}</option>
              </select>
            </div>
            {ty === "hist" && text("bins", t("vz_bins"), form.bins, (v) => set({ bins: v }), { number: true, ph: t("stats_ch_auto"), min: 3 })}
          </div>
          <div className="ap-row ap-wrap" style={{ gap: 14, margin: "4px 0" }}>
            {(ty === "box" || ty === "bar") && check("pts", t("vz_pts"), form.pts, (v) => set({ pts: v }))}
            {check("n", t("vz_n"), form.showN, (v) => set({ showN: v }))}
            {check("titlein", t("vz_title_in"), form.titleIn, (v) => set({ titleIn: v }))}
          </div>
          <div className="ap-row ap-wrap" style={{ alignItems: "flex-start" }}>
            {text("title", t("vz_title"), form.title ?? dflt.title, (v) => set({ title: v }))}
            {text("xl", t("vz_xl"), form.xl ?? dflt.xl, (v) => set({ xl: v }))}
            {text("yl", t("vz_yl"), form.yl ?? dflt.yl, (v) => set({ yl: v }))}
          </div>
          <div className="ap-row ap-wrap" style={{ alignItems: "flex-start" }}>
            {text("ymin", t("vz_ymin"), form.yMin, (v) => set({ yMin: v }), { number: true, ph: t("stats_ch_auto") })}
            {text("ymax", t("vz_ymax"), form.yMax, (v) => set({ yMax: v }), { number: true, ph: t("stats_ch_auto") })}
            {text("fig", t("vz_fig"), form.fig ?? figFallback, (v) => set({ fig: v }), { number: true, min: 1 })}
            {text("note", t("vz_note"), form.note ?? dflt.note, (v) => set({ note: v }))}
          </div>

          <div aria-live="polite" style={{ marginTop: 10 }}>
            {view?.kind === "nodata" && <p className="desc" data-testid="chart-nodata">{t("vz_nodata")}</p>}
            {view?.kind === "failed" && <p className="ap-banner" role="alert" data-testid="chart-failed">{t("stats_ch_failed")}</p>}
            {ok && (
              <div data-testid="chart-result">
                {ok.warn && <p className="ap-warn" data-testid="chart-warn">{ok.warn}</p>}
                <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 10, padding: 8, overflow: "auto" }}>
                  {/* an image never runs a script and cannot turn a group name into markup; the picture is core's svg */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img data-testid="chart-img" src={ok.src} alt={t("stats_ch_preview_alt", { n: ok.caption.n })} style={{ maxWidth: "100%", height: "auto", display: "block", margin: "0 auto" }} />
                </div>
                <div data-testid="chart-table" dangerouslySetInnerHTML={{ __html: ok.tableHtml }} />
                <div className="ap-row ap-wrap" style={{ marginTop: 10 }}>
                  <Button variant="primary" size="sm" data-testid="chart-insert" disabled={busy} onClick={() => void insert()}><Plus aria-hidden="true" />{t("vz_insert")}</Button>
                  <Button variant="ghost" size="sm" data-testid="chart-png" disabled={busy} onClick={() => void download("png")}><DownloadSimple aria-hidden="true" />{t("stats_ch_png")}</Button>
                  <Button variant="ghost" size="sm" data-testid="chart-svg" disabled={busy} onClick={() => void download("svg")}><DownloadSimple aria-hidden="true" />{t("stats_ch_svg")}</Button>
                </div>
              </div>
            )}
            {note === "img_fail" && <p className="ap-banner" role="alert" data-testid="chart-img-fail">{t("vz_img_fail")}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
