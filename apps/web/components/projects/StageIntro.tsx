"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { STAGES, STAGE_DESCRIPTIONS, stageIndex, stageLabel } from "@/lib/stages";
import { cn } from "@/lib/utils";

export function StageIntro({ projectId, projectTitle, stage, open }: { projectId: string; projectTitle: string; stage: string; open: boolean }) {
  const router = useRouter();
  const [show, setShow] = useState(open);
  const cur = stageIndex(stage);
  function close() { setShow(false); router.replace(`/projects/${projectId}`); }
  return (
    <Dialog open={show} onOpenChange={o => { if (!o) close(); }}>
      <DialogContent className="max-w-lg" data-testid="stage-intro">
        <DialogHeader>
          <DialogTitle>{projectTitle}: the six stages</DialogTitle>
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
          <Button type="button" onClick={close} data-testid="stage-intro-start">Start with {stageLabel(STAGES[cur]!.key)} <ArrowRight size={18} /></Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
