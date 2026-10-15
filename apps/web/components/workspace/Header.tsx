"use client";
import { useState } from "react";
import { useLang, useT } from "@/lib/i18n";
import { APP_VERSION } from "@/lib/version";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const HDR_BTN = "hbtn border-white/35 bg-transparent text-white hover:border-white/35 hover:bg-white/10";

export function Header() {
  const t = useT();
  const { lang, setLang } = useLang();
  const [dialog, setDialog] = useState<"help" | "provider" | null>(null);
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
        <Button variant="ghost" className={HDR_BTN} data-testid="help-btn" onClick={() => setDialog("help")}>{t("help_btn")}</Button>
        <Button variant="gold" data-testid="provider-key-btn" onClick={() => setDialog("provider")}>{t("settings_btn")}</Button>
      </header>
      {/* Placeholders: Task 17 replaces the Help dialog and Task 13 the provider dialog. */}
      <Dialog open={dialog === "help"} onOpenChange={(o) => { if (!o) setDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("help_btn")}</DialogTitle>
            <DialogDescription>The help dialog arrives in Task 17.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === "provider"} onOpenChange={(o) => { if (!o) setDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings_h2")}</DialogTitle>
            <DialogDescription>The provider dialog arrives in Task 13.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
}
