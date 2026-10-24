"use client";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Printer } from "@phosphor-icons/react";
import { sanitizeHtml } from "@appuscholar/core";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { GUIDE } from "@/lib/help/guide/content";
import { buildGuidePrintDocument, guideCount, guideWords, searchGuide } from "@/lib/help/guide/search";
import type { GuideSection } from "@/lib/help/guide/types";
import { useT } from "@/lib/i18n";
import { APP_VERSION } from "@/lib/version";

/** The contents' headings in v1's order, as message keys; what follows the prefix is the `group` a section names. */
const GROUP_PREFIX = "wc_guide_group_";
const GROUP_KEYS = ["wc_guide_group_Begin", "wc_guide_group_Tools", "wc_guide_group_Practice", "wc_guide_group_Help"];

/** What a section's body looks like: the tags the sanitiser keeps, given the spacing v1's guide gave them. */
const BODY = "mt-2 break-words text-[13.5px] leading-relaxed [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_h4]:mt-3 [&_h4]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2 [&_table]:my-2 [&_td]:border [&_td]:px-2 [&_th]:border [&_th]:px-2 [&_a]:underline";

/**
 * What Ask Appu (Task C3) needs of the dialog it sits in, given to everything drawn in `extra`: the sections the dialog shows (so Appu ranks the
 * same ones), `setQuery` (the search box's text, as if typed; `openId` keeps that section open though the search would leave it closed) and
 * `showOnly` (these sections alone, all open, under their own counter; the next keystroke or `setQuery` ends it).
 */
export type GuideApi = { sections: GuideSection[]; setQuery(q: string, openId?: string): void; showOnly(ids: string[]): void };
const GuideApiContext = createContext<GuideApi | null>(null);
export function useGuideApi(): GuideApi {
  const v = useContext(GuideApiContext);
  if (!v) throw new Error("useGuideApi must be used inside <GuideDialog>");
  return v;
}

/**
 * The Guide (Task C2; v1 `guideDlg`, `guideFilter`, `guideRender`, `guidePrint`, build 2026.10.24a): a search box, a count, the contents grouped
 * Begin, Tools, Practice, Help, each section a details element, and "Print or save as PDF". Every section's HTML goes through sanitizeHtml.
 * `extra` is drawn between the search row and the count (Task C3 puts Ask Appu there, and reaches the dialog through useGuideApi). The query lives inside the open dialog, so it starts empty each time.
 * Opened from Help, it is a second dialog over it: Escape or Close ends only the Guide.
 */
export function GuideDialog({ open, onClose, sections = GUIDE, extra }: { open: boolean; onClose: () => void; sections?: GuideSection[]; extra?: ReactNode }) {
  const t = useT();
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      {/* A column that is at most 90% of the screen's height: the header and the buttons stay, only the contents scroll. */}
      <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-3xl" data-testid="guide-dialog">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-purple-800">{t("wc_guide_title")}</DialogTitle>
          <DialogDescription>{t("wc_guide_english_only")}</DialogDescription>
        </DialogHeader>
        <GuideBody sections={sections} extra={extra} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}

/** Brings a section Ask Appu's link opened into view, in the list and in the scrolling part above Close (not every browser, or jsdom, has it). */
function showNearest(el: HTMLElement | null): void { el?.scrollIntoView?.({ block: "nearest" }); }

function GuideBody({ sections, extra, onClose }: { sections: GuideSection[]; extra?: ReactNode; onClose: () => void }) {
  const t = useT();
  const [query, setQuery] = useState("");
  // Set by Ask Appu: sections listed in place of a search (pinned), and one kept open though the search would close it. The search box clears both.
  // `focus.n` counts the presses of a link, so pressing the same link again re-opens its section after the student closed it.
  const [pinned, setPinned] = useState<string[] | null>(null);
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const byId = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections]);
  const searched = useMemo(() => searchGuide(query, sections), [query, sections]);
  const hits = useMemo(() => (pinned ? pinned.filter((id) => byId.has(id)).map((id) => ({ id, open: true })) : searched), [pinned, byId, searched]);
  const bodies = useMemo(() => new Map(sections.map((s) => [s.id, sanitizeHtml(s.html)])), [sections]);
  const count = pinned
    ? { key: hits.length === 1 ? "wc_guide_count_asked_one" : "wc_guide_count_asked", vars: { h: hits.length } }
    : guideCount(guideWords(query).length, hits.length, sections.length);
  const api = useMemo<GuideApi>(() => ({
    sections,
    setQuery: (text, id) => { setPinned(null); setFocus((f) => (id ? { id, n: (f?.n ?? 0) + 1 } : null)); setQuery(text); },
    showOnly: (ids) => { setPinned(ids); setFocus(null); setQuery(""); }
  }), [sections]);
  // The pinned sections may sit below the fold on a small screen (the part above Close scrolls); bring them up.
  useEffect(() => { if (pinned) listRef.current?.scrollIntoView?.({ block: "nearest" }); }, [pinned]);

  // v1 guidePrint: a new window with every section, then print() from here once it has laid out.
  const print = () => {
    const w = window.open("", "_blank");
    if (!w) { setPopupBlocked(true); return; }
    setPopupBlocked(false);
    w.document.write(buildGuidePrintDocument(sections, t("wc_guide_print_title"), t("wc_guide_print_from", { build: APP_VERSION })));
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch { /* the window may already be closed */ } }, 400);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Everything above Close is one column that scrolls as a whole when the search, Ask Appu and the list's floor do not fit the screen; the
          list is a floor of 8rem and shrinks to it first, so it gets its own scroll only while there is room. Close stays on the screen. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto" data-testid="guide-scroll">
        <div className="flex flex-wrap items-center gap-2">
          <Input type="search" className="min-w-[220px] flex-1 text-ellipsis" data-testid="guide-search" value={query} onChange={(e) => api.setQuery(e.target.value)} placeholder={t("wc_guide_search_ph")} aria-label={t("wc_guide_search_label")} />
          <Button variant="ghost" data-testid="guide-print" onClick={print}><Printer weight="regular" aria-hidden="true" />{t("wc_guide_print")}</Button>
        </div>
        {popupBlocked && <p className="m-0 text-sm text-destructive" role="status" data-testid="guide-print-note">{t("wc_guide_popup")}</p>}
        <GuideApiContext.Provider value={api}>{extra}</GuideApiContext.Provider>
        <p className="m-0 text-[12.5px] text-muted-foreground" aria-live="polite" data-testid="guide-count">{t(count.key, count.vars)}</p>
        <div ref={listRef} className="min-h-[8rem] flex-1 overflow-y-auto pr-1" data-testid="guide-list" role="region" aria-label={t("wc_guide_contents")}>
          {hits.length === 0 ? (
            <p className="m-0 text-[13.5px]" data-testid="guide-empty">{t("wc_guide_empty")}</p>
          ) : (
            GROUP_KEYS.map((key) => {
              const g = key.slice(GROUP_PREFIX.length);
              const inGroup = hits.filter((h) => byId.get(h.id)?.group === g);
              if (!inGroup.length) return null;
              return (
                <section key={g} data-testid={"guide-group-" + g}>
                  <h3 className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t(key)}</h3>
                  {inGroup.map((h) => {
                    const s = byId.get(h.id)!;
                    const followed = focus?.id === s.id;
                    const open = h.open || followed;
                    return (
                      // Keyed by whether the search opens it, so a new search re-opens or closes it while a click on the summary is kept until then
                      // (and by the link's press count, so the same link opens it again).
                      <details key={s.id + (open ? "-open" : "") + (followed ? "-" + focus.n : "")} open={open} ref={followed ? showNearest : undefined} className="my-2 rounded-lg border border-line px-3" data-testid={"guide-section-" + s.id}>
                        <summary className="cursor-pointer py-3 text-sm font-semibold text-purple-800">{s.title}</summary>
                        <div className={BODY} dangerouslySetInnerHTML={{ __html: bodies.get(s.id) ?? "" }} />
                      </details>
                    );
                  })}
                </section>
              );
            })
          )}
        </div>
      </div>
      <div className="flex justify-end">
        <Button variant="ghost" data-testid="guide-close" onClick={onClose}>{t("close_btn")}</Button>
      </div>
    </div>
  );
}
