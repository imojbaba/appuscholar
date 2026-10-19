"use client";
import { useMemo } from "react";
import { citFmt, citLastName, sanitizeHtml } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { citeUseLib, insertLabel, REMOVE_TITLE, type CiteDeps } from "@/lib/cite/actions";
import type { Library } from "@/lib/cite/useLibrary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * "🗂 My library" (v1 930-946, citRender 7819-7866): the heading with the count badge, then one card per source in library order, numbered by its
 * place (citFmt(d, i+1) in the chosen style), or "No sources yet.". A card: ✕, the surname and year in bold, the formatted reference, then the usage
 * line, the retraction warning and the Crossref line (Task 8 fills those three slots), and "Insert <in-text>".
 */
export function CiteLibrary({ library, deps, insertReady }: { library: Library; deps: () => CiteDeps; insertReady: boolean }) {
  const t = useT();
  const { lib, style } = library;
  // refHTML is built by core from the entry's own fields (escHTML + <i>); it is sanitised as any HTML put into the page is.
  const cards = useMemo(() => lib.map((d, i) => {
    const f = citFmt(d, i + 1, style);
    return { d, f, html: sanitizeHtml(f.refHTML) };
  }), [lib, style]);
  return (
    <>
      <h3 className="cite-lib-h">{t("cite_library_h3")} <Badge variant="chip" data-testid="cite-count">{lib.length}</Badge></h3>
      {/* Task 8, in v1's order (932-938): the usage summary (citUsageSummary), the retraction summary (citRetractSummary), "🛡 Check for retractions",
          the Crossref summary (citRealSummary), the missing numbers (citNumMissing), "🔎 Check that sources exist (Crossref)", "📚 Cross-check citations and references". */}
      <div className="cite-lib" data-testid="cite-lib">
        {cards.length === 0 ? <p className="desc">{t("cite_no_sources")}</p> : cards.map(({ d, f, html }, i) => (
          <div className="cit-item" data-testid="cite-card" key={i}>
            <button type="button" className="del" data-testid="cite-del" title={REMOVE_TITLE} aria-label={REMOVE_TITLE} onClick={() => library.remove(i)}>✕</button>
            <b>{citLastName(d.author)}, {d.year || "n.d."}</b><br />
            <span data-testid="cite-ref" dangerouslySetInnerHTML={{ __html: html }} />
            <div data-cite-slot="cite-used" />
            <div data-cite-slot="cite-retr" />
            <div data-cite-slot="cite-rc" />
            <div className="cite-row cite-card-row">
              <Button variant="ghost" size="sm" data-testid="cite-use" disabled={!insertReady} onClick={() => citeUseLib(i, deps())}>{insertLabel(f)}</Button>
            </div>
          </div>
        ))}
      </div>
      {/* Task 8, in v1's order (940-946): "Insert reference list", "📖 Load classic psychology sources", "⬆ Export library" / "⬇ Import library", the class-sharing note. */}
    </>
  );
}
