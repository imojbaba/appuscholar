"use client";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useVault } from "@/lib/vault/useVault";
import { VaultError } from "@/lib/vault/crypto";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

/** As the setup: a vault passphrase is at least 10 characters (bk_err_short). */
export const MIN_PASS = 10;

/**
 * Old passphrase, new, and again. Only the vault key's passphrase wrap is replaced (PATCH /me/vault/wraps): no document is re-encrypted,
 * and the recovery code stays valid. Opened from the vault pill's menu and from Help.
 */
export function ChangePassphrase({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const { changePassphrase } = useVault();
  const [old, setOld] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  // The last submit's refusal, shown inside the window (O9): a toast behind a modal goes unseen.
  const [verdict, setVerdict] = useState<string | null>(null);
  function close() { setOld(""); setNext(""); setAgain(""); setBusy(false); setVerdict(null); onClose(); }
  /** Refuses the submit: the line goes under the fields and, as before, into a toast. */
  function refuse(key: string) { const msg = t(key); setVerdict(msg); toast(msg); }

  async function submit() {
    if (busy) return;
    if (next.length < MIN_PASS) { refuse("bk_err_short"); return; }
    if (next !== again) { refuse("bk_err_match"); return; }
    setBusy(true);
    setVerdict(null);
    try {
      await changePassphrase(old, next);
    } catch (e) {
      setBusy(false);
      refuse(e instanceof VaultError && e.code === "wrong-passphrase" ? "vault_wrong" : "vault_change_fail");
      return;
    }
    toast(t("vault_changed"));
    close();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-sm" data-testid="vault-change-dialog">
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="grid gap-3">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-purple-800">🔒 {t("vault_change_h2")}</DialogTitle>
          </DialogHeader>
          <label className="grid gap-1 text-sm font-medium">
            {t("vault_change_old")}
            <input className="input" type="password" autoComplete="current-password" autoFocus value={old} onChange={(e) => setOld(e.target.value)} data-testid="vault-change-old" />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            {t("vault_change_new")}
            <input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} data-testid="vault-change-new" />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            {t("bk_pass2")}
            <input className="input" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} data-testid="vault-change-again" />
          </label>
          {verdict && <p role="alert" className="m-0 text-sm font-semibold text-destructive" data-testid="vault-change-verdict">{verdict}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" data-testid="vault-change-cancel" onClick={close}>{t("bk_cancel")}</Button>
            <Button type="submit" variant="primary" disabled={busy} data-testid="vault-change-submit">{t("vault_change_btn")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
