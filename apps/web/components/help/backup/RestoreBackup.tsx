"use client";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useVault } from "@/lib/vault/useVault";
import { localDay } from "@/lib/vault/export";
import { checkBackup, type BackupReport } from "@/lib/help/backup/checkBackup";
import { BackupError, isLocked, isV1Backup } from "@/lib/help/backup/format";
import { unlockBackup } from "@/lib/help/backup/lockedBackup";
import { apiRestoreDeps, restoreBackup, type RestoreResult } from "@/lib/help/backup/restore";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SecretInput } from "@/components/ui/secret-input";

type Step = "pick" | "confirm" | "busy" | "done";

/** What a `failed` code from checkBackup or restoreBackup says, in words. */
function failText(t: ReturnType<typeof useT>, code: string): string {
  const at = code.indexOf(":");
  const kind = code.slice(0, at), name = code.slice(at + 1);
  const key: Record<string, string> = {
    missing: "wc_bk_prob_missing", damaged: "wc_bk_prob_damaged", unreadable: "wc_bk_prob_unreadable", "unreadable-stage": "wc_bk_prob_stage", stage: "wc_bk_rs_f_stage",
    project: "wc_bk_rs_f_project", document: "wc_bk_rs_f_doc", rest: "wc_bk_rs_f_rest", skipped: "wc_bk_rs_f_skipped"
  };
  return t(key[kind] ?? "wc_bk_prob_missing", { name });
}

/**
 * What the check found that a restore does not need: a document's Word copy (`.doc`) and the writing-process record are in the zip for the
 * student's own use, a restore never reads them, so their absence is not a reason to hold anything back.
 */
const notNeeded = (problem: string) => /^missing:(.*\.doc|writing-process-record\.txt)$/.test(problem);

/**
 * "Restore from backup" in Help (v1 backupRestoreFile). Unlike v1 it replaces nothing: the file is read here first and checked, the student
 * confirms what will happen, and then each project in it is added as a new project "<title> (restored)". Nothing already in the account is
 * changed. A locked file asks for its passphrase in the window; the passphrase is used once to open the file and is cleared at once.
 */
export function RestoreBackup() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" data-testid="help-restore-backup" onClick={() => setOpen(true)}>{t("wc_bk_restore_btn")}</Button>
      {/* Mounted only while open: a closed dialog holds no passphrase and no file. */}
      {open && <RestoreDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function RestoreDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const vault = useVault();
  const [step, setStep] = useState<Step>("pick");
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [locked, setLocked] = useState(false);
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  /** The zip itself once a locked file has been opened, so the passphrase is not needed again. */
  const [plain, setPlain] = useState<Uint8Array | null>(null);
  const [report, setReport] = useState<BackupReport | null>(null);
  const [result, setResult] = useState<RestoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const working = busy || step === "busy";
  const close = () => { if (working) return; setPass(""); setBytes(null); setPlain(null); onClose(); };
  const suffix = t("wc_bk_rs_suffix");

  async function pick(file: File | undefined) {
    setError(null); setPass(""); setPlain(null); setReport(null); setStep("pick");
    if (!file) { setBytes(null); setLocked(false); return; }
    try {
      const b = new Uint8Array(await file.arrayBuffer());
      setBytes(b);
      setLocked(isLocked(b));
    } catch {
      setBytes(null); setLocked(false); setError("wc_bk_read_fail");
    }
  }

  /** Opens the file (a locked one with its passphrase) and reads what it holds. Nothing is written. */
  async function read() {
    if (!bytes || busy) return;
    setBusy(true); setError(null);
    try {
      const zip = locked ? await unlockBackup(bytes, pass) : bytes;
      setPlain(zip);
      setReport(await checkBackup(zip));
      setStep("confirm");
    } catch (e) {
      const code = e instanceof BackupError ? e.code : null;
      setError(code === "wrong-passphrase" ? "bk_err_wrong" : code === "not-a-backup" ? (isV1Backup(bytes) ? "wc_bk_rs_v1" : "restore_bad") : "wc_bk_read_fail");
    } finally {
      // Used once, whatever came of it.
      setPass("");
      setBusy(false);
    }
  }

  async function go() {
    if (!plain || working) return;
    setStep("busy"); setError(null);
    try {
      const r = await restoreBackup(plain, undefined, apiRestoreDeps(vault, { suffix, authorLabel: t("wc_bk_rs_author") }));
      if (!r) { setError("wc_bk_rs_cancelled"); setStep("confirm"); return; }
      setResult(r); setPlain(null); setStep("done");
    } catch {
      setError("wc_bk_rs_fail"); setStep("confirm");
    }
  }

  const problems = (report?.problems ?? []).filter((p) => !notNeeded(p));
  const saved = report?.exportedAt ? localDay(new Date(report.exportedAt)) : "?";
  return (
    <Dialog open onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto" data-testid="restore-backup-dialog">
        <form onSubmit={(e) => { e.preventDefault(); void (step === "pick" ? read() : step === "confirm" ? go() : undefined); }} className="grid gap-3">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-purple-800">{t("wc_bk_rs_h")}</DialogTitle>
            <DialogDescription>{t("wc_bk_rs_intro")}</DialogDescription>
          </DialogHeader>

          {step === "pick" && (
            <>
              <label className="grid gap-1 text-sm font-medium">
                {t("wc_bk_file")}
                <input type="file" accept=".locked,.zip,application/zip,application/octet-stream" className="input" disabled={busy} data-testid="bk-restore-file" onChange={(e) => { void pick(e.target.files?.[0]); }} />
              </label>
              {locked && (
                <label className="grid gap-1 text-sm font-medium">
                  <span>{t("bk_m_open")}</span>
                  <SecretInput autoComplete="off" autoFocus value={pass} onChange={(e) => setPass(e.target.value)} aria-label={t("bk_pass1")} data-testid="bk-restore-pass" toggleTestId="bk-restore-pass-toggle" />
                </label>
              )}
            </>
          )}

          {step === "confirm" && report && (
            <div className="grid gap-2 text-sm" data-testid="bk-restore-confirm">
              <p className="m-0 font-semibold">{t("wc_bk_rs_confirm", { n: report.documents, w: report.words, d: saved, suffix })}</p>
              <p className="m-0 text-muted-foreground">{t("wc_bk_rs_note")}</p>
              {problems.length > 0 && (
                <>
                  <p className="m-0 font-semibold text-destructive">{t("wc_bk_rs_problems")}</p>
                  <ul className="m-0 grid gap-1 pl-5" data-testid="bk-restore-problems">
                    {problems.map((p, i) => <li key={i + p}>{failText(t, p)}</li>)}
                  </ul>
                </>
              )}
            </div>
          )}

          {step === "busy" && <p role="status" className="m-0 text-sm text-muted-foreground" data-testid="bk-restore-busy">{t("wc_bk_rs_busy")}</p>}

          {step === "done" && result && (
            <div role="status" className="grid gap-2 text-sm" data-testid="bk-restore-result">
              <p className="m-0 font-semibold">{t(result.projects.length > 0 ? "wc_bk_rs_ok" : "wc_bk_rs_none")}</p>
              {result.projects.length > 0 && (
                <ul className="m-0 grid gap-1 pl-5" data-testid="bk-restore-made">
                  {result.projects.map((p) => <li key={p.id}>{t("wc_bk_rs_made", { name: p.title, n: p.documents })}</li>)}
                </ul>
              )}
              {result.failed.length > 0 && (
                <>
                  <p className="m-0 font-semibold text-destructive">{t("wc_bk_rs_partial")}</p>
                  <ul className="m-0 grid gap-1 pl-5" data-testid="bk-restore-failed">
                    {result.failed.map((f, i) => <li key={i + f}>{failText(t, f)}</li>)}
                  </ul>
                  {result.projects.length > 0 && <p className="m-0 text-muted-foreground">{t("wc_bk_rs_again")}</p>}
                </>
              )}
            </div>
          )}

          {error && <p role="alert" className="m-0 text-sm font-semibold text-destructive" data-testid="bk-restore-error">{t(error)}</p>}

          <DialogFooter>
            {step === "confirm" && <Button type="button" variant="ghost" data-testid="bk-restore-back" onClick={() => { setStep("pick"); setBytes(null); setLocked(false); setPlain(null); setReport(null); setError(null); }}>{t("wc_bk_rs_back")}</Button>}
            {(step === "pick" || step === "busy") && <Button type="button" variant="ghost" disabled={working} data-testid="bk-restore-close" onClick={close}>{t("bk_cancel")}</Button>}
            {step === "done" && <Button key="close" autoFocus type="button" variant="ghost" data-testid="bk-restore-close" onClick={close}>{t("close_btn")}</Button>}
            {step === "pick" && <Button type="submit" variant="primary" disabled={!bytes || busy || (locked && !pass)} data-testid="bk-restore-read">{t("wc_bk_rs_read")}</Button>}
            {step === "confirm" && <Button type="submit" variant="primary" autoFocus data-testid="bk-restore-go">{t("wc_bk_rs_go")}</Button>}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
