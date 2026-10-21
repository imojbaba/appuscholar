import type { SelectionRange } from "@/lib/editor/insert";
import {
  accCheck, buildDevilPrompt, buildDraftFirstPrompt, buildGapFinderPromptV2, buildHelperPrompt, buildIdeaPromptV2, buildLitReviewPrompt, buildQuickReadPrompt, buildRankPrompt,
  buildShelfSummaryPromptV2, buildSuggestTermsPrompt, buildWritingPrompt, DEVIL_MIN_WORDS, HELPER_MIN_CHARS, QUICK_READ_MIN_CHARS, rsParseTerms, rsQuickCheck, rsRankParse, shMineOk,
  shSummaryNoteId, type Built, type HelperKind, type RsPaper, type RsQuick, type ShNote, type WritingKind
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

const errorText = (e: unknown): string => (e instanceof Error && e.message ? e.message : "Something went wrong. Try again.");

/** v1 showAIError: the pane stays open on the message and a toast repeats it. */
function fail(d: Pick<ActionDeps, "clear" | "dockShow" | "toast">, e: unknown): void {
  const msg = errorText(e);
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

/** v1 ideaAssess's sentences (8572, 8574): a toast and the pane text of v1's script, English in both languages as in v1, like the writing actions' toasts. */
export const IDEA_NEED_TOPIC = "Describe your working idea first";
export const IDEA_THINKING = "💜 Thinking this through…";

/** What "Check if it is doable" touches: the AI, a toast, and the four fields as the student typed them. */
export type IdeaDeps = Pick<ActionDeps, "callAI" | "toast"> & {
  /** fieldLabel(settings.field): v1 fieldName(). */
  field: string;
  intake: { topic: string; resources: string; timeframe: string; constraints: string };
};

/**
 * "Check if it is doable" (v1 ideaAssess 8568-8580, its prompt and budget unchanged): the advisor's read as the engine wrote it, which first run and the
 * Idea place show in their read panel and keep with the idea (`idea_intake.read`) instead of the suggestion pane. Null when nothing was read: no idea
 * yet (v1's toast), or the call failed (its message in a toast).
 */
export async function checkIdea(d: IdeaDeps): Promise<string | null> {
  if (!d.intake.topic.trim()) { d.toast(IDEA_NEED_TOPIC); return null; }
  // The builder trims each field, fills the defaults of the three optional ones and makes v1's cuts (2,000 / 1,000 / 1,000); V2 names each area's line by the area (W7).
  const built = buildIdeaPromptV2(d.field, d.intake);
  try {
    return await d.callAI(built.prompt, { temp: built.temp, max: built.max });
  } catch (e) {
    d.toast(errorText(e));
    return null;
  }
}

/** v1 psychTool's sentences (8604, 8606, 8609, 8610, 8613): toasts, confirm and pane text of v1's script, English in both languages as in v1. */
export const HELPER_NEED_TEXT = "Write or select some text first, then tap the tool";
export const HELPER_CASE_CONFIRM = "This text will be sent to your AI provider.\n\nRemove names, dates of birth, addresses and any other identifying details before you continue (APA Ethics 4.07).\n\nContinue?";
export const HELPER_LONG_DOC = "Long document — analyzing the first 12,000 characters. Select a section for a sharper answer.";
export const HELPER_THINKING = "💜 Thinking…";
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
    d.toast(d.t("rs2_ready_press_tab_in"));
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

/** What the Research tool's two AI steps touch: the AI (with v1's noLang, which keeps the content-language line out of these prompts), the field, the copy. */
export type ResearchAiDeps = {
  callAI(prompt: string, opts: { temp: number; max: number; noLang?: boolean }): Promise<string>;
  /** fieldLabel(settings.field): v1 fieldName(). */
  field: string;
  t(key: string, vars?: Record<string, string | number>): string;
};

/**
 * rsRank (v1 8220-8234): the papers in batches of 12, each batch's prompt from core's buildRankPrompt (its words counted as v1 counts them, the
 * prompt split on white space), each reply read by rsRankParse. A batch whose call fails or whose reply gives no score counts as failed; a key,
 * 401, 403, quota or limit error on the first batch stops the ranking (the caller reports "ranking failed"). Scores land on copies of the papers.
 * `isCurrent`, when given, is asked before each batch: false stops the loop (the search was superseded).
 */
export async function rankPapers(list: RsPaper[], q: string, d: ResearchAiDeps & { isCurrent?(): boolean }): Promise<{ papers: RsPaper[]; scored: number; words: number; failed: number }> {
  const papers = list.map((p) => ({ ...p }));
  let words = 0, scored = 0, failed = 0;
  for (let i = 0; i < papers.length; i += 12) {
    // A newer search has begun: no more of this one's batches go to the AI.
    if (d.isCurrent && !d.isCurrent()) break;
    const batch = papers.slice(i, i + 12);
    const built = buildRankPrompt(d.field, q, batch);
    words += built.prompt.split(/\s+/).length;
    let out: string;
    try { out = await d.callAI(built.prompt, { temp: built.temp, max: built.max, noLang: built.noLang }); }
    catch (e) { if (/key|401|403|quota|limit/i.test((e instanceof Error && e.message) || "") && i === 0) throw e; failed++; continue; }
    const res = rsRankParse(out, batch.length);
    if (!Object.keys(res).length) { failed++; continue; }
    batch.forEach((p, k) => { const r = res[k + 1]; if (r) { p.rel = { score: r.score, reason: r.reason || d.t("rs2_no_reason_given"), titleOnly: !String(p.abstract || "").trim() }; scored++; } });
  }
  return { papers, scored, words, failed };
}

/** v1's RS_TERMS (8236): the topic the terms were suggested for, the terms, and which are ticked. */
export type RsTerms = { base: string; terms: string[]; picked: boolean[] };
/** What #rsTerms shows: nothing, v1's "Thinking…" line, its "No useful related terms" line, or the ticked boxes of RS_TERMS. */
export type RsTermsBox = "idle" | "thinking" | "none" | "list";

/**
 * "💡 Suggest related terms" (v1 rsSuggestTerms 8251-8263): a topic of 3 characters or more, core's prompt with its options, the reply read by
 * core's rsParseTerms; every term comes back ticked. Like v1, RS_TERMS changes only when terms came back; a failure empties the box and toasts.
 */
export async function suggestTerms(topic: string, d: ResearchAiDeps & { toast(msg: string): void; setBox(box: RsTermsBox): void; setTerms(terms: RsTerms): void }): Promise<void> {
  const q = topic.trim();
  if (q.length < 3) { d.toast(d.t("rs2_type_a_topic_first")); return; }
  d.setBox("thinking");
  try {
    const built = buildSuggestTermsPrompt(d.field, q);
    const out = await d.callAI(built.prompt, { temp: built.temp, max: built.max, noLang: built.noLang });
    const terms = rsParseTerms(out, q);
    if (!terms.length) { d.setBox("none"); return; }
    d.setTerms({ base: q, terms, picked: terms.map(() => true) });
    d.setBox("list");
  } catch (e) {
    d.setBox("idle");
    d.toast(e instanceof Error && e.message ? e.message : "Something went wrong. Try again.");
  }
}

/** rsPickedTerms (8269-8272): the ticked terms, only while the topic is the one they were suggested for. */
export const pickedTerms = (s: RsTerms, q: string): string[] => (s.base !== q ? [] : s.terms.filter((_, i) => s.picked[i]));

/** callAI's sentence for the student (v1 apiMsg(e)). */
const aiMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong. Try again.");

/** What the quick read touches: the AI (with noLang), the field, the copy, the toasts, and `apply`, which writes the results on their papers and draws the list again (rsApplySort(true)). */
export type QuickDeps = ResearchAiDeps & { toast(msg: string): void; apply(updates: ReadonlyArray<readonly [RsPaper, RsQuick]>): void };

/**
 * rsQuickP (8172-8182) without its write: a trimmed abstract of at least QUICK_READ_MIN_CHARS characters once white space is removed, core's prompt
 * and options, the reply checked against that abstract by core's rsQuickCheck. Quiet, it toasts nothing (the ticked batch).
 */
async function quickOne(p: RsPaper, d: QuickDeps, quiet: boolean): Promise<RsQuick | null> {
  const ab = String(p.abstract || "").trim();
  if (ab.replace(/\s+/g, "").length < QUICK_READ_MIN_CHARS) { if (!quiet) d.toast(d.t("rs2_this_result_has_no")); return null; }
  try {
    const built = buildQuickReadPrompt(d.field, ab);
    const raw = await d.callAI(built.prompt, { temp: built.temp, max: built.max, noLang: built.noLang });
    const r = rsQuickCheck(raw, ab);
    if (!r) { if (!quiet) d.toast(d.t("rs2_the_ai_reply_could")); return null; }
    return r;
  } catch (e) { if (!quiet) d.toast(aiMsg(e)); return null; }
}

/** A card's "⚡ Quick read" (rsQuick / rsQuickP 8171-8182): true once the paper carries its quick read. */
export async function quickRead(p: RsPaper, d: QuickDeps): Promise<boolean> {
  const r = await quickOne(p, d, false);
  if (!r) return false;
  d.apply([[p, r]]);
  return true;
}

/**
 * "⚡ Quick read the papers I ticked (up to 10)" (rsQuickChecked 8183-8190): the first 10 ticked papers one after another, quietly, with v1's
 * progress toast for each; the list is drawn again once at the end, then v1's count.
 */
export async function quickReadTicked(ticked: RsPaper[], d: QuickDeps): Promise<void> {
  if (!ticked.length) { d.toast(d.t("rs2_tick_some_papers_first")); return; }
  const use = ticked.slice(0, 10);
  let ok = 0;
  const done: Array<readonly [RsPaper, RsQuick]> = [];
  for (const [i, p] of use.entries()) {
    // 'Quick read '+(use.indexOf(p)+1)+' of '+use.length+'…' (8187)
    d.toast(d.t("rs2_quick_read_2") + " " + (i + 1) + " " + d.t("rs2_of", { useCount: use.length }));
    const r = await quickOne(p, d, true);
    if (r) { ok++; done.push([p, r]); }
  }
  d.apply(done);
  // 'Quick read done for '+ok+' of '+use.length+(idx.length>10?' (the first 10 ticked)':'') (8189)
  d.toast(d.t("rs2_quick_read_done_for", { ok }) + " " + use.length + (ticked.length > 10 ? " " + d.t("rs2_the_first_10_ticked") : ""));
}

/** What the literature review and the gap finder touch: the suggestion pane, the AI, the field and the copy. */
export type GeneratorDeps = Pick<ActionDeps, "callAI" | "setThinking" | "isCurrent" | "set" | "clear" | "dockShow" | "toast"> & {
  /** fieldLabel(settings.field): v1 fieldName(). */
  field: string;
  t: ResearchAiDeps["t"];
};

/** researchLitReview / researchGapFinder (8530-8551): at least 2 ticked papers, core's prompt over them, v1's pane text, an insertable answer. */
async function generate(build: (field: string, papers: RsPaper[]) => Built, label: string, papers: RsPaper[], d: GeneratorDeps): Promise<void> {
  if (papers.length < 2) { d.toast(d.t("rs2_check_at_least_2")); return; }
  // The builder numbers the papers with core's rsCorpusText and appends PLAIN_OUT, as v1 does.
  const built = build(d.field, papers);
  const token = d.setThinking("custom", null, label);
  d.dockShow("ai");
  try {
    const reply = await d.callAI(built.prompt, { temp: built.temp, max: built.max });
    if (!d.isCurrent(token)) return;
    // v1 shows no accuracy check for this answer (setSug with no note, 8538, 8549).
    d.set(reply, null, token);
    d.dockShow("ai");
    d.toast(d.t("rs2_ready_press_tab_in"));
  } catch (e) { if (d.isCurrent(token)) fail(d, e); }
}

/** "📝 Draft literature review paragraph" (researchLitReview 8530-8540) on the ticked papers shown. */
export const litReview = (papers: RsPaper[], d: GeneratorDeps): Promise<void> =>
  generate(buildLitReviewPrompt, d.t("rs2_reading_abstracts_and_drafting", { papersCount: papers.length }), papers, d);

/** "🕳 Find a research gap" (researchGapFinder 8541-8551) on the ticked papers shown. */
export const gapFinder = (papers: RsPaper[], d: GeneratorDeps): Promise<void> =>
  generate(buildGapFinderPromptV2, d.t("rs2_looking_for_what_these"), papers, d);

/** What the Reading shelf's summary touches: the AI (callAI scans for personal data first), the field, the copy, the paper, the note store and the reader's summary box. */
export type ShelfSummaryDeps = Pick<ResearchAiDeps, "callAI" | "field" | "t"> & {
  /** The student's own lines (the textarea under "Summary, after you think first"). */
  mine: string;
  pages: string[];
  /** Adds the note to the paper and stores it now: true once it is on the server. */
  saveNote(note: ShNote): Promise<boolean>;
  /** The reader's summary box (#shAi): v1 writes the result there, not in the AI pane. */
  setOut(text: string): void;
  now?(): Date;
};

/**
 * "Summarise with AI" (shSummarise 11685-11696): nothing until the student's text passes core's shMineOk (2 non-empty lines, 12 words); their lines are saved first, as the note
 * "My own summary before the AI: …" on page 0 (11688); then "Reading…", core's buildShelfSummaryPromptV2 over the pages (email addresses replaced; the opening, any limitations, then the discussion, method and results, within 18,000 characters: W18; temp 0.2,
 * max 1000, noLang), and the reply, trimmed, with v1's comparison line. A failure shows callAI's sentence with any tag removed, else "The summary could not be made.". Beyond v1:
 * when the note cannot be stored (v1's shPut would have thrown before the call), no call is made and the box says "The summary could not be made.".
 */
export async function shelfSummarise(d: ShelfSummaryDeps): Promise<void> {
  if (!shMineOk(d.mine)) return;
  const now = d.now ? d.now() : new Date();
  const saved = await d.saveNote({ id: shSummaryNoteId(now.getTime()), page: 0, quote: "", note: d.t("sh2_my_own_summary_before") + " " + d.mine.trim(), at: now.toISOString() });
  if (!saved) { d.setOut(d.t("sh2_the_summary_could_not")); return; }
  const built = buildShelfSummaryPromptV2(d.field, d.pages);
  d.setOut(d.t("sh2_reading_2"));
  try {
    const a = await d.callAI(built.prompt, { temp: built.temp, max: built.max, noLang: built.noLang });
    d.setOut(String(a || "").trim() + "\n\n" + d.t("sh2_compare_this_with_your"));
  } catch (e) {
    let m = d.t("sh2_the_summary_could_not");
    if (e instanceof Error && e.message) m = e.message.replace(/<[^>]+>/g, "");
    d.setOut(m);
  }
}
