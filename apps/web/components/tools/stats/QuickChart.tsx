"use client";
import { useState } from "react";
import { Plus } from "@phosphor-icons/react";
import type { VennInput } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { useDocAccess } from "@/lib/editor/docAccess";
import { pictureHtml, quickView, VENN_WIDTH, recallQuick, rememberQuick, type QuickForm, type QuickView } from "@/lib/tools/stats/chartStudio";
import { PNG_URL, svgToPng } from "@/lib/tools/stats/png";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";

const KINDS: Array<QuickForm["type"]> = ["bar", "line", "venn2", "venn3"];
type VennField = keyof Omit<VennInput, "title">;
/** v1's Venn boxes in the order of its dialog (vennDataArea 1766-1786): the label and the count of each set, then the overlaps. */
const VENN_ROWS: Array<{ id: VennField; key: string; ph?: string; text?: boolean; only: "any" | "three" }> = [
  { id: "a", key: "stats_ch_v_a", ph: "stats_ch_v_a_ph", text: true, only: "any" }, { id: "aSize", key: "stats_ch_v_a_only", ph: "18", only: "any" },
  { id: "b", key: "stats_ch_v_b", ph: "stats_ch_v_b_ph", text: true, only: "any" }, { id: "bSize", key: "stats_ch_v_b_only", ph: "12", only: "any" },
  { id: "c", key: "stats_ch_v_c", ph: "stats_ch_v_c_ph", text: true, only: "three" }, { id: "cSize", key: "stats_ch_v_c_only", ph: "10", only: "three" },
  { id: "ab", key: "stats_ch_v_ab", ph: "7", only: "any" }, { id: "ac", key: "stats_ch_v_ac", ph: "4", only: "three" },
  { id: "bc", key: "stats_ch_v_bc", ph: "3", only: "three" }, { id: "abc", key: "stats_ch_v_abc", ph: "2", only: "three" }
];

/**
 * Quick chart (v1 chartDlg 1754-1799, as the bottom of the Charts tab): a bar or line chart from "label,value" lines drawn as an svg that starts at zero, or a Venn diagram of two or
 * three sets. "Generate" shows the picture; "Insert into my document" puts it in as a PNG at 2x at the cursor. No lines to read: v1's refusal, said under the button, nothing drawn.
 */
export function QuickChart({ projectId }: { projectId: string }) {
  const t = useT();
  const access = useDocAccess();
  const [form, setFormState] = useState<QuickForm>(() => recallQuick(projectId));
  const [view, setView] = useState<QuickView | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (f: QuickForm) => { setFormState(f); rememberQuick(projectId, f); };
  const venn = form.type === "venn2" || form.type === "venn3";
  const three = form.type === "venn3";
  const shown = view && view.kind === "ok" ? view : null;
  const title = venn ? form.venn.title.trim() : form.title.trim();
  const alt = title || t("stats_ch_q_" + form.type);

  const insert = async () => {
    if (!shown || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      let url: string | null = null;
      try { url = await svgToPng(shown.svg, 2); } catch { /* said below */ }
      if (!url || !PNG_URL.test(url)) { setFailed(true); return; }
      if (!(await access.insertBlock(pictureHtml(url, alt, venn ? VENN_WIDTH : undefined), { at: "cursor" }))) return;
      toast(t("stats_res_inserted"));
    } finally { setBusy(false); }
  };
  const field = (id: string, label: string, value: string, onChange: (v: string) => void, ph?: string) => (
    <div className="field" style={{ flex: "1 1 150px" }} key={id}>
      <label htmlFor={"quick_" + id}>{label}</label>
      <input className="input" id={"quick_" + id} data-testid={"quick-" + id} type="text" placeholder={ph} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );

  return (
    <section data-testid="quick-chart" aria-labelledby="quick_chart_h" style={{ marginTop: 22 }}>
      <h4 id="quick_chart_h" style={{ margin: "0 0 4px", fontSize: 15 }}>{t("stats_ch_quick")}</h4>
      <p className="desc">{t("stats_ch_quick_intro")}</p>
      <div className="field" style={{ maxWidth: 300 }}>
        <label htmlFor="quick_type">{t("stats_ch_q_type")}</label>
        <select className="input" id="quick_type" data-testid="quick-type" value={form.type} onChange={(e) => { set({ ...form, type: e.target.value as QuickForm["type"] }); setView(null); setFailed(false); }}>
          {KINDS.map((k) => <option key={k} value={k}>{t("stats_ch_q_" + k)}</option>)}
        </select>
      </div>
      {!venn && (
        <>
          <div className="field">
            <label htmlFor="quick_data">{t("stats_ch_q_data")}</label>
            <textarea className="input" id="quick_data" data-testid="quick-data" rows={6} placeholder={t("stats_ch_q_data_ph")} value={form.data} onChange={(e) => set({ ...form, data: e.target.value })} />
          </div>
          {field("title", t("stats_ch_q_title"), form.title, (v) => set({ ...form, title: v }), t("stats_ch_q_title_ph"))}
        </>
      )}
      {venn && (
        <>
          <div className="ap-row ap-wrap" style={{ alignItems: "flex-start" }}>
            {VENN_ROWS.filter((r) => three || r.only === "any").map((r) => field(r.id, t(r.key), form.venn[r.id], (v) => set({ ...form, venn: { ...form.venn, [r.id]: v } }), r.text ? t(r.ph!) : r.ph))}
          </div>
          {field("vtitle", t("stats_ch_v_title"), form.venn.title, (v) => set({ ...form, venn: { ...form.venn, title: v } }), t("stats_ch_v_title_ph"))}
        </>
      )}
      <div className="ap-row" style={{ marginTop: 8 }}>
        <Button variant="primary" size="sm" data-testid="quick-make" onClick={() => { setFailed(false); setView(quickView(form)); }}>{t("stats_ch_q_make")}</Button>
      </div>
      <div aria-live="polite" style={{ marginTop: 10 }}>
        {view?.kind === "empty" && <p className="ap-banner" role="alert" data-testid="quick-empty">{t("stats_ch_q_empty")}</p>}
        {shown && (
          <div data-testid="quick-result">
            <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 10, padding: 8, maxWidth: 480 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img data-testid="quick-img" src={shown.src} alt={t("stats_ch_q_preview_alt")} style={{ maxWidth: "100%", height: "auto", display: "block", margin: "0 auto" }} />
            </div>
            <div className="ap-row" style={{ marginTop: 10 }}>
              <Button variant="primary" size="sm" data-testid="quick-insert" disabled={busy} onClick={() => void insert()}><Plus aria-hidden="true" />{t("vz_insert")}</Button>
            </div>
          </div>
        )}
        {failed && <p className="ap-banner" role="alert" data-testid="quick-img-fail">{t("vz_img_fail")}</p>}
      </div>
    </section>
  );
}
