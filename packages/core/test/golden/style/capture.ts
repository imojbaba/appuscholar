import type { Engine } from "../harness/engines";
import { emitTables, writeFixture } from "../harness/fixture";
import { promptRecorder } from "../harness/prompt-record";
import type { PromptCase } from "../harness/prompt-record";
import type { V1 } from "../harness/v1";

/**
 * Task D1's My writing style engine (v1 index.html: STY_FW, STY_VOCAB, STY_BANDS, STY_PASSAGES 6375-6397, styleFeatures 6399-6415, styleAddSample 6426-6432, styleStats 6438, styleOutliers 6441-6453,
 * styleMeasured 6454-6460, styleCompose 6461-6464, styleVocabNote 6470-6477, styleLevelRule 6483-6486, styleLiveCompare 6488-6495, styleLivePassage/styleLiveNew 6496-6499, the vocabulary check
 * 6519-6535, styleTryNoteSave 6551-6555, stylePrompt 6975-6976, styleSampleCorpus 7014-7019), page-bound: v1 keeps its state in localStorage (`appu_style_profile`, `appu_style_on`, `appu_style_samples`,
 * `appu_style_meta`, `appu_style_vocab_level`) and in a few fields of the page. Per case localStorage is set as a student's saves would leave it and v1's own function is called; nothing is typed by hand.
 *
 * - `features`: styleFeatures(text) for twelve golden texts (English of several registers, Hindi, mixed, a three-word text, a text with no letters, punctuation-heavy, contractions and hyphens,
 *   sentence splits, function words only, and a 1,500-word text that fills the 400-word vocabulary cut), and for the texts the sets below are made of.
 * - `sets`: per set of samples (no samples, one short, 8 of one voice and one of another, 6 of one voice, 3 long and some short, the twelve golden ones): styleOutliers(samples), styleMeasured(), styleCompose
 *   for a list of bullets, styleLiveCompare for a list of typed texts, styleVocabNote for a list of (original, result) with "Use my style" on and off.
 * - `addSample`: styleAddSample for texts of 0, 1, 79, 80, 81 and 5,000 words, a repeated name and size, no name, a name of 100 characters, and the hundredth-sample cut (the new record is dropped).
 * - `vocab`: styleVocabOpen's radio order per question, and styleVocabScore for answers that earn 0 to 10 points, wrong answers and "I do not know" (-1).
 * - `passages`: styleLivePassage and styleLiveNew for stored `livePassage` values of every kind v1 might read. `guards`: the word counts at which styleAnalyze (80), styleAddSample (80) and styleLiveRun (60) start to go on.
 * - `profile`: styleSave (trim, cut at 1,500), styleTryNoteSave (the note, the cut from the end) and stylePrompt for profile, on and level combinations.
 * - `prompts`: styleAnalyze, styleAnalyzeFiles and styleTry driven with callAI replaced by a recorder (before callAIRaw adds the content-language instruction), with the aiuClassify label v1 gives each.
 * `tables.json` (and, under --emit, src/data/style-tables.ts): STY_FW, STY_VOCAB, STY_BANDS, STY_PASSAGES, read through eval.
 */

export type StyleFeat = { n: number; sc: number; sm: number; ssd: number; wl: number; ls: number; fw: number[]; pu: number[]; vw: string[] };
export type StyleRec = StyleFeat & { id: string; name: string; date: string };
export type Level = { score: number; k: string; date: string } | null;

type TextCase = { id: string; note: string; text: string; f: StyleFeat };
/** A sample of a set is the features of the text with id `of` in `features`, kept under the id `id` (the name is its id). */
type SetSpec = { id: string; note: string; samples: Array<{ id: string; of: string }> };
type SetCase = SetSpec & {
  outliers: Record<string, number>;
  measured: string;
  compose: Array<{ bullets: string; out: string }>;
  compare: Array<{ id: string; out: unknown }>;
  vocabNote: Array<{ on: boolean; orig: string; res: string; out: string }>;
};
type AddCase = { id: string; steps: Array<{ name: string; text: string }>; results: Array<{ rec: Omit<StyleRec, "id" | "date"> | null; idOk: boolean; dateOk: boolean }>; after: number };
type VocabCase = { id: string; answers: number[]; stored: { score: number; k: string; date: string } };
type PromptRow = PromptCase & { inputs: Record<string, unknown> };

export type StyleFx = {
  features: TextCase[];
  sets: SetCase[];
  addSample: AddCase[];
  vocab: { order: number[][]; cases: VocabCase[] };
  passages: Array<{ stored: unknown; at: number; next: number | null }>;
  guards: { analyse: { refused: number; accepted: number }; addSample: { refused: number; accepted: number }; live: { refused: number; accepted: number } };
  profile: {
    save: Array<{ typed: string; stored: string }>;
    note: Array<{ profile: string; typed: string; stored: string | null }>;
    prompt: Array<{ profile: string | null; on: string | null; level: Level; out: string }>;
    level: Array<{ level: Level; out: string }>;
  };
  prompts: PromptRow[];
  corpus: Array<{ chars: number; text: string; out: string }>;
};

/* ---- the texts: written by hand or made by a seeded generator; v1 measures them, nothing here is a measurement ---- */

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const FUNC = "the of and to a in that is was it for as with be by on not this are or from at which but have an had they were their one all we can has there been if more when will would who so no".split(" ");
const SHORT_W = "time study sleep class exam group note work mind task plan book test idea talk read mark page rule goal need help view".split(" ");
const MID_W = "students learning memory reading writing practice method results evidence sample pattern attention revision teacher subject concept answer survey measure outcome".split(" ");
const LONG_W = "understanding significantly approximately consideration environmental psychological organisation institutional comprehension interpretation neighbourhood relationships".split(" ");

type Voice = { sent: number; spread: number; fw: number; long: number; comma: number; semi: number };
const VOICE_A: Voice = { sent: 14, spread: 6, fw: 0.42, long: 0.04, comma: 0.07, semi: 0.0 };
const VOICE_A2: Voice = { sent: 15, spread: 6, fw: 0.41, long: 0.05, comma: 0.075, semi: 0.0 };
const VOICE_B: Voice = { sent: 34, spread: 10, fw: 0.18, long: 0.38, comma: 0.16, semi: 0.05 };
const VOICE_MID: Voice = { sent: 22, spread: 8, fw: 0.3, long: 0.16, comma: 0.11, semi: 0.01 };

/** About `words` words in sentences of the voice's length: capitalised, ended with a full stop or a question mark, so styleFeatures' sentence rule sees them. */
function gen(seed: number, words: number, v: Voice): string {
  const r = lcg(seed);
  const pick = (a: string[]) => a[Math.floor(r() * a.length)]!;
  const out: string[] = [];
  let made = 0;
  while (made < words) {
    const len = Math.max(4, Math.round(v.sent + (r() - 0.5) * v.spread * 2));
    const ws: string[] = [];
    for (let i = 0; i < len; i++) {
      const x = r();
      let w: string;
      if (x < v.fw) w = pick(FUNC);
      else {
        const y = r();
        w = y < v.long ? pick(LONG_W) : y < 0.5 ? pick(MID_W) : pick(SHORT_W);
      }
      const z = r();
      if (i < len - 1 && z < v.comma) w += ",";
      else if (i < len - 1 && z < v.comma + v.semi) w += ";";
      ws.push(w);
    }
    ws[0] = ws[0]!.charAt(0).toUpperCase() + ws[0]!.slice(1);
    ws[len - 1] = ws[len - 1]!.replace(/[,;]$/, "") + (r() < 0.07 ? "?" : ".");
    out.push(ws.join(" "));
    made += len;
  }
  return out.join(" ");
}

/** 600 distinct words of 7 to 12 letters, for a text whose long-word list overflows the 400 v1 keeps. */
function manyWords(): string {
  const syl = ["ra", "ko", "mi", "tel", "son", "par", "lu", "dex", "vin", "qua", "bor", "ney", "tal", "gri", "mun"];
  const words: string[] = [];
  for (let i = 0; words.length < 600; i++) {
    const w = syl[i % 15]! + syl[Math.floor(i / 15) % 15]! + syl[Math.floor(i / 225) % 15]! + syl[(i * 7) % 15]!;
    if (w.length >= 7 && !words.includes(w)) words.push(w);
  }
  const r = lcg(77);
  const out: string[] = [];
  for (let s = 0; s < 100; s++) {
    const ws: string[] = [];
    for (let i = 0; i < 15; i++) ws.push(i % 5 === 4 ? pick3(r) : words[Math.floor(r() * 600)]!);
    ws[0] = ws[0]!.charAt(0).toUpperCase() + ws[0]!.slice(1);
    out.push(ws.join(" ") + ".");
  }
  return out.join(" ");
}
function pick3(r: () => number): string {
  return FUNC[Math.floor(r() * FUNC.length)]!;
}

const HAND_EN =
  "Many students believe that studying late into the night helps them remember more, but the evidence points the other way. Sleep gives the brain time to sort what it has learned. A student who sleeps well before an examination usually recalls facts faster. Is that surprising? It should not be, because memory is built while we rest.";
const HAND_HI =
  "विद्यार्थी अक्सर सोचते हैं कि रात भर पढ़ने से परीक्षा में अधिक अंक मिलते हैं। परंतु अनुसंधान बताता है कि नींद स्मृति को मजबूत करती है। जो छात्र समय पर सोते हैं, वे अगले दिन अधिक ध्यान लगा पाते हैं। इसलिए अच्छी नींद पढ़ाई का ही एक हिस्सा है।";
const HAND_MIX =
  "The survey asked 120 students about sleep. विद्यार्थियों ने बताया कि वे औसतन छह घंटे सोते हैं। Most said they felt tired in class. कुछ ने कहा कि वे परीक्षा से पहले देर तक जागते हैं। Results are shown in Table 2.";
const HAND_PUNCT =
  "First, we asked; then, we waited (for two weeks, perhaps three): nothing came. Why? Nobody knew - not the teacher, not the head - and yet, somehow, the work went on; slowly, quietly, (almost) without notice. What next? Who can say: the data, the notes, the memo; all of it, however, pointed one way.";
const HAND_LONG =
  "Notwithstanding considerable methodological heterogeneity, contemporary psychological investigations consistently demonstrate that organisational interventions influence interpersonal relationships substantially. Comprehensive interpretation necessitates meticulous consideration of environmental, institutional and developmental circumstances.";
const HAND_APOS =
  "It isn't that they can't read; it's that they don't want to. The students' well-known dislike of long-winded handouts isn’t new, and a one-page summary has always been more popular than a twelve-page report. Cross-checking is time-consuming, but it’s worth it.";
const HAND_SPLIT =
  'Dr. Rao said "the sample was small." (It was.) [Note] The results were clear. "Yes," she said.\nA new line began here.\tAnother after a tab. e.g. this one continues. Then 3 more words came. Ok.';
const HAND_FUNC = "the of and to a in that is was it for as with be by on not this are or from at which but have an had they were their one all we can has there been if more when will would who so no other its may these what than into only such about some could also because between both through during while after before over under";

const GOLDEN: Array<{ id: string; note: string; text: string }> = [
  { id: "g01", note: "plain English, a question", text: HAND_EN },
  { id: "g02", note: "generated English, 450 words, mid voice", text: gen(11, 450, VOICE_MID) },
  { id: "g03", note: "Hindi", text: HAND_HI },
  { id: "g04", note: "three words", text: "Short text here" },
  { id: "g05", note: "no letters", text: "  ... !!! ???  123 456 ,,; " },
  { id: "g06", note: "punctuation-heavy", text: HAND_PUNCT },
  { id: "g07", note: "long words", text: HAND_LONG },
  { id: "g08", note: "contractions, hyphens, curly apostrophes", text: HAND_APOS },
  { id: "g09", note: "English and Hindi mixed", text: HAND_MIX },
  { id: "g10", note: "sentence splits: abbreviation, quotes, brackets, newline, tab", text: HAND_SPLIT },
  { id: "g11", note: "the function words only", text: HAND_FUNC },
  { id: "g12", note: "1,500 words with 600 distinct long words", text: manyWords() + " " + manyWords() + " " + gen(12, 0, VOICE_A) },
];

const A_TEXTS = Array.from({ length: 11 }, (_, i) => gen(100 + i, 500 + i * 20, i % 2 ? VOICE_A : VOICE_A2));
const B_TEXT = gen(200, 400, VOICE_B);
const SHORT_TEXTS = [gen(301, 90, VOICE_A), gen(302, 160, VOICE_MID), gen(303, 200, VOICE_B)];

const LIVE_TEXTS: Array<{ id: string; text: string }> = [
  { id: "like-a", text: gen(401, 120, VOICE_A) },
  { id: "like-a-longer", text: gen(402, 260, VOICE_A2) },
  { id: "like-b", text: gen(403, 150, VOICE_B) },
  { id: "like-mid", text: gen(404, 120, VOICE_MID) },
  { id: "commas-only-off", text: gen(405, 120, { ...VOICE_A, comma: 0.2 }) },
  { id: "short", text: "Too short to say much." },
  { id: "empty", text: "" },
  { id: "hindi", text: HAND_HI },
];

const NOTES: Array<[orig: string, res: string]> = [
  ["I think sleep matters for students.", "In my view, sleep is of paramount importance for undergraduate comprehension and extraordinarily significant."],
  ["Sleep matters for students.", "Sleep matters for students, and understanding approximately everything psychological is considerable."],
  ["The environmental survey", "The environmental survey was institutional, interpretation notwithstanding, neighbourhood relationships understanding."],
  ["", ""],
  ["Study", "Understanding comprehension comprehension comprehension interpretation interpretation, consideration organisation approximately significantly psychological environmental institutional neighbourhood relationships extraordinarily"],
];

const BULLETS = [
  "- Warm, reflective tone.\n- Medium-length sentences.",
  "",
  "   - padded with spaces   \n",
  "- " + "long line of style notes ".repeat(80),
  "x".repeat(1499),
  "x".repeat(1460),
  "- Hindi: संक्षिप्त और सीधा।",
];

const PROFILES: Array<string | null> = [null, "", "- Warm tone.\n- Short sentences.", "x".repeat(1499), "y".repeat(1800), "  - padded  "];
const LEVELS: Level[] = [null, { score: 2, k: "basic", date: "2026-10-01" }, { score: 5, k: "general", date: "2026-10-01" }, { score: 8, k: "advanced", date: "2026-10-01" }, { score: 10, k: "high", date: "2026-10-01" }, { score: 4, k: "nope", date: "2026-10-01" }];

const rest = (x: StyleRec): Omit<StyleRec, "id" | "date"> => {
  const { id: _id, date: _date, ...r } = x;
  void _id;
  void _date;
  return r;
};

const words = (n: number) => Array.from({ length: n }, (_, i) => ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"][i % 6]!).join(" ");

export const style: Engine = {
  name: "style",
  async capture(v1: V1, opts) {
    const w = v1.window as unknown as Record<string, unknown> & V1["window"];
    const d = v1.document;
    const ls = v1.window.localStorage;
    const plain = <T>(x: unknown): T => JSON.parse(JSON.stringify(x)) as T;
    const feat = (text: string) => plain<StyleFeat>(v1.call("styleFeatures", text));
    const field = (id: string) => d.getElementById(id) as HTMLInputElement & HTMLTextAreaElement;
    const reset = () => {
      ls.clear();
      field("styleProfile").value = "";
      field("styleOn").checked = false;
      field("styDecl").checked = false;
      field("styLiveText").value = "";
      field("styLiveText").dataset.pasted = "";
      field("styTryNoteIn").value = "";
      field("styleFileInfo").textContent = "";
    };

    // ---- features
    const features: TextCase[] = [...GOLDEN.map((g) => ({ ...g, f: feat(g.text) }))];
    if (features.length !== 12) throw new Error("style: twelve golden samples");
    if (features[11]!.f.vw.length !== 400) throw new Error(`style: g12 should fill the 400-word list, has ${features[11]!.f.vw.length}`);
    A_TEXTS.forEach((t, i) => features.push({ id: `a${i}`, note: "voice A", text: t, f: feat(t) }));
    features.push({ id: "b0", note: "voice B", text: B_TEXT, f: feat(B_TEXT) });
    SHORT_TEXTS.forEach((t, i) => features.push({ id: `s${i}`, note: "short", text: t, f: feat(t) }));
    for (const t of LIVE_TEXTS) features.push({ id: `l-${t.id}`, note: "typed", text: t.text, f: feat(t.text) });

    // ---- sample sets
    const ref = (...ids: string[]) => ids.map((of) => ({ id: of, of }));
    const aIds = A_TEXTS.map((_, i) => `a${i}`);
    const SETS: SetSpec[] = [
      { id: "none", note: "no samples", samples: [] },
      { id: "one-short", note: "one sample under 150 words", samples: ref("s0") },
      { id: "eleven-a-one-b", note: "eleven of voice A and one of voice B, all 300 words or more", samples: ref(...aIds, "b0") },
      { id: "six-a", note: "six of voice A", samples: ref(...aIds.slice(0, 6)) },
      { id: "three-long-and-short", note: "three long, three short: under four long ones", samples: ref(...aIds.slice(0, 3), "s0", "s1", "s2") },
      { id: "golden-twelve", note: "the twelve golden samples", samples: ref(...GOLDEN.map((g) => g.id)) },
      { id: "all-same", note: "four identical long samples", samples: [0, 1, 2, 3].map((i) => ({ id: `same${i}`, of: "a0" })) },
      { id: "a-and-b-and-short", note: "voice A (150 words or more), one B, short ones", samples: ref("a0", "a1", "b0", "s1", "s2") },
    ];
    const byId = new Map(features.map((x) => [x.id, x]));
    const recsOf = (spec: SetSpec): StyleRec[] => spec.samples.map((x) => ({ id: x.id, name: x.id, date: "2026-01-01", ...byId.get(x.of)!.f }));
    const sets: SetCase[] = [];
    for (const s of SETS) {
      reset();
      const recs = recsOf(s);
      ls.setItem("appu_style_samples", JSON.stringify(recs));
      const outliers = plain<Record<string, number>>(v1.call("styleOutliers", recs));
      const measured = v1.call<string>("styleMeasured");
      const compose = BULLETS.map((bullets) => ({ bullets, out: v1.call<string>("styleCompose", bullets) }));
      const compare = LIVE_TEXTS.map((t) => ({ id: `l-${t.id}`, out: plain<unknown>(v1.call("styleLiveCompare", t.text)) }));
      const vocabNote: SetCase["vocabNote"] = [];
      for (const on of [true, false]) {
        ls.setItem("appu_style_on", on ? "1" : "0");
        for (const [orig, res] of NOTES) vocabNote.push({ on, orig, res, out: v1.call<string>("styleVocabNote", orig, res) });
      }
      sets.push({ ...s, outliers, measured, compose, compare, vocabNote });
    }
    if (!sets.some((s) => Object.keys(s.outliers).length > 0)) throw new Error("style: no set flags an outlier; the outlier case would test nothing");
    if (!sets.some((s) => recsOf(s).filter((x) => x.n >= 300).length >= 4 && Object.keys(s.outliers).length === 0)) throw new Error("style: no set of four or more long samples flags none");
    const verdicts = new Set(sets.flatMap((s) => s.compare.map((c) => (c.out as { verdict?: string }).verdict ?? "no samples")));
    for (const v of ["consistent", "partly", "differs", "no samples"]) if (!verdicts.has(v)) throw new Error(`style: no compare case has the verdict ${v} (has ${[...verdicts].join(", ")})`);
    if (!sets.some((s) => s.vocabNote.some((n) => n.on && n.out !== ""))) throw new Error("style: no vocabulary note is ever written");

    // ---- styleAddSample
    const ADD: Array<{ id: string; steps: Array<{ name: string; text: string }> }> = [
      ...[0, 1, 79, 80, 81, 5000].map((n) => ({ id: `${n}-words`, steps: [{ name: "Essay.docx", text: words(n) }] })),
      { id: "repeat-name-and-size", steps: [{ name: "Essay.docx", text: words(100) }, { name: "Essay.docx", text: words(100) }, { name: "Essay.docx", text: words(101) }, { name: "Other.docx", text: words(100) }] },
      { id: "no-name", steps: [{ name: "", text: words(90) }] },
      { id: "long-name", steps: [{ name: "n".repeat(100), text: words(90) }] },
      { id: "spaces", steps: [{ name: "Spaced", text: ("  " + words(90).replace(/ /g, " \n\t ") + "  ") }] },
    ];
    const addSample: AddCase[] = [];
    const idShape = /^s[a-z0-9]+$/;
    const today = () => v1.eval<string>("new Date().toISOString().slice(0,10)");
    for (const c of ADD) {
      reset();
      const results: AddCase["results"] = [];
      for (const st of c.steps) {
        const r = plain<StyleRec | null>(v1.call("styleAddSample", st.name, st.text));
        results.push(r === null ? { rec: null, idOk: true, dateOk: true } : { rec: rest(r), idOk: idShape.test(r.id), dateOk: r.date === today() });
      }
      addSample.push({ ...c, results, after: (JSON.parse(ls.getItem("appu_style_samples") ?? "[]") as unknown[]).length });
    }
    // the hundredth-sample cut: v1 pushes the new record and keeps the first 100, so the new one is dropped
    reset();
    ls.setItem("appu_style_samples", JSON.stringify(Array.from({ length: 100 }, (_, i) => ({ ...byId.get("a0")!.f, id: `old${i}`, name: `Old ${i}`, date: "2026-01-01" }))));
    const cut = plain<StyleRec | null>(v1.call("styleAddSample", "New one", words(100)));
    const kept = JSON.parse(ls.getItem("appu_style_samples") ?? "[]") as Array<{ id: string }>;
    addSample.push({ id: "at-100", steps: [{ name: "New one", text: words(100) }], results: [cut === null ? { rec: null, idOk: true, dateOk: true } : { rec: rest(cut), idOk: idShape.test(cut.id), dateOk: cut.date === today() }], after: kept.length });
    if (kept.length !== 100 || kept.some((k) => !k.id.startsWith("old"))) throw new Error("style: the hundredth-sample cut is not what the port assumes (new record dropped)");

    // ---- vocabulary check
    reset();
    v1.call("styleVocabOpen");
    const box = d.getElementById("styVocabBox")!;
    const order: number[][] = [];
    box.querySelectorAll(".fld").forEach((q) => {
      order.push([...q.querySelectorAll<HTMLInputElement>("input[type=radio]")].map((r) => +r.value).filter((x) => x >= 0));
    });
    if (order.length !== 10) throw new Error("style: ten vocabulary questions");
    const vocabCases: VocabCase[] = [];
    const ANSWERS: Array<[string, number[]]> = [
      ...Array.from({ length: 11 }, (_, k): [string, number[]] => [`first-${k}-right`, Array.from({ length: 10 }, (_, i) => (i < k ? 0 : -1))]),
      ["all-wrong", Array.from({ length: 10 }, () => 2)],
      ["alternate", Array.from({ length: 10 }, (_, i) => (i % 2 ? 0 : 3))],
      ["last-6-right", Array.from({ length: 10 }, (_, i) => (i >= 4 ? 0 : 1))],
      ["seven-right", Array.from({ length: 10 }, (_, i) => (i < 7 ? 0 : 3))],
    ];
    for (const [id, answers] of ANSWERS) {
      ls.removeItem("appu_style_vocab_level");
      v1.call("styleVocabOpen");
      answers.forEach((a, i) => {
        const r = d.querySelector<HTMLInputElement>(`input[name="sv${i}"][value="${a}"]`);
        if (!r) throw new Error(`style: no radio sv${i}=${a}`);
        r.checked = true;
      });
      v1.call("styleVocabScore");
      vocabCases.push({ id, answers, stored: plain(JSON.parse(ls.getItem("appu_style_vocab_level") ?? "null")) as VocabCase["stored"] });
    }

    // ---- the live passage index
    const STORED: unknown[] = [undefined, 0, 1, 2, 3, 4, 5, 7, -1, -2, -4, 1.9, "2", "x", null, 1e12, 2 ** 31, 2 ** 32 + 1, -(2 ** 31)];
    const passages: FxPassages = [];
    for (const stored of STORED) {
      reset();
      if (stored !== undefined) ls.setItem("appu_style_meta", JSON.stringify({ livePassage: stored }));
      const at = v1.call<number>("styleLivePassage");
      v1.call("styleLiveNew");
      const m = JSON.parse(ls.getItem("appu_style_meta") ?? "{}") as { livePassage?: number };
      passages.push({ stored: stored === undefined ? null : stored, at, next: m.livePassage ?? null });
    }

    // ---- the guards: the smallest count that goes on
    const calls = v1.stubCallAI("- Warm tone.");
    const probe = async (name: string, from: number, to: number, go: (n: number) => Promise<void> | void, went: () => boolean) => {
      const res: boolean[] = [];
      for (let n = from; n <= to; n++) {
        reset();
        res.push(await (async () => { await go(n); return went(); })());
      }
      const first = res.indexOf(true);
      if (first <= 0 || res.slice(0, first).some(Boolean) || res.slice(first).some((x) => !x)) throw new Error(`style: ${name} has no clean threshold: ${res.map((x) => +x).join("")}`);
      return { refused: from + first - 1, accepted: from + first };
    };
    let before = 0;
    const analyse = await probe("styleAnalyze", 70, 90, async (n) => {
      field("styDecl").checked = true;
      v1.setEditorHtml(`<p>${words(n)}</p>`);
      before = calls.length;
      await v1.call<Promise<void>>("styleAnalyze");
    }, () => calls.length > before);
    const addG = await probe("styleAddSample", 70, 90, (n) => {
      before = (JSON.parse(ls.getItem("appu_style_samples") ?? "[]") as unknown[]).length;
      v1.call("styleAddSample", "Probe", words(n));
    }, () => (JSON.parse(ls.getItem("appu_style_samples") ?? "[]") as unknown[]).length > before);
    reset();
    ls.setItem("appu_style_samples", JSON.stringify([{ ...byId.get("a0")!.f, id: "a0", name: "a0", date: "2026-01-01" }]));
    const live = await (async () => {
      const res: boolean[] = [];
      for (let n = 50; n <= 70; n++) {
        field("styLiveText").value = words(n);
        field("styLiveOut").textContent = "";
        v1.call("styleLiveRun");
        res.push(!/^Type at least 60 words/.test(d.getElementById("styLiveOut")!.textContent ?? ""));
      }
      const first = res.indexOf(true);
      if (first <= 0 || res.slice(0, first).some(Boolean) || res.slice(first).some((x) => !x)) throw new Error(`style: styleLiveRun has no clean threshold: ${res.map((x) => +x).join("")}`);
      return { refused: 50 + first - 1, accepted: 50 + first };
    })();

    // ---- the profile
    const SAVE = ["  - Warm.  ", "", "z".repeat(1500), "z".repeat(1700), "\n\n  " + "q".repeat(1600) + "  \n"];
    const save: FxProfile["save"] = [];
    for (const typed of SAVE) {
      reset();
      field("styleProfile").value = typed;
      v1.call("styleSave");
      save.push({ typed, stored: ls.getItem("appu_style_profile") ?? "" });
    }
    const NOTE_PROFILES = ["", "- Warm tone.", "k".repeat(1495), "k".repeat(1800)];
    const NOTE_TYPED = ["too   formal\n and stiff", "   ", "", "m".repeat(300), "a  b"];
    const note: FxProfile["note"] = [];
    for (const profile of NOTE_PROFILES)
      for (const typed of NOTE_TYPED) {
        reset();
        ls.setItem("appu_style_profile", profile);
        field("styTryNoteIn").value = typed;
        v1.call("styleTryNoteSave");
        note.push({ profile, typed, stored: ls.getItem("appu_style_profile") });
      }
    const promptOut: FxProfile["prompt"] = [];
    for (const profile of PROFILES)
      for (const on of [null, "0", "1"])
        for (const level of LEVELS) {
          reset();
          if (profile !== null) ls.setItem("appu_style_profile", profile);
          if (on !== null) ls.setItem("appu_style_on", on);
          if (level) ls.setItem("appu_style_vocab_level", JSON.stringify(level));
          promptOut.push({ profile, on, level, out: v1.call<string>("stylePrompt") });
        }
    if (!promptOut.some((p) => p.out !== "") || !promptOut.some((p) => p.out === "")) throw new Error("style: stylePrompt should be both empty and not");
    const levelOut: FxProfile["level"] = LEVELS.map((level) => {
      reset();
      if (level) ls.setItem("appu_style_vocab_level", JSON.stringify(level));
      return { level, out: v1.call<string>("styleLevelRule") };
    });
    const corpus: StyleFx["corpus"] = [100, 15000, 15001, 20000].map((chars) => {
      const text = gen(700, Math.ceil(chars / 5) + 50, VOICE_MID).slice(0, chars);
      return { chars, text, out: v1.call<string>("styleSampleCorpus", text, 15000) };
    });

    // ---- the prompts, as the student's click sends them
    const rc = promptRecorder(v1, "style");
    const prompts: PromptRow[] = [];
    const keep = (c: PromptCase) => prompts.push(c as PromptRow);
    for (const t of [
      ["80 words", words(80)],
      ["a text with spaces round it", "\n  " + gen(501, 150, VOICE_MID) + "  \n"],
      ["5,000 characters (cut at 4,000)", gen(502, 900, VOICE_A).slice(0, 5000)],
      ["Hindi", HAND_HI.repeat(2)],
    ] as Array<[string, string]>) {
      reset();
      field("styDecl").checked = true;
      v1.setEditorHtml(`<p>${t[1].replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`);
      const text = v1.eval<string>("getEditorText()");
      keep(await rc.run("styleAnalyze", { note: t[0], text }, () => v1.call<Promise<void>>("styleAnalyze")));
    }
    const mkFile = (name: string, text: string) => new w.File([text], name, { type: "text/plain" });
    const FILES: Array<[string, Array<[string, string]>]> = [
      ["two small files", [["one.txt", gen(601, 120, VOICE_A)], ["two.txt", gen(602, 200, VOICE_MID)]]],
      ["one file and white space in it", [["spaced.txt", "  " + gen(603, 100, VOICE_A).replace(/ /g, "  \n\t ") + "  "]]],
      ["files over the 15,000-character corpus", [["big1.txt", gen(604, 1500, VOICE_A)], ["big2.txt", gen(605, 1500, VOICE_MID)], ["big3.txt", gen(606, 1500, VOICE_B)]]],
      ["an unreadable .doc and one good file", [["old.doc", "x"], ["good.txt", gen(607, 150, VOICE_A)]]],
    ];
    for (const [note2, files] of FILES) {
      reset();
      field("styDecl").checked = true;
      const input = { files: files.map(([n, t]) => mkFile(n, t)), value: "x" };
      const texts = files.map(([n, t]) => ({ name: n, text: t }));
      keep(await rc.run("styleAnalyzeFiles", { note: note2, files: texts }, () => v1.call<Promise<void>>("styleAnalyzeFiles", input)));
    }
    const PASS_CASES: Array<{ profile: string; on: string; level: Level; livePassage?: number }> = [
      { profile: "- Warm tone.\n- Short sentences.", on: "1", level: null, livePassage: 0 },
      { profile: "- Warm tone.\n- Short sentences.", on: "1", level: LEVELS[1]!, livePassage: 1 },
      { profile: "- Warm tone.", on: "1", level: LEVELS[2]!, livePassage: 2 },
      { profile: "- Warm tone.", on: "0", level: LEVELS[4]!, livePassage: 0 },
      { profile: "- Warm tone.", on: "0", level: null },
      { profile: "y".repeat(1800), on: "1", level: LEVELS[3]! },
    ];
    for (const c of PASS_CASES) {
      reset();
      ls.setItem("appu_style_profile", c.profile);
      ls.setItem("appu_style_on", c.on);
      if (c.level) ls.setItem("appu_style_vocab_level", JSON.stringify(c.level));
      if (c.livePassage !== undefined) ls.setItem("appu_style_meta", JSON.stringify({ livePassage: c.livePassage }));
      keep(await rc.run("styleTry", { ...c }, () => v1.call<Promise<void>>("styleTry")));
    }
    reset();

    const tables = { STY_FW: plain<string[]>(v1.eval("STY_FW")), STY_VOCAB: plain<unknown[]>(v1.eval("STY_VOCAB")), STY_BANDS: plain<unknown[]>(v1.eval("STY_BANDS")), STY_PASSAGES: plain<string[]>(v1.eval("STY_PASSAGES")) };
    console.log(`style: ${features.length} feature cases, ${sets.length} sets (outliers: ${sets.map((s) => Object.keys(s.outliers).length).join(",")}), ${addSample.length} add cases, ${vocabCases.length} vocab cases, ${promptOut.length} stylePrompt cases, ${prompts.length} prompts`);
    const body: StyleFx = { features, sets, addSample, vocab: { order, cases: vocabCases }, passages, guards: { analyse, addSample: addG, live }, profile: { save, note, prompt: promptOut, level: levelOut }, prompts, corpus };
    return [emitTables(v1, "style", "style-tables", tables, opts), writeFixture("style", "cases", body, v1, opts.check)];
  },
};

type FxPassages = StyleFx["passages"];
type FxProfile = StyleFx["profile"];
