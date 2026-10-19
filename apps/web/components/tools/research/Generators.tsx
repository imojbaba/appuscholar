"use client";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

/**
 * The ticked papers' actions (#rsActions, v1 993-997), in v1's order: "⚡ Quick read the papers I ticked (up to 10)", "📝 Draft literature review
 * paragraph", "🕳 Find a research gap", and the note that the drafts come only from the ticked papers.
 */
export function Generators({ onQuick, onLitReview, onGapFinder }: { onQuick(): void; onLitReview(): void; onGapFinder(): void }) {
  const t = useT();
  return (
    <>
      <div className="rs-row"><Button variant="ghost" className="flex-1" data-testid="rs-quick-ticked" onClick={onQuick}>{t("rs2_quick_read_the_papers")}</Button></div>
      <div className="rs-row"><Button variant="gold" className="flex-1" data-testid="rs-litreview" onClick={onLitReview}>{t("research_litreview_btn")}</Button></div>
      <div className="rs-row"><Button variant="gold" className="flex-1" data-testid="rs-gapfinder" onClick={onGapFinder}>{t("research_gapfinder_btn")}</Button></div>
      <p className="desc rs-grounded">{t("research_grounded_note")}</p>
    </>
  );
}
