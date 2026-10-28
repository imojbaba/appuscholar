"use client";
import { useState } from "react";
import { Wrench } from "@phosphor-icons/react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { ReportDialog } from "@/components/help/report/ReportDialog";

/** Wave C slot (plan 2026-10-24), Task C4: the "Report a problem" button in Help, and the dialog it opens. */
export function ReportSlot() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" data-testid="help-report" onClick={() => setOpen(true)}><Wrench aria-hidden="true" />{t("wc_rep_btn")}</Button>
      <ReportDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
