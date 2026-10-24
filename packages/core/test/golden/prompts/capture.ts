import type { Engine } from "../harness/engines";
import { writeFixture } from "../harness/fixture";

/**
 * One student paragraph of exactly 60 words, as HTML: the ampersand is written &amp; so that v1 reads "&" back from textContent, and the quotes are curly.
 * draftFeedback("tail") wants a tail of at least 25 words (v1 3380).
 */
const PARAGRAPH = "Sleep loss predicted academic delay in 120 undergraduates (Steel, 2007), r = .32. Students who slept under six hours handed in work later &amp; reported lower motivation. The “planning fallacy” may explain part of this pattern, because tired writers underestimate how long a draft takes – yet nobody has tested the idea in Indian colleges, so the claim needs sources.";

/** One paragraph of more than 2,000 characters: tailText() (v1 5555) keeps only its last 2,000, so the slice is not a no-op. */
const LONG_PARAGRAPH = Array.from({ length: 40 }, (_, i) => `Draft sentence ${i + 1} describes how the pilot group wrote after a short night of sleep.`).join(" ");

/** A question of exactly 2,500 characters with nothing to trim at either end: askAI (v1 5711) trims it, and the prompt carries its first 2,000. */
const QUESTION = Array.from({ length: 60 }, (_, i) => `Q${i + 1}: how should I frame the gap in my literature review?`).join(" ").slice(0, 2499) + "?";

/** What the My Writing Style panel stores (v1 6362-6363); stylePrompt() (6975) turns it into the block the three writing entries add after PLAIN_OUT. */
const STYLE_PROFILE = "- Tone: plain and direct.\n- Sentences: short, with one long one now and then.";

type Call = { prompt: string; opts: Record<string, unknown> };

/**
 * The entry points that send a prompt (continueWriting 5675, improveText 5684, makeLonger 5694, draftFeedback 3376 in its three kinds, askAI 5710), driven the way a
 * student's session drives them, with callAI replaced by a recorder. `prompt` and `opts` are exactly what v1 handed to callAI: before pdPreSend (5321) and before callAIRaw
 * appends contentLangInstruction() (5349). No provider key, busy flag or confirm dialog stands in the way, because all of them sit inside callAI.
 * What the entries did need is a student's own state, set here as a student sets it: draft-first off (the default; switched on, the three writing entries hand over to
 * draftFeedback), a selection for improveText, makeLonger and draftFeedback's improve and expand (selectEditor), a paragraph of 25 words or more for draftFeedback's tail,
 * and a typed question for askAI. Each case records the text v1 built its prompt from (`input`) and the state it read, so the test can rebuild the prompt from the fixture alone.
 * Beyond the brief's eight cases: the two entries that read the tail, on a paragraph longer than 2,000 characters (the cut), and the three writing entries with My Writing Style on
 * (where the style block sits in the prompt).
 */
export const prompts: Engine = {
  name: "prompts",
  async capture(v1, { check }) {
    if (QUESTION.length !== 2500 || QUESTION !== QUESTION.trim()) throw new Error("prompts: the question is not 2,500 characters with nothing to trim");
    const calls: Call[] = v1.stubCallAI();
    const ls = v1.window.localStorage;
    ls.clear(); // v1's start-up leaves appu_theme behind; nothing but the keys set below should shape a prompt
    ls.removeItem("appu_draft_first");

    const cases: Array<Record<string, unknown>> = [];
    /** Runs one entry point and records the single callAI call it makes. State and `input` are read the way the entry reads them, just before the call. */
    const run = async (id: string, entry: string, kind: string | null, input: () => string, go: () => Promise<unknown>) => {
      const before = calls.length;
      const state = { draftFirst: v1.eval<boolean>("draftFirstOn()"), contentLang: v1.eval<string>("getContentLang()"), field: v1.eval<string>("fieldName()"), style: v1.eval<string>("stylePrompt()") };
      const text = input();
      await go();
      if (calls.length !== before + 1) throw new Error(`prompts: ${id} made ${calls.length - before} callAI calls (last toasts ${JSON.stringify(v1.toasts.slice(-2))}): a precondition of the entry is not met`);
      const c = calls[before] as Call;
      cases.push({ id, entry, ...(kind ? { kind } : {}), ...state, input: text, prompt: c.prompt, opts: c.opts });
    };
    const tail = () => v1.eval<string>("tailText()");
    const selected = () => v1.eval<string>("selText()");
    const asked = () => (v1.document.getElementById("chatIn") as HTMLInputElement).value.trim();
    const ask = (id: string) => { v1.setValue("chatIn", QUESTION); return run(id, "askAI", null, asked, () => v1.call<Promise<void>>("askAI")); };

    // The short paragraph: the brief's order, nothing selected until improveText.
    v1.setEditorHtml(`<p>${PARAGRAPH}</p>`);
    const editorText = v1.eval<string>("getEditorText()");
    if (editorText.trim().split(/\s+/).length !== 60) throw new Error("prompts: the paragraph is not 60 words");
    await run("continueWriting", "continueWriting", "continue", tail, () => v1.call<Promise<void>>("continueWriting"));
    v1.selectEditor();
    await run("improveText", "improveText", "improve", selected, () => v1.call<Promise<void>>("improveText"));
    await run("makeLonger", "makeLonger", "expand", selected, () => v1.call<Promise<void>>("makeLonger"));
    await run("draftFeedback-tail", "draftFeedback", "tail", tail, () => v1.call<Promise<void>>("draftFeedback", "tail"));
    await run("draftFeedback-improve", "draftFeedback", "improve", selected, () => v1.call<Promise<void>>("draftFeedback", "improve"));
    await run("draftFeedback-expand", "draftFeedback", "expand", selected, () => v1.call<Promise<void>>("draftFeedback", "expand"));
    await ask("askAI");

    // Hindi as the content language (no entry prompt changes: callAIRaw appends the instruction) and a field of study, then the chat again.
    ls.setItem("appu_content_lang", "hi");
    const hiInstruction = v1.eval<string>("contentLangInstruction()");
    const plainOut = v1.eval<string>("PLAIN_OUT");
    ls.setItem("appu_field", "education");
    await ask("askAI-education");
    ls.removeItem("appu_content_lang");
    ls.removeItem("appu_field");
    const enInstruction = v1.eval<string>("contentLangInstruction()");

    // The long paragraph: the two entries that read the tail.
    v1.setEditorHtml(`<p>${LONG_PARAGRAPH}</p>`);
    const longEditorText = v1.eval<string>("getEditorText()");
    if (longEditorText.length <= 2000) throw new Error("prompts: the long paragraph does not exceed 2,000 characters");
    await run("continueWriting-long", "continueWriting", "continue", tail, () => v1.call<Promise<void>>("continueWriting"));
    await run("draftFeedback-tail-long", "draftFeedback", "tail", tail, () => v1.call<Promise<void>>("draftFeedback", "tail"));

    // My Writing Style on: the three writing entries add stylePrompt() after PLAIN_OUT (a new editor content needs a new selection).
    v1.setEditorHtml(`<p>${PARAGRAPH}</p>`);
    v1.selectEditor();
    ls.setItem("appu_style_profile", STYLE_PROFILE);
    ls.setItem("appu_style_on", "1");
    await run("continueWriting-style", "continueWriting", "continue", tail, () => v1.call<Promise<void>>("continueWriting"));
    await run("improveText-style", "improveText", "improve", selected, () => v1.call<Promise<void>>("improveText"));
    await run("makeLonger-style", "makeLonger", "expand", selected, () => v1.call<Promise<void>>("makeLonger"));

    return [writeFixture("prompts", "cases", { plainOut, enInstruction, hiInstruction, editorText, longEditorText, question: QUESTION, cases }, v1, check)];
  },
};
