import { aiuBuild, type AiuBuilt, type AiuInput } from "./aiustatement";

/*
 * aiuBuildV2: aiuBuild (v1's statement, never edited) with the two sentences that describe where the log is kept made true for v2. v1's log lived in the
 * browser (`appu_ailog`); v2's is in the student's account and is read one project at a time (GET /ai/log?projectId=), so v1's two sentences would tell a
 * student something untrue. Nothing else differs: a refusal passes through as it is, and the rest of the text is aiuBuild's.
 * The two replacements (register D-S2-58, proposed for Dr. Sharma and OJ):
 *   v1 (aiustatement.ts, the no-use bracket)  "The log only knows about Appuscholar in this browser."
 *   v2                                         "The log only knows about Appuscholar, and only about this project."
 *   v1 (the thesis sentence)                   "The log is kept in my browser and I can show it to my supervisor on request."
 *   v2                                         "The log is kept in my Appuscholar account and I can show it to my supervisor on request."
 * Each is replaced only in the place v1 put it (the bracket ends the no-use text, the thesis sentence is followed by v1's closing sentence), so a
 * student's own words in `other` are never touched.
 */
export const AIU_V1_BRACKET = "The log only knows about Appuscholar in this browser.";
export const AIU_V2_BRACKET = "The log only knows about Appuscholar, and only about this project.";
export const AIU_V1_THESIS = "The log is kept in my browser and I can show it to my supervisor on request.";
export const AIU_V2_THESIS = "The log is kept in my Appuscholar account and I can show it to my supervisor on request.";

/** Replaces `from` by `to` only where it stands with the words v1 put after it (and, for the bracket, ends the text), never inside the student's own words. */
function replaceBefore(text: string, from: string, after: string, to: string): string {
  const i = text.lastIndexOf(from + after);
  return i < 0 ? text : text.slice(0, i) + to + text.slice(i + from.length);
}

export function aiuBuildV2(i: AiuInput): AiuBuilt {
  const r = aiuBuild(i);
  if ("refuse" in r) return r;
  // v1: the bracket ends the no-use text ("...records. <sentence>]" + the closing note, which ends the text); the thesis sentence is followed by the closing sentence.
  const closing = "\n\n[Check this against your own records. ";
  let text = r.text;
  const b = text.lastIndexOf(closing + AIU_V1_BRACKET + "]");
  if (b >= 0 && b + closing.length + AIU_V1_BRACKET.length + 1 === text.length) text = text.slice(0, b + closing.length) + AIU_V2_BRACKET + "]";
  return { text: replaceBefore(text, AIU_V1_THESIS, " AI is not an author of this work.", AIU_V2_THESIS) };
}
