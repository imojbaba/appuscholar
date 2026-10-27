"use client";
import type { StageKey } from "@/lib/tools";
import { ShapeStudy } from "@/components/places/ShapeStudy";
import { LitPlace } from "@/components/places/LitPlace";
import { WritingPlace } from "@/components/places/WritingPlace";
import { StagedPlace } from "@/components/places/StagedPlace";
import { PlaceHeader } from "./PlaceHeader";

/**
 * A place's content. Idea: the Idea place (Task 9). Literature draws its own header, for its counted tabs (Task 10). Writing's document tab:
 * the document at full width (the shell shows it) with Chat and Research helpers above it. Every other tab (Design and ethics, Collection and
 * analysis, Review, and Writing's My style and Words) is the tool registry's (Task G2).
 */
export function StagePlace({ stage, tab }: { stage: StageKey; tab: string | null }) {
  if (stage === "lit") return <LitPlace tab={tab ?? "find"} />;
  if (stage === "idea") return (
    <>
      <PlaceHeader stage={stage} tab={tab} />
      <div className="place-body" data-testid="place-idea"><ShapeStudy /></div>
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
