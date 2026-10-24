import { RECORD_FIELDS, type IdMode } from "@appuscholar/core";
import type { DesignEc } from "@/lib/blobs/kinds/design";
import { placeHref } from "@/lib/frame/places";

/*
 * What the tab reads of the student's identification plan (spec 2026-10-24-participants-design.md §4 and §5, call C8), from the `design_ec` blob: how participants are known (`idMode`),
 * what is recorded about each person (`record`, the menu's field ids, and `recordOther`, up to five labels the student typed) and the under-18 answer (`minors`). The tab only reads it.
 * Every part may be missing (an unanswered question, an older blob); an unanswered plan does not block the tab (C8): `mode` is null, `record` is the menu's starting ticks, and nobody is
 * taken for under 18.
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
};

export function planOf(ec: Pick<DesignEc, "idMode" | "record" | "recordOther" | "minors"> | null | undefined): ParticipantsPlan {
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
    minorsOn: ec?.minors === "yes" || ec?.minors === "unsure",
    recordsAge: has("age")
  };
}

/** The Ethics tab, where the plan is answered and changed (Design and ethics → Ethics). */
export const ethicsHref = (projectId: string): string => placeHref(projectId, "design", "ethics");
