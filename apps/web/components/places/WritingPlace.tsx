"use client";
import { useState } from "react";
import { plainText, useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { ChatPanel, useChatLog } from "@/components/tools/ChatPanel";
import { HelpersPanel } from "@/components/tools/HelpersPanel";

/**
 * The Writing place's document tab (its first; My style and Words are the tool registry's, Task G2): the document at full width (the project
 * shell keeps it mounted and shows it here) with an aside of Chat and Research helpers, the two tools that lost their way in when Task 6 removed
 * the dock. Each opens on demand, so the document stays near the top; the chat's bubbles last while the student stays in Writing. Task 32
 * replaces the aside with the helpers on the student's own text. The Research helpers are the psychology pack (v1 applyPack 2661): a student who chose
 * General research in Settings (`pack: "general"`) does not see the fold; a pack not chosen yet is psychology (ruling P3).
 */
export function WritingPlace() {
  const t = useT();
  const chat = useChatLog();
  const { settings } = useSettings();
  return (
    <aside className="place-body writing-aside" aria-label={plainText(t("writing_aside"))} data-testid="writing-aside">
      <Fold label={t("writing_chat")}><ChatPanel chat={chat} /></Fold>
      {settings.pack !== "general" && <Fold label={t("writing_helpers")}><HelpersPanel /></Fold>}
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
