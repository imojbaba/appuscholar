import { buildChatPrompt } from "@appuscholar/core";

/** What the chat needs from the outside, so the orchestration can be driven with fakes in a test. */
export type ChatDeps = {
  callAI(prompt: string, opts: { temp: number; max: number }): Promise<string>;
  /** The student's field of study (settings.field). */
  field: string;
};

export type ChatReply = { text: string; error: boolean };

/** v1 askAI: one question to the writing coach. A failure comes back as the message to show in the bubble, never as a throw. */
export async function askAppuscholar(question: string, d: ChatDeps): Promise<ChatReply> {
  const built = buildChatPrompt(d.field || "psychology", question);
  try {
    const text = await d.callAI(built.prompt, { temp: built.temp, max: built.max });
    return { text, error: false };
  } catch (e) {
    return { text: e instanceof Error && e.message ? e.message : "Something went wrong. Try again.", error: true };
  }
}
