"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ScanResult } from "./callAI";
import { useT } from "@/lib/i18n";

export type PdAnswer = "mask" | "send" | "cancel";

/** v1 pdAsk's sentence: "Found: 1 email address, 2 phone numbers." (the API words it the same way, with "addresses" spelled correctly). */
export function foundSentence(counts: Record<string, number>): string {
  const plural = (k: string) => (k.endsWith("s") ? k + "es" : k + "s");
  return "Found: " + Object.keys(counts).map((k) => counts[k] + " " + (counts[k]! > 1 ? plural(k) : k)).join(", ") + ".";
}

type Pending = { sc: ScanResult; resolve: (a: PdAnswer) => void };
let listener: ((p: Pending | null) => void) | null = null;
let current: Pending | null = null;

/** Opens the personal-data dialog and resolves with the student's choice. Closing it any other way means cancel. */
export function askPd(sc: ScanResult): Promise<PdAnswer> {
  return new Promise((resolve) => {
    current?.resolve("cancel");
    current = { sc, resolve };
    if (!listener) { current = null; resolve("cancel"); return; }
    listener(current);
  });
}

/** Mount once, in ChromeDialogs. */
export function PdHost() {
  const t = useT();
  const [pending, setPending] = useState<Pending | null>(null);
  useEffect(() => {
    listener = setPending;
    return () => { listener = null; current?.resolve("cancel"); current = null; };
  }, []);
  function finish(a: PdAnswer) {
    const p = pending;
    if (!p) return;
    current = null;
    setPending(null);
    p.resolve(a);
  }
  return (
    <Dialog open={!!pending} onOpenChange={(o) => { if (!o) finish("cancel"); }}>
      <DialogContent className="max-w-md" data-testid="pd-dialog">
        {pending && (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold text-purple-800">Personal details in this text</DialogTitle>
              <DialogDescription className="sr-only">Choose whether to mask the personal details before the text goes to your AI provider.</DialogDescription>
            </DialogHeader>
            <p className="m-0 text-sm" data-testid="pd-found">{foundSentence(pending.sc.counts)}</p>
            <p className="m-0 text-[13px] text-muted-foreground">This text goes straight to your AI provider. The check finds email addresses, phone numbers and ID numbers. It cannot find a name written inside a sentence, so read the text once yourself.</p>
            <DialogFooter>
              <Button variant="primary" data-testid="pd-mask" onClick={() => finish("mask")}>Mask them and send</Button>
              <Button variant="ghost" data-testid="pd-send" onClick={() => finish("send")}>Send as it is</Button>
              <Button variant="ghost" data-testid="pd-cancel" onClick={() => finish("cancel")}>{t("sap_cancel_btn")}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
