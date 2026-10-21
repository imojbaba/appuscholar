"use client";
import { lazy, Suspense } from "react";
import { PanelLoading } from "../PanelLoading";

/*
 * Review's Viva tab. The registry reads this module as the app loads, so the panel itself (the document, AI and blob hooks) is fetched when the tab is first opened, not with every page
 * (lib/tools/registry.ts: "load heavy libs lazily"). The body is keyed by project, so another project starts clean (no question, no request still out).
 */
const VivaBody = lazy(() => import("./VivaBody"));

export function Panel({ projectId }: { tab: string; projectId: string }) {
  return <Suspense fallback={<PanelLoading testId="viva-loading" />}><VivaBody key={projectId} projectId={projectId} /></Suspense>;
}
