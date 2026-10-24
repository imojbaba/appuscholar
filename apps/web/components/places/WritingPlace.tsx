"use client";
import { useState } from "react";
import { plainText, useT } from "@/lib/i18n";
import { ChatPanel, useChatLog } from "@/components/tools/ChatPanel";

/**
 * The Writing place's document tab (its first; My style and Words are the tool registry's, Task G2): the document at full width (the project
 * shell keeps it mounted and shows it here) with an aside holding Chat, the tool that lost its way in when Task 6 removed the dock. It opens on
 * demand, so the document stays near the top; the chat's bubbles last while the student stays in Writing. The Research helpers are not here any
 * more: Task 32 moved them into the document, acting on the student's own text ("Help with this text").
 */
export function WritingPlace() {
  const t = useT();
  const chat = useChatLog();
  return (
    <aside className="place-body writing-aside" aria-label={plainText(t("writing_aside"))} data-testid="writing-aside">
      <Fold label={t("writing_chat")}><ChatPanel chat={chat} /></Fold>
    </aside>
  );
}

/** A closed disclosure that mounts its tool only once opened. */
function Fold({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="writing-fold" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{label}</summary>
      {open && children}
    </details>
  );
}
