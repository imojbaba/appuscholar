import { readFileSync } from "node:fs";
import type { Engine } from "../harness/engines";
import { writeFixture } from "../harness/fixture";
import { FIELDS, promptRecorder, textOf, threshold } from "../harness/prompt-record";
import type { Inputs, Paper } from "../research/capture";

/** research/inputs.json's ten results (Task 12), the papers the brief draws the literature review and gap finder from. */
const inputs = JSON.parse(readFileSync(new URL("../research/inputs.json", import.meta.url), "utf8")) as Inputs;

/** Which of those papers the two prompts of the Research tab quote: two without a retraction, and five that between them hold an abstract and none, a retraction, a missing year and venue, a Hindi title and a title with a line break. */
const TWO = [0, 1];
const FIVE = [0, 2, 3, 6, 9];

/** An abstract of 4,000 characters (rsQuickPrompt keeps its first 3,500, v1 8129), and a short one with the white space a pasted abstract carries at its ends (rsQuickP trims it, 8174). */
const ABSTRACT = textOf(4000, (i) => `Sentence ${i}: heavy social media use was linked to anxiety in 1,200 adolescents.`);
const SHORT_ABSTRACT = "   " + textOf(260, (i) => `Sentence ${i}: the pilot group slept less and reported more anxiety.`) + "  \n";

/** A question of 500 characters (rsRankPrompt keeps its first 400, 8207), typed with spaces at its ends: researchSearch (8284) reads the box with `.value.trim()`. */
const QUESTION = textOf(500, (i) => `Question ${i}: does heavy social media use raise anxiety in adolescents?`);
const TYPED_QUESTION = "  " + QUESTION + "  ";

/** The topics of the related-terms button: an ordinary one with spaces at its ends, and one of 400 characters (rsSuggestTerms keeps its first 300, 8256). */
const TOPICS = ["  social media use and adolescent anxiety  ", textOf(400, (i) => `Topic ${i}: sleep, screens and anxiety in adolescents.`)];

/** Two results added to the ten of inputs.json for the ranking: a title of 300 characters with an abstract of 1,200 (rsRankPrompt keeps 250 and 900, 8207), and an abstract of white space only. */
const LONG_TITLE = textOf(300, (i) => `Title ${i} of a long record on sleep and screens`);
const LONG_ABSTRACT = textOf(1200, (i) => `Abstract sentence ${i}: adolescents who slept less reported more anxiety.`);

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
/** A result as a search returns it: rsRank (8231) and rsQuickP (8180) add `rel` and `quick`, so inputs.json's papers lose them. */
const fresh = (p: Paper): Paper => {
  const c = clone(p);
  delete c.rel;
  delete c.quick;
  return c;
};

/**
 * Task 13's Research prompts (O7, part 1; v1 index.html): the quick read of an abstract (rsQuick 8171, rsQuickP 8172-8182, rsQuickPrompt 8128-8130), the ranking by fit (rsRank 8220-8234,
 * rsRankPrompt 8206-8208), the related terms (rsSuggestTerms 8251-8263), and the literature review and gap finder (researchLitReview 8530-8540, researchGapFinder 8541-8551). Each is driven the
 * way a student drives it, with callAI replaced by a recorder, and records the single callAI call: `prompt` and `opts` are exactly what v1 handed over (8177, 8227, 8256, 8537, 8548), `inputs` the
 * values the entry read and `label` is fieldName().
 * The brief calls rsQuickPrompt and rsRankPrompt "by direct call", but the options they are sent with (`temp`, `max` and `noLang`) exist only at the call sites, so the entries that make
 * the calls are driven, and the direct call is kept as a check: the capture throws unless rsQuickPrompt(abstract) and rsRankPrompt(question, items) return the prompt callAI received.
 * Preconditions, each met as a student meets it:
 * - rsQuick(0): the result list holds a paper whose abstract has at least 150 characters once white space is removed (8175); rsResults is assigned through eval, as rsApplySort assigns it.
 * - rsRank: it is reached from researchSearch (8319) with "Rank by fit" ticked (#rsRank), a topic typed (#rsTopic), and at most 12 results (rsRank sends 12 at a time, 8222); the two fetchers are
 *   replaced by stand-ins that hand back a fresh copy of the 12 results (inputs.json's ten and two more), made in v1's realm as fetch's json() would. The entry is recorded as "rsRank", the function that
 *   sends the prompt; `inputs.items` is the `title` and `abstract` of each result of rsResultsOriginal, the list researchSearch hands to rsRank (8315, 8319) and the only two fields rsRankPrompt reads.
 * - rsSuggestTerms: a topic of at least 3 characters in #rsTopic (8253).
 * - researchLitReview, researchGapFinder: at least 2 papers ticked (8532, 8543); rsCheckedPapers (8524) reads the ticked boxes of a result list, so it is replaced by a function that returns the papers.
 * Beyond the brief: `guards` finds, by trying every size, the abstract size at which the quick read starts to send, counted without white space (register row D-W1-4).
 */
export const promptsResearch: Engine = {
  name: "prompts-research",
  async capture(v1, { check }) {
    const { papers } = inputs;
    if (papers.length !== 10) throw new Error(`prompts-research: inputs.json must hold 10 papers, not ${papers.length}`);
    if (ABSTRACT.length !== 4000 || QUESTION.length !== 500 || TOPICS[1]!.length !== 400 || LONG_TITLE.length !== 300 || LONG_ABSTRACT.length !== 1200) throw new Error("prompts-research: the texts are not the sizes they exist for");
    const rec = promptRecorder(v1, "prompts-research");
    const w = v1.window as unknown as Record<string, unknown>;
    const field = (id: string) => {
      const el = v1.document.getElementById(id) as HTMLInputElement | null;
      if (!el) throw new Error(`prompts-research: v1 has no #${id}`);
      return el;
    };
    const inRealm = <T>(x: T): T => v1.eval<T>("(" + JSON.stringify(x) + ")");

    // The ranking's results: inputs.json's ten (OpenAlex and PubMed) and the two above, handed back by the stand-in fetchers (researchSearch calls them at 8307 and 8308).
    const results = [...papers.map(fresh), { ...fresh(papers[0]!), oaId: "W4200000098", title: LONG_TITLE, abstract: LONG_ABSTRACT }, { ...fresh(papers[2]!), oaId: "W4200000099", title: "A preprint with an abstract that is only white space", abstract: "   " }];
    const fetched = { oa: results.filter((p) => p.source === "OpenAlex"), pm: results.filter((p) => p.source === "PubMed") };
    if (fetched.oa.length + fetched.pm.length !== 12) throw new Error("prompts-research: the ranking needs exactly 12 results");
    const sent = { oa: 0, pm: 0 };
    w.rsFetchOpenAlex = async () => { sent.oa++; return inRealm(fetched.oa); };
    w.rsFetchPubmed = async () => { sent.pm++; return inRealm(fetched.pm); };

    /** rsQuick(0), the "Quick read" button of the first result, on a paper with this abstract; the capture also asks rsQuickPrompt for the prompt of the trimmed abstract. */
    const quick = async (abstract: string) => {
      v1.eval("rsResults=" + JSON.stringify([{ ...fresh(papers[0]!), abstract }]));
      const c = await rec.run("rsQuick", { abstract }, () => v1.call<Promise<boolean>>("rsQuick", 0));
      if (v1.call<string>("rsQuickPrompt", abstract.trim()) !== c.prompt) throw new Error("prompts-research: rsQuickPrompt(abstract) is not the prompt rsQuick sent");
    };

    for (const f of FIELDS) {
      rec.setField(f);

      for (const topic of TOPICS) {
        v1.setValue("rsTopic", topic);
        await rec.run("rsSuggestTerms", { topic }, () => v1.call<Promise<void>>("rsSuggestTerms"));
      }

      for (const abstract of [ABSTRACT, SHORT_ABSTRACT]) await quick(abstract);

      // The Search button with "Rank by fit" ticked.
      v1.setValue("rsTopic", TYPED_QUESTION);
      field("rsSrcOA").checked = true;
      field("rsSrcPubmed").checked = true;
      field("rsRank").checked = true;
      const rank: Record<string, unknown> = { question: TYPED_QUESTION };
      const toasts = v1.toasts.length, fetchedBefore = [sent.oa, sent.pm];
      const c = await rec.run("rsRank", rank, async () => {
        await v1.call<Promise<void>>("researchSearch");
        rank.items = clone(v1.eval<Array<{ title: string; abstract?: string }>>("rsResultsOriginal")).map((p) => ({ title: p.title, abstract: p.abstract }));
      });
      const items = rank.items as Array<{ title: string; abstract?: string }>;
      if (items.length !== 12) throw new Error(`prompts-research: rsRank was handed ${items.length} results, not 12`);
      if (sent.oa !== fetchedBefore[0]! + 1 || sent.pm !== fetchedBefore[1]! + 1) throw new Error("prompts-research: researchSearch did not call each stand-in once");
      if (v1.toasts.length !== toasts) throw new Error(`prompts-research: researchSearch showed a toast: ${v1.toasts.slice(toasts).join(" | ")}`);
      if (v1.call<string>("rsRankPrompt", TYPED_QUESTION.trim(), clone(items)) !== c.prompt) throw new Error("prompts-research: rsRankPrompt(question, items) is not the prompt rsRank sent");
      field("rsRank").checked = false;

      // The literature review and the gap finder on the papers a student has ticked.
      for (const ids of [TWO, FIVE]) {
        const ticked = ids.map((i) => clone(papers[i]!));
        w.rsCheckedPapers = () => ticked;
        for (const entry of ["researchLitReview", "researchGapFinder"]) await rec.run(entry, { ids, papers: ticked }, () => v1.call<Promise<void>>(entry));
      }
    }

    // The abstract size at which the quick read starts to send: n non-white-space characters, written with a space between each, so that the white space is not counted.
    let toast = "";
    const spaced = (n: number) => Array.from({ length: n }, () => "x").join(" ");
    const guards = {
      rsQuick: {
        ...(await threshold("rsQuick", 300, async (n) => {
          const before = rec.calls.length, seen = v1.toasts.length;
          v1.eval("rsResults=" + JSON.stringify([{ ...fresh(papers[0]!), abstract: spaced(n) }]));
          await v1.call<Promise<boolean>>("rsQuick", 0);
          const made = rec.calls.length - before;
          if (made > 1) throw new Error(`prompts-research: a probe made ${made} callAI calls`);
          if (made === 0) toast = v1.toasts.slice(seen).join(" | ");
          return made === 1;
        })),
        toast,
      },
    };
    return [writeFixture("prompts-research", "cases", { cases: rec.cases, guards }, v1, check)];
  },
};
