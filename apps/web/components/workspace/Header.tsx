"use client";
import { useLang, useT } from "@/lib/i18n";
import { APP_VERSION } from "@/lib/version";
import { useSession } from "@/lib/session";
import { useWorkspace } from "./WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { keyStore } from "@/lib/ai/keys";
import { PdHost } from "@/lib/ai/pdDialog";
import { useSettings } from "@/lib/settings";
import { toast } from "@/components/ui/toast";
import { PassphraseHost } from "./dialogs/Passphrase";
import { ProviderKey } from "./dialogs/ProviderKey";
import { RateLimit } from "./dialogs/RateLimit";

const HDR_BTN = "hbtn border-white/35 bg-transparent text-white hover:border-white/35 hover:bg-white/10";

export function Header() {
  const t = useT();
  const { lang, setLang } = useLang();
  const { openHelp, openSettings } = useWorkspace();
  return (
    <>
      <header className="hdr">
        <div className="brand">
          <svg className="mark" viewBox="0 0 34 34" aria-hidden="true">
            <circle cx="17" cy="17" r="17" fill="#fff" />
            <path d="M17 7c-5 0-8 4-8 9 0 3 1.5 5.5 3.5 7h9c2-1.5 3.5-4 3.5-7 0-5-3-9-8-9z" fill="#4c1d95" />
            <rect x="12.5" y="24" width="9" height="2.5" rx="1" fill="#c9932e" />
            <rect x="13.5" y="27.5" width="7" height="2" rx="1" fill="#c9932e" />
          </svg>
          <div className="txt">
            <h1>Appu<em>scholar</em></h1>
            <Badge className="ver" data-testid="app-version">Version {APP_VERSION}</Badge>
          </div>
        </div>
        <Button variant="ghost" className={`${HDR_BTN} lang px-0`} aria-label="Switch interface language" title="हिन्दी / English" data-testid="lang-toggle" onClick={() => setLang(lang === "en" ? "hi" : "en")}>
          {lang === "en" ? "हि" : "EN"}
        </Button>
        <Button variant="ghost" className={HDR_BTN} data-testid="help-btn" onClick={openHelp}>{t("help_btn")}</Button>
        <Button variant="gold" data-testid="provider-key-btn" onClick={() => openSettings()}>{t("settings_btn")}</Button>
      </header>
    </>
  );
}

/** The Help dialog is a placeholder until Task 17. State lives in the workspace context; the passphrase, personal-data and rate-limit dialogs open from callAI and the key dialog. */
export function ChromeDialogs() {
  const t = useT();
  const { dialog, closeDialog } = useWorkspace();
  const { update } = useSettings();
  const { email, signOutAction } = useSession();
  return (
    <>
      <Dialog open={dialog === "help"} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("help_btn")}</DialogTitle>
            <DialogDescription>Help arrives in the next update.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
            <span data-testid="signed-in-as">Signed in as {email}</span>
            <Button variant="ghost" size="sm" data-testid="sign-out" onClick={() => { keyStore.clearSession(); void signOutAction(); }}>Sign out</Button>
          </div>
        </DialogContent>
      </Dialog>
      <ProviderKey />
      <PassphraseHost />
      <PdHost />
      <RateLimit onSwitchToGroq={() => { void update({ provider: "groq" }); toast("Now using Groq ✓ Your next AI request goes to Groq."); }} />
    </>
  );
}
