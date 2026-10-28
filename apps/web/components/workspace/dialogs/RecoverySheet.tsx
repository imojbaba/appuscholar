"use client";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { downloadBlob } from "@/lib/export/download";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const RECOVERY_FILE = "appuscholar-recovery.txt";

/** Local calendar day, YYYY-MM-DD: the date printed on the sheet. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * The recovery code, shown once: right after the vault is set up (or recovered). It lives only in the caller's state and in
 * the file the student downloads; nothing here sends it anywhere. The sheet cannot be dismissed until "I have saved it" is
 * ticked and Done pressed (a line beside Done says so while it is unticked), after which the caller forgets the code.
 */
export function RecoverySheet({ code, onDone }: { code: string | null; onDone: () => void }) {
  const t = useT();
  const { email } = useSession();
  const [saved, setSaved] = useState(false);
  const keep = (e: Event) => e.preventDefault();

  function download() {
    if (!code) return;
    const text = [t("vault_sheet_h2"), "", `${t("vault_recover_code")}: ${code}`, email, today(), "", t("vault_sheet_intro"), ""].join("\n");
    downloadBlob(RECOVERY_FILE, new Blob([text], { type: "text/plain;charset=utf-8" }));
  }
  function done() {
    if (!saved) return;
    setSaved(false);
    onDone();
  }

  return (
    <Dialog open={!!code} onOpenChange={() => { /* closes only through Done */ }}>
      <DialogContent className="max-w-md" showCloseButton={false} onEscapeKeyDown={keep} onPointerDownOutside={keep} onInteractOutside={keep} data-testid="vault-sheet-dialog">
        {code && (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold text-purple-800">{t("vault_sheet_h2")}</DialogTitle>
              <DialogDescription>{t("vault_sheet_intro")}</DialogDescription>
            </DialogHeader>
            <code className="block select-all rounded-lg border border-line bg-soft px-3 py-3 text-center text-lg font-semibold tracking-wide break-all text-ink" data-testid="vault-code">{code}</code>
            <div>
              <Button variant="ghost" data-testid="vault-sheet-download" onClick={download}>{t("vault_sheet_download")}</Button>
            </div>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} data-testid="vault-sheet-saved" />
              <span>{t("vault_sheet_saved")}</span>
            </label>
            {/* The sheet has no close button and ignores Escape: what Done waits for is said beside it, so a student is never left at a button that does nothing. */}
            <DialogFooter className="items-center gap-2">
              {!saved && <p id="vault-sheet-hint" className="m-0 text-sm text-muted-foreground sm:mr-auto" data-testid="vault-sheet-hint">{t("vault_sheet_hint")}</p>}
              <Button variant="primary" disabled={!saved} aria-describedby={saved ? undefined : "vault-sheet-hint"} data-testid="vault-sheet-done" onClick={done}>{t("vault_sheet_done")}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
