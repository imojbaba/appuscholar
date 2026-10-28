"use client";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { TERMS_DATE, TERMS_SINCE, TERMS_VERSION, needsTerms } from "@/lib/terms";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useProject } from "@/components/frame/ProjectContext";

/**
 * First-use terms with the 18+ gate (v1 `termsOpen`/`termsAccept`/`termsUnder`), and the same text read-only from the AI Provider / Key dialog.
 * While the gate applies the dialog cannot be dismissed: Escape, a click outside and a focus change are refused, and Escape shows the need line.
 * Accepting records it on the server (POST /me/terms); the under-18 path records nothing.
 */
export function Terms() {
  const { me } = useSettings();
  const { dialog, closeDialog } = useProject();
  const gate = needsTerms(me, TERMS_SINCE);
  const open = gate || dialog === "terms";
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !gate) closeDialog(); }}>
      {open && <TermsContent gate={gate} />}
    </Dialog>
  );
}

// Mounted only while the dialog is open, so every opening starts clean (v1 termsOpen).
function TermsContent({ gate }: { gate: boolean }) {
  const t = useT();
  const { reload } = useSettings();
  const { closeDialog } = useProject();
  const [age, setAge] = useState(false);
  const [agree, setAgree] = useState(false);
  const [need, setNeed] = useState(false);
  const [under, setUnder] = useState(false);
  const [saving, setSaving] = useState(false);

  const accept = async () => {
    if (!(age && agree)) { setNeed(true); return; }
    setSaving(true);
    try {
      await apiFetch<void>("/me/terms", { method: "POST" });
      // /me now carries the acceptance, so the gate lifts; the workspace then opens the welcome tour.
      await reload();
    } catch {
      toast("Could not save your answer. Try again.");
    } finally { setSaving(false); }
  };

  const list = (keys: string[]) => (
    <ul className="my-1 ml-[18px] list-disc">{keys.map((k) => <li key={k}>{t(k)}</li>)}</ul>
  );
  const alert = "m-0 text-[13.5px] font-semibold text-destructive";

  return (
      <DialogContent
        className="max-w-xl"
        showCloseButton={false}
        aria-describedby={undefined}
        data-testid="terms-dialog"
        onEscapeKeyDown={(e) => { if (gate) { e.preventDefault(); setNeed(true); } }}
        onPointerDownOutside={(e) => { if (gate) e.preventDefault(); }}
        onInteractOutside={(e) => { if (gate) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-purple-800">{t("terms_h")}</DialogTitle>
        </DialogHeader>
        {/* The keyboard reaches the terms too: the box takes focus, so the arrow keys and Page Down scroll it (Q6). */}
        <div className="max-h-[56vh] overflow-auto rounded-[var(--r-ctl)] pr-1.5 text-[13.5px] leading-relaxed focus-visible:outline-2 focus-visible:outline-purple-800"
          tabIndex={0} role="region" aria-label={t("terms_h")} data-testid="terms-body">
          <h3 className="mb-1 mt-1.5 text-sm font-semibold">{t("terms_data_h")}</h3>
          {list(["terms_d1", "terms_d2", "terms_d3", "terms_d4"])}
          <h3 className="mb-1 mt-2.5 text-sm font-semibold">{t("terms_use_h")}</h3>
          {list(["terms_u1", "terms_u2", "terms_u3", "terms_u4"])}
          <p className="text-xs text-muted-foreground" data-testid="terms-version">{t("terms_ver", { version: TERMS_VERSION, date: TERMS_DATE })}</p>
        </div>
        {!gate ? (
          <div className="flex"><Button variant="ghost" className="flex-1" data-testid="terms-close" onClick={closeDialog}>{t("close_btn")}</Button></div>
        ) : under ? (
          <div className="grid gap-2">
            <p className={alert} data-testid="terms-under-msg">{t("terms_under_msg")}</p>
            <div><Button variant="ghost" data-testid="terms-back" onClick={() => setUnder(false)}>{t("terms_back")}</Button></div>
          </div>
        ) : (
          <>
            <div className="grid gap-1.5">
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[13.5px]">
                <input type="checkbox" checked={age} data-testid="terms-age" onChange={(e) => { setAge(e.target.checked); if (e.target.checked && agree) setNeed(false); }} />
                <span>{t("terms_age")}</span>
              </label>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[13.5px]">
                <input type="checkbox" checked={agree} data-testid="terms-agree" onChange={(e) => { setAgree(e.target.checked); if (e.target.checked && age) setNeed(false); }} />
                <span>{t("terms_agree")}</span>
              </label>
            </div>
            {need && !(age && agree) ? <p role="alert" className={alert} data-testid="terms-need">{t("terms_need")}</p> : null}
            <p className="m-0 text-[12.5px] text-muted-foreground">{t("terms_leave")}</p>
            <div className="flex gap-2">
              <Button variant="primary" className="flex-1" disabled={saving} data-testid="terms-continue" onClick={() => { void accept(); }}>{t("terms_cont")}</Button>
              <Button variant="ghost" disabled={saving} data-testid="terms-under" onClick={() => { setUnder(true); setNeed(false); }}>{t("terms_under")}</Button>
            </div>
          </>
        )}
      </DialogContent>
  );
}
