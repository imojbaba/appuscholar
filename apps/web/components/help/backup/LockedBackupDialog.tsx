"use client";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { useVault } from "@/lib/vault/useVault";
import { localDay } from "@/lib/vault/export";
import { downloadBlob } from "@/lib/export/download";
import { buildBackupZip, logBackupExport } from "@/lib/help/backup/buildZip";
import { LOCKED_EXT, MIN_PASSPHRASE } from "@/lib/help/backup/format";
import { canLock, lockBackup } from "@/lib/help/backup/lockedBackup";
import { stampBackup } from "@/lib/help/backup/stamp";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SecretInput } from "@/components/ui/secret-input";

/** appuscholar-backup-YYYY-MM-DD.locked, by the local day (v1 named its locked file the same way, with .json). */
export const lockedFileName = (d = new Date()) => `appuscholar-backup-${localDay(d)}${LOCKED_EXT}`;

/**
 * The locked backup: the account export's zip (the one Help's Export all my work saves), closed with a passphrase typed twice, then saved as
 * `.locked`. The passphrase lives in this component's state only until the file is made; it is never stored, logged or sent.
 * Every answer shows inside the window (a toast behind a modal goes unseen).
 */
export function LockedBackupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const vault = useVault();
  const { me } = useSettings();
  const [pass, setPass] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<{ key: string; bad: boolean } | null>(null);
  const reset = () => { setPass(""); setAgain(""); setBusy(false); setVerdict(null); };
  const close = () => { if (busy) return; reset(); onClose(); };

  async function submit() {
    if (busy) return;
    if (!canLock()) { setVerdict({ key: "bk_nocrypto", bad: true }); return; }
    if ([...pass.normalize("NFC")].length < MIN_PASSPHRASE) { setVerdict({ key: "bk_err_short", bad: true }); return; }
    if (pass !== again) { setVerdict({ key: "bk_err_match", bad: true }); return; }
    setBusy(true);
    setVerdict(null);
    try {
      const zip = await buildBackupZip({ vault, scratchProjectId: me?.scratchProjectId, scratchTitle: t("export_scratch"), day: localDay() });
      if (!zip) { setVerdict({ key: "wc_bk_need_unlock", bad: true }); return; }
      const locked = await lockBackup(new Uint8Array(await zip.arrayBuffer()), pass);
      await logBackupExport();
      downloadBlob(lockedFileName(), new Blob([locked as Uint8Array<ArrayBuffer>], { type: "application/octet-stream" }));
      stampBackup();
      // Forget the passphrase at once; the file is made.
      setPass(""); setAgain("");
      setVerdict({ key: "wc_bk_done", bad: false });
    } catch {
      setVerdict({ key: "wc_bk_fail", bad: true });
    } finally {
      setBusy(false);
    }
  }

  const done = verdict?.key === "wc_bk_done";
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-md" data-testid="locked-backup-dialog">
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="grid gap-3">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-purple-800">{t("bk_h_create")}</DialogTitle>
            <DialogDescription>{t("wc_bk_locked_intro")}</DialogDescription>
          </DialogHeader>
          <p className="m-0 text-sm">{t("bk_m_create")}</p>
          <label className="grid gap-1 text-sm font-medium">
            {t("bk_pass1")}
            <SecretInput autoComplete="off" autoFocus value={pass} onChange={(e) => setPass(e.target.value)} data-testid="bk-pass1" toggleTestId="bk-pass1-toggle" />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            {t("bk_pass2")}
            <SecretInput autoComplete="off" value={again} onChange={(e) => setAgain(e.target.value)} data-testid="bk-pass2" toggleTestId="bk-pass2-toggle" />
          </label>
          {busy && <p role="status" className="m-0 text-sm text-muted-foreground" data-testid="bk-lock-busy">{t("wc_bk_locked_busy")}</p>}
          {verdict && <p role={verdict.bad ? "alert" : "status"} className={"m-0 text-sm font-semibold " + (verdict.bad ? "text-destructive" : "text-ink")} data-testid="bk-lock-verdict">{t(verdict.key)}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={busy} data-testid="bk-lock-cancel" onClick={close}>{t("bk_cancel")}</Button>
            {!done && <Button type="submit" variant="primary" disabled={busy} data-testid="bk-lock-go">{t("bk_ok_create")}</Button>}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
