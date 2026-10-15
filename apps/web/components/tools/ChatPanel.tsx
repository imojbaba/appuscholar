"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { plain, useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { askAppuscholar } from "@/lib/ai/chat";
import { useSuggestion } from "@/lib/ai/suggestion";
import { useCallAI } from "@/lib/ai/useCallAI";
import { insertAiText } from "@/lib/editor/insert";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

export const THINKING = "💜 thinking…";
export const INSERTED_TOAST = "Inserted into your document ✓ — Ctrl+Z to undo";

export type ChatMsg = { id: number; role: "user" | "ai"; text: string; state: "pending" | "done" | "error" };

/** The chat's bubbles. Held by the dock, so they outlast a switch to another tool but not a reload (v1 kept them in the page only). */
export function useChatLog() {
  const [log, setLog] = useState<ChatMsg[]>([]);
  const next = useRef(1);
  const ask = useCallback((q: string, run: (q: string) => Promise<{ text: string; error: boolean }>) => {
    const userId = next.current, aiId = next.current + 1;
    next.current += 2;
    setLog((l) => [...l, { id: userId, role: "user", text: q, state: "done" }, { id: aiId, role: "ai", text: THINKING, state: "pending" }]);
    void run(q).then((r) => setLog((l) => l.map((m) => (m.id === aiId ? { ...m, text: r.text, state: r.error ? "error" : "done" } : m))));
  }, []);
  return { log, ask };
}

/** Ask Appuscholar (v1 askAI): the writing coach answers, and a reply can be inserted at the end of the document as AI text. */
export function ChatPanel({ chat }: { chat: ReturnType<typeof useChatLog> }) {
  const t = useT();
  const { settings } = useSettings();
  const { editor } = useSuggestion();
  const callAI = useCallAI();
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const busy = chat.log.some((m) => m.state === "pending");

  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [chat.log]);

  const send = () => {
    const q = draft.trim();
    if (!q || busy) return;
    setDraft("");
    chat.ask(q, (question) => askAppuscholar(question, { callAI, field: settings.field ?? "psychology" }));
  };
  const insert = (text: string) => {
    if (!editor || editor.isDestroyed) return;
    insertAiText(editor, text, false);
    toast(INSERTED_TOAST);
  };

  return (
    <div className="panel chat" data-testid="chat-panel">
      <h3>{plain(t("tab_chat"))}</h3>
      <p className="desc">{plain(t("chat_panel_desc"))}</p>
      <div className="chat-log" ref={logRef} role="log" aria-live="polite" aria-label="Conversation" data-testid="chat-log">
        {chat.log.map((m) => (
          <div key={m.id} className={"bub " + m.role + (m.state === "error" ? " err" : "")} data-testid={m.role === "user" ? "chat-user" : "chat-ai"}>
            <span className="bub-text">{m.text}</span>
            {m.role === "ai" && m.state === "done" && (
              <button type="button" className="bub-insert" disabled={!editor} data-testid="chat-insert" onClick={() => insert(m.text)}>+ Insert into document</button>
            )}
          </div>
        ))}
      </div>
      <div className="chat-form">
        <textarea
          className="input chat-input" rows={2} value={draft} placeholder={t("chat_input_placeholder")} aria-label={t("chat_input_placeholder")} data-testid="chat-input"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
        />
        <Button type="button" variant="primary" size="sm" disabled={busy || !draft.trim()} data-testid="chat-send" onClick={send}>{t("chat_send_btn")}</Button>
      </div>
    </div>
  );
}
