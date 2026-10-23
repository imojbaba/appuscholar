"use client";
import { useT } from "@/lib/i18n";
import { ChartStudio } from "./ChartStudio";
import { QuickChart } from "./QuickChart";

/** The Charts tab (Task B5): Chart Studio's research figures, then the quick bar, line and Venn maker. Needs no parsed data: Chart Studio has its own paste box. */
export function ChartsTab({ projectId }: { projectId: string }) {
  const t = useT();
  return (
    <div className="panel" data-testid="charts-tab">
      <h3>{t("stats_ch_title")}</h3>
      <ChartStudio projectId={projectId} />
      <QuickChart projectId={projectId} />
    </div>
  );
}
