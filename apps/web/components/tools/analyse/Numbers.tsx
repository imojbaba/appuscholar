"use client";
import { apNumP, type ApNumber } from "@appuscholar/core";
import { tHtml, useT } from "@/lib/i18n";

/**
 * apNumbersHTML (10106-10110): nothing until the button is pressed; the none-found box; else one line per statistic core's apNumbers found, ✓ or ⚠ with the p recomputed (core's apNumP)
 * and v1's two sentences, and the arithmetic-only caveat.
 */
export function Numbers({ list }: { list: ApNumber[] | null }) {
  const t = useT();
  if (!list) return null;
  if (!list.length) return <div className="ap-box" data-testid="ap-numbers">{tHtml(t("ap2_check_the_numbers_no"))}</div>;
  return (
    <div className="ap-box" data-testid="ap-numbers">
      {tHtml(t("ap2_check_the_numbers_each"))}
      {list.map((x, i) => (
        <div key={i} className="ap-num" data-testid="ap-num-line">
          {x.ok ? "✓" : "⚠"} <code>{x.label}</code><br />
          <span className="ap-small">{t("ap2_recomputed_p_about")} {apNumP(x)}{x.ok ? t("ap2_consistent_with_what_is") : t("ap2_which_does_not_match")}</span>
        </div>
      ))}
      <div className="ap-small ap-gap">{t("ap2_this_tests_arithmetic_only")}</div>
    </div>
  );
}
