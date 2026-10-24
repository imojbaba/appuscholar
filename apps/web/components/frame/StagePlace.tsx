"use client";
import type { StageKey } from "@/lib/tools";
import { IdeaPlace } from "@/components/places/IdeaPlace";
import { LitPlace } from "@/components/places/LitPlace";
import { WritingPlace } from "@/components/places/WritingPlace";
import { StagedPlace } from "@/components/places/StagedPlace";
import { PlaceHeader } from "./PlaceHeader";

/**
 * A place's content. Idea: the Idea place (Task 9). Literature draws its own header, for its counted tabs (Task 10). Writing's document tab:
 * the document at full width (the shell shows it) with Chat and Research helpers above it. `paper`: the paper the address names after Literature's Reading tab (the reader opens on it, Task 27). Every other tab (Design and ethics, Collection and
 * analysis, Review, and Writing's My style and Words) is the tool registry's (Task G2).
 */
export function StagePlace({ stage, tab, paper }: { stage: StageKey; tab: string | null; paper?: string }) {
  if (stage === "lit") return <LitPlace tab={tab ?? "find"} paper={paper} />;
  if (stage === "idea") return (
    <>
      <PlaceHeader stage={stage} tab={tab} />
      <div className="place-body" data-testid="place-idea"><IdeaPlace /></div>
    </>
  );
  if (stage === "writing" && (tab ?? "document") === "document") return (
    <>
      <PlaceHeader stage={stage} tab="document" />
      <WritingPlace />
    </>
  );
  return <StagedPlace stage={stage} tab={tab} />;
}
