"use client";
import type { StageKey } from "@/lib/tools";
import { IdeaPlace } from "@/components/places/IdeaPlace";
import { LitPlace } from "@/components/places/LitPlace";
import { WritingPlace } from "@/components/places/WritingPlace";
import { NotBuilt } from "@/components/places/NotBuilt";
import { PlaceHeader } from "./PlaceHeader";

/**
 * A place's content. Idea: the Idea place (Task 9). Literature draws its own header, for its counted tabs
 * (Task 10). Writing: the document at full width (the shell shows it) with Chat and Research helpers above it. Design, collection and review
 * are not built yet and say so.
 */
export function StagePlace({ stage, tab }: { stage: StageKey; tab: string | null }) {
  if (stage === "lit") return <LitPlace tab={tab ?? "find"} />;
  return (
    <>
      <PlaceHeader stage={stage} tab={tab} />
      {stage === "writing" ? <WritingPlace /> : <div className="place-body" data-testid={"place-" + stage + (tab ? "-" + tab : "")}><Content stage={stage} tab={tab} /></div>}
    </>
  );
}

function Content({ stage }: { stage: StageKey; tab: string | null }) {
  if (stage === "idea") return <IdeaPlace />;
  return <NotBuilt />;
}
