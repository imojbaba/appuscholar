"use client";
import type { RsQuick } from "@appuscholar/core";
import { tHtml, useT } from "@/lib/i18n";

/**
 * rsQuickHTML (8161-8170): the quick read of one abstract as core's rsQuickCheck left it, one line each, labelled a suggestion from the abstract only.
 * The summary, or v1's sentence when it was dropped for a number the abstract lacks (Review Focus 3); the kind of study and the sample size, each
 * shown with its quote only when confirmed, else v1's "not confirmed" warning, and v1's sentence when the reply gave none.
 */
export function QuickBox({ q }: { q: RsQuick }) {
  const t = useT();
  const { design, sample } = q;
  return (
    <div className="rs-quick" data-testid="rs-quickbox">
      <div data-line>{tHtml(t("rs2_quick_read"))} <span className="rs-quick-note">{t("rs2_ai_suggestion_from_the")}</span></div>
      {q.summary ? <div data-line>{q.summary}</div> : q.summaryDropped ? <div data-line><span className="ap-warn">{t("rs2_the_one_line_summary")}</span></div> : null}
      {/* ' — “' and '”' are v1's literals (8165, 8167). */}
      <div data-line>
        {design
          ? <>{t("rs2_kind_of_study_2") + " "}{design.ok ? <><b>{design.type}</b>{" — “" + (design.quote ?? "") + "”"}</> : <span className="ap-warn">{t("rs2_not_confirmed_the_quoted")}</span>}</>
          : t("rs2_kind_of_study_not")}
      </div>
      <div data-line>
        {sample
          ? <>{t("rs2_sample_size") + " "}{sample.ok ? <><b>{sample.n.toLocaleString()}</b>{" — “" + (sample.quote ?? "") + "”"}</> : <span className="ap-warn">{t("rs2_not_confirmed_the_quoted_2")}</span>}</>
          : t("rs2_sample_size_not_given")}
      </div>
    </div>
  );
}
