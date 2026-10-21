"use client";
import { useEffect, useMemo, useRef } from "react";
import { citFmt, citKey, citLastName, sanitizeHtml } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { useSuggestion } from "@/lib/ai/suggestion";
import { citeUseLib, insertLabel, REMOVE_TITLE, type CiteDeps } from "@/lib/cite/actions";
import { setCiteActive, useCiteActive, useCitePanelShown } from "@/lib/cite/active";
import { useCiteChecks } from "@/lib/cite/checks";
import { useOpenAlexKey } from "@/lib/research/oaKey";
import { useCitationUsage } from "@/lib/cite/usage";
import type { Library } from "@/lib/cite/useLibrary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useProject } from "@/components/frame/ProjectContext";
import { PanelLoading } from "../PanelLoading";
import { CiteChecks, CiteUsed, RcLine, RetrWarn } from "./CiteChecks";
import { CiteShare } from "./CiteShare";

/**
 * "🗂 My library" (v1 930-946, citRender 7819-7866): the heading with the count badge, then one card per source in library order, numbered by its
 * place (citFmt(d, i+1) in the chosen style), or "No sources yet.". A card: ✕, the surname and year in bold, the formatted reference, then the usage
 * line, the retraction warning and the Crossref line, and "Insert <in-text>". The card the caret chip points at is lit (citMarkActive 7697-7702).
 */
export function CiteLibrary({ library, deps, insertReady }: { library: Library; deps: () => CiteDeps; insertReady: boolean }) {
  const t = useT();
  const { lib, style } = library;
  // W8: while the saved library is read and opened there is neither a count nor "No sources yet." (a locked vault says so in its own sentence).
  const opening = library.loading && !library.locked;
  const { editor } = useSuggestion();
  const { selectDoc, documents } = useProject();
  const usage = useCitationUsage(lib, style);
  const oaKey = useOpenAlexKey();
  const checks = useCiteChecks(library, { oaKey: oaKey ?? undefined });
  useCitePanelShown();
  const active = useCiteActive();
  const box = useRef<HTMLDivElement>(null);
  // The lit card comes into view: to the middle after the chip's click, only as far as needed as the caret moves (7701).
  useEffect(() => {
    if (active.index < 0) return;
    const el = box.current?.querySelector<HTMLElement>(`[data-cite-index="${active.index}"]`);
    try { el?.scrollIntoView?.({ block: active.jump ? "center" : "nearest", behavior: "smooth" }); } catch { /* as v1 */ }
  }, [active]);
  // refHTML is built by core from the entry's own fields (escHTML + <i>); it is sanitised as any HTML put into the page is.
  const cards = useMemo(() => lib.map((d, i) => {
    const f = citFmt(d, i + 1, style);
    return { d, f, html: sanitizeHtml(f.refHTML) };
  }), [lib, style]);
  return (
    <>
      <h3 className="cite-lib-h">{t("cite_library_h3")} {!opening && <Badge variant="chip" data-testid="cite-count">{lib.length}</Badge>}</h3>
      <CiteChecks library={library} usage={usage} checks={checks} editor={editor && !editor.isDestroyed ? editor : null} />
      <div className="cite-lib" data-testid="cite-lib" ref={box}>
        {opening ? <PanelLoading /> : cards.length === 0 ? <p className="desc">{t("cite_no_sources")}</p> : cards.map(({ d, f, html }, i) => (
          <div className={"cit-item" + (i === active.index ? " cit-active" : "")} data-testid="cite-card" data-cite-index={i} key={i}>
            {/* citDel 7509 puts the light out. */}
            <button type="button" className="del" data-testid="cite-del" title={REMOVE_TITLE} aria-label={REMOVE_TITLE} onClick={() => { setCiteActive(-1); library.remove(d); }}>✕</button>
            <b>{citLastName(d.author)}, {d.year || "n.d."}</b><br />
            <span data-testid="cite-ref" dangerouslySetInnerHTML={{ __html: html }} />
            <div data-cite-slot="cite-used"><CiteUsed used={usage.usage[i] ?? []} documents={documents} onOpen={(id) => { void selectDoc(id); }} /></div>
            <div data-cite-slot="cite-retr"><RetrWarn status={checks.retraction.status[i] ?? null} /></div>
            <div data-cite-slot="cite-rc"><RcLine c={checks.rc[citKey(d)]} onFill={checks.rcReadOnly ? undefined : () => checks.fillFromCrossref(d)} /></div>
            <div className="cite-row cite-card-row">
              <Button variant="ghost" size="sm" data-testid="cite-use" disabled={!insertReady} onClick={() => void citeUseLib(i, deps())}>{insertLabel(f)}</Button>
            </div>
          </div>
        ))}
      </div>
      {/* v1 940-946: "Insert reference list", "📖 Load classic psychology sources", "⬆ Export library" / "⬇ Import library", the class-sharing note. */}
      <CiteShare library={library} insertReady={insertReady} />
    </>
  );
}
