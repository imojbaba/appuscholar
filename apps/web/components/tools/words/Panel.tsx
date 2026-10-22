"use client";
import { fieldLabel } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { useCallAI } from "@/lib/ai/useCallAI";
import { useSettings } from "@/lib/settings";
import { useWordsData } from "@/lib/tools/words/useWordsData";
import { PanelLoading } from "@/components/tools/PanelLoading";
import { Button } from "@/components/ui/button";
import { Dictionary } from "./Dictionary";
import { Grammar } from "./Grammar";

/**
 * Words and grammar, the Writing place's tab (v1 panel 807-826, script 6570-6820): a dictionary with a word bank, and a grammar check by rules and by AI. The word bank and the
 * spelling choice are the project's `words_bank` and `words_prefs` blobs; looking up and checking need no project. Every request to the AI goes through useCallAI, which scans for
 * personal data first.
 */
export function Panel({ projectId }: { tab: string; projectId: string }) {
  const t = useT();
  const data = useWordsData(projectId || null);
  const callAI = useCallAI();
  const { settings } = useSettings();
  const field = fieldLabel(settings.field);
  const ask = (prompt: string, o: { temp: number; max: number; noLang: boolean }) => callAI(prompt, o);

  return (
    <div className="panel" data-testid="panel-words">
      <p className="desc">{t("wd2_desc")}</p>
      {!data.hasProject && <p className="note" role="status" data-testid="words-no-project">{t("wd2_no_project")}</p>}
      {data.hasProject && data.loading && !data.locked && <PanelLoading testId="words-loading" />}
      {data.locked && <p className="note" role="status" data-testid="words-locked">{t("wd2_locked")}</p>}
      {data.broken && <p className="note" role="status" data-testid="words-broken">{t("wd2_broken")}</p>}
      {data.asking && (
        <div className="ap-box" role="group" aria-label={t("wd2_broken_confirm")} data-testid="words-broken-ask">
          <p>{t("wd2_broken_confirm")}</p>
          <div className="ap-row">
            <Button variant="primary" size="sm" data-testid="words-broken-yes" onClick={data.approve}>{t("wd2_save_anyway")}</Button>
            <Button variant="ghost" size="sm" data-testid="words-broken-no" onClick={data.decline}>{t("wd2_cancel")}</Button>
          </div>
        </div>
      )}
      <Dictionary data={data} callAI={ask} field={field} />
      <Grammar data={data} callAI={ask} field={field} />
    </div>
  );
}
