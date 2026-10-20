"use client";
import { tHtml, useT } from "@/lib/i18n";
import { runRefCheck } from "@/lib/analyse/refcheck";
import { useApState } from "@/lib/analyse/useApDoc";
import { useOpenAlexKey } from "@/lib/research/oaKey";
import { sourceDetail } from "@/lib/research/status";
import { Button } from "@/components/ui/button";

/**
 * apRefHTML (11253-11270): "🧯 Check this paper's reference list for retractions" (disabled while it runs), then the box for the state apRefCheck left: no list, no DOIs, checking, or the
 * report: the DOIs read, the stop with how many were checked (OpenAlex's 429 is v1's oaHttpError sentence, register D-S2-6), the flagged references with their DOI links (new tab, noopener,
 * as v1), else "No flag found…", how many DOIs OpenAlex knew and the caveat. The panel does not draw it for an abstract (11285).
 */
export function RefCheck() {
  const t = useT();
  const { refs: R, refBusy } = useApState();
  const oaKey = useOpenAlexKey();
  const run = () => { void runRefCheck({ fetch: (input, init) => fetch(input, init), oaKey }); };
  const button = (
    <div className="ap-row">
      <Button variant="ghost" size="sm" id="apRefBtn" data-testid="ap-ref-btn" disabled={refBusy} onClick={run}>{t("ap2_check_this_paper_s")}</Button>
    </div>
  );
  if (!R) return button;
  if ("none" in R) return <>{button}<div className="ap-box" data-testid="ap-refs">{R.none === "no reference list" ? t("ap2_no_reference_list_was") : t("ap2_the_reference_list_prints")}</div></>;
  const n = R.dois.length;
  if (refBusy) return <>{button}<div className="ap-box" data-testid="ap-refs">{t("ap2_checking_dois_with_openalex", { doisCount: n, done: R.done })}</div></>;
  const fl = Object.keys(R.flag), seen = Object.keys(R.seen).length;
  return (
    <>
      {button}
      <div className="ap-box" data-testid="ap-refs">
        {tHtml(t("ap2_reference_list_check"))} <span className="ap-small">{t("ap2_openalex_doi", { doisCount: n })}{n === 1 ? "" : t("ap2_dois_s")} {t("ap2_read_from_the_list")}</span><br />
        {R.error && <><span className="ap-warn">{t("ap2_the_check_stopped")} {sourceDetail(t, R.error)}. {R.done ? R.done + " " + t("ap2_of_were_checked_before", { doisCount: n }) : ""}</span><br /></>}
        {fl.length > 0 ? (
          <>
            <div className="ap-banner">{t("ap2_reference", { flCount: fl.length })}{fl.length === 1 ? " " + t("ap2_reference_is") : t("ap2_references_are")} {t("ap2_flagged_as_retracted_open")}</div>
            <ul className="ap-flags">{fl.map((k) => <li key={k}>{R.flag[k] || t("ap2_title_not_given")} — <a href={"https://doi.org/" + k} target="_blank" rel="noopener">{k}</a></li>)}</ul>
          </>
        ) : !R.error ? <>{t("ap2_no_flag_found_on")}<br /></> : null}
        <span className="ap-small">{t("ap2_openalex_knew_of_the", { seen, doisCount: n })}</span>
        <div className="ap-caveat">{t("ap2_this_is_a_warning")}</div>
      </div>
    </>
  );
}
