"use client";
import { useEffect, useState } from "react";
import { PROVIDERS, type ProviderId } from "@appuscholar/core";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/lib/i18n";

/** v1 asked with window.prompt; the wording is the same. The vault kinds use the v2 vault strings. */
export type PassphraseAsk =
  | { kind: "unlock"; provider: ProviderId } | { kind: "choose" } | { kind: "confirm" }
  | { kind: "vault-unlock" } | { kind: "vault-choose" } | { kind: "vault-confirm" };

type T = ReturnType<typeof useT>;
const MESSAGE = {
  choose: "Choose a passphrase for your keys. You will type it once each time you open Appuscholar. Nobody can recover it for you.",
  confirm: "Type the passphrase once more to confirm:"
};
function message(ask: PassphraseAsk, t: T): string {
  switch (ask.kind) {
    case "unlock": return `Passphrase to unlock your ${PROVIDERS[ask.provider].short} key:`;
    case "vault-unlock": return t("vault_unlock_hint");
    case "vault-choose": return t("vault_setup_intro");
    case "vault-confirm": return t("bk_pass2");
    default: return MESSAGE[ask.kind];
  }
}
function title(ask: PassphraseAsk, t: T): string {
  if (ask.kind === "vault-unlock") return t("vault_unlock_h2");
  if (ask.kind === "vault-choose" || ask.kind === "vault-confirm") return t("vault_setup_h2");
  return t("bk_pass1");
}

/**
 * `remember` is the vault unlock's "Remember on this computer" box (always false for the other asks). `verdict` is what the last
 * answer earned (the wrong-passphrase line): shown inside the window, under the field, because a toast at the foot of the page is
 * not seen while a modal holds focus (O9, Phase 3A walk).
 */
type Pending = { ask: PassphraseAsk; verdict: string | null; resolve: (v: string | null, remember: boolean) => void };
let listener: ((p: Pending | null) => void) | null = null;
let current: Pending | null = null;

let forgotHandler: (() => void) | null = null;
/**
 * What the vault unlock ask's vault_forgot link does: VaultRecoverHost registers the recovery here when it mounts (null when it unmounts).
 * The link shows only while a handler is set. Clicking it cancels the ask (it resolves null) and then calls the handler.
 */
export function setVaultForgotHandler(fn: (() => void) | null): void {
  forgotHandler = fn;
}

function open(ask: PassphraseAsk, resolve: Pending["resolve"], verdict: string | null = null): void {
  current?.resolve(null, false);
  current = { ask, verdict, resolve };
  if (!listener) { current = null; resolve(null, false); return; }
  listener(current);
}

/** Opens the passphrase dialog and resolves with what the student typed, or null when they cancel. One at a time: a second ask cancels the first. */
export function askPassphrase(ask: PassphraseAsk): Promise<string | null> {
  return new Promise((resolve) => open(ask, (v) => resolve(v)));
}

/**
 * The vault unlock ask: the passphrase and whether "Remember on this computer" was ticked (unticked by default), or null when cancelled.
 * Shares the one dialog with askPassphrase, so either cancels the other. `verdict` (the previous try's wrong-passphrase line) shows
 * under the field.
 */
export function askVaultUnlock(opts: { verdict?: string } = {}): Promise<{ pass: string; remember: boolean } | null> {
  return new Promise((resolve) => open({ kind: "vault-unlock" }, (v, remember) => resolve(v === null ? null : { pass: v, remember }), opts.verdict ?? null));
}

/** Mount once, in ChromeDialogs. */
export function PassphraseHost() {
  const t = useT();
  const [pending, setPending] = useState<Pending | null>(null);
  const [value, setValue] = useState("");
  const [remember, setRemember] = useState(false);
  useEffect(() => {
    listener = (p) => { setValue(""); setRemember(false); setPending(p); };
    return () => { listener = null; current?.resolve(null, false); current = null; };
  }, []);
  function finish(answer: string | null) {
    const p = pending;
    if (!p) return;
    current = null;
    setPending(null);
    setValue("");
    setRemember(false);
    p.resolve(answer, answer !== null && p.ask.kind === "vault-unlock" && remember);
  }
  return (
    <Dialog open={!!pending} onOpenChange={(o) => { if (!o) finish(null); }}>
      <DialogContent className="max-w-sm" data-testid="pass-dialog">
        {pending && (
          <form onSubmit={(e) => { e.preventDefault(); finish(value); }} className="grid gap-3">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold text-purple-800">🔒 {title(pending.ask, t)}</DialogTitle>
              <DialogDescription data-testid="pass-message">{message(pending.ask, t)}</DialogDescription>
            </DialogHeader>
            <input className="input" type="password" autoComplete="off" autoFocus value={value} onChange={(e) => setValue(e.target.value)} aria-label={t("bk_pass1")}
              aria-invalid={pending.verdict ? true : undefined} aria-describedby={pending.verdict ? "pass-verdict" : undefined} data-testid="pass-input" />
            {pending.verdict && <p id="pass-verdict" role="alert" className="m-0 text-sm font-semibold text-destructive" data-testid="pass-verdict">{pending.verdict}</p>}
            {pending.ask.kind === "vault-unlock" && (
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} data-testid="pass-remember" />
                <span>{t("vault_remember")}</span>
              </label>
            )}
            {pending.ask.kind === "vault-unlock" && forgotHandler && (
              <button type="button" className="justify-self-start text-sm text-purple-800 underline underline-offset-2" data-testid="vault-forgot"
                onClick={() => { const go = forgotHandler; finish(null); go?.(); }}>{t("vault_forgot")}</button>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" data-testid="pass-cancel" onClick={() => finish(null)}>{t("bk_cancel")}</Button>
              <Button type="submit" variant="primary" data-testid="pass-ok">OK</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
