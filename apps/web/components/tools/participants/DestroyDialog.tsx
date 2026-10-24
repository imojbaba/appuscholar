"use client";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/*
 * Destroy the list (spec 2026-10-24-participants-design.md §5, call C7): asks twice, in a dialog in the page and never in `confirm()`. The first press (`pp-destroy-1`) only moves to the
 * second step, which says it cannot be undone; the second (`pp-destroy-2`) destroys. The two buttons swap places in the second step, so a double click that lands twice on the same
 * spot finds Cancel the second time, and the safe choice has the focus there. The step lives in the dialog's content, which is gone when the dialog closes, so opening it again always
 * starts at the first step. `error` is a line from the tab when the list could not be changed.
 */

function Steps({ onCancel, onConfirm, error }: { onCancel(): void; onConfirm(): void; error: string }) {
  const t = useT();
  const [step, setStep] = useState<1 | 2>(1);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (step === 2) cancel.current?.focus(); }, [step]);

  const cancelButton = (
    <Button key="cancel" ref={cancel} type="button" variant="ghost" size="sm" data-testid="pp-destroy-cancel" onClick={onCancel}>{t("pp_destroy_cancel")}</Button>
  );
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("pp_destroy_title")}</DialogTitle>
        <DialogDescription>{t(step === 1 ? "pp_destroy_desc1" : "pp_destroy_desc2")}</DialogDescription>
      </DialogHeader>
      {error && <p className="m-0 text-[13px] text-danger-ink" role="alert" data-testid="pp-destroy-error">{error}</p>}
      <DialogFooter>
        {step === 1 ? (
          <>
            {cancelButton}
            <Button key="one" type="button" variant="destructive" size="sm" data-testid="pp-destroy-1" onClick={() => setStep(2)}>{t("pp_destroy_1")}</Button>
          </>
        ) : (
          <>
            <Button key="two" type="button" variant="destructive" size="sm" data-testid="pp-destroy-2" onClick={onConfirm}>{t("pp_destroy_2")}</Button>
            {cancelButton}
          </>
        )}
      </DialogFooter>
    </>
  );
}

export function DestroyDialog({ open, onOpenChange, onConfirm, error }: {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** The second press: the tab destroys the list, and closes this when it did. */
  onConfirm(): void;
  error: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="pp-destroy-dialog">
        <Steps onCancel={() => onOpenChange(false)} onConfirm={onConfirm} error={error} />
      </DialogContent>
    </Dialog>
  );
}
