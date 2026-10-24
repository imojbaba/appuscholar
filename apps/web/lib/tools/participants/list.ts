import { RECORD_FIELDS, codeOf, isEverydayName, normName, pdCsv, type MatchPerson } from "@appuscholar/core";
import type { Participant, ParticipantList } from "@/lib/blobs/kinds/participants";

/*
 * The participant list's operations (spec 2026-10-24-participants-design.md §5, calls C2, C7 and C16, rulings R6 and R17), all pure: each returns a new list and leaves the one it
 * was given alone, so they run inside the blob's update form (useParticipants.save), where `prev` is the latest list. A code is always made from `prev.next`, never from a list
 * the caller held earlier: a code comes from `next`, `next` never goes down (not by withdrawal, not by destroying the list), so a code is never given twice.
 */

/**
 * A person to add: everything but the code and the id, which the list makes. `everyday` absent means "pre-mark the ones on the built-in everyday list" (R6); present, it is used as given.
 * Spelled out with Pick, since Omit on the loose Participant (it has an index signature) would lose its known fields.
 */
export type NewPerson = Pick<Participant, "name" | "spellings" | "joined">
  & Partial<Pick<Participant, "everyday" | "about" | "consentHow" | "minor" | "guardian" | "assent" | "contact" | "roll" | "pseudonym" | "withdrawn">>;

/** One line of a pasted list: the name, the other spellings after the first comma, and the code a key file gives (C16). */
export type PastedPerson = { name: string; spellings: string[]; code?: string };
export type SkippedPerson = { name: string; why: "already" | "code-taken" };

/** The distinct strings (by normal form), trimmed, in order, with nothing blank in them. */
function distinct(strings: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of strings) {
    const s = raw.trim();
    const k = normName(s);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

/** R6: the name, the spellings and the name's single words that are on the built-in everyday list, as typed. The Add form pre-ticks them; the student can untick. */
function everydayOf(name: string, spellings: string[]): string[] {
  return distinct([name, ...spellings, ...name.split(/\s+/)]).filter(isEverydayName);
}

/** The number in a participant code ("P007" is 7), or null for anything that is not P and digits. */
function codeNumber(code: string | undefined): number | null {
  const m = /^P(\d+)$/i.exec((code ?? "").trim());
  return m ? Number(m[1]) : null;
}

/** A list with people added: the counter moved on past `next`, and no longer a destroyed list (it has people to look for). */
function withPeople(l: ParticipantList, people: Participant[], next: number): ParticipantList {
  const out: ParticipantList = { ...l, next, people };
  delete out.destroyedAt;
  return out;
}

/**
 * Adds one person with the next code (`codeOf(l.next)`), the counter moving on by one. `p.joined` is the caller's date (yyyy-mm-dd).
 * The code is never one an existing person holds: a counter behind the people (a list from outside) is moved on past them.
 */
export function addPerson(l: ParticipantList, p: NewPerson): { list: ParticipantList; person: Participant } {
  const taken = new Set(l.people.map((x) => x.code));
  let n = l.next;
  while (taken.has(codeOf(n))) n++;
  const person: Participant = { ...p, id: crypto.randomUUID(), code: codeOf(n), everyday: p.everyday ?? everydayOf(p.name, p.spellings), about: p.about ?? {} };
  return { list: withPeople(l, [...l.people, person], n + 1), person };
}

/**
 * Adds the people of a pasted list (Paste a list, C16), each with the next code, joined `today`, consent left for the student. A given code (a key file's) is kept and `next`
 * becomes the highest kept plus one. A name equal (normName) to one already listed, or pasted before in the same list, is skipped as `already`; a code another name holds,
 * as `code-taken`. A blank name is ignored. Nothing added returns the list as it was.
 */
export function addPeople(l: ParticipantList, names: PastedPerson[], today: string): { list: ParticipantList; added: Participant[]; skipped: SkippedPerson[] } {
  const listed = new Set(l.people.map((p) => normName(p.name)));
  const taken = new Set(l.people.map((p) => p.code));
  const people = [...l.people];
  const added: Participant[] = [];
  const skipped: SkippedPerson[] = [];
  let next = l.next;
  for (const line of names) {
    const name = line.name.trim();
    if (!name) continue;
    if (listed.has(normName(name))) { skipped.push({ name: line.name, why: "already" }); continue; }
    const given = codeNumber(line.code);
    let code: string;
    if (given !== null) {
      code = codeOf(given);
      if (taken.has(code)) { skipped.push({ name: line.name, why: "code-taken" }); continue; }
    } else {
      while (taken.has(codeOf(next))) next++;
      code = codeOf(next);
    }
    const spellings = distinct(line.spellings);
    const person: Participant = { id: crypto.randomUUID(), code, name, spellings, everyday: everydayOf(name, spellings), joined: today, about: {} };
    listed.add(normName(name));
    taken.add(code);
    people.push(person);
    added.push(person);
    next = Math.max(next, (given ?? Number(code.slice(1))) + 1);
  }
  return { list: added.length ? withPeople(l, people, next) : l, added, skipped };
}

/** Changes what `patch` names on one person. Never the code or the id. An id not on the list changes nothing. */
export function editPerson(l: ParticipantList, id: string, patch: Partial<Participant>): ParticipantList {
  if (!l.people.some((p) => p.id === id)) return l;
  return { ...l, people: l.people.map((p) => (p.id === id ? { ...p, ...patch, id: p.id, code: p.code } : p)) };
}

/** Records that a person withdrew on `on` (yyyy-mm-dd), and whether their data is removed or kept. The code stays and so does the person. */
export function withdraw(l: ParticipantList, id: string, on: string, data: "remove" | "keep"): ParticipantList {
  return editPerson(l, id, { withdrawn: { on, data } });
}

/** Destroys the list (C7): nobody, no "not names", only the next code number (so a code is never used again) and the date. Anything else the list held is gone. */
export function destroyList(l: ParticipantList, now: string): ParticipantList {
  return { v: 1, next: l.next, people: [], notNames: [], destroyedAt: now };
}

/** Learns "Not a name" for a word (§7.5): its normal form, once. A blank word changes nothing. */
export function addNotName(l: ParticipantList, word: string): ParticipantList {
  const k = normName(word);
  return !k || l.notNames.includes(k) ? l : { ...l, notNames: [...l.notNames, k] };
}

/** Words that come before a name and are not part of it (C2). Compared lower case, without the dot. */
const BEFORE_A_NAME: ReadonlySet<string> = new Set(["mohd", "md", "mr", "mrs", "ms", "dr", "shri", "smt", "kumari"]);

/**
 * The short name the Add form suggests (C2): the name's first word, skipping a leading Mohd., Md., Mr, Mrs, Ms, Dr, Shri, Smt or Kumari ("Mohd. Imran" is "Imran").
 * A name made of nothing else keeps its first word; a blank name has none.
 */
export function suggestedShortName(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const at = words.findIndex((w) => !BEFORE_A_NAME.has(w.toLowerCase().replace(/\.+$/, "")));
  return at >= 0 ? words[at]! : (words[0] ?? "");
}

/** The age a person's `about.age` says, or null when it does not start with a number ("16", " 16 " and "16 years" are 16). */
function ageOf(p: Participant): number | null {
  const n = Number.parseFloat(p.about?.age ?? "");
  return Number.isFinite(n) ? n : null;
}

/** Under 18: with age recorded (the plan ticks it), the age says so; otherwise the person's own tick. The other is never read. */
export function isMinor(p: Participant, recordsAge: boolean): boolean {
  if (!recordsAge) return p.minor === true;
  const age = ageOf(p);
  return age !== null && age < 18;
}

/** Consent is complete for an adult, and for a person under 18 when the parent's permission and the person's own agreement are both there. */
export function consentComplete(p: Participant, recordsAge: boolean): boolean {
  return !isMinor(p, recordsAge) || (p.guardian === true && p.assent === true);
}

/**
 * What the matcher (core's buildMatcher) gets: who to look for, and in made-up names mode (`pseudonyms`) the name that stands in for each person who has one. Withdrawn people
 * are still looked for. Nothing for a destroyed list. No contact, roll or answers: the matcher never sees them.
 */
export function toMatchPeople(l: ParticipantList, pseudonyms: boolean): MatchPerson[] {
  if (l.destroyedAt) return [];
  return l.people.map((p) => ({
    id: p.id, code: p.code, name: p.name, spellings: p.spellings, everyday: p.everyday,
    ...(pseudonyms && p.pseudonym ? { pseudonym: p.pseudonym } : {}),
    ...(p.withdrawn ? { withdrawn: { on: p.withdrawn.on, data: p.withdrawn.data } } : {})
  }));
}

/** A field's heading: a menu field's id with a capital ("age" is "Age"); a label the student added as it was typed. */
const fieldLabel = (f: string): string => (RECORD_FIELDS.some((r) => r.id === f) ? f.charAt(0).toUpperCase() + f.slice(1) : f);

/**
 * Download the list: everything on it as v1's CSV (core's pdCsv). The first heading is `ParticipantCode`, as a key file's. `fields` are the answers' fields the plan records (ids and the
 * student's own labels); a value stored under another key (the plan dropped the field since, C15) still gets its column, so nothing on the list is left out.
 */
export function listCsv(l: ParticipantList, fields: string[]): string {
  const keys = [...fields];
  for (const p of l.people) for (const k of Object.keys(p.about ?? {})) if (!keys.includes(k)) keys.push(k);
  const headers = [
    "ParticipantCode", "Name", "Other spellings", "Also an everyday word", "Joined", "How they agreed", "Under 18", "Parent's permission", "Own agreement",
    "Contact", "Roll", "Made-up name", ...keys.map(fieldLabel), "Withdrew on", "Their data"
  ];
  const yes = (b: boolean | undefined) => (b ? "yes" : "");
  const rows = l.people.map((p) => [
    p.code, p.name, p.spellings.join("; "), p.everyday.join("; "), p.joined, p.consentHow ?? "", yes(p.minor), yes(p.guardian), yes(p.assent),
    p.contact ?? "", p.roll ?? "", p.pseudonym ?? "", ...keys.map((k) => p.about?.[k] ?? ""), p.withdrawn?.on ?? "", p.withdrawn?.data ?? ""
  ]);
  return pdCsv(headers, rows);
}

/** One cell of the pasted table: a tab or a line break typed in a value would split a cell or a row. */
const cell = (v: string): string => v.replace(/[\t\r\n]+/g, " ").trim();

/**
 * Copy as table (codes, no names): the code, the made-up name in made-up names mode, and the about-them fields asked for, tab-separated so it pastes into Word and Excel. Never a name,
 * a spelling, contact or roll.
 */
export function characteristicsTable(l: ParticipantList, aboutFields: string[], pseudonyms: boolean): string {
  const head = ["Code", ...(pseudonyms ? ["Made-up name"] : []), ...aboutFields.map(fieldLabel)];
  const rows = l.people.map((p) => [p.code, ...(pseudonyms ? [p.pseudonym ?? ""] : []), ...aboutFields.map((f) => p.about?.[f] ?? "")]);
  return [head, ...rows].map((r) => r.map(cell).join("\t")).join("\n");
}
