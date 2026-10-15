"use client";
import { tHtml, useT } from "@/lib/i18n";
import { keyStore } from "@/lib/ai/keys";
import { useSession } from "@/lib/session";
import { APP_VERSION } from "@/lib/version";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useWorkspace } from "../WorkspaceContext";

// The FAQ entries that are still true in v2. faq_lost and faq_key are left out: they say everything and the key live only in this browser, "never on a server".
const FAQ = ["hindi"];
// The app never sends mail (rule 12): the button opens the student's own mail app.
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

export function Help() {
  const t = useT();
  const { dialog, closeDialog, openWelcome, openTerms } = useWorkspace();
  const { email, signOutAction } = useSession();
  return (
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
        </div>
        <p className="m-0 text-xs text-muted-foreground" data-testid="help-version">Appuscholar v2 ({APP_VERSION})</p>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
          <span data-testid="signed-in-as">Signed in as {email}</span>
          <Button variant="ghost" size="sm" data-testid="sign-out" onClick={() => { keyStore.clearSession(); void signOutAction(); }}>Sign out</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
