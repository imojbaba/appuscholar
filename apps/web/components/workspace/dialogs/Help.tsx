"use client";
import { useState } from "react";
import { tHtml, useT } from "@/lib/i18n";
import { keyStore } from "@/lib/ai/keys";
import { resetPdMemo } from "@/lib/ai/callAI";
import { useSettings } from "@/lib/settings";
import { useSession } from "@/lib/session";
import { useVault } from "@/lib/vault/useVault";
import { hasRemembered } from "@/lib/vault/remember";
import { APP_VERSION } from "@/lib/version";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useWorkspace } from "../WorkspaceContext";

const FAQ = ["lost", "hindi", "key"];
// The app never sends mail (rule 12): the button opens the student's own mail app.
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

export function Help() {
  const t = useT();
  const { dialog, closeDialog, openWelcome, openTerms, openImportV1 } = useWorkspace();
  const { email, signOutAction } = useSession();
  const { me } = useSettings();
  const vault = useVault();
  /** What is remembered on this computer, when the sign-out asks whether to forget it: AI keys, the vault, or both. */
  const [askForget, setAskForget] = useState<{ keys: boolean; vault: boolean } | null>(null);
  // Forget the tab's keys, the vault key and the unlocked-text memo, then end the session (and, if chosen, the keys and the vault remembered on this computer).
  const signOut = async (forget: boolean) => {
    if (forget && me?.id) keyStore.forgetPlainKeys(me.id);
    keyStore.clearSession();
    vault.lock();
    // Wait for IndexedDB before the sign-out navigates away; a blocked store must not keep the student signed in.
    if (forget) await vault.forgetThisComputer().catch(() => {});
    resetPdMemo();
    void signOutAction();
  };
  // Asks whether to forget what this computer remembers (AI keys, the vault, or both); with nothing remembered it signs out at once.
  const startSignOut = async () => {
    const keys = keyStore.hasPlain();
    const vaultKept = me?.id ? await hasRemembered(me.id).catch(() => false) : false;
    if (keys || vaultKept) setAskForget({ keys, vault: vaultKept }); else void signOut(false);
  };
  return (
    <>
    <Dialog open={dialog === "help"} onOpenChange={(o) => { if (!o) closeDialog(); }}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto" data-testid="help-dialog">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-purple-800">{t("help_h2")}</DialogTitle>
          <DialogDescription>{t("help_intro")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2" data-testid="help-faq">
          {FAQ.map((k) => (
            <details key={k} className="rounded-lg border border-line px-3 py-2 text-sm" data-testid={"faq-" + k}>
              <summary className="cursor-pointer font-medium">{t("faq_q_" + k)}</summary>
              <p className="mb-0 mt-2 text-[13.5px] leading-relaxed">{tHtml(t("faq_a_" + k))}</p>
            </details>
          ))}
        </div>
        <div className="grid gap-2 text-sm">
          <p className="m-0">{t("help_contact_intro")}</p>
          {SUPPORT_EMAIL ? (
            <div><Button asChild variant="ghost"><a href={`mailto:${SUPPORT_EMAIL}`} data-testid="help-contact">{t("help_contact_btn")}</a></Button></div>
          ) : (
            <p className="m-0 text-muted-foreground" data-testid="help-contact-unset">{t("help_contact_unset")}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" data-testid="help-tour" onClick={openWelcome}>{t("help_tour_btn")}</Button>
          <Button variant="ghost" data-testid="help-terms" onClick={openTerms}>{t("terms_reopen_btn")}</Button>
          <Button variant="ghost" data-testid="help-import-v1" onClick={openImportV1}>Import a v1 backup</Button>
        </div>
        <p className="m-0 text-xs text-muted-foreground" data-testid="help-version">Appuscholar v2 ({APP_VERSION})</p>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
          <span data-testid="signed-in-as">Signed in as {email}</span>
          <Button variant="ghost" size="sm" data-testid="sign-out" onClick={() => { void startSignOut(); }}>Sign out</Button>
        </div>
      </DialogContent>
    </Dialog>
      <AlertDialog open={!!askForget} onOpenChange={(o) => { if (!o) setAskForget(null); }}>
        {/* With only the vault remembered, the AI-keys sentence does not apply: no description then. */}
        <AlertDialogContent data-testid="forget-keys-confirm" {...(askForget && !askForget.keys ? { "aria-describedby": undefined } : {})}>
          <AlertDialogHeader>
            <AlertDialogTitle>{askForget?.keys !== false ? "Forget the AI keys remembered on this computer?" : t("vault_forget_q")}</AlertDialogTitle>
            {askForget?.keys && askForget.vault && <p className="m-0 text-sm font-semibold" data-testid="forget-vault-q">{t("vault_forget_q")}</p>}
            {askForget?.keys !== false && <AlertDialogDescription>If this is a shared computer, forget them. Otherwise keep them and you will not need to paste them again next time.</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="keep-keys-signout" onClick={() => void signOut(false)}>Keep and sign out</AlertDialogCancel>
            <Button variant="destructive" data-testid="forget-keys-signout" onClick={() => void signOut(true)}>Forget and sign out</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
