import type { QuotaRule } from "../store/types";

/** Calls allowed per user, per route, in each fixed window (the hour is aligned to the epoch hour, the day to the UTC day). */
export type QuotaLimits = Record<"complete" | "test", { hour: number; day: number }>;

export const AI_QUOTAS: QuotaLimits = {
  complete: { hour: 40, day: 200 },
  test: { hour: 5, day: 20 }
};

/** The hour rule first, then the day rule: a student at the hour limit is told the shorter wait. */
export function quotaRules(route: "complete" | "test", limits: QuotaLimits): QuotaRule[] {
  return [
    { bucket: `${route}:hour`, windowSec: 3600, limit: limits[route].hour },
    { bucket: `${route}:day`, windowSec: 86_400, limit: limits[route].day }
  ];
}
