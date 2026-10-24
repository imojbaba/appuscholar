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

/**
 * The number in a participant code ("P007" is 7), or null for anything that is not P and one to six digits, and for P000 (the first code is P001). Six digits is the most kept (P999999):
 * a longer run is not a code of ours, and would carry `next` to a number nobody means.
 */
function codeNumber(code: string | undefined): number | null {
  const m = /^P(\d{1,6})$/i.exec((code ?? "").trim());
  const n = m ? Number(m[1]) : 0;
  return n >= 1 ? n : null;
}

/** A list with people added: the counter moved on past `next`, and no longer a destroyed list (it has people to look for). */
function withPeople(l: ParticipantList, people: Participant[], next: number): ParticipantList {
  const out: ParticipantList = { ...l, next, people };
  delete out.destroyedAt;
  return out;
}

/** The number the next added person gets: `next`, moved on past any code a person holds (a counter behind the people, a list from outside). */
function nextNumber(l: ParticipantList): number {
  const taken = new Set(l.people.map((x) => x.code));
  let n = l.next;
  while (taken.has(codeOf(n))) n++;
  return n;
}

/** The code the next person added will get (the Add form says it: "the next code is P006"). */
export function nextCode(l: ParticipantList): string {
  return codeOf(nextNumber(l));
}

/**
 * Adds one person with the next code (`nextCode(l)`), the counter moving on by one. `p.joined` is the caller's date (yyyy-mm-dd).
 * The code is never one an existing person holds: a counter behind the people (a list from outside) is moved on past them.
 */
export function addPerson(l: ParticipantList, p: NewPerson): { list: ParticipantList; person: Participant } {
  const n = nextNumber(l);
  // The name and the spellings are tidied as a pasted list's are (trimmed; no blank or repeated spelling), so an Add form and Paste a list make the same person.
  const name = p.name.trim();
  const spellings = distinct(p.spellings);
  const person: Participant = { ...p, id: crypto.randomUUID(), code: codeOf(n), name, spellings, everyday: p.everyday ?? everydayOf(name, spellings), about: p.about ?? {} };
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

/** Puts a person back as taking part: their withdrawal is removed altogether (no empty key is left behind). The code and everything else stay. A person who did not withdraw changes nothing. */
export function unwithdraw(l: ParticipantList, id: string): ParticipantList {
  if (!l.people.some((p) => p.id === id && p.withdrawn)) return l;
  return {
    ...l,
    people: l.people.map((p) => {
      if (p.id !== id) return p;
      const { withdrawn: _gone, ...rest } = p;
      return rest;
    })
  };
}

/** The who-they-are fields (and the made-up name) that can be cleared for everyone: the ones the plan can stop recording while values are still stored (C15). The name itself is the list's key and is not among them. */
export type ClearableWho = "spellings" | "contact" | "roll" | "pseudonym";

/**
 * Clears one who-they-are field for everyone (C15 "Remove these values"): contact, roll and the made-up name are removed from each person; spellings are emptied, and so are the
 * everyday marks that were only on a spelling (a mark on the name or on one of its words stays, since those are looked for as well). Nothing else changes, and `next` never does.
 */
export function clearWho(l: ParticipantList, field: ClearableWho): ParticipantList {
  return {
    ...l,
    people: l.people.map((p) => {
      if (field === "spellings") {
        const own = new Set([normName(p.name), ...p.name.split(/\s+/).map(normName)]);
        const spelt = new Set(p.spellings.map(normName));
        return { ...p, spellings: [], everyday: p.everyday.filter((e) => own.has(normName(e)) || !spelt.has(normName(e))) };
      }
      if (!(field in p)) return p;
      const rest: Participant = { ...p };
      delete rest[field];
      return rest;
    })
  };
}

/** Clears one about-them value for everyone (C15 "Remove these values"): `key` is a menu field's id or the label the student typed. Nothing else changes. */
export function clearAbout(l: ParticipantList, key: string): ParticipantList {
  return {
    ...l,
    people: l.people.map((p) => {
      if (!p.about || !(key in p.about)) return p;
      const about = { ...p.about };
      delete about[key];
      return { ...p, about };
    })
  };
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

/**
 * A text with its decimal digits of any script written as 0 to 9 ("१६" is "16"). Decimal digits come in runs of ten from a zero (Devanagari U+0966 to U+096F), so a digit's value is
 * its distance from the start of its run of consecutive digits, modulo ten.
 */
function asciiDigits(s: string): string {
  const isDigit = (cp: number) => cp > 0 && /^\p{Nd}$/u.test(String.fromCodePoint(cp));
  return s.replace(/\p{Nd}/gu, (ch) => {
    const cp = ch.codePointAt(0)!;
    let start = cp;
    while (isDigit(start - 1)) start--;
    return String((cp - start) % 10);
  });
}

/** The age a person's `about.age` says, or null when it does not start with a number ("16", " 16 ", "16 years" and "१६" are 16). */
export function ageOf(p: Participant): number | null {
  const n = Number.parseFloat(asciiDigits(p.about?.age ?? ""));
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

/** The menu's who-they-are fields (name, spellings, contact, roll): the list's own columns, kept out of every field list below. */
const WHO_IDS: ReadonlySet<string> = new Set(RECORD_FIELDS.filter((f) => f.group === "who").map((f) => f.id));
/** The answers' fields among `fields`: the plan's record list, as it is, minus the who-they-are ids, each once. */
const aboutOnly = (fields: string[]): string[] => [...new Set(fields.filter((f) => !WHO_IDS.has(f)))];

/** The headings of the answers' fields: the labels the caller gives, by field id or the student's own label; else a menu field's id with a capital ("age" is "Age"); a label the student added as it was typed. */
export type FieldLabels = Record<string, string>;
const fieldLabel = (f: string, labels?: FieldLabels): string =>
  labels?.[f] ?? (RECORD_FIELDS.some((r) => r.id === f) ? f.charAt(0).toUpperCase() + f.slice(1) : f);

/**
 * Download the list: everything on it as v1's CSV (core's pdCsv). The first heading is `ParticipantCode`, as a key file's. `fields` are the fields the plan records (ids and the
 * student's own labels, the whole record list will do): the who-they-are ids among them are dropped, since Name, Contact and Roll are columns already. A value stored under another key
 * (the plan dropped the field since, C15) still gets its column, so nothing on the list is left out. `labels` are the headings of the answers' fields (English where it gives none).
 */
export function listCsv(l: ParticipantList, fields: string[], labels?: FieldLabels): string {
  const keys = aboutOnly(fields);
  for (const p of l.people) for (const k of Object.keys(p.about ?? {})) if (!keys.includes(k) && !WHO_IDS.has(k)) keys.push(k);
  const headers = [
    "ParticipantCode", "Name", "Other spellings", "Also an everyday word", "Joined", "How they agreed", "Under 18", "Parent's permission", "Own agreement",
    "Contact", "Roll", "Made-up name", ...keys.map((k) => fieldLabel(k, labels)), "Withdrew on", "Their data"
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
 * a spelling, contact or roll: the who-they-are ids are dropped from `aboutFields` by construction, so the plan's whole record list may be passed. `labels` are the headings of the fields
 * (English where it gives none).
 */
export function characteristicsTable(l: ParticipantList, aboutFields: string[], pseudonyms: boolean, labels?: FieldLabels): string {
  const fields = aboutOnly(aboutFields);
  const head = ["Code", ...(pseudonyms ? ["Made-up name"] : []), ...fields.map((f) => fieldLabel(f, labels))];
  const rows = l.people.map((p) => [p.code, ...(pseudonyms ? [p.pseudonym ?? ""] : []), ...fields.map((f) => p.about?.[f] ?? "")]);
  return [head, ...rows].map((r) => r.map(cell).join("\t")).join("\n");
}
