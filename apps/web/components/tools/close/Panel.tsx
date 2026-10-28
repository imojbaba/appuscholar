"use client";
import { lazy, Suspense } from "react";
import { PanelLoading } from "../PanelLoading";

/*
 * Review's Closeness tab. The registry reads this module as the app loads, so the panel itself (the document and shelf hooks, the results) is fetched when the tab is first opened, not
 * with every page (lib/tools/registry.ts: "load heavy libs lazily"). The body is keyed by project, so another project starts clean (no result, no run still out).
 */
const CloseBody = lazy(() => import("./CloseBody"));

export function Panel({ projectId }: { tab: string; projectId: string }) {
  return <Suspense fallback={<PanelLoading testId="close-loading" />}><CloseBody key={projectId} projectId={projectId} /></Suspense>;
}
