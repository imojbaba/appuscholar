"use client";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useApNotes } from "@/lib/analyse/notes";
import type { StageKey } from "@/lib/tools";
import { Button } from "@/components/ui/button";
import { IdeaPlace } from "@/components/places/IdeaPlace";
import { ResearchPanel } from "@/components/tools/research/ResearchPanel";
import { AnalysePanel } from "@/components/tools/analyse/AnalysePanel";
import { Across } from "@/components/tools/analyse/Across";
import { CitePanel } from "@/components/tools/cite/CitePanel";
import { ShelfDialog, ShelfMatrix } from "@/components/tools/shelf/ShelfDialog";
import { PlaceHeader } from "./PlaceHeader";
import { useProject } from "./ProjectContext";

/**
 * A place's content (ruling R4: until Tasks 9 and 10 build the real places, each hosts today's panels). Idea: the Idea panel. Literature: Find
 * is Research; Reading list is the shelf (its dialog, as it opens today) and Analyse a paper; Compare is the shelf's table and the paper cards
 * side by side; Citations is the Citation Manager. Writing: the document at full width (the shell shows it). Design, collection and review
 * are not built yet and say so.
 */
export function StagePlace({ stage, tab }: { stage: StageKey; tab: string | null }) {
  return (
    <>
      <PlaceHeader stage={stage} tab={tab} />
      {stage !== "writing" && <div className="place-body" data-testid={"place-" + stage + (tab ? "-" + tab : "")}><Content stage={stage} tab={tab} /></div>}
    </>
  );
}

function Content({ stage, tab }: { stage: StageKey; tab: string | null }) {
  const t = useT();
  if (stage === "idea") return <IdeaPlace />;
  if (stage === "lit") {
    if (tab === "reading") return <Reading />;
    if (tab === "compare") return <Compare />;
    if (tab === "citations") return <CitePanel />;
    return <ResearchPanel />;
  }
  return <p className="place-note" data-testid="not-built">{t("place_not_built")}</p>;
}

function Reading() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="place-row"><Button variant="ghost" data-testid="reading-open-pdfs" onClick={() => setOpen(true)}>{t("reading_open_pdfs")}</Button></div>
      <ShelfDialog open={open} onOpenChange={setOpen} />
      <AnalysePanel />
    </>
  );
}

function Compare() {
  const { projectId } = useProject();
  const notes = useApNotes(projectId);
  return (
    <>
      <ShelfMatrix />
      <Across notes={notes} />
    </>
  );
}
