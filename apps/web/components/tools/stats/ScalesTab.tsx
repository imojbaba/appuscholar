"use client";
import { useState } from "react";
import { SCALES, SL_PENDING } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { ScaleScore } from "./ScaleScore";
import { ScaleView } from "./ScaleView";

/**
 * The Scales tab (Task B7; v1's Scale library dialog 1255-1262 and 11390-11455): the scales core has, the paragraph naming those that wait for the owner's own file, and the
 * view of the one picked, with its copy, codebook and scoring in the student's data. The wording is fixed (Rule 10): it is read from core's SCALES and drawn as text; no AI path,
 * blob or network call exists in the Scales files.
 */
export function ScalesTab({ projectId }: { projectId: string }) {
  const t = useT();
  const [pick, setPick] = useState<string | null>(null);
  const [scoring, setScoring] = useState(false);
  const scale = SCALES.find((x) => x.id === pick) ?? null;
  return (
    <div className="panel" data-testid="scales-tab">
      <h3>{t("stats_sc_title")}</h3>
      <p className="desc">{t("stats_sc_intro")}</p>
      <div className="ap-row ap-wrap" role="group" aria-label={t("stats_sc_list_aria")}>
        {SCALES.map((x) => (
          <Button key={x.id} variant={x.id === pick ? "primary" : "ghost"} size="sm" data-testid={"scale-pick-" + x.id} aria-pressed={x.id === pick}
            onClick={() => { setPick(x.id); setScoring(false); }}>{`${x.short} · ${x.construct}`}</Button>
        ))}
      </div>
      <p className="ap-small" data-testid="scale-pending">{t("stats_sc_pending", { list: SL_PENDING })}</p>
      {scale && <ScaleView scale={scale} scoring={scoring} onScore={() => setScoring((v) => !v)} />}
      {scale && scoring && <ScaleScore projectId={projectId} scale={scale} />}
    </div>
  );
}
