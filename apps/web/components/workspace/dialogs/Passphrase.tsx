"use client";
import { useEffect, useState } from "react";
import { PROVIDERS, type ProviderId } from "@appuscholar/core";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/lib/i18n";

/** v1 asked with window.prompt; the wording is the same. */
export type PassphraseAsk = { kind: "unlock"; provider: ProviderId } | { kind: "choose" } | { kind: "confirm" };

const MESSAGE = {
  choose: "Choose a passphrase for your keys. You will type it once each time you open Appuscholar. Nobody can recover it for you.",
  confirm: "Type the passphrase once more to confirm:"
};
function message(ask: PassphraseAsk): string {
  return ask.kind === "unlock" ? `Passphrase to unlock your ${PROVIDERS[ask.provider].short} key:` : MESSAGE[ask.kind];
}

type Pending = { ask: PassphraseAsk; resolve: (v: string | null) => void };
let listener: ((p: Pending | null) => void) | null = null;
let current: Pending | null = null;

/** Opens the passphrase dialog and resolves with what the student typed, or null when they cancel. One at a time: a second ask cancels the first. */
export function askPassphrase(ask: PassphraseAsk): Promise<string | null> {
  return new Promise((resolve) => {
    current?.resolve(null);
    current = { ask, resolve };
    if (!listener) { current = null; resolve(null); return; }
    listener(current);
  });
}

/** Mount once, in ChromeDialogs. */
export function PassphraseHost() {
  const t = useT();
  const [pending, setPending] = useState<Pending | null>(null);
  const [value, setValue] = useState("");
  useEffect(() => {
    listener = (p) => { setValue(""); setPending(p); };
    return () => { listener = null; current?.resolve(null); current = null; };
  }, []);
  function finish(answer: string | null) {
    const p = pending;
    if (!p) return;
    current = null;
    setPending(null);
    setValue("");
    p.resolve(answer);
  }
  return (
    <Dialog open={!!pending} onOpenChange={(o) => { if (!o) finish(null); }}>
      <DialogContent className="max-w-sm" data-testid="pass-dialog">
        {pending && (
          <form onSubmit={(e) => { e.preventDefault(); finish(value); }} className="grid gap-3">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold text-purple-800">🔒 {t("bk_pass1")}</DialogTitle>
              <DialogDescription data-testid="pass-message">{message(pending.ask)}</DialogDescription>
            </DialogHeader>
            <input className="input" type="password" autoComplete="off" autoFocus value={value} onChange={(e) => setValue(e.target.value)} aria-label={t("bk_pass1")} data-testid="pass-input" />
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
