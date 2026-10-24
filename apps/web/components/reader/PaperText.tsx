"use client";
import type { RefObject } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { apPreview, shMarkedParts, type ShNote } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import type { ApLoaded } from "@/lib/analyse/useApDoc";
import { Parts } from "@/components/tools/shelf/Parts";

/**
 * The paper's text, one page at a time (canvas Read): the page as the extractor read it, in the reading face, with the student's highlights on it marked (core's shMarkedParts), and
 * Previous and Next under it. v1's caveat about extracted text stays under the page (it is the shelf reader's own sentence, `sh2_this_is_the_text`). The text is plain text that React escapes,
 * so nothing is set as HTML. `textRef` is the box the highlights tab checks a selection against ("the selection must start inside the text"). The page number is the reader's, shown in the
 * line under the title.
 */
export function PaperText({ pages, notes, page, onPage, textRef }: {
  pages: string[]; notes: ShNote[]; page: number; onPage(n: number): void; textRef: RefObject<HTMLDivElement | null>;
}) {
  const t = useT();
  const n = pages.length;
  return (
    <section className="rd-text" aria-label={t("reader_text_aria")} data-testid="reader-text-box">
      <div className="rd-page" data-testid="reader-text" ref={textRef}>
        <Parts parts={shMarkedParts(pages[page - 1] ?? "", notes, page)} />
      </div>
      {n > 1 && (
        <div className="rd-pager">
          <button type="button" className="rd-btn" data-testid="reader-prev" disabled={page <= 1} onClick={() => onPage(page - 1)}><CaretLeft size={16} aria-hidden="true" />{t("reader_prev")}</button>
          <button type="button" className="rd-btn" data-testid="reader-next" disabled={page >= n} onClick={() => onPage(page + 1)}>{t("reader_next")}<CaretRight size={16} aria-hidden="true" /></button>
        </div>
      )}
      <p className="rd-caveat">{t("sh2_this_is_the_text")}</p>
    </section>
  );
}

/**
 * apRender's head, less the title and the abstract warning, which the reader's header says in its own words (11278-11283): how many pages and characters were read (and that the reference list is
 * kept out, and the practice paper is fictional), the sections the paper was found to have, and "Check what Appuscholer read" with the first 2,500 characters the AI is sent and the
 * two-column warning. It is what the AI will read, so it stays where the student can look.
 */
export function ReadCheck({ d }: { d: ApLoaded }) {
  const t = useT();
  const meta = (d.paged ? t("ap2_n_pages", { n: d.pages.length }) + " " : "") + d.chars.toLocaleString() + " " + t("ap2_characters_read")
    + (d.refsCut ? t("ap2_the_reference_list_is") : "") + (d.sample ? t("ap2_this_is_a_fictional") : "");
  const sections = d.sections.length ? d.sections.map((s) => s.name + (s.page ? " " + t("ap2_p", { page: s.page }) : "")).join(" · ") : t("ap2_none_the_text_has");
  return (
    <div className="ap-box rd-read" data-testid="ap-read">
      <span className="ap-small">{meta}</span>
      <div className="ap-sections">{t("ap2_sections_found")} {sections}</div>
      <details className="ap-read">
        <summary>{t("ap2_check_what_appuscholer_read")}</summary>
        <pre data-testid="ap-preview">{apPreview(d)}</pre>
        <div className="ap-tiny">{t("ap2_papers_with_two_columns")}</div>
      </details>
    </div>
  );
}
