"use client";
import { useT } from "@/lib/i18n";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The loading sign of a stage panel (fix wave A, W8; register row D-S2-34): drawn in place of what the panel's saved work would fill (the idea boxes, the library, the shelf's papers,
 * the cards table) while its encrypted blob is being read and opened, so the panel never looks empty or says "0 sources" when it is only waiting. Panels show it on `loading && !locked`;
 * a locked panel keeps its own sentence.
 */
export function PanelLoading({ testId = "panel-loading" }: { testId?: string }) {
  const t = useT();
  return (
    <div role="status" aria-busy="true" data-testid={testId} className="panel-loading">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-5/6" />
      <Skeleton className="mt-2 h-4 w-2/3" />
      <p className="note">{t("blob_loading")}</p>
    </div>
  );
}
