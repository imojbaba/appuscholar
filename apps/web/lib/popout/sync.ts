"use client";
import { useEffect, useRef } from "react";
import type { Editor } from "@tiptap/core";
import { sanitizeHtml, type Formatted } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { useSuggestion } from "@/lib/ai/suggestion";
import { CITATION_INSERTED } from "@/lib/cite/actions";
import { insertCitation, insertHtmlBlock, insertTextAtCursor } from "@/lib/editor/insert";
import { canPopOut, type ToolId } from "@/lib/tools";
import { toast } from "@/components/ui/toast";
import { onSyncMessage, syncChannel, type InsertMessage } from "./channel";
import { POPOUT_PATH, isPopout } from "./mode";

export { POPOUT_WRITABLE, blobWritable, isPopout } from "./mode";
export { setSyncChannel, type InsertMessage } from "./channel";

/*
 * Pop-out windows for the Citation Manager and Research (v1 1959-1966, 7601-7622, citInsertAtCursor 7481-7487, citPutIntext 7501, the boot 13690-13696):
 * the Dock's "⧉ Pop out" opens the tool in its own window; there every insert goes over the `appu_sync` channel to the writing window, which puts it at
 * its cursor. Register row D-S2-17.
 */

export type PopoutTool = "cite" | "research";
export const isPopoutTool = (s: unknown): s is PopoutTool => s === "cite" || s === "research";
/** v1 7619: `'popup=yes,width=540,height=820'`. */
export const POPOUT_FEATURES = "popup=yes,width=540,height=820";

/**
 * v1 popOutTool (7617-7622): only Citations and Research open in their own window (pop_unsupported for the others); the window is named after the tool,
 * so a second click brings the same window back; a blocked window says pop_blocked; the window is focused.
 */
export function openPopout(tool: ToolId | string, t: (key: string) => string): void {
  if (!canPopOut(tool as ToolId)) { toast(t("pop_unsupported")); return; }
  const w = window.open(POPOUT_PATH + "?tool=" + tool, "appu_pop_" + tool, POPOUT_FEATURES);
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
  /** Something can receive an insert: an open document here, always in a pop-out (v1 never disables these buttons there). */
  ready: boolean;
  /** citPutIntext's insert (7500-7502): false when nothing went in (no document open). */
  citation(f: Formatted): boolean;
  /** citInsertAtCursor (7481): text the student wrote, escaped by the receiver. */
  text(s: string): boolean;
  /** insertHTMLBlockIntoEditor (4228): markup the app built (the reference list, a translated quote). */
  block(html: string): boolean;
};

/**
 * The panels' inserts. In the writing window they go into the open document (insertCitation, insertTextAtCursor, insertHtmlBlock); a document that
 * closed meanwhile (its editor destroyed) receives nothing. In a pop-out they are posted to the writing window: the in-text citation as text, AMA's
 * number as `[n]` text (v1 7501: `f.sup&&!POPOUT`), a quote as text, and the reference list and a translated quote as markup (v1 inserts those
 * into the pop-out's own hidden editor, where they are lost; register row D-S2-17).
 */
export function useInsertTarget(): InsertTarget {
  const t = useT();
  const { editor } = useSuggestion();
  if (isPopout()) {
    const send = (m: InsertMessage) => { postInsert(m, t); return true; };
    return { ready: true, citation: (f) => send({ type: "insert", text: " " + f.intext }), text: (s) => send({ type: "insert", text: s }), block: (html) => send({ type: "insert", html }) };
  }
  const live = (): Editor | null => (editor && !editor.isDestroyed ? editor : null);
  const into = (fn: (e: Editor) => void) => { const e = live(); if (!e) return false; fn(e); return true; };
  return {
    ready: live() !== null,
    citation: (f) => into((e) => insertCitation(e, f)),
    text: (s) => into((e) => insertTextAtCursor(e, s)),
    block: (html) => into((e) => insertHtmlBlock(e, html))
  };
}

/**
 * The writing window's receiver (v1 7604-7611, mounted once by the workspace): `{type:'insert',text}` goes in at the cursor by v1's
 * insertIntoEditor rule (`hasSelection()||!!savedRange`: at the placed cursor, else at the end on a new line; insertTextAtCursor), markup by
 * insertHTMLBlockIntoEditor's (insertHtmlBlock, sanitised first), then "Citation inserted ✓" (v1 7609, a literal). A pop-out does not receive.
 */
export function useSyncReceiver(editor: Editor | null): void {
  const ref = useRef(editor);
  useEffect(() => { ref.current = editor; }, [editor]);
  useEffect(() => {
    if (isPopout()) return;
    return onSyncMessage((data) => {
      const m = (data ?? {}) as { type?: unknown; text?: unknown; html?: unknown };
      if (m.type !== "insert") return;
      const e = ref.current;
      if (!e || e.isDestroyed) return;
      if (typeof m.text === "string") insertTextAtCursor(e, m.text);
      else if (typeof m.html === "string") insertHtmlBlock(e, sanitizeHtml(m.html));
      else return;
      toast(CITATION_INSERTED);
    });
  }, []);
}
