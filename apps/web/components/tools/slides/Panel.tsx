"use client";
import { lazy, Suspense } from "react";
import { PanelLoading } from "../PanelLoading";

/*
 * Review's Slides tab (v1 "Make a PPT from this document"). The registry reads this module as the app loads, so the panel itself is fetched when the tab is first opened (lib/tools/registry.ts:
 * "load heavy libs lazily"); PptxGenJS is fetched only when the student presses Download. The body is keyed by project, so another project starts clean.
 */
const SlidesBody = lazy(() => import("./SlidesBody"));

export function Panel({ projectId }: { tab: string; projectId: string }) {
  return <Suspense fallback={<PanelLoading testId="slides-loading" />}><SlidesBody key={projectId} /></Suspense>;
}
