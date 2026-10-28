"use client";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ack, hasAcked } from "@/lib/editor/dictPrefs";
import { useT } from "@/lib/i18n";

/**
 * v1's first-use notice for dictation (index.html 4293-4296, a confirm() there): the audio goes to the browser's own speech service, so say
 * so before the first start. Continue goes on, Cancel (or Escape, or the close button) starts nothing.
 */
export function DictationNotice({ open, onContinue, onCancel }: { open: boolean; onContinue(): void; onCancel(): void }) {
  const t = useT();
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogContent className="max-w-md" data-testid="dict-notice" aria-describedby="dict-notice-body">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-purple-800">{t("dict_notice_title")}</DialogTitle>
        </DialogHeader>
        <div id="dict-notice-body" className="grid gap-3 text-sm">
          <p>{t("dict_notice_1")}</p>
          <p>{t("dict_notice_2")}</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel} data-testid="dict-notice-cancel">{t("sap_cancel_btn")}</Button>
          <Button type="button" variant="primary" onClick={onContinue} data-testid="dict-notice-continue">{t("terms_cont")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The notice in front of a start. `request(start)` runs `start` at once when this account has acknowledged the notice on this device; otherwise it
 * opens the notice and runs `start` only after Continue (which stores the acknowledgement). Cancel drops it and stores nothing. Render `notice`
 * once in the toolbar. Check dictationSupported() first, as v1 does: an unsupported browser gets its message, not the notice.
 */
export function useDictationGate(userId: string | null | undefined): { request(start: () => void): void; notice: ReactNode } {
  const [open, setOpen] = useState(false);
  const pending = useRef<(() => void) | null>(null);
  const request = useCallback((start: () => void) => {
    if (hasAcked(userId)) { start(); return; }
    pending.current = start;
    setOpen(true);
  }, [userId]);
  const onContinue = () => {
    const start = pending.current;
    pending.current = null;
    ack(userId);
    setOpen(false);
    start?.();
  };
  const onCancel = () => { pending.current = null; setOpen(false); };
  return { request, notice: <DictationNotice open={open} onContinue={onContinue} onCancel={onCancel} /> };
}
