"use client";
import { useCallback, useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { useVault } from "@/lib/vault/useVault";
import { hasRemembered } from "@/lib/vault/remember";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { ChangePassphrase } from "./dialogs/ChangePassphrase";
import { openVaultSetup } from "./dialogs/VaultSetup";

/* DESIGN-SYSTEM.md: amber flags what needs attention, green is good, purple is structure (work under way), grey is neutral.
   Borders, not shadows. 34px target on desktop; the phone rule in globals.css makes every header button 44px. */
const PILL = "inline-flex min-h-[34px] max-w-full items-center rounded-full border border-transparent px-3 text-xs leading-4 font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-800";
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
  const { status, complete } = vault;
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
  // A vault whose migration has not finished (a failed run, or one not started in this session) says so until it is done, and finishes it
  // on a click: unlocking first when locked.
  if (!complete && (status === "locked" || status === "unlocked")) {
    return (
      <button type="button" className={cn(PILL, TONE.migrating, className)} data-testid="vault-pill" data-status="migrating"
        onClick={() => { void vault.resumeMigration(); }}>
        <span className="truncate">{t("vault_pill_migrating")}</span>
      </button>
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
          <button type="button" className={cn(PILL, TONE.unlocked, className)} data-testid="vault-pill" data-status={status}><span className="truncate">{t("vault_pill_yours")}</span></button>
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
