"use client";
import { useT } from "@/lib/i18n";
import { useLabActions } from "@/lib/tools/stats/useLabActions";
import { useRunActions } from "@/lib/tools/stats/useRunActions";
import { NotBuilt } from "@/components/places/NotBuilt";
import { ChartsTab } from "./ChartsTab";
import { CheckTab } from "./CheckTab";
import { DataIntake } from "./DataIntake";
import { Guide } from "./Guide";
import { PdBox } from "./PdBox";
import { PowerTab } from "./PowerTab";
import { RunTest } from "./RunTest";
import { ScalesTab } from "./ScalesTab";

/** The Data tab (v1 statsDlg: step 1 "Your data", 1529-1550, then step 2 "Choose and run a test", 1553-1604): the intake, the personal-data box, then the guide to choosing a test (Task B3), the test and its result. */
function DataTab({ projectId }: { projectId: string }) {
  const t = useT();
  const actions = useLabActions(projectId);
  const run = useRunActions(projectId, actions);
  return (
    <div className="panel" data-testid="stats-lab">
      <h3>{t("stats_data_title")}</h3>
      <p className="desc">{t("stats_data_privacy")}</p>
      <DataIntake projectId={projectId} actions={actions} />
      <PdBox projectId={projectId} actions={actions} />
      <Guide projectId={projectId} />
      <RunTest projectId={projectId} run={run} />
    </div>
  );
}

/**
 * Collection and analysis' statistics tabs (module `stats`): `data`, `power`, `charts`, `check` and `scales`. Data (Task B1), Power (Task B4) and Charts (Task B5) are built; the
 * others draw the frame's "Not built yet" until their tasks land. The lab's rows live in lib/tools/stats/lab.ts, so switching tabs (which mounts a
 * Panel again) loses nothing.
 */
export function Panel({ tab, projectId }: { tab: string; projectId: string }) {
  switch (tab) {
    case "data": return <DataTab projectId={projectId} />;
    case "power": return <PowerTab projectId={projectId} />;
    case "check": return <CheckTab projectId={projectId} />;
    case "charts": return <ChartsTab projectId={projectId} />;
    case "scales": return <ScalesTab projectId={projectId} />;
    default: return <NotBuilt />;
  }
}
