import type { QuotaRule } from "../store/types";

/**
 * Calls allowed per user, per route, in each fixed window (the minute is aligned to the epoch minute, the hour to the epoch hour, the day to the UTC day).
 * `minute` is optional: a route without it has no minute rule.
 */
export type QuotaLimits = Record<"complete" | "test", { minute?: number; hour: number; day: number }>;

/** OJ's ruling, 2026-10-24: /ai/complete 20 a minute, 150 an hour, 800 a day; /ai/test 10 an hour, 40 a day (no minute rule). */
export const AI_QUOTAS: QuotaLimits = {
  complete: { minute: 20, hour: 150, day: 800 },
  test: { hour: 10, day: 40 }
};

/** The rules shortest window first (minute if set, then hour, then day): the first full rule is the one reported, so a student is told the shortest wait. */
export function quotaRules(route: "complete" | "test", limits: QuotaLimits): QuotaRule[] {
  const l = limits[route];
  return [
    ...(l.minute === undefined ? [] : [{ bucket: `${route}:minute`, windowSec: 60, limit: l.minute }]),
    { bucket: `${route}:hour`, windowSec: 3600, limit: l.hour },
    { bucket: `${route}:day`, windowSec: 86_400, limit: l.day }
  ];
}
