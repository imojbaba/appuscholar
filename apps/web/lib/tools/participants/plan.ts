import { RECORD_FIELDS, type IdMode } from "@appuscholar/core";
import type { DesignEc } from "@/lib/blobs/kinds/design";
import { placeHref } from "@/lib/frame/places";
import type { Participant } from "@/lib/blobs/kinds/participants";
import { isMinor, ageOf } from "./list";

/*
 * What the tab reads of the student's identification plan (spec 2026-10-24-participants-design.md §4 and §5, call C8), from the `design_ec` blob: how participants are known (`idMode`),
 * what is recorded about each person (`record`, the menu's field ids, and `recordOther`, up to five labels the student typed) and the under-18 answer (`minors`). The tab only reads it.
 * Every part may be missing (an unanswered question, an older blob); an unanswered plan does not block the tab (C8): `mode` is null, `record` is the menu's starting ticks, and nobody is
 * taken for under 18. A plan that could not be read (`unread`: the blob is in error or does not open, with no value) is not the same as one not answered: the tab says so, and
 * keeps the under-18 columns and warnings on (the answer is taken as "unsure", and a person is under 18 by their age or by their tick), so a consent warning never vanishes because a read failed.
 */

const MODES: readonly string[] = ["codes", "pseudonyms", "anonymous"];
const ABOUT_IDS: readonly string[] = RECORD_FIELDS.filter((f) => f.group === "about").map((f) => f.id);
const START: readonly string[] = RECORD_FIELDS.filter((f) => f.ticked).map((f) => f.id);

export type ParticipantsPlan = {
  /** How participants are known; null when unanswered, or a value this build does not know. */
  mode: IdMode | null;
  /** The who-they-are fields ticked, in the menu's order (name, spellings, contact, roll). */
  who: string[];
  /** The menu's about-them fields ticked, in the menu's order. */
  about: string[];
  /** The labels the student typed for about-them fields: trimmed, not blank, each once, none that is a menu field's id, at most five. */
  other: string[];
  /** The about-them columns, a menu field's id or the student's label: what `Participant.about` is keyed by. */
  aboutKeys: string[];
  spellings: boolean;
  contact: boolean;
  roll: boolean;
  /** Made-up names mode: each person has a made-up name. */
  pseudonyms: boolean;
  /** The minors answer is yes or unsure: the tab shows the under-18 columns and flags incomplete consent. */
  minorsOn: boolean;
  /** Age is recorded, so a person's age says whether they are under 18 (list.ts isMinor). */
  recordsAge: boolean;
  /** The plan could not be read (R26): `mode` is null, the minors answer is taken as unsure. */
  unread: boolean;
};

export function planOf(ec: Pick<DesignEc, "idMode" | "record" | "recordOther" | "minors"> | null | undefined, unread = false): ParticipantsPlan {
  const mode = typeof ec?.idMode === "string" && MODES.includes(ec.idMode) ? (ec.idMode as IdMode) : null;
  const record: readonly string[] = ec?.record ?? START;
  const has = (id: string) => record.includes(id);
  const about = ABOUT_IDS.filter(has);
  const other: string[] = [];
  for (const raw of ec?.recordOther ?? []) {
    const label = raw.trim();
    if (label && !other.includes(label) && !RECORD_FIELDS.some((f) => f.id === label)) other.push(label);
  }
  return {
    mode,
    who: RECORD_FIELDS.filter((f) => f.group === "who" && has(f.id)).map((f) => f.id),
    about,
    other: other.slice(0, 5),
    aboutKeys: [...about, ...other.slice(0, 5)],
    spellings: has("spellings"),
    contact: has("contact"),
    roll: has("roll"),
    pseudonyms: mode === "pseudonyms",
    minorsOn: unread || ec?.minors === "yes" || ec?.minors === "unsure",
    recordsAge: has("age"),
    unread
  };
}

/** Whether a person is under 18: yes or no, or unknown when age is the plan's way of telling and none was given (list.ts isMinor reads that as not under 18). */
export type MinorState = "yes" | "no" | "unknown";

/**
 * A person's under-18 state under the plan (list.ts isMinor, with the age said to be recorded or not). With the plan unread nothing says which way is used, so a person counts as under 18 by
 * their age or by their tick.
 */
export function minorState(p: Participant, plan: ParticipantsPlan): MinorState {
  if (plan.unread) return isMinor(p, true) || isMinor(p, false) ? "yes" : "no";
  if (isMinor(p, plan.recordsAge)) return "yes";
  return plan.recordsAge && ageOf(p) === null ? "unknown" : "no";
}

/**
 * The amber "consent not complete": the minors answer is yes or unsure, the person is under 18 and the parent's permission or their own agreement is missing. Not for a person who
 * withdrew (their consent is no longer in question). Never blocks.
 */
export function consentWarned(p: Participant, plan: ParticipantsPlan): boolean {
  return plan.minorsOn && !p.withdrawn && minorState(p, plan) === "yes" && !(p.guardian === true && p.assent === true);
}

/** The Ethics tab, where the plan is answered and changed (Design and ethics → Ethics). */
export const ethicsHref = (projectId: string): string => placeHref(projectId, "design", "ethics");
