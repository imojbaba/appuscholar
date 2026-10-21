import { createHash } from "node:crypto";
import type { Engine } from "../harness/engines";
import { emitTables, writeFixture } from "../harness/fixture";
import { promptRecorder, FIELDS } from "../harness/prompt-record";
import type { PromptCase } from "../harness/prompt-record";
import type { V1 } from "../harness/v1";

/**
 * Task D3's Words and grammar engine (v1 index.html 6570-6820: the dictionary lookup dictNorm/dictFetch/dictAI 6574-6640, the word bank 6642-6660, the grammar rules GR_NOUNS/GR_RULES/GR_UK_US/GR_IZE
 * 6671-6690, gramSpellStd/gramSpellSet/gramSpellRules 6692-6709, gramLocal 6710-6727, gramVerifyAI 6728-6741, gramRunLocal/gramStat 6743-6750, gramRunAI 6751-6785, gramTop 6798-6800). Page-bound: v1 keeps
 * its state in localStorage (`appu_spell`, `appu_gram_stats`, `appu_wordbank`, `appu_dict_cache`, `appu_field`) and in the objects GRAM and DICT. Per case localStorage and those objects are set as a
 * student's saves would leave them and v1's own function is called; nothing is typed by hand. The inputs (the texts, the AI replies, the dictionary payloads, the banks) are written here or made by a
 * seeded generator; every expected value is what v1 returned.
 *
 * - `rules.json`: the id, kind, rule, why, ex, pattern source and flags of every GR_RULES entry, and of the two rules gramSpellRules makes under "uk" and "us" (the `fix` functions are compared by what they
 *   do, through the texts below). `tables.json` (and, under --emit, src/data/words-tables.ts): GR_NOUNS, GR_UK_US, GR_IZE.
 * - `local`: gramLocal(text) for the corpus (the example of each rule as v1 has it, variants of every rule, the exceptions of the two article rules, quotations, overlaps, the 60,000-character cut, odd
 *   inputs), under "uk", "us", "off" and with nothing stored; `std`: gramSpellStd for stored values and gramSpellSet; `stats`: gramStat and gramTop on stored counts.
 * - `chunks`: for texts of 29 to 12,000 characters and for cuts placed at 599 to 1,800, the chunks gramRunAI sends (their lengths, read back from the prompts it hands callAI), with the guards at which
 *   gramRunLocal (10 characters) and gramRunAI (30) go on.
 * - `verify`: gramVerifyAI over mixed good and bad edit arrays. `flows`: gramRunAI with callAI replaced by replies chosen here (good, bad, fenced, unreadable, failing): GRAM.items, checked, parts, dropped
 *   and the stored counts.
 * - `prompts`: gramRunAI driven with callAI replaced by a recorder under three values of appu_field and the four spelling settings; dictAI likewise; with the aiuClassify label v1 gives each.
 * - `dict`: dictNorm, dictFetch with fetch replaced by canned dictionaryapi.dev payloads (the result and what went into the cache), dictAI's reading of replies, dictCachePut at the 200-entry cut.
 * - `bank`: bankAdd (the record, the refusals, the 500 cut), bankRemove, bankCsv (through a recorded pdDownload).
 */

export type Hit = { src: string; id: string; kind: string; rule: string; why: string; ex: string[] | null; start?: number; end?: number; original: string; fix: string | null };
type TextCase = { id: string; note: string; text?: string | null; pad?: { char: string; count: number }; tail?: string };
/** A hit of a rule as stored: kind, rule, why and ex are the rule's own (rules.json, the spelling rules under the standard in force), so they are checked there and left out here. */
export type RuleHit = { id: string; start: number; end: number; original: string; fix: string | null };
export type StoredHit = RuleHit | Hit;
type LocalCase = TextCase & { out: Record<"uk" | "us" | "off", RuleHit[]> };
type StdCase = { stored: string | null; std: string; set: string };
type StatCase = { stored: Record<string, number> | null; items: Array<{ src: string; id: string }>; after: Record<string, number>; top: Array<[string, number]> };
type ChunkCase = { id: string; note: string; text: string; calls: number; lens: number[]; opts: Array<Record<string, unknown>>; sha: string[] };
type VerifyCase = { id: string; text: string; edits: unknown; out: { ok: Hit[]; dropped: number } };
type FlowCase = {
  id: string; note: string; textId: string; std: string | null; replies: Array<string | { throws: true }>; calls: number; sha: string[];
  items: StoredHit[]; checked: number; parts: number; dropped: number; stats: Record<string, number>;
};
type PromptRow = PromptCase & { inputs: Record<string, unknown> };
type DictCase = { id: string; word: string; status: number; payload: unknown; url: string; out: unknown; cached: unknown };
type DictAiCase = { id: string; word: string; reply: string; out: unknown };
type BankEntry = { w: string; pos: string; m: string; h: string; d: string };
type BankSummary = { len: number; entries: BankEntry[] };
type AddCase = { id: string; bank: BankEntry[] | { gen: number }; cur: unknown; ai: unknown; after: BankSummary; added: boolean; dateOk: boolean };

export type WordsFx = {
  local: LocalCase[];
  std: StdCase[];
  stats: StatCase[];
  guards: { local: { refused: number; accepted: number; paddedRefused: boolean }; ai: { refused: number; accepted: number; paddedRefused: boolean } };
  chunks: ChunkCase[];
  verify: VerifyCase[];
  flowTexts: Record<string, string>;
  flows: FlowCase[];
  prompts: PromptRow[];
  dict: { norm: Array<{ typed: unknown; out: string }>; fetch: DictCase[]; ai: DictAiCase[]; cache: Array<{ n: number; word: string; after: string[]; value: unknown }> };
  bank: { add: AddCase[]; remove: Array<{ bank: BankEntry[]; w: string; after: BankEntry[] }>; csv: Array<{ bank: BankEntry[]; name: string | null; text: string | null }> };
};

/* ---- the texts: written by hand or made by a seeded generator; v1 reads them, nothing here is a measurement ---- */

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const SENTENCES = [
  "The participants answered all of the questions about their sleep.",
  "Results were collected over two terms and checked by hand.",
  "We discussed about the findings with the supervisor.",
  "Many students said the library was open late.",
  "It helped alot in the second term.",
  "The informations were stored in a locked cabinet.",
  "Each answer was coded by two readers, and a third settled the doubts.",
  "A small group met every Friday to read the notes aloud.",
  "The tables show how the scores changed from the first week to the last.",
  "She has worked in the lab since three years.",
  "Nobody expected the survey to take so long.",
  "The sample was drawn from four colleges in the city.",
  "They could not cope up with the work at first.",
  "Care was taken that no name appeared in the report.",
];

/** Sentences joined by single spaces until `chars` characters, cut there (so the text may end inside a sentence). */
function sentences(seed: number, chars: number): string {
  const r = lcg(seed);
  let s = "";
  while (s.length < chars) s += (s ? " " : "") + SENTENCES[Math.floor(r() * SENTENCES.length)]!;
  return s.slice(0, chars);
}

const WORDS = ["school", "water", "group", "report", "table", "reading", "student", "morning", "result", "season", "paper", "number", "garden", "answer", "friend", "market", "island", "window", "teacher", "supper"];

/** Words and no full stop at all, `chars` long, ending on a letter; a ". " is put in at index `at` when it is given. */
function plainWords(seed: number, chars: number, at?: number): string {
  const r = lcg(seed);
  let s = "";
  while (s.length < chars + 8) s += (s ? " " : "") + WORDS[Math.floor(r() * WORDS.length)]!;
  s = s.slice(0, chars).replace(/ $/, "x");
  if (at !== undefined) s = s.slice(0, at) + ". " + s.slice(at + 2);
  return s;
}

/* ---- the corpus of gramLocal ---- */

const HAND: Array<{ id: string; note: string; text: string }> = [
  { id: "discuss", note: "discuss-about, in three forms", text: "We discussed about the results. She discusses about methods, and they are discussing about it. Discuss about this." },
  { id: "return-revert", note: "return-back and revert-back", text: "He returned back home. They return back often. Please revert back soon. We reverted back yesterday. Reverting back is rude. Reverts back." },
  { id: "uncountable", note: "uncountable: every noun, capitals", text: "The informations were useful. Informations and equipments, advices, furnitures, luggages, baggages, feedbacks, knowledges, evidences, staffs, stationeries. Equipments matter." },
  { id: "cope", note: "cope-up", text: "He could not cope up with stress. She copes up with it. They are coping up with work. They coped up with it." },
  { id: "stative", note: "stative-progressive (no fix)", text: "I am knowing the answer. They were understanding it. She is wanting more. He was owning a house. We are hating it. You are liking it, and I am needing it. They are believing." },
  { id: "comparatives", note: "more-better", text: "This is more better. The most easier way. more worse, most best, more simpler, most cheaper, More bigger, most worst." },
  { id: "since", note: "since-period: lengths and points", text: "I have studied since two years. Since 5 months, since a few weeks, since several days, since many hours. But since 2019 and since Monday are fine." },
  { id: "able", note: "can-able and will-able", text: "She can able to finish. They could able to go. We will able to start. It might able to work. You must able to see. They should able to read. May able to." },
  { id: "its", note: "its-apostrophe", text: "The study and its' limits. Its’ end is near. It's fine, and so are its limits and its own aims.\nA tail its'" },
  { id: "modal-of", note: "modal-of", text: "It should of worked. We could of gone, would of, might of, must of. Should have is right." },
  { id: "run-together", note: "run-together, with capitals", text: "It helped alot. Eventhough it rained, infact atleast inspite of aswell. Alot of it. Infact. A lot is right." },
  { id: "agree", note: "agree-he-dont and agree-they-doesnt", text: "She don't agree. He don’t know. It don't work. They doesn't agree. We doesn’t care. I doesn't. You doesn't. HE DON'T." },
  { id: "there", note: "there-is-plural", text: "There is many reasons. There is several. There is two. there is five, There is numerous." },
  { id: "article-a", note: "article-a: before a vowel, and its exceptions", text: "a important result. A unique idea. a university. a European study. a UFO. a hour. A apple. a MBA. a one-time job. a usual day. a ubiquitous tool. a useful one. a uk visit. a x. a elephant." },
  { id: "article-an", note: "article-an: before a consonant, and its exceptions", text: "an study. An student. an hour. an honest man. an MBA. an SMS. an x-ray. an xray. an FBI agent. an user. an herb. an honour. an heir. an Honour. an big one. An Zebra." },
  { id: "doubled", note: "doubled-word and its exceptions", text: "the the results. had had a go. that that is. is is. Do do. can can. was was. The The. very very good.\nthe\tthe. the\nthe." },
  { id: "space-before", note: "space-before-punct", text: "results , which. results ; and. results : x. what ! why ? ok .\nlast ." },
  { id: "space-after", note: "space-after-comma", text: "results,which. a,b. 1,2. x,Y, and Z,z. 3,four." },
  { id: "regional", note: "prepone, do-needful, enjoy-to", text: "We preponed the test. They prepone it. Preponing, prepones. Please do the needful. He does the needful. Doing the needful. I enjoy to read. She enjoys to swim. They enjoyed to dance." },
  { id: "spell-words", note: "spelling variants: every pair, both directions, three capitals", text: "colour colours coloured behaviour behaviours behavioural favour favourite honour labour neighbour neighbourhood centre centres centred fibre theatre defence offence analyse analysed analysing analyser grey ageing modelling modelled labelled travelled counselling counsellor sceptic sceptical paediatric enrolment fulfil. Colour. COLOUR. Centre. " },
  { id: "spell-us", note: "the American spellings", text: "color colors colored behavior behaviors behavioral favor favorite honor labor neighbor neighborhood center centers centered fiber theater defense offense analyze analyzed analyzing analyzer gray aging modeling modeled labeled traveled counseling counselor skeptic skeptical pediatric enrollment fulfill. Color. COLOR. Center." },
  { id: "ize", note: "-ise and -ize, every stem, endings and capitals", text: "organise realise recognise summarise emphasise criticise minimise maximise utilise categorise prioritise generalise standardise authorise apologise specialise normalise hypothesise conceptualise operationalise randomise characterise memorise familiarise socialise individualise visualise optimise mobilise centralise finalise initialise legalise harmonise synchronise. organisation organisations organiser organisers organised organising organises. ORGANISE. Organise. organise." },
  { id: "ize-us", note: "the -ize forms", text: "organize realize recognize summarize emphasize criticize minimize maximize utilize categorize prioritize generalize standardize authorize apologize specialize normalize hypothesize conceptualize operationalize randomize characterize memorize familiarize socialize individualize visualize optimize mobilize centralize finalize initialize legalize harmonize synchronize. organization organizations organizer organizers organized organizing organizes. ORGANIZE. Organize." },
  { id: "article-more", note: "more beginnings of the article exceptions", text: "a utility bill. a once-only offer. a ural range. a ukulele. a ushabti. a ubiquity. an honor. an Hour. a eulogy. a Unit. a U-turn. an Utter mess. a OK sign. a 5 star." },
  { id: "quote-limits", note: "a quotation of 400 characters shields what is in it, one of 401 does not; so does one of 3, not one of 2", text: `One "alot ${"y".repeat(395)}" two. Then "alot ${"y".repeat(396)}" three. A "a a" quote and a "a" one. And “alot ${"z".repeat(395)}” curly.` },
  { id: "ize-not", note: "-ise words that are not in the list stay alone", text: "We advertise, exercise, rise, surprise, promise, otherwise, wise and franchise. Also the organs and the realm." },
  { id: "quotes", note: "a rule inside quotation marks is left alone", text: 'He wrote "we discussed about it alot" in the note. She said “the the results , which” were odd. A short "a b" quote. We discussed about it outside. An unclosed “quote and alot more. Then ”stray” marks. “x”alot.' },
  { id: "overlap-same-start", note: "two rules from the same place: the longer wins, a tie goes to the earlier rule", text: "It was a a important point. We saw the the results. more more better ideas. discuss about about it." },
  { id: "overlap-same-start-longer", note: "same start, different ends: the longer is kept and the shorter dropped, whichever rule comes first", text: "We should organize organize the data, and the organise organise plan. A colour colour chart and a color color chart." },
  { id: "overlap-inner", note: "a rule that starts inside the previous one is dropped", text: "an study study of cope up with up with. since two years years ago." },
  { id: "mixed", note: "a paragraph with a dozen mistakes", text: "In the first term we discussed about the results of the survey. The informations was useful, but the sample was small , and the the findings could of been better. There is many reasons why a important study of colour and behaviour should be repeated, infact atleast once.\nThe students returned back to the lab and organised the data. I am knowing that she don't agree." },
  { id: "clean", note: "a paragraph with nothing to find", text: "Many students believe that studying late into the night helps them remember more, but the evidence points the other way. Sleep gives the brain time to sort what it has learned. A student who sleeps well before an examination usually recalls facts faster. Smith (2019) found this over 120 students since 2018." },
  { id: "short", note: "three characters", text: "a b" },
  { id: "empty", note: "an empty text", text: "" },
  { id: "spaces", note: "white space only", text: "   \n\t  " },
  { id: "tabs-crlf", note: "tabs and a Windows line end", text: "results \t, which\r\nthe\tthe results.\r\n" },
  { id: "hindi", note: "Hindi and English mixed", text: "विद्यार्थी अक्सर सोचते हैं कि रात भर पढ़ने से अधिक अंक मिलते हैं। We discussed about it alot. परंतु नींद आवश्यक है।" },
  { id: "curly", note: "curly apostrophes in don’t, its’ and Should’ve", text: "She don’t agree. They doesn’t care. The study and its’ end. It should of worked." },
];

const LOCAL_CASES: TextCase[] = [
  ...HAND,
  { id: "null", note: "null, which v1 makes an empty text", text: null },
  { id: "cut-hit-before", note: "60,000 characters are read: a mistake that ends at the 60,000th is found", pad: { char: "x", count: 59985 }, tail: " it helped alot." },
  { id: "cut-hit-after", note: "60,000 characters are read: a mistake cut by it is not", pad: { char: "x", count: 59986 }, tail: " it helped alot." },
  { id: "cut-hit-beyond", note: "a text well over the cut, with a mistake only after it", pad: { char: "x", count: 62000 }, tail: " the the results." },
];

const textOf = (c: TextCase): string | null => (c.pad ? c.pad.char.repeat(c.pad.count) + (c.tail ?? "") : (c.text ?? null));

/* ---- gramVerifyAI ---- */

const VERIFY_TEXTS: Array<{ id: string; text: string }> = [
  { id: "t1", text: 'Dr Rao studied a sample of 120 students (Smith, 2019) and said "the results were clear" after we discussed about the results.\nThe  results were clear to all who read them, and the 45% rise was kept.' },
  { id: "t3", text: "abc def and abc again." },
  { id: "t2", text: "A short text with   extra   spaces and a line\nbreak inside it. We discussed about the findings." },
];

const LONG_RULE = "r".repeat(100);
const LONG_WHY = "w".repeat(300);

const VERIFY_EDITS: Array<{ id: string; textId: string; edits: unknown }> = [
  {
    id: "mixed",
    textId: "t1",
    edits: [
      { original: "discussed about the results", fix: "discussed the results", rule: "Discuss", why: "No about.", kind: "error" },
      { original: "never in the text", fix: "something else here", rule: "x", why: "y", kind: "error" },
      { original: "ab", fix: "abc" },
      { original: "the results were clear", fix: "the results were clear" },
      { original: "studied a sample", fix: "studied a sample of the whole country and all of its many districts and towns and villages" },
      { original: "a sample of 120 students", fix: "a sample of 210 students" },
      { original: "a sample of 120 students", fix: "a sample of 120 pupils", rule: "Word", why: "Plainer.", kind: "style" },
      { original: "(Smith, 2019) and said", fix: "(Smith, 2018) and said" },
      { original: 'said "the results were clear" after', fix: 'said "the results were plain" after' },
      { original: "the 45% rise was kept", fix: "the 45% rise was kept up", kind: "regional" },
      { original: "the 45% rise", fix: "the 54% rise" },
    ],
  },
  {
    id: "kinds-and-labels",
    textId: "t1",
    edits: [
      { original: "Dr Rao studied", fix: "Dr Rao had studied", kind: "weird" },
      { original: "Dr Rao studied", fix: "Dr Rao has studied", kind: "regional", rule: LONG_RULE, why: LONG_WHY },
      { original: "Dr Rao studied", fix: "Dr Rao did study" },
      { original: "Dr Rao studied", fix: "Dr Rao will study", kind: "style", rule: "", why: "" },
      { original: "Dr Rao studied", fix: "Dr Rao would study", kind: 5, rule: 7, why: null },
      { original: "  Dr   Rao\nstudied ", fix: " Dr  Rao  was studying ", rule: "  spaced   rule ", why: "  spaced\n why " },
    ],
  },
  {
    id: "spaces-in-the-text",
    textId: "t2",
    edits: [
      { original: "extra extra spaces", fix: "spaces" },
      { original: "with extra spaces and", fix: "with some spaces and", kind: "style" },
      { original: "a line break inside it", fix: "a line break within it" },
      { original: "We discussed about the findings", fix: "We discussed the findings" },
    ],
  },
  { id: "junk-entries", textId: "t2", edits: [null, 5, "text", [], {}, { original: "We discussed about", fix: "We discussed" }, { fix: "only a fix" }, { original: "only an original" }, { original: 7, fix: 8 }, undefined] },
  {
    id: "more-than-20",
    textId: "t2",
    edits: Array.from({ length: 25 }, (_, i) => (i % 2 ? { original: "We discussed about", fix: `We discussed ${String.fromCharCode(97 + i)}`, rule: `rule ${i}` } : { original: `missing ${i} words`, fix: "x y z" })),
  },
  { id: "fix-length-limit", textId: "t3", edits: [{ original: "abc def", fix: "x".repeat(61) }, { original: "abc def", fix: "y".repeat(62) }, { original: "abc", fix: "z".repeat(49) }, { original: "abc", fix: "z".repeat(50) }, { original: "ab", fix: "zz" }, { original: "abc", fix: "abd" }] },
  { id: "empty-array", textId: "t1", edits: [] },
  { id: "null-edits", textId: "t1", edits: null },
  { id: "object-edits", textId: "t1", edits: { original: "discussed about", fix: "discussed" } },
  { id: "string-edits", textId: "t1", edits: "discussed about" },
];

/* ---- gramRunAI flows ---- */

const F1 =
  "In the first term we discussed about the results of the sleep survey. The sample of 120 students answered all of the questions about their sleep at night. Smith (2019) found that the informations were useful. The  results were clear to everyone who read them.\nMost students said that the lab was open until late. The colour of the walls and the organisation of the lab were noted. Please revert back soon.";

const F_ADJ = "It helped alot, and more followed. See the notes (discussed about the data) here.";

const GOOD = '{"edits":[{"original":"participants answered all of the questions","fix":"participants answered every one of the questions","rule":"Wording","why":"Plainer.","kind":"style"}]}';
const F1_REPLY =
  JSON.stringify({
    edits: [
      { original: "answered all of the questions", fix: "answered every one of the questions", rule: "Wording", why: "Plainer.", kind: "style" },
      { original: "discussed about the results", fix: "discussed the results", rule: "Discuss", why: "No about.", kind: "error" },
      { original: "sample of 120 students", fix: "sample of 210 students" },
      { original: "never in the text", fix: "something else" },
      { original: "The results were clear", fix: "The results were very clear", rule: "x", why: "y", kind: "regional" },
      { original: "Most students said", fix: "Most of the students said", kind: "weird" },
    ],
  });

const FLOWS: Array<{ id: string; note: string; textId: string; std: string | null; replies: Array<string | { throws: true }> }> = [
  { id: "f1-mixed", note: "one part; good, overlapping, changed-number, absent, double-space (start 1e9) and odd-kind edits", textId: "f1", std: null, replies: [F1_REPLY] },
  { id: "f1-us", note: "the same reply under American spelling", textId: "f1", std: "us", replies: [F1_REPLY] },
  { id: "f1-fenced", note: "a reply in a code fence", textId: "f1", std: "uk", replies: ["```json\n" + F1_REPLY + "\n```"] },
  { id: "f1-text-before", note: "words before the JSON", textId: "f1", std: "uk", replies: ["Here you go: " + F1_REPLY + " Done."] },
  { id: "f1-unreadable", note: "a reply that is not JSON", textId: "f1", std: "uk", replies: ["I could not read this"] },
  { id: "f1-edits-text", note: "edits that is not a list", textId: "f1", std: "uk", replies: ['{"edits":"none"}'] },
  { id: "f1-citation", note: "an edit that changes a citation", textId: "f1", std: "uk", replies: ['{"edits":[{"original":"Smith (2019) found","fix":"Smith (2018) found"}]}'] },
  { id: "f1-no-edits", note: "no edits", textId: "f1", std: "off", replies: ['{"edits":[]}'] },
  { id: "adjacent", note: "AI edits that start where a rule's words end and end where a rule's words start are kept", textId: "adj", std: "uk", replies: [JSON.stringify({ edits: [{ original: ", and more followed", fix: ", and much more followed", kind: "style" }, { original: "See the notes (", fix: "See all the notes (" }] })] },
  { id: "f1-throws", note: "callAI fails on the first part", textId: "f1", std: "uk", replies: [{ throws: true }] },
  { id: "f3-good-garbage-throws", note: "three parts: good, unreadable, then a failure", textId: "f3", std: "uk", replies: [GOOD, "no json here", { throws: true }] },
  { id: "f3-all-good", note: "three parts, an edit in each", textId: "f3", std: "uk", replies: [GOOD, GOOD, GOOD] },
  { id: "f3-throws-first", note: "three parts, the first fails", textId: "f3", std: "uk", replies: [{ throws: true }, GOOD, GOOD] },
  { id: "f3-garbage", note: "three unreadable replies", textId: "f3", std: "uk", replies: ["x", "{bad json}", ""] },
  { id: "f6-all-good", note: "five or more parts (the text is cut at 9,000 characters)", textId: "f6", std: "us", replies: [GOOD, GOOD, GOOD, GOOD, GOOD, GOOD, GOOD, GOOD] },
];

/* ---- the dictionary ---- */

const LONG_DEF = "d".repeat(400);
const LONG_EX = "e".repeat(300);

const DICT_NORM_INPUTS: unknown[] = ["Study", "  STUDY  ", "study!", "it's", "it’s", "co-operate", "o'clock-", "two words", "naïve", "विद्यार्थी", "12345", "a1b2", "x".repeat(60), "", "   ", null, undefined, 42, "Étude", "O’Brien", "wörd", "-'", "study.,;"];

const DICT_PAYLOADS: Array<{ id: string; word: string; status: number; payload: unknown }> = [
  {
    id: "plain",
    word: "study",
    status: 200,
    payload: [
      {
        word: "study",
        phonetic: "/ˈstʌdi/",
        phonetics: [{ text: "/other/" }],
        meanings: [
          { partOfSpeech: "noun", definitions: [{ definition: "A careful look.", example: "A study of sleep.", synonyms: ["research", "survey"] }, { definition: "A room.", example: "" }, { definition: "A third one that is dropped." }], synonyms: ["analysis", "research", "two words"] },
          { partOfSpeech: "verb", definitions: [{ definition: "To learn.", example: "She studies hard." }], synonyms: [] },
        ],
      },
    ],
  },
  { id: "phonetic-from-list", word: "read", status: 200, payload: [{ phonetics: [{ audio: "x.mp3" }, { text: "/riːd/" }, { text: "/red/" }], meanings: [{ partOfSpeech: "verb", definitions: [{ definition: "To look at words." }] }] }] },
  { id: "phonetic-from-second-entry", word: "lead", status: 200, payload: [{ meanings: [{ partOfSpeech: "verb", definitions: [{ definition: "To guide." }] }] }, { phonetic: "/liːd/", meanings: [{ partOfSpeech: "noun", definitions: [{ definition: "A position in front." }] }] }, { phonetic: "/led/", meanings: [{ partOfSpeech: "noun", definitions: [{ definition: "A metal." }] }] }] },
  {
    id: "five-meanings-and-long-text",
    word: "run",
    status: 200,
    payload: [
      {
        phonetic: "/rʌn/",
        meanings: ["noun", "verb", "adjective", "adverb", "interjection"].map((p) => ({ partOfSpeech: p, definitions: [{ definition: LONG_DEF, example: LONG_EX }], synonyms: [] })),
      },
    ],
  },
  {
    id: "synonyms",
    word: "big",
    status: 200,
    payload: [
      {
        meanings: [
          { partOfSpeech: "adjective", definitions: [{ definition: "Large.", synonyms: ["large", "huge", "great", "", "vast", "a b"] }, { definition: "Important.", synonyms: ["large", "major", "grand", "giant", "mighty", "colossal"] }], synonyms: ["enormous", "big"] },
        ],
      },
    ],
  },
  { id: "no-part-of-speech", word: "thing", status: 200, payload: [{ meanings: [{ definitions: [{ definition: "An object." }] }, { partOfSpeech: null, definitions: [{ definition: "A matter.", example: null }] }] }] },
  { id: "empty-definitions", word: "void", status: 200, payload: [{ meanings: [{ partOfSpeech: "noun", definitions: [] }, { partOfSpeech: "verb" }] }] },
  { id: "empty-meanings", word: "none", status: 200, payload: [{ phonetic: "/n/", meanings: [] }] },
  { id: "empty-list", word: "nothing", status: 200, payload: [] },
  { id: "not-a-list", word: "oddity", status: 200, payload: { title: "No Definitions Found" } },
  { id: "not-found", word: "zzyzx", status: 404, payload: { title: "No Definitions Found" } },
];

const DICT_AI_REPLIES: Array<{ id: string; word: string; reply: string }> = [
  { id: "good", word: "study", reply: '{"simple":"To learn about a thing.","hindi":"अध्ययन","example":"We study the effect of sleep on memory."}' },
  { id: "fenced", word: "study", reply: '```json\n{"simple":"To learn about a thing.","hindi":"अध्ययन","example":"We study sleep."}\n```' },
  { id: "unsure", word: "study", reply: '{"simple":"unsure","hindi":"unsure","example":"unsure"}' },
  { id: "unsure-spaces", word: "study", reply: '{"simple":"  UNSURE ","hindi":"x","example":"y"}' },
  { id: "no-simple", word: "study", reply: '{"hindi":"अध्ययन","example":"We study."}' },
  { id: "not-json", word: "study", reply: "I do not know this word." },
  { id: "hindi-unsure", word: "study", reply: '{"simple":"To learn.","hindi":"I am unsure","example":"We study it."}' },
  { id: "no-hindi", word: "study", reply: '{"simple":"To learn.","example":"We study it."}' },
  { id: "example-without-word", word: "study", reply: '{"simple":"To learn.","hindi":"अध्ययन","example":"Students learn about sleep."}' },
  { id: "example-capitalised", word: "study", reply: '{"simple":"To learn.","hindi":"अध्ययन","example":"Study is hard."}' },
  { id: "example-unsure", word: "study", reply: '{"simple":"To learn.","hindi":"अध्ययन","example":"We study it, but I am unsure."}' },
  { id: "long-values", word: "study", reply: JSON.stringify({ simple: "s".repeat(300), hindi: "h".repeat(120), example: "We study " + "e".repeat(300) }) },
  { id: "exact-cuts", word: "study", reply: JSON.stringify({ simple: "s".repeat(200), hindi: "h".repeat(80), example: "We study " + "e".repeat(191) }) },
  { id: "numbers", word: "study", reply: '{"simple":5,"hindi":6,"example":7}' },
];

/* ---- the word bank ---- */

const E = (w: string, d = "2026-10-01", pos = "noun", m = "A meaning.", h = ""): BankEntry => ({ w, pos, m, h, d });
const genBank = (n: number): BankEntry[] => Array.from({ length: n }, (_, i) => E(`word${i}`, "2026-09-01", "noun", `meaning ${i}`, i % 3 ? "" : "शब्द"));

const CUR_PLAIN = { word: "study", phon: "/ˈstʌdi/", meanings: [{ pos: "noun", defs: [{ d: "A careful look.", x: "A study of sleep." }], syn: [] }, { pos: "verb", defs: [{ d: "To learn.", x: "" }], syn: [] }] };
const CUR_LONG = { word: "lengthy", phon: "", meanings: [{ pos: "adjective", defs: [{ d: "m".repeat(300), x: "" }], syn: [] }] };
const CUR_NONE = { word: "empty", phon: "", meanings: [] };
const CUR_NODEF = { word: "nodef", phon: "", meanings: [{ pos: "noun", defs: [], syn: [] }] };

const BANK_ADD: Array<{ id: string; bank: BankEntry[] | { gen: number }; cur: unknown; ai: unknown }> = [
  { id: "empty-bank", bank: [], cur: CUR_PLAIN, ai: null },
  { id: "with-hindi", bank: [E("old")], cur: CUR_PLAIN, ai: { simple: "To learn.", hindi: "अध्ययन", example: "" } },
  { id: "ai-error", bank: [E("old")], cur: CUR_PLAIN, ai: { err: "The AI was not sure." } },
  { id: "ai-no-hindi", bank: [E("old")], cur: CUR_PLAIN, ai: { simple: "To learn.", hindi: "", example: "" } },
  { id: "already-there", bank: [E("old"), E("study"), E("other")], cur: CUR_PLAIN, ai: null },
  { id: "meaning-cut-at-160", bank: [], cur: CUR_LONG, ai: null },
  { id: "no-meanings", bank: [E("old")], cur: CUR_NONE, ai: null },
  { id: "no-definitions", bank: [E("old")], cur: CUR_NODEF, ai: null },
  { id: "499-to-500", bank: { gen: 499 }, cur: CUR_PLAIN, ai: null },
  { id: "500-to-500", bank: { gen: 500 }, cur: CUR_PLAIN, ai: null },
  { id: "already-there-at-500", bank: { gen: 500 }, cur: { ...CUR_PLAIN, word: "word7" }, ai: null },
  { id: "bigger-than-500", bank: { gen: 520 }, cur: CUR_PLAIN, ai: null },
];

const CSV_BANKS: Array<{ id: string; bank: BankEntry[] }> = [
  { id: "empty", bank: [] },
  { id: "one", bank: [E("study", "2026-10-01", "noun", "A careful look.", "अध्ययन")] },
  { id: "needs-quotes", bank: [E("a,b", "2026-10-01", "noun", 'He said "stop", then left.', ""), E("line", "2026-10-02", "verb", "one\ntwo\r\nthree", "x\ty"), E("plain", "2026-10-03", "", "", "")] },
  { id: "many", bank: genBank(30) },
];

export const words: Engine = {
  name: "words",
  async capture(v1: V1, opts) {
    const w = v1.window as unknown as Record<string, unknown> & V1["window"];
    const ls = v1.window.localStorage;
    const plain = <T>(x: unknown): T => JSON.parse(JSON.stringify(x === undefined ? null : x)) as T;
    const sha = (s: string) => createHash("sha256").update(s).digest("hex");
    const KEYS = ["appu_spell", "appu_gram_stats", "appu_wordbank", "appu_dict_cache"];
    const reset = () => {
      for (const k of KEYS) ls.removeItem(k);
      v1.eval("GRAM.items=[];GRAM.checked=0;GRAM.parts=0;GRAM.dropped=0;GRAM.busy=false;GRAM.text='';DICT.cur=null;DICT.ai=null;DICT.busy=false");
    };
    const setStd = (std: string | null) => (std === null ? ls.removeItem("appu_spell") : ls.setItem("appu_spell", std));
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const setEditor = (text: string): string => {
      v1.setEditorHtml(`<p>${esc(text)}</p>`);
      return v1.eval<string>("getEditorText()");
    };
    const chunkOf = (prompt: string) => prompt.slice(prompt.indexOf("\n\nTEXT START\n") + "\n\nTEXT START\n".length, prompt.lastIndexOf("\nTEXT END"));
    const fx = {} as WordsFx;

    // ---- the rules, as data
    const rules = plain<unknown[]>(v1.eval("GR_RULES.map(R=>({id:R.id,kind:R.kind,rule:R.rule,why:R.why,ex:R.ex,source:R.re.source,flags:R.re.flags}))"));
    const ruleIds = plain<string[]>(v1.eval("GR_RULES.map(R=>R.id)"));
    const exOf = plain<string[]>(v1.eval("GR_RULES.map(R=>R.ex[0])"));
    if (ruleIds.length !== 24) throw new Error(`words: v1 has ${ruleIds.length} grammar rules, this capture was written for 24`);
    const spellRules: Record<string, unknown> = {};
    for (const std of ["uk", "us"]) {
      setStd(std);
      spellRules[std] = plain<unknown[]>(v1.eval("gramSpellRules().map(R=>({id:R.id,kind:R.kind,rule:R.rule,why:R.why,ex:R.ex,source:R.re.source,flags:R.re.flags}))"));
    }
    setStd(null);
    const rulesStatus = writeFixture("words", "rules", { rules, spell: spellRules }, v1, opts.check);
    type Meta = { id: string; kind: string; rule: string; why: string; ex: string[] };
    const metaOf = (std: string): Map<string, Meta> => new Map([...(rules as Meta[]), ...((spellRules[std] ?? []) as Meta[])].map((r) => [r.id, r]));
    /** A rule's hit without the fields its rule owns, after checking that v1 gave it exactly those. */
    const compact = (h: Hit, std: string): StoredHit => {
      if (h.src !== "rule") return h;
      const m = metaOf(std).get(h.id);
      if (!m || m.kind !== h.kind || m.rule !== h.rule || m.why !== h.why || JSON.stringify(m.ex) !== JSON.stringify(h.ex)) throw new Error(`words: the hit of ${h.id} does not carry its rule's own kind, rule, why and ex`);
      return { id: h.id, start: h.start!, end: h.end!, original: h.original, fix: h.fix };
    };

    // ---- gramLocal
    const exampleCases: TextCase[] = ruleIds.map((id, i) => ({ id: `ex-${id}`, note: `v1's own example of ${id}`, text: exOf[i]! }));
    const all = [...exampleCases, ...LOCAL_CASES];
    const local: LocalCase[] = [];
    for (const c of all) {
      const text = textOf(c);
      const out = {} as LocalCase["out"];
      reset();
      setStd(null);
      const unset = plain<Hit[]>(v1.call("gramLocal", text));
      for (const std of ["uk", "us", "off"] as const) {
        reset();
        setStd(std);
        const hits = plain<Hit[]>(v1.call("gramLocal", text));
        if (std === "uk" && JSON.stringify(hits) !== JSON.stringify(unset)) throw new Error(`words: ${c.id}: nothing stored should read as uk`);
        out[std] = hits.map((h) => compact(h, std) as RuleHit);
      }
      local.push({ ...c, out });
    }
    const seen = (std: "uk" | "us" | "off") => new Set(local.flatMap((c) => c.out[std].map((h) => h.id)));
    for (const id of ruleIds) {
      if (!seen("uk").has(id) || !seen("us").has(id)) throw new Error(`words: no corpus text triggers ${id} under both uk and us`);
    }
    for (const id of ["spell-variant", "spell-ize"]) if (!seen("uk").has(id) || !seen("us").has(id)) throw new Error(`words: no text triggers ${id}`);
    if ([...seen("off")].some((id) => id.startsWith("spell-"))) throw new Error("words: spelling rules fired with the standard off");
    if (local.find((c) => c.id === "clean")!.out.uk.length !== 0) throw new Error("words: the clean text should find nothing");
    const quotes = local.find((c) => c.id === "quotes")!.out.uk;
    if (!quotes.some((h) => h.id === "discuss-about") || quotes.filter((h) => h.id === "discuss-about").length !== 1) throw new Error("words: the quotes text should find the discuss-about outside the quotation marks only");
    if (!local.some((c) => c.out.uk.some((h) => h.fix === null))) throw new Error("words: no hit without a fix");
    const hitsAt = (id: string) => local.find((c) => c.id === id)!.out.uk;
    if (hitsAt("cut-hit-before").length !== 1 || hitsAt("cut-hit-after").length !== 0 || hitsAt("cut-hit-beyond").length !== 0) throw new Error("words: the 60,000-character cut cases do not do what they are for");
    fx.local = local;

    // ---- the spelling setting
    const STD_STORED: Array<string | null> = [null, "uk", "us", "off", "UK", "US", "", "x", " us", "britain"];
    fx.std = STD_STORED.map((stored) => {
      reset();
      setStd(stored);
      const std = v1.call<string>("gramSpellStd");
      ls.removeItem("appu_spell");
      v1.call("gramSpellSet", stored);
      return { stored, std, set: ls.getItem("appu_spell") ?? "" };
    });
    setStd(null);

    // ---- the counts
    const items = (id: string, src = "rule") => ({ src, id });
    const STATS: Array<{ stored: Record<string, number> | null; items: Array<{ src: string; id: string }> }> = [
      { stored: null, items: [] },
      { stored: null, items: [items("discuss-about"), items("discuss-about"), items("cope-up")] },
      { stored: {}, items: [items("run-together")] },
      { stored: { "discuss-about": 4, "cope-up": 4, "its-apostrophe": 1 }, items: [items("cope-up"), items("modal-of")] },
      { stored: { a: 3, b: 3, c: 3, d: 3, e: 9 }, items: [] },
      { stored: { "discuss-about": 2 }, items: [items("ai", "ai"), items("ai", "ai"), items("discuss-about")] },
      { stored: { "return-back": 1, "revert-back": 2, "not-a-rule": 7 }, items: [items("not-a-rule")] },
      { stored: { "z-rule": 1 }, items: [] },
    ];
    fx.stats = STATS.map((c) => {
      reset();
      if (c.stored) ls.setItem("appu_gram_stats", JSON.stringify(c.stored));
      v1.call("gramStat", c.items);
      const after = JSON.parse(ls.getItem("appu_gram_stats") ?? "{}") as Record<string, number>;
      const top = plain<Array<[string, number]>>(v1.call("gramTop"));
      return { ...c, after, top };
    });
    if (!fx.stats.some((c) => c.top.length === 3)) throw new Error("words: no stats case fills the top three");

    // ---- the guards
    const probe = async (name: string, from: number, to: number, went: (n: number, text: string) => Promise<boolean>) => {
      const res: boolean[] = [];
      for (let n = from; n <= to; n++) res.push(await went(n, "a".repeat(n)));
      const first = res.indexOf(true);
      if (first <= 0 || res.slice(0, first).some(Boolean) || res.slice(first).some((x) => !x)) throw new Error(`words: ${name} has no clean threshold: ${res.map((x) => +x).join("")}`);
      const padded = await went(first + from - 1, "   " + "a".repeat(first + from - 1) + "   ");
      return { refused: from + first - 1, accepted: from + first, paddedRefused: !padded };
    };
    const guardCalls: Array<{ prompt: string; opts: Record<string, unknown> }> = [];
    w.callAI = async (prompt: unknown, o?: Record<string, unknown>) => {
      guardCalls.push({ prompt: String(prompt), opts: { ...o } });
      return '{"edits":[]}';
    };
    const guards = {
      local: await probe("gramRunLocal", 5, 15, async (_n, text) => {
        reset();
        setEditor(text);
        v1.eval("GRAM.text='before'");
        v1.call("gramRunLocal");
        return v1.eval<string>("GRAM.text") !== "before";
      }),
      ai: await probe("gramRunAI", 20, 40, async (_n, text) => {
        reset();
        setEditor(text);
        const before = guardCalls.length;
        await v1.call<Promise<void>>("gramRunAI");
        return guardCalls.length > before;
      }),
    };
    fx.guards = guards;

    // ---- the chunks
    const CHUNKS: Array<{ id: string; note: string; text: string }> = [
      { id: "short", note: "one short part", text: sentences(1, 300) },
      { id: "exactly-1800", note: "1,800 characters, one part", text: sentences(2, 1800) },
      { id: "1801", note: "1,801 characters", text: sentences(3, 1801) },
      { id: "3000-no-stop", note: "3,000 characters without a full stop: cut hard at 1,800", text: plainWords(4, 3000) },
      { id: "stop-at-599", note: "a full stop and space at 599: too early, cut at 1,800", text: plainWords(5, 3000, 599) },
      { id: "stop-at-600", note: "a full stop and space at 600: the limit is above 600", text: plainWords(6, 3000, 600) },
      { id: "stop-at-601", note: "a full stop and space at 601: used", text: plainWords(7, 3000, 601) },
      { id: "stop-at-1799", note: "a full stop and space at 1,799", text: plainWords(8, 3000, 1799) },
      { id: "stop-at-1800", note: "a full stop and space at 1,800: v1 looks up to and including index 1,800", text: plainWords(9, 3000, 1800) },
      { id: "stop-at-1801", note: "a full stop and space at 1,801: too late", text: plainWords(10, 3000, 1801) },
      { id: "5000-sentences", note: "5,000 characters of sentences", text: sentences(11, 5000) },
      { id: "9000", note: "exactly 9,000 characters", text: sentences(12, 9000) },
      { id: "9001", note: "9,001 characters: the last one is not read", text: sentences(13, 9001) },
      { id: "12000", note: "12,000 characters", text: sentences(14, 12000) },
      { id: "9000-no-stop", note: "9,000 characters without a full stop: five parts of 1,800", text: plainWords(15, 9000) },
      { id: "surrogate-at-cut", note: "an emoji (two UTF-16 units) across the 1,800 cut", text: plainWords(16, 1799) + "😀" + plainWords(17, 400) },
      { id: "hindi", note: "Hindi with the danda and no full stop-and-space", text: "विद्यार्थी अक्सर सोचते हैं कि रात भर पढ़ने से अधिक अंक मिलते हैं। ".repeat(60) },
    ];
    const stub = (replies: Array<string | { throws: true }>) => {
      const calls: Array<{ prompt: string; opts: Record<string, unknown> }> = [];
      let i = 0;
      w.callAI = async (prompt: unknown, o?: Record<string, unknown>) => {
        calls.push({ prompt: String(prompt), opts: { ...o } });
        const r = replies[i++];
        if (r === undefined) return '{"edits":[]}';
        if (typeof r === "object") throw new Error("boom");
        return r;
      };
      return calls;
    };
    fx.chunks = [];
    for (const c of CHUNKS) {
      reset();
      setStd("uk");
      const text = setEditor(c.text);
      if (text !== c.text) throw new Error(`words: the editor changed the text of ${c.id}`);
      const calls = stub([]);
      await v1.call<Promise<void>>("gramRunAI");
      const got = calls.map((x) => chunkOf(x.prompt));
      if (got.join("") !== text.slice(0, 9000)) throw new Error(`words: the parts of ${c.id} do not add up to the first 9,000 characters`);
      fx.chunks.push({ ...c, calls: calls.length, lens: got.map((g) => g.length), opts: calls.map((x) => x.opts), sha: calls.map((x) => sha(x.prompt)) });
    }
    const lensOf = (id: string) => fx.chunks.find((c) => c.id === id)!.lens;
    if (lensOf("stop-at-600")[0] !== 1800 || lensOf("stop-at-601")[0] !== 602 || lensOf("stop-at-1800")[0] !== 1801 || lensOf("stop-at-1799")[0] !== 1800 || lensOf("stop-at-1801")[0] !== 1800) {
      throw new Error("words: the break-point cases do not show the 600 limit and the index-1,800 reach");
    }
    if (fx.chunks.find((c) => c.id === "12000")!.calls < 5) throw new Error("words: 12,000 characters should make at least five parts");

    // ---- gramVerifyAI
    const vtext = new Map(VERIFY_TEXTS.map((t) => [t.id, t.text]));
    fx.verify = VERIFY_EDITS.map((c) => {
      const text = vtext.get(c.textId)!;
      const edits = plain<unknown>(c.edits);
      return { id: c.id, text, edits, out: plain<{ ok: Hit[]; dropped: number }>(v1.call("gramVerifyAI", text, edits)) };
    });
    // JSON turns an undefined entry into null; v1 sees both as the same kind of nothing
    if (!fx.verify.some((c) => c.out.ok.length > 0 && c.out.dropped > 0)) throw new Error("words: no verify case has both kept and dropped edits");
    if (fx.verify.find((c) => c.id === "more-than-20")!.out.ok.length === 0) throw new Error("words: more-than-20 keeps nothing");

    // ---- gramRunAI end to end
    const F3 = sentences(21, 4000);
    const F6 = sentences(22, 9001);
    const flowText = new Map([["f1", F1], ["adj", F_ADJ], ["f3", F3], ["f6", F6]]);
    fx.flowTexts = Object.fromEntries(flowText);
    fx.flows = [];
    for (const c of FLOWS) {
      reset();
      setStd(c.std);
      if (setEditor(flowText.get(c.textId)!) !== flowText.get(c.textId)) throw new Error(`words: the editor changed the text of ${c.id}`);
      const calls = stub(c.replies);
      await v1.call<Promise<void>>("gramRunAI");
      const state = plain<{ items: Hit[]; checked: number; parts: number; dropped: number }>(v1.eval("({items:GRAM.items,checked:GRAM.checked,parts:GRAM.parts,dropped:GRAM.dropped})"));
      const replies = c.replies.slice();
      while (replies.length < calls.length) replies.push('{"edits":[]}');
      fx.flows.push({ id: c.id, note: c.note, textId: c.textId, std: c.std, replies, calls: calls.length, sha: calls.map((x) => sha(x.prompt)), ...state, items: state.items.map((h) => compact(h, c.std ?? "uk")), stats: JSON.parse(ls.getItem("appu_gram_stats") ?? "{}") as Record<string, number> });
    }
    const flow = (id: string) => fx.flows.find((c) => c.id === id)!;
    if (!flow("f1-mixed").items.some((h) => "src" in h && h.src === "ai" && h.start === 1e9)) throw new Error("words: no AI edit with start 1e9 (found in the flattened text only)");
    if (!flow("f1-mixed").items.some((h) => "src" in h && h.src === "ai") || flow("f1-mixed").dropped !== 2) throw new Error("words: f1-mixed should keep some AI edits and drop some");
    if (flow("f3-good-garbage-throws").checked !== 2 || flow("f3-good-garbage-throws").parts < 3) throw new Error("words: f3-good-garbage-throws should read two parts of three");
    if (flow("f6-all-good").parts < 5) throw new Error("words: f6 should be five parts or more");
    if (flow("f1-us").items.length === flow("f1-mixed").items.length && JSON.stringify(flow("f1-us").items) === JSON.stringify(flow("f1-mixed").items)) throw new Error("words: f1-us and f1-mixed should differ");

    // ---- the prompts, as the student's click sends them
    const rc = promptRecorder(v1, "words");
    const prompts: PromptRow[] = [];
    const keep = (c: PromptCase) => prompts.push(c as PromptRow);
    const GRAM_TEXT = "Many students believe that studying late helps them remember. We discussed about it alot, and the results was clear.";
    for (const f of FIELDS) {
      for (const std of [null, "uk", "us", "off"] as const) {
        reset();
        rc.setField(f);
        setStd(std);
        const text = setEditor(GRAM_TEXT);
        keep(await rc.run("gramRunAI", { std: std ?? "unset", text }, () => v1.call<Promise<void>>("gramRunAI")));
      }
    }
    for (const f of FIELDS) {
      for (const word of ["study", "co-operate"]) {
        reset();
        rc.setField(f);
        v1.eval(`DICT.cur=${JSON.stringify({ word, phon: "", meanings: [{ pos: "noun", defs: [{ d: "x", x: "" }], syn: [] }] })}`);
        keep(await rc.run("dictAI", { word }, () => v1.call<Promise<void>>("dictAI")));
      }
    }
    rc.setField(null);
    reset();
    fx.prompts = prompts;
    for (const p of prompts) {
      const o = p.opts as { temp?: number; max?: number; noLang?: boolean };
      if (o.noLang !== true) throw new Error(`words: ${p.entry} was not sent with noLang`);
    }
    if (new Set(prompts.map((p) => `${p.entry}: ${p.aiu?.k} / ${p.aiu?.g}`)).size !== 2) throw new Error("words: two aiuClassify labels expected");

    // ---- the dictionary
    const norm = DICT_NORM_INPUTS.map((typed) => ({ typed: typed === undefined ? null : typed, out: v1.call<string>("dictNorm", typed) }));
    const fetches: DictCase[] = [];
    for (const c of DICT_PAYLOADS) {
      reset();
      let url = "";
      (w as unknown as Record<string, unknown>).fetch = async (u: unknown) => {
        url = String(u);
        return { status: c.status, ok: c.status >= 200 && c.status < 300, json: async () => JSON.parse(JSON.stringify(c.payload)) };
      };
      const out = plain<unknown>(await v1.call<Promise<unknown>>("dictFetch", c.word));
      const cache = JSON.parse(ls.getItem("appu_dict_cache") ?? "{}") as Record<string, unknown>;
      fetches.push({ ...c, url, out, cached: cache[c.word] ?? null });
    }
    if (!fetches.some((c) => (c.out as { notfound?: boolean }).notfound) || !fetches.some((c) => (c.out as { meanings?: unknown[] }).meanings?.length === 4)) throw new Error("words: dict cases miss notfound or the four-meaning cut");
    const dictAi: DictAiCase[] = [];
    for (const c of DICT_AI_REPLIES) {
      reset();
      v1.eval(`DICT.cur=${JSON.stringify({ word: c.word, phon: "", meanings: [] })}`);
      w.callAI = async () => c.reply;
      await v1.call<Promise<void>>("dictAI");
      dictAi.push({ ...c, out: plain<unknown>(v1.eval("DICT.ai")) });
    }
    if (!dictAi.some((c) => (c.out as { err?: string }).err) || !dictAi.some((c) => (c.out as { hindi?: string }).hindi)) throw new Error("words: dictAI cases miss the error or a Hindi meaning");
    const cacheCases: WordsFx["dict"]["cache"] = [];
    for (const [n, word] of [[0, "new"], [5, "new"], [199, "new"], [200, "new"], [200, "w5"], [201, "new"]] as Array<[number, string]>) {
      reset();
      ls.setItem("appu_dict_cache", JSON.stringify(Object.fromEntries(Array.from({ length: n }, (_, i) => [`w${i}`, { word: `w${i}` }]))));
      v1.call("dictCachePut", word, { word, marker: n });
      const after = JSON.parse(ls.getItem("appu_dict_cache") ?? "{}") as Record<string, { marker?: number }>;
      cacheCases.push({ n, word, after: Object.keys(after), value: after[word] ?? null });
    }
    fx.dict = { norm, fetch: fetches, ai: dictAi, cache: cacheCases };

    // ---- the word bank
    const today = () => v1.eval<string>("new Date().toISOString().slice(0,10)");
    const summ = (a: BankEntry[]): BankSummary => ({ len: a.length, entries: a.length <= 6 ? a : [...a.slice(0, 3), ...a.slice(-3)] });
    const add: AddCase[] = [];
    for (const c of BANK_ADD) {
      reset();
      const bank = Array.isArray(c.bank) ? c.bank : genBank(c.bank.gen);
      ls.setItem("appu_wordbank", JSON.stringify(bank));
      v1.eval(`DICT.cur=${JSON.stringify(c.cur)};DICT.ai=${JSON.stringify(c.ai)}`);
      const before = ls.getItem("appu_wordbank");
      v1.call("bankAdd");
      const stored = JSON.parse(ls.getItem("appu_wordbank") ?? "[]") as BankEntry[];
      const added = ls.getItem("appu_wordbank") !== before;
      add.push({ ...c, after: summ(stored), added, dateOk: !added || stored[0]!.d === today() });
    }
    if (!add.some((c) => !c.added) || !add.some((c) => c.added && c.after.len === 500 && c.id === "500-to-500")) throw new Error("words: bankAdd cases miss the refusal or the 500 cut");
    const remove: WordsFx["bank"]["remove"] = [];
    for (const [bank, wd] of [[[E("a"), E("b"), E("c")], "b"], [[E("a"), E("b")], "zzz"], [[E("a"), E("a", "2026-01-01")], "a"], [[], "a"]] as Array<[BankEntry[], string]>) {
      reset();
      ls.setItem("appu_wordbank", JSON.stringify(bank));
      v1.call("bankRemove", wd);
      remove.push({ bank, w: wd, after: JSON.parse(ls.getItem("appu_wordbank") ?? "[]") as BankEntry[] });
    }
    const csv: WordsFx["bank"]["csv"] = [];
    for (const c of CSV_BANKS) {
      reset();
      ls.setItem("appu_wordbank", JSON.stringify(c.bank));
      let got: { name: string; text: string } | null = null;
      w.pdDownload = (name: unknown, text: unknown) => {
        got = { name: String(name), text: String(text) };
      };
      v1.call("bankCsv");
      const g = got as { name: string; text: string } | null;
      csv.push({ bank: c.bank, name: g ? g.name : null, text: g ? g.text : null });
    }
    if (!csv.some((c) => c.text === null) || !csv.some((c) => c.text?.includes('""'))) throw new Error("words: csv cases miss the empty bank or an escaped quote");
    fx.bank = { add, remove, csv };
    reset();

    const tables = { GR_NOUNS: plain<Record<string, string>>(v1.eval("GR_NOUNS")), GR_UK_US: plain<string[][]>(v1.eval("GR_UK_US")), GR_IZE: plain<string[]>(v1.eval("GR_IZE")) };
    console.log(
      `words: ${rules.length} rules, ${local.length} corpus texts, ${fx.chunks.length} chunk cases (${fx.chunks.map((c) => c.calls).join(",")} parts), ${fx.verify.length} verify cases, ${fx.flows.length} flows, ${prompts.length} prompts, ${fetches.length} dictionary payloads, ${add.length} bank adds`,
    );
    return [emitTables(v1, "words", "words-tables", tables, opts), rulesStatus, writeFixture("words", "cases", fx, v1, opts.check)];
  },
};
