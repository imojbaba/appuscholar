"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { STAGES, STAGE_DESCRIPTIONS, stageIndex } from "@/lib/stages";
import { cn } from "@/lib/utils";

/** v1 `stageIntroShow`. No stage tool exists to jump to yet, so the button is v1's fallback "Got it"; closing moves focus to `focusId`. */
export function StageIntro({ projectId, stage, open, focusId }: { projectId: string; stage: string; open: boolean; focusId?: string }) {
  const router = useRouter();
  const [show, setShow] = useState(open);
  const cur = stageIndex(stage);
  function close() { setShow(false); router.replace(`/projects/${projectId}`); }
  return (
    <Dialog open={show} onOpenChange={o => { if (!o) close(); }}>
      <DialogContent className="max-w-lg" data-testid="stage-intro" onCloseAutoFocus={e => { const el = focusId ? document.getElementById(focusId) : null; if (el) { e.preventDefault(); el.focus(); } }}>
        <DialogHeader>
          <DialogTitle>Your project has six stages</DialogTitle>
          <DialogDescription>The app follows you through them in order. Every tool stays one click away the whole time. This is just the shape of the road ahead.</DialogDescription>
        </DialogHeader>
        <ol className="grid gap-2">
          {STAGES.map((s, i) => (
            <li key={s.key} className={cn("flex gap-3 rounded-md border px-3 py-2", i === cur ? "border-primary bg-accent" : "border-transparent")}>
              <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-xs font-medium", i === cur ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{i + 1}</span>
              <div>
                <p className="text-sm font-medium">{s.label}</p>
                <p className="text-sm text-muted-foreground">{STAGE_DESCRIPTIONS[s.key]}</p>
              </div>
            </li>
          ))}
        </ol>
        <DialogFooter>
          <Button type="button" onClick={close} data-testid="stage-intro-start">Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
