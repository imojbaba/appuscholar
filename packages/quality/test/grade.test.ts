import { describe, it, expect } from "vitest";
import {
  apBuild, apCheckQuote, classifyAiUse, rsCorpusText,
  buildIdeaPromptV2, buildShelfSummaryPromptV2, buildGapFinderPromptV2, buildLitReviewPrompt, buildAskPrompt, buildWalkPrompt, AP_STAGES
} from "@appuscholar/core";
import type { RsPaper } from "@appuscholar/core";
import { gradeQuotes, gradeNumbers, gradeAreas, gradeLimitations, gradeGapNames, gradeLabel } from "../src/grade";
import { SETS, SET_NAMES, validateSet } from "../src/sets";
import type { AbstractPaper, AskInput, GapInput, IdeaInput, PaperWithText, QualityItem, SetName, SummaryInput, WalkInput } from "../src/sets";

/* ---- the graders: one hand-written good reply and one bad reply each ---------------------------------------------------------------------------- */

const doc = apBuild("Practice paper", [
  "Abstract\nSixty first-year students from one college were randomly placed in a routine group or a waiting group.\n\nMethod\nWe measured exam anxiety with a short questionnaire after one week."
], "pdf");
const QUOTE_A = "Sixty first-year students from one college were randomly placed in a routine group or a waiting group.";
const QUOTE_B = "We measured exam anxiety with a short questionnaire after one week.";

describe("gradeQuotes", () => {
  it("counts every quotation of a good reply as found when it is copied from the paper", () => {
    const reply = JSON.stringify({ in_paper: true, answer: "Sixty students took part.", quotes: [QUOTE_A, QUOTE_B] });
    expect(gradeQuotes(doc, reply)).toEqual({ quotes: 2, found: 2 });
  });
  it("does not count a quotation that was changed, or one too short to check", () => {
    const reply = JSON.stringify({ in_paper: true, answer: "x", quotes: ["Sixty first-year students were randomly assigned to a routine or waiting group at one college.", QUOTE_B, "after one week"] });
    expect(gradeQuotes(doc, reply)).toEqual({ quotes: 3, found: 1 });
  });
  it("reads the quotation marks of a reply that is not JSON", () => {
    const reply = `The authors write "${QUOTE_B}" and also "this sentence is nowhere in the paper at all".`;
    expect(gradeQuotes(doc, reply)).toEqual({ quotes: 2, found: 1 });
  });
  it("is zero and zero for a reply with no quotations", () => {
    expect(gradeQuotes(doc, JSON.stringify({ in_paper: false, answer: "This paper does not say.", quotes: [] }))).toEqual({ quotes: 0, found: 0 });
    expect(gradeQuotes(doc, "No quotation here.")).toEqual({ quotes: 0, found: 0 });
  });
  it("agrees with apCheckQuote on each quotation", () => {
    expect(apCheckQuote(doc, QUOTE_A).ok).toBe(true);
    expect(gradeQuotes(doc, JSON.stringify({ quotes: [QUOTE_A] })).found).toBe(1);
  });

  describe("a reply that is meant to be JSON but does not parse", () => {
    it("reads the quotes array with a trailing comma, not the keys and values around it", () => {
      const reply = `{"in_paper": true, "answer": "Sixty students took part.", "quotes": ["${QUOTE_A}", "${QUOTE_B}",]}`;
      expect(gradeQuotes(doc, reply)).toEqual({ quotes: 2, found: 2 });
    });
    it("reads the quotes of an answer with unescaped inner quotation marks", () => {
      const reply = `{"in_paper": true, "answer": "The authors call the groups "routine" and "waiting".", "quotes": ["${QUOTE_A}", "${QUOTE_B}"]}`;
      expect(gradeQuotes(doc, reply)).toEqual({ quotes: 2, found: 2 });
    });
    it("keeps a quotation that has unescaped inner quotation marks as one quotation", () => {
      const reply = `{"in_paper": true, "answer": "x", "quotes": ["The group was called "routine" and the other "waiting" in the paper", "${QUOTE_B}"]}`;
      expect(gradeQuotes(doc, reply)).toEqual({ quotes: 2, found: 1 });
    });
    it("reads the complete quotations of a reply cut off in the quotes array", () => {
      const cut = `{"in_paper": true, "answer": "Sixty students took part.", "quotes": ["${QUOTE_A}", "${QUOTE_B}"`;
      expect(gradeQuotes(doc, cut)).toEqual({ quotes: 2, found: 2 });
      expect(gradeQuotes(doc, `{"in_paper": true, "answer": "x", "quotes": ["${QUOTE_A}", "${QUOTE_B.slice(0, 30)}`)).toEqual({ quotes: 1, found: 1 });
      expect(gradeQuotes(doc, `{"in_paper": true, "answer": "Sixty students took part.", "quotes": ["${QUOTE_A}",`)).toEqual({ quotes: 1, found: 1 });
    });
    it("is zero and zero when it has no quotes array, or the reply is cut off before it", () => {
      expect(gradeQuotes(doc, `{"in_paper": true, "answer": "Sixty students took part", "quotes"`)).toEqual({ quotes: 0, found: 0 });
      expect(gradeQuotes(doc, `{"in_paper": false, "answer": "This paper does not say.", "quotes": [],}`)).toEqual({ quotes: 0, found: 0 });
      expect(gradeQuotes(doc, `{"in_paper": true, "answer": "The authors write "${QUOTE_B}" and nothing else."`)).toEqual({ quotes: 0, found: 0 });
    });
    it("does not read the strings that come after the quotes array", () => {
      const reply = `{"quotes": ["${QUOTE_A}",], "answer": "A long answer that is not a quotation at all.", "in_paper": true}`;
      expect(gradeQuotes(doc, reply)).toEqual({ quotes: 1, found: 1 });
    });
    it("reads a quotes array without the braces around it", () => {
      expect(gradeQuotes(doc, `"quotes": ["${QUOTE_A}", "${QUOTE_B}"]`)).toEqual({ quotes: 2, found: 2 });
    });
  });
});

describe("gradeNumbers", () => {
  const source = "We studied 120 students, 45.5% of them women (Smith, 2019). The mean score was 3.2 (p < .05). Of 1,200 invited, 120 agreed.";
  it("finds no foreign number in a reply that uses only the source's numbers", () => {
    const good = "The study had 120 students and 45.5% were women. The score was 3.2, p < 0.05, as Smith (2019) reported; 1200 were invited.";
    expect(gradeNumbers(source, good)).toEqual({ foreign: [] });
  });
  it("lists the numbers of the reply that the source does not hold", () => {
    const bad = "The study had 150 students and 60% were women; the mean score was 3.2.";
    expect(gradeNumbers(source, bad)).toEqual({ foreign: ["150", "60%"] });
  });
  it("does not count the numbers that only number a list or a paper", () => {
    expect(gradeNumbers(source, "Gap 1 (Empirical): 120 students is small.\n2. A second line (paper 3, [4]).")).toEqual({ foreign: [] });
  });
  it("reads a number inside a quotation of the source as the source's", () => {
    expect(gradeNumbers('The authors report "a total of 77 participants" in the sample.', "There were 77 participants.")).toEqual({ foreign: [] });
  });

  describe("numbers inside quotation marks and inside JSON replies", () => {
    const paper = "The sample was 1842 students from 12 colleges; 48% of the 3,100 invited took part.";
    it("finds a foreign number in the answer of an Ask reply", () => {
      const reply = JSON.stringify({ in_paper: true, answer: "The study had 2,500 students, recruited at 7 universities.", quotes: [] });
      expect(gradeNumbers(paper, reply)).toEqual({ foreign: ["2500", "7"] });
    });
    it("finds a foreign number in a field of a Walk-through reply", () => {
      const reply = JSON.stringify({ reading: "You noted the sample.", quotes: [], not_stated: [], watch_for: "Only 48% of those invited took part.", check_question: "How many colleges?", check_answer: "There were 15 colleges." });
      expect(gradeNumbers(paper, reply)).toEqual({ foreign: ["15"] });
      expect(gradeNumbers(paper.replace("48%", "30%"), reply)).toEqual({ foreign: ["48%", "15"] });
    });
    it("finds a foreign number in a list inside a JSON reply", () => {
      const reply = JSON.stringify({ reading: "ok", not_stated: ["the 99 dropouts", "the sample of 1842"] });
      expect(gradeNumbers(paper, reply)).toEqual({ foreign: ["99"] });
    });
    it("does not read a JSON key as text, nor the numbers of a quotation copied from the paper", () => {
      const reply = JSON.stringify({ in_paper: true, answer: "The sample was 1842 students.", quotes: ["The sample was 1842 students from 12 colleges; 48% of the 3,100 invited took part."] });
      expect(gradeNumbers(paper, reply)).toEqual({ foreign: [] });
    });
    it("finds a foreign number inside a quoted phrase of a prose reply", () => {
      expect(gradeNumbers(paper, 'The authors report "a total of 2500 students took part".')).toEqual({ foreign: ["2500"] });
    });
    it("does not call a number foreign when a quoted phrase has it and the paper has it", () => {
      expect(gradeNumbers(paper, 'The authors report "a sample of 1842 students" and "48% of the 3,100 invited".')).toEqual({ foreign: [] });
      expect(gradeNumbers('The authors report "a total of 77 participants" in the sample.', 'They write "a total of 77 participants".')).toEqual({ foreign: [] });
      expect(gradeNumbers('The authors report "a total of 77 participants" in the sample.', JSON.stringify({ answer: 'There were "77 participants".', quotes: [] }))).toEqual({ foreign: [] });
    });
    it("reads a reply that does not parse as JSON as text", () => {
      expect(gradeNumbers(paper, '{"answer": "There were 2,500 students", "quotes": [')).toEqual({ foreign: ["2500"] });
    });
  });

  describe("citations in the reply", () => {
    const abstracts = "We surveyed 120 students about their sleep.";
    it("lists a citation the source never gives, as its text", () => {
      expect(gradeNumbers(abstracts, "As Smith (2019) and Walker et al. (2017) showed, sleep matters.")).toEqual({ foreign: ["Smith (2019)", "Walker et al. (2017)"] });
      expect(gradeNumbers(abstracts, "Sleep matters (Smith & Jones, 2019; Brown and Green, 2020).")).toEqual({ foreign: ["Smith & Jones (2019)", "Brown and Green (2020)"] });
    });
    it("lists a citation whose surname is in the source but whose year is not", () => {
      const src = "Trang Le, Bahr Weiss (2026). Relations between sleep quality and academic performance.";
      expect(gradeNumbers(src, "Sleep matters (Le et al., 2024).")).toEqual({ foreign: ["Le et al. (2024)"] });
    });
    it("lists a citation whose year is in the source but whose surname is not", () => {
      const src = "Trang Le, Bahr Weiss (2026). Relations between sleep quality and academic performance.";
      expect(gradeNumbers(src, "Sleep matters (Patel, 2026).")).toEqual({ foreign: ["Patel (2026)"] });
    });
    it("lets a citation through when its year and its surname are both in the source, in any case", () => {
      const src = "Trang Le, Bahr Weiss (2026). Relations between sleep quality and academic performance. Noorah Al-Sowayan, Lama Aboselmiya (2025). Sleep patterns.";
      expect(gradeNumbers(src, "Le et al. (2026) and (Weiss & Le, 2026) agree; so do Al-Sowayan and Aboselmiya (2025), and (LE, 2026).")).toEqual({ foreign: [] });
    });
    it("does not find a surname inside another word of the source", () => {
      expect(gradeNumbers("Learning to sleep (2026). Terrace and Alexandra study sleep.", "Sleep matters (Le, 2026) and (Terra, 2026).")).toEqual({ foreign: ["Le (2026)", "Terra (2026)"] });
    });
    it("names a citation once", () => {
      expect(gradeNumbers(abstracts, "Smith (2019) found it, and (Smith, 2019) again.")).toEqual({ foreign: ["Smith (2019)"] });
    });
    it("still grades a plain number that follows a capitalised word", () => {
      expect(gradeNumbers("The sample was 1842 students.", "Overall 1950 students took part.")).toEqual({ foreign: ["1950"] });
      expect(gradeNumbers("The sample was 1842 students.", "Overall, 1950 students took part.")).toEqual({ foreign: ["1950"] });
      expect(gradeNumbers("The sample was 1842 students.", "In 2019 there were 1842 students.")).toEqual({ foreign: ["2019"] });
      expect(gradeNumbers("The sample was 1842 students.", "Overall 1842 students took part.")).toEqual({ foreign: [] });
    });
    it("reads the numbers and the citations of a JSON reply together", () => {
      const reply = JSON.stringify({ in_paper: true, answer: "Smith (2019) had 2,500 students.", quotes: [] });
      expect(gradeNumbers("The sample was 1842 students.", reply)).toEqual({ foreign: ["2500", "Smith (2019)"] });
    });
  });

  describe("the gap finder's and the literature review's source is rsCorpusText of the papers (authors, years, titles, abstracts)", () => {
    const group = (SETS.gap.items[0]!.input as GapInput).papers as RsPaper[];
    const corpus = rsCorpusText(group);
    const reply = "Gap 1 (Methodological): Zhao and Zhou (2026) used one dataset and Le et al. (2026) one questionnaire (Yunusova et al., 2026), while Al-Sowayan and Aboselmiya (2026) asked 201 female students.";
    it("does not call the citations of the papers foreign", () => {
      expect(gradeNumbers(corpus, reply)).toEqual({ foreign: [] });
      expect(gradeNumbers(corpus, "Zhao and colleagues (2026) found that sleep matters.")).toEqual({ foreign: [] });
    });
    it("still finds a wrong year, a surname that is not in the group and a number that is not in the abstracts", () => {
      expect(gradeNumbers(corpus, "Zhao and Zhou (2024) and Smith (2026) studied 999 students.")).toEqual({ foreign: ["999", "Zhao and Zhou (2024)", "Smith (2026)"] });
    });
    it("has no years in the abstracts alone, so the same citation would be foreign there", () => {
      const abstractsOnly = group.map((p) => p.abstract).join("\n\n");
      expect(gradeNumbers(abstractsOnly, "Zhao and Zhou (2026) used one dataset.").foreign).toEqual(["Zhao and Zhou (2026)"]);
    });
  });
});

describe("gradeAreas", () => {
  const AREAS = ["Topic clarity and researchability", "Access to participants or data", "Time", "Resources and equipment", "Ethical complexity"];
  it("names every area when each line starts with the area's name", () => {
    const good = [
      "Topic clarity and researchability: High. One routine, one outcome, one group.",
      "**Access to participants or data**: Medium. Sixty volunteers is realistic.",
      "- Time: Medium. One semester fits.",
      "4. Resources and equipment: High. A paper questionnaire is enough.",
      "Ethical complexity: Low. Ask your supervisor what the committee needs.",
      "Verdict: Proceed as planned."
    ].join("\n");
    expect(gradeAreas(good, AREAS)).toEqual({ named: AREAS, missing: [] });
  });
  it("names none when every line starts with the word Area (the v1 wording)", () => {
    const bad = AREAS.map((a, i) => `Area: ${["High", "Medium", "Medium", "High", "Low"][i]}. A sentence about ${a.toLowerCase()}.`).join("\n");
    expect(gradeAreas(bad, AREAS)).toEqual({ named: [], missing: AREAS });
  });
  it("does not take Timeframe for Time, nor an area named in the middle of a sentence", () => {
    const reply = "Timeframe: Medium. A semester.\nThe ethical complexity: is low here.";
    expect(gradeAreas(reply, ["Time", "Ethical complexity"])).toEqual({ named: [], missing: ["Time", "Ethical complexity"] });
  });
});

describe("gradeLimitations", () => {
  const expected = ["small sample", "self-rated|self-report", "single college|one college"];
  it("finds the limitations a good summary states and does not call them not reported", () => {
    const good = "Aim: to see whether morning light helps focus.\nMethod: students were placed in two groups.\nKey findings: the light group rated their focus higher.\nLimitations: a small sample from one college, and focus was self-rated.";
    expect(gradeLimitations(good, expected)).toEqual({ notReported: false, hits: ["small sample", "self-rated|self-report", "single college|one college"] });
  });
  it("flags a summary that writes not reported under Limitations", () => {
    const bad = "Aim: to see whether morning light helps focus.\nMethod: two groups.\nKey findings: higher focus.\nLimitations: Not reported.";
    expect(gradeLimitations(bad, expected)).toEqual({ notReported: true, hits: [] });
  });
  it("reads the Limitations part only, not the words of the other headings", () => {
    const reply = "Aim: a small sample study.\nMethod: self-reported ratings.\nKey findings: none.\nLimitations: the authors name the short follow-up.";
    expect(gradeLimitations(reply, expected)).toEqual({ notReported: false, hits: [] });
  });
  it("finds no limitations, and does not call it not reported, when the reply has no Limitations heading", () => {
    expect(gradeLimitations("The study had a small sample.", expected)).toEqual({ notReported: false, hits: [] });
    expect(gradeLimitations("", expected)).toEqual({ notReported: false, hits: [] });
  });

  describe("the Limitations heading in other forms", () => {
    const head = "Aim: to describe how students at one university rate their sleep.\nMethod: A cross-sectional survey at a single university using self-reported questionnaires.\nKey findings: most students slept less than they wanted.\n";
    const exp = ["cross-sectional", "self-report", "single university"];
    it("reads Study limitations, Limitations and strengths, and each dash after the heading as the heading", () => {
      for (const tail of ["Study limitations: none stated.", "Limitations and strengths: not reported.", "Limitations – not reported", "Limitations — not reported", "Limitations - not reported", "**Study limitations:** not stated.", "- Limitations: not discussed."]) {
        expect(gradeLimitations(head + tail, exp), tail).toEqual({ notReported: true, hits: [] });
      }
    });
    it("does not take the words of the Method line for limitations when the heading is in another form", () => {
      expect(gradeLimitations(head + "Study limitations: none stated.", exp).hits).toEqual([]);
    });
    it("reads none mentioned and not discussed as not reported", () => {
      expect(gradeLimitations(head + "Limitations: none mentioned.", exp).notReported).toBe(true);
      expect(gradeLimitations(head + "Limitations: not discussed in the abstract.", exp).notReported).toBe(true);
    });
    it("finds the limitations a good summary states under these headings", () => {
      expect(gradeLimitations(head + "Study limitations: the authors name the cross-sectional design and self-report.", exp)).toEqual({ notReported: false, hits: ["cross-sectional", "self-report"] });
      expect(gradeLimitations(head + "Limitations and strengths – one single university; the self-report was checked.", exp)).toEqual({ notReported: false, hits: ["self-report", "single university"] });
    });
    it("finds the heading after a full stop when the summary is one paragraph", () => {
      const one = "Aim: to compare two groups. Method: a cross-sectional survey of self-reported sleep at a single university. Key findings: sleep was short. Limitations: only one class was asked.";
      expect(gradeLimitations(one, exp)).toEqual({ notReported: false, hits: [] });
      expect(gradeLimitations(one.replace("only one class was asked", "not reported"), exp)).toEqual({ notReported: true, hits: [] });
    });
    it("does not take a sentence that begins with the word limitations for a heading", () => {
      expect(gradeLimitations(head + "Limitations of the method were small.", exp)).toEqual({ notReported: false, hits: [] });
    });
  });
});

describe("gradeGapNames", () => {
  const papers: RsPaper[] = [
    { title: "A", authors: "Noorah Al-Sowayan, Lama Aboselmiya", authorList: ["Noorah Al-Sowayan", "Lama Aboselmiya"], year: 2026, venue: "Clocks & Sleep", doi: "10.3390/x1", source: "europepmc", abstract: "a" },
    { title: "B", authors: "Trang Le, Bahr Weiss", authorList: ["Trang Le", "Bahr Weiss"], year: 2026, venue: "Frontiers", doi: "10.3389/x2", source: "europepmc", abstract: "b" },
    { title: "C", authors: "Mohamed Terra", authorList: ["Mohamed Terra"], year: 2025, venue: "PLOS ONE", doi: "10.1371/x3", source: "europepmc", abstract: "c" }
  ];
  it("sees that a reply names its papers by number", () => {
    const r = gradeGapNames("Paper 1 and Paper 2 both used self-report, so a different method is missing.", papers);
    expect(r.numbered).toBe(true);
    expect(r.named).toEqual([]);
  });
  it("sees the other numbered forms: paper(s), brackets, ordinals", () => {
    for (const s of ["Gap 1 (Empirical): thin evidence from paper(s) 2 and 3.", "Only one method was used [1, 2].", "The second paper never asks this."]) {
      expect(gradeGapNames(s, papers).numbered).toBe(true);
    }
  });
  it("names the papers by first author's surname and year, and is not numbered", () => {
    const good = "Gap 1 (Population): both Al-Sowayan (2026) and Le et al. (2026) studied students in one country, and neither asked about older students. Gap 2 (Methodological): (Terra, 2025) relied on one questionnaire.";
    expect(gradeGapNames(good, papers)).toEqual({ numbered: false, named: ["Al-Sowayan", "Le", "Terra"] });
  });
  it("does not take a gap number or a year for a paper number", () => {
    expect(gradeGapNames("Gap 1 (Type): see (Terra, 2025). Gap 2 (Type): thin.", papers).numbered).toBe(false);
  });
  it("does not take a list of themes numbered (1), (2), (3) for papers named by number", () => {
    const r = "Three themes emerge: (1) sleep timing, (2) sleep quality and (3) mood, as Zhao and Zhou (2026), Le et al. (2026) and Yunusova et al. (2026) show.";
    expect(gradeGapNames(r, papers).numbered).toBe(false);
  });
  it("does not take a number of hours, days or times after the word study for a paper number", () => {
    expect(gradeGapNames("Students who study 3 hours a day slept less (Zhao & Zhou, 2026).", papers).numbered).toBe(false);
    for (const s of ["Those who study 2 days a week", "People who study 4 times a week", "They study 2 h a night", "Pupils who study 30 minutes more", "Those who study 6 weeks before", "Those who study 5% more"]) {
      expect(gradeGapNames(s, papers).numbered, s).toBe(false);
    }
  });
  it("still sees a paper named by number: (paper 1), Paper 1, Study 2, studies 2 and 3, [1]", () => {
    for (const s of ["Thin evidence (paper 1) and (papers 2 and 3).", "Paper 1 used one method.", "Study 2 asked only women.", "Both studies 2 and 3 agree.", "Study 2 had a small sample, so it is thin.", "Evidence is thin [1]."]) {
      expect(gradeGapNames(s, papers).numbered, s).toBe(true);
    }
  });
  it("does not find a surname inside another word", () => {
    expect(gradeGapNames("The sample was Leaning, Terrace and Alexandra.", papers)).toEqual({ numbered: false, named: [] });
  });
});

describe("gradeLabel", () => {
  const idea = buildIdeaPromptV2("psychology", { topic: "sleep and recall" }).prompt;
  it("is true when classifyAiUse gives the prompt the expected label", () => {
    expect(gradeLabel(idea, { k: "checking whether my project idea is realistic", g: "feedback" })).toBe(true);
  });
  it("is false for another kind or another group", () => {
    expect(gradeLabel(idea, { k: "summarising a paper", g: "explain" })).toBe(false);
    expect(gradeLabel(idea, { k: "checking whether my project idea is realistic", g: "text" })).toBe(false);
  });
  it("is false for the help assistant's prompt, which is not logged", () => {
    expect(gradeLabel("You are Appu, the help assistant of Appuscholar.", { k: "other help", g: "other" })).toBe(false);
  });
  it("agrees with classifyAiUse", () => {
    expect(classifyAiUse(idea)).toEqual({ k: "checking whether my project idea is realistic", g: "feedback" });
  });
});

/* ---- the sets ---------------------------------------------------------------------------------------------------------------------------------- */

const ALLOWED_LICENCE = /^(CC BY( \d\.\d)?|CC0( 1\.0)?|Public domain)$/;

/** Every object in a value that carries text of a paper (a `text` or an `abstract` that is a non-empty string), with the path it was found at. */
function textHolders(v: unknown, path = "input"): Array<{ path: string; o: Record<string, unknown> }> {
  const out: Array<{ path: string; o: Record<string, unknown> }> = [];
  if (Array.isArray(v)) v.forEach((x, i) => out.push(...textHolders(x, `${path}[${i}]`)));
  else if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ((typeof o.text === "string" && o.text.trim()) || (typeof o.abstract === "string" && o.abstract.trim())) out.push({ path, o });
    for (const [k, x] of Object.entries(o)) out.push(...textHolders(x, `${path}.${k}`));
  }
  return out;
}

describe("the six test sets", () => {
  it("are the six the plan names", () => {
    expect([...SET_NAMES]).toEqual(["idea", "summary", "gap", "litreview", "ask", "walk"]);
    for (const n of SET_NAMES) expect(SETS[n].set).toBe(n);
  });

  for (const name of SET_NAMES) {
    describe(`set ${name}`, () => {
      const set = SETS[name];
      it("validates against the item shape (no problems)", () => {
        expect(validateSet(set)).toEqual([]);
      });
      it("has 3 to 5 items, unique ids and a non-empty `good` in each", () => {
        expect(set.items.length).toBeGreaterThanOrEqual(3);
        expect(set.items.length).toBeLessThanOrEqual(5);
        expect(new Set(set.items.map((i) => i.id)).size).toBe(set.items.length);
        for (const it of set.items) {
          expect(it.id.trim()).not.toBe("");
          expect(it.good.trim().length).toBeGreaterThan(20);
          expect(it.expect && typeof it.expect === "object" && !Array.isArray(it.expect)).toBe(true);
        }
      });
      it("holds the text of a paper only with a CC BY / public domain licence and a DOI (or marks it synthetic)", () => {
        for (const it of set.items) for (const { path, o } of textHolders(it.input)) {
          if (o.synthetic === true) continue;
          expect(String(o.doi ?? ""), `${it.id} ${path} doi`).toMatch(/^10\.\d{4,9}\/\S+$/);
          expect(String(o.licence ?? ""), `${it.id} ${path} licence`).toMatch(ALLOWED_LICENCE);
        }
      });
      it("flags `unresolved` exactly when a paper is stored by DOI only", () => {
        for (const it of set.items) {
          const doiOnly = papersOf(it).filter((p) => !("text" in p ? p.text : (p as AbstractPaper).abstract));
          expect(Boolean(it.unresolved), it.id).toBe(doiOnly.length > 0);
          for (const p of doiOnly) expect(String(p.doi ?? "")).toMatch(/^10\.\d{4,9}\/\S+$/);
        }
      });
    });
  }

  it("the validator turns away text without a licence and a DOI, a wrong count, a repeated id and an empty `good`", () => {
    const item = (id: string, input: unknown, good = "A good answer does something clear and checkable."): QualityItem => ({ id, input, good, expect: {} });
    const paper = { title: "T", doi: "10.1234/x", licence: "CC BY 4.0", text: "Some text." };
    const ok = { set: "summary", builder: "buildShelfSummaryPromptV2", note: "n", items: [item("a", { paper }), item("b", { paper }), item("c", { paper })] };
    expect(validateSet(ok)).toEqual([]);
    expect(validateSet({ ...ok, items: ok.items.slice(0, 2) }).join("|")).toMatch(/3 to 5 items/);
    expect(validateSet({ ...ok, items: [item("a", { paper }), item("a", { paper }), item("c", { paper })] }).join("|")).toMatch(/repeated id/);
    expect(validateSet({ ...ok, items: [item("a", { paper }), item("b", { paper }, " "), item("c", { paper })] }).join("|")).toMatch(/good/);
    const nolic = { ...paper, licence: "All rights reserved" };
    expect(validateSet({ ...ok, items: [item("a", { paper: nolic }), item("b", { paper }), item("c", { paper })] }).join("|")).toMatch(/licence/);
    const nodoi = { ...paper, doi: "" };
    expect(validateSet({ ...ok, items: [item("a", { paper: nodoi }), item("b", { paper }), item("c", { paper })] }).join("|")).toMatch(/doi/i);
    expect(validateSet({ ...ok, items: [item("a", { paper: { ...paper, synthetic: true, licence: undefined, doi: undefined } }), item("b", { paper }), item("c", { paper })] })).toEqual([]);
    const doiOnly = { title: "T", doi: "10.1234/x", licence: "CC BY 4.0", text: null };
    expect(validateSet({ ...ok, items: [item("a", { paper: doiOnly }), item("b", { paper }), item("c", { paper })] }).join("|")).toMatch(/unresolved/);
    expect(validateSet({ ...ok, items: [{ ...item("a", { paper: doiOnly }), unresolved: true }, item("b", { paper }), item("c", { paper })] })).toEqual([]);
  });
});

/* The papers an item holds, whatever the set calls them. */
function papersOf(it: QualityItem): Array<PaperWithText | AbstractPaper> {
  const i = it.input as { paper?: PaperWithText; papers?: AbstractPaper[] };
  return i.papers ?? (i.paper ? [i.paper] : []);
}

/* ---- each item drives the builder the web uses, and what it expects is honest --------------------------------------------------------------------- */

const doiRx = /^10\.\d{4,9}\/\S+$/;

describe("every item drives the builder the web uses", () => {
  it("idea: buildIdeaPromptV2 (the five areas are the ones the prompt lists, the label is the one the spec fixes)", () => {
    for (const it of SETS.idea.items) {
      const i = it.input as IdeaInput;
      const prompt = buildIdeaPromptV2(i.field, i.idea).prompt;
      const e = it.expect as { areas: string[]; label: { k: string; g: "feedback" } };
      expect(e.areas).toHaveLength(5);
      for (const a of e.areas) expect(prompt.toLowerCase()).toContain(a.toLowerCase());
      expect(gradeLabel(prompt, e.label), it.id).toBe(true);
    }
  });

  it("idea: the first item is the walk's idea, as the e2e walk types it", () => {
    const first = SETS.idea.items[0]!;
    expect((first.input as IdeaInput).idea.topic).toBe("Does a fixed bedtime routine for one week lower exam anxiety in first-year college students?");
  });

  it("summary: buildShelfSummaryPromptV2 over the paper text; every expected limitation is in the paper's own words", () => {
    for (const it of SETS.summary.items) {
      const i = it.input as SummaryInput;
      expect(i.paper.text, it.id).toBeTruthy();
      const prompt = buildShelfSummaryPromptV2(i.field, [i.paper.text!]).prompt;
      const e = it.expect as { limitations: string[]; label: { k: string; g: "explain" } };
      expect(gradeLabel(prompt, e.label), it.id).toBe(true);
      const body = i.paper.text!.toLowerCase();
      expect(e.limitations.length).toBeGreaterThanOrEqual(2);
      for (const lim of e.limitations) expect(lim.split("|").some((a) => body.includes(a.toLowerCase())), `${it.id}: ${lim}`).toBe(true);
      expect(/\blimitations?\b/.test(body), `${it.id}: the paper says "limitation" somewhere`).toBe(true);
    }
  });

  for (const name of ["gap", "litreview"] as const) {
    it(`${name}: ${name === "gap" ? "buildGapFinderPromptV2" : "buildLitReviewPrompt"} over 3 to 5 abstracts that all have a DOI and a licence`, () => {
      for (const it of SETS[name].items) {
        const i = it.input as GapInput;
        expect(i.papers.length).toBeGreaterThanOrEqual(3);
        expect(i.papers.length).toBeLessThanOrEqual(5);
        for (const p of i.papers) { expect(p.doi).toMatch(doiRx); expect(p.abstract, `${it.id} ${p.doi}`).toBeTruthy(); expect(p.authorList.length).toBeGreaterThan(0); }
        const built = name === "gap" ? buildGapFinderPromptV2(i.field, i.papers as RsPaper[]) : buildLitReviewPrompt(i.field, i.papers as RsPaper[]);
        const e = it.expect as { label: { k: string; g: "feedback" | "text" } };
        expect(gradeLabel(built.prompt, e.label), it.id).toBe(true);
      }
    });
  }

  it("litreview uses the same three groups as gap", () => {
    const key = (n: SetName) => SETS[n].items.map((it) => (it.input as GapInput).papers.map((p) => p.doi).join(","));
    expect(key("litreview")).toEqual(key("gap"));
  });

  it("ask: three papers, two questions each; buildAskPrompt builds for each question and the paper text can be quoted from", () => {
    expect(SETS.ask.items).toHaveLength(3);
    for (const it of SETS.ask.items) {
      const i = it.input as AskInput;
      const e = it.expect as { inPaper: boolean[]; facts: string[][] };
      expect(i.questions).toHaveLength(2);
      expect(e.inPaper).toHaveLength(2);
      expect(e.facts).toHaveLength(2);
      expect(e.inPaper).toContain(true);
      expect(e.inPaper).toContain(false);
      const d = apBuild(i.paper.title, [i.paper.text!], "pdf");
      for (const q of i.questions) expect(buildAskPrompt(i.field, d, q).prompt).toContain("PAPER START");
      e.inPaper.forEach((inP, k) => { if (inP) for (const f of e.facts[k]!) expect(i.paper.text!.toLowerCase().includes(f.toLowerCase()), `${it.id}: ${f}`).toBe(true); });
    }
  });

  it("walk: two papers, two stages each, one stage per item (4 items); every stage is one of the twelve and buildWalkPrompt builds", () => {
    expect(SETS.walk.items).toHaveLength(4);
    const keys = AP_STAGES.map((s) => s.k);
    const perPaper = new Map<string, string[]>();
    for (const it of SETS.walk.items) {
      const i = it.input as WalkInput;
      const e = it.expect as { facts: string[] };
      expect(keys).toContain(i.stage.k);
      expect(e.facts.length, it.id).toBeGreaterThan(0);
      for (const f of e.facts) expect(i.paper.text!.toLowerCase().includes(f.toLowerCase()), `${it.id}: ${f}`).toBe(true);
      const d = apBuild(i.paper.title, [i.paper.text!], "pdf");
      const st = AP_STAGES.find((x) => x.k === i.stage.k)!;
      expect(buildWalkPrompt(i.field, d, st, i.stage.attempt).prompt).toContain("PAPER START");
      perPaper.set(i.paper.doi, [...(perPaper.get(i.paper.doi) ?? []), i.stage.k]);
    }
    expect(perPaper.size).toBe(2);
    for (const ks of perPaper.values()) expect(new Set(ks).size).toBe(2);
  });

  it("every stored text opens as a paper (apBuild finds sections) and a sentence of it passes gradeQuotes", () => {
    for (const name of ["summary", "ask", "walk"] as const) for (const it of SETS[name].items) {
      const p = (it.input as { paper: PaperWithText }).paper;
      const d = apBuild(p.title, [p.text!], "pdf");
      expect(d.sections.length, it.id).toBeGreaterThanOrEqual(3);
      const sentence = d.chunks.find((c) => !c.ref && c.sec === "Introduction")!.text.split(/(?<=\.)\s/).find((s) => s.length > 60)!;
      expect(gradeQuotes(d, JSON.stringify({ quotes: [sentence] }))).toEqual({ quotes: 1, found: 1 });
    }
  });

  it("gradeNumbers on a set's own sentence finds nothing foreign", () => {
    for (const it of SETS.summary.items) {
      const p = (it.input as SummaryInput).paper;
      const sentence = p.text!.split(/(?<=\.)\s/).find((s) => /\d/.test(s) && s.length < 200)!;
      expect(gradeNumbers(p.text!, sentence).foreign, it.id).toEqual([]);
    }
  });
});
