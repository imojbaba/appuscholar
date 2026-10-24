"use client";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { localDay } from "@/lib/vault/export";
import { checkBackup, type BackupReport } from "@/lib/help/backup/checkBackup";
import { BackupError, isLocked, isV1Backup } from "@/lib/help/backup/format";
import { lastVerify } from "@/lib/help/backup/stamp";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SecretInput } from "@/components/ui/secret-input";

/** One problem code from checkBackup, in words. */
function problemText(t: ReturnType<typeof useT>, code: string): string {
  const at = code.indexOf(":");
  const kind = code.slice(0, at), name = code.slice(at + 1);
  return t(kind === "unreadable" ? "wc_bk_prob_unreadable" : kind === "unreadable-stage" ? "wc_bk_prob_stage" : "wc_bk_prob_missing", { name });
}

/**
 * Check a backup file (v1 backupVerifyFile): proves a file, plain or locked, can be read, and says what it holds. It reads the file in this
 * browser and writes nothing; the only trace is the day of the last check on this device. A locked file asks for its passphrase here.
 */
export function CheckBackupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const { me } = useSettings();
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [locked, setLocked] = useState(false);
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<BackupReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reset = () => { setBytes(null); setLocked(false); setPass(""); setBusy(false); setReport(null); setError(null); };
  const close = () => { reset(); onClose(); };

  async function pick(file: File | undefined) {
    setReport(null); setError(null); setPass("");
    if (!file) { setBytes(null); setLocked(false); return; }
    try {
      const b = new Uint8Array(await file.arrayBuffer());
      setBytes(b);
      setLocked(isLocked(b));
    } catch {
      setBytes(null); setLocked(false); setError("wc_bk_read_fail");
    }
  }
  async function run() {
    if (!bytes || busy) return;
    setBusy(true); setReport(null); setError(null);
    try {
      setReport(await checkBackup(bytes, locked ? pass : undefined, me?.id));
      // Done with it: the passphrase is not kept once the file has opened.
      setPass("");
    } catch (e) {
      const code = e instanceof BackupError ? e.code : null;
      // A file from the old app is a backup, only not one this check reads: say where it goes instead of calling it unreadable.
      setError(code === "wrong-passphrase" ? "bk_err_wrong" : code === "not-a-backup" ? (isV1Backup(bytes) ? "wc_bk_check_v1" : "bk_verify_bad") : "wc_bk_read_fail");
    } finally {
      setBusy(false);
    }
  }

  const last = open ? lastVerify(me?.id) : 0;
  const saved = report?.exportedAt ? localDay(new Date(report.exportedAt)) : "?";
  // v1's sentence: documents and about how many words, not projects (the file always holds the scratch space as one more).
  const vars = { n: report?.documents ?? 0, w: report?.words ?? 0, d: saved };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto" data-testid="check-backup-dialog">
        <form onSubmit={(e) => { e.preventDefault(); void run(); }} className="grid gap-3">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-purple-800">{t("wc_bk_check_h")}</DialogTitle>
            <DialogDescription>{t("wc_bk_check_intro")}</DialogDescription>
          </DialogHeader>
          <p className="m-0 text-sm text-muted-foreground" data-testid="bk-last-verify">
            {last > 0 ? t("bk_last_verify", { d: localDay(new Date(last)) }) : t("bk_never_verify")}
          </p>
          <label className="grid gap-1 text-sm font-medium">
            {t("wc_bk_file")}
            <input type="file" accept=".locked,.zip,.json,application/zip,application/octet-stream,application/json" className="input" disabled={busy} data-testid="bk-check-file" onChange={(e) => { void pick(e.target.files?.[0]); }} />
          </label>
          {locked && (
            <label className="grid gap-1 text-sm font-medium">
              <span>{t("bk_m_open")}</span>
              <SecretInput autoComplete="off" autoFocus value={pass} onChange={(e) => setPass(e.target.value)} aria-label={t("bk_pass1")} data-testid="bk-check-pass" toggleTestId="bk-check-pass-toggle" />
            </label>
          )}
          {error && <p role="alert" className="m-0 text-sm font-semibold text-destructive" data-testid="bk-check-error">{t(error)}</p>}
          {report && (
            <div role="status" className="grid gap-1 text-sm" data-testid="bk-check-result">
              <p className={"m-0 font-semibold " + (report.ok ? "text-ink" : "text-destructive")} data-testid="bk-check-summary">
                {t(report.ok ? (report.kind === "locked" ? "wc_bk_check_ok_locked" : "bk_verify_ok") : "wc_bk_check_bad", vars)}
              </p>
              {report.problems.length > 0 && (
                <ul className="m-0 grid gap-1 pl-5" data-testid="bk-check-problems">
                  {report.problems.map((p, i) => <li key={i + p}>{problemText(t, p)}</li>)}
                </ul>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" data-testid="bk-check-close" onClick={close}>{t("bk_cancel")}</Button>
            <Button type="submit" variant="primary" disabled={!bytes || busy || (locked && !pass)} data-testid="bk-check-go">{t("wc_bk_check_go")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
