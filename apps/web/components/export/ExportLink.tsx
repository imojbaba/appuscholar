"use client";
import { Export } from "@phosphor-icons/react";
import { useT } from "@/lib/i18n";
import type { ExportPart } from "@/lib/export/projectExport";
import { Button } from "@/components/ui/button";
import { useProject } from "@/components/frame/ProjectContext";

/**
 * A tool's "Export" (wave B Task 12, register D-S2-42): it takes the place of the tool's own download and opens the project's export place with
 * only `part` ticked (W11). The id and test id stay the old button's.
 */
export function ExportLink({ part, id, testId, className }: { part: ExportPart; id?: string; testId?: string; className?: string }) {
  const t = useT();
  const { openExport } = useProject();
  return (
    <Button type="button" variant="ghost" size="sm" id={id} data-testid={testId} className={className} onClick={() => openExport(part)}>
      <Export size={14} aria-hidden="true" />{t("exp_link")}
    </Button>
  );
}
