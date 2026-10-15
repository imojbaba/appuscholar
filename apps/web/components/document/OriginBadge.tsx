"use client";
import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { originShare } from "@appuscholar/core";
import { useT } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/components/workspace/WorkspaceContext";

/** Shown from 20 characters of text on (v1 computeOriginality). */
const MIN_CHARS = 20;
const DEBOUNCE_MS = 400;
const TITLE = "Estimated share of the current document typed by you, versus inserted from an AI suggestion or chat reply. Editing inside an AI-inserted passage still counts toward the AI side.";

/** "NN% yours": green from 80, amber from 50, red below; a source paper shows "📄 source paper" instead. Opens the My writing dialog. */
export function OriginBadge({ editor }: { editor: Editor }) {
  const t = useT();
  const { currentDoc, openMyWriting } = useWorkspace();
  const [share, setShare] = useState(() => originShare(editor.getHTML()));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onUpdate = () => { clearTimeout(timer); timer = setTimeout(() => setShare(originShare(editor.getHTML())), DEBOUNCE_MS); };
    editor.on("update", onUpdate);
    return () => { clearTimeout(timer); editor.off("update", onUpdate); };
  }, [editor]);

  const source = currentDoc?.kind === "source";
  if (!source && share.total < MIN_CHARS) return null;
  const variant = source ? "chip" : share.studentPct >= 80 ? "ok" : share.studentPct >= 50 ? "flag" : "danger";
  return (
    <Badge asChild variant={variant}>
      <button type="button" className="cursor-pointer" title={source ? t("org_badge_title") : TITLE} data-testid="origin-badge" onClick={openMyWriting}>
        {source ? t("org_badge_src") : `${share.studentPct}% yours`}
      </button>
    </Badge>
  );
}
