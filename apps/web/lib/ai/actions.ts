import type { SelectionRange } from "@/lib/editor/insert";
import {
  accCheck, buildDevilPrompt, buildDraftFirstPrompt, buildHelperPrompt, buildIdeaPrompt, buildWritingPrompt, DEVIL_MIN_WORDS, HELPER_MIN_CHARS,
  type HelperKind, type WritingKind
} from "@appuscholar/core";

/** "custom": a request outside the writing buttons (a stage tool), whose pane text is the label given to setThinking. */
export type SuggestionStatus = "idle" | "thinking" | "polishing" | "expanding" | "reading" | "custom";
export type SuggestionNote = { msg: string; warn: boolean };

/** Everything the three writing buttons and Draft first touch, so the orchestration can be driven with fakes in a test. */
export type ActionDeps = {
  callAI(prompt: string, opts: { temp: number; max: number }): Promise<string>;
  hasSelection(): boolean;
  selectionText(): string;
  /** The selection with its position, captured when the request starts so Accept can replace that range later (v1 savedRange). */
  selectionRange(): SelectionRange | null;
  tailText(): string;
  /** Starts a request and returns its token. `range` is the text the answer will replace (Improve, Extend), null to append (Continue): the provider keeps it mapped through edits made while the AI thinks. `label`, when given, is the pane's text while it waits (v1's sentence for that tool) in place of the status's own. Starting another request, dismissing, or switching document makes the token stale. */
  setThinking(status: SuggestionStatus, range?: SelectionRange | null, label?: string): number;
  /** False once the request that was given `token` has been superseded: its answer (or error) must be dropped. */
  isCurrent(token: number): boolean;
  /** A suggestion the student can accept: Tab and Accept insert it, over the range given to `setThinking` or at the end. `note` is the accuracy check, null where v1 shows none. */
  set(text: string, note: SuggestionNote | null, token: number): void;
  /** Draft first feedback: shown in the pane, never insertable (rule 4). */
  setFeedback(text: string, token: number): void;
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
function fail(d: Pick<ActionDeps, "clear" | "dockShow" | "toast">, e: unknown): void {
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
  const range = kind === "continue" ? null : d.selectionRange();
  const orig = kind === "continue" ? d.tailText() : d.selectionText();
  const built = buildWritingPrompt(kind, orig, d.stylePrompt);
  const token = d.setThinking(THINKING[kind], range);
  d.dockShow("ai");
  try {
    const res = await d.callAI(built.prompt, { temp: built.temp, max: built.max });
    if (!d.isCurrent(token)) return;
    const c = accCheck(orig, res, kind);
    d.set(res, { msg: c.msg, warn: c.warn }, token);
    d.dockShow("ai");
    d.toast(kind === "continue" ? "Suggestion ready — press Tab in the editor to accept" : "Ready — press Tab to replace your selection");
  } catch (e) { if (d.isCurrent(token)) fail(d, e); }
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
  const token = d.setThinking("reading");
  d.dockShow("ai");
  try {
    const reply = await d.callAI(built.prompt, { temp: built.temp, max: built.max });
    if (!d.isCurrent(token)) return;
    d.setFeedback(d.t("df_label") + "\n\n" + reply, token);
    d.dockShow("ai");
    d.toast(d.t("df_ready"));
  } catch (e) { if (d.isCurrent(token)) fail(d, e); }
}

/** v1 ideaAssess's three sentences (8572, 8574, 8578): toasts and pane text of v1's script, English in both languages as in v1, like the writing actions' toasts. */
export const IDEA_NEED_TOPIC = "Describe your working idea first";
export const IDEA_THINKING = "💜 Thinking this through…";
export const IDEA_READY = "Ready — press Tab in the editor to insert";

/** What Assess feasibility touches: the suggestion pane, the AI, and the four fields as the student typed them. */
export type IdeaDeps = Pick<ActionDeps, "callAI" | "setThinking" | "isCurrent" | "set" | "clear" | "dockShow" | "toast"> & {
  /** fieldLabel(settings.field): v1 fieldName(). */
  field: string;
  intake: { topic: string; resources: string; timeframe: string; constraints: string };
};

/** Idea & Feasibility's "🔎 Assess feasibility" (v1 ideaAssess 8568-8580): the advisor's read lands in the suggestion pane, insertable with Tab or Accept. */
export async function assessIdea(d: IdeaDeps): Promise<void> {
  if (!d.intake.topic.trim()) { d.toast(IDEA_NEED_TOPIC); return; }
  // The builder trims each field, fills the defaults of the three optional ones and makes v1's cuts (2,000 / 1,000 / 1,000).
  const built = buildIdeaPrompt(d.field, d.intake);
  const token = d.setThinking("custom", null, IDEA_THINKING);
  d.dockShow("ai");
  try {
    const reply = await d.callAI(built.prompt, { temp: built.temp, max: built.max });
    if (!d.isCurrent(token)) return;
    // v1 shows no accuracy check for this answer (setSug with no note, 8577).
    d.set(reply, null, token);
    d.dockShow("ai");
    d.toast(IDEA_READY);
  } catch (e) { if (d.isCurrent(token)) fail(d, e); }
}

/** v1 psychTool's sentences (8604, 8606, 8609, 8610, 8613): toasts, confirm and pane text of v1's script, English in both languages as in v1. */
export const HELPER_NEED_TEXT = "Write or select some text first, then tap the tool";
export const HELPER_CASE_CONFIRM = "This text will be sent to your AI provider.\n\nRemove names, dates of birth, addresses and any other identifying details before you continue (APA Ethics 4.07).\n\nContinue?";
export const HELPER_LONG_DOC = "Long document — analyzing the first 12,000 characters. Select a section for a sharper answer.";
export const HELPER_THINKING = "💜 Thinking…";
export const HELPER_READY = "Ready — press Tab in the editor to insert";
/** Where the case tool's yes is kept for the session (v1 sessionKeys['appu_case_ack'], 8605-8607). */
export const HELPER_CASE_ACK_KEY = "appu_case_ack";

/** What the Research helpers touch: the suggestion pane, the AI, the text (v1 selText: the selection, else the whole document), the field, and the case tool's confirm and session store. */
export type HelperDeps = Pick<ActionDeps, "callAI" | "hasSelection" | "selectionText" | "setThinking" | "isCurrent" | "set" | "setFeedback" | "clear" | "dockShow" | "toast" | "t"> & {
  /** The whole document as v1's getEditorText (3151) read it: docInnerText of the editor's HTML. */
  docText(): string;
  /** fieldLabel(settings.field): v1 fieldName(). */
  field: string;
  confirm(msg: string): boolean;
  session: { get(key: string): string | null; set(key: string, value: string): void };
};
export type DevilDeps = Omit<HelperDeps, "field" | "confirm" | "session">;

/** v1 selText (5554): the selection when there is one, else the whole document. */
const helperText = (d: Pick<HelperDeps, "hasSelection" | "selectionText" | "docText">) => d.hasSelection() ? d.selectionText() : d.docText();

/** One of the five Research helpers (v1 psychTool 8600-8615): the answer lands in the suggestion pane, insertable with Tab or Accept. */
export async function runHelper(kind: HelperKind, d: HelperDeps): Promise<void> {
  const whole = !d.hasSelection();
  const txt = helperText(d).trim();
  if (txt.length < HELPER_MIN_CHARS) { d.toast(HELPER_NEED_TEXT); return; }
  if (kind === "case" && !d.session.get(HELPER_CASE_ACK_KEY)) {
    if (!d.confirm(HELPER_CASE_CONFIRM)) return;
    d.session.set(HELPER_CASE_ACK_KEY, "1");
  }
  if (whole && txt.length > 12000) d.toast(HELPER_LONG_DOC);
  // The builder adds v1's "\n\nText:\n" and cuts the text to its first 12,000 characters.
  const built = buildHelperPrompt(kind, d.field, txt);
  const token = d.setThinking("custom", null, HELPER_THINKING);
  d.dockShow("ai");
  try {
    const reply = await d.callAI(built.prompt, { temp: built.temp, max: built.max });
    if (!d.isCurrent(token)) return;
    // v1 shows no accuracy check for this answer (setSug with no note, 8612).
    d.set(reply, null, token);
    d.dockShow("ai");
    d.toast(HELPER_READY);
  } catch (e) { if (d.isCurrent(token)) fail(d, e); }
}

/** "😈 Challenge my argument" (v1 devilTool 8619-8630): a reviewer's objections, shown in the pane as feedback that Tab and Accept never insert. */
export async function runDevil(d: DevilDeps): Promise<void> {
  const txt = helperText(d).trim();
  if (txt.split(/\s+/).filter(Boolean).length < DEVIL_MIN_WORDS) { d.toast(d.t("devil_need")); return; }
  // The builder adds v1's "\n\nPASSAGE:\n" and cuts the passage to its first 6,000 characters.
  const built = buildDevilPrompt(txt);
  const token = d.setThinking("custom", null, d.t("devil_thinking"));
  d.dockShow("ai");
  try {
    const reply = await d.callAI(built.prompt, { temp: built.temp, max: built.max });
    if (!d.isCurrent(token)) return;
    d.setFeedback(d.t("devil_label") + "\n\n" + reply, token);
    d.dockShow("ai");
    d.toast(d.t("devil_ready"));
  } catch (e) { if (d.isCurrent(token)) fail(d, e); }
}
