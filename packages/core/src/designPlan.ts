import { consentMarkdown, ecMinorsNote, ethicsStatement, protocolMarkdown } from "./design";
import type { ProtoFields } from "./design";

/*
 * The student's identification plan in the paperwork (spec 2026-10-24-participants §4, call C18). design.ts is v1's port, with golden tests, and is never edited; every function here
 * calls v1's and adds text, as aiuBuildV2 does for the AI-use statement. With no `idMode` in the plan each output is v1's, byte for byte, and a refusal from v1 passes through
 * unchanged. The added text is the builder's wording in plain English (some readers are children), for Dr. Sharma to review:
 *   consentMarkdownV2    "What we record about you" before "Voluntary participation"; with minors yes or unsure, "Parent or guardian permission" and "Young person's agreement" before "Consent"
 *                        (fixes walk observation O1; register D-S2-113)
 *   ethicsStatementV2    one sentence on how participants were identified, last (register D-S2-114)
 *   protocolMarkdownV2   "**How participants are identified:**" after the data management plan (register D-S2-114)
 *   ecMinorsNoteV2       v1's note with its last sentence replaced (C18; register D-S2-115)
 * The record menu's labels and one-line reasons are message keys (`design_rec_<id>`, `design_rec_<id>_why`) written with the Ethics tab; here the menu holds ids, groups and
 * starting ticks, and PLAIN holds the participant-facing name of each field for the consent form.
 */

export type IdMode = "codes" | "pseudonyms" | "anonymous";
export type RecordField = { id: string; group: "who" | "about"; ticked: boolean; sensitive?: boolean };
/** The plan as stored on the `design_ec` blob; every part may be missing (an unanswered question, or an older blob). */
export type Plan = { idMode?: IdMode; record?: string[]; recordOther?: string[] };

/** The menu of what to record about each person, in the order the Ethics tab shows it (spec §4). Who they are: kept in the sealed list only. About them: travels with the code. */
export const RECORD_FIELDS: readonly RecordField[] = [
  { id: "name", group: "who", ticked: true },
  { id: "spellings", group: "who", ticked: true },
  { id: "contact", group: "who", ticked: false },
  { id: "roll", group: "who", ticked: false },
  { id: "age", group: "about", ticked: false },
  { id: "gender", group: "about", ticked: false },
  { id: "year", group: "about", ticked: false },
  { id: "course", group: "about", ticked: false },
  { id: "area", group: "about", ticked: false },
  { id: "language", group: "about", ticked: false },
  { id: "caste", group: "about", ticked: false, sensitive: true },
  { id: "religion", group: "about", ticked: false, sensitive: true },
  { id: "health", group: "about", ticked: false, sensitive: true },
  { id: "income", group: "about", ticked: false, sensitive: true },
];

const ABOUT_IDS: ReadonlySet<string> = new Set(RECORD_FIELDS.filter((f) => f.group === "about").map((f) => f.id));
const MODES: readonly string[] = ["codes", "pseudonyms", "anonymous"];

/** An `idMode` this build does not know (a blob from another build) counts as unset, so the output is v1's. */
function modeOf(plan: Plan): IdMode | null {
  return typeof plan.idMode === "string" && MODES.includes(plan.idMode) ? plan.idMode : null;
}

/** In a small group, three or more of the about-fields together can point to one person even without a name (spec §4). Each id counts once; the who-fields never count. */
export function needsCombinationWarning(record: string[]): boolean {
  return new Set(record.filter((id) => ABOUT_IDS.has(id))).size >= 3;
}

// ---- the consent form ----

/** What each field is called to a participant, finished by "We will write down ...". */
const PLAIN: Record<string, string> = {
  name: "your name",
  spellings: "other names you use",
  contact: "a phone number or email address to contact you",
  roll: "your roll or enrolment number",
  age: "your age",
  gender: "your gender",
  year: "your year or class",
  course: "your course",
  area: "where you live (town or district, not your address)",
  language: "the language you speak at home",
  caste: "your caste or category",
  religion: "your religion",
  health: "health information",
  income: "your family's income",
};
const OTHER_MAX = 5;

/** A label the student typed starts with a lower-case letter in the middle of a sentence, unless it starts with an initial or an acronym ("IQ score", "A level"). */
const midSentence = (label: string): string => label.replace(/^\p{Lu}(?=\p{Ll})/u, (c) => c.toLowerCase());

/** The plain names of what the plan records: the ticked menu fields in the menu's order, then the student's own labels. Anonymous plans list the about-group only. */
function recordedPlain(plan: Plan, anonymous: boolean): string[] {
  const ticked = new Set(Array.isArray(plan.record) ? plan.record : []);
  const menu = RECORD_FIELDS.filter((f) => ticked.has(f.id) && (!anonymous || f.group === "about")).map((f) => PLAIN[f.id]!);
  const other = (Array.isArray(plan.recordOther) ? plan.recordOther : [])
    .filter((l): l is string => typeof l === "string")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, OTHER_MAX)
    .map(midSentence);
  return [...menu, ...other];
}

/** "a", "a and b", "a, b and c". */
function joinPlain(items: string[]): string {
  return items.length < 2 ? (items[0] ?? "") : items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
}

const keptSealed = (under: string, yours: string): string =>
  `Your answers are stored under ${under}, not your name. The list that links your name to ${yours} is kept sealed, separately from your answers, and is destroyed after the study.`;
const NOT_RECORDED = "We will not write down your name. Your answers cannot be linked to you.";

/** The body of "What we record about you". */
function recordSection(mode: IdMode, plan: Plan): string {
  const list = joinPlain(recordedPlain(plan, mode === "anonymous"));
  if (mode === "anonymous") return NOT_RECORDED + (list ? ` We will write down ${list}, but not your name.` : "");
  return (list ? `We will write down ${list}. ` : "") + (mode === "codes" ? keptSealed("a code (such as P001)", "your code") : keptSealed("a made-up name", "your made-up name"));
}

// The signature lines are v1's own (consentMarkdown): 22 underscores, two spaces, "Date: " and 10 underscores.
const SIGN = "______________________";
const DATE = "Date: __________";
const MINORS_SECTIONS =
  "## Parent or guardian permission\n"
  + `I am the parent or guardian of ${SIGN} and I give permission for them to take part in this study.\n\n`
  + `Parent or guardian signature: ${SIGN}  ${DATE}\n\n`
  + "## Young person's agreement\n"
  + "I have been told about this study in words I understand. I agree to take part. I know I can stop at any time, and nobody will be cross with me.\n\n"
  + `Young person's signature: ${SIGN}  ${DATE}\n\n`;

type ConsentInput = Parameters<typeof consentMarkdown>[0] & { minors?: string };
const TEXT_KEYS = ["title", "pi", "what", "risks", "benefits", "contact"] as const;
const mark = (i: number): string => `${i}`;

/**
 * v1's consent form, with the plan's sections added. With no `idMode` it is exactly `consentMarkdown(s)`. The two places to insert at are found in a copy of v1's form in which each
 * text the student wrote is replaced by a short mark, so a student's own words ("## Consent" typed into the risks box) can never be taken for a heading; the marks are then put back
 * one piece at a time, so nothing the student typed (a `$&`, or the plan's own labels) is read as a pattern.
 */
export function consentMarkdownV2(s: ConsentInput, plan: Plan): ReturnType<typeof consentMarkdown> {
  const v1 = consentMarkdown(s);
  const mode = modeOf(plan);
  if (!mode || typeof v1 !== "string") return v1;
  const marked: ConsentInput = { ...s };
  TEXT_KEYS.forEach((k, i) => { if (s[k]) marked[k] = mark(i); });
  const m = consentMarkdown(marked) as string;
  const voluntary = m.indexOf("\n\n## Voluntary participation\n") + 2;
  const consent = m.lastIndexOf("\n\n## Consent\n") + 2;
  const back = (t: string): string => t.replace(/(\d)/g, (_all, d: string) => s[TEXT_KEYS[Number(d)]!]);
  const minors = s.minors === "yes" || s.minors === "unsure" ? MINORS_SECTIONS : "";
  return back(m.slice(0, voluntary)) + "## What we record about you\n" + recordSection(mode, plan) + "\n\n" + back(m.slice(voluntary, consent)) + minors + back(m.slice(consent));
}

// ---- the ethics statement and the protocol ----

const ETHICS_SENTENCE: Record<IdMode, string> = {
  codes: "Each participant was given a code; the list linking codes to names was kept separately, sealed under the researcher's passphrase.",
  pseudonyms: "Participants are referred to by made-up names; the list linking them to real names was kept separately, sealed under the researcher's passphrase.",
  anonymous: "No names were recorded, so responses cannot be linked to participants.",
};

/** v1's ethics statement with one sentence on how participants were identified, last. A study that did not involve human participants has no participants to identify, so it is v1's. */
export function ethicsStatementV2(s: Parameters<typeof ethicsStatement>[0], plan: Plan): ReturnType<typeof ethicsStatement> {
  const r = ethicsStatement(s);
  const mode = modeOf(plan);
  if (!mode || "error" in r || s.status === "nohuman") return r;
  return { heading: r.heading, text: r.text + " " + ETHICS_SENTENCE[mode] };
}

const PROTOCOL_SENTENCE: Record<IdMode, string> = {
  codes: "Each participant will be given a code (such as P001). The list linking codes to names will be kept separately, sealed under the researcher's passphrase, and destroyed after the study.",
  pseudonyms: "Each participant will be given a made-up name. The list linking made-up names to real names will be kept separately, sealed under the researcher's passphrase, and destroyed after the study.",
  anonymous: "No names will be recorded, so responses cannot be linked to participants.",
};

/** v1's protocol with "How participants are identified" after the data management plan. After the last "## References" heading only v1's fixed text follows, so that is the real one. */
export function protocolMarkdownV2(o: ProtoFields, plan: Plan): string | null {
  const v1 = protocolMarkdown(o);
  const mode = modeOf(plan);
  if (!mode || v1 === null) return v1;
  const at = v1.lastIndexOf("\n\n## References\n") + 2;
  return v1.slice(0, at) + "**How participants are identified:** " + PROTOCOL_SENTENCE[mode] + "\n\n" + v1.slice(at);
}

// ---- the minors note ----

const MINORS_V1_LAST = " Appuscholar is for adults and does not collect children's data itself.";
const MINORS_V2_LAST = "If you list people under 18, only you can open the list. You still need a parent's permission and their own agreement before you record anything about them.";

/** v1's note with its last sentence replaced (C18), because a student may now list people under 18. `''` where v1 gives `''`. */
export function ecMinorsNoteV2(m: string): string {
  const v1 = ecMinorsNote(m);
  return v1.endsWith(MINORS_V1_LAST) ? v1.slice(0, -MINORS_V1_LAST.length) + " " + MINORS_V2_LAST : v1;
}
