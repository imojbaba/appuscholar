"use client";
import { useT } from "@/lib/i18n";
import { useLabActions } from "@/lib/tools/stats/useLabActions";
import { NotBuilt } from "@/components/places/NotBuilt";
import { DataIntake } from "./DataIntake";
import { PdBox } from "./PdBox";

/** The Data tab (v1 statsDlg step 1 "Your data", 1529-1550): the intake, then the personal-data box. */
function DataTab({ projectId }: { projectId: string }) {
  const t = useT();
  const actions = useLabActions(projectId);
  return (
    <div className="panel" data-testid="stats-lab">
      <h3>{t("stats_data_title")}</h3>
      <p className="desc">{t("stats_data_privacy")}</p>
      <DataIntake projectId={projectId} actions={actions} />
      <PdBox projectId={projectId} actions={actions} />
    </div>
  );
}

/**
 * Collection and analysis' statistics tabs (module `stats`): `data`, `power`, `charts`, `check` and `scales`. Only Data is built (Task B1); the
 * others draw the frame's "Not built yet" until their tasks land. The lab's rows live in lib/tools/stats/lab.ts, so switching tabs (which mounts a
 * Panel again) loses nothing.
 */
export function Panel({ tab, projectId }: { tab: string; projectId: string }) {
  switch (tab) {
    case "data": return <DataTab projectId={projectId} />;
    default: return <NotBuilt />;
  }
}
