import { buildMatcher, findNames, normName, replaceFinds, suggestNames, type IdMode, type NameFind } from "@appuscholar/core";
import { emptyList, type Participant, type ParticipantList } from "@/lib/blobs/kinds/participants";
import { NAME_PLACEHOLDER } from "@/lib/tools/participants/docNames";
import { suggestionNotNames, toMatchPeople } from "@/lib/tools/participants/list";

/*
 * Names in an AI request (spec 2026-10-24-participants-design.md §8.3; calls C11 and C13; controller ruling R34). callAI asks for a NamesCtx before the personal-data check (the list, the
 * plan's mode, whether the list is locked), finds the names in the request here and, when the student answers Mask, writes them as their codes. Pure: no page, no vault, no store; how the
 * list and the plan are read is namesRead.ts, so callAI (and its tests) stay light.
 *
 * - The names on the list are matched in every request. Sure finds become the person's code (their made-up name in made-up names mode, when they have one).
 * - Suggestions (a speaker label at the start of a line, a common first name; core's suggestNames) are made only when the plan says codes or made-up names, or somebody is on the list
 *   (C13), and never for a request whose text is published papers (`literature`). They skip the words the student answered "Not a name" and the made-up names (R34).
 * - The "might be a name" words are the suggestions and the finds the list asks about (a spelling that is also an everyday word, one letter long, or shared by two people). Each is listed once;
 *   the student can Leave a word. Mask writes a suggestion as `[name]`, a listed word as the one person's code, and a word two people share as `[name]`.
 * - A name the caller has already asked about (`asked`, in normal form: Explain's step), and what is found inside the places it is written, is not found again, so nobody is asked twice about
 *   it in one request. Only the whole value: the same word elsewhere in the request is another mention and is still found (R43).
 */

/** What callAI is told of the project's names for one request. */
export type NamesCtx = {
  /** The project's participant list; null when there is none to use (no project, the vault off, a list that does not open, or locked). */
  list: ParticipantList | null;
  /** How the plan says participants are known (design_ec.idMode); null when unanswered or not read. */
  mode: IdMode | null;
  /** The vault is locked and the project has a participant list that could not be read, so names on it were not checked (R41). */
  locked: boolean;
};

/** The names found in one request's text. */
export type PromptNames = {
  /** Every find that is acted on, in text order. */
  finds: NameFind[];
  /** The people, by id, for writing their codes. */
  people: ReadonlyMap<string, Participant>;
  /** Whether made-up names are written in place of codes. */
  pseudonyms: boolean;
  /** How many names on the list were found (the sure finds, every place counted). */
  listed: number;
  /** Each word that might be a name, once (compared in normal form), as it was first written. */
  maybe: string[];
  /** The names in normal form, for the request's signature: the listed ones and the might-be ones, each once. */
  sig: string;
  /** Which checks ran on this request, for the dialog's sentence (R54b): the list had somebody on it to look for, and common first names were suggested (not for a literature request, and only when C13 says so). */
  checked: NamesChecked;
};
/** What the names check ran on a request. */
export type NamesChecked = { list: boolean; firstNames: boolean };

const byStart = (a: NameFind, b: NameFind) => a.start - b.start;

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/**
 * The places in `text` where one of the names already asked about is written: any case, a dot or white space between its words, curly or straight apostrophes (the matcher's normal form).
 * Explain's step asks about a group label as the table has it ("Sara Khan"); the first name that suggestions find inside that place is the same name, asked about once. Only these places:
 * the same word somewhere else in the request is another mention (it may be another person's), and is still found.
 */
function askedPlaces(text: string, asked: readonly string[]): Array<[number, number]> {
  const places: Array<[number, number]> = [];
  for (const a of asked) {
    const words = normName(a).split(" ").filter(Boolean);
    if (!words.length) continue;
    const word = (w: string) => escapeRe(w).replace(/'/g, "['\u2018\u2019\u02bc]");
    const re = new RegExp(String.raw`(?<![\p{L}\p{N}\p{M}])` + words.map(word).join(String.raw`[\s.]+`) + String.raw`(?![\p{L}\p{N}\p{M}])`, "giu");
    for (const m of text.matchAll(re)) places.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
  }
  return places;
}

/** The names of `text`, by `ctx` (a locked list has none to find: nothing is read of it). `asked`: names already asked about, in normal form. */
export function scanNames(text: string, ctx: Pick<NamesCtx, "list" | "mode">, opts: { literature: boolean; asked: readonly string[] }): PromptNames {
  const list = ctx.list && !ctx.list.destroyedAt ? ctx.list : null;
  const base = list ?? emptyList();
  const pseudonyms = ctx.mode === "pseudonyms";
  const matcher = buildMatcher(toMatchPeople(base, pseudonyms));
  // Asked about already: the whole value (compared in normal form), or a find inside one of its places in this text.
  const asked = new Set(opts.asked.map(normName));
  const places = askedPlaces(text, opts.asked);
  const fresh = (f: NameFind) => !asked.has(normName(f.text)) && !places.some(([from, to]) => f.start >= from && f.end <= to);
  const listedFinds = findNames(text, matcher).filter(fresh);
  const suggest = !opts.literature && (ctx.mode === "codes" || ctx.mode === "pseudonyms" || base.people.length > 0);
  const suggestions = suggest ? suggestNames(text, matcher, suggestionNotNames(base), { speakerLabels: true, firstNames: true }).filter(fresh) : [];
  const finds = [...listedFinds, ...suggestions].sort(byStart);

  const seen = new Set<string>();
  const maybe: string[] = [];
  for (const f of finds) {
    if (f.kind === "sure") continue;
    const key = normName(f.text);
    if (!seen.has(key)) { seen.add(key); maybe.push(f.text); }
  }
  const sureKeys = [...new Set(finds.filter((f) => f.kind === "sure").map((f) => normName(f.text)))].sort();
  const maybeKeys = [...seen].sort();
  const sig = [sureKeys.length ? "names:" + sureKeys.join("|") : "", maybeKeys.length ? "maybe:" + maybeKeys.join("|") : ""].filter(Boolean).join("||");
  return {
    finds, people: new Map(base.people.map((p) => [p.id, p])), pseudonyms, listed: finds.filter((f) => f.kind === "sure").length, maybe, sig,
    checked: { list: list !== null && list.people.length > 0, firstNames: suggest }
  };
}

/** What stands in for a person: their made-up name in made-up names mode when they have one, else their code. */
const stand = (p: Participant, pseudonyms: boolean): string => (pseudonyms && p.pseudonym?.trim()) || p.code;

/**
 * `text` with the names written as Mask does: sure finds as the person's code (or made-up name), a listed word the list asks about as the one person's code, a word two people share
 * and a suggestion as `[name]`. `leave` are the might-be words the student left (compared in normal form); they stay as written.
 */
export function maskNames(text: string, names: PromptNames, leave: readonly string[]): string {
  const left = new Set(leave.map(normName));
  const person = (f: NameFind) => (f.personIds.length === 1 ? names.people.get(f.personIds[0]!) : undefined);
  return replaceFinds(text, names.finds, (f) => {
    if (f.kind !== "sure" && left.has(normName(f.text))) return null;
    const p = f.kind === "suggest" ? undefined : person(f);
    return p ? stand(p, names.pseudonyms) : NAME_PLACEHOLDER;
  });
}
