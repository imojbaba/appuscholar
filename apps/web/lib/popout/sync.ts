"use client";
import { useEffect, useRef } from "react";
import type { Editor } from "@tiptap/core";
import { sanitizeHtml, type Formatted } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { useProject, type ProjectValue } from "@/components/frame/ProjectContext";
import { CITATION_INSERTED } from "@/lib/cite/actions";
import { insertAiText, insertCitation, insertHtmlBlock, insertTextAtCursor } from "@/lib/editor/insert";
import type { StageKey } from "@/lib/tools";
import { toast } from "@/components/ui/toast";
import { onSyncMessage, syncChannel, type InsertMessage } from "./channel";
import { isPopout, windowHref } from "./mode";

export { blobWritable, isPopout, popoutStage, usePopout, windowHref } from "./mode";
export { setSyncChannel, type InsertMessage } from "./channel";

/*
 * A place in its own window (v1 1959-1966, 7601-7622, citInsertAtCursor 7481-7487, citPutIntext 7501, the boot 13690-13696): "Open in a new window"
 * opens the place's address with `?window=1`; there every insert goes over the `appu_sync` channel to the writing window, which puts it in the
 * open document. Register rows D-S2-17 and D-S2-43.
 */

/** v1 7619: `'popup=yes,width=540,height=820'`. */
export const POPOUT_FEATURES = "popup=yes,width=540,height=820";

/**
 * v1 popOutTool (7617-7622), for any place: the window is named after the stage, so a second click brings the same window back; a blocked window
 * says pop_blocked; the window is focused.
 */
export function openPlaceWindow(href: string, stage: StageKey, t: (key: string) => string): void {
  const w = window.open(windowHref(href), "appu_pop_" + stage, POPOUT_FEATURES);
  if (!w) { toast(t("pop_blocked")); return; }
  try { w.focus(); } catch { /* v1 ignores it too */ }
}

/**
 * v1 citInsertAtCursor's pop-out branch (7482-7484): `try{popChan&&popChan.postMessage({type:'insert',text});showToast(t('pop_sent'))}catch(e){showToast(t('pop_nowin'))}`.
 * The message is posted without asking whether a writing window listens: pop_sent unless the post throws (then pop_nowin), and pop_sent also when
 * this browser has no channel, as v1's `popChan&&` does. The caller's own toast follows, as in v1.
 */
export function postInsert(m: InsertMessage, t: (key: string) => string): void {
  try { syncChannel()?.postMessage(m); toast(t("pop_sent")); } catch { toast(t("pop_nowin")); }
}

/** Where a panel's inserts go: the open document's editor in the writing window, the writing window itself from a pop-out. */
export type InsertTarget = {
  /** citPutIntext's insert (7500-7502): false when nothing went in (the document did not open). */
  citation(f: Formatted): Promise<boolean>;
  /** citInsertAtCursor (7481): text the student wrote, escaped by the receiver. */
  text(s: string): Promise<boolean>;
  /** insertHTMLBlockIntoEditor (4228): markup the app built (the reference list, a translated quote). */
  block(html: string): Promise<boolean>;
};

/**
 * The panels' inserts. In the writing window they go into the open document through the shell's requestInsert (insertCitation,
 * insertTextAtCursor, insertHtmlBlock): a closed document opens beside the place first, a locked one asks for the passphrase once, and when it
 * does not open nothing goes in, the student is told, and the answer is false. In a pop-out they are posted to the writing window: the in-text
 * citation as text, AMA's number as `[n]` text (v1 7501: `f.sup&&!POPOUT`), a quote as text, and the reference list and a translated quote as
 * markup (v1 inserts those into the pop-out's own hidden editor, where they are lost; register row D-S2-17).
 */
export function useInsertTarget(): InsertTarget {
  const t = useT();
  const { requestInsert } = useProject();
  if (isPopout()) {
    const send = (m: InsertMessage) => { postInsert(m, t); return Promise.resolve(true); };
    return { citation: (f) => send({ type: "insert", text: " " + f.intext }), text: (s) => send({ type: "insert", text: s }), block: (html) => send({ type: "insert", html }) };
  }
  return {
    citation: (f) => requestInsert((e) => insertCitation(e, f)),
    text: (s) => requestInsert((e) => insertTextAtCursor(e, s)),
    block: (html) => requestInsert((e) => insertHtmlBlock(e, html))
  };
}

/**
 * The writing window's receiver (v1 7604-7611, mounted once by the project shell): `{type:'insert',text}` goes in at the cursor by v1's
 * insertIntoEditor rule (`hasSelection()||!!savedRange`: at the placed cursor, else at the end on a new line; insertTextAtCursor), markup by
 * insertHTMLBlockIntoEditor's (insertHtmlBlock, sanitised first), then "Citation inserted ✓" (v1 7609, a literal); AI text as putAiInDocument
 * puts it, then idea_inserted. All go through the shell's requestInsert (Task 11), so a document closed in this window opens to take them; when
 * it does not open, requestInsert says so and there is no "inserted". A pop-out does not receive.
 */
export function useSyncReceiver(requestInsert: ProjectValue["requestInsert"]): void {
  const t = useT();
  const ref = useRef({ requestInsert, t });
  useEffect(() => { ref.current = { requestInsert, t }; }, [requestInsert, t]);
  useEffect(() => {
    if (isPopout()) return;
    return onSyncMessage((data) => {
      const m = (data ?? {}) as { type?: unknown; text?: unknown; html?: unknown; ai?: unknown };
      if (m.type !== "insert") return;
      const { text, html, ai } = m;
      let run: (e: Editor) => void;
      let done = CITATION_INSERTED;
      if (typeof text === "string") run = (e) => insertTextAtCursor(e, text);
      else if (typeof html === "string") run = (e) => insertHtmlBlock(e, sanitizeHtml(html));
      // AI text, as putAiInDocument puts it in this window: at the end, marked as AI text (insertAiText escapes it).
      // It is not a citation, so it says what "Put in my document" says in this window.
      else if (typeof ai === "string") { run = (e) => insertAiText(e, ai, false); done = ref.current.t("idea_inserted"); }
      else return;
      void ref.current.requestInsert(run).then((ok) => { if (ok) toast(done); });
    });
  }, []);
}
