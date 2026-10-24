"use client";
import { useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { crossCheckHtml, type CcResult, type CitationEntry, type CitationStyle } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { ccClip, selectPassage } from "@/lib/cite/crosscheck";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/**
 * "📚 Cross-check citations and references" and its dialog (v1 937, ccDlg 1614-1622, ccOpen 12158-12175, ccJump 12176-12192): the open
 * document's citations against its References section, or the library when it has none (core's crossCheckHtml over the editor's HTML). The
 * sources cited but missing from the list (with near misses and "Go to this text", which selects the passage), the list entries never cited,
 * the entries that could not be read. "Scan again" reads the document again. No AI, nothing leaves the browser.
 */
export function CrossCheckDialog({ editor, lib, style, label, className = "flex-1", describedBy }: {
  editor: Editor | null; lib: CitationEntry[]; style: CitationStyle;
  /** The button's words (the Citations tab words it for its "Check again" list); v1's `cc_btn` when absent. */
  label?: string; className?: string;
  /** The id of the line that says why the button is off (no document open), for screen readers. */
  describedBy?: string;
}) {
  const t = useT();
  const [res, setRes] = useState<CcResult | null>(null);
  const [open, setOpen] = useState(false);
  /** A jump closes the dialog: focus stays in the editor instead of going back to the button. */
  const jumped = useRef(false);
  const ready = !!editor && !editor.isDestroyed;
  const scan = () => { if (editor && !editor.isDestroyed) setRes(crossCheckHtml(editor.getHTML(), lib, style)); };
  const go = (i: number) => {
    const m = res?.missing[i];
    if (!m || !editor || editor.isDestroyed) return;
    jumped.current = true;
    setOpen(false);
    selectPassage(editor, m.c.raw);
  };
  const r = res;
  const src = !r ? "" : r.srcKind === "doc" ? t("cc_src_doc", { h: r.heading, n: r.listN }) : r.srcKind === "lib" ? t("cc_src_lib", { n: r.listN }) : t("cc_src_none");
  const sum = !r || (r.srcKind === "none" && !r.cited) ? "" : t("cc_sum", { c: r.cited, m: r.missing.length, u: r.unused.length });
  return (
    <>
      <Button variant="ghost" className={className} data-testid="cite-cc-btn" disabled={!ready} aria-describedby={describedBy} onClick={() => { scan(); setOpen(true); }}>{label ?? t("cc_btn")}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="cc-dialog" className="cc-dlg sm:max-w-[920px]" showCloseButton={false}
          onCloseAutoFocus={(e) => { if (jumped.current) { jumped.current = false; e.preventDefault(); } }}>
          <DialogTitle asChild><h2>{t("cc_h")}</h2></DialogTitle>
          <DialogDescription className="cc-desc" data-testid="cc-desc">{t("cc_desc")}</DialogDescription>
          <p className="cc-src" data-testid="cc-src">{src}</p>
          <div className="cc-sum" data-testid="cc-sum">{sum}</div>
          <div className="cc-body">
            {r && (r.srcKind !== "none" || r.cited > 0) && (
              <>
                <h3>{t("cc_missing_h")}</h3>
                {r.missing.length ? r.missing.map((m, i) => (
                  <div className="cc-item cc-missing" data-testid="cc-missing" key={i}>
                    <b>{m.c.sn} {m.c.yr}</b>{m.c.n > 1 ? " (" + m.c.n + "×)" : ""} <code>{ccClip(m.c.raw, 90)}</code>
                    {/* cc_near_year (same surname, another year) or cc_near_name (same year, a surname 2 edits away). */}
                    {m.near.map((x, j) => (
                      <div className="cc-near" key={j}>{t("cc_near_" + x.kind, { n: x.e.sn, y: x.e.yr })}</div>
                    ))}
                    <div className="cc-go"><Button variant="ghost" size="sm" data-testid="cc-go" onClick={() => go(i)}>{t("nc_go")}</Button></div>
                  </div>
                )) : <p className="desc">{t("cc_none_missing")}</p>}
                <h3>{t("cc_unused_h")}</h3>
                {r.unused.length ? r.unused.map((e, i) => (
                  <div className="cc-item cc-unused" data-testid="cc-unused" key={i}>{ccClip(e.text, 200)}</div>
                )) : <p className="desc">{t("cc_none_unused")}</p>}
                {r.unread > 0 && <p className="desc" data-testid="cc-unread">{t("cc_unread", { n: r.unread })}</p>}
              </>
            )}
          </div>
          <p className="desc cc-note" data-testid="cc-note">{t("cc_note")}</p>
          <div className="cite-row">
            <Button variant="ghost" data-testid="cc-rescan" onClick={scan}>{t("nc_rescan")}</Button>
            <Button variant="ghost" data-testid="cc-close" onClick={() => setOpen(false)}>{t("close_btn")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
