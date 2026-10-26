"use client";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useVault } from "@/lib/vault/useVault";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { askPassphrase, VAULT_MIN_PASS } from "./Passphrase";
import { RecoverySheet } from "./RecoverySheet";

type Phase = "closed" | "intro" | "asking" | "sheet";
let opener: (() => void) | null = null;
/** Everyone waiting on the setup now open (the header pill and the key dialog can both ask): all get the one answer. */
let waiting: ((ok: boolean) => void)[] = [];
function settle(ok: boolean) {
  const w = waiting;
  waiting = [];
  for (const r of w) r(ok);
}

/**
 * Opens the vault setup. Resolves true once the vault exists and is open (the recovery sheet is then on screen), false when the
 * student chose "Not now" or closed it. Call it only while the vault is "off".
 */
export function openVaultSetup(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!opener) { resolve(false); return; }
    waiting.push(resolve);
    opener();
  });
}

/** Mount once, in ChromeDialogs. */
export function VaultSetupHost() {
  const t = useT();
  const vault = useVault();
  const [phase, setPhase] = useState<Phase>("closed");
  const phaseRef = useRef<Phase>("closed");
  const go = (p: Phase) => { phaseRef.current = p; setPhase(p); };
  const [remember, setRemember] = useState(false);
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    opener = () => {
      const p = phaseRef.current;
      if (p === "sheet") { settle(true); return; } // already set up: its sheet is on screen
      if (p === "closed") { setRemember(false); phaseRef.current = "intro"; setPhase("intro"); }
    };
    return () => { opener = null; settle(false); };
  }, []);

  async function submit() {
    if (phaseRef.current !== "intro") return;
    // The choose / confirm prompts replace the setup on screen. What does not fit is said inside the prompt, under its field, and asked again there
    // (O9's verdict): a passphrase too short in the choose prompt, a failed setup in the confirm prompt, two entries apart in a fresh choose prompt.
    // Only Cancel brings the setup back. (A toast at the foot of the page is not seen behind a modal, and sending the student back to the start
    // without a reason kept a new student from ever getting past this step.)
    go("asking");
    let verdict: string | null = null;
    for (;;) {
      const first = await askPassphrase({ kind: "vault-choose" }, {
        verdict,
        accept: (v) => (v.length < VAULT_MIN_PASS ? t("vault_err_short", { n: VAULT_MIN_PASS }) : null)
      });
      if (first === null) { go("intro"); return; }
      const r: { outcome: "apart" | "exists" | "done" | null } = { outcome: null };
      const again = await askPassphrase({ kind: "vault-confirm" }, {
        accept: async (v) => {
          if (v !== first) { r.outcome = "apart"; return null; }
          try {
            const { recoveryCode } = await vault.setup(first, remember);
            setCode(recoveryCode);
            r.outcome = "done";
            return null;
          } catch (e) {
            // A vault that already exists (set up meanwhile elsewhere: the provider has re-read it, so the pill shows it locked) cannot be set up again.
            if ((e instanceof ApiError && e.status === 409) || (e instanceof Error && e.message === "vault-exists")) { r.outcome = "exists"; return null; }
            // Offline, or the server failed: the entries stay, and OK tries again.
            return t("vault_setup_fail");
          }
        }
      });
      if (again === null || r.outcome === null) { go("intro"); return; }
      if (r.outcome === "apart") { verdict = t("vault_err_match"); continue; }
      if (r.outcome === "exists") { toast(t("vault_setup_fail")); go("closed"); settle(false); return; }
      go("sheet");
      settle(true);
      return;
    }
  }
  function later() {
    if (phaseRef.current !== "intro") return;
    go("closed");
    settle(false);
  }

  return (
    <>
      <Dialog open={phase === "intro"} onOpenChange={(o) => { if (!o) later(); }}>
        <DialogContent className="max-w-md" data-testid="vault-setup-dialog">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-purple-800">🔒 {t("vault_setup_h2")}</DialogTitle>
            <DialogDescription>{t("vault_setup_intro")}</DialogDescription>
          </DialogHeader>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} data-testid="vault-setup-remember" />
            <span>{t("vault_remember")}</span>
          </label>
          <DialogFooter>
            <Button variant="ghost" data-testid="vault-setup-later" onClick={later}>{t("vault_setup_later")}</Button>
            <Button variant="primary" data-testid="vault-setup-submit" onClick={() => { void submit(); }}>{t("vault_setup_btn")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <RecoverySheet code={phase === "sheet" ? code : null} onDone={() => { setCode(null); go("closed"); }} />
    </>
  );
}
