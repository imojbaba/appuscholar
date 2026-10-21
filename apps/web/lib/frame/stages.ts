import type { FixedBlobKind } from "@/lib/blobs/kinds";
import { STAGE_ORDER, type StageKey } from "@/lib/tools";

/** A stage's state on the project home and the project list, from the project's work and its Ready marks. */
export type StageState = "not-started" | "started-early" | "in-progress" | "ready" | "reopened";

/**
 * Which stage each blob kind belongs to, and whether writing it is the student's work (caches and preferences are not).
 * Every kind a later stage adds goes here: the "every blob kind the api allows has a stage" test fails until it does.
 */
export const KIND_STAGE: Record<FixedBlobKind, { stage: StageKey; work: boolean }> = {
  idea_intake: { stage: "idea", work: true },
  citations: { stage: "lit", work: true },
  shelf_index: { stage: "lit", work: true },
  ap_notes: { stage: "lit", work: true },
  retraction_cache: { stage: "lit", work: false },
  refcheck_cache: { stage: "lit", work: false },
  rs_prefs: { stage: "lit", work: false },
  ap_cols: { stage: "lit", work: false },
  shelf_cols: { stage: "lit", work: false }
};

/** A kind's stage: `shelf_paper:*` is Literature work; a kind this build does not know (from a newer build) is null and ignored. */
export function stageOfKind(kind: string): { stage: StageKey; work: boolean } | null {
  if (kind.startsWith("shelf_paper:")) return { stage: "lit", work: true };
  return Object.hasOwn(KIND_STAGE, kind) ? KIND_STAGE[kind as FixedBlobKind] : null;
}

/** What the states are worked out from: `GET /projects?include=work`'s blobs and draft words, and the project's stage marks (ISO strings from the server). */
export type StageWork = {
  blobs: Array<{ kind: string; updatedAt: string }>;
  draftWords: number;
  draftEditedAt: string | null;
  stageMarks: Partial<Record<StageKey, { readyAt: string }>>;
};

/** An ISO time as an instant (ms), so "…00Z", "…00.000Z" and "+05:30" compare by time, not as strings; an unreadable time is null. */
const instant = (iso: string): number | null => {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
};

/** Each stage's state, by the rules in order: a Ready mark (reopened by later work), no work, Writing with words, then started early or in progress. */
export function stageStates(w: StageWork): Record<StageKey, StageState> {
  const last: Partial<Record<StageKey, number>> = {};
  for (const b of w.blobs) {
    const s = stageOfKind(b.kind);
    const t = instant(b.updatedAt);
    if (!s?.work || t === null) continue;
    last[s.stage] = Math.max(last[s.stage] ?? t, t);
  }
  const draftAt = w.draftEditedAt === null ? null : instant(w.draftEditedAt);
  if (w.draftWords > 0 && draftAt !== null) last.writing = draftAt;

  const out = {} as Record<StageKey, StageState>;
  for (const s of STAGE_ORDER) {
    const lastWork = last[s];
    const mark = w.stageMarks[s];
    const readyAt = mark ? instant(mark.readyAt) : null;
    if (mark && readyAt !== null) out[s] = lastWork !== undefined && lastWork > readyAt ? "reopened" : "ready";
    else if (lastWork === undefined) out[s] = "not-started";
    // The document is open beside every stage from day one, so Writing is never started early (decision 5).
    else if (s === "writing") out[s] = "in-progress";
    else out[s] = STAGE_ORDER.slice(0, STAGE_ORDER.indexOf(s)).some((e) => e !== "writing" && out[e] === "not-started") ? "started-early" : "in-progress";
  }
  return out;
}
