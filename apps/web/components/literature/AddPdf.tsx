"use client";
import { useRef } from "react";
import { Plus } from "@phosphor-icons/react";
import { useT } from "@/lib/i18n";

/**
 * "Add your own PDF" (canvas Read): one button that opens the file box, several PDFs at once. The PDF is read in the browser and only its text is kept (lib/shelf/actions addOwnPdf), so this
 * only hands the chosen files up. `disabled`: the list is not known yet (loading or locked) or a batch is running, so a second one cannot start over the first.
 */
export function AddPdf({ disabled, onAdd }: { disabled: boolean; onAdd(files: File[]): void }) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className="rl-add" data-testid="rl-add" disabled={disabled} onClick={() => fileRef.current?.click()}>
        <Plus size={16} weight="bold" aria-hidden="true" />{t("rl_add_pdf")}
      </button>
      <input ref={fileRef} type="file" data-testid="rl-file" accept=".pdf,application/pdf" multiple hidden aria-label={t("rl_add_pdf")}
        onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ""; if (files.length) onAdd(files); }} />
    </>
  );
}
