import { apCheckQuote, apJson, buildAskPrompt } from "@appuscholar/core";
import { apOk, getAp, setAp, type ApAskItem } from "./useApDoc";

/** What Ask touches: the AI (callAI scans for personal data first and files the AI-use log), the field (fieldLabel, v1 fieldName), the toast and the copy. */
export type AskDeps = {
  callAI(prompt: string, opts: { temp: number; max: number; noLang?: boolean }): Promise<string>;
  field: string;
  toast(msg: string): void;
  t(key: string, vars?: Record<string, string | number>): string;
};

/** A failed call's toast: callAI's sentence for the student (v1's apiMsg), else the house fallback. */
export const aiFailMessage = (e: unknown): string => (e instanceof Error && e.message ? e.message : "Something went wrong. Try again.");

/**
 * apAsk (10032-10047) with apCall (10027-10030): nothing while a request runs; "Tick the box about the paper first" unless apOk; "Type a question first" under 4 characters once trimmed; then
 * core's buildAskPrompt (apPick at 9,000 characters, AP_RULES; temp 0.2, max 2000, noLang) and the reply read by apJson: not JSON keeps the raw text; else in_paper (false only when the
 * reply says false), the answer, and up to 4 quotations, each checked by apCheckQuote against the paper. The entry joins the log and the question box is emptied. The answer is drawn in the
 * panel (apAskRender), not the AI pane, as v1 draws it. A failed call toasts callAI's sentence (v2's apiMsg). Beyond v1: a reply that arrives after another paper was loaded is dropped
 * (v1 would add it to the new paper's log and check its quotations against the new paper), and the entry carries the title of the paper it was asked about (the panel's "About:" line, register D-S2-30).
 */
export async function apAsk(d: AskDeps): Promise<void> {
  const s = getAp();
  if (s.busy || !s.doc) return;
  if (!apOk(s)) { d.toast(d.t("ap2_tick_the_box_about")); return; }
  const q = (s.qDraft || "").trim();
  if (q.length < 4) { d.toast(d.t("ap2_type_a_question_first")); return; }
  const doc = s.doc, gen = s.gen;
  setAp({ busy: true });
  try {
    const built = buildAskPrompt(d.field, doc, q);
    const out = await d.callAI(built.prompt, { temp: built.temp, max: built.max, noLang: built.noLang });
    const r = apJson(out) as Record<string, unknown> | null;
    const item: ApAskItem = { q, title: doc.title, partial: built.pick.partial, n: built.pick.n, of: built.pick.of, quotes: [] };
    if (!r) item.raw = String(out || "");
    else {
      item.in_paper = r.in_paper !== false;
      item.answer = String(r.answer || "");
      item.quotes = (Array.isArray(r.quotes) ? r.quotes : []).slice(0, 4).map((x) => apCheckQuote(doc, x as string));
    }
    if (getAp().gen === gen) setAp((st) => ({ log: [...st.log, item], qDraft: "" }));
  } catch (e) {
    d.toast(aiFailMessage(e));
  }
  setAp({ busy: false });
}
