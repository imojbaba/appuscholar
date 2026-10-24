"use client";
import { useState } from "react";
import { BookOpen } from "@phosphor-icons/react";
import { AskAppu } from "@/components/help/guide/AskAppu";
import { GuideDialog } from "@/components/help/guide/GuideDialog";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

/** Wave C slot (plan 2026-10-24), filled by Task C2: the Guide button in Help and its dialog, with Ask Appu (Task C3) in the dialog's `extra`. */
export function GuideSlot() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" data-testid="help-guide" onClick={() => setOpen(true)}><BookOpen weight="regular" aria-hidden="true" />{t("wc_guide_btn")}</Button>
      <GuideDialog open={open} onClose={() => setOpen(false)} extra={<AskAppu />} />
    </>
  );
}
