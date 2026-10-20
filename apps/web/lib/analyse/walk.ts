import { AP_STAGES, apWalkRes, buildWalkPrompt, type ApDoc } from "@appuscholar/core";
import type { ApNote } from "@/lib/blobs/kinds";
import { aiFailMessage, type AskDeps } from "./ask";
import { apOk, getAp, setAp, type ApState } from "./useApDoc";

/** What the walk-through touches beyond Ask's: the stage's words as the box shows them (`mine`, walkDraft) and the stored notes (useApNotes().put). */
export type WalkDeps = AskDeps & {
  mine(k: string): string;
  put(doc: Pick<ApDoc, "id" | "title">, fn: (n: ApNote) => void): boolean;
};

/** The words in "Try first." for a stage: what was typed in this visit (AP.tryDraft), else what is stored for the paper (apLoad copies it into AP.tryDraft, 9889), else nothing. */
export function walkDraft(s: Pick<ApState, "tryDraft">, note: ApNote | undefined, k: string): string {
  return s.tryDraft[k] ?? note?.stages[k]?.mine ?? "";
}

/**
 * apWalkShow (10048-10064) with apCall (10027-10030): nothing while a request runs; "Tick the box about the paper first" unless apOk; then core's buildWalkPrompt for the stage shown and its
 * trimmed words (apPick at 10,000 characters; temp 0.2, max 2000, noLang) and the reply as core's apWalkRes keeps it (the raw text, or the reading, up to 4 quotations checked against the paper,
 * not_stated, watch_for, check_question, check_answer). The reply becomes the stage's (AP.res, its suggested answer hidden again) and is stored with the trimmed words in the paper's note
 * (`stages[k] = { …, mine, res }`). A failed call toasts callAI's sentence. Beyond v1: a reply that arrives after another paper was loaded is dropped (v1 would show it on the new paper and store
 * it in the new paper's note).
 */
export async function apWalkShow(d: WalkDeps): Promise<void> {
  const s = getAp();
  if (s.busy || !s.doc) return;
  if (!apOk(s)) { d.toast(d.t("ap2_tick_the_box_about")); return; }
  const doc = s.doc, gen = s.gen, st = AP_STAGES[s.stage]!;
  const mine = (d.mine(st.k) || "").trim();
  setAp({ busy: true });
  try {
    const built = buildWalkPrompt(d.field, doc, st, mine);
    const out = await d.callAI(built.prompt, { temp: built.temp, max: built.max, noLang: built.noLang });
    const o = apWalkRes(doc, built.pick, out);
    if (getAp().gen === gen) {
      setAp((x) => ({ res: { ...x.res, [st.k]: o }, shown: { ...x.shown, [st.k]: false } }));
      d.put(doc, (n) => { n.stages[st.k] = { ...(n.stages[st.k] ?? {}), mine, res: o }; });
    }
  } catch (e) {
    d.toast(aiFailMessage(e));
  }
  setAp({ busy: false });
}
