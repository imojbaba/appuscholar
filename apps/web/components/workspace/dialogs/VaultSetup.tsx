"use client";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useVault } from "@/lib/vault/useVault";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SecretInput } from "@/components/ui/secret-input";
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

/**
 * A new passphrase chosen inside another window (Connect AI's "Protect with a passphrase"): typed twice on one screen, with the two rules
 * ("at least 10 characters", "both match") ticked as they are typed, so the button is never pressed into a refusal. What still goes wrong
 * (`onSubmit` answers a sentence: offline, the server failed) is said under the fields, in the window (#37's rule), and the entries stay.
 * `children` are the footer's other buttons, before the submit.
 */
export function NewPassphraseForm({ submitLabel, onSubmit, children }: { submitLabel: string; onSubmit(pass: string): Promise<string | null>; children?: React.ReactNode }) {
  const t = useT();
  const [first, setFirst] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const long = first.length >= VAULT_MIN_PASS;
  const same = again.length > 0 && again === first;
  async function submit() {
    if (!long || !same || busy) return;
    setBusy(true);
    setError(null);
    try { setError(await onSubmit(first)); } finally { setBusy(false); }
  }
  const rule = (ok: boolean, text: string, id: string) => (
    <li className={"flex items-center gap-2 " + (ok ? "text-ok-ink" : "text-muted-foreground")} data-testid={id} data-ok={ok}>
      <span aria-hidden="true">{ok ? "✓" : "○"}</span><span>{text}</span>
    </li>
  );
  return (
    <form className="grid gap-3" aria-busy={busy || undefined} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <label className="grid gap-1 text-sm font-semibold" htmlFor="newPass">{t("connect_pass_label")}</label>
      <SecretInput id="newPass" autoComplete="new-password" autoFocus value={first} onChange={(e) => setFirst(e.target.value)} data-testid="new-pass" toggleTestId="new-pass-toggle" />
      <label className="grid gap-1 text-sm font-semibold" htmlFor="newPass2">{t("connect_pass2_label")}</label>
      <SecretInput id="newPass2" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} data-testid="new-pass2" toggleTestId="new-pass2-toggle" />
      <ul className="m-0 grid list-none gap-1 p-0 text-sm" aria-live="polite">
        {rule(long, t("connect_pass_rule_len", { n: VAULT_MIN_PASS }), "new-pass-len")}
        {rule(same, t("connect_pass_rule_same"), "new-pass-same")}
      </ul>
      {error && <p role="alert" className="m-0 text-sm font-semibold text-destructive" data-testid="new-pass-error">{error}</p>}
      <DialogFooter className="sticky bottom-0 bg-background pt-1">
        {children}
        <Button type="submit" variant="primary" disabled={!long || !same || busy} data-testid="new-pass-go">{submitLabel}</Button>
      </DialogFooter>
    </form>
  );
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
