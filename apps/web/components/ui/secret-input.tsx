"use client";
import { useState } from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Props = Omit<React.ComponentProps<"input">, "type"> & {
  /** Which words the eye uses: a passphrase (pass_show / pass_hide) or an API key (key_show / key_hide). */
  secret?: "pass" | "key";
  /** Test id of the eye button. */
  toggleTestId?: string;
};

/**
 * A password field with an eye that shows what was typed (O14, Phase 3A walk: twice a passphrase believed correct was refused, and
 * nobody could see what had been typed). Hidden by default; the eye never submits the form it sits in. The `.input` look, so it
 * drops in for `<input className="input" type="password">`.
 */
export function SecretInput({ className, secret = "pass", toggleTestId, ...props }: Props) {
  const t = useT();
  const [shown, setShown] = useState(false);
  const label = secret === "key" ? (shown ? "key_hide" : "key_show") : shown ? "pass_hide" : "pass_show";
  return (
    <div className="relative">
      <input {...props} type={shown ? "text" : "password"} className={cn("input pr-11", className)} />
      <button
        type="button"
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-[var(--r-ctl)] text-muted-foreground hover:text-ink focus-visible:outline-2 focus-visible:outline-purple-800"
        aria-label={t(label)}
        aria-pressed={shown}
        onClick={() => setShown((s) => !s)}
        data-testid={toggleTestId}
      >
        {shown ? <EyeSlash size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </div>
  );
}
