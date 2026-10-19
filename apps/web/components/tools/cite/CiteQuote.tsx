"use client";
import { useEffect, useRef } from "react";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { useSuggestion } from "@/lib/ai/suggestion";
import { contentLangOf, useCallAI } from "@/lib/ai/useCallAI";
import { insertHtmlBlock, insertTextAtCursor } from "@/lib/editor/insert";
import { getCiteForm, setCiteForm, useCiteForm } from "@/lib/cite/form";
import { citeInsertQuote } from "@/lib/cite/quote";
import { bookmarkletHref } from "@/lib/cite/capture";
import { Button, buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useWorkspace } from "@/components/workspace/WorkspaceContext";

/**
 * The quote box (v1 914-919): "Quote from this source (optional)", its description and "Insert quote" (citInsertQuote 7888-7908). An English source
 * is translated by one AI call when the content language is Hindi; any other quote goes in as it is. The box is part of the form (Clear form empties it).
 */
export function CiteQuote({ insertReady }: { insertReady: boolean }) {
  const t = useT();
  const f = useCiteForm();
  const { editor } = useSuggestion();
  const { project } = useWorkspace();
  const { settings } = useSettings();
  const callAI = useCallAI();
  const live = () => (editor && !editor.isDestroyed ? editor : null);
  const insert = () => {
    const cur = getCiteForm();
    void citeInsertQuote({
      quote: cur.quote, srcLang: cur.lang, contentLang: contentLangOf(project, settings), callAI,
      insertBlock: (html) => { const e = live(); if (e) insertHtmlBlock(e, html); },
      insertAtCursor: (text) => { const e = live(); if (e) insertTextAtCursor(e, text); },
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
      <Button variant="ghost" className="w-full" data-testid="cite-insertquote" disabled={!insertReady} onClick={insert}>{t("cite_insertquote_btn")}</Button>
    </>
  );
}

/**
 * "🔖 One-click capture from any page" (v1 921-928). The link's href is set on the element, as citSetupBookmarklet sets it (13635): React refuses a
 * `javascript:` URL in an href prop. A click does nothing (v1's `onclick="return false"`); the student drags it to the bookmarks bar.
 */
export function CiteCapture() {
  const t = useT();
  const link = useRef<HTMLAnchorElement>(null);
  useEffect(() => { link.current?.setAttribute("href", bookmarkletHref(window.location.origin + window.location.pathname)); }, []);
  return (
    <details className="cite-capture" data-testid="cite-bookmarklet-details">
      <summary>{t("cite_bookmarklet_summary")}</summary>
      <p className="desc" data-testid="cite-bookmarklet-desc">{t("cite_bookmarklet_desc")}</p>
      <p className="cite-capture-link">
        <a ref={link} href="#" className={buttonVariants({ variant: "gold" })} draggable="true" data-testid="cite-bookmarklet" onClick={(e) => e.preventDefault()}>{t("cite_bookmarklet_btn")}</a>
      </p>
      <p className="desc" data-testid="cite-bookmarklet-note">{t("cite_bookmarklet_note")}</p>
    </details>
  );
}
