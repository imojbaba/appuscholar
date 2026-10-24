"use client";
import { useT } from "@/lib/i18n";
import { runNumbers, useApState } from "@/lib/analyse/useApDoc";
import { Button } from "@/components/ui/button";
import { Numbers } from "@/components/tools/analyse/Numbers";
import { RefCheck } from "@/components/tools/analyse/RefCheck";

/**
 * Check numbers (wave B Task 27; Task 30 keeps its results with the paper): v1's "Check the paper's numbers" (apNumbersRun 10106) with its box, which sat under Ask, and v1's reference
 * check for retractions, which sat above the tabs and is not drawn for an abstract (apRender 11285, which has no reference list to read). Today's engines, unchanged.
 */
export function NumbersTab() {
  const t = useT();
  const s = useApState();
  return (
    <div data-testid="reader-numbers">
      <div className="ap-row">
        <Button variant="ghost" size="sm" id="apNumBtn" data-testid="ap-num-btn" onClick={runNumbers}>{t("ap2_num_btn")}</Button>
      </div>
      <Numbers list={s.numbers} />
      {s.doc && !s.doc.abstractOnly && <RefCheck />}
    </div>
  );
}
