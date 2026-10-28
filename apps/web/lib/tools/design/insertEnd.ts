"use client";
import { useCallback, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { useDocAccess } from "@/lib/editor/docAccess";
import { toast } from "@/components/ui/toast";

/** v1's escHTML (2606): the five characters, `'` as `&#39;`. */
const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/**
 * What v1's insertIntoEditor(text, false) puts in the editor (4195-4225): the text escaped, each newline a line break. The text stays literal (a
 * protocol's "# " and "## " are not turned into headings), as in v1.
 */
export function plainToHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESC[c]!).replace(/\n/g, "<br>");
}

/**
 * Inserts a tool's text at the end of the open document (v1 insertIntoEditor(text, false): protoGenerate 5973, ecStatement 6043, ecGenerateConsent 6066)
 * through useDocAccess().insertBlock with its default position, and says "Inserted" (toast) when the document took it. A click inserts once: a second
 * call while the first is still waiting for the document does nothing. Resolves false when nothing went in (the document could not take it, or a call was
 * already running); the page says so inline.
 */
export function useInsertAtEnd(): { insert(text: string): Promise<boolean>; busy: boolean } {
  const t = useT();
  const doc = useDocAccess();
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const insert = useCallback(async (text: string): Promise<boolean> => {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    try {
      const ok = await doc.insertBlock(plainToHtml(text));
      if (ok) toast(t("design_inserted"));
      return ok;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, [doc, t]);
  return { insert, busy };
}
