"use client";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { PHONE_QUERY, useMedia } from "@/lib/useMedia";
import { DocumentCard } from "@/components/document/DocumentCard";
import { useProject } from "./ProjectContext";

/** The document's width beside a place: what the API accepts for `docW` (Task 3), and where it starts. */
export const DOC_W_MIN = 360;
export const DOC_W_MAX = 900;
export const DOC_W_DEFAULT = 520;
/** One arrow key's step on the width handle. */
const DOC_W_STEP = 40;
export const clampDocW = (w: number): number => Math.min(DOC_W_MAX, Math.max(DOC_W_MIN, Math.round(w)));
/** What can take focus in a place: its first one gets it when the full-screen document closes and "Open my document" is not there. */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/**
 * The place and the document side by side (Task 11, draft §5: "it can also open beside any stage"). `children` is the place. The document card
 * is always mounted (its editor outlives a move to another place, and an insert lands in it); `shown` says whether it can be seen. In Writing
 * (`beside` false) it sits at full width under the place's helpers; elsewhere it is a column on the right, `docW` wide (360 to 900, default 520),
 * with a handle to resize it, and under the place on narrower screens. On a phone (PHONE_QUERY) the document opened beside a place takes the whole
 * screen, the place kept mounted out of sight, and "Back to {place}" closes it: the address never changed, so the place is there on the same tab.
 * Focus goes with it: to Back when the document opens full screen, and once it has closed to the place's "Open my document" (or its first control).
 */
export function DocumentBeside({ shown, beside, children }: { shown: boolean; beside: boolean; children: ReactNode }) {
  const t = useT();
  const { settings, update } = useSettings();
  const saved = clampDocW(settings.docW ?? DOC_W_DEFAULT);
  // The width while the handle is being dragged; stored once it is let go.
  const [dragW, setDragW] = useState<number | null>(null);
  const w = dragW ?? saved;
  const drag = useRef<{ x: number; w: number } | null>(null);
  const side = beside && shown;
  const full = useMedia(PHONE_QUERY) && side;
  const { place, closeDocument } = useProject();
  const docRef = useRef<HTMLDivElement>(null);
  const placeRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  // Set while Back closes the document (the close commits before closeDocument answers): focus returns to the place once it is shown again.
  const refocus = useRef(false);

  // Opened beside a place on a narrow screen, the document comes under the place: it is brought into view.
  const wasShown = useRef(shown);
  useEffect(() => {
    // Full screen, the document starts at the top of the page, and focus moves to Back: the button that opened it is out of sight now.
    if (full && !wasShown.current) { window.scrollTo?.(0, 0); backRef.current?.focus(); }
    else if (side && !wasShown.current && window.matchMedia?.("(max-width: 1099px)").matches) docRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    wasShown.current = shown;
  }, [side, shown, full]);
  // Back has closed the document and the place is shown again: focus goes to "Open my document", or the place's first control without it.
  useEffect(() => {
    if (full || !refocus.current) return;
    refocus.current = false;
    const p = placeRef.current;
    (p?.querySelector<HTMLElement>('[data-testid="place-open-doc"]') ?? p?.querySelector<HTMLElement>(FOCUSABLE))?.focus();
  }, [full]);
  const back = async () => {
    refocus.current = true;
    // Stay after a failed save: the document is still open, and focus stays on it.
    if (!(await closeDocument())) refocus.current = false;
  };

  const store = (next: number) => { if (next !== saved) void update({ docW: next }); };
  const onKey = (e: React.KeyboardEvent) => {
    // The handle is on the document's left edge: left makes it wider.
    const next = e.key === "ArrowLeft" ? w + DOC_W_STEP : e.key === "ArrowRight" ? w - DOC_W_STEP : e.key === "Home" ? DOC_W_MAX : e.key === "End" ? DOC_W_MIN : null;
    if (next === null) return;
    e.preventDefault();
    store(clampDocW(next));
  };

  return (
    <div className={"frame-body" + (side ? " beside" : "")} style={side ? ({ "--doc-w": w + "px" } as CSSProperties) : undefined}>
      <div ref={placeRef} className="frame-place" hidden={full}>{children}</div>
      <div ref={docRef} className={"frame-doc" + (beside ? " beside" : "") + (full ? " full" : "")} hidden={!shown} data-testid="frame-doc">
        {full && place && (
          <button ref={backRef} type="button" className="doc-back" data-testid="doc-back" onClick={() => { void back(); }}>
            <ArrowLeft size={18} aria-hidden="true" />{t("doc_back", { place: t("stage_name_" + place.stage) })}
          </button>
        )}
        {side && !full && (
          <div
            className="doc-resize" role="separator" aria-orientation="vertical" aria-label={t("doc_width")} aria-valuemin={DOC_W_MIN} aria-valuemax={DOC_W_MAX} aria-valuenow={w}
            tabIndex={0} data-testid="doc-resize" onKeyDown={onKey}
            onPointerDown={(e) => { drag.current = { x: e.clientX, w }; e.currentTarget.setPointerCapture?.(e.pointerId); }}
            onPointerMove={(e) => { if (drag.current) setDragW(clampDocW(drag.current.w + drag.current.x - e.clientX)); }}
            onPointerUp={() => { if (drag.current && dragW !== null) store(dragW); drag.current = null; setDragW(null); }}
            onPointerCancel={() => { drag.current = null; setDragW(null); }}
          />
        )}
        <DocumentCard />
      </div>
    </div>
  );
}
