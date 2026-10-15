"use client";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useT } from "@/lib/i18n";
import { insertAiText } from "@/lib/editor/insert";
import { toast } from "@/components/ui/toast";
import { useWorkspace } from "@/components/workspace/WorkspaceContext";
import type { SuggestionNote, SuggestionStatus } from "./actions";

export type { SuggestionNote, SuggestionStatus };

export type SuggestionValue = {
  /** The text Accept and Tab insert, or null. Draft first feedback and error messages are never here (rule 4). */
  sug: string | null;
  /** What the pane shows: the suggestion, Draft first feedback, or an error message. */
  text: string | null;
  note: SuggestionNote | null;
  status: SuggestionStatus;
  /** True when the suggestion replaces the selection it was made from (Improve, Extend), false when it goes at the end (Continue). */
  selectionAtRequest: boolean;
  set(text: string, note: SuggestionNote | null, selectionAtRequest: boolean): void;
  setFeedback(text: string): void;
  setThinking(status: SuggestionStatus): void;
  /** Resets the pane. Without a message it returns to the Tools tab; with one (an error, or the placeholder) the pane stays where it is. */
  clear(msg?: string): void;
  /** The open document's editor, registered by the document card. */
  editor: Editor | null;
  setEditor(editor: Editor | null): void;
  accept(): void;
  copy(): void;
  /** The editor's Tab key: accepts and returns true only when a suggestion is waiting, otherwise false so Tab moves focus. */
  tab(): boolean;
};

const Ctx = createContext<SuggestionValue | null>(null);

export function SuggestionProvider({ children }: { children: React.ReactNode }) {
  const t = useT();
  const { dockShow, setAiWaiting } = useWorkspace();
  const [sug, setSug] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [note, setNote] = useState<SuggestionNote | null>(null);
  const [status, setStatus] = useState<SuggestionStatus>("idle");
  const [selectionAtRequest, setSelectionAtRequest] = useState(false);
  const [editor, setEditorState] = useState<Editor | null>(null);
  // Mirrors for the editor's key handler and the buttons, which can fire before a render has caught up.
  const live = useRef({ sug: null as string | null, replace: false, editor: null as Editor | null });

  const set = useCallback<SuggestionValue["set"]>((s, n, replace) => {
    live.current.sug = s; live.current.replace = replace;
    setSug(s); setText(s); setNote(n); setStatus("idle"); setSelectionAtRequest(replace);
    dockShow("ai");
    setAiWaiting(true);
  }, [dockShow, setAiWaiting]);
  const setFeedback = useCallback((s: string) => {
    live.current.sug = null;
    setSug(null); setText(s); setNote(null); setStatus("idle");
    dockShow("ai");
    setAiWaiting(true);
  }, [dockShow, setAiWaiting]);
  const setThinking = useCallback((s: SuggestionStatus) => {
    live.current.sug = null;
    setSug(null); setText(null); setNote(null); setStatus(s);
  }, []);
  const clear = useCallback((msg?: string) => {
    live.current.sug = null;
    setSug(null); setText(msg ?? null); setNote(null); setStatus("idle"); setSelectionAtRequest(false);
    setAiWaiting(false);
    if (msg === undefined) dockShow("tools");
  }, [dockShow, setAiWaiting]);

  const setEditor = useCallback((e: Editor | null) => {
    // A suggestion belongs to the document it was written for: another document's editor must not receive it.
    if (live.current.editor !== e && live.current.sug !== null) { live.current.sug = null; setSug(null); setText(null); setNote(null); setAiWaiting(false); }
    live.current.editor = e;
    setEditorState(e);
  }, [setAiWaiting]);

  const accept = useCallback(() => {
    const s = live.current.sug, ed = live.current.editor;
    if (!s || !ed || ed.isDestroyed) { toast("No suggestion to accept yet"); return; }
    insertAiText(ed, s, live.current.replace);
    clear(t("ai_pane_placeholder"));
    dockShow("tools");
    toast("Inserted ✓ — Ctrl+Z to undo");
  }, [clear, dockShow, t]);
  const copy = useCallback(() => {
    const s = live.current.sug;
    if (!s) { toast("Nothing to copy yet"); return; }
    navigator.clipboard?.writeText(s).then(() => toast("Copied ✓"), () => toast("Could not copy — select the text instead"));
  }, []);
  const tab = useCallback(() => {
    if (!live.current.sug) return false;
    accept();
    return true;
  }, [accept]);

  const value = useMemo<SuggestionValue>(
    () => ({ sug, text, note, status, selectionAtRequest, set, setFeedback, setThinking, clear, editor, setEditor, accept, copy, tab }),
    [sug, text, note, status, selectionAtRequest, set, setFeedback, setThinking, clear, editor, setEditor, accept, copy, tab]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSuggestion(): SuggestionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSuggestion must be used inside <SuggestionProvider>");
  return v;
}
