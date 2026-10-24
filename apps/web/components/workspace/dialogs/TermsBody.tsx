"use client";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { TERMS_DATE, TERMS_VERSION } from "@/lib/terms";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";

/*
 * The terms' text and the 18+ gate (v1 `termsOpen`/`termsAccept`/`termsUnder`), without a frame, so that the workspace's dialog (dialogs/Terms.tsx) and the adding screen's in-place card
 * (TermsGate below, wave B Task 20 fix round, register row D-S2-125) are the same words and the same answers. Nothing here reads the project (ProjectContext): the adding screen
 * has no project shell.
 */

/** The answers the form holds: the two ticks, whether the need line shows, the under-18 message, and whether the acceptance is being recorded. */
export type TermsForm = {
  age: boolean; agree: boolean; need: boolean; under: boolean; saving: boolean;
  setAge(on: boolean): void; setAgree(on: boolean): void; setNeed(on: boolean): void; setUnder(on: boolean): void;
  /** Records the acceptance (POST /me/terms), then reads /me again so the gate lifts; `onAccepted` runs after that. Without both ticks it only shows the need line. */
  accept(): Promise<void>;
};

/**
 * The form's state. Accepting records it on the server (POST /me/terms); the under-18 path records nothing. A failed record says so (the same toast as before) and leaves the
 * form as it was. `onAccepted` runs once /me carries the acceptance (the workspace's dialog needs nothing: the gate lifts by itself).
 */
export function useTermsForm(onAccepted?: () => void): TermsForm {
  const { reload } = useSettings();
  const [age, setAge] = useState(false);
  const [agree, setAgree] = useState(false);
  const [need, setNeed] = useState(false);
  const [under, setUnder] = useState(false);
  const [saving, setSaving] = useState(false);
  const accept = async () => {
    if (!(age && agree)) { setNeed(true); return; }
    setSaving(true);
    try {
      await apiFetch<void>("/me/terms", { method: "POST" });
      // /me now carries the acceptance, so the gate lifts; the workspace then opens the welcome tour.
      await reload();
      onAccepted?.();
    } catch {
      toast("Could not save your answer. Try again.");
    } finally { setSaving(false); }
  };
  return { age, agree, need, under, saving, setAge, setAgree, setNeed, setUnder, accept };
}

/**
 * The scrolling text (what is kept and where, how it is used, the version) and, below it, what the student can do: with `gate` the two ticks, Continue and "I am under 18" (whose
 * message has a Back); without it (the same text read from Help) a Close. The frame and its heading are the caller's.
 */
export function TermsBody({ gate, form, onClose }: { gate: boolean; form: TermsForm; onClose?(): void }) {
  const t = useT();
  const { age, agree, need, under, saving } = form;
  const list = (keys: string[]) => (
    <ul className="my-1 ml-[18px] list-disc">{keys.map((k) => <li key={k}>{t(k)}</li>)}</ul>
  );
  const alert = "m-0 text-[13.5px] font-semibold text-destructive";
  return (
    <>
      <div className="max-h-[56vh] overflow-auto pr-1.5 text-[13.5px] leading-relaxed" data-testid="terms-body">
        <h3 className="mb-1 mt-1.5 text-sm font-semibold">{t("terms_data_h")}</h3>
        {list(["terms_d1", "terms_d2", "terms_d3", "terms_d4"])}
        <h3 className="mb-1 mt-2.5 text-sm font-semibold">{t("terms_use_h")}</h3>
        {list(["terms_u1", "terms_u2", "terms_u3", "terms_u4"])}
        <p className="text-xs text-muted-foreground" data-testid="terms-version">{t("terms_ver", { version: TERMS_VERSION, date: TERMS_DATE })}</p>
      </div>
      {!gate ? (
        <div className="flex"><Button variant="ghost" className="flex-1" data-testid="terms-close" onClick={onClose}>{t("close_btn")}</Button></div>
      ) : under ? (
        <div className="grid gap-2">
          <p className={alert} data-testid="terms-under-msg">{t("terms_under_msg")}</p>
          <div><Button variant="ghost" data-testid="terms-back" onClick={() => form.setUnder(false)}>{t("terms_back")}</Button></div>
        </div>
      ) : (
        <>
          <div className="grid gap-1.5">
            <label className="flex cursor-pointer items-start gap-2 text-[13.5px]">
              <input type="checkbox" className="mt-1" checked={age} data-testid="terms-age" onChange={(e) => { form.setAge(e.target.checked); if (e.target.checked && agree) form.setNeed(false); }} />
              <span>{t("terms_age")}</span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-[13.5px]">
              <input type="checkbox" className="mt-1" checked={agree} data-testid="terms-agree" onChange={(e) => { form.setAgree(e.target.checked); if (e.target.checked && age) form.setNeed(false); }} />
              <span>{t("terms_agree")}</span>
            </label>
          </div>
          {need && !(age && agree) ? <p role="alert" className={alert} data-testid="terms-need">{t("terms_need")}</p> : null}
          <p className="m-0 text-[12.5px] text-muted-foreground">{t("terms_leave")}</p>
          <div className="flex gap-2" data-testid="terms-actions">
            <Button variant="primary" className="flex-1" disabled={saving} data-testid="terms-continue" onClick={() => { void form.accept(); }}>{t("terms_cont")}</Button>
            <Button variant="ghost" disabled={saving} data-testid="terms-under" onClick={() => { form.setUnder(true); form.setNeed(false); }}>{t("terms_under")}</Button>
          </div>
        </>
      )}
    </>
  );
}

/**
 * The terms as a card in the page, gate only (no Close, nothing to dismiss): the adding screen shows it when the student presses "Keep it" and their acceptance is missing or older
 * than the current terms, so the paper stays in view above it. The gate is on the write, not the view (the API enforces the terms on its AI routes only). Focus goes to the heading
 * when the card opens, since the button that opened it is gone. `onAccepted` runs once the acceptance is recorded and /me has been read again.
 */
export function TermsGate({ onAccepted }: { onAccepted(): void }) {
  const t = useT();
  const form = useTermsForm(onAccepted);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return (
    <section className="addpaper-terms" aria-labelledby="addTermsH" data-testid="add-terms">
      <h2 id="addTermsH" ref={heading} tabIndex={-1} className="addpaper-h2">{t("terms_h")}</h2>
      <TermsBody gate form={form} />
    </section>
  );
}
