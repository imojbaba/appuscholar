"use client";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { useVault } from "@/lib/vault/useVault";
import { VaultError } from "@/lib/vault/crypto";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { MIN_PASS } from "./ChangePassphrase";
import { setVaultForgotHandler } from "./Passphrase";
import { RecoverySheet } from "./RecoverySheet";

/** The recovery code's alphabet (no 0, 1, I, O): anything else typed is dropped. */
const NOT_CODE = /[^A-HJ-NP-Z2-9]/g;
/** What the student types, as the sheet prints it: upper case, four groups of five joined by hyphens, at most 20 characters. */
export function formatRecoveryCode(raw: string): string {
  const chars = raw.toUpperCase().replace(NOT_CODE, "").slice(0, 20);
  return (chars.match(/.{1,5}/g) ?? []).join("-");
}

let opener: (() => void) | null = null;
/** Opens the recovery by code. The unlock ask's vault_forgot link calls this. */
export function openVaultRecover(): void {
  opener?.();
}

/**
 * Mount once, in ChromeDialogs. The code opens the vault key in this browser and is never sent; a wrong code changes nothing. On
 * success the vault has a new passphrase and a new recovery code (the old one is void), shown on a new RecoverySheet.
 */
export function VaultRecoverHost() {
  const t = useT();
  const { recover } = useVault();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [pass, setPass] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<string | null>(null);

  useEffect(() => {
    opener = () => { setCode(""); setPass(""); setAgain(""); setBusy(false); setOpen(true); };
    setVaultForgotHandler(() => opener?.());
    return () => { opener = null; setVaultForgotHandler(null); };
  }, []);
  function close() { setOpen(false); setCode(""); setPass(""); setAgain(""); setBusy(false); }

  async function submit() {
    if (busy) return;
    if (pass.length < MIN_PASS) { toast(t("bk_err_short")); return; }
    if (pass !== again) { toast(t("bk_err_match")); return; }
    setBusy(true);
    let fresh: string;
    try {
      fresh = (await recover(code, pass)).recoveryCode;
    } catch (e) {
      setBusy(false);
      toast(t(e instanceof VaultError && e.code === "wrong-code" ? "vault_recover_bad" : "vault_change_fail"));
      return;
    }
    close();
    setSheet(fresh);
    toast(t("vault_recovered"));
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent className="max-w-sm" data-testid="vault-recover-dialog">
          <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="grid gap-3">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold text-purple-800">🔒 {t("vault_recover_h2")}</DialogTitle>
            </DialogHeader>
            <label className="grid gap-1 text-sm font-medium">
              {t("vault_recover_code")}
              <input className="input font-mono tracking-wide uppercase" autoComplete="off" autoCapitalize="characters" spellCheck={false} autoFocus
                placeholder="XXXXX-XXXXX-XXXXX-XXXXX" value={code} onChange={(e) => setCode(formatRecoveryCode(e.target.value))} data-testid="recover-code" />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              {t("vault_recover_new")}
              <input className="input" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} data-testid="recover-pass" />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              {t("bk_pass2")}
              <input className="input" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} data-testid="recover-pass2" />
            </label>
            <DialogFooter>
              <Button type="button" variant="ghost" data-testid="recover-cancel" onClick={close}>{t("bk_cancel")}</Button>
              <Button type="submit" variant="primary" disabled={busy} data-testid="recover-submit">{t("vault_recover_btn")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <RecoverySheet code={sheet} onDone={() => setSheet(null)} />
    </>
  );
}
