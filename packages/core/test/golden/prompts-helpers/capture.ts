import type { Engine } from "../harness/engines";
import { writeFixture } from "../harness/fixture";
import { FIELDS, promptRecorder, textOf, threshold } from "../harness/prompt-record";

/** A pasted passage of exactly 300 characters (the shortest text of the brief; v1 refuses a trimmed text under 40 characters, 8604), and one of exactly 13,000 (psychTool sends the first 12,000, 8612). */
const SHORT = textOf(300, (i) => `Note ${i}: sleep loss predicted academic delay in 120 undergraduates (Steel, 2007), r = .32.`);
const LONG = textOf(13000, (i) => `Paragraph ${i}: sleep loss predicted academic delay in 120 undergraduates (Steel, 2007), r = .32; tired writers underestimate how long a draft takes.`);

/** A passage of exactly 30 words (vivaAsk and devilTool refuse fewer than 25, 3610 and 8621), and one of exactly 7,000 characters (both send the first 6,000, 3613 and 8622). */
const WORDS = "Sleep loss predicted academic delay in 120 undergraduates, yet nobody has tested the idea in Indian colleges, so the claim needs sources and a clearer account of the proposed mechanism.";
const CHARS = textOf(7000, (i) => `Sentence ${i}: the pilot group wrote more slowly after a short night of sleep.`);

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** The five tools of Psychology Tools (v1 PSYCH_PROMPTS 8592-8598), in v1's order. */
const KINDS = ["paper", "case", "litrev", "explain", "stats"];

/**
 * The Psychology Tools helpers (O7, part 1): psychTool (v1 8600-8615) for the five kinds, devilTool (8619-8630) and vivaAsk (3608-3624), driven the way a student drives them, with callAI
 * replaced by a recorder. What the entries need before they send is a student's own state, set here as a student sets it: text in the editor that is selected (selectEditor:
 * a selection is what the brief asks for, and it keeps psychTool from showing its "Long document" notice, 8609), at least 40 characters for psychTool (8604) and 25 words for the other two
 * (3610, 8621), and, for the case tool, a yes to the confirm that says the text goes to the provider (8606; window.confirm answers yes, and v1 asks once a session, 8607, so it must be
 * asked exactly once here). vivaAsk also reads #vivaAud. Each case records the text as v1's selText() returned it, with its spaces (the entries trim it), beside the prompt.
 * For each of the three values of appu_field (the harness's FIELDS): psychTool for each kind on a 300-character and a 13,000-character text, devilTool and vivaAsk (for both audiences) on a
 * 30-word and a 7,000-character text. Beyond the brief: `guards` finds the sizes at which each entry starts to send, by trying every size, so that the exported guard constants are held to v1
 * (register row D-W1-4); `refused` is the largest size v1 turns away and `toast` what it says then.
 */
export const promptsHelpers: Engine = {
  name: "prompts-helpers",
  async capture(v1, { check }) {
    if (SHORT.length !== 300 || LONG.length !== 13000 || words(WORDS) !== 30 || CHARS.length !== 7000) throw new Error("prompts-helpers: the texts are not the sizes they exist for");
    const rec = promptRecorder(v1, "prompts-helpers");
    let confirms = 0;
    v1.window.confirm = () => {
      confirms++;
      return true;
    };
    /** The editor holds `html` with all of it selected; returns selText() as the entries read it. */
    const select = (html: string): string => {
      v1.setEditorHtml(html);
      v1.selectEditor();
      if (!v1.eval<boolean>("hasSelection()")) throw new Error("prompts-helpers: nothing is selected");
      return v1.eval<string>("selText()");
    };

    for (const field of FIELDS) {
      rec.setField(field);
      for (const kind of KINDS)
        for (const html of [`<p>  ${SHORT}  </p>`, `<p>${LONG}</p>`]) {
          const text = select(html);
          await rec.run("psychTool", { kind, text }, () => v1.call<Promise<void>>("psychTool", kind));
        }
      for (const html of [`<p>  ${WORDS}  </p>`, `<p>${CHARS}</p>`]) {
        const text = select(html);
        await rec.run("devilTool", { text }, () => v1.call<Promise<void>>("devilTool"));
        for (const aud of ["conf", "viva"]) {
          v1.setValue("vivaAud", aud);
          if ((v1.document.getElementById("vivaAud") as HTMLSelectElement).value !== aud) throw new Error(`prompts-helpers: #vivaAud did not take ${aud}`);
          await rec.run("vivaAsk", { aud, text }, () => v1.call<Promise<void>>("vivaAsk"));
        }
      }
    }
    if (confirms !== 1) throw new Error(`prompts-helpers: the case tool asked its confirm ${confirms} times, not once a session`);

    // The sizes at which each entry starts to send. A probe is an ordinary call with a text of one size; it is accepted when it made a callAI call.
    const attempt = async (html: string, go: () => Promise<unknown>) => {
      const before = rec.calls.length;
      select(html);
      await go();
      const made = rec.calls.length - before;
      if (made > 1) throw new Error(`prompts-helpers: a probe made ${made} callAI calls`);
      return made === 1;
    };
    const probe = async (name: string, max: number, html: (size: number) => string, go: () => Promise<unknown>) => {
      let toast = "";
      const found = await threshold(name, max, async (size) => {
        const seen = v1.toasts.length;
        const sent = await attempt(html(size), go);
        if (!sent) toast = v1.toasts.slice(seen).join(" | ");
        return sent;
      });
      return { ...found, toast };
    };
    const wordsOf = (n: number) => Array.from({ length: n }, () => "word").join(" ");
    const guards = {
      psychTool: await probe("psychTool", 100, (n) => `<p>${"x".repeat(n)}</p>`, () => v1.call<Promise<void>>("psychTool", "paper")),
      devilTool: await probe("devilTool", 60, (n) => `<p>${wordsOf(n)}</p>`, () => v1.call<Promise<void>>("devilTool")),
      vivaAsk: await probe("vivaAsk", 60, (n) => `<p>${wordsOf(n)}</p>`, () => v1.call<Promise<void>>("vivaAsk")),
    };
    return [writeFixture("prompts-helpers", "cases", { cases: rec.cases, guards }, v1, check)];
  },
};
