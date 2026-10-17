import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Engine } from "../harness/engines";
import { readFixture, writeFixture } from "../harness/fixture";

/** The prompts the Task 5 capture recorded, as aiuse sees them: `prompt` is what that capture stored beside the entry point that sent it. */
type Recorded = { entry: string; prompt: string };

/** The prompt literals core/test/aiuse.test.ts gives classifyAiUse (its Appu line with the trailing " ..." kept), and the first rule's head, which smoke/capture.ts classifies. */
const LITERALS: Array<[id: string, prompt: string]> = [
  ["literal-appu-help", "You are Appu, the help assistant ..."],
  ["literal-fallback", "Something new"],
  ["literal-continue", "Continue this writing"],
];

/**
 * aiuClassify (v1 5443) on the first 400 characters of every prompt test/golden/prompts/cases.json records, and on the three literals.
 * The prompts capture runs after this one in the engine order: while its file is absent only the literals are recorded, and this capture is run again once it exists.
 */
export const aiuse: Engine = {
  name: "aiuse",
  async capture(v1, { check }) {
    const promptsFile = fileURLToPath(new URL("../prompts/cases.json", import.meta.url));
    const recorded: Array<[string, string]> = [];
    if (existsSync(promptsFile)) {
      const { cases } = readFixture<{ cases: Recorded[] }>("prompts", "cases");
      if (!Array.isArray(cases)) throw new Error("aiuse: prompts/cases.json has no cases array");
      cases.forEach((c, i) => {
        if (typeof c?.prompt !== "string") throw new Error(`aiuse: prompts/cases.json cases[${i}] has no prompt string`);
        recorded.push([`${c.entry}#${i}`, c.prompt.slice(0, 400)]);
      });
    }
    const cases = [...LITERALS, ...recorded].map(([id, prompt]) => ({ id, prompt, out: v1.call("aiuClassify", prompt) }));
    return [writeFixture("aiuse", "cases", { cases }, v1, check)];
  },
};
