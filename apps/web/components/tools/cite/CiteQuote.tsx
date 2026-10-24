"use client";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { contentLangOf, useCallAI } from "@/lib/ai/useCallAI";
import { useInsertTarget } from "@/lib/popout/sync";
import { getCiteForm, setCiteForm, useCiteForm } from "@/lib/cite/form";
import { citeInsertQuote } from "@/lib/cite/quote";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useProject } from "@/components/frame/ProjectContext";

/**
 * The quote box (v1 914-919): "Quote from this source (optional)", its description and "Insert quote" (citInsertQuote 7888-7908). An English source
 * is translated by one AI call when the content language is Hindi; any other quote goes in as it is. The box is part of the form (Clear form empties it);
 * the Citations tab keeps it inside "Add a source by hand" (ruling B2-R28). v1's one-click capture (921-928) left with the Citation Manager panel (ruling B2-R37):
 * the bookmark comes back in Find (Task 20).
 */
export function CiteQuote() {
  const t = useT();
  const f = useCiteForm();
  const target = useInsertTarget();
  const { project } = useProject();
  const { settings } = useSettings();
  const callAI = useCallAI();
  const insert = () => {
    const cur = getCiteForm();
    void citeInsertQuote({
      quote: cur.quote, srcLang: cur.lang, contentLang: contentLangOf(project, settings), callAI,
      // The open document, opened first when it is closed (and asked for once when it is locked), or the writing window from a pop-out.
      insertBlock: (html) => target.block(html),
      insertAtCursor: (text) => target.text(text),
      clearQuote: () => setCiteForm((p) => ({ ...p, quote: "" })),
      toast
    });
  };
  return (
    <>
      <div className="field cite-quote" data-testid="cite-quote">
        <label htmlFor="citQuoteText">{t("cite_quote_label")}</label>
        <textarea className="input" id="citQuoteText" rows={2} value={f.quote} placeholder={t("cite_quote_placeholder")} onChange={(e) => { const v = e.target.value; setCiteForm((p) => ({ ...p, quote: v })); }} />
      </div>
      <p className="desc" data-testid="cite-quote-desc">{t("cite_quote_desc")}</p>
      <Button variant="ghost" className="w-full" data-testid="cite-insertquote" onClick={insert}>{t("cite_insertquote_btn")}</Button>
    </>
  );
}
