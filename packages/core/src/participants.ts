import { EVERYDAY_NAMES } from "./data/names-everyday";
import { FIRST_NAME_LIST } from "./data/names-first";

/*
 * The participant name matcher (spec 2026-10-24 §7; new in v2, so there is no v1 text and no golden). A pure engine: build a matcher from the participant list, find the names
 * on the list in a string, suggest names that are not on it, and replace finds with their surroundings kept. The web decides what to do with the finds (codes, made-up names,
 * highlights, the "ask" dialogs); nothing here knows about the page, the vault or the project.
 *
 * What is looked for: each person's name and each of their spellings, and nothing else (C2), so a surname alone is not looked for unless it is listed. Withdrawn people are
 * still looked for; a destroyed list is an empty list, which looks for nothing.
 * Normal form (normName): Unicode NFC, lower case, a dot counts as a space ("R.K. Sharma" is "R. K. Sharma", but "RK Sharma" is not), runs of white space are one space,
 * curly and straight apostrophes are the same, trimmed. Lower-casing is not locale-sensitive (toLowerCase, not toLocaleLowerCase), so a Turkish default locale does not turn
 * "PRIYA" into "prıya".
 * Whole words: a find may not have a letter, digit or combining mark right before or after it, so "Priya's" and "Priya-ji" match and "Priyanka" does not; Devanagari vowel
 * signs, the anusvara and the virama are marks, so a name that ends in a vowel sign is found before a space and not inside a longer name that goes on with another mark.
 * At any start index the longest matching spelling wins, finds never overlap, and scanning goes on after the end of a find.
 * Sure, ask: a find is sure unless it is one of these, which are asked about, never replaced in bulk: the spelling belongs to two or more people (all their ids are offered);
 * the spelling is one letter long ("short"); or the person marked the spelling as also an everyday word in their own `everyday` list. An everyday or a one-letter spelling is
 * found only when written with a capital first letter (C12; a script with no capitals counts as capital), so a spelling "A" is never the article "a". That order is also the order of `why`: shared, then short, then everyday. The built-in
 * EVERYDAY_NAMES do not make a find ask (ruling R6): they are the default the Add form pre-ticks, and isEverydayName reports them. A spelling with no letter in it is not looked for
 * ("2019" would match everywhere), and a one-letter spelling is never the s of "Priya's".
 * How it runs: the text is folded to a copy in which the case, the dots and the apostrophes are the normal form's and nothing else has moved; one compiled regular expression
 * over every spelling, longest first, runs over the copy, and a space inside a spelling matches any run of horizontal white space (never a line break, R5: "Priya" at the end of a paragraph is not the start of "Priya Sharma"), which stands in for collapsing it. Positions in a
 * find are in the ORIGINAL text. The copy is the same length as the original unless the text is not in NFC or a capital changes length in lower case (a dotted capital I does),
 * and then a position map is built cluster by cluster (a base character and its marks), which is also why the cases of a composed and a decomposed spelling agree.
 * Suggestions: a speaker label at the start of a line, and a capitalised word on FIRST_NAMES (§7.5, C3); never a Devanagari word, another capitalised word or a surname.
 */

export { EVERYDAY_NAMES };

/** The built-in common given names (Latin script, lower case) behind the "might be a name" suggestions. None of them is in EVERYDAY_NAMES. */
export const FIRST_NAMES: ReadonlySet<string> = new Set(FIRST_NAME_LIST);

/** What the matcher needs of a person; the web's `Participant` has more. */
export type MatchPerson = {
  id: string;
  code: string;
  name: string;
  spellings: string[];
  /** The spellings (or the name) the student marked as also an everyday word. */
  everyday: string[];
  pseudonym?: string;
  withdrawn?: { on: string; data: "remove" | "keep" };
};

/**
 * One place in a text. `start` and `end` are code-unit positions in the text that was searched and `text` is `slice(start, end)` of it. `personIds` are the people on the list
 * the find belongs to (empty for a suggestion). A sure find is replaced without asking, an ask find is answered one by one, a suggestion is a name that is not on the list.
 * `why` says why an ask find is asked (shared by several people, one letter long, or marked everyday by the person) or where a suggestion came from.
 */
export type NameFind = {
  start: number;
  end: number;
  text: string;
  personIds: string[];
  kind: "sure" | "ask" | "suggest";
  why?: "everyday" | "shared" | "short" | "speaker" | "first-name";
};

type Spelling = { personIds: string[]; everyday: boolean; short: boolean };
type Compiled = { re: RegExp | null; spellings: Map<string, Spelling> };
const COMPILED = Symbol("compiled matcher");

/** A matcher for one list of people: build it once with buildMatcher and use it for many texts. The compiled state is private to this file and is not data: it does not survive JSON or structuredClone, so build the matcher where it is used. */
export type Matcher = { people: MatchPerson[]; [COMPILED]: Compiled };

/** The code for the nth participant: P001, P042, P1000. */
export function codeOf(n: number): string {
  return "P" + String(n).padStart(3, "0");
}

const APOSTROPHES = /[\u2018\u2019\u02bc]/g;
const EVERYDAY_SET: ReadonlySet<string> = new Set(EVERYDAY_NAMES);

/** Case, dots and apostrophes of the normal form; keeps the length of its input except where lower-casing changes it (and never collapses white space). */
function foldCase(s: string): string {
  return s.toLowerCase().replace(APOSTROPHES, "'").replace(/\./g, " ");
}

/** The normal form of a name or spelling (see the file's note): what two spellings are compared by. */
export function normName(s: string): string {
  return foldCase(s.normalize("NFC")).replace(/\s+/g, " ").trim();
}

/** Whether a word is on the built-in list of given names that are also everyday words (any case, any spacing): what the Add form pre-ticks. The matcher itself uses only the person's own `everyday` list. */
export function isEverydayName(word: string): boolean {
  return EVERYDAY_SET.has(normName(word));
}

/** A spelling that is one letter (with its marks). */
const ONE_LETTER = /^\p{L}\p{M}*$/u;
const NOT_WORD = String.raw`\p{L}\p{N}\p{M}`;
const WORD_START = `(?<![${NOT_WORD}])`;
const WORD_END = `(?![${NOT_WORD}])`;

/** White space that is not a line break. */
const HSPACE = String.raw`[^\S\r\n\u2028\u2029]`;

/** A normalised spelling as regular expression source: its characters literally, each space as any run of horizontal white space. */
function spellingSource(key: string): string {
  return key.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&").replace(/ /g, `${HSPACE}+`);
}

/** Compiles the people into a matcher. Cheap enough to rebuild when the list changes. */
export function buildMatcher(people: MatchPerson[]): Matcher {
  const spellings = new Map<string, Spelling>();
  for (const p of people) {
    const everyday = new Set(p.everyday.map(normName));
    for (const key of new Set([p.name, ...p.spellings].map(normName))) {
      if (!/\p{L}/u.test(key)) continue;
      let s = spellings.get(key);
      if (!s) spellings.set(key, (s = { personIds: [], everyday: false, short: ONE_LETTER.test(key) }));
      s.personIds.push(p.id);
      s.everyday ||= everyday.has(key);
    }
  }
  // Longest first: the first alternative that matches at a position is then the longest one that does.
  const keys = [...spellings.keys()].sort((a, b) => b.length - a.length);
  const re = keys.length ? new RegExp(`${WORD_START}(?:${keys.map(spellingSource).join("|")})${WORD_END}`, "gu") : null;
  return { people, [COMPILED]: { re, spellings } };
}

/** A base character with the combining marks that follow it, or a run of marks with no base (so the pieces cover the whole text). */
const CLUSTER = /\P{M}\p{M}*|\p{M}+/gu;

/** The text folded for matching, and, only when positions moved, where each folded position came from in the original (with the original's length at the end). */
function fold(text: string): { folded: string; origin: Int32Array | null } {
  const nfc = text.normalize("NFC");
  const folded = foldCase(nfc);
  if (nfc === text && folded.length === text.length) return { folded, origin: null };
  const parts: string[] = [];
  const origin: number[] = [];
  for (const c of text.matchAll(CLUSTER)) {
    const piece = foldCase(c[0].normalize("NFC"));
    parts.push(piece);
    for (let i = 0; i < piece.length; i++) origin.push(c.index ?? 0);
  }
  origin.push(text.length);
  return { folded: parts.join(""), origin: Int32Array.from(origin) };
}

/** True when the character at `i` is not a lower-case letter: a capital, or a character of a script with no case (Devanagari). */
function notLowerCase(text: string, i: number): boolean {
  const ch = String.fromCodePoint(text.codePointAt(i) ?? 0);
  return ch === ch.toUpperCase();
}

/**
 * The sure and ask finds of the people on the list in `text`, in text order, never overlapping. A spelling the person marked everyday, or a spelling of one letter, is found only when it starts with a capital;
 * when it does not, the scan goes on one character later, so a later word inside the same candidate can still be found.
 */
export function findNames(text: string, m: Matcher): NameFind[] {
  const { re, spellings } = m[COMPILED];
  const finds: NameFind[] = [];
  if (!re || !text) return finds;
  const { folded, origin } = fold(text);
  const at = origin ? (i: number) => origin[i] ?? text.length : (i: number) => i;
  re.lastIndex = 0;
  for (let hit = re.exec(folded); hit; hit = re.exec(folded)) {
    const sp = spellings.get(hit[0].replace(/\s+/g, " "));
    const start = at(hit.index);
    // Rejected: unknown (cannot happen); an everyday or one-letter spelling that does not start with a capital; or a one-letter spelling right after an apostrophe (the s of "Priya's").
    if (!sp || ((sp.everyday || sp.short) && !notLowerCase(text, start)) || (sp.short && folded[hit.index - 1] === "'")) {
      const first = folded.charCodeAt(hit.index);
      re.lastIndex = hit.index + (first >= 0xd800 && first <= 0xdbff ? 2 : 1);
      continue;
    }
    const end = at(hit.index + hit[0].length);
    const shared = sp.personIds.length > 1;
    const find: NameFind = { start, end, text: text.slice(start, end), personIds: [...sp.personIds], kind: shared || sp.short || sp.everyday ? "ask" : "sure" };
    if (shared) find.why = "shared";
    else if (sp.short) find.why = "short";
    else if (sp.everyday) find.why = "everyday";
    finds.push(find);
  }
  return finds;
}

const SPEAKER_WORDS: ReadonlySet<string> = new Set(["interviewer", "interviewee", "researcher", "moderator", "participant", "respondent", "i", "r", "t", "s", "q", "a"]);
const NAME_WORD = String.raw`\p{Lu}[\p{L}\p{M}'\u2019-]*`;
/** One to three capitalised words at the start of a line, then a colon. Words hold no digits, so a code such as "P001:" never makes a label. */
const SPEAKER_LABEL = new RegExp(`^${HSPACE}*(${NAME_WORD}(?:${HSPACE}+${NAME_WORD}){0,2})${HSPACE}*:`, "gmu");
/** A capitalised word, whole. */
const CAPITAL_WORD = new RegExp(`${WORD_START}\\p{Lu}[\\p{L}\\p{M}]*${WORD_END}`, "gu");

/** The look-up form of a name for FIRST_NAMES and notNames: the normal form with accents removed ("José" is "jose"). */
const plainName = (s: string) => normName(s).normalize("NFD").replace(/\p{M}/gu, "");

/**
 * Names that are not on the list, as `kind: "suggest"` finds in text order (spec §7.5). With `speakerLabels`, a speaker label at the start of a line: one to three capitalised
 * words before a colon, and the find is those words (no colon, no leading space) without any role words at the front (Interviewer, Interviewee, Researcher, Moderator,
 * Participant, Respondent, I, R, T, S, Q, A): "Interviewer Meena:" is the suggestion "Meena", a label of role words only is skipped, and a role word that is not at the
 * front stays ("Dr A Kumar:" is "Dr A Kumar"). A code such as "P001:" never makes a label (label words hold no digits). With
 * `firstNames`, a capitalised Latin-script word on FIRST_NAMES, not one written all in capitals ("Ram", not "RAM"). Skipped: a span that overlaps a find of findNames, a span the
 * student said is not a name (`notNames`, compared as FIRST_NAMES is, in normal form with accents removed, so "Jose" also silences "José"), and a word inside a speaker label that
 * is already suggested. Suggestions never overlap each other or the finds, so both can be painted and replaced together.
 */
export function suggestNames(text: string, m: Matcher, notNames: string[], opts: { speakerLabels: boolean; firstNames: boolean }): NameFind[] {
  if (!text || (!opts.speakerLabels && !opts.firstNames)) return [];
  const notName = new Set(notNames.map(plainName));
  const candidates: NameFind[] = [];
  const add = (start: number, end: number, why: "speaker" | "first-name") => {
    const found = text.slice(start, end);
    if (!notName.has(plainName(found))) candidates.push({ start, end, text: found, personIds: [], kind: "suggest", why });
  };
  if (opts.speakerLabels) {
    for (const hit of text.matchAll(SPEAKER_LABEL)) {
      const label = hit[1] ?? "";
      // Role words at the front are not part of the name ("Interviewer Meena:" is Meena); a label of role words only is no name at all.
      const words = [...label.matchAll(/\S+/g)];
      const first = words.findIndex((w) => !SPEAKER_WORDS.has(normName(w[0])));
      if (first < 0) continue;
      const labelStart = (hit.index ?? 0) + hit[0].indexOf(label);
      add(labelStart + (words[first]?.index ?? 0), labelStart + label.length, "speaker");
    }
  }
  if (opts.firstNames) {
    for (const hit of text.matchAll(CAPITAL_WORD)) {
      const word = hit[0];
      if (word.length > 1 && word === word.toUpperCase()) continue;
      if (FIRST_NAMES.has(plainName(word))) add(hit.index ?? 0, (hit.index ?? 0) + word.length, "first-name");
    }
  }
  // Text order; at one start the longer span first, so a whole speaker label wins over the first name at its front.
  candidates.sort((a, b) => a.start - b.start || b.end - a.end);
  const finds = findNames(text, m);
  const kept: NameFind[] = [];
  let f = 0;
  let lastEnd = 0;
  for (const c of candidates) {
    while (f < finds.length && (finds[f]?.end ?? 0) <= c.start) f++;
    const clash = finds[f];
    if (c.start < lastEnd || (clash && clash.start < c.end)) continue;
    kept.push(c);
    lastEnd = c.end;
  }
  return kept;
}

/**
 * `text` with each find replaced by what `to` returns for it, or kept as it is when `to` returns null; the text between finds is untouched ("Priya's" becomes "P001's").
 * Finds are taken in text order from any list (findNames and suggestNames results can be joined); one that overlaps an earlier find is left alone.
 */
export function replaceFinds(text: string, finds: NameFind[], to: (f: NameFind) => string | null): string {
  let out = "";
  let at = 0;
  for (const f of [...finds].sort((a, b) => a.start - b.start)) {
    if (f.start < at) continue;
    out += text.slice(at, f.start) + (to(f) ?? text.slice(f.start, f.end));
    at = f.end;
  }
  return out + text.slice(at);
}
