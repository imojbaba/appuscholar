"use client";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/*
 * Destroy the list (spec 2026-10-24-participants-design.md §5, call C7): asks twice, in a dialog in the page and never in `confirm()`. The first press (`pp-destroy-1`) only moves to the
 * second step, which says it cannot be undone; the second (`pp-destroy-2`) destroys. What is meant to keep a double click on step 1's button from destroying: the buttons of both steps
 * have the same width (`w-full` on a phone, one fixed width from `sm`) and the same height, step 2 puts Cancel where step 1 had Destroy (on a phone, where the footer stacks, too), and
 * the text above them takes the room of the longer of the two texts in both steps (the other one is there, hidden, to hold the room), so the dialog keeps its size and its buttons stay
 * put between the steps. So the second click of a double click lands on Cancel. This is by these classes and this order; it has not been measured in a browser, and a slow double click
 * after the dialog was moved or resized could land anywhere. The safe choice also has the focus in step 2. The step lives in the dialog's content, which is gone when the dialog
 * closes, so opening it again always starts at the first step. `error` is a line from the tab when the list could not be changed.
 */

/** One width for all three buttons, so that step 2's Cancel covers exactly what step 1's Destroy covered. Wide enough for "Yes, destroy it for good" on one line. */
const BUTTON = "w-full sm:w-52";

function Steps({ onCancel, onConfirm, error }: { onCancel(): void; onConfirm(): void; error: string }) {
  const t = useT();
  const [step, setStep] = useState<1 | 2>(1);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (step === 2) cancel.current?.focus(); }, [step]);

  const cancelButton = (
    <Button key="cancel" ref={cancel} type="button" variant="ghost" size="sm" className={BUTTON} data-testid="pp-destroy-cancel" onClick={onCancel}>{t("pp_destroy_cancel")}</Button>
  );
  const text = (n: 1 | 2) => t("pp_destroy_desc" + n);
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("pp_destroy_title")}</DialogTitle>
        <div className="grid">
          <DialogDescription key={step} className="col-start-1 row-start-1">{text(step)}</DialogDescription>
          <p aria-hidden="true" className="invisible col-start-1 row-start-1 m-0 text-sm" data-testid="pp-destroy-room">{text(step === 1 ? 2 : 1)}</p>
        </div>
      </DialogHeader>
      {error && <p className="m-0 text-[13px] text-danger-ink" role="alert" data-testid="pp-destroy-error">{error}</p>}
      <DialogFooter>
        {step === 1 ? (
          <>
            {cancelButton}
            <Button key="one" type="button" variant="destructive" size="sm" className={BUTTON} data-testid="pp-destroy-1" onClick={() => setStep(2)}>{t("pp_destroy_1")}</Button>
          </>
        ) : (
          <>
            <Button key="two" type="button" variant="destructive" size="sm" className={BUTTON} data-testid="pp-destroy-2" onClick={onConfirm}>{t("pp_destroy_2")}</Button>
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
