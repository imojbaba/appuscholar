"use client";
import type { Editor } from "@tiptap/react";
import type { RcCheck, Usage } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { rcMissingFields, type CiteChecks as Checks } from "@/lib/cite/checks";
import { missingLabel, type CitationUsage } from "@/lib/cite/usage";
import type { Library } from "@/lib/cite/useLibrary";
import type { RetractionCache } from "@/lib/blobs/kinds";
import { Button } from "@/components/ui/button";
import { CrossCheckDialog } from "./CrossCheckDialog";

/**
 * The lines and buttons between the library's heading and its cards, in v1's order (931-937, citRender 7823-7848): how many sources are cited
 * in the student's documents, the retraction summary and "🛡 Check for retractions", the Crossref summary, the numbers cited in the open
 * document with no source (numbered styles), "🔎 Check that sources exist (Crossref)" and "📚 Cross-check citations and references".
 * Every line is empty while the library is.
 */
export function CiteChecks({ library, usage, checks, editor }: { library: Library; usage: CitationUsage; checks: Checks; editor: Editor | null }) {
  const t = useT();
  const { lib, style } = library;
  const { retraction: rt, rcSum } = checks;
  return (
    <>
      <p className="desc cite-usage-sum" data-testid="cite-usage-summary">
        {lib.length ? t("cite_usage_summary_fmt", { c: usage.cited, n: usage.total, u: usage.uncited }) : ""}
      </p>
      <p className={"desc cite-retr-sum" + (rt.flagged ? " cite-flagged" : "")} data-testid="cite-retr-summary">
        {rt.checked ? t("retr_summary_fmt", { c: rt.checked, r: rt.flagged, n: rt.noDoi }) : ""}
      </p>
      <div className="cite-row"><Button variant="ghost" className="flex-1" data-testid="cite-retract-btn" onClick={() => void checks.refreshRetractions(true)}>{t("cite_retract_btn")}</Button></div>
      <p className="desc cite-rc-sum" data-testid="cite-rc-summary">{rcSum ? t("rc_summary_fmt", rcSum) : ""}</p>
      <p className="desc cite-num-missing" data-testid="cite-num-missing">{usage.missing.length ? t("num_missing_fmt", { n: missingLabel(usage.missing) }) : ""}</p>
      <div className="cite-row"><Button variant="ghost" className="flex-1" data-testid="cite-rc-btn" onClick={() => void checks.runRefCheck(true)}>{t("rc_btn")}</Button></div>
      <div className="cite-row"><CrossCheckDialog editor={editor} lib={lib} style={style} /></div>
    </>
  );
}

/** A card's usage line (7851-7854): "Cited in:" and a link per document (it shows that document) with the count past one, or cite_not_used. */
export function CiteUsed({ used, onOpen }: { used: Usage[]; onOpen(id: string): void }) {
  const t = useT();
  if (!used.length) return <div className="desc cite-used cite-not-used">{t("cite_not_used")}</div>;
  return (
    <div className="desc cite-used">
      {t("cite_used_in")}{" "}
      {used.map((x, i) => (
        <span key={x.id}>
          {i > 0 ? ", " : ""}
          <a href="#" data-testid="cite-used-link" onClick={(e) => { e.preventDefault(); onOpen(x.id); }}>{x.title}</a>
          {x.n > 1 ? " (" + x.n + "×)" : ""}
        </span>
      ))}
    </div>
  );
}

/** A card's retraction warning (7856): only for a source OpenAlex flags. */
export function RetrWarn({ status }: { status: RetractionCache[string] | null }) {
  const t = useT();
  return status && status.r ? <div className="retr-warn" data-testid="cite-retr-warn">⚠ {t("retr_lib_warn")}</div> : null;
}

/**
 * rcLine 7792-7797: a card's Crossref line for its stored answer. Fix wave A (W27, W28): when the answer lists fields the source leaves empty and Crossref has
 * (`miss`), a second line names them and, unless the cache cannot be written (the pop-out: `onFill` absent), offers "Fill from Crossref".
 */
export function RcLine({ c, onFill }: { c: RcCheck | undefined; onFill?: () => void }) {
  const t = useT();
  if (!c) return null;
  if (c.s === "err") return <div className="desc rc-line">{t("rc_err")}</div>;
  if (c.s === "ok") return <div className="desc rc-line rc-ok">✓ {t("rc_ok")}{c.viaTitle && c.f && c.f.doi ? " " + t("rc_doi_found") + " " + c.f.doi : ""}</div>;
  if (c.s === "nf") return <div className="desc rc-line rc-nf">? {t("rc_nf")}</div>;
  return (
    <div className="desc rc-line rc-diff">
      ⚠ {(c.m || []).map((x) => t("rc_" + x.k) + " " + x.v).join("  ·  ")}
      {c.viaTitle ? <><br /><span className="rc-sub">{t("rc_doi_missing")}{c.f && c.f.doi ? " " + c.f.doi : ""}</span></> : null}
      {c.miss && c.miss.length ? (
        <>
          {(c.m || []).length || c.viaTitle ? <br /> : null}<span className="rc-sub" data-testid="cite-rc-missing">{t("rc_missing", { fields: rcMissingFields(c.miss, t) })}</span>
          {onFill ? <> <Button variant="ghost" size="sm" data-testid="cite-rc-fill" onClick={onFill}>{t("rc_fill_btn")}</Button></> : null}
        </>
      ) : null}
    </div>
  );
}
