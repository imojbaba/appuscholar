"use client";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { DocumentCard } from "@/components/document/DocumentCard";

/** The document's width beside a place: what the API accepts for `docW` (Task 3), and where it starts. */
export const DOC_W_MIN = 360;
export const DOC_W_MAX = 900;
export const DOC_W_DEFAULT = 520;
/** One arrow key's step on the width handle. */
const DOC_W_STEP = 40;
export const clampDocW = (w: number): number => Math.min(DOC_W_MAX, Math.max(DOC_W_MIN, Math.round(w)));

/**
 * The place and the document side by side (Task 11, draft §5: "it can also open beside any stage"). `children` is the place. The document card
 * is always mounted (its editor outlives a move to another place, and an insert lands in it); `shown` says whether it can be seen. In Writing
 * (`beside` false) it sits at full width under the place's helpers; elsewhere it is a column on the right, `docW` wide (360 to 900, default 520),
 * with a handle to resize it, and under the place on narrower screens.
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
  const docRef = useRef<HTMLDivElement>(null);

  // Opened beside a place on a narrow screen, the document comes under the place: it is brought into view.
  const wasShown = useRef(shown);
  useEffect(() => {
    if (side && !wasShown.current && window.matchMedia?.("(max-width: 1099px)").matches) docRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    wasShown.current = shown;
  }, [side, shown]);

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
      <div className="frame-place">{children}</div>
      <div ref={docRef} className={"frame-doc" + (beside ? " beside" : "")} hidden={!shown} data-testid="frame-doc">
        {side && (
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
