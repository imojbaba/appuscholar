import { accCheck, buildDraftFirstPrompt, buildWritingPrompt, type WritingKind } from "@appuscholar/core";

export type SuggestionStatus = "idle" | "thinking" | "polishing" | "expanding" | "reading";
export type SuggestionNote = { msg: string; warn: boolean };

/** Everything the three writing buttons and Draft first touch, so the orchestration can be driven with fakes in a test. */
export type ActionDeps = {
  callAI(prompt: string, opts: { temp: number; max: number }): Promise<string>;
  hasSelection(): boolean;
  selectionText(): string;
  tailText(): string;
  setThinking(status: SuggestionStatus): void;
  /** A suggestion the student can accept: Tab and Accept insert it. `selectionAtRequest` says whether it replaces a selection. */
  set(text: string, note: SuggestionNote, selectionAtRequest: boolean): void;
  /** Draft first feedback: shown in the pane, never insertable (rule 4). */
  setFeedback(text: string): void;
  clear(msg?: string): void;
  dockShow(which: "tools" | "ai"): void;
  toast(msg: string): void;
  t(key: string): string;
  draftFirst: boolean;
  /** The optional My Writing Style block appended to the prompt. */
  stylePrompt?: string;
};

const THINKING: Record<WritingKind, SuggestionStatus> = { continue: "thinking", improve: "polishing", expand: "expanding" };
const NEED_SELECTION: Record<"improve" | "expand", string> = {
  improve: "Select the text you want to improve first",
  expand: "Select the text you want to expand first"
};

/** v1 showAIError: the pane stays open on the message and a toast repeats it. */
function fail(d: ActionDeps, e: unknown): void {
  const msg = e instanceof Error && e.message ? e.message : "Something went wrong. Try again.";
  d.clear(msg);
  d.dockShow("ai");
  d.toast(msg);
}

/** Continue Writing, Improve selection and Extend. With Draft first on, all three ask for feedback instead and write nothing. */
export async function runWritingAction(kind: WritingKind, d: ActionDeps): Promise<void> {
  if (d.draftFirst) return runDraftFirst(kind === "continue" ? "tail" : kind, d);
  if (kind !== "continue" && !d.hasSelection()) { d.toast(NEED_SELECTION[kind]); return; }
  // Captured now: whatever the student selects while the AI is thinking is not what the answer is for (v1 savedRange).
  const selectionAtRequest = kind !== "continue";
  const orig = kind === "continue" ? d.tailText() : d.selectionText();
  const built = buildWritingPrompt(kind, orig, d.stylePrompt);
  d.setThinking(THINKING[kind]);
  d.dockShow("ai");
  try {
    const res = await d.callAI(built.prompt, { temp: built.temp, max: built.max });
    const c = accCheck(orig, res, kind);
    d.set(res, { msg: c.msg, warn: c.warn }, selectionAtRequest);
    d.dockShow("ai");
    d.toast(kind === "continue" ? "Suggestion ready — press Tab in the editor to accept" : "Ready — press Tab to replace your selection");
  } catch (e) { fail(d, e); }
}

/** Draft first (v1 draftFeedback): a supervisor's questions about the passage. `sug` stays empty, so Tab and Accept insert nothing. */
export async function runDraftFirst(kind: "tail" | "improve" | "expand", d: ActionDeps): Promise<void> {
  let passage: string;
  if (kind === "tail") {
    passage = d.tailText();
    if (passage.trim().split(/\s+/).length < 25) { d.toast(d.t("df_need_text")); return; }
  } else {
    if (!d.hasSelection()) { d.toast(d.t("df_need_sel")); return; }
    passage = d.selectionText();
  }
  const built = buildDraftFirstPrompt(kind, passage);
  d.setThinking("reading");
  d.dockShow("ai");
  try {
    const reply = await d.callAI(built.prompt, { temp: built.temp, max: built.max });
    d.setFeedback(d.t("df_label") + "\n\n" + reply);
    d.dockShow("ai");
    d.toast(d.t("df_ready"));
  } catch (e) { fail(d, e); }
}
