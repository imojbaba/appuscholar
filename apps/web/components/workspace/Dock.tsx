"use client";
import { useRef, useState } from "react";
import { plain, plainText, useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { toolLabelKey } from "@/lib/tools";
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

/** Dock tabs (row 1), the width splitter and the dock itself (row 2) of the workspace grid. */
export function Dock() {
  const t = useT();
  const { settings, update } = useSettings();
  const { activeTool, dock, dockShow, aiWaiting } = useWorkspace();
  const chat = useChatLog();
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; w: number; ws: HTMLElement } | null>(null);

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

  return (
    <>
      <div className="dock-tabs">
        <div className="tabs" role="tablist" aria-label="Side panel">
          <button type="button" role="tab" className={"dtab" + (dock === "tools" ? " active" : "")} aria-selected={dock === "tools"} data-testid="dock-tab-tools" onClick={() => dockShow("tools")}>{plain(t(toolLabelKey(activeTool)))}</button>
          <button type="button" role="tab" className={"dtab" + (dock === "ai" ? " active" : "")} aria-selected={dock === "ai"} data-testid="dock-tab-ai" onClick={() => dockShow("ai")}>
            {t("dock_ai_tab")}{aiWaiting && dock !== "ai" && <span className="ddot" data-testid="ai-dot" role="img" aria-label="New suggestion" />}
          </button>
        </div>
        {/* No pop-out page exists yet, so every tool answers with the v1 notice. canPopOut() in lib/tools.ts marks the two tools that will open one. */}
        <button type="button" className="pop" title={t("pop_btn_title")} data-testid="pop-out" onClick={() => toast(t("pop_unsupported"))}>{t("pop_btn")}</button>
      </div>
      <div className={"splitter" + (dragging ? " drag" : "")} role="separator" aria-orientation="vertical" aria-label="Resize side panel" aria-valuemin={MIN_W} aria-valuemax={MAX_W} aria-valuenow={settings.dockW ?? 440} data-testid="dock-splitter" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      <aside className="dock" role="tabpanel" aria-label={dock === "ai" ? plainText(t("dock_ai_tab")) : plainText(t(toolLabelKey(activeTool)))}>
        {dock === "ai" ? (
          <AiPane />
        ) : (
          <>
            <StageGuide />
            {activeTool === "idea" ? <IdeaPanel /> : activeTool === "chat" ? <ChatPanel chat={chat} /> : <StubPanel id={activeTool} />}
          </>
        )}
      </aside>
    </>
  );
}
