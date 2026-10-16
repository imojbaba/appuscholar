"use client";
import { useCallback, useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { useVault } from "@/lib/vault/useVault";
import { VaultError } from "@/lib/vault/crypto";
import { hasRemembered } from "@/lib/vault/remember";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { openVaultSetup } from "./dialogs/VaultSetup";

/** As the setup: a vault passphrase is at least 10 characters (bk_err_short). */
const MIN_PASS = 10;

/* DESIGN-SYSTEM.md: amber flags what needs attention, green is good, purple is structure (work under way), grey is neutral.
   Borders, not shadows. 34px target on desktop; the phone rule in globals.css makes every header button 44px. */
const PILL = "inline-flex min-h-[34px] max-w-full items-center rounded-full border border-transparent px-3 text-xs leading-4 font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
const TONE = {
  off: "bg-flag-bg text-flag-ink hover:border-flag-ink/40",
  locked: "bg-chip text-muted-foreground hover:border-line-strong",
  unlocked: "bg-ok-bg text-ok-ink hover:border-ok-ink/40",
  migrating: "bg-purple-100 text-purple-800"
} as const;

/** The vault's state in the header, and the way into it: set up (off), unlock (locked), change or forget (on). */
export function VaultPill({ className }: { className?: string }) {
  const t = useT();
  const vault = useVault();
  const [changing, setChanging] = useState(false);
  const { status } = vault;
  const uid = useSettings().me?.id ?? null;
  /** "Forget on this computer" is offered only when this computer remembers the vault. Re-read when the vault opens and when the menu opens. */
  const [remembered, setRemembered] = useState(false);
  const readRemembered = useCallback(() => {
    if (!uid) return;
    hasRemembered(uid).then(setRemembered, () => setRemembered(false));
  }, [uid]);
  useEffect(() => { if (status === "unlocked") readRemembered(); }, [status, readRemembered]);
  async function forget() {
    try { await vault.forgetThisComputer(); } catch { return; }
    setRemembered(false);
    toast(t("vault_forgotten"));
  }
  if (status === "loading") return null; // never shows "off" to a student whose vault has not been read yet

  if (status === "migrating") {
    const m = vault.migrating;
    return (
      <span role="status" className={cn(PILL, TONE.migrating, className)} title={m ? t("vault_migrating_n", { n: m.n, total: m.total }) : undefined} data-testid="vault-pill" data-status={status}>
        <span className="truncate">{t("vault_pill_migrating")}</span>
      </span>
    );
  }
  if (status === "off" || status === "locked") {
    return (
      <button type="button" className={cn(PILL, TONE[status], className)} data-testid="vault-pill" data-status={status}
        onClick={() => { if (status === "off") void openVaultSetup(); else void vault.ensureUnlocked(); }}>
        <span className="truncate">{t(status === "off" ? "vault_pill_off" : "vault_pill_locked")}</span>
      </button>
    );
  }
  return (
    <>
      {/* Not modal, so the change dialog it opens takes focus cleanly. */}
      <DropdownMenu modal={false} onOpenChange={(o) => { if (o) readRemembered(); }}>
        <DropdownMenuTrigger asChild>
          <button type="button" className={cn(PILL, TONE.unlocked, className)} data-testid="vault-pill" data-status={status}><span className="truncate">{t("vault_pill_on")}</span></button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" data-testid="vault-menu">
          <DropdownMenuItem className="min-h-[34px]" data-testid="vault-menu-change" onSelect={() => setChanging(true)}>{t("vault_change_h2")}</DropdownMenuItem>
          {remembered && <DropdownMenuItem className="min-h-[34px]" data-testid="vault-menu-forget" onSelect={() => { void forget(); }}>{t("vault_forget_btn")}</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePassphrase open={changing} onClose={() => setChanging(false)} />
    </>
  );
}

function ChangePassphrase({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const { changePassphrase } = useVault();
  const [old, setOld] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  function close() { setOld(""); setNext(""); setAgain(""); setBusy(false); onClose(); }

  async function submit() {
    if (busy) return;
    if (next.length < MIN_PASS) { toast(t("bk_err_short")); return; }
    if (next !== again) { toast(t("bk_err_match")); return; }
    setBusy(true);
    try {
      await changePassphrase(old, next);
    } catch (e) {
      setBusy(false);
      toast(t(e instanceof VaultError && e.code === "wrong-passphrase" ? "vault_wrong" : "vault_change_fail"));
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
          <DialogFooter>
            <Button type="button" variant="ghost" data-testid="vault-change-cancel" onClick={close}>{t("bk_cancel")}</Button>
            <Button type="submit" variant="primary" disabled={busy} data-testid="vault-change-submit">{t("vault_change_btn")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
