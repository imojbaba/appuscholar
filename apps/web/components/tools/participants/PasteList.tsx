"use client";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

/*
 * Paste a list (spec 2026-10-24-participants-design.md §5, call C16): a box for one person on each line, and a key file's text (its codes are kept). The tab reads the text
 * (lib/tools/participants/paste.ts), adds the people and writes the result line; `onAdd` says whether anything was added, and the box is emptied then, so the same text is not added twice.
 */
export function PasteList({ onAdd, onClose }: { onAdd(text: string): boolean; onClose(): void }) {
  const t = useT();
  const [text, setText] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { box.current?.focus(); }, []);
  return (
    <div className="mt-3.5 rounded-[10px] border border-dashed border-dashed-line bg-card p-3" data-testid="pp-paste-panel">
      <label htmlFor="pp-paste-box" className="font-semibold text-purple-800">{t("pp_paste")}</label>
      <p className="m-0 mb-2 mt-1 text-[12.5px] text-muted-foreground">{t("pp_paste_hint")}</p>
      <textarea
        id="pp-paste-box"
        ref={box}
        className="input"
        rows={6}
        data-testid="pp-paste-box"
        aria-label={t("pp_paste_label")}
        autoComplete="off"
        spellCheck={false}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button type="button" variant="primary" size="sm" data-testid="pp-paste-go" onClick={() => { if (onAdd(text)) setText(""); }}>{t("pp_paste_go")}</Button>
        <Button type="button" variant="ghost" size="sm" data-testid="pp-paste-close" onClick={onClose}>{t("pp_paste_close")}</Button>
      </div>
    </div>
  );
}
