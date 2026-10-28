import type { Engine } from "../harness/engines";
import { writeFixture } from "../harness/fixture";
import { FIELDS, promptRecorder, textOf, threshold } from "../harness/prompt-record";

type Stage = { k: string; name: string; ask: string; brief: string; terms: string };
type Step = { k: string; title: string; said: string; flaw: string };
type Pick = { text: string; partial: boolean; n: number; of: number };
type Aiu = { k: string; g: string } | null;
type Opts = Record<string, unknown>;
type Base = { entry: string; field: string; stored: string | null; doc: Record<string, unknown>; prompt: string; opts: Opts; aiu: Aiu };
type AskCase = Base & { question: string; pick: Omit<Pick, "text"> };
type WalkCase = Base & { stage: Stage; attempt: string; pick: Omit<Pick, "text"> };
type LessonCase = Base & { lang: "en" | "hi"; step: Step; teacher: string; question: string };

/**
 * The menu choice among the values of appu_field the harness's FIELDS (Task 13) holds: never set (v1 then says "psychology"), this one, and a custom field of 70 characters whose label keeps a
 * trailing space. The captured `field` of a case is the label v1's fieldName() made of the stored value, which is what the builders take; `stored` is the stored value.
 */
const EDUCATION = "education";

/**
 * A pasted paper for the picker's scoring branch. v1 hands apPick the whole paper when its text is not more than 1.5 times the budget (9,000 for an ask, 10,000 for a stage), and the
 * practice paper's 5,317 characters never reach that, so a paper of about 19,000 characters stands in for a student's own: nine headings v1 recognises (AP_HEADS, 9853), one paragraph
 * per line, each of 720 characters or more and ending in a full stop, which is where apBuild (9862-9881) cuts a piece, and a short reference list that apBuild keeps out of the picks. It is not
 * paged (src "paste", one page), so the picks carry `[ text, Section ]` headings where the practice paper's carry `[ page 1, Section ]`. The sentences repeat a few phrases per section, so that
 * the pieces score differently for a question, and for the words of a stage.
 */
type Section = { heading: string; paragraphs: number; phrases: string[] };
const SECTIONS: Section[] = [
  { heading: "Abstract", paragraphs: 1, phrases: ["the aim of weekly peer mentoring", "the sample size of 180 students", "the Cronbach alpha of the persistence scale", "the t-test on persistence scores", "the main limitation of one campus"] },
  { heading: "Introduction", paragraphs: 4, phrases: ["the gap in earlier literature on mentoring", "the aim and the hypothesis of this study", "what previous research found about first-year dropout", "how little is known about weekly mentors", "the research question about persistence", "the studies reviewed by Rao et al."] },
  { heading: "Method", paragraphs: 2, phrases: ["the randomised design with two groups", "the survey given to every student", "the interview held with each mentor", "the conditions compared across the term", "the method of assigning students to groups"] },
  { heading: "Participants", paragraphs: 3, phrases: ["the participants recruited from three colleges", "the sample size and the total number of students", "the mean age and the age range of the sample", "the inclusion criteria for first-year students", "the exclusion criteria and the power analysis"] },
  { heading: "Measures", paragraphs: 3, phrases: ["the persistence questionnaire with twelve items", "the scale used to measure belonging", "the Cronbach alpha for each instrument", "the reliability and validity of the inventory", "the items scored from one to five"] },
  { heading: "Procedure", paragraphs: 2, phrases: ["the procedure followed in each college", "the informed consent signed by every participant", "the ethics committee approval for the study", "the debrief given after the last session", "the anonymous and voluntary nature of the survey"] },
  { heading: "Results", paragraphs: 4, phrases: ["the results shown in the first table", "the mean and SD of each group in the figure", "the significant difference between the groups", "the correlation between belonging and persistence", "the t-test, the anova and the regression", "the effect size and the p value of the test"] },
  { heading: "Discussion", paragraphs: 3, phrases: ["the conclusion that mentoring may help", "what the results suggest and indicate", "the support for the hypothesis", "the recommendation for colleges", "the implications for practice and future research", "what the statistics can and cannot show"] },
  { heading: "Limitations", paragraphs: 2, phrases: ["the limitation of a small sample", "the bias of self-report", "the caution needed before any generalisation", "the single campus and the short term"] },
];
const TEMPLATES: Array<(a: string, b: string, n: number) => string> = [
  (a, b, n) => `Paragraph ${n} of this report turns to ${a} and then to ${b}.`,
  (a, b) => `The authors give ${a} first, and they set ${b} beside it for the reader.`,
  (a, b, n) => `For the ${n}th group of students, ${a} was written down with ${b}.`,
  (a, b) => `A careful reader can compare ${a} with ${b} without leaving this page.`,
  (a, b) => `Nothing else in this part of the paper is as long as the note on ${a} and ${b}.`,
  (a, b, n) => `Note ${n} adds that ${a} cannot be read apart from ${b}.`,
  (a, b) => `Both ${a} and ${b} are returned to in the next section.`,
];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One paragraph of section `s`: whole sentences, taken in turn from TEMPLATES with the phrases of the section, until it has at least 720 characters. */
function paragraph(s: Section, j: number): string {
  let text = "";
  for (let k = 0; text.length < 720; k++) {
    const make = TEMPLATES[(j * 3 + k) % TEMPLATES.length]!;
    const a = s.phrases[(j + k) % s.phrases.length]!, b = s.phrases[(j + 2 * k + 1) % s.phrases.length]!;
    text += (text ? " " : "") + cap(make(a, b, j * 10 + k + 1));
  }
  return text;
}

const PASTED_TITLE = "Weekly peer mentoring and first-year persistence in three colleges: a pasted report";
function pastedPaper(): string {
  const lines = [PASTED_TITLE];
  let j = 0;
  for (const s of SECTIONS) {
    lines.push(s.heading);
    for (let p = 0; p < s.paragraphs; p++) lines.push(paragraph(s, j++));
  }
  lines.push("References", "Rao, P., Mehta, S., & Iyer, L. (2019). Peer support and persistence in first-year students. Journal of Student Retention, 12(3), 201-219.", "Nair, A. (2021). Why students leave: a review. Higher Education Quarterly, 33(1), 5-27.");
  return lines.join("\n");
}

/** The question of the brief, and three more: one typed with white space at its ends (apAsk trims it, 10035); one of 700 characters (the prompt keeps the first 600, 10039); one of 718 whose last 68 hold the only words that name anything in the pasted paper (apPick is given the whole question, 10038, and the prompt only 600 of it). */
const QUESTION = "What was the sample size?";
const PADDED_QUESTION = "  Why did the authors use a waiting group?\n  ";
const LONG_QUESTION = textOf(700, (i) => `Question ${i}: why did the authors use a waiting group?`);
const TAIL_QUESTION = textOf(650, (i) => `zqx${i}`) + " And how was the Cronbach alpha of the questionnaire scale reported?";

/** The attempts of a walk-through: 900 characters (apWalkShow keeps the first 700, 10055), the same with white space at its ends (it trims first, 10051), white space only (v1 then says "(nothing)"), and a short one. */
const ATTEMPT = textOf(900, (i) => `Sentence ${i}: the authors say earlier work only watched students.`);
const PADDED_ATTEMPT = "   " + ATTEMPT + "  \n";
const BLANK_ATTEMPT = " \t\n ";
const SHORT_ATTEMPT = "  The t-test shows that mentoring works.  ";

/** The questions of the lesson: the box is a single line, so v1's own input drops a line break, and apLesAsk makes every run of white space a single space and trims (11164); the longest question v1 sends is 400 characters (11167). */
const LESSON_QUESTION = "Why does the coin toss matter?";
const SPACED_QUESTION = "  Why does   the coin toss\tmatter  for this step?  ";
const LONGEST_QUESTION = textOf(400, (i) => `Q${i}: why does the coin toss matter?`);

/**
 * Task 14's prompts for Analyse a paper (O7, part 2; v1 index.html): a question about the loaded paper (apAsk 10032-10047, prompt 10039), one stage of the walk-through (apWalkShow 10048-10064,
 * prompt 10055) and a question inside the guided lesson (apLesAsk 11162-11181, prompt 11171). apCall (10027-10030) sends the first two with {max:2000,temp:0.2,noLang:true}; apLesAsk sends its own
 * with {temp:0.4,max:350,noLang:true}. Each is driven the way a student drives it, with callAI replaced by a recorder (Task 13's promptRecorder), and records the single callAI call: `prompt` and
 * `opts` are exactly what v1 handed over, `field` is fieldName() (what the builders take) and `stored` the raw appu_field (null when unset), `doc` is AP.doc as v1 held it (apBuild's object plus
 * the `abstractOnly` that apLoad adds, 9886), and `aiu` is aiuClassify(prompt).
 * - `asks`: `{ entry, field, stored, question, doc, pick, prompt, opts, aiu }`; `question` is AP.qDraft as typed, with its spaces. `pick` is `{ partial, n, of }` of apPick(q, "", 9000), re-run
 *   with the question apAsk read (v1's own `(AP.qDraft||'').trim()`, 10035); the capture throws unless the prompt ends with the text that call returns.
 * - `walks`: `{ entry, field, stored, stage, attempt, doc, pick, prompt, opts, aiu }`; `stage` is AP_STAGES[AP.stage] (`k`, `name`, `ask`, `brief`, `terms`) and `attempt` AP.tryDraft[stage.k] as typed.
 *   `pick` is of apPick(stage.name + " " + stage.brief, stage.terms, 10000), re-run and checked the same way.
 * - `lessons`: `{ entry, field, stored, lang, step, teacher, question, doc, prompt, opts, aiu }`; `lang` is apLectLang() (the stored appu_lectlang: "hi" or, for anything else, "en"), `step` is
 *   AP_LESSON.steps[AP.les.i] cut to the four fields the prompt reads (`k`, `title`, `said`, `flaw`; the lesson itself is Wave 3's), `teacher` is apLesTeacher(step.k) and `question` what the box
 *   held when apLesAsk read it.
 * - `guards`: where apLesAsk starts to turn a question away, found by trying every size (the register's D-W1-4 way, Task 13): `sends` is the largest question it sends, `refuses` the smallest
 *   it turns away, `message` what it writes in #apLesAskOut then, and `inputMaxLength` the maxlength of the box itself (11216), which no typed question can pass.
 * Matrix: the pasted paper (asks: two; walks: two) first, so that the first record of each is a partial pick; then the practice paper, under the three values of appu_field: the ask of the brief
 * under each, a padded and a 700-character question; the 12 stages with an empty attempt and with the 900-character attempt, the field going round the three values with the stage (the field
 * enters a prompt once and does not meet the stage or the attempt; the full product would be 72 walks of 29 KB), a padded 900-character attempt and a white-space-only one; the lesson for the
 * first step and the `procedure` step, in `en` and `hi`, under each field, the `lit` step (a second teacher, but the subject of the first) in both languages, a question with white space, one
 * of 400 characters, and one with the pasted paper as AP.doc.
 * Preconditions, each met as a student meets it:
 * - apAsk, apWalkShow: a paper is loaded and apOk() (9896) holds: the practice paper (apSample, 9932: its flag `sample` makes apOk true), or the pasted one, loaded by apLoad (9882) with the
 *   box #apOK ticked; AP.busy is false; for the ask, AP.qDraft holds at least 4 characters once trimmed (10035). AP.qDraft, AP.stage and AP.tryDraft are set through eval, as the page's own
 *   handlers (apDraft 10116, apSetStage 10115) do, without the redraws.
 * - apLesAsk: the practice paper is loaded, the lesson tab is open (apSet("mode", "lesson"), 10114) and the step is chosen (apLesStep 10225, the step's button), which draws #apLesQ (11216);
 *   AP.les.asking is false; the question has between 1 and 400 characters once its white space is made single (11166-11167). appu_lectlang is set for "hi" and removed for "en".
 * The one record with the pasted paper in a lesson stands for the cut at 6,500 characters (11170): the practice paper has 5,317 characters, so no lesson on it reaches the cut, and v1's page
 * offers the lesson on no other paper (apRender, 11278, turns the lesson tab into the ask tab for a paper that is not the sample). So AP.doc is replaced by the pasted paper, through eval, after
 * the lesson is drawn and before the question is asked; apLesAsk does not look at which paper it is.
 */
export const promptsAnalyse: Engine = {
  name: "prompts-analyse",
  async capture(v1, { check }) {
    if (FIELDS.length !== 3 || FIELDS[0] !== null || FIELDS[1] !== EDUCATION || FIELDS[2]!.length !== 70) throw new Error("prompts-analyse: the harness's FIELDS are not unset, education and a custom field of 70 characters");
    if (ATTEMPT.length !== 900 || LONG_QUESTION.length !== 700 || LONGEST_QUESTION.length !== 400 || TAIL_QUESTION.length !== 718 || TAIL_QUESTION.slice(0, 600).includes("Cronbach")) throw new Error("prompts-analyse: the texts are not the sizes they exist for");
    const rec = promptRecorder(v1, "prompts-analyse");
    const ls = v1.window.localStorage;
    const w = v1.window as unknown as Record<string, unknown>;
    const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
    const stages = clone(v1.eval<Stage[]>("AP_STAGES"));
    const steps = clone(v1.eval<Array<Step & Record<string, unknown>>>("AP_LESSON.steps")).map(({ k, title, said, flaw }): Step => ({ k, title, said, flaw }));
    if (stages.length !== 12 || stages.some((s) => Object.keys(s).join() !== "k,name,ask,brief,terms")) throw new Error("prompts-analyse: AP_STAGES is not twelve stages of k, name, ask, brief and terms");
    const stepIndex = (k: string) => {
      const i = steps.findIndex((s) => s.k === k);
      if (i < 0) throw new Error(`prompts-analyse: AP_LESSON has no step ${k}`);
      return i;
    };
    if (v1.eval("AP.doc") !== null) throw new Error("prompts-analyse: v1 has a paper loaded before the capture loads one");

    const docNow = () => clone(v1.eval<Record<string, unknown>>("AP.doc"));
    const pickOf = (q: string, terms: string, budget: number, prompt: string, what: string): Omit<Pick, "text"> => {
      const pk = v1.call<Pick>("apPick", q, terms, budget);
      if (!prompt.endsWith("PAPER START\n" + pk.text + "\nPAPER END")) throw new Error(`prompts-analyse: ${what}: the prompt does not end with the text of apPick(q, ${JSON.stringify(terms)}, ${budget})`);
      return { partial: pk.partial, n: pk.n, of: pk.of };
    };

    const ask = async (stored: string | null, question: string): Promise<AskCase> => {
      rec.setField(stored);
      v1.eval("AP.qDraft=" + JSON.stringify(question));
      const q = v1.eval<string>("(AP.qDraft||'').trim()"); // v1's own (10035), before apAsk empties AP.qDraft
      const c = await rec.run("apAsk", { question }, () => v1.call<Promise<void>>("apAsk"));
      return { entry: c.entry, field: c.label, stored: c.field, question, doc: docNow(), pick: pickOf(q, "", 9000, c.prompt, "apAsk"), prompt: c.prompt, opts: c.opts, aiu: c.aiu };
    };

    const walk = async (stored: string | null, i: number, attempt: string): Promise<WalkCase> => {
      rec.setField(stored);
      v1.eval("AP.stage=" + i);
      v1.eval("AP.tryDraft[AP_STAGES[" + i + "].k]=" + JSON.stringify(attempt));
      const stage = clone(stages[i]!);
      const c = await rec.run("apWalkShow", { stage: stage.k, attempt }, () => v1.call<Promise<void>>("apWalkShow"));
      return { entry: c.entry, field: c.label, stored: c.field, stage, attempt, doc: docNow(), pick: pickOf(stage.name + " " + stage.brief, stage.terms, 10000, c.prompt, "apWalkShow " + stage.k), prompt: c.prompt, opts: c.opts, aiu: c.aiu };
    };

    /** The lesson tab is open on the practice paper; the student chooses step `j`, types into the box, and presses Ask. `swap` replaces AP.doc once the lesson is drawn. */
    const lesson = async (stored: string | null, j: number, lang: "en" | "hi", question: string, swap?: unknown): Promise<LessonCase> => {
      rec.setField(stored);
      if (lang === "hi") ls.setItem("appu_lectlang", "hi");
      else ls.removeItem("appu_lectlang");
      v1.call("apLesStep", j);
      v1.setValue("apLesQ", question);
      const asked = (v1.document.getElementById("apLesQ") as HTMLInputElement).value;
      if (asked !== question) throw new Error(`prompts-analyse: the box changed the question ${JSON.stringify(question.slice(0, 40))}`);
      if (swap !== undefined) {
        w.__swap = swap;
        v1.eval("AP.doc=__swap");
      }
      if (v1.eval<number>("AP.les.i") !== j || v1.eval<string>("apLectLang()") !== lang) throw new Error("prompts-analyse: the lesson is not on the step and in the language asked for");
      const c = await rec.run("apLesAsk", { question }, () => v1.call<Promise<void>>("apLesAsk"));
      const s = steps[j]!;
      const step = clone(v1.eval<Step & Record<string, unknown>>("AP_LESSON.steps[AP.les.i]"));
      if (step.k !== s.k) throw new Error("prompts-analyse: AP.les.i moved during the call");
      return { entry: c.entry, field: c.label, stored: c.field, lang, step: { k: step.k, title: step.title, said: step.said, flaw: step.flaw }, teacher: v1.eval<string>("apLesTeacher(AP_LESSON.steps[AP.les.i].k)"), question: asked, doc: docNow(), prompt: c.prompt, opts: c.opts, aiu: c.aiu };
    };

    // The pasted paper first: loaded as a student's own, with the box about the paper ticked.
    const paper = pastedPaper();
    const asks: AskCase[] = [], walks: WalkCase[] = [], lessons: LessonCase[] = [];
    const before = v1.toasts.length;
    if (v1.call("apLoad", "Pasted", [paper], "paste", false) !== true) throw new Error(`prompts-analyse: v1's apLoad refused the pasted paper: ${v1.toasts.slice(before).join(" | ")}`);
    if (v1.call<boolean>("apOk")) throw new Error("prompts-analyse: apOk() holds before the box is ticked");
    (v1.document.getElementById("apOK") as HTMLInputElement).checked = true;
    if (!v1.call<boolean>("apOk")) throw new Error("prompts-analyse: apOk() does not hold after the box is ticked");
    const pasted = v1.eval<{ chars: number; sample: boolean; refsCut: boolean; paged: boolean }>("AP.doc");
    if (pasted.chars < 16000 || pasted.sample || !pasted.refsCut || pasted.paged) throw new Error(`prompts-analyse: the pasted paper has ${pasted.chars} characters, sample ${String(pasted.sample)}, refsCut ${String(pasted.refsCut)}, paged ${String(pasted.paged)}`);
    const pastedDoc = v1.eval<unknown>("AP.doc");
    asks.push(await ask(EDUCATION, QUESTION), await ask(EDUCATION, TAIL_QUESTION));
    walks.push(await walk(EDUCATION, 0, ATTEMPT), await walk(EDUCATION, 7, SHORT_ATTEMPT));
    for (const c of [...asks, ...walks]) if (!c.pick.partial) throw new Error(`prompts-analyse: a pick on the pasted paper is not partial (${c.entry})`);

    // The practice paper.
    v1.call("apSample");
    if (!v1.call<boolean>("apOk")) throw new Error("prompts-analyse: apOk() does not hold for the practice paper");
    for (const f of FIELDS) asks.push(await ask(f, QUESTION));
    asks.push(await ask(null, PADDED_QUESTION), await ask(EDUCATION, LONG_QUESTION));
    for (let i = 0; i < stages.length; i++) for (const attempt of ["", ATTEMPT]) walks.push(await walk(FIELDS[i % FIELDS.length] ?? null, i, attempt));
    walks.push(await walk(null, 2, PADDED_ATTEMPT), await walk(EDUCATION, 7, BLANK_ATTEMPT));

    // The lesson.
    v1.call("apSet", "mode", "lesson");
    for (const f of FIELDS) for (const k of ["gap", "procedure"]) for (const lang of ["en", "hi"] as const) lessons.push(await lesson(f, stepIndex(k), lang, LESSON_QUESTION));
    lessons.push(await lesson(EDUCATION, stepIndex("lit"), "en", LESSON_QUESTION), await lesson(null, stepIndex("lit"), "hi", LESSON_QUESTION));
    lessons.push(await lesson(EDUCATION, stepIndex("gap"), "en", SPACED_QUESTION), await lesson(EDUCATION, stepIndex("gap"), "en", LONGEST_QUESTION));
    lessons.push(await lesson(EDUCATION, stepIndex("gap"), "en", LESSON_QUESTION, pastedDoc));
    v1.call("apSample");
    v1.call("apSet", "mode", "lesson");

    // Where apLesAsk starts to turn a question away: a question of n characters (no white space to collapse), tried at every size from 1 to 450.
    v1.call("apLesStep", 0);
    let message = "";
    const sends = async (n: number) => {
      const seen = rec.calls.length;
      v1.setValue("apLesQ", "x".repeat(n));
      await v1.call<Promise<void>>("apLesAsk");
      const made = rec.calls.length - seen;
      if (made > 1) throw new Error(`prompts-analyse: a probe made ${made} callAI calls`);
      if (made === 0) message = v1.document.getElementById("apLesAskOut")?.textContent ?? "";
      return made === 1;
    };
    // `threshold` looks for the smallest size that is accepted; asked whether v1 turns a size away, its `refused` is the largest size v1 sends and its `accepted` the smallest it turns away.
    const edge = await threshold("apLesAsk", 450, async (n) => !(await sends(n)));
    const guards = { apLesAsk: { sends: edge.refused, refuses: edge.accepted, message, inputMaxLength: Number(v1.document.getElementById("apLesQ")?.getAttribute("maxlength")) } };
    return [writeFixture("prompts-analyse", "cases", { asks, walks, lessons, guards }, v1, check)];
  },
};
