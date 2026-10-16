"use client";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/**
 * Deletes the account and everything under it (DELETE /me). The button stays disabled until the student has typed the confirm word
 * exactly (t("erase_confirm_word"), "DELETE" in both languages). After the server has erased it, `onErased` forgets this computer's
 * keys and vault and signs out; a failure changes nothing and keeps the dialog open.
 */
export function EraseAccount({ open, onClose, onErased }: { open: boolean; onClose: () => void; onErased: () => Promise<void> }) {
  const t = useT();
  const word = t("erase_confirm_word");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = typed === word && !busy;
  function close() { if (busy) return; setTyped(""); onClose(); }

  async function erase() {
    if (!ready) return;
    setBusy(true);
    try {
      await apiFetch<void>("/me", { method: "DELETE" });
    } catch {
      setBusy(false);
      toast(t("erase_fail"));
      return;
    }
    toast(t("erased"));
    // The account is gone. Should the sign-out itself fail, the dialog must not stay stuck busy: it can be closed and Sign out tried again.
    try { await onErased(); } catch { /* the session ends on its own: every api call now answers 401 */ }
    // Cleared, so the button cannot erase twice; Cancel is free again.
    setTyped("");
    setBusy(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <AlertDialogContent data-testid="erase-dialog">
        <form onSubmit={(e) => { e.preventDefault(); void erase(); }} className="grid gap-4">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("erase_h2")}</AlertDialogTitle>
            <AlertDialogDescription>{t("erase_intro")}</AlertDialogDescription>
          </AlertDialogHeader>
          <label className="grid gap-1 text-sm font-medium">
            {t("erase_type", { word })}
            <input className="input" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={typed} onChange={(e) => setTyped(e.target.value)} data-testid="erase-word" />
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={busy} data-testid="erase-cancel">{t("bk_cancel")}</AlertDialogCancel>
            <Button type="submit" variant="destructive" disabled={!ready} data-testid="erase-confirm">{t("erase_btn")}</Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
