"use client";
import { useRef, useState } from "react";
import { plain, plainText, useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { canPopOut, toolLabelKey } from "@/lib/tools";
import { toast } from "@/components/ui/toast";
import { AiPane } from "@/components/tools/AiPane";
import { ChatPanel, useChatLog } from "@/components/tools/ChatPanel";
import { IdeaPanel } from "@/components/tools/IdeaPanel";
import { StubPanel } from "@/components/tools/StubPanel";
import { StageGuide } from "./StageGuide";
import { useWorkspace } from "./WorkspaceContext";

const MIN_W = 320;
const MAX_W = 760;
const clamp = (w: number) => Math.min(MAX_W, Math.max(MIN_W, Math.round(w)));
/** The phone sheet's height as a percentage of the screen (mockup 05: 46% to start, 40% to 85% by the handle). */
const SHEET_MIN = 40;
const SHEET_MAX = 85;
const SHEET_DEFAULT = 46;
const SHEET_STEP = 5;
const clampPct = (p: number) => Math.min(SHEET_MAX, Math.max(SHEET_MIN, Math.round(p)));

/** Dock tabs (row 1), the width splitter and the dock itself (row 2) of the workspace grid. */
export function Dock() {
  const t = useT();
  const { settings, update } = useSettings();
  const { activeTool, dock, dockShow, aiWaiting } = useWorkspace();
  const chat = useChatLog();
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; w: number; ws: HTMLElement } | null>(null);
  const sheetPct = settings.sheetPct ?? SHEET_DEFAULT;
  const grab = useRef<{ ws: HTMLElement; offset: number; moved: boolean; pct: number } | null>(null);

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const ws = e.currentTarget.closest<HTMLElement>(".ws");
    const dockEl = ws?.querySelector<HTMLElement>(".dock");
    if (!ws || !dockEl) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, w: dockEl.getBoundingClientRect().width, ws };
    setDragging(true);
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (s) s.ws.style.setProperty("--dock-w", clamp(s.w + (s.x - e.clientX)) + "px");
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s) return;
    start.current = null;
    setDragging(false);
    // Persisted on release only, so a drag is one write (and a plain click on the splitter writes nothing).
    const w = clamp(s.w + (s.x - e.clientX));
    if (e.clientX !== s.x) void update({ dockW: w });
  };

  // The sheet's handle (phone only). The finger keeps its place on the sheet's top edge; the height is saved on release only.
  const onHandleDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const ws = e.currentTarget.closest<HTMLElement>(".ws");
    const sheet = e.currentTarget.closest<HTMLElement>(".dock-wrap");
    if (!ws || !sheet) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    grab.current = { ws, offset: e.clientY - sheet.getBoundingClientRect().top, moved: false, pct: sheetPct };
  };
  const onHandleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = grab.current;
    if (!g) return;
    const vh = window.innerHeight;
    g.pct = clampPct(((vh - (e.clientY - g.offset)) / vh) * 100);
    g.moved = true;
    g.ws.style.setProperty("--sheet-pct", String(g.pct));
  };
  const onHandleUp = () => {
    const g = grab.current;
    grab.current = null;
    if (g?.moved && g.pct !== sheetPct) void update({ sheetPct: g.pct });
  };
  const onHandleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const next = e.key === "ArrowUp" ? sheetPct + SHEET_STEP : e.key === "ArrowDown" ? sheetPct - SHEET_STEP : e.key === "Home" ? SHEET_MIN : e.key === "End" ? SHEET_MAX : null;
    if (next === null) return;
    e.preventDefault();
    const pct = clampPct(next);
    if (pct !== sheetPct) void update({ sheetPct: pct });
  };

  return (
    <div className="dock-wrap" data-testid="phone-sheet">
      <div className="sheet-handle" role="separator" aria-orientation="horizontal" tabIndex={0} aria-label="Resize the side panel" aria-valuemin={SHEET_MIN} aria-valuemax={SHEET_MAX} aria-valuenow={sheetPct} aria-valuetext={`${sheetPct}% of the screen`} data-testid="sheet-handle"
        onPointerDown={onHandleDown} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp} onKeyDown={onHandleKey}>
        <span className="grip" aria-hidden="true" />
      </div>
      <div className="dock-tabs">
        <div className="tabs" role="tablist" aria-label="Side panel">
          <button type="button" role="tab" className={"dtab" + (dock === "tools" ? " active" : "")} aria-selected={dock === "tools"} data-testid="dock-tab-tools" onClick={() => dockShow("tools")}>{plain(t(toolLabelKey(activeTool)))}</button>
          <button type="button" role="tab" className={"dtab" + (dock === "ai" ? " active" : "")} aria-selected={dock === "ai"} data-testid="dock-tab-ai" onClick={() => dockShow("ai")}>
            {t("dock_ai_tab")}{aiWaiting && dock !== "ai" && <span className="ddot" data-testid="ai-dot" role="img" aria-label="New suggestion" />}
          </button>
        </div>
        {/* No pop-out page exists yet. The two tools that will get one (canPopOut) say it is coming; the others keep the v1 notice. */}
        <button type="button" className="pop" title={t("pop_btn_title")} data-testid="pop-out" onClick={() => toast(canPopOut(activeTool) ? "Pop out arrives in a later phase." : t("pop_unsupported"))}>{t("pop_btn")}</button>
      </div>
      <div className={"splitter" + (dragging ? " drag" : "")} role="separator" aria-orientation="vertical" aria-label="Resize side panel" aria-valuemin={MIN_W} aria-valuemax={MAX_W} aria-valuenow={settings.dockW ?? 440} data-testid="dock-splitter" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      <div className="dock" role="tabpanel" aria-label={dock === "ai" ? plainText(t("dock_ai_tab")) : plainText(t(toolLabelKey(activeTool)))}>
        {dock === "ai" ? (
          <AiPane />
        ) : (
          <>
            <StageGuide />
            {activeTool === "idea" ? <IdeaPanel /> : activeTool === "chat" ? <ChatPanel chat={chat} /> : <StubPanel id={activeTool} />}
          </>
        )}
      </div>
    </div>
  );
}
