"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useT } from "@/lib/i18n";
import { insertAiText, mapRange, type SelectionRange } from "@/lib/editor/insert";
import { toast } from "@/components/ui/toast";
import { useProject } from "@/components/frame/ProjectContext";
import type { SuggestionNote, SuggestionStatus } from "./actions";

export type { SuggestionNote, SuggestionStatus };

export type SuggestionValue = {
  /** The text Accept and Tab insert, or null. Draft first feedback and error messages are never here (rule 4). */
  sug: string | null;
  /** What the pane shows: the suggestion, Draft first feedback, or an error message. */
  text: string | null;
  note: SuggestionNote | null;
  status: SuggestionStatus;
  /** The pane's text while a request runs, when the request gave one (a stage tool's own v1 sentence); null otherwise, and once the request ends. */
  statusLabel: string | null;
  /** True when the suggestion replaces the selection it was made from (Improve, Extend), false when it goes at the end (Continue). */
  selectionAtRequest: boolean;
  /** Stores a result for the request that was given `token`; a stale token is ignored. It replaces the range given to `setThinking`, or is appended when there was none. */
  set(text: string, note: SuggestionNote | null, token: number): void;
  setFeedback(text: string, token: number): void;
  /** Starts a request: shows the status (or `label`, when given, as the pane's text) and returns the token its result must carry. `range` is the text the answer will replace; it is mapped through every edit made while the AI thinks and while the suggestion waits. */
  setThinking(status: SuggestionStatus, range?: SelectionRange | null, label?: string): number;
  /** False once another request started, Dismiss was pressed or the document changed since `token` was issued. */
  isCurrent(token: number): boolean;
  /** Resets the pane. Without a message (Dismiss) it empties and the pane hides; with one (an error) the pane shows it; the placeholder hides it too. */
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

/**
 * The suggestion pane's state (the AI pane in DocAside, beside the document). An answer, its feedback or its error opens the document beside
 * the place the student is in (openDocument), so the pane can be seen; a request alone does not (a cancelled or superseded one would open it
 * for nothing). The place itself never changes (Task 11, which removed the dock and its dockShow).
 */
export function SuggestionProvider({ children }: { children: React.ReactNode }) {
  const t = useT();
  const { openDocument } = useProject();
  const [sug, setSug] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [note, setNote] = useState<SuggestionNote | null>(null);
  const [status, setStatus] = useState<SuggestionStatus>("idle");
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [selectionAtRequest, setSelectionAtRequest] = useState(false);
  const [editor, setEditorState] = useState<Editor | null>(null);
  // Mirrors for the editor's key handler and the buttons, which can fire before a render has caught up.
  const live = useRef({ sug: null as string | null, range: null as SelectionRange | null, editor: null as Editor | null, token: 0 });

  const isCurrent = useCallback((token: number) => token === live.current.token, []);
  const set = useCallback<SuggestionValue["set"]>((s, n, token) => {
    if (token !== live.current.token) return;
    // The range was stored when the request started and has been mapped through every edit since.
    live.current.sug = s;
    setSug(s); setText(s); setNote(n); setStatus("idle"); setStatusLabel(null); setSelectionAtRequest(live.current.range !== null);
    openDocument();
  }, [openDocument]);
  const setFeedback = useCallback((s: string, token: number) => {
    if (token !== live.current.token) return;
    live.current.sug = null; live.current.range = null;
    setSug(null); setText(s); setNote(null); setStatus("idle"); setStatusLabel(null); setSelectionAtRequest(false);
    openDocument();
  }, [openDocument]);
  const setThinking = useCallback((s: SuggestionStatus, range: SelectionRange | null = null, label?: string) => {
    live.current.sug = null; live.current.range = range;
    setSug(null); setText(null); setNote(null); setStatus(s); setStatusLabel(label ?? null); setSelectionAtRequest(range !== null);
    return ++live.current.token;
  }, []);
  const clear = useCallback((msg?: string) => {
    live.current.sug = null; live.current.range = null;
    live.current.token++; // an answer still on its way is no longer wanted
    setSug(null); setText(msg ?? null); setNote(null); setStatus("idle"); setStatusLabel(null); setSelectionAtRequest(false);
    // An error is shown in the pane (v1 showAIError); Dismiss and the placeholder after Accept leave the document where it is.
    if (msg !== undefined && msg !== t("ai_pane_placeholder")) openDocument();
  }, [openDocument, t]);

  const setEditor = useCallback((e: Editor | null) => {
    // A request and its suggestion belong to the document they were made for: another document's editor must not receive them.
    if (live.current.editor !== e) {
      live.current.sug = null; live.current.range = null; live.current.token++;
      setSug(null); setText(null); setNote(null); setStatus("idle"); setStatusLabel(null); setSelectionAtRequest(false);
    }
    live.current.editor = e;
    setEditorState(e);
  }, []);
  // Edits made while a suggestion waits move the range it will replace (v1 kept a live Range).
  useEffect(() => {
    if (!editor) return;
    const onTr = ({ transaction }: { transaction: { docChanged: boolean; mapping: { map(pos: number, assoc?: number): number } } }) => {
      if (transaction.docChanged && live.current.range) live.current.range = mapRange(live.current.range, transaction.mapping);
    };
    editor.on("transaction", onTr);
    return () => { editor.off("transaction", onTr); };
  }, [editor]);

  const accept = useCallback(() => {
    const s = live.current.sug, ed = live.current.editor;
    if (!s || !ed || ed.isDestroyed) { toast("No suggestion to accept yet"); return; }
    insertAiText(ed, s, live.current.range !== null, live.current.range);
    clear(t("ai_pane_placeholder"));
    toast("Inserted ✓ — Ctrl+Z to undo");
  }, [clear, t]);
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
    () => ({ sug, text, note, status, statusLabel, selectionAtRequest, set, setFeedback, setThinking, isCurrent, clear, editor, setEditor, accept, copy, tab }),
    [sug, text, note, status, statusLabel, selectionAtRequest, set, setFeedback, setThinking, isCurrent, clear, editor, setEditor, accept, copy, tab]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSuggestion(): SuggestionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSuggestion must be used inside <SuggestionProvider>");
  return v;
}
