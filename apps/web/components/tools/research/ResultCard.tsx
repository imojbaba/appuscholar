"use client";
import type { RsPaper } from "@appuscholar/core";
import { tHtml, useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

/** rsRelHTML's labels (8203), by score. */
const FIT_LABEL = ["rs2_off_topic", "rs2_loose", "rs2_related", "rs2_direct"];

export type CardActions = {
  /** rsInsertCitation (8486). */
  insert(): void;
  /** rsAddToLibrary (8471). */
  add(): void;
  /** rsConnected (8498), rsQuick (8171), rsAnalyse (8407): Task 10's. */
  connected(): void;
  quick(): void;
  analyse(): void;
};

/** rsRelHTML (8201-8205): the AI's 0 to 3 rating and its reason, labelled a suggestion. */
function FitChip({ rel }: { rel: NonNullable<RsPaper["rel"]> }) {
  const t = useT();
  return (
    <div className="rs-fit" data-testid="rs-fit">
      <span className="rs-fit-chip">{tHtml(t("rs2_fit_3", { sc: rel.score }))} {t(FIT_LABEL[rel.score] ?? "rs2_off_topic")}{rel.titleOnly ? " " + t("rs2_title_only") : ""}</span> <span className="rs-fit-why">{t("rs2_ai_suggestion")} {rel.reason}</span>
    </div>
  );
}

/**
 * One search result as rsRenderResults draws it (8383-8400), in v1's order: the tick box; the title; the Fit chip when ranked; the quick-read box
 * (Task 10, `data-rs-slot="quick"`); the meta line (source tag, Retracted badge, open-access badge, authors, year, venue, citations); the abstract
 * with "Show more / less"; the buttons Insert citation, + Citation library, Open source, Free full text, Connected papers, Quick read, Analyse.
 */
export function ResultCard({ p, i, ticked, open, insertReady, onTick, onToggleAbstract, actions }: {
  p: RsPaper; i: number; ticked: boolean; open: boolean; insertReady: boolean;
  onTick(on: boolean): void; onToggleAbstract(): void; actions: CardActions;
}) {
  const t = useT();
  const oaId = (p as RsPaper & { oaId?: string }).oaId;
  return (
    <div className="paper-card" data-testid="rs-card">
      <div className="paper-check">
        <input type="checkbox" id={"rsChk" + i} checked={ticked} onChange={(e) => onTick(e.target.checked)} />
        <div className="min-w-0 flex-1">
          <h4>{p.title}</h4>
          {p.rel && <FitChip rel={p.rel} />}
          <div data-rs-slot="quick" />
          <div className="meta">
            <span className="src-tag">{p.source}</span>
            {p.retracted && <span className="retr-badge" title={t("retr_tip")}>{"⚠ " + t("retr_badge")}</span>}
            {p.oaStatus && <span className={"oa-badge oa-" + p.oaStatus} title={t("oa_tip_" + p.oaStatus)}>{t("oa_badge_fmt", { type: p.oaStatus })}</span>}
            {p.authors}
            {p.year ? " · " + p.year : ""}{p.venue ? " · " + p.venue : ""}
            {p.citationCount ? " " + t("rs2_citations", { citationCount: p.citationCount }) : ""}
          </div>
          {p.abstract && (
            <>
              <div className={"abs" + (open ? " open" : "")} id={"rsAbs" + i}>{p.abstract}</div>
              <a href="#" className="rs-more" data-testid="rs-more" onClick={(e) => { e.preventDefault(); onToggleAbstract(); }}>{t("rs2_show_more_less")}</a>
            </>
          )}
          <div className="row">
            <Button variant="primary" size="sm" data-testid="rs-insert" disabled={!insertReady} onClick={actions.insert}>{t("rs_insert_cite")}</Button>
            <Button variant="ghost" size="sm" data-testid="rs-add" onClick={actions.add}>{t("rs2_citation_library")}</Button>
            {p.url && <Button variant="ghost" size="sm" data-testid="rs-open" onClick={() => { window.open(p.url, "_blank", "noopener"); }}>{t("rs2_open_source")}</Button>}
            {p.oaUrl && <Button variant="ghost" size="sm" data-testid="rs-free" onClick={() => { window.open(p.oaUrl, "_blank", "noopener"); }}>{"📄 " + t("oa_free_btn")}</Button>}
            {oaId && <Button variant="ghost" size="sm" data-testid="rs-connected" onClick={actions.connected}>{t("rs2_connected_papers")}</Button>}
            <Button variant="ghost" size="sm" data-testid="rs-quick" title={t("rs2_one_line_summary_kind_title")} onClick={actions.quick}>{t("rs2_quick_read_3")}</Button>
            <Button variant="ghost" size="sm" data-testid="rs-analyse" title={t("rs2_read_the_abstract_with_title")} onClick={actions.analyse}>{t("rs2_analyse_this_paper")}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
