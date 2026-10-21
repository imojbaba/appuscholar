"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * The inline field that takes the place of v1's prompt() (register row D-S2-80): a new code, a new sub-code or a rename. Enter or the button saves, Escape or
 * Cancel closes it, a name that is empty after trimming is ignored (the field stays), and the name is handed over as typed (the caller trims it, as v1 does).
 * Enter while an input method is composing (Hindi, for one) is the method's, not a save.
 */
export function NameField({ label, initial = "", saveLabel, onSave, onCancel }: { label: string; initial?: string; saveLabel: string; onSave: (name: string) => void; onCancel: () => void }) {
  const t = useT();
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initial);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const save = () => { if (value.trim()) onSave(value); };
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2" data-testid="qual-name-field">
      <label htmlFor={id} className="text-[13px]">{label}</label>
      <Input
        id={id}
        ref={ref}
        data-testid="qual-name-input"
        className="h-[30px] min-w-[10rem] flex-1 text-[13px] md:text-[13px]"
        value={value}
        placeholder={t("qual_name_placeholder")}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter") { e.preventDefault(); save(); }
          else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel(); }
        }}
      />
      <Button type="button" variant="primary" size="sm" data-testid="qual-name-submit" onClick={save}>{saveLabel}</Button>
      <Button type="button" variant="ghost" size="sm" data-testid="qual-name-cancel" onClick={onCancel}>{t("qual_btn_cancel")}</Button>
    </div>
  );
}
