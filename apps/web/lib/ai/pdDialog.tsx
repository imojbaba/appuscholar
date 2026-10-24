"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PdAnswer, PdChoice, ScanResult } from "./callAI";
import { useT } from "@/lib/i18n";

export type { PdAnswer, PdChoice };

/**
 * v1 pdAsk's sentence: "Found: 1 email address, 2 phone numbers." (the API words it the same way, with "addresses" spelled correctly). `listed` is the names on the participant list,
 * already worded ("2 names from your participant list"): they come first ("Found: 2 names from your participant list, 1 email address.", spec 2026-10-24-participants-design.md §8.3).
 */
export function foundSentence(counts: Record<string, number>, listed?: string): string {
  const plural = (k: string) => (k.endsWith("s") ? k + "es" : k + "s");
  const parts = Object.keys(counts).map((k) => counts[k] + " " + (counts[k]! > 1 ? plural(k) : k));
  return "Found: " + [...(listed ? [listed] : []), ...parts].join(", ") + ".";
}

type Pending = { id: number; sc: ScanResult; resolve: (c: PdChoice) => void };
let listener: ((p: Pending | null) => void) | null = null;
let current: Pending | null = null;
let nextId = 0;

const cancelled: PdChoice = { answer: "cancel", leave: [] };

/** Opens the personal-data dialog and resolves with the student's choice. Closing it any other way means cancel. */
export function askPd(sc: ScanResult): Promise<PdChoice> {
  return new Promise((resolve) => {
    current?.resolve(cancelled);
    current = { id: ++nextId, sc, resolve };
    if (!listener) { current = null; resolve(cancelled); return; }
    listener(current);
  });
}

/** Mount once, in ChromeDialogs. */
export function PdHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  useEffect(() => {
    listener = setPending;
    return () => { listener = null; current?.resolve(cancelled); current = null; };
  }, []);
  function finish(c: PdChoice) {
    const p = pending;
    if (!p) return;
    current = null;
    setPending(null);
    p.resolve(c);
  }
  return (
    <Dialog open={!!pending} onOpenChange={(o) => { if (!o) finish(cancelled); }}>
      <DialogContent className="max-w-md" data-testid="pd-dialog">
        {/* Keyed by the request, so the toggles of one request never carry into the next. */}
        {pending && <PdBody key={pending.id} sc={pending.sc} finish={finish} />}
      </DialogContent>
    </Dialog>
  );
}

function PdBody({ sc, finish }: { sc: ScanResult; finish(c: PdChoice): void }) {
  const t = useT();
  const names = sc.names;
  const listed = names && names.listed > 0 ? (names.listed === 1 ? t("pp_ai_listed_one") : t("pp_ai_listed_many", { n: names.listed })) : undefined;
  const maybe = names?.maybe ?? [];
  const locked = names?.locked === true;
  /** The words at Leave. */
  const [left, setLeft] = useState<string[]>([]);
  const toggle = (word: string, leave: boolean) => setLeft((l) => (leave ? (l.includes(word) ? l : [...l, word]) : l.filter((w) => w !== word)));
  // The answers carry the words in the order they were listed, not the order they were toggled.
  const leave = maybe.filter((w) => left.includes(w));
  const found = sc.total > 0 || !!listed;
  // Something to mask: a detail the check found, a name on the list, or a word that might be a name. A locked list alone has nothing to mask.
  const maskable = found || maybe.length > 0;
  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-xl font-semibold text-purple-800">Personal details in this text</DialogTitle>
        <DialogDescription className="sr-only">Choose whether to mask the personal details before the text goes to your AI provider.</DialogDescription>
      </DialogHeader>
      {found && <p className="m-0 text-sm" data-testid="pd-found">{foundSentence(sc.counts, listed)}</p>}
      {maybe.length > 0 && (
        <div className="grid gap-1.5 text-sm" data-testid="pd-maybe">
          <p className="m-0">{t("pp_ai_maybe")}</p>
          <ul className="m-0 grid list-none gap-1 p-0">
            {maybe.map((w, i) => {
              const leaving = left.includes(w);
              const pill = "rounded-full border px-2.5 py-0.5 text-xs font-medium";
              const on = "border-purple-800 bg-purple-800 text-white";
              const off = "border-line bg-transparent text-ink";
              return (
                <li key={w} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-900">{w}</span>
                  <span role="group" aria-label={t("pp_ai_word_aria", { word: w })} className="flex gap-1" data-testid={`pd-word-${i}`}>
                    <button type="button" className={pill + " " + (leaving ? off : on)} aria-pressed={!leaving} data-testid={`pd-word-mask-${i}`} onClick={() => toggle(w, false)}>{t("pp_ai_mask")}</button>
                    <button type="button" className={pill + " " + (leaving ? on : off)} aria-pressed={leaving} data-testid={`pd-word-leave-${i}`} onClick={() => toggle(w, true)}>{t("pp_ai_leave")}</button>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {locked && <p className="m-0 text-sm text-amber-900" data-testid="pd-locked">{t("pp_ai_locked")}</p>}
      {(listed || maybe.length > 0) && <p className="m-0 text-[13px] text-muted-foreground" data-testid="pd-mask-note">{t("pp_ai_mask_note")}</p>}
      <p className="m-0 text-[13px] text-muted-foreground">This text goes straight to your AI provider. {t("pp_ai_checks")}</p>
      <DialogFooter>
        {maskable && <Button variant="primary" data-testid="pd-mask" onClick={() => finish({ answer: "mask", leave })}>Mask them and send</Button>}
        {locked && <Button variant={maskable ? "ghost" : "primary"} data-testid="pd-unlock" onClick={() => finish({ answer: "unlock", leave: [] })}>{t("pp_ai_unlock")}</Button>}
        <Button variant="ghost" data-testid="pd-send" onClick={() => finish({ answer: "send", leave })}>Send as it is</Button>
        <Button variant="ghost" data-testid="pd-cancel" onClick={() => finish(cancelled)}>{t("sap_cancel_btn")}</Button>
      </DialogFooter>
    </>
  );
}
