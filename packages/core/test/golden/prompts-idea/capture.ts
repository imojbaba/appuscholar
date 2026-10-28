import type { Engine } from "../harness/engines";
import { writeFixture } from "../harness/fixture";
import { FIELDS, promptRecorder, textOf } from "../harness/prompt-record";

/** What a student types into the four boxes of Idea & Feasibility (v1 ideaTopic, ideaResources, ideaTimeframe and ideaConstraints, 712-721); a box left out stays empty. */
type Idea = { topic: string; resources?: string; timeframe?: string; constraints?: string };

/**
 * All four boxes filled, each with the spaces a pasted answer carries at its ends, and a line break after the two longer answers (the timeframe box is a single-line input, which has none):
 * ideaAssess (v1 8568) reads every box with `.value.trim()` (8570).
 */
const ALL: Idea = {
  topic: "  Does sleep quality predict exam performance in college students?  ",
  resources: "  About 150 undergraduates in my department, a free online sleep diary and SPSS on the lab computers.\n",
  timeframe: "  one semester, ending in April  ",
  constraints: "  No budget. The ethics committee meets once a month.\n",
};

/** The topic alone: the other three boxes are empty, so the prompt says "(not described)", "(not given)" and "(none given)" (v1 8573). */
const TOPIC_ONLY: Idea = { topic: "How do first-generation college students in India experience academic belonging?" };

/**
 * A topic of 2,500 characters (ideaAssess keeps its first 2,000, 8576), and the three other boxes longer than the 1,000 characters it keeps of the resources and of the constraints; the timeframe
 * is not cut, so it is 1,200 characters, to show that. Each text carries a running number, so the cut can be seen.
 */
const LONG: Idea = {
  topic: textOf(2500, (i) => `Idea ${i}: sleep quality may predict exam performance.`),
  resources: textOf(1500, (i) => `Resource ${i}: a department of undergraduates, a free sleep diary and SPSS.`),
  timeframe: textOf(1200, (i) => `Step ${i} of one semester.`),
  constraints: textOf(1500, (i) => `Constraint ${i}: no budget, one ethics committee.`),
};

/**
 * Idea & Feasibility (O7, F25): ideaAssess (v1 8568-8580) driven the way a student drives it, with callAI replaced by a recorder. A student fills the boxes (setValue) and presses the button;
 * the entry returns before callAI only when the topic is empty (8572), which none of the inputs is, so no other precondition has to be met. For each of the three values of appu_field (the
 * harness's FIELDS) and each of the three inputs above, `prompt` and `opts` are what v1 handed to callAI (8577), `inputs` are the boxes as typed (untrimmed) and `label` is fieldName().
 */
export const promptsIdea: Engine = {
  name: "prompts-idea",
  async capture(v1, { check }) {
    if (LONG.topic.length !== 2500 || LONG.timeframe?.length !== 1200) throw new Error("prompts-idea: the long inputs are not the lengths they exist for");
    const rec = promptRecorder(v1, "prompts-idea");
    for (const field of FIELDS) {
      rec.setField(field);
      for (const idea of [ALL, TOPIC_ONLY, LONG]) {
        v1.setValue("ideaTopic", idea.topic);
        v1.setValue("ideaResources", idea.resources ?? "");
        v1.setValue("ideaTimeframe", idea.timeframe ?? "");
        v1.setValue("ideaConstraints", idea.constraints ?? "");
        await rec.run("ideaAssess", { ...idea }, () => v1.call<Promise<void>>("ideaAssess"));
      }
    }
    return [writeFixture("prompts-idea", "cases", { cases: rec.cases }, v1, check)];
  },
};
